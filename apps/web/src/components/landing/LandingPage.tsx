import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowUp, Mic, Monitor, Paperclip, Smartphone, Sparkles, Square, Tablet, X, Zap } from 'lucide-react';
import heroBg2 from '../../assets/hero-bg2.jpg';
import { apiClient } from '../../api/client';
import type { DesignModelProfile } from '../../constants/designModels';
import TextType from '../ui/TextType';

type LandingPageProps = {
    onStart: (payload: {
        prompt: string;
        images: string[];
        platform: 'mobile' | 'tablet' | 'desktop';
        stylePreset: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
        modelProfile: DesignModelProfile;
    }) => void;
};

// const TRUSTED_BRANDS = ['Startups', 'Product Teams', 'Agencies', 'Founders', 'Designers', 'Developers', 'Studios'];

const APP_SUGGESTIONS = [
    'Design a fintech mobile app with cards, budgets, and transfer flow',
    'Create a SaaS analytics dashboard with KPI cards and trend charts',
    'Build an e-commerce app with product discovery and smart filters',
    'Generate a healthcare booking app with doctor profiles and schedule',
];
const TYPED_PLACEHOLDER_SUGGESTIONS = [
    'Design a modern fintech dashboard with spending analytics, cards, and transfers...',
    'Build a SaaS admin panel with analytics, billing, and team permissions...',
    'Create an ecommerce home screen with search, categories, and recommendations...',
    'Generate a travel planner app with itinerary, maps, and booking cards...',
];
const PATTERN_TABS = ['Screens', 'UI Elements', 'Flows'] as const;
type PatternTab = (typeof PATTERN_TABS)[number];

type PatternCard = {
    title: string;
    prompt: string;
    accent: string;
    image?: string;
};

const MOBBIN_SCREEN_IMAGES = [
    'https://i.postimg.cc/5Nk5nbfm/Ui-(1).jpg',
    'https://i.postimg.cc/jdk6ZtR8/Ui-(2).jpg',
    'https://i.postimg.cc/NfP8pBQr/Ui-(3).jpg',
    'https://i.postimg.cc/5Nk5nbfC/Ui-(4).jpg',
    'https://i.postimg.cc/bNF03pqn/Ui-(5).jpg',
    'https://i.postimg.cc/kXhNfq7K/Ui-(6).jpg',
] as const;

