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
    desktop: { width: 1280, height: 1200 },
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
    alignSelectedBoards: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    distributeSelectedBoards: (type: 'horizontal' | 'vertical') => void;
    smartArrangeSelectedBoards: () => void;
    moveSelectedBoards: (direction: 'front' | 'back') => void;

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

    // Focus state for navigation
    focusNodeId: string | null;
    setFocusNodeId: (nodeId: string | null) => void;
    focusNodeIds: string[] | null;
    setFocusNodeIds: (nodeIds: string[] | null) => void;

    lastExternalUpdate: number;
    triggerExternalUpdate: () => void;

    // Actions - Tools
    activeTool: 'select' | 'hand';
    setActiveTool: (tool: 'select' | 'hand') => void;

    // Helpers
    getSelectedBoard: () => Board | undefined;
    getBoardForScreen: (screenId: string) => Board | undefined;
    screenToCanvas: (screenX: number, screenY: number, boardId: string) => { x: number; y: number } | null;
    canvasToScreen: (canvasX: number, canvasY: number, boardId: string) => { x: number; y: number } | null;

    // Bulk operations
    setBoards: (boards: Board[]) => void;
    setDoc: (doc: CanvasDoc) => void;
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

    focusNodeId: null,
    setFocusNodeId: (focusNodeId) => set({ focusNodeId }),
    focusNodeIds: null,
    setFocusNodeIds: (focusNodeIds) => set({ focusNodeIds }),

    lastExternalUpdate: 0,
    triggerExternalUpdate: () => set({ lastExternalUpdate: Date.now() }),

    activeTool: 'select',
    setActiveTool: (tool) => set({ activeTool: tool }),

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
    },

    alignSelectedBoards: (type) => {
        const { doc } = get();
        const { selectedNodeIds } = doc.selection;
        if (selectedNodeIds.length < 2) return;

        const boards = doc.boards.filter(b => selectedNodeIds.includes(b.screenId));
        if (boards.length < 2) return;

        let targetValue: number;
        const rects = boards.map(b => ({
            id: b.boardId,
            left: b.x,
            right: b.x + b.width,
            top: b.y,
            bottom: b.y + b.height,
            centerX: b.x + b.width / 2,
            centerY: b.y + b.height / 2,
        }));

        switch (type) {
            case 'left':
                targetValue = Math.min(...rects.map(r => r.left));
                set({
                    doc: {
                        ...doc,
                        boards: doc.boards.map(b =>
                            selectedNodeIds.includes(b.screenId) ? { ...b, x: targetValue } : b
                        ),
                    }
                });
                break;
            case 'right':
                targetValue = Math.max(...rects.map(r => r.right));
                set({
                    doc: {
                        ...doc,
                        boards: doc.boards.map(b =>
                            selectedNodeIds.includes(b.screenId) ? { ...b, x: targetValue - b.width } : b
                        ),
                    }
                });
                break;
            case 'center':
                const minL = Math.min(...rects.map(r => r.left));
                const maxR = Math.max(...rects.map(r => r.right));
                targetValue = (minL + maxR) / 2;
                set({
                    doc: {
                        ...doc,
                        boards: doc.boards.map(b =>
                            selectedNodeIds.includes(b.screenId) ? { ...b, x: targetValue - b.width / 2 } : b
                        ),
                    }
                });
                break;
            case 'top':
                targetValue = Math.min(...rects.map(r => r.top));
                set({
                    doc: {
                        ...doc,
                        boards: doc.boards.map(b =>
                            selectedNodeIds.includes(b.screenId) ? { ...b, y: targetValue } : b
                        ),
                    }
                });
                break;
            case 'bottom':
                targetValue = Math.max(...rects.map(r => r.bottom));
                set({
                    doc: {
                        ...doc,
                        boards: doc.boards.map(b =>
                            selectedNodeIds.includes(b.screenId) ? { ...b, y: targetValue - b.height } : b
                        ),
                    }
                });
                break;
            case 'middle':
                const minT = Math.min(...rects.map(r => r.top));
                const maxB = Math.max(...rects.map(r => r.bottom));
                targetValue = (minT + maxB) / 2;
                set({
                    doc: {
                        ...doc,
                        boards: doc.boards.map(b =>
                            selectedNodeIds.includes(b.screenId) ? { ...b, y: targetValue - b.height / 2 } : b
                        ),
                    }
                });
                break;
        }
        set({ lastExternalUpdate: Date.now() });
    },

    distributeSelectedBoards: (type) => {
        const { doc } = get();
        const { selectedNodeIds } = doc.selection;
        if (selectedNodeIds.length < 3) return; // Need at least 3 to distribute space

        const selectedBoards = doc.boards
            .filter(b => selectedNodeIds.includes(b.screenId))
            .sort((a, b) => type === 'horizontal' ? a.x - b.x : a.y - b.y);

        if (selectedBoards.length < 3) return;

        const first = selectedBoards[0];
        const last = selectedBoards[selectedBoards.length - 1];

        if (type === 'horizontal') {
            const totalWidth = selectedBoards.reduce((sum, b) => sum + b.width, 0);
            const totalSpan = (last.x + last.width) - first.x;
            const gap = (totalSpan - totalWidth) / (selectedBoards.length - 1);

            // Re-calculate all selected positions and then map
            const boardPositions = new Map();
            let runningX = first.x;
            selectedBoards.forEach((b) => {
                boardPositions.set(b.boardId, runningX);
                runningX += b.width + gap;
            });

            set({
                doc: {
                    ...doc,
                    boards: doc.boards.map(b =>
                        boardPositions.has(b.boardId) ? { ...b, x: boardPositions.get(b.boardId) } : b
                    )
                },
                lastExternalUpdate: Date.now()
            });

        } else {
            const totalHeight = selectedBoards.reduce((sum, b) => sum + b.height, 0);
            const totalSpan = (last.y + last.height) - first.y;
            const gap = (totalSpan - totalHeight) / (selectedBoards.length - 1);

            const boardPositions = new Map();
            let runningY = first.y;
            selectedBoards.forEach((b) => {
                boardPositions.set(b.boardId, runningY);
                runningY += b.height + gap;
            });

            set({
                doc: {
                    ...doc,
                    boards: doc.boards.map(b =>
                        boardPositions.has(b.boardId) ? { ...b, y: boardPositions.get(b.boardId) } : b
                    )
                },
                lastExternalUpdate: Date.now()
            });
        }
    },

    smartArrangeSelectedBoards: () => {
        const { doc } = get();
        const { selectedNodeIds } = doc.selection;
        if (selectedNodeIds.length < 2) return;

        const selectedBoards = doc.boards
            .filter(b => selectedNodeIds.includes(b.screenId))
            .sort((a, b) => (a.y - b.y) || (a.x - b.x)); // Reading order: Top to bottom, then left to right

        if (selectedBoards.length < 2) return;

        // Configuration: arrange left-to-right with a hard wrap after 4 items per row.
        const gap = 80;
        const columns = 4;

        // Find top-left starting point
        const startX = Math.min(...selectedBoards.map(b => b.x));
        const startY = Math.min(...selectedBoards.map(b => b.y));

        const boardPositions = new Map();
        let maxRowHeight = 0;
        let currentY = startY;
        let currentX = startX;

        selectedBoards.forEach((board, index) => {
            if (index > 0 && index % columns === 0) {
                currentY += maxRowHeight + gap;
                currentX = startX;
                maxRowHeight = 0;
            }

            boardPositions.set(board.boardId, { x: currentX, y: currentY });

            maxRowHeight = Math.max(maxRowHeight, board.height);
            currentX += board.width + gap;
        });

        set({
            doc: {
                ...doc,
                boards: doc.boards.map(b =>
                    boardPositions.has(b.boardId)
                        ? { ...b, ...boardPositions.get(b.boardId) }
                        : b
                )
            },
            lastExternalUpdate: Date.now()
        });
    },

    moveSelectedBoards: (direction) => {
        const { doc } = get();
        const { selectedNodeIds } = doc.selection;
        if (selectedNodeIds.length === 0) return;

        const otherBoards = doc.boards.filter(b => !selectedNodeIds.includes(b.screenId));
        const selectedBoards = doc.boards.filter(b => selectedNodeIds.includes(b.screenId));

        if (direction === 'front') {
            set({
                doc: {
                    ...doc,
                    boards: [...otherBoards, ...selectedBoards],
                },
                lastExternalUpdate: Date.now()
            });
        } else {
            set({
                doc: {
                    ...doc,
                    boards: [...selectedBoards, ...otherBoards],
                },
                lastExternalUpdate: Date.now()
            });
        }
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

    setDoc: (doc) => set({ doc }),

    reset: () => set({
        doc: createDefaultDoc(),
        isSpacePressed: false,
        isPanning: false,
        panStart: null,
    }),
}));
