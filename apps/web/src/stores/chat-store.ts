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
    status?: 'pending' | 'complete' | 'error';
    screenRef?: {
        id: string;
        label: string;
        type: 'mobile' | 'tablet' | 'desktop';
    };
}

interface ChatState {
    messages: ChatMessage[];
    isGenerating: boolean;

    // Actions
    addMessage: (role: ChatMessage['role'], content: string, images?: string[], screenRef?: ChatMessage['screenRef']) => string;
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
    removeMessage: (id: string) => void;
    clearMessages: () => void;
    setGenerating: (generating: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
    messages: [],
    isGenerating: false,

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

    setGenerating: (isGenerating) => set({ isGenerating }),
}));
