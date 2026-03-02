import { create } from 'zustand';
import type { DesignModelProfile } from '../constants/designModels';

export type ThemeMode = 'dark' | 'light';
export type ToastKind = 'info' | 'success' | 'error' | 'guide' | 'loading';
export type ConfirmDialogTone = 'default' | 'danger';

export type ToastItem = {
    id: string;
    kind: ToastKind;
    title: string;
    message?: string;
    createdAt: number;
    durationMs: number;
};

type PushToastInput = {
    kind?: ToastKind;
    title: string;
    message?: string;
    durationMs?: number;
};

export type ConfirmDialogRequest = {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: ConfirmDialogTone;
    hideCancel?: boolean;
};

export type ConfirmDialogState = {
    id: string;
    title: string;
    message?: string;
    confirmLabel: string;
    cancelLabel: string;
    tone: ConfirmDialogTone;
    hideCancel: boolean;
};

type UiState = {
    theme: ThemeMode;
    modelProfile: DesignModelProfile;
    showInspector: boolean;
    toasts: ToastItem[];
    confirmDialog: ConfirmDialogState | null;
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
    setModelProfile: (profile: DesignModelProfile) => void;
    setShowInspector: (show: boolean) => void;
    toggleInspector: () => void;
    pushToast: (toast: PushToastInput) => string;
    updateToast: (id: string, updates: Partial<Omit<ToastItem, 'id' | 'createdAt'>>) => void;
    removeToast: (id: string) => void;
    clearToasts: () => void;
    requestConfirmation: (request: ConfirmDialogRequest) => Promise<boolean>;
    resolveConfirmation: (accepted: boolean) => void;
};

const THEME_STORAGE_KEY = 'eazyui:theme';
const MODEL_PROFILE_STORAGE_KEY = 'eazyui:model-profile';
const INSPECTOR_STORAGE_KEY = 'eazyui:show-inspector';

function getInitialTheme(): ThemeMode {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return 'dark';
}

function getInitialModelProfile(): DesignModelProfile {
    if (typeof window === 'undefined') return 'quality';
    const stored = window.localStorage.getItem(MODEL_PROFILE_STORAGE_KEY);
    return stored === 'fast' ? 'fast' : 'quality';
}

function getInitialShowInspector(): boolean {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem(INSPECTOR_STORAGE_KEY);
    if (stored === '0') return false;
    if (stored === '1') return true;
    return false;
}

function defaultToastDuration(kind: ToastKind): number {
    if (kind === 'loading') return 0;
    if (kind === 'error') return 5500;
    if (kind === 'guide') return 6500;
    return 3800;
}

let pendingConfirmationResolver: ((accepted: boolean) => void) | null = null;

export const useUiStore = create<UiState>((set, get) => ({
    theme: getInitialTheme(),
    modelProfile: getInitialModelProfile(),
    showInspector: getInitialShowInspector(),
    toasts: [],
    confirmDialog: null,
    setTheme: (theme) => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(THEME_STORAGE_KEY, theme);
        }
        set({ theme });
    },
    toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        get().setTheme(next);
    },
    setModelProfile: (modelProfile) => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(MODEL_PROFILE_STORAGE_KEY, modelProfile);
        }
        set({ modelProfile });
    },
    setShowInspector: (showInspector) => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(INSPECTOR_STORAGE_KEY, showInspector ? '1' : '0');
        }
        set({ showInspector });
    },
    toggleInspector: () => {
        const next = !get().showInspector;
        get().setShowInspector(next);
    },
    pushToast: ({ kind = 'info', title, message, durationMs }) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const toast: ToastItem = {
            id,
            kind,
            title,
            message,
            createdAt: Date.now(),
            durationMs: durationMs ?? defaultToastDuration(kind),
        };

        set((state) => ({ toasts: [...state.toasts, toast] }));
        if (typeof window !== 'undefined' && toast.durationMs > 0) {
            window.setTimeout(() => {
                get().removeToast(id);
            }, toast.durationMs);
        }
        return id;
    },
    updateToast: (id, updates) => {
        set((state) => ({
            toasts: state.toasts.map((toast) => (toast.id === id ? { ...toast, ...updates } : toast)),
        }));
    },
    removeToast: (id) => {
        set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    },
    clearToasts: () => set({ toasts: [] }),
    requestConfirmation: (request) => {
        if (pendingConfirmationResolver) {
            pendingConfirmationResolver(false);
            pendingConfirmationResolver = null;
        }
        const dialog: ConfirmDialogState = {
            id: `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            title: request.title,
            message: request.message,
            confirmLabel: request.confirmLabel || 'Confirm',
            cancelLabel: request.cancelLabel || 'Cancel',
            tone: request.tone || 'default',
            hideCancel: Boolean(request.hideCancel),
        };
        set({ confirmDialog: dialog });
        return new Promise<boolean>((resolve) => {
            pendingConfirmationResolver = resolve;
        });
    },
    resolveConfirmation: (accepted) => {
        set({ confirmDialog: null });
        if (pendingConfirmationResolver) {
            pendingConfirmationResolver(accepted);
            pendingConfirmationResolver = null;
        }
    },
}));
