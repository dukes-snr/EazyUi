// ============================================================================
// API Client - Communicate with the backend
// ============================================================================

import { auth } from '@/lib/firebase';
import { deleteProjectFirestore, getProjectFirestore, listProjectsFirestore, saveProjectFirestore } from '@/lib/firestoreData';

const API_BASE = '/api';

// Types matching the backend
export interface HtmlScreen {
    screenId: string;
    name: string;
    html: string;
    width: number;
    height: number;
    status?: 'streaming' | 'complete';
}

export interface HtmlDesignSpec {
    id: string;
    name: string;
    screens: HtmlScreen[];
    description?: string;
    createdAt: string;
    updatedAt: string;
}

export interface GenerateRequest {
    prompt: string;
    stylePreset?: string;
    platform?: string;
    images?: string[]; // Base64 encoded images
    preferredModel?: string;
}

export interface GenerateResponse {
    designSpec: HtmlDesignSpec;
    versionId: string;
}

export interface EditRequest {
    instruction: string;
    html: string;
    screenId: string;
    images?: string[];
    preferredModel?: string;
}

export interface EditResponse {
    html: string;
    description?: string;
    versionId: string;
}

export interface GenerateImageRequest {
    prompt: string;
    instruction?: string;
    preferredModel?: string;
}

export interface GenerateImageResponse {
    src: string;
    modelUsed: string;
    description?: string;
}

export interface SynthesizeScreenImagesRequest {
    appPrompt: string;
    stylePreset?: string;
    platform?: string;
    preferredModel?: string;
    maxImages?: number;
    screens: Array<{
        screenId?: string;
        name: string;
        html: string;
        width?: number;
        height?: number;
    }>;
}

export interface SynthesizeScreenImagesResponse {
    screens: Array<{
        screenId?: string;
        name: string;
        html: string;
        width?: number;
        height?: number;
    }>;
    stats: {
        totalSlots: number;
        uniqueIntents: number;
        generated: number;
        reusedFromCache: number;
        reusedWithinRun: number;
        skipped: number;
    };
}

export interface CompleteScreenRequest {
    screenName: string;
    partialHtml: string;
    prompt?: string;
    platform?: string;
    stylePreset?: string;
}

export interface TranscribeAudioRequest {
    audioBase64: string;
    mimeType: string;
    language?: string;
    model?: string;
}

export interface TranscribeAudioResponse {
    text: string;
    modelUsed: string;
}

export interface SaveRequest {
    projectId?: string;
    designSpec: HtmlDesignSpec;
    canvasDoc?: unknown;
    chatState?: unknown;
    mode?: 'manual' | 'autosave';
}

export interface SaveResponse {
    projectId: string;
    savedAt: string;
}

export type PlannerPhase = 'discovery' | 'plan' | 'postgen' | 'route';

export interface PlannerQuestion {
    id: string;
    q: string;
    type?: string;
    options?: string[];
}

export interface PlannerRecommendedScreen {
    name: string;
    goal?: string;
    why?: string;
    priority?: number;
}

export interface PlannerPlanResponse {
    phase: 'plan' | 'discovery';
    appName?: string;
    oneLineConcept?: string;
    questions: PlannerQuestion[];
    assumptions: string[];
    recommendedScreens: PlannerRecommendedScreen[];
    navigationRecommendation?: {
        pattern?: string;
        tabs?: string[];
    };
    visualDirection?: {
        mood?: string;
        motif?: string;
        colorNotes?: string;
    };
    generationSuggestion?: {
        screenCountNow?: number;
        generateNow?: boolean;
        generateTheseNow?: string[];
        why?: string;
    };
    generatorPrompt: string;
}

export interface PlannerPostgenResponse {
    phase: 'postgen';
    whatYouHave: string[];
    gapsDetected: string[];
    nextScreenSuggestions: Array<{ name: string; why: string; priority: number }>;
    callToAction?: {
        primary?: { label: string; screenNames: string[] };
        secondary?: { label: string; screenNames: string[] };
    };
}

