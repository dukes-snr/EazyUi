type ExportScreen = {
    screenId: string;
    name: string;
    html: string;
    width: number;
    height: number;
    status?: 'streaming' | 'complete';
};

type ExportSelection = {
    selectedBoardId?: string | null;
    selectedNodeIds?: string[];
};

type SelectionScope = 'selected' | 'all';

const textEncoder = new TextEncoder();

function toBytes(input: string): Uint8Array {
    return textEncoder.encode(input);
}

function sanitizeFilePart(input: string): string {
    return (input || 'screen')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'screen';
}

function pad2(v: number): string {
    return String(v).padStart(2, '0');
}

function nowStamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        crc ^= bytes[i];
        for (let j = 0; j < 8; j += 1) {
            const mask = -(crc & 1);
            crc = (crc >>> 1) ^ (0xedb88320 & mask);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
    const year = Math.max(1980, date.getFullYear());
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);
    const dosTime = (hours << 11) | (minutes << 5) | seconds;
    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    return { dosDate, dosTime };
}

function writeU16(view: DataView, offset: number, value: number) {
    view.setUint16(offset, value & 0xffff, true);
}

function writeU32(view: DataView, offset: number, value: number) {
    view.setUint32(offset, value >>> 0, true);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

type ZipEntry = { path: string; data: Uint8Array };

function createZipBlob(entries: ZipEntry[]): Blob {
    const now = new Date();
    const { dosDate, dosTime } = dosDateTime(now);
    const localChunks: Uint8Array[] = [];
    const centralChunks: Uint8Array[] = [];
    let offset = 0;

    entries.forEach((entry) => {
        const nameBytes = toBytes(entry.path);
        const dataBytes = entry.data;
        const crc = crc32(dataBytes);

        const localHeader = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(localHeader.buffer);
        writeU32(lv, 0, 0x04034b50);
        writeU16(lv, 4, 20);
        writeU16(lv, 6, 0);
        writeU16(lv, 8, 0);
        writeU16(lv, 10, dosTime);
        writeU16(lv, 12, dosDate);
        writeU32(lv, 14, crc);
        writeU32(lv, 18, dataBytes.length);
        writeU32(lv, 22, dataBytes.length);
        writeU16(lv, 26, nameBytes.length);
        writeU16(lv, 28, 0);
        localHeader.set(nameBytes, 30);

        localChunks.push(localHeader, dataBytes);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(centralHeader.buffer);
        writeU32(cv, 0, 0x02014b50);
        writeU16(cv, 4, 20);
        writeU16(cv, 6, 20);
        writeU16(cv, 8, 0);
        writeU16(cv, 10, 0);
        writeU16(cv, 12, dosTime);
        writeU16(cv, 14, dosDate);
        writeU32(cv, 16, crc);
        writeU32(cv, 20, dataBytes.length);
        writeU32(cv, 24, dataBytes.length);
        writeU16(cv, 28, nameBytes.length);
        writeU16(cv, 30, 0);
        writeU16(cv, 32, 0);
        writeU16(cv, 34, 0);
        writeU16(cv, 36, 0);
        writeU32(cv, 38, 0);
        writeU32(cv, 42, offset);
        centralHeader.set(nameBytes, 46);
        centralChunks.push(centralHeader);

        offset += localHeader.length + dataBytes.length;
    });

    const centralSize = centralChunks.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    writeU32(ev, 0, 0x06054b50);
    writeU16(ev, 4, 0);
    writeU16(ev, 6, 0);
    writeU16(ev, 8, entries.length);
    writeU16(ev, 10, entries.length);
    writeU32(ev, 12, centralSize);
    writeU32(ev, 16, offset);
    writeU16(ev, 20, 0);

    const blobParts: ArrayBuffer[] = [...localChunks.map(toArrayBuffer), ...centralChunks.map(toArrayBuffer), toArrayBuffer(end)];
    return new Blob(blobParts, { type: 'application/zip' });
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function htmlToCodeBlock(screen: ExportScreen): string {
    return [
        `<!-- Screen: ${screen.name} (${screen.screenId}) -->`,
        screen.html,
        '',
    ].join('\n');
}

function escapeXml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function proxiedImageUrl(raw: string): string {
    const input = (raw || '').trim();
    if (!input) return '';
    if (input.startsWith('data:') || input.startsWith('blob:')) return input;
    if (input.startsWith('/api/proxy-image')) {
        return input.includes('?url=') ? input : '';
    }
    if (/^https?:\/\//i.test(input)) {
        return `/api/proxy-image?url=${encodeURIComponent(input)}`;
    }
    if (/^\/\//.test(input)) {
        return `/api/proxy-image?url=${encodeURIComponent(`https:${input}`)}`;
    }
    if (/^(javascript:|about:|file:)/i.test(input)) return '';
    return input;
}

function rewriteExternalImageUrls(html: string): string {
    if (!html) return html;
    let next = html;
    const blankPixel = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

    // img/src
    next = next.replace(/(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (_, p1: string, src: string, p3: string) => {
        const rewritten = proxiedImageUrl(src) || blankPixel;
        return `${p1}${rewritten}${p3}`;
    });

    // source/srcset (best-effort: rewrite each URL token before descriptor)
    next = next.replace(/(<source\b[^>]*\bsrcset\s*=\s*["'])([^"']+)(["'])/gi, (_, p1: string, srcset: string, p3: string) => {
        const rewritten = srcset
            .split(',')
            .map((entry) => {
                const trimmed = entry.trim();
                if (!trimmed) return trimmed;
                const [url, descriptor] = trimmed.split(/\s+/, 2);
                const proxied = proxiedImageUrl(url);
                if (!proxied) return '';
                return descriptor ? `${proxied} ${descriptor}` : proxied;
            })
            .filter(Boolean)
            .join(', ');
        return `${p1}${rewritten || blankPixel}${p3}`;
    });

    return next;
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read blob.'));
        reader.readAsDataURL(blob);
    });
}

function parseCssUrls(value: string): string[] {
    const urls: string[] = [];
    const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
        if (m[2]) urls.push(m[2]);
    }
    return urls;
}

