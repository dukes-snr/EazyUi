import { Handle, Position, NodeProps, NodeToolbar } from '@xyflow/react';
import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useDesignStore, useChatStore, useCanvasStore, useEditStore, useUiStore } from '../../stores';
import { apiClient } from '../../api/client';
import Grainient from '../ui/Grainient';
import { DeviceToolbar } from './DeviceToolbar';
import { ensureEditableUids } from '../../utils/htmlPatcher';
import { getPreferredTextModel } from '../../constants/designModels';
import '../../styles/DeviceFrames.css';

function injectHeightScript(html: string, screenId: string) {
    const script = `
<script>
  const reportHeight = () => {
    const height = document.documentElement.scrollHeight || document.body.scrollHeight;
    window.parent.postMessage({ type: 'resize', height, screenId: '${screenId}' }, '*');
  };
  window.onload = reportHeight;
  const resizeObserver = new ResizeObserver(reportHeight);
  resizeObserver.observe(document.body);
</script>`;

    if (html.includes('</body>')) {
        return html.replace('</body>', `${script}\n</body>`);
    }
    return `${html}\n${script}`;
}

function injectScrollbarHide(html: string) {
    const styleTag = `
<style>
  ::-webkit-scrollbar { width: 0; height: 0; }
  ::-webkit-scrollbar-thumb { background: transparent; }
  body { -ms-overflow-style: none; scrollbar-width: none; }
</style>`;

    if (html.includes('</head>')) {
        return html.replace('</head>', `${styleTag}\n</head>`);
    }
    return `${styleTag}\n${html}`;
}

