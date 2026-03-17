import { useRef } from 'react';
import { ArrowRight, BookOpen, Clock3, LibraryBig, PlayCircle, Rocket, School, Sparkles, Target, Waypoints } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';

type LearnPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

const TRACKS = [
    {
        title: 'Prompt Engineering for UI',
        level: 'Beginner',
        duration: '35 min',
        detail: 'Learn how to ask for hierarchy, spacing, interaction density, and device-specific behavior in a way the generator can actually use.',
    },
    {
        title: 'Design Systems with EazyUI',
        level: 'Intermediate',
        duration: '50 min',
        detail: 'Build a visual system first, then use it to keep generated screens coherent across teams and project branches.',
    },
    {
        title: 'From Draft to Production',
        level: 'Advanced',
        duration: '42 min',
        detail: 'Turn a good first pass into a screen a frontend team can review seriously and move toward implementation.',
    },
] as const;

const RESOURCE_BLOCKS = [
    {
        title: 'Team playbooks',
        copy: 'Reusable rituals for PM, design, and frontend alignment so prompts do not drift between functions.',
    },
    {
        title: 'Live build clinics',
        copy: 'Screen teardowns showing how to rescue weak prompts and push strong directions further.',
    },
    {
        title: 'Reference-first demos',
        copy: 'Examples of how screenshots, products, and visual systems change the quality of generation.',
    },
] as const;

