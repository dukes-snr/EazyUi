// ============================================================================
// API Client - Communicate with the backend
// ============================================================================

import { auth } from '@/lib/firebase';
import { deleteProjectFirestore, getProjectFirestore, listProjectsFirestore, saveProjectFirestore } from '@/lib/firestoreData';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '/api';
const COMPOSER_TEMPERATURE_KEY = 'eazyui:composer-temperature';
const DEFAULT_COMPOSER_TEMPERATURE = 1;

function normalizeComposerTemperature(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(2, numeric));
}

// Types matching the backend
export interface HtmlScreen {
    screenId: string;
    name: string;
    html: string;
    width: number;
    height: number;
    status?: 'streaming' | 'complete';
}

export interface ProjectDesignSystem {
    version: number;
    systemName: string;
    intentSummary: string;
    stylePreset: string;
    platform: string;
    themeMode: 'light' | 'dark' | 'mixed';
    tokens: {
        bg: string;
        surface: string;
        surface2: string;
        text: string;
        muted: string;
        stroke: string;
        accent: string;
        accent2: string;
    };
    tokenModes?: {
        light: {
            bg: string;
            surface: string;
            surface2: string;
            text: string;
            muted: string;
            stroke: string;
            accent: string;
            accent2: string;
        };
        dark: {
            bg: string;
            surface: string;
            surface2: string;
            text: string;
            muted: string;
            stroke: string;
            accent: string;
            accent2: string;
        };
    };
    typography: {
        displayFont: string;
        bodyFont: string;
        scale: {
            display: string;
            h1: string;
            h2: string;
            body: string;
            caption: string;
        };
        tone: string;
    };
    spacing: {
        baseUnit: number;
        density: 'compact' | 'balanced' | 'airy';
        rhythm: string;
    };
    radius: {
        card: string;
        control: string;
        pill: string;
    };
    shadows: {
        soft: string;
        glow: string;
    };
    componentLanguage: {
        button: string;
        card: string;
        input: string;
        nav: string;
        chips: string;
    };
    motion: {
        style: string;
        durationFastMs: number;
        durationBaseMs: number;
    };
    rules: {
        do: string[];
        dont: string[];
    };
}

export interface ProjectMemory {
    version: number;
    updatedAt: string;
    summary: {
        screenCount: number;
        screenNames: string[];
        lastUserRequests: string[];
    };
    components?: {
        navbar?: {
            sourceScreenId: string;
            sourceScreenName: string;
            labels: string[];
            signature: string;
        };
    };
    style?: {
        themeMode?: 'light' | 'dark' | 'mixed';
        displayFont?: string;
        bodyFont?: string;
        tokenKeys?: string[];
    };
}

export interface HtmlDesignSpec {
    id: string;
    name: string;
    screens: HtmlScreen[];
    description?: string;
    designSystem?: ProjectDesignSystem;
    createdAt: string;
    updatedAt: string;
}

export interface GenerateRequest {
    prompt: string;
    stylePreset?: string;
    platform?: string;
    images?: string[]; // Base64 encoded images
    preferredModel?: string;
    projectDesignSystem?: ProjectDesignSystem;
    bundleIncludesDesignSystem?: boolean;
    projectId?: string;
    temperature?: number;
}

export interface GenerateResponse {
    designSpec: HtmlDesignSpec;
    versionId: string;
    billing?: {
        creditsCharged: number;
        creditsRemaining: number;
        reservationId?: string;
    };
}

export interface EditRequest {
    instruction: string;
    html: string;
    screenId: string;
    images?: string[];
    preferredModel?: string;
    projectDesignSystem?: ProjectDesignSystem;
    projectId?: string;
    temperature?: number;
    consistencyProfile?: {
        canonicalNavbarLabels?: string[];
        canonicalNavbarSignature?: string;
        rules?: string[];
    };
    referenceScreens?: Array<{
        screenId: string;
        name: string;
        html: string;
    }>;
}

export interface EditResponse {
    html: string;
    description?: string;
    versionId: string;
    billing?: {
        creditsCharged: number;
        creditsRemaining: number;
        reservationId?: string;
    };
}

export interface GenerateImageRequest {
    prompt: string;
    instruction?: string;
    preferredModel?: string;
    projectId?: string;
}

export interface GenerateImageResponse {
    src: string;
    modelUsed: string;
    description?: string;
    billing?: {
        creditsCharged: number;
        creditsRemaining: number;
        reservationId?: string;
    };
}

export interface SynthesizeScreenImagesRequest {
    appPrompt: string;
    stylePreset?: string;
    platform?: string;
    preferredModel?: string;
    maxImages?: number;
    projectId?: string;
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
    billing?: {
        creditsCharged: number;
        creditsRemaining: number;
        reservationId?: string;
    };
}

