import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Files, FolderOpen, Image, Loader2, LogOut, Mail, Moon, Save, Settings, Sun, Trash2, User as UserIcon, UserCircle2, X } from 'lucide-react';
import { createDefaultCanvasDoc, type CanvasDoc } from '@eazyui/shared';
import type { User as FirebaseUser } from 'firebase/auth';
import { useCanvasStore, useChatStore, useDesignStore, useEditStore, useHistoryStore, useProjectStore, useUiStore } from '../../stores';
import { apiClient } from '../../api/client';
import { copyScreensCodeToClipboard, exportScreensAsImagesZip, exportScreensAsZip, exportScreensToFigmaClipboard, getExportTargetScreens } from '../../utils/exportScreens';
import { observeAuthState, sendCurrentUserVerificationEmail, signOutCurrentUser } from '../../lib/auth';

function ensureCanvasDocFromProject(canvasDoc: unknown, designSpec: { screens: Array<{ screenId: string; width: number; height: number }> }): CanvasDoc {
    if (canvasDoc && typeof canvasDoc === 'object' && Array.isArray((canvasDoc as CanvasDoc).boards)) {
        return canvasDoc as CanvasDoc;
    }
    const doc = createDefaultCanvasDoc(`doc-${Date.now()}`);
    const boards = designSpec.screens.map((screen, index) => ({
        boardId: `board-${screen.screenId}`,
        screenId: screen.screenId,
        x: 100 + index * (screen.width + 80),
        y: 100,
        width: screen.width,
        height: screen.height,
        deviceFrame: 'none' as const,
        locked: false,
        visible: true,
    }));
    return {
        ...doc,
        boards,
    };
}

