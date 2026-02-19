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
import { TemplatesPage } from './components/marketing/TemplatesPage';
import { ToastViewport } from './components/ui/ToastViewport';
import type { DesignModelProfile } from './constants/designModels';
import { apiClient } from './api/client';
import { createDefaultCanvasDoc, type CanvasDoc } from '@eazyui/shared';
import type { ChatMessage } from './stores/chat-store';

import { useDesignStore, useCanvasStore, useChatStore, useEditStore, useUiStore, useProjectStore } from './stores';

import './styles/App.css';

const LANDING_DRAFT_KEY = 'eazyui:landing-draft';
type MarketingRoute = 'templates' | 'pricing' | 'learn';

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
    if (path === '/templates') return 'templates' as const;
    if (path === '/learn') return 'learn' as const;
    if (path === '/pricing') return 'pricing' as const;
    return 'landing' as const;
}

function App() {
    const { spec, reset: resetDesign } = useDesignStore();
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
    const [route, setRoute] = useState<'landing' | 'app' | MarketingRoute>(getRouteFromPath());
    const hydratedProjectIdRef = useRef<string | null>(null);
    const lastSavedFingerprintRef = useRef<string>('');
    const [initialRequest, setInitialRequest] = useState<{
        id: string;
        prompt: string;
        images: string[];
        platform?: 'mobile' | 'tablet' | 'desktop';
        stylePreset?: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
        modelProfile?: DesignModelProfile;
    } | null>(null);


    // Initialize with empty state
    useEffect(() => {
        if (!spec) {
            resetDesign();
        }
    }, [spec, resetDesign]);

    useEffect(() => {
        if (!projectId) {
            hydratedProjectIdRef.current = null;
            return;
        }
        if (spec) {
            hydratedProjectIdRef.current = projectId;
        }
    }, [projectId, spec]);

    useEffect(() => {
        let cancelled = false;
        if (route !== 'app' || !projectId || isHydrating) return;
        if (hydratedProjectIdRef.current === projectId) return;

        setHydrating(true);
        (async () => {
            try {
                const project = await apiClient.getProject(projectId);
                if (cancelled) return;
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
                hydratedProjectIdRef.current = null;
                setProjectId(null);
                pushToast({
                    kind: 'error',
                    title: 'Could not restore project',
                    message: (error as Error).message || 'Starting fresh workspace.',
                });
            } finally {
                if (!cancelled) setHydrating(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [route, projectId, isHydrating, setHydrating, markSaved, setProjectId, pushToast]);

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
        }
    }, [route, landingPrompt]);

    const navigate = (path: string, search = '') => {
        window.history.pushState({}, '', `${path}${search}`);
        setRoute(getRouteFromPath());
    };

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
                onStart={({ prompt, images, platform, stylePreset, modelProfile }) => {
                    window.sessionStorage.setItem(LANDING_DRAFT_KEY, JSON.stringify({ prompt, images, platform, stylePreset, modelProfile }));
                    navigate('/app');
                }}
                onNavigate={(path) => navigate(path)}
            />
        );
    }

    if (route !== 'app') {
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
