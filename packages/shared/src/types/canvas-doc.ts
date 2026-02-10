// ============================================================================
// Canvas Document - Editor-controlled state (viewport, boards, selection)
// ============================================================================

import { z } from 'zod';

// Viewport Schema (pan and zoom state)
export const ViewportSchema = z.object({
    zoom: z.number().min(0.1).max(10).default(1),
    panX: z.number().default(0),
    panY: z.number().default(0),
});

export type Viewport = z.infer<typeof ViewportSchema>;

// Device Frame presets
export const DeviceFrameSchema = z.enum([
    'none',
    'iphone-14',
    'iphone-14-pro',
    'iphone-14-pro-max',
    'iphone-se',
    'ipad',
    'ipad-pro',
    'android-phone',
    'android-tablet',
    'desktop-1920',
    'desktop-1440',
    'desktop-1280',
]);

export type DeviceFrame = z.infer<typeof DeviceFrameSchema>;

// Device dimensions lookup
export const DEVICE_DIMENSIONS: Record<DeviceFrame, { width: number; height: number }> = {
    'none': { width: 375, height: 812 },
    'iphone-14': { width: 390, height: 844 },
    'iphone-14-pro': { width: 393, height: 852 },
    'iphone-14-pro-max': { width: 430, height: 932 },
    'iphone-se': { width: 375, height: 667 },
    'ipad': { width: 768, height: 1024 },
    'ipad-pro': { width: 1024, height: 1366 },
    'android-phone': { width: 360, height: 800 },
    'android-tablet': { width: 800, height: 1280 },
    'desktop-1920': { width: 1920, height: 1080 },
    'desktop-1440': { width: 1440, height: 900 },
    'desktop-1280': { width: 1280, height: 800 },
};

// Board Schema (represents a screen instance on the canvas)
export const BoardSchema = z.object({
    boardId: z.string().describe('Unique board identifier'),
    screenId: z.string().describe('Reference to the screen in DesignSpec'),
    x: z.number().describe('X position on canvas'),
    y: z.number().describe('Y position on canvas'),
    width: z.number().describe('Board width'),
    height: z.number().describe('Board height'),
    deviceFrame: DeviceFrameSchema.default('none'),
    locked: z.boolean().default(false),
    visible: z.boolean().default(true),
});

export type Board = z.infer<typeof BoardSchema>;

// Selection state
export const SelectionSchema = z.object({
    selectedBoardId: z.string().nullable().default(null),
    selectedNodeIds: z.array(z.string()).default([]),
    hoveredNodeId: z.string().nullable().default(null),
});

export type Selection = z.infer<typeof SelectionSchema>;

// Editor Preferences
export const EditorPrefsSchema = z.object({
    snapToGrid: z.boolean().default(true),
    gridSize: z.number().default(8),
    showRulers: z.boolean().default(true),
    showGrid: z.boolean().default(true),
    showGuides: z.boolean().default(true),
    showBoardLabels: z.boolean().default(true),
});

export type EditorPrefs = z.infer<typeof EditorPrefsSchema>;

// Canvas Patch (for undo/redo of canvas changes)
export const CanvasPatchSchema = z.object({
    type: z.enum(['viewport', 'board-move', 'board-resize', 'selection', 'prefs']),
    before: z.unknown(),
    after: z.unknown(),
    timestamp: z.number(),
});

export type CanvasPatch = z.infer<typeof CanvasPatchSchema>;

// History State
export const HistoryStateSchema = z.object({
    specPatches: z.array(z.array(z.unknown())).default([]), // Stack of patch groups
    specPatchIndex: z.number().default(-1), // Current position in undo stack
    canvasPatches: z.array(CanvasPatchSchema).default([]),
    canvasPatchIndex: z.number().default(-1),
});

export type HistoryState = z.infer<typeof HistoryStateSchema>;

// Complete Canvas Document Schema
export const CanvasDocSchema = z.object({
    docId: z.string().describe('Document identifier'),
    viewport: ViewportSchema,
    boards: z.array(BoardSchema),
    selection: SelectionSchema,
    editorPrefs: EditorPrefsSchema,
    history: HistoryStateSchema,
});

export type CanvasDoc = z.infer<typeof CanvasDocSchema>;

// Create a default canvas document
export function createDefaultCanvasDoc(docId: string): CanvasDoc {
    return {
        docId,
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
    };
}

// Auto-layout boards in a grid arrangement
export function autoLayoutBoards(
    boards: Board[],
    options: { spacing?: number; maxPerRow?: number; startX?: number; startY?: number } = {}
): Board[] {
    const { spacing = 80, maxPerRow = 4, startX = 100, startY = 100 } = options;

    return boards.map((board, index) => {
        const row = Math.floor(index / maxPerRow);
        const col = index % maxPerRow;

        // Calculate x position based on previous boards in the row
        let x = startX;
        for (let i = row * maxPerRow; i < index; i++) {
            x += boards[i].width + spacing;
        }

        // Calculate y position based on max height of previous rows
        let y = startY;
        for (let r = 0; r < row; r++) {
            const rowStart = r * maxPerRow;
            const rowEnd = Math.min(rowStart + maxPerRow, boards.length);
            const maxHeight = Math.max(...boards.slice(rowStart, rowEnd).map(b => b.height));
            y += maxHeight + spacing;
        }

        return { ...board, x, y };
    });
}

// Get bounding box of all boards
export function getBoardsBoundingBox(boards: Board[]): { x: number; y: number; width: number; height: number } | null {
    if (boards.length === 0) return null;

    const minX = Math.min(...boards.map(b => b.x));
    const minY = Math.min(...boards.map(b => b.y));
    const maxX = Math.max(...boards.map(b => b.x + b.width));
    const maxY = Math.max(...boards.map(b => b.y + b.height));

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}
