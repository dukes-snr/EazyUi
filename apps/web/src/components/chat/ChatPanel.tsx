// ============================================================================
// Chat Panel Component - Streaming Version
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { useChatStore, useDesignStore, useCanvasStore } from '../../stores';
import { apiClient } from '../../api/client';
import { v4 as uuidv4 } from 'uuid';
import {
    Plus,
    X,
    Loader2,
    ArrowUp
} from 'lucide-react';

export function ChatPanel() {
    const [prompt, setPrompt] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [isThoughtExpanded, setIsThoughtExpanded] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const { messages, isGenerating, addMessage, updateMessage, setGenerating } = useChatStore();
    const { updateScreen, addScreens, spec } = useDesignStore();
    const { setBoards, doc } = useCanvasStore();

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

        const imagesToSend = [...images];
        setImages([]);

        addMessage('user', prompt, imagesToSend);
        const assistantMsgId = addMessage('assistant', 'Thinking...');

        setPrompt('');
        setGenerating(true);

        const dimensions = { width: 375, height: 812 }; // Default mobile
        let buffer = '';
        let currentScreenId: string | null = null;
        let generatedScreenCount = 0;
        let descriptionBuffer = '';
        let isParsingDescription = false;

        try {
            await apiClient.generateStream({
                prompt,
                stylePreset: 'modern',
                platform: 'mobile',
                images: imagesToSend,
            }, (chunk) => {
                buffer += chunk;

                // 1. Handle Description
                if (isParsingDescription) {
                    if (buffer.includes('</description>')) {
                        const parts = buffer.split('</description>');
                        descriptionBuffer += parts[0];
                        isParsingDescription = false;
                        buffer = parts[1] || '';
                        updateMessage(assistantMsgId, { content: descriptionBuffer.trim() });
                    } else {
                        const currentDescriptionChunk = buffer.replace(/<[^>]*$/, '');
                        if (currentDescriptionChunk) {
                            updateMessage(assistantMsgId, { content: (descriptionBuffer + currentDescriptionChunk).trim() });
                        }
                    }
                } else if (buffer.includes('<description>')) {
                    const parts = buffer.split('<description>');
                    isParsingDescription = true;
                    buffer = parts[1] || '';
                }

                // 2. Handle Screens in a loop
                let foundMarker = true;
                while (foundMarker) {
                    foundMarker = false;

                    // Start of a screen
                    if (!currentScreenId) {
                        const startMatch = buffer.match(/<screen name="([^"]+)">/);
                        if (startMatch) {
                            const screenName = startMatch[1];
                            const screenId = uuidv4();
                            currentScreenId = screenId;
                            generatedScreenCount++;

                            addScreens([{
                                screenId,
                                name: screenName,
                                html: '',
                                width: dimensions.width,
                                height: dimensions.height,
                                status: 'streaming'
                            }]);

                            const existingBoards = useCanvasStore.getState().doc.boards;
                            const startX = existingBoards.length > 0
                                ? Math.max(...existingBoards.map(b => b.x + (b.width || 375))) + 100
                                : 100;

                            setBoards([...existingBoards, {
                                boardId: screenId,
                                screenId: screenId,
                                x: startX,
                                y: 100,
                                width: dimensions.width,
                                height: dimensions.height,
                                deviceFrame: 'none',
                                locked: false,
                                visible: true,
                            }]);

                            buffer = buffer.substring(buffer.indexOf(startMatch[0]) + startMatch[0].length);
                            foundMarker = true;
                            continue;
                        }
                    }

                    // Content / End of a screen
                    if (currentScreenId) {
                        const endTag = '</screen>';
                        const endTagIndex = buffer.indexOf(endTag);

                        if (endTagIndex !== -1) {
                            const finalContent = buffer.substring(0, endTagIndex).trim();
                            updateScreen(currentScreenId, finalContent, 'complete');
                            buffer = buffer.substring(endTagIndex + endTag.length);
                            currentScreenId = null;
                            foundMarker = true;
                            continue;
                        } else {
                            const cleanContent = buffer.replace(/<s?c?r?e?e?n?$/, '');
                            if (cleanContent.length > 0) {
                                updateScreen(currentScreenId, cleanContent.trim(), 'streaming');
                            }
                        }
                    }
                }
            });

            // Final Cleanup: Mark everything as complete
            const finalSpec = useDesignStore.getState().spec;
            if (finalSpec) {
                finalSpec.screens.forEach(s => {
                    if (s.status !== 'complete') {
                        updateScreen(s.screenId, s.html, 'complete');
                    }
                });
            }

            updateMessage(assistantMsgId, {
                content: descriptionBuffer.trim() || `Generated ${generatedScreenCount} screens customized to your request.`,
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="flex flex-col h-full w-[var(--chat-width)] bg-[#1C1C1E] text-gray-200 font-sans">
            {/* Header / Date */}
            <div className="py-4 text-center">
                <span className="text-[11px] font-medium text-gray-500">
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-6 scrollbar-hide">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-[#A1A1AA] text-center px-4 opacity-0 animate-fade-in" style={{ animationFillMode: 'forwards' }}>
                        <h2 className="text-xl font-semibold text-white mb-2">How can I help you today?</h2>
                    </div>
                )}

                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex flex-col gap-2 ${message.role === 'user' ? 'items-end' : 'items-start'
                            }`}
                    >
                        {message.role === 'user' ? (
                            <div className="flex flex-col items-end gap-2 max-w-[85%]">
                                {message.images && message.images.length > 0 && (
                                    <div className="flex flex-wrap gap-2 justify-end mb-1">
                                        {message.images.map((img, idx) => (
                                            <div key={idx} className="relative w-24 h-24 rounded-xl overflow-hidden border border-white/10 shadow-sm">
                                                <img src={img} alt="attached" className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="bg-[#2C2C2E] px-4 py-2.5 rounded-2xl text-[14px] text-gray-200 shadow-sm border border-white/5">
                                    {message.content}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full max-w-[95%]">
                                {message.status === 'pending' || message.content.includes('Thinking') ? (
                                    <div className="mb-4">
                                        <div
                                            className="flex items-center gap-2 mb-2 cursor-pointer hover:opacity-80 transition-opacity"
                                            onClick={() => setIsThoughtExpanded(!isThoughtExpanded)}
                                        >
                                            <span className="text-sm font-medium text-gray-400">Thinking...</span>
                                        </div>

                                        {isThoughtExpanded && (
                                            <div className="bg-[#2C2C2E]/50 rounded-xl p-3 border border-white/5 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-4 w-4 flex items-center justify-center">
                                                        <Loader2 size={12} className="animate-spin text-gray-400" />
                                                    </div>
                                                    <span className="text-sm text-gray-300">Generating live preview...</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-[15px] leading-relaxed text-gray-200 bg-white/5 border border-white/5 p-4 rounded-3xl shadow-sm whitespace-pre-wrap font-book">
                                        {message.content.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                                            part.startsWith('**') && part.endsWith('**')
                                                ? <strong key={i} className="font-bold text-indigo-400">{part.slice(2, -2)}</strong>
                                                : part
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Floating Input Area */}
            <div className="p-6 bg-[#1C1C1E]">
                <div className="relative bg-[#2C2C2E]/80 backdrop-blur-xl rounded-[32px] p-2.5 flex flex-col shadow-2xl border border-white/10 transition-all hover:border-white/20 focus-within:border-white/30 group">

                    {images.length > 0 && (
                        <div className="px-3 pt-2 pb-2 flex gap-2 overflow-x-auto scrollbar-hide border-b border-white/5 mb-2">
                            {images.map((img, idx) => (
                                <div key={idx} className="relative group w-14 h-14 rounded-xl overflow-hidden border border-white/10 shrink-0 shadow-lg">
                                    <img src={img} alt="upload" className="w-full h-full object-cover" />
                                    <button
                                        onClick={() => removeImage(idx)}
                                        className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={16} className="text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col px-3 relative">
                        <textarea
                            ref={textareaRef}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="How can EazyUI help you build today?"
                            disabled={isGenerating}
                            className="w-full bg-transparent text-gray-100 text-[15px] px-1 py-3 min-h-[48px] max-h-[180px] resize-none outline-none placeholder:text-gray-500/80 pr-12 leading-normal"
                            rows={1}
                        />

                        <div className="flex items-center justify-between pb-1.5 pt-1 mt-1">
                            <div className="flex items-center gap-3">
                                <button
                                    className="text-gray-400 hover:text-white transition-all bg-white/5 p-2 rounded-full hover:bg-white/10 active:scale-95 border border-white/5"
                                    title="Add Image"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Plus size={18} />
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSubmit}
                                    disabled={(!prompt.trim() && images.length === 0) || isGenerating}
                                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-90 ${(!prompt.trim() && images.length === 0) || isGenerating
                                        ? 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'
                                        : 'bg-white text-black hover:scale-105 hover:shadow-white/5 active:bg-gray-200'
                                        }`}
                                >
                                    {isGenerating ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <ArrowUp size={20} strokeWidth={2.5} />
                                    )}
                                </button>
                            </div>
                        </div>
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
    );
}
