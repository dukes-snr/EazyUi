import type { ProjectDesignSystem } from '../api/client';

type SourceScreen = {
    screenId: string;
    name: string;
    html: string;
    width: number;
    height: number;
};

type FigmaSceneBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type FigmaSceneInsets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

type FigmaSceneLayout = {
    display: string;
    position: string;
    flexDirection?: string;
    justifyContent?: string;
    alignContent?: string;
    alignItems?: string;
    alignSelf?: string;
    gap?: number;
    rowGap?: number;
    columnGap?: number;
    wrap?: boolean;
    flexGrow?: number;
    flexShrink?: number;
    flexBasis?: string;
    justifySelf?: string;
    widthMode?: 'fixed' | 'hug' | 'fill';
    heightMode?: 'fixed' | 'hug' | 'fill';
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    overflowX?: string;
    overflowY?: string;
    safeAutoLayout?: boolean;
    padding: FigmaSceneInsets;
    margin: FigmaSceneInsets;
};

type FigmaSceneBorder = {
    radius: string;
    top: {
        width: number;
        color: string;
        style: string;
    };
    right: {
        width: number;
        color: string;
        style: string;
    };
    bottom: {
        width: number;
        color: string;
        style: string;
    };
    left: {
        width: number;
        color: string;
        style: string;
    };
};

type FigmaSceneTypography = {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    fontStyle: string;
    lineHeight: string;
    letterSpacing: string;
    textAlign: string;
    textTransform: string;
    textDecoration: string;
    whiteSpace: string;
    fontVariationSettings?: string;
};

type FigmaSceneTransform = {
    rotation?: number;
    layoutWidth?: number;
    layoutHeight?: number;
    matrix?: {
        a: number;
        b: number;
        c: number;
        d: number;
        e: number;
        f: number;
    };
    originX?: number;
    originY?: number;
};

type FigmaSceneVisual = {
    color: string;
    backgroundColor: string;
    backgroundImage?: string;
    backgroundSize?: string;
    backgroundPosition?: string;
    backgroundRepeat?: string;
    backgroundBlendMode?: string;
    opacity: string;
    boxShadow: string;
    filter?: string;
    backdropFilter?: string;
    textShadow?: string;
    objectFit?: string;
    objectPosition?: string;
    mixBlendMode?: string;
    clipPath?: string;
    maskImage?: string;
    maskSize?: string;
    maskPosition?: string;
    maskRepeat?: string;
    outlineWidth?: string;
    outlineColor?: string;
    outlineStyle?: string;
    outlineOffset?: string;
};

export type EazyUiFigmaSceneNode = {
    id: string;
    name: string;
    nodeType: 'screen' | 'frame' | 'text' | 'image' | 'svg';
    tagName: string;
    bounds: FigmaSceneBounds;
    layout: FigmaSceneLayout;
    border: FigmaSceneBorder;
    visual: FigmaSceneVisual;
    transform?: FigmaSceneTransform;
    typography?: FigmaSceneTypography;
    textMetrics?: {
        lineCount: number;
        renderedWidth: number;
        renderedHeight: number;
    };
    textContent?: string;
    image?: {
        src: string;
        alt: string;
        kind?: 'content-image' | 'icon-raster';
    };
    svg?: {
        markup: string;
        kind?: 'inline-svg' | 'icon-svg';
    };
    children: EazyUiFigmaSceneNode[];
};

export type EazyUiFigmaSceneScreen = {
    screenId: string;
    name: string;
    width: number;
    height: number;
    root: EazyUiFigmaSceneNode;
};

export type EazyUiFigmaScenePayload = {
    format: 'eazyui.figma-scene';
    version: 2;
    generatedAt: string;
    notes: string[];
    designSystem?: ProjectDesignSystem;
    screens: EazyUiFigmaSceneScreen[];
};

const SKIP_TAGS = new Set([
    'script',
    'style',
    'meta',
    'link',
    'head',
    'title',
    'noscript',
    'template',
]);

const TEXT_TAGS = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'span',
    'label',
    'small',
    'strong',
    'em',
    'b',
    'i',
    'li',
    'figcaption',
    'blockquote',
    'code',
    'pre',
]);