export function LearnPage({ onNavigate, onOpenApp }: LearnPageProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    return (
        <div ref={scrollContainerRef} className="h-screen w-screen overflow-y-auto bg-[var(--ui-bg)] text-[var(--ui-text)]">
            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} scrollContainerRef={scrollContainerRef} />

            <main className="relative">
                <section className="landing-surface-band landing-surface-band-1 landing-page-section pt-10 md:pt-14">
                    <div className="landing-page-section-inner landing-page-section-inner-full">
                        <div className="grid gap-6 lg:grid-cols-[1.04fr_0.96fr] lg:items-end">
                            <div className="landing-editorial-shell rounded-[2rem] p-6 md:p-8 lg:p-10">
                                <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">
                                    <BookOpen size={13} />
                                    Learn
                                </p>
                                <h1 className="mt-4 max-w-[11ch] text-[42px] font-semibold leading-[0.98] tracking-[-0.05em] text-[var(--ui-text)] md:text-[68px]">
                                    Learn the workflow that makes AI UI output actually useful.
                                </h1>
                                <p className="mt-5 max-w-[58ch] text-[15px] leading-8 text-[var(--ui-text-muted)] md:text-[17px]">
                                    This is not a theory page. It is a practical learning surface for people who want better prompts, better first passes,
                                    and stronger collaboration between design intent and implementation reality.
                                </p>
                                <div className="mt-8 flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={onOpenApp}
                                        className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_16px_40px_color-mix(in_srgb,var(--ui-primary)_28%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)]"
                                    >
                                        Start learning
                                        <PlayCircle size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onNavigate('/templates')}
                                        className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_20%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_40%,transparent)] hover:text-[var(--ui-primary)]"
                                    >
                                        Explore templates
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-3">
                                <article className="landing-editorial-card !rounded-[1.75rem]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Guides</p>
                                    <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ui-text)] md:text-[38px]">120+</p>
                                    <p className="mt-2 text-[13px] leading-6 text-[var(--ui-text-muted)]">Short practical references for prompting, systems, and review.</p>
                                </article>
                                <article className="landing-editorial-card !rounded-[1.75rem]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Tracks</p>
                                    <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ui-text)] md:text-[38px]">45</p>
                                    <p className="mt-2 text-[13px] leading-6 text-[var(--ui-text-muted)]">Structured modules for individuals and teams leveling up together.</p>
                                </article>
                                <article className="landing-editorial-card !rounded-[1.75rem]">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Average lesson</p>
                                    <p className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-[var(--ui-text)] md:text-[38px]">18m</p>
                                    <p className="mt-2 text-[13px] leading-6 text-[var(--ui-text-muted)]">Focused enough to fit inside a real product team schedule.</p>
                                </article>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="landing-surface-band landing-surface-band-2 landing-page-section">
                    <div className="landing-page-section-inner landing-page-section-inner-full">
                        <div className="grid gap-5 lg:grid-cols-[0.94fr_1.06fr]">
                            <article className="landing-process-board">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">Learning Tracks</p>
                                <h2 className="mt-4 text-[34px] font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--ui-text)] md:text-[52px]">
                                    Learn in the same order real teams improve.
                                </h2>
                                <p className="mt-4 max-w-[56ch] text-[15px] leading-8 text-[var(--ui-text-muted)]">
                                    Start with prompt clarity, move into visual system thinking, then close the loop with production-minded refinement.
                                </p>
                            </article>

                            <div className="grid gap-4">
                                {TRACKS.map((track) => (
                                    <article key={track.title} className="landing-process-card">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <h3 className="text-[23px] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--ui-text)]">{track.title}</h3>
                                            <div className="flex flex-wrap gap-2">
                                                <span className="landing-pricing-chip inline-flex items-center gap-1">
                                                    <School size={12} />
                                                    {track.level}
                                                </span>
                                                <span className="landing-pricing-chip inline-flex items-center gap-1">
                                                    <Clock3 size={12} />
                                                    {track.duration}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-[14px] leading-7 text-[var(--ui-text-muted)]">{track.detail}</p>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="landing-surface-band landing-surface-band-1 landing-page-section">
                    <div className="landing-page-section-inner landing-page-section-inner-full">
                        <div className="grid gap-5 lg:grid-cols-[1.02fr_0.98fr]">
                            <article className="landing-pricing-intro">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">What You Get</p>
                                <h2 className="mt-4 text-[34px] font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--ui-text)] md:text-[50px]">
                                    Practical teaching surfaces, not empty inspiration.
                                </h2>
                                <p className="mt-4 max-w-[54ch] text-[15px] leading-8 text-[var(--ui-text-muted)]">
                                    The content on this page now mirrors the landing page flow: big narrative first, then proof, then a concrete path into the app.
                                </p>
                                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                                    {[
                                        { icon: Target, label: 'Prompt target', copy: 'Learn what to specify and what to leave flexible.' },
                                        { icon: Waypoints, label: 'Workflow flow', copy: 'See how prompts, references, and systems connect.' },
                                        { icon: LibraryBig, label: 'Reusable patterns', copy: 'Carry the strongest habits into future projects.' },
                                    ].map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <div
                                                key={item.label}
                                                className="rounded-[1.1rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_5%,var(--ui-surface-2))] p-4"
                                            >
                                                <Icon size={16} className="text-[var(--ui-primary)]" />
                                                <p className="mt-3 text-[12px] uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">{item.label}</p>
                                                <p className="mt-2 text-[13px] leading-6 text-[var(--ui-text-muted)]">{item.copy}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </article>

                            <div className="grid gap-4 md:grid-cols-3">
                                {RESOURCE_BLOCKS.map((item) => (
                                    <article key={item.title} className="landing-pricing-card">
                                        <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--ui-primary)]">
                                            <Sparkles size={12} />
                                            Resource
                                        </p>
                                        <h3 className="mt-3 text-[22px] font-semibold leading-[1.08] text-[var(--ui-text)]">{item.title}</h3>
                                        <p className="mt-3 text-[14px] leading-7 text-[var(--ui-text-muted)]">{item.copy}</p>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="landing-surface-band landing-surface-band-2 landing-page-section pt-0">
                    <div className="landing-page-section-inner landing-page-section-inner-full">
                        <div className="landing-cta-shell flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">Practice</p>
                                <h2 className="mt-4 max-w-[14ch] text-[34px] font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--ui-text)] md:text-[52px]">
                                    Read less, open the app, and test the lesson on a real screen.
                                </h2>
                                <p className="mt-4 max-w-[56ch] text-[15px] leading-8 text-[var(--ui-text-muted)]">
                                    That is the core pattern behind this page update: every section should push you toward better practice, not just better browsing.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={onOpenApp}
                                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_16px_40px_color-mix(in_srgb,var(--ui-primary)_28%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)]"
                                >
                                    Open learning flow
                                    <Rocket size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onNavigate('/changelog')}
                                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_20%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_40%,transparent)] hover:text-[var(--ui-primary)]"
                                >
                                    See latest updates
                                    <ArrowRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
