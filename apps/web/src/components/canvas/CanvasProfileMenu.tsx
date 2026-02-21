import { useEffect, useRef, useState } from 'react';
import { AppWindow, Braces, Check, ChevronDown, CreditCard, Download, Files, FolderOpen, Image, Loader2, LogOut, Mail, Moon, Palette, Save, Search, Settings, Shield, Sun, User as UserIcon, UserCircle2, Users, X } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { useCanvasStore, useChatStore, useDesignStore, useEditStore, useHistoryStore, useProjectStore, useUiStore } from '../../stores';
import { apiClient } from '../../api/client';
import { copyScreensCodeToClipboard, exportScreensAsImagesZip, exportScreensAsZip, exportScreensToFigmaClipboard, getExportTargetScreens } from '../../utils/exportScreens';
import { observeAuthState, sendCurrentUserVerificationEmail, signOutCurrentUser } from '../../lib/auth';

type SettingsTab = 'profile' | 'appearance' | 'workspace' | 'team' | 'billing' | 'applications' | 'api' | 'security';

const NAV_ITEMS: Array<{ key: SettingsTab; label: string; icon: any }> = [
    { key: 'profile', label: 'Profile', icon: UserIcon },
    { key: 'appearance', label: 'Appearance', icon: Palette },
    { key: 'workspace', label: 'Workspace', icon: FolderOpen },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'billing', label: 'Billing', icon: CreditCard },
    { key: 'applications', label: 'Applications', icon: AppWindow },
    { key: 'api', label: 'API', icon: Braces },
    { key: 'security', label: 'Security', icon: Shield },
];

