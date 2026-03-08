import { Handle, Position, NodeProps, NodeToolbar } from '@xyflow/react';
import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDesignStore, useChatStore, useCanvasStore, useEditStore, useProjectStore, useUiStore } from '../../stores';
import { apiClient } from '../../api/client';
import { ImagePlus } from 'lucide-react';
import Grainient from '../ui/Grainient';
import { DeviceToolbar } from './DeviceToolbar';
import { ensureEditableUids } from '../../utils/htmlPatcher';
import { getPreferredTextModel } from '../../constants/designModels';
import '../../styles/DeviceFrames.css';

// Streaming preview tuning:
// - Overlay is disabled by default so users can watch progressive element construction.
// - Throttle streaming iframe srcDoc updates to reduce flashing/reload jitter.
const SHOW_STREAMING_OVERLAY = false;
const SMOOTH_STREAMING_PREVIEW = true;
const STREAMING_PREVIEW_THROTTLE_MS = 320;
const BUFFERED_STREAMING_PREVIEW = false;
const MATERIAL_SYMBOLS_STYLESHEET_HREF = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&family=Material+Symbols+Sharp:opsz,wght,FILL,GRAD@24,400,0,0&display=block';
const MATERIAL_ICON_STYLESHEET_HREFS = [
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Outlined',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Sharp',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Two+Tone',
];
const MATERIAL_ICON_VISIBILITY_SELECTORS = [
    '.material-symbols-outlined',
    '.material-symbols-rounded',
    '.material-symbols-sharp',
    '.material-icons',
    '.material-icons-outlined',
    '.material-icons-round',
    '.material-icons-sharp',
    '.material-icons-two-tone',
].join(',\n  ');
const MATERIAL_ICON_HIDDEN_SELECTORS = MATERIAL_ICON_VISIBILITY_SELECTORS
    .split(',\n  ')
    .map((selector) => `html[data-eazyui-icons-ready="0"] ${selector}`)
    .join(',\n  ');

function injectHeightScript(html: string, screenId: string) {
    const script = `
<script>
  (function() {
    const SCREEN_ID = '${screenId}';
    const MIN_HEIGHT = 320;
    const MAX_HEIGHT = 12000;
    let rafId = 0;

    const clamp = (value) => Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(value || MIN_HEIGHT)));

    const computeFullHeight = () => {
      const body = document.body;
      const html = document.documentElement;
      const metrics = [
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        body ? body.clientHeight : 0,
        html ? html.scrollHeight : 0,
        html ? html.offsetHeight : 0,
        html ? html.clientHeight : 0,
      ];

      let maxBottom = 0;
      const all = document.body ? document.body.querySelectorAll('*') : [];
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        const bottom = rect.bottom + (window.scrollY || 0);
        if (Number.isFinite(bottom)) maxBottom = Math.max(maxBottom, bottom);
      }
      metrics.push(maxBottom);
      return clamp(Math.max(...metrics));
    };

    const reportHeight = () => {
      const height = computeFullHeight();
      window.parent.postMessage({ type: 'resize', height, screenId: SCREEN_ID }, '*');
    };

    const scheduleReport = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(reportHeight);
    };

    window.addEventListener('load', scheduleReport, { once: true });
    window.addEventListener('resize', scheduleReport);
    window.addEventListener('DOMContentLoaded', scheduleReport);

    const ro = new ResizeObserver(scheduleReport);
    if (document.body) ro.observe(document.body);
    ro.observe(document.documentElement);

    const mo = new MutationObserver(scheduleReport);
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    }

    const imgs = Array.from(document.images || []);
    imgs.forEach((img) => {
      if (!img.complete) {
        img.addEventListener('load', scheduleReport, { once: true });
        img.addEventListener('error', scheduleReport, { once: true });
      }
    });

    setTimeout(scheduleReport, 50);
    setTimeout(scheduleReport, 250);
    setTimeout(scheduleReport, 800);
    setTimeout(scheduleReport, 1600);
  })();
</script>`;

    if (html.includes('</body>')) {
        return html.replace('</body>', `${script}\n</body>`);
    }
    return `${html}\n${script}`;
}

function syncPreviewAttributes(target: Element, source: Element) {
    const preservedNames = new Set(['data-eazyui-icons-ready']);
    const sourceNames = new Set(source.getAttributeNames());

    target.getAttributeNames().forEach((name) => {
        if (preservedNames.has(name)) return;
        if (!sourceNames.has(name)) target.removeAttribute(name);
    });

    source.getAttributeNames().forEach((name) => {
        if (preservedNames.has(name)) return;
        const value = source.getAttribute(name);
        if (target.getAttribute(name) !== value) {
            if (value === null) target.removeAttribute(name);
            else target.setAttribute(name, value);
        }
    });
}

function extractDocumentHeadHtml(html: string): string | null {
    try {
        const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
        return parsed.head ? parsed.head.innerHTML.trim() : null;
    } catch {
        return null;
    }
}

function clonePreviewNode(source: Node, targetDocument: Document): Node {
    return targetDocument.importNode(source, true);
}

function isPreservedPreviewRuntimeNode(node: Node | null): boolean {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node as Element;
    return element.id === 'eazyui-statusbar-overlay';
}

function arePreviewNodesCompatible(target: Node | null, source: Node | null): boolean {
    if (!target || !source) return false;
    if (target.nodeType !== source.nodeType) return false;
    if (target.nodeType !== Node.ELEMENT_NODE) return true;
    return (target as Element).tagName === (source as Element).tagName;
}

function morphPreviewNode(target: Node, source: Node, targetDocument: Document) {
    if (target.nodeType === Node.TEXT_NODE || target.nodeType === Node.COMMENT_NODE) {
        if (target.textContent !== source.textContent) {
            target.textContent = source.textContent;
        }
        return;
    }

    if (target.nodeType !== Node.ELEMENT_NODE || source.nodeType !== Node.ELEMENT_NODE) {
        return;
    }

    const targetElement = target as Element;
    const sourceElement = source as Element;
    syncPreviewAttributes(targetElement, sourceElement);

    let childIndex = 0;
    while (true) {
        const targetChild = targetElement.childNodes[childIndex] || null;
        const sourceChild = sourceElement.childNodes[childIndex] || null;

        if (!sourceChild && !targetChild) break;

        if (isPreservedPreviewRuntimeNode(targetChild)) {
            childIndex += 1;
            continue;
        }

        if (!sourceChild && targetChild) {
            targetElement.removeChild(targetChild);
            continue;
        }

        if (sourceChild && !targetChild) {
            targetElement.appendChild(clonePreviewNode(sourceChild, targetDocument));
            childIndex += 1;
            continue;
        }

        if (!arePreviewNodesCompatible(targetChild, sourceChild)) {
            targetElement.replaceChild(clonePreviewNode(sourceChild as Node, targetDocument), targetChild as Node);
            childIndex += 1;
            continue;
        }

        morphPreviewNode(targetChild as Node, sourceChild as Node, targetDocument);
        childIndex += 1;
    }
}

