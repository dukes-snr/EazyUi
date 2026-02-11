import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDesignStore } from '../../stores';
import { useEditStore } from '../../stores/edit-store';
import { type HtmlPatch } from '../../utils/htmlPatcher';
import { ArrowUpLeft, Redo2, Undo2, X } from 'lucide-react';

type PaddingValues = { top: string; right: string; bottom: string; left: string };
type ElementType = 'text' | 'button' | 'image' | 'container' | 'input' | 'icon' | 'badge';

const GAP_CLASSES = ['gap-0', 'gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-6', 'gap-8'];
const JUSTIFY_CLASSES = ['justify-start', 'justify-center', 'justify-end', 'justify-between', 'justify-around', 'justify-evenly'];
const ALIGN_CLASSES = ['items-start', 'items-center', 'items-end', 'items-stretch'];
const FLEX_DIR_CLASSES = ['flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse'];
const DISPLAY_CLASSES = ['flex', 'grid'];

const inputBase = 'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400/60';
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

function getIframeByScreenId(screenId: string) {
    return document.querySelector(`iframe[data-screen-id="${screenId}"]`) as HTMLIFrameElement | null;
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
    const startXRef = useRef(0);
    const startValueRef = useRef(0);
    const draggingRef = useRef(false);

    const onPointerDown = (event: ReactPointerEvent<HTMLInputElement>) => {
        if (event.button !== 0) return;
        const parsed = parseFloat(value || '0');
        startValueRef.current = Number.isNaN(parsed) ? 0 : parsed;
        startXRef.current = event.clientX;
        draggingRef.current = true;

        const onMove = (moveEvent: PointerEvent) => {
            if (!draggingRef.current) return;
            const deltaX = moveEvent.clientX - startXRef.current;
            let next = startValueRef.current + deltaX * step * 0.1;
            if (typeof min === 'number') next = Math.max(min, next);
            if (typeof max === 'number') next = Math.min(max, next);
            const rounded = Number.isInteger(step) ? Math.round(next) : Math.round(next * 100) / 100;
            onChangeValue(String(rounded));
        };

        const onUp = () => {
            draggingRef.current = false;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    return (
        <input
            value={value}
            onChange={(e) => onChangeValue(e.target.value)}
            onPointerDown={onPointerDown}
            type="number"
            className={`${inputBase} cursor-ew-resize`}
            placeholder={placeholder}
            title="Drag horizontally to scrub value"
        />
    );
}

export function EditPanel() {
    const { spec, updateScreen } = useDesignStore();
    const { isEditMode, screenId, selected, setSelected, applyPatchAndRebuild, undoAndRebuild, redoAndRebuild, exitEdit } = useEditStore();

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

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (!event.data || event.data.type !== 'editor/select') return;
            if (event.data.screenId !== screenId) return;
            setSelected(event.data.payload);
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [screenId, setSelected]);

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
        setDisplay(selected.computedStyle.display === 'flex' ? 'flex' : selected.computedStyle.display === 'grid' ? 'grid' : 'block');
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
    }, [selected]);

    const applyPatch = (patch: HtmlPatch) => {
        if (!screenId || !activeScreen) return;
        dispatchPatchToIframe(screenId, patch);
        const rebuilt = applyPatchAndRebuild(patch);
        if (rebuilt) updateScreen(screenId, rebuilt);
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

    if (!isEditMode) return <aside className="edit-panel" aria-hidden="true" />;

    return (
        <aside className="edit-panel open">
            <div className="h-full flex flex-col bg-[#111114] border-l border-white/10 shadow-2xl">
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

                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 text-gray-200">
                    {!selected && <div className="text-sm text-gray-500 leading-relaxed">Hover a layer in the canvas and click to select it.</div>}

                    {!!selected && (
                        <>
                            <section className="space-y-2">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Selection</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-white">{selected.tagName.toLowerCase()} · {selected.uid}</div>
                                    <button onClick={() => dispatchSelectParent(screenId!, selected.uid)} className="text-xs px-2 py-1 rounded-md bg-white/5 text-gray-400 hover:bg-white/10 flex items-center gap-1">
                                        <ArrowUpLeft size={12} />
                                        Parent
                                    </button>
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
                                            <input
                                                value={imageSrc}
                                                onChange={(e) => {
                                                    const next = e.target.value;
                                                    setImageSrc(next);
                                                    applyPatch({ op: 'set_attr', uid: selected.uid, attr: { src: next } });
                                                }}
                                                className={inputBase}
                                            />
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

                            <section className="grid grid-cols-2 gap-3">
                                {showColor && (
                                    <>
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Fill</div>
                                            <input value={bgColor} onChange={(e) => { setBgColor(e.target.value); patchStyle({ 'background-color': e.target.value }); }} className={inputBase} />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Text Color</div>
                                            <input value={textColor} onChange={(e) => { setTextColor(e.target.value); patchStyle({ color: e.target.value }); }} className={inputBase} />
                                        </div>
                                    </>
                                )}
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Border Color</div>
                                    <input value={borderColor} onChange={(e) => { setBorderColor(e.target.value); patchStyle({ 'border-color': e.target.value }); }} className={inputBase} />
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
                                </section>
                            )}

                            <section className="space-y-3">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Padding</div>
                                <div className="grid grid-cols-2 gap-3">
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
                            </section>

                            <section className="space-y-3">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Margin</div>
                                <div className="grid grid-cols-2 gap-3">
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
                </div>
            </div>
        </aside>
    );
}

