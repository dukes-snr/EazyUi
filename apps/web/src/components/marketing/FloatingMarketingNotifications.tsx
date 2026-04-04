import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Monitor, Palette, Sparkles, Timer, X, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import appLogo from '../../assets/Ui-logo.png';
import { useUiStore } from '../../stores';

type FloatingMarketingNotificationsProps = {
    onNavigate: (path: string) => void;
};

type NotificationVariant = 'poster' | 'signal' | 'quiet';

type NotificationItem = {
    id: string;
    variant: NotificationVariant;
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
    path: string;
    icon: LucideIcon;
    accent: string;
    accentSoft: string;
    accentText: string;
    thumbnailSrc?: string;
    pill?: string;
    darkText?: boolean;
};

const NOTIFICATIONS: NotificationItem[] = [
    {
        id: 'figma-board',
        variant: 'poster',
        eyebrow: 'Latest Figma feature',
        title: 'Design systems now export straight into Figma',
        body: 'Move colors, type, spacing, motion, and system notes into a board that is ready to review.',
        cta: 'View changelog',
        path: '/changelog',
        icon: Palette,
        accent: '#1E3A8A',
        accentSoft: '#334155',
        accentText: '#DBEAFE',
        thumbnailSrc: appLogo,
        pill: 'Live now',
    },
    {
        id: 'plugin-imports',
        variant: 'signal',
        eyebrow: 'Plugin flow',
        title: 'Import editable EazyUI screens into Figma',
        body: 'Browse project screens first, then pull the payload you actually want without the rebuild step.',
        cta: 'See plugin update',
        path: '/changelog',
        icon: Sparkles,
        accent: '#1F2937',
        accentSoft: '#111827',
        accentText: '#E5E7EB',
        pill: 'Recommended',
    },
    {
        id: 'workspace-assets',
        variant: 'quiet',
        eyebrow: 'Workspace tip',
        title: 'Project images stay reusable across prompts',
        body: 'Keep logos, references, and product visuals close so each new direction starts with better context.',
        cta: 'Read update',
        path: '/changelog',
        icon: Monitor,
        accent: '#111827',
        accentSoft: '#0F172A',
        accentText: '#E2E8F0',
        pill: 'v1.8.6',
    },
];

