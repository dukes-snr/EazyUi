// ============================================================================
// Canvas Workspace Component - Interactive React Flow Canvas
// ============================================================================

import { useMemo, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    ReactFlow,
    Background,
    Controls,
    Node,
    useNodesState,
    useEdgesState,
    ReactFlowProvider,
    NodeChange,
    BackgroundVariant,
    SelectionMode,
    PanOnScrollMode,
    useReactFlow,
    useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronRight } from 'lucide-react';
import type { EditorPrefs } from '@eazyui/shared';

import { useDesignStore, useCanvasStore, useEditStore, useChatStore, useHistoryStore, useProjectStore, useUiStore } from '../../stores';
import { useOnboardingStore } from '../../stores/onboarding-store';
import { DeviceNode } from './DeviceNode';
import { CanvasToolbar } from './CanvasToolbar';
import { MultiSelectToolbar } from './MultiSelectToolbar';
import { CanvasProfileMenu } from './CanvasProfileMenu';
import { dispatchClearSelection, dispatchDeleteSelected } from '../../utils/editMessaging';
import { apiClient } from '../../api/client';
import { recordProjectHistorySnapshot, restoreProjectHistorySnapshot } from '../../utils/projectHistory';
import { GuideBubbleOverlay, type GuideBubbleStep } from '../ui/GuideBubbleOverlay';

// Define custom node types
const nodeTypes = {
    device: DeviceNode,
};

const CANVAS_WORKSPACE_GUIDE_ID = 'canvas-workspace-first-run';

const CANVAS_WORKSPACE_GUIDE_STEPS: GuideBubbleStep[] = [
    {
        id: 'canvas-project-breadcrumbs',
        targetId: 'canvas-project-breadcrumbs',
        title: 'Project context stays visible',
        body: 'Use these breadcrumbs to jump back to Home, Projects, or the current project without losing where you are.',
        placement: 'bottom',
    },
    {
        id: 'canvas-toolbar',
        targetId: 'canvas-toolbar',
        title: 'Your main canvas dock',
        body: 'Switch between select and hand mode, undo or redo changes, zoom, fit the view, and reopen help from this rail.',
        placement: 'right',
    },
    {
        id: 'canvas-stage',
        targetId: 'canvas-stage',
        title: 'Work directly on the canvas',
        body: 'Drag screens around, select one or many frames, and use screen-level actions from the device toolbar when a frame is selected.',
        placement: 'top',
    },
    {
        id: 'canvas-project-controls',
        targetId: 'canvas-project-controls',
        title: 'Save, export, and manage the project',
        body: 'The top-right controls handle saving, exports, notifications, profile access, and workspace-level settings.',
        placement: 'left',
    },
    {
        id: 'canvas-help-trigger',
        targetId: 'canvas-help-trigger',
        title: 'Reopen help any time',
        body: 'Use Help whenever you want guides, docs, or the keyboard shortcut map without leaving the canvas.',
        placement: 'right',
    },
];

type CopiedScreenPayload = {
    name: string;
    html: string;
    width: number;
    height: number;
    x: number;
    y: number;
};

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    if (target.closest('[contenteditable="true"]')) return true;
    if (target.closest('input, textarea, select, [role="textbox"]')) return true;
    return false;
}

function createCopiedScreenName(sourceName: string, usedNames: Set<string>): string {
    const base = `${sourceName} Copy`;
    if (!usedNames.has(base)) {
        usedNames.add(base);
        return base;
    }

    let counter = 2;
    while (usedNames.has(`${base} ${counter}`)) {
        counter += 1;
    }
    const candidate = `${base} ${counter}`;
    usedNames.add(candidate);
    return candidate;
}

