import { CheckCircle2, Info, Lightbulb, Loader2, TriangleAlert, X } from 'lucide-react';
import { useUiStore } from '../../stores';
import type { ToastItem } from '../../stores/ui-store';

function toastTone(kind: ToastItem['kind']) {
    if (kind === 'success') {
        return {
            icon: CheckCircle2,
            iconClass: 'text-emerald-500',
            borderClass: 'border-emerald-500/40',
        };
    }
    if (kind === 'error') {
        return {
            icon: TriangleAlert,
            iconClass: 'text-rose-500',
            borderClass: 'border-rose-500/40',
        };
    }
    if (kind === 'guide') {
        return {
            icon: Lightbulb,
            iconClass: 'text-amber-500',
            borderClass: 'border-amber-500/40',
        };
    }
    if (kind === 'loading') {
        return {
            icon: Loader2,
            iconClass: 'text-[var(--ui-primary)]',
            borderClass: 'border-[var(--ui-primary)]/40',
        };
    }
    return {
        icon: Info,
        iconClass: 'text-indigo-400',
        borderClass: 'border-indigo-500/35',
    };
}

export function ToastViewport() {
    const { toasts, removeToast } = useUiStore();

    return (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[1200] flex w-[min(92vw,360px)] flex-col gap-2">
            {toasts.map((toast) => {
                const tone = toastTone(toast.kind);
                const Icon = tone.icon;
                return (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto rounded-2xl border ${tone.borderClass} bg-[var(--ui-popover)] shadow-2xl backdrop-blur-sm ring-1 ring-[var(--ui-border)]`}
                    >
                        <div className="flex items-start gap-3 p-3">
                            <Icon size={16} className={`mt-0.5 shrink-0 ${tone.iconClass} ${toast.kind === 'loading' ? 'animate-spin' : ''}`} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-[var(--ui-text)]">{toast.title}</div>
                                {toast.message && (
                                    <div className="mt-1 text-xs leading-relaxed text-[var(--ui-text-muted)]">{toast.message}</div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => removeToast(toast.id)}
                                className="rounded-md p-1 text-[var(--ui-text-subtle)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]"
                                aria-label="Dismiss notification"
                                title="Dismiss"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