function applyInPlacePreviewHtml(iframe: HTMLIFrameElement | null, nextHtml: string) {
    const frameWindow = iframe?.contentWindow;
    const frameDoc = iframe?.contentDocument;
    if (!frameWindow || !frameDoc || !frameDoc.documentElement || !frameDoc.body) return false;

    try {
        const parsed = new DOMParser().parseFromString(String(nextHtml || ''), 'text/html');
        if (!parsed.documentElement || !parsed.body) return false;

        syncPreviewAttributes(frameDoc.documentElement, parsed.documentElement);
        syncPreviewAttributes(frameDoc.body, parsed.body);

        if (frameDoc.title !== parsed.title) {
            frameDoc.title = parsed.title || frameDoc.title;
        }

        if (frameDoc.body.innerHTML !== parsed.body.innerHTML) {
            morphPreviewNode(frameDoc.body, parsed.body, frameDoc);
        }

        frameWindow.requestAnimationFrame(() => {
            frameWindow.dispatchEvent(new Event('resize'));
        });
        return true;
    } catch {
        return false;
    }
}

function injectScrollbarHide(html: string) {
    const sanitizedHtml = String(html || '').replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs = '', body = '') => {
        const attrText = String(attrs).toLowerCase();
        const bodyText = String(body).toLowerCase();
        const hasTailwindSrc = /src\s*=\s*["'][^"']*cdn\.tailwindcss\.com[^"']*["']/.test(attrText);
        const isTailwindConfig = bodyText.includes('tailwind.config');
        return (hasTailwindSrc || isTailwindConfig) ? full : '';
    });

    const warningFilterScript = `
<script>
  (function () {
    const blocked = 'cdn.tailwindcss.com should not be used in production';
    const originalWarn = console.warn;
    console.warn = function (...args) {
      const first = String(args && args.length ? args[0] : '');
      if (first.includes(blocked)) return;
      return originalWarn.apply(console, args);
    };
  })();
</script>`;

    const iconBoot = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="dns-prefetch" href="//fonts.googleapis.com">
<link rel="dns-prefetch" href="//fonts.gstatic.com">
<link rel="preload" as="style" href="${MATERIAL_SYMBOLS_STYLESHEET_HREF}">
<link rel="stylesheet" href="${MATERIAL_SYMBOLS_STYLESHEET_HREF}">
${MATERIAL_ICON_STYLESHEET_HREFS.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}
<script>
  (function () {
    if (!document.documentElement) return;
    document.documentElement.setAttribute('data-eazyui-icons-ready', '0');
    var done = function () {
      document.documentElement.setAttribute('data-eazyui-icons-ready', '1');
    };
    try {
      var fonts = document.fonts;
      if (fonts && typeof fonts.load === 'function') {
        var loads = [
          fonts.load('400 24px "Material Symbols Outlined"'),
          fonts.load('400 24px "Material Symbols Rounded"'),
          fonts.load('400 24px "Material Symbols Sharp"'),
          fonts.load('400 24px "Material Icons"'),
          fonts.load('400 24px "Material Icons Outlined"'),
          fonts.load('400 24px "Material Icons Round"'),
          fonts.load('400 24px "Material Icons Sharp"'),
          fonts.load('400 24px "Material Icons Two Tone"')
        ];
        Promise.race([
          Promise.all(loads),
          new Promise(function (resolve) { setTimeout(resolve, 1400); })
        ]).then(done).catch(done);
      } else {
        done();
      }
    } catch (_e) {
      done();
    }
  })();
</script>`;

    const styleTag = `
<style>
  ::-webkit-scrollbar { width: 0; height: 0; }
  ::-webkit-scrollbar-thumb { background: transparent; }
  body { -ms-overflow-style: none; scrollbar-width: none; }
  .material-symbols-outlined,
  .material-symbols-rounded,
  .material-symbols-sharp {
    font-weight: 400;
    font-style: normal;
    font-size: 24px;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    display: inline-block;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    -webkit-font-feature-settings: 'liga';
    font-feature-settings: 'liga';
    -webkit-font-smoothing: antialiased;
  }
  .material-symbols-outlined { font-family: 'Material Symbols Outlined'; }
  .material-symbols-rounded { font-family: 'Material Symbols Rounded'; }
  .material-symbols-sharp { font-family: 'Material Symbols Sharp'; }
  .material-icons,
  .material-icons-outlined,
  .material-icons-round,
  .material-icons-sharp,
  .material-icons-two-tone {
    font-weight: 400;
    font-style: normal;
    font-size: 24px;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    display: inline-block;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    -webkit-font-feature-settings: 'liga';
    font-feature-settings: 'liga';
    -webkit-font-smoothing: antialiased;
  }
  .material-icons { font-family: 'Material Icons'; }
  .material-icons-outlined { font-family: 'Material Icons Outlined'; }
  .material-icons-round { font-family: 'Material Icons Round'; }
  .material-icons-sharp { font-family: 'Material Icons Sharp'; }
  .material-icons-two-tone { font-family: 'Material Icons Two Tone'; }
  ${MATERIAL_ICON_HIDDEN_SELECTORS} {
    visibility: hidden !important;
  }
