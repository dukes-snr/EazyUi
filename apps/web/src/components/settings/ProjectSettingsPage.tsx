import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, BarChart3, Copy, CreditCard, Download, FolderOpen, KeyRound, Link2, Loader2, LogOut, Mail, Moon, RefreshCw, Settings, Sun, Trash2, User as UserIcon, UserCircle2, WalletCards, X } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { apiClient, subscribeToBillingUpdates, type BillingLedgerItem, type BillingPurchaseItem, type BillingSummary, type McpApiKeyItem } from '../../api/client';
import { observeAuthState, sendCurrentUserVerificationEmail, signOutCurrentUser } from '../../lib/auth';
import { useCanvasStore, useChatStore, useDesignStore, useEditStore, useHistoryStore, useProjectStore, useUiStore } from '../../stores';
import {
    buildBillingUsageActivityRows,
} from '../../utils/billingUsage';

type SettingsTab = 'profile' | 'settings' | 'billing' | 'usage';

const ACCOUNT_NAV: Array<{ key: SettingsTab; label: string; icon: typeof UserIcon }> = [
    { key: 'profile', label: 'Profile', icon: UserIcon },
    { key: 'settings', label: 'Settings', icon: Settings },
] as const;

const SUBSCRIPTION_NAV: Array<{ key: SettingsTab; label: string; icon: typeof CreditCard }> = [
    { key: 'billing', label: 'Plan & Billing', icon: CreditCard },
    { key: 'usage', label: 'Usage', icon: BarChart3 },
] as const;

