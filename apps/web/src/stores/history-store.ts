import { create } from 'zustand';
import type { CanvasDoc } from '@eazyui/shared';

type SnapshotSpec = {
    id: string;
    name: string;
    screens: {
        screenId: string;
        name: string;
        html: string;
        width: number;
        height: number;
        status?: 'streaming' | 'complete';
    }[];
    createdAt: string;
    updatedAt: string;
} | null;

export interface CanvasHistorySnapshot {
    spec: SnapshotSpec;
    doc: CanvasDoc;
}

interface HistoryState {
    past: CanvasHistorySnapshot[];
    future: CanvasHistorySnapshot[];
    isRestoring: boolean;
    maxEntries: number;
    recordSnapshot: (snapshot: CanvasHistorySnapshot) => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    undoSnapshot: () => CanvasHistorySnapshot | null;
    redoSnapshot: () => CanvasHistorySnapshot | null;
    clearHistory: () => void;
}

function stableStringify(value: unknown) {
    return JSON.stringify(value);
}

function cloneSnapshot(snapshot: CanvasHistorySnapshot): CanvasHistorySnapshot {
    return JSON.parse(JSON.stringify(snapshot));
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
    past: [],
    future: [],
    isRestoring: false,
    maxEntries: 120,

    recordSnapshot: (snapshot) => {
        const { isRestoring, past, maxEntries } = get();
        if (isRestoring) return;
        const normalized = cloneSnapshot(snapshot);
        const last = past[past.length - 1];
        if (last && stableStringify(last) === stableStringify(normalized)) return;

        const nextPast = [...past, normalized];
        const trimmedPast = nextPast.length > maxEntries ? nextPast.slice(nextPast.length - maxEntries) : nextPast;
        set({ past: trimmedPast, future: [] });
    },

    canUndo: () => get().past.length > 1,
    canRedo: () => get().future.length > 0,

    undoSnapshot: () => {
        const { past, future } = get();
        if (past.length <= 1) return null;
        const current = past[past.length - 1];
        const previous = past[past.length - 2];
        set({
            isRestoring: true,
            past: past.slice(0, -1),
            future: [current, ...future],
        });
        set({ isRestoring: false });
        return cloneSnapshot(previous);
    },

    redoSnapshot: () => {
        const { past, future } = get();
        if (!future.length) return null;
        const next = future[0];
        set({
            isRestoring: true,
            past: [...past, next],
            future: future.slice(1),
        });
        set({ isRestoring: false });
        return cloneSnapshot(next);
    },

    clearHistory: () => set({ past: [], future: [], isRestoring: false }),
}));