</style>`;

    if (/<head[^>]*>/i.test(sanitizedHtml)) {
        return sanitizedHtml.replace(/<head([^>]*)>/i, `<head$1>${warningFilterScript}\n${iconBoot}\n${styleTag}`);
    }
    if (sanitizedHtml.includes('</head>')) {
        return sanitizedHtml.replace('</head>', `${warningFilterScript}\n${iconBoot}\n${styleTag}\n</head>`);
    }
    return `${warningFilterScript}\n${iconBoot}\n${styleTag}\n${sanitizedHtml}`;
}

function injectBodyTopPadding(html: string, paddingTopPx = 30) {
    const safePadding = Math.max(0, Math.round(paddingTopPx || 0));
    if (!safePadding) return html;

    if (/<body[^>]*>/i.test(html)) {
        return html.replace(/<body([^>]*)>/i, (_fullMatch, rawAttrs: string) => {
            const attrs = rawAttrs || '';
            const styleAttrMatch = attrs.match(/\sstyle=(["'])([\s\S]*?)\1/i);

            if (styleAttrMatch) {
                const quote = styleAttrMatch[1];
                const existingStyle = (styleAttrMatch[2] || '').trim();
                const cleanedStyle = existingStyle
                    .replace(/(^|;)\s*padding-top\s*:[^;]*;?/gi, '$1')
                    .replace(/;;+/g, ';')
                    .trim();
                const normalized = cleanedStyle
                    ? `${cleanedStyle.replace(/\s*;?\s*$/, ';')} `
                    : '';
                const nextStyle = `${normalized}padding-top: ${safePadding}px;`;
                const nextAttrs = attrs.replace(styleAttrMatch[0], ` style=${quote}${nextStyle}${quote}`);
                return `<body${nextAttrs}>`;
            }

            return `<body${attrs} style="padding-top: ${safePadding}px;">`;
        });
    }

    const styleTag = `<style id="eazyui-body-top-padding-style">body{padding-top:${safePadding}px !important;}</style>`;
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, `<head$1>${styleTag}`);
    }
    if (html.includes('</head>')) {
        return html.replace('</head>', `${styleTag}\n</head>`);
    }
    return `${styleTag}\n${html}`;
}

function upsertPaddingTopInAttributes(rawAttrs: string, paddingTopPx: number, important = false) {
    const attrs = rawAttrs || '';
    const importantSuffix = important ? ' !important' : '';
    const styleAttrMatch = attrs.match(/\sstyle=(["'])([\s\S]*?)\1/i);

    if (styleAttrMatch) {
        const quote = styleAttrMatch[1];
        const existingStyle = (styleAttrMatch[2] || '').trim();
        const cleanedStyle = existingStyle
            .replace(/(^|;)\s*padding-top\s*:[^;]*;?/gi, '$1')
            .replace(/;;+/g, ';')
            .trim();
        const normalized = cleanedStyle
            ? `${cleanedStyle.replace(/\s*;?\s*$/, ';')} `
            : '';
        const nextStyle = `${normalized}padding-top: ${paddingTopPx}px${importantSuffix};`;
        return attrs.replace(styleAttrMatch[0], ` style=${quote}${nextStyle}${quote}`);
    }

    return `${attrs} style="padding-top: ${paddingTopPx}px${importantSuffix};"`;
}

function injectHeaderTopPadding(html: string, paddingTopPx = 20, forcePaddingTopPx = 50, headerPaddingTopPx = 50) {
    const safePadding = Math.max(0, Math.round(paddingTopPx || 0));
    const safeForcePadding = Math.max(0, Math.round(forcePaddingTopPx || 0));
    const safeHeaderPadding = Math.max(0, Math.round(headerPaddingTopPx || 0));
    if (!safePadding && !safeForcePadding && !safeHeaderPadding) return html;

    let nextHtml = html;
    nextHtml = nextHtml.replace(/<header([^>]*)>/gi, (_fullMatch, rawAttrs: string) => {
        const nextAttrs = upsertPaddingTopInAttributes(rawAttrs, safeHeaderPadding, true);
        return `<header${nextAttrs}>`;
    });

    nextHtml = nextHtml.replace(/<([a-zA-Z][\w:-]*)([^>]*\sdata-eazyui-safe-top=(["'])force\3[^>]*)>/gi, (_fullMatch, tagName: string, rawAttrs: string) => {
        const isHeaderTag = String(tagName || '').toLowerCase() === 'header';
        const nextAttrs = upsertPaddingTopInAttributes(rawAttrs, isHeaderTag ? safeHeaderPadding : safeForcePadding, true);
        return `<${tagName}${nextAttrs}>`;
    });

    nextHtml = nextHtml.replace(
        /<([a-zA-Z][\w:-]*)([^>]*\sclass=(["'])(?=[^"']*\btop-0\b)(?=[^"']*\b(?:absolute|fixed|sticky)\b)(?=[^"']*\b(?:left-0|right-0|inset-x-0|inset-0)\b)[^"']*\3[^>]*)>/gi,
        (_fullMatch, tagName: string, rawAttrs: string) => {
            const isHeaderTag = String(tagName || '').toLowerCase() === 'header';
            const isForceSafeTop = /\sdata-eazyui-safe-top=(["'])force\1/i.test(rawAttrs);
            const nextAttrs = upsertPaddingTopInAttributes(
                rawAttrs,
                isHeaderTag ? safeHeaderPadding : (isForceSafeTop ? safeForcePadding : safePadding),
                isHeaderTag || isForceSafeTop
            );
            return `<${tagName}${nextAttrs}>`;
        }
    );

    const styleTag = `<style id="eazyui-header-top-padding-style">
header{padding-top:${safeHeaderPadding}px !important;}
[class~="top-0"][class~="absolute"][class~="left-0"][class~="right-0"]:not(header):not([data-eazyui-safe-top="force"]),
[class~="top-0"][class~="fixed"][class~="left-0"][class~="right-0"]:not(header):not([data-eazyui-safe-top="force"]),
[class~="top-0"][class~="sticky"][class~="left-0"][class~="right-0"]:not(header):not([data-eazyui-safe-top="force"]),
[class~="top-0"][class~="absolute"][class~="inset-x-0"]:not(header):not([data-eazyui-safe-top="force"]),
[class~="top-0"][class~="fixed"][class~="inset-x-0"]:not(header):not([data-eazyui-safe-top="force"]),
[class~="top-0"][class~="sticky"][class~="inset-x-0"]:not(header):not([data-eazyui-safe-top="force"]){padding-top:${safePadding}px !important;}
[data-eazyui-safe-top="force"]:not(header){padding-top:${safeForcePadding}px !important;}
</style>`;
    if (/<head[^>]*>/i.test(nextHtml)) {
        return nextHtml.replace(/<head([^>]*)>/i, `<head$1>${styleTag}`);
    }
    if (nextHtml.includes('</head>')) {
        return nextHtml.replace('</head>', `${styleTag}\n</head>`);
    }
    return `${styleTag}\n${nextHtml}`;
}

function injectStatusBarOverlay(html: string, options: {
    insetPx: number;
    textColor: string;
    paddingTop: number;
    paddingBottom: number;
    paddingX: number;
    iconGap: number;
    iconSize: number;
    fontSize: number;
    fontWeight: number;
}) {
    const safeInset = Math.max(0, Math.round(options.insetPx || 0));
    if (!safeInset) return html;

    const statusTextColor = (options.textColor || '#111111').trim();

    const styleTag = `
