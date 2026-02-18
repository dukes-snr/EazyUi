import { CheckCircle2, ChevronRight, Info, Loader2, TriangleAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useUiStore } from '../../stores';

type TipItem = {
    id: string;
    title: string;
    message: string;
    toastId?: string;
};

const DEFAULT_TIPS: TipItem[] = [
    {
        id: 'tip-images',
        title: 'Generate with Image References',
        message: 'Attach screenshots or inspiration images to drive stronger layout and styling fidelity.',
    },
    {
        id: 'tip-branch',
        title: 'Retry as Branch',
        message: 'Use Retry under your prompt to create alternate responses and compare branches with Previous / Next.',
    },
    {
        id: 'tip-images-manual',
        title: 'Generate Screen Images',
        message: 'Use the floating image button on a screen to replace placeholders with generated assets on demand.',
    },
];

export function ToastViewport() {
    const { toasts } = useUiStore();
    const [dismissedTipIds, setDismissedTipIds] = useState<Record<string, true>>({});

    const loadingToasts = useMemo(() => toasts.filter((toast) => toast.kind === 'loading'), [toasts]);
    const eventToasts = useMemo(
        () => toasts.filter((toast) => toast.kind !== 'loading').slice().reverse().slice(0, 4),
        [toasts]
    );

    const tips = DEFAULT_TIPS.filter((tip) => !dismissedTipIds[tip.id]);
    const activeTip = tips[0];
    const activeJobs = loadingToasts.length;

    const dismissTips = () => {
        if (!activeTip) return;
        setDismissedTipIds((prev) => ({ ...prev, [activeTip.id]: true }));
    };

    return (
        <div className="pointer-events-none fixed bottom-5 right-5 z-[1200] flex w-[min(92vw,300px)] flex-col items-end gap-2.5">
            {tips.length > 0 && (
                <div className="pointer-events-auto relative w-full max-w-[300px]">
                    <div className="absolute -top-6 left-5 right-7 h-[230px] rounded-[18px] bg-slate-700/20" />
                    <div className="absolute -top-3 left-2 right-4 h-[240px] rounded-[18px] bg-slate-700/35" />

                    <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[#111318] shadow-[0_14px_38px_rgba(0,0,0,0.45)]">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.12),transparent_45%),radial-gradient(circle_at_80%_85%,rgba(255,166,0,0.15),transparent_55%)]" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent" />

                        <div className="relative p-4 min-h-[248px] flex flex-col justify-end">
                            <button
                                type="button"
                                onClick={dismissTips}
                                className="absolute top-3 right-3 h-7 w-7 rounded-full bg-black/45 text-zinc-200 hover:bg-black/60 flex items-center justify-center"
                                title="Dismiss tips"
                            >
                                <X size={13} />
                            </button>

                            <h3 className="text-[clamp(14px,2.5vw,18px)] leading-none font-semibold tracking-tight text-white/90 mb-2">
                                Tips
                            </h3>
                            <div className="text-[clamp(18px,3.5vw,24px)] leading-tight font-semibold tracking-tight text-white mb-1">
                                {activeTip.title}
                            </div>
                            <p className="text-[clamp(11px,2.2vw,13px)] leading-[1.28] text-zinc-200/95 max-w-[95%]">{activeTip.message}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="pointer-events-auto w-full max-w-[300px] rounded-[14px] border border-white/10 bg-[#181a1f] px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {activeJobs > 0 ? (
                            <Loader2 size={15} className="text-emerald-300 animate-spin" />
                        ) : (
                            <span className="h-2 w-2 rounded-full bg-zinc-400/70" />
                        )}
                        <div className="text-[clamp(15px,2.9vw,20px)] leading-none font-semibold text-white">Queue</div>
                        <div className={`text-[clamp(14px,2.7vw,18px)] leading-none font-medium ${activeJobs > 0 ? 'text-emerald-300' : 'text-zinc-400'}`}>
                            {activeJobs} active
                        </div>
                    </div>
                    <ChevronRight size={20} className="text-zinc-300" />
                </div>
                <div className="mt-2.5 space-y-1.5">
                    {eventToasts.length === 0 ? (
                        <div className="text-[11px] text-zinc-400">No recent notifications</div>
                    ) : (
                        eventToasts.map((toast) => {
                            const Icon = toast.kind === 'success'
                                ? CheckCircle2
                                : toast.kind === 'error'
                                    ? TriangleAlert
                                    : Info;
                            const iconClass = toast.kind === 'success'
                                ? 'text-emerald-300'
                                : toast.kind === 'error'
                                    ? 'text-rose-300'
                                    : 'text-sky-300';
                            return (
                                <div key={toast.id} className="flex items-start gap-2 text-[11px] leading-snug text-zinc-300">
                                    <Icon size={12} className={`mt-0.5 shrink-0 ${iconClass}`} />
                                    <div className="min-w-0">
                                        <div className="truncate font-medium text-zinc-200">{toast.title}</div>
                                        {toast.message ? <div className="truncate text-zinc-400">{toast.message}</div> : null}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
