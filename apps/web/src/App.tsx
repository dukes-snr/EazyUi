// ============================================================================
// Main App Component
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatPanel } from './components/chat/ChatPanel';
import { CanvasWorkspace } from './components/canvas/CanvasWorkspace';
import { EditPanel } from './components/edit/EditPanel';
import { LayersPanel } from './components/edit/LayersPanel';
import { InspectorPanel } from './components/inspector/InspectorPanel';
import { LandingPage } from './components/landing/LandingPage';
import { LearnPage } from './components/marketing/LearnPage';
import { PricingPage } from './components/marketing/PricingPage';
import { ProjectWorkspacePage } from './components/marketing/ProjectWorkspacePage';
import { TemplatesPage } from './components/marketing/TemplatesPage';
import { ToastViewport } from './components/ui/ToastViewport';
import DemoOne from './components/ui/demo';
import type { DesignModelProfile } from './constants/designModels';
import { apiClient } from './api/client';
import { createDefaultCanvasDoc, type CanvasDoc } from '@eazyui/shared';
import type { User } from 'firebase/auth';
import { observeAuthState, sendCurrentUserVerificationEmail, signOutCurrentUser } from './lib/auth';
import type { ChatMessage } from './stores/chat-store';

import { useDesignStore, useCanvasStore, useChatStore, useEditStore, useUiStore, useProjectStore, useHistoryStore } from './stores';

import './styles/App.css';

const LANDING_DRAFT_KEY = 'eazyui:landing-draft';
type MarketingRoute = 'templates' | 'pricing' | 'learn' | 'workspace';