export interface CompleteScreenRequest {
    screenName: string;
    partialHtml: string;
    prompt?: string;
    platform?: string;
    stylePreset?: string;
    projectDesignSystem?: ProjectDesignSystem;
    preferredModel?: string;
    projectId?: string;
    temperature?: number;
}

export interface GenerateDesignSystemRequest {
    prompt: string;
    stylePreset?: string;
    platform?: string;
    images?: string[];
    preferredModel?: string;
    projectDesignSystem?: ProjectDesignSystem;
    bundleWithFirstGeneration?: boolean;
    projectId?: string;
    temperature?: number;
}

export interface GenerateDesignSystemResponse {
    designSystem: ProjectDesignSystem;
    billing?: {
        creditsCharged: number;
        creditsRemaining: number;
        reservationId?: string;
    };
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
    billing?: {
        creditsCharged: number;
        creditsRemaining: number;
        reservationId?: string;
    };
}

export interface BillingSummary {
    uid: string;
    planId: 'free' | 'pro' | 'team';
    planLabel: string;
    status: 'active' | 'past_due' | 'cancelled';
    periodStartAt: string;
    periodEndAt: string;
    monthlyCreditsRemaining: number;
    rolloverCredits: number;
    topupCreditsRemaining: number;
    balanceCredits: number;
    lowCredits: boolean;
    suggestedTopupCredits: number;
}

export interface BillingLedgerItem {
    id: string;
    type: 'grant' | 'reserve' | 'settle' | 'refund' | 'expire' | 'adjustment';
    operation?: string;
    creditsDelta: number;
    balanceAfter: number;
    requestId?: string;
    reservationId?: string;
    projectId?: string;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
}

export interface BillingPurchaseItem {
    id: string;
    purchaseKind: 'subscription' | 'topup' | 'other';
    productKey?: string;
    planId?: 'free' | 'pro' | 'team';
    amountTotal: number;
    currency: string;
    quantity: number;
    status: string;
    description?: string;
    invoiceNumber?: string;
    invoiceUrl?: string;
    invoicePdfUrl?: string;
    sourceType: 'checkout' | 'invoice';
    sourceId: string;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
}

export interface BillingSummaryResponse {
    summary: BillingSummary;
    stripe?: {
        configured: boolean;
        publishableKeyPresent: boolean;
    };
}

export interface BillingEstimateRequest {
    operation: 'design_system' | 'generate' | 'generate_stream' | 'edit' | 'complete_screen' | 'generate_image' | 'synthesize_screen_images' | 'transcribe_audio' | 'plan_route' | 'plan_assist';
    preferredModel?: string;
    expectedScreenCount?: number;
    expectedImageCount?: number;
    expectedMinutes?: number;
    bundleIncludesDesignSystem?: boolean;
}

export interface BillingEstimateResponse {
    estimate: {
        operation: string;
        estimatedCredits: number;
        modelProfile: 'fast' | 'quality' | 'premium';
        breakdown: {
            base: number;
            variable: number;
            multiplier: number;
            bundleDesignSystem: number;
        };
    };
    summary: BillingSummary;
}

export interface BillingCheckoutSessionRequest {
    productKey: 'pro' | 'team' | 'topup_1000';
    successUrl: string;
    cancelUrl: string;
}

export interface BillingCheckoutSessionResponse {
    id: string;
    url: string | null;
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
    action?: 'edit' | 'generate' | 'assist';
    confidence?: number;
    reason: string;
    appContextPrompt?: string;
    targetScreenName?: string;
    targetScreenNames?: string[];
    matchedExistingScreenName?: string;
    matchedExistingScreenNames?: string[];
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
    screenDetails?: Array<{ screenId?: string; name: string; htmlSummary?: string }>;
    recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    projectMemorySummary?: string;
    routeReferenceScreens?: Array<{ screenId?: string; name: string; html: string }>;
    referenceImages?: string[];
    preferredModel?: string;
    temperature?: number;
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
    projectMemory?: ProjectMemory;
    createdAt: string;
    updatedAt: string;
}

class ApiClient {
    private composerTemperature: number | null = null;

    private loadComposerTemperature(): number | null {
        if (typeof window === 'undefined') return this.composerTemperature;
        const stored = normalizeComposerTemperature(window.sessionStorage.getItem(COMPOSER_TEMPERATURE_KEY));
        if (stored === null) return this.composerTemperature;
        this.composerTemperature = stored;
        return stored;
    }

    private resolveComposerTemperature(): number {
        const loaded = this.loadComposerTemperature();
        if (loaded !== null) return loaded;
        return DEFAULT_COMPOSER_TEMPERATURE;
    }

    private withComposerTemperature<T extends { temperature?: number }>(request: T): T {
        const explicit = normalizeComposerTemperature(request.temperature);
        if (explicit !== null) {
            return { ...request, temperature: explicit };
        }
        return {
            ...request,
            temperature: this.resolveComposerTemperature(),
        };
    }