function replaceCssUrls(value: string, map: Map<string, string>): string {
    return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (full, quote: string, raw: string) => {
        const next = map.get(raw) || map.get(raw.trim());
        if (!next) return full;
        return `url(${quote || ''}${next}${quote || ''})`;
    });
}

function shouldInlineAsset(url: string): boolean {
    const v = (url || '').trim();
    if (!v) return false;
    if (v.startsWith('data:') || v.startsWith('blob:')) return false;
    if (/^(javascript:|about:|file:)/i.test(v)) return false;
    return true;
}

async function toInlineDataUrl(url: string, cache: Map<string, string>): Promise<string | null> {
    const key = url.trim();
    if (!shouldInlineAsset(key)) return null;
    if (cache.has(key)) return cache.get(key) || null;

    const fetchUrl = /^https?:\/\//i.test(key) || /^\/\//.test(key)
        ? proxiedImageUrl(key)
        : key;
    if (!fetchUrl) return null;

    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) return null;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) return null;
        const dataUrl = await blobToDataUrl(await response.blob());
        cache.set(key, dataUrl);
        return dataUrl;
    } catch {
        return null;
    }
}

async function inlineAssetsForRaster(html: string): Promise<string> {
    if (!html || typeof DOMParser === 'undefined') return html;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const cache = new Map<string, string>();

    // Remove executable scripts for deterministic offline raster.
    doc.querySelectorAll('script').forEach((node) => node.remove());

    const imgNodes = Array.from(doc.querySelectorAll('img[src]'));
    for (const node of imgNodes) {
        const raw = node.getAttribute('src') || '';
        const inlined = await toInlineDataUrl(raw, cache);
        if (inlined) node.setAttribute('src', inlined);
    }

    const sourceNodes = Array.from(doc.querySelectorAll('source[srcset]'));
    for (const node of sourceNodes) {
        const srcset = node.getAttribute('srcset') || '';
        const parts = srcset.split(',').map((s) => s.trim()).filter(Boolean);
        const rewritten: string[] = [];
        for (const part of parts) {
            const [url, descriptor] = part.split(/\s+/, 2);
            const inlined = await toInlineDataUrl(url, cache);
            const next = inlined || proxiedImageUrl(url) || '';
            if (!next) continue;
            rewritten.push(descriptor ? `${next} ${descriptor}` : next);
        }
        if (rewritten.length > 0) node.setAttribute('srcset', rewritten.join(', '));
    }

    const styleAttrNodes = Array.from(doc.querySelectorAll<HTMLElement>('[style]'));
    for (const node of styleAttrNodes) {
        const styleValue = node.getAttribute('style') || '';
        const urls = parseCssUrls(styleValue);
        if (urls.length === 0) continue;
        const localMap = new Map<string, string>();
        for (const url of urls) {
            const inlined = await toInlineDataUrl(url, cache);
            if (inlined) localMap.set(url, inlined);
        }
        if (localMap.size > 0) node.setAttribute('style', replaceCssUrls(styleValue, localMap));
    }

    const styleTags = Array.from(doc.querySelectorAll('style'));
    for (const tag of styleTags) {
        const cssText = tag.textContent || '';
        const urls = parseCssUrls(cssText);
        if (urls.length === 0) continue;
        const localMap = new Map<string, string>();
        for (const url of urls) {
            const inlined = await toInlineDataUrl(url, cache);
            if (inlined) localMap.set(url, inlined);
        }
        if (localMap.size > 0) tag.textContent = replaceCssUrls(cssText, localMap);
    }

    return doc.documentElement?.outerHTML || html;
}

