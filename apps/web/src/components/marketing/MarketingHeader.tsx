import { useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowUp, Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import appLogo from '../../assets/Ui-logo.png';
import { observeAuthState, sendCurrentUserVerificationEmail, signOutCurrentUser } from '../../lib/auth';
import { useUiStore } from '../../stores';
import { useChangelogUnseenCount } from '../../utils/changelogUpdates';

type MarketingHeaderProps = {
    onNavigate: (path: string) => void;
    onOpenApp?: () => void;
    scrollContainerRef?: RefObject<HTMLElement | null>;
    tone?: 'default' | 'surface';
    topStageDark?: boolean;
};

const NAV_ITEMS = [
    { label: 'Home', path: '/' },
    { label: 'Templates', path: '/templates' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Blog', path: '/blog' },
    { label: "What's New", path: '/changelog' },
] as const;

type AnnouncementBarItem = {
    id: string;
    label: string;
    text: string;
    path: string;
    showUnseenCount?: boolean;
    bgHue: number;
    bgSaturation?: string;
    bgLightness?: string;
    textColor?: string;
    chipBackground?: string;
    chipBorder?: string;
    chipTextColor?: string;
    countBackground?: string;
    countTextColor?: string;
    iconSrc?: string;
    iconAlt?: string;
};

const ANNOUNCEMENT_BARS: AnnouncementBarItem[] = [
    {
        id: 'figma-design-system-export',
        label: 'Figma',
        text: 'New: export the active design system into a Figma-ready board with colors, typography, spacing, motion, and system notes intact.',
        path: '/changelog',
        showUnseenCount: true,
        bgHue: 214,
        bgSaturation: '78%',
        bgLightness: '48%',
        textColor: '#FFFFFF',
        chipBackground: 'rgba(255,255,255,0.14)',
        chipBorder: 'rgba(255,255,255,0.24)',
        chipTextColor: '#FFFFFF',
        countBackground: '#FFFFFF',
        countTextColor: 'hsl(214 78% 36%)',
    },
    {
        id: 'figma-plugin-import',
        label: 'Plugin',
        text: 'Figma plugin: pull editable EazyUI screens into Figma, browse project screens first, and import with less manual rebuilding.',
        path: '/changelog',
        bgHue: 22,
        bgSaturation: '82%',
        bgLightness: '42%',
        textColor: '#FFF7ED',
        chipBackground: 'rgba(255,247,237,0.14)',
        chipBorder: 'rgba(255,247,237,0.26)',
        chipTextColor: '#FFF7ED',
        countBackground: '#FFF7ED',
        countTextColor: 'hsl(22 82% 30%)',
    },
];

export function MarketingHeader({ onNavigate, onOpenApp, scrollContainerRef, tone = 'default', topStageDark = false }: MarketingHeaderProps) {
    const theme = useUiStore((state) => state.theme);
    const toggleTheme = useUiStore((state) => state.toggleTheme);
    const [authUser, setAuthUser] = useState<User | null>(null);
    const [isNavScrolled, setIsNavScrolled] = useState(false);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [verificationBusy, setVerificationBusy] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);
    const [showScrollTopButton, setShowScrollTopButton] = useState(false);
    const [activeAnnouncementIndex, setActiveAnnouncementIndex] = useState(0);
    const [announcementPaused, setAnnouncementPaused] = useState(false);
    const unseenChangelogCount = useChangelogUnseenCount();
    const { scrollY } = useScroll({ container: scrollContainerRef as RefObject<HTMLElement> | undefined });

    useMotionValueEvent(scrollY, 'change', (value) => {
        setIsNavScrolled(value > 8);
        const viewportHeight = scrollContainerRef?.current?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
        setShowScrollTopButton(value > (viewportHeight * 2));
    });

    useEffect(() => {
        const unsub = observeAuthState((user) => setAuthUser(user));
        return () => unsub();
    }, []);

    const currentPath = window.location.pathname;
    const isNavItemActive = (path: string) => {
        if (path === '/blog') {
            return currentPath === '/blog' || currentPath === '/learn' || currentPath.startsWith('/blog/');
        }
        return currentPath === path;
    };

    useEffect(() => {
        setIsMobileNavOpen(false);
    }, [currentPath, authUser?.uid]);

    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth >= 1024) {
                setIsMobileNavOpen(false);
            }
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'User';
    const authEmail = authUser?.email || '';
    const authPhotoUrl = useMemo(() => (
        authUser?.photoURL
        || authUser?.providerData.find((provider) => Boolean(provider?.photoURL))?.photoURL
        || `https://ui-avatars.com/api/?name=${encodeURIComponent(authDisplayName)}&background=111827&color=ffffff&size=128&rounded=true`
    ), [authDisplayName, authUser]);
    const announcementBars = useMemo(() => (
        ANNOUNCEMENT_BARS.filter((item) => item.text.trim().length > 0)
    ), []);
    const activeAnnouncement = announcementBars[activeAnnouncementIndex] || null;
    const activeAnnouncementStyle = useMemo(() => {
        if (!activeAnnouncement) return undefined;
        return {
            ['--announcement-hue' as string]: activeAnnouncement.bgHue,
            ['--announcement-saturation' as string]: activeAnnouncement.bgSaturation || '78%',
            ['--announcement-lightness' as string]: activeAnnouncement.bgLightness || '46%',
            ['--announcement-text' as string]: activeAnnouncement.textColor || '#FFFFFF',
            ['--announcement-chip-bg' as string]: activeAnnouncement.chipBackground || 'rgba(255,255,255,0.16)',
            ['--announcement-chip-border' as string]: activeAnnouncement.chipBorder || 'rgba(255,255,255,0.3)',
            ['--announcement-chip-text' as string]: activeAnnouncement.chipTextColor || activeAnnouncement.textColor || '#FFFFFF',
            ['--announcement-count-bg' as string]: activeAnnouncement.countBackground || '#FFFFFF',
            ['--announcement-count-text' as string]: activeAnnouncement.countTextColor || `hsl(${activeAnnouncement.bgHue} 78% 34%)`,
        } as CSSProperties;
    }, [activeAnnouncement]);

    useEffect(() => {
        setActiveAnnouncementIndex((current) => {
            if (announcementBars.length === 0) return 0;
            return Math.min(current, announcementBars.length - 1);
        });
    }, [announcementBars.length]);

    useEffect(() => {
        if (announcementBars.length <= 1 || announcementPaused) return;
        const timer = window.setInterval(() => {
            setActiveAnnouncementIndex((current) => (current + 1) % announcementBars.length);
        }, 5600);
        return () => window.clearInterval(timer);
    }, [announcementBars.length, announcementPaused]);
    const mobileNavOverlay = isMobileNavOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[9999] bg-[var(--ui-surface-1)] lg:hidden">
                <button
                    type="button"
                    onClick={() => setIsMobileNavOpen(false)}
                    className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] text-[var(--ui-text)]"
                    aria-label="Close menu"
                >
                    <X size={18} />
                </button>
                <div className="flex h-full flex-col overflow-y-auto px-5 pb-8 pt-20">
                    <div className="flex flex-col gap-2">
                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                onClick={() => {
                                    setIsMobileNavOpen(false);
                                    onNavigate(item.path);
                                }}
                                className={`flex min-h-14 items-center rounded-[22px] px-4 text-left text-base font-medium transition-colors ${isNavItemActive(item.path) ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,transparent)] text-[var(--ui-primary)]' : 'text-[var(--ui-text)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)]'}`}
                            >
                                <span>{item.label}</span>
                                {item.path === '/changelog' && unseenChangelogCount > 0 && (
                                    <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--ui-primary)] px-1.5 py-1 text-[11px] font-semibold leading-none text-white">
                                        {unseenChangelogCount > 9 ? '9+' : unseenChangelogCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="mt-6 border-t border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] pt-6">
                        {authUser ? (
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-3 rounded-[22px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-4">
                                    <img
                                        src={authPhotoUrl}
                                        alt={authDisplayName}
                                        className="h-12 w-12 rounded-full border border-[var(--ui-border)] object-cover"
                                        onError={(event) => {
                                            const img = event.currentTarget;
                                            img.onerror = null;
                                            img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(authDisplayName)}&background=111827&color=ffffff&size=128&rounded=true`;
                                        }}
                                    />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-[var(--ui-text)]">{authDisplayName}</p>
                                        <p className="truncate text-xs text-[var(--ui-text-muted)]">{authEmail}</p>
                                    </div>
                                </div>
                                {!authUser.emailVerified && (
                                    <button
                                        type="button"
                                        onClick={() => void handleSendVerification()}
                                        disabled={verificationBusy}
                                        className="inline-flex min-h-12 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_22%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-2))] px-4 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-primary)] disabled:opacity-60"
                                    >
                                        {verificationBusy ? 'Sending...' : verificationSent ? 'Sent' : 'Verify email'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMobileNavOpen(false);
                                        onOpenApp ? onOpenApp() : onNavigate('/app');
                                    }}
                                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--ui-primary)] px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)]"
                                >
                                    Open app
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMobileNavOpen(false);
                                        void handleSignOut();
                                    }}
                                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-4 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)]"
                                >
                                    Sign out
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMobileNavOpen(false);
                                        onNavigate('/login');
                                    }}
                                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-4 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)]"
                                >
                                    Log in
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsMobileNavOpen(false);
                                        onNavigate('/login');
                                    }}
                                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--ui-primary)] px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)]"
                                >
                                    Sign up
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>,
            document.body,
        )
        : null;

    const handleSendVerification = async () => {
        try {
            setVerificationBusy(true);
            setVerificationSent(false);
            await sendCurrentUserVerificationEmail();
            setVerificationSent(true);
        } finally {
            setVerificationBusy(false);
        }
    };

    const handleSignOut = async () => {
        await signOutCurrentUser();
    };

    const handleScrollToTop = () => {
        const target = scrollContainerRef?.current;
        if (target) {
            target.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    return (
        <>
            <header className={`landing-nav-shell ${isNavScrolled ? 'is-scrolled' : ''} ${tone === 'surface' ? 'is-surface' : ''} ${topStageDark ? 'landing-top-stage-dark' : ''}`}>
                {activeAnnouncement && (
                    <div
                        className="marketing-announcement-stack"
                        onMouseEnter={() => setAnnouncementPaused(true)}
                        onMouseLeave={() => setAnnouncementPaused(false)}
                    >
                        <button
                            type="button"
                            onClick={() => onNavigate(activeAnnouncement.path)}
                            className="marketing-announcement-bar flex min-h-12 w-full items-center justify-center px-3 py-2 text-center sm:h-10 sm:min-h-0 sm:px-6 sm:py-0"
                            style={activeAnnouncementStyle}
                        >
                            <div key={activeAnnouncement.id} className="marketing-announcement-bar__content">
                                {activeAnnouncement.iconSrc && (
                                    <span className="marketing-announcement-bar__icon-shell" aria-hidden="true">
                                        <img
                                            src={activeAnnouncement.iconSrc}
                                            alt={activeAnnouncement.iconAlt || ''}
                                            className="marketing-announcement-bar__icon"
                                        />
                                    </span>
                                )}
                                <span className="marketing-announcement-bar__chip">
                                    {activeAnnouncement.label}
                                </span>
                                <span className="marketing-announcement-bar__text">
                                    {activeAnnouncement.text}
                                </span>
                                {activeAnnouncement.showUnseenCount && unseenChangelogCount > 0 && (
                                    <span className="marketing-announcement-bar__count">
                                        {unseenChangelogCount > 9 ? '9+' : unseenChangelogCount}
                                    </span>
                                )}
                                {announcementBars.length > 1 && (
                                    <span className="marketing-announcement-bar__dots" aria-hidden="true">
                                        {announcementBars.map((item, index) => (
                                            <span
                                                key={item.id}
                                                className={`marketing-announcement-bar__dot ${index === activeAnnouncementIndex ? 'is-active' : ''}`}
                                            />
                                        ))}
                                    </span>
                                )}
                            </div>
                        </button>
                    </div>
                )}
                <div className="landing-nav-frame">
                    <div className="mx-auto flex h-14 max-w-[1160px] items-center justify-between px-4 sm:px-6">
                    <button
                        type="button"
                        onClick={() => onNavigate('/')}
                        className="inline-flex items-center gap-2 text-left"
                    >
                        <img src={appLogo} alt="EazyUI logo" className="h-6 w-6 object-contain" />
                        <span className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[var(--ui-text)]">EazyUI</span>
                    </button>
                    <div className="hidden lg:flex items-center gap-2">
                        {NAV_ITEMS.map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                onClick={() => onNavigate(item.path)}
                                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] uppercase tracking-[0.08em] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)] hover:text-[var(--ui-primary)] ${isNavItemActive(item.path) ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)]'}`}
                            >
                                <span>{item.label}</span>
                                {item.path === '/changelog' && unseenChangelogCount > 0 && (
                                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--ui-primary)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                                        {unseenChangelogCount > 9 ? '9+' : unseenChangelogCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-3))] hover:text-[var(--ui-primary)]"
                            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                        >
                            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                        </button>
                        <div className="hidden lg:flex items-center gap-2">
                            {authUser ? (
                                <>
                                    <div className="flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1.5">
                                        <img
                                            src={authPhotoUrl}
                                            alt={authDisplayName}
                                            className="h-6 w-6 rounded-full object-cover border border-[var(--ui-border)]"
                                            onError={(event) => {
                                                const img = event.currentTarget;
                                                img.onerror = null;
                                                img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(authDisplayName)}&background=111827&color=ffffff&size=128&rounded=true`;
                                            }}
                                        />
                                        <div className="leading-tight">
                                            <p className="max-w-[170px] truncate text-[11px] text-[var(--ui-text)]">{authDisplayName}</p>
                                            <p className="max-w-[170px] truncate text-[10px] text-[var(--ui-text-muted)]">{authEmail}</p>
                                        </div>
                                    </div>
                                    {!authUser.emailVerified && (
                                        <button
                                            type="button"
                                            onClick={() => void handleSendVerification()}
                                            disabled={verificationBusy}
                                            className="inline-flex h-8 items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_22%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-primary)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-3))] disabled:opacity-60"
                                        >
                                            {verificationBusy ? 'Sending...' : verificationSent ? 'Sent' : 'Verify email'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => (onOpenApp ? onOpenApp() : onNavigate('/app'))}
                                        className="h-8 rounded-full bg-[var(--ui-primary)] px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)]"
                                    >
                                        Open app
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleSignOut()}
                                        className="h-8 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:text-[var(--ui-primary)]"
                                    >
                                        Sign out
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onNavigate('/login')}
                                        className="inline-flex h-8 items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:text-[var(--ui-primary)]"
                                    >
                                        Log in
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onNavigate('/login')}
                                        className="h-8 rounded-full bg-[var(--ui-primary)] px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)]"
                                    >
                                        Sign up
                                    </button>
                                </>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsMobileNavOpen((open) => !open)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-3))] hover:text-[var(--ui-primary)] lg:hidden"
                            aria-label={isMobileNavOpen ? 'Close menu' : 'Open menu'}
                            aria-expanded={isMobileNavOpen}
                        >
                            {isMobileNavOpen ? <X size={15} /> : <Menu size={15} />}
                        </button>
                    </div>
                    </div>
                </div>
            </header>
            {showScrollTopButton && (
                <button
                    type="button"
                    onClick={handleScrollToTop}
                    className="fixed bottom-6 right-6 z-[70] inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_42%,var(--ui-border))] bg-[var(--ui-primary)] text-white shadow-[0_14px_34px_color-mix(in_srgb,var(--ui-primary)_28%,transparent)] transition-colors hover:bg-[var(--ui-primary-hover)]"
                    aria-label="Scroll to top"
                    title="Scroll to top"
                >
                    <ArrowUp size={16} />
                </button>
            )}
            {mobileNavOverlay}
        </>
    );
}
