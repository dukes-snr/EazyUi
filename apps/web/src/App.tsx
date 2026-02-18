// ============================================================================
// Main App Component
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { ChatPanel } from './components/chat/ChatPanel';
import { CanvasWorkspace } from './components/canvas/CanvasWorkspace';
import { EditPanel } from './components/edit/EditPanel';
import { LayersPanel } from './components/edit/LayersPanel';
import { LandingPage } from './components/landing/LandingPage';
import { LearnPage } from './components/marketing/LearnPage';
import { PricingPage } from './components/marketing/PricingPage';
import { TemplatesPage } from './components/marketing/TemplatesPage';
import { ToastViewport } from './components/ui/ToastViewport';
import type { DesignModelProfile } from './constants/designModels';

import { useDesignStore, useCanvasStore, useEditStore, useUiStore } from './stores';

import './styles/App.css';

const LANDING_DRAFT_KEY = 'eazyui:landing-draft';
type MarketingRoute = 'templates' | 'pricing' | 'learn';

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
    const { isEditMode } = useEditStore();
    const { theme, pushToast } = useUiStore();
    const [route, setRoute] = useState<'landing' | 'app' | MarketingRoute>(getRouteFromPath());
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
            </div>
            <ToastViewport />
        </div>
    );
}

export default App;