function resolveUserPhotoUrl(user: FirebaseUser | null): string | null {
    if (!user) return null;
    if (user.photoURL) return user.photoURL;
    const providerPhoto = user.providerData.find((p) => Boolean(p?.photoURL))?.photoURL;
    if (providerPhoto) return providerPhoto;
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=111827&color=ffffff&size=128&rounded=true`;
}

export function CanvasProfileMenu() {
    const { theme, setTheme, pushToast, removeToast, showInspector } = useUiStore();
    const { spec, reset: resetDesign } = useDesignStore();
    const { doc, reset: resetCanvas } = useCanvasStore();
    const { messages, clearMessages } = useChatStore();
    const { exitEdit } = useEditStore();
    const { clearHistory } = useHistoryStore();
    const { projectId, lastSavedAt, dirty, isSaving, autosaveEnabled, isHydrating, markSaved, setSaving, resetProjectState } = useProjectStore();

    const [openProfile, setOpenProfile] = useState(false);
    const [openExport, setOpenExport] = useState(false);
    const [openSettingsModal, setOpenSettingsModal] = useState(false);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>('profile');
    const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
    const [verificationBusy, setVerificationBusy] = useState(false);
    const [transparentSidebar, setTransparentSidebar] = useState(true);
    const [sidebarFeature, setSidebarFeature] = useState<'recent' | 'favorites' | 'activity'>('recent');
    const [tableView, setTableView] = useState<'default' | 'compact'>('default');
    const menuRef = useRef<HTMLDivElement | null>(null);

    const { screens: exportScreens, scope } = getExportTargetScreens(spec, {
        selectedBoardId: doc.selection.selectedBoardId,
        selectedNodeIds: doc.selection.selectedNodeIds,
    });
    const selectionLabel = scope === 'selected' ? `${exportScreens.length} selected` : `${exportScreens.length} total`;
    const projectStatus = isHydrating ? 'Loading project...' : isSaving ? (autosaveEnabled ? 'Auto save' : 'Saving...') : dirty ? 'Unsaved changes' : lastSavedAt ? 'Saved' : 'Not saved yet';
    const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'You';
    const authPhotoUrl = resolveUserPhotoUrl(authUser);

    useEffect(() => {
        if (!openProfile && !openExport) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setOpenProfile(false);
                setOpenExport(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [openProfile, openExport]);

    useEffect(() => {
        const unsub = observeAuthState((user) => setAuthUser(user));
        return () => unsub();
    }, []);

    const withScreens = async (loadingTitle: string, action: () => Promise<void>) => {
        if (!spec || exportScreens.length === 0) {
            pushToast({ kind: 'error', title: 'No screens to export', message: 'Generate or select screens first.' });
            return;
        }
        const loadingToastId = pushToast({ kind: 'loading', title: loadingTitle, message: `Processing ${selectionLabel}...`, durationMs: 0 });
        try { await action(); setOpenExport(false); } catch (error) {
            pushToast({ kind: 'error', title: 'Export failed', message: (error as Error).message || 'An unexpected error occurred.' });
        } finally { removeToast(loadingToastId); }
    };

    const handleSaveNow = async () => {
        if (!spec || isSaving) return;
        const savingToastId = pushToast({
            kind: 'loading',
            title: 'Saving canvas',
            message: 'Persisting screens, chat, and canvas state...',
            durationMs: 0,
        });
        try {
            setSaving(true);
            const saved = await apiClient.save({ projectId: projectId || undefined, designSpec: spec as any, canvasDoc: doc, chatState: { messages } });
            markSaved(saved.projectId, saved.savedAt);
            pushToast({ kind: 'success', title: 'Project saved', message: `Project ${saved.projectId.slice(0, 8)} updated.` });
        } catch (error) {
            setSaving(false);
            pushToast({ kind: 'error', title: 'Save failed', message: (error as Error).message || 'Unable to save project.' });
        } finally {
            removeToast(savingToastId);
        }
    };

    const handleNewProject = () => {
        const proceed = !dirty || window.confirm('Discard unsaved changes and start a new project?');
        if (!proceed) return;
        resetDesign(); resetCanvas(); exitEdit(); clearMessages(); clearHistory(); resetProjectState();
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
        setOpenSettingsModal(true);
    };

    return (
        <>
            <div ref={menuRef} className="pointer-events-auto relative flex items-center gap-2">
                <div className="canvas-profile-trigger-2 px-2.5 gap-2">
                    <button
                        type="button"
                        onClick={() => void handleSaveNow()}
                        disabled={isSaving}
                        className="canvas-profile-avatar"
                        title={isSaving ? 'Saving project...' : 'Save project'}
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    </button>
                    <span className={`text-[11px] font-medium ${!dirty && !isSaving && !!lastSavedAt ? 'text-emerald-300' : 'text-[var(--ui-text-subtle)]'}`}>{projectStatus}</span>
                </div>

                <div className="relative">
                    <button type="button" onClick={() => { setOpenExport((v) => !v); setOpenProfile(false); }} className="canvas-profile-trigger" title="Export options">
                        <div className="canvas-profile-avatar"><Download size={16} /></div>
                        <div className="canvas-profile-meta"><span className="canvas-profile-name">Export</span><span className="canvas-profile-role">{selectionLabel}</span></div>
                        <ChevronDown size={14} className={`transition-transform ${openExport ? 'rotate-180' : ''}`} />
                    </button>
                    {openExport && (
                        <div className="canvas-profile-menu">
                            <button type="button" className="canvas-profile-menu-item" onClick={() => withScreens('Exporting ZIP', async () => { const { filename } = exportScreensAsZip(exportScreens, spec?.name || 'eazyui-design'); pushToast({ kind: 'success', title: 'ZIP exported', message: `${filename} (${selectionLabel})` }); })}><Download size={14} /><span>Export as ZIP</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => withScreens('Rendering images', async () => { const { filename } = await exportScreensAsImagesZip(exportScreens, spec?.name || 'eazyui-design'); pushToast({ kind: 'success', title: 'Images exported', message: `${filename} (${selectionLabel})` }); })}><Image size={14} /><span>Export as Images</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => withScreens('Copying code', async () => { await copyScreensCodeToClipboard(exportScreens); pushToast({ kind: 'success', title: 'Code copied', message: `Copied ${selectionLabel} to clipboard.` }); })}><Files size={14} /><span>Copy Code to Clipboard</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => withScreens('Preparing Figma export', async () => { await exportScreensToFigmaClipboard(exportScreens); pushToast({ kind: 'guide', title: 'Ready for Figma', message: 'Open Figma and press Ctrl+V to paste.', durationMs: 6000 }); })}><Settings size={14} /><span>Export to Figma</span></button>
                        </div>
                    )}
                </div>

                <div className="relative">
                    <button type="button" onClick={() => { setOpenProfile((v) => !v); setOpenExport(false); }} className="h-11 w-11 rounded-full border border-[var(--ui-canvas-profile-border)] bg-[var(--ui-canvas-profile-bg)] inline-flex items-center justify-center hover:bg-[var(--ui-canvas-profile-hover)] transition-colors" title="Profile and settings">
                        <div className="canvas-profile-avatar canvas-profile-avatar-lg">{authPhotoUrl ? <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full rounded-full object-cover" /> : <UserCircle2 size={16} />}</div>
                    </button>
                    {openProfile && (
                        <div className="canvas-profile-menu">
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('profile')}><UserIcon size={14} /><span>Profile</span></button>
                            {!authUser?.emailVerified && <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('profile')}><Mail size={14} /><span>Verify Email</span></button>}
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('workspace')}><FolderOpen size={14} /><span>Project Workspace</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('workspace')}><Settings size={14} /><span>New Project</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('appearance')}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}<span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('appearance')}><Settings size={14} /><span>{showInspector ? 'Hide' : 'Show'} Inspector</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('appearance')}><Save size={14} /><span>{autosaveEnabled ? 'Disable' : 'Enable'} Autosave</span></button>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => openSettingsAt('profile')}><LogOut size={14} /><span>Log Out</span></button>
                        </div>
                    )}
                </div>
            </div>

            {openSettingsModal && authUser && (
                <div className="fixed inset-0 z-[1300] bg-black/70 backdrop-blur-[2px] p-4">
                    <div className="h-full w-full rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)] shadow-2xl overflow-hidden flex">
                        <aside className="w-[280px] border-r border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-5 flex flex-col">
                            <div className="flex items-center gap-3 px-2">
                                <div className="h-9 w-9 rounded-full overflow-hidden border border-[var(--ui-border)] bg-[var(--ui-surface-3)]">{authPhotoUrl ? <img src={authPhotoUrl} alt={authDisplayName} className="h-full w-full object-cover" /> : <div className="h-full w-full inline-flex items-center justify-center text-[var(--ui-text)]"><UserCircle2 size={16} /></div>}</div>
                                <div className="min-w-0"><div className="text-sm font-semibold text-[var(--ui-text)] truncate">{authDisplayName}</div><div className="text-xs text-[var(--ui-text-subtle)] truncate">{authUser.email || 'No email'}</div></div>
                            </div>
                            <div className="mt-4 px-2"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-subtle)]" /><input value="" readOnly placeholder="Search" className="h-9 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)] pl-9 pr-3 text-sm text-[var(--ui-text-subtle)]" /></div></div>
                            <div className="mt-4 space-y-1">
                                {NAV_ITEMS.map((item) => {
                                    const Icon = item.icon;
                                    const active = settingsTab === item.key;
                                    return <button key={item.key} type="button" onClick={() => setSettingsTab(item.key)} className={`w-full h-10 rounded-xl px-3 text-sm inline-flex items-center gap-2.5 transition-colors ${active ? 'bg-indigo-500/20 text-[var(--ui-text)] border border-indigo-400/40' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)]'}`}><Icon size={15} /><span>{item.label}</span></button>;
                                })}
                            </div>
                        </aside>

                        <section className="flex-1 min-w-0 flex flex-col bg-[var(--ui-surface-1)]">
                            <header className="h-16 px-6 border-b border-[var(--ui-border)] flex items-center justify-between">
                                <div className="text-[32px] leading-none font-semibold text-[var(--ui-text)]">{settingsTab[0].toUpperCase()}{settingsTab.slice(1)} settings</div>
                                <button type="button" onClick={() => setOpenSettingsModal(false)} className="h-10 w-10 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]" title="Close settings"><X size={16} className="mx-auto" /></button>
                            </header>

                            <div className="flex-1 overflow-y-auto px-6 py-6">
                                {settingsTab === 'profile' && (
                                    <div className="max-w-[840px] space-y-4">
                                        <Field label="Display name" value={authDisplayName} />
                                        <Field label="Email" value={authUser.email || 'No email'} />
                                        <Field label="UID" value={authUser.uid} />
                                        {!authUser.emailVerified && (
                                            <button
                                                type="button"
                                                onClick={() => void handleSendVerification()}
                                                disabled={verificationBusy}
                                                className="h-10 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)] disabled:opacity-60"
                                            >
                                                {verificationBusy ? 'Sending verification...' : 'Send verification email'}
                                            </button>
                                        )}
                                        <button type="button" onClick={() => void handleSignOut()} className="h-10 rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm text-red-200 hover:bg-red-500/20">Log out</button>
                                    </div>
                                )}
                                {settingsTab === 'appearance' && (
                                    <div className="max-w-[980px] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)]">
                                        <div className="border-b border-[var(--ui-border)] px-5 py-5">
                                            <div className="text-xl font-semibold text-[var(--ui-text)]">Appearance</div>
                                            <div className="mt-1 text-sm text-[var(--ui-text-subtle)]">Change how your workspace looks and behaves.</div>
                                        </div>

                                        <div className="border-b border-[var(--ui-border)] px-5 py-5">
                                            <div className="text-sm font-semibold text-[var(--ui-text)]">Interface theme</div>
                                            <div className="mt-0.5 text-xs text-[var(--ui-text-subtle)]">Select or customize your UI theme.</div>
                                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                <ThemePreviewCard title="System preference" tone={theme} active={false} onClick={() => { }} />
                                                <ThemePreviewCard title="Light" tone="light" active={theme === 'light'} onClick={() => setTheme('light')} />
                                                <ThemePreviewCard title="Dark" tone="dark" active={theme === 'dark'} onClick={() => setTheme('dark')} />
                                            </div>
                                        </div>

                                        <div className="border-b border-[var(--ui-border)] px-5 py-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <div>
                                                    <div className="text-sm font-semibold text-[var(--ui-text)]">Transparent sidebar</div>
                                                    <div className="mt-0.5 text-xs text-[var(--ui-text-subtle)]">Make the workspace sidebar slightly translucent.</div>
                                                </div>
                                                <ToggleSwitch checked={transparentSidebar} onChange={setTransparentSidebar} />
                                            </div>
                                        </div>

                                        <div className="border-b border-[var(--ui-border)] px-5 py-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <div>
                                                    <div className="text-sm font-semibold text-[var(--ui-text)]">Sidebar feature</div>
                                                    <div className="mt-0.5 text-xs text-[var(--ui-text-subtle)]">Choose what shows by default in sidebar shortcuts.</div>
                                                </div>
                                                <select
                                                    value={sidebarFeature}
                                                    onChange={(event) => setSidebarFeature(event.target.value as 'recent' | 'favorites' | 'activity')}
                                                    className="h-10 min-w-[220px] rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-sm text-[var(--ui-text)]"
                                                >
                                                    <option value="recent">Recent projects</option>
                                                    <option value="favorites">Favorites</option>
                                                    <option value="activity">Recent activity</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="px-5 py-5">
                                            <div className="text-sm font-semibold text-[var(--ui-text)]">Tables view</div>
                                            <div className="mt-0.5 text-xs text-[var(--ui-text-subtle)]">Adjust information density in table-like views.</div>
                                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <TableViewCard title="Default" compact={false} active={tableView === 'default'} onClick={() => setTableView('default')} />
                                                <TableViewCard title="Compact" compact active={tableView === 'compact'} onClick={() => setTableView('compact')} />
                                            </div>
                                        </div>

                                        <div className="border-t border-[var(--ui-border)] px-5 py-4">
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenSettingsModal(false)}
                                                    className="h-10 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)]"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        pushToast({ kind: 'success', title: 'Appearance saved', message: 'Your visual preferences were updated.' });
                                                        setOpenSettingsModal(false);
                                                    }}
                                                    className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500"
                                                >
                                                    Save changes
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {settingsTab === 'workspace' && (
                                    <div className="max-w-[840px] flex flex-wrap gap-3">
                                        <button type="button" onClick={() => { window.history.pushState({}, '', '/app/projects'); window.dispatchEvent(new PopStateEvent('popstate')); setOpenSettingsModal(false); }} className="h-10 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)]">Open Project Workspace</button>
                                        <button type="button" onClick={handleNewProject} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm text-white hover:bg-indigo-500">New Project</button>
                                        <button type="button" onClick={() => void handleSaveNow()} className="h-10 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-sm text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)]">Save now</button>
                                    </div>
                                )}
                                {['team', 'billing', 'applications', 'api', 'security'].includes(settingsTab) && (
                                    <div className="max-w-[840px] rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-6 text-sm text-[var(--ui-text-subtle)]">This section is ready for expanded settings.</div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">{label}</div>
            <div className="mt-1 text-[13px] text-[var(--ui-text)] break-all">{value}</div>
        </div>
    );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`h-7 w-12 rounded-full border transition-colors ${checked ? 'border-indigo-500/80 bg-indigo-600' : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)]'}`}
        >
            <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
        </button>
    );
}

