// ============================================================================
// Chat Store - Manages chat messages and generation state
// ============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    images?: string[];
    status?: 'pending' | 'streaming' | 'complete' | 'error';
    meta?: Record<string, unknown>;
    screenRef?: {
        id: string;
        label: string;
        type: 'mobile' | 'tablet' | 'desktop';
    };
}

interface ChatState {
    messages: ChatMessage[];
    isGenerating: boolean;
    abortController: AbortController | null;

    // Actions
    addMessage: (role: ChatMessage['role'], content: string, images?: string[], screenRef?: ChatMessage['screenRef']) => string;
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
    removeMessage: (id: string) => void;
    clearMessages: () => void;
    setMessages: (messages: ChatMessage[]) => void;
    hydrateSession: (payload: { messages?: ChatMessage[] } | null | undefined) => void;
    setGenerating: (generating: boolean) => void;
    setAbortController: (controller: AbortController | null) => void;
    abortGeneration: () => void;
}

function normalizeHydratedMessages(messages: ChatMessage[]): ChatMessage[] {
    const loadingOnlyPatterns = [
        /^warming up/i,
        /^planning your flow/i,
        /^working on your screens/i,
        /^rendering remaining screens/i,
        /^updating\.\.\./i,
        /^applying edits/i,
    ];

    return messages.map((message) => {
        if (message.role !== 'assistant') return message;
        if (message.status !== 'pending' && message.status !== 'streaming') return message;

        const content = String(message.content || '').trim();
        const isLoadingOnly = loadingOnlyPatterns.some((pattern) => pattern.test(content));
        const hasMeaningfulContent = content.length > 0 && !isLoadingOnly;

        if (hasMeaningfulContent) {
            return { ...message, status: 'complete' };
        }

        return {
            ...message,
            status: 'complete',
            content: 'Screens finished rendering. This response was restored after reload.',
        };
    });
}

export const useChatStore = create<ChatState>((set) => ({
    messages: [],
    isGenerating: false,
    abortController: null,

    addMessage: (role, content, images, screenRef) => {
        const id = uuidv4();
        const message: ChatMessage = {
            id,
            role,
            content,
            timestamp: Date.now(),
            images,
            screenRef,
            status: role === 'assistant' ? 'pending' : 'complete',
        };

        set(state => ({
            messages: [...state.messages, message],
        }));

        return id;
    },

    updateMessage: (id, updates) => {
        set(state => ({
            messages: state.messages.map(m =>
                m.id === id ? { ...m, ...updates } : m
            ),
        }));
    },

    removeMessage: (id) => {
        set(state => ({
            messages: state.messages.filter(m => m.id !== id),
        }));
    },

    clearMessages: () => set({ messages: [] }),
    setMessages: (messages) => set({ messages }),
    hydrateSession: (payload) => set({
        messages: Array.isArray(payload?.messages)
            ? normalizeHydratedMessages(payload!.messages)
            : [],
        isGenerating: false,
        abortController: null,
    }),

    setGenerating: (isGenerating) => set({ isGenerating }),
    setAbortController: (abortController) => set({ abortController }),
    abortGeneration: () => set((state) => {
        state.abortController?.abort();
        return { abortController: null, isGenerating: false };
    }),
}));