function formatSavedAt(value: string | null): string {
    if (!value) return 'Not saved yet';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

function resolveUserPhotoUrl(user: FirebaseUser | null): string | null {
    if (!user) return null;
    if (user.photoURL) return user.photoURL;
    const providerPhoto = user.providerData.find((p) => Boolean(p?.photoURL))?.photoURL;
    if (providerPhoto) return providerPhoto;
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=111827&color=ffffff&size=128&rounded=true`;
}

export function CanvasProfileMenu() {
    const { theme, toggleTheme, pushToast, removeToast, showInspector, toggleInspector } = useUiStore();
    const { spec, reset: resetDesign } = useDesignStore();
    const { doc, reset: resetCanvas } = useCanvasStore();
    const { messages, clearMessages, hydrateSession } = useChatStore();
    const { exitEdit } = useEditStore();
    const { clearHistory } = useHistoryStore();
    const {
        projectId,
        lastSavedAt,
        dirty,
        isSaving,
        autosaveEnabled,
        isHydrating,
        setHydrating,
        setAutosaveEnabled,
        markSaved,
        setSaving,
        resetProjectState,
    } = useProjectStore();

    const [openProfile, setOpenProfile] = useState(false);
    const [openExport, setOpenExport] = useState(false);
    const [openProject, setOpenProject] = useState(false);
    const [openProjectsModal, setOpenProjectsModal] = useState(false);
    const [openProfileModal, setOpenProfileModal] = useState(false);
    const [projects, setProjects] = useState<Array<{ id: string; name: string; updatedAt: string }>>([]);
    const [loadingProjects, setLoadingProjects] = useState(false);
    const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
    const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
    const [verificationBusy, setVerificationBusy] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const { screens: exportScreens, scope } = getExportTargetScreens(spec, {
        selectedBoardId: doc.selection.selectedBoardId,
        selectedNodeIds: doc.selection.selectedNodeIds,
    });
    const selectionLabel = scope === 'selected' ? `${exportScreens.length} selected` : `${exportScreens.length} total`;
    const projectLabel = projectId ? projectId.slice(0, 8) : 'Unsaved';
    const projectStatus = isHydrating
        ? 'Loading project...'
        : isSaving
            ? 'Saving...'
            : dirty
                ? 'Unsaved changes'
                : lastSavedAt
                    ? `Saved ${formatSavedAt(lastSavedAt)}`
                    : 'Not saved yet';
    const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'You';
    const authPhotoUrl = resolveUserPhotoUrl(authUser);

    useEffect(() => {
        if (!openProfile && !openExport && !openProject) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setOpenProfile(false);
                setOpenExport(false);
                setOpenProject(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [openProfile, openExport, openProject]);

    useEffect(() => {
        const unsub = observeAuthState((user) => setAuthUser(user));
        return () => unsub();
    }, []);

    const refreshProjects = async () => {
        setLoadingProjects(true);
        try {
            const list = await apiClient.listProjects();
            setProjects(list.projects || []);
        } catch (error) {
            pushToast({
                kind: 'error',
                title: 'Failed to load projects',
                message: (error as Error).message || 'Unable to fetch projects.',
            });
        } finally {
            setLoadingProjects(false);
        }
    };

    useEffect(() => {
        if (!openProjectsModal) return;
        void refreshProjects();
    }, [openProjectsModal]);

    const withScreens = async (loadingTitle: string, action: () => Promise<void>) => {
        if (!spec || exportScreens.length === 0) {
            pushToast({
                kind: 'error',
                title: 'No screens to export',
                message: 'Generate or select screens first.',
            });
            return;
        }
        const loadingToastId = pushToast({
            kind: 'loading',
            title: loadingTitle,
            message: `Processing ${selectionLabel}...`,
            durationMs: 0,
        });
        try {
            await action();
            setOpenExport(false);
        } catch (error) {
            pushToast({
                kind: 'error',
                title: 'Export failed',
                message: (error as Error).message || 'An unexpected error occurred.',
            });
        } finally {
            removeToast(loadingToastId);
        }
    };

    const handleSaveNow = async () => {
        if (!spec) {
            pushToast({
                kind: 'error',
                title: 'Nothing to save',
                message: 'Generate a design first.',
            });
            return;
        }

        try {
            setSaving(true);
            const saved = await apiClient.save({
                projectId: projectId || undefined,
                designSpec: spec as any,
                canvasDoc: doc,
                chatState: { messages },
            });
            markSaved(saved.projectId, saved.savedAt);
            pushToast({
                kind: 'success',
                title: 'Project saved',
                message: `Project ${saved.projectId.slice(0, 8)} updated.`,
            });
        } catch (error) {
            setSaving(false);
            pushToast({
                kind: 'error',
                title: 'Save failed',
                message: (error as Error).message || 'Unable to save project.',
            });
        }
    };

    const handleLoadProject = async (id: string) => {
        setBusyProjectId(id);
        setHydrating(true);
        try {
            const project = await apiClient.getProject(id);
            useDesignStore.getState().setSpec(project.designSpec as any);
            useCanvasStore.getState().setDoc(ensureCanvasDocFromProject(project.canvasDoc, project.designSpec as any));
            hydrateSession(project.chatState as any);
            exitEdit();
            clearHistory();
            markSaved(project.projectId, project.updatedAt);
            setOpenProjectsModal(false);
            setOpenProject(false);
            pushToast({
                kind: 'success',
                title: 'Project loaded',
                message: `${project.designSpec.name || 'Project'} is ready.`,
            });
        } catch (error) {
            pushToast({
                kind: 'error',
                title: 'Load failed',
                message: (error as Error).message || 'Unable to load project.',
            });
        } finally {
            setHydrating(false);
            setBusyProjectId(null);
        }
    };

    const handleDeleteProject = async (id: string) => {
        const confirmed = window.confirm('Delete this project permanently?');
        if (!confirmed) return;
        setBusyProjectId(id);
        try {
            await apiClient.deleteProject(id);
            if (id === projectId) {
                resetProjectState();
            }
            await refreshProjects();
            pushToast({
                kind: 'success',
                title: 'Project deleted',
                message: `Project ${id.slice(0, 8)} removed.`,
            });
        } catch (error) {
            pushToast({
                kind: 'error',
                title: 'Delete failed',
                message: (error as Error).message || 'Unable to delete project.',
            });
        } finally {
            setBusyProjectId(null);
        }
    };

    const handleNewProject = () => {
        const proceed = !dirty || window.confirm('Discard unsaved changes and start a new project?');
        if (!proceed) return;
        resetDesign();
        resetCanvas();
        exitEdit();
        clearMessages();
        clearHistory();
        resetProjectState();
        setOpenProject(false);
        pushToast({
            kind: 'info',
            title: 'New workspace',
            message: 'Started a fresh project.',
        });
    };

    const handleSignOut = async () => {
        try {
            await signOutCurrentUser();
            setOpenProfile(false);
            window.history.pushState({}, '', '/login');
            window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (error) {
            pushToast({
                kind: 'error',
                title: 'Sign out failed',
                message: (error as Error).message || 'Could not sign out.',
            });
        }
    };

    const handleSendVerification = async () => {
        try {
            setVerificationBusy(true);
            await sendCurrentUserVerificationEmail();
            pushToast({
                kind: 'info',
                title: 'Verification email sent',
                message: 'Check your inbox to verify your account.',
            });
        } catch (error) {
            pushToast({
                kind: 'error',
                title: 'Verification failed',
                message: (error as Error).message || 'Could not send verification email.',
            });
        } finally {
            setVerificationBusy(false);
        }
    };

    const sortedProjects = useMemo(
        () => [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
        [projects]
    );

    return (
        <>
            <div ref={menuRef} className="pointer-events-auto relative flex items-center gap-2">
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setOpenProject((v) => !v);
                            setOpenExport(false);
                            setOpenProfile(false);
                        }}
                        className="canvas-profile-trigger"
                        title="Project workspace"
                    >
                        <div className="canvas-profile-avatar">
                            <Save size={16} />
                        </div>
                        <div className="canvas-profile-meta">
                            <span className="canvas-profile-name">Project</span>
                            <span className="canvas-profile-role">{projectLabel}</span>
                        </div>
                        <ChevronDown size={14} className={`transition-transform ${openProject ? 'rotate-180' : ''}`} />
                    </button>

                    {openProject && (
                        <div className="canvas-profile-menu">
                            <div className="px-3 py-2 text-[11px] text-[var(--ui-text-subtle)] border-b border-[var(--ui-border)]">
                                {projectStatus}
                            </div>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => void handleSaveNow()}>
                                <Save size={14} />
                                <span>Save Now</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => {
                                    setOpenProjectsModal(true);
                                    setOpenProject(false);
                                }}
                            >
                                <FolderOpen size={14} />
                                <span>Open Projects</span>
                            </button>
                            <button type="button" className="canvas-profile-menu-item" onClick={handleNewProject}>
                                <Settings size={14} />
                                <span>New Project</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setOpenExport((v) => !v);
                            setOpenProfile(false);
                            setOpenProject(false);
                        }}
                        className="canvas-profile-trigger"
                        title="Export options"
                    >
                        <div className="canvas-profile-avatar">
                            <Download size={16} />
                        </div>
                        <div className="canvas-profile-meta">
                            <span className="canvas-profile-name">Export</span>
                            <span className="canvas-profile-role">{selectionLabel}</span>
                        </div>
                        <ChevronDown size={14} className={`transition-transform ${openExport ? 'rotate-180' : ''}`} />
                    </button>

                    {openExport && (
                        <div className="canvas-profile-menu">
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => withScreens('Exporting ZIP', async () => {
                                    const { filename } = exportScreensAsZip(exportScreens, spec?.name || 'eazyui-design');
                                    pushToast({
                                        kind: 'success',
                                        title: 'ZIP exported',
                                        message: `${filename} (${selectionLabel})`,
                                    });
                                })}
                            >
                                <Download size={14} />
                                <span>Export as ZIP</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => withScreens('Rendering images', async () => {
                                    const { filename, pngCount, svgFallbackCount } = await exportScreensAsImagesZip(exportScreens, spec?.name || 'eazyui-design');
                                    pushToast({
                                        kind: 'success',
                                        title: 'Images exported',
                                        message: svgFallbackCount > 0
                                            ? `${filename} (${pngCount} PNG, ${svgFallbackCount} SVG fallback)`
                                            : `${filename} (${selectionLabel}, PNG 2x)`,
                                    });
                                })}
                            >
                                <Image size={14} />
                                <span>Export as Images</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => withScreens('Copying code', async () => {
                                    await copyScreensCodeToClipboard(exportScreens);
                                    pushToast({
                                        kind: 'success',
                                        title: 'Code copied',
                                        message: `Copied ${selectionLabel} to clipboard.`,
                                    });
                                })}
                            >
                                <Files size={14} />
                                <span>Copy Code to Clipboard</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => withScreens('Preparing Figma export', async () => {
                                    const result = await exportScreensToFigmaClipboard(exportScreens);
                                    if (result.mode === 'clipboard') {
                                        pushToast({
                                            kind: 'guide',
                                            title: 'Ready for Figma',
                                            message: 'Open Figma and press Ctrl+V to paste.',
                                            durationMs: 6000,
                                        });
                                    } else {
                                        pushToast({
                                            kind: 'guide',
                                            title: 'SVG downloaded',
                                            message: `${result.filename} downloaded. Import to Figma or paste if supported.`,
                                            durationMs: 7000,
                                        });
                                    }
                                })}
                            >
                                <Settings size={14} />
                                <span>Export to Figma</span>
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
                            setOpenProject(false);
                        }}
                        className="h-11 w-11 rounded-full border border-[var(--ui-canvas-profile-border)] bg-[var(--ui-canvas-profile-bg)] inline-flex items-center justify-center hover:bg-[var(--ui-canvas-profile-hover)] transition-colors"
                        title="Profile and settings"
                    >
                        <div className="canvas-profile-avatar canvas-profile-avatar-lg">
                            {authPhotoUrl ? (
                                <img
                                    src={authPhotoUrl}
                                    alt={authDisplayName}
                                    className="h-full w-full rounded-full object-cover"
                                    onError={(e) => {
                                        const fallbackName = authDisplayName || 'User';
                                        const img = e.currentTarget;
                                        img.onerror = null;
                                        img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=111827&color=ffffff&size=128&rounded=true`;
                                    }}
                                />
                            ) : (
                                <UserCircle2 size={16} />
                            )}
                        </div>
                    </button>

                    {openProfile && (
                        <div className="canvas-profile-menu">
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => {
                                    setOpenProfile(false);
                                    setOpenProfileModal(true);
                                }}
                            >
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
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => {
                                    toggleTheme();
                                    setOpenProfile(false);
                                }}
                            >
                                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                                <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => {
                                    toggleInspector();
                                    setOpenProfile(false);
                                }}
                            >
                                <Settings size={14} />
                                <span>{showInspector ? 'Hide' : 'Show'} Inspector</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => {
                                    setAutosaveEnabled(!autosaveEnabled);
                                    setOpenProfile(false);
                                }}
                            >
                                <Save size={14} />
                                <span>{autosaveEnabled ? 'Disable' : 'Enable'} Autosave</span>
                            </button>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => void handleSignOut()}
                            >
                                <LogOut size={14} />
                                <span>Log Out</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {openProjectsModal && (
                <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4">
                    <div className="w-full max-w-[760px] max-h-[78vh] overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)] shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ui-border)]">
                            <div>
                                <div className="text-sm font-semibold text-[var(--ui-text)]">Projects</div>
                                <div className="text-xs text-[var(--ui-text-subtle)]">Load or delete saved workspaces.</div>
                            </div>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => {
                                    setOpenProjectsModal(false);
                                }}
                            >
                                Close
                            </button>
                        </div>
                        <div className="p-4 flex items-center justify-between border-b border-[var(--ui-border)]">
                            <div className="text-xs text-[var(--ui-text-subtle)]">Current: {projectId ? projectId : 'none'}</div>
                            <button type="button" className="canvas-profile-menu-item" onClick={() => void refreshProjects()}>
                                Refresh
                            </button>
                        </div>
                        <div className="max-h-[52vh] overflow-auto p-3 space-y-2">
                            {loadingProjects && (
                                <div className="text-sm text-[var(--ui-text-subtle)] px-2 py-4 inline-flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Loading projects...
                                </div>
                            )}
                            {!loadingProjects && sortedProjects.length === 0 && (
                                <div className="text-sm text-[var(--ui-text-subtle)] px-2 py-4">No saved projects yet.</div>
                            )}
                            {!loadingProjects && sortedProjects.map((project) => (
                                <div
                                    key={project.id}
                                    className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm text-[var(--ui-text)] truncate">{project.name || 'Untitled project'}</div>
                                        <div className="text-xs text-[var(--ui-text-subtle)] truncate">{project.id}</div>
                                        <div className="text-[11px] text-[var(--ui-text-subtle)]">{formatSavedAt(project.updatedAt)}</div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            className="canvas-profile-menu-item"
                                            disabled={busyProjectId === project.id}
                                            onClick={() => void handleLoadProject(project.id)}
                                        >
                                            {busyProjectId === project.id ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                                            <span>Load</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="canvas-profile-menu-item"
                                            disabled={busyProjectId === project.id}
                                            onClick={() => void handleDeleteProject(project.id)}
                                        >
                                            <Trash2 size={14} />
                                            <span>Delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {openProfileModal && authUser && (
                <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4">
                    <div className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)] shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ui-border)]">
                            <div>
                                <div className="text-sm font-semibold text-[var(--ui-text)]">Profile</div>
                                <div className="text-xs text-[var(--ui-text-subtle)]">Your authenticated account details.</div>
                            </div>
                            <button
                                type="button"
                                className="canvas-profile-menu-item"
                                onClick={() => setOpenProfileModal(false)}
                            >
                                <X size={14} />
                                <span>Close</span>
                            </button>
                        </div>

                        <div className="p-4">
                            <div className="flex items-center gap-3">
                                {authPhotoUrl ? (
                                    <img src={authPhotoUrl} alt={authDisplayName} className="h-12 w-12 rounded-full object-cover border border-[var(--ui-border)]" />
                                ) : (
                                    <div className="h-12 w-12 rounded-full bg-[var(--ui-surface-3)] border border-[var(--ui-border)] inline-flex items-center justify-center text-[var(--ui-text)]">
                                        <UserCircle2 size={22} />
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[var(--ui-text)] truncate">{authDisplayName}</p>
                                    <p className="text-xs text-[var(--ui-text-muted)] truncate">{authUser.email || 'No email'}</p>
                                </div>
                            </div>

                            <div className="mt-4 space-y-2 text-xs">
                                <div className="flex items-center justify-between rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                                    <span className="text-[var(--ui-text-subtle)]">UID</span>
                                    <span className="text-[var(--ui-text)] max-w-[250px] truncate">{authUser.uid}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                                    <span className="text-[var(--ui-text-subtle)]">Provider</span>
                                    <span className="text-[var(--ui-text)]">{authUser.providerData[0]?.providerId || 'email/password'}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2">
                                    <span className="text-[var(--ui-text-subtle)]">Email Verified</span>
                                    <span className={authUser.emailVerified ? 'text-emerald-300' : 'text-amber-300'}>
                                        {authUser.emailVerified ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