const PATTERN_LIBRARY: Record<PatternTab, PatternCard[]> = {
    Screens: [
        {
            title: 'Account Setup',
            prompt: 'Design an account setup mobile screen with progressive questions and avatar choices.',
            accent: 'from-sky-500/45 to-indigo-500/25',
            image: MOBBIN_SCREEN_IMAGES[0],
        },
        {
            title: 'Streaming Home',
            prompt: 'Create a streaming app home screen with featured hero, category tabs, and media cards.',
            accent: 'from-fuchsia-500/40 to-slate-500/20',
            image: MOBBIN_SCREEN_IMAGES[1],
        },
        {
            title: 'Subscription Paywall',
            prompt: 'Generate a paywall screen with annual/monthly options and strong CTA hierarchy.',
            accent: 'from-amber-500/45 to-orange-500/25',
            image: MOBBIN_SCREEN_IMAGES[2],
        },
        {
            title: 'Login',
            prompt: 'Build a login/auth screen with social options, secure inputs, and create-account path.',
            accent: 'from-violet-500/45 to-cyan-500/20',
            image: MOBBIN_SCREEN_IMAGES[3],
        },
        { 
            title: 'Settings',
            prompt: 'Design a settings dashboard with grouped controls, toggles, and profile summary.', 
            accent: 'from-slate-600/50 to-zinc-500/20', 
            image: MOBBIN_SCREEN_IMAGES[4] 
        },
        { 
            title: 'Checkout',
            prompt: 'Create a checkout screen with address, delivery options, and sticky payment CTA.', 
            accent: 'from-zinc-400/35 to-slate-500/20', 
            image: MOBBIN_SCREEN_IMAGES[5] 
        },
        { 
            title: 'Collections',
            prompt: 'Generate a product collection screen with cards, wishlist actions, and filters.', 
            accent: 'from-emerald-500/35 to-cyan-500/20', 
            image: MOBBIN_SCREEN_IMAGES[0] 
        },
    ],
    'UI Elements': [
        { 
            title: 'Floating CTA Bar', 
            prompt: 'Add a floating CTA bar with subtle blur, icon, and primary action.', 
            accent: 'from-sky-500/45 to-cyan-500/25' 
        },
        { 
            title: 'Card Grid Module', 
            prompt: 'Design a responsive card grid module with mixed card sizes and badges.', 
            accent: 'from-indigo-500/40 to-violet-500/25' 
        },
        { 
            title: 'Pricing Toggle', 
            prompt: 'Create a pricing toggle component with monthly/yearly states and savings label.', 
            accent: 'from-amber-500/45 to-orange-500/25' 
        },
        { 
            title: 'Segmented Filter', 
            prompt: 'Build a segmented filter control with clear active/hover states.', 
            accent: 'from-emerald-500/40 to-teal-500/25' 
        },
    ],
    Flows: [
        { 
            title: 'Onboarding Flow', 
            prompt: 'Create a 3-step onboarding flow with progress indicator and optional skip.', 
            accent: 'from-sky-500/45 to-blue-500/25' 
        },
        { 
            title: 'Signup to First Task', 
            prompt: 'Design a signup to first-task completion flow for a SaaS product.', 
            accent: 'from-violet-500/45 to-indigo-500/25' 
        },
        { 
            title: 'Browse to Checkout', 
            prompt: 'Generate an e-commerce browse-to-checkout conversion flow.', 
            accent: 'from-amber-500/45 to-rose-500/25' 
        },
        { 
            title: 'Profile Completion', 
            prompt: 'Create a profile completion flow with progressive disclosure and reminders.', 
            accent: 'from-teal-500/40 to-cyan-500/25' 
        },
    ],
};
const CHIP_LABEL_MAX = 34;

function toChipLabel(text: string): string {
    const clean = text.trim();
    if (clean.length <= CHIP_LABEL_MAX) return clean;
    return `${clean.slice(0, CHIP_LABEL_MAX - 1).trimEnd()}…`;
}

