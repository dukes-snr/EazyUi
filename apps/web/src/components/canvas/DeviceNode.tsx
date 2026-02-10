import { Handle, Position, NodeProps } from '@xyflow/react';
import { memo } from 'react';
import Grainient from '../ui/Grainient';

// Custom Node for displaying the HTML screen
export const DeviceNode = memo(({ data, selected }: NodeProps) => {
    const width = (data.width as number) || 375;
    const height = (data.height as number) || 812;
    const isStreaming = data.status === 'streaming';

    return (
        <div
            className={`device-frame relative transition-all duration-300`}
            style={{
                width: width + 16, // Width + border
                height: height + 16, // Height + border
                borderRadius: 40,
                border: selected ? '8px solid #6366F1' : '8px solid #1e293b', // Active: Primary Color, Inactive: Slate 800
                background: '#0f172a', // Slate 900
                // overflow: 'hidden', // REMOVED to allow label outside
                // Removed shadow/glow as requested
                boxShadow: 'none',
            }}
        >
            {/* iOS Dynamic Island / Notch */}
            {/* <div
                className="absolute top-0 left-1/2 -translate-x-1/2 bg-black z-20"
                style={{
                    width: 120,
                    height: 28,
                    borderBottomLeftRadius: 18,
                    borderBottomRightRadius: 18,
                }}
            ></div> */}

            {/* Screen Content */}
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 32,
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <iframe
                    srcDoc={data.html + '<style>::-webkit-scrollbar { display: none; } body { -ms-overflow-style: none; scrollbar-width: none; }</style>'}
                    title="Preview"
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        pointerEvents: 'none', // Disable interactions, only dragging allowed
                        opacity: isStreaming ? 0 : 1,
                        transition: 'opacity 0.5s ease-in-out',
                    }}
                    sandbox="allow-scripts allow-same-origin"
                />

                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 30,
                        backgroundColor: '#0f172a',
                        opacity: isStreaming ? 1 : 0,
                        pointerEvents: isStreaming ? 'auto' : 'none',
                        transition: 'opacity 0.7s ease-in-out',
                        borderRadius: 32,
                        overflow: 'hidden'
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

                {/* iOS Home Bar */}
                <div
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/20 z-20 pointer-events-none"
                    style={{
                        width: 120,
                        height: 5,
                        borderRadius: 10,
                    }}
                ></div>
            </div>

            {/* Hidden Handles for React Flow functionality (dragging/connecting disabled visually) */}
            {/* <Handle type="source" position={Position.Right} className="opacity-0 pointer-events-none" />
            <Handle type="target" position={Position.Left} className="opacity-0 pointer-events-none" /> */}

            {/* Label top-left above */}
            <div className={`absolute -top-12 left-0 text-left pl-1 text-sm font-medium transition-colors duration-200 ${selected ? 'text-indigo-400' : 'text-slate-500'}`}>
                {data.label as string}
            </div>
        </div>
    );
});
