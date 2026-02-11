import { Handle, Position, NodeProps, NodeToolbar } from '@xyflow/react';
import { memo, useState, useEffect, useCallback } from 'react';
import { useDesignStore, useChatStore, useCanvasStore } from '../../stores';
import { apiClient } from '../../api/client';
import Grainient from '../ui/Grainient';
import { DeviceToolbar } from './DeviceToolbar';
import '../../styles/DeviceFrames.css';

// Custom Node for displaying the HTML screen with responsive frames
export const DeviceNode = memo(({ data, selected }: NodeProps) => {
    const { updateScreen, removeScreen } = useDesignStore();
    const { messages, addMessage, updateMessage } = useChatStore();
    const { removeBoard, doc } = useCanvasStore();
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
                const instruction = payload as string;
                let assistantMsgId = '';

                const screenRef = {
                    id: data.screenId as string,
                    label: data.label as string || 'screen',
                    type: isDesktop ? 'desktop' : isTablet ? 'tablet' : 'mobile'
                } as const;

                try {
                    // Add to chat history
                    addMessage('user', instruction, undefined, screenRef);
                    assistantMsgId = addMessage('assistant', `Applying edits to **${data.label || 'screen'}**...`, undefined, screenRef);

                    // Start loading state
                    updateScreen(data.screenId as string, data.html as string, 'streaming');

                    const response = await apiClient.edit({
                        instruction,
                        html: data.html as string,
                        screenId: data.screenId as string
                    });

                    // Update with new content
                    updateScreen(data.screenId as string, response.html, 'complete');

                    // Update chat message
                    updateMessage(assistantMsgId, {
                        content: `Updated **${data.label || 'screen'}** based on your instruction: "${instruction}"`,
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
                    alert('Failed to edit screen. Please try again.');
                }
                break;
            case 'delete':
                if (confirm('Are you sure you want to delete this screen?')) {
                    removeScreen(data.screenId as string);
                    removeBoard(data.screenId as string);
                }
                break;
            case 'regenerate':
                // Find the last user instruction for this specific screen
                const lastUserMsg = [...messages]
                    .reverse()
                    .find(m => m.role === 'user' && m.screenRef?.id === data.screenId);

                if (lastUserMsg) {
                    handleAction('submit-edit', lastUserMsg.content);
                } else {
                    // Fallback: Use the last user message but explain it's for this specific screen
                    const globalLastMsg = [...messages]
                        .reverse()
                        .find(m => m.role === 'user');

                    if (globalLastMsg) {
                        const screenName = data.label || 'this screen';
                        handleAction('submit-edit', `Regenerate the ${screenName} based on the original task: "${globalLastMsg.content}"`);
                    } else {
                        handleAction('submit-edit', 'Regenerate this screen with improved design');
                    }
                }
                break;
            case 'save':
                console.log('Save action');
                break;
        }
    }, [data.screenId, data.html, updateScreen, addMessage, updateMessage, data.label]);
    const isStreaming = data.status === 'streaming';

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
    const injectedHtml = isDesktop
        ? `${data.html}
           <script>
             const reportHeight = () => {
               const height = document.documentElement.scrollHeight || document.body.scrollHeight;
               window.parent.postMessage({ type: 'resize', height, screenId: '${data.screenId}' }, '*');
             };
             window.onload = reportHeight;
             const resizeObserver = new ResizeObserver(reportHeight);
             resizeObserver.observe(document.body);
           </script>`
        : data.html;

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
        <div className={`device-node-container relative transition-all duration-300 group`}>
            <NodeToolbar
                isVisible={selected && selectedCount === 1}
                position={Position.Top}
                offset={20}
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
                            className="absolute top-0 left-0 w-full h-10 bg-[#1e293b] flex items-center px-4 gap-2 border-b border-slate-700/50 z-10"
                            style={{ borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}
                        >
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                            </div>
                            <div className="flex-1 mx-4 h-6 bg-slate-800/50 rounded flex items-center justify-center text-[9px] text-slate-500 font-medium">
                                {data.screenId ? `eazyui.dev/preview/${data.screenId}` : 'localhost:3000'}
                            </div>
                        </div>
                    )}

                    <div style={{ position: 'absolute', top: isDesktop && showBrowserHeader ? 40 : 0, left: 0, right: 0, bottom: 0 }}>
                        <iframe
                            srcDoc={injectedHtml + '<style>::-webkit-scrollbar { display: none; } body { -ms-overflow-style: none; scrollbar-width: none; background: #000; color: #fff; }</style>'}
                            title="Preview"
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                pointerEvents: 'none',
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
                            backgroundColor: '#0f172a',
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
            <div className={`absolute -top-8 left-0 text-xs font-medium transition-colors duration-200 ${selected ? 'text-indigo-400' : 'text-indigo-200'}`}>
                {data.label as string}
                <span className="ml-2 opacity-50 text-[10px] uppercase tracking-wider">
                    {isDesktop ? 'Desktop' : isTablet ? 'Tablet' : 'Mobile'}
                </span>
            </div>
        </div>
    );
});