export function LandingPage({ onStart }: LandingPageProps) {
    const [prompt, setPrompt] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [platform, setPlatform] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
    const [stylePreset, setStylePreset] = useState<'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful'>('modern');
    const [modelProfile, setModelProfile] = useState<DesignModelProfile>('quality');
    const [showStyleMenu, setShowStyleMenu] = useState(false);
    const [activePatternTab, setActivePatternTab] = useState<PatternTab>('Screens');
    const [isPromptFocused, setIsPromptFocused] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const styleMenuRef = useRef<HTMLDivElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const submit = () => {
        const next = prompt.trim();
        if (!next) return;
        onStart({ prompt: next, images, platform, stylePreset, modelProfile });
    };

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        Array.from(files).forEach((file) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = typeof reader.result === 'string' ? reader.result : '';
                if (!base64) return;
                setImages((prev) => [...prev, base64]);
            };
            reader.readAsDataURL(file);
        });

        e.target.value = '';
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                const base64 = result.split(',')[1] || '';
                if (!base64) {
                    reject(new Error('Failed to encode audio'));
                    return;
                }
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Failed to read audio blob'));
            reader.readAsDataURL(blob);
        });
    };

    const cleanupRecording = () => {
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setIsRecording(false);
    };

    const handleMicToggle = async () => {
        if (isTranscribing) return;

        if (isRecording) {
            mediaRecorderRef.current?.stop();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
            const mimeType = preferred.find((type) => MediaRecorder.isTypeSupported(type));
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            recorder.onstop = async () => {
                try {
                    setIsTranscribing(true);
                    const type = recorder.mimeType || 'audio/webm';
                    const audioBlob = new Blob(audioChunksRef.current, { type });
                    const audioBase64 = await blobToBase64(audioBlob);
                    const result = await apiClient.transcribeAudio({
                        audioBase64,
                        mimeType: audioBlob.type || 'audio/webm',
                    });
                    if (result.text.trim()) {
                        setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${result.text.trim()}` : result.text.trim()));
                    }
                } catch (error) {
                    console.error('Voice transcription failed:', error);
                } finally {
                    setIsTranscribing(false);
                    cleanupRecording();
                }
            };

            recorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error('Microphone access failed:', error);
            cleanupRecording();
        }
    };

    useEffect(() => {
        return () => {
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    useEffect(() => {
        if (!showStyleMenu) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!styleMenuRef.current) return;
            if (!styleMenuRef.current.contains(event.target as Node)) {
                setShowStyleMenu(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowStyleMenu(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [showStyleMenu]);

    const patternCards = useMemo(() => PATTERN_LIBRARY[activePatternTab], [activePatternTab]);
    const marqueeCards = useMemo(() => [...patternCards, ...patternCards], [patternCards]);

    return (
        <div className="h-screen w-screen overflow-y-auto bg-[#06070B] text-white relative">
            <div className="pointer-events-none absolute inset-0">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `url(${heroBg2})`,
                        backgroundPosition: 'center top',
                        backgroundSize: 'cover',
                        backgroundRepeat: 'no-repeat',
                    }}
                />
                <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_26%,rgba(22,35,70,0.08),rgba(6,7,11,0.45)_48%,rgba(6,7,11,0.95)_84%)]" />
                {/* <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,7,11,0.5),rgba(6,7,11,0.78)_58%,rgba(6,7,11,0.95))]" /> */}
            </div>

            <header className="relative z-10 h-14 border-b border-white/5">
                <div className="mx-auto h-full max-w-[1160px] px-6 flex items-center justify-between">
                    <div className="h-5 w-5 rounded-full bg-white/10 text-[10px] flex items-center justify-center text-white/80">A</div>
                    <div className="hidden lg:flex items-center gap-7 text-[11px] uppercase tracking-[0.08em] text-gray-400">
                        <span>Create</span>
                        <span>Templates</span>
                        <span>Components</span>
                        <span>Assets</span>
                        <span>Skills</span>
                        <span>Learn</span>
                        <span>Pricing</span>
                        <span>Changelog</span>
                    </div>
                    <button className="text-[11px] uppercase tracking-[0.08em] text-gray-300 hover:text-white transition-colors">Sign in</button>
                </div>
            </header>

            <main className="relative z-10 px-4 md:px-[12%] lg:px-[20%] pt-8 md:pt-12 pb-16">
                <section className="mx-auto max-w-[980px] text-center min-h-[55vh] flex flex-col items-center justify-center">
                    <h1 className="text-[42px] md:text-[58px] leading-[1.05] font-semibold tracking-[-0.02em]">
                        Design better UI with <span className="text-blue-300 italic">EazyUI</span>
                    </h1>
                    <p className="mt-2 text-[20px] md:text-[30px] text-gray-300">Generate production-ready app screens and landing pages from a single prompt.</p>

                    <div className="mx-auto mt-7 w-full max-w-[780px] rounded-[22px] border border-[#5a6172] bg-[#2C313D] shadow-[0_10px_30px_rgba(0,0,0,0.28)] p-3 md:p-4 text-left">
                        <div className="relative">
                            {!prompt.trim() && !isPromptFocused && (
                                <div className="pointer-events-none absolute left-2 top-1 right-2 text-[16px] text-gray-400 text-left">
                                    <TextType
                                        text={TYPED_PLACEHOLDER_SUGGESTIONS}
                                        className="text-[16px] text-gray-400 text-left"
                                        typingSpeed={62}
                                        deletingSpeed={38}
                                        pauseDuration={2200}
                                        showCursor
                                        cursorCharacter="_"
                                        cursorClassName="text-gray-500"
                                        loop
                                    />
                                </div>
                            )}
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onFocus={() => setIsPromptFocused(true)}
                                onBlur={() => setIsPromptFocused(false)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        submit();
                                    }
                                }}
                                placeholder=""
                                className="no-focus-ring w-full min-h-[72px] max-h-[180px] resize-none bg-[#2C313D] px-2 py-1 text-[16px] text-left text-gray-100 placeholder:text-[16px] placeholder:text-gray-400 outline-none border-0 focus:border-0 ring-0 focus:ring-0"
                                style={{ border: 'none', boxShadow: 'none' }}
                            />
                        </div>

                        {images.length > 0 && (
                            <div className="mt-1 mb-2 flex items-center gap-2 overflow-x-auto overflow-y-visible px-1 pb-1">
                                {images.map((img, i) => (
                                    <div key={`${img.slice(0, 24)}-${i}`} className="relative h-10 w-10 shrink-0 group">
                                        <img
                                            src={img}
                                            alt="attachment"
                                            className="h-10 w-10 rounded-md border border-white/10 object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                                            className="absolute top-0 right-0 h-4 w-4 rounded-full bg-black/70 border border-white/20 text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                            title="Remove attachment"
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-white/10">
                            <div className="flex items-center gap-2.5">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="h-8 rounded-md px-2.5 bg-transparent text-gray-200 hover:bg-white/8 transition-colors flex items-center justify-center gap-1.5"
                                    title="Attach images"
                                >
                                    <Paperclip size={17} />
                                    {/* <span className="text-[12px]">Attach</span> */}
                                </button>
                                {/* <button
                                    type="button"
                                    className="h-8 rounded-md px-2.5 bg-transparent text-gray-200 hover:bg-white/8 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Figma size={13} />
                                    <span className="text-[12px]">Import</span>
                                </button> */}
                                <div className="flex items-center bg-white/5 rounded-full p-1 ring-1 ring-white/5">
                                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setPlatform(p)}
                                            className={`p-1.5 rounded-full transition-all ${platform === p
                                                ? 'bg-gray-600 text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                                }`}
                                            title={`Generate for ${p}`}
                                        >
                                            {p === 'mobile' && <Smartphone size={15} />}
                                            {p === 'tablet' && <Tablet size={15} />}
                                            {p === 'desktop' && <Monitor size={15} />}
                                        </button>
                                    ))}
                                </div>


                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex items-center bg-white/5 rounded-full p-1 ring-1 ring-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('fast')}
                                        className={`h-8 px-2.5 rounded-full text-[11px] font-semibold transition-all inline-flex items-center gap-1.5 ${modelProfile === 'fast'
                                            ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-300/40'
                                            : 'text-amber-400 hover:text-amber-200 hover:bg-white/5'
                                            }`}
                                        title="Fast model"
                                    >
                                        <Zap size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('quality')}
                                        className={`h-8 px-2.5 rounded-full text-[11px] font-semibold transition-all inline-flex items-center gap-1.5 ${modelProfile === 'quality'
                                            ? 'bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-300/40'
                                            : 'text-indigo-400 hover:text-indigo-200 hover:bg-white/5'
                                            }`}
                                        title="Quality model"
                                    >
                                        <Sparkles size={12} />
                                    </button>
                                </div>
                                <div ref={styleMenuRef} className="relative hidden sm:flex items-center">
                                    <button
                                        type="button"
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
                                                    type="button"
                                                    onClick={() => {
                                                        setStylePreset(preset);
                                                        setShowStyleMenu(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${stylePreset === preset
                                                        ? 'bg-indigo-500/20 text-indigo-200'
                                                        : 'text-gray-300 hover:bg-white/10'
                                                        }`}
                                                >
                                                    {preset}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>   

                                <button
                                    type="button"
                                    onClick={handleMicToggle}
                                    disabled={isTranscribing}
                                    className={`h-9 w-9 rounded-full text-[12px] transition-colors flex items-center justify-center ${isRecording
                                        ? 'bg-rose-500/20 text-rose-200'
                                        : 'bg-white/10 text-gray-200 hover:bg-white/15'
                                        } ${isTranscribing ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Record voice'}
                                >
                                    {isRecording ? <Square size={13} className="fill-current" /> : <Mic size={14} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={submit}
                                    disabled={!prompt.trim()}
                                    className={`h-9 w-9 rounded-full text-[12px] font-semibold transition-colors flex items-center justify-center ${prompt.trim()
                                        ? 'bg-white text-[#222736] hover:bg-gray-200'
                                        : 'bg-white/10 text-gray-500 cursor-not-allowed'
                                        }`}
                                >
                                    <ArrowUp size={15} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 flex items-center justify-center gap-2 text-gray-400 flex-wrap">
                        {APP_SUGGESTIONS.map((chip) => (
                            <button
                                key={chip}
                                type="button"
                                onClick={() => setPrompt(chip)}
                                title={chip}
                                className="h-9 rounded-full border border-white/15 bg-black/25 px-4 text-[14px] text-gray-200 hover:bg-white/10 transition-colors"
                            >
                                {toChipLabel(chip)}
                            </button>
                        ))}
                    </div>
                </section>

                {/* <section className="mx-auto mt-10 max-w-[980px] text-center">
                    <p className="text-[11px] uppercase tracking-[0.11em] text-gray-500">Built for teams shipping high-quality interfaces with AI</p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[35px] text-gray-400/80">
                        {TRUSTED_BRANDS.map((brand) => (
                            <span key={brand} className="text-[35px] md:text-[39px] leading-none tracking-tight font-semibold opacity-80">
                                {brand}
                            </span>
                        ))}
                    </div>
                </section> */}

                <section className="relative left-1/2 right-1/2 mt-14 -ml-[50vw] -mr-[50vw] w-screen text-center">
                    <div className="mx-auto max-w-[1200px] px-4 md:px-6">
                        <h2 className="text-[36px] md:text-[56px] leading-[1.06] font-semibold tracking-[-0.03em] text-white">
                            Find design patterns
                            <br />
                            in seconds.
                        </h2>
                        <div className="mt-5 inline-flex items-center gap-1 rounded-full bg-white/10 p-1 border border-white/10">
                            {PATTERN_TABS.map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setActivePatternTab(tab)}
                                    className={`h-8 px-3 rounded-full text-[12px] transition-colors ${activePatternTab === tab
                                        ? 'bg-white text-[#111521] font-semibold'
                                        : 'text-gray-300 hover:bg-white/10'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8 relative overflow-hidden px-3 md:px-4">
                        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-20 z-10 bg-[linear-gradient(to_right,rgba(6,7,11,1),rgba(6,7,11,0))]" />
                        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-20 z-10 bg-[linear-gradient(to_left,rgba(6,7,11,1),rgba(6,7,11,0))]" />
                        <div
                            className="infinite-scroll-track flex w-max gap-4"
                            style={{ ['--marquee-duration' as any]: `${Math.max(36, patternCards.length * 7)}s` }}
                        >
                            {marqueeCards.map((item, idx) => (
                                <button
                                    key={`${item.title}-${idx}`}
                                    type="button"
                                    onClick={() => setPrompt(item.prompt)}
                                    className="w-[250px] md:w-[280px] shrink-0 rounded-2xl border border-white/10 bg-transparent p-2.5 text-left hover:border-white/20 transition-colors"
                                    title="Use this pattern in the prompt"
                                >
                                    <div className="mb-5 text-[13px] font-semibold text-gray-100 text-center">{item.title}</div>
                                    <div className={`relative w-full aspect-[9/19.5] rounded-xl border border-white/10 overflow-hidden ${!item.image ? `bg-gradient-to-b ${item.accent}` : 'bg-[#0f131e]'}`}>
                                        {item.image && (
                                            <img src={item.image} alt={`${item.title} preview`} className="h-full w-full object-cover" />
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