function wait(ms: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function toPx(value: string): number {
    const parsed = Number.parseFloat(value || '0');
    return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function readInsets(css: CSSStyleDeclaration, prefix: 'padding' | 'margin'): FigmaSceneInsets {
    return {
        top: round2(toPx(prefix === 'padding' ? css.paddingTop : css.marginTop)),
        right: round2(toPx(prefix === 'padding' ? css.paddingRight : css.marginRight)),
        bottom: round2(toPx(prefix === 'padding' ? css.paddingBottom : css.marginBottom)),
        left: round2(toPx(prefix === 'padding' ? css.paddingLeft : css.marginLeft)),
    };
}

function normalizeBounds(rect: DOMRect, rootRect: DOMRect): FigmaSceneBounds {
    return {
        x: round2(rect.left - rootRect.left),
        y: round2(rect.top - rootRect.top),
        width: round2(rect.width),
        height: round2(rect.height),
    };
}

function getNodeName(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const idName = (element.getAttribute('id') || '').trim();
    const className = (element.getAttribute('class') || '').trim();
    if (idName) return `${tagName}#${idName}`;
    if (className) return `${tagName}.${className.split(/\s+/)[0]}`;
    return tagName;
}

function hasElementChildren(element: Element): boolean {
    return Array.from(element.children).some((child) => !SKIP_TAGS.has(child.tagName.toLowerCase()));
}

function isHtmlElement(element: Element): element is HTMLElement {
    const view = element.ownerDocument.defaultView;
    return Boolean(view && element instanceof view.HTMLElement);
}

function isMaterialIconElement(element: HTMLElement): boolean {
    const className = String(element.getAttribute('class') || '');
    return /material-symbols|material-icons/i.test(className);
}

function isSvgElement(element: Element): element is SVGSVGElement {
    return element.tagName.toLowerCase() === 'svg';
}

function isCanvasElement(element: Element): element is HTMLCanvasElement {
    return element.tagName.toLowerCase() === 'canvas';
}

function extractDirectText(element: HTMLElement): string {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'input') {
        const input = element as HTMLInputElement;
        return String(input.value || input.placeholder || '').trim();
    }
    if (tagName === 'textarea') {
        const input = element as HTMLTextAreaElement;
        return String(input.value || input.placeholder || '').trim();
    }
    const directText = getSignificantDirectTextNodes(element)
        .map((node) => node.textContent || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    return directText;
}

function getSignificantDirectTextNodes(element: HTMLElement): Text[] {
    return Array.from(element.childNodes)
        .filter((node): node is Text => node.nodeType === Node.TEXT_NODE)
        .filter((node) => Boolean((node.textContent || '').replace(/\s+/g, ' ').trim()));
}

function measureTextNode(textNode: Text, fallbackRect: DOMRect): { rect: DOMRect; lineCount: number } {
    const doc = textNode.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(textNode);
    const rect = range.getBoundingClientRect();
    const lineRects = Array.from(range.getClientRects());
    const targetRect = rect.width > 0 || rect.height > 0 ? rect : fallbackRect;
    return {
        rect: targetRect,
        lineCount: Math.max(1, lineRects.length || 1),
    };
}

function hasVisualChrome(css: CSSStyleDeclaration): boolean {
    return css.backgroundColor !== 'rgba(0, 0, 0, 0)'
        || toPx(css.borderTopWidth) > 0
        || toPx(css.borderRightWidth) > 0
        || toPx(css.borderBottomWidth) > 0
        || toPx(css.borderLeftWidth) > 0
        || css.boxShadow !== 'none'
        || css.backdropFilter !== 'none';
}

function shouldSkipElement(element: Element, css: CSSStyleDeclaration): boolean {
    const tagName = element.tagName.toLowerCase();
    if (SKIP_TAGS.has(tagName)) return true;
    if (css.display === 'none' || css.visibility === 'hidden') return true;
    if (isHtmlElement(element) && element.hidden) return true;
    return false;
}

function inferNodeType(element: HTMLElement, css: CSSStyleDeclaration): EazyUiFigmaSceneNode['nodeType'] {
    const tagName = element.tagName.toLowerCase();
    const hasText = Boolean(extractDirectText(element));
    if (tagName === 'img') return 'image';
    if (TEXT_TAGS.has(tagName) && !hasElementChildren(element) && !hasVisualChrome(css)) {
        return 'text';
    }
    if ((tagName === 'input' || tagName === 'textarea') && hasText) {
        return 'frame';
    }
    return 'frame';
}

function inferSizeMode(
    css: CSSStyleDeclaration,
    axis: 'width' | 'height',
): FigmaSceneLayout['widthMode'] {
    const display = String(css.display || '').toLowerCase();
    const sizeValue = String(axis === 'width' ? css.width : css.height || '').toLowerCase();
    if (sizeValue === 'max-content' || sizeValue === 'fit-content') return 'hug';
    if (sizeValue === 'auto' && (display === 'inline' || display === 'inline-flex' || display === 'inline-block')) {
        return 'hug';
    }
    return 'fixed';
}

function buildLayout(css: CSSStyleDeclaration): FigmaSceneLayout {
    const flexGrow = Number.parseFloat(css.flexGrow || '0');
    const flexShrink = Number.parseFloat(css.flexShrink || '1');
    const minWidth = css.minWidth && css.minWidth !== 'auto' ? round2(toPx(css.minWidth)) : undefined;
    const maxWidth = css.maxWidth && css.maxWidth !== 'none' ? round2(toPx(css.maxWidth)) : undefined;
    const minHeight = css.minHeight && css.minHeight !== 'auto' ? round2(toPx(css.minHeight)) : undefined;
    const maxHeight = css.maxHeight && css.maxHeight !== 'none' ? round2(toPx(css.maxHeight)) : undefined;
    return {
        display: css.display,
        position: css.position,
        flexDirection: css.flexDirection || undefined,
        justifyContent: css.justifyContent || undefined,
        alignContent: css.alignContent || undefined,
        alignItems: css.alignItems || undefined,
        alignSelf: css.alignSelf || undefined,
        gap: round2(toPx(css.gap)),
        rowGap: round2(toPx(css.rowGap || css.gap)),
        columnGap: round2(toPx(css.columnGap || css.gap)),
        wrap: css.flexWrap === 'wrap' || css.flexWrap === 'wrap-reverse',
        flexGrow: Number.isFinite(flexGrow) ? round2(flexGrow) : undefined,
        flexShrink: Number.isFinite(flexShrink) ? round2(flexShrink) : undefined,
        flexBasis: css.flexBasis && css.flexBasis !== 'auto' ? css.flexBasis : undefined,
        justifySelf: css.justifySelf || undefined,
        widthMode: inferSizeMode(css, 'width'),
        heightMode: inferSizeMode(css, 'height'),
        minWidth: minWidth && minWidth > 0 ? minWidth : undefined,
        maxWidth: maxWidth && maxWidth > 0 ? maxWidth : undefined,
        minHeight: minHeight && minHeight > 0 ? minHeight : undefined,
        maxHeight: maxHeight && maxHeight > 0 ? maxHeight : undefined,
        overflowX: css.overflowX || undefined,
        overflowY: css.overflowY || undefined,
        safeAutoLayout: false,
        padding: readInsets(css, 'padding'),
        margin: readInsets(css, 'margin'),
    };
}

function inferSafeAutoLayout(
    css: CSSStyleDeclaration,
    children: EazyUiFigmaSceneNode[],
): boolean {
    const display = String(css.display || '').toLowerCase();
    const position = String(css.position || '').toLowerCase();
    const isFlex = display === 'flex' || display === 'inline-flex';
    if (!isFlex) return false;
    if (position === 'absolute' || position === 'fixed') return false;
    if (css.flexWrap === 'wrap' || css.flexWrap === 'wrap-reverse') return false;
    if (children.length < 2) return false;
    return !children.some((child) => {
        const childPosition = String(child.layout?.position || '').toLowerCase();
        const margin = child.layout?.margin || { top: 0, right: 0, bottom: 0, left: 0 };
        const hasNonZeroMargin = [
            margin.top,
            margin.right,
            margin.bottom,
            margin.left,
        ].some((value) => Math.abs(Number(value) || 0) > 0.01);
        return childPosition === 'absolute'
            || childPosition === 'fixed'
            || hasNonZeroMargin;
    });
}

function buildBorder(css: CSSStyleDeclaration): FigmaSceneBorder {
    return {
        radius: css.borderRadius,
        top: {
            width: round2(toPx(css.borderTopWidth)),
            color: css.borderTopColor,
            style: css.borderTopStyle,
        },
        right: {
            width: round2(toPx(css.borderRightWidth)),
            color: css.borderRightColor,
            style: css.borderRightStyle,
        },
        bottom: {
            width: round2(toPx(css.borderBottomWidth)),
            color: css.borderBottomColor,
            style: css.borderBottomStyle,
        },
        left: {
            width: round2(toPx(css.borderLeftWidth)),
            color: css.borderLeftColor,
            style: css.borderLeftStyle,
        },
    };
}

function buildTypography(css: CSSStyleDeclaration): FigmaSceneTypography {
    return {
        fontFamily: css.fontFamily,
        fontSize: css.fontSize,
        fontWeight: css.fontWeight,
        fontStyle: css.fontStyle,
        lineHeight: css.lineHeight,
        letterSpacing: css.letterSpacing,
        textAlign: css.textAlign,
        textTransform: css.textTransform,
        textDecoration: css.textDecorationLine || css.textDecoration,
        whiteSpace: css.whiteSpace,
        fontVariationSettings: css.fontVariationSettings || undefined,
    };
}

function parseRotationFromTransform(transform: string | undefined): number | undefined {
    const raw = String(transform || '').trim();
    if (!raw || raw === 'none') return undefined;

    const matrixMatch = raw.match(/^matrix\(([^)]+)\)$/i);
    if (matrixMatch) {
        const values = matrixMatch[1]
            .split(',')
            .map((part) => Number.parseFloat(part.trim()))
            .filter((value) => Number.isFinite(value));
        if (values.length >= 2) {
            const angle = Math.atan2(values[1] || 0, values[0] || 1) * (180 / Math.PI);
            return Math.abs(angle) > 0.01 ? round2(angle) : undefined;
        }
    }

    const matrix3dMatch = raw.match(/^matrix3d\(([^)]+)\)$/i);
    if (matrix3dMatch) {
        const values = matrix3dMatch[1]
            .split(',')
            .map((part) => Number.parseFloat(part.trim()))
            .filter((value) => Number.isFinite(value));
        if (values.length >= 6) {
            const angle = Math.atan2(values[1] || 0, values[0] || 1) * (180 / Math.PI);
            return Math.abs(angle) > 0.01 ? round2(angle) : undefined;
        }
    }

    return undefined;
}