function ThemePreviewCard({ title, tone, active, onClick }: { title: string; tone: 'light' | 'dark'; active: boolean; onClick: () => void }) {
    const canvasTone = tone === 'dark'
        ? 'bg-[#0f1116] border-[#232836]'
        : 'bg-[#f7f8fc] border-[#dfe4ef]';
    const topBarTone = tone === 'dark' ? 'bg-[#161a24]' : 'bg-[#eef2f8]';
    const leftPaneTone = tone === 'dark' ? 'bg-[#1a1f2b]' : 'bg-[#e8edf5]';
    const lineTone = tone === 'dark' ? 'bg-[#2e3648]' : 'bg-[#cfd8e8]';

    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative rounded-xl border p-2 text-left transition-colors ${active ? 'border-indigo-500/80 bg-indigo-500/10' : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)] hover:bg-[var(--ui-surface-3)]'}`}
        >
            {active && (
                <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white">
                    <Check size={12} />
                </span>
            )}
            <div className={`h-[92px] overflow-hidden rounded-lg border ${canvasTone}`}>
                <div className={`h-4 w-full ${topBarTone}`} />
                <div className="flex h-[calc(100%-16px)]">
                    <div className={`w-[30%] border-r ${leftPaneTone}`} />
                    <div className="flex-1 p-2">
                        <div className={`mb-1 h-2.5 w-[70%] rounded ${lineTone}`} />
                        <div className={`mb-1 h-2.5 w-[85%] rounded ${lineTone}`} />
                        <div className={`h-2.5 w-[58%] rounded ${lineTone}`} />
                    </div>
                </div>
            </div>
            <div className="mt-2 text-sm font-medium text-[var(--ui-text)]">{title}</div>
        </button>
    );
}

function TableViewCard({ title, compact, active, onClick }: { title: string; compact: boolean; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative rounded-xl border p-2 text-left transition-colors ${active ? 'border-indigo-500/80 bg-indigo-500/10' : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)] hover:bg-[var(--ui-surface-3)]'}`}
        >
            {active && (
                <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white">
                    <Check size={12} />
                </span>
            )}
            <div className="h-[92px] overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-2">
                <div className="space-y-1">
                    {Array.from({ length: compact ? 6 : 4 }).map((_, idx) => (
                        <div key={idx} className={`flex items-center gap-2 rounded ${compact ? 'h-2.5' : 'h-4'}`}>
                            <span className={`rounded-full bg-[var(--ui-surface-4)] ${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
                            <span className="h-2 flex-1 rounded bg-[var(--ui-surface-4)]" />
                            <span className={`rounded bg-indigo-500/35 ${compact ? 'h-2 w-8' : 'h-2.5 w-10'}`} />
                        </div>
                    ))}
                </div>
            </div>
            <div className="mt-2 text-sm font-medium text-[var(--ui-text)]">{title}</div>
        </button>
    );
}
