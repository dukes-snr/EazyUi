import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Aperture, ArrowRight, ArrowUp, ArrowUpRight, Box, Brush, Camera, ChevronDown, Chrome, CircleStar, Code2, Figma, Framer, Gem, Layers, LineSquiggle, LogOut, Menu, Mic, Monitor, Palette, Paperclip, Pause, PenTool, Play, RotateCcw, Search, Smartphone, Smile, Sparkle, Sparkles, Square, Tablet, Type, Wand2, X, Zap } from 'lucide-react';
import appLogo from '../../assets/Ui-logo.svg';
import heroBackdropImage from '../../assets/hero-bg2.jpg';
import eazyuiWordmark from '../../assets/eazyui-text-edit.png';
import eazyuiWordmarkLight from '../../assets/eazyui-text-edit-light.png';
import { apiClient } from '../../api/client';
import type { DesignModelProfile } from '../../constants/designModels';
import { SHOWCASE_SCREEN_IMAGES } from '../../utils/showcaseImages';
import { GlassPricingSection } from '../marketing/GlassPricingSection';
import { ComposerAttachmentStack, MAX_COMPOSER_ATTACHMENTS } from '../ui/ComposerAttachmentStack';
import { CallToAction } from '../ui/cta-3';
import { StaggerTestimonials, type StaggerTestimonial } from '../ui/stagger-testimonials';
import { ComposerInlineReferenceInput, type ComposerInlineReferenceInputHandle } from '../ui/ComposerInlineReferenceInput';
import { ComposerAddMenu } from '../ui/ComposerAddMenu';
import { ComposerReferenceMenu } from '../ui/ComposerReferenceMenu';
import { LogoMark } from '../ui/LogoMark';
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
        referenceImageUrls?: string[];
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

const LANDING_SUGGESTION_TABS = [
    {
        key: 'suggested',
        label: 'Suggested',
        icon: CircleStar,
        prompts: [
            'Design a cinematic landing page for an AI design copilot called EazyUI with a premium dark theme, a refined product hero, trust indicators, animated showcase panels, a pricing section, and crisp call-to-action moments that make the product feel advanced, polished, and ready for serious teams.',
            'Create a conversion-focused website for a boutique digital studio that builds apps for startups, with a bold editorial hero, featured case studies, founder credibility, service breakdowns, testimonials, and a contact flow that feels premium rather than corporate.',
        ],
    },
    {
        key: 'wireframe',
        label: 'Wireframe',
        icon: Square,
        prompts: [
            'Generate a clean low-fidelity wireframe for a fintech onboarding flow with a welcome screen, account setup, identity verification, card linking, and a clear final success state, keeping the layout practical, realistic, and easy for a product team to review.',
            'Create a product planning dashboard wireframe with sidebar navigation, KPI modules, roadmap cards, workload charts, recent team activity, and a project status table, designed to feel structurally sound and presentation-ready for stakeholder feedback.',
        ],
    },
    {
        key: 'apps',
        label: 'Apps',
        icon: Smartphone,
        prompts: [
            'Design a mobile app for personal finance that includes account balances, smart budgeting, recurring bills, savings goals, recent transactions, and helpful insight cards, using a modern layout that feels trustworthy, clean, and genuinely useful day to day.',
            'Create a wellness coaching app with daily check-ins, guided sessions, streak tracking, progress milestones, coach messaging, and motivational summaries, with a calm interface that feels premium, human, and designed for long-term engagement.',
        ],
    },
    {
        key: 'websites',
        label: 'Websites',
        icon: Monitor,
        prompts: [
            'Build a high-end SaaS marketing site for a workflow automation platform with a layered hero, integration logos, product feature storytelling, interactive UI previews, customer proof, a pricing comparison, and a final CTA section that feels sharp and deliberate.',
            'Design a striking website for a modern hospitality brand with a large immersive hero, curated room highlights, dining and wellness sections, local experiences, elegant booking prompts, and a visual style that feels calm, elevated, and memorable.',
        ],
    },
    {
        key: 'prototype',
        label: 'Prototype',
        icon: Sparkles,
        prompts: [
            'Create a prototype-ready collaboration workspace with a command bar, contextual side panels, live activity feed, document cards, threaded comments, and polished interaction states so a product team can immediately imagine the click flow.',
            'Design a prototype concept for an AI shopping assistant that includes discovery, saved collections, product comparisons, detailed product views, conversational recommendations, and checkout preparation, with transitions and layout structure that feel ready for motion design.',
        ],
    },
] as const;
type LandingSuggestionTabKey = (typeof LANDING_SUGGESTION_TABS)[number]['key'];
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

const FEATURE_WORKFLOW_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260507_150203_44a5bd32-516a-47ce-a077-8acbf9aa8991.mp4';
const FEATURE_SCALE_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260507_154543_d5b83fc1-9cea-44f3-b5e8-8f325935211a.mp4';
const FEATURE_CONTROLS_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260507_153148_d7a3e1dd-e5d0-4ce6-8306-00d7522ecc44.mp4';