function parseMatrixFromTransform(
    transform: string | undefined,
): FigmaSceneTransform['matrix'] | undefined {
    const raw = String(transform || '').trim();
    if (!raw || raw === 'none') return undefined;

    const matrixMatch = raw.match(/^matrix\(([^)]+)\)$/i);
    if (matrixMatch) {
        const values = matrixMatch[1]
            .split(',')
            .map((part) => Number.parseFloat(part.trim()))
            .filter((value) => Number.isFinite(value));
        if (values.length >= 4) {
            return {
                a: round2(values[0] || 1),
                b: round2(values[1] || 0),
                c: round2(values[2] || 0),
                d: round2(values[3] || 1),
                e: round2(values[4] || 0),
                f: round2(values[5] || 0),
            };
        }
    }

    const matrix3dMatch = raw.match(/^matrix3d\(([^)]+)\)$/i);
    if (matrix3dMatch) {
        const values = matrix3dMatch[1]
            .split(',')
            .map((part) => Number.parseFloat(part.trim()))
            .filter((value) => Number.isFinite(value));
        if (values.length >= 6) {
            return {
                a: round2(values[0] || 1),
                b: round2(values[1] || 0),
                c: round2(values[4] || 0),
                d: round2(values[5] || 1),
                e: round2(values[12] || 0),
                f: round2(values[13] || 0),
            };
        }
    }

    return undefined;
}

