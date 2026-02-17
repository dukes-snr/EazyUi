import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Files, Image, Moon, Settings, Sun, UserCircle2 } from 'lucide-react';
import { useCanvasStore, useDesignStore, useUiStore } from '../../stores';
import { copyScreensCodeToClipboard, exportScreensAsImagesZip, exportScreensAsZip, exportScreensToFigmaClipboard, getExportTargetScreens } from '../../utils/exportScreens';

export function CanvasProfileMenu() {
    const { theme, toggleTheme, pushToast, removeToast } = useUiStore();
    const { spec } = useDesignStore();
    const { doc } = useCanvasStore();
    const [openProfile, setOpenProfile] = useState(false);
    const [openExport, setOpenExport] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const { screens: exportScreens, scope } = getExportTargetScreens(spec, {
        selectedBoardId: doc.selection.selectedBoardId,
        selectedNodeIds: doc.selection.selectedNodeIds,
    });
    const selectionLabel = scope === 'selected'
        ? `${exportScreens.length} selected`
        : `${exportScreens.length} total`;

    useEffect(() => {
        if (!openProfile && !openExport) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                setOpenProfile(false);
                setOpenExport(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [openProfile, openExport]);

    const withScreens = async (loadingTitle: string, action: () => Promise<void>) => {
        if (!spec || exportScreens.length === 0) {
            pushToast({
                kind: 'error',
                title: 'No screens to export',
                message: 'Generate or select screens first.',
            });
            return;
        }
        const loadingToastId = pushToast({
            kind: 'loading',
            title: loadingTitle,
            message: `Processing ${selectionLabel}...`,
            durationMs: 0,
        });
        try {
            await action();
            setOpenExport(false);
        } catch (error) {
            pushToast({
                kind: 'error',
                title: 'Export failed',
                message: (error as Error).message || 'An unexpected error occurred.',
            });
        } finally {
            removeToast(loadingToastId);
        }
    };

    return (
        <div ref={menuRef} className="pointer-events-auto relative flex items-center gap-2">
            <div className="relative">
                <button
                    type="button"
                    onClick={() => {
                        setOpenExport((v) => !v);
                        setOpenProfile(false);
                    }}
                    className="canvas-profile-trigger"
                    title="Export options"
                >
                    <div className="canvas-profile-avatar">
                        <Download size={16} />
                    </div>
                    <div className="canvas-profile-meta">
                        <span className="canvas-profile-name">Export</span>
                        <span className="canvas-profile-role">{selectionLabel}</span>
                    </div>
                    <ChevronDown size={14} className={`transition-transform ${openExport ? 'rotate-180' : ''}`} />
                </button>

                {openExport && (
                    <div className="canvas-profile-menu">
                        <button
                            type="button"
                            className="canvas-profile-menu-item"
                            onClick={() => withScreens('Exporting ZIP', async () => {
                                const { filename } = exportScreensAsZip(exportScreens, spec?.name || 'eazyui-design');
                                pushToast({
                                    kind: 'success',
                                    title: 'ZIP exported',
                                    message: `${filename} (${selectionLabel})`,
                                });
                            })}
                        >
                            <Download size={14} />
                            <span>Export as ZIP</span>
                        </button>
                        <button
                            type="button"
                            className="canvas-profile-menu-item"
                            onClick={() => withScreens('Rendering images', async () => {
                                const { filename, pngCount, svgFallbackCount } = await exportScreensAsImagesZip(exportScreens, spec?.name || 'eazyui-design');
                                pushToast({
                                    kind: 'success',
                                    title: 'Images exported',
                                    message: svgFallbackCount > 0
                                        ? `${filename} (${pngCount} PNG, ${svgFallbackCount} SVG fallback)`
                                        : `${filename} (${selectionLabel}, PNG 2x)`,
                                });
                            })}
                        >
                            <Image size={14} />
                            <span>Export as Images</span>
                        </button>
                        <button
                            type="button"
                            className="canvas-profile-menu-item"
                            onClick={() => withScreens('Copying code', async () => {
                                await copyScreensCodeToClipboard(exportScreens);
                                pushToast({
                                    kind: 'success',
                                    title: 'Code copied',
                                    message: `Copied ${selectionLabel} to clipboard.`,
                                });
                            })}
                        >
                            <Files size={14} />
                            <span>Copy Code to Clipboard</span>
                        </button>
                        <button
                            type="button"
                            className="canvas-profile-menu-item"
                            onClick={() => withScreens('Preparing Figma export', async () => {
                                const result = await exportScreensToFigmaClipboard(exportScreens);
                                if (result.mode === 'clipboard') {
                                    pushToast({
                                        kind: 'guide',
                                        title: 'Ready for Figma',
                                        message: 'Open Figma and press Ctrl+V to paste.',
                                        durationMs: 6000,
                                    });
                                } else {
                                    pushToast({
                                        kind: 'guide',
                                        title: 'SVG downloaded',
                                        message: `${result.filename} downloaded. Import to Figma or paste if supported.`,
                                        durationMs: 7000,
                                    });
                                }
                            })}
                        >
                            <Settings size={14} />
                            <span>Export to Figma</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="relative">
                <button
                    type="button"
                    onClick={() => {
                        setOpenProfile((v) => !v);
                        setOpenExport(false);
                    }}
                    className="canvas-profile-trigger"
                    title="Profile and settings"
                >
                    <div className="canvas-profile-avatar">
                        <UserCircle2 size={16} />
                    </div>
                    <div className="canvas-profile-meta">
                        <span className="canvas-profile-name">You</span>
                        <span className="canvas-profile-role">Designer</span>
                    </div>
                    <ChevronDown size={14} className={`transition-transform ${openProfile ? 'rotate-180' : ''}`} />
                </button>

                {openProfile && (
                    <div className="canvas-profile-menu">
                        <button
                            type="button"
                            className="canvas-profile-menu-item"
                            onClick={() => {
                                toggleTheme();
                                setOpenProfile(false);
                            }}
                        >
                            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                            <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme</span>
                        </button>
                        <button
                            type="button"
                            className="canvas-profile-menu-item"
                            onClick={() => {
                                setOpenProfile(false);
                            }}
                        >
                            <Settings size={14} />
                            <span>Settings</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