function resolveUserPhotoUrl(user: User | null): string | null {
    if (!user) return null;
    if (user.photoURL) return user.photoURL;
    const providerPhoto = user.providerData.find((p) => Boolean(p?.photoURL))?.photoURL;
    if (providerPhoto) return providerPhoto;
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=111827&color=ffffff&size=128&rounded=true`;
}

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

function getProjectFingerprint(
    designSpec: { updatedAt: string; screens: Array<{ screenId: string; width: number; height: number }> } | null,
    canvasDoc: { boards: Array<{ boardId: string; screenId: string; x: number; y: number; width: number; height: number }> },
    messages: ChatMessage[]
): string {
    if (!designSpec) return '';
    const boards = canvasDoc.boards.map((b) => `${b.boardId}:${b.screenId}:${b.x}:${b.y}:${b.width}:${b.height}`).join('|');
    const chat = messages.map((m) => `${m.id}:${m.role}:${m.timestamp}:${(m.content || '').length}:${m.images?.length || 0}`).join('|');
    return `${designSpec.updatedAt}::${boards}::${chat}`;
}

function getRouteFromPath() {
    const path = window.location.pathname;
    if (path === '/app') return 'app' as const;
    if (path === '/login') return 'login' as const;
    if (path === '/workspace') return 'workspace' as const;
    if (path === '/templates') return 'templates' as const;
    if (path === '/learn') return 'learn' as const;
    if (path === '/pricing') return 'pricing' as const;
    return 'landing' as const;
}

function createProjectId() {
    return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function App() {
    const { spec } = useDesignStore();
    const { doc } = useCanvasStore();
    const { messages } = useChatStore();
    const { isEditMode } = useEditStore();
    const { theme, pushToast, showInspector } = useUiStore();
    const {
        projectId,
        dirty,
        autosaveEnabled,
        isHydrating,
        setHydrating,
        markDirty,
        markSaved,
        setSaving,
        setProjectId,
    } = useProjectStore();
    const [route, setRoute] = useState<'landing' | 'app' | 'login' | MarketingRoute>(getRouteFromPath());
    const [authReady, setAuthReady] = useState(false);
    const [authUser, setAuthUser] = useState<User | null>(null);
    const [verificationBusy, setVerificationBusy] = useState(false);
    const hydratedProjectIdRef = useRef<string | null>(null);
    const hydrationRunRef = useRef(0);
    const lastSavedFingerprintRef = useRef<string>('');
    const [initialRequest, setInitialRequest] = useState<{
        id: string;
        prompt: string;
        images: string[];
        platform?: 'mobile' | 'tablet' | 'desktop';
        stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
        modelProfile?: DesignModelProfile;
    } | null>(null);
    const authPhotoUrl = resolveUserPhotoUrl(authUser);


    useEffect(() => {
        if (!projectId) {
            hydratedProjectIdRef.current = null;
        }
    }, [projectId]);

    useEffect(() => {
        let cancelled = false;
        if (route !== 'app' || !projectId || !authReady || !authUser) return;
        if (hydratedProjectIdRef.current === projectId) return;
        if (hydrationRunRef.current !== 0) return;
        const targetProjectId = projectId;
        const runId = Date.now();
        hydrationRunRef.current = runId;

        setHydrating(true);
        (async () => {
            try {
                const project = await Promise.race([
                    apiClient.getProject(targetProjectId),
                    new Promise<never>((_, reject) => {
                        window.setTimeout(() => reject(new Error('Project load timed out')), 15000);
                    }),
                ]);
                if (cancelled) return;
                if (useProjectStore.getState().projectId !== targetProjectId) return;
                const resolvedDoc = ensureCanvasDocFromProject(project.canvasDoc, project.designSpec as any);
                useDesignStore.getState().setSpec(project.designSpec as any);
                useCanvasStore.getState().setDoc(resolvedDoc);
                useChatStore.getState().hydrateSession(project.chatState as any);
                const loadedMessages = Array.isArray((project.chatState as any)?.messages) ? (project.chatState as any).messages : [];
                lastSavedFingerprintRef.current = getProjectFingerprint(project.designSpec as any, resolvedDoc, loadedMessages);
                hydratedProjectIdRef.current = project.projectId;
                markSaved(project.projectId, project.updatedAt);
            } catch (error) {
                if (cancelled) return;
                if (useProjectStore.getState().projectId !== targetProjectId) return;
                const errorMessage = (error as Error).message || '';
                if (errorMessage.toLowerCase().includes('not found')) {
                    useDesignStore.getState().reset();
                    useCanvasStore.getState().reset();
                    useChatStore.getState().hydrateSession({ messages: [] });
                    useHistoryStore.getState().clearHistory();
                    lastSavedFingerprintRef.current = '';
                    hydratedProjectIdRef.current = targetProjectId;
                    markSaved(targetProjectId, new Date().toISOString());
                    return;
                }
                hydratedProjectIdRef.current = targetProjectId;
                pushToast({
                    kind: 'error',
                    title: 'Could not restore project',
                    message: errorMessage || 'Starting fresh workspace.',
                });
            } finally {
                if (hydrationRunRef.current === runId) {
                    hydrationRunRef.current = 0;
                    if (!cancelled) setHydrating(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [route, projectId, setHydrating, markSaved, setProjectId, pushToast, authReady, authUser]);

    useEffect(() => {
        if (route !== 'app' || isHydrating || !spec) return;
        const fingerprint = getProjectFingerprint(spec as any, doc as any, messages as any);
        if (!fingerprint) return;
        if (projectId && hydratedProjectIdRef.current !== projectId) return;
        if (!lastSavedFingerprintRef.current) {
            lastSavedFingerprintRef.current = fingerprint;
            return;
        }
        if (fingerprint !== lastSavedFingerprintRef.current) {
            markDirty();
        }
    }, [spec?.updatedAt, doc.boards, messages, route, isHydrating, markDirty, spec, doc, projectId]);

    useEffect(() => {
        if (route !== 'app' || isHydrating || !spec || dirty) return;
        const fingerprint = getProjectFingerprint(spec as any, doc as any, messages as any);
        if (fingerprint) {
            lastSavedFingerprintRef.current = fingerprint;
        }
    }, [route, isHydrating, dirty, spec?.updatedAt, doc.boards, messages, spec, doc]);

    useEffect(() => {
        if (route !== 'app') return;
        if (!autosaveEnabled || !dirty || !spec || isHydrating) return;

        const timer = window.setTimeout(async () => {
            try {
                setSaving(true);
                const saved = await apiClient.save({
                    projectId: projectId || undefined,
                    designSpec: spec as any,
                    canvasDoc: doc,
                    chatState: { messages },
                });
                lastSavedFingerprintRef.current = getProjectFingerprint(spec as any, doc as any, messages as any);
                hydratedProjectIdRef.current = saved.projectId;
                markSaved(saved.projectId, saved.savedAt);
            } catch (error) {
                pushToast({
                    kind: 'error',
                    title: 'Autosave failed',
                    message: (error as Error).message || 'Could not autosave the project.',
                });
                setSaving(false);
            }
        }, 1800);

        return () => {
            window.clearTimeout(timer);
        };
    }, [route, autosaveEnabled, dirty, spec, isHydrating, projectId, doc, messages, markSaved, setSaving, pushToast]);

    useEffect(() => {
        const onPopState = () => setRoute(getRouteFromPath());
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    useEffect(() => {
        const unsub = observeAuthState((user) => {
            setAuthUser(user);
            setAuthReady(true);
        });
        return () => unsub();
    }, []);

    const landingPrompt = useMemo(() => {
        if (route !== 'app') return '';
        return new URLSearchParams(window.location.search).get('prompt')?.trim() || '';
    }, [route]);

    useEffect(() => {
        if (route !== 'app') return;
        const staged = window.sessionStorage.getItem(LANDING_DRAFT_KEY);
        if (staged) {
            try {
                const parsed = JSON.parse(staged) as {
                    prompt?: string;
                    images?: string[];
                    platform?: 'mobile' | 'tablet' | 'desktop';
                    stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
                    modelProfile?: DesignModelProfile;
                };
                const prompt = (parsed.prompt || '').trim();
                const images = Array.isArray(parsed.images) ? parsed.images.filter((x) => typeof x === 'string') : [];
                if (prompt) {
                    setInitialRequest({
                        id: `landing-${Date.now()}`,
                        prompt,
                        images,
                        platform: parsed.platform,
                        stylePreset: parsed.stylePreset,
                        modelProfile: parsed.modelProfile,
                    });
                }
            } catch {
                // ignore malformed staged payload
            } finally {
                window.sessionStorage.removeItem(LANDING_DRAFT_KEY);
            }
            return;
        }
        if (landingPrompt) {
            setInitialRequest({ id: `query-${Date.now()}`, prompt: landingPrompt, images: [] });
            return;
        }
        setInitialRequest(null);
    }, [route, landingPrompt]);

    const navigate = (path: string, search = '') => {
        window.history.pushState({}, '', `${path}${search}`);
        setRoute(getRouteFromPath());
    };

    const openProjectFromWorkspace = (projectId: string) => {
        hydratedProjectIdRef.current = null;
        setInitialRequest(null);
        useDesignStore.getState().reset();
        useCanvasStore.getState().reset();
        useChatStore.getState().clearMessages();
        useHistoryStore.getState().clearHistory();
        setProjectId(projectId);
        navigate('/app', `?project=${encodeURIComponent(projectId)}`);
    };

    const handleSignOut = async () => {
        try {
            await signOutCurrentUser();
            navigate('/login');
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

    useEffect(() => {
        if (route !== 'app' || !authReady || !authUser) return;
        const search = new URLSearchParams(window.location.search);
        const wantsNewProject = search.get('new') === '1';
        const requested = search.get('project')?.trim() || '';
        if (wantsNewProject) {
            const freshProjectId = createProjectId();
            useDesignStore.getState().reset();
            useCanvasStore.getState().reset();
            useChatStore.getState().clearMessages();
            useHistoryStore.getState().clearHistory();
            hydratedProjectIdRef.current = null;
            setInitialRequest(null);
            search.delete('new');
            search.set('project', freshProjectId);
            window.history.replaceState({}, '', `/app?${search.toString()}`);
            if (projectId !== freshProjectId) {
                setProjectId(freshProjectId);
            }
            return;
        }

        // Deterministic routing: if URL has a project, it is the source of truth.
        if (requested) {
            if (requested !== projectId) {
                hydratedProjectIdRef.current = null;
                setProjectId(requested);
            }
            return;
        }

        // No project slug in URL: always mint a fresh one so /app is never sticky to old slugs.
        const freshProjectId = createProjectId();
        search.set('project', freshProjectId);
        window.history.replaceState({}, '', `/app?${search.toString()}`);
        if (projectId !== freshProjectId) {
            hydratedProjectIdRef.current = null;
            setProjectId(freshProjectId);
        }
    }, [route, authReady, authUser, projectId, setProjectId]);

    useEffect(() => {
        if (!authReady) return;
        const requiresAuth = route === 'app' || route === 'workspace';
        if (requiresAuth && !authUser) {
            navigate('/login');
            return;
        }
        if (route === 'login' && authUser) {
            navigate('/workspace');
        }
    }, [route, authReady, authUser]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {


            // Space for panning
            if (e.code === 'Space' && !e.repeat) {
                useCanvasStore.getState().setSpacePressed(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                useCanvasStore.getState().setSpacePressed(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        const handleOffline = () => {
            pushToast({
                kind: 'error',
                title: 'No internet connection',
                message: 'You are offline. Generation and edits will fail until the network is restored.',
                durationMs: 7000,
            });
        };
        const handleOnline = () => {
            pushToast({
                kind: 'info',
                title: 'Back online',
                message: 'Connection restored.',
            });
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, [pushToast]);

    if (route === 'landing') {
        return (
            <LandingPage
                userProfile={authUser ? {
                    name: authUser.displayName || authUser.email?.split('@')[0] || 'User',
                    email: authUser.email || '',
                    photoUrl: authPhotoUrl,
                    emailVerified: authUser.emailVerified,
                } : null}
                onSignOut={handleSignOut}
                onSendVerification={handleSendVerification}
                verificationBusy={verificationBusy}
                onStart={({ prompt, images, platform, stylePreset, modelProfile }) => {
                    window.sessionStorage.setItem(LANDING_DRAFT_KEY, JSON.stringify({ prompt, images, platform, stylePreset, modelProfile }));
                    navigate('/app');
                }}
                onNavigate={(path) => navigate(path)}
            />
        );
    }

    if (route === 'login') {
        return <DemoOne onNavigate={(path) => navigate(path)} />;
    }

    if ((route === 'app' || route === 'workspace') && (!authReady || (authReady && !authUser))) {
        return (
            <div className="h-screen w-screen bg-[#06070B] text-gray-300 grid place-items-center text-sm">
                Loading your workspace...
            </div>
        );
    }

    if (route !== 'app') {
        if (route === 'workspace') {
            return (
                <ProjectWorkspacePage
                    authReady={authReady}
                    isAuthenticated={Boolean(authUser)}
                    onNavigate={(path, search = '') => navigate(path, search)}
                    onOpenProject={openProjectFromWorkspace}
                />
            );
        }
        if (route === 'templates') {
            return <TemplatesPage onNavigate={(path) => navigate(path)} onOpenApp={() => navigate('/app')} />;
        }
        if (route === 'pricing') {
            return <PricingPage onNavigate={(path) => navigate(path)} onOpenApp={() => navigate('/app')} />;
        }
        return <LearnPage onNavigate={(path) => navigate(path)} onOpenApp={() => navigate('/app')} />;
    }

    return (
        <div className={`app-layout ${isEditMode ? 'edit-mode' : ''}`}>
            <ChatPanel initialRequest={initialRequest} />
            <div className="app-canvas-shell">
                <LayersPanel />
                <CanvasWorkspace />
                <EditPanel />
                {showInspector && <InspectorPanel />}
            </div>
            <ToastViewport />
        </div>
    );
}

export default App;