function parseTransformOrigin(
    value: string | undefined,
    layoutSize: { width: number; height: number },
): { x: number; y: number } | undefined {
    const raw = String(value || '').trim();
    if (!raw) return undefined;

    const [xToken = '50%', yToken = '50%'] = raw.split(/\s+/);

    function resolve(token: string, size: number): number {
        const normalized = token.toLowerCase();
        if (normalized === 'left' || normalized === 'top') return 0;
        if (normalized === 'center') return round2(size / 2);
        if (normalized === 'right' || normalized === 'bottom') return round2(size);
        if (normalized.endsWith('%')) {
            return round2((Number.parseFloat(normalized) / 100) * size);
        }
        return round2(toPx(normalized));
    }

    return {
        x: resolve(xToken, layoutSize.width),
        y: resolve(yToken, layoutSize.height),
    };
}

function measureLayoutSize(
    element: HTMLElement,
    css: CSSStyleDeclaration,
    bounds: FigmaSceneBounds,
): { width: number; height: number } {
    const widthFromOffset = Number.isFinite(element.offsetWidth) && element.offsetWidth > 0
        ? element.offsetWidth
        : 0;
    const heightFromOffset = Number.isFinite(element.offsetHeight) && element.offsetHeight > 0
        ? element.offsetHeight
        : 0;
    const widthFromCss = toPx(css.width);
    const heightFromCss = toPx(css.height);

    return {
        width: round2(widthFromOffset || widthFromCss || bounds.width),
        height: round2(heightFromOffset || heightFromCss || bounds.height),
    };
}

function buildTransform(
    element: HTMLElement,
    css: CSSStyleDeclaration,
    bounds: FigmaSceneBounds,
): FigmaSceneTransform | undefined {
    const rotation = parseRotationFromTransform(css.transform);
    const matrix = parseMatrixFromTransform(css.transform);
    const hasTransform = rotation !== undefined || matrix !== undefined;
    if (!hasTransform) return undefined;

    const layoutSize = measureLayoutSize(element, css, bounds);
    const origin = parseTransformOrigin(css.transformOrigin, layoutSize);
    return {
        rotation,
        layoutWidth: layoutSize.width,
        layoutHeight: layoutSize.height,
        matrix,
        originX: origin?.x,
        originY: origin?.y,
    };
}

