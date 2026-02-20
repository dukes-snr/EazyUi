import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, Bot, ChevronRight, CircleHelp, Heart, Search, Sparkles, X, CircleQuestionMark } from 'lucide-react';
import { useUiStore } from '../../stores';

type HelpTab = 'get-started' | 'ask' | 'docs' | 'guides';

type DocFeature = {
    name: string;
    howToUse: string;
    tip?: string;
};

type DocSection = {
    id: string;
    title: string;
    description: string;
    features: DocFeature[];
};

type Guide = {
    id: string;
    title: string;
    steps: string[];
};

type QuickAnswer = {
    question: string;
    keywords: string[];
    answer: string;
};

const DOC_SECTIONS: DocSection[] = [
    {
        id: 'composer',
        title: 'Composer (Chat Panel)',
        description: 'Everything in the prompt composer and message actions.',
        features: [
            { name: 'Prompt textarea', howToUse: 'Describe what to generate. Type @ to reference screens and keep style continuity.' },
            { name: 'Plan mode', howToUse: 'Toggle Plan mode above the composer to get structured screen recommendations before generation.' },
            { name: 'Add Image (+)', howToUse: 'Attach one or more reference images to guide style/content.' },
            { name: 'Platform switcher (Mobile/Tablet/Desktop)', howToUse: 'Choose output layout size before sending a prompt.' },
            { name: 'Model switcher (Fast/Quality)', howToUse: 'Use Fast for speed and Quality for higher design quality.' },
            { name: 'Style preset button', howToUse: 'Pick Modern, Minimal, Vibrant, Luxury, or Playful to bias the aesthetic.' },
            { name: 'Mic / Send / Stop button', howToUse: 'The right action button adapts by state: voice input, send prompt, or stop generation.' },
            { name: 'Mention chips (@Screen)', howToUse: 'Remove chips with X when you no longer want those screens included.' },
            { name: 'Image chips', howToUse: 'Preview and remove uploaded images before sending.' },
            { name: 'Message Focus button', howToUse: 'Jump to the referenced screen directly on canvas from message cards.' },
            { name: 'Message actions (Retry/Copy/Like/Dislike/Share)', howToUse: 'Use per-message controls to branch responses, copy output, or provide feedback.' },
            { name: 'Follow-up generate suggestions', howToUse: 'Tap suggested Generate buttons in assistant replies to quickly create next screens.' },
            { name: 'Sidebar collapse/expand', howToUse: 'Collapse chat for more canvas space, then reopen when needed.' },
        ],
    },
    {
        id: 'canvas-toolbar',
        title: 'Canvas Toolbar (Bottom Center)',
        description: 'Navigation and history controls for the whole canvas.',
        features: [
            { name: 'Undo / Redo', howToUse: 'Step backward/forward through saved snapshots of design + canvas state.' },
            { name: 'Select tool', howToUse: 'Default mode for selecting and dragging screens.' },
            { name: 'Hand tool', howToUse: 'Drag to pan the canvas viewport.' },
            { name: 'Zoom out / Zoom in', howToUse: 'Adjust magnification while preserving layout context.' },
            { name: 'Zoom percent readout', howToUse: 'Shows current zoom level at a glance.' },
            { name: 'Fit to screen', howToUse: 'Recenter and fit all active content into view.' },
            { name: 'Space-to-pan shortcut', howToUse: 'Hold Space while in Select mode for temporary pan behavior.' },
        ],
    },
    {
        id: 'device-node',
        title: 'Device Node Toolbar (Single Screen Selected)',
        description: 'Actions shown above one selected screen frame.',
        features: [
            { name: 'Refine', howToUse: 'Open inline prompt to apply targeted style/content edits to that screen.' },
            { name: 'Refine image attachments', howToUse: 'Attach visual references to guide the refine operation.' },
            { name: 'Edit', howToUse: 'Enter Edit Mode for direct element-level editing of the selected screen.' },
            { name: 'Focus Screen', howToUse: 'Center viewport on that screen quickly.' },
            { name: 'Delete Screen', howToUse: 'Remove the screen and its board from canvas.' },
            { name: 'Desktop / Tablet / Mobile icons', howToUse: 'Switch target dimensions for the selected screen.' },
            { name: 'Regenerate', howToUse: 'Rebuild the selected screen while preserving purpose and structure.' },
            { name: 'Regenerate image attachments', howToUse: 'Attach references before regenerating to steer output.' },
            { name: 'Generate missing placeholder images', howToUse: 'The image-plus chip on screen nodes replaces placeholder assets in batch.' },
        ],
    },
    {
        id: 'multi-toolbar',
        title: 'Multi-Select Toolbar (2+ Screens Selected)',
        description: 'Batch operations for layout and refinement.',
        features: [
            { name: 'Batch Refine', howToUse: 'Send one instruction to edit multiple selected screens at once.' },
            { name: 'Align menu', howToUse: 'Align left/center/right/top/middle/bottom across selected screens.' },
            { name: 'Spacing menu', howToUse: 'Distribute horizontal or vertical spacing evenly.' },
            { name: 'Smart Arrange', howToUse: 'Auto-place selected screens into ordered rows.' },
            { name: 'Focus Selected', howToUse: 'Fit selected screens into viewport.' },
            { name: 'More menu', howToUse: 'Bring to front or send to back in stacking order.' },
        ],
    },
    {
        id: 'edit-mode',
        title: 'Edit Mode (Right Panel)',
        description: 'Element-level editing for a selected screen.',
        features: [
            { name: 'AI Edit tab', howToUse: 'Run targeted AI edits against the currently selected element.' },
            { name: 'Edit tab', howToUse: 'Manually adjust typography, color, spacing, layout, size, position, border, and effects.' },
            { name: 'Images tab', howToUse: 'Select image elements, replace URLs, upload files, or generate new assets per slot.' },
            { name: 'Parent selection', howToUse: 'Move selection upward in the DOM hierarchy when refining containers.' },
            { name: 'Delete selected element', howToUse: 'Remove selected DOM nodes from the current screen.' },
            { name: 'Color picker + eyedropper', howToUse: 'Use wheel/opacity controls and page eyedropper for precise colors.' },
            { name: 'Undo / Redo in edit mode', howToUse: 'Step through local patch history for the active screen.' },
            { name: 'Exit Edit Mode', howToUse: 'Commit and return to normal canvas interaction.' },
        ],
    },
    {
        id: 'layers',
        title: 'Layers Panel (Left in Edit Mode)',
        description: 'DOM tree navigation for the active screen.',
        features: [
            { name: 'Screen selector', howToUse: 'Switch which screen tree is shown while staying in edit mode.' },
            { name: 'Expand/Collapse nodes', howToUse: 'Open and close nested elements to inspect structure.' },
            { name: 'Select layer row', howToUse: 'Select the matching element in the preview for direct editing.' },
            { name: 'Auto-scroll to selection', howToUse: 'The panel keeps active element visible as selections change.' },
        ],
    },
    {
        id: 'project-profile',
        title: 'Profile, Project, Export, and Inspector',
        description: 'Top-right controls inside canvas.',
        features: [
            { name: 'Save status + Save button', howToUse: 'Shows save state; click to force save now.' },
            { name: 'Export menu', howToUse: 'Export selected/all screens as ZIP, images, code, or Figma payload.' },
            { name: 'Profile menu', howToUse: 'Open profile, verify email, workspace navigation, autosave, theme, and logout.' },
            { name: 'Show/Hide Inspector', howToUse: 'Toggle inspector panel from profile menu.' },
            { name: 'Inspector panel', howToUse: 'View selected screen metadata (size, status, HTML preview).' },
            { name: 'New Project', howToUse: 'Start fresh workspace after optional unsaved-change confirmation.' },
        ],
    },
];

