import { create } from 'zustand';
import { applyPatchToHtml, type HtmlPatch } from '../utils/htmlPatcher';

export interface SelectedElementInfo {
    uid: string;
    tagName: string;
    classList: string[];
    attributes: Record<string, string>;
    inlineStyle: Record<string, string>;
    textContent: string;
    computedStyle: {
        color?: string;
        backgroundColor?: string;
        fontSize?: string;
        fontWeight?: string;
        lineHeight?: string;
        letterSpacing?: string;
        textAlign?: string;
        borderRadius?: string;
        padding?: string;
        paddingTop?: string;
        paddingRight?: string;
        paddingBottom?: string;
        paddingLeft?: string;
        margin?: string;
        marginTop?: string;
        marginRight?: string;
        marginBottom?: string;
        marginLeft?: string;
        width?: string;
        height?: string;
        borderColor?: string;
        borderWidth?: string;
        opacity?: string;
        boxShadow?: string;
        display?: string;
        position?: string;
        zIndex?: string;
        justifyContent?: string;
        alignItems?: string;
        gap?: string;
    };
    rect: { x: number; y: number; width: number; height: number };
    elementType: 'text' | 'button' | 'image' | 'container' | 'input' | 'icon' | 'badge';
    breadcrumb?: { uid: string; tagName: string }[];
}

export interface AiEditHistoryItem {
    id: string;
    screenId: string;
    uid: string;
    tagName: string;
    elementType: SelectedElementInfo['elementType'];
    prompt: string;
    description?: string;
    createdAt: string;
}

interface EditState {
    isEditMode: boolean;
    screenId: string | null;
    selected: SelectedElementInfo | null;
    baseHtml: string | null;
    patches: HtmlPatch[];
    pointer: number;
    reloadTick: number;
    refreshAllTick: number;
    aiEditHistoryByScreen: Record<string, AiEditHistoryItem[]>;

    enterEdit: (screenId: string, baseHtml: string) => void;
    setActiveScreen: (screenId: string, baseHtml: string) => void;
    exitEdit: () => void;
    setSelected: (info: SelectedElementInfo | null) => void;
    pushPatch: (patch: HtmlPatch) => void;
    undo: () => void;
    redo: () => void;
    applyPatchAndRebuild: (patch: HtmlPatch) => string | null;
    undoAndRebuild: () => string | null;
    redoAndRebuild: () => string | null;
    rebuildHtml: () => string | null;
    clearHistory: () => void;
    addAiEditHistory: (item: AiEditHistoryItem) => void;
}

function rebuildFrom(baseHtml: string | null, patches: HtmlPatch[], pointer: number): string | null {
    if (!baseHtml) return null;
    return patches.slice(0, pointer).reduce((html, patch) => {
        return applyPatchToHtml(html, patch);
    }, baseHtml);
}

export const useEditStore = create<EditState>((set, get) => ({
    isEditMode: false,
    screenId: null,
    selected: null,
    baseHtml: null,
    patches: [],
    pointer: 0,
    reloadTick: 0,
    refreshAllTick: 0,
    aiEditHistoryByScreen: {},

    enterEdit: (screenId, baseHtml) => set({ isEditMode: true, screenId, selected: null, baseHtml, patches: [], pointer: 0 }),
    setActiveScreen: (screenId, baseHtml) => set(state => ({
        screenId,
        baseHtml,
        selected: null,
        patches: [],
        pointer: 0,
        reloadTick: state.reloadTick + 1,
    })),
    exitEdit: () => set(state => ({
        isEditMode: false,
        screenId: null,
        selected: null,
        baseHtml: null,
        patches: [],
        pointer: 0,
        refreshAllTick: state.refreshAllTick + 1,
    })),
    setSelected: (selected) => set({ selected }),

    pushPatch: (patch) => set(state => ({
        patches: [...state.patches.slice(0, state.pointer), patch],
        pointer: state.pointer + 1,
    })),

    undo: () => set(state => ({ pointer: Math.max(0, state.pointer - 1), reloadTick: state.reloadTick + 1 })),
    redo: () => set(state => ({ pointer: Math.min(state.patches.length, state.pointer + 1), reloadTick: state.reloadTick + 1 })),
    applyPatchAndRebuild: (patch) => {
        const state = get();
        const nextPatches = [...state.patches.slice(0, state.pointer), patch];
        const nextPointer = state.pointer + 1;
        set({ patches: nextPatches, pointer: nextPointer });
        return rebuildFrom(state.baseHtml, nextPatches, nextPointer);
    },
    undoAndRebuild: () => {
        const state = get();
        const nextPointer = Math.max(0, state.pointer - 1);
        set({ pointer: nextPointer, reloadTick: state.reloadTick + 1 });
        return rebuildFrom(state.baseHtml, state.patches, nextPointer);
    },
    redoAndRebuild: () => {
        const state = get();
        const nextPointer = Math.min(state.patches.length, state.pointer + 1);
        set({ pointer: nextPointer, reloadTick: state.reloadTick + 1 });
        return rebuildFrom(state.baseHtml, state.patches, nextPointer);
    },
    rebuildHtml: () => {
        const state = get();
        return rebuildFrom(state.baseHtml, state.patches, state.pointer);
    },
    clearHistory: () => set({ patches: [], pointer: 0 }),
    addAiEditHistory: (item) => set((state) => {
        const current = state.aiEditHistoryByScreen[item.screenId] || [];
        const next = [item, ...current].slice(0, 50);
        return {
            aiEditHistoryByScreen: {
                ...state.aiEditHistoryByScreen,
                [item.screenId]: next,
            }
        };
    }),
}));