function buildVisual(css: CSSStyleDeclaration, element: Element): FigmaSceneVisual {
    const webkitMaskImage = (css as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage;
    const webkitMaskPosition = (css as CSSStyleDeclaration & { webkitMaskPosition?: string }).webkitMaskPosition;
    const webkitMaskRepeat = (css as CSSStyleDeclaration & { webkitMaskRepeat?: string }).webkitMaskRepeat;
    const webkitMaskSize = (css as CSSStyleDeclaration & { webkitMaskSize?: string }).webkitMaskSize;
    const base: FigmaSceneVisual = {
        color: css.color,
        backgroundColor: css.backgroundColor,
        backgroundImage: css.backgroundImage && css.backgroundImage !== 'none'
            ? css.backgroundImage
            : undefined,
        backgroundSize: css.backgroundSize && css.backgroundSize !== 'auto'
            ? css.backgroundSize
            : undefined,
        backgroundPosition: css.backgroundPosition && css.backgroundPosition !== '0% 0%'
            ? css.backgroundPosition
            : undefined,
        backgroundRepeat: css.backgroundRepeat && css.backgroundRepeat !== 'repeat'
            ? css.backgroundRepeat
            : undefined,
        backgroundBlendMode: css.backgroundBlendMode && css.backgroundBlendMode !== 'normal'
            ? css.backgroundBlendMode
            : undefined,
        opacity: css.opacity,
        boxShadow: css.boxShadow,
        filter: css.filter && css.filter !== 'none'
            ? css.filter
            : undefined,
        backdropFilter: css.backdropFilter && css.backdropFilter !== 'none'
            ? css.backdropFilter
            : undefined,
        textShadow: css.textShadow && css.textShadow !== 'none'
            ? css.textShadow
            : undefined,
        mixBlendMode: css.mixBlendMode && css.mixBlendMode !== 'normal'
            ? css.mixBlendMode
            : undefined,
        clipPath: css.clipPath && css.clipPath !== 'none'
            ? css.clipPath
            : undefined,
        maskImage: css.maskImage && css.maskImage !== 'none'
            ? css.maskImage
            : webkitMaskImage && webkitMaskImage !== 'none'
                ? webkitMaskImage
                : undefined,
        maskSize: css.maskSize && css.maskSize !== 'auto'
            ? css.maskSize
            : webkitMaskSize && webkitMaskSize !== 'auto'
                ? webkitMaskSize
                : undefined,
        maskPosition: css.maskPosition && css.maskPosition !== '0% 0%'
            ? css.maskPosition
            : webkitMaskPosition && webkitMaskPosition !== '0% 0%'
                ? webkitMaskPosition
                : undefined,
        maskRepeat: css.maskRepeat && css.maskRepeat !== 'repeat'
            ? css.maskRepeat
            : webkitMaskRepeat && webkitMaskRepeat !== 'repeat'
                ? webkitMaskRepeat
                : undefined,
        outlineWidth: css.outlineWidth && css.outlineWidth !== '0px'
            ? css.outlineWidth
            : undefined,
        outlineColor: css.outlineColor && css.outlineColor !== 'currentcolor'
            ? css.outlineColor
            : undefined,
        outlineStyle: css.outlineStyle && css.outlineStyle !== 'none'
            ? css.outlineStyle
            : undefined,
        outlineOffset: css.outlineOffset && css.outlineOffset !== '0px'
            ? css.outlineOffset
            : undefined,
    };

    if (element.tagName.toLowerCase() === 'img') {
        base.objectFit = css.objectFit || undefined;
        base.objectPosition = css.objectPosition || undefined;
    }

    return base;
}

function getSyntheticTextStyle(
    element: HTMLElement,
    baseCss: CSSStyleDeclaration | undefined,
): CSSStyleDeclaration | undefined {
    const view = element.ownerDocument.defaultView;
    if (!view || !baseCss) return baseCss;

    const tagName = element.tagName.toLowerCase();
    if (tagName !== 'input' && tagName !== 'textarea') {
        return baseCss;
    }

    const field = element as HTMLInputElement | HTMLTextAreaElement;
    if (String(field.value || '').trim() || !String(field.placeholder || '').trim()) {
        return baseCss;
    }

    return view.getComputedStyle(element, '::placeholder') || baseCss;
}

function createTextChild(
    element: HTMLElement,
    textNode: Text | null,
    rootRect: DOMRect,
    nodeId: string,
): EazyUiFigmaSceneNode | null {
    const textContent = textNode
        ? String(textNode.textContent || '').replace(/\s+/g, ' ').trim()
        : extractDirectText(element);
    if (!textContent) return null;

    const fallbackRect = element.getBoundingClientRect();
    const measurement = textNode
        ? measureTextNode(textNode, fallbackRect)
        : {
            rect: fallbackRect,
            lineCount: 1,
        };
    const targetRect = measurement.rect;
    const view = element.ownerDocument.defaultView;
    const baseCss = view?.getComputedStyle(element);
    const css = textNode ? baseCss : getSyntheticTextStyle(element, baseCss);
    return {
        id: nodeId,
        name: `${getNodeName(element)}:text`,
        nodeType: 'text',
        tagName: '#text',
        bounds: normalizeBounds(targetRect, rootRect),
        layout: {
            display: 'inline',
            position: 'static',
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
        },
        border: {
            radius: '0px',
            top: { width: 0, color: 'transparent', style: 'none' },
            right: { width: 0, color: 'transparent', style: 'none' },
            bottom: { width: 0, color: 'transparent', style: 'none' },
            left: { width: 0, color: 'transparent', style: 'none' },
        },
        visual: {
            color: css?.color || 'rgb(17, 24, 39)',
            backgroundColor: 'rgba(0, 0, 0, 0)',
            opacity: css?.opacity || '1',
            boxShadow: 'none',
        },
        typography: buildTypography(css || element.style),
        textMetrics: {
            lineCount: measurement.lineCount,
            renderedWidth: round2(measurement.rect.width),
            renderedHeight: round2(measurement.rect.height),
        },
        textContent,
        children: [],
    };
}

function createIconImageDataUrl(
    css: CSSStyleDeclaration,
    bounds: FigmaSceneBounds,
    iconText: string,
): string | null {
    if (typeof document === 'undefined') return null;
    const width = Math.max(1, Math.ceil(bounds.width));
    const height = Math.max(1, Math.ceil(bounds.height));
    const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = css.color || '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontStyle = css.fontStyle || 'normal';
    const fontWeight = css.fontWeight || '400';
    const fontSize = css.fontSize || `${Math.min(width, height)}px`;
    const fontFamily = css.fontFamily || 'sans-serif';
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
    ctx.fillText(iconText, width / 2, height / 2);
    return canvas.toDataURL('image/png');
}

function serializeSvgElement(
    element: SVGSVGElement,
    bounds: FigmaSceneBounds,
): string {
    const clone = element.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(Math.max(1, Math.round(bounds.width))));
    clone.setAttribute('height', String(Math.max(1, Math.round(bounds.height))));
    if (!clone.getAttribute('viewBox')) {
        clone.setAttribute('viewBox', `0 0 ${Math.max(1, Math.round(bounds.width))} ${Math.max(1, Math.round(bounds.height))}`);
    }
    return clone.outerHTML;
}