<style id="eazyui-statusbar-overlay-style">
  :root {
    --eazyui-safe-top: ${safeInset}px;
    --eazyui-statusbar-color: ${statusTextColor};
    --eazyui-statusbar-pt: ${Math.max(0, Math.round(options.paddingTop))}px;
    --eazyui-statusbar-pb: ${Math.max(0, Math.round(options.paddingBottom))}px;
    --eazyui-statusbar-px: ${Math.max(0, Math.round(options.paddingX))}px;
    --eazyui-statusbar-icon-gap: ${Math.max(0, Math.round(options.iconGap))}px;
    --eazyui-statusbar-icon-size: ${Math.max(8, Math.round(options.iconSize))}px;
    --eazyui-statusbar-font-size: ${Math.max(10, Math.round(options.fontSize))}px;
    --eazyui-statusbar-font-weight: ${Math.max(400, Math.round(options.fontWeight))};
  }
  #eazyui-statusbar-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    min-height: var(--eazyui-safe-top);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--eazyui-statusbar-pt) var(--eazyui-statusbar-px) var(--eazyui-statusbar-pb);
    color: var(--eazyui-statusbar-color, #111111);
    font-size: var(--eazyui-statusbar-font-size);
    font-weight: var(--eazyui-statusbar-font-weight);
    line-height: 1;
    pointer-events: none;
    z-index: 2147483000;
    box-sizing: border-box;
    background: transparent !important;
  }
  #eazyui-statusbar-overlay > * {
    position: relative;
    z-index: 1;
  }
  #eazyui-statusbar-overlay .__eazyui-icons {
    display: inline-flex;
    align-items: center;
    gap: var(--eazyui-statusbar-icon-gap);
  }
  #eazyui-statusbar-overlay .__eazyui-icons svg {
    width: var(--eazyui-statusbar-icon-size);
    height: var(--eazyui-statusbar-icon-size);
    stroke: currentColor;
    fill: none;
  }
</style>`;

    const statusMarkup = `
<div id="eazyui-statusbar-overlay" data-editable="false" data-eazyui-safe-top="off" aria-hidden="true">
  <span data-editable="false">9:41</span>
  <span class="__eazyui-icons" data-editable="false">
    <svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" data-editable="false">
      <path d="M2 18h2" data-editable="false"></path>
      <path d="M6 14h2" data-editable="false"></path>
      <path d="M10 10h2" data-editable="false"></path>
      <path d="M14 6h2" data-editable="false"></path>
    </svg>
    <svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" data-editable="false">
      <path d="M2.5 9.5a14 14 0 0 1 19 0" data-editable="false"></path>
      <path d="M6 13a9 9 0 0 1 12 0" data-editable="false"></path>
      <path d="M9.5 16.5a4.5 4.5 0 0 1 5 0" data-editable="false"></path>
      <path d="M12 20h.01" data-editable="false"></path>
    </svg>
    <svg viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" data-editable="false">
      <rect x="2" y="7" width="18" height="10" rx="2" ry="2" data-editable="false"></rect>
      <path d="M22 11v2" data-editable="false"></path>
      <path d="M5 10h10" data-editable="false"></path>
    </svg>
  </span>
</div>`;

    const script = `
<script>
  (function () {
    if (window.__eazyuiSafeTopInstalled) return;
    window.__eazyuiSafeTopInstalled = true;

    var timeoutId = 0;
    function scheduleApply() {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(installOverlay, 0);
    }

    function installOverlay() {
      if (!document.body) return;
      if (!document.getElementById('eazyui-statusbar-overlay')) {
        document.body.insertAdjacentHTML('afterbegin', ${JSON.stringify(statusMarkup)});
      }
    }

    window.addEventListener('load', installOverlay, { once: true });
    window.addEventListener('resize', scheduleApply);
    window.addEventListener('orientationchange', scheduleApply);
    document.addEventListener('DOMContentLoaded', installOverlay, { once: true });

    var observer = new MutationObserver(function () {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(scheduleApply, 30);
    });

    function observe() {
      if (!document.body) {
        window.setTimeout(observe, 30);
        return;
      }
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: false });
      installOverlay();
      window.setTimeout(scheduleApply, 60);
    }

    observe();
  })();
</script>`;

    const withStyle = html.includes('</head>')
        ? html.replace('</head>', `${styleTag}\n</head>`)
        : `${styleTag}\n${html}`;

    if (withStyle.includes('</body>')) {
        return withStyle.replace('</body>', `${script}\n</body>`);
    }
    return `${withStyle}\n${script}`;
}

function extractTokenColor(html: string, tokenName: 'text' | 'bg'): string | null {
    const source = html || '';
    const patterns = [
        new RegExp(`${tokenName}\\s*:\\s*["']([^"']+)["']`, 'i'),
        new RegExp(`${tokenName}\\s*:\\s*\`([^\`]+)\``, 'i'),
    ];

    for (const pattern of patterns) {
        const fromSource = source.match(pattern);
        if (fromSource?.[1]?.trim()) return fromSource[1].trim();
    }

    return null;
}