function NotificationPosterCard({ item, theme }: { item: NotificationItem; theme: 'light' | 'dark' }) {
    const Icon = item.icon;

    return (
        <div
            className="overflow-hidden rounded-[24px] border"
            style={{
                backgroundColor: 'var(--ui-surface-2)',
                backgroundImage: `linear-gradient(180deg, color-mix(in_srgb, var(--ui-surface-2) 88%, ${item.accent} 12%) 0%, color-mix(in_srgb, var(--ui-surface-1) 92%, ${item.accentSoft} 8%) 100%)`,
                color: 'var(--ui-text)',
                borderColor: 'var(--ui-border-card)',
                boxShadow: theme === 'light' ? '0 20px 44px rgba(15, 23, 42, 0.14)' : 'none',
            }}
        >
            <div className="grid min-h-[118px] grid-cols-[112px_minmax(0,1fr)]">
                <div
                    className="relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.08))]" />
                    {item.thumbnailSrc ? (
                        <img src={item.thumbnailSrc} alt="" aria-hidden="true" className="h-full w-full object-cover p-3 opacity-90" />
                    ) : (
                        <div className="flex h-full items-center justify-center">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                                <Icon size={20} />
                            </span>
                        </div>
                    )}
                    <span className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-[11px] bg-black/20 text-white/88 backdrop-blur-md">
                        <Icon size={15} />
                    </span>
                </div>

                <div className="flex min-h-[118px] flex-col justify-between px-5 py-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ui-text)' }}>{item.title}</p>
                        <p className="mt-1 max-w-[26ch] text-[13px] leading-5" style={{ color: 'var(--ui-text-muted)' }}>
                            {item.body}
                        </p>
                    </div>

                    <div className="mt-3 inline-flex items-center gap-2 text-[11px] font-medium">
                        <span
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5"
                            style={{
                                background: 'color-mix(in_srgb, var(--ui-text) 10%, transparent)',
                                color: 'var(--ui-text)',
                            }}
                        >
                            <Timer size={12} />
                            {item.pill || item.eyebrow}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function NotificationSignalCard({ item, theme }: { item: NotificationItem; theme: 'light' | 'dark' }) {
    const Icon = item.icon;
    return (
        <div
            className="overflow-hidden rounded-[24px] border"
            style={{
                backgroundColor: 'var(--ui-surface-2)',
                backgroundImage: `linear-gradient(180deg, color-mix(in_srgb, var(--ui-surface-2) 90%, ${item.accent} 10%) 0%, color-mix(in_srgb, var(--ui-surface-1) 94%, ${item.accentSoft} 6%) 100%)`,
                color: 'var(--ui-text)',
                borderColor: 'var(--ui-border-card)',
                boxShadow: theme === 'light' ? '0 18px 38px rgba(15, 23, 42, 0.12)' : 'none',
            }}
        >
            <div className="flex min-h-[102px] items-center gap-4 px-4 py-3.5">
                <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    style={{
                        background: 'color-mix(in_srgb, var(--ui-text) 8%, transparent)',
                        color: 'var(--ui-text)',
                    }}
                >
                    <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold leading-5" style={{ color: 'var(--ui-text)' }}>{item.title}</p>
                    <p className="mt-0.5 max-w-[27ch] text-[12px] leading-5" style={{ color: 'var(--ui-text-muted)' }}>
                        {item.body}
                    </p>
                </div>
            </div>
        </div>
    );
}

function NotificationQuietCard({ item, theme }: { item: NotificationItem; theme: 'light' | 'dark' }) {
    const Icon = item.icon;

    return (
        <div
            className="overflow-hidden rounded-[24px] border"
            style={{
                backgroundColor: 'var(--ui-surface-2)',
                backgroundImage: `linear-gradient(180deg, color-mix(in_srgb, var(--ui-surface-2) 90%, ${item.accent} 10%) 0%, color-mix(in_srgb, var(--ui-surface-1) 94%, ${item.accentSoft} 6%) 100%)`,
                color: 'var(--ui-text)',
                borderColor: 'var(--ui-border-card)',
                boxShadow: theme === 'light' ? '0 18px 38px rgba(15, 23, 42, 0.12)' : 'none',
            }}
        >
            <div className="flex min-h-[94px] items-center gap-4 px-4 py-3.5">
                <span
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                    style={{ color: item.accentText }}
                >
                    <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--ui-text-subtle)' }}>{item.eyebrow}</p>
                    <p className="mt-1 truncate text-[14px] font-semibold tracking-[-0.03em]" style={{ color: 'var(--ui-text)' }}>{item.title}</p>
                </div>
            </div>
        </div>
    );
}

function NotificationDetailCard({ item, theme }: { item: NotificationItem; theme: 'light' | 'dark' }) {
    return (
        <div
            className="overflow-hidden rounded-[24px] border bg-[var(--ui-surface-2)]"
            style={{
                backgroundColor: 'var(--ui-surface-2)',
                borderColor: 'var(--ui-border-card)',
                boxShadow: theme === 'light' ? '0 18px 38px rgba(15, 23, 42, 0.12)' : 'none',
            }}
        >
            <div className="flex min-h-[100px] flex-col justify-center px-4 py-3.5" style={{ color: 'var(--ui-text)' }}>
                <p className="text-[11px] font-semibold tracking-[-0.02em]">{item.title}</p>
                <div className="mt-3 inline-flex items-center gap-2">
                    <span
                        className="rounded-full px-3 py-1.5 text-[11px] font-medium"
                        style={{
                            background: 'color-mix(in_srgb, var(--ui-text) 10%, transparent)',
                            color: 'var(--ui-text)',
                        }}
                    >
                        {item.cta}
                    </span>
                </div>
            </div>
        </div>
    );
}

function NotificationCard({ item, theme }: { item: NotificationItem; theme: 'light' | 'dark' }) {
    if (item.id === 'figma-board') return <NotificationPosterCard item={item} theme={theme} />;
    if (item.id === 'plugin-imports') return <NotificationSignalCard item={item} theme={theme} />;
    if (item.id === 'workspace-assets') return <NotificationQuietCard item={item} theme={theme} />;
    return <NotificationDetailCard item={item} theme={theme} />;
}

export function FloatingMarketingNotifications({ onNavigate }: FloatingMarketingNotificationsProps) {
    const shouldReduceMotion = useReducedMotion();
    const theme = useUiStore((state) => state.theme);
    const [activeIndex, setActiveIndex] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [paused, setPaused] = useState(false);

    const items = useMemo(() => NOTIFICATIONS, []);
    const activeItem = items[activeIndex] || null;

    useEffect(() => {
        if (dismissed || paused || items.length <= 1) return;
        const timer = window.setInterval(() => {
            setActiveIndex((current) => (current + 1) % items.length);
        }, 6400);
        return () => window.clearInterval(timer);
    }, [dismissed, items, paused]);

    if (dismissed || !activeItem) return null;

    return (
        <div className="pointer-events-none fixed bottom-1 right-4 z-[72] hidden w-[calc(100vw-1.25rem)] max-w-[23rem] sm:block sm:bottom-2 sm:right-5 sm:w-[23rem] sm:max-w-[23rem] lg:bottom-2 lg:right-6 lg:w-[23rem] lg:max-w-[23rem]">
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeItem.id}
                    initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 26 }}
                    animate={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0, y: 0 } : { opacity: 0, y: 16 }}
                    transition={{ duration: shouldReduceMotion ? 0.16 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="pointer-events-auto relative"
                    onMouseEnter={() => setPaused(true)}
                    onMouseLeave={() => setPaused(false)}
                >
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        aria-label="Dismiss notification banner"
                        className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md transition-colors"
                        style={{
                            background: theme === 'light'
                                ? 'rgba(15, 23, 42, 0.08)'
                                : 'rgba(0, 0, 0, 0.22)',
                            color: 'var(--ui-text-muted)',
                        }}
                    >
                        <X size={14} />
                    </button>

                    <button
                        type="button"
                        onClick={() => onNavigate(activeItem.path)}
                        className="group block w-full text-left"
                    >
                        <NotificationCard item={activeItem} theme={theme} />
                    </button>

                    {items.length > 1 ? (
                        <div className="mt-3 flex items-center justify-end gap-2 pr-1">
                            {items.map((item, index) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setActiveIndex(index)}
                                    aria-label={`Show notification ${index + 1}`}
                                    className={`pointer-events-auto h-2 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-white/82' : 'w-2 bg-white/24 hover:bg-white/44'}`}
                                />
                            ))}
                        </div>
                    ) : null}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
