import { useEffect, useMemo, useState } from 'react';
import { useDesignStore } from '../../stores';
import { useEditStore } from '../../stores/edit-store';
import { applyPatchToHtml, type HtmlPatch } from '../../utils/htmlPatcher';
import { X, ArrowUpLeft, Undo2, Redo2 } from 'lucide-react';

type PaddingValues = { top: string; right: string; bottom: string; left: string };

function toPxValue(value?: string) {
    if (!value) return '';
    const match = value.match(/-?\d+(\.\d+)?/);
    return match ? match[0] : '';
}

function parsePadding(value?: string): PaddingValues {
    const raw = value?.trim() || '';
    if (!raw) return { top: '', right: '', bottom: '', left: '' };
    const parts = raw.split(/\s+/);
    if (parts.length === 1) {
        return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    }
    if (parts.length === 2) {
        return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    }
    if (parts.length === 3) {
        return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    }
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

export function EditPanel() {
    const { spec, updateScreen } = useDesignStore();
    const {
        isEditMode,
        screenId,
        selected,
        setSelected,
        pushPatch,
        undo,
        redo,
        exitEdit,
    } = useEditStore();

    const [textValue, setTextValue] = useState('');
    const [bgColor, setBgColor] = useState('');
    const [textColor, setTextColor] = useState('');
    const [width, setWidth] = useState('');
    const [height, setHeight] = useState('');
    const [radius, setRadius] = useState('');
    const [fontSize, setFontSize] = useState('');
    const [padding, setPadding] = useState<PaddingValues>({ top: '', right: '', bottom: '', left: '' });

    const activeScreen = useMemo(() => {
        if (!spec || !screenId) return null;
        return spec.screens.find(s => s.screenId === screenId) || null;
    }, [spec, screenId]);

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (!event.data || event.data.type !== 'editor/select') return;
            if (event.data.screenId !== screenId) return;
            setSelected(event.data.payload);
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [screenId, setSelected]);

    const isTextEditable = !!selected && !['IMG', 'INPUT', 'TEXTAREA', 'SELECT'].includes(selected.tagName);

    useEffect(() => {
        if (!selected) return;
        setTextValue(selected.textContent || '');
        setBgColor(selected.computedStyle.backgroundColor || '');
        setTextColor(selected.computedStyle.color || '');
        setWidth(toPxValue(selected.computedStyle.width));
        setHeight(toPxValue(selected.computedStyle.height));
        setRadius(toPxValue(selected.computedStyle.borderRadius));
        setFontSize(toPxValue(selected.computedStyle.fontSize));
        setPadding(parsePadding(selected.computedStyle.padding));
    }, [selected]);

    const applyPatch = (patch: HtmlPatch) => {
        if (!screenId || !activeScreen) return;
        const nextHtml = applyPatchToHtml(activeScreen.html, patch);
        updateScreen(screenId, nextHtml);
        dispatchPatchToIframe(screenId, patch);
        pushPatch(patch);
    };

    const handleUndo = () => {
        const last = undo();
        if (!last || !screenId || !activeScreen) return;
        if (last.op === 'set_style') {
            const cleared: Record<string, string> = {};
            Object.keys(last.style).forEach(key => (cleared[key] = ''));
            const inverse: HtmlPatch = { op: 'set_style', uid: last.uid, style: cleared };
            const nextHtml = applyPatchToHtml(activeScreen.html, inverse);
            updateScreen(screenId, nextHtml);
            dispatchPatchToIframe(screenId, inverse);
        }
        if (last.op === 'set_text') {
            const inverse: HtmlPatch = { op: 'set_text', uid: last.uid, text: '' };
            const nextHtml = applyPatchToHtml(activeScreen.html, inverse);
            updateScreen(screenId, nextHtml);
            dispatchPatchToIframe(screenId, inverse);
        }
    };

    const handleRedo = () => {
        const next = redo();
        if (!next || !screenId || !activeScreen) return;
        const nextHtml = applyPatchToHtml(activeScreen.html, next);
        updateScreen(screenId, nextHtml);
        dispatchPatchToIframe(screenId, next);
    };

    if (!isEditMode) {
        return <aside className="edit-panel" aria-hidden="true" />;
    }

    return (
        <aside className="edit-panel open">
            <div className="h-full flex flex-col bg-[#111114] border-l border-white/10 shadow-2xl">
                <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Edit Mode</div>
                        <div className="text-sm text-white font-semibold">
                            {activeScreen?.name || 'Selected Screen'}
                        </div>
                    </div>
                    <button
                        onClick={exitEdit}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 flex items-center justify-center"
                        title="Exit Edit Mode"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                    <button
                        onClick={handleUndo}
                        className="px-3 py-2 rounded-lg bg-white/5 text-gray-300 text-xs font-semibold uppercase tracking-wide hover:bg-white/10 flex items-center gap-2"
                    >
                        <Undo2 size={14} />
                        Undo
                    </button>
                    <button
                        onClick={handleRedo}
                        className="px-3 py-2 rounded-lg bg-white/5 text-gray-300 text-xs font-semibold uppercase tracking-wide hover:bg-white/10 flex items-center gap-2"
                    >
                        <Redo2 size={14} />
                        Redo
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 text-gray-200">
                    {!selected ? (
                        <div className="text-sm text-gray-500 leading-relaxed">
                            Hover a layer in the canvas and click to select it.
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Selection</div>
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-white">
                                        {selected.tagName.toLowerCase()} · {selected.uid}
                                    </div>
                                    <button
                                        onClick={() => dispatchSelectParent(screenId!, selected.uid)}
                                        className="text-xs px-2 py-1 rounded-md bg-white/5 text-gray-400 hover:bg-white/10 flex items-center gap-1"
                                    >
                                        <ArrowUpLeft size={12} />
                                        Parent
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Text</div>
                                <textarea
                                    value={textValue}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setTextValue(value);
                                        applyPatch({ op: 'set_text', uid: selected.uid, text: value });
                                    }}
                                    disabled={!isTextEditable}
                                    className="w-full min-h-[80px] bg-white/5 rounded-xl border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-400/40"
                                    placeholder="Edit text..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Fill</div>
                                    <input
                                        value={bgColor}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setBgColor(value);
                                            applyPatch({ op: 'set_style', uid: selected.uid, style: { 'background-color': value } });
                                        }}
                                        className="w-full bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white outline-none"
                                        placeholder="rgba(...) or #hex"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Text Color</div>
                                    <input
                                        value={textColor}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setTextColor(value);
                                            applyPatch({ op: 'set_style', uid: selected.uid, style: { color: value } });
                                        }}
                                        className="w-full bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white outline-none"
                                        placeholder="rgba(...) or #hex"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Width (px)</div>
                                    <input
                                        value={width}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setWidth(value);
                                            applyPatch({ op: 'set_style', uid: selected.uid, style: { width: value ? `${value}px` : '' } });
                                        }}
                                        type="number"
                                        className="w-full bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Height (px)</div>
                                    <input
                                        value={height}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setHeight(value);
                                            applyPatch({ op: 'set_style', uid: selected.uid, style: { height: value ? `${value}px` : '' } });
                                        }}
                                        type="number"
                                        className="w-full bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Radius (px)</div>
                                    <input
                                        value={radius}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setRadius(value);
                                            applyPatch({ op: 'set_style', uid: selected.uid, style: { 'border-radius': value ? `${value}px` : '' } });
                                        }}
                                        type="number"
                                        className="w-full bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Font Size (px)</div>
                                    <input
                                        value={fontSize}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setFontSize(value);
                                            applyPatch({ op: 'set_style', uid: selected.uid, style: { 'font-size': value ? `${value}px` : '' } });
                                        }}
                                        type="number"
                                        className="w-full bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Padding (px)</div>
                                <div className="grid grid-cols-2 gap-3">
                                    {(['top', 'right', 'bottom', 'left'] as const).map(side => (
                                        <input
                                            key={side}
                                            value={toPxValue(padding[side])}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setPadding(prev => ({ ...prev, [side]: value }));
                                                applyPatch({
                                                    op: 'set_style',
                                                    uid: selected.uid,
                                                    style: { [`padding-${side}`]: value ? `${value}px` : '' }
                                                });
                                            }}
                                            type="number"
                                            className="w-full bg-white/5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white outline-none"
                                            placeholder={side}
                                        />
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}
