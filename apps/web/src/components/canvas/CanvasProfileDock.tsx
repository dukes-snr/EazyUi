import { useEffect, useRef, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
    BarChart3,
    CircleHelp,
    CreditCard,
    LogOut,
    Mail,
    Moon,
    Settings,
    Sun,
    User as UserIcon,
} from 'lucide-react';

import { observeAuthState, sendCurrentUserVerificationEmail, signOutCurrentUser } from '../../lib/auth';
import { useProjectStore, useUiStore } from '../../stores';

type SettingsTab = 'profile' | 'settings' | 'billing' | 'usage';

function resolveUserPhotoUrl(user: FirebaseUser | null): string | null {
    if (!user) return null;
    if (user.photoURL) return user.photoURL;
    const providerPhoto = user.providerData.find((p) => Boolean(p?.photoURL))?.photoURL;
    if (providerPhoto) return providerPhoto;
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=111827&color=ffffff&size=128&rounded=true`;
}

export function CanvasProfileDock() {
    const { theme, setTheme, pushToast } = useUiStore();
    const { projectId } = useProjectStore();
    const [open, setOpen] = useState(false);
    const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
    const [verificationBusy, setVerificationBusy] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'You';
    const authPhotoUrl = resolveUserPhotoUrl(authUser);
    const fallbackInitial = (authDisplayName.trim().charAt(0) || 'U').toUpperCase();

    useEffect(() => {
        const unsub = observeAuthState((user) => setAuthUser(user));
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const navigateTo = (path: string) => {
        setOpen(false);
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    const openSettingsAt = (tab: SettingsTab) => {
        const routedProjectId = projectId || window.location.pathname.split('/')[3] || 'new';
        const query = tab === 'profile' ? '' : `?tab=${encodeURIComponent(tab)}`;
        navigateTo(`/app/projects/${encodeURIComponent(routedProjectId)}/settings${query}`);
    };

    const handleSendVerification = async () => {
        try {
            setVerificationBusy(true);
            await sendCurrentUserVerificationEmail();
            pushToast({ kind: 'info', title: 'Verification email sent', message: 'Check your inbox to verify your account.' });
        } catch (error) {
            pushToast({ kind: 'error', title: 'Verification failed', message: (error as Error).message || 'Could not send verification email.' });
        } finally {
            setVerificationBusy(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOutCurrentUser();
            setOpen(false);
            navigateTo('/auth/login');
        } catch (error) {
            pushToast({ kind: 'error', title: 'Sign out failed', message: (error as Error).message || 'Could not sign out.' });
        }
    };

    return (
        <div ref={menuRef} className="pointer-events-auto relative">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d45512] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-[#e15f18]"
                title="Profile and settings"
            >
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[22px] font-medium tracking-[-0.02em] text-white">
                    {authPhotoUrl ? (
                        <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" />
                    ) : (
                        <span>{fallbackInitial}</span>
                    )}
                </div>
            </button>

            {open && (
                <div
                    className="canvas-profile-menu w-[372px]"
                    style={{ top: 'auto', left: 'calc(100% + 16px)', right: 'auto', bottom: '0px' }}
                >
                    <div className="mb-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3">
                        <div className="text-sm font-semibold text-[var(--ui-text)]">{authDisplayName}</div>
                        <div className="mt-0.5 text-xs text-[var(--ui-text-subtle)]">{authUser?.email || 'No email'}</div>
                    </div>

                    <div className="mb-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                        <div className="flex items-center justify-between text-xs text-[var(--ui-text-subtle)]">
                            <span className="inline-flex items-center gap-1">
                                <Sun size={12} />
                                Theme
                            </span>
                            <span className="text-[11px] uppercase tracking-[0.08em]">{theme}</span>
                        </div>
                        <div className="mt-2 inline-flex w-full overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)]">
                            <button
                                type="button"
                                onClick={() => setTheme('light')}
                                className={`inline-flex h-8 flex-1 items-center justify-center gap-1 text-xs transition-colors ${theme === 'light'
                                    ? 'bg-[var(--ui-primary)] text-white'
                                    : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'
                                    }`}
                            >
                                <Sun size={12} />
                                <span>Light</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setTheme('dark')}
                                className={`inline-flex h-8 flex-1 items-center justify-center gap-1 border-l border-[var(--ui-border)] text-xs transition-colors ${theme === 'dark'
                                    ? 'bg-[var(--ui-primary)] text-white'
                                    : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'
                                    }`}
                            >
                                <Moon size={12} />
                                <span>Dark</span>
                            </button>
                        </div>
                    </div>

                    <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('profile')}>
                        <UserIcon size={14} />
                        <span>Profile</span>
                    </button>
                    {!authUser?.emailVerified && (
                        <button
                            type="button"
                            className="canvas-profile-menu-item"
                            onClick={() => void handleSendVerification()}
                            disabled={verificationBusy}
                        >
                            <Mail size={14} />
                            <span>{verificationBusy ? 'Sending verification...' : 'Verify Email'}</span>
                        </button>
                    )}
                    <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('settings')}>
                        <Settings size={14} />
                        <span>Settings</span>
                    </button>
                    <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('billing')}>
                        <CreditCard size={14} />
                        <span>Plan & Billing</span>
                    </button>
                    <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('usage')}>
                        <BarChart3 size={14} />
                        <span>Usage</span>
                    </button>
                    <button type="button" className="canvas-profile-menu-item" onClick={() => navigateTo('/blog')}>
                        <CircleHelp size={14} />
                        <span>Get Help</span>
                    </button>
                    <button type="button" className="canvas-profile-menu-item" onClick={() => void handleSignOut()}>
                        <LogOut size={14} />
                        <span>Log Out</span>
                    </button>
                </div>
            )}
        </div>
    );
}