function injectEditorScript(html: string, screenId: string) {
    const script = `
<script>
(function() {
  const SCREEN_ID = ${JSON.stringify(screenId)};
  const EDIT_SELECTOR = '[data-editable="true"]';

  const style = document.createElement('style');
  style.textContent = EDIT_SELECTOR + ' { cursor: pointer; }\\n' +
    '.__eazyui-hover { position: absolute; border: 2px dashed rgba(99,102,241,.9); box-shadow: 0 0 0 1px rgba(99,102,241,.4); pointer-events: none; z-index: 999999; }\\n' +
    '.__eazyui-selected { position: absolute; border: 2px solid rgba(16,185,129,.95); box-shadow: 0 0 0 1px rgba(16,185,129,.4); pointer-events: none; z-index: 999999; }\\n' +
    '.__eazyui-selection-hud { position: absolute; display: none; align-items: center; justify-content: space-between; gap: 6px; padding: 0; background: transparent; border: none; transform: translateY(-100%); pointer-events: auto; z-index: 1000000; }\\n' +
    '.__eazyui-selection-hud-tag { text-transform: lowercase; font-weight: 600; color: #f8fafc; border: 1px solid rgba(20,184,166,.45); border-radius: 6px; background: rgba(15,23,42,.96); padding: 4px 8px; }\\n' +
    '.__eazyui-selection-hud-btn { all: unset; cursor: pointer; color: #fecaca; font-size: 11px; font-weight: 600; line-height: 1; border: 1px solid rgba(248,113,113,.45); border-radius: 6px; background: rgba(127,29,29,.72); padding: 4px 8px; }\\n' +
    '.__eazyui-selection-hud-btn:hover { background: rgba(153,27,27,.85); color: #fee2e2; }\\n' +
    '.__eazyui-hover-tag { position: absolute; display: none; transform: translateY(-100%); text-transform: lowercase; font-weight: 600; font-size: 11px; line-height: 1; color: #dbeafe; border: 1px solid rgba(59,130,246,.5); border-radius: 6px; background: rgba(30,58,138,.82); padding: 4px 8px; pointer-events: none; z-index: 1000000; }';
  document.head.appendChild(style);

  const hoverBox = document.createElement('div');
  hoverBox.className = '__eazyui-hover';
  hoverBox.style.display = 'none';
  const hoverTag = document.createElement('div');
  hoverTag.className = '__eazyui-hover-tag';
  hoverTag.style.display = 'none';
  const selectBox = document.createElement('div');
  selectBox.className = '__eazyui-selected';
  selectBox.style.display = 'none';
  const selectionHud = document.createElement('div');
  selectionHud.className = '__eazyui-selection-hud';
  const selectionHudTag = document.createElement('span');
  selectionHudTag.className = '__eazyui-selection-hud-tag';
  const selectionHudDelete = document.createElement('button');
  selectionHudDelete.type = 'button';
  selectionHudDelete.className = '__eazyui-selection-hud-btn';
  selectionHudDelete.title = 'Delete selected element';
  selectionHudDelete.textContent = 'Delete';
  selectionHud.appendChild(selectionHudTag);
  selectionHud.appendChild(selectionHudDelete);
  document.body.appendChild(hoverBox);
  document.body.appendChild(hoverTag);
  document.body.appendChild(selectBox);
  document.body.appendChild(selectionHud);

  let hoverEl = null;
  let selectedEl = null;
  const ROOT_TAGS = new Set(['html', 'body']);

  function getDeviceFrameRadius() {
    try {
      const iframeEl = window.frameElement;
      const ownerDoc = iframeEl && iframeEl.ownerDocument;
      if (!ownerDoc || !iframeEl) return '';
      const screenEl = iframeEl.closest && iframeEl.closest('.iphone-screen');
      if (!screenEl) return '';
      return window.getComputedStyle(screenEl).borderRadius || '';
    } catch {
      return '';
    }
  }

  function setBox(box, el) {
    if (!el) {
      box.style.display = 'none';
      if (box === hoverBox) {
        hoverTag.style.display = 'none';
      }
      if (box === selectBox) {
        selectionHud.style.display = 'none';
      }
      return;
    }
    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    box.style.display = 'block';
    box.style.left = rect.left + scrollX + 'px';
    box.style.top = rect.top + scrollY + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
    const tag = (el.tagName || '').toLowerCase();
    const isSelectedBox = box.classList && box.classList.contains('__eazyui-selected');
    if (isSelectedBox && ROOT_TAGS.has(tag)) {
      const frameRadius = getDeviceFrameRadius();
      box.style.borderRadius = frameRadius || window.getComputedStyle(el).borderRadius;
    } else {
      box.style.borderRadius = window.getComputedStyle(el).borderRadius;
    }

    if (isSelectedBox) {
      selectionHud.style.display = 'flex';
      selectionHud.style.left = rect.left + scrollX + 'px';
      selectionHud.style.top = rect.top + scrollY + 'px';
      selectionHudTag.textContent = tag || 'element';
      return;
    }

    if (box === hoverBox) {
      if (!selectedEl) {
        hoverTag.style.display = 'block';
        hoverTag.style.left = rect.left + scrollX + 'px';
        hoverTag.style.top = rect.top + scrollY + 'px';
        hoverTag.textContent = tag || 'element';
      } else {
        hoverTag.style.display = 'none';
      }
    }
  }

  function ensureUid(el) {
    if (!el.getAttribute('data-editable')) {
      el.setAttribute('data-editable', 'true');
    }
    if (!el.getAttribute('data-uid')) {
      el.setAttribute('data-uid', 'uid_' + Math.random().toString(36).slice(2, 10));
    }
    return el.getAttribute('data-uid');
  }

  function getScreenContainer() {
    const body = document.body;
    if (!body) return null;
    body.setAttribute('data-editable', 'true');
    body.setAttribute('data-screen-root', 'true');
    ensureUid(body);

    let child = body.firstElementChild;
    while (child) {
      if (child.matches && child.matches(EDIT_SELECTOR)) return child;
      child = child.nextElementSibling;
    }
    return body;
  }

  function classifyElement(el) {
    const tag = el.tagName.toLowerCase();
    const textLikeTags = ['h1','h2','h3','h4','h5','h6','p','label','small','strong','em','b','i'];
    if (tag === 'img') return 'image';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input';
    if (tag === 'button' || tag === 'a') return 'button';
    if (tag === 'span' && el.className && String(el.className).includes('material-symbols')) return 'icon';
    if (el.className && String(el.className).includes('badge')) return 'badge';
    if (textLikeTags.includes(tag)) return 'text';
    if (tag === 'span') {
      const hasElementChildren = Array.from(el.childNodes || []).some((n) => n.nodeType === 1);
      const textContent = (el.textContent || '').trim();
      if (!hasElementChildren && textContent.length > 0) return 'text';
    }
    return 'container';
  }

  function buildBreadcrumb(el) {
    const path = [];
    let current = el;
    while (current && current.matches && current.matches(EDIT_SELECTOR)) {
      path.push({ uid: ensureUid(current), tagName: current.tagName });
      current = current.parentElement;
      while (current && current.matches && !current.matches(EDIT_SELECTOR)) {
        current = current.parentElement;
      }
    }
    return path;
  }

  function getAttributes(el) {
    const attrs = {};
    if (!el.attributes) return attrs;
    Array.from(el.attributes).forEach(attr => {
      attrs[attr.name] = attr.value;
    });
    return attrs;
  }

  function buildInfo(el) {
    const uid = ensureUid(el);
    const cs = window.getComputedStyle(el);
    const textValue = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? (el.value || '') : (el.textContent || '');
    return {
      uid,
      tagName: el.tagName,
      elementType: classifyElement(el),
      classList: Array.from(el.classList),
      attributes: getAttributes(el),
      inlineStyle: (el.getAttribute('style') || '').split(';').reduce((acc, cur) => {
        const [k, v] = cur.split(':').map(s => s && s.trim());
        if (k && v) acc[k] = v;
        return acc;
      }, {}),
      textContent: textValue.trim().slice(0, 240),
      computedStyle: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        textAlign: cs.textAlign,
        borderRadius: cs.borderRadius,
        padding: cs.padding,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        margin: cs.margin,
        marginTop: cs.marginTop,
        marginRight: cs.marginRight,
        marginBottom: cs.marginBottom,
        marginLeft: cs.marginLeft,
        width: cs.width,
        height: cs.height,
        borderColor: cs.borderColor,
        borderWidth: cs.borderWidth,
        opacity: cs.opacity,
        boxShadow: cs.boxShadow,
        display: cs.display,
        position: cs.position,
        zIndex: cs.zIndex,
        justifyContent: cs.justifyContent,
        alignItems: cs.alignItems,
        gap: cs.gap,
      },
      rect: {
        x: el.getBoundingClientRect().x,
        y: el.getBoundingClientRect().y,
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      },
      breadcrumb: buildBreadcrumb(el),
    };
  }

  function selectElement(el) {
    if (!el) {
      selectedEl = null;
      setBox(selectBox, null);
      return;
    }
    selectedEl = el;
    setBox(selectBox, selectedEl);
    window.parent.postMessage({ type: 'editor/select', screenId: SCREEN_ID, payload: buildInfo(el) }, '*');
  }

  function clearSelection() {
    selectedEl = null;
    setBox(selectBox, null);
  }

  function requestDeleteSelection() {
    if (!selectedEl) return;
    const tag = (selectedEl.tagName || '').toLowerCase();
    if (ROOT_TAGS.has(tag)) return;
    const uid = selectedEl.getAttribute('data-uid');
    if (!uid) return;
    window.parent.postMessage({ type: 'editor/request_delete', screenId: SCREEN_ID, uid }, '*');
  }

  function getEditable(el) {
    if (!el) return null;
    if (el.closest) return el.closest(EDIT_SELECTOR);
    return null;
  }

  document.addEventListener('mousemove', (event) => {
    const target = getEditable(event.target);
    if (target !== hoverEl) {
      hoverEl = target;
      setBox(hoverBox, hoverEl);
    }
  }, true);

  document.addEventListener('mouseleave', () => setBox(hoverBox, null), true);

  document.addEventListener('click', (event) => {
    if (selectionHud.contains(event.target) || hoverTag.contains(event.target)) {
      return;
    }
    const target = getEditable(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(target);
  }, true);

  selectionHudDelete.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestDeleteSelection();
  });

  window.addEventListener('scroll', () => {
    if (hoverEl) setBox(hoverBox, hoverEl);
    if (selectedEl) setBox(selectBox, selectedEl);
  }, true);
  window.addEventListener('resize', () => {
    if (hoverEl) setBox(hoverBox, hoverEl);
    if (selectedEl) setBox(selectBox, selectedEl);
  });

  window.__applyPatch = function(patch) {
    if (!patch || !patch.uid) return;
    const target = document.querySelector('[data-uid="' + patch.uid + '"]');
    if (!target) return;
    if (patch.op === 'set_text') {
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        target.value = patch.text || '';
      } else {
        target.textContent = patch.text || '';
      }
    }
    if (patch.op === 'set_style') {
      Object.entries(patch.style || {}).forEach(([k, v]) => {
        target.style.setProperty(k, v);
      });
    }
    if (patch.op === 'set_attr') {
      Object.entries(patch.attr || {}).forEach(([k, v]) => {
        target.setAttribute(k, v);
      });
    }
    if (patch.op === 'set_classes') {
      (patch.remove || []).forEach((cls) => target.classList.remove(cls));
      (patch.add || []).forEach((cls) => target.classList.add(cls));
    }
    if (patch.op === 'delete_node') {
      const deletingSelected = selectedEl && selectedEl === target;
      target.remove();
      if (deletingSelected) {
        clearSelection();
        const container = getScreenContainer();
        if (container) selectElement(container);
      }
      return;
    }
    if (selectedEl && selectedEl === target) {
      setBox(selectBox, selectedEl);
      window.parent.postMessage({ type: 'editor/select', screenId: SCREEN_ID, payload: buildInfo(target) }, '*');
    }
  };

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.screenId !== SCREEN_ID) return;
    if (data.type === 'editor/patch') {
      window.__applyPatch(data.patch);
    }
    if (data.type === 'editor/select_parent') {
      if (!selectedEl) return;
      let parent = selectedEl.parentElement;
      while (parent && !parent.matches(EDIT_SELECTOR)) {
        parent = parent.parentElement;
      }
      if (parent) selectElement(parent);
    }
    if (data.type === 'editor/select_uid') {
      const target = document.querySelector('[data-uid="' + data.uid + '"]');
      if (target) selectElement(target);
    }
    if (data.type === 'editor/select_screen_container') {
      const container = getScreenContainer();
      if (container) selectElement(container);
    }
    if (data.type === 'editor/clear_selection') {
      clearSelection();
    }
    if (data.type === 'editor/delete_selected') {
      requestDeleteSelection();
    }
  });

  const majorTags = 'html,body,header,nav,main,section,article,aside,footer,div,p,span,h1,h2,h3,h4,h5,h6,button,a,img,input,textarea,select,label,ul,ol,li,figure,figcaption,form,table,thead,tbody,tr,td,th';
  document.querySelectorAll(majorTags).forEach((el) => {
    if (!el.getAttribute('data-editable')) el.setAttribute('data-editable', 'true');
    if (!el.getAttribute('data-uid')) el.setAttribute('data-uid', 'uid_' + Math.random().toString(36).slice(2, 10));
  });
  if (document.body && !document.body.getAttribute('data-screen-root')) {
    document.body.setAttribute('data-screen-root', 'true');
  }
})();
</script>`;

    if (html.includes('</body>')) {
        return html.replace('</body>', `${script}\n</body>`);
    }
    return `${html}\n${script}`;
}