function getCanvasDataUrl(element: HTMLCanvasElement): string | null {
    try {
        return element.toDataURL('image/png');
    } catch {
        return null;
    }
}

function buildSceneNode(
    element: Element,
    rootRect: DOMRect,
): EazyUiFigmaSceneNode | null {
    const view = element.ownerDocument.defaultView;
    if (!view) return null;
    const css = view.getComputedStyle(element);
    if (shouldSkipElement(element, css)) return null;

    const bounds = normalizeBounds(element.getBoundingClientRect(), rootRect);
    const isHtml = isHtmlElement(element);
    if (!isHtml && !isSvgElement(element)) return null;
    const hasSize = bounds.width > 0.25 || bounds.height > 0.25;
    const directText = isHtml ? extractDirectText(element) : '';
    if (!hasSize && !directText) return null;

    if (isSvgElement(element)) {
        return {
            id: element.getAttribute('data-uid')
                || element.getAttribute('id')
                || `svg-${Math.random().toString(36).slice(2, 10)}`,
            name: getNodeName(element),
            nodeType: 'svg',
            tagName: element.tagName.toLowerCase(),
            bounds,
            layout: buildLayout(css),
            border: buildBorder(css),
            visual: buildVisual(css, element),
            svg: {
                markup: serializeSvgElement(element, bounds),
                kind: 'inline-svg',
            },
            children: [],
        };
    }

    if (isCanvasElement(element)) {
        return {
            id: element.getAttribute('data-uid')
                || element.getAttribute('id')
                || `canvas-${Math.random().toString(36).slice(2, 10)}`,
            name: getNodeName(element),
            nodeType: 'image',
            tagName: element.tagName.toLowerCase(),
            bounds,
            layout: buildLayout(css),
            border: buildBorder(css),
            visual: buildVisual(css, element),
            image: {
                src: getCanvasDataUrl(element) || '',
                alt: 'Canvas render',
                kind: 'content-image',
            },
            children: [],
        };
    }

    if (isMaterialIconElement(element)) {
        const iconText = (element.textContent || '').trim();
        const iconSrc = createIconImageDataUrl(css, bounds, iconText);
        return {
            id: element.getAttribute('data-uid')
                || element.getAttribute('id')
                || `${element.tagName.toLowerCase()}-${Math.random().toString(36).slice(2, 10)}`,
            name: getNodeName(element),
            nodeType: 'image',
            tagName: element.tagName.toLowerCase(),
            bounds,
            layout: buildLayout(css),
            border: buildBorder(css),
            visual: buildVisual(css, element),
            typography: buildTypography(css),
            textContent: iconText || undefined,
            image: {
                src: iconSrc || '',
                alt: iconText,
                kind: 'icon-raster',
            },
            children: [],
        };
    }

    if (!isHtml) return null;
    const nodeType = inferNodeType(element, css);
    const nodeId = element.getAttribute('data-uid')
        || element.getAttribute('id')
        || `${element.tagName.toLowerCase()}-${Math.random().toString(36).slice(2, 10)}`;
    const transform = buildTransform(element, css, bounds);

    if (nodeType === 'text') {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const lineRects = Array.from(range.getClientRects());
        const layout = buildLayout(css);
        return {
            id: nodeId,
            name: getNodeName(element),
            nodeType,
            tagName: element.tagName.toLowerCase(),
            bounds,
            layout,
            border: buildBorder(css),
            visual: buildVisual(css, element),
            transform,
            typography: buildTypography(css),
            textMetrics: {
                lineCount: Math.max(1, lineRects.length || 1),
                renderedWidth: round2(bounds.width),
                renderedHeight: round2(bounds.height),
            },
            textContent: (element.textContent || '').replace(/\s+/g, ' ').trim(),
            children: [],
        };
    }

    const children: EazyUiFigmaSceneNode[] = [];
    let directTextIndex = 0;
    for (const childNode of Array.from(element.childNodes)) {
        if (childNode.nodeType === Node.TEXT_NODE) {
            const textChild = createTextChild(
                element,
                childNode as Text,
                rootRect,
                `${nodeId}:text:${directTextIndex}`,
            );
            directTextIndex += 1;
            if (textChild) {
                children.push(textChild);
            }
            continue;
        }

        if (childNode.nodeType !== Node.ELEMENT_NODE) continue;
        const child = buildSceneNode(childNode as Element, rootRect);
        if (child) {
            children.push(child);
        }
    }

    const tagName = element.tagName.toLowerCase();
    const isFormField = tagName === 'input' || tagName === 'textarea';
    if (isFormField && directText && !children.some((child) => child.nodeType === 'text')) {
        const textChild = createTextChild(element, null, rootRect, `${nodeId}:text:field`);
        if (textChild) {
            children.push(textChild);
        }
    }

    if (nodeType === 'image') {
        const imageElement = element as HTMLImageElement;
        const layout = buildLayout(css);
        return {
            id: nodeId,
            name: getNodeName(element),
            nodeType,
            tagName: element.tagName.toLowerCase(),
            bounds,
            layout,
            border: buildBorder(css),
            visual: buildVisual(css, element),
            transform,
            image: {
                src: imageElement.currentSrc || imageElement.src || '',
                alt: imageElement.alt || '',
                kind: 'content-image',
            },
            children: [],
        };
    }

    const layout = buildLayout(css);
    layout.safeAutoLayout = inferSafeAutoLayout(css, children);

    return {
        id: nodeId,
        name: getNodeName(element),
        nodeType,
        tagName: element.tagName.toLowerCase(),
        bounds,
        layout,
        border: buildBorder(css),
        visual: buildVisual(css, element),
        transform,
        typography: directText ? buildTypography(css) : undefined,
        textContent: directText || undefined,
        children,
    };
}

