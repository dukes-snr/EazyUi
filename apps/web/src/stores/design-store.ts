// ============================================================================
// Design Store - Manages HtmlDesignSpec state (HTML-based rendering)
// ============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// Types matching the API response
interface HtmlScreen {
    screenId: string;
    name: string;
    html: string;
    width: number;
    height: number;
    status?: 'streaming' | 'complete';
}

interface HtmlDesignSpec {
    id: string;
    name: string;
    screens: HtmlScreen[];
    createdAt: string;
    updatedAt: string;
}

interface DesignState {
    // Current design spec (HTML-based)
    spec: HtmlDesignSpec | null;

    // Loading state
    isLoading: boolean;
    error: string | null;

    // Actions
    setSpec: (spec: HtmlDesignSpec) => void;
    updateScreen: (screenId: string, html: string, status?: 'streaming' | 'complete', width?: number, height?: number, name?: string) => void;
    addScreen: (screen: HtmlScreen) => void;
    addScreens: (screens: HtmlScreen[]) => void;

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
    isLoading: false,
    error: null,

    selectedPlatform: 'mobile',
    setPlatform: (platform) => set({ selectedPlatform: platform }),

    setSpec: (spec) => {
        set({ spec, error: null });
    },

    updateScreen: (screenId, html, status, width, height, name) => {
        const { spec } = get();
        if (!spec) return;

        const updatedScreens = spec.screens.map(screen =>
            screen.screenId === screenId
                ? {
                    ...screen,
                    html,
                    name: name || screen.name,
                    status: (status || screen.status) as 'streaming' | 'complete' | undefined,
                    width: width || screen.width,
                    height: height || screen.height
                }
                : screen
        );

        set({
            spec: {
                ...spec,
                screens: updatedScreens,
                updatedAt: new Date().toISOString(),
            },
        });
    },

    addScreen: (screen) => {
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
            });
        } else {
            // Add to existing spec
            set({
                spec: {
                    ...spec,
                    screens: [...spec.screens, screen],
                    updatedAt: new Date().toISOString(),
                },
            });
        }
    },

    addScreens: (screens: HtmlScreen[]) => {
        const { spec } = get();
        if (!spec) {
            set({
                spec: {
                    id: uuidv4(),
                    name: screens[0]?.name || 'New Design',
                    screens: screens,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            });
        } else {
            set({
                spec: {
                    ...spec,
                    screens: [...spec.screens, ...screens],
                    updatedAt: new Date().toISOString(),
                }
            });
        }
    },

    removeScreen: (screenId) => {
        const { spec } = get();
        if (!spec) return;
        set({
            spec: {
                ...spec,
                screens: spec.screens.filter(s => s.screenId !== screenId),
                updatedAt: new Date().toISOString(),
            }
        });
    },

    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),

    reset: () => set({
        spec: null,
        isLoading: false,
        error: null,
    }),
}));
