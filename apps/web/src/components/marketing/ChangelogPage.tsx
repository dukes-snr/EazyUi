import { useEffect, useMemo, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';

import featureSlide1 from '../../assets/Slide1.png';
import featureSlide2 from '../../assets/Slide2.png';
import featureSlide3 from '../../assets/Slide3.png';
import featureSlide4 from '../../assets/Slide4.png';
import { markLatestChangelogSeen } from '../../utils/changelogUpdates';
import { Timeline, type TimelineEntry } from '../ui/timeline';
import { MarketingHeader } from './MarketingHeader';

type ChangelogPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

export function ChangelogPage({ onNavigate, onOpenApp }: ChangelogPageProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        markLatestChangelogSeen();
    }, []);

    const timelineData = useMemo<TimelineEntry[]>(() => [
        {
            title: 'v1.9.1',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Apr 02, 2026 - Feature
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        Design systems can now export straight into Figma
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            The active design system in EazyUI can now generate a Figma-ready board with colors, typography, radius, spacing, motion, and the other system settings already arranged for review.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            It is a faster way to carry the feel of a project into Figma without rebuilding the system by hand.
                        </p>
                    </div>
                    <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {[
                            {
                                label: 'Export',
                                title: 'One-click system board',
                                description: 'Use the Design System tab to export the active token set into a presentation-ready Figma board.',
                            },
                            {
                                label: 'Coverage',
                                title: 'Tokens stay represented',
                                description: 'Colors, type, radius, spacing, motion, and system notes all carry through into the exported board.',
                            },
                            {
                                label: 'Handoff',
                                title: 'Cleaner review workflow',
                                description: 'Design systems can move into Figma as a usable visual artifact instead of a loose list of values.',
                            },
                        ].map((item) => (
                            <div
                                key={item.title}
                                className="rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"
                            >
                                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">{item.label}</p>
                                <p className="mt-2 text-[16px] font-semibold text-[var(--ui-text)]">{item.title}</p>
                                <p className="mt-2 text-[14px] leading-6 text-[var(--ui-text-muted)]">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            title: 'v1.9.0',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Apr 02, 2026 - Feature
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        Figma plugin now imports screens directly from EazyUI
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            EazyUI now has a Figma plugin flow for pulling editable screen payloads into Figma, so you can move generated work into design files with less manual rebuilding.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            The plugin also gives you a clearer way to manage payload import, project browsing, and import settings from one place.
                        </p>
                    </div>
                    <div className="mt-8 space-y-3">
                        {[
                            'Import editable screen payloads into Figma from EazyUI',
                            'Browse project screens and pull the ones you want',
                            'Keep import controls and diagnostics close while you work',
                        ].map((item) => (
                            <div
                                key={item}
                                className="flex items-center gap-3 rounded-[16px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-[14px] text-[var(--ui-text-muted)]"
                            >
                                <span className="h-2 w-2 rounded-full bg-[var(--ui-primary)]" />
                                {item}
                            </div>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            title: 'v1.8.6',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Mar 30, 2026 - Feature
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        Save images once and use them anywhere in your project
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            EazyUI now has a project media library, so you can save useful images and bring them back into prompts and edits without re-uploading them every time.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            It is a faster way to keep logos, references, and product visuals close while you work.
                        </p>
                    </div>
                    <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {[
                            {
                                label: 'Library',
                                title: 'Reusable project images',
                                description: 'Keep your important images in one place and pull them in whenever you need them.',
                            },
                            {
                                label: 'Upload',
                                title: 'Cleaner upload flow',
                                description: 'Adding images feels simpler whether your project is empty or already full of media.',
                            },
                            {
                                label: 'Brand',
                                title: 'Better brand handling',
                                description: 'Logos and brand visuals are easier to save and reuse across the project.',
                            },
                        ].map((item) => (
                            <div
                                key={item.title}
                                className="rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"
                            >
                                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">{item.label}</p>
                                <p className="mt-2 text-[16px] font-semibold text-[var(--ui-text)]">{item.title}</p>
                                <p className="mt-2 text-[14px] leading-6 text-[var(--ui-text-muted)]">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            title: 'v1.8.0',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Mar 03, 2026 - Feature
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        EazyUI is better at knowing when to create, edit, or guide
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            Requests now feel more natural because EazyUI does a better job understanding whether you want a brand-new screen, an edit, or just a quick answer.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            That means less steering from you and results that stay closer to the direction of your project.
                        </p>
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                        <img
                            src={featureSlide1}
                            alt="Dashboard preview"
                            className="h-28 w-full rounded-[18px] border border-[var(--ui-border)] object-cover md:h-48"
                        />
                        <img
                            src={featureSlide2}
                            alt="Workflow preview"
                            className="h-28 w-full rounded-[18px] border border-[var(--ui-border)] object-cover md:h-48"
                        />
                    </div>
                </div>
            ),
        },
        {
            title: 'v1.7.4',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Mar 02, 2026 - Feature
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        New projects start with a clearer visual direction
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            Projects can now lock in a stronger visual style earlier, so the first screens already feel more connected.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            It is also easier to come back to that design direction later and keep refining it.
                        </p>
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                        <img
                            src={featureSlide3}
                            alt="Design system preview"
                            className="h-28 w-full rounded-[18px] border border-[var(--ui-border)] object-cover md:h-48"
                        />
                        <img
                            src={featureSlide4}
                            alt="Generated screen preview"
                            className="h-28 w-full rounded-[18px] border border-[var(--ui-border)] object-cover md:h-48"
                        />
                    </div>
                </div>
            ),
        },
        {
            title: 'v1.7.1',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Mar 01, 2026 - Improvement
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        The workspace feels smoother day to day
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            Streaming is calmer, the canvas feels steadier, and moving around the workspace is a bit more reliable.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            It is mostly polish, but it makes the product feel more solid while you work.
                        </p>
                    </div>
                    <div className="mt-8 space-y-3">
                        {[
                            'Smoother updates while screens are still generating',
                            'Cleaner movement and interaction inside the canvas',
                            'More stable motion across generated screens',
                        ].map((item) => (
                            <div
                                key={item}
                                className="flex items-center gap-3 rounded-[16px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3 text-[14px] text-[var(--ui-text-muted)]"
                            >
                                <span className="h-2 w-2 rounded-full bg-[var(--ui-primary)]" />
                                {item}
                            </div>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            title: 'v1.6.9',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Feb 28, 2026 - Platform
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        Plans and credits are easier to understand
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            Billing now does a better job showing how plans, top-ups, and credits fit together.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            It should be easier to understand what you have and what you used.
                        </p>
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className="rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Commerce</p>
                            <p className="mt-2 text-[16px] font-semibold text-[var(--ui-text)]">Plans and top-ups</p>
                            <p className="mt-2 text-[14px] leading-6 text-[var(--ui-text-muted)]">
                                Upgrading and adding more credits now feel like part of one simple flow.
                            </p>
                        </div>
                        <div className="rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Usage</p>
                            <p className="mt-2 text-[16px] font-semibold text-[var(--ui-text)]">Clearer balances</p>
                            <p className="mt-2 text-[14px] leading-6 text-[var(--ui-text-muted)]">
                                Credit balances and usage are easier to follow at a glance.
                            </p>
                        </div>
                    </div>
                </div>
            ),
        },
    ], []);

    return (
        <div ref={scrollContainerRef} className="h-screen w-screen overflow-y-auto bg-[var(--ui-surface-1)] text-[var(--ui-text)]">
            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} scrollContainerRef={scrollContainerRef} tone="surface" />

            <main className="bg-[var(--ui-surface-1)] pb-24 pt-14 md:pt-20">
                <Timeline
                    data={timelineData}
                    title="Changelog from the EazyUI journey"
                    description="A simple look at what is new in EazyUI, with friendly updates on features, polish, and product improvements."
                />

                <section className="px-4 pt-6 md:px-6 md:pt-10">
                    <div className="mx-auto max-w-6xl">
                        <div className="rounded-[2rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] bg-[var(--ui-surface-2)] px-6 py-8 md:px-8 md:py-10">
                            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">Try It Live</p>
                                    <h3 className="mt-4 max-w-[14ch] text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--ui-text)] md:text-[52px]">
                                        Open the product and see the latest changes in context.
                                    </h3>
                                    <p className="mt-4 max-w-[40rem] text-[15px] leading-8 text-[var(--ui-text-muted)]">
                                        The changelog should point back to the actual product, not feel like a detached archive.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={onOpenApp}
                                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_16px_40px_color-mix(in_srgb,var(--ui-primary)_28%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)]"
                                >
                                    Open app
                                    <ArrowUpRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
