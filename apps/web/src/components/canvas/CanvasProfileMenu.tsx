import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    AlertTriangle,
    BarChart3,
    Bell,
    CircleHelp,
    ChevronDown,
    CreditCard,
    Download,
    Files,
    FolderOpen,
    Image,
    Link2,
    Loader2,
    LogOut,
    Mail,
    Moon,
    Save,
    Settings,
    Star,
    Sun,
    User as UserIcon,
    UserCircle2,
    X,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { useCanvasStore, useChatStore, useDesignStore, useEditStore, useHistoryStore, useProjectStore, useUiStore } from '../../stores';
import { ApiRequestError, apiClient, subscribeToBillingUpdates, type BillingLedgerItem, type BillingSummary } from '../../api/client';
import { copyScreensCodeToClipboard, exportScreensAsImagesZip, exportScreensAsZip, exportScreensToFigmaClipboard, getExportTargetScreens } from '../../utils/exportScreens';
import { buildBillingUsageActivityRows, extractLedgerModelName } from '../../utils/billingUsage';
import { observeAuthState, sendCurrentUserVerificationEmail, signOutCurrentUser } from '../../lib/auth';

type SettingsTab = 'profile' | 'settings' | 'billing' | 'usage';
type ExportAction = 'zip' | 'images' | 'code' | 'figma';

const ACCOUNT_NAV: Array<{ key: SettingsTab; label: string; icon: LucideIcon }> = [
    { key: 'profile', label: 'Profile', icon: UserIcon },
    { key: 'settings', label: 'Settings', icon: Settings },
];

const SUBSCRIPTION_NAV: Array<{ key: SettingsTab; label: string; icon: LucideIcon }> = [
    { key: 'billing', label: 'Plan & Billing', icon: CreditCard },
    { key: 'usage', label: 'Usage', icon: BarChart3 },
];
const BILLING_REFRESH_RETRY_MS = 60_000;