const FEATURE_WORKFLOW_ROWS = [
    ['01', 'Describe the idea', 'Plain language'],
    ['02', 'Add visual context', 'Images + URLs'],
    ['03', 'Generate every screen', 'Any device'],
    ['04', 'Refine and export', 'HTML + Figma'],
] as const;

const FEATURE_TOOL_ROWS = [
    [Figma, Framer, Palette, PenTool, Layers, Type, Aperture, Chrome],
    [Camera, Brush, Box, Wand2, Code2, Monitor, Smartphone, Sparkles],
] as const;

const LANDING_TESTIMONIALS: StaggerTestimonial[] = [
    {
        tempId: 0,
        testimonial: 'We replaced two weeks of rough wireframing with one afternoon of focused prompting, and the first pass was already good enough to review seriously.',
        by: 'Amara, Product Lead at Fluxboard',
        imgSrc: 'https://i.pravatar.cc/150?img=12',
    },
    {
        tempId: 1,
        testimonial: 'EazyUI gives us stronger first drafts, which means our design reviews start at refinement instead of trying to rescue weak structure.',
        by: 'David, Senior Designer at Northstar Fintech',
        imgSrc: 'https://i.pravatar.cc/150?img=15',
    },
    {
        tempId: 2,
        testimonial: 'The reference-aware workflow is the part that changed everything for us. We can finally steer output toward our actual product taste instead of generic UI.',
        by: 'Leila, Design Director at Pivotal Health',
        imgSrc: 'https://i.pravatar.cc/150?img=25',
    },
    {
        tempId: 3,
        testimonial: 'We use EazyUI as a first-draft engine for nearly every new feature now. It is fast enough for exploration and structured enough to keep.',
        by: 'Marcus, Founder at Layer Studio',
        imgSrc: 'https://i.pravatar.cc/150?img=33',
    },
    {
        tempId: 4,
        testimonial: 'Switching between mobile, tablet, and desktop before generation saves us from a lot of avoidable redesign work later in the process.',
        by: 'Nina, Product Manager at Atlas Suite',
        imgSrc: 'https://i.pravatar.cc/150?img=36',
    },
    {
        tempId: 5,
        testimonial: 'Voice prompting sounded minor at first, but it made ideation much faster for our team. We capture rough thoughts immediately and shape them after.',
        by: 'Jordan, UX Lead at Studio Relay',
        imgSrc: 'https://i.pravatar.cc/150?img=41',
    },
    {
        tempId: 6,
        testimonial: 'The output feels grounded in interface logic, not just visual styling. That is why our engineers trust it enough to start building from it.',
        by: 'Tomi, Frontend Lead at Beacon Cloud',
        imgSrc: 'https://i.pravatar.cc/150?img=49',
    },
    {
        tempId: 7,
        testimonial: 'It helps founders get to something credible quickly. Instead of describing a product vision abstractly, we can react to a strong UI direction right away.',
        by: 'Sofia, CEO at Branch Labs',
        imgSrc: 'https://i.pravatar.cc/150?img=52',
    },
];
const LANDING_FOOTER_COLUMNS = [
    [
        { label: 'Create', path: '/app' },
        { label: 'Templates', path: '/templates' },
        { label: 'Pricing', path: '/pricing' },
        { label: 'What’s New', path: '/changelog' },
        { label: 'Export to Figma', path: '/blog' },
    ],
    [
        { label: 'Learn', path: '/learn' },
        { label: 'Blog', path: '/blog' },
        { label: 'How to Prompt', path: '/blog' },
        { label: 'Contact Us', path: '/contact' },
    ],
    [
        { label: 'LinkedIn', href: 'https://linkedin.com' },
        { label: 'Follow Us on X', href: 'https://x.com' },
        { label: 'YouTube', href: 'https://youtube.com' },
    ],
] as const;

const DEMO_VIDEO_EMBED_BASE_URL = 'https://www.youtube.com/embed/euv60ydI54c?enablejsapi=1&rel=0&modestbranding=1&playsinline=1';
const HERO_VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_015952_e1deeb12-8fb7-4071-a42a-60779fc64ab6.mp4';

function VideoBackground() {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const cancelFade = () => {
        if (animationFrameRef.current !== null) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    };

    const fadeTo = (targetOpacity: number, duration = 250) => {
        const video = videoRef.current;
        if (!video) return;
        cancelFade();
        const startOpacity = Number.parseFloat(video.style.opacity || '0');
        const startedAt = performance.now();
        const animate = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / duration);
            video.style.opacity = String(startOpacity + ((targetOpacity - startOpacity) * progress));
            if (progress < 1) animationFrameRef.current = window.requestAnimationFrame(animate);
            else animationFrameRef.current = null;
        };
        animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handlePlaying = () => fadeTo(1);
        const handleEnded = () => {
            video.currentTime = 0;
            void video.play().catch(() => undefined);
        };

        video.addEventListener('playing', handlePlaying);
        video.addEventListener('ended', handleEnded);
        void video.play().catch(() => undefined);
        return () => {
            cancelFade();
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('ended', handleEnded);
        };
    }, []);

    return (
        <div className="landing-video-background" aria-hidden="true">
            <video
                ref={videoRef}
                className="landing-video-background__media"
                src={HERO_VIDEO_URL}
                muted
                playsInline
                preload="auto"
            />
            <div className="landing-video-background__veil" />
        </div>
    );
}