function screenToSvgMarkup(screen: ExportScreen, x: number, y: number): string {
    const body = escapeXml(screen.html);
    return [
        `<g transform="translate(${x},${y})">`,
        `<rect x="0" y="0" width="${screen.width}" height="${screen.height}" rx="16" fill="#fff" stroke="#d0d7e2"/>`,
        `<foreignObject x="0" y="0" width="${screen.width}" height="${screen.height}">`,
        `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${screen.width}px;height:${screen.height}px;overflow:hidden;background:#fff;">${body}</div>`,
        `</foreignObject>`,
        `</g>`,
    ].join('');
}

function buildCombinedFigmaSvg(screens: ExportScreen[]): string {
    const gap = 48;
    const padding = 24;
    const width = Math.max(...screens.map((s) => s.width)) + padding * 2;
    let cursorY = padding;
    const chunks: string[] = [];

    screens.forEach((screen) => {
        chunks.push(screenToSvgMarkup(screen, padding, cursorY));
        cursorY += screen.height + gap;
    });

    const height = cursorY - gap + padding;
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect width="${width}" height="${height}" fill="#f4f6fb" />`,
        ...chunks,
        `</svg>`,
    ].join('');
}

export function getExportTargetScreens(
    spec: { screens: ExportScreen[] } | null,
    selection: ExportSelection,
): { screens: ExportScreen[]; scope: SelectionScope } {
    if (!spec || !Array.isArray(spec.screens) || spec.screens.length === 0) {
        return { screens: [], scope: 'all' };
    }

    const selectedIds = new Set<string>();
    (selection.selectedNodeIds || []).forEach((id) => {
        if (id) selectedIds.add(id);
    });
    if (selection.selectedBoardId) selectedIds.add(selection.selectedBoardId);

    if (selectedIds.size > 0) {
        const selected = spec.screens.filter((screen) => selectedIds.has(screen.screenId));
        if (selected.length > 0) {
            return { screens: selected, scope: 'selected' };
        }
    }

    return { screens: [...spec.screens], scope: 'all' };
}

export async function copyScreensCodeToClipboard(screens: ExportScreen[]): Promise<void> {
    if (screens.length === 0) throw new Error('No screens to copy.');
    const code = screens.length === 1
        ? screens[0].html
        : screens.map(htmlToCodeBlock).join('\n');
    await navigator.clipboard.writeText(code);
}

export function exportScreensAsZip(
    screens: ExportScreen[],
    designName = 'eazyui-design',
): { filename: string } {
    if (screens.length === 0) throw new Error('No screens to export.');

    const root = `${sanitizeFilePart(designName)}-${nowStamp()}`;
    const entries: ZipEntry[] = [];
    const manifest = {
        designName,
        exportedAt: new Date().toISOString(),
        totalScreens: screens.length,
        screens: screens.map((screen, idx) => ({
            index: idx + 1,
            screenId: screen.screenId,
            name: screen.name,
            file: `screens/${String(idx + 1).padStart(2, '0')}-${sanitizeFilePart(screen.name)}.html`,
            width: screen.width,
            height: screen.height,
            status: screen.status || 'complete',
        })),
    };

    entries.push({
        path: `${root}/manifest.json`,
        data: toBytes(JSON.stringify(manifest, null, 2)),
    });

    screens.forEach((screen, idx) => {
        entries.push({
            path: `${root}/screens/${String(idx + 1).padStart(2, '0')}-${sanitizeFilePart(screen.name)}.html`,
            data: toBytes(screen.html),
        });
    });

    const readme = [
        '# EazyUI Export',
        '',
        `Design: ${designName}`,
        `Exported: ${new Date().toISOString()}`,
        `Screens: ${screens.length}`,
        '',
        'Each screen is exported as a standalone HTML file in /screens.',
    ].join('\n');
    entries.push({ path: `${root}/README.md`, data: toBytes(readme) });

    const zip = createZipBlob(entries);
    const filename = `${root}.zip`;
    downloadBlob(zip, filename);
    return { filename };
}

async function buildSingleScreenSvg(screen: ExportScreen): Promise<string> {
    const preparedHtml = await inlineAssetsForRaster(rewriteExternalImageUrls(screen.html));
    const body = escapeXml(preparedHtml);
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${screen.width}" height="${screen.height}" viewBox="0 0 ${screen.width} ${screen.height}">`,
        `<foreignObject x="0" y="0" width="${screen.width}" height="${screen.height}">`,
        `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${screen.width}px;height:${screen.height}px;overflow:hidden;background:#fff;">${body}</div>`,
        `</foreignObject>`,
        `</svg>`,
    ].join('');
}

