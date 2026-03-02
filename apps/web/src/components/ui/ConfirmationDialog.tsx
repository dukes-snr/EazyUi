import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useUiStore } from '../../stores';

export function ConfirmationDialog() {
    const { confirmDialog, resolveConfirmation } = useUiStore();

    useEffect(() => {
        if (!confirmDialog) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (confirmDialog.hideCancel) return;
            resolveConfirmation(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [confirmDialog, resolveConfirmation]);

    if (!confirmDialog) return null;

    const isDanger = confirmDialog.tone === 'danger';
    const confirmButtonClass = isDanger
        ? 'bg-red-600 hover:bg-red-500 focus-visible:ring-red-400/60'
        : 'bg-[var(--ui-primary)] hover:bg-[var(--ui-primary-hover)] focus-visible:ring-[var(--ui-primary)]/50';
    const iconWrapClass = isDanger
        ? 'bg-red-500/18 text-red-300 ring-red-500/35'
        : 'bg-[var(--ui-surface-3)] text-[var(--ui-text)] ring-[var(--ui-border)]';

    return (
        <div
            className="fixed inset-0 z-[1700] flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4"
            onClick={() => {
                if (confirmDialog.hideCancel) return;
                resolveConfirmation(false);
            }}
        >
            <div
                className="w-full max-w-[460px] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-popover)] shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
            >
                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-start gap-3">
                        <div className={`mt-0.5 h-9 w-9 shrink-0 rounded-xl ring-1 flex items-center justify-center ${iconWrapClass}`}>
                            <AlertTriangle size={17} />
                        </div>
                        <div className="min-w-0">
                            <h3 id="confirm-dialog-title" className="text-[15px] font-semibold text-[var(--ui-text)]">
                                {confirmDialog.title}
                            </h3>
                            {confirmDialog.message && (
                                <p className="mt-1.5 text-[13px] leading-5 text-[var(--ui-text-subtle)]">
                                    {confirmDialog.message}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="px-5 pb-5 pt-2 flex items-center justify-end gap-2">
                    {!confirmDialog.hideCancel && (
                        <button
                            type="button"
                            onClick={() => resolveConfirmation(false)}
                            className="h-10 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)]"
                        >
                            {confirmDialog.cancelLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => resolveConfirmation(true)}
                        className={`h-10 rounded-xl px-4 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 ${confirmButtonClass}`}
                    >
                        {confirmDialog.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

