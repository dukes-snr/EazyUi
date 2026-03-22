import { useMemo, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';

import featureSlide1 from '../../assets/Slide1.png';
import featureSlide2 from '../../assets/Slide2.png';
import featureSlide3 from '../../assets/Slide3.png';
import featureSlide4 from '../../assets/Slide4.png';
import { Timeline, type TimelineEntry } from '../ui/timeline';
import { MarketingHeader } from './MarketingHeader';

type ChangelogPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

export function ChangelogPage({ onNavigate, onOpenApp }: ChangelogPageProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    const timelineData = useMemo<TimelineEntry[]>(() => [
        {
            title: 'v3.8.0',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Mar 03, 2026 • Feature
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        Project-aware design planning and sharper request routing
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            EazyUI now reads project memory and recent screen context before deciding what to do next, so the system is better at separating fresh generations from edits and direct chat answers.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            We also tightened repeated interface logic for headers, actions, and navigation patterns, which makes generated flows feel more coherent from screen to screen instead of drifting after the first pass.
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
            title: 'v3.7.4',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Mar 02, 2026 • Feature
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        Design-system generation now happens before first screen output
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            The first request in a project can now generate a proper design system before screen generation starts, giving the rest of the project a stronger visual language from the beginning.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            We added a design-system message widget in chat and persist the response in project history, so teams can revisit and refine the system instead of reconstructing it later.
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
            title: 'v3.7.1',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Mar 01, 2026 • Improvement
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        Streaming, canvas interaction, and motion controls feel steadier
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            We reduced visible flicker during streaming output so partial renders feel smoother while content is still arriving, especially on longer generations.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            Canvas interactions also got a pass: better keyboard shortcuts, cleaner focus handling, and more deliberate device animation defaults in generated code.
                        </p>
                    </div>
                    <div className="mt-8 space-y-3">
                        {[
                            'Smoother streaming output while generation is still in progress',
                            'Cleaner keyboard shortcuts and focus behavior inside the canvas',
                            'More stable motion defaults for generated interactive screens',
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
            title: 'v3.6.9',
            content: (
                <div>
                    <p className="mb-3 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                        Feb 28, 2026 • Platform
                    </p>
                    <h3 className="max-w-[22ch] text-[28px] font-semibold leading-[1.06] tracking-[-0.04em] text-[var(--ui-text)] md:text-[36px]">
                        Billing now supports plans, top-ups, and clearer credit accounting
                    </h3>
                    <div className="mt-5 space-y-4">
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            Stripe checkout and billing portal flows are now wired in for subscription plans and credit top-ups, so the commercial side of the product matches the maturity of the workspace.
                        </p>
                        <p className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                            We also added monthly credit accounting, rollover support on paid usage, and better local billing logs for setup and debugging during development.
                        </p>
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className="rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Commerce</p>
                            <p className="mt-2 text-[16px] font-semibold text-[var(--ui-text)]">Plans and top-ups</p>
                            <p className="mt-2 text-[14px] leading-6 text-[var(--ui-text-muted)]">
                                Subscription checkout and one-off credit purchasing now work as part of the same billing model.
                            </p>
                        </div>
                        <div className="rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Usage</p>
                            <p className="mt-2 text-[16px] font-semibold text-[var(--ui-text)]">Clearer credit logic</p>
                            <p className="mt-2 text-[14px] leading-6 text-[var(--ui-text-muted)]">
                                Monthly credits, rollover handling, and local billing logs are now easier to understand and verify.
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
                    description="A running view of the releases shaping EazyUI, from generation quality and design systems to workflow polish, billing, and product infrastructure."
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
