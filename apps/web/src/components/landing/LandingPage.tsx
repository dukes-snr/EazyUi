import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { ArrowUp, CircleStar, Gem, Instagram, LineSquiggle, Linkedin, Mail, Mic, Monitor, Moon, Palette, Paperclip, Pause, Play, RotateCcw, Smartphone, Smile, Sparkles, Square, Sun, Tablet, X, Youtube, Zap } from 'lucide-react';
import featureSlide1 from '../../assets/Slide1.png';
import featureSlide2 from '../../assets/Slide2.png';
import featureSlide3 from '../../assets/Slide3.png';
import featureSlide4 from '../../assets/Slide4.png';
import videodemoimg from '../../assets/videodemoimg.png';
import appLogo from '../../assets/Ui-logo.png';
import eazyuiWordmark from '../../assets/eazyui-text-edit.png';
import eazyuiWordmarkLight from '../../assets/eazyui-text-edit-light.png';
import { apiClient } from '../../api/client';
import type { DesignModelProfile } from '../../constants/designModels';
import { SHOWCASE_SCREEN_IMAGES } from '../../utils/showcaseImages';
import { useOrbVisuals, type OrbActivityState } from '../../utils/orbVisuals';
import { GlassPricingSection } from '../marketing/GlassPricingSection';
import { Orb } from '../ui/Orb';
import { ComposerInlineReferenceInput, type ComposerInlineReferenceInputHandle } from '../ui/ComposerInlineReferenceInput';
import { ComposerReferenceMenu } from '../ui/ComposerReferenceMenu';
import TextType from '../ui/TextType';
import { useUiStore } from '../../stores';
import {
    extractComposerInlineReferences,
    findComposerReferenceTrigger,
    formatComposerUrlReferenceToken,
    getFilteredComposerReferenceRootOptions,
    normalizeComposerReferenceUrl,
    replaceComposerReferenceTrigger,
    type ComposerReferenceTextRange,
} from '../../utils/composerReferences';