function wrapHtmlForMeasurement(html: string, width: number, height: number): string {
    const source = String(html || '').trim();
    const freezeStyle = `
<style id="eazyui-export-freeze">
  html, body {
    margin: 0 !important;
    width: ${width}px !important;
    min-width: ${width}px !important;
    height: ${height}px !important;
    min-height: ${height}px !important;
    overflow: hidden !important;
    scrollbar-width: none !important;
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    display: none !important;
  }
  *, *::before, *::after {
    animation-play-state: paused !important;
    caret-color: transparent !important;
  }
</style>`;
    if (!source) {
        return `<!DOCTYPE html><html><head>${freezeStyle}</head><body style="margin:0;width:${width}px;height:${height}px;"></body></html>`;
    }

    if (/<html[\s>]/i.test(source)) {
        if (/<head\b[^>]*>/i.test(source)) {
            return source.replace(/<head\b([^>]*)>/i, `<head$1>${freezeStyle}`);
        }
        return source.replace(/<html\b([^>]*)>/i, `<html$1><head>${freezeStyle}</head>`);
    }

    return `<!DOCTYPE html><html><head>${freezeStyle}</head><body style="margin:0;width:${width}px;height:${height}px;">${source}</body></html>`;
}

function parseTimeToken(value: string): number {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    if (raw.endsWith('ms')) return Math.max(0, parseFloat(raw));
    if (raw.endsWith('s')) return Math.max(0, parseFloat(raw) * 1000);
    return 0;
}

