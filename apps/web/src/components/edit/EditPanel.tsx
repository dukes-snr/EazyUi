import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useCanvasStore, useDesignStore, useUiStore } from '../../stores';
import { useEditStore } from '../../stores/edit-store';
import { apiClient } from '../../api/client';
import { ensureEditableUids, type HtmlPatch } from '../../utils/htmlPatcher';
import { ArrowUpLeft, ImagePlus, Maximize2, Minimize2, Pipette, Redo2, Undo2, X } from 'lucide-react';
import { clearSelectionOnOtherScreens, dispatchPatchToIframe, dispatchSelectParent, dispatchSelectScreenContainer, dispatchSelectUid } from '../../utils/editMessaging';
import { getPreferredTextModel } from '../../constants/designModels';

type PaddingValues = { top: string; right: string; bottom: string; left: string };
type ElementType = 'text' | 'button' | 'image' | 'container' | 'input' | 'icon' | 'badge';
type RGB = { r: number; g: number; b: number };
type RGBA = { r: number; g: number; b: number; a: number };
type HSV = { h: number; s: number; v: number };
type EyeDropperApi = new () => { open: () => Promise<{ sRGBHex: string }> };
type ScreenImageItem = { uid: string; src: string; alt: string };

function defaultImagePromptFromAlt(alt?: string, appName?: string, screenName?: string): string {
    const cleaned = (alt || '').trim();
    const shortOrVague =
        cleaned.length < 14 ||
        cleaned.split(/\s+/).length < 3 ||
        /^(image|photo|pic|logo|icon|cook|salad|recipe view)$/i.test(cleaned);
    if (!shortOrVague) return cleaned;

    const app = (appName || 'app').trim();
    const screen = (screenName || 'screen').trim();
    const subject = cleaned || 'hero visual';
    return `${app} ${screen} ${subject} image, modern UI style, clean composition`;
}

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

const inputBase = 'w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs text-[var(--ui-text)] outline-none transition-colors focus:border-[var(--ui-primary)]';
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

