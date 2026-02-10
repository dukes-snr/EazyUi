// ============================================================================
// API Client - Communicate with the backend
// ============================================================================

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
}

export interface GenerateResponse {
    designSpec: HtmlDesignSpec;
    versionId: string;
}

export interface EditRequest {
    instruction: string;
    html: string;
    screenId: string;
}

export interface EditResponse {
    html: string;
    versionId: string;
}

export interface SaveRequest {
    projectId?: string;
    designSpec: HtmlDesignSpec;
}

export interface SaveResponse {
    projectId: string;
    savedAt: string;
}

export interface ProjectResponse {
    projectId: string;
    designSpec: HtmlDesignSpec;
    canvasDoc: unknown;
    createdAt: string;
    updatedAt: string;
}

class ApiClient {
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

    async generate(request: GenerateRequest): Promise<GenerateResponse> {
        return this.request<GenerateResponse>('/generate', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }

    async generateStream(
        request: GenerateRequest,
        onChunk: (chunk: string) => void
    ): Promise<void> {
        const response = await fetch(`${API_BASE}/generate-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
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


    async edit(request: EditRequest): Promise<EditResponse> {
        return this.request<EditResponse>('/edit', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }

    async save(request: SaveRequest): Promise<SaveResponse> {
        return this.request<SaveResponse>('/save', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }

    async getProject(projectId: string): Promise<ProjectResponse> {
        return this.request<ProjectResponse>(`/project/${projectId}`);
    }

    async listProjects(): Promise<{ projects: { id: string; name: string; updatedAt: string }[] }> {
        return this.request('/projects');
    }
}

export const apiClient = new ApiClient();
