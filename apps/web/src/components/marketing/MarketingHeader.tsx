import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { User } from 'firebase/auth';
import appLogo from '../../assets/Ui-logo.png';
import { observeAuthState, sendCurrentUserVerificationEmail, signOutCurrentUser } from '../../lib/auth';
import { useUiStore } from '../../stores';

type MarketingHeaderProps = {
    onNavigate: (path: string) => void;
    onOpenApp?: () => void;
    scrollContainerRef?: RefObject<HTMLElement | null>;
    tone?: 'default' | 'surface';
};

const NAV_ITEMS = [
    { label: 'Templates', path: '/templates' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Learn', path: '/learn' },
    { label: "What's New", path: '/changelog' },
] as const;

export function MarketingHeader({ onNavigate, scrollContainerRef, tone = 'default' }: MarketingHeaderProps) {
    const theme = useUiStore((state) => state.theme);
    const toggleTheme = useUiStore((state) => state.toggleTheme);
    const shouldReduceMotion = useReducedMotion();
    const [authUser, setAuthUser] = useState<User | null>(null);
    const [isNavScrolled, setIsNavScrolled] = useState(false);
    const [verificationBusy, setVerificationBusy] = useState(false);
    const [verificationSent, setVerificationSent] = useState(false);
    const { scrollY, scrollYProgress } = useScroll({ container: scrollContainerRef as RefObject<HTMLElement> | undefined });
    const easedScrollProgress = useSpring(scrollYProgress, shouldReduceMotion ? {
        stiffness: 900,
        damping: 120,
        mass: 1,
    } : {
        stiffness: 110,
        damping: 24,
        mass: 0.3,
    });

    useMotionValueEvent(scrollY, 'change', (value) => {
        setIsNavScrolled(value > 8);
    });

    useEffect(() => {
        const unsub = observeAuthState((user) => setAuthUser(user));
        return () => unsub();
    }, []);

    const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'User';
    const authEmail = authUser?.email || '';
    const authPhotoUrl = useMemo(() => (
        authUser?.photoURL
        || authUser?.providerData.find((provider) => Boolean(provider?.photoURL))?.photoURL
        || `https://ui-avatars.com/api/?name=${encodeURIComponent(authDisplayName)}&background=111827&color=ffffff&size=128&rounded=true`
    ), [authDisplayName, authUser]);

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

    return (
        <header className={`landing-nav-shell ${isNavScrolled ? 'is-scrolled' : ''} ${tone === 'surface' ? 'is-surface' : ''}`}>
            <div className="landing-nav-frame">
                <motion.div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-500"
                    style={{ scaleX: shouldReduceMotion ? scrollYProgress : easedScrollProgress }}
                />
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
                                className="h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)] hover:text-[var(--ui-primary)]"
                            >
                                {item.label}
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
                        {authUser ? (
                            <>
                                <div className="hidden sm:flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1.5">
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
                                        className="hidden sm:inline-flex h-8 items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_22%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-primary)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-3))] disabled:opacity-60"
                                    >
                                        {verificationBusy ? 'Sending...' : verificationSent ? 'Sent' : 'Verify email'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onNavigate('/app')}
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
                                    className="hidden sm:inline-flex h-8 items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:text-[var(--ui-primary)]"
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
                </div>
            </div>
        </header>
    );
}