const GUIDES: Guide[] = [
    {
        id: 'guide-first-project',
        title: 'Create your first project',
        steps: [
            'In Composer, describe your app idea and choose platform/style/model.',
            'Press Send and wait for screens to stream in.',
            'Use canvas Fit to Screen and Focus actions to review outputs.',
            'Use Save in the top-right profile area to persist your project.',
        ],
    },
    {
        id: 'guide-single-screen',
        title: 'Refine one screen quickly',
        steps: [
            'Click a screen node so its Device Toolbar appears.',
            'Tap Refine, enter the exact change, and optionally attach references.',
            'Submit and verify updates in the frame preview.',
            'If needed, use Regenerate to rebuild the whole screen version.',
        ],
    },
    {
        id: 'guide-multi-screen',
        title: 'Align and edit multiple screens',
        steps: [
            'Select two or more screens on canvas.',
            'Use Align / Spacing / Smart Arrange in Multi-Select Toolbar.',
            'Use Batch Refine to apply one instruction across all selected screens.',
            'Run Focus Selected to validate final arrangement.',
        ],
    },
    {
        id: 'guide-edit-mode',
        title: 'Do precise element-level edits',
        steps: [
            'Open Edit from a selected screen toolbar.',
            'Pick an element directly on preview or from Layers panel.',
            'Use Edit tab controls for style/layout or AI Edit for prompt-based updates.',
            'Use Images tab for asset replacement and generation.',
            'Exit Edit Mode when done.',
        ],
    },
    {
        id: 'guide-export',
        title: 'Export handoff assets',
        steps: [
            'Select target screens (or none to export all).',
            'Open Export and choose ZIP, Images, Code, or Figma output.',
            'Use generated file/clipboard payload in your downstream workflow.',
        ],
    },
];

