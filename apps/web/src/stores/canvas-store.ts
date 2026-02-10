import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
    CanvasDoc,
    Board,
    EditorPrefs,
} from '@eazyui/shared';

// Mock Screen type for now since we're transitioning
interface Screen {
    screenId: string;
    name: string;
    width: number;
    height: number;
}

const DEVICE_DIMENSIONS: Record<string, { width: number; height: number }> = {
    mobile: { width: 375, height: 812 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 800 },
    none: { width: 375, height: 812 }, // Default fallbacks
};

interface CanvasState {
    // Canvas document
    doc: CanvasDoc;

    // Computed state
    isSpacePressed: boolean;
    isPanning: boolean;
    panStart: { x: number; y: number } | null;

    // Actions - Viewport
    setZoom: (zoom: number, center?: { x: number; y: number }) => void;
    pan: (deltaX: number, deltaY: number) => void;
    setPan: (panX: number, panY: number) => void;
    fitToContent: (boards: Board[], viewportSize: { width: number; height: number }) => void;
    fitToSelection: (viewportSize: { width: number; height: number }) => void;

    // Actions - Boards
    addBoard: (screen: Screen, position?: { x: number; y: number }) => void;
    updateBoardPosition: (boardId: string, x: number, y: number) => void;
    removeBoard: (boardId: string) => void;
    arrangeBoards: () => void;

    // Actions - Selection
    selectBoard: (boardId: string | null) => void;
    selectNode: (nodeId: string | null) => void;
    selectNodes: (nodeIds: string[]) => void;
    addToSelection: (nodeId: string) => void;
    clearSelection: () => void;
    hoverNode: (nodeId: string | null) => void;

    // Actions - Pan state
    setSpacePressed: (pressed: boolean) => void;
    startPan: (x: number, y: number) => void;
    updatePan: (x: number, y: number) => void;
    endPan: () => void;

    // Actions - Editor Prefs
    setEditorPrefs: (prefs: Partial<EditorPrefs>) => void;

    // Helpers
    getSelectedBoard: () => Board | undefined;
    getBoardForScreen: (screenId: string) => Board | undefined;
    screenToCanvas: (screenX: number, screenY: number, boardId: string) => { x: number; y: number } | null;
    canvasToScreen: (canvasX: number, canvasY: number, boardId: string) => { x: number; y: number } | null;

    // Bulk operations
    setBoards: (boards: Board[]) => void;
    reset: () => void;
}

const createDefaultDoc = (): CanvasDoc => ({
    docId: uuidv4(),
    viewport: { zoom: 1, panX: 0, panY: 0 },
    boards: [],
    selection: { selectedBoardId: null, selectedNodeIds: [], hoveredNodeId: null },
    editorPrefs: {
        snapToGrid: true,
        gridSize: 8,
        showRulers: true,
        showGrid: true,
        showGuides: true,
        showBoardLabels: true,
    },
    history: {
        specPatches: [],
        specPatchIndex: -1,
        canvasPatches: [],
        canvasPatchIndex: -1,
    },
});