function resolveUserPhotoUrl(user: FirebaseUser | null): string | null {
    if (!user) return null;
    if (user.photoURL) return user.photoURL;
    const providerPhoto = user.providerData.find((p) => Boolean(p?.photoURL))?.photoURL;
    if (providerPhoto) return providerPhoto;
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=111827&color=ffffff&size=128&rounded=true`;
}

function heatClass(level: number): string {
    if (level <= 0) return 'bg-[#2a2d36]';
    if (level === 1) return 'bg-[color:color-mix(in_srgb,var(--ui-primary)_38%,#111827)]';
    if (level === 2) return 'bg-[color:color-mix(in_srgb,var(--ui-primary)_56%,#0f172a)]';
    if (level === 3) return 'bg-[color:color-mix(in_srgb,var(--ui-primary)_76%,#0f172a)]';
    return 'bg-[var(--ui-primary)]';
}

export function CanvasProfileMenu() {
    const { theme, setTheme, pushToast, removeToast, requestConfirmation, toasts } = useUiStore();
    const { spec, reset: resetDesign } = useDesignStore();
    const { doc, reset: resetCanvas } = useCanvasStore();
    const { messages, clearMessages } = useChatStore();
    const { exitEdit } = useEditStore();
    const { clearHistory } = useHistoryStore();
    const { projectId, dirty, isSaving, markSaved, setSaving, resetProjectState } = useProjectStore();

    const [openProfile, setOpenProfile] = useState(false);
    const [openExport, setOpenExport] = useState(false);
    const [openNotifications, setOpenNotifications] = useState(false);
    const [openCredits, setOpenCredits] = useState(false);
    const [openSettingsModal, setOpenSettingsModal] = useState(false);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>('profile');
    const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
    const [verificationBusy, setVerificationBusy] = useState(false);
    const [onDemandUsage, setOnDemandUsage] = useState(false);
    const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
    const [billingLedger, setBillingLedger] = useState<BillingLedgerItem[]>([]);
    const [billingLoading, setBillingLoading] = useState(false);
    const [billingActionBusy, setBillingActionBusy] = useState<'pro' | 'team' | 'topup_1000' | 'portal' | null>(null);
    const [exportActionBusy, setExportActionBusy] = useState<ExportAction | null>(null);
    const [saveLabel, setSaveLabel] = useState<'saving' | 'saved' | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const saveLabelTimerRef = useRef<number | null>(null);
    const billingRetryBlockedUntilRef = useRef(0);

    const { screens: exportScreens, scope } = getExportTargetScreens(spec, {
        selectedBoardId: doc.selection.selectedBoardId,
        selectedNodeIds: doc.selection.selectedNodeIds,
    });
    const selectionLabel = scope === 'selected' ? `${exportScreens.length} selected` : `${exportScreens.length} total`;
    const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'You';
    const authPhotoUrl = resolveUserPhotoUrl(authUser);

    useEffect(() => {
        if (!openProfile && !openExport && !openNotifications && !openCredits) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setOpenProfile(false);
                setOpenExport(false);
                setOpenNotifications(false);
                setOpenCredits(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [openProfile, openExport, openNotifications, openCredits]);

    useEffect(() => {
        if (!openCredits) return;
        if (billingLoading) return;
        if (billingSummary) return;
        void refreshBillingData();
    }, [openCredits, billingLoading, billingSummary]);

    useEffect(() => {
        return () => {
            if (saveLabelTimerRef.current) {
                window.clearTimeout(saveLabelTimerRef.current);
                saveLabelTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const unsub = observeAuthState((user) => setAuthUser(user));
        return () => unsub();
    }, []);

    const refreshBillingData = async (options?: { silent?: boolean; force?: boolean }) => {
        const silent = Boolean(options?.silent);
        const force = Boolean(options?.force);
        if (billingLoading) return;
        if (!force && billingRetryBlockedUntilRef.current > Date.now()) return;
        try {
            setBillingLoading(true);
            const [summaryRes, ledgerRes] = await Promise.all([apiClient.getBillingSummary(), apiClient.getBillingLedger(100)]);
            setBillingSummary(summaryRes.summary);
            setBillingLedger(ledgerRes.items || []);
            billingRetryBlockedUntilRef.current = 0;
        } catch (error) {
            if (error instanceof ApiRequestError && error.code === 'NETWORK_ERROR') {
                billingRetryBlockedUntilRef.current = Date.now() + BILLING_REFRESH_RETRY_MS;
            }
            if (!silent) {
                pushToast({ kind: 'error', title: 'Billing unavailable', message: (error as Error).message || 'Unable to load billing details.' });
            }
        } finally {
            setBillingLoading(false);
        }
    };

    useEffect(() => {
        if (!openSettingsModal) return;
        void refreshBillingData({ force: true });
    }, [openSettingsModal]);

    useEffect(() => {
        if (!authUser) return;
        void refreshBillingData({ silent: true, force: true });
    }, [authUser]);

    useEffect(() => {
        if (!authUser) return;
        if (!openCredits && !openSettingsModal) return;

        const onFocus = () => {
            void refreshBillingData({ silent: true });
        };
        const onVisibility = () => {
            if (!document.hidden) {
                void refreshBillingData({ silent: true });
            }
        };

        const intervalId = window.setInterval(() => {
            void refreshBillingData({ silent: true });
        }, 20_000);

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [authUser, openCredits, openSettingsModal, billingLoading]);

    useEffect(() => {
        if (!authUser) return;
        return subscribeToBillingUpdates(() => {
            void refreshBillingData({ silent: true });
        });
    }, [authUser]);

    const handleBillingCheckout = async (productKey: 'pro' | 'team' | 'topup_1000') => {
        try {
            setBillingActionBusy(productKey);
            const successUrl = new URL(window.location.href);
            successUrl.searchParams.set('billing_checkout', 'success');
            successUrl.searchParams.set('billing_product', productKey);
            successUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
            successUrl.searchParams.set('checkout_id', '{CHECKOUT_ID}');
            const cancelUrl = new URL(window.location.href);
            cancelUrl.searchParams.set('billing_checkout', 'cancel');
            cancelUrl.searchParams.set('billing_product', productKey);
            const session = await apiClient.createBillingCheckoutSession({
                productKey,
                successUrl: successUrl.toString(),
                cancelUrl: cancelUrl.toString(),
            });
            if (session.url) {
                window.location.href = session.url;
                return;
            }
            pushToast({ kind: 'error', title: 'Checkout failed', message: 'Billing checkout URL was not returned.' });
        } catch (error) {
            pushToast({ kind: 'error', title: 'Checkout failed', message: (error as Error).message || 'Unable to open checkout.' });
        } finally {
            setBillingActionBusy(null);
        }
    };

    const handleOpenBillingPortal = async () => {
        try {
            setBillingActionBusy('portal');
            const response = await apiClient.createBillingPortalSession(window.location.href);
            if (response.url) {
                window.location.href = response.url;
                return;
            }
            pushToast({ kind: 'error', title: 'Billing portal unavailable', message: 'Billing portal URL was not returned.' });
        } catch (error) {
            pushToast({ kind: 'error', title: 'Billing portal failed', message: (error as Error).message || 'Unable to open billing portal.' });
        } finally {
            setBillingActionBusy(null);
        }
    };

    const withScreens = async (loadingTitle: string, action: () => Promise<void>) => {
        if (!spec || exportScreens.length === 0) {
            pushToast({ kind: 'error', title: 'No screens to export', message: 'Generate or select screens first.' });
            return;
        }
        const loadingToastId = pushToast({ kind: 'loading', title: loadingTitle, message: `Processing ${selectionLabel}...`, durationMs: 0 });
        try {
            await action();
            setOpenExport(false);
        } catch (error) {
            pushToast({ kind: 'error', title: 'Export failed', message: (error as Error).message || 'An unexpected error occurred.' });
        } finally {
            removeToast(loadingToastId);
        }
    };

    const runExportAction = async (actionKey: ExportAction, loadingTitle: string, action: () => Promise<void>) => {
        if (exportActionBusy) return;
        setExportActionBusy(actionKey);
        try {
            await withScreens(loadingTitle, action);
        } finally {
            setExportActionBusy(null);
        }
    };

    const handleSaveNow = async () => {
        if (!spec || isSaving) return;
        if (saveLabelTimerRef.current) {
            window.clearTimeout(saveLabelTimerRef.current);
            saveLabelTimerRef.current = null;
        }
        setSaveLabel('saving');
        const savingToastId = pushToast({ kind: 'loading', title: 'Saving canvas', message: 'Persisting screens, chat, and canvas state...', durationMs: 0 });
        try {
            setSaving(true);
            const saved = await apiClient.save({ projectId: projectId || undefined, designSpec: spec as any, canvasDoc: doc, chatState: { messages } });
            markSaved(saved.projectId, saved.savedAt);
            pushToast({ kind: 'success', title: 'Project saved', message: `Project ${saved.projectId.slice(0, 8)} updated.` });
            setSaveLabel('saved');
            saveLabelTimerRef.current = window.setTimeout(() => {
                setSaveLabel(null);
                saveLabelTimerRef.current = null;
            }, 4000);
        } catch (error) {
            setSaving(false);
            pushToast({ kind: 'error', title: 'Save failed', message: (error as Error).message || 'Unable to save project.' });
            setSaveLabel(null);
        } finally {
            removeToast(savingToastId);
        }
    };

    const handleNewProject = async () => {
        const proceed = !dirty || await requestConfirmation({
            title: 'Start a new project?',
            message: 'You have unsaved changes. Starting a new project will discard current unsaved work.',
            confirmLabel: 'Start New Project',
            cancelLabel: 'Keep Editing',
            tone: 'danger',
        });
        if (!proceed) return;
        resetDesign();
        resetCanvas();
        exitEdit();
        clearMessages();
        clearHistory();
        resetProjectState();
        setOpenSettingsModal(false);
        window.history.pushState({}, '', '/app/projects/new');
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    const handleSignOut = async () => {
        try {
            await signOutCurrentUser();
            setOpenProfile(false);
            setOpenSettingsModal(false);
            window.history.pushState({}, '', '/auth/login');
            window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (error) {
            pushToast({ kind: 'error', title: 'Sign out failed', message: (error as Error).message || 'Could not sign out.' });
        }
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

    const openSettingsAt = (tab: SettingsTab) => {
        setOpenProfile(false);
        setOpenExport(false);
        setSettingsTab(tab);
        const routedProjectId = projectId || window.location.pathname.split('/')[3] || 'new';
        const query = tab === 'profile' ? '' : `?tab=${encodeURIComponent(tab)}`;
        window.history.pushState({}, '', `/app/projects/${encodeURIComponent(routedProjectId)}/settings${query}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    const tabMeta: Record<SettingsTab, { title: string; subtitle: string }> = {
        profile: { title: `Hello! ${authDisplayName}`, subtitle: 'This is your profile and activity overview.' },
        settings: { title: 'Settings', subtitle: 'Manage account preferences and integrations.' },
        billing: { title: 'Plan & Billing', subtitle: 'View your subscription, credits, and payment options.' },
        usage: { title: 'Usage', subtitle: 'Track credit consumption and recent billing events.' },
    };

    const planCreditCap = billingSummary?.planId === 'team' ? 15000 : billingSummary?.planId === 'pro' ? 3000 : 300;
    const currentMonthlyCredits = billingSummary?.monthlyCreditsRemaining ?? planCreditCap;
    const consumedThisCycle = Math.max(0, planCreditCap - currentMonthlyCredits);
    const cycleUsagePct = Math.max(0, Math.min(100, Math.round((consumedThisCycle / Math.max(planCreditCap, 1)) * 100)));
    const billingPeriodEnd = billingSummary ? new Date(billingSummary.periodEndAt) : null;
    const daysUntilReset = billingPeriodEnd ? Math.max(0, Math.ceil((billingPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

    const ledgerByDay = billingLedger.reduce<Map<string, number>>((acc, item) => {
        const key = new Date(item.createdAt).toISOString().slice(0, 10);
        acc.set(key, (acc.get(key) || 0) + 1);
        return acc;
    }, new Map<string, number>());
    const activityCells = Array.from({ length: 140 }, (_, index) => {
        const date = new Date(Date.now() - (139 - index) * 24 * 60 * 60 * 1000);
        const key = date.toISOString().slice(0, 10);
        const count = ledgerByDay.get(key) || 0;
        const level = count >= 4 ? 4 : count >= 3 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0;
        return { key, level };
    });
    const monthHeaders = useMemo(() => Array.from({ length: 12 }, (_, idx) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (11 - idx));
        return date.toLocaleDateString(undefined, { month: 'short' });
    }), []);
    const usageEvents = billingLedger
        .filter((item) => Boolean(item.operation) || Boolean(item.requestId))
        .slice(0, 50);
    const usageActivityRows = useMemo(() => buildBillingUsageActivityRows(billingLedger), [billingLedger]);
    const aiCodeAccepted = billingLedger.filter((item) => (item.operation || '').includes('generate') || (item.operation || '').includes('edit')).length;
    const chatCount = billingLedger.filter((item) => (item.operation || '').includes('plan') || (item.operation || '').includes('generate')).length;
    const modelHistogram = usageEvents
        .map((item) => extractLedgerModelName(item.metadata))
        .filter((value): value is string => Boolean(value))
        .reduce<Record<string, number>>((acc, model) => {
            acc[model] = (acc[model] || 0) + 1;
            return acc;
        }, {});
    const mostFrequentModel = Object.entries(modelHistogram).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const anyExportBusy = exportActionBusy !== null;
    const selectedScreensCount = scope === 'selected' ? exportScreens.length : 0;
    const balanceCredits = billingSummary?.balanceCredits ?? 0;
    const notifications = toasts
        .filter((item) => item.kind !== 'loading')
        .slice(-8)
        .reverse();

    const goToHelp = () => {
        setOpenProfile(false);
        window.history.pushState({}, '', '/blog');
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    return (
        <>
            <div ref={menuRef} className="pointer-events-auto relative flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => void handleSaveNow()}
                    disabled={isSaving}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--ui-canvas-profile-border)] bg-[var(--ui-canvas-profile-bg)] px-3 text-[var(--ui-text)] shadow-[0_18px_30px_rgba(0,0,0,0.2)] backdrop-blur-[10px] transition-colors hover:bg-[var(--ui-canvas-profile-hover)] disabled:cursor-not-allowed disabled:opacity-65"
                    title={isSaving ? 'Saving project...' : 'Save project'}
                >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saveLabel && (
                        <span className="text-xs font-semibold text-[var(--ui-text-muted)]">
                            {saveLabel === 'saving' ? 'Saving...' : 'Saved'}
                        </span>
                    )}
                </button>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setOpenExport((v) => !v);
                            setOpenProfile(false);
                            setOpenNotifications(false);
                            setOpenCredits(false);
                        }}
                        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ui-canvas-profile-border)] bg-[var(--ui-canvas-profile-bg)] text-[var(--ui-text)] shadow-[0_18px_30px_rgba(0,0,0,0.2)] backdrop-blur-[10px] transition-colors hover:bg-[var(--ui-canvas-profile-hover)]"
                        title={anyExportBusy ? 'Export in progress...' : 'Export options'}
                    >
                        {anyExportBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <div className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full border border-[var(--ui-canvas-profile-border)] bg-[var(--ui-primary)] px-1 text-center text-[10px] font-semibold leading-[16px] text-white">
                            {selectedScreensCount}
                        </div>
                    </button>
                    {openExport && (
                        <div className="canvas-profile-menu w-[336px]">
                            <div className="px-2 pb-2 text-[11px] text-[var(--ui-text-subtle)]">
                                Export scope: <span className="font-semibold text-[var(--ui-text)]">{selectionLabel}</span>
                            </div>
                            <button
                                type="button"
                                className="canvas-profile-menu-item disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={anyExportBusy}
                                onClick={() => runExportAction('zip', 'Exporting ZIP', async () => {
                                    const { filename } = exportScreensAsZip(exportScreens, spec?.name || 'eazyui-design');
                                    pushToast({ kind: 'success', title: 'ZIP exported', message: `${filename} (${selectionLabel})` });
                                })}
                            >
                                {exportActionBusy === 'zip' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                <span>{exportActionBusy === 'zip' ? 'Exporting ZIP...' : 'Export as ZIP'}</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={anyExportBusy}
                                onClick={() => runExportAction('images', 'Rendering images', async () => {
                                    const { filename } = await exportScreensAsImagesZip(exportScreens, spec?.name || 'eazyui-design');
                                    pushToast({ kind: 'success', title: 'Images exported', message: `${filename} (${selectionLabel})` });
                                })}
                            >
                                {exportActionBusy === 'images' ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                                <span>{exportActionBusy === 'images' ? 'Rendering images...' : 'Export as Images'}</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={anyExportBusy}
                                onClick={() => runExportAction('code', 'Copying code', async () => {
                                    await copyScreensCodeToClipboard(exportScreens);
                                    pushToast({ kind: 'success', title: 'Code copied', message: `Copied ${selectionLabel} to clipboard.` });
                                })}
                            >
                                {exportActionBusy === 'code' ? <Loader2 size={14} className="animate-spin" /> : <Files size={14} />}
                                <span>{exportActionBusy === 'code' ? 'Copying code...' : 'Copy Code to Clipboard'}</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={anyExportBusy}
                                onClick={() => runExportAction('figma', 'Preparing Figma export', async () => {
                                    await exportScreensToFigmaClipboard(exportScreens);
                                    pushToast({ kind: 'guide', title: 'Ready for Figma', message: 'Open Figma and press Ctrl+V to paste.', durationMs: 6000 });
                                })}
                            >
                                {exportActionBusy === 'figma' ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
                                <span>{exportActionBusy === 'figma' ? 'Preparing Figma export...' : 'Export to Figma'}</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setOpenNotifications((v) => !v);
                            setOpenExport(false);
                            setOpenProfile(false);
                            setOpenCredits(false);
                        }}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ui-canvas-profile-border)] bg-[var(--ui-canvas-profile-bg)] text-[var(--ui-text)] shadow-[0_18px_30px_rgba(0,0,0,0.2)] backdrop-blur-[10px] transition-colors hover:bg-[var(--ui-canvas-profile-hover)]"
                        title="Notifications"
                    >
                        <Bell size={16} />
                    </button>
                    {openNotifications && (
                        <div className="canvas-profile-menu w-[368px]">
                            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">
                                Notifications
                            </div>
                            {notifications.length === 0 ? (
                                <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3 text-xs text-[var(--ui-text-subtle)]">
                                    No notifications yet.
                                </div>
                            ) : (
                                <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
                                    {notifications.map((item) => (
                                        <div key={item.id} className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                                            <div className="text-xs font-semibold text-[var(--ui-text)]">{item.title}</div>
                                            {item.message && <div className="mt-0.5 text-[11px] text-[var(--ui-text-subtle)]">{item.message}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setOpenCredits((v) => !v);
                            setOpenExport(false);
                            setOpenProfile(false);
                            setOpenNotifications(false);
                        }}
                        className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--ui-canvas-profile-border)] bg-[var(--ui-canvas-profile-bg)] px-3 text-[var(--ui-text)] shadow-[0_18px_30px_rgba(0,0,0,0.2)] backdrop-blur-[10px] transition-colors hover:bg-[var(--ui-canvas-profile-hover)]"
                        title="Credits"
                    >
                        <Star size={15} className="text-amber-300" />
                        <span className="text-sm font-semibold">{billingLoading && !billingSummary ? '...' : balanceCredits.toLocaleString()}</span>
                        <ChevronDown size={13} className={`transition-transform ${openCredits ? 'rotate-180' : ''}`} />
                    </button>
                    {openCredits && (
                        <div className="canvas-profile-menu w-[332px]">
                            <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3">
                                <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">Available Credits</div>
                                <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
                                    {balanceCredits.toLocaleString()}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="canvas-profile-menu-item mt-2"
                                onClick={() => void handleBillingCheckout('topup_1000')}
                                disabled={billingActionBusy !== null}
                            >
                                <Zap size={14} />
                                <span>{billingActionBusy === 'topup_1000' ? 'Opening...' : 'Top up credits'}</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => openSettingsAt('billing')}
                            >
                                <CreditCard size={14} />
                                <span>Plan & Billing</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setOpenProfile((v) => !v);
                            setOpenExport(false);
                            setOpenNotifications(false);
                            setOpenCredits(false);
                        }}
                        className="canvas-profile-trigger min-w-[16px] rounded-[22px] px-1.5 pr-1.5"
                        title="Profile and settings"
                    >
                        <div className="canvas-profile-avatar canvas-profile-avatar-lg">{authPhotoUrl ? <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full rounded-[12px] object-cover" /> : <UserCircle2 size={18} />}</div>
                        <div className="inline-flex h-8 w-8 items-center justify-center text-[var(--ui-text)]">
                            <ChevronDown size={15} className={`transition-transform ${openProfile ? 'rotate-180' : ''}`} />
                        </div>
                    </button>
                    {openProfile && (
                        <div className="canvas-profile-menu w-[392px]">
                            <div className="mb-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3">
                                <div className="text-sm font-semibold text-[var(--ui-text)]">{authDisplayName}</div>
                                <div className="mt-0.5 text-xs text-[var(--ui-text-subtle)]">{authUser?.email || 'No email'}</div>
                            </div>
                            <div className="mb-2 flex items-center justify-between rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs">
                                <span className="inline-flex items-center gap-1 text-[var(--ui-text-subtle)]"><Star size={13} className="text-amber-300" /> Credits</span>
                                <span className="font-semibold text-[var(--ui-text)]">{balanceCredits.toLocaleString()}</span>
                            </div>
                            <div className="mb-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                                <div className="flex items-center justify-between text-xs text-[var(--ui-text-subtle)]">
                                    <span className="inline-flex items-center gap-1"><Sun size={12} /> Theme</span>
                                    <span className="text-[11px] uppercase tracking-[0.08em]">{theme}</span>
                                </div>
                                <div className="mt-2 inline-flex w-full overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)]">
                                    <button
                                        type="button"
                                        onClick={() => setTheme('light')}
                                        className={`inline-flex h-8 flex-1 items-center justify-center gap-1 text-xs transition-colors ${theme === 'light' ? 'bg-[var(--ui-primary)] text-white' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'}`}
                                    >
                                        <Sun size={12} />
                                        <span>Light</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTheme('dark')}
                                        className={`inline-flex h-8 flex-1 items-center justify-center gap-1 border-l border-[var(--ui-border)] text-xs transition-colors ${theme === 'dark' ? 'bg-[var(--ui-primary)] text-white' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] hover:text-[var(--ui-text)]'}`}
                                    >
                                        <Moon size={12} />
                                        <span>Dark</span>
                                    </button>
                                </div>
                            </div>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('profile')}><UserIcon size={14} /><span>Profile</span></button>
                            {!authUser?.emailVerified && <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('profile')}><Mail size={14} /><span>Verify Email</span></button>}
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('settings')}><Settings size={14} /><span>Settings</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('billing')}><CreditCard size={14} /><span>Plan & Billing</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('usage')}><BarChart3 size={14} /><span>Usage</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={goToHelp}><CircleHelp size={14} /><span>Get Help</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => void handleSignOut()}><LogOut size={14} /><span>Log Out</span></button>
                        </div>
                    )}
                </div>
            </div>

            {openSettingsModal && authUser && (
                <div className="fixed inset-0 z-[1300] bg-black/75 p-3 backdrop-blur-[2px]">
                    <div className="mx-auto flex h-full w-full max-w-[1280px] overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                        <aside className="flex w-[250px] flex-col border-r border-[var(--ui-border)] bg-[#0c0d12] px-4 py-5">
                            <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                                <div className="h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-[#171922]">
                                    {authPhotoUrl ? <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" /> : <div className="inline-flex h-full w-full items-center justify-center text-[var(--ui-text)]"><UserCircle2 size={16} /></div>}
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">{authDisplayName}</p>
                                    <p className="truncate text-xs text-[var(--ui-text-subtle)]">{authUser.email || 'No email'}</p>
                                </div>
                            </div>

                            <div className="mt-6">
                                <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Account</p>
                                <div className="mt-2 space-y-1">{ACCOUNT_NAV.map((item) => { const Icon = item.icon; const active = settingsTab === item.key; return <button key={item.key} type="button" onClick={() => setSettingsTab(item.key)} className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors ${active ? 'bg-white/8 text-white' : 'text-slate-300 hover:bg-white/5'}`}><Icon size={15} /><span>{item.label}</span></button>; })}</div>
                            </div>
                            <div className="mt-6">
                                <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Subscription</p>
                                <div className="mt-2 space-y-1">{SUBSCRIPTION_NAV.map((item) => { const Icon = item.icon; const active = settingsTab === item.key; return <button key={item.key} type="button" onClick={() => setSettingsTab(item.key)} className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors ${active ? 'bg-white/8 text-white' : 'text-slate-300 hover:bg-white/5'}`}><Icon size={15} /><span>{item.label}</span></button>; })}</div>
                            </div>

                            <div className="mt-auto space-y-2 pt-8">
                                <button type="button" onClick={() => { window.history.pushState({}, '', '/app/projects'); window.dispatchEvent(new PopStateEvent('popstate')); setOpenSettingsModal(false); }} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)]"><FolderOpen size={14} /><span>Open Workspace</span></button>
                                <button type="button" onClick={() => void refreshBillingData()} disabled={billingLoading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)] disabled:opacity-60">{billingLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}<span>{billingLoading ? 'Refreshing...' : 'Refresh Data'}</span></button>
                            </div>
                        </aside>

                        <section className="flex min-w-0 flex-1 flex-col bg-[#090b12]">
                            <header className="flex h-20 items-center justify-between border-b border-[var(--ui-border)] px-7">
                                <div>
                                    <h2 className="text-[42px] font-semibold leading-[1] text-white">{tabMeta[settingsTab].title}</h2>
                                    <p className="mt-2 text-base text-[var(--ui-text-subtle)]">{tabMeta[settingsTab].subtitle}</p>
                                </div>
                                <button type="button" onClick={() => setOpenSettingsModal(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text-subtle)] hover:text-[var(--ui-text)]" title="Close settings"><X size={16} /></button>
                            </header>

                            <div className="flex-1 overflow-y-auto px-7 py-6">
                                {settingsTab === 'profile' && (
                                    <div className="mx-auto w-full max-w-[900px] space-y-4">
                                        <p className="text-sm text-[var(--ui-text-subtle)]">This is your day {Math.max(1, Math.ceil((Date.now() - new Date(authUser.metadata.creationTime || Date.now()).getTime()) / (1000 * 60 * 60 * 24)))} of using EazyUI.</p>
                                        <p className="inline-flex items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,transparent)] px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[var(--ui-primary)]">Power User</p>

                                        <div className="rounded-xl border border-[var(--ui-border)] bg-[#10131b] p-4">
                                            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold text-[var(--ui-text)]">Active Days</h3><span className="text-xs text-[var(--ui-text-subtle)]">{activityCells.filter((cell) => cell.level > 0).length} active days</span></div>
                                            <div className="mt-3 grid grid-cols-12 gap-1 text-[10px] text-[var(--ui-text-subtle)]">{monthHeaders.map((label) => <span key={label} className="truncate">{label}</span>)}</div>
                                            <div className="mt-2 grid grid-flow-col grid-rows-7 gap-1">{activityCells.map((cell) => <div key={cell.key} title={cell.key} className={`h-3 w-3 rounded-[3px] ${heatClass(cell.level)}`} />)}</div>
                                            <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-[var(--ui-text-subtle)]"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <span key={level} className={`h-2.5 w-2.5 rounded-[3px] ${heatClass(level)}`} />)}<span>More</span></div>
                                            <div className="mt-4 divide-y divide-[var(--ui-border)] rounded-lg border border-[var(--ui-border)]">
                                                <div className="flex items-center justify-between px-3 py-2"><span className="text-sm text-[var(--ui-text-subtle)]">AI Code Accepted</span><span className="text-sm font-semibold text-[var(--ui-text)]">{aiCodeAccepted > 0 ? aiCodeAccepted : '-'}</span></div>
                                                <div className="flex items-center justify-between px-3 py-2"><span className="text-sm text-[var(--ui-text-subtle)]">Chat Count</span><span className="text-sm font-semibold text-[var(--ui-text)]">{chatCount > 0 ? chatCount : '-'}</span></div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div className="rounded-xl border border-[var(--ui-border)] bg-[#10131b] p-4"><h4 className="text-base font-semibold text-[var(--ui-text)]">Most Frequent AI Partner</h4><div className="mt-8 text-center"><p className="text-4xl leading-none text-[var(--ui-text-subtle)]">zZ</p><p className="mt-5 text-sm text-[var(--ui-text-subtle)]">{mostFrequentModel || 'No model data yet.'}</p></div></div>
                                            <div className="rounded-xl border border-[var(--ui-border)] bg-[#10131b] p-4"><h4 className="text-base font-semibold text-[var(--ui-text)]">Recent Model Invocation Preference</h4><div className="mt-8 text-center"><p className="text-4xl leading-none text-[var(--ui-text-subtle)]">zZ</p><p className="mt-5 text-sm text-[var(--ui-text-subtle)]">{usageEvents[0] ? (usageEvents[0].operation || usageEvents[0].type).replace(/_/g, ' ') : 'No recent activity yet.'}</p></div></div>
                                        </div>
                                    </div>
                                )}

                                {settingsTab === 'settings' && (
                                    <div className="mx-auto w-full max-w-[920px] space-y-6">
                                        <SectionCard title="User Info">
                                            <SettingsRow label="Avatar" detail="JPG, PNG, or GIF (max 2 MB)"><div className="h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-[#1a1d26]">{authPhotoUrl ? <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" /> : <div className="inline-flex h-full w-full items-center justify-center text-[var(--ui-text)]"><UserCircle2 size={16} /></div>}</div></SettingsRow>
                                            <SettingsRow label="Name" detail="Your profile name"><span className="text-sm font-semibold text-[var(--ui-text)]">{authDisplayName}</span></SettingsRow>
                                            <SettingsRow label="Email" detail="Your login method"><span className="text-sm font-semibold text-[var(--ui-text)]">{authUser.email || 'No email'}</span></SettingsRow>
                                        </SectionCard>

                                        <SectionCard title="Preferences">
                                            <SettingsRow label="Theme" detail="Choose how the workspace looks.">
                                                <div className="inline-flex overflow-hidden rounded-lg border border-[var(--ui-border)]">
                                                    <button type="button" onClick={() => setTheme('light')} className={`inline-flex h-9 items-center gap-2 px-3 text-sm ${theme === 'light' ? 'bg-white/10 text-white' : 'bg-transparent text-[var(--ui-text-subtle)] hover:bg-white/5'}`}><Sun size={14} /><span>Light</span></button>
                                                    <button type="button" onClick={() => setTheme('dark')} className={`inline-flex h-9 items-center gap-2 border-l border-[var(--ui-border)] px-3 text-sm ${theme === 'dark' ? 'bg-white/10 text-white' : 'bg-transparent text-[var(--ui-text-subtle)] hover:bg-white/5'}`}><Moon size={14} /><span>Dark</span></button>
                                                </div>
                                            </SettingsRow>
                                        </SectionCard>

                                        <SectionCard title="Integrations">
                                            <SettingsRow label="Vercel" detail="A frontend cloud platform for automatic web deployment."><button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-3)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)]"><Link2 size={13} /><span>Connect</span></button></SettingsRow>
                                            <SettingsRow label="Supabase" detail="For user authentication and data storage."><button type="button" className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-3)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)]"><Link2 size={13} /><span>Connect</span></button></SettingsRow>
                                        </SectionCard>

                                        <SectionCard title="Account Access">
                                            <SettingsRow label="Log out current account" detail="End this session on this browser."><button type="button" onClick={() => void handleSignOut()} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-3)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)]"><LogOut size={13} /><span>Log out</span></button></SettingsRow>
                                            {!authUser.emailVerified && <SettingsRow label="Email verification" detail="Verify your account for billing and notifications."><button type="button" onClick={() => void handleSendVerification()} disabled={verificationBusy} className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-3)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] disabled:opacity-60"><Mail size={13} /><span>{verificationBusy ? 'Sending...' : 'Send verification'}</span></button></SettingsRow>}
                                        </SectionCard>

                                        <SectionCard title="Danger Zone"><SettingsRow label="Start a new project" detail="This clears unsaved work and opens a clean canvas."><button type="button" onClick={() => void handleNewProject()} className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-400/40 bg-rose-500/10 px-4 text-sm text-rose-200 hover:bg-rose-500/20"><AlertTriangle size={13} /><span>New project</span></button></SettingsRow></SectionCard>
                                    </div>
                                )}

                                {settingsTab === 'billing' && (
                                    <div className="mx-auto w-full max-w-[920px] space-y-6">
                                        <SectionCard title="Subscription Plan">
                                            <SettingsRow label="Current plan" detail={billingSummary ? `Status: ${billingSummary.status}` : 'Loading plan status...'}><span className="text-3xl font-semibold text-[var(--ui-text)]">{billingSummary?.planLabel || 'Free'}</span></SettingsRow>
                                            <SettingsRow label="Upgrade plan" detail={billingSummary ? `Cycle ends ${new Date(billingSummary.periodEndAt).toLocaleDateString()}` : 'Monthly credits with rollover on paid plans.'}>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <button type="button" onClick={() => void handleBillingCheckout('pro')} disabled={billingActionBusy !== null} className="h-9 rounded-md bg-[var(--ui-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--ui-primary-hover)] disabled:opacity-60">{billingActionBusy === 'pro' ? 'Opening...' : 'Upgrade plan'}</button>
                                                    <button type="button" onClick={() => void handleBillingCheckout('team')} disabled={billingActionBusy !== null} className="h-9 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-3)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] disabled:opacity-60">{billingActionBusy === 'team' ? 'Opening...' : 'Team'}</button>
                                                    <button type="button" onClick={() => void handleBillingCheckout('topup_1000')} disabled={billingActionBusy !== null} className="h-9 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-3)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] disabled:opacity-60">{billingActionBusy === 'topup_1000' ? 'Opening...' : 'Buy 1,000 credits'}</button>
                                                </div>
                                            </SettingsRow>
                                        </SectionCard>

                                        <SectionCard title="On-Demand Usage"><SettingsRow label="On-Demand Usage" detail="On-demand usage is available with a paid subscription."><ToggleSwitch checked={onDemandUsage} onChange={setOnDemandUsage} /></SettingsRow></SectionCard>

                                        <SectionCard title="How Charging Works">
                                            <div className="space-y-2 text-sm text-[var(--ui-text-subtle)]">
                                                <p>Before generation starts, EazyUI reserves the likely charge for that request.</p>
                                                <p>The fixed operation price is only the minimum floor. On Gemini 3 Pro requests, actual token usage can push the final charge above that floor.</p>
                                                <p className="text-[var(--ui-text)]">If a request is blocked, the error now shows the upfront reserve amount and explains when that reserve is higher than the minimum floor.</p>
                                            </div>
                                        </SectionCard>

                                        <SectionCard title="Billing History" action={<button type="button" onClick={() => void handleOpenBillingPortal()} disabled={billingActionBusy !== null} className="h-8 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-3)] px-3 text-xs text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] disabled:opacity-60">{billingActionBusy === 'portal' ? 'Opening...' : 'Payment settings'}</button>}>
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full text-left">
                                                    <thead><tr className="text-xs uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]"><th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Name</th><th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Credits</th><th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Date</th><th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Operation</th></tr></thead>
                                                    <tbody>{usageActivityRows.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--ui-text-subtle)]">No billing rows yet.</td></tr> : usageActivityRows.map((row) => <tr key={row.key} className="text-sm text-[var(--ui-text)]"><td className="border-b border-[var(--ui-border)] px-4 py-3"><div>{row.actionLabel}</div><div className="mt-1 text-[11px] text-[var(--ui-text-subtle)]">{[row.reserveCredits !== null ? `Reserve ${row.reserveCredits}` : null, row.minimumFloorCredits !== null ? `Floor ${row.minimumFloorCredits}` : null, row.finalChargedCredits !== null ? `Final ${row.finalChargedCredits}` : null].filter(Boolean).join(' · ') || (row.metadataReason || 'Usage event')}</div></td><td className="border-b border-[var(--ui-border)] px-4 py-3 font-semibold text-rose-300"><div>-{row.deductedCredits}</div>{row.reserveCredits !== null && row.reserveCredits !== row.deductedCredits ? <div className="text-[11px] font-normal text-[var(--ui-text-subtle)]">reserved {row.reserveCredits}</div> : null}</td><td className="border-b border-[var(--ui-border)] px-4 py-3 text-[var(--ui-text-subtle)]">{new Date(row.item.createdAt).toLocaleString()}</td><td className="border-b border-[var(--ui-border)] px-4 py-3 text-[var(--ui-text-subtle)]">{row.item.type}</td></tr>)}</tbody>
                                                </table>
                                            </div>
                                        </SectionCard>
                                    </div>
                                )}

                                {settingsTab === 'usage' && (
                                    <div className="mx-auto w-full max-w-[920px] space-y-6">
                                        <p className="text-[22px] text-[var(--ui-text)]">You are on <span className="font-semibold">{billingSummary?.planLabel || 'Free Plan'}</span>. Usage reset in {daysUntilReset ?? '--'} days on {billingPeriodEnd ? billingPeriodEnd.toLocaleString() : '--'}</p>
                                        <SectionCard title="Dollar Usage">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between"><p className="text-sm text-[var(--ui-text)]">{billingSummary?.planLabel || 'Free plan'}</p><p className="text-sm font-semibold text-[var(--ui-text)]">{consumedThisCycle.toLocaleString()} / {planCreditCap.toLocaleString()} credits</p></div>
                                                <div className="h-2 overflow-hidden rounded-full bg-[var(--ui-surface-4)]"><div className="h-full rounded-full bg-[var(--ui-primary)] transition-[width] duration-300" style={{ width: `${cycleUsagePct}%` }} /></div>
                                                <div className="flex items-center justify-between text-xs text-[var(--ui-text-subtle)]"><span>Monthly {billingSummary?.monthlyCreditsRemaining ?? '--'}</span><span>Rollover {billingSummary?.rolloverCredits ?? '--'}</span><span>Top-up {billingSummary?.topupCreditsRemaining ?? '--'}</span><span className="font-semibold text-[var(--ui-primary)]">Balance {billingSummary?.balanceCredits ?? '--'}</span></div>
                                            </div>
                                        </SectionCard>
                                        <SectionCard title="Usage Events">
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full text-left">
                                                    <thead>
                                                        <tr className="text-xs uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">
                                                            <th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Time</th>
                                                            <th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Model</th>
                                                            <th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Request</th>
                                                            <th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Action</th>
                                                            <th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Deducted</th>
                                                            <th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Tokens</th>
                                                            <th className="border-b border-[var(--ui-border)] px-4 py-3 font-medium">Request ID</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {usageActivityRows.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--ui-text-subtle)]">No Rows To Show</td>
                                                            </tr>
                                                        ) : usageActivityRows.map((row) => {
                                                            return (
                                                                <tr key={`usage-${row.key}`} className="text-sm text-[var(--ui-text)]">
                                                                    <td className="border-b border-[var(--ui-border)] px-4 py-3">{new Date(row.item.createdAt).toLocaleString()}</td>
                                                                    <td className="border-b border-[var(--ui-border)] px-4 py-3">{row.modelName}</td>
                                                                    <td className="border-b border-[var(--ui-border)] px-4 py-3 text-[var(--ui-text-subtle)]">
                                                                        {row.requestPreview ? (
                                                                            <span className="block max-w-[320px] whitespace-normal break-words" title={row.requestPreview}>
                                                                                {row.requestPreview}
                                                                            </span>
                                                                        ) : (
                                                                            <span>-</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="border-b border-[var(--ui-border)] px-4 py-3 text-[var(--ui-text-subtle)]"><div>{row.actionLabel}</div><div className="mt-1 text-[11px]">{[row.reserveCredits !== null ? `Reserve ${row.reserveCredits}` : null, row.minimumFloorCredits !== null ? `Floor ${row.minimumFloorCredits}` : null, row.finalChargedCredits !== null ? `Final ${row.finalChargedCredits}` : null, row.pricingMode ? row.pricingMode.replace(/_/g, ' ') : null].filter(Boolean).join(' · ') || (row.metadataReason || 'Usage event')}</div></td>
                                                                    <td className={`border-b border-[var(--ui-border)] px-4 py-3 font-semibold ${row.deductedCredits > 0 ? 'text-rose-300' : 'text-[var(--ui-text-subtle)]'}`}>
                                                                        {row.deductedCredits > 0 ? `-${row.deductedCredits}` : '0'}
                                                                    </td>
                                                                    <td className="border-b border-[var(--ui-border)] px-4 py-3 text-[var(--ui-text-subtle)]">{row.tokensUsed !== null ? row.tokensUsed.toLocaleString() : '-'}</td>
                                                                    <td className="border-b border-[var(--ui-border)] px-4 py-3 text-[var(--ui-text-subtle)]">
                                                                        <span className="block max-w-[200px] truncate whitespace-nowrap" title={row.requestIdentifier}>
                                                                            {row.requestIdentifier}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </SectionCard>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </>
    );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
    return (
        <button type="button" onClick={() => onChange(!checked)} className={`h-7 w-12 rounded-full border transition-colors ${checked ? 'border-[color:color-mix(in_srgb,var(--ui-primary)_72%,transparent)] bg-[var(--ui-primary)]' : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)]'}`}>
            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
        </button>
    );
}

function SectionCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ui-primary)_5%,#10131b),#10131b)]">
            <div className="flex items-center justify-between border-b border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] px-4 py-3"><h3 className="text-[26px] font-semibold text-[var(--ui-text)]">{title}</h3>{action}</div>
            <div className="divide-y divide-[var(--ui-border)]">{children}</div>
        </section>
    );
}

function SettingsRow({ label, detail, children }: { label: string; detail: string; children: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0"><p className="text-base font-medium text-[var(--ui-text)]">{label}</p><p className="mt-0.5 text-sm text-[var(--ui-text-subtle)]">{detail}</p></div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}