async function svgToPngBytes(svg: string, width: number, height: number, scale = 2): Promise<Uint8Array> {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to rasterize SVG.'));
            image.src = svgUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(width * scale));
        canvas.height = Math.max(1, Math.floor(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available.');
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.drawImage(img, 0, 0, width, height);

        const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('PNG conversion failed (possibly blocked by cross-origin assets).'));
                    return;
                }
                resolve(blob);
            }, 'image/png');
        });

        const buffer = await pngBlob.arrayBuffer();
        return new Uint8Array(buffer);
    } finally {
        URL.revokeObjectURL(svgUrl);
    }
}

async function renderScreenPngViaApi(screen: ExportScreen, scale = 2): Promise<Uint8Array | null> {
    try {
        const response = await fetch('/api/render-screen-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                html: screen.html,
                width: screen.width,
                height: screen.height,
                scale,
            }),
        });
        if (!response.ok) return null;
        const payload = await response.json() as { pngBase64?: string };
        if (!payload.pngBase64) return null;
        const binary = atob(payload.pngBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return null;
    }
}

export async function exportScreensAsImagesZip(
    screens: ExportScreen[],
    designName = 'eazyui-design',
): Promise<{ filename: string; pngCount: number; svgFallbackCount: number }> {
    if (screens.length === 0) throw new Error('No screens to export.');

    const root = `${sanitizeFilePart(designName)}-images-${nowStamp()}`;
    const entries: ZipEntry[] = [];
    const manifest = {
        designName,
        exportedAt: new Date().toISOString(),
        totalScreens: screens.length,
        format: 'mixed',
        scale: 2,
        screens: [] as Array<{
            index: number;
            screenId: string;
            name: string;
            file: string;
            format: 'png' | 'svg';
            width: number;
            height: number;
            status: string;
        }>,
    };
    let pngCount = 0;
    let svgFallbackCount = 0;

    for (let i = 0; i < screens.length; i += 1) {
        const screen = screens[i];
        const baseName = `${String(i + 1).padStart(2, '0')}-${sanitizeFilePart(screen.name)}`;
        const svg = await buildSingleScreenSvg(screen);
        try {
            const serverPngBytes = await renderScreenPngViaApi(screen, 2);
            const pngBytes = serverPngBytes || await svgToPngBytes(svg, screen.width, screen.height, 2);
            const filename = `${baseName}.png`;
            entries.push({
                path: `${root}/images/${filename}`,
                data: pngBytes,
            });
            manifest.screens.push({
                index: i + 1,
                screenId: screen.screenId,
                name: screen.name,
                file: `images/${filename}`,
                format: 'png',
                width: screen.width,
                height: screen.height,
                status: screen.status || 'complete',
            });
            pngCount += 1;
        } catch {
            const filename = `${baseName}.svg`;
            entries.push({
                path: `${root}/images/${filename}`,
                data: toBytes(svg),
            });
            manifest.screens.push({
                index: i + 1,
                screenId: screen.screenId,
                name: screen.name,
                file: `images/${filename}`,
                format: 'svg',
                width: screen.width,
                height: screen.height,
                status: screen.status || 'complete',
            });
            svgFallbackCount += 1;
        }
    }

    entries.push({
        path: `${root}/manifest.json`,
        data: toBytes(JSON.stringify(manifest, null, 2)),
    });
    entries.push({
        path: `${root}/README.md`,
        data: toBytes([
            '# EazyUI Image Export',
            '',
            `Design: ${designName}`,
            `Screens: ${screens.length}`,
            'Requested Format: PNG',
            'Scale: 2x',
            'Fallback: SVG when browser blocks rasterization (tainted canvas/CORS).',
        ].join('\n')),
    });

    const zip = createZipBlob(entries);
    const zipName = `${root}.zip`;
    downloadBlob(zip, zipName);
    return { filename: zipName, pngCount, svgFallbackCount };
}

export async function exportScreensToFigmaClipboard(
    screens: ExportScreen[],
): Promise<{ mode: 'clipboard' | 'download'; filename?: string }> {
    if (screens.length === 0) throw new Error('No screens to export.');
    const svg = buildCombinedFigmaSvg(screens);

    if (typeof window !== 'undefined' && 'ClipboardItem' in window && navigator.clipboard?.write) {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore ClipboardItem is runtime-guarded above
        await navigator.clipboard.write([new ClipboardItem({ 'image/svg+xml': blob, 'text/plain': new Blob([svg], { type: 'text/plain' }) })]);
        return { mode: 'clipboard' };
    }

    const filename = `figma-export-${nowStamp()}.svg`;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename);
    return { mode: 'download', filename };
}