export const useCanvasStore = create<CanvasState>((set, get) => ({
    doc: createDefaultDoc(),
    isSpacePressed: false,
    isPanning: false,
    panStart: null,

    // Viewport actions
    setZoom: (zoom, center) => {
        const { doc } = get();
        const clampedZoom = Math.max(0.1, Math.min(10, zoom));

        if (center) {
            // Zoom around the specified point
            const zoomRatio = clampedZoom / doc.viewport.zoom;
            const newPanX = center.x - (center.x - doc.viewport.panX) * zoomRatio;
            const newPanY = center.y - (center.y - doc.viewport.panY) * zoomRatio;

            set({
                doc: {
                    ...doc,
                    viewport: { zoom: clampedZoom, panX: newPanX, panY: newPanY },
                },
            });
        } else {
            set({
                doc: {
                    ...doc,
                    viewport: { ...doc.viewport, zoom: clampedZoom },
                },
            });
        }
    },

    pan: (deltaX, deltaY) => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                viewport: {
                    ...doc.viewport,
                    panX: doc.viewport.panX + deltaX,
                    panY: doc.viewport.panY + deltaY,
                },
            },
        });
    },

    setPan: (panX, panY) => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                viewport: { ...doc.viewport, panX, panY },
            },
        });
    },

    fitToContent: (boards, viewportSize) => {
        if (boards.length === 0) return;

        const padding = 100;
        const minX = Math.min(...boards.map(b => b.x));
        const minY = Math.min(...boards.map(b => b.y));
        const maxX = Math.max(...boards.map(b => b.x + b.width));
        const maxY = Math.max(...boards.map(b => b.y + b.height));

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        const zoomX = (viewportSize.width - padding * 2) / contentWidth;
        const zoomY = (viewportSize.height - padding * 2) / contentHeight;
        const zoom = Math.max(0.1, Math.min(1, Math.min(zoomX, zoomY)));

        const centerX = minX + contentWidth / 2;
        const centerY = minY + contentHeight / 2;

        const panX = viewportSize.width / 2 - centerX * zoom;
        const panY = viewportSize.height / 2 - centerY * zoom;

        const { doc } = get();
        set({
            doc: {
                ...doc,
                viewport: { zoom, panX, panY },
            },
        });
    },

    fitToSelection: (viewportSize) => {
        const { doc } = get();
        const { selectedBoardId } = doc.selection;

        if (!selectedBoardId) {
            get().fitToContent(doc.boards, viewportSize);
            return;
        }

        const board = doc.boards.find(b => b.boardId === selectedBoardId);
        if (!board) return;

        const padding = 100;
        const zoomX = (viewportSize.width - padding * 2) / board.width;
        const zoomY = (viewportSize.height - padding * 2) / board.height;
        const zoom = Math.max(0.1, Math.min(1, Math.min(zoomX, zoomY)));

        const centerX = board.x + board.width / 2;
        const centerY = board.y + board.height / 2;

        const panX = viewportSize.width / 2 - centerX * zoom;
        const panY = viewportSize.height / 2 - centerY * zoom;

        set({
            doc: {
                ...doc,
                viewport: { zoom, panX, panY },
            },
        });
    },

    // Board actions
    addBoard: (screen, position) => {
        const { doc } = get();

        const deviceDims = DEVICE_DIMENSIONS['none'];
        const newBoard: Board = {
            boardId: uuidv4(),
            screenId: screen.screenId,
            x: position?.x ?? 100 + doc.boards.length * (deviceDims.width + 80),
            y: position?.y ?? 100,
            width: screen.width || deviceDims.width,
            height: screen.height || deviceDims.height,
            deviceFrame: 'none',
            locked: false,
            visible: true,
        };

        set({
            doc: {
                ...doc,
                boards: [...doc.boards, newBoard],
            },
        });
    },

    updateBoardPosition: (boardId, x, y) => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                boards: doc.boards.map(b =>
                    b.boardId === boardId ? { ...b, x, y } : b
                ),
            },
        });
    },

    removeBoard: (boardId) => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                boards: doc.boards.filter(b => b.boardId !== boardId),
                selection: doc.selection.selectedBoardId === boardId
                    ? { ...doc.selection, selectedBoardId: null, selectedNodeIds: [] }
                    : doc.selection,
            },
        });
    },

    arrangeBoards: () => {
        // Auto-layout not supported in HTML mode yet
        // const { doc } = get();
        // const arranged = autoLayoutBoards(doc.boards);
        // set({
        //     doc: {
        //         ...doc,
        //         boards: arranged,
        //     },
        // });
    },

    // Selection actions
    selectBoard: (boardId) => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                selection: {
                    ...doc.selection,
                    selectedBoardId: boardId,
                    selectedNodeIds: [],
                },
            },
        });
    },

    selectNode: (nodeId) => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                selection: {
                    ...doc.selection,
                    selectedNodeIds: nodeId ? [nodeId] : [],
                },
            },
        });
    },

    selectNodes: (nodeIds) => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                selection: {
                    ...doc.selection,
                    selectedNodeIds: nodeIds,
                },
            },
        });
    },

    addToSelection: (nodeId) => {
        const { doc } = get();
        const { selectedNodeIds } = doc.selection;
        if (selectedNodeIds.includes(nodeId)) return;

        set({
            doc: {
                ...doc,
                selection: {
                    ...doc.selection,
                    selectedNodeIds: [...selectedNodeIds, nodeId],
                },
            },
        });
    },

    clearSelection: () => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                selection: {
                    selectedBoardId: null,
                    selectedNodeIds: [],
                    hoveredNodeId: null,
                },
            },
        });
    },

    hoverNode: (nodeId) => {
        const { doc } = get();
        if (doc.selection.hoveredNodeId === nodeId) return;

        set({
            doc: {
                ...doc,
                selection: {
                    ...doc.selection,
                    hoveredNodeId: nodeId,
                },
            },
        });
    },

    // Pan state
    setSpacePressed: (pressed) => set({ isSpacePressed: pressed }),

    startPan: (x, y) => set({ isPanning: true, panStart: { x, y } }),

    updatePan: (x, y) => {
        const { panStart, doc } = get();
        if (!panStart) return;

        const deltaX = x - panStart.x;
        const deltaY = y - panStart.y;

        set({
            panStart: { x, y },
            doc: {
                ...doc,
                viewport: {
                    ...doc.viewport,
                    panX: doc.viewport.panX + deltaX,
                    panY: doc.viewport.panY + deltaY,
                },
            },
        });
    },

    endPan: () => set({ isPanning: false, panStart: null }),

    // Editor prefs
    setEditorPrefs: (prefs) => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                editorPrefs: { ...doc.editorPrefs, ...prefs },
            },
        });
    },

    // Helpers
    getSelectedBoard: () => {
        const { doc } = get();
        return doc.boards.find(b => b.boardId === doc.selection.selectedBoardId);
    },

    getBoardForScreen: (screenId) => {
        return get().doc.boards.find(b => b.screenId === screenId);
    },

    screenToCanvas: (screenX, screenY, boardId) => {
        const { doc } = get();
        const board = doc.boards.find(b => b.boardId === boardId);
        if (!board) return null;

        return {
            x: (screenX - doc.viewport.panX) / doc.viewport.zoom - board.x,
            y: (screenY - doc.viewport.panY) / doc.viewport.zoom - board.y,
        };
    },

    canvasToScreen: (canvasX, canvasY, boardId) => {
        const { doc } = get();
        const board = doc.boards.find(b => b.boardId === boardId);
        if (!board) return null;

        return {
            x: (board.x + canvasX) * doc.viewport.zoom + doc.viewport.panX,
            y: (board.y + canvasY) * doc.viewport.zoom + doc.viewport.panY,
        };
    },

    // Bulk operations
    setBoards: (boards) => {
        const { doc } = get();
        set({
            doc: {
                ...doc,
                boards,
            },
        });
    },

    reset: () => set({
        doc: createDefaultDoc(),
        isSpacePressed: false,
        isPanning: false,
        panStart: null,
    }),
}));
