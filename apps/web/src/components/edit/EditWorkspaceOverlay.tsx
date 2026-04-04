import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { CanvasWorkspace } from '../canvas/CanvasWorkspace';
import { useCanvasStore, useDesignStore } from '../../stores';
import { useEditStore } from '../../stores/edit-store';
import { useOnboardingStore } from '../../stores/onboarding-store';
import { GuideBubbleOverlay, type GuideBubbleStep } from '../ui/GuideBubbleOverlay';
import { LayersPanel } from './LayersPanel';
import { EditPanel } from './EditPanel';
import { EditAiComposer } from './EditAiComposer';

const EDIT_WORKSPACE_GUIDE_ID = 'edit-workspace-first-run';

const EDIT_WORKSPACE_GUIDE_STEPS: GuideBubbleStep[] = [
    {
        id: 'edit-layers-toggle',
        targetId: 'edit-layers-toggle',
        title: 'Open the structure view',
        body: 'This toggle reveals the layer tree so you can inspect and jump to any editable element on the current screen.',
        placement: 'right',
    },
    {
        id: 'edit-layers-panel',
        targetId: 'edit-layers-panel',
        title: 'Browse the screen structure',
        body: 'Use Layers to move through groups, buttons, icons, and text without hunting around on the preview.',
        placement: 'right',
    },
    {
        id: 'edit-layer-tree',
        targetId: 'edit-layer-tree',
        title: 'Select exact elements',
        body: 'Click any row here to sync selection back to the preview. The tree also follows device selections automatically.',
        placement: 'right',
    },
    {
        id: 'edit-preview-canvas',
        targetId: 'edit-preview-canvas',
        title: 'Edit against the live preview',
        body: 'This center stage is the real screen preview. Click elements directly here when you want precise visual selection.',
        placement: 'top',
    },
    {
        id: 'edit-ai-composer',
        targetId: 'edit-ai-composer',
        title: 'Describe targeted changes',
        body: 'Use the edit composer for quick prompt-based adjustments to the current screen or selected element.',
        placement: 'top',
    },
    {
        id: 'edit-inspector-pane',
        targetId: 'edit-inspector-pane',
        title: 'Fine-tune with the inspector',
        body: 'Use the right panel for manual styling, layout changes, images, undo/redo, and deeper element controls.',
        placement: 'left',
    },
    {
        id: 'edit-exit-button',
        targetId: 'edit-exit-button',
        title: 'Exit when you are done',
        body: 'Leave edit mode here after committing your screen changes.',
        placement: 'left',
    },
];

export function EditWorkspaceOverlay() {
    const { isEditMode, screenId } = useEditStore();
    const { spec } = useDesignStore();
    const { setFocusNodeId } = useCanvasStore();
    const activeGuideId = useOnboardingStore((state) => state.activeGuideId);
    const guideStepIndex = useOnboardingStore((state) => state.stepIndex);
    const seenGuideIds = useOnboardingStore((state) => state.seenGuideIds);
    const startGuide = useOnboardingStore((state) => state.startGuide);
    const nextGuideStep = useOnboardingStore((state) => state.nextStep);
    const prevGuideStep = useOnboardingStore((state) => state.prevStep);
    const finishGuide = useOnboardingStore((state) => state.finishGuide);
    const skipGuide = useOnboardingStore((state) => state.skipGuide);
    const [layersOpen, setLayersOpen] = useState(false);
    const recenterTimersRef = useRef<number[]>([]);

    const activeScreenName = useMemo(() => {
        if (!spec || !screenId) return 'Screen Editor';
        return spec.screens.find((screen) => screen.screenId === screenId)?.name || 'Screen Editor';
    }, [screenId, spec]);
    const hasSeenEditGuide = seenGuideIds.includes(EDIT_WORKSPACE_GUIDE_ID);
    const isEditGuideActive = activeGuideId === EDIT_WORKSPACE_GUIDE_ID;
    const activeEditGuideStep = isEditGuideActive ? EDIT_WORKSPACE_GUIDE_STEPS[guideStepIndex] || null : null;

    useEffect(() => {
        return () => {
            recenterTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
            recenterTimersRef.current = [];
        };
    }, []);

    useEffect(() => {
        if (!isEditMode || !screenId) return;
        recenterTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        recenterTimersRef.current = [];

        // Recenter immediately + during/after layers transition so available space is respected.
        const ticks = [0, 160, 340];
        recenterTimersRef.current = ticks.map((delay) =>
            window.setTimeout(() => {
                setFocusNodeId(screenId);
            }, delay)
        );
    }, [isEditMode, layersOpen, screenId, setFocusNodeId]);

    useEffect(() => {
        if (!isEditMode || !screenId || hasSeenEditGuide || activeGuideId) return;
        const timeoutId = window.setTimeout(() => {
            setLayersOpen(true);
            startGuide(EDIT_WORKSPACE_GUIDE_ID);
        }, 450);
        return () => window.clearTimeout(timeoutId);
    }, [activeGuideId, hasSeenEditGuide, isEditMode, screenId, startGuide]);

    useEffect(() => {
        if (!isEditGuideActive) return;
        setLayersOpen(true);
    }, [isEditGuideActive]);

    if (!isEditMode) return null;

    return (
        <div className="edit-workspace-overlay">
            <div className="edit-workspace-modal">
                <div className={`edit-workspace-layers-drawer ${layersOpen ? 'open' : 'closed'}`}>
                    {layersOpen && <LayersPanel />}
                </div>

                <div className="edit-workspace-preview-pane">
                    <div className="edit-workspace-preview-canvas" data-guide-id="edit-preview-canvas">
                        <CanvasWorkspace mode="edit-workspace" />
                        <div className="edit-workspace-floating-controls">
                            <button
                                type="button"
                                onClick={() => setLayersOpen((value) => !value)}
                                data-guide-id="edit-layers-toggle"
                                className="edit-workspace-layers-toggle"
                                title={layersOpen ? 'Hide layers panel' : 'Show layers panel'}
                            >
                                {layersOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                                <span>Layers</span>
                            </button>
                            <div className="edit-workspace-screen-title">
                                <div className="edit-workspace-screen-chip">
                                    <Layers size={14} />
                                    <span>{activeScreenName}</span>
                                </div>
                            </div>
                        </div>
                        <EditAiComposer />
                    </div>
                </div>

                <div className="edit-workspace-editor-pane">
                    <EditPanel />
                </div>
            </div>

            {isEditGuideActive && activeEditGuideStep && (
                <GuideBubbleOverlay
                    step={activeEditGuideStep}
                    stepIndex={guideStepIndex}
                    stepCount={EDIT_WORKSPACE_GUIDE_STEPS.length}
                    onPrev={prevGuideStep}
                    onSkip={skipGuide}
                    onNext={() => {
                        if (guideStepIndex >= EDIT_WORKSPACE_GUIDE_STEPS.length - 1) {
                            finishGuide();
                            return;
                        }
                        nextGuideStep(EDIT_WORKSPACE_GUIDE_STEPS.length);
                    }}
                />
            )}
        </div>
    );
}
