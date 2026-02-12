import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useCanvasStore, useDesignStore } from '../../stores';
import { useEditStore } from '../../stores/edit-store';
import { type HtmlPatch } from '../../utils/htmlPatcher';
import { ArrowUpLeft, Images, Pipette, Redo2, SlidersHorizontal, Undo2, X } from 'lucide-react';

type PaddingValues = { top: string; right: string; bottom: string; left: string };
type ElementType = 'text' | 'button' | 'image' | 'container' | 'input' | 'icon' | 'badge';
type RGB = { r: number; g: number; b: number };
type RGBA = { r: number; g: number; b: number; a: number };
type HSV = { h: number; s: number; v: number };
type EyeDropperApi = new () => { open: () => Promise<{ sRGBHex: string }> };
type ScreenImageItem = { uid: string; src: string; alt: string };

const GAP_CLASSES = ['gap-0', 'gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-6', 'gap-8'];
const JUSTIFY_CLASSES = ['justify-start', 'justify-center', 'justify-end', 'justify-between', 'justify-around', 'justify-evenly'];
const ALIGN_CLASSES = ['items-start', 'items-center', 'items-end', 'items-stretch'];
const FLEX_DIR_CLASSES = ['flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse'];
const DISPLAY_CLASSES = ['flex', 'grid'];
const MATERIAL_ICON_FALLBACK_OPTIONS = [
    'home', 'search', 'settings', 'person', 'favorite', 'star', 'menu', 'close', 'check',
    'add', 'remove', 'edit', 'delete', 'arrow_back', 'arrow_forward', 'expand_more',
    'expand_less', 'chevron_left', 'chevron_right', 'notifications', 'shopping_cart',
    'shopping_bag', 'account_circle', 'calendar_today', 'event', 'schedule', 'today',
    'location_on', 'place', 'map', 'call', 'chat', 'mail', 'send', 'image', 'photo',
    'camera_alt', 'mic', 'play_arrow', 'pause', 'stop', 'volume_up', 'visibility',
    'visibility_off', 'lock', 'lock_open', 'help', 'info', 'warning', 'error',
    'thumb_up', 'thumb_down', 'bookmark', 'share', 'download', 'upload', 'bolt',
    'dark_mode', 'light_mode', 'palette', 'auto_awesome', 'rocket_launch', 'public',
    'language', 'school', 'work', 'badge', 'payments', 'credit_card', 'receipt_long',
    'local_shipping', 'directions_car', 'flight', 'restaurant', 'local_cafe',
];

const inputBase = 'w-full rounded-xl border border-white/10 bg-[#16181d] px-3 py-2 text-xs text-white outline-none transition-colors focus:border-indigo-400/60';
const selectBase = `${inputBase} appearance-none bg-[linear-gradient(45deg,transparent_50%,#9ca3af_50%),linear-gradient(135deg,#9ca3af_50%,transparent_50%)] bg-[position:calc(100%-16px)_calc(50%-2px),calc(100%-10px)_calc(50%-2px)] bg-[length:6px_6px,6px_6px] bg-no-repeat pr-8`;

function toPxValue(value?: string) {
    if (!value) return '';
    const match = value.match(/-?\d+(\.\d+)?/);
    return match ? match[0] : '';
}

