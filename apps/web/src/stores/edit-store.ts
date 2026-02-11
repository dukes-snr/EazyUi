import { create } from 'zustand';
import type { HtmlPatch } from '../utils/htmlPatcher';

export interface SelectedElementInfo {
    uid: string;
    tagName: string;
    classList: string[];
    inlineStyle: Record<string, string>;
    textContent: string;
    computedStyle: {
        color?: string;
        backgroundColor?: string;
        fontSize?: string;
        fontWeight?: string;
        borderRadius?: string;
        padding?: string;
        margin?: string;
        width?: string;
        height?: string;
        display?: string;
        justifyContent?: string;
        alignItems?: string;
    };
    rect: { x: number; y: number; width: number; height: number };
}

interface EditState {
    isEditMode: boolean;
    screenId: string | null;
    selected: SelectedElementInfo | null;
    undoStack: HtmlPatch[];
    redoStack: HtmlPatch[];

    enterEdit: (screenId: string) => void;
    exitEdit: () => void;
    setSelected: (info: SelectedElementInfo | null) => void;
    pushPatch: (patch: HtmlPatch) => void;
    undo: () => HtmlPatch | null;
    redo: () => HtmlPatch | null;
    clearHistory: () => void;
}

export const useEditStore = create<EditState>((set, get) => ({
    isEditMode: false,
    screenId: null,
    selected: null,
    undoStack: [],
    redoStack: [],

    enterEdit: (screenId) => set({ isEditMode: true, screenId, selected: null }),
    exitEdit: () => set({ isEditMode: false, screenId: null, selected: null, undoStack: [], redoStack: [] }),
    setSelected: (selected) => set({ selected }),

    pushPatch: (patch) => set(state => ({
        undoStack: [...state.undoStack, patch],
        redoStack: [],
    })),

    undo: () => {
        const state = get();
        const last = state.undoStack[state.undoStack.length - 1];
        if (!last) return null;
        set({
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [last, ...state.redoStack],
        });
        return last;
    },

    redo: () => {
        const state = get();
        const next = state.redoStack[0];
        if (!next) return null;
        set({
            undoStack: [...state.undoStack, next],
            redoStack: state.redoStack.slice(1),
        });
        return next;
    },

    clearHistory: () => set({ undoStack: [], redoStack: [] }),
}));