function getMaxAnimatedSettleMs(doc: Document): number {
    const elements = Array.from(doc.querySelectorAll<HTMLElement>('*'));
    let maxMs = 0;

    for (const element of elements) {
        const css = doc.defaultView?.getComputedStyle(element);
        if (!css) continue;

        const animationDurations = css.animationDuration.split(',').map(parseTimeToken);
        const animationDelays = css.animationDelay.split(',').map(parseTimeToken);
        const transitionDurations = css.transitionDuration.split(',').map(parseTimeToken);
        const transitionDelays = css.transitionDelay.split(',').map(parseTimeToken);

        animationDurations.forEach((duration, index) => {
            const total = duration + (animationDelays[index] || animationDelays[0] || 0);
            maxMs = Math.max(maxMs, total);
        });
        transitionDurations.forEach((duration, index) => {
            const total = duration + (transitionDelays[index] || transitionDelays[0] || 0);
            maxMs = Math.max(maxMs, total);
        });
    }

    return Math.min(2200, Math.max(0, maxMs));
}

function freezeAnimations(doc: Document) {
    const style = doc.createElement('style');
    style.id = 'eazyui-export-disable-motion';
    style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
      }
    `;
    doc.head.appendChild(style);
}

async function createMeasurementIframe(screen: SourceScreen): Promise<{
    iframe: HTMLIFrameElement;
    cleanup: () => void;
}> {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.left = '-100000px';
    iframe.style.top = '0';
    iframe.style.width = `${screen.width}px`;
    iframe.style.height = `${screen.height}px`;
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.border = '0';
    iframe.srcdoc = wrapHtmlForMeasurement(screen.html, screen.width, screen.height);
    document.body.appendChild(iframe);

    await new Promise<void>((resolve) => {
        iframe.addEventListener('load', () => resolve(), { once: true });
    });

    const frameDocument = iframe.contentDocument;
    if (!frameDocument) {
        iframe.remove();
        throw new Error('Measurement frame did not provide a document.');
    }
    if (frameDocument?.fonts?.ready) {
        try {
            await frameDocument.fonts.ready;
        } catch {
            // Ignore font readiness failures; we still want the measured DOM.
        }
    }

    const settleMs = getMaxAnimatedSettleMs(frameDocument);
    if (settleMs > 0) {
        await wait(settleMs + 80);
    }
    freezeAnimations(frameDocument);

    await wait(120);
    await wait(120);

    return {
        iframe,
        cleanup: () => iframe.remove(),
    };
}

function buildScreenScene(screen: SourceScreen, iframe: HTMLIFrameElement): EazyUiFigmaSceneScreen {
    const frameDocument = iframe.contentDocument;
    if (!frameDocument?.body) {
        throw new Error('Measurement frame did not produce a document body.');
    }

    const body = frameDocument.body;
    const bodyStyle = iframe.contentWindow?.getComputedStyle(body);
    const rootRect = body.getBoundingClientRect();
    const children = Array.from(body.children)
        .map((child) => buildSceneNode(child, rootRect))
        .filter(Boolean) as EazyUiFigmaSceneNode[];

    const root: EazyUiFigmaSceneNode = {
        id: `screen:${screen.screenId}`,
        name: screen.name,
        nodeType: 'screen',
        tagName: 'body',
        bounds: {
            x: 0,
            y: 0,
            width: screen.width,
            height: screen.height,
        },
        layout: bodyStyle ? buildLayout(bodyStyle) : {
            display: 'block',
            position: 'static',
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
        },
        border: bodyStyle ? buildBorder(bodyStyle) : {
            radius: '0px',
            top: { width: 0, color: 'transparent', style: 'none' },
            right: { width: 0, color: 'transparent', style: 'none' },
            bottom: { width: 0, color: 'transparent', style: 'none' },
            left: { width: 0, color: 'transparent', style: 'none' },
        },
        visual: bodyStyle ? buildVisual(bodyStyle, body) : {
            color: 'rgb(17, 24, 39)',
            backgroundColor: 'rgba(0, 0, 0, 0)',
            opacity: '1',
            boxShadow: 'none',
        },
        transform: bodyStyle ? buildTransform(body, bodyStyle, {
            x: 0,
            y: 0,
            width: screen.width,
            height: screen.height,
        }) : undefined,
        children,
    };

    return {
        screenId: screen.screenId,
        name: screen.name,
        width: screen.width,
        height: screen.height,
        root,
    };
}

export async function buildFigmaPastePayload(
    screens: SourceScreen[],
    designSystem?: ProjectDesignSystem | null,
): Promise<EazyUiFigmaScenePayload> {
    const scenes: EazyUiFigmaSceneScreen[] = [];

    for (const screen of screens) {
        const { iframe, cleanup } = await createMeasurementIframe(screen);
        try {
            scenes.push(buildScreenScene(screen, iframe));
        } finally {
            cleanup();
        }
    }

    return {
        format: 'eazyui.figma-scene',
        version: 2,
        generatedAt: new Date().toISOString(),
        notes: [
            'This is EazyUI-owned scene data derived from rendered HTML and resolved browser styles.',
            'It is not the undocumented native Figma clipboard format.',
            'Use this payload with an EazyUI Figma plugin or a future native writer bridge.',
        ],
        designSystem: designSystem || undefined,
        screens: scenes,
    };
}