const QUICK_ANSWERS: QuickAnswer[] = [
    {
        question: 'How do I reference an existing screen in a prompt?',
        keywords: ['reference', '@', 'mention', 'screen'],
        answer: 'In the composer textarea, type @ and pick one or more screens from the mention menu. They are attached as context chips above the input.',
    },
    {
        question: 'How do I edit only one component instead of the whole screen?',
        keywords: ['component', 'element', 'edit mode', 'selected'],
        answer: 'Open Edit on that screen, click the exact element, then use AI Edit or manual Edit controls. Changes are scoped to the selected element UID.',
    },
    {
        question: 'How do I line up multiple device frames neatly?',
        keywords: ['align', 'spacing', 'multi', 'arrange'],
        answer: 'Select at least two screens, then use the Multi-Select toolbar: Align, Spacing, or Smart Arrange. Use Focus Selected to verify result.',
    },
    {
        question: 'How do I regenerate a screen without changing its intent?',
        keywords: ['regenerate', 'screen', 'same'],
        answer: 'Use the Regenerate action in Device Toolbar. It rebuilds the same screen purpose/structure with improved visual polish.',
    },
    {
        question: 'Where do I turn autosave and inspector on or off?',
        keywords: ['autosave', 'inspector', 'profile', 'toggle'],
        answer: 'Open the top-right Profile menu in canvas. There are actions to enable/disable Autosave and show/hide Inspector.',
    },
    {
        question: 'How do I remove placeholder images in generated screens?',
        keywords: ['placeholder', 'image', 'generate'],
        answer: 'Use the image-plus action on a screen node to generate real assets, or open Edit Mode > Images tab to replace per image slot.',
    },
];

function normalize(value: string) {
    return value.toLowerCase().trim();
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 18) return 'Afternoon';
    return 'Evening';
}