export interface PlannerRouteResponse {
    phase: 'route';
    intent: 'new_app' | 'add_screen' | 'edit_existing_screen' | 'chat_assist';
    reason: string;
    appContextPrompt?: string;
    targetScreenName?: string;
    matchedExistingScreenName?: string;
    referenceExistingScreenName?: string;
    generateTheseNow: string[];
    editInstruction?: string;
    assistantResponse?: string;
    recommendNextScreens?: boolean;
    nextScreenSuggestions?: Array<{ name: string; why: string; priority?: number }>;
}

export type PlannerResponse = PlannerPlanResponse | PlannerPostgenResponse | PlannerRouteResponse;

export interface PlannerRequest {
    phase?: PlannerPhase;
    appPrompt: string;
    platform?: 'mobile' | 'tablet' | 'desktop';
    stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
    screenCountDesired?: number;
    screensGenerated?: Array<{ name: string; description?: string; htmlSummary?: string }>;
    referenceImages?: string[];
    preferredModel?: string;
}

export interface RenderScreenImageRequest {
    html: string;
    width?: number;
    height?: number;
    scale?: number;
}

export interface RenderScreenImageResponse {
    pngBase64: string;
    width: number;
    height: number;
    scale: number;
}

export interface ProjectResponse {
    projectId: string;
    designSpec: HtmlDesignSpec;
    canvasDoc: unknown;
    chatState: unknown;
    createdAt: string;
    updatedAt: string;
}

class ApiClient {
    private requireAuthUid(): string {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('You must be logged in to access project data.');
        return uid;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }

    async generate(request: GenerateRequest, signal?: AbortSignal): Promise<GenerateResponse> {
        return this.request<GenerateResponse>('/generate', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async generateStream(
        request: GenerateRequest,
        onChunk: (chunk: string) => void,
        signal?: AbortSignal
    ): Promise<void> {
        const response = await fetch(`${API_BASE}/generate-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            onChunk(text);
        }
    }


    async edit(request: EditRequest, signal?: AbortSignal): Promise<EditResponse> {
        return this.request<EditResponse>('/edit', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async generateImage(request: GenerateImageRequest, signal?: AbortSignal): Promise<GenerateImageResponse> {
        return this.request<GenerateImageResponse>('/generate-image', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async synthesizeScreenImages(
        request: SynthesizeScreenImagesRequest,
        signal?: AbortSignal
    ): Promise<SynthesizeScreenImagesResponse> {
        return this.request<SynthesizeScreenImagesResponse>('/synthesize-screen-images', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async completeScreen(request: CompleteScreenRequest, signal?: AbortSignal): Promise<{ html: string }> {
        return this.request<{ html: string }>('/complete-screen', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async transcribeAudio(request: TranscribeAudioRequest, signal?: AbortSignal): Promise<TranscribeAudioResponse> {
        return this.request<TranscribeAudioResponse>('/transcribe-audio', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async save(request: SaveRequest): Promise<SaveResponse> {
        const uid = this.requireAuthUid();
        return saveProjectFirestore({
            uid,
            projectId: request.projectId,
            designSpec: request.designSpec,
            canvasDoc: request.canvasDoc,
            chatState: request.chatState,
            mode: request.mode,
        });
    }

    async plan(request: PlannerRequest, signal?: AbortSignal): Promise<PlannerResponse> {
        return this.request<PlannerResponse>('/plan', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async renderScreenImage(request: RenderScreenImageRequest, signal?: AbortSignal): Promise<RenderScreenImageResponse> {
        return this.request<RenderScreenImageResponse>('/render-screen-image', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async getProject(projectId: string): Promise<ProjectResponse> {
        const uid = this.requireAuthUid();
        const project = await getProjectFirestore(uid, projectId);
        if (!project) throw new Error('Project not found');
        return project;
    }

    async listProjects(): Promise<{ projects: { id: string; name: string; updatedAt: string; screenCount: number; hasSnapshot: boolean; coverImageUrl?: string; coverImageUrls?: string[] }[] }> {
        const uid = this.requireAuthUid();
        const projects = await listProjectsFirestore(uid);
        return { projects };
    }

    async deleteProject(projectId: string): Promise<{ success: boolean }> {
        const uid = this.requireAuthUid();
        const success = await deleteProjectFirestore(uid, projectId);
        if (!success) throw new Error('Project not found');
        return { success };
    }
}

export const apiClient = new ApiClient();