function spacingSummary(value: PaddingValues): string {
    const t = toPxValue(value.top) || '0';
    const r = toPxValue(value.right) || '0';
    const b = toPxValue(value.bottom) || '0';
    const l = toPxValue(value.left) || '0';
    if (t === r && r === b && b === l) return t;
    return `${t} ${r} ${b} ${l}`;
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
                    className="h-8 w-8 rounded-md border border-[var(--ui-border-light)] shadow-inner outline outline-1 outline-[var(--ui-border)]"
                    style={{
                        backgroundColor: displayColor,
                        backgroundImage:
                            'linear-gradient(45deg, rgba(255,255,255,0.14) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.14) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.14) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.14) 75%)',
                        backgroundSize: '8px 8px',
                        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                    }}
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
                    className="h-8 w-8 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] disabled:cursor-not-allowed disabled:opacity-40"
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
                    className="fixed z-[999] w-[220px] rounded-xl border border-[var(--ui-border)] bg-[var(--ui-popover)] p-3 shadow-2xl"
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
                        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Opacity</div>
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
    const { modelProfile } = useUiStore();
    const { setFocusNodeId } = useCanvasStore();
    const {
        isEditMode,
        screenId,
        selected,
        setSelected,
        setActiveScreen,
        applyPatchAndRebuild,
        undoAndRebuild,
        redoAndRebuild,
        rebuildHtml,
        exitEdit,
        aiEditHistoryByScreen,
        addAiEditHistory,
    } = useEditStore();

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
    const [widthMode, setWidthMode] = useState<'fixed' | 'auto' | 'hug'>('fixed');
    const [heightMode, setHeightMode] = useState<'fixed' | 'auto' | 'hug'>('fixed');
    const [rotate, setRotate] = useState('0');
    const [positionType, setPositionType] = useState('static');
    const [posX, setPosX] = useState('');
    const [posY, setPosY] = useState('');
    const [expandPadding, setExpandPadding] = useState(false);
    const [expandMargin, setExpandMargin] = useState(false);
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
    const [activeTab, setActiveTab] = useState<'blocks' | 'style' | 'symbols'>('style');
    const [aiPrompt, setAiPrompt] = useState('');
    const [isApplyingAi, setIsApplyingAi] = useState(false);
    const [aiDescription, setAiDescription] = useState('');
    const [aiError, setAiError] = useState('');
    const [aiImageGenEnabled, setAiImageGenEnabled] = useState(false);
    const [imageGenPromptByUid, setImageGenPromptByUid] = useState<Record<string, string>>({});
    const [imageGenLoadingUid, setImageGenLoadingUid] = useState<string | null>(null);
    const [imagesTabError, setImagesTabError] = useState('');
    const aiAbortRef = useRef<AbortController | null>(null);
    const imageFileInputRef = useRef<HTMLInputElement | null>(null);
    const globalImageFileInputRef = useRef<HTMLInputElement | null>(null);
    const iconListRef = useRef<HTMLDivElement | null>(null);

    const activeScreen = useMemo(() => {
        if (!spec || !screenId) return null;
        return spec.screens.find((s) => s.screenId === screenId) || null;
    }, [spec, screenId]);

    const activeAiHistory = useMemo(() => {
        if (!screenId) return [];
        return aiEditHistoryByScreen[screenId] || [];
    }, [aiEditHistoryByScreen, screenId]);

    const applyScreenHtmlImmediately = (nextHtml: string) => {
        if (!screenId) return;
        const ensured = ensureEditableUids(nextHtml);
        updateScreen(screenId, ensured, 'complete');
        setActiveScreen(screenId, ensured);
    };

    const commitActiveScreenEdits = () => {
        if (!screenId) return;
        const rebuilt = rebuildHtml();
        if (rebuilt) {
            updateScreen(screenId, rebuilt);
        }
    };

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
        const enableRemoteIconIndex = false;
        if (!enableRemoteIconIndex) return;
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
            setImageGenPromptByUid({});
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
        const nextGenPrompts: Record<string, string> = {};
        for (const item of items) inputs[item.uid] = item.src;
        setImageGenPromptByUid((prev) => {
            for (const item of items) {
                const existing = (prev[item.uid] || '').trim();
                nextGenPrompts[item.uid] = existing || defaultImagePromptFromAlt(item.alt, spec?.name, activeScreen?.name);
            }
            return nextGenPrompts;
        });
        setImageInputs(inputs);
    }, [activeScreen?.html, activeScreen?.name, spec?.name]);

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (!event.data || !event.data.type) return;
            if (!isEditMode) return;
            if (event.data.type === 'editor/request_delete') {
                const incomingScreenId = event.data.screenId as string | undefined;
                const uid = event.data.uid as string | undefined;
                if (!incomingScreenId || !uid) return;
                if (incomingScreenId !== screenId) return;
                applyPatch({ op: 'delete_node', uid });
                if (selected?.uid === uid) {
                    setSelected(null);
                }
                return;
            }
            if (event.data.type !== 'editor/select') return;
            const incomingScreenId = event.data.screenId as string | undefined;
            if (!incomingScreenId) return;
            clearSelectionOnOtherScreens(incomingScreenId);
            if (incomingScreenId !== screenId) {
                commitActiveScreenEdits();
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
    }, [isEditMode, screenId, setSelected, setActiveScreen, setFocusNodeId, spec, selected?.uid]);

    useEffect(() => {
        if (!selected) return;
        setTextValue(selected.textContent || '');
        setBgColor(selected.computedStyle.backgroundColor || '');
        setTextColor(selected.computedStyle.color || '');
        setWidth(toPxValue(selected.computedStyle.width));
        setHeight(toPxValue(selected.computedStyle.height));
        const inlineWidth = (selected.inlineStyle?.width || '').toLowerCase();
        const inlineHeight = (selected.inlineStyle?.height || '').toLowerCase();
        setWidthMode(inlineWidth.includes('fit-content') ? 'hug' : inlineWidth.includes('px') ? 'fixed' : 'auto');
        setHeightMode(inlineHeight.includes('fit-content') ? 'hug' : inlineHeight.includes('px') ? 'fixed' : 'auto');
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
        setZIndex(toPxValue(selected.inlineStyle?.['z-index'] || selected.computedStyle.zIndex || ''));
        setPositionType((selected.inlineStyle?.position || selected.computedStyle.position || 'static').toLowerCase());
        setPosX(toPxValue(selected.inlineStyle?.left || ''));
        setPosY(toPxValue(selected.inlineStyle?.top || ''));
        const transformValue = selected.inlineStyle?.transform || '';
        const rotateMatch = transformValue.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/i);
        setRotate(rotateMatch?.[1] || '0');
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

    useEffect(() => {
        if (selected?.elementType !== 'image') {
            setAiImageGenEnabled(false);
        }
    }, [selected?.elementType]);

    useEffect(() => {
        return () => {
            aiAbortRef.current?.abort();
            aiAbortRef.current = null;
        };
    }, []);

    const applyPatch = (patch: HtmlPatch) => {
        if (!screenId || !activeScreen) return;
        dispatchPatchToIframe(screenId, patch);
        const rebuilt = applyPatchAndRebuild(patch);
        if (rebuilt) updateScreen(screenId, rebuilt);
    };

    const buildImageAttrPatch = (nextSrc: string) => ({
        src: nextSrc,
        srcset: nextSrc,
    });

    const applyImageSourceForUid = (uid: string, nextSrc: string) => {
        if (!uid) return;
        applyPatch({ op: 'set_attr', uid, attr: buildImageAttrPatch(nextSrc) });
        setImageInputs((prev) => ({ ...prev, [uid]: nextSrc }));
        setScreenImages((prev) => prev.map((item) => (item.uid === uid ? { ...item, src: nextSrc } : item)));
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

    const patchZIndex = (next: string) => {
        if (!selected) return;
        const effectivePosition = (selected.inlineStyle?.position || selected.computedStyle.position || '').trim().toLowerCase();
        const style: Record<string, string> = { 'z-index': next || '0' };
        if (!effectivePosition || effectivePosition === 'static') {
            style.position = 'relative';
        }
        patchStyle(style);
    };

    const patchRotate = (next: string) => {
        const normalized = next.trim();
        setRotate(normalized || '0');
        patchStyle({ transform: normalized ? `rotate(${normalized}deg)` : '' });
    };

    const patchPosition = (nextPosition: string, nextX: string, nextY: string) => {
        setPositionType(nextPosition);
        setPosX(nextX);
        setPosY(nextY);
        patchStyle({
            position: nextPosition,
            left: nextPosition === 'static' || !nextX ? '' : `${nextX}px`,
            top: nextPosition === 'static' || !nextY ? '' : `${nextY}px`,
        });
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

    const applyAiEditToSelection = async () => {
        if (!screenId || !selected || !activeScreen) return;
        const snapshot = selected;
        const isImageGenerationMode = aiImageGenEnabled && snapshot.elementType === 'image';
        const prompt = aiPrompt.trim() || (isImageGenerationMode
            ? defaultImagePromptFromAlt(snapshot.attributes?.alt, spec?.name, activeScreen?.name)
            : '');
        if (!prompt || isApplyingAi) return;

        const htmlSource = rebuildHtml() || activeScreen.html;
        if (!htmlSource) return;

        setAiError('');
        setAiDescription('');
        setIsApplyingAi(true);
        const controller = new AbortController();
        aiAbortRef.current = controller;
        try {
            const scopedInstruction = `
Edit only the selected component in this screen.

USER REQUEST:
${prompt}

TARGET COMPONENT:
- data-uid: ${snapshot.uid}
- tag: ${snapshot.tagName.toLowerCase()}
- type: ${snapshot.elementType}
- classes: ${(snapshot.classList || []).join(' ') || '(none)'}
- inline-style: ${JSON.stringify(snapshot.inlineStyle || {})}
- attrs: ${JSON.stringify(snapshot.attributes || {})}

LAYOUT CONTEXT:
- computed display: ${snapshot.computedStyle.display || ''}
- computed position: ${snapshot.computedStyle.position || ''}
- computed z-index: ${snapshot.computedStyle.zIndex || ''}
- computed width: ${snapshot.computedStyle.width || ''}
- computed height: ${snapshot.computedStyle.height || ''}
- computed margin: ${snapshot.computedStyle.margin || ''}
- computed padding: ${snapshot.computedStyle.padding || ''}

RULES:
- Keep the screen architecture intact and preserve all unrelated components.
- Modify only the target element and only minimal nearby wrappers if required for layout integrity.
- Preserve existing data-uid and data-editable attributes.
- Keep icon/text visibility and stacking context correct.
- Return valid full HTML only.
`.trim();

            if (isImageGenerationMode) {
                const imageResult = await apiClient.generateImage({
                    prompt,
                    preferredModel: 'image',
                }, controller.signal);
                const nextSrc = imageResult.src;
                applyPatch({ op: 'set_attr', uid: snapshot.uid, attr: buildImageAttrPatch(nextSrc) });
                setImageSrc(nextSrc);
                setImageInputs((prev) => ({ ...prev, [snapshot.uid]: nextSrc }));
                setScreenImages((prev) => prev.map((item) => (item.uid === snapshot.uid ? { ...item, src: nextSrc } : item)));
                if (imageResult.description?.trim()) {
                    setAiDescription(imageResult.description.trim());
                }
            } else {
                const response = await apiClient.edit({
                    instruction: scopedInstruction,
                    html: htmlSource,
                    screenId,
                    preferredModel: getPreferredTextModel(modelProfile),
                }, controller.signal);
                applyScreenHtmlImmediately(response.html);
                if (response.description?.trim()) {
                    setAiDescription(response.description.trim());
                }
            }
            addAiEditHistory({
                id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                screenId,
                uid: snapshot.uid,
                tagName: snapshot.tagName.toLowerCase(),
                elementType: snapshot.elementType,
                prompt,
                description: aiImageGenEnabled && snapshot.elementType === 'image'
                    ? 'Generated image and replaced selected component src.'
                    : undefined,
                createdAt: new Date().toISOString(),
            });
            setAiPrompt('');
            window.setTimeout(() => dispatchSelectUid(screenId, snapshot.uid), 120);
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                setAiError('AI edit stopped.');
            } else {
                setAiError((error as Error).message || 'Failed to apply AI edit.');
            }
        } finally {
            aiAbortRef.current = null;
            setIsApplyingAi(false);
        }
    };

    const generateImageForUid = async (uid: string) => {
        if (!screenId || !activeScreen || imageGenLoadingUid) return;
        const prompt = (imageGenPromptByUid[uid] || '').trim();
        if (!prompt) return;
        setImagesTabError('');
        setImageGenLoadingUid(uid);
        const controller = new AbortController();
        aiAbortRef.current = controller;
        try {
            const imageResult = await apiClient.generateImage({
                prompt,
                preferredModel: 'image',
            }, controller.signal);
            const nextSrc = imageResult.src;
            applyPatch({ op: 'set_attr', uid, attr: buildImageAttrPatch(nextSrc) });
            setImageInputs((prev) => ({ ...prev, [uid]: nextSrc }));
            setScreenImages((prev) => prev.map((item) => (item.uid === uid ? { ...item, src: nextSrc } : item)));
            if (selected?.uid === uid) setImageSrc(nextSrc);
            addAiEditHistory({
                id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                screenId,
                uid,
                tagName: 'img',
                elementType: 'image',
                prompt,
                description: imageResult.description?.trim() || 'Generated and replaced image.',
                createdAt: new Date().toISOString(),
            });
            setImageGenPromptByUid((prev) => ({ ...prev, [uid]: '' }));
            window.setTimeout(() => dispatchSelectUid(screenId, uid), 120);
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                setImagesTabError('Image generation stopped.');
            } else {
                setImagesTabError((error as Error).message || 'Image generation failed.');
            }
        } finally {
            aiAbortRef.current = null;
            setImageGenLoadingUid(null);
        }
    };

    const stopAiEdit = () => {
        aiAbortRef.current?.abort();
    };

    if (!isEditMode) return <aside className="edit-panel" aria-hidden="true" />;

    return (
        <aside className="edit-panel open">
            <div className="h-full flex flex-col bg-[var(--ui-surface-1)] border-l border-[var(--ui-border)] shadow-2xl">
                <div className="px-4 py-3 border-b border-[var(--ui-border)] flex items-center justify-between">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Style</div>
                        <div className="text-sm text-[var(--ui-text)]/95 font-medium">{activeScreen?.name || 'Selected Screen'}</div>
                    </div>
                    <button
                        onClick={() => {
                            commitActiveScreenEdits();
                            exitEdit();
                        }}
                        className="h-8 w-8 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-4)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)] flex items-center justify-center"
                        title="Exit Edit Mode"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--ui-border)]">
                    <button onClick={onUndo} className="h-8 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-4)] px-3 text-[11px] text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)] flex items-center gap-2">
                        <Undo2 size={14} />
                        Undo
                    </button>
                    <button onClick={onRedo} className="h-8 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-4)] px-3 text-[11px] text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)] flex items-center gap-2">
                        <Redo2 size={14} />
                        Redo
                    </button>
                </div>

                <div className="px-4 pt-3 pb-2 border-b border-[var(--ui-border)]">
                    <div className="inline-flex rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-1 w-full">
                        {(['blocks', 'style', 'symbols'] as const).map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === tab ? 'bg-[var(--ui-tab-active-bg)] text-[var(--ui-text)] shadow-sm' : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'}`}
                            >
                                {tab === 'blocks' ? 'AI Edit' : tab === 'style' ? 'Edit' : 'Images'}
                            </button>
                        ))
                        }
                    </div>
                </div>

                <div className="hide-scrollbar-panel flex-1 overflow-y-auto px-4 py-4 space-y-5 text-[var(--ui-text)]">
                    {!selected && activeTab === 'style' && <div className="text-sm text-[var(--ui-text-subtle)] leading-relaxed">Hover a layer in the canvas and click to select it.</div>}
                    {activeTab === 'blocks' && (
                        <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">AI Edit</div>
                            {!selected ? (
                                <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3 text-xs text-[var(--ui-text-muted)]">
                                    Select a component on the canvas, then describe what to change.
                                </div>
                            ) : (
                                <>
                                    <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs text-[var(--ui-text-muted)]">
                                        <div className="font-semibold text-[var(--ui-text)]">{selected.tagName.toLowerCase()} · {selected.uid}</div>
                                        <div className="mt-1 text-[var(--ui-text-muted)]">{selected.elementType} component</div>
                                    </div>
                                    {selected.elementType === 'image' && (
                                        <button
                                            type="button"
                                            onClick={() => setAiImageGenEnabled((v) => !v)}
                                            className={`w-full rounded-xl border px-3 py-2 text-xs flex items-center gap-2 transition-colors ${aiImageGenEnabled ? 'border-indigo-300/50 bg-indigo-500/15 text-indigo-100' : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)]'}`}
                                            title="Enable image generation model"
                                        >
                                            <ImagePlus size={14} />
                                            {aiImageGenEnabled ? 'Image Generation On (env model)' : 'Enable Image Generation'}
                                        </button>
                                    )}
                                    <textarea
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        onKeyDown={(e) => {
                                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                                void applyAiEditToSelection();
                                            }
                                        }}
                                        placeholder="Describe the exact changes for this selected component..."
                                        className="min-h-[120px] w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3 text-xs text-[var(--ui-text)] outline-none transition-colors focus:border-indigo-400/60 resize-y"
                                    />
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void applyAiEditToSelection()}
                                            disabled={!aiPrompt.trim() || isApplyingAi}
                                            className="h-9 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-4)] px-3 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isApplyingAi ? 'Applying…' : 'Apply AI Edit'}
                                        </button>
                                        {(isApplyingAi || imageGenLoadingUid !== null) && (
                                            <button
                                                type="button"
                                                onClick={stopAiEdit}
                                                className="h-9 rounded-xl border border-red-400/30 bg-red-500/10 px-3 text-xs font-medium text-red-100 hover:bg-red-500/20"
                                            >
                                                Stop
                                            </button>
                                        )}
                                    </div>
                                    {aiError && (
                                        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                                            {aiError}
                                        </div>
                                    )}
                                    {aiDescription && (
                                        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                                            {aiDescription}
                                        </div>
                                    )}
                                </>
                            )}
                            <div className="pt-2 border-t border-[var(--ui-border)] space-y-2">
                                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">History (This Screen)</div>
                                {activeAiHistory.length === 0 ? (
                                    <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3 text-xs text-[var(--ui-text-muted)]">
                                        No AI edits yet for this screen.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {activeAiHistory.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => {
                                                    if (!screenId) return;
                                                    setFocusNodeId(screenId);
                                                    dispatchSelectUid(screenId, item.uid);
                                                }}
                                                className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-left hover:bg-[var(--ui-surface-3)] transition-colors"
                                                title={`Select ${item.tagName} (${item.uid})`}
                                            >
                                                <div className="text-[11px] text-[var(--ui-text-muted)]">{item.tagName} · {item.uid}</div>
                                                <div className="mt-1 text-xs text-[var(--ui-text)] max-h-10 overflow-hidden">{item.prompt}</div>
                                                {item.description && (
                                                    <div className="mt-1 text-[11px] text-emerald-300/90 max-h-10 overflow-hidden">{item.description}</div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {!!selected && activeTab === 'style' && (
                        <>
                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-2">
                                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Selection</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-[var(--ui-text)]">{selected.tagName.toLowerCase()} · {selected.uid}</div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => dispatchSelectScreenContainer(screenId!)} className="text-xs px-2 py-1 rounded-md bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]">
                                            Screen
                                        </button>
                                        <button onClick={() => dispatchSelectParent(screenId!, selected.uid)} className="text-xs px-2 py-1 rounded-md bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] flex items-center gap-1">
                                            <ArrowUpLeft size={12} />
                                            Parent
                                        </button>
                                        <button
                                            onClick={() => {
                                                applyPatch({ op: 'delete_node', uid: selected.uid });
                                                setSelected(null);
                                            }}
                                            className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                                {selected.breadcrumb && selected.breadcrumb.length > 0 && (
                                    <div className="flex flex-wrap gap-2 text-[11px] text-[var(--ui-text-subtle)]">
                                        {selected.breadcrumb.map((crumb) => (
                                            <button key={crumb.uid} onClick={() => dispatchSelectUid(screenId!, crumb.uid)} className="px-2 py-1 rounded-md bg-[var(--ui-surface-3)] hover:bg-[var(--ui-surface-4)]">
                                                {crumb.tagName.toLowerCase()}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-3">
                                <div className="text-xs font-semibold text-[var(--ui-text-muted)]">Breakpoint</div>
                                <div className="space-y-2">
                                    <div className="grid grid-cols-[52px_1fr] items-center gap-3">
                                        <div className="text-xs text-[var(--ui-text-muted)]">W</div>
                                        <div className="grid grid-cols-[1fr_84px] gap-2">
                                            <ScrubNumberInput
                                                value={width}
                                                onChangeValue={(next) => {
                                                    setWidth(next);
                                                    if (widthMode === 'fixed') patchStyle({ width: next ? `${next}px` : '' });
                                                }}
                                                min={0}
                                            />
                                            <select
                                                value={widthMode}
                                                onChange={(e) => {
                                                    const next = e.target.value as 'fixed' | 'auto' | 'hug';
                                                    setWidthMode(next);
                                                    patchStyle({ width: next === 'fixed' && width ? `${width}px` : next === 'hug' ? 'fit-content' : '' });
                                                }}
                                                className={selectBase}
                                            >
                                                <option className="bg-[var(--ui-popover)]" value="fixed">Fixed</option>
                                                <option className="bg-[var(--ui-popover)]" value="hug">Hug</option>
                                                <option className="bg-[var(--ui-popover)]" value="auto">Auto</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[52px_1fr] items-center gap-3">
                                        <div className="text-xs text-[var(--ui-text-muted)]">H</div>
                                        <div className="grid grid-cols-[1fr_84px] gap-2">
                                            <ScrubNumberInput
                                                value={height}
                                                onChangeValue={(next) => {
                                                    setHeight(next);
                                                    if (heightMode === 'fixed') patchStyle({ height: next ? `${next}px` : '' });
                                                }}
                                                min={0}
                                            />
                                            <select
                                                value={heightMode}
                                                onChange={(e) => {
                                                    const next = e.target.value as 'fixed' | 'auto' | 'hug';
                                                    setHeightMode(next);
                                                    patchStyle({ height: next === 'fixed' && height ? `${height}px` : next === 'hug' ? 'fit-content' : '' });
                                                }}
                                                className={selectBase}
                                            >
                                                <option className="bg-[var(--ui-popover)]" value="fixed">Fixed</option>
                                                <option className="bg-[var(--ui-popover)]" value="hug">Hug</option>
                                                <option className="bg-[var(--ui-popover)]" value="auto">Auto</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-2">
                                <div className="text-xs font-semibold text-[var(--ui-text-muted)]">Rotate</div>
                                <div className="grid grid-cols-[52px_1fr] items-center gap-3">
                                    <div className="text-xs text-[var(--ui-text-muted)]">R</div>
                                    <div className="grid grid-cols-[1fr_auto] gap-2">
                                        <ScrubNumberInput
                                            value={rotate}
                                            onChangeValue={(next) => patchRotate(next)}
                                        />
                                        <div className="h-10 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 text-xs text-[var(--ui-text-muted)] flex items-center">deg</div>
                                    </div>
                                </div>
                            </section>

                            {showLayout && (
                                <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-3">
                                    <div className="text-xs font-semibold text-[var(--ui-text-muted)]">Layout</div>
                                    <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                                        <div className="text-xs text-[var(--ui-text-muted)]">Mode</div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['block', 'flex', 'grid'] as const).map((type) => (
                                                <button
                                                    key={type}
                                                    onClick={() => {
                                                        setDisplay(type);
                                                        const add = type === 'block' ? [] : [type];
                                                        applyPatch({ op: 'set_classes', uid: selected.uid, add, remove: DISPLAY_CLASSES.filter((c) => c !== type) });
                                                    }}
                                                    className={`rounded-lg border px-2 py-2 text-xs capitalize ${display === type ? 'border-indigo-300/70 bg-indigo-500/20 text-indigo-100' : 'border-[var(--ui-border)] bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'}`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {display === 'flex' && (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                                                <div className="text-xs text-[var(--ui-text-muted)]">Direction</div>
                                                <select value={flexDir} onChange={(e) => { setFlexDir(e.target.value); applyPatch({ op: 'set_classes', uid: selected.uid, add: [e.target.value], remove: FLEX_DIR_CLASSES.filter((c) => c !== e.target.value) }); }} className={selectBase}>
                                                    {FLEX_DIR_CLASSES.map((dir) => <option className="bg-[var(--ui-popover)]" key={dir} value={dir}>{dir}</option>)}
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                                                <div className="text-xs text-[var(--ui-text-muted)]">Align</div>
                                                <select value={align} onChange={(e) => { setAlign(e.target.value); applyPatch({ op: 'set_classes', uid: selected.uid, add: [e.target.value], remove: ALIGN_CLASSES.filter((c) => c !== e.target.value) }); }} className={selectBase}>
                                                    {ALIGN_CLASSES.map((entry) => <option className="bg-[var(--ui-popover)]" key={entry} value={entry}>{entry}</option>)}
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                                                <div className="text-xs text-[var(--ui-text-muted)]">Justify</div>
                                                <select value={justify} onChange={(e) => { setJustify(e.target.value); applyPatch({ op: 'set_classes', uid: selected.uid, add: [e.target.value], remove: JUSTIFY_CLASSES.filter((c) => c !== e.target.value) }); }} className={selectBase}>
                                                    {JUSTIFY_CLASSES.map((entry) => <option className="bg-[var(--ui-popover)]" key={entry} value={entry}>{entry}</option>)}
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                                                <div className="text-xs text-[var(--ui-text-muted)]">Gap</div>
                                                <select value={gap} onChange={(e) => { setGap(e.target.value); applyPatch({ op: 'set_classes', uid: selected.uid, add: [e.target.value], remove: GAP_CLASSES.filter((c) => c !== e.target.value) }); }} className={selectBase}>
                                                    {GAP_CLASSES.map((entry) => <option className="bg-[var(--ui-popover)]" key={entry} value={entry}>{entry}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            )}

                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-3">
                                <div className="text-xs font-semibold text-[var(--ui-text-muted)]">Position</div>
                                <div className="space-y-2">
                                    <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                                        <div className="text-xs text-[var(--ui-text-muted)]">X / Y</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <ScrubNumberInput
                                                value={posX}
                                                onChangeValue={(next) => patchPosition(positionType, next, posY)}
                                                placeholder="X"
                                            />
                                            <ScrubNumberInput
                                                value={posY}
                                                onChangeValue={(next) => patchPosition(positionType, posX, next)}
                                                placeholder="Y"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                                        <div className="text-xs text-[var(--ui-text-muted)]">Type</div>
                                        <select
                                            value={positionType}
                                            onChange={(e) => patchPosition(e.target.value, posX, posY)}
                                            className={selectBase}
                                        >
                                            <option className="bg-[var(--ui-popover)]" value="static">Static</option>
                                            <option className="bg-[var(--ui-popover)]" value="relative">Relative</option>
                                            <option className="bg-[var(--ui-popover)]" value="absolute">Absolute</option>
                                            <option className="bg-[var(--ui-popover)]" value="fixed">Fixed</option>
                                        </select>
                                    </div>
                                </div>
                            </section>

                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-3">
                                <div className="grid grid-cols-[72px_1fr_auto] items-center gap-3">
                                    <div className="text-xs text-[var(--ui-text-muted)]">Padding</div>
                                    <ScrubNumberInput
                                        value={spacingSummary(padding)}
                                        onChangeValue={(next) => {
                                            const clean = toPxValue(next);
                                            if (!clean) return;
                                            setPadding({ top: clean, right: clean, bottom: clean, left: clean });
                                            patchStyle({ padding: `${clean}px` });
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setExpandPadding((v) => !v)}
                                        className="h-9 w-9 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] inline-flex items-center justify-center"
                                        title={expandPadding ? 'Collapse padding sides' : 'Expand padding sides'}
                                    >
                                        {expandPadding ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                    </button>
                                </div>
                                {expandPadding && (
                                    <div className="ml-[75px] grid grid-cols-2 gap-2">
                                        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                                            <ScrubNumberInput
                                                key={side}
                                                value={toPxValue(padding[side])}
                                                onChangeValue={(next) => {
                                                    setPadding((prev) => ({ ...prev, [side]: next }));
                                                    patchStyle({ [`padding-${side}`]: next ? `${next}px` : '' });
                                                }}
                                                placeholder={side}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-3">
                                <div className="grid grid-cols-[72px_1fr_auto] items-center gap-3">
                                    <div className="text-xs text-[var(--ui-text-muted)]">Margin</div>
                                    <ScrubNumberInput
                                        value={spacingSummary(margin)}
                                        onChangeValue={(next) => {
                                            const clean = toPxValue(next);
                                            if (!clean) return;
                                            setMargin({ top: clean, right: clean, bottom: clean, left: clean });
                                            patchStyle({ margin: `${clean}px` });
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setExpandMargin((v) => !v)}
                                        className="h-9 w-9 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)] inline-flex items-center justify-center"
                                        title={expandMargin ? 'Collapse margin sides' : 'Expand margin sides'}
                                    >
                                        {expandMargin ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                    </button>
                                </div>
                                {expandMargin && (
                                    <div className="ml-[75px] grid grid-cols-2 gap-2">
                                        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                                            <ScrubNumberInput
                                                key={side}
                                                value={toPxValue(margin[side])}
                                                onChangeValue={(next) => {
                                                    setMargin((prev) => ({ ...prev, [side]: next }));
                                                    patchStyle({ [`margin-${side}`]: next ? `${next}px` : '' });
                                                }}
                                                placeholder={side}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>

                            {showTextContent && (
                                <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Content</div>
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
                                <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 grid grid-cols-1 gap-3">
                                    {showImage && (
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Image Src</div>
                                            <div className="flex items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-2">
                                                <div className="h-12 w-12 overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-3)]">
                                                    {imageSrc ? (
                                                        <img src={imageSrc} alt="Selected element preview" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wide text-[var(--ui-text-subtle)]">No Img</div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-[11px] text-[var(--ui-text-muted)]">{selected.uid}</div>
                                                    <div className="truncate text-[10px] text-[var(--ui-text-subtle)]">{selected.attributes?.alt || 'Selected image element'}</div>
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
                                                className="rounded-lg bg-[var(--ui-surface-3)] px-3 py-2 text-xs text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]"
                                            >
                                                Upload Image
                                            </button>
                                        </div>
                                    )}
                                    {showLink && (
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Link Href</div>
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
                                <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Icon</div>
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
                                            className="rounded-lg bg-[var(--ui-surface-4)] px-3 py-2 text-xs font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)]"
                                        >
                                            Apply Typed Icon
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowIconResults((v) => !v)}
                                            className="rounded-lg bg-[var(--ui-surface-3)] px-3 py-2 text-xs text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]"
                                        >
                                            {showIconResults ? 'Hide List' : 'Show List'}
                                        </button>
                                    </div>
                                    {showIconResults && (
                                        <div ref={iconListRef} className="hide-scrollbar-panel max-h-48 overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--ui-popover)] p-1">
                                            {filteredIcons.length === 0 && (
                                                <div className="px-2 py-2 text-xs text-[var(--ui-text-subtle)]">No matching icons</div>
                                            )}
                                            {filteredIcons.map((iconName, index) => (
                                                <button
                                                    key={iconName}
                                                    type="button"
                                                    data-icon-index={index}
                                                    onMouseEnter={() => setIconActiveIndex(index)}
                                                    onClick={() => applyIconName(iconName)}
                                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] ${iconActiveIndex === index ? 'bg-indigo-500/25' : ''}`}
                                                >
                                                    <span className="material-symbols-rounded text-base leading-none">{iconName}</span>
                                                    <span className="truncate">{iconName}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            )}

                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-3">
                                <div className="text-xs font-semibold text-[var(--ui-text-muted)]">Style & Appearance</div>
                                <div className="space-y-2">
                                    {showColor && (
                                        <div className="grid grid-cols-[84px_1fr] items-center gap-3">
                                            <div className="text-xs text-[var(--ui-text-muted)]">Fill</div>
                                            <ColorWheelInput
                                                value={bgColor}
                                                onChange={(next) => {
                                                    setBgColor(next);
                                                    patchStyle({ 'background-color': next });
                                                }}
                                            />
                                        </div>
                                    )}
                                    {showColor && (
                                        <div className="grid grid-cols-[84px_1fr] items-center gap-3">
                                            <div className="text-xs text-[var(--ui-text-muted)]">Text</div>
                                            <ColorWheelInput
                                                value={textColor}
                                                onChange={(next) => {
                                                    setTextColor(next);
                                                    patchStyle({ color: next });
                                                }}
                                            />
                                        </div>
                                    )}
                                    <div className="grid grid-cols-[84px_1fr] items-center gap-3">
                                        <div className="text-xs text-[var(--ui-text-muted)]">Border Color</div>
                                        <ColorWheelInput
                                            value={borderColor}
                                            onChange={(next) => {
                                                setBorderColor(next);
                                                patchStyle({ 'border-color': next });
                                            }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-[84px_1fr] items-center gap-3">
                                        <div className="text-xs text-[var(--ui-text-muted)]">Border</div>
                                        <ScrubNumberInput
                                            value={borderWidth}
                                            onChangeValue={(next) => {
                                                setBorderWidth(next);
                                                patchStyle({ 'border-width': next ? `${next}px` : '' });
                                            }}
                                            min={0}
                                        />
                                    </div>
                                    <div className="grid grid-cols-[84px_1fr] items-center gap-3">
                                        <div className="text-xs text-[var(--ui-text-muted)]">Opacity</div>
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
                                    <div className="grid grid-cols-[84px_1fr] items-center gap-3">
                                        <div className="text-xs text-[var(--ui-text-muted)]">Effect</div>
                                        <select value={boxShadow} onChange={(e) => { setBoxShadow(e.target.value); patchStyle({ 'box-shadow': e.target.value }); }} className={selectBase}>
                                            <option className="bg-[var(--ui-popover)]" value="">Add effect</option>
                                            <option className="bg-[var(--ui-popover)]" value="0 12px 34px rgba(0,0,0,.28)">Soft</option>
                                            <option className="bg-[var(--ui-popover)]" value="0 20px 60px rgba(0,0,0,.22)">Glow</option>
                                            <option className="bg-[var(--ui-popover)]" value="0 10px 40px -10px rgba(0,0,0,.35)">Deep</option>
                                        </select>
                                    </div>
                                </div>
                            </section>

                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-2">
                                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Element Align</div>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => applyElementAlign('left')}
                                        className={`rounded-lg px-2 py-2 text-xs ${elementAlign === 'left' ? 'bg-indigo-500/30 text-[var(--ui-text)]' : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'}`}
                                    >
                                        Left
                                    </button>
                                    <button
                                        onClick={() => applyElementAlign('center')}
                                        className={`rounded-lg px-2 py-2 text-xs ${elementAlign === 'center' ? 'bg-indigo-500/30 text-[var(--ui-text)]' : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'}`}
                                    >
                                        Center
                                    </button>
                                    <button
                                        onClick={() => applyElementAlign('right')}
                                        className={`rounded-lg px-2 py-2 text-xs ${elementAlign === 'right' ? 'bg-indigo-500/30 text-[var(--ui-text)]' : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'}`}
                                    >
                                        Right
                                    </button>
                                </div>
                            </section>

                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-2">
                                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Z Index</div>
                                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                                    <ScrubNumberInput
                                        value={zIndex}
                                        onChangeValue={(next) => {
                                            setZIndex(next);
                                            patchZIndex(next);
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            const current = parseInt(zIndex || '0', 10) || 0;
                                            const next = String(current - 1);
                                            setZIndex(next);
                                            patchZIndex(next);
                                        }}
                                        className="rounded-lg bg-[var(--ui-surface-3)] px-3 text-xs text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]"
                                    >
                                        -
                                    </button>
                                    <button
                                        onClick={() => {
                                            const current = parseInt(zIndex || '0', 10) || 0;
                                            const next = String(current + 1);
                                            setZIndex(next);
                                            patchZIndex(next);
                                        }}
                                        className="rounded-lg bg-[var(--ui-surface-3)] px-3 text-xs text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]"
                                    >
                                        +
                                    </button>
                                </div>
                            </section>

                            <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Width</div>
                                    <ScrubNumberInput value={width} onChangeValue={(next) => { setWidth(next); patchStyle({ width: next ? `${next}px` : '' }); }} min={0} />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Height</div>
                                    <ScrubNumberInput value={height} onChangeValue={(next) => { setHeight(next); patchStyle({ height: next ? `${next}px` : '' }); }} min={0} />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Radius</div>
                                    <ScrubNumberInput value={radius} onChangeValue={(next) => { setRadius(next); patchStyle({ 'border-radius': next ? `${next}px` : '' }); }} min={0} />
                                </div>
                            </section>

                            {showTypography && (
                                <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Font Size</div>
                                        <ScrubNumberInput value={fontSize} onChangeValue={(next) => { setFontSize(next); patchStyle({ 'font-size': next ? `${next}px` : '' }); }} min={0} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Line Height</div>
                                        <ScrubNumberInput value={lineHeight} onChangeValue={(next) => { setLineHeight(next); patchStyle({ 'line-height': next ? `${next}px` : '' }); }} min={0} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Letter Spacing</div>
                                        <ScrubNumberInput value={letterSpacing} onChangeValue={(next) => { setLetterSpacing(next); patchStyle({ 'letter-spacing': next ? `${next}px` : '' }); }} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Text Align</div>
                                        <select value={textAlign} onChange={(e) => { setTextAlign(e.target.value); patchStyle({ 'text-align': e.target.value }); }} className={selectBase}>
                                            <option className="bg-[var(--ui-popover)]" value="">default</option>
                                            <option className="bg-[var(--ui-popover)]" value="left">left</option>
                                            <option className="bg-[var(--ui-popover)]" value="center">center</option>
                                            <option className="bg-[var(--ui-popover)]" value="right">right</option>
                                            <option className="bg-[var(--ui-popover)]" value="justify">justify</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2 grid grid-cols-2 gap-2">
                                        <button onClick={() => applyPatch({ op: 'set_classes', uid: selected.uid, add: ['font-display'], remove: ['font-sans'] })} className="rounded-lg bg-[var(--ui-surface-3)] px-3 py-2 text-xs text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]">
                                            Display Font
                                        </button>
                                        <button onClick={() => applyPatch({ op: 'set_classes', uid: selected.uid, add: ['font-sans'], remove: ['font-display'] })} className="rounded-lg bg-[var(--ui-surface-3)] px-3 py-2 text-xs text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]">
                                            Sans Font
                                        </button>
                                    </div>
                                    {showTextFlexAlign && (
                                        <div className="col-span-2 space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Flex Align</div>
                                            <div className="grid grid-cols-4 gap-2">
                                                <button
                                                    onClick={() => {
                                                        setTextFlexAlign('start');
                                                        patchStyle({ 'align-self': 'flex-start' });
                                                    }}
                                                    className={`rounded-lg px-2 py-2 text-xs ${textFlexAlign === 'start' ? 'bg-indigo-500/30 text-[var(--ui-text)]' : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'}`}
                                                >
                                                    Start
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setTextFlexAlign('center');
                                                        patchStyle({ 'align-self': 'center' });
                                                    }}
                                                    className={`rounded-lg px-2 py-2 text-xs ${textFlexAlign === 'center' ? 'bg-indigo-500/30 text-[var(--ui-text)]' : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'}`}
                                                >
                                                    Center
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setTextFlexAlign('end');
                                                        patchStyle({ 'align-self': 'flex-end' });
                                                    }}
                                                    className={`rounded-lg px-2 py-2 text-xs ${textFlexAlign === 'end' ? 'bg-indigo-500/30 text-[var(--ui-text)]' : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'}`}
                                                >
                                                    End
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setTextFlexAlign('stretch');
                                                        patchStyle({ 'align-self': 'stretch' });
                                                    }}
                                                    className={`rounded-lg px-2 py-2 text-xs ${textFlexAlign === 'stretch' ? 'bg-indigo-500/30 text-[var(--ui-text)]' : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'}`}
                                                >
                                                    Stretch
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            )}

                        </>
                    )}

                    {activeTab === 'symbols' && (
                        <section className="pb-4 border-b border-[var(--ui-border)] last:border-b-0 space-y-3">
                            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ui-text-subtle)]">Images</div>
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
                                <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3 text-xs text-[var(--ui-text-muted)]">
                                    No images found on this screen.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {imagesTabError && (
                                        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                                            {imagesTabError}
                                        </div>
                                    )}
                                    {screenImages.map((image) => (
                                        <div key={image.uid} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-2 space-y-2">
                                            <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => dispatchSelectUid(screenId!, image.uid)}
                                                    className="h-16 w-16 overflow-hidden rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-3)]"
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
                                                        className="rounded-md bg-[var(--ui-surface-3)] px-2 py-2 text-[10px] uppercase tracking-wide text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]"
                                                    >
                                                        Select
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setUploadTargetUid(image.uid);
                                                            globalImageFileInputRef.current?.click();
                                                        }}
                                                        className="rounded-md bg-[var(--ui-surface-3)] px-2 py-2 text-[10px] uppercase tracking-wide text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]"
                                                    >
                                                        Upload
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    value={imageGenPromptByUid[image.uid] || ''}
                                                    onChange={(e) => {
                                                        const next = e.target.value;
                                                        setImageGenPromptByUid((prev) => ({ ...prev, [image.uid]: next }));
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') void generateImageForUid(image.uid);
                                                    }}
                                                    className={inputBase}
                                                    placeholder="Generate a new image for this slot..."
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => void generateImageForUid(image.uid)}
                                                    disabled={imageGenLoadingUid === image.uid || !(imageGenPromptByUid[image.uid] || '').trim()}
                                                    className="rounded-md bg-indigo-500/20 border border-indigo-400/30 px-3 py-2 text-[10px] uppercase tracking-wide text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                                    title="Generate and replace image"
                                                >
                                                    <ImagePlus size={12} />
                                                    {imageGenLoadingUid === image.uid ? 'Generating…' : 'Generate'}
                                                </button>
                                                {imageGenLoadingUid === image.uid && (
                                                    <button
                                                        type="button"
                                                        onClick={stopAiEdit}
                                                        className="rounded-md bg-red-500/10 border border-red-400/30 px-3 py-2 text-[10px] uppercase tracking-wide text-red-100 hover:bg-red-500/20"
                                                        title="Stop image generation"
                                                    >
                                                        Stop
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </aside>
    );
}
