function resolveUserPhotoUrl(user: FirebaseUser | null): string | null {
    if (!user) return null;
    if (user.photoURL) return user.photoURL;
    const providerPhoto = user.providerData.find((p) => Boolean(p?.photoURL))?.photoURL;
    if (providerPhoto) return providerPhoto;
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=111827&color=ffffff&size=128&rounded=true`;
}

function normalizeTab(value: string | undefined): SettingsTab {
    return value === 'profile' || value === 'settings' || value === 'billing' || value === 'usage' ? value : 'profile';
}

export function ProjectSettingsPage({
    projectId,
    initialTab,
    onNavigate,
}: {
    projectId: string;
    initialTab?: string;
    onNavigate: (path: string) => void;
}) {
    const { theme, setTheme, pushToast, requestConfirmation } = useUiStore();
    const { reset: resetDesign } = useDesignStore();
    const { reset: resetCanvas } = useCanvasStore();
    const { clearMessages } = useChatStore();
    const { exitEdit } = useEditStore();
    const { clearHistory } = useHistoryStore();
    const { dirty, resetProjectState } = useProjectStore();

    const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>(normalizeTab(initialTab));
    const [verificationBusy, setVerificationBusy] = useState(false);
    const [onDemandUsage, setOnDemandUsage] = useState(false);
    const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
    const [billingLedger, setBillingLedger] = useState<BillingLedgerItem[]>([]);
    const [billingPurchases, setBillingPurchases] = useState<BillingPurchaseItem[]>([]);
    const [billingLoading, setBillingLoading] = useState(false);
    const [billingActionBusy, setBillingActionBusy] = useState<'pro' | 'team' | 'topup_1000' | 'portal' | null>(null);
    const [billingBlockingMessage, setBillingBlockingMessage] = useState<string | null>(null);
    const [billingModal, setBillingModal] = useState<null | 'upgrade' | 'purchase'>(null);
    const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);
    const [mcpApiKeys, setMcpApiKeys] = useState<McpApiKeyItem[]>([]);
    const [mcpKeysLoading, setMcpKeysLoading] = useState(false);
    const [mcpCreating, setMcpCreating] = useState(false);
    const [mcpRevokingId, setMcpRevokingId] = useState<string | null>(null);
    const [mcpKeyLabel, setMcpKeyLabel] = useState('AI IDE');
    const [latestMcpApiKey, setLatestMcpApiKey] = useState<string>('');
    const [usageDaysFilter, setUsageDaysFilter] = useState<1 | 7 | 30 | 90>(7);
    const [hoveredActivity, setHoveredActivity] = useState<{ key: string; count: number } | null>(null);
    const [activityTooltip, setActivityTooltip] = useState<{ label: string; left: number; top: number } | null>(null);
    const activityGridRef = useRef<HTMLDivElement | null>(null);

    const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'You';
    const authPhotoUrl = resolveUserPhotoUrl(authUser);

    useEffect(() => {
        setSettingsTab(normalizeTab(initialTab));
    }, [initialTab]);

    useEffect(() => {
        const unsub = observeAuthState((user) => setAuthUser(user));
        return () => unsub();
    }, []);

    useEffect(() => {
        const query = settingsTab === 'profile' ? '' : `?tab=${encodeURIComponent(settingsTab)}`;
        window.history.replaceState({}, '', `/app/projects/${encodeURIComponent(projectId)}/settings${query}`);
    }, [projectId, settingsTab]);

    const refreshBillingData = async () => {
        try {
            setBillingLoading(true);
            const [summaryRes, ledgerRes, purchasesRes] = await Promise.all([
                apiClient.getBillingSummary(),
                apiClient.getBillingLedger(100),
                apiClient.getBillingPurchases(60),
            ]);
            setBillingSummary(summaryRes.summary);
            setBillingLedger(ledgerRes.items || []);
            setBillingPurchases(purchasesRes.items || []);
        } catch (error) {
            pushToast({ kind: 'error', title: 'Billing unavailable', message: (error as Error).message || 'Unable to load billing details.' });
        } finally {
            setBillingLoading(false);
        }
    };

    const refreshMcpApiKeys = async () => {
        try {
            setMcpKeysLoading(true);
            const response = await apiClient.getMcpApiKeys();
            setMcpApiKeys(response.keys || []);
        } catch (error) {
            pushToast({ kind: 'error', title: 'MCP keys unavailable', message: (error as Error).message || 'Unable to load MCP API keys.' });
        } finally {
            setMcpKeysLoading(false);
        }
    };

    useEffect(() => {
        void refreshBillingData();
        void refreshMcpApiKeys();
    }, []);

    useEffect(() => {
        if (!authUser) return;
        return subscribeToBillingUpdates(() => {
            void refreshBillingData();
        });
    }, [authUser]);

    const copyText = async (value: string, successTitle = 'Copied') => {
        try {
            await navigator.clipboard.writeText(value);
            pushToast({ kind: 'success', title: successTitle, message: 'Saved to clipboard.' });
        } catch (error) {
            pushToast({ kind: 'error', title: 'Copy failed', message: (error as Error).message || 'Could not copy to clipboard.' });
        }
    };

    const handleCreateMcpApiKey = async () => {
        try {
            setMcpCreating(true);
            const created = await apiClient.createMcpApiKey(mcpKeyLabel);
            setLatestMcpApiKey(created.key.apiKey);
            setMcpKeyLabel('AI IDE');
            await refreshMcpApiKeys();
            pushToast({ kind: 'success', title: 'MCP key created', message: 'Copy the key now. You can only see full value once.' });
        } catch (error) {
            pushToast({ kind: 'error', title: 'Create key failed', message: (error as Error).message || 'Unable to create MCP API key.' });
        } finally {
            setMcpCreating(false);
        }
    };

    const handleRevokeMcpApiKey = async (keyId: string) => {
        const confirmed = await requestConfirmation({
            title: 'Revoke this API key?',
            message: 'Agents using this key will lose MCP access immediately.',
            confirmLabel: 'Revoke key',
            cancelLabel: 'Cancel',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            setMcpRevokingId(keyId);
            await apiClient.revokeMcpApiKey(keyId);
            await refreshMcpApiKeys();
            pushToast({ kind: 'info', title: 'Key revoked', message: 'The MCP API key has been disabled.' });
        } catch (error) {
            pushToast({ kind: 'error', title: 'Revoke failed', message: (error as Error).message || 'Unable to revoke key.' });
        } finally {
            setMcpRevokingId(null);
        }
    };

    const handleBillingCheckout = async (productKey: 'pro' | 'team' | 'topup_1000') => {
        let redirecting = false;
        try {
            setBillingActionBusy(productKey);
            setBillingBlockingMessage('Preparing secure checkout...');
            const successUrl = new URL(window.location.href);
            successUrl.searchParams.set('billing_checkout', 'success');
            successUrl.searchParams.set('billing_product', productKey);
            successUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
            const cancelUrl = new URL(window.location.href);
            cancelUrl.searchParams.set('billing_checkout', 'cancel');
            cancelUrl.searchParams.set('billing_product', productKey);
            const session = await apiClient.createBillingCheckoutSession({
                productKey,
                successUrl: successUrl.toString(),
                cancelUrl: cancelUrl.toString(),
            });
            if (session.url) {
                redirecting = true;
                setBillingBlockingMessage('Redirecting to Stripe...');
                window.location.href = session.url;
                return;
            }
            pushToast({ kind: 'error', title: 'Checkout failed', message: 'Stripe checkout URL was not returned.' });
        } catch (error) {
            pushToast({ kind: 'error', title: 'Checkout failed', message: (error as Error).message || 'Unable to open checkout.' });
        } finally {
            if (!redirecting) {
                setBillingActionBusy(null);
                setBillingBlockingMessage(null);
            }
        }
    };

    const handleOpenBillingPortal = async () => {
        let redirecting = false;
        try {
            setBillingActionBusy('portal');
            setBillingBlockingMessage('Opening billing portal...');
            const response = await apiClient.createBillingPortalSession(window.location.href);
            if (response.url) {
                redirecting = true;
                setBillingBlockingMessage('Redirecting to billing portal...');
                window.location.href = response.url;
                return;
            }
            pushToast({ kind: 'error', title: 'Billing portal unavailable', message: 'Billing portal URL was not returned.' });
        } catch (error) {
            pushToast({ kind: 'error', title: 'Billing portal failed', message: (error as Error).message || 'Unable to open billing portal.' });
        } finally {
            if (!redirecting) {
                setBillingActionBusy(null);
                setBillingBlockingMessage(null);
            }
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

    const handleSignOut = async () => {
        try {
            await signOutCurrentUser();
            onNavigate('/auth/login');
        } catch (error) {
            pushToast({ kind: 'error', title: 'Sign out failed', message: (error as Error).message || 'Could not sign out.' });
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
        onNavigate('/app/projects/new');
    };

    const planCreditCap = billingSummary?.planId === 'team' ? 15000 : billingSummary?.planId === 'pro' ? 3000 : 300;
    const monthlyCredits = billingSummary?.monthlyCreditsRemaining ?? planCreditCap;
    const usedCredits = Math.max(0, planCreditCap - monthlyCredits);
    const usagePct = Math.max(0, Math.min(100, Math.round((usedCredits / Math.max(planCreditCap, 1)) * 100)));
    const resetAt = billingSummary ? new Date(billingSummary.periodEndAt) : null;
    const daysToReset = resetAt ? Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
    const purchaseHistoryRows = useMemo(() => {
        return [...billingPurchases]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .slice(0, 30);
    }, [billingPurchases]);
    const billingHistoryDisplayRows = useMemo(() => {
        if (purchaseHistoryRows.length > 0) {
            return purchaseHistoryRows.map((item) => ({
                id: item.id,
                label: item.description
                    || item.productKey?.replace(/_/g, ' ')
                    || item.purchaseKind.replace(/_/g, ' '),
                amountTotal: item.amountTotal,
                currency: item.currency,
                createdAt: item.createdAt,
                purchase: item,
                source: 'purchase' as const,
            }));
        }
        return billingLedger
            .filter((item) => item.creditsDelta > 0 && (item.type === 'grant' || item.type === 'adjustment'))
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .slice(0, 30)
            .map((item) => {
                const reason = String((item.metadata as any)?.reason || '').toLowerCase();
                const label = reason.includes('topup')
                    ? 'Credit top-up'
                    : reason.includes('plan')
                        ? 'Plan purchase'
                        : 'Billing credit grant';
                return {
                    id: `legacy-${item.id}`,
                    label,
                    amountTotal: Math.max(0, item.creditsDelta) * 100,
                    currency: 'USD',
                    createdAt: item.createdAt,
                    purchase: null as BillingPurchaseItem | null,
                    source: 'legacy' as const,
                };
            });
    }, [purchaseHistoryRows, billingLedger]);
    const currentPlanLabel = billingSummary?.planLabel || 'Free';
    const currentPlanStatus = billingSummary?.status || 'active';
    const creditsBalanceLabel = billingSummary
        ? `${billingSummary.balanceCredits.toLocaleString()} credits`
        : '--';
    const nextResetLabel = resetAt ? resetAt.toLocaleDateString() : '--';
    const usageFilterStart = useMemo(() => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - (usageDaysFilter - 1));
        return start;
    }, [usageDaysFilter]);
    const usageActivityRows = useMemo(() => {
        return buildBillingUsageActivityRows(billingLedger, usageFilterStart.getTime());
    }, [billingLedger, usageFilterStart]);
    const usageCreditsInWindow = useMemo(
        () => usageActivityRows.reduce((sum, row) => sum + row.deductedCredits, 0),
        [usageActivityRows]
    );
    const usageFilterLabel = usageDaysFilter === 1 ? 'today' : `last ${usageDaysFilter} days`;

    const handleDownloadInvoice = async (purchase: BillingPurchaseItem) => {
        try {
            setInvoiceBusyId(purchase.id);
            const { filename, html } = await apiClient.downloadBillingInvoice(purchase.id);
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            pushToast({ kind: 'success', title: 'Invoice ready', message: `Downloaded ${filename}` });
        } catch (error) {
            pushToast({ kind: 'error', title: 'Invoice failed', message: (error as Error).message || 'Could not generate invoice.' });
        } finally {
            setInvoiceBusyId(null);
        }
    };

    const tabTitle = {
        profile: `Hello! ${authDisplayName}`,
        settings: 'Settings',
        billing: 'Plan & Billing',
        usage: 'Usage',
    }[settingsTab];

    const tabSubtitle = {
        profile: 'Your profile and activity overview.',
        settings: 'Manage account preferences and integrations.',
        billing: 'Subscription, credits and payment settings.',
        usage: 'Credit consumption and usage events.',
    }[settingsTab];

    const activityHeatmap = useMemo(() => {
        const dayMap = new Map<string, number>();
        for (const item of billingLedger) {
            const day = new Date(item.createdAt);
            day.setHours(0, 0, 0, 0);
            const key = day.toISOString().slice(0, 10);
            dayMap.set(key, (dayMap.get(key) || 0) + 1);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 364);

        const gridStart = new Date(startDate);
        gridStart.setDate(startDate.getDate() - startDate.getDay());

        const maxCount = Math.max(0, ...dayMap.values());
        const resolveLevel = (count: number) => {
            if (count <= 0) return 0;
            if (maxCount <= 1) return 4;
            const ratio = count / maxCount;
            if (ratio <= 0.25) return 1;
            if (ratio <= 0.5) return 2;
            if (ratio <= 0.75) return 3;
            return 4;
        };

        const weeks: Array<Array<{ key: string; count: number; level: number; date: Date } | null>> = [];
        const monthLabels: Array<{ index: number; label: string }> = [];
        let activeDays = 0;
        let previousMonth = -1;
        let weekIndex = 0;

        for (let weekStart = new Date(gridStart); weekStart <= today; weekStart.setDate(weekStart.getDate() + 7), weekIndex += 1) {
            const week: Array<{ key: string; count: number; level: number; date: Date } | null> = Array.from({ length: 7 }, () => null);
            let firstVisibleDate: Date | null = null;
            let monthBoundaryDate: Date | null = null;

            for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
                const date = new Date(weekStart);
                date.setDate(weekStart.getDate() + dayIndex);
                if (date < startDate || date > today) continue;

                if (!firstVisibleDate) firstVisibleDate = date;
                if (!monthBoundaryDate && date.getDate() === 1) monthBoundaryDate = date;

                const key = date.toISOString().slice(0, 10);
                const count = dayMap.get(key) || 0;
                if (count > 0) activeDays += 1;

                week[dayIndex] = {
                    key,
                    count,
                    level: resolveLevel(count),
                    date,
                };
            }

            const labelDate = monthBoundaryDate || (monthLabels.length === 0 ? firstVisibleDate : null);
            if (labelDate && labelDate.getMonth() !== previousMonth) {
                monthLabels.push({
                    index: weekIndex,
                    label: labelDate.toLocaleDateString(undefined, { month: 'short' }),
                });
                previousMonth = labelDate.getMonth();
            }

            weeks.push(week);
        }

        return { weeks, monthLabels, activeDays };
    }, [billingLedger]);

    const hoveredActivityLabel = useMemo(() => {
        if (!hoveredActivity) return `${activityHeatmap.activeDays} active days`;
        const date = new Date(`${hoveredActivity.key}T00:00:00`);
        const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const countLabel = hoveredActivity.count === 1 ? '1 design' : `${hoveredActivity.count} designs`;
        return `${countLabel} on ${label}`;
    }, [hoveredActivity, activityHeatmap.activeDays]);

    return (
        <div className="relative h-full w-full bg-[var(--ui-surface-1)] text-[var(--ui-text)]">
            {billingBlockingMessage && (
                <div className="absolute inset-0 z-50 grid place-items-center bg-black/55 backdrop-blur-sm">
                    <div className="w-[320px] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                            <Loader2 size={18} className="animate-spin text-[var(--ui-primary)]" />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-[var(--ui-text)]">{billingBlockingMessage}</p>
                        <p className="mt-1 text-xs text-[var(--ui-text-muted)]">Please wait. This can take a few seconds.</p>
                    </div>
                </div>
            )}
            <div className="flex h-full">
                <aside className="w-[250px] border-r border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                    <button type="button" onClick={() => onNavigate(`/app/projects/${encodeURIComponent(projectId)}/canvas`)} className="mb-4 inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)] px-3 text-sm hover:bg-[var(--ui-surface-3)]"><ArrowLeft size={14} />Back to Canvas</button>
                    <div className="mb-5 flex items-center gap-3 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                        <div className="h-10 w-10 overflow-hidden rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-3)]">{authPhotoUrl ? <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" /> : <div className="inline-flex h-full w-full items-center justify-center"><UserCircle2 size={16} /></div>}</div>
                        <div className="min-w-0"><p className="truncate text-sm font-semibold">{authDisplayName}</p><p className="truncate text-xs text-[var(--ui-text-subtle)]">{authUser?.email || 'No email'}</p></div>
                    </div>

                    <p className="px-2 text-[11px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Account</p>
                    <div className="mt-2 space-y-1">{ACCOUNT_NAV.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setSettingsTab(key)} className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm ${settingsTab === key ? 'bg-[var(--ui-surface-3)] font-medium' : 'text-[var(--ui-text-subtle)] hover:bg-[var(--ui-surface-3)]'}`}><Icon size={15} />{label}</button>)}</div>

                    <p className="mt-6 px-2 text-[11px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Subscription</p>
                    <div className="mt-2 space-y-1">{SUBSCRIPTION_NAV.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setSettingsTab(key)} className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm ${settingsTab === key ? 'bg-[var(--ui-surface-3)] font-medium' : 'text-[var(--ui-text-subtle)] hover:bg-[var(--ui-surface-3)]'}`}><Icon size={15} />{label}</button>)}</div>

                    <div className="mt-6 space-y-2">
                        <button type="button" onClick={() => onNavigate('/app/projects')} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-sm hover:bg-[var(--ui-surface-3)]"><FolderOpen size={14} />Open Workspace</button>
                        <button type="button" onClick={() => void refreshBillingData()} disabled={billingLoading} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-sm hover:bg-[var(--ui-surface-3)] disabled:opacity-60">{billingLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Refresh Data</button>
                    </div>
                </aside>

                <main className="flex-1 overflow-y-auto bg-[var(--ui-surface-1)] p-6">
                    <div className={`mx-auto w-full ${settingsTab === 'profile' ? 'max-w-[980px]' : 'max-w-[980px]'}`}>
                        <div className="mb-6 flex items-start justify-between gap-4">
                            <div><h1 className="text-4xl font-semibold tracking-tight">{tabTitle}</h1><p className="mt-1 text-sm text-[var(--ui-text-subtle)]">{tabSubtitle}</p></div>
                            <button type="button" onClick={() => void handleSignOut()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-sm hover:bg-[var(--ui-surface-3)]"><LogOut size={14} />Log out</button>
                        </div>

                        {settingsTab === 'profile' && (
                            <div className="space-y-5">
                                <SectionCard title="Active Days">
                                    <div className="space-y-3">
                                        <div className="relative ml-[22px] h-4">
                                            {activityHeatmap.monthLabels.map((label) => (
                                                <span
                                                    key={`month-${label.index}-${label.label}`}
                                                    className="absolute text-[10px] text-[var(--ui-text-subtle)]"
                                                    style={{ left: `${label.index * 12}px` }}
                                                >
                                                    {label.label}
                                                </span>
                                            ))}
                                        </div>

                                        <div className="flex gap-2">
                                            <div className="grid grid-rows-7 gap-1 pt-[1px] text-[10px] text-[var(--ui-text-subtle)]">
                                                <span className="h-[11px]" />
                                                <span className="h-[11px] leading-[11px]">Mon</span>
                                                <span className="h-[11px]" />
                                                <span className="h-[11px] leading-[11px]">Wed</span>
                                                <span className="h-[11px]" />
                                                <span className="h-[11px] leading-[11px]">Fri</span>
                                                <span className="h-[11px]" />
                                            </div>

                                            <div className="relative">
                                                {activityTooltip && (
                                                    <div
                                                        className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-1)] px-2 py-1 text-[11px] text-[var(--ui-text)] shadow-lg"
                                                        style={{ left: activityTooltip.left, top: activityTooltip.top }}
                                                    >
                                                        {activityTooltip.label}
                                                    </div>
                                                )}

                                                <div ref={activityGridRef} className="overflow-x-auto pb-1">
                                                    <div className="flex w-max gap-1">
                                                        {activityHeatmap.weeks.map((week, weekIndex) => (
                                                            <div key={`week-${weekIndex}`} className="grid grid-rows-7 gap-1">
                                                                {week.map((cell, dayIndex) => {
                                                                    if (!cell) {
                                                                        return <span key={`empty-${weekIndex}-${dayIndex}`} className="h-[11px] w-[11px]" />;
                                                                    }

                                                                    const tone = cell.level <= 0
                                                                        ? 'bg-[#161b22] border-[#21262d]'
                                                                        : cell.level === 1
                                                                            ? 'bg-[#0e4429] border-[#0e4429]'
                                                                            : cell.level === 2
                                                                                ? 'bg-[#006d32] border-[#006d32]'
                                                                                : cell.level === 3
                                                                                    ? 'bg-[#26a641] border-[#26a641]'
                                                                                    : 'bg-[#39d353] border-[#39d353]';

                                                                    return (
                                                                        <button
                                                                            key={cell.key}
                                                                            type="button"
                                                                            onMouseEnter={(event) => {
                                                                                setHoveredActivity({ key: cell.key, count: cell.count });
                                                                                const grid = activityGridRef.current;
                                                                                if (!grid) return;
                                                                                const gridRect = grid.getBoundingClientRect();
                                                                                const cellRect = event.currentTarget.getBoundingClientRect();
                                                                                const dateLabel = new Date(`${cell.key}T00:00:00`).toLocaleDateString(undefined, {
                                                                                    month: 'short',
                                                                                    day: 'numeric',
                                                                                    year: 'numeric',
                                                                                });
                                                                                const countLabel = cell.count === 0
                                                                                    ? 'No design'
                                                                                    : `${cell.count} ${cell.count === 1 ? 'design' : 'designs'}`;
                                                                                setActivityTooltip({
                                                                                    label: `${countLabel} on ${dateLabel}`,
                                                                                    left: cellRect.left - gridRect.left + grid.scrollLeft + (cellRect.width / 2),
                                                                                    top: cellRect.top - gridRect.top - 8,
                                                                                });
                                                                            }}
                                                                            onMouseLeave={() => {
                                                                                setHoveredActivity(null);
                                                                                setActivityTooltip(null);
                                                                            }}
                                                                            className={`h-[11px] w-[11px] rounded-[2px] border transition-transform hover:scale-110 ${tone}`}
                                                                            aria-label={`${cell.key}: ${cell.count} ${cell.count === 1 ? 'design' : 'designs'}`}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between border-t border-[var(--ui-border)] pt-2 text-[11px] text-[var(--ui-text-subtle)]">
                                            <span>{hoveredActivityLabel}</span>
                                            <div className="flex items-center gap-2">
                                                <span>Less</span>
                                                <div className="flex items-center gap-1">
                                                    <span className="h-2.5 w-2.5 rounded-[2px] border border-[#21262d] bg-[#161b22]" />
                                                    <span className="h-2.5 w-2.5 rounded-[2px] border border-[#0e4429] bg-[#0e4429]" />
                                                    <span className="h-2.5 w-2.5 rounded-[2px] border border-[#006d32] bg-[#006d32]" />
                                                    <span className="h-2.5 w-2.5 rounded-[2px] border border-[#26a641] bg-[#26a641]" />
                                                    <span className="h-2.5 w-2.5 rounded-[2px] border border-[#39d353] bg-[#39d353]" />
                                                </div>
                                                <span>More</span>
                                            </div>
                                        </div>
                                    </div>
                                </SectionCard>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <SectionCard title="AI Code Accepted">
                                        <p className="text-3xl font-semibold">{billingLedger.filter((i) => (i.operation || '').includes('edit')).length || '-'}</p>
                                    </SectionCard>
                                    <SectionCard title="Chat Count">
                                        <p className="text-3xl font-semibold">{billingLedger.filter((i) => (i.operation || '').includes('plan')).length || '-'}</p>
                                    </SectionCard>
                                </div>
                            </div>
                        )}

                        {settingsTab === 'settings' && (
                            <div className="space-y-5">
                                <SectionCard title="User Info">
                                    <Row label="Name" value={authDisplayName} />
                                    <Row label="Email" value={authUser?.email || 'No email'} />
                                    <Row
                                        label="Theme"
                                        value={(
                                            <div className="inline-flex overflow-hidden rounded-lg border border-[var(--ui-border)]">
                                                <button
                                                    type="button"
                                                    onClick={() => setTheme('light')}
                                                    className={`inline-flex h-8 items-center gap-1 px-3 text-xs ${theme === 'light' ? 'bg-[var(--ui-surface-3)]' : ''}`}
                                                >
                                                    <Sun size={12} />
                                                    Light
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTheme('dark')}
                                                    className={`inline-flex h-8 items-center gap-1 border-l border-[var(--ui-border)] px-3 text-xs ${theme === 'dark' ? 'bg-[var(--ui-surface-3)]' : ''}`}
                                                >
                                                    <Moon size={12} />
                                                    Dark
                                                </button>
                                            </div>
                                        )}
                                    />
                                </SectionCard>

                                <SectionCard title="MCP API Keys">
                                    <p className="mb-3 text-sm text-[var(--ui-text-subtle)]">
                                        Create API keys for AI IDE MCP access. Keep keys secret. Revoking a key cuts access immediately.
                                    </p>

                                    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3 mb-3">
                                        <label className="mb-2 block text-xs uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">Key label</label>
                                        <div className="flex flex-wrap gap-2">
                                            <input
                                                value={mcpKeyLabel}
                                                onChange={(event) => setMcpKeyLabel(event.target.value)}
                                                placeholder="AI IDE"
                                                maxLength={80}
                                                className="h-9 min-w-[220px] flex-1 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-sm outline-none focus:border-emerald-400/60"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void handleCreateMcpApiKey()}
                                                disabled={mcpCreating}
                                                className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
                                            >
                                                {mcpCreating ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                                                {mcpCreating ? 'Creating...' : 'Create key'}
                                            </button>
                                        </div>
                                    </div>

                                    {latestMcpApiKey && (
                                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-300">Copy now - shown once</p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <input
                                                    value={latestMcpApiKey}
                                                    readOnly
                                                    className="h-9 min-w-[220px] flex-1 rounded-md border border-emerald-500/30 bg-black/30 px-3 text-xs text-emerald-100"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => void copyText(latestMcpApiKey, 'MCP key copied')}
                                                    className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-400/50 px-3 text-sm text-emerald-200 hover:bg-emerald-500/15"
                                                >
                                                    <Copy size={14} />
                                                    Copy
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="overflow-x-auto rounded-lg border border-[var(--ui-border)] mb-3">
                                        <table className="min-w-full text-left text-sm">
                                            <thead>
                                                <tr className="text-xs uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Label</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Prefix</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Status</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Last used</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {mcpKeysLoading ? (
                                                    <tr>
                                                        <td colSpan={5} className="px-3 py-6 text-center text-[var(--ui-text-subtle)]">
                                                            <span className="inline-flex items-center gap-2">
                                                                <Loader2 size={14} className="animate-spin" />
                                                                Loading keys...
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ) : mcpApiKeys.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="px-3 py-6 text-center text-[var(--ui-text-subtle)]">
                                                            No MCP API keys yet.
                                                        </td>
                                                    </tr>
                                                ) : mcpApiKeys.map((key) => (
                                                    <tr key={key.keyId}>
                                                        <td className="border-b border-[var(--ui-border)] px-3 py-2">
                                                            <div className="font-medium text-[var(--ui-text)]">{key.label}</div>
                                                            <div className="text-xs text-[var(--ui-text-subtle)]">{new Date(key.createdAt).toLocaleString()}</div>
                                                        </td>
                                                        <td className="border-b border-[var(--ui-border)] px-3 py-2 font-mono text-xs text-[var(--ui-text-subtle)]">{key.keyPrefix}...</td>
                                                        <td className="border-b border-[var(--ui-border)] px-3 py-2">
                                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${key.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                                                                {key.status}
                                                            </span>
                                                        </td>
                                                        <td className="border-b border-[var(--ui-border)] px-3 py-2 text-[var(--ui-text-subtle)]">
                                                            {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                                                        </td>
                                                        <td className="border-b border-[var(--ui-border)] px-3 py-2 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleRevokeMcpApiKey(key.keyId)}
                                                                disabled={key.status !== 'active' || mcpRevokingId !== null}
                                                                className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-500/35 px-2.5 text-xs text-rose-300 hover:bg-rose-500/15 disabled:opacity-50"
                                                            >
                                                                {mcpRevokingId === key.keyId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                                Revoke
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                                        <p className="text-xs uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">AI IDE config</p>
                                        <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-xs text-[var(--ui-text-subtle)]">{`{
  "mcpServers": {
    "eazyui": {
      "url": "http://localhost:3010/mcp",
      "headers": {
        "Authorization": "Bearer <your_mcp_api_key>"
      }
    }
  }
}`}</pre>
                                    </div>
                                </SectionCard>

                                <SectionCard title="Integrations">
                                    <Row
                                        label="Vercel"
                                        value={(
                                            <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--ui-border)] px-3 text-xs hover:bg-[var(--ui-surface-3)]">
                                                <Link2 size={12} />
                                                Connect
                                            </button>
                                        )}
                                    />
                                    <Row
                                        label="Supabase"
                                        value={(
                                            <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--ui-border)] px-3 text-xs hover:bg-[var(--ui-surface-3)]">
                                                <Link2 size={12} />
                                                Connect
                                            </button>
                                        )}
                                    />
                                </SectionCard>

                                <SectionCard title="Account">
                                    <Row
                                        label="Verify email"
                                        value={(
                                            <button
                                                type="button"
                                                onClick={() => void handleSendVerification()}
                                                disabled={verificationBusy}
                                                className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--ui-border)] px-3 text-xs hover:bg-[var(--ui-surface-3)] disabled:opacity-60"
                                            >
                                                <Mail size={12} />
                                                {verificationBusy ? 'Sending...' : 'Send'}
                                            </button>
                                        )}
                                    />
                                    <Row
                                        label="Start new project"
                                        value={(
                                            <button
                                                type="button"
                                                onClick={() => void handleNewProject()}
                                                className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 text-xs text-rose-300 hover:bg-rose-500/20"
                                            >
                                                <AlertTriangle size={12} />
                                                New Project
                                            </button>
                                        )}
                                    />
                                </SectionCard>
                            </div>
                        )}

                        {settingsTab === 'billing' && (
                            <div className="space-y-5">
                                <SectionCard title="Subscription Plan">
                                    <div className="grid gap-3 md:grid-cols-3">
                                        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3 md:col-span-2">
                                            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">Current Plan</p>
                                            <div className="mt-2 flex items-center gap-2">
                                                <span className="text-2xl font-semibold">{currentPlanLabel}</span>
                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${currentPlanStatus === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                                    {currentPlanStatus}
                                                </span>
                                            </div>
                                            <p className="mt-3 text-5xl font-black leading-none tracking-[-0.02em] text-emerald-300">{billingSummary ? billingSummary.balanceCredits.toLocaleString() : '--'}</p>
                                            <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Available Credits</p>
                                            <p className="mt-2 text-sm text-[var(--ui-text-subtle)]">Balance: {creditsBalanceLabel}</p>
                                            <p className="text-sm text-[var(--ui-text-subtle)]">Next reset: {nextResetLabel}</p>
                                        </div>
                                        <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-3">
                                            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">Actions</p>
                                            <div className="mt-2 space-y-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setBillingModal('upgrade')}
                                                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-black hover:bg-emerald-400"
                                                >
                                                    <WalletCards size={14} />
                                                    Upgrade plan
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setBillingModal('purchase')}
                                                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--ui-border)] px-3 text-sm hover:bg-[var(--ui-surface-3)]"
                                                >
                                                    <CreditCard size={14} />
                                                    Buy credits
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleOpenBillingPortal()}
                                                    disabled={billingActionBusy !== null}
                                                    className="inline-flex h-9 w-full items-center justify-center rounded-md border border-[var(--ui-border)] px-3 text-sm hover:bg-[var(--ui-surface-3)] disabled:opacity-60"
                                                >
                                                    {billingActionBusy === 'portal' ? 'Opening...' : 'Payment settings'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </SectionCard>

                                <SectionCard title="How Charging Works">
                                    <div className="space-y-2 text-sm text-[var(--ui-text-subtle)]">
                                        <p>Before generation starts, EazyUI reserves the likely charge for that request.</p>
                                        <p>The fixed operation price is only the minimum floor. On Gemini 3 Pro requests, actual token usage can push the final charge above that floor.</p>
                                        <p className="text-[var(--ui-text)]">If a request is blocked, the error now shows the upfront reserve amount and explains when that reserve is higher than the minimum floor.</p>
                                    </div>
                                </SectionCard>

                                <SectionCard title="Billing History">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-left text-sm">
                                            <thead>
                                                <tr className="text-xs uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Purchase</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Amount</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Date</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2 text-right">Invoice</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {billingHistoryDisplayRows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className="px-3 py-6 text-center text-[var(--ui-text-subtle)]">No purchases yet.</td>
                                                    </tr>
                                                ) : billingHistoryDisplayRows.map((item) => {
                                                    const amount = (item.amountTotal / 100).toLocaleString(undefined, {
                                                        style: 'currency',
                                                        currency: item.currency || 'USD',
                                                    });
                                                    return (
                                                        <tr key={item.id}>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2">
                                                                <div className="font-medium text-[var(--ui-text)]">{item.label}</div>
                                                                <div className="text-xs text-[var(--ui-text-subtle)]">{item.source === 'purchase' ? item.purchase?.purchaseKind : 'legacy'}</div>
                                                            </td>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2 font-semibold text-emerald-400">{amount}</td>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2 text-[var(--ui-text-subtle)]">{new Date(item.createdAt).toLocaleString()}</td>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2 text-right">
                                                                {item.purchase ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void handleDownloadInvoice(item.purchase!)}
                                                                        disabled={invoiceBusyId !== null}
                                                                        className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--ui-border)] px-2.5 text-xs hover:bg-[var(--ui-surface-3)] disabled:opacity-60"
                                                                    >
                                                                        {invoiceBusyId === item.purchase.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                                                        {invoiceBusyId === item.purchase.id ? 'Generating...' : 'Invoice'}
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-xs text-[var(--ui-text-subtle)]">N/A</span>
                                                                )}
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

                        {settingsTab === 'usage' && (
                            <div className="space-y-5">
                                <SectionCard title="Usage Summary">
                                    <p className="text-sm text-[var(--ui-text-subtle)]">
                                        You are on {billingSummary?.planLabel || 'Free Plan'}. Usage resets in {daysToReset ?? '--'} days {resetAt ? `on ${resetAt.toLocaleString()}` : ''}.
                                    </p>
                                    <p className="mt-4 text-5xl font-black leading-none tracking-[-0.02em] text-emerald-300">
                                        {billingSummary ? billingSummary.balanceCredits.toLocaleString() : '--'}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Current Credit Balance</p>
                                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--ui-surface-3)]">
                                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${usagePct}%` }} />
                                    </div>
                                    <p className="mt-2 text-xs text-[var(--ui-text-subtle)]">{usedCredits.toLocaleString()} / {planCreditCap.toLocaleString()} credits used</p>
                                </SectionCard>
                                <SectionCard title="Credit Activity">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {([1, 7, 30, 90] as const).map((days) => (
                                            <button
                                                key={days}
                                                type="button"
                                                onClick={() => setUsageDaysFilter(days)}
                                                className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition-colors ${
                                                    usageDaysFilter === days
                                                        ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-300'
                                                        : 'border-[var(--ui-border)] text-[var(--ui-text-subtle)] hover:bg-[var(--ui-surface-3)]'
                                                }`}
                                            >
                                                {days === 1 ? 'Today' : `${days} days`}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="mt-3 text-sm text-[var(--ui-text-subtle)]">
                                        {usageCreditsInWindow.toLocaleString()} credits deducted in {usageFilterLabel} across {usageActivityRows.length} events.
                                    </p>
                                    <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--ui-border)]">
                                        <table className="min-w-full text-left text-sm">
                                            <thead>
                                                <tr className="text-xs uppercase tracking-[0.08em] text-[var(--ui-text-subtle)]">
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Time</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Action</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Request</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Model</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Tokens</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2">Request ID</th>
                                                    <th className="border-b border-[var(--ui-border)] px-3 py-2 text-right">Deducted</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {billingLoading ? (
                                                    <tr>
                                                        <td colSpan={7} className="px-3 py-6 text-center text-[var(--ui-text-subtle)]">
                                                            <span className="inline-flex items-center gap-2">
                                                                <Loader2 size={14} className="animate-spin" />
                                                                Loading usage activity...
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ) : usageActivityRows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="px-3 py-6 text-center text-[var(--ui-text-subtle)]">
                                                            No usage activity in this period.
                                                        </td>
                                                    </tr>
                                                ) : usageActivityRows.map((row) => {
                                                    return (
                                                        <tr key={row.item.id}>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2 text-[var(--ui-text-subtle)]">
                                                                {new Date(row.item.createdAt).toLocaleString()}
                                                            </td>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2">
                                                                <div className="font-medium text-[var(--ui-text)]">{row.actionLabel}</div>
                                                                <div className="text-xs text-[var(--ui-text-subtle)]">
                                                                    {row.metadataReason || row.item.projectId || 'Usage event'}
                                                                </div>
                                                                <div className="mt-1 text-[11px] text-[var(--ui-text-subtle)]">
                                                                    {[
                                                                        row.reserveCredits !== null ? `Reserve ${row.reserveCredits}` : null,
                                                                        row.minimumFloorCredits !== null ? `Floor ${row.minimumFloorCredits}` : null,
                                                                        row.finalChargedCredits !== null ? `Final ${row.finalChargedCredits}` : null,
                                                                        row.pricingMode ? row.pricingMode.replace(/_/g, ' ') : null,
                                                                    ].filter(Boolean).join(' · ') || 'No billing detail'}
                                                                </div>
                                                            </td>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2 text-[var(--ui-text-subtle)]">
                                                                {row.requestPreview ? (
                                                                    <span className="block max-w-[320px] whitespace-normal break-words" title={row.requestPreview}>
                                                                        {row.requestPreview}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[var(--ui-text-subtle)]">-</span>
                                                                )}
                                                            </td>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2 text-[var(--ui-text-subtle)]">
                                                                {row.modelName}
                                                            </td>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2 text-[var(--ui-text-subtle)]">
                                                                {row.tokensUsed !== null ? row.tokensUsed.toLocaleString() : '-'}
                                                            </td>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2 text-[var(--ui-text-subtle)]">
                                                                <span className="block max-w-[220px] truncate whitespace-nowrap" title={row.requestIdentifier}>
                                                                    {row.requestIdentifier}
                                                                </span>
                                                            </td>
                                                            <td className="border-b border-[var(--ui-border)] px-3 py-2 text-right font-semibold text-rose-300">
                                                                <div>-{row.deductedCredits.toLocaleString()}</div>
                                                                {row.reserveCredits !== null && row.reserveCredits !== row.deductedCredits ? (
                                                                    <div className="text-[11px] font-normal text-[var(--ui-text-subtle)]">
                                                                        reserved {row.reserveCredits.toLocaleString()}
                                                                    </div>
                                                                ) : null}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </SectionCard>
                                <SectionCard title="On-demand">
                                    <Row
                                        label="Enabled"
                                        value={
                                            <button type="button" onClick={() => setOnDemandUsage((v) => !v)} className={`inline-flex h-8 items-center rounded-md px-3 text-xs ${onDemandUsage ? 'bg-emerald-500 text-black' : 'border border-[var(--ui-border)]'}`}>
                                                {onDemandUsage ? 'On' : 'Off'}
                                            </button>
                                        }
                                    />
                                </SectionCard>
                            </div>
                        )}
                    </div>
                </main>
            </div>
            {billingModal && (
                <div className="absolute inset-0 z-40 grid place-items-center bg-black/60 p-4">
                    <div className="w-full max-w-[560px] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                        <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-5 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-[var(--ui-text)]">
                                    {billingModal === 'upgrade' ? 'Upgrade Subscription' : 'Purchase Credits'}
                                </h3>
                                <p className="text-sm text-[var(--ui-text-subtle)]">
                                    {billingModal === 'upgrade'
                                        ? 'Choose a plan that fits your usage.'
                                        : 'Buy one-time credits that stack with your current balance.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setBillingModal(null)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--ui-border)] hover:bg-[var(--ui-surface-3)]"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="space-y-3 p-5">
                            {billingModal === 'upgrade' ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => void handleBillingCheckout('pro')}
                                        disabled={billingActionBusy !== null}
                                        className="flex w-full items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-left hover:bg-[var(--ui-surface-3)] disabled:opacity-60"
                                    >
                                        <div>
                                            <p className="text-sm font-semibold text-[var(--ui-text)]">Pro Plan</p>
                                            <p className="text-xs text-[var(--ui-text-subtle)]">3,000 monthly credits + rollover</p>
                                        </div>
                                        <span className="text-xs font-semibold text-emerald-300">{billingActionBusy === 'pro' ? 'Opening...' : 'Choose Pro'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleBillingCheckout('team')}
                                        disabled={billingActionBusy !== null}
                                        className="flex w-full items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-left hover:bg-[var(--ui-surface-3)] disabled:opacity-60"
                                    >
                                        <div>
                                            <p className="text-sm font-semibold text-[var(--ui-text)]">Team Plan</p>
                                            <p className="text-xs text-[var(--ui-text-subtle)]">15,000 monthly credits + rollover</p>
                                        </div>
                                        <span className="text-xs font-semibold text-emerald-300">{billingActionBusy === 'team' ? 'Opening...' : 'Choose Team'}</span>
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handleBillingCheckout('topup_1000')}
                                    disabled={billingActionBusy !== null}
                                    className="flex w-full items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-left hover:bg-[var(--ui-surface-3)] disabled:opacity-60"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-[var(--ui-text)]">Top-up 1,000 Credits</p>
                                        <p className="text-xs text-[var(--ui-text-subtle)]">One-time purchase for additional generation capacity</p>
                                    </div>
                                    <span className="text-xs font-semibold text-emerald-300">{billingActionBusy === 'topup_1000' ? 'Opening...' : 'Buy Now'}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
    return <section className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"><h3 className="mb-3 text-lg font-semibold">{title}</h3>{children}</section>;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
    return <div className="flex items-center justify-between gap-3 border-t border-[var(--ui-border)] py-2 first:border-t-0 first:pt-0"><span className="text-sm text-[var(--ui-text-subtle)]">{label}</span><div>{value}</div></div>;
}
