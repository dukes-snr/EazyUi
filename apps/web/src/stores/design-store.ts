// ============================================================================
// Design Store - Manages HtmlDesignSpec state (HTML-based rendering)
// ============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { HtmlDesignSpec, HtmlScreen, ProjectDesignSystem } from '../api/client';

interface DesignState {
    // Current design spec (HTML-based)
    spec: HtmlDesignSpec | null;
    historyRevision: number;

    // Loading state
    isLoading: boolean;
    error: string | null;

    // Actions
    setSpec: (spec: HtmlDesignSpec, options?: { history?: 'auto' | 'skip' }) => void;
    updateScreen: (screenId: string, html: string, status?: 'streaming' | 'complete', width?: number, height?: number, name?: string, options?: { history?: 'auto' | 'skip' }) => void;
    addScreen: (screen: HtmlScreen, options?: { history?: 'auto' | 'skip' }) => void;
    addScreens: (screens: HtmlScreen[], options?: { history?: 'auto' | 'skip' }) => void;
    setDesignSystem: (designSystem: ProjectDesignSystem, options?: { history?: 'auto' | 'skip' }) => void;

    // State management
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;

    // Platform selection
    selectedPlatform: 'mobile' | 'tablet' | 'desktop';
    setPlatform: (platform: 'mobile' | 'tablet' | 'desktop') => void;

    removeScreen: (screenId: string) => void;
    reset: () => void;
}

export const useDesignStore = create<DesignState>((set, get) => ({
    spec: null,
    historyRevision: 0,
    isLoading: false,
    error: null,

    selectedPlatform: 'mobile',
    setPlatform: (platform) => set({ selectedPlatform: platform }),

    setSpec: (spec, options) => {
        set({
            spec,
            error: null,
            historyRevision: options?.history === 'skip' ? get().historyRevision : get().historyRevision + 1,
        });
    },

    updateScreen: (screenId, html, status, width, height, name, options) => {
        const { spec } = get();
        if (!spec) return;
        let didChange = false;

        const updatedScreens = spec.screens.map(screen =>
            screen.screenId === screenId
                ? (() => {
                    const nextScreen = {
                        ...screen,
                        html,
                        name: name ?? screen.name,
                        status: (status ?? screen.status) as 'streaming' | 'complete' | undefined,
                        width: width ?? screen.width,
                        height: height ?? screen.height,
                    };
                    didChange = didChange
                        || nextScreen.html !== screen.html
                        || nextScreen.name !== screen.name
                        || nextScreen.status !== screen.status
                        || nextScreen.width !== screen.width
                        || nextScreen.height !== screen.height;
                    return nextScreen;
                })()
                : screen
        );

        if (!didChange) return;

        set({
            spec: {
                ...spec,
                screens: updatedScreens,
                updatedAt: new Date().toISOString(),
            },
            historyRevision: options?.history === 'skip' || status === 'streaming'
                ? get().historyRevision
                : get().historyRevision + 1,
        });
    },

    addScreen: (screen, options) => {
        const { spec } = get();
        if (!spec) {
            // Create new spec with this screen
            set({
                spec: {
                    id: uuidv4(),
                    name: screen.name,
                    screens: [screen],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                historyRevision: options?.history === 'skip' ? get().historyRevision : get().historyRevision + 1,
            });
        } else {
            // Add to existing spec
            set({
                spec: {
                    ...spec,
                    screens: [...spec.screens, screen],
                    updatedAt: new Date().toISOString(),
                },
                historyRevision: options?.history === 'skip' ? get().historyRevision : get().historyRevision + 1,
            });
        }
    },

    addScreens: (screens: HtmlScreen[], options) => {
        if (screens.length === 0) return;
        const { spec } = get();
        if (!spec) {
            set({
                spec: {
                    id: uuidv4(),
                    name: screens[0]?.name || 'New Design',
                    screens: screens,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                },
                historyRevision: options?.history === 'skip' ? get().historyRevision : get().historyRevision + 1,
            });
        } else {
            set({
                spec: {
                    ...spec,
                    screens: [...spec.screens, ...screens],
                    updatedAt: new Date().toISOString(),
                },
                historyRevision: options?.history === 'skip' ? get().historyRevision : get().historyRevision + 1,
            });
        }
    },

    setDesignSystem: (designSystem, options) => {
        const { spec } = get();
        if (!spec) return;
        set({
            spec: {
                ...spec,
                designSystem,
                updatedAt: new Date().toISOString(),
            },
            historyRevision: options?.history === 'skip' ? get().historyRevision : get().historyRevision + 1,
        });
    },

    removeScreen: (screenId) => {
        const { spec } = get();
        if (!spec) return;
        const nextScreens = spec.screens.filter(s => s.screenId !== screenId);
        if (nextScreens.length === spec.screens.length) return;
        set({
            spec: {
                ...spec,
                screens: nextScreens,
                updatedAt: new Date().toISOString(),
            },
            historyRevision: get().historyRevision + 1,
        });
    },

    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),

    reset: () => set({
        spec: null,
        historyRevision: 0,
        isLoading: false,
        error: null,
    }),
}));