function parsePadding(value?: string): PaddingValues {
    const raw = value?.trim() || '';
    if (!raw) return { top: '', right: '', bottom: '', left: '' };
    const parts = raw.split(/\s+/);
    if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): RGB | null {
    const clean = hex.trim().replace('#', '');
    if (clean.length !== 3 && clean.length !== 6) return null;
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    const int = parseInt(full, 16);
    if (Number.isNaN(int)) return null;
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function colorStringToRgba(color: string): RGBA | null {
    const normalized = color.trim();
    if (!normalized) return null;

    const hex = hexToRgb(normalized);
    if (hex) return { ...hex, a: 1 };

    const match = normalized.match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(',').map((x) => parseFloat(x.trim()));
    if (parts.length < 3 || parts.some((x, idx) => idx < 3 && Number.isNaN(x))) return null;
    const alpha = parts.length >= 4 && !Number.isNaN(parts[3]) ? clamp(parts[3], 0, 1) : 1;
    return { r: parts[0], g: parts[1], b: parts[2], a: alpha };
}

function resolveColorToRgba(color: string): RGBA | null {
    const direct = colorStringToRgba(color);
    if (direct) return direct;
    if (typeof document === 'undefined') return null;

    const probe = document.createElement('span');
    probe.style.color = color;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const resolved = window.getComputedStyle(probe).color;
    document.body.removeChild(probe);
    return colorStringToRgba(resolved);
}

function rgbaToCss({ r, g, b, a }: RGBA) {
    const rr = clamp(Math.round(r), 0, 255);
    const gg = clamp(Math.round(g), 0, 255);
    const bb = clamp(Math.round(b), 0, 255);
    const aa = clamp(a, 0, 1);
    return `rgba(${rr}, ${gg}, ${bb}, ${aa.toFixed(2)})`;
}

function rgbToHsv({ r, g, b }: RGB): HSV {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
        if (max === rn) h = ((gn - bn) / delta) % 6;
        else if (max === gn) h = (bn - rn) / delta + 2;
        else h = (rn - gn) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : (delta / max) * 100;
    const v = max * 100;
    return { h, s, v };
}

function hsvToRgb({ h, s, v }: HSV): RGB {
    const sn = clamp(s, 0, 100) / 100;
    const vn = clamp(v, 0, 100) / 100;
    const c = vn * sn;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = vn - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function getIframeByScreenId(screenId: string) {
    return document.querySelector(`iframe[data-screen-id="${screenId}"]`) as HTMLIFrameElement | null;
}

function clearSelectionOnOtherScreens(activeScreenId: string) {
    const iframes = Array.from(document.querySelectorAll('iframe[data-screen-id]')) as HTMLIFrameElement[];
    for (const iframe of iframes) {
        const screenId = iframe.getAttribute('data-screen-id');
        if (!screenId || screenId === activeScreenId) continue;
        iframe.contentWindow?.postMessage({ type: 'editor/clear_selection', screenId }, '*');
    }
}

function dispatchPatchToIframe(screenId: string, patch: HtmlPatch) {
    const iframe = getIframeByScreenId(screenId);
    iframe?.contentWindow?.postMessage({ type: 'editor/patch', screenId, patch }, '*');
}

function dispatchSelectParent(screenId: string, uid: string) {
    const iframe = getIframeByScreenId(screenId);
    iframe?.contentWindow?.postMessage({ type: 'editor/select_parent', screenId, uid }, '*');
}

function dispatchSelectUid(screenId: string, uid: string) {
    const iframe = getIframeByScreenId(screenId);
    iframe?.contentWindow?.postMessage({ type: 'editor/select_uid', screenId, uid }, '*');
}

function dispatchSelectScreenContainer(screenId: string) {
    const iframe = getIframeByScreenId(screenId);
    iframe?.contentWindow?.postMessage({ type: 'editor/select_screen_container', screenId }, '*');
}

function ScrubNumberInput({
    value,
    onChangeValue,
    step = 1,
    min,
    max,
    placeholder,
}: {
    value: string;
    onChangeValue: (next: string) => void;
    step?: number;
    min?: number;
    max?: number;
    placeholder?: string;
}) {
    return (
        <input
            value={value}
            onChange={(e) => onChangeValue(e.target.value)}
            type="number"
            step={step}
            min={min}
            max={max}
            className={inputBase}
            placeholder={placeholder}
        />
    );
}

function ColorWheelInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
    const [open, setOpen] = useState(false);
    const [hsv, setHsv] = useState<HSV>({ h: 0, s: 0, v: 100 });
    const [alpha, setAlpha] = useState(1);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const wheelRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLDivElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const resolvedColor = useMemo(() => resolveColorToRgba(value), [value]);
    const displayColor = resolvedColor ? rgbaToCss(resolvedColor) : 'rgba(255, 255, 255, 1)';
    const eyeDropperCtor = typeof window !== 'undefined'
        ? (window as unknown as { EyeDropper?: EyeDropperApi }).EyeDropper
        : undefined;
    const supportsEyeDropper = Boolean(eyeDropperCtor);

    useEffect(() => {
        const rgba = resolveColorToRgba(value);
        if (!rgba) return;
        setHsv(rgbToHsv({ r: rgba.r, g: rgba.g, b: rgba.b }));
        setAlpha(rgba.a);
    }, [value]);

    useEffect(() => {
        if (!open) return;
        const place = () => {
            if (!triggerRef.current || !popoverRef.current) return;
            const rect = triggerRef.current.getBoundingClientRect();
            const pickerW = popoverRef.current.offsetWidth || 220;
            const pickerH = popoverRef.current.offsetHeight || 200;
            const padding = 12;
            const left = clamp(rect.left, padding, window.innerWidth - pickerW - padding);
            const top = clamp(rect.bottom + 8, padding, window.innerHeight - pickerH - padding);
            setPosition({ top, left });
        };
        place();

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        const onClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
            setOpen(false);
        };

        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        window.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onClickOutside);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onClickOutside);
        };
    }, [open]);

    const updateFromPoint = (clientX: number, clientY: number) => {
        if (!wheelRef.current) return;
        const rect = wheelRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const radius = rect.width / 2;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const sat = clamp((distance / radius) * 100, 0, 100);
        let hue = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (hue < 0) hue += 360;
        const next = { ...hsv, h: hue, s: sat };
        setHsv(next);
        onChange(rgbaToCss({ ...hsvToRgb(next), a: alpha }));
    };

    const startWheelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        updateFromPoint(event.clientX, event.clientY);
        const onMove = (moveEvent: PointerEvent) => updateFromPoint(moveEvent.clientX, moveEvent.clientY);
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const knobAngle = (hsv.h * Math.PI) / 180;
    const knobRadius = (hsv.s / 100) * 50;
    const knobX = 50 + Math.cos(knobAngle) * knobRadius;
    const knobY = 50 + Math.sin(knobAngle) * knobRadius;

    return (
        <div className="relative">
            <div ref={triggerRef} className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="h-8 w-8 rounded-md border border-white/20 shadow-inner"
                    style={{ backgroundColor: displayColor }}
                    title="Open color picker"
                />
                <button
                    type="button"
                    disabled={!supportsEyeDropper}
                    onClick={async () => {
                        if (!eyeDropperCtor) return;
                        try {
                            const eyeDropper = new eyeDropperCtor();
                            const result = await eyeDropper.open();
                            if (result?.sRGBHex) onChange(result.sRGBHex);
                        } catch {
                            // User canceled or browser blocked the picker.
                        }
                    }}
                    className="h-8 w-8 rounded-md border border-white/20 bg-white/5 text-gray-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    title={supportsEyeDropper ? 'Pick color from page' : 'EyeDropper not supported in this browser'}
                >
                    <Pipette size={14} className="mx-auto" />
                </button>
                <input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={inputBase}
                    placeholder="#RRGGBB or rgb(...)"
                />
            </div>
            {open && (
                <div
                    ref={popoverRef}
                    className="fixed z-[999] w-[220px] rounded-xl border border-white/10 bg-[#0f111a] p-3 shadow-2xl"
                    style={{ top: position.top, left: position.left }}
                >
                    <div
                        ref={wheelRef}
                        onPointerDown={startWheelDrag}
                        className="relative mx-auto h-[120px] w-[120px] rounded-full cursor-crosshair"
                        style={{
                            backgroundImage:
                                'conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red), radial-gradient(circle at center, white 0%, rgba(255,255,255,0) 62%)',
                        }}
                    >
                        <div
                            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-black/70"
                            style={{ left: `${knobX}%`, top: `${knobY}%` }}
                        />
                    </div>
                    <div className="mt-3 space-y-2">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Opacity</div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(alpha * 100)}
                            onChange={(e) => {
                                const nextAlpha = clamp(Number(e.target.value) / 100, 0, 1);
                                setAlpha(nextAlpha);
                                onChange(rgbaToCss({ ...hsvToRgb(hsv), a: nextAlpha }));
                            }}
                            className="w-full accent-indigo-400"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export function EditPanel() {
    const { spec, updateScreen } = useDesignStore();
    const { setFocusNodeId } = useCanvasStore();
    const { isEditMode, screenId, selected, setSelected, setActiveScreen, applyPatchAndRebuild, undoAndRebuild, redoAndRebuild, exitEdit } = useEditStore();

    const [textValue, setTextValue] = useState('');
    const [bgColor, setBgColor] = useState('');
    const [textColor, setTextColor] = useState('');
    const [width, setWidth] = useState('');
    const [height, setHeight] = useState('');
    const [radius, setRadius] = useState('');
    const [fontSize, setFontSize] = useState('');
    const [lineHeight, setLineHeight] = useState('');
    const [letterSpacing, setLetterSpacing] = useState('');
    const [textAlign, setTextAlign] = useState('');
    const [borderColor, setBorderColor] = useState('');
    const [borderWidth, setBorderWidth] = useState('');
    const [opacity, setOpacity] = useState('');
    const [boxShadow, setBoxShadow] = useState('');
    const [padding, setPadding] = useState<PaddingValues>({ top: '', right: '', bottom: '', left: '' });
    const [margin, setMargin] = useState<PaddingValues>({ top: '', right: '', bottom: '', left: '' });
    const [imageSrc, setImageSrc] = useState('');
    const [linkHref, setLinkHref] = useState('');
    const [display, setDisplay] = useState<'block' | 'flex' | 'grid'>('block');
    const [flexDir, setFlexDir] = useState('flex-row');
    const [justify, setJustify] = useState('justify-start');
    const [align, setAlign] = useState('items-start');
    const [gap, setGap] = useState('gap-2');
    const [elementAlign, setElementAlign] = useState<'left' | 'center' | 'right'>('left');
    const [zIndex, setZIndex] = useState('');
    const [textFlexAlign, setTextFlexAlign] = useState<'start' | 'center' | 'end' | 'stretch'>('start');
    const [iconQuery, setIconQuery] = useState('');
    const [showIconResults, setShowIconResults] = useState(false);
    const [allIconOptions, setAllIconOptions] = useState<string[]>(MATERIAL_ICON_FALLBACK_OPTIONS);
    const [iconActiveIndex, setIconActiveIndex] = useState(0);
    const [screenImages, setScreenImages] = useState<ScreenImageItem[]>([]);
    const [imageInputs, setImageInputs] = useState<Record<string, string>>({});
    const [uploadTargetUid, setUploadTargetUid] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'edit' | 'images'>('edit');
    const imageFileInputRef = useRef<HTMLInputElement | null>(null);
    const globalImageFileInputRef = useRef<HTMLInputElement | null>(null);
    const iconListRef = useRef<HTMLDivElement | null>(null);

    const activeScreen = useMemo(() => {
        if (!spec || !screenId) return null;
        return spec.screens.find((s) => s.screenId === screenId) || null;
    }, [spec, screenId]);

    const elementType = (selected?.elementType || 'container') as ElementType;
    const showTextContent = elementType === 'text' || elementType === 'button' || elementType === 'badge';
    const showTypography = elementType === 'text' || elementType === 'button' || elementType === 'badge' || elementType === 'input' || elementType === 'icon';
    const showImage = elementType === 'image';
    const showLink = selected?.tagName === 'A';
    const showLayout = elementType === 'container' || elementType === 'button' || elementType === 'badge';
    const showColor = elementType !== 'image';
    const showTextFlexAlign = elementType === 'text' || elementType === 'badge' || elementType === 'button';
    const showIconPicker = elementType === 'icon';
    const filteredIcons = useMemo(() => {
        const query = iconQuery.trim().toLowerCase();
        if (!query) return allIconOptions;
        return allIconOptions.filter((name) => name.includes(query));
    }, [iconQuery, allIconOptions]);

    useEffect(() => {
        setIconActiveIndex(0);
    }, [iconQuery, showIconResults]);

    useEffect(() => {
        if (!showIconResults || !iconListRef.current) return;
        const activeEl = iconListRef.current.querySelector<HTMLButtonElement>(`button[data-icon-index="${iconActiveIndex}"]`);
        activeEl?.scrollIntoView({ block: 'nearest' });
    }, [iconActiveIndex, showIconResults]);

    useEffect(() => {
        let alive = true;
        const tryLoadAllIcons = async () => {
            const endpoints = [
                'https://fonts.google.com/metadata/icons?key=material_symbols&incomplete=true',
                'https://fonts.google.com/metadata/icons?key=material_symbols_rounded&incomplete=true',
                'https://fonts.google.com/metadata/icons?incomplete=true',
            ];

            for (const url of endpoints) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    const raw = await res.text();
                    const normalized = raw.replace(/^\)\]\}'\s*/, '').trim();
                    const parsed = JSON.parse(normalized) as { icons?: Array<{ name?: string }> };
                    const names = (parsed.icons || [])
                        .map((entry) => (entry?.name || '').trim())
                        .filter(Boolean);
                    if (names.length > 0) {
                        const unique = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
                        if (alive) setAllIconOptions(unique);
                        return;
                    }
                } catch {
                    // try next endpoint
                }
            }
        };

        void tryLoadAllIcons();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!activeScreen?.html) {
            setScreenImages([]);
            setImageInputs({});
            return;
        }
        const doc = new DOMParser().parseFromString(activeScreen.html, 'text/html');
        const items = Array.from(doc.querySelectorAll('img'))
            .map((img) => ({
                uid: img.getAttribute('data-uid') || '',
                src: img.getAttribute('src') || '',
                alt: img.getAttribute('alt') || '',
            }))
            .filter((item) => !!item.uid);
        setScreenImages(items);
        const inputs: Record<string, string> = {};
        for (const item of items) inputs[item.uid] = item.src;
        setImageInputs(inputs);
    }, [activeScreen?.html]);

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (!event.data || event.data.type !== 'editor/select') return;
            if (!isEditMode) return;
            const incomingScreenId = event.data.screenId as string | undefined;
            if (!incomingScreenId) return;
            clearSelectionOnOtherScreens(incomingScreenId);
            if (incomingScreenId !== screenId) {
                const nextScreen = spec?.screens.find((s) => s.screenId === incomingScreenId);
                if (nextScreen) {
                    setActiveScreen(incomingScreenId, nextScreen.html);
                }
            }
            setFocusNodeId(incomingScreenId);
            setSelected(event.data.payload);
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [isEditMode, screenId, setSelected, setActiveScreen, setFocusNodeId, spec]);

    useEffect(() => {
        if (!selected) return;
        setTextValue(selected.textContent || '');
        setBgColor(selected.computedStyle.backgroundColor || '');
        setTextColor(selected.computedStyle.color || '');
        setWidth(toPxValue(selected.computedStyle.width));
        setHeight(toPxValue(selected.computedStyle.height));
        setRadius(toPxValue(selected.computedStyle.borderRadius));
        setFontSize(toPxValue(selected.computedStyle.fontSize));
        setLineHeight(toPxValue(selected.computedStyle.lineHeight));
        setLetterSpacing(toPxValue(selected.computedStyle.letterSpacing));
        setTextAlign(selected.computedStyle.textAlign || '');
        setBorderColor(selected.computedStyle.borderColor || '');
        setBorderWidth(toPxValue(selected.computedStyle.borderWidth));
        setOpacity(selected.computedStyle.opacity || '');
        setBoxShadow(selected.computedStyle.boxShadow || '');
        setPadding(parsePadding(selected.computedStyle.padding));
        setMargin(parsePadding(selected.computedStyle.margin));
        setImageSrc(selected.attributes?.src || '');
        setLinkHref(selected.attributes?.href || '');
        setIconQuery((selected.textContent || '').trim());
        setShowIconResults(false);
        setDisplay(selected.computedStyle.display === 'flex' ? 'flex' : selected.computedStyle.display === 'grid' ? 'grid' : 'block');
        setZIndex(toPxValue(selected.inlineStyle?.['z-index'] || ''));
        const ml = selected.computedStyle.marginLeft || '';
        const mr = selected.computedStyle.marginRight || '';
        if (ml === 'auto' && mr === 'auto') setElementAlign('center');
        else if (ml === 'auto') setElementAlign('right');
        else setElementAlign('left');

        const classList = selected.classList || [];
        setFlexDir(FLEX_DIR_CLASSES.find((c) => classList.includes(c)) || 'flex-row');
        setJustify(JUSTIFY_CLASSES.find((c) => classList.includes(c)) || 'justify-start');
        setAlign(ALIGN_CLASSES.find((c) => classList.includes(c)) || 'items-start');
        setGap(GAP_CLASSES.find((c) => classList.includes(c)) || 'gap-2');
        const alignSelf = (selected.inlineStyle?.['align-self'] || '').toLowerCase();
        if (alignSelf === 'center') setTextFlexAlign('center');
        else if (alignSelf === 'flex-end' || alignSelf === 'end') setTextFlexAlign('end');
        else if (alignSelf === 'stretch') setTextFlexAlign('stretch');
        else setTextFlexAlign('start');
    }, [selected]);

    const applyPatch = (patch: HtmlPatch) => {
        if (!screenId || !activeScreen) return;
        dispatchPatchToIframe(screenId, patch);
        const rebuilt = applyPatchAndRebuild(patch);
        if (rebuilt) updateScreen(screenId, rebuilt);
    };

    const applyImageSourceForUid = (uid: string, nextSrc: string) => {
        if (!uid) return;
        applyPatch({ op: 'set_attr', uid, attr: { src: nextSrc } });
        setImageInputs((prev) => ({ ...prev, [uid]: nextSrc }));
    };

    const onUndo = () => {
        if (!screenId) return;
        const rebuilt = undoAndRebuild();
        if (rebuilt) updateScreen(screenId, rebuilt);
    };

    const onRedo = () => {
        if (!screenId) return;
        const rebuilt = redoAndRebuild();
        if (rebuilt) updateScreen(screenId, rebuilt);
    };

    const patchStyle = (style: Record<string, string>) => {
        if (!selected) return;
        applyPatch({ op: 'set_style', uid: selected.uid, style });
    };

    const applyElementAlign = (next: 'left' | 'center' | 'right') => {
        setElementAlign(next);
        if (next === 'left') {
            patchStyle({ 'margin-left': '0px', 'margin-right': 'auto' });
        }
        if (next === 'center') {
            patchStyle({ 'margin-left': 'auto', 'margin-right': 'auto' });
        }
        if (next === 'right') {
            patchStyle({ 'margin-left': 'auto', 'margin-right': '0px' });
        }
    };

    const applyIconName = (iconName: string) => {
        if (!selected) return;
        const cleaned = iconName.trim();
        if (!cleaned) return;
        setIconQuery(cleaned);
        setTextValue(cleaned);
        setShowIconResults(false);
        applyPatch({ op: 'set_text', uid: selected.uid, text: cleaned });
    };

    if (!isEditMode) return <aside className="edit-panel" aria-hidden="true" />;

    return (
        <aside className="edit-panel open">
            <div className="h-full flex bg-[#0f1116] border-l border-white/10 shadow-2xl">
                <div className="flex-1 min-w-0 flex flex-col border-r border-white/10">
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Edit Mode</div>
                        <div className="text-sm text-white font-semibold">{activeScreen?.name || 'Selected Screen'}</div>
                    </div>
                    <button onClick={exitEdit} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 flex items-center justify-center" title="Exit Edit Mode">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                    <button onClick={onUndo} className="px-3 py-2 rounded-lg bg-white/5 text-gray-300 text-xs font-semibold uppercase tracking-wide hover:bg-white/10 flex items-center gap-2">
                        <Undo2 size={14} />
                        Undo
                    </button>
                    <button onClick={onRedo} className="px-3 py-2 rounded-lg bg-white/5 text-gray-300 text-xs font-semibold uppercase tracking-wide hover:bg-white/10 flex items-center gap-2">
                        <Redo2 size={14} />
                        Redo
                    </button>
                </div>

                <div className="hide-scrollbar-panel flex-1 overflow-y-auto px-5 py-5 space-y-6 text-gray-200">
                    {!selected && activeTab === 'edit' && <div className="text-sm text-gray-500 leading-relaxed">Hover a layer in the canvas and click to select it.</div>}

                    {!!selected && activeTab === 'edit' && (
                        <>
                            <section className="space-y-2">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Selection</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-white">{selected.tagName.toLowerCase()} · {selected.uid}</div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => dispatchSelectScreenContainer(screenId!)} className="text-xs px-2 py-1 rounded-md bg-white/5 text-gray-400 hover:bg-white/10">
                                            Screen
                                        </button>
                                        <button onClick={() => dispatchSelectParent(screenId!, selected.uid)} className="text-xs px-2 py-1 rounded-md bg-white/5 text-gray-400 hover:bg-white/10 flex items-center gap-1">
                                            <ArrowUpLeft size={12} />
                                            Parent
                                        </button>
                                    </div>
                                </div>
                                {selected.breadcrumb && selected.breadcrumb.length > 0 && (
                                    <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                                        {selected.breadcrumb.map((crumb) => (
                                            <button key={crumb.uid} onClick={() => dispatchSelectUid(screenId!, crumb.uid)} className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10">
                                                {crumb.tagName.toLowerCase()}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>

                            {showTextContent && (
                                <section className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Content</div>
                                    <textarea
                                        value={textValue}
                                        onChange={(e) => {
                                            const next = e.target.value;
                                            setTextValue(next);
                                            applyPatch({ op: 'set_text', uid: selected.uid, text: next });
                                        }}
                                        className={`${inputBase} min-h-[88px]`}
                                        placeholder="Edit text content"
                                    />
                                </section>
                            )}

                            {(showImage || showLink) && (
                                <section className="grid grid-cols-1 gap-3">
                                    {showImage && (
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Image Src</div>
                                            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#16181d] p-2">
                                                <div className="h-12 w-12 overflow-hidden rounded-lg border border-white/10 bg-black/30">
                                                    {imageSrc ? (
                                                        <img src={imageSrc} alt="Selected element preview" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wide text-gray-500">No Img</div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-[11px] text-gray-300">{selected.uid}</div>
                                                    <div className="truncate text-[10px] text-gray-500">{selected.attributes?.alt || 'Selected image element'}</div>
                                                </div>
                                            </div>
                                            <input
                                                value={imageSrc}
                                                onChange={(e) => {
                                                    const next = e.target.value;
                                                    setImageSrc(next);
                                                    applyPatch({ op: 'set_attr', uid: selected.uid, attr: { src: next } });
                                                }}
                                                className={inputBase}
                                            />
                                            <input
                                                ref={imageFileInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(event) => {
                                                    const file = event.target.files?.[0];
                                                    if (!file) return;
                                                    const reader = new FileReader();
                                                    reader.onload = () => {
                                                        const result = typeof reader.result === 'string' ? reader.result : '';
                                                        if (!result || !selected) return;
                                                        setImageSrc(result);
                                                        applyPatch({ op: 'set_attr', uid: selected.uid, attr: { src: result } });
                                                    };
                                                    reader.readAsDataURL(file);
                                                    event.currentTarget.value = '';
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => imageFileInputRef.current?.click()}
                                                className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10"
                                            >
                                                Upload Image
                                            </button>
                                        </div>
                                    )}
                                    {showLink && (
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Link Href</div>
                                            <input
                                                value={linkHref}
                                                onChange={(e) => {
                                                    const next = e.target.value;
                                                    setLinkHref(next);
                                                    applyPatch({ op: 'set_attr', uid: selected.uid, attr: { href: next } });
                                                }}
                                                className={inputBase}
                                            />
                                        </div>
                                    )}
                                </section>
                            )}

                            {showIconPicker && (
                                <section className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Icon</div>
                                    <input
                                        value={iconQuery}
                                        onChange={(e) => {
                                            setIconQuery(e.target.value);
                                            setShowIconResults(true);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                setShowIconResults(true);
                                                setIconActiveIndex((prev) => Math.min(prev + 1, Math.max(0, filteredIcons.length - 1)));
                                                return;
                                            }
                                            if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setShowIconResults(true);
                                                setIconActiveIndex((prev) => Math.max(prev - 1, 0));
                                                return;
                                            }
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (showIconResults && filteredIcons[iconActiveIndex]) {
                                                    applyIconName(filteredIcons[iconActiveIndex]);
                                                } else {
                                                    applyIconName(iconQuery);
                                                }
                                            }
                                            if (e.key === 'Escape') {
                                                setShowIconResults(false);
                                            }
                                        }}
                                        onFocus={() => setShowIconResults(true)}
                                        className={inputBase}
                                        placeholder="Search icon name..."
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => applyIconName(iconQuery)}
                                            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                                        >
                                            Apply Typed Icon
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowIconResults((v) => !v)}
                                            className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10"
                                        >
                                            {showIconResults ? 'Hide List' : 'Show List'}
                                        </button>
                                    </div>
                                    {showIconResults && (
                                        <div ref={iconListRef} className="hide-scrollbar-panel max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-[#121219] p-1">
                                            {filteredIcons.length === 0 && (
                                                <div className="px-2 py-2 text-xs text-gray-500">No matching icons</div>
                                            )}
                                            {filteredIcons.map((iconName, index) => (
                                                <button
                                                    key={iconName}
                                                    type="button"
                                                    data-icon-index={index}
                                                    onMouseEnter={() => setIconActiveIndex(index)}
                                                    onClick={() => applyIconName(iconName)}
                                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-gray-200 hover:bg-white/10 ${iconActiveIndex === index ? 'bg-indigo-500/25' : ''}`}
                                                >
                                                    <span className="material-symbols-rounded text-base leading-none">{iconName}</span>
                                                    <span className="truncate">{iconName}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            )}

                            <section className="grid grid-cols-2 gap-3">
                                {showColor && (
                                    <>
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Fill</div>
                                            <ColorWheelInput
                                                value={bgColor}
                                                onChange={(next) => {
                                                    setBgColor(next);
                                                    patchStyle({ 'background-color': next });
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Text Color</div>
                                            <ColorWheelInput
                                                value={textColor}
                                                onChange={(next) => {
                                                    setTextColor(next);
                                                    patchStyle({ color: next });
                                                }}
                                            />
                                        </div>
                                    </>
                                )}
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Border Color</div>
                                    <ColorWheelInput
                                        value={borderColor}
                                        onChange={(next) => {
                                            setBorderColor(next);
                                            patchStyle({ 'border-color': next });
                                        }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Border Width</div>
                                    <ScrubNumberInput
                                        value={borderWidth}
                                        onChangeValue={(next) => {
                                            setBorderWidth(next);
                                            patchStyle({ 'border-width': next ? `${next}px` : '' });
                                        }}
                                        min={0}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Opacity</div>
                                    <ScrubNumberInput
                                        value={opacity}
                                        onChangeValue={(next) => {
                                            setOpacity(next);
                                            patchStyle({ opacity: next });
                                        }}
                                        step={0.05}
                                        min={0}
                                        max={1}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Shadow</div>
                                    <select value={boxShadow} onChange={(e) => { setBoxShadow(e.target.value); patchStyle({ 'box-shadow': e.target.value }); }} className={selectBase}>
                                        <option className="bg-[#121219]" value="">None</option>
                                        <option className="bg-[#121219]" value="0 12px 34px rgba(0,0,0,.28)">Soft</option>
                                        <option className="bg-[#121219]" value="0 20px 60px rgba(0,0,0,.22)">Glow</option>
                                        <option className="bg-[#121219]" value="0 10px 40px -10px rgba(0,0,0,.35)">Deep</option>
                                    </select>
                                </div>
                            </section>

                            <section className="space-y-2">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Element Align</div>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => applyElementAlign('left')}
                                        className={`rounded-lg px-2 py-2 text-xs ${elementAlign === 'left' ? 'bg-indigo-500/30 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                    >
                                        Left
                                    </button>
                                    <button
                                        onClick={() => applyElementAlign('center')}
                                        className={`rounded-lg px-2 py-2 text-xs ${elementAlign === 'center' ? 'bg-indigo-500/30 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                    >
                                        Center
                                    </button>
                                    <button
                                        onClick={() => applyElementAlign('right')}
                                        className={`rounded-lg px-2 py-2 text-xs ${elementAlign === 'right' ? 'bg-indigo-500/30 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                    >
                                        Right
                                    </button>
                                </div>
                            </section>

                            <section className="space-y-2">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Z Index</div>
                                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                                    <ScrubNumberInput
                                        value={zIndex}
                                        onChangeValue={(next) => {
                                            setZIndex(next);
                                            patchStyle({ 'z-index': next || '0', position: selected.inlineStyle?.position || 'relative' });
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            const current = parseInt(zIndex || '0', 10) || 0;
                                            const next = String(current - 1);
                                            setZIndex(next);
                                            patchStyle({ 'z-index': next, position: selected.inlineStyle?.position || 'relative' });
                                        }}
                                        className="rounded-lg bg-white/5 px-3 text-xs text-gray-300 hover:bg-white/10"
                                    >
                                        -
                                    </button>
                                    <button
                                        onClick={() => {
                                            const current = parseInt(zIndex || '0', 10) || 0;
                                            const next = String(current + 1);
                                            setZIndex(next);
                                            patchStyle({ 'z-index': next, position: selected.inlineStyle?.position || 'relative' });
                                        }}
                                        className="rounded-lg bg-white/5 px-3 text-xs text-gray-300 hover:bg-white/10"
                                    >
                                        +
                                    </button>
                                </div>
                            </section>

                            <section className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Width</div>
                                    <ScrubNumberInput value={width} onChangeValue={(next) => { setWidth(next); patchStyle({ width: next ? `${next}px` : '' }); }} min={0} />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Height</div>
                                    <ScrubNumberInput value={height} onChangeValue={(next) => { setHeight(next); patchStyle({ height: next ? `${next}px` : '' }); }} min={0} />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Radius</div>
                                    <ScrubNumberInput value={radius} onChangeValue={(next) => { setRadius(next); patchStyle({ 'border-radius': next ? `${next}px` : '' }); }} min={0} />
                                </div>
                            </section>

                            {showTypography && (
                                <section className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Font Size</div>
                                        <ScrubNumberInput value={fontSize} onChangeValue={(next) => { setFontSize(next); patchStyle({ 'font-size': next ? `${next}px` : '' }); }} min={0} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Line Height</div>
                                        <ScrubNumberInput value={lineHeight} onChangeValue={(next) => { setLineHeight(next); patchStyle({ 'line-height': next ? `${next}px` : '' }); }} min={0} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Letter Spacing</div>
                                        <ScrubNumberInput value={letterSpacing} onChangeValue={(next) => { setLetterSpacing(next); patchStyle({ 'letter-spacing': next ? `${next}px` : '' }); }} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Text Align</div>
                                        <select value={textAlign} onChange={(e) => { setTextAlign(e.target.value); patchStyle({ 'text-align': e.target.value }); }} className={selectBase}>
                                            <option className="bg-[#121219]" value="">default</option>
                                            <option className="bg-[#121219]" value="left">left</option>
                                            <option className="bg-[#121219]" value="center">center</option>
                                            <option className="bg-[#121219]" value="right">right</option>
                                            <option className="bg-[#121219]" value="justify">justify</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2 grid grid-cols-2 gap-2">
                                        <button onClick={() => applyPatch({ op: 'set_classes', uid: selected.uid, add: ['font-display'], remove: ['font-sans'] })} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10">
                                            Display Font
                                        </button>
                                        <button onClick={() => applyPatch({ op: 'set_classes', uid: selected.uid, add: ['font-sans'], remove: ['font-display'] })} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-300 hover:bg-white/10">
                                            Sans Font
                                        </button>
                                    </div>
                                    {showTextFlexAlign && (
                                        <div className="col-span-2 space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Flex Align</div>
                                            <div className="grid grid-cols-4 gap-2">
                                                <button
                                                    onClick={() => {
                                                        setTextFlexAlign('start');
                                                        patchStyle({ 'align-self': 'flex-start' });
                                                    }}
                                                    className={`rounded-lg px-2 py-2 text-xs ${textFlexAlign === 'start' ? 'bg-indigo-500/30 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                                >
                                                    Start
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setTextFlexAlign('center');
                                                        patchStyle({ 'align-self': 'center' });
                                                    }}
                                                    className={`rounded-lg px-2 py-2 text-xs ${textFlexAlign === 'center' ? 'bg-indigo-500/30 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                                >
                                                    Center
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setTextFlexAlign('end');
                                                        patchStyle({ 'align-self': 'flex-end' });
                                                    }}
                                                    className={`rounded-lg px-2 py-2 text-xs ${textFlexAlign === 'end' ? 'bg-indigo-500/30 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                                >
                                                    End
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setTextFlexAlign('stretch');
                                                        patchStyle({ 'align-self': 'stretch' });
                                                    }}
                                                    className={`rounded-lg px-2 py-2 text-xs ${textFlexAlign === 'stretch' ? 'bg-indigo-500/30 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                                >
                                                    Stretch
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            )}

                            <section className="space-y-3">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Padding</div>
                                <div className="grid grid-cols-2 gap-3">
                                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                                        <div key={side} className="space-y-1">
                                            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">{side}</div>
                                            <ScrubNumberInput
                                                value={toPxValue(padding[side])}
                                                onChangeValue={(next) => {
                                                    setPadding((prev) => ({ ...prev, [side]: next }));
                                                    patchStyle({ [`padding-${side}`]: next ? `${next}px` : '' });
                                                }}
                                                placeholder={side}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="space-y-3">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Margin</div>
                                <div className="grid grid-cols-2 gap-3">
                                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                                        <div key={side} className="space-y-1">
                                            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">{side}</div>
                                            <ScrubNumberInput
                                                value={toPxValue(margin[side])}
                                                onChangeValue={(next) => {
                                                    setMargin((prev) => ({ ...prev, [side]: next }));
                                                    patchStyle({ [`margin-${side}`]: next ? `${next}px` : '' });
                                                }}
                                                placeholder={side}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {showLayout && (
                                <section className="space-y-3">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Layout</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['block', 'flex', 'grid'] as const).map((type) => (
                                            <button
                                                key={type}
                                                onClick={() => {
                                                    setDisplay(type);
                                                    const add = type === 'block' ? [] : [type];
                                                    applyPatch({ op: 'set_classes', uid: selected.uid, add, remove: DISPLAY_CLASSES.filter((c) => c !== type) });
                                                }}
                                                className={`rounded-lg px-2 py-2 text-xs ${display === type ? 'bg-indigo-500/30 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                    {display === 'flex' && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Direction</div>
                                                <select value={flexDir} onChange={(e) => { setFlexDir(e.target.value); applyPatch({ op: 'set_classes', uid: selected.uid, add: [e.target.value], remove: FLEX_DIR_CLASSES.filter((c) => c !== e.target.value) }); }} className={selectBase}>
                                                    {FLEX_DIR_CLASSES.map((dir) => <option className="bg-[#121219]" key={dir} value={dir}>{dir}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Gap</div>
                                                <select value={gap} onChange={(e) => { setGap(e.target.value); applyPatch({ op: 'set_classes', uid: selected.uid, add: [e.target.value], remove: GAP_CLASSES.filter((c) => c !== e.target.value) }); }} className={selectBase}>
                                                    {GAP_CLASSES.map((entry) => <option className="bg-[#121219]" key={entry} value={entry}>{entry}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Justify</div>
                                                <select value={justify} onChange={(e) => { setJustify(e.target.value); applyPatch({ op: 'set_classes', uid: selected.uid, add: [e.target.value], remove: JUSTIFY_CLASSES.filter((c) => c !== e.target.value) }); }} className={selectBase}>
                                                    {JUSTIFY_CLASSES.map((entry) => <option className="bg-[#121219]" key={entry} value={entry}>{entry}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Align</div>
                                                <select value={align} onChange={(e) => { setAlign(e.target.value); applyPatch({ op: 'set_classes', uid: selected.uid, add: [e.target.value], remove: ALIGN_CLASSES.filter((c) => c !== e.target.value) }); }} className={selectBase}>
                                                    {ALIGN_CLASSES.map((entry) => <option className="bg-[#121219]" key={entry} value={entry}>{entry}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            )}
                        </>
                    )}

                    {activeTab === 'images' && (
                        <section className="space-y-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Images On Screen</div>
                            <input
                                ref={globalImageFileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file || !uploadTargetUid) return;
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                        const result = typeof reader.result === 'string' ? reader.result : '';
                                        if (!result) return;
                                        applyImageSourceForUid(uploadTargetUid, result);
                                    };
                                    reader.readAsDataURL(file);
                                    event.currentTarget.value = '';
                                    setUploadTargetUid(null);
                                }}
                            />
                            {screenImages.length === 0 ? (
                                <div className="rounded-xl border border-white/10 bg-[#16181d] px-3 py-3 text-xs text-gray-400">
                                    No images found on this screen.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {screenImages.map((image) => (
                                        <div key={image.uid} className="grid grid-cols-[64px_1fr_auto] items-center gap-2 rounded-xl border border-white/10 bg-[#16181d] p-2">
                                            <button
                                                type="button"
                                                onClick={() => dispatchSelectUid(screenId!, image.uid)}
                                                className="h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-black/20"
                                                title="Select image element"
                                            >
                                                <img src={image.src} alt={image.alt || 'image'} className="h-full w-full object-cover" />
                                            </button>
                                            <input
                                                value={imageInputs[image.uid] || ''}
                                                onChange={(e) => {
                                                    const next = e.target.value;
                                                    setImageInputs((prev) => ({ ...prev, [image.uid]: next }));
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') applyImageSourceForUid(image.uid, imageInputs[image.uid] || '');
                                                }}
                                                onBlur={() => applyImageSourceForUid(image.uid, imageInputs[image.uid] || '')}
                                                className={inputBase}
                                                placeholder="Image URL"
                                            />
                                            <div className="flex flex-col gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => dispatchSelectUid(screenId!, image.uid)}
                                                    className="rounded-md bg-white/5 px-2 py-2 text-[10px] uppercase tracking-wide text-gray-300 hover:bg-white/10"
                                                >
                                                    Select
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setUploadTargetUid(image.uid);
                                                        globalImageFileInputRef.current?.click();
                                                    }}
                                                    className="rounded-md bg-white/5 px-2 py-2 text-[10px] uppercase tracking-wide text-gray-300 hover:bg-white/10"
                                                >
                                                    Upload
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </div>
                </div>
                <aside className="w-[70px] flex flex-col items-center justify-start gap-3 py-4 bg-[#13161b]">
                    <button
                        type="button"
                        onClick={() => setActiveTab('edit')}
                        className={`h-11 w-11 rounded-xl border flex items-center justify-center transition-colors ${activeTab === 'edit' ? 'border-indigo-300/70 bg-indigo-500/25 text-white' : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}
                        aria-label="Edit tab"
                        title="Edit"
                    >
                        <SlidersHorizontal size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('images')}
                        className={`h-11 w-11 rounded-xl border flex items-center justify-center transition-colors ${activeTab === 'images' ? 'border-indigo-300/70 bg-indigo-500/25 text-white' : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}
                        aria-label="Images tab"
                        title="Images"
                    >
                        <Images size={18} />
                    </button>
                </aside>
            </div>
        </aside>
    );
}