function hasPlaceholderImages(html: string): boolean {
    return /https?:\/\/placehold\.net\//i.test(String(html || ''));
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
    '.__eazyui-hover-tag { position: absolute; display: none; transform: translateY(-100%); text-transform: lowercase; font-weight: 600; font-size: 11px; line-height: 1; color: #dbeafe; border: 1px solid rgba(59,130,246,.5); border-radius: 6px; background: rgba(30,58,138,.82); padding: 4px 8px; pointer-events: none; z-index: 1000000; }\\n' +
    '.__eazyui-inline-editing { cursor: text !important; outline: 2px solid rgba(16,185,129,.8); outline-offset: 2px; }';
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
  let inlineEditingEl = null;
  let inlineEditingOriginalText = '';
  const ROOT_TAGS = new Set(['html', 'body']);
  const INLINE_TEXT_TAGS = new Set(['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'small', 'strong', 'em', 'b', 'i', 'a', 'button', 'li']);

  function hasNestedInteractiveOrMedia(el) {
    return !!el.querySelector('img,svg,iconify-icon,video,canvas,picture,input,textarea,select,button,a');
  }

  function isInlineTextEditable(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (!el.matches(EDIT_SELECTOR)) return false;
    if (el.closest('#eazyui-statusbar-overlay')) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (ROOT_TAGS.has(tag)) return false;
    if (el.classList.contains('material-symbols-rounded')) return false;
    if (tag === 'input' || tag === 'textarea') return true;
    if (!INLINE_TEXT_TAGS.has(tag)) return false;
    if (hasNestedInteractiveOrMedia(el)) return false;
    const text = (el.textContent || '').trim();
    return text.length > 0;
  }

  function resolveInlineTextTarget(node) {
    const base = node instanceof Element ? node : node && node.parentElement;
    if (!base) return null;
    const boundary = getEditable(base);
    if (!boundary) return null;
    let current = base;
    while (current) {
      if (isInlineTextEditable(current)) return current;
      if (current === boundary) break;
      current = current.parentElement;
    }
    return isInlineTextEditable(boundary) ? boundary : null;
  }

  function getNodeText(el) {
    if (!el) return '';
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return String(el.value || '');
    return String(el.textContent || '');
  }

  function setCaretToEnd(el) {
    try {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      // ignore selection errors
    }
  }

  function previewInlineTextEdit() {
    if (!inlineEditingEl) return;
    const uid = ensureUid(inlineEditingEl);
    if (!uid) return;
    window.parent.postMessage({
      type: 'editor/inline_text_preview',
      screenId: SCREEN_ID,
      uid,
      text: getNodeText(inlineEditingEl)
    }, '*');
  }

  function finishInlineTextEdit(commit) {
    if (!inlineEditingEl) return;
    const el = inlineEditingEl;
    const tag = (el.tagName || '').toLowerCase();
    const uid = ensureUid(el);
    const nextText = getNodeText(el);
    const finalText = commit ? nextText : inlineEditingOriginalText;

    if (tag === 'input' || tag === 'textarea') {
      el.value = finalText;
      el.blur();
    } else {
      el.contentEditable = 'false';
      el.removeAttribute('spellcheck');
      el.textContent = finalText;
    }
    el.classList.remove('__eazyui-inline-editing');

    inlineEditingEl = null;
    inlineEditingOriginalText = '';

    if (uid) {
      if (commit) {
        window.parent.postMessage({
          type: 'editor/inline_text_commit',
          screenId: SCREEN_ID,
          uid,
          text: finalText,
          payload: buildInfo(el)
        }, '*');
      } else {
        window.parent.postMessage({
          type: 'editor/inline_text_preview',
          screenId: SCREEN_ID,
          uid,
          text: finalText
        }, '*');
      }
    }
    if (selectedEl && selectedEl === el) {
      setBox(selectBox, selectedEl);
    }
  }

  function startInlineTextEdit(el) {
    if (!isInlineTextEditable(el)) return false;
    if (inlineEditingEl && inlineEditingEl !== el) {
      finishInlineTextEdit(true);
    }
    inlineEditingEl = el;
    inlineEditingOriginalText = getNodeText(el);
    const tag = (el.tagName || '').toLowerCase();
    el.classList.add('__eazyui-inline-editing');

    if (tag === 'input' || tag === 'textarea') {
      el.focus();
      if (typeof el.setSelectionRange === 'function') {
        const length = String(el.value || '').length;
        el.setSelectionRange(length, length);
      }
    } else {
      el.contentEditable = 'true';
      el.setAttribute('spellcheck', 'false');
      el.focus();
      setCaretToEnd(el);
    }
    previewInlineTextEdit();
    return true;
  }

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
    const parent = el.parentElement;
    const parentCs = parent ? window.getComputedStyle(parent) : null;
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
        parentDisplay: parentCs?.display || '',
        parentPosition: parentCs?.position || '',
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
    if (inlineEditingEl && inlineEditingEl.contains && inlineEditingEl.contains(event.target)) {
      return;
    }
    const target = getEditable(event.target);
    if (!target) {
      if (inlineEditingEl) finishInlineTextEdit(true);
      clearSelection();
      window.parent.postMessage({ type: 'editor/clear_selection', screenId: SCREEN_ID }, '*');
      return;
    }
    if (inlineEditingEl && inlineEditingEl !== target) {
      finishInlineTextEdit(true);
    }
    event.preventDefault();
    event.stopPropagation();
    selectElement(target);
  }, true);

  document.addEventListener('dblclick', (event) => {
    if (selectionHud.contains(event.target) || hoverTag.contains(event.target)) return;
    const target = resolveInlineTextTarget(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(target);
    startInlineTextEdit(target);
  }, true);

  document.addEventListener('input', (event) => {
    if (!inlineEditingEl) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target !== inlineEditingEl) return;
    previewInlineTextEdit();
  }, true);

  document.addEventListener('focusout', (event) => {
    if (!inlineEditingEl) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target !== inlineEditingEl) return;
    window.setTimeout(() => {
      if (!inlineEditingEl) return;
      const active = document.activeElement;
      if (active && inlineEditingEl.contains(active)) return;
      finishInlineTextEdit(true);
    }, 0);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!inlineEditingEl) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finishInlineTextEdit(false);
      return;
    }
    const tag = (inlineEditingEl.tagName || '').toLowerCase();
    if (event.key === 'Enter' && !event.shiftKey && tag !== 'textarea') {
      event.preventDefault();
      event.stopPropagation();
      finishInlineTextEdit(true);
    }
  }, true);

  selectionHudDelete.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (inlineEditingEl) finishInlineTextEdit(true);
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
      if (inlineEditingEl) finishInlineTextEdit(true);
      clearSelection();
    }
    if (data.type === 'editor/delete_selected') {
      if (inlineEditingEl) finishInlineTextEdit(true);
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
    const updateScreen = useDesignStore((state) => state.updateScreen);
    const removeScreen = useDesignStore((state) => state.removeScreen);
    const selectedPlatform = useDesignStore((state) => state.selectedPlatform);
    const addMessage = useChatStore((state) => state.addMessage);
    const updateMessage = useChatStore((state) => state.updateMessage);
    const setGenerating = useChatStore((state) => state.setGenerating);
    const setAbortController = useChatStore((state) => state.setAbortController);
    const removeBoard = useCanvasStore((state) => state.removeBoard);
    const setFocusNodeId = useCanvasStore((state) => state.setFocusNodeId);
    const setFocusNodeIds = useCanvasStore((state) => state.setFocusNodeIds);
    const selectedNodeIds = useCanvasStore((state) => state.doc.selection.selectedNodeIds);
    const isEditMode = useEditStore((state) => state.isEditMode);
    const editScreenId = useEditStore((state) => state.screenId);
    const enterEdit = useEditStore((state) => state.enterEdit);
    const setActiveScreen = useEditStore((state) => state.setActiveScreen);
    const rebuildHtml = useEditStore((state) => state.rebuildHtml);
    const reloadTick = useEditStore((state) => state.reloadTick);
    const refreshAllTick = useEditStore((state) => state.refreshAllTick);
    const markSaved = useProjectStore((state) => state.markSaved);
    const setSaving = useProjectStore((state) => state.setSaving);
    const modelProfile = useUiStore((state) => state.modelProfile);
    const pushToast = useUiStore((state) => state.pushToast);
    const removeToast = useUiStore((state) => state.removeToast);
    const requestConfirmation = useUiStore((state) => state.requestConfirmation);
    const selectedCount = selectedNodeIds.length;
    const width = (data.width as number) || 402;
    const initialHeight = (data.height as number) || 874;
    const htmlString = String(data.html || '');
    const statusBarColor = useMemo(() => extractTokenColor(htmlString, 'text') || '#111111', [htmlString]);
    const statusBarStyle = {
        paddingTop: 16,
        paddingBottom: 8,
        paddingX: 24,
        fontSize: 14,
        fontWeight: 500,
        iconSize: 18,
        iconGap: 6,
    } as const;
    const statusBarInset = statusBarStyle.paddingTop + statusBarStyle.paddingBottom + statusBarStyle.fontSize;
    const [contentHeight, setContentHeight] = useState(initialHeight);
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const persistedHeightRef = useRef(initialHeight);

    useEffect(() => {
        persistedHeightRef.current = initialHeight;
        setContentHeight(initialHeight);
    }, [data.screenId, initialHeight]);

    const handleAction = useCallback(async (action: string, payload?: any) => {
        if (!data.screenId) return;

        switch (action) {
            case 'desktop':
                updateScreen(data.screenId as string, data.html as string, undefined, 1280, Math.max(initialHeight, 1200));
                break;
            case 'tablet':
                updateScreen(data.screenId as string, data.html as string, undefined, 768, 1024);
                break;
            case 'mobile':
                updateScreen(data.screenId as string, data.html as string, undefined, 402, 874);
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
                        projectDesignSystem: useDesignStore.getState().spec?.designSystem,
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
                        await requestConfirmation({
                            title: 'Edit failed',
                            message: 'Failed to edit screen. Please try again.',
                            confirmLabel: 'OK',
                            tone: 'danger',
                            hideCancel: true,
                        });
                    }
                } finally {
                    setAbortController(null);
                    setGenerating(false);
                }
                break;
            case 'delete':
                if (!await requestConfirmation({
                    title: 'Delete screen?',
                    message: 'This screen will be permanently removed from the current project.',
                    confirmLabel: 'Delete Screen',
                    cancelLabel: 'Cancel',
                    tone: 'danger',
                })) break;
                removeScreen(data.screenId as string);
                removeBoard(data.screenId as string);
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
                const currentSpec = useDesignStore.getState().spec;
                if (!currentSpec) {
                    pushToast({
                        kind: 'error',
                        title: 'Nothing to save',
                        message: 'Generate at least one screen first.',
                    });
                    break;
                }
                const savingToastId = pushToast({
                    kind: 'loading',
                    title: 'Saving canvas',
                    message: 'Persisting screens, chat, and canvas state...',
                    durationMs: 0,
                });
                try {
                    setSaving(true);
                    const currentProjectId = useProjectStore.getState().projectId;
                    const canvasDoc = useCanvasStore.getState().doc;
                    const saved = await apiClient.save({
                        projectId: currentProjectId || undefined,
                        designSpec: currentSpec as any,
                        canvasDoc,
                        chatState: { messages: useChatStore.getState().messages },
                    });
                    markSaved(saved.projectId, saved.savedAt);
                    pushToast({
                        kind: 'success',
                        title: 'Project saved',
                        message: `Project ${saved.projectId.slice(0, 8)} updated.`,
                    });
                } catch (error) {
                    setSaving(false);
                    pushToast({
                        kind: 'error',
                        title: 'Save failed',
                        message: (error as Error).message || 'Unable to save project.',
                    });
                } finally {
                    removeToast(savingToastId);
                }
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
    }, [data.screenId, data.html, updateScreen, addMessage, updateMessage, data.label, enterEdit, setActiveScreen, rebuildHtml, isEditMode, editScreenId, data.status, width, initialHeight, setFocusNodeId, setFocusNodeIds, setGenerating, setAbortController, modelProfile, markSaved, setSaving, pushToast, removeToast, requestConfirmation]);
    const isStreaming = data.status === 'streaming';
    const isEditingScreen = isEditMode && editScreenId === data.screenId;
    const canGenerateScreenImages = !isStreaming && data.status === 'complete' && hasPlaceholderImages(htmlString);

    const handleGenerateScreenImages = useCallback(async () => {
        if (!data.screenId || isGeneratingImages) return;

        const selectedIds = (selected && selectedCount > 1)
            ? selectedNodeIds
            : [data.screenId as string];

        const targetIds = Array.from(new Set(selectedIds.filter(Boolean)));
        const currentSpec = useDesignStore.getState().spec;
        const sourceScreens = (currentSpec?.screens || [])
            .filter((screen) => targetIds.includes(screen.screenId) && hasPlaceholderImages(screen.html));

        if (!sourceScreens.length) {
            pushToast({
                kind: 'info',
                title: 'No placeholder images',
                message: 'Selected screens already have generated images.',
            });
            return;
        }

        setIsGeneratingImages(true);
        const loadingToastId = pushToast({
            kind: 'loading',
            title: 'Generating images',
            message: `Processing ${sourceScreens.length} screen${sourceScreens.length === 1 ? '' : 's'}...`,
            durationMs: 0,
        });

        try {
            const response = await apiClient.synthesizeScreenImages({
                appPrompt: currentSpec?.name || String(data.label || 'Generated UI'),
                platform: selectedPlatform,
                screens: sourceScreens.map((screen) => ({
                    screenId: screen.screenId,
                    name: screen.name,
                    html: screen.html,
                    width: screen.width,
                    height: screen.height,
                })),
                maxImages: 14,
            });

            response.screens.forEach((screen) => {
                if (!screen.screenId) return;
                const existing = (useDesignStore.getState().spec?.screens || []).find((item) => item.screenId === screen.screenId);
                if (!existing) return;
                updateScreen(
                    screen.screenId,
                    screen.html,
                    'complete',
                    existing.width,
                    existing.height,
                    existing.name
                );
                if (isEditMode && editScreenId === screen.screenId) {
                    setActiveScreen(screen.screenId, screen.html);
                }
            });

            pushToast({
                kind: 'success',
                title: 'Images generated',
                message: `Updated ${sourceScreens.length} screen${sourceScreens.length === 1 ? '' : 's'}.`,
            });
        } catch (error) {
            pushToast({
                kind: 'error',
                title: 'Image generation failed',
                message: (error as Error).message || 'Unable to generate images for selected screens.',
            });
        } finally {
            removeToast(loadingToastId);
            setIsGeneratingImages(false);
        }
    }, [data.screenId, data.label, selected, selectedCount, selectedNodeIds, selectedPlatform, pushToast, removeToast, isGeneratingImages, updateScreen, isEditMode, editScreenId, setActiveScreen]);

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
                    const normalized = Math.max(320, Math.min(12000, Math.round(newHeight)));
                    setContentHeight((previous) => previous === normalized ? previous : normalized);
                    if (Math.abs(normalized - persistedHeightRef.current) >= 24) {
                        persistedHeightRef.current = normalized;
                        updateScreen(
                            data.screenId as string,
                            data.html as string,
                            data.status as any,
                            width,
                            normalized,
                            data.label as string
                        );
                    }
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [isDesktop, data.screenId, updateScreen, data.html, data.status, width, initialHeight, data.label]);

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

    const injectedHtmlWithNonce = useMemo(() => {
        const noScrollbarHtml = injectScrollbarHide(htmlString);
        const paddedHtml = injectBodyTopPadding(noScrollbarHtml, 30);
        const headerPaddedHtml = injectHeaderTopPadding(paddedHtml, 30);
        const baseHtml = isDesktop
            ? headerPaddedHtml
            : injectStatusBarOverlay(headerPaddedHtml, {
                insetPx: statusBarInset,
                textColor: statusBarColor,
                paddingTop: statusBarStyle.paddingTop,
                paddingBottom: statusBarStyle.paddingBottom,
                paddingX: statusBarStyle.paddingX,
                iconGap: statusBarStyle.iconGap,
                iconSize: statusBarStyle.iconSize,
                fontSize: statusBarStyle.fontSize,
                fontWeight: statusBarStyle.fontWeight,
            });
        const withEditor = isEditingScreen && data.screenId ? injectEditorScript(baseHtml, data.screenId as string) : baseHtml;
        const injectedHtml = isDesktop && data.screenId
            ? injectHeightScript(withEditor, data.screenId as string)
            : withEditor;
        return `${injectedHtml}\n<!--eazyui-render:${isEditMode ? 'edit' : 'view'}:${refreshAllTick}-->`;
    }, [htmlString, isDesktop, statusBarInset, statusBarColor, isEditingScreen, data.screenId, isEditMode, refreshAllTick]);

    const [stableSrcDoc, setStableSrcDoc] = useState(injectedHtmlWithNonce);
    const [bufferedSrcDocs, setBufferedSrcDocs] = useState<[string, string]>([injectedHtmlWithNonce, injectedHtmlWithNonce]);
    const [activeBufferedFrame, setActiveBufferedFrame] = useState<0 | 1>(0);
    const wasEditingRef = useRef(false);
    const lastReloadTickRef = useRef(reloadTick);
    const streamFlushTimerRef = useRef<number | null>(null);
    const pendingStreamDocRef = useRef<string>(injectedHtmlWithNonce);
    const pendingBufferedSwapRef = useRef<{ index: 0 | 1 } | null>(null);
    const queuedBufferedDocRef = useRef<string | null>(null);
    const activeBufferedFrameRef = useRef<0 | 1>(0);
    const bufferedSrcDocsRef = useRef<[string, string]>([injectedHtmlWithNonce, injectedHtmlWithNonce]);
    const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
    const previewIframeReadyRef = useRef(false);
    const queuedInPlacePreviewDocRef = useRef<string | null>(null);
    const wasStreamingRef = useRef(isStreaming);
    const lastPreviewHeadSignatureRef = useRef<string>(extractDocumentHeadHtml(injectedHtmlWithNonce) || '');

    const hardReloadPreview = useCallback((nextDoc: string) => {
        previewIframeReadyRef.current = false;
        queuedInPlacePreviewDocRef.current = null;
        lastPreviewHeadSignatureRef.current = extractDocumentHeadHtml(nextDoc) || '';
        setStableSrcDoc(nextDoc);
    }, []);

    const patchPreviewInPlace = useCallback((nextDoc: string) => {
        const nextHeadSignature = extractDocumentHeadHtml(nextDoc) || '';
        if (lastPreviewHeadSignatureRef.current && nextHeadSignature !== lastPreviewHeadSignatureRef.current) {
            return 'reload' as const;
        }

        if (!previewIframeReadyRef.current) {
            queuedInPlacePreviewDocRef.current = nextDoc;
            return 'queued' as const;
        }

        const applied = applyInPlacePreviewHtml(previewIframeRef.current, nextDoc);
        if (!applied) {
            queuedInPlacePreviewDocRef.current = nextDoc;
            return 'reload' as const;
        }

        lastPreviewHeadSignatureRef.current = nextHeadSignature;
        queuedInPlacePreviewDocRef.current = null;
        return 'applied' as const;
    }, []);

    const handlePreviewFrameLoad = useCallback(() => {
        previewIframeReadyRef.current = true;
        const queuedDoc = queuedInPlacePreviewDocRef.current;
        if (queuedDoc) {
            const result = patchPreviewInPlace(queuedDoc);
            if (result === 'applied') {
                queuedInPlacePreviewDocRef.current = null;
            } else if (result === 'reload') {
                hardReloadPreview(queuedDoc);
            }
        }
    }, [hardReloadPreview, patchPreviewInPlace]);

    useEffect(() => {
        return () => {
            if (streamFlushTimerRef.current !== null) {
                window.clearTimeout(streamFlushTimerRef.current);
                streamFlushTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const flushStreamDoc = () => {
            const nextDoc = pendingStreamDocRef.current;
            const shouldPatchInPlace = wasStreamingRef.current && !isEditingScreen;
            if (shouldPatchInPlace) {
                const result = patchPreviewInPlace(nextDoc);
                if (result === 'reload') {
                    hardReloadPreview(nextDoc);
                }
            } else {
                hardReloadPreview(nextDoc);
            }
            if (streamFlushTimerRef.current !== null) {
                window.clearTimeout(streamFlushTimerRef.current);
                streamFlushTimerRef.current = null;
            }
        };

        if (isEditingScreen) {
            const reloadRequested = lastReloadTickRef.current !== reloadTick;
            if (!wasEditingRef.current || reloadRequested) {
                hardReloadPreview(injectedHtmlWithNonce);
            }
            if (streamFlushTimerRef.current !== null) {
                window.clearTimeout(streamFlushTimerRef.current);
                streamFlushTimerRef.current = null;
            }
        } else {
            if (isStreaming && SMOOTH_STREAMING_PREVIEW) {
                pendingStreamDocRef.current = injectedHtmlWithNonce;
                if (streamFlushTimerRef.current === null) {
                    streamFlushTimerRef.current = window.setTimeout(() => {
                        flushStreamDoc();
                    }, STREAMING_PREVIEW_THROTTLE_MS);
                }
            } else {
                pendingStreamDocRef.current = injectedHtmlWithNonce;
                if (wasStreamingRef.current && !isEditingScreen) {
                    const result = patchPreviewInPlace(injectedHtmlWithNonce);
                    if (result === 'reload') {
                        hardReloadPreview(injectedHtmlWithNonce);
                    }
                } else {
                    hardReloadPreview(injectedHtmlWithNonce);
                }
                if (streamFlushTimerRef.current !== null) {
                    window.clearTimeout(streamFlushTimerRef.current);
                    streamFlushTimerRef.current = null;
                }
            }
        }
        wasEditingRef.current = isEditingScreen;
        lastReloadTickRef.current = reloadTick;
        wasStreamingRef.current = isStreaming;
    }, [hardReloadPreview, injectedHtmlWithNonce, isEditingScreen, patchPreviewInPlace, reloadTick, isStreaming]);

    const shouldUseBufferedStreamingPreview = BUFFERED_STREAMING_PREVIEW
        && SMOOTH_STREAMING_PREVIEW
        && isStreaming
        && !isEditingScreen;

    useEffect(() => {
        activeBufferedFrameRef.current = activeBufferedFrame;
    }, [activeBufferedFrame]);

    useEffect(() => {
        bufferedSrcDocsRef.current = bufferedSrcDocs;
    }, [bufferedSrcDocs]);

    const scheduleBufferedSwap = useCallback((nextDoc: string) => {
        if (pendingBufferedSwapRef.current) {
            queuedBufferedDocRef.current = nextDoc;
            return;
        }

        const inactiveFrame = (activeBufferedFrameRef.current === 0 ? 1 : 0) as 0 | 1;
        if (bufferedSrcDocsRef.current[inactiveFrame] === nextDoc) {
            return;
        }

        pendingBufferedSwapRef.current = { index: inactiveFrame };
        setBufferedSrcDocs((prev) => {
            const next: [string, string] = [prev[0], prev[1]];
            next[inactiveFrame] = nextDoc;
            return next;
        });
    }, []);

    useEffect(() => {
        if (!shouldUseBufferedStreamingPreview) {
            setBufferedSrcDocs([stableSrcDoc, stableSrcDoc]);
            setActiveBufferedFrame(0);
            pendingBufferedSwapRef.current = null;
            queuedBufferedDocRef.current = null;
            activeBufferedFrameRef.current = 0;
            bufferedSrcDocsRef.current = [stableSrcDoc, stableSrcDoc];
            return;
        }

        scheduleBufferedSwap(stableSrcDoc);
    }, [stableSrcDoc, shouldUseBufferedStreamingPreview, scheduleBufferedSwap]);

    const handleBufferedFrameLoad = useCallback((frameIndex: 0 | 1) => {
        const pending = pendingBufferedSwapRef.current;
        if (!pending) return;
        if (pending.index !== frameIndex) return;
        setActiveBufferedFrame(frameIndex);
        activeBufferedFrameRef.current = frameIndex;
        pendingBufferedSwapRef.current = null;
        const queued = queuedBufferedDocRef.current;
        if (queued) {
            queuedBufferedDocRef.current = null;
            scheduleBufferedSwap(queued);
        }
    }, [scheduleBufferedSwap]);

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
    const screenRadius = isDesktop ? '12px' : 'calc(var(--custom-radius) - 6px)';
    const contentClipRadius = isDesktop ? '0 0 12px 12px' : screenRadius;

    // Unified premium frame

    return (
        <div className={`device-node-container relative transition-all duration-300 group ${isEditMode && !isEditingScreen ? 'opacity-40' : ''}`}>
            <NodeToolbar
                isVisible={selected && selectedCount === 1 && !isEditMode}
                position={Position.Top}
                offset={50}
            >
                <DeviceToolbar
                    screenId={data.screenId as string}
                    onAction={handleAction}
                />
            </NodeToolbar>

            {canGenerateScreenImages && (
                <button
                    type="button"
                    onClick={() => void handleGenerateScreenImages()}
                    disabled={isGeneratingImages}
                    className="absolute -top-6 -right-6 z-20 w-9 h-9 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)] disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center shadow-md"
                    title={selected && selectedCount > 1 ? 'Generate images for selected screens' : 'Generate images for this screen'}
                >
                    <ImagePlus size={12} />
                </button>
            )}

            {/* Premium iPhone/Desktop/Tablet Frame */}
            <div
                className={`iphone-frame ${selected ? 'selected' : ''}`}
                style={{
                    width: frameWidth,
                    height: frameHeight,
                    ['--custom-radius' as any]: isDesktop ? '16px' : '44px',
                    ['--device-bezel-width' as any]: `${borderWidth}px`,
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
                        borderRadius: screenRadius,
                        overflow: 'hidden',
                        isolation: 'isolate',
                        clipPath: `inset(0 round ${screenRadius})`,
                        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
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

                    <div
                        style={{
                            position: 'absolute',
                            top: isDesktop && showBrowserHeader ? 40 : 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            overflow: 'hidden',
                            borderRadius: contentClipRadius,
                            clipPath: `inset(0 round ${contentClipRadius})`,
                            WebkitMaskImage: '-webkit-radial-gradient(white, black)',
                        }}
                    >
                        {shouldUseBufferedStreamingPreview ? (
                            <>
                                {[0, 1].map((frameIndex) => {
                                    const typedIndex = frameIndex as 0 | 1;
                                    const docToRender = bufferedSrcDocs[typedIndex];
                                    const isActiveFrame = activeBufferedFrame === typedIndex;
                                    return (
                                        <iframe
                                            key={`preview-buffered-${typedIndex}`}
                                            srcDoc={docToRender}
                                            title={`Preview ${typedIndex + 1}`}
                                            data-screen-id={data.screenId}
                                            onLoad={() => handleBufferedFrameLoad(typedIndex)}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                width: '100%',
                                                height: '100%',
                                                border: 'none',
                                                display: 'block',
                                                overflow: 'hidden',
                                                borderRadius: contentClipRadius,
                                                clipPath: `inset(0 round ${contentClipRadius})`,
                                                pointerEvents: isActiveFrame && isEditingScreen ? 'auto' : 'none',
                                                opacity: isActiveFrame ? 1 : 0,
                                                transition: 'opacity 120ms linear',
                                                zIndex: isActiveFrame ? 2 : 1,
                                            }}
                                            sandbox="allow-scripts allow-same-origin"
                                        />
                                    );
                                })}
                            </>
                        ) : (
                            <iframe
                                ref={previewIframeRef}
                                srcDoc={stableSrcDoc}
                                title="Preview"
                                data-screen-id={data.screenId}
                                onLoad={handlePreviewFrameLoad}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    display: 'block',
                                    overflow: 'hidden',
                                    borderRadius: contentClipRadius,
                                    clipPath: `inset(0 round ${contentClipRadius})`,
                                    pointerEvents: isEditingScreen ? 'auto' : 'none',
                                    opacity: 1,
                                }}
                                sandbox="allow-scripts allow-same-origin"
                            />
                        )}
                    </div>

                    {SHOW_STREAMING_OVERLAY && (
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                zIndex: 30,
                                backgroundColor: 'var(--ui-surface-2)',
                                opacity: isStreaming ? 1 : 0,
                                pointerEvents: isStreaming ? 'auto' : 'none',
                                transition: 'opacity 0.35s ease-out',
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
                    )}
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