// Inner component to use React Flow hooks if needed
function CanvasWorkspaceContent({ mode = 'default' }: { mode?: 'default' | 'edit-workspace' }) {
    const { spec, addScreens, removeScreen } = useDesignStore();
    const { projectId, isHydrating, isSaving, markSaved, setSaving } = useProjectStore();
    const {
        doc,
        selectNodes,
        clearSelection,
        setBoards,
        updateBoardPosition,
        focusNodeId,
        setFocusNodeId,
        focusNodeIds,
        setFocusNodeIds,
        lastExternalUpdate,
        triggerExternalUpdate,
        activeTool,
        setActiveTool,
        historyRevision: canvasHistoryRevision,
    } = useCanvasStore();
    const designHistoryRevision = useDesignStore((state) => state.historyRevision);
    const { isEditMode, screenId: editScreenId, exitEdit, selected: editSelected } = useEditStore();
    const { isGenerating, messages } = useChatStore();
    const { pushToast, removeToast, requestConfirmation } = useUiStore();
    const { undoSnapshot, redoSnapshot, canUndo, canRedo } = useHistoryStore();
    const activeGuideId = useOnboardingStore((state) => state.activeGuideId);
    const guideStepIndex = useOnboardingStore((state) => state.stepIndex);
    const seenGuideIds = useOnboardingStore((state) => state.seenGuideIds);
    const startGuide = useOnboardingStore((state) => state.startGuide);
    const nextGuideStep = useOnboardingStore((state) => state.nextStep);
    const prevGuideStep = useOnboardingStore((state) => state.prevStep);
    const finishGuide = useOnboardingStore((state) => state.finishGuide);
    const skipGuide = useOnboardingStore((state) => state.skipGuide);
    const { setCenter, fitView, setViewport, zoomIn, zoomOut } = useReactFlow();
    const viewport = useViewport();
    const canvasScrollWheelMode = ((doc.editorPrefs as EditorPrefs & { canvasScrollWheelMode?: 'zoom' | 'pan' }).canvasScrollWheelMode || 'zoom');
    const isEditWorkspace = mode === 'edit-workspace';
    const hasSeenCanvasGuide = seenGuideIds.includes(CANVAS_WORKSPACE_GUIDE_ID);
    const isCanvasGuideActive = !isEditWorkspace && !isEditMode && activeGuideId === CANVAS_WORKSPACE_GUIDE_ID;
    const activeCanvasGuideStep = isCanvasGuideActive ? CANVAS_WORKSPACE_GUIDE_STEPS[guideStepIndex] || null : null;
    const autoFocusedProjectIdRef = useRef<string | null>(null);
    const editWorkspaceFocusedScreenRef = useRef<string | null>(null);
    const copiedScreensRef = useRef<CopiedScreenPayload[]>([]);
    const pasteCountRef = useRef(0);

    const handleManualSave = useCallback(async () => {
        if (!spec || isHydrating || isSaving) return;

        const loadingToastId = pushToast({
            kind: 'loading',
            title: 'Saving canvas',
            message: 'Persisting screens, chat, and canvas state...',
            durationMs: 0,
        });

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
            pushToast({
                kind: 'error',
                title: 'Save failed',
                message: (error as Error).message || 'Unable to save project.',
            });
        } finally {
            removeToast(loadingToastId);
            setSaving(false);
        }
    }, [doc, isHydrating, isSaving, markSaved, messages, projectId, pushToast, removeToast, setSaving, spec]);

    const getNodeSize = useCallback((node: Node) => {
        const width = node.measured?.width ?? (node.data?.width as number) ?? 402;
        const height = node.measured?.height ?? (node.data?.height as number) ?? 874;
        return { width, height };
    }, []);

    const screensById = useMemo(() => {
        const map = new Map<string, NonNullable<typeof spec>['screens'][number]>();
        (spec?.screens || []).forEach((screen) => {
            map.set(screen.screenId, screen);
        });
        return map;
    }, [spec?.screens]);

    const getCanvasViewportSize = useCallback(() => {
        const el = document.querySelector('.canvas-workspace .react-flow') as HTMLElement | null;
        return {
            width: Math.max(320, el?.clientWidth || window.innerWidth),
            height: Math.max(320, el?.clientHeight || window.innerHeight),
        };
    }, []);

    const focusNodesTopAligned = useCallback((
        targetNodes: Node[],
        duration = 800,
        includeToolbarChrome = false,
        paddingOverrides?: {
            sidePadding?: number;
            topPadding?: number;
            bottomPadding?: number;
            maxZoom?: number;
        },
        verticalAlign: 'top' | 'center' = 'top'
    ) => {
        if (!targetNodes.length) return;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        targetNodes.forEach((node) => {
            const { width, height } = getNodeSize(node);
            minX = Math.min(minX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxX = Math.max(maxX, node.position.x + width);
            maxY = Math.max(maxY, node.position.y + height);
        });

        const boundsWidth = Math.max(1, maxX - minX);
        const boundsHeight = Math.max(1, maxY - minY);
        const viewport = getCanvasViewportSize();
        const sidePadding = paddingOverrides?.sidePadding ?? (includeToolbarChrome ? 110 : 72);
        const topPadding = paddingOverrides?.topPadding ?? (includeToolbarChrome ? 132 : 40);
        const bottomPadding = paddingOverrides?.bottomPadding ?? (includeToolbarChrome ? 56 : 40);

        const availableWidth = Math.max(120, viewport.width - sidePadding * 2);
        const availableHeight = Math.max(120, viewport.height - topPadding - bottomPadding);
        const maxZoom = paddingOverrides?.maxZoom ?? 1.1;

        // Fit by both width/height so multi-screen focus reliably keeps all frames visible.
        const zoomByWidth = availableWidth / boundsWidth;
        const zoomByHeight = availableHeight / boundsHeight;
        const zoom = Math.max(0.05, Math.min(maxZoom, Math.min(zoomByWidth, zoomByHeight)));

        const frameCenterX = sidePadding + availableWidth / 2;
        const contentCenterX = minX + boundsWidth / 2;
        const x = frameCenterX - contentCenterX * zoom;
        const y = verticalAlign === 'center'
            ? (topPadding + availableHeight / 2) - (minY + boundsHeight / 2) * zoom
            : topPadding - minY * zoom;

        setViewport({ x, y, zoom }, { duration, ease: easeInOutCubic, interpolate: 'smooth' });
    }, [getCanvasViewportSize, getNodeSize, setViewport]);

    const visibleBoards = useMemo(() => {
        if (isEditWorkspace && isEditMode && editScreenId) {
            return doc.boards.filter((board) => board.screenId === editScreenId);
        }
        return doc.boards;
    }, [doc.boards, editScreenId, isEditMode, isEditWorkspace]);

    // Initialize nodes from boards and spec.screens
    const initialNodes = useMemo(() => {
        if (!spec) return [];

        // Map based on boards to respect arrangement order
        return visibleBoards.map((board) => {
            const screen = screensById.get(board.screenId);
            if (!screen) return null;

            return {
                id: screen.screenId,
                type: 'device',
                position: { x: board.x, y: board.y },
                data: {
                    screenId: screen.screenId,
                    html: screen.html,
                    label: screen.name,
                    width: screen.width,
                    height: screen.height,
                    status: screen.status,
                },
                selected: false,
            } as Node;
        }).filter(Boolean) as Node[];
    }, [spec, visibleBoards, screensById]); // Selection sync happens in dedicated effect

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState([]);

    // Handle focusing from chat
    useEffect(() => {
        if (focusNodeId) {
            // Find the node in the current React Flow state
            const targetNode = nodes.find(n => n.id === focusNodeId);

            if (targetNode) {
                if (isEditWorkspace) {
                    focusNodesTopAligned([targetNode], 520, false, {
                        topPadding: 48,
                        bottomPadding: 210,
                        sidePadding: 72,
                    });
                    selectNodes([focusNodeId]);
                    setFocusNodeId(null);
                    return;
                }

                // Calculate center of the node
                const { width, height } = getNodeSize(targetNode);
                const isDesktopNode = width >= 1024;

                if (isDesktopNode) {
                    focusNodesTopAligned([targetNode], 800, true);
                } else {
                    const centerX = targetNode.position.x + width / 2;
                    const centerY = targetNode.position.y + height / 2;

                    setCenter(centerX, centerY, {
                        zoom: 1,
                        duration: 800,
                        ease: easeInOutCubic,
                        interpolate: 'smooth',
                    });
                }

                // Also select it to give visual feedback
                selectNodes([focusNodeId]);
                // Reset focus ID only after successful focus
                setFocusNodeId(null);
            }
        }
    }, [focusNodeId, getNodeSize, focusNodesTopAligned, isEditWorkspace, setCenter, setFocusNodeId, nodes, selectNodes]);

    // Handle focusing a group of nodes from chat/edit flows
    useEffect(() => {
        if (!focusNodeIds || focusNodeIds.length === 0) return;
        const existing = focusNodeIds.filter(id => nodes.some(n => n.id === id));
        if (!existing.length) {
            setFocusNodeIds(null);
            return;
        }

        const targetNodes = existing
            .map((id) => nodes.find((node) => node.id === id))
            .filter(Boolean) as Node[];
        focusNodesTopAligned(targetNodes, 900, true);
        selectNodes(existing);
        setFocusNodeIds(null);
    }, [focusNodeIds, focusNodesTopAligned, nodes, selectNodes, setFocusNodeIds]);

    // After a project finishes loading, focus all screens with room for device toolbar chrome.
    useEffect(() => {
        if (!isEditWorkspace || !isEditMode || !editScreenId) {
            editWorkspaceFocusedScreenRef.current = null;
            return;
        }
        if (editWorkspaceFocusedScreenRef.current === editScreenId) return;
        if (nodes.length === 0) return;

        const targetNode = nodes.find((node) => node.id === editScreenId) || nodes[0];
        if (!targetNode) return;
        const raf = window.requestAnimationFrame(() => {
            // Reserve extra bottom room so the screen starts above the AI composer.
            focusNodesTopAligned([targetNode], 520, false, {
                topPadding: 48,
                bottomPadding: 210,
                sidePadding: 72,
            });
            editWorkspaceFocusedScreenRef.current = editScreenId;
        });
        return () => window.cancelAnimationFrame(raf);
    }, [editScreenId, focusNodesTopAligned, isEditMode, isEditWorkspace, nodes]);

    useEffect(() => {
        if (isHydrating) {
            autoFocusedProjectIdRef.current = null;
        }
    }, [isHydrating]);

    useEffect(() => {
        if (isEditWorkspace) return;
        if (isHydrating) return;
        if (!projectId || !spec || nodes.length === 0) return;
        if (autoFocusedProjectIdRef.current === projectId) return;

        const projectScreenIds = new Set((spec.screens || []).map((screen) => screen.screenId));
        const targetNodes = nodes.filter((node) => projectScreenIds.has(node.id));
        if (targetNodes.length === 0) return;

        let cancelled = false;
        let delayedPass: number | undefined;
        const frame = window.requestAnimationFrame(() => {
            if (cancelled) return;
            // First fit pass immediately after nodes are mounted.
            focusNodesTopAligned(targetNodes, 900, true, { maxZoom: 0.82 }, 'center');
            // Second pass settles final dimensions for a stable centered view.
            delayedPass = window.setTimeout(() => {
                if (cancelled) return;
                focusNodesTopAligned(targetNodes, 520, true, { maxZoom: 0.82 }, 'center');
                autoFocusedProjectIdRef.current = projectId;
            }, 220);
        });

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frame);
            if (delayedPass) {
                window.clearTimeout(delayedPass);
            }
        };
    }, [isEditWorkspace, isHydrating, projectId, spec, nodes, focusNodesTopAligned]);

    // Update nodes when structure or selection changes
    // But avoid resetting positions while users are interacting via React Flow
    // Sync selection state separately to avoid full node resets
    useEffect(() => {
        setNodes((nds) => nds.map((n) => {
            const nextSelected = doc.selection.selectedNodeIds.includes(n.id) || doc.selection.selectedBoardId === n.id;
            return n.selected === nextSelected ? n : { ...n, selected: nextSelected };
        }));
    }, [doc.selection.selectedNodeIds, doc.selection.selectedBoardId, setNodes]);

    // Sync node data when spec content changes without resetting positions
    useEffect(() => {
        if (!spec) return;
        setNodes((nds) => nds.map((n) => {
            const screen = screensById.get(n.id);
            if (!screen) return n;

            const currentData = (n.data || {}) as Record<string, unknown>;
            if (
                currentData.screenId === screen.screenId
                && currentData.html === screen.html
                && currentData.label === screen.name
                && currentData.width === screen.width
                && currentData.height === screen.height
                && currentData.status === screen.status
            ) {
                return n;
            }

            const nextData = {
                ...currentData,
                screenId: screen.screenId,
                html: screen.html,
                label: screen.name,
                width: screen.width,
                height: screen.height,
                status: screen.status,
            };

            return {
                ...n,
                data: nextData,
            };
        }));
    }, [spec, screensById, setNodes]);

    // Update nodes when structure changes or external update is triggered
    useEffect(() => {
        const currentIds = nodes.map(n => n.id).join(',');
        const targetIds = initialNodes.map(n => n.id).join(',');
        const hasStructureChange = currentIds !== targetIds;

        // If structure changed or alignment tool was used, we MUST reset nodes
        if (hasStructureChange || lastExternalUpdate) {
            // Apply current positions from doc.boards as well
            const syncedNodes = initialNodes.map(n => {
                const board = doc.boards.find(b => b.screenId === n.id);
                return board ? { ...n, position: { x: board.x, y: board.y } } : n;
            });
            setNodes(syncedNodes);
        }
    }, [initialNodes, setNodes, lastExternalUpdate]); // lastExternalUpdate is key here

    // History capture is driven by meaningful canvas/design revisions only.
    // Skip while hydrating or streaming, then record the settled end state once.
    useEffect(() => {
        if (isHydrating || isGenerating) return;
        const frame = window.requestAnimationFrame(() => {
            recordProjectHistorySnapshot();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [canvasHistoryRevision, designHistoryRevision, isGenerating, isHydrating]);

    // Handle node changes (dragging, selection)
    const handleNodesChange = useCallback(
        (changes: NodeChange[]) => {
            onNodesChange(changes);
        },
        [onNodesChange]
    );

    // Sync React Flow selection to store
    const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
        selectNodes(nodes.map((n) => n.id));
    }, [selectNodes]);

    const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
        updateBoardPosition(node.id, node.position.x, node.position.y);
    }, [updateBoardPosition]);

    const onPaneClick = useCallback(() => {
        selectNodes([]);
        if (isEditMode && editScreenId) {
            dispatchClearSelection(editScreenId);
            useEditStore.getState().setSelected(null);
        }
    }, [editScreenId, isEditMode, selectNodes]);

    const onMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
        const currentDoc = useCanvasStore.getState().doc;
        const zoomDelta = Math.abs((currentDoc.viewport.zoom || 1) - viewport.zoom);
        const panXDelta = Math.abs((currentDoc.viewport.panX || 0) - viewport.x);
        const panYDelta = Math.abs((currentDoc.viewport.panY || 0) - viewport.y);
        if (zoomDelta < 0.0001 && panXDelta < 0.1 && panYDelta < 0.1) return;

        useCanvasStore.getState().setDoc({
            ...currentDoc,
            viewport: {
                zoom: viewport.zoom,
                panX: viewport.x,
                panY: viewport.y,
            },
        });
    }, []);

    const collectSelectedScreens = useCallback((): CopiedScreenPayload[] => {
        const canvasState = useCanvasStore.getState();
        const currentSpec = useDesignStore.getState().spec;
        const selectedIds = Array.from(new Set(canvasState.doc.selection.selectedNodeIds || []));
        if (!currentSpec || selectedIds.length === 0) return [];

        const screenMap = new Map(currentSpec.screens.map((screen) => [screen.screenId, screen]));
        const boardMap = new Map(canvasState.doc.boards.map((board) => [board.screenId, board]));

        return selectedIds
            .map((screenId) => {
                const screen = screenMap.get(screenId);
                const board = boardMap.get(screenId);
                if (!screen || !board) return null;
                return {
                    name: screen.name,
                    html: screen.html,
                    width: screen.width,
                    height: screen.height,
                    x: board.x,
                    y: board.y,
                };
            })
            .filter(Boolean) as CopiedScreenPayload[];
    }, []);

    const copySelectionToClipboard = useCallback((): boolean => {
        const copied = collectSelectedScreens();
        if (copied.length === 0) return false;
        copiedScreensRef.current = copied;
        pasteCountRef.current = 0;
        pushToast({
            kind: 'info',
            title: 'Copied screens',
            message: `${copied.length} screen${copied.length === 1 ? '' : 's'} copied.`,
            durationMs: 2200,
        });
        return true;
    }, [collectSelectedScreens, pushToast]);

    const pasteScreens = useCallback((sourceScreens: CopiedScreenPayload[]): boolean => {
        if (sourceScreens.length === 0) return false;

        const currentSpec = useDesignStore.getState().spec;
        if (!currentSpec) return false;

        pasteCountRef.current += 1;
        const stepOffset = 40 * pasteCountRef.current;
        const minX = Math.min(...sourceScreens.map((item) => item.x));
        const minY = Math.min(...sourceScreens.map((item) => item.y));
        const usedNames = new Set(currentSpec.screens.map((screen) => screen.name));

        const nextScreens = sourceScreens.map((source) => {
            const screenId = uuidv4();
            return {
                screenId,
                name: createCopiedScreenName(source.name, usedNames),
                html: source.html,
                width: source.width,
                height: source.height,
                status: 'complete' as const,
                board: {
                    boardId: screenId,
                    screenId,
                    x: source.x - minX + minX + stepOffset,
                    y: source.y - minY + minY + stepOffset,
                    width: source.width,
                    height: source.height,
                    deviceFrame: 'none' as const,
                    locked: false,
                    visible: true,
                },
            };
        });

        addScreens(nextScreens.map(({ board: _board, ...screen }) => screen));
        const currentBoards = useCanvasStore.getState().doc.boards;
        setBoards([...currentBoards, ...nextScreens.map((item) => item.board)]);
        const newIds = nextScreens.map((item) => item.screenId);
        selectNodes(newIds);
        setFocusNodeIds(newIds);
        pushToast({
            kind: 'success',
            title: 'Pasted screens',
            message: `${nextScreens.length} screen${nextScreens.length === 1 ? '' : 's'} added to canvas.`,
            durationMs: 2400,
        });
        return true;
    }, [addScreens, pushToast, selectNodes, setBoards, setFocusNodeIds]);

    const deleteSelectedScreens = useCallback(async (): Promise<boolean> => {
        const canvasState = useCanvasStore.getState();
        const selectedIds = Array.from(new Set(canvasState.doc.selection.selectedNodeIds || []));
        if (selectedIds.length === 0) return false;

        const label = selectedIds.length === 1 ? 'this screen' : `${selectedIds.length} screens`;
        const confirmed = await requestConfirmation({
            title: selectedIds.length === 1 ? 'Delete screen?' : 'Delete selected screens?',
            message: `This will permanently remove ${label} from the current project.`,
            confirmLabel: selectedIds.length === 1 ? 'Delete Screen' : 'Delete Screens',
            cancelLabel: 'Cancel',
            tone: 'danger',
        });
        if (!confirmed) return false;

        const selectedSet = new Set(selectedIds);
        selectedIds.forEach((screenId) => removeScreen(screenId));
        const updatedBoards = useCanvasStore.getState().doc.boards.filter(
            (board) => !selectedSet.has(board.screenId) && !selectedSet.has(board.boardId)
        );
        setBoards(updatedBoards);
        clearSelection();

        if (isEditMode && editScreenId && selectedSet.has(editScreenId)) {
            exitEdit();
        }

        pushToast({
            kind: 'success',
            title: 'Screens deleted',
            message: `Removed ${selectedIds.length} screen${selectedIds.length === 1 ? '' : 's'}.`,
            durationMs: 2200,
        });
        return true;
    }, [clearSelection, editScreenId, exitEdit, isEditMode, pushToast, removeScreen, requestConfirmation, setBoards]);

    const nudgeSelection = useCallback((deltaX: number, deltaY: number): boolean => {
        const canvasState = useCanvasStore.getState();
        const selectedIds = Array.from(new Set(canvasState.doc.selection.selectedNodeIds || []));
        if (selectedIds.length === 0) return false;
        const selectedSet = new Set(selectedIds);

        const nextBoards = canvasState.doc.boards.map((board) => (
            selectedSet.has(board.screenId)
                ? { ...board, x: board.x + deltaX, y: board.y + deltaY }
                : board
        ));
        setBoards(nextBoards);
        triggerExternalUpdate();
        return true;
    }, [setBoards, triggerExternalUpdate]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) return;

            const key = event.key.toLowerCase();
            const primary = event.ctrlKey || event.metaKey;

            if (isEditMode && editScreenId) {
                if (event.key === 'Escape') {
                    if (editSelected) {
                        dispatchClearSelection(editScreenId);
                    } else {
                        exitEdit();
                    }
                    event.preventDefault();
                    return;
                }

                if (primary && key === 'z' && !event.shiftKey) {
                    const state = useEditStore.getState();
                    if (state.pointer <= 0) return;
                    const rebuilt = state.undoAndRebuild();
                    if (!rebuilt) return;
                    useDesignStore.getState().updateScreen(editScreenId, rebuilt, 'complete');
                    event.preventDefault();
                    return;
                }

                if (primary && (key === 'y' || (key === 'z' && event.shiftKey))) {
                    const state = useEditStore.getState();
                    if (state.pointer >= state.patches.length) return;
                    const rebuilt = state.redoAndRebuild();
                    if (!rebuilt) return;
                    useDesignStore.getState().updateScreen(editScreenId, rebuilt, 'complete');
                    event.preventDefault();
                    return;
                }

                if (!primary && (event.key === 'Delete' || event.key === 'Backspace')) {
                    dispatchDeleteSelected(editScreenId);
                    event.preventDefault();
                    return;
                }
            }

            if (!primary && event.key === 'Escape') {
                if (doc.selection.selectedNodeIds.length > 0) {
                    clearSelection();
                    event.preventDefault();
                    return;
                }
                if (isEditMode) {
                    exitEdit();
                    event.preventDefault();
                }
                return;
            }

            if (primary && key === 'c') {
                if (copySelectionToClipboard()) {
                    event.preventDefault();
                }
                return;
            }

            if (primary && key === 'v') {
                if (pasteScreens(copiedScreensRef.current)) {
                    event.preventDefault();
                }
                return;
            }

            if (primary && key === 'd') {
                const selected = collectSelectedScreens();
                if (selected.length && pasteScreens(selected)) {
                    event.preventDefault();
                }
                return;
            }

            if (!primary && key === 'f') {
                const selectedIds = Array.from(new Set(useCanvasStore.getState().doc.selection.selectedNodeIds || []));
                if (selectedIds.length > 0) {
                    if (selectedIds.length === 1) {
                        setFocusNodeId(selectedIds[0]);
                    } else {
                        setFocusNodeIds(selectedIds);
                    }
                    event.preventDefault();
                }
                return;
            }

            if (primary && key === 's') {
                event.preventDefault();
                void handleManualSave();
                return;
            }

            if (primary && key === 'a') {
                const allIds = (useDesignStore.getState().spec?.screens || []).map((screen) => screen.screenId);
                if (allIds.length > 0) {
                    selectNodes(allIds);
                    event.preventDefault();
                }
                return;
            }

            if (primary && key === 'z' && !event.shiftKey) {
                if (!canUndo()) return;
                const snapshot = undoSnapshot();
                if (!snapshot) return;
                restoreProjectHistorySnapshot(snapshot);
                event.preventDefault();
                return;
            }

            if (primary && (key === 'y' || (key === 'z' && event.shiftKey))) {
                if (!canRedo()) return;
                const snapshot = redoSnapshot();
                if (!snapshot) return;
                restoreProjectHistorySnapshot(snapshot);
                event.preventDefault();
                return;
            }

            if (primary && (event.key === '=' || event.key === '+')) {
                zoomIn({ duration: 120 });
                event.preventDefault();
                return;
            }

            if (primary && (event.key === '-' || event.key === '_')) {
                zoomOut({ duration: 120 });
                event.preventDefault();
                return;
            }

            if (primary && key === '0') {
                fitView({ padding: 0.15, duration: 260, maxZoom: 1.1 });
                event.preventDefault();
                return;
            }

            if (!primary && key === '1') {
                setActiveTool('select');
                event.preventDefault();
                return;
            }

            if (!primary && key === '2') {
                setActiveTool('hand');
                event.preventDefault();
                return;
            }

            if (!primary && event.key === '?') {
                window.dispatchEvent(new CustomEvent('eazyui:open-canvas-help', {
                    detail: { panel: 'shortcuts' },
                }));
                event.preventDefault();
                return;
            }

            if (!primary && (event.key === 'Delete' || event.key === 'Backspace')) {
                if (doc.selection.selectedNodeIds.length > 0) {
                    event.preventDefault();
                    void deleteSelectedScreens();
                }
                return;
            }

            const nudgeStep = event.shiftKey ? 10 : 1;
            if (!primary && key === 'arrowup') {
                if (nudgeSelection(0, -nudgeStep)) event.preventDefault();
                return;
            }
            if (!primary && key === 'arrowdown') {
                if (nudgeSelection(0, nudgeStep)) event.preventDefault();
                return;
            }
            if (!primary && key === 'arrowleft') {
                if (nudgeSelection(-nudgeStep, 0)) event.preventDefault();
                return;
            }
            if (!primary && key === 'arrowright') {
                if (nudgeSelection(nudgeStep, 0)) event.preventDefault();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [
        canRedo,
        canUndo,
        clearSelection,
        collectSelectedScreens,
        copySelectionToClipboard,
        deleteSelectedScreens,
        doc.selection.selectedNodeIds.length,
        editScreenId,
        editSelected,
        exitEdit,
        fitView,
        isEditMode,
        nudgeSelection,
        pasteScreens,
        redoSnapshot,
        selectNodes,
        setActiveTool,
        handleManualSave,
        undoSnapshot,
        zoomIn,
        zoomOut,
    ]);

    const navigateTo = useCallback((path: string) => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    }, []);

    // Select Tool: Selection Box on drag (pan with Space via panActivationKeyCode)
    // Hand Tool: Pan on drag
    const panOnDrag = activeTool === 'hand' ? true : [1, 2]; // Middle/Right click always pans
    const selectionOnDrag = activeTool === 'select';
    const panActivationKeyCode = activeTool === 'select' ? 'Space' : undefined;
    const gridGap = useMemo(() => {
        const zoom = viewport.zoom || 1;
        if (zoom <= 0.3) return 120;
        if (zoom <= 0.5) return 96;
        if (zoom <= 0.75) return 72;
        if (zoom <= 1.15) return 48;
        if (zoom <= 1.6) return 32;
        return 24;
    }, [viewport.zoom]);

    useEffect(() => {
        if (isEditWorkspace || isEditMode || isHydrating || hasSeenCanvasGuide || activeGuideId || !spec?.screens?.length) return;
        const timeoutId = window.setTimeout(() => {
            startGuide(CANVAS_WORKSPACE_GUIDE_ID);
        }, 650);
        return () => window.clearTimeout(timeoutId);
    }, [activeGuideId, hasSeenCanvasGuide, isEditMode, isEditWorkspace, isHydrating, spec?.screens?.length, startGuide]);

    return (
        <div className="canvas-workspace relative h-full w-full">
            {!isEditWorkspace && (
                <div className="absolute left-4 top-4 z-50" data-guide-id="canvas-project-breadcrumbs">
                    <div className="inline-flex items-center gap-1 px-3 py-2 text-[12px] text-[var(--ui-text-muted)] backdrop-blur-md">
                        <button
                            type="button"
                            onClick={() => navigateTo('/app')}
                            className="transition-colors hover:text-[var(--ui-primary)]"
                        >
                            Home
                        </button>
                        <ChevronRight size={12} />
                        <button
                            type="button"
                            onClick={() => navigateTo('/app/projects')}
                            className="transition-colors hover:text-[var(--ui-primary)]"
                        >
                            Projects
                        </button>
                        <ChevronRight size={12} />
                        <button
                            type="button"
                            onClick={() => {
                                if (!projectId) return;
                                navigateTo(`/app/projects/${encodeURIComponent(projectId)}/canvas`);
                            }}
                            className="max-w-[170px] truncate text-[var(--ui-text)] transition-colors hover:text-[var(--ui-primary)]"
                            title={spec?.name || 'Project'}
                        >
                            {spec?.name || 'Project'}
                        </button>
                    </div>
                </div>
            )}

            <div data-guide-id="canvas-stage" className="h-full w-full">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeDragStop={onNodeDragStop}
                    onPaneClick={onPaneClick}
                    onSelectionChange={onSelectionChange}
                    onMoveEnd={onMoveEnd}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                    minZoom={0.05}
                    maxZoom={isEditWorkspace ? 4 : 2}

                    // Interaction Logic
                    panOnDrag={panOnDrag}
                    panActivationKeyCode={panActivationKeyCode}
                    selectionOnDrag={selectionOnDrag}
                    selectionKeyCode={null} // Disable modifier key requirement for selection when in Select mode
                    selectionMode={SelectionMode.Partial}

                    // Scroll wheel behavior
                    zoomOnScroll={canvasScrollWheelMode === 'zoom'}
                    zoomOnDoubleClick={false}
                    panOnScroll={canvasScrollWheelMode === 'pan'}
                    panOnScrollMode={PanOnScrollMode.Free}

                    // Constraints
                    translateExtent={[[-Infinity, -Infinity], [Infinity, Infinity]]}
                    nodesDraggable={!isEditMode && activeTool === 'select'} // Disable dragging while editing
                    proOptions={{ hideAttribution: true }}
                >
                    <Background
                        variant={BackgroundVariant.Lines}
                        gap={gridGap}
                        size={1}
                        color="color-mix(in srgb, var(--ui-canvas-dot) 34%, transparent)"
                    />
                    <Controls
                        className="canvas-controls-hidden hidden" // Hide default controls
                        showZoom={false}
                        showFitView={false}
                        showInteractive={false}
                    />
                </ReactFlow>
            </div>

            {!isEditWorkspace && <CanvasToolbar />}

            {/* Multi-Selection Toolbar */}
            {!isEditWorkspace && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
                    <MultiSelectToolbar />
                </div>
            )}

            {!isEditWorkspace && (
                <div className="absolute top-4 right-4 z-50">
                    <CanvasProfileMenu />
                </div>
            )}

            {isCanvasGuideActive && activeCanvasGuideStep && (
                <GuideBubbleOverlay
                    step={activeCanvasGuideStep}
                    stepIndex={guideStepIndex}
                    stepCount={CANVAS_WORKSPACE_GUIDE_STEPS.length}
                    onPrev={prevGuideStep}
                    onSkip={skipGuide}
                    onNext={() => {
                        if (guideStepIndex >= CANVAS_WORKSPACE_GUIDE_STEPS.length - 1) {
                            finishGuide();
                            return;
                        }
                        nextGuideStep(CANVAS_WORKSPACE_GUIDE_STEPS.length);
                    }}
                />
            )}
        </div>
    );
}

export function CanvasWorkspace({ mode = 'default' }: { mode?: 'default' | 'edit-workspace' }) {
    return (
        <ReactFlowProvider>
            <CanvasWorkspaceContent mode={mode} />
        </ReactFlowProvider>
    );
}
