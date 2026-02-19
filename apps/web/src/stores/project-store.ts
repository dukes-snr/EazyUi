import { create } from 'zustand';

type ProjectState = {
    projectId: string | null;
    lastSavedAt: string | null;
    dirty: boolean;
    isSaving: boolean;
    isHydrating: boolean;
    autosaveEnabled: boolean;
    setProjectId: (projectId: string | null) => void;
    markDirty: () => void;
    markSaved: (projectId: string, savedAt: string) => void;
    setSaving: (saving: boolean) => void;
    setHydrating: (hydrating: boolean) => void;
    setAutosaveEnabled: (enabled: boolean) => void;
    resetProjectState: () => void;
};

const PROJECT_ID_STORAGE_KEY = 'eazyui:project-id';
const AUTOSAVE_STORAGE_KEY = 'eazyui:autosave-enabled';

function getInitialProjectId(): string | null {
    if (typeof window === 'undefined') return null;
    const value = window.localStorage.getItem(PROJECT_ID_STORAGE_KEY);
    return value?.trim() || null;
}

function getInitialAutosaveEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    const value = window.localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    if (value === '0') return false;
    if (value === '1') return true;
    return true;
}

export const useProjectStore = create<ProjectState>((set) => ({
    projectId: getInitialProjectId(),
    lastSavedAt: null,
    dirty: false,
    isSaving: false,
    isHydrating: false,
    autosaveEnabled: getInitialAutosaveEnabled(),
    setProjectId: (projectId) => {
        if (typeof window !== 'undefined') {
            if (projectId) {
                window.localStorage.setItem(PROJECT_ID_STORAGE_KEY, projectId);
            } else {
                window.localStorage.removeItem(PROJECT_ID_STORAGE_KEY);
            }
        }
        set({ projectId });
    },
    markDirty: () => set((state) => (state.dirty ? state : { dirty: true })),
    markSaved: (projectId, savedAt) => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(PROJECT_ID_STORAGE_KEY, projectId);
        }
        set({
            projectId,
            lastSavedAt: savedAt,
            dirty: false,
            isSaving: false,
        });
    },
    setSaving: (isSaving) => set({ isSaving }),
    setHydrating: (isHydrating) => set({ isHydrating }),
    setAutosaveEnabled: (autosaveEnabled) => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, autosaveEnabled ? '1' : '0');
        }
        set({ autosaveEnabled });
    },
    resetProjectState: () => {
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(PROJECT_ID_STORAGE_KEY);
        }
        set({
            projectId: null,
            lastSavedAt: null,
            dirty: false,
            isSaving: false,
            isHydrating: false,
        });
    },
}));