export function CanvasHelp() {
    const { theme } = useUiStore();
    const isLight = theme === 'light';
    const [launcherOpen, setLauncherOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [tab, setTab] = useState<HelpTab>('get-started');
    const [search, setSearch] = useState('');

    const filteredSections = useMemo(() => {
        const term = normalize(search);
        if (!term) return DOC_SECTIONS;

        return DOC_SECTIONS
            .map((section) => {
                const matchedFeatures = section.features.filter((feature) =>
                    normalize(`${feature.name} ${feature.howToUse} ${feature.tip || ''}`).includes(term)
                );

                if (matchedFeatures.length > 0 || normalize(`${section.title} ${section.description}`).includes(term)) {
                    return {
                        ...section,
                        features: matchedFeatures.length > 0 ? matchedFeatures : section.features,
                    };
                }

                return null;
            })
            .filter(Boolean) as DocSection[];
    }, [search]);

    const answerResults = useMemo(() => {
        const term = normalize(search);
        if (!term) return QUICK_ANSWERS;
        return QUICK_ANSWERS.filter((item) => {
            const haystack = normalize(`${item.question} ${item.answer} ${item.keywords.join(' ')}`);
            return haystack.includes(term);
        });
    }, [search]);

    const openHelp = (nextTab: HelpTab) => {
        setTab(nextTab);
        setHelpOpen(true);
        setLauncherOpen(false);
    };

    return (
        <>
            <div className="pointer-events-auto relative">
                {launcherOpen && !helpOpen && (
                    <div className={`absolute bottom-[70px] right-0 w-[360px] rounded-[28px] border p-5 backdrop-blur-xl shadow-[0_28px_70px_rgba(0,0,0,0.35)] ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[var(--ui-text)]' : 'border-white/10 bg-[#121317]/95 text-[#ECEEF6]'}`}>
                        <div className="flex items-start justify-between">
                            <div className={`h-10 w-10 rounded-xl inline-flex items-center justify-center ${isLight ? 'bg-[var(--ui-surface-3)] text-[var(--ui-text)]' : 'bg-white text-[#111318]'}`}>
                                <CircleHelp size={18} />
                            </div>
                            <button
                                type="button"
                                onClick={() => setLauncherOpen(false)}
                                className={`h-9 w-9 inline-flex items-center justify-center rounded-full ${isLight ? 'text-[var(--ui-text-subtle)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)]' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                                title="Close help"
                            >
                                <X size={17} />
                            </button>
                        </div>

                        <div className="mt-8">
                            <p className={`text-[41px] leading-none ${isLight ? 'text-[var(--ui-text-subtle)]' : 'text-white/52'}`}>{getGreeting()}.</p>
                            <p className="text-[40px] leading-none font-semibold mt-2">How can we help?</p>
                        </div>

                        <div className="mt-6 space-y-2">
                            <LauncherItem icon={<Heart size={14} />} label="Get Started" onClick={() => openHelp('get-started')} highlight />
                            <LauncherItem icon={<Bot size={14} />} label="Ask a question" onClick={() => openHelp('ask')} />
                            <LauncherItem icon={<BookOpen size={14} />} label="Documentation" onClick={() => openHelp('docs')} />
                            <LauncherItem icon={<Sparkles size={14} />} label="Help Guides" onClick={() => openHelp('guides')} />
                        </div>
                    </div>
                )}

                {!helpOpen && (
                    <button
                        type="button"
                        onClick={() => setLauncherOpen((value) => !value)}
                        className={`h-8 w-8 rounded-full flex items-center justify-center border shadow-[0_10px_28px_rgba(0,0,0,0.25)] ${isLight ? 'bg-[var(--ui-surface-1)] text-[var(--ui-text)] border-[var(--ui-border)]' : 'bg-white text-[#14151A] border-black/25'} font-semibold`}
                    >
                        <CircleQuestionMark size={24} />
                    </button>
                )}
            </div>

            {helpOpen && (
                <div className="fixed inset-0 z-[1300] pointer-events-auto">
                    <div className={`fixed inset-0 ${isLight ? 'bg-slate-900/35' : 'bg-black/60'}`} onClick={() => setHelpOpen(false)} />

                    <div className={`fixed inset-5 rounded-3xl border shadow-[0_30px_90px_rgba(0,0,0,0.45)] overflow-hidden flex ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[var(--ui-text)]' : 'border-white/10 bg-[#0F1014] text-[#EAECF6]'}`}>
                        <aside className={`w-[250px] border-r p-4 flex flex-col gap-2 ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-2)]' : 'border-white/10 bg-[#13151B]'}`}>
                            <button
                                type="button"
                                onClick={() => {
                                    setHelpOpen(false);
                                    setLauncherOpen(true);
                                }}
                                className={`mb-3 h-10 rounded-xl border text-sm ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-1)] hover:bg-[var(--ui-surface-3)]' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}
                            >
                                Back to launcher
                            </button>

                            <HelpTabButton active={tab === 'get-started'} label="Get Started" onClick={() => setTab('get-started')} />
                            <HelpTabButton active={tab === 'ask'} label="Ask a question" onClick={() => setTab('ask')} />
                            <HelpTabButton active={tab === 'docs'} label="Documentation" onClick={() => setTab('docs')} />
                            <HelpTabButton active={tab === 'guides'} label="Help Guides" onClick={() => setTab('guides')} />
                        </aside>

                        <section className="flex-1 min-w-0 flex flex-col">
                            <header className={`h-16 border-b px-5 flex items-center justify-between gap-3 ${isLight ? 'border-[var(--ui-border)]' : 'border-white/10'}`}>
                                <div className="relative w-full max-w-[520px]">
                                    <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-[var(--ui-text-subtle)]' : 'text-white/45'}`} />
                                    <input
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                        placeholder="Search by feature, panel, or action..."
                                        className={`h-10 w-full rounded-xl border pl-9 pr-3 text-sm outline-none ${isLight ? 'bg-[var(--ui-surface-1)] border-[var(--ui-border)] focus:border-indigo-400/50' : 'bg-white/5 border-white/15 focus:border-indigo-300/60'}`}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setHelpOpen(false)}
                                    className={`h-10 w-10 rounded-xl border inline-flex items-center justify-center ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-1)] hover:bg-[var(--ui-surface-3)]' : 'border-white/15 bg-white/5 hover:bg-white/10'}`}
                                    title="Close help center"
                                >
                                    <X size={16} />
                                </button>
                            </header>

                            <div className="flex-1 overflow-y-auto p-5">
                                {tab === 'get-started' && (
                                    <div className="space-y-4">
                                        <h2 className="text-2xl font-semibold">Get Started</h2>
                                        <p className={`text-sm max-w-3xl ${isLight ? 'text-[var(--ui-text-muted)]' : 'text-white/70'}`}>
                                            This workspace combines AI generation, canvas layout, and direct element editing. Use the flow below to go from prompt to shipped UI.
                                        </p>
                                        {GUIDES.slice(0, 3).map((guide) => (
                                            <article key={guide.id} className={`rounded-2xl border p-4 ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-2)]' : 'border-white/10 bg-white/5'}`}>
                                                <h3 className="font-semibold">{guide.title}</h3>
                                                <ol className={`mt-3 space-y-2 text-sm list-decimal pl-5 ${isLight ? 'text-[var(--ui-text-muted)]' : 'text-white/75'}`}>
                                                    {guide.steps.map((step) => (
                                                        <li key={step}>{step}</li>
                                                    ))}
                                                </ol>
                                            </article>
                                        ))}
                                    </div>
                                )}

                                {tab === 'ask' && (
                                    <div className="space-y-4">
                                        <h2 className="text-2xl font-semibold">Ask a Question</h2>
                                        <p className={`text-sm ${isLight ? 'text-[var(--ui-text-muted)]' : 'text-white/70'}`}>Type what you need help with. Results are filtered from the built-in guide knowledge.</p>
                                        <div className="grid grid-cols-1 gap-3">
                                            {answerResults.length === 0 && (
                                                <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                                    No direct match found. Try terms like "multi-select", "export", "layers", "AI Edit", or "platform".
                                                </div>
                                            )}
                                            {answerResults.map((item) => (
                                                <article key={item.question} className={`rounded-2xl border p-4 ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-2)]' : 'border-white/10 bg-white/5'}`}>
                                                    <h3 className="font-semibold">{item.question}</h3>
                                                    <p className={`mt-2 text-sm ${isLight ? 'text-[var(--ui-text-muted)]' : 'text-white/75'}`}>{item.answer}</p>
                                                </article>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {tab === 'docs' && (
                                    <div className="space-y-4">
                                        <h2 className="text-2xl font-semibold">Documentation</h2>
                                        <p className={`text-sm ${isLight ? 'text-[var(--ui-text-muted)]' : 'text-white/70'}`}>Feature-level reference for the entire in-app toolset.</p>
                                        {filteredSections.map((section) => (
                                            <article key={section.id} className={`rounded-2xl border p-4 ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-2)]' : 'border-white/10 bg-white/5'}`}>
                                                <h3 className="text-lg font-semibold">{section.title}</h3>
                                                <p className={`mt-1 text-sm ${isLight ? 'text-[var(--ui-text-muted)]' : 'text-white/70'}`}>{section.description}</p>
                                                <div className="mt-3 grid grid-cols-1 gap-2">
                                                    {section.features.map((feature) => (
                                                        <div key={feature.name} className={`rounded-xl border px-3 py-2 ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-1)]' : 'border-white/10 bg-black/20'}`}>
                                                            <p className="text-sm font-medium">{feature.name}</p>
                                                            <p className={`text-xs mt-1 ${isLight ? 'text-[var(--ui-text-muted)]' : 'text-white/70'}`}>{feature.howToUse}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </article>
                                        ))}
                                        {filteredSections.length === 0 && (
                                            <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                                No documentation match for this search. Clear the search to browse all sections.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {tab === 'guides' && (
                                    <div className="space-y-4">
                                        <h2 className="text-2xl font-semibold">Help Guides</h2>
                                        <p className={`text-sm ${isLight ? 'text-[var(--ui-text-muted)]' : 'text-white/70'}`}>Step-by-step workflows for common tasks.</p>
                                        {GUIDES.map((guide) => (
                                            <article key={guide.id} className={`rounded-2xl border p-4 ${isLight ? 'border-[var(--ui-border)] bg-[var(--ui-surface-2)]' : 'border-white/10 bg-white/5'}`}>
                                                <h3 className="font-semibold">{guide.title}</h3>
                                                <ol className={`mt-3 space-y-2 text-sm list-decimal pl-5 ${isLight ? 'text-[var(--ui-text-muted)]' : 'text-white/75'}`}>
                                                    {guide.steps.map((step) => (
                                                        <li key={step}>{step}</li>
                                                    ))}
                                                </ol>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </>
    );
}

function LauncherItem({
    icon,
    label,
    onClick,
    highlight = false,
}: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    highlight?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full rounded-2xl px-3 py-3 inline-flex items-center justify-between transition-colors ${highlight ? 'bg-[var(--ui-surface-3)] hover:bg-[var(--ui-surface-4)]' : 'hover:bg-[var(--ui-surface-3)]'}`}
        >
            <span className="inline-flex items-center gap-3 text-left">
                <span className="text-[var(--ui-primary)]">{icon}</span>
                <span className="font-medium">{label}</span>
            </span>
            <ChevronRight size={17} className="text-[var(--ui-text-subtle)]" />
        </button>
    );
}

function HelpTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`h-11 rounded-xl px-3 text-left text-sm transition-colors border ${active ? 'bg-indigo-500/20 text-[var(--ui-text)] border-indigo-400/40' : 'text-[var(--ui-text-muted)] border-[var(--ui-border)] bg-[var(--ui-surface-1)] hover:bg-[var(--ui-surface-3)]'}`}
        >
            {label}
        </button>
    );
}