// Custom Node for displaying the HTML screen with responsive frames
export const DeviceNode = memo(({ data, selected }: NodeProps) => {
    const { updateScreen, removeScreen } = useDesignStore();
    const { addMessage, updateMessage, setGenerating, setAbortController } = useChatStore();
    const { removeBoard, doc, setFocusNodeId, setFocusNodeIds } = useCanvasStore();
    const { isEditMode, screenId: editScreenId, enterEdit, setActiveScreen, rebuildHtml, reloadTick, refreshAllTick } = useEditStore();
    const { modelProfile } = useUiStore();
    const selectedCount = doc.selection.selectedNodeIds.length;
    const width = (data.width as number) || 375;
    const initialHeight = (data.height as number) || 812;
    const [contentHeight, setContentHeight] = useState(initialHeight);
    const handleAction = useCallback(async (action: string, payload?: any) => {
        if (!data.screenId) return;

        switch (action) {
            case 'desktop':
                updateScreen(data.screenId as string, data.html as string, undefined, 1280, 800);
                break;
            case 'tablet':
                updateScreen(data.screenId as string, data.html as string, undefined, 768, 1024);
                break;
            case 'mobile':
                updateScreen(data.screenId as string, data.html as string, undefined, 375, 812);
                break;
            case 'submit-edit':
                const editPayload = typeof payload === 'string'
                    ? { instruction: payload, images: [] as string[] }
                    : {
                        instruction: String(payload?.instruction || ''),
                        images: Array.isArray(payload?.images) ? payload.images as string[] : [] as string[],
                    };
                const instruction = editPayload.instruction;
                const images = editPayload.images;
                let assistantMsgId = '';

                const screenRef = {
                    id: data.screenId as string,
                    label: data.label as string || 'screen',
                    type: isDesktop ? 'desktop' : isTablet ? 'tablet' : 'mobile'
                } as const;

                try {
                    setGenerating(true);
                    // Add to chat history
                    const userMsgId = addMessage('user', instruction, images, screenRef);
                    assistantMsgId = addMessage('assistant', `Applying edits to **${data.label || 'screen'}**...`, undefined, screenRef);
                    updateMessage(userMsgId, {
                        meta: {
                            screenSnapshots: {
                                [data.screenId as string]: {
                                    screenId: data.screenId as string,
                                    name: data.label as string || 'screen',
                                    html: data.html as string,
                                    width,
                                    height: initialHeight,
                                }
                            }
                        }
                    });
                    updateMessage(assistantMsgId, { meta: { livePreview: true } });

                    // Start loading state
                    setFocusNodeId(data.screenId as string);
                    updateScreen(data.screenId as string, data.html as string, 'streaming');

                    const controller = new AbortController();
                    setAbortController(controller);
                    const response = await apiClient.edit({
                        instruction,
                        html: data.html as string,
                        screenId: data.screenId as string,
                        images,
                        preferredModel: getPreferredTextModel(modelProfile),
                    }, controller.signal);

                    // Update with new content
                    updateScreen(data.screenId as string, response.html, 'complete');
                    if (isEditMode && editScreenId === data.screenId) {
                        setActiveScreen(data.screenId as string, response.html);
                    }
                    setFocusNodeIds([data.screenId as string]);

                    // Update chat message
                    updateMessage(assistantMsgId, {
                        content: response.description?.trim()
                            ? response.description
                            : `Updated **${data.label || 'screen'}** based on your instruction: "${instruction}"`,
                        status: 'complete'
                    });
                } catch (error) {
                    console.error('Failed to edit screen:', error);
                    updateScreen(data.screenId as string, data.html as string, 'complete');

                    if (assistantMsgId) {
                        updateMessage(assistantMsgId, {
                            content: `Failed to update **${data.label || 'screen'}**: ${(error as Error).message}`,
                            status: 'error'
                        });
                    }
                    if ((error as Error).name !== 'AbortError') {
                        alert('Failed to edit screen. Please try again.');
                    }
                } finally {
                    setAbortController(null);
                    setGenerating(false);
                }
                break;
            case 'delete':
                if (confirm('Are you sure you want to delete this screen?')) {
                    removeScreen(data.screenId as string);
                    removeBoard(data.screenId as string);
                }
                break;
            case 'regenerate':
                const regenImages = Array.isArray(payload?.images) ? payload.images as string[] : [];
                handleAction(
                    'submit-edit',
                    {
                        instruction: 'Regenerate this exact screen only using the current HTML as source of truth. Keep the same screen purpose, information architecture, and core sections, while improving visual quality and polish. Do not turn it into a different screen.',
                        images: regenImages,
                    }
                );
                break;
            case 'focus':
                setFocusNodeId(data.screenId as string);
                break;
            case 'save':
                console.log('Save action');
                break;
            case 'edit':
                if (data.html && data.screenId) {
                    if (isEditMode && editScreenId && editScreenId !== data.screenId) {
                        const rebuilt = rebuildHtml();
                        if (rebuilt) {
                            updateScreen(editScreenId, rebuilt);
                        }
                    }
                    const ensured = ensureEditableUids(data.html as string);
                    if (ensured !== data.html) {
                        updateScreen(data.screenId as string, ensured, data.status as any, width, initialHeight, data.label as string);
                    }
                    setFocusNodeId(data.screenId as string);
                    enterEdit(data.screenId as string, ensured);
                }
                break;
        }
    }, [data.screenId, data.html, updateScreen, addMessage, updateMessage, data.label, enterEdit, setActiveScreen, rebuildHtml, isEditMode, editScreenId, data.status, width, initialHeight, setFocusNodeId, setFocusNodeIds, setGenerating, setAbortController, modelProfile]);
    const isStreaming = data.status === 'streaming';
    const isEditingScreen = isEditMode && editScreenId === data.screenId;

    // Determine device type based on width
    const isDesktop = width >= 1024;
    const isTablet = width >= 600 && width < 1024;

    // Use initial height if not desktop, or if we haven't measured yet
    const displayHeight = isDesktop ? Math.max(contentHeight, initialHeight) : initialHeight;

    // Message listener for height updates
    useEffect(() => {
        if (!isDesktop) return;

        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'resize' && event.data?.screenId === data.screenId) {
                const newHeight = event.data.height;
                if (newHeight && newHeight > 100) {
                    setContentHeight(newHeight);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [isDesktop, data.screenId]);

    // Reset height when html changes or is no longer streaming
    useEffect(() => {
        if (!isStreaming) {
            // Give it a moment to stabilize
            const timer = setTimeout(() => {
                // We'll rely on the injected script for updates
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [data.html, isStreaming]);

    // Inject height-reporting script into the HTML
    // We only do this for Desktop to allow "infinite" scroll height
    const baseHtml = injectScrollbarHide(data.html as string);
    const withEditor = isEditingScreen && data.screenId ? injectEditorScript(baseHtml, data.screenId as string) : baseHtml;
    const injectedHtml = isDesktop && data.screenId
        ? injectHeightScript(withEditor, data.screenId as string)
        : withEditor;
    const injectedHtmlWithNonce = `${injectedHtml}\n<!--eazyui-render:${isEditMode ? 'edit' : 'view'}:${refreshAllTick}-->`;

    const [stableSrcDoc, setStableSrcDoc] = useState(injectedHtmlWithNonce);
    const wasEditingRef = useRef(false);
    const lastReloadTickRef = useRef(reloadTick);
    useEffect(() => {
        if (isEditingScreen) {
            const reloadRequested = lastReloadTickRef.current !== reloadTick;
            if (!wasEditingRef.current || reloadRequested) {
                setStableSrcDoc(injectedHtmlWithNonce);
            }
        } else {
            setStableSrcDoc(injectedHtmlWithNonce);
        }
        wasEditingRef.current = isEditingScreen;
        lastReloadTickRef.current = reloadTick;
    }, [injectedHtmlWithNonce, isEditingScreen, reloadTick]);

    // Frame Configuration
    let borderWidth = 8;
    let showBrowserHeader = false;

    if (isDesktop) {
        borderWidth = 1; // Thin border
        showBrowserHeader = true;
    } else if (isTablet) {
        borderWidth = 12; // Thicker uniform bezel
    } else {
        borderWidth = 8;
    }

    const frameWidth = width + (isDesktop ? 0 : borderWidth * 2);
    const frameHeight = displayHeight + (isDesktop ? 40 : borderWidth * 2); // 40px for browser header

    // Unified premium frame

    return (
        <div className={`device-node-container relative transition-all duration-300 group ${isEditMode && !isEditingScreen ? 'opacity-40' : ''}`}>
            <NodeToolbar
                isVisible={selected && selectedCount === 1}
                position={Position.Top}
                offset={50}
            >
                <DeviceToolbar
                    screenId={data.screenId as string}
                    onAction={handleAction}
                />
            </NodeToolbar>

            {/* Premium iPhone/Desktop/Tablet Frame */}
            <div
                className={`iphone-frame ${selected ? 'selected' : ''}`}
                style={{
                    width: frameWidth,
                    height: frameHeight,
                    ['--custom-radius' as any]: isDesktop ? '16px' : '44px'
                }}
            >
                {/* Hardware Buttons (Mobile/Tablet only) */}
                {!isDesktop && (
                    <div className="iphone-buttons">
                        <div className="iphone-button iphone-button-silent" />
                        <div className="iphone-button iphone-button-vol-up" />
                        <div className="iphone-button iphone-button-vol-down" />
                        <div className="iphone-button iphone-button-power" />
                    </div>
                )}

                {/* Outer Bezel (Black area) */}
                <div className="iphone-bezel" />

                {/* Dynamic Notch (Mobile/Tablet only) */}
                {/* {!isDesktop && <div className="iphone-notch" />} */}

                {/* Screen Content */}
                <div
                    className="iphone-screen"
                    style={{
                        top: borderWidth,
                        bottom: borderWidth,
                        left: borderWidth,
                        right: borderWidth,
                        borderRadius: isDesktop ? '12px' : 'calc(var(--iphone-radius) - 6px)',
                        overflow: 'hidden',
                    }}
                >
                    {/* Desktop Browser Header */}
                    {isDesktop && showBrowserHeader && (
                        <div
                            className="absolute top-0 left-0 w-full h-10 bg-[var(--ui-surface-2)] flex items-center px-4 gap-2 border-b border-[var(--ui-border)] z-10"
                            style={{ borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}
                        >
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                            </div>
                            <div className="flex-1 mx-4 h-6 bg-[var(--ui-surface-3)] rounded flex items-center justify-center text-[9px] text-[var(--ui-text-subtle)] font-medium">
                                {data.screenId ? `eazyui.dev/preview/${data.screenId}` : 'localhost:3000'}
                            </div>
                        </div>
                    )}

                    <div style={{ position: 'absolute', top: isDesktop && showBrowserHeader ? 40 : 0, left: 0, right: 0, bottom: 0 }}>
                        <iframe
                            srcDoc={stableSrcDoc}
                            title="Preview"
                            data-screen-id={data.screenId}
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                pointerEvents: isEditingScreen ? 'auto' : 'none',
                                opacity: isStreaming ? 0 : 1,
                                transition: 'opacity 0.5s ease-in-out',
                            }}
                            sandbox="allow-scripts allow-same-origin"
                        />
                    </div>

                    {/* Loading State Overlay */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            zIndex: 30,
                            backgroundColor: 'var(--ui-surface-2)',
                            opacity: isStreaming ? 1 : 0,
                            pointerEvents: isStreaming ? 'auto' : 'none',
                            transition: 'opacity 0.7s ease-in-out',
                        }}
                    >
                        {(isStreaming || data.status === 'complete') && (
                            <Grainient
                                color1="#394056"
                                color2="#2366be"
                                color3="#f7f7f7"
                                timeSpeed={4}
                                grainAmount={0.2}
                                zoom={1.5}
                                className="w-full h-full"
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Handles (Hidden but functional for selection/connecting) */}
            <Handle type="source" position={Position.Right} className="opacity-0 pointer-events-none" />
            <Handle type="target" position={Position.Left} className="opacity-0 pointer-events-none" />

            {/* Label (Top Left outside frame) */}
            <div className={`absolute -top-8 left-0 text-xs font-medium transition-colors duration-200 ${selected ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)]'}`}>
                {data.label as string}
                <span className="ml-2 opacity-50 text-[10px] uppercase tracking-wider">
                    {isDesktop ? 'Desktop' : isTablet ? 'Tablet' : 'Mobile'}
                </span>
            </div>
        </div>
    );
});