type LandingPageProps = {
    onStart: (payload: {
        prompt: string;
        images: string[];
        platform: 'mobile' | 'tablet' | 'desktop';
        stylePreset: 'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful';
        modelProfile: DesignModelProfile;
        modelTemperature?: number;
        referenceUrls?: string[];
    }) => void;
    onNavigate: (path: string) => void;
    userProfile?: {
        name: string;
        email: string;
        photoUrl?: string | null;
        emailVerified: boolean;
    } | null;
    onSignOut?: () => void;
    onSendVerification?: () => void;
    verificationBusy?: boolean;
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
type PatternCard = {
    title: string;
    prompt: string;
    accent: string;
    image?: string;
};

const PATTERN_SCREEN_TEMPLATES: Omit<PatternCard, 'image'>[] = [
    {
        title: 'Profile',
        prompt: 'Design a profile screen with avatar header, editable personal details, and clear settings/actions.',
        accent: 'from-sky-500/45 to-indigo-500/25',
    },
    {
        title: 'Cooking',
        prompt: 'Create a cooking mode step-by-step screen with recipe progress, ingredient guidance, and timer-friendly controls.',
        accent: 'from-fuchsia-500/40 to-slate-500/20',
    },
    {
        title: 'Image detail',
        prompt: 'Generate an image pin detail screen with large media preview, save/share actions, and related inspiration cards.',
        accent: 'from-amber-500/45 to-orange-500/25',
    },
    {
        title: 'Leaderboard',
        prompt: 'Build a challenges leaderboard screen with ranked participants, progress indicators, and reward highlights.',
        accent: 'from-violet-500/45 to-cyan-500/20',
    },
    {
        title: 'Feed',
        prompt: 'Design a home feed screen with content cards, discovery sections, and quick interactions for engagement.',
        accent: 'from-slate-600/50 to-zinc-500/20',
    },
    {
        title: 'Dashboard',
        prompt: 'Create a dashboard screen with KPI summary cards, recent activity, and concise performance trends.',
        accent: 'from-zinc-400/35 to-slate-500/20',
    },
    {
        title: 'Achievement',
        prompt: 'Generate an achievements screen with milestone badges, progress tracking, and unlocked reward states.',
        accent: 'from-emerald-500/35 to-cyan-500/20',
    },
];

const FEATURE_SCROLL_ITEMS = [
    {
        number: '00',
        title: 'Turn a rough prompt into a polished first pass',
        description: 'Start with an idea in plain language and get back screens with hierarchy, spacing, and product structure already moving in the right direction.',
        image: featureSlide1,
    },
    {
        number: '01',
        title: 'Guide the output with references that actually matter',
        description: 'Attach screenshots, inline URLs, and visual inspiration so EazyUI stays closer to your product reality instead of drifting into generic layouts.',
        image: featureSlide2,
    },
    {
        number: '02',
        title: 'Design across mobile, tablet, and desktop instantly',
        description: 'Switch targets before generation so the density, composition, and rhythm fit the device from the beginning rather than as an afterthought.',
        image: featureSlide3,
    },
    {
        number: '03',
        title: 'Refine faster with style control, voice, and iteration',
        description: 'Use style presets, fast versus quality modes, and voice input to move quickly from broad exploration into sharper, premium direction.',
        image: featureSlide4,
    },
] as const;

const SOCIAL_PROOF = [
    {
        quote: 'We replaced 2 weeks of rough wireframing with a single afternoon and shipped faster.',
        author: 'Product Lead',
        company: 'B2B SaaS',
    },
    {
        quote: 'The generated flows already respect interaction patterns. We focus on polish, not rescue.',
        author: 'Senior Designer',
        company: 'Fintech',
    },
    {
        quote: 'Our team uses EazyUI as the first draft engine for every new feature now.',
        author: 'Founder',
        company: 'Consumer App',
    },
    {
        quote: 'The screens already arrive with structure, so our reviews start at refinement instead of rescue.',
        author: 'Frontend Lead',
        company: 'Healthtech',
    },
] as const;
const CHIP_LABEL_MAX = 34;
const MARKETING_NAV_LINKS = [
    { label: 'Templates', path: '/templates' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Learn', path: '/learn' },
    { label: "What's New", path: '/changelog' },
] as const;

const DEMO_VIDEO_URL = 'https://lf16-web-neutral.traecdn.ai/obj/trae-ai-static/trae_website/static/media/solo-introduce.d2d26c5b.mp4';
function FeatureScrollIntro({ progress }: { progress: MotionValue<number> }) {
    const opacity = useTransform(progress, [0.05, 0.18, 0.34], [0.2, 1, 1]);
    const x = useTransform(progress, [0.05, 0.22], [64, 0]);
    const y = useTransform(progress, [0.05, 0.22], [28, 0]);

    return (
        <motion.article className="landing-feature-scroll-intro" style={{ opacity, x, y }}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">What EazyUI unlocks</p>
            <h3 className="mt-4 text-[36px] md:text-[58px] leading-[0.98] tracking-[-0.05em] font-semibold text-[var(--ui-text)]">
                From first prompt
                <br />
                to product-ready UI.
            </h3>
            <p className="mt-5 max-w-[34rem] text-[15px] md:text-[18px] leading-8 text-[var(--ui-text-muted)]">
                Scroll through the core capabilities and see how EazyUI turns rough ideas into sharper interface direction, faster refinement, and more confident decisions.
            </p>
        </motion.article>
    );
}

function FeatureScrollCard({
    item,
    index,
    progress,
}: {
    item: (typeof FEATURE_SCROLL_ITEMS)[number];
    index: number;
    progress: MotionValue<number>;
}) {
    const enterStart = 0.2 + (index * 0.1);
    const enterEnd = enterStart + 0.14;
    const settleEnd = enterEnd + 0.1;
    const y = useTransform(progress, [0, enterStart, enterEnd, settleEnd, 1], [110, 110, 0, 0, -12]);
    const opacity = useTransform(progress, [0, enterStart, enterEnd], [0.16, 0.16, 1]);
    const scale = useTransform(progress, [0, enterStart, enterEnd], [0.9, 0.9, 1]);
    const rotateX = useTransform(progress, [0, enterStart, enterEnd], [10, 10, 0]);

    return (
        <motion.article
            className="landing-feature-scroll-card"
            style={{
                y,
                opacity,
                scale,
                rotateX,
                transformPerspective: 1400,
            }}
        >
            <p className="text-[18px] tracking-[-0.04em] font-semibold text-[var(--ui-primary)]">[{item.number}]</p>
            <h4 className="mt-4 text-[24px] md:text-[34px] leading-[1.05] tracking-[-0.04em] font-semibold text-[var(--ui-text)]">
                {item.title}
            </h4>
            <div className="landing-feature-scroll-preview mt-5">
                <img src={item.image} alt={`${item.title} preview`} className="landing-feature-scroll-image" />
            </div>
            <p className="mt-5 text-[14px] md:text-[15px] leading-8 text-[var(--ui-text-muted)]">
                {item.description}
            </p>
        </motion.article>
    );
}

function toChipLabel(text: string): string {
    const clean = text.trim();
    if (clean.length <= CHIP_LABEL_MAX) return clean;
    return `${clean.slice(0, CHIP_LABEL_MAX - 1).trimEnd()}...`;
}

export function LandingPage({ onStart, onNavigate, userProfile, onSignOut, onSendVerification, verificationBusy = false }: LandingPageProps) {
    const theme = useUiStore((state) => state.theme);
    const toggleTheme = useUiStore((state) => state.toggleTheme);
    const heroWordmark = theme === 'light' ? eazyuiWordmarkLight : eazyuiWordmark;
    const [prompt, setPrompt] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [platform, setPlatform] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
    const [stylePreset, setStylePreset] = useState<'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful'>('modern');
    const [modelProfile, setModelProfile] = useState<DesignModelProfile>('quality');
    const [showStyleMenu, setShowStyleMenu] = useState(false);
    const [isPromptFocused, setIsPromptFocused] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isReferenceMenuOpen, setIsReferenceMenuOpen] = useState(false);
    const [isNavScrolled, setIsNavScrolled] = useState(false);
    const [isDemoHovered, setIsDemoHovered] = useState(false);
    const [isDemoPlaying, setIsDemoPlaying] = useState(false);
    const [featureShowcaseOffset, setFeatureShowcaseOffset] = useState(0);
    const [featureShowcaseScrollSpan, setFeatureShowcaseScrollSpan] = useState(2200);
    const [referenceMenuMode, setReferenceMenuMode] = useState<'root' | 'url'>('root');
    const [referenceRootQuery, setReferenceRootQuery] = useState('');
    const [referenceActiveIndex, setReferenceActiveIndex] = useState(0);
    const [referenceUrlDraft, setReferenceUrlDraft] = useState('');
    const [newsletterEmail, setNewsletterEmail] = useState('');
    const [newsletterBusy, setNewsletterBusy] = useState(false);
    const [newsletterStatus, setNewsletterStatus] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const demoVideoRef = useRef<HTMLVideoElement | null>(null);
    const demoScreensSectionRef = useRef<HTMLElement | null>(null);
    const featureShowcaseSectionRef = useRef<HTMLElement | null>(null);
    const featureShowcaseViewportRef = useRef<HTMLDivElement | null>(null);
    const featureShowcaseTrackRef = useRef<HTMLDivElement | null>(null);
    const styleMenuRef = useRef<HTMLDivElement | null>(null);
    const promptTextareaRef = useRef<ComposerInlineReferenceInputHandle | null>(null);
    const referenceMenuRef = useRef<HTMLDivElement | null>(null);
    const referenceUrlInputRef = useRef<HTMLInputElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const referenceTriggerRangeRef = useRef<ComposerReferenceTextRange | null>(null);
    const shouldReduceMotion = useReducedMotion();
    const { scrollY, scrollYProgress } = useScroll({ container: scrollContainerRef });
    const { scrollYProgress: featureSectionProgressRaw } = useScroll({
        container: scrollContainerRef,
        target: featureShowcaseSectionRef,
        offset: ['start 0.88', 'end 0.16'],
    });
    const easedScrollY = useSpring(scrollY, shouldReduceMotion ? {
        stiffness: 900,
        damping: 120,
        mass: 1,
    } : {
        stiffness: 120,
        damping: 26,
        mass: 0.34,
    });
    const easedScrollProgress = useSpring(scrollYProgress, shouldReduceMotion ? {
        stiffness: 900,
        damping: 120,
        mass: 1,
    } : {
        stiffness: 110,
        damping: 24,
        mass: 0.3,
    });
    const featureSectionProgress = useSpring(featureSectionProgressRaw, shouldReduceMotion ? {
        stiffness: 900,
        damping: 120,
        mass: 1,
    } : {
        stiffness: 120,
        damping: 22,
        mass: 0.34,
    });
    const backgroundY = useTransform(easedScrollY, [0, 1400], [0, -112]);
    const backgroundScale = useTransform(easedScrollProgress, [0, 1], [1, 1.085]);
    const heroY = useTransform(easedScrollY, [0, 420], [0, -58]);
    const heroOpacity = useTransform(easedScrollY, [0, 300], [1, 0.66]);
    const heroSpotlightX = useMotionValue(0);
    const heroSpotlightY = useMotionValue(0);
    const heroSpotlightOpacity = useMotionValue(0);
    const heroSpotlightMask = useMotionTemplate`radial-gradient(circle 280px at ${heroSpotlightX}px ${heroSpotlightY}px, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 28%, rgba(0, 0, 0, 0.78) 52%, rgba(0, 0, 0, 0.36) 74%, transparent 100%)`;

    const rootReferenceOptions = useMemo(
        () => getFilteredComposerReferenceRootOptions(referenceRootQuery, false),
        [referenceRootQuery]
    );

    const submit = () => {
        const next = prompt.trim();
        if (!next) return;
        const parsedReferences = extractComposerInlineReferences(next);
        onStart({
            prompt: parsedReferences.cleanedText.trim(),
            images,
            platform,
            stylePreset,
            modelProfile,
            referenceUrls: parsedReferences.urlReferences.map((item) => item.url),
        });
    };

    const handleNewsletterSignup = async () => {
        const cleanEmail = newsletterEmail.trim();
        if (!cleanEmail || newsletterBusy) return;

        try {
            setNewsletterBusy(true);
            setNewsletterStatus(null);
            await apiClient.subscribeToNewsletter(cleanEmail);
            setNewsletterStatus('Thanks. Check your inbox soon.');
            setNewsletterEmail('');
        } catch (error) {
            setNewsletterStatus((error as Error).message || 'Could not send email.');
        } finally {
            setNewsletterBusy(false);
        }
    };

    const closeReferenceMenu = () => {
        setIsReferenceMenuOpen(false);
        setReferenceMenuMode('root');
        setReferenceRootQuery('');
        setReferenceActiveIndex(0);
        setReferenceUrlDraft('');
        referenceTriggerRangeRef.current = null;
    };

    const syncReferenceTrigger = (value: string, cursor: number) => {
        const match = findComposerReferenceTrigger(value, cursor);
        if (!match) {
            if (referenceMenuMode === 'root') {
                closeReferenceMenu();
            }
            return;
        }
        referenceTriggerRangeRef.current = match.range;
        setReferenceRootQuery(match.query);
        setReferenceMenuMode('root');
        setIsReferenceMenuOpen(true);
    };

    const openUrlReferenceInput = () => {
        setReferenceMenuMode('url');
        setReferenceActiveIndex(0);
        setReferenceUrlDraft('');
        setIsReferenceMenuOpen(true);
    };

    const submitUrlReference = () => {
        const normalized = normalizeComposerReferenceUrl(referenceUrlDraft);
        if (!normalized) return;
        const range = referenceTriggerRangeRef.current;
        if (!range) return;
        const source = promptTextareaRef.current?.getValue() ?? prompt;
        const result = replaceComposerReferenceTrigger(source, range, formatComposerUrlReferenceToken(normalized));
        setPrompt(result.value);
        closeReferenceMenu();
        window.setTimeout(() => {
            const target = promptTextareaRef.current;
            if (!target) return;
            target.focus();
            target.setSelectionRange(result.cursor, result.cursor);
        }, 0);
    };

    const handlePromptChange = (value: string, cursor: number) => {
        setPrompt(value);
        syncReferenceTrigger(value, cursor);
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
        if (!isReferenceMenuOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (referenceMenuRef.current?.contains(event.target as Node)) return;
            if (promptTextareaRef.current?.element?.contains(event.target as Node)) return;
            closeReferenceMenu();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isReferenceMenuOpen, referenceMenuMode]);

    useEffect(() => {
        if (!isReferenceMenuOpen || referenceMenuMode !== 'url') return;
        referenceUrlInputRef.current?.focus();
    }, [isReferenceMenuOpen, referenceMenuMode]);

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

    useEffect(() => {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;

        let animationFrame = 0;

        const updateScrollState = () => {
            animationFrame = 0;
            const scrollTop = scrollContainer.scrollTop;
            const nextScrolled = scrollTop > 10;
            setIsNavScrolled((current) => (current === nextScrolled ? current : nextScrolled));

            const section = featureShowcaseSectionRef.current;
            const viewport = featureShowcaseViewportRef.current;
            const track = featureShowcaseTrackRef.current;

            if (!section || !viewport || !track) {
                setFeatureShowcaseOffset((current) => (current === 0 ? current : 0));
                return;
            }

            const viewportHeight = scrollContainer.clientHeight;
            const sectionRect = section.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            const sectionTopInViewport = sectionRect.top - containerRect.top;
            const scrollableDistance = Math.max(sectionRect.height - viewportHeight, 1);
            const progress = Math.min(Math.max((-sectionTopInViewport) / scrollableDistance, 0), 1);
            const maxOffset = Math.max(track.scrollWidth - viewport.clientWidth, 0);
            const nextOffset = maxOffset * progress;
            const nextScrollSpan = Math.max(viewportHeight + maxOffset + 240, viewportHeight * 1.8);

            setFeatureShowcaseOffset((current) => (Math.abs(current - nextOffset) < 1 ? current : nextOffset));
            setFeatureShowcaseScrollSpan((current) => (Math.abs(current - nextScrollSpan) < 2 ? current : nextScrollSpan));
        };

        const handleScroll = () => {
            if (animationFrame) return;
            animationFrame = window.requestAnimationFrame(updateScrollState);
        };

        const handleResize = () => {
            if (animationFrame) {
                window.cancelAnimationFrame(animationFrame);
            }
            animationFrame = window.requestAnimationFrame(updateScrollState);
        };

        updateScrollState();
        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleResize);

        return () => {
            scrollContainer.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
            if (animationFrame) {
                window.cancelAnimationFrame(animationFrame);
            }
        };
    }, []);

    useEffect(() => {
        const video = demoVideoRef.current;
        if (!video) return;

        const syncPlayingState = () => setIsDemoPlaying(!video.paused && !video.ended);

        syncPlayingState();
        video.addEventListener('play', syncPlayingState);
        video.addEventListener('pause', syncPlayingState);
        video.addEventListener('ended', syncPlayingState);

        return () => {
            video.removeEventListener('play', syncPlayingState);
            video.removeEventListener('pause', syncPlayingState);
            video.removeEventListener('ended', syncPlayingState);
        };
    }, []);

    const patternCards = useMemo<PatternCard[]>(() => {
        if (SHOWCASE_SCREEN_IMAGES.length === 0) {
            return PATTERN_SCREEN_TEMPLATES.map((template) => ({ ...template }));
        }
        return SHOWCASE_SCREEN_IMAGES.map((image, index) => {
            const template = PATTERN_SCREEN_TEMPLATES[index % PATTERN_SCREEN_TEMPLATES.length];
            return {
                ...template,
                image,
            };
        });
    }, []);
    const marqueeCards = useMemo(() => [...patternCards, ...patternCards], [patternCards]);
    const testimonialWallCards = useMemo(
        () => Array.from({ length: 8 }, (_, index) => ({
            ...SOCIAL_PROOF[index % SOCIAL_PROOF.length],
            preview: patternCards[(index + 1) % patternCards.length],
        })),
        [patternCards]
    );
    const demoVideoPoster = videodemoimg;
    const hasPromptText = prompt.trim().length > 0;
    const showSendAction = hasPromptText;
    const actionIsStop = isRecording;
    const actionDisabled = isTranscribing && !isRecording;
    const landingOrbActivity: OrbActivityState = (isRecording || isTranscribing || showSendAction) ? 'talking' : 'idle';
    const { agentState: landingOrbState, colors: landingOrbColors } = useOrbVisuals(landingOrbActivity);
    const landingOrbInput = isRecording ? 0.9 : isTranscribing ? 0.58 : showSendAction ? 0.45 : 0.2;
    const landingOrbOutput = (showSendAction || isRecording || isTranscribing) ? 0.5 : 0.2;
    const toggleDemoPlayback = () => {
        const video = demoVideoRef.current;
        if (!video) return;

        if (video.paused || video.ended) {
            void video.play();
            return;
        }

        video.pause();
    };
    const restartDemoVideo = () => {
        const video = demoVideoRef.current;
        if (!video) return;

        video.currentTime = 0;
        void video.play();
    };
    const StyleIcon = stylePreset === 'minimal'
        ? LineSquiggle
        : stylePreset === 'vibrant'
            ? Palette
            : stylePreset === 'luxury'
                ? Gem
                : stylePreset === 'playful'
                    ? Smile
                    : CircleStar;
    const styleButtonTone = stylePreset === 'minimal'
        ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_12%,var(--ui-surface-4))] text-[var(--ui-text)] ring-[color:color-mix(in_srgb,var(--ui-primary)_30%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-surface-4))]'
        : stylePreset === 'vibrant'
            ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/35 hover:bg-emerald-400/20'
            : stylePreset === 'luxury'
                ? 'bg-amber-400/15 text-amber-200 ring-amber-300/35 hover:bg-amber-400/20'
                : stylePreset === 'playful'
                    ? 'bg-fuchsia-400/15 text-fuchsia-200 ring-fuchsia-300/35 hover:bg-fuchsia-400/20'
                    : 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,transparent)] text-[color:color-mix(in_srgb,var(--ui-primary)_62%,white)] ring-[color:color-mix(in_srgb,var(--ui-primary)_38%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_22%,transparent)]';

    return (
        <div
            ref={scrollContainerRef}
            className="landing-scroll-shell h-screen w-full overflow-y-auto bg-[var(--ui-surface-1)] text-[var(--ui-text)] relative"
            onPointerMove={(event) => {
                if (event.pointerType === 'touch') return;
                const container = scrollContainerRef.current;
                if (!container) return;
                const rect = container.getBoundingClientRect();
                const pointerX = event.clientX - rect.left;
                const pointerY = event.clientY - rect.top + container.scrollTop;
                const spotlightLimit = demoScreensSectionRef.current
                    ? demoScreensSectionRef.current.offsetTop + demoScreensSectionRef.current.offsetHeight
                    : 0;
                heroSpotlightX.set(pointerX);
                heroSpotlightY.set(pointerY);
                heroSpotlightOpacity.set(pointerY <= spotlightLimit ? 1 : 0);
            }}
            onPointerLeave={() => {
                heroSpotlightOpacity.set(0);
            }}
        >
            <div className="landing-background-stack pointer-events-none absolute inset-0">
                <motion.div
                    className="landing-hero-backdrop absolute inset-0"
                    style={{
                        y: shouldReduceMotion ? 0 : backgroundY,
                        scale: shouldReduceMotion ? 1 : backgroundScale,
                    }}
                />
                <motion.div
                    className="landing-hero-dot-spotlight absolute inset-0"
                    style={{
                        opacity: heroSpotlightOpacity,
                        WebkitMaskImage: heroSpotlightMask,
                        maskImage: heroSpotlightMask,
                    }}
                />
            </div>

            <header className={`landing-nav-shell ${isNavScrolled ? 'is-scrolled' : ''}`}>
                <div className="landing-nav-frame">
                    <motion.div
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-500"
                        style={{ scaleX: shouldReduceMotion ? scrollYProgress : easedScrollProgress }}
                    />
                    <div className="mx-auto flex h-14 max-w-[1160px] items-center justify-between px-4 sm:px-6">
                    <button
                        type="button"
                        onClick={() => onNavigate('/')}
                        className="inline-flex items-center gap-2 text-left"
                    >
                        <img src={appLogo} alt="EazyUI logo" className="h-6 w-6 object-contain" />
                        <span className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[var(--ui-text)]">EazyUI</span>
                    </button>
                    <div className="hidden lg:flex items-center gap-2">
                        {MARKETING_NAV_LINKS.map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                onClick={() => onNavigate(item.path)}
                                className="h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)] transition-colors"
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-3))] hover:text-[var(--ui-primary)]"
                            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                        >
                            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                        </button>
                        {userProfile ? (
                            <>
                                <div className="hidden sm:flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1.5">
                                    {userProfile.photoUrl ? (
                                        <img
                                            src={userProfile.photoUrl}
                                            alt={userProfile.name}
                                            className="h-6 w-6 rounded-full object-cover border border-[var(--ui-border)]"
                                            onError={(e) => {
                                                const fallbackName = userProfile.name || userProfile.email || 'User';
                                                const img = e.currentTarget;
                                                img.onerror = null;
                                                img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=111827&color=ffffff&size=128&rounded=true`;
                                            }}
                                        />
                                    ) : (
                                        <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ui-surface-3)] text-[11px] font-semibold text-[var(--ui-text)]">
                                            {(userProfile.name || userProfile.email || 'U').slice(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="leading-tight">
                                        <p className="max-w-[170px] truncate text-[11px] text-[var(--ui-text)]">{userProfile.name}</p>
                                        <p className="max-w-[170px] truncate text-[10px] text-[var(--ui-text-muted)]">{userProfile.email}</p>
                                    </div>
                                </div>
                                {!userProfile.emailVerified && (
                                    <button
                                        type="button"
                                        onClick={onSendVerification}
                                        disabled={verificationBusy}
                                        className="hidden sm:inline-flex h-8 items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_22%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-primary)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-3))] disabled:opacity-60"
                                    >
                                        {verificationBusy ? 'Sending...' : 'Verify email'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onNavigate('/app')}
                                    className="h-8 rounded-full bg-[var(--ui-primary)] px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)]"
                                >
                                    Open app
                                </button>
                                <button
                                    type="button"
                                    onClick={onSignOut}
                                    className="h-8 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:text-[var(--ui-primary)]"
                                >
                                    Sign out
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => onNavigate('/login')}
                                    className="hidden sm:inline-flex h-8 items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:text-[var(--ui-primary)]"
                                >
                                    Log in
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onNavigate('/login')}
                                    className="h-8 rounded-full bg-[var(--ui-primary)] px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)]"
                                >
                                    Sign up
                                </button>
                            </>
                        )}
                    </div>
                    </div>
                </div>
            </header>

            <main className="relative z-10 px-4 md:px-[0%] lg:px-[0%] pt-8 md:pt-12 pb-0">
                {/*Hero section*/}
                <motion.section
                    className="landing-hero-section relative w-full overflow-hidden"
                    style={{
                        y: shouldReduceMotion ? 0 : heroY,
                        opacity: shouldReduceMotion ? 1 : heroOpacity,
                    }}
                >
                    <div className="relative z-10 mx-auto flex min-h-[55vh] w-full max-w-[980px] flex-col items-center justify-center px-2 text-center">
                        <h1 className="text-[42px] md:text-[58px] leading-[1.05] font-semibold tracking-[-0.02em]">
                            Design better UI with{' '}
                            <span className="relative inline-flex align-baseline">
                                <span className="sr-only">EazyUI</span>
                                <img
                                    src={heroWordmark}
                                    alt=""
                                    aria-hidden="true"
                                    className="relative top-[8px] md:top-[30px] -left-[10px] h-[1.94em] w-auto object-contain"
                                />
                            </span>
                        </h1>
                        <p className="mt-2 text-[20px] md:text-[30px] text-[var(--ui-text-muted)]">Generate production-ready app screens and landing pages from a single prompt.</p>

                        <div className="relative mx-auto mt-7 w-full max-w-[780px] rounded-[22px] border border-[color:color-mix(in_srgb,var(--ui-primary)_24%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_3%,var(--ui-surface-1))] p-3 shadow-[0_20px_65px_color-mix(in_srgb,var(--ui-primary)_10%,transparent)] md:p-4 text-left">
                            <div className="relative">
                                {!prompt.trim() && !isPromptFocused && (
                                    <div className="pointer-events-none absolute left-12 top-1 right-2 text-[16px] text-[var(--ui-text-subtle)] text-left">
                                        <TextType
                                            text={TYPED_PLACEHOLDER_SUGGESTIONS}
                                            className="text-[16px] text-[var(--ui-text-subtle)] text-left"
                                            typingSpeed={62}
                                            deletingSpeed={38}
                                            pauseDuration={2200}
                                            showCursor
                                            cursorCharacter="_"
                                            cursorClassName="text-[var(--ui-text-subtle)]"
                                            loop
                                        />
                                    </div>
                                )}
                                <div className="flex items-start gap-2 px-1">
                                    <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_24%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))] p-[2px]">
                                        <Orb
                                            className="h-full w-full"
                                            colors={landingOrbColors}
                                            seed={9101}
                                            agentState={landingOrbState}
                                            volumeMode="manual"
                                            manualInput={landingOrbInput}
                                            manualOutput={landingOrbOutput}
                                        />
                                    </div>
                                    <ComposerInlineReferenceInput
                                        ref={promptTextareaRef}
                                        value={prompt}
                                        onChange={handlePromptChange}
                                        onSelectionChange={syncReferenceTrigger}
                                        onFocus={() => setIsPromptFocused(true)}
                                        onBlur={() => setIsPromptFocused(false)}
                                        onKeyDown={(e) => {
                                            if (isReferenceMenuOpen) {
                                                if (referenceMenuMode === 'root' && rootReferenceOptions.length > 0) {
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        setReferenceActiveIndex((prev) => (prev + 1) % rootReferenceOptions.length);
                                                        return;
                                                    }
                                                    if (e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        setReferenceActiveIndex((prev) => (prev - 1 + rootReferenceOptions.length) % rootReferenceOptions.length);
                                                        return;
                                                    }
                                                    if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        closeReferenceMenu();
                                                        return;
                                                    }
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        const choice = rootReferenceOptions[referenceActiveIndex] || rootReferenceOptions[0];
                                                        if (choice?.key === 'url') openUrlReferenceInput();
                                                        return;
                                                    }
                                                }
                                                if (referenceMenuMode === 'url' && e.key === 'Escape') {
                                                    e.preventDefault();
                                                    closeReferenceMenu();
                                                    return;
                                                }
                                            }
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                submit();
                                            }
                                        }}
                                        placeholder=""
                                        placeholderClassName="px-2 py-1 text-left"
                                        className="no-focus-ring w-full min-h-[72px] max-h-[180px] overflow-y-auto bg-transparent px-2 py-1 text-[16px] leading-normal text-left text-[var(--ui-text)] border-0 focus:border-0 ring-0 focus:ring-0"
                                    />
                                </div>
                            </div>
                        {images.length > 0 && (
                            <div className="mt-1 mb-2 flex items-center gap-2 overflow-x-auto overflow-y-visible px-1 pb-1">
                                {images.map((img, i) => (
                                    <div key={`${img.slice(0, 24)}-${i}`} className="relative h-10 w-10 shrink-0 group">
                                        <img
                                            src={img}
                                            alt="attachment"
                                            className="h-10 w-10 rounded-md border border-[var(--ui-border)] object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                                            className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-border-light)] bg-[var(--ui-surface-1)] text-[var(--ui-text)] opacity-0 transition-opacity group-hover:opacity-100"
                                            title="Remove attachment"
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-[var(--ui-border)]">
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
                                    className="h-8 rounded-md px-2.5 text-[var(--ui-text-muted)] hover:text-[var(--ui-primary)] transition-colors  flex items-center justify-center gap-1.5"
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
                                <div className="flex items-center bg-[var(--ui-surface-3)] rounded-full p-1 ring-1 ring-[var(--ui-border)]">
                                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setPlatform(p)}
                                            className={`p-1.5 rounded-full transition-all ${platform === p
                                                ? 'bg-[var(--ui-primary)] text-[var(--ui-text)] shadow-sm'
                                                : 'text-[var(--ui-text-subtle)] hover:text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-3)]'
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
                                <div className="flex items-center bg-[var(--ui-surface-3)] rounded-full p-1 ring-1 ring-[var(--ui-border)]">
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('fast')}
                                        className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'fast'
                                            ? 'bg-amber-500/20 text-[var(--ui-text)] ring-1 ring-amber-400/40'
                                            : 'text-amber-400 hover:text-amber-200 hover:bg-[var(--ui-surface-3)]'
                                            }`}
                                        title="Fast model"
                                    >
                                        <Zap size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('quality')}
                                        className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'quality'
                                            ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_20%,transparent)] text-[var(--ui-text)] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)]'
                                            : 'text-[color:color-mix(in_srgb,var(--ui-primary)_70%,white)] hover:text-[var(--ui-primary)] hover:bg-[var(--ui-surface-3)]'
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
                                        className={`h-9 w-9 rounded-full ring-1 transition-all inline-flex items-center justify-center ${styleButtonTone}`}
                                        title="Select style preset"
                                    >
                                        <StyleIcon size={14} />
                                    </button>
                                    {showStyleMenu && (
                                        <div className="absolute bottom-12 right-0 w-40 bg-[var(--ui-popover)] border border-[var(--ui-border)] rounded-xl shadow-2xl p-2 z-50">
                                            {(['modern', 'minimal', 'vibrant', 'luxury', 'playful'] as const).map((preset) => (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => {
                                                        setStylePreset(preset);
                                                        setShowStyleMenu(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${stylePreset === preset
                                                        ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_18%,transparent)] text-[var(--ui-primary)]'
                                                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-4)]'
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
                                    onClick={() => {
                                        if (isRecording) {
                                            handleMicToggle();
                                            return;
                                        }
                                        if (showSendAction) {
                                            submit();
                                            return;
                                        }
                                        handleMicToggle();
                                    }}
                                    disabled={actionDisabled}
                                    className={`h-9 w-9 rounded-full text-[12px] font-semibold transition-colors flex items-center justify-center ${isRecording
                                        ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-300/25'
                                        : showSendAction
                                            ? 'bg-[var(--ui-primary)] text-white hover:bg-[var(--ui-primary-hover)] shadow-lg shadow-[0_16px_40px_color-mix(in_srgb,var(--ui-primary)_30%,transparent)]'
                                            : 'bg-[var(--ui-surface-3)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-4)] ring-1 ring-[var(--ui-border)]'
                                        } ${actionDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    title={isRecording ? 'Stop recording' : showSendAction ? 'Send prompt' : isTranscribing ? 'Transcribing...' : 'Record voice'}
                                >
                                    {actionIsStop ? <Square size={13} className="fill-current" /> : showSendAction ? <ArrowUp size={15} /> : <Mic size={14} />}
                                </button>
                            </div>
                        </div>

                        {isReferenceMenuOpen && (
                            <ComposerReferenceMenu
                                activeIndex={referenceActiveIndex}
                                menuMode={referenceMenuMode}
                                menuRef={referenceMenuRef}
                                onCancel={closeReferenceMenu}
                                onRootOptionHover={setReferenceActiveIndex}
                                onScreenHover={setReferenceActiveIndex}
                                onSelectRootOption={(key) => {
                                    if (key === 'url') openUrlReferenceInput();
                                }}
                                onSubmitUrl={submitUrlReference}
                                rootOptions={rootReferenceOptions}
                                urlDraft={referenceUrlDraft}
                                urlInputRef={referenceUrlInputRef}
                                onUrlDraftChange={setReferenceUrlDraft}
                            />
                        )}
                    </div>
                    </div>

                    <div className="relative z-10 mt-5 flex flex-wrap items-center justify-center gap-2 text-[var(--ui-text-subtle)]">
                        {APP_SUGGESTIONS.map((chip) => (
                            <button
                                key={chip}
                                type="button"
                                onClick={() => setPrompt(chip)}
                                title={chip}
                                className="h-9 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_7%,var(--ui-surface-2))] px-4 text-[14px] text-[var(--ui-text-muted)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-3))] hover:text-[var(--ui-primary)]"
                            >
                                {toChipLabel(chip)}
                            </button>
                        ))}
                    </div>
                </motion.section>

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

                {/*Screens demo section*/}
                <motion.section
                    ref={demoScreensSectionRef}
                    className="landing-page-section relative w-full max-w-none"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 36, scale: 0.985 }}
                    whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="landing-page-section-full relative overflow-hidden px-0">
                        <div
                            className="infinite-scroll-track flex w-max gap-4"
                            style={{ ['--marquee-duration' as any]: `${Math.max(36, patternCards.length * 7)}s` }}
                        >
                            {marqueeCards.map((item, idx) => (
                                <button
                                    key={`${item.title}-${idx}`}
                                    type="button"
                                    onClick={() => setPrompt(item.prompt)}
                                    className="w-[250px] md:w-[280px] shrink-0 bg-transparent p-0 text-left transition-colors"
                                    title="Use this pattern in the prompt"
                                >
                                    <div className={`relative w-full aspect-[9/19.5] overflow-hidden rounded-xl border border-[var(--ui-border)] ${!item.image ? `bg-gradient-to-b ${item.accent}` : 'bg-[var(--ui-surface-2)]'}`}>
                                        {item.image && (
                                            <img src={item.image} alt={`${item.title} preview`} className="h-full w-full object-cover" />
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </motion.section>

                {/*Video demo section*/}
                <section className="landing-surface-band landing-surface-band-2 landing-page-section ">
                    <div className="w-full min-w-none px-0 md:px-[15%]">
                    <motion.div
                        className="flex flex-col gap-4 px-4 text-center md:px-0"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 44 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.3 }}
                        transition={{ duration: 0.82, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {/* <div className="mx-auto inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                            EazyUI Demo
                        </div> */}
                        <h2 className="text-[36px] md:text-[60px] lg:text-[74px] leading-[0.98] tracking-[-0.05em] font-semibold text-[var(--ui-text)]">
                            Watch{' '}
                            <span className="relative inline-flex align-baseline">
                                <span className="sr-only">EazyUI</span>
                                <img
                                    src={heroWordmark}
                                    alt=""
                                    aria-hidden="true"
                                    className="relative top-[8px] md:top-[30px] -left-[10px]  h-[1.64em] w-auto rotate-[3.5deg] object-contain"
                                />
                            </span>
                            <br />
                            in motion.
                        </h2>
                        <p className="mx-auto max-w-[760px] text-[16px] md:text-[19px] leading-8 text-[var(--ui-text-muted)]">
                            See how the prompt flow, generated screens, and refinement loop come together in one fast, polished product experience.
                        </p>
                    </motion.div>

                    <motion.div
                        className="mt-8 flex justify-center px-4 md:px-0"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 28 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.35 }}
                        transition={{ duration: 0.72, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <button
                            type="button"
                            onClick={() => onNavigate('/app')}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--ui-primary)] bg-[var(--ui-primary)] px-5 py-3 text-[13px] font-semibold text-white shadow-[0_16px_40px_color-mix(in_srgb,var(--ui-primary)_28%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)]"
                        >
                            <Sparkles size={16} />
                            Explore EazyUI
                        </button>
                    </motion.div>

                    <motion.div
                        className="landing-demo-shell landing-demo-shell-mobile-bleed mt-14"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 70, rotateX: 8, scale: 0.97 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                        viewport={{ once: true, amount: 0.25 }}
                        transition={{ duration: 0.95, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
                        style={{ transformPerspective: 1600 }}
                    >
                        <div
                            className="landing-demo-frame"
                            onMouseEnter={() => setIsDemoHovered(true)}
                            onMouseLeave={() => setIsDemoHovered(false)}
                        >
                            <video
                                ref={demoVideoRef}
                                className="landing-demo-video"
                                poster={demoVideoPoster}
                                playsInline
                                preload="metadata"
                                onClick={toggleDemoPlayback}
                            >
                                <source src={DEMO_VIDEO_URL} type="video/mp4" />
                            </video>
                            <button
                                type="button"
                                onClick={toggleDemoPlayback}
                                className={`landing-demo-control ${!isDemoPlaying ? 'is-paused' : ''} ${(!isDemoPlaying || isDemoHovered) ? 'is-visible' : ''}`}
                                aria-label={isDemoPlaying ? 'Pause demo video' : 'Play demo video'}
                            >
                                {isDemoPlaying ? <Pause size={26} className="fill-current" /> : <Play size={30} className="fill-current translate-x-[1px]" />}
                            </button>
                            <button
                                type="button"
                                onClick={restartDemoVideo}
                                className={`landing-demo-restart ${isDemoHovered || !isDemoPlaying ? 'is-visible' : ''}`}
                                aria-label="Restart demo video"
                            >
                                <RotateCcw size={16} />
                                Restart
                            </button>
                        </div>
                    </motion.div>
                    </div>
                </section>

                {/*Horizontal scroll section*/}
                <section
                    ref={featureShowcaseSectionRef}
                    className="landing-surface-band landing-surface-band-1 landing-page-section landing-feature-pin-section"
                    style={{ height: `${featureShowcaseScrollSpan}px` }}
                >
                    <div className="landing-feature-pin-inner">
                        <div className="landing-feature-layout landing-page-section-inner landing-page-section-inner-full h-full">
                            <div ref={featureShowcaseViewportRef} className="landing-feature-scroll-viewport">
                                <div
                                    ref={featureShowcaseTrackRef}
                                    className="landing-feature-scroll-track"
                                    style={{ transform: `translate3d(-${featureShowcaseOffset}px, 0, 0)` }}
                                >
                                    <FeatureScrollIntro progress={featureSectionProgress} />
                                    {FEATURE_SCROLL_ITEMS.map((item, index) => (
                                        <FeatureScrollCard
                                            key={item.number}
                                            item={item}
                                            index={index}
                                            progress={featureSectionProgress}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/*pricing section*/}
                <section className="landing-surface-band landing-surface-band-2 landing-page-section">
                    <GlassPricingSection
                        className=""
                        onGetStarted={() => setPrompt('Design a premium SaaS pricing page with calm typography, elegant comparisons, and a clear featured plan')}
                    />
                </section>

                {/*testimonial section*/}
                <section className="landing-surface-band landing-surface-band-1 landing-page-section landing-testimonial-section">
                    <div className="landing-page-section-inner landing-page-section-inner-full">
                        <motion.div
                            className="text-center"
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 40 }}
                            whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.35 }}
                            transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">Testimonials</p>
                            <h3 className="mt-4 text-[34px] md:text-[60px] leading-[1.02] tracking-[-0.05em] font-semibold text-[var(--ui-text)]">
                                Loved by teams
                                <br />
                                shipping real product UI.
                            </h3>
                            <p className="mx-auto mt-4 max-w-[640px] text-[14px] leading-7 text-[var(--ui-text-muted)] md:text-[16px]">
                                EazyUI helps teams move from vague product direction into stronger first passes that are actually worth reviewing.
                            </p>
                        </motion.div>
                    </div>

                    <motion.div
                        className="landing-testimonial-wall mt-14"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 52 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.18 }}
                        transition={{ duration: 0.9, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {[
                            testimonialWallCards.slice(0, 4),
                            testimonialWallCards.slice(4, 8),
                        ].map((row, rowIndex) => {
                            const repeated = [...row, ...row];
                            return (
                                <div
                                    key={`testimonial-row-${rowIndex}`}
                                    className={`landing-testimonial-row ${rowIndex === 1 ? 'is-reverse' : ''}`}
                                >
                                    <div
                                        className={`infinite-scroll-track flex w-max gap-5 ${rowIndex === 1 ? 'landing-scroll-track-reverse' : ''}`}
                                        style={{ ['--marquee-duration' as any]: `${rowIndex === 0 ? 42 : 48}s` }}
                                    >
                                        {repeated.map((item, index) => (
                                            <article
                                                key={`${item.quote}-${rowIndex}-${index}`}
                                                className="landing-testimonial-wall-card"
                                            >
                                                <p className="text-[21px] leading-[1.55] tracking-[-0.025em] text-[var(--ui-text)]">
                                                    {item.quote}
                                                </p>
                                                <div className="mt-8 flex items-center gap-3">
                                                    <div className="landing-testimonial-avatar">
                                                        {item.preview.image ? (
                                                            <img src={item.preview.image} alt={`${item.author} preview`} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className={`h-full w-full bg-gradient-to-br ${item.preview.accent}`} />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-[14px] font-semibold text-[var(--ui-text)]">{item.author}</p>
                                                        <p className="text-[13px] text-[var(--ui-text-muted)]">{item.company}</p>
                                                    </div>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </motion.div>
                </section>

                {/*footer section*/}
                <footer className="landing-footer">
                    <motion.div
                        className="landing-footer-shell"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 56 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.88, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="landing-footer-top-half">
                            <div className="landing-footer-top-row">
                                <div className="landing-footer-newsletter">
                                    <h2 className="landing-footer-newsletter-title">Subscribe to our newsletter</h2>
                                    <p className="landing-footer-newsletter-copy">
                                        Product updates, design drops, and new generation workflows from EazyUI.
                                    </p>
                                    <div className="landing-footer-newsletter-form">
                                        <label className="landing-footer-email-field">
                                            <Mail size={15} />
                                            <input
                                                type="email"
                                                placeholder="name@email.com"
                                                aria-label="Email address"
                                                value={newsletterEmail}
                                                onChange={(event) => setNewsletterEmail(event.target.value)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        void handleNewsletterSignup();
                                                    }
                                                }}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => void handleNewsletterSignup()}
                                            className="landing-footer-signup-button"
                                            disabled={newsletterBusy || !newsletterEmail.trim()}
                                        >
                                            {newsletterBusy ? 'Sending...' : 'Sign up'}
                                        </button>
                                    </div>
                                    {newsletterStatus ? (
                                        <p className="landing-footer-newsletter-status">{newsletterStatus}</p>
                                    ) : null}
                                </div>

                                <div className="landing-footer-emblem" aria-hidden="true">
                                    <div className="landing-footer-emblem-ring landing-footer-emblem-ring-1" />
                                    <div className="landing-footer-emblem-ring landing-footer-emblem-ring-2" />
                                    <div className="landing-footer-emblem-ring landing-footer-emblem-ring-3" />
                                    <div className="landing-footer-emblem-node landing-footer-emblem-node-1" />
                                    <div className="landing-footer-emblem-node landing-footer-emblem-node-2" />
                                    <div className="landing-footer-emblem-node landing-footer-emblem-node-3" />
                                    <div className="landing-footer-emblem-node landing-footer-emblem-node-4" />
                                    <div className="landing-footer-emblem-core">
                                        <img src={appLogo} alt="" className="landing-footer-emblem-logo" />
                                    </div>
                                </div>
                            </div>

                            <div className="landing-footer-divider" />

                            <div className="landing-footer-bottom-row">
                                <div className="landing-footer-links-block">
                                    <h4>Useful links</h4>
                                    <div className="landing-footer-links-stack">
                                        <button type="button" onClick={() => onNavigate('/templates')} className="landing-footer-link">Careers</button>
                                        <button type="button" onClick={() => onNavigate('/learn')} className="landing-footer-link">Terms of Services</button>
                                        <button type="button" onClick={() => onNavigate('/learn')} className="landing-footer-link">Privacy Policy</button>
                                    </div>
                                </div>

                                <div className="landing-footer-follow-block">
                                    <h4>Follow us</h4>
                                    <div className="landing-footer-social-row">
                                        <a href="https://x.com" target="_blank" rel="noreferrer" className="landing-footer-social-icon" aria-label="X">
                                            <X size={16} />
                                        </a>
                                        <a href="https://youtube.com" target="_blank" rel="noreferrer" className="landing-footer-social-icon is-red" aria-label="YouTube">
                                            <Youtube size={16} />
                                        </a>
                                        <a href="https://instagram.com" target="_blank" rel="noreferrer" className="landing-footer-social-icon" aria-label="Instagram">
                                            <Instagram size={16} />
                                        </a>
                                        <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="landing-footer-social-icon is-blue" aria-label="LinkedIn">
                                            <Linkedin size={16} />
                                        </a>
                                    </div>

                                    <div className="landing-footer-signature">
                                        <div className="landing-footer-signature-brand">
                                            <img src={appLogo} alt="EazyUI logo" className="landing-footer-signature-logo" />
                                            <span>EazyUI</span>
                                        </div>
                                        <p>© Copyright 2026 EazyUI Inc. All rights reserved</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="landing-footer-bottom-half" aria-hidden="true">
                            <div className="landing-footer-wordmark">eazyui</div>
                        </div>
                    </motion.div>
                </footer>
            </main>
        </div>
    );
}
