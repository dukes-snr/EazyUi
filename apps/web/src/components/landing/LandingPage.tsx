import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { ArrowRight, ArrowUp, CircleStar, Gem, LineSquiggle, Linkedin, Menu, Mic, Monitor, Moon, Palette, Pause, Play, Plus, RotateCcw, Smartphone, Smile, Sparkles, Square, Sun, Tablet, X, Youtube, Zap } from 'lucide-react';
import featureSlide1 from '../../assets/Slide1.png';
import featureSlide2 from '../../assets/Slide2.png';
import featureSlide3 from '../../assets/Slide3.png';
import featureSlide4 from '../../assets/Slide4.png';
import appLogo from '../../assets/Ui-logo.png';
import heroBackdropImage from '../../assets/hero-bg2.jpg';
import mascotComposer from '../../assets/mascot-composer.png';
import eazyuiWordmark from '../../assets/eazyui-text-edit.png';
import eazyuiWordmarkLight from '../../assets/eazyui-text-edit-light.png';
import { apiClient } from '../../api/client';
import type { DesignModelProfile } from '../../constants/designModels';
import { SHOWCASE_SCREEN_IMAGES } from '../../utils/showcaseImages';
import { useOrbVisuals, type OrbActivityState } from '../../utils/orbVisuals';
import { GlassPricingSection } from '../marketing/GlassPricingSection';
import { ComposerAttachmentStack, MAX_COMPOSER_ATTACHMENTS } from '../ui/ComposerAttachmentStack';
import { AnimatedGridPattern } from '../ui/animated-grid-pattern';
import { CallToAction } from '../ui/cta-3';
import { Orb } from '../ui/Orb';
import { StaggerTestimonials, type StaggerTestimonial } from '../ui/stagger-testimonials';
import { ComposerInlineReferenceInput, type ComposerInlineReferenceInputHandle } from '../ui/ComposerInlineReferenceInput';
import { ComposerAddMenu } from '../ui/ComposerAddMenu';
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
const TYPED_PLACEHOLDER_SUGGESTIONS = [
    'Design a premium AI workspace landing page with a dark editorial hero, product storytelling, polished dashboard previews, customer proof, and a pricing section that feels ready to launch...',
    'Create a mobile finance app with intelligent budgeting, savings goals, transaction insights, recurring bills, and a trustworthy visual language that feels modern but grounded...',
    'Build a prototype-ready team collaboration dashboard with command search, live activity, document modules, project views, and interaction states that feel realistic enough to test...',
    'Generate a luxury hospitality website with cinematic imagery, room highlights, wellness experiences, booking prompts, and a refined layout that feels calm, elevated, and premium...',
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
const MARKETING_NAV_LINKS = [
    { label: 'Templates', path: '/templates' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Blog', path: '/blog' },
    { label: "What's New", path: '/changelog' },
] as const;

type LandingFooterLinkItem = {
    label: string;
    path?: string;
    href?: string;
};

type LandingFooterColumn = {
    title: string;
    items: LandingFooterLinkItem[];
};

const LANDING_FOOTER_COLUMNS: LandingFooterColumn[] = [
    {
        title: 'Product',
        items: [
            { label: 'Create', path: '/app' },
            { label: 'Templates', path: '/templates' },
            { label: 'Components', path: '/blog' },
            { label: 'Assets', path: '/blog' },
            { label: 'Pricing', path: '/pricing' },
            { label: 'Changelog', path: '/changelog' },
        ],
    },
    {
        title: 'Resources',
        items: [
            { label: 'Introduction', path: '/blog' },
            { label: 'How to Prompt', path: '/blog' },
            { label: 'How to Edit', path: '/blog' },
            { label: 'Sell Templates', path: '/templates' },
            { label: 'Affiliates', path: '/contact' },
            { label: 'FAQ', path: '/blog' },
        ],
    },
    {
        title: 'What We Use',
        items: [
            { label: 'Mobbin', href: 'https://mobbin.com' },
            { label: 'Screen Studio', href: 'https://www.screen.studio' },
            { label: 'Courses', path: '/blog' },
            { label: 'UI Kit', path: '/templates' },
            { label: 'Video Editor', href: 'https://www.adobe.com/products/premiere.html' },
            { label: 'Mockups', path: '/templates' },
        ],
    },
    {
        title: 'Connect',
        items: [
            { label: 'Privacy', path: '/blog' },
            { label: 'Terms', path: '/blog' },
            { label: 'Support', path: '/contact' },
            { label: 'Report Issue', path: '/contact' },
            { label: 'LinkedIn', href: 'https://linkedin.com' },
            { label: 'X', href: 'https://x.com' },
        ],
    },
] as const;

const LANDING_FOOTER_SOCIALS = [
    { label: 'X', href: 'https://x.com', icon: X },
    { label: 'YouTube', href: 'https://youtube.com', icon: Youtube },
    { label: 'LinkedIn', href: 'https://linkedin.com', icon: Linkedin },
] as const;

const DEMO_VIDEO_EMBED_BASE_URL = 'https://www.youtube.com/embed/euv60ydI54c?enablejsapi=1&rel=0&modestbranding=1&playsinline=1';

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

export function LandingPage({ onStart, onNavigate, userProfile, onSignOut, onSendVerification, verificationBusy = false }: LandingPageProps) {
    const currentPath = window.location.pathname;
    const theme = useUiStore((state) => state.theme);
    const toggleTheme = useUiStore((state) => state.toggleTheme);
    const heroWordmark = theme === 'light' ? eazyuiWordmarkLight : eazyuiWordmark;
    const heroBackgroundMode = HERO_BACKGROUND_CONFIG.mode;
    const useDarkHeroForeground = heroBackgroundMode === 'animated' || heroBackgroundMode === 'image';
    const [prompt, setPrompt] = useState('');
    const [activeSuggestionTab, setActiveSuggestionTab] = useState<LandingSuggestionTabKey | null>(null);
    const [activeSuggestionPrompt, setActiveSuggestionPrompt] = useState<string>(LANDING_SUGGESTION_TABS[0].prompts[1]);
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
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [isDemoHovered, setIsDemoHovered] = useState(false);
    const [isDemoPlaying, setIsDemoPlaying] = useState(false);
    const [featureShowcaseOffset, setFeatureShowcaseOffset] = useState(0);
    const [featureShowcaseScrollSpan, setFeatureShowcaseScrollSpan] = useState(2200);
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
    const featureShowcaseSectionRef = useRef<HTMLElement | null>(null);
    const featureShowcaseViewportRef = useRef<HTMLDivElement | null>(null);
    const featureShowcaseTrackRef = useRef<HTMLDivElement | null>(null);
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
    const { scrollY, scrollYProgress } = useScroll({ container: scrollContainerRef });
    const demoVideoEmbedUrl = useMemo(() => {
        if (typeof window === 'undefined') return DEMO_VIDEO_EMBED_BASE_URL;
        return `${DEMO_VIDEO_EMBED_BASE_URL}&origin=${encodeURIComponent(window.location.origin)}`;
    }, []);
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

    const closeAddMenu = () => {
        setIsAddMenuOpen(false);
    };

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
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeAddMenu();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isAddMenuOpen]);

    useEffect(() => {
        setIsMobileNavOpen(false);
    }, [currentPath, userProfile?.email]);

    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth >= 1024) {
                setIsMobileNavOpen(false);
            }
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
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
            const snapOffsets = Array.from(track.children)
                .map((child) => {
                    const element = child as HTMLElement;
                    const centeredOffset = element.offsetLeft + (element.offsetWidth / 2) - (viewport.clientWidth / 2);
                    return Math.min(Math.max(centeredOffset, 0), maxOffset);
                });
            const snapCount = Math.max(snapOffsets.length, 1);
            const snapIndex = snapCount === 1 ? 0 : Math.min(
                Math.round(progress * (snapCount - 1)),
                snapCount - 1,
            );
            const nextOffset = snapOffsets[snapIndex] ?? 0;
            const nextScrollSpan = Math.max(viewportHeight * (snapCount + 0.6), viewportHeight * 2.4);

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
    const hasPromptText = prompt.trim().length > 0;
    const showSendAction = hasPromptText;
    const actionIsStop = isRecording;
    const actionDisabled = isTranscribing && !isRecording;
    const landingOrbActivity: OrbActivityState = (isRecording || isTranscribing || showSendAction) ? 'talking' : 'idle';
    const { agentState: landingOrbState, colors: landingOrbColors } = useOrbVisuals(landingOrbActivity);
    const landingOrbInput = isRecording ? 0.9 : isTranscribing ? 0.58 : showSendAction ? 0.45 : 0.2;
    const landingOrbOutput = (showSendAction || isRecording || isTranscribing) ? 0.5 : 0.2;
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
        ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)] ring-[color:color-mix(in_srgb,var(--ui-primary)_30%,transparent)] hover:bg-[var(--ui-surface-1)]'
        : stylePreset === 'vibrant'
            ? 'bg-[var(--ui-surface-1)] text-emerald-300 ring-emerald-300/35 hover:bg-[var(--ui-surface-1)]'
            : stylePreset === 'luxury'
                ? 'bg-[var(--ui-surface-1)] text-amber-300 ring-amber-300/35 hover:bg-[var(--ui-surface-1)]'
                : stylePreset === 'playful'
                    ? 'bg-[var(--ui-surface-1)] text-fuchsia-300 ring-fuchsia-300/35 hover:bg-[var(--ui-surface-1)]'
                    : 'bg-[var(--ui-surface-1)] text-[var(--ui-primary)] ring-[color:color-mix(in_srgb,var(--ui-primary)_38%,transparent)] hover:bg-[var(--ui-surface-1)]';

    return (
        <div
            ref={scrollContainerRef}
            className="landing-scroll-shell h-screen w-full overflow-y-auto bg-[var(--ui-surface-1)] text-[var(--ui-text)] relative"
        >
            <div className="landing-background-stack pointer-events-none absolute inset-x-0 top-0">
                <motion.div
                    className={`landing-hero-backdrop absolute inset-0 ${heroBackgroundMode === 'image' ? 'is-image' : 'is-animated'}`}
                    style={{
                        y: shouldReduceMotion ? 0 : backgroundY,
                        scale: shouldReduceMotion ? 1 : backgroundScale,
                    }}
                >
                    {heroBackgroundMode === 'image' ? (
                        <div className="landing-hero-image-shell">
                            <img
                                src={HERO_BACKGROUND_CONFIG.imageSrc}
                                alt={HERO_BACKGROUND_CONFIG.imageAlt}
                                className="landing-hero-image"
                                style={{ objectPosition: HERO_BACKGROUND_CONFIG.imagePosition }}
                            />
                        </div>
                    ) : (
                        <div className="landing-hero-animated-scene" aria-hidden="true">
                            <AnimatedGridPattern
                                width={86}
                                height={86}
                                numSquares={34}
                                maxOpacity={1}
                                duration={1.2}
                                repeatDelay={0.65}
                                className="landing-hero-animated-grid"
                            />
                            <div className="landing-hero-animated-fade" />
                        </div>
                    )}
                </motion.div>
            </div>

            <header className={`landing-nav-shell ${isNavScrolled ? 'is-scrolled' : ''} ${useDarkHeroForeground ? 'landing-top-stage-dark' : ''}`}>
                <div className="landing-nav-frame">
                    <motion.div
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-500"
                        style={{ scaleX: shouldReduceMotion ? scrollYProgress : easedScrollProgress }}
                    />
                    <div className="mx-auto flex h-14 max-w-[1160px] items-center justify-between px-4 sm:px-6">
                        <button
                            type="button"
                            onClick={() => {
                                setIsMobileNavOpen(false);
                                onNavigate('/');
                            }}
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
                                    className={`h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.08em] hover:text-[var(--ui-primary)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)] transition-colors ${currentPath === item.path ? 'text-[var(--ui-primary)]' : 'text-[var(--ui-text-muted)]'}`}
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
                            <div className="hidden lg:flex items-center gap-2">
                                {userProfile ? (
                                    <>
                                        <div className="flex items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2.5 py-1.5">
                                            {userProfile.photoUrl ? (
                                                <img
                                                    src={userProfile.photoUrl}
                                                    alt={userProfile.name}
                                                    className="h-6 w-6 rounded-full border border-[var(--ui-border)] object-cover"
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
                                                onClick={() => onSendVerification?.()}
                                                disabled={verificationBusy}
                                                className="inline-flex h-8 items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_22%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-primary)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-3))] disabled:opacity-60"
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
                                            onClick={() => onSignOut?.()}
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
                                            className="inline-flex h-8 items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-3 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:text-[var(--ui-primary)]"
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
                            <button
                                type="button"
                                onClick={() => setIsMobileNavOpen((open) => !open)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] text-[var(--ui-text-muted)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-surface-3))] hover:text-[var(--ui-primary)] lg:hidden"
                                aria-label={isMobileNavOpen ? 'Close menu' : 'Open menu'}
                                aria-expanded={isMobileNavOpen}
                            >
                                {isMobileNavOpen ? <X size={15} /> : <Menu size={15} />}
                            </button>
                        </div>
                    </div>
                </div>
            </header>
            {isMobileNavOpen && (
                <div className="fixed inset-0 z-[90] bg-[var(--ui-surface-1)] lg:hidden">
                    <button
                        type="button"
                        onClick={() => setIsMobileNavOpen(false)}
                        className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] text-[var(--ui-text)]"
                        aria-label="Close menu"
                    >
                        <X size={18} />
                    </button>
                    <div className="flex h-full flex-col overflow-y-auto px-5 pb-8 pt-20">
                        <div className="flex flex-col gap-2">
                            {MARKETING_NAV_LINKS.map((item) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => {
                                        setIsMobileNavOpen(false);
                                        onNavigate(item.path);
                                    }}
                                    className={`flex min-h-14 items-center rounded-[22px] px-4 text-left text-base font-medium transition-colors ${currentPath === item.path ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_16%,transparent)] text-[var(--ui-primary)]' : 'text-[var(--ui-text)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)]'}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <div className="mt-6 border-t border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] pt-6">
                            {userProfile ? (
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-3 rounded-[22px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-4">
                                        {userProfile.photoUrl ? (
                                            <img
                                                src={userProfile.photoUrl}
                                                alt={userProfile.name}
                                                className="h-12 w-12 rounded-full border border-[var(--ui-border)] object-cover"
                                                onError={(e) => {
                                                    const fallbackName = userProfile.name || userProfile.email || 'User';
                                                    const img = e.currentTarget;
                                                    img.onerror = null;
                                                    img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=111827&color=ffffff&size=128&rounded=true`;
                                                }}
                                            />
                                        ) : (
                                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ui-surface-3)] text-sm font-semibold text-[var(--ui-text)]">
                                                {(userProfile.name || userProfile.email || 'U').slice(0, 1).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-[var(--ui-text)]">{userProfile.name}</p>
                                            <p className="truncate text-xs text-[var(--ui-text-muted)]">{userProfile.email}</p>
                                        </div>
                                    </div>
                                    {!userProfile.emailVerified && (
                                        <button
                                            type="button"
                                            onClick={() => onSendVerification?.()}
                                            disabled={verificationBusy}
                                            className="inline-flex min-h-12 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_22%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-2))] px-4 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-primary)] disabled:opacity-60"
                                        >
                                            {verificationBusy ? 'Sending...' : 'Verify email'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsMobileNavOpen(false);
                                            onNavigate('/app');
                                        }}
                                        className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--ui-primary)] px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)]"
                                    >
                                        Open app
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsMobileNavOpen(false);
                                            onSignOut?.();
                                        }}
                                        className="inline-flex min-h-12 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-4 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)]"
                                    >
                                        Sign out
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsMobileNavOpen(false);
                                            onNavigate('/login');
                                        }}
                                        className="inline-flex min-h-12 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-4 text-[11px] uppercase tracking-[0.08em] text-[var(--ui-text-muted)]"
                                    >
                                        Log in
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsMobileNavOpen(false);
                                            onNavigate('/login');
                                        }}
                                        className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--ui-primary)] px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)]"
                                    >
                                        Sign up
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <main className="relative z-10 px-0 pt-8 md:pt-12 pb-0">
                {/*Hero section*/}
                <motion.section
                    className={`landing-hero-section relative w-full overflow-hidden ${useDarkHeroForeground ? 'landing-top-stage-dark' : ''}`}
                    style={{
                        y: shouldReduceMotion ? 0 : heroY,
                        opacity: shouldReduceMotion ? 1 : heroOpacity,
                    }}
                >
                    <div className="landing-hero-section-inner relative z-10 mx-auto -mt-15 flex w-full max-w-[980px] flex-col items-center justify-center px-2 text-center">
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
                        <p className="mt-2 mb-12 text-[20px] md:text-[30px] text-[var(--ui-text-muted)]">Generate production-ready app screens and landing pages from a single prompt.</p>

                        <div className="relative mx-auto mt-7 w-full max-w-[780px] overflow-visible">
                            <ComposerAttachmentStack
                                images={images}
                                onRemove={(index) => setImages((prev) => prev.filter((_, idx) => idx !== index))}
                            />
                            <div className="relative z-10 rounded-[22px] border border-[color:color-mix(in_srgb,var(--ui-primary)_24%,var(--ui-border))] bg-[var(--ui-surface-1)] p-3 text-left md:p-4">
                                <img
                                    src={mascotComposer}
                                    alt=""
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-1 top-[-6.5rem] z-10 w-[4.7rem] select-none sm:right-3 sm:top-[-8.2rem] sm:w-[5.8rem] md:right-5 md:top-[-8.4rem] md:w-[6rem]"
                                />
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
                                        <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_24%,var(--ui-border))] bg-[var(--ui-surface-1)] p-[2px]">
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
                                            placeholder=""
                                            placeholderClassName="px-2 py-1 text-left"
                                            className="no-focus-ring w-full min-h-[102px] max-h-[230px] overflow-y-auto border-0 bg-transparent px-2 py-1 text-[16px] leading-normal text-left text-[var(--ui-text)] ring-0 focus:border-0 focus:ring-0"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between border-t border-[var(--ui-border)] pt-2">
                                    <div className="flex items-center gap-2.5">
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
                                                    if (isAddMenuOpen) {
                                                        closeAddMenu();
                                                        return;
                                                    }
                                                    setIsAddMenuOpen(true);
                                                }}
                                                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--ui-surface-1)] text-[var(--ui-text-muted)] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_18%,var(--ui-border))] transition-all hover:bg-[var(--ui-surface-1)] hover:text-[var(--ui-primary)]"
                                                title="Add to prompt"
                                            >
                                                <Plus size={18} />
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
                                {/* <button
                                    type="button"
                                    className="h-8 rounded-md px-2.5 bg-transparent text-gray-200 hover:bg-white/8 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Figma size={13} />
                                    <span className="text-[12px]">Import</span>
                                </button> */}
                                <div className="flex items-center rounded-full bg-[var(--ui-surface-1)] p-1 ring-1 ring-[var(--ui-border)]">
                                    {(['mobile', 'tablet', 'desktop'] as const).map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setPlatform(p)}
                                            className={`p-1.5 rounded-full transition-all ${platform === p
                                                ? 'bg-[var(--ui-primary)] text-[var(--ui-text)] shadow-sm'
                                                : 'text-[var(--ui-text-subtle)] hover:text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-1)]'
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
                                <div className="flex items-center rounded-full bg-[var(--ui-surface-1)] p-1 ring-1 ring-[var(--ui-border)]">
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('fast')}
                                        className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'fast'
                                            ? 'bg-[var(--ui-surface-1)] text-amber-400 ring-1 ring-amber-400/40'
                                            : 'text-amber-400 hover:text-amber-200 hover:bg-[var(--ui-surface-1)]'
                                            }`}
                                        title="Fast model"
                                    >
                                        <Zap size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModelProfile('quality')}
                                        className={`h-8 w-8 rounded-full text-[11px] font-semibold transition-all inline-flex items-center justify-center ${modelProfile === 'quality'
                                            ? 'bg-[var(--ui-surface-1)] text-[var(--ui-primary)] ring-1 ring-[color:color-mix(in_srgb,var(--ui-primary)_42%,transparent)]'
                                            : 'text-[color:color-mix(in_srgb,var(--ui-primary)_70%,white)] hover:text-[var(--ui-primary)] hover:bg-[var(--ui-surface-1)]'
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
                                        <div className="absolute bottom-12 right-0 z-50 w-40 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-1)] p-2 shadow-2xl">
                                            {(['modern', 'minimal', 'vibrant', 'luxury', 'playful'] as const).map((preset) => (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => {
                                                        setStylePreset(preset);
                                                        setShowStyleMenu(false);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-colors ${stylePreset === preset
                                                        ? 'bg-[var(--ui-surface-1)] text-[var(--ui-primary)]'
                                                        : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-1)]'
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
                                            : 'bg-[var(--ui-surface-1)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-1)] ring-1 ring-[var(--ui-border)]'
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
                    </div>
                    </div>

                    <div className="relative z-10 mx-auto  w-full max-w-[780px] px-2 sm:px-0">
                        <div className="rounded-[28px] p-3 text-left">
                            <div className="flex flex-wrap justify-center gap-2">
                                {LANDING_SUGGESTION_TABS.map((tab) => {
                                    const TabIcon = tab.icon;
                                    const isActive = activeSuggestionTab === tab.key;
                                    return (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => {
                                                setActiveSuggestionTab((current) => {
                                                    const next = current === tab.key ? null : tab.key;
                                                    if (next) {
                                                        setActiveSuggestionPrompt(tab.prompts[1] || tab.prompts[0]);
                                                    }
                                                    return next;
                                                });
                                            }}
                                            className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium transition-all ${isActive
                                                ? 'border border-[color:color-mix(in_srgb,var(--ui-primary)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-primary)_12%,var(--ui-surface-2))] text-[var(--ui-primary)]'
                                                : 'border border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] hover:border-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-border))] hover:text-[var(--ui-text)]'
                                                }`}
                                        >
                                            <TabIcon size={14} />
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {activeLandingSuggestionTab ? (
                            <div className="mt-3 space-y-1.5">
                                {activeLandingSuggestionTab.prompts.map((suggestion, index) => {
                                    const isFeatured = activeSuggestionPrompt === suggestion || (!activeSuggestionPrompt && index === 1);
                                    return (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => applyLandingSuggestion(suggestion)}
                                            className={`group flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition-all ${isFeatured
                                                ? 'border-[color:color-mix(in_srgb,var(--ui-primary)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,var(--ui-surface-2))]'
                                                : 'border-transparent bg-transparent hover:border-[color:color-mix(in_srgb,var(--ui-primary)_12%,var(--ui-border))] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_5%,var(--ui-surface-2))]'
                                                }`}
                                            title={suggestion}
                                        >
                                            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${isFeatured
                                                ? 'border-[color:color-mix(in_srgb,var(--ui-primary)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,transparent)] text-[var(--ui-primary)]'
                                                : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text-subtle)]'
                                                }`}>
                                                {index === 0 ? <CircleStar size={13} /> : index === 1 ? <Sparkles size={13} /> : <Square size={12} />}
                                            </span>
                                            <span className={`min-w-0 flex-1 text-[14px] leading-6 ${isFeatured ? 'text-[var(--ui-text)]' : 'text-[var(--ui-text-muted)] group-hover:text-[var(--ui-text)]'}`}>
                                                {suggestion}
                                            </span>
                                            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${isFeatured
                                                ? 'bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,transparent)] text-[var(--ui-primary)]'
                                                : 'text-[var(--ui-text-subtle)] group-hover:text-[var(--ui-primary)]'
                                                }`}>
                                                <ArrowRight size={15} />
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            ) : null}
                        </div>
                    </div>
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
                    className={`landing-page-section landing-screens-overlap-section relative z-20 w-full max-w-none${activeLandingSuggestionTab ? ' is-expanded' : ''}`}
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
                <section className="landing-surface-band landing-surface-band-1 landing-page-section pt-6 md:pt-10">
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
                <footer className="landing-footer">
                    <motion.div
                        className="landing-footer-shell"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 56 }}
                        whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ duration: 0.88, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="landing-footer-panel">
                            <button
                                type="button"
                                className="landing-footer-scrolltop"
                                onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: shouldReduceMotion ? 'auto' : 'smooth' })}
                                aria-label="Scroll to top"
                            >
                                <ArrowUp size={14} />
                            </button>

                            <div className="landing-footer-main-grid">
                                <div className="landing-footer-brand-column">
                                    <div className="landing-footer-brand-mark" aria-hidden="true">
                                        <img src={appLogo} alt="" className="landing-footer-brand-logo" />
                                    </div>
                                    <p className="landing-footer-brand-copy">
                                        AI landing page builder that creates stunning designs in seconds. No design skills needed. Export to HTML and Figma. Trusted by 140,000+ users worldwide.
                                    </p>
                                </div>

                                <div className="landing-footer-links-grid">
                                    {LANDING_FOOTER_COLUMNS.map((column) => (
                                        <div key={column.title} className="landing-footer-column">
                                            <p className="landing-footer-column-title">{column.title}</p>
                                            <div className="landing-footer-column-links">
                                                {column.items.map((item) => (
                                                    item.href ? (
                                                        <a
                                                            key={item.label}
                                                            href={item.href}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="landing-footer-link"
                                                        >
                                                            {item.label}
                                                        </a>
                                                    ) : (
                                                        <button
                                                            key={item.label}
                                                            type="button"
                                                            onClick={() => {
                                                                if (item.path) onNavigate(item.path);
                                                            }}
                                                            className="landing-footer-link"
                                                        >
                                                            {item.label}
                                                        </button>
                                                    )
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="landing-footer-divider" />

                            <div className="landing-footer-meta-row">
                                <div className="landing-footer-meta-left">
                                    <p className="landing-footer-copyright">
                                        © 2026 EazyUI. All rights reserved.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={toggleTheme}
                                        className="landing-footer-theme-pill"
                                        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                                        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                                    >
                                        <Monitor size={13} />
                                        {theme === 'light' ? <Moon size={12} /> : <Sun size={12} />}
                                    </button>
                                </div>

                                <div className="landing-footer-social-row">
                                    {LANDING_FOOTER_SOCIALS.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <a
                                                key={item.label}
                                                href={item.href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="landing-footer-social-icon"
                                                aria-label={item.label}
                                            >
                                                <Icon size={15} />
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </footer>
            </main>
        </div>
    );
}