type HeroBackgroundMode = 'animated' | 'image';

// Switch `mode` between 'animated' and 'image'.
// To use another image, replace `imageSrc` with a different imported asset.
const HERO_BACKGROUND_CONFIG: {
    mode: HeroBackgroundMode;
    imageSrc: string;
    imageAlt: string;
    imagePosition: string;
} = {
    mode: 'animated',
    imageSrc: heroBackdropImage,
    imageAlt: 'Abstract hero background',
    imagePosition: 'center center',
};

function FeatureLabel({ children }: { children: string }) {
    return (
        <div className="landing-feature-mosaic__label">
            <Sparkle size={12} strokeWidth={1.5} />
            <span>{children}</span>
            <Sparkle size={12} strokeWidth={1.5} />
        </div>
    );
}

function FeatureVideo({ src }: { src: string }) {
    return <video className="landing-feature-mosaic__video" src={src} autoPlay loop muted playsInline preload="metadata" aria-hidden="true" />;
}

function FeatureMosaic({ onCreate, onContact }: { onCreate: () => void; onContact: () => void }) {
    return (
        <section className="landing-feature-mosaic">
            <div className="landing-feature-mosaic__header">
                <div>
                    <h2>Everything you need to move from idea to interface.</h2>
                    <p>Prompt in plain language, guide the direction with real references, generate across devices, and refine the result inside one focused AI design workspace.</p>
                </div>
                <button type="button" className="liquid-glass landing-feature-mosaic__header-cta" onClick={onCreate}>
                    Start creating today <ArrowUpRight size={16} strokeWidth={1.5} />
                </button>
            </div>

            <div className="landing-feature-mosaic__grid">
                <article className="landing-feature-mosaic__card landing-feature-mosaic__workflow">
                    <FeatureVideo src={FEATURE_WORKFLOW_VIDEO} />
                    <div className="landing-feature-mosaic__shade" />
                    <FeatureLabel>From prompt to product</FeatureLabel>
                    <div className="landing-feature-mosaic__timeline">
                        {FEATURE_WORKFLOW_ROWS.map(([number, title, detail]) => (
                            <div key={number} className="landing-feature-mosaic__timeline-row">
                                <span>{number}</span>
                                <Sparkle size={12} strokeWidth={1.5} />
                                <strong>{title}</strong>
                                <span>{detail}</span>
                            </div>
                        ))}
                    </div>
                </article>

                <div className="landing-feature-mosaic__stack landing-feature-mosaic__stack-middle">
                    <article className="landing-feature-mosaic__card landing-feature-mosaic__voice noise-overlay">
                        <FeatureLabel>Customer voice</FeatureLabel>
                        <blockquote>“EazyUI gives us stronger first drafts, so our reviews start at refinement instead of trying to rescue weak structure.”</blockquote>
                        <p><strong>David Chen</strong><span>Senior Designer · Northstar</span></p>
                    </article>
                    <article className="landing-feature-mosaic__card landing-feature-mosaic__scale">
                        <FeatureVideo src={FEATURE_SCALE_VIDEO} />
                        <div className="landing-feature-mosaic__shade" />
                        <strong>140K+</strong>
                        <span>creators designing with EazyUI</span>
                    </article>
                </div>

                <div className="landing-feature-mosaic__stack landing-feature-mosaic__stack-right">
                    <article className="landing-feature-mosaic__card landing-feature-mosaic__controls">
                        <FeatureVideo src={FEATURE_CONTROLS_VIDEO} />
                        <div className="landing-feature-mosaic__shade" />
                        <FeatureLabel>Design controls</FeatureLabel>
                        <div className="landing-feature-mosaic__marquees">
                            {FEATURE_TOOL_ROWS.map((row, rowIndex) => (
                                <div key={rowIndex} className="landing-feature-mosaic__marquee-mask">
                                    <div className={rowIndex === 0 ? 'animate-feature-marquee-left' : 'animate-feature-marquee-right'}>
                                        {[...row, ...row].map((Icon, iconIndex) => (
                                            <span key={`${rowIndex}-${iconIndex}`} className="liquid-glass landing-feature-mosaic__tool">
                                                <Icon size={22} strokeWidth={1.5} />
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </article>
                    <article className="landing-feature-mosaic__card landing-feature-mosaic__contact noise-overlay">
                        <FeatureLabel>Build with us</FeatureLabel>
                        <button type="button" onClick={onContact} aria-label="Contact EazyUI">
                            <ArrowUpRight size={18} strokeWidth={1.5} />
                        </button>
                        <div>
                            <strong>Talk to the team</strong>
                            <span>Support, partnerships, and product questions</span>
                        </div>
                    </article>
                </div>
            </div>
        </section>
    );
}

export function LandingPage(props: LandingPageProps) {
    const { onStart, onNavigate, userProfile, onSignOut, onSendVerification, verificationBusy } = props;
    const theme = useUiStore((state) => state.theme);
    const heroBackgroundMode = HERO_BACKGROUND_CONFIG.mode;
    const useDarkHeroForeground = heroBackgroundMode === 'animated' || heroBackgroundMode === 'image';
    const heroWordmark = useDarkHeroForeground
        ? eazyuiWordmark
        : theme === 'light'
            ? eazyuiWordmarkLight
            : eazyuiWordmark;
    const [prompt, setPrompt] = useState('');
    const [activeSuggestionTab, setActiveSuggestionTab] = useState<LandingSuggestionTabKey | null>(null);
    const [activeSuggestionPrompt, setActiveSuggestionPrompt] = useState<string>(LANDING_SUGGESTION_TABS[0].prompts[1]);
    const [images, setImages] = useState<string[]>([]);
    const [platform, setPlatform] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
    const [stylePreset, setStylePreset] = useState<'modern' | 'minimal' | 'vibrant' | 'luxury' | 'playful'>('modern');
    const [modelProfile, setModelProfile] = useState<DesignModelProfile>('quality');
    const [showStyleMenu, setShowStyleMenu] = useState(false);
    const [isHeroNavOpen, setIsHeroNavOpen] = useState(false);
    const [, setIsPromptFocused] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isReferenceMenuOpen, setIsReferenceMenuOpen] = useState(false);
    const [isDemoHovered, setIsDemoHovered] = useState(false);
    const [isDemoPlaying, setIsDemoPlaying] = useState(false);
    const [referenceMenuMode, setReferenceMenuMode] = useState<'root' | 'url'>('root');
    const [referenceRootQuery, setReferenceRootQuery] = useState('');
    const [referenceActiveIndex, setReferenceActiveIndex] = useState(0);
    const [referenceUrlDraft, setReferenceUrlDraft] = useState('');
    const [referenceIncludeScrapedImages, setReferenceIncludeScrapedImages] = useState(false);
    const [referenceEditingUrl, setReferenceEditingUrl] = useState<string | null>(null);
    const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
    const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const demoVideoRef = useRef<HTMLIFrameElement | null>(null);
    const demoScreensSectionRef = useRef<HTMLElement | null>(null);
    const styleMenuRef = useRef<HTMLDivElement | null>(null);
    const promptTextareaRef = useRef<ComposerInlineReferenceInputHandle | null>(null);
    const referenceMenuRef = useRef<HTMLDivElement | null>(null);
    const referenceUrlInputRef = useRef<HTMLInputElement | null>(null);
    const addMenuRef = useRef<HTMLDivElement | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const referenceTriggerRangeRef = useRef<ComposerReferenceTextRange | null>(null);
    const shouldReduceMotion = useReducedMotion();
    const demoVideoEmbedUrl = useMemo(() => {
        if (typeof window === 'undefined') return DEMO_VIDEO_EMBED_BASE_URL;
        return `${DEMO_VIDEO_EMBED_BASE_URL}&origin=${encodeURIComponent(window.location.origin)}`;
    }, []);
    const rootReferenceOptions = useMemo(
        () => getFilteredComposerReferenceRootOptions(referenceRootQuery, false),
        [referenceRootQuery]
    );
    const activeLandingSuggestionTab = useMemo(
        () => LANDING_SUGGESTION_TABS.find((tab) => tab.key === activeSuggestionTab) || null,
        [activeSuggestionTab]
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
            referenceImageUrls: referenceImageUrls.filter((url) => parsedReferences.urlReferences.some((item) => item.url === url)),
        });
    };

    const closeReferenceMenu = () => {
        setIsReferenceMenuOpen(false);
        setReferenceMenuMode('root');
        setReferenceRootQuery('');
        setReferenceActiveIndex(0);
        setReferenceUrlDraft('');
        setReferenceIncludeScrapedImages(false);
        setReferenceEditingUrl(null);
        referenceTriggerRangeRef.current = null;
    };

    const closeAddMenu = () => setIsAddMenuOpen(false);

    const syncReferenceTrigger = (value: string, cursor: number) => {
        const match = findComposerReferenceTrigger(value, cursor);
        if (!match) {
            closeReferenceMenu();
            return;
        }
        referenceTriggerRangeRef.current = match.range;
        setReferenceRootQuery(match.query);
        setReferenceMenuMode('root');
        setIsReferenceMenuOpen(true);
    };

    const openUrlReferenceInput = (source: 'trigger' | 'append' = 'trigger') => {
        if (source === 'append') {
            const currentValue = promptTextareaRef.current?.getValue() ?? prompt;
            referenceTriggerRangeRef.current = {
                start: currentValue.length,
                end: currentValue.length,
            };
        }
        setReferenceMenuMode('url');
        setReferenceActiveIndex(0);
        setReferenceUrlDraft('');
        setReferenceIncludeScrapedImages(false);
        setReferenceEditingUrl(null);
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
        setReferenceImageUrls((prev) => {
            const next = new Set(prev);
            if (referenceEditingUrl) next.delete(referenceEditingUrl);
            if (referenceIncludeScrapedImages) next.add(normalized);
            else next.delete(normalized);
            return Array.from(next);
        });
        closeReferenceMenu();
        window.setTimeout(() => {
            const target = promptTextareaRef.current;
            if (!target) return;
            target.focus();
            target.setSelectionRange(result.cursor, result.cursor);
        }, 0);
    };

    const handleReferenceTokenClick = (reference: { kind: 'url' | 'screen'; range: { start: number; end: number }; url?: string }) => {
        if (reference.kind !== 'url' || !reference.url) return;
        closeAddMenu();
        referenceTriggerRangeRef.current = reference.range;
        setReferenceMenuMode('url');
        setReferenceActiveIndex(0);
        setReferenceUrlDraft(reference.url);
        setReferenceIncludeScrapedImages(referenceImageUrls.includes(reference.url));
        setReferenceEditingUrl(reference.url);
        setIsReferenceMenuOpen(true);
    };

    const handlePromptChange = (value: string, cursor: number) => {
        setPrompt(value);
        syncReferenceTrigger(value, cursor);
    };

    const applyLandingSuggestion = (nextPrompt: string) => {
        setPrompt(nextPrompt);
        setActiveSuggestionPrompt(nextPrompt);
        window.setTimeout(() => {
            const target = promptTextareaRef.current;
            if (!target) return;
            target.focus();
            target.setSelectionRange(nextPrompt.length, nextPrompt.length);
        }, 0);
    };

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const availableSlots = Math.max(0, MAX_COMPOSER_ATTACHMENTS - images.length);
        if (availableSlots === 0) {
            e.target.value = '';
            return;
        }

        Array.from(files).slice(0, availableSlots).forEach((file) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = typeof reader.result === 'string' ? reader.result : '';
                if (!base64) return;
                setImages((prev) => (prev.length >= MAX_COMPOSER_ATTACHMENTS ? prev : [...prev, base64]));
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
        if (!isAddMenuOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (addMenuRef.current?.contains(event.target as Node)) return;
            closeAddMenu();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isAddMenuOpen]);

    useEffect(() => {
        if (!showStyleMenu) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (!styleMenuRef.current?.contains(event.target as Node)) setShowStyleMenu(false);
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [showStyleMenu]);

    useEffect(() => {
        const iframe = demoVideoRef.current;
        if (!iframe || typeof window === 'undefined') return;

        const postCommand = (func: string, args: unknown[] = []) => {
            iframe.contentWindow?.postMessage(JSON.stringify({
                event: 'command',
                func,
                args,
            }), 'https://www.youtube.com');
        };

        const registerStateListener = () => {
            postCommand('addEventListener', ['onStateChange']);
        };

        const handleMessage = (event: MessageEvent) => {
            if (!String(event.origin).includes('youtube.com')) return;

            let payload: any = event.data;
            if (typeof payload === 'string') {
                try {
                    payload = JSON.parse(payload);
                } catch {
                    return;
                }
            }

            const nextState = typeof payload?.info === 'number'
                ? payload.info
                : typeof payload?.info?.playerState === 'number'
                    ? payload.info.playerState
                    : null;

            if (nextState === null) return;
            setIsDemoPlaying(nextState === 1 || nextState === 3);
        };

        iframe.addEventListener('load', registerStateListener);
        window.addEventListener('message', handleMessage);
        registerStateListener();

        return () => {
            iframe.removeEventListener('load', registerStateListener);
            window.removeEventListener('message', handleMessage);
        };
    }, [demoVideoEmbedUrl]);

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
    const StyleIcon = stylePreset === 'minimal'
        ? LineSquiggle
        : stylePreset === 'vibrant'
            ? Palette
            : stylePreset === 'luxury'
                ? Gem
                : stylePreset === 'playful'
                    ? Smile
                    : CircleStar;
    const postDemoVideoCommand = (func: string, args: unknown[] = []) => {
        demoVideoRef.current?.contentWindow?.postMessage(JSON.stringify({
            event: 'command',
            func,
            args,
        }), 'https://www.youtube.com');
    };
    const toggleDemoPlayback = () => {
        if (isDemoPlaying) {
            setIsDemoPlaying(false);
            postDemoVideoCommand('pauseVideo');
            return;
        }
        setIsDemoPlaying(true);
        postDemoVideoCommand('playVideo');
    };
    const restartDemoVideo = () => {
        setIsDemoPlaying(true);
        postDemoVideoCommand('seekTo', [0, true]);
        postDemoVideoCommand('playVideo');
    };
    return (
        <div
            ref={scrollContainerRef}
            className="landing-scroll-shell h-screen w-full overflow-y-auto bg-[var(--ui-surface-1)] text-[var(--ui-text)] relative"
        >
            <main className="relative z-10 px-0 pb-0">
                {/*Hero section*/}
                <section className="landing-data-hero">
                    <VideoBackground />
                    <nav className="landing-data-nav" aria-label="Primary navigation">
                        <button type="button" className="landing-data-logo" onClick={() => onNavigate('/')}>
                            <img src={appLogo} alt="" />
                            <span>EazyUI</span>
                        </button>
                        <div className={`landing-data-nav__links ${isHeroNavOpen ? 'is-open' : ''}`}>
                            <button type="button" onClick={() => { setIsHeroNavOpen(false); onNavigate('/templates'); }}>Templates</button>
                            <button type="button" onClick={() => { setIsHeroNavOpen(false); demoScreensSectionRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>
                                Features <ChevronDown size={14} />
                            </button>
                            <button type="button" onClick={() => { setIsHeroNavOpen(false); onNavigate('/pricing'); }}>Pricing</button>
                            <button type="button" onClick={() => { setIsHeroNavOpen(false); onNavigate('/blog'); }}>Learn</button>
                            <button type="button" onClick={() => { setIsHeroNavOpen(false); onNavigate('/changelog'); }}>What's New</button>
                        </div>
                        <div className="landing-data-nav__actions">
                            {userProfile ? (
                                <>
                                    {!userProfile.emailVerified && (
                                        <button
                                            type="button"
                                            className="landing-data-nav__verify"
                                            onClick={onSendVerification}
                                            disabled={verificationBusy}
                                        >
                                            {verificationBusy ? 'Sending...' : 'Verify email'}
                                        </button>
                                    )}
                                    <button type="button" className="landing-data-nav__profile" onClick={() => onNavigate('/app')}>
                                        <img src={userProfile.photoUrl || appLogo} alt="" />
                                        <span>{userProfile.name}</span>
                                    </button>
                                    <button type="button" className="landing-data-nav__icon" onClick={onSignOut} aria-label="Sign out">
                                        <LogOut size={15} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button type="button" className="landing-data-nav__signup" onClick={() => onNavigate('/login')}>Sign Up</button>
                                    <button type="button" className="landing-data-nav__login" onClick={() => onNavigate('/login')}>Log In</button>
                                </>
                            )}
                            <button
                                type="button"
                                className="landing-data-nav__menu"
                                onClick={() => setIsHeroNavOpen((open) => !open)}
                                aria-label={isHeroNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                                aria-expanded={isHeroNavOpen}
                            >
                                {isHeroNavOpen ? <X size={16} /> : <Menu size={16} />}
                            </button>
                        </div>
                    </nav>

                    <div className="landing-data-hero__content">
                        <div className="landing-data-badge">
                            <span><CircleStar size={14} /> EazyUI</span>
                            <strong>From idea to interface</strong>
                        </div>
                        <div className="landing-data-heading">
                            <h1>UI Generation Made Easy</h1>
                            <p>Describe your product, add references, and generate polished screens and responsive interfaces in seconds.</p>
                        </div>

                        <div className="landing-data-composer">
                            <ComposerAttachmentStack
                                images={images}
                                onRemove={(index) => setImages((prev) => prev.filter((_, idx) => idx !== index))}
                                className="landing-data-attachment-stack"
                                size="compact"
                            />
                            <div className="landing-data-composer__meta">
                                <div><span>60/450 credits</span><button type="button" onClick={() => onNavigate('/pricing')}>Upgrade</button></div>
                                <span><Sparkles size={14} /> Powered by EazyUI-AI</span>
                            </div>
                            <div className="landing-data-composer__input">
                                <div className="landing-data-composer__editor">
                                        <ComposerInlineReferenceInput
                                            ref={promptTextareaRef}
                                            value={prompt}
                                            onChange={handlePromptChange}
                                            onSelectionChange={syncReferenceTrigger}
                                            onReferenceClick={handleReferenceTokenClick}
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
                                                            if (choice?.key === 'url') openUrlReferenceInput('trigger');
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
                                            placeholder="Type question..."
                                            placeholderClassName="text-left text-black/60"
                                            className="no-focus-ring min-h-[74px] max-h-[96px] w-full overflow-y-auto border-0 bg-transparent p-0 text-left text-[16px] leading-6 text-black ring-0 focus:border-0 focus:ring-0"
                                        />
                                    <button type="button" className="landing-data-composer__submit" onClick={submit} disabled={!prompt.trim()} aria-label="Submit prompt">
                                        <ArrowUp size={17} />
                                    </button>
                                </div>
                                <div className="landing-data-composer__footer">
                                    <div className="landing-data-composer__tools">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={handleFileSelect}
                                        />
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsReferenceMenuOpen(false);
                                                setIsAddMenuOpen((open) => !open);
                                            }}
                                        >
                                            <Paperclip size={14} /> Attach
                                        </button>
                                        {isAddMenuOpen && (
                                            <ComposerAddMenu
                                                menuRef={addMenuRef}
                                                onAddFiles={() => {
                                                    closeAddMenu();
                                                    fileInputRef.current?.click();
                                                }}
                                                onAddUrl={() => {
                                                    closeAddMenu();
                                                    openUrlReferenceInput('append');
                                                }}
                                            />
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void handleMicToggle()}
                                        className={isRecording ? 'is-active' : ''}
                                        disabled={isTranscribing}
                                        title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing voice' : 'Record voice prompt'}
                                    >
                                        <Mic size={14} /> {isRecording ? 'Stop' : isTranscribing ? 'Working' : 'Voice'}
                                    </button>
                                    <button type="button" onClick={() => setActiveSuggestionTab((current) => current ? null : 'suggested')}>
                                        <Search size={14} /> Prompts
                                    </button>
                                    </div>
                                    <div className="landing-data-composer__settings">
                                        <div className="landing-data-control-group" aria-label="Target device">
                                            {(['mobile', 'tablet', 'desktop'] as const).map((target) => (
                                                <button
                                                    key={target}
                                                    type="button"
                                                    className={platform === target ? 'is-selected' : ''}
                                                    onClick={() => setPlatform(target)}
                                                    title={`Generate for ${target}`}
                                                >
                                                    {target === 'mobile' ? <Smartphone size={13} /> : target === 'tablet' ? <Tablet size={13} /> : <Monitor size={13} />}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="landing-data-control-group" aria-label="Model profile">
                                            <button type="button" className={modelProfile === 'fast' ? 'is-selected' : ''} onClick={() => setModelProfile('fast')} title="Fast model">
                                                <Zap size={13} />
                                            </button>
                                            <button type="button" className={modelProfile === 'quality' ? 'is-selected' : ''} onClick={() => setModelProfile('quality')} title="Quality model">
                                                <Sparkles size={13} />
                                            </button>
                                        </div>
                                        <div ref={styleMenuRef} className="landing-data-style-control">
                                            <button type="button" onClick={() => setShowStyleMenu((open) => !open)} title={`Style: ${stylePreset}`}>
                                                <StyleIcon size={13} />
                                            </button>
                                            {showStyleMenu && (
                                                <div className="landing-data-style-menu">
                                                    {(['modern', 'minimal', 'vibrant', 'luxury', 'playful'] as const).map((preset) => (
                                                        <button
                                                            key={preset}
                                                            type="button"
                                                            className={stylePreset === preset ? 'is-selected' : ''}
                                                            onClick={() => {
                                                                setStylePreset(preset);
                                                                setShowStyleMenu(false);
                                                            }}
                                                        >
                                                            {preset}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <span>{prompt.length.toLocaleString()}/3,000</span>
                                    </div>
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
                                    if (key === 'url') openUrlReferenceInput('trigger');
                                }}
                                onSubmitUrl={submitUrlReference}
                                includeScrapedImages={referenceIncludeScrapedImages}
                                rootOptions={rootReferenceOptions}
                                urlDraft={referenceUrlDraft}
                                urlInputRef={referenceUrlInputRef}
                                onIncludeScrapedImagesChange={setReferenceIncludeScrapedImages}
                                onUrlDraftChange={setReferenceUrlDraft}
                            />
                            )}
                            {activeLandingSuggestionTab ? (
                            <div className="landing-data-prompts">
                                <div className="landing-data-prompts__tabs">
                                    {LANDING_SUGGESTION_TABS.map((tab) => {
                                        const TabIcon = tab.icon;
                                        return (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                className={activeSuggestionTab === tab.key ? 'is-active' : ''}
                                                onClick={() => {
                                                    setActiveSuggestionTab(tab.key);
                                                    setActiveSuggestionPrompt(tab.prompts[1] || tab.prompts[0]);
                                                }}
                                            >
                                                <TabIcon size={12} /> {tab.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {activeLandingSuggestionTab.prompts.map((suggestion, index) => {
                                    const isFeatured = activeSuggestionPrompt === suggestion || (!activeSuggestionPrompt && index === 1);
                                    return (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => applyLandingSuggestion(suggestion)}
                                            className={isFeatured ? 'is-featured' : ''}
                                            title={suggestion}
                                        >
                                            <Sparkles size={13} /><span>{suggestion}</span><ArrowRight size={14} />
                                        </button>
                                    );
                                })}
                            </div>
                            ) : null}
                        </div>
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

                {/*Screens demo section*/}
                <motion.section
                    ref={demoScreensSectionRef}
                    className={`landing-page-section landing-screens-overlap-section landing-hero-followup relative z-20 w-full max-w-none${activeLandingSuggestionTab ? ' is-expanded' : ''}`}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 36, scale: 0.985 }}
                    whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="landing-hero-followup__intro">
                        <span>Prompt. Generate. Refine.</span>
                        <h2>Go from a rough idea to product-ready UI.</h2>
                        <p>Start with a prompt or visual reference, then explore screens built for real product workflows.</p>
                    </div>
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
                <section className="landing-surface-band landing-surface-band-2 landing-page-section landing-demo-section">
                    <div className="landing-demo-section__inner">
                    <motion.div
                        className="landing-section-heading flex flex-col gap-4 px-4 text-center md:px-0"
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
                            className="landing-ink-button"
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
                            <iframe
                                ref={demoVideoRef}
                                className="landing-demo-video"
                                src={demoVideoEmbedUrl}
                                title="EazyUI demo video"
                                loading="lazy"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerPolicy="strict-origin-when-cross-origin"
                                allowFullScreen
                            />
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

                {/*Feature accordion section*/}
                {/* <section className="landing-surface-band landing-surface-band-1 landing-page-section">
                    <div className="landing-page-section-inner landing-page-section-inner-full">
                        <motion.div
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 44 }}
                            whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.2 }}
                            transition={{ duration: 0.82, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <FeatureAccordionSection features={LANDING_APP_FEATURES} />
                        </motion.div>
                    </div>
                </section> */}

                {/*Features section*/}
                <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 50 }}
                    whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.12 }}
                    transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                >
                    <FeatureMosaic
                        onCreate={() => onNavigate('/app')}
                        onContact={() => onNavigate('/contact')}
                    />
                </motion.div>

                {/*pricing section*/}
                <section className="landing-surface-band landing-surface-band-2 landing-page-section landing-pricing-section">
                    <GlassPricingSection
                        className=""
                        onGetStarted={() => setPrompt('Design a premium SaaS pricing page with calm typography, elegant comparisons, and a clear featured plan')}
                    />
                </section>

                {/*testimonial section*/}
                <section className="landing-surface-band landing-surface-band-1 landing-page-section landing-testimonial-section">
                    <div className="landing-page-section-inner landing-page-section-inner-full">
                        <motion.div
                            className="landing-section-heading text-center"
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
                        className="mx-auto mt-14 w-full max-w-[1480px] px-4 md:px-8"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 52 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.18 }}
                        transition={{ duration: 0.9, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <StaggerTestimonials testimonials={LANDING_TESTIMONIALS} />
                    </motion.div>
                </section>

                {/*cta section*/}
                <section className="landing-surface-band landing-surface-band-1 landing-page-section landing-cta-section pt-6 md:pt-10">
                    <motion.div
                        className="px-4 md:px-6"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 44 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.35 }}
                        transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <CallToAction
                            onContactSales={() => onNavigate('/contact')}
                            onGetStarted={() => onNavigate('/app')}
                        />
                    </motion.div>
                </section>

                {/*footer section*/}
                <footer className="site-footer">
                    <div className="footer-dots" aria-hidden="true">
                        <div className="footer-dots__line" />
                    </div>
                    <motion.div
                        className="site-footer__inner"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 56 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.88, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="site-footer__top">
                            <h2>Ideas become polished product interfaces faster with EazyUI.</h2>
                            {LANDING_FOOTER_COLUMNS.map((column, columnIndex) => (
                                <nav
                                    key={columnIndex}
                                    className="site-footer__nav"
                                    aria-label={columnIndex === 0 ? 'Footer navigation' : columnIndex === 1 ? 'Company links' : 'Social links'}
                                >
                                    {column.map((item) => (
                                        'href' in item ? (
                                            <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
                                        ) : (
                                            <button key={item.label} type="button" onClick={() => onNavigate(item.path)}>{item.label}</button>
                                        )
                                    ))}
                                </nav>
                            ))}
                        </div>

                        <div className="site-footer__brand-row">
                            <button type="button" className="site-footer__brand" onClick={() => onNavigate('/')} aria-label="EazyUI home">
                                <LogoMark className="site-footer__mark" />
                                <span>EazyUI</span>
                            </button>
                        </div>

                        <div className="site-footer__legal">
                            <p>© 2026 EazyUI. All rights reserved.</p>
                            <button type="button" onClick={() => onNavigate('/blog')}>Privacy Policy</button>
                            <button type="button" onClick={() => onNavigate('/blog')}>Terms of Use</button>
                            <button
                                type="button"
                                onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: shouldReduceMotion ? 'auto' : 'smooth' })}
                            >
                                Back to top
                            </button>
                        </div>
                    </motion.div>
                </footer>
            </main>
        </div>
    );
}