    setComposerTemperature(value: number | null | undefined): number {
        const normalized = normalizeComposerTemperature(value);
        const nextValue = normalized ?? DEFAULT_COMPOSER_TEMPERATURE;
        this.composerTemperature = nextValue;
        if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(COMPOSER_TEMPERATURE_KEY, String(nextValue));
        }
        return nextValue;
    }

    getComposerTemperature(): number {
        return this.resolveComposerTemperature();
    }

    private requireAuthUid(): string {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('You must be logged in to access project data.');
        return uid;
    }

    private async getAuthHeaderValue(): Promise<string> {
        const user = auth.currentUser;
        if (!user) throw new Error('You must be logged in to continue.');
        const token = await user.getIdToken();
        return `Bearer ${token}`;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {},
        requireAuth = true
    ): Promise<T> {
        const headers = new Headers(options.headers || {});
        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }
        if (requireAuth) {
            headers.set('Authorization', await this.getAuthHeaderValue());
        }
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }

    async generate(request: GenerateRequest, signal?: AbortSignal): Promise<GenerateResponse> {
        const payload = this.withComposerTemperature(request);
        return this.request<GenerateResponse>('/generate', {
            method: 'POST',
            body: JSON.stringify(payload),
            signal,
        });
    }

    async generateDesignSystem(
        request: GenerateDesignSystemRequest,
        signal?: AbortSignal
    ): Promise<GenerateDesignSystemResponse> {
        const payload = this.withComposerTemperature(request);
        return this.request<GenerateDesignSystemResponse>('/design-system', {
            method: 'POST',
            body: JSON.stringify(payload),
            signal,
        });
    }

    async generateStream(
        request: GenerateRequest,
        onChunk: (chunk: string) => void,
        signal?: AbortSignal
    ): Promise<void> {
        const payload = this.withComposerTemperature(request);
        const authHeader = await this.getAuthHeaderValue();
        const response = await fetch(`${API_BASE}/generate-stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
            },
            body: JSON.stringify(payload),
            signal,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
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
        const payload = this.withComposerTemperature(request);
        return this.request<EditResponse>('/edit', {
            method: 'POST',
            body: JSON.stringify(payload),
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
        const payload = this.withComposerTemperature(request);
        return this.request<{ html: string }>('/complete-screen', {
            method: 'POST',
            body: JSON.stringify(payload),
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
        const payload = this.withComposerTemperature(request);
        return this.request<PlannerResponse>('/plan', {
            method: 'POST',
            body: JSON.stringify(payload),
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

    async getBillingSummary(signal?: AbortSignal): Promise<BillingSummaryResponse> {
        return this.request<BillingSummaryResponse>('/billing/summary', {
            method: 'GET',
            signal,
        });
    }

    async getBillingLedger(limit = 50, signal?: AbortSignal): Promise<{ items: BillingLedgerItem[] }> {
        const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
        return this.request<{ items: BillingLedgerItem[] }>(`/billing/ledger?limit=${safeLimit}`, {
            method: 'GET',
            signal,
        });
    }

    async getBillingPurchases(limit = 50, signal?: AbortSignal): Promise<{ items: BillingPurchaseItem[] }> {
        const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
        return this.request<{ items: BillingPurchaseItem[] }>(`/billing/purchases?limit=${safeLimit}`, {
            method: 'GET',
            signal,
        });
    }

    async downloadBillingInvoice(purchaseId: string, signal?: AbortSignal): Promise<{ filename: string; html: string }> {
        const authHeader = await this.getAuthHeaderValue();
        const response = await fetch(`${API_BASE}/billing/purchases/${encodeURIComponent(purchaseId)}/invoice`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
            },
            signal,
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }
        const disposition = response.headers.get('content-disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/i);
        const filename = match?.[1] || `eazyui-invoice-${purchaseId}.html`;
        const html = await response.text();
        return { filename, html };
    }

    async estimateBilling(request: BillingEstimateRequest, signal?: AbortSignal): Promise<BillingEstimateResponse> {
        return this.request<BillingEstimateResponse>('/billing/estimate', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async createBillingCheckoutSession(
        request: BillingCheckoutSessionRequest,
        signal?: AbortSignal
    ): Promise<BillingCheckoutSessionResponse> {
        return this.request<BillingCheckoutSessionResponse>('/billing/checkout-session', {
            method: 'POST',
            body: JSON.stringify(request),
            signal,
        });
    }

    async createBillingPortalSession(returnUrl: string, signal?: AbortSignal): Promise<{ url: string }> {
        return this.request<{ url: string }>('/billing/portal-session', {
            method: 'POST',
            body: JSON.stringify({ returnUrl }),
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
