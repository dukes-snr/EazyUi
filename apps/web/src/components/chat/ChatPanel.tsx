// ============================================================================
// Chat Panel Component - Streaming Version
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { useChatStore, useDesignStore, useCanvasStore } from '../../stores';
import { apiClient } from '../../api/client';
import { v4 as uuidv4 } from 'uuid';
import { ArrowUp, Plus, Monitor, Smartphone, Tablet, X, Loader2, ChevronLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import TextType from '../ui/TextType';

const FEEDBACK_BUCKETS = {
    early: [
        'Warming up the studio...',
        'Sharpening pencils...',
        'Rolling out the canvas...',
        'Mixing the color palette...',
        'Tuning the grid...',
    ],
    working: [
        'Blocking the layout...',
        'Carving the hierarchy...',
        'Composing the hero...',
        'Dialing in typography...',
        'Staging the cards...',
        'Polishing interactions...',
        'Balancing the spacing...',
    ],
    late: [
        'Adding finishing touches...',
        'Refining the micro-details...',
        'Final pass on contrast...',
        'Tightening the alignment...',
        'Sealing the polish...',
    ],
    wrap: [
        'Packaging the screens...',
        'Putting on the final coat...',
        'Framing the presentation...',
        'Wrapping it up...',
    ],
};

export function ChatPanel() {
    const [prompt, setPrompt] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [stylePreset, setStylePreset] = useState<'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful'>('modern');
    const [showStyleMenu, setShowStyleMenu] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const styleMenuRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const { messages, isGenerating, addMessage, updateMessage, setGenerating } = useChatStore();
    const { updateScreen, spec, selectedPlatform, setPlatform, addScreens, removeScreen } = useDesignStore();
    const { setBoards, doc, setFocusNodeId, removeBoard } = useCanvasStore();
    const assistantMsgIdRef = useRef<string>('');

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [prompt]);

    // Close style menu on outside click or Escape
    useEffect(() => {
        if (!showStyleMenu) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!styleMenuRef.current) return;
            if (!styleMenuRef.current.contains(event.target as Node)) {
                setShowStyleMenu(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowStyleMenu(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [showStyleMenu]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                setImages(prev => [...prev, base64]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerate = async () => {
        if (!prompt.trim() || isGenerating) return;

        const requestPrompt = prompt.trim();
        const imagesToSend = [...images];
        setImages([]);

        addMessage('user', prompt, imagesToSend);
        const assistantMsgId = addMessage('assistant', 'Warming up the studio...');
        assistantMsgIdRef.current = assistantMsgId;

        setPrompt('');
        setGenerating(true);

        const dimensions = selectedPlatform === 'desktop'
            ? { width: 1280, height: 800 }
            : selectedPlatform === 'tablet'
                ? { width: 768, height: 1024 }
                : { width: 375, height: 812 }; // Default mobile

            const placeholderTimers: number[] = [];

        try {
            console.info('[UI] generate: start (json)', {
                prompt: requestPrompt,
                stylePreset,
                platform: selectedPlatform,
                images: imagesToSend,
            });

            const placeholderIds: string[] = [];
            const existingBoards = useCanvasStore.getState().doc.boards;
            const startX = existingBoards.length > 0
                ? Math.max(...existingBoards.map(b => b.x + (b.width || 375))) + 100
                : 100;
            const startTime = Date.now();


            const initFeedback = () => {
                updateMessage(assistantMsgId, {
                    content: FEEDBACK_BUCKETS.early[0],
                    status: 'streaming',
                    meta: {
                        feedbackKey: Date.now(),
                        feedbackPhase: 'early',
                        feedbackStart: startTime
                    } as any
                });
            };
            const schedulePlaceholder = (index: number) => {
                const screenId = uuidv4();
                placeholderIds[index] = screenId;
                const screen = {
                    screenId,
                    name: `Generating ${index + 1}`,
                    html: '',
                    width: dimensions.width,
                    height: dimensions.height,
                    status: 'streaming' as const,
                };
                addScreens([screen]);

                const board = {
                    boardId: screenId,
                    screenId,
                    x: startX + index * (dimensions.width + 100),
                    y: 100,
                    width: screen.width,
                    height: screen.height,
                    deviceFrame: 'none' as const,
                    locked: false,
                    visible: true,
                };
                const currentBoards = useCanvasStore.getState().doc.boards;
                setBoards([...currentBoards, board]);
            };

            // Delay placeholders: first after 5s, then every 7s
            for (let i = 0; i < 4; i++) {
                const timer = window.setTimeout(() => schedulePlaceholder(i), 5000 + i * 7000);
                placeholderTimers.push(timer);
            }

            initFeedback();

            const controller = new AbortController();
            abortRef.current = controller;
            const regen = await apiClient.generate({
                prompt: requestPrompt,
                stylePreset,
                platform: selectedPlatform,
                images: imagesToSend,
            }, controller.signal);

            regen.designSpec.screens.forEach((screen, index) => {
                const targetId = placeholderIds[index];
                if (targetId) {
                    updateScreen(targetId, screen.html, 'complete', screen.width, screen.height, screen.name);
                    return;
                }

                // If placeholder not created yet, create a real screen immediately
                const screenId = uuidv4();
                addScreens([{
                    screenId,
                    name: screen.name,
                    html: screen.html,
                    width: screen.width,
                    height: screen.height,
                    status: 'complete'
                }]);

                const board = {
                    boardId: screenId,
                    screenId,
                    x: startX + index * (dimensions.width + 100),
                    y: 100,
                    width: screen.width,
                    height: screen.height,
                    deviceFrame: 'none' as const,
                    locked: false,
                    visible: true,
                };
                const currentBoards = useCanvasStore.getState().doc.boards;
                setBoards([...currentBoards, board]);
            });

            // Clear any pending placeholder timers
            placeholderTimers.forEach(t => window.clearTimeout(t));

            // If fewer than 4 screens returned, mark remaining placeholders (if created) as complete with a note
            for (let i = regen.designSpec.screens.length; i < 4; i++) {
                const targetId = placeholderIds[i];
                if (!targetId) continue;
                updateScreen(
                    targetId,
                    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head><body class="min-h-screen flex items-center justify-center bg-black text-white"><div class="text-center space-y-2"><div class="text-sm uppercase tracking-widest opacity-60">Generation</div><div class="text-lg font-semibold">Screen not returned</div></div></body></html>`,
                    'complete',
                    dimensions.width,
                    dimensions.height,
                    `Missing Screen ${i + 1}`
                );
            }

            updateMessage(assistantMsgId, {
                content: regen.designSpec.description || `Generated ${regen.designSpec.screens.length} screens customized to your request.`,
                status: 'complete',
            });
            console.info('[UI] generate: complete (json)', { screens: regen.designSpec.screens.length });
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                updateMessage(assistantMsgId, {
                    content: 'Generation stopped.',
                    status: 'error',
                });
                return;
            }
            updateMessage(assistantMsgId, {
                content: `Error: ${(error as Error).message}`,
                status: 'error',
            });
            console.error('[UI] generate: error', error);
        } finally {
            abortRef.current = null;
            placeholderTimers.forEach(t => window.clearTimeout(t));
            setGenerating(false);
        }
    };

const handleEdit = async () => {
        if (!prompt.trim() || isGenerating || !spec) return;

        const selectedId = doc.selection.selectedBoardId;
        const targetScreen = spec.screens.find(s => s.screenId === selectedId);

        if (!targetScreen) return;

        addMessage('user', prompt);
        const assistantMsgId = addMessage('assistant', `Updating...`);

        const currentPrompt = prompt;
        setPrompt('');
        setGenerating(true);

        try {
            const response = await apiClient.edit({
                instruction: currentPrompt,
                html: targetScreen.html,
                screenId: targetScreen.screenId,
            });

            updateScreen(targetScreen.screenId, response.html);

            updateMessage(assistantMsgId, {
                content: `Updated ${targetScreen.name} based on your feedback.`,
                status: 'complete',
            });
        } catch (error) {
            updateMessage(assistantMsgId, {
                content: `Error: ${(error as Error).message}`,
                status: 'error',
            });
        } finally {
            setGenerating(false);
        }
    };

    const handleSubmit = () => {
        if (doc.selection.selectedBoardId) {
            handleEdit();
        } else {
            handleGenerate();
        }
    };

    const handleStop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setGenerating(false);

        const currentSpec = useDesignStore.getState().spec;
        const currentBoards = useCanvasStore.getState().doc.boards;

        if (currentSpec) {
            const incompleteIds = currentSpec.screens
                .filter(s => s.status === 'streaming')
                .map(s => s.screenId);

            incompleteIds.forEach(id => {
                updateScreen(id, '', 'complete');
                removeScreen(id);
                removeBoard(id);
            });

            if (incompleteIds.length > 0) {
                const filteredBoards = currentBoards.filter(b => !incompleteIds.includes(b.screenId));
                setBoards(filteredBoards);
            }
        }

        updateMessage(assistantMsgIdRef.current, {
            content: 'Generation cancelled.',
            status: 'error',
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <>
            <div
                className={`flex flex-col h-full bg-[#1C1C1E] text-gray-200 font-sans border-r border-[#2C2C2E] transition-all duration-300 ease-in-out relative ${isCollapsed ? 'w-0 border-r-0' : 'w-[var(--chat-width)]'
                    }`}
            >
                {/* Collapse Button Header */}
                <div className="absolute top-4 -right-12 z-20">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={`p-2 rounded-lg bg-[#2C2C2E] text-gray-400 hover:text-white border border-white/5 shadow-xl transition-all ${isCollapsed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    >
                        {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                    </button>
                </div>

                <div className={`flex flex-col h-full w-[var(--chat-width)] overflow-hidden transition-opacity duration-200 ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    {/* Header / Date */}
                    <div className="py-4 px-6 flex items-center justify-between border-b border-white/5 bg-[#1C1C1E]/50 backdrop-blur-sm sticky top-0 z-10">
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>

                        <button
                            onClick={() => setIsCollapsed(true)}
                            className="p-1.5 rounded-md hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors"
                            title="Collapse Sidebar"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-8 scrollbar-hide">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-[#A1A1AA] text-center px-4 opacity-0 animate-fade-in space-y-4" style={{ animationFillMode: 'forwards' }}>
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-2 ring-1 ring-white/10">
                                    <ArrowUp size={24} className="text-indigo-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-medium text-white mb-1">What are we building?</h2>
                                    <p className="text-sm text-gray-500">Describe your app idea to generate screens.</p>
                                </div>
                            </div>
                        )}

                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex flex-col gap-2 ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                            >
                                {/* Screen Reference Visual */}
                                {message.screenRef && (
                                    <button
                                        onClick={() => setFocusNodeId(message.screenRef!.id)}
                                        className={`flex items-center gap-2 mb-1 px-3 py-1.5 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm transition-all hover:bg-white/[0.08] hover:border-white/10 active:scale-95 group ${message.role === 'user' ? 'mr-1' : 'ml-1'}`}
                                        title={`Focus ${message.screenRef.label} on canvas`}
                                    >
                                        <div className={`p-1.5 rounded-lg bg-[#2C2C2E] ring-1 ring-white/10 text-indigo-400 shadow-sm flex items-center justify-center group-hover:bg-indigo-500/10 transition-colors`}>
                                            {message.screenRef.type === 'desktop' && <Monitor size={14} />}
                                            {message.screenRef.type === 'tablet' && <Tablet size={14} />}
                                            {message.screenRef.type === 'mobile' && <Smartphone size={14} />}
                                        </div>
                                        <div className="flex flex-col text-left">
                                            <span className="text-[9px] text-gray-500 font-black uppercase tracking-[0.15em] leading-none mb-0.5">Edit Target</span>
                                            <span className="text-[12px] text-gray-300 font-semibold leading-tight group-hover:text-white transition-colors">{message.screenRef.label}</span>
                                        </div>
                                    </button>
                                )}

                                {message.role === 'user' ? (
                                    <div className="flex flex-col items-end gap-2 max-w-[90%]">
                                        {message.images && message.images.length > 0 && (
                                            <div className="flex flex-wrap gap-2 justify-end mb-1">
                                                {message.images.map((img, idx) => (
                                                    <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 shadow-sm group">
                                                        <img src={img} alt="attached" className="w-full h-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="bg-[#2C2C2E] px-5 py-3 rounded-[24px] rounded-tr-sm text-[15px] text-gray-100 shadow-sm ring-1 ring-white/5">
                                            {message.content}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full max-w-[95%] space-y-2">
                                        {/* Thinking Accordion */}
                                        {message.status === 'pending' ? (
                                            <div className="animate-pulse flex items-center gap-3 px-4 py-3 bg-[#2C2C2E]/30 rounded-2xl border border-white/5 w-fit">
                                                <Loader2 size={16} className="animate-spin text-indigo-400" />
                                                <span className="text-sm text-gray-400 font-medium">Generating designs...</span>
                                            </div>
                                        ) : (
                                            <div className="text-[15px] leading-relaxed text-gray-300 bg-transparent px-2 whitespace-pre-wrap font-book transition-opacity duration-700 ease-in-out">
                                                {message.status === 'streaming' ? (
                                                    <TextType
                                                        key={`${message.id}-${String(message.meta?.feedbackKey ?? message.content)}`}
                                                        text={
                                                            message.meta?.feedbackPhase === 'working'
                                                                ? FEEDBACK_BUCKETS.working
                                                                : message.meta?.feedbackPhase === 'late'
                                                                    ? FEEDBACK_BUCKETS.late
                                                                    : message.meta?.feedbackPhase === 'wrap'
                                                                        ? FEEDBACK_BUCKETS.wrap
                                                                        : FEEDBACK_BUCKETS.early
                                                        }
                                                        className="text-[15px] font-medium text-gray-300"
                                                        typingSpeed={75}
                                                        deletingSpeed={50}
                                                        pauseDuration={1500}
                                                        showCursor
                                                        cursorCharacter="_"
                                                        cursorBlinkDuration={0.5}
                                                        variableSpeed={undefined}
                                                        loop
                                                        onSentenceComplete={() => {
                                                            const start = (message.meta?.feedbackStart as number) || Date.now();
                                                            const elapsed = Date.now() - start;
                                                            let phase: keyof typeof FEEDBACK_BUCKETS = 'early';
                                                            if (elapsed >= 10000 && elapsed < 20000) phase = 'working';
                                                            if (elapsed >= 20000 && elapsed < 30000) phase = 'late';
                                                            if (elapsed >= 30000) phase = 'wrap';
                                                            if (phase !== message.meta?.feedbackPhase) {
                                                                updateMessage(message.id, {
                                                                    meta: {
                                                                        ...message.meta,
                                                                        feedbackPhase: phase,
                                                                        feedbackKey: Date.now()
                                                                    }
                                                                });
                                                            }
                                                        }}
                                                    />
                                                ) : (
                                                    message.content.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                                                        part.startsWith('**') && part.endsWith('**')
                                                            ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
                                                            : part
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Chat Input Container */}
                    <div className="mx-4 mb-6 relative bg-[#2C2C2E] rounded-[20px] p-3 shadow-2xl transition-all flex flex-col gap-2">

                        {/* Text Area & Images */}
                        <div className="flex-1 min-w-0">
                            {images.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-2 px-1 pb-2 border-b border-white/5">
                                    {images.map((img, idx) => (
                                        <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-white/10 shrink-0">
                                            <img src={img} alt="upload" className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => removeImage(idx)}
                                                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={14} className="text-white" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <textarea
                                name=""
                                id=""
                                ref={textareaRef}
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Describe your UI idea..."
                                disabled={isGenerating}
                                className="w-full bg-transparent text-gray-100 text-[16px] min-h-[48px] max-h-[200px] resize-none outline-none placeholder:text-gray-500 px-2 py-1 leading-relaxed"
                            />
                        </div>

                        {/* Bottom Controls Row */}
                        <div className="flex items-center justify-between pt-1">

                            {/* Left: Attach & Platform */}
                            <div className="flex items-center gap-2">
                                {/* Attach Button */}
                                <button
                                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all ring-1 ring-white/5"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Add Image"
                                >
                                    <Plus size={18} />
                                </button>

                                {/* Platform Selector (Pill) */}
                                <div className="flex items-center bg-white/5 rounded-full p-1 ring-1 ring-white/5">
                                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setPlatform(p)}
                                            className={`p-1.5 rounded-full transition-all ${selectedPlatform === p
                                                ? 'bg-gray-600 text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                                }`}
                                            title={`Generate for ${p}`}
                                        >
                                            {p === 'mobile' && <Smartphone size={14} />}
                                            {p === 'tablet' && <Tablet size={14} />}
                                            {p === 'desktop' && <Monitor size={14} />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Send Button */}
                            <div className="flex items-center gap-3">
                                <div ref={styleMenuRef} className="relative hidden sm:flex items-center">
                                    <button
                                        onClick={() => setShowStyleMenu(v => !v)}
                                        className="h-9 px-3 rounded-full bg-white/5 text-gray-300 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-white/5 hover:bg-white/10 transition-all"
                                        title="Select style preset"
                                    >
                                        Style: {stylePreset}
                                    </button>
                                    {showStyleMenu && (
                                        <div className="absolute bottom-12 right-0 w-40 bg-[#1C1C1E] border border-white/10 rounded-xl shadow-2xl p-2 z-50">
                                            {(['modern', 'minimal', 'vibrant', 'luxury', 'playful'] as const).map((preset) => (
                                                <button
                                                    key={preset}
                                                    onClick={() => {
                                                        setStylePreset(preset);
                                                        setShowStyleMenu(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${stylePreset === preset
                                                        ? 'bg-indigo-500/20 text-indigo-200'
                                                        : 'text-gray-300 hover:bg-white/5'
                                                        }`}
                                                >
                                                    {preset}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={isGenerating ? handleStop : handleSubmit}
                                    disabled={(!prompt.trim() && images.length === 0) && !isGenerating}
                                    className={`w-9 h-9 rounded-[12px] flex items-center justify-center transition-all ${isGenerating
                                        ? 'bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/20'
                                        : (!prompt.trim() && images.length === 0)
                                            ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                                            : 'bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-500/20'
                                        }`}
                                >
                                    {isGenerating ? (
                                        <span className="text-xs font-bold">STOP</span>
                                    ) : (
                                        <ArrowUp size={20} className="text-white" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        accept="image/*"
                        multiple
                    />
                </div>
            </div>
        </>
    );
}
