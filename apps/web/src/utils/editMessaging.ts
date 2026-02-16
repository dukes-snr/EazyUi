import type { HtmlPatch } from './htmlPatcher';

function getIframeByScreenId(screenId: string) {
    return document.querySelector(`iframe[data-screen-id="${screenId}"]`) as HTMLIFrameElement | null;
}

export function clearSelectionOnOtherScreens(activeScreenId: string) {
    const iframes = Array.from(document.querySelectorAll('iframe[data-screen-id]')) as HTMLIFrameElement[];
    for (const iframe of iframes) {
        const screenId = iframe.getAttribute('data-screen-id');
        if (!screenId || screenId === activeScreenId) continue;
        iframe.contentWindow?.postMessage({ type: 'editor/clear_selection', screenId }, '*');
    }
}

export function dispatchPatchToIframe(screenId: string, patch: HtmlPatch) {
    const iframe = getIframeByScreenId(screenId);
    iframe?.contentWindow?.postMessage({ type: 'editor/patch', screenId, patch }, '*');
}

export function dispatchSelectParent(screenId: string, uid: string) {
    const iframe = getIframeByScreenId(screenId);
    iframe?.contentWindow?.postMessage({ type: 'editor/select_parent', screenId, uid }, '*');
}

export function dispatchSelectUid(screenId: string, uid: string) {
    const iframe = getIframeByScreenId(screenId);
    iframe?.contentWindow?.postMessage({ type: 'editor/select_uid', screenId, uid }, '*');
}

export function dispatchSelectScreenContainer(screenId: string) {
    const iframe = getIframeByScreenId(screenId);
    iframe?.contentWindow?.postMessage({ type: 'editor/select_screen_container', screenId }, '*');
}

export function dispatchDeleteSelected(screenId: string) {
    const iframe = getIframeByScreenId(screenId);
    iframe?.contentWindow?.postMessage({ type: 'editor/delete_selected', screenId }, '*');
}
