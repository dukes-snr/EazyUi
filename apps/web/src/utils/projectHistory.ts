import type { CanvasDoc } from '@eazyui/shared';
import type { HtmlDesignSpec } from '../api/client';
import type { CanvasHistorySnapshot } from '../stores/history-store';
import { useCanvasStore, useDesignStore, useHistoryStore } from '../stores';

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export function createProjectHistorySnapshot(
    spec: HtmlDesignSpec | null,
    doc: CanvasDoc
): CanvasHistorySnapshot {
    return {
        spec: spec ? clone(spec) : null,
        doc: clone({
            ...doc,
            selection: {
                selectedBoardId: null,
                selectedNodeIds: [],
                hoveredNodeId: null,
            },
            history: {
                specPatches: [],
                specPatchIndex: -1,
                canvasPatches: [],
                canvasPatchIndex: -1,
            },
        }),
    };
}

export function recordProjectHistorySnapshot() {
    const spec = useDesignStore.getState().spec;
    const doc = useCanvasStore.getState().doc;
    useHistoryStore.getState().recordSnapshot(createProjectHistorySnapshot(spec, doc));
}

export function resetProjectHistorySnapshot(
    spec: HtmlDesignSpec | null,
    doc: CanvasDoc
) {
    const history = useHistoryStore.getState();
    history.clearHistory();
    history.recordSnapshot(createProjectHistorySnapshot(spec, doc));
}

export function restoreProjectHistorySnapshot(snapshot: CanvasHistorySnapshot) {
    const currentDoc = useCanvasStore.getState().doc;
    useDesignStore.getState().setSpec(snapshot.spec as HtmlDesignSpec, { history: 'skip' });
    useCanvasStore.getState().setDoc({
        ...snapshot.doc,
        docId: currentDoc.docId,
        viewport: currentDoc.viewport,
        selection: {
            selectedBoardId: null,
            selectedNodeIds: [],
            hoveredNodeId: null,
        },
        history: currentDoc.history,
    });
    useCanvasStore.getState().triggerExternalUpdate();
}
