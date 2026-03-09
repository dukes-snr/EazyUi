import { create } from 'zustand';
import { createElement } from 'react';
import { Loader2 } from 'lucide-react';
import { gooeyToast, type GooeyToastClassNames, type GooeyToastOptions } from 'goey-toast';
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
    updateConfirmationDialog: (updates: Partial<Omit<ConfirmDialogState, 'id'>>) => void;
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

const LONG_LIVED_TOAST_MS = 8 * 60 * 60 * 1000;

const GOEY_CLASSNAMES: GooeyToastClassNames = {
    wrapper: 'eazy-goey-wrapper',
    content: 'eazy-goey-content',
    header: 'eazy-goey-header',
    title: 'eazy-goey-title',
    icon: 'eazy-goey-icon',
    description: 'eazy-goey-description',
    actionWrapper: 'eazy-goey-action-wrap',
    actionButton: 'eazy-goey-action-btn',
};

function mapKindToGoeyType(kind: ToastKind): 'default' | 'success' | 'error' | 'warning' | 'info' {
    if (kind === 'success') return 'success';
    if (kind === 'error') return 'error';
    if (kind === 'guide') return 'warning';
    if (kind === 'loading') return 'info';
    return 'info';
}

function readCssVar(name: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    const root = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return root || fallback;
}

function resolveToastFillColor(kind: ToastKind, theme: ThemeMode): string {
    const fallbackByTheme: Record<ThemeMode, Record<ToastKind, string>> = {
        dark: {
            info: '#10263d',
            success: '#0e2a1f',
            error: '#32131a',
            guide: '#1f1638',
            loading: '#141922',
        },
        light: {
            info: '#eff6ff',
            success: '#ecfdf5',
            error: '#fff1f2',
            guide: '#f5f3ff',
            loading: '#f8fafc',
        },
    };
    if (kind === 'success') return readCssVar('--ui-toast-success-fill', fallbackByTheme[theme].success);
    if (kind === 'error') return readCssVar('--ui-toast-error-fill', fallbackByTheme[theme].error);
    if (kind === 'guide') return readCssVar('--ui-toast-guide-fill', fallbackByTheme[theme].guide);
    if (kind === 'loading') return readCssVar('--ui-toast-loading-fill', fallbackByTheme[theme].loading);
    if (kind === 'info') return readCssVar('--ui-toast-info-fill', fallbackByTheme[theme].info);
    return readCssVar('--ui-toast-default-fill', theme === 'dark' ? '#0f1621' : '#f8fafc');
}

function buildGoeyOptions(input: {
    id: string;
    kind: ToastKind;
    title: string;
    message?: string;
    durationMs: number;
    theme: ThemeMode;
    onDismiss: () => void;
}): GooeyToastOptions {
    const duration = input.durationMs <= 0 ? LONG_LIVED_TOAST_MS : input.durationMs;
    const fillColor = resolveToastFillColor(input.kind, input.theme);
    const options: GooeyToastOptions = {
        id: input.id,
        description: input.message,
        classNames: GOEY_CLASSNAMES,
        fillColor,
        borderColor: 'transparent',
        borderWidth: 0,
        duration,
        timing: { displayDuration: duration },
        spring: true,
        bounce: 0.34,
        onDismiss: () => input.onDismiss(),
    };
    if (input.kind === 'loading') {
        options.icon = createElement(Loader2, { size: 14, className: 'eazy-goey-spinner' });
    }
    return options;
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
        const resolvedDuration = durationMs ?? defaultToastDuration(kind);
        const toast: ToastItem = {
            id,
            kind,
            title,
            message,
            createdAt: Date.now(),
            durationMs: resolvedDuration,
        };
        set((state) => ({ toasts: [...state.toasts, toast] }));

        const options = buildGoeyOptions({
            id,
            kind,
            title,
            message,
            durationMs: resolvedDuration,
            theme: get().theme,
            onDismiss: () => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
        });

        const displayType = mapKindToGoeyType(kind);
        if (displayType === 'success') gooeyToast.success(title, options);
        else if (displayType === 'error') gooeyToast.error(title, options);
        else if (displayType === 'warning') gooeyToast.warning(title, options);
        else if (displayType === 'info') gooeyToast.info(title, options);
        else gooeyToast(title, options);

        return id;
    },
    updateToast: (id, updates) => {
        const existing = get().toasts.find((toast) => toast.id === id);
        if (!existing) return;
        const merged: ToastItem = { ...existing, ...updates };
        set((state) => ({
            toasts: state.toasts.map((toast) => (toast.id === id ? merged : toast)),
        }));
        gooeyToast.update(id, {
            title: merged.title,
            description: merged.message,
            type: mapKindToGoeyType(merged.kind),
            icon: merged.kind === 'loading' ? createElement(Loader2, { size: 14, className: 'eazy-goey-spinner' }) : null,
        });
    },
    removeToast: (id) => {
        gooeyToast.dismiss(id);
        set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    },
    clearToasts: () => {
        gooeyToast.dismiss();
        set({ toasts: [] });
    },
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
    updateConfirmationDialog: (updates) => {
        const current = get().confirmDialog;
        if (!current) return;
        set({
            confirmDialog: {
                ...current,
                ...updates,
            },
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
