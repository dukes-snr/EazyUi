import { useRef } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';

type ChangelogPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

type ChangelogImage = {
    src?: string;
    alt?: string;
};

type ChangelogEntry = {
    id: string;
    date: string;
    version: string;
    tag: string;
    title: string;
    paragraphs: string[];
    image?: ChangelogImage;
    paletteClassName: string;
};

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
    {
        id: '2026-03-03',
        date: 'Mar 03, 2026',
        version: 'v3.8.0',
        tag: 'Feature',
        title: 'Project-aware design planning and sharper request routing',
        paragraphs: [
            'EazyUI now reads project memory and recent screen context before it decides what to do next. That means the system is better at telling the difference between a request that needs a fresh screen, a direct edit, or a simple answer in chat.',
            'We also tightened consistency handling for repeated UI like headers, actions, and navigation patterns, so generated flows feel more coherent from screen to screen instead of drifting after the first pass.',
            'This release is really about making the whole product feel more aware of the project it is inside, not just more capable in isolation.',
        ],
        image: {
            src: 'https://i.postimg.cc/tJv2Ct25/01-dashboard.png',
            alt: 'Dashboard preview',
        },
        paletteClassName: 'from-[rgba(255,76,160,0.85)] via-[rgba(70,196,255,0.62)] to-[rgba(255,155,82,0.3)]',
    },
    {
        id: '2026-03-02',
        date: 'Mar 02, 2026',
        version: 'v3.7.4',
        tag: 'Feature',
        title: 'Design-system generation now happens before first screen output',
        paragraphs: [
            'The first request in a project can now generate a proper design system before screen generation starts. That gives the rest of the project a clearer visual language to inherit from the beginning.',
            'We added a design-system message widget in chat with a direct path into the design tab, and we now persist the system response in project history so teams can revisit it instead of reconstructing it later.',
            'This is one of the more important structural updates because it pushes quality upstream rather than trying to rescue it after multiple screens already exist.',
        ],
        paletteClassName: 'from-[rgba(41,224,227,0.88)] via-[rgba(83,117,255,0.58)] to-[rgba(198,84,255,0.3)]',
    },
    {
        id: '2026-03-01',
        date: 'Mar 01, 2026',
        version: 'v3.7.1',
        tag: 'Improvement',
        title: 'Streaming, canvas interaction, and motion controls feel steadier',
        paragraphs: [
            'We reduced visible flicker during streaming output so partial renders feel smoother while content is still arriving. That makes the product less distracting during longer generations.',
            'Canvas interactions also got a pass: better keyboard shortcuts, cleaner focus handling, and optional visibility controls for device animation in generated code defaults.',
            'This is the kind of release that makes the workspace feel more composed. It is not flashy, but the day-to-day use of the tool improves immediately.',
        ],
        image: {
            src: 'https://i.postimg.cc/WzNH44Vx/01-profile.png',
            alt: 'Abstract hand artwork preview',
        },
        paletteClassName: 'from-[rgba(23,227,214,0.95)] via-[rgba(63,101,255,0.65)] to-[rgba(177,66,255,0.28)]',
    },
    {
        id: '2026-02-28',
        date: 'Feb 28, 2026',
        version: 'v3.6.9',
        tag: 'Platform',
        title: 'Billing foundation now supports plans, top-ups, and clearer credit accounting',
        paragraphs: [
            'Stripe checkout and billing portal flows are now wired in for subscription plans and credit top-ups, so the commercial side of the product finally matches the maturity of the workspace itself.',
            'We also added credit accounting for monthly credits, rollover support on paid usage, and local billing logs for better setup and debugging during development.',
            'This gives the pricing and account surfaces a more real product foundation instead of placeholder purchase behavior.',
        ],
        paletteClassName: 'from-[rgba(255,157,64,0.9)] via-[rgba(255,94,137,0.62)] to-[rgba(87,83,255,0.28)]',
    },
];

function ChangelogPreviewCard({ entry }: { entry: ChangelogEntry }) {
    if (entry.image?.src) {
        return (
            <div className="relative max-w-[24rem] overflow-hidden rounded-[1.15rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,rgba(255,255,255,0.08))] bg-[rgba(255,255,255,0.03)] p-1 shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
                <img
                    src={entry.image.src}
                    alt={entry.image.alt || entry.title}
                    loading="lazy"
                    className="aspect-[16/10] w-full rounded-[0.9rem] object-cover"
                />
            </div>
        );
    }

    return (
        <div className={`relative max-w-[24rem] overflow-hidden rounded-[1.15rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,rgba(255,255,255,0.08))] bg-gradient-to-br ${entry.paletteClassName} p-1 shadow-[0_18px_40px_rgba(0,0,0,0.2)]`}>
            <div className="flex aspect-[16/10] w-full items-end rounded-[0.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,10,16,0.06),rgba(7,10,16,0.48))] p-5">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/70">{entry.version}</p>
                    <p className="mt-2 max-w-[12ch] text-[28px] font-semibold leading-[0.98] tracking-[-0.04em] text-white">
                        {entry.title}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function ChangelogPage({ onNavigate, onOpenApp }: ChangelogPageProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    return (
        <div ref={scrollContainerRef} className="h-screen w-screen overflow-y-auto bg-[var(--ui-bg)] text-[var(--ui-text)]">
            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} scrollContainerRef={scrollContainerRef} />

            <main className="relative overflow-hidden bg-[var(--ui-bg)]">
                <section className="relative overflow-hidden border-b border-[color:color-mix(in_srgb,var(--ui-primary)_10%,rgba(255,255,255,0.06))] px-4 pb-20 pt-14 md:px-6 md:pb-24 md:pt-24">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(60%_46%_at_50%_12%,color-mix(in_srgb,var(--ui-primary)_18%,transparent),rgba(6,8,12,0)_70%)]" />
                        <div className="absolute left-[-8%] top-[18%] h-48 w-72 rounded-full bg-[color:color-mix(in_srgb,var(--ui-primary)_14%,transparent)] blur-[110px]" />
                        <div className="absolute right-[-10%] top-[20%] h-48 w-72 rounded-full bg-[rgba(255,138,92,0.12)] blur-[120px]" />
                        <div className="absolute left-1/2 top-[38%] h-44 w-[58rem] -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,rgba(0,0,0,0),color-mix(in_srgb,var(--ui-primary)_18%,transparent),rgba(255,120,78,0.12),rgba(0,0,0,0))] opacity-60 blur-[36px]" />
                    </div>

                    <div className="relative mx-auto flex max-w-[980px] flex-col items-center text-center">
                        <p className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_16%,rgba(255,255,255,0.08))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,rgba(255,255,255,0.02))] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--ui-primary)]">
                            <Sparkles size={12} />
                            What's New
                        </p>
                        <h1 className="mt-8 max-w-[11ch] [font-family:Fraunces,ui-serif,Georgia,serif] text-[42px] font-medium leading-[0.96] tracking-[-0.05em] text-[var(--ui-text)] md:text-[72px]">
                            Discover the latest changes we made just for you.
                        </h1>
                        <p className="mx-auto mt-5 max-w-[40rem] text-[15px] leading-8 text-[var(--ui-text-muted)] md:text-[17px]">
                            Product releases, workflow upgrades, and quality improvements shaped around the real way teams use EazyUI.
                        </p>
                        <button
                            type="button"
                            onClick={() => onNavigate('/contact')}
                            className="mt-8 inline-flex h-11 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,rgba(255,255,255,0.08))] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,rgba(255,255,255,0.02))] px-5 text-[12px] font-semibold text-[var(--ui-text)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_36%,transparent)] hover:text-[var(--ui-primary)]"
                        >
                            Follow updates
                            <ArrowUpRight size={14} />
                        </button>
                    </div>
                </section>

                <section className="px-4 pb-24 pt-12 md:px-6 md:pt-16">
                    <div className="relative mx-auto max-w-[1040px]">
                        <div className="absolute bottom-0 left-[1.1rem] top-0 hidden w-px bg-[linear-gradient(180deg,rgba(255,255,255,0.02),color-mix(in_srgb,var(--ui-primary)_12%,rgba(255,255,255,0.08)),rgba(255,255,255,0.02))] md:block lg:left-[2.25rem]" />

                        <div className="space-y-0">
                            {CHANGELOG_ENTRIES.map((entry) => (
                                <article
                                    key={entry.id}
                                    className="relative grid gap-6 border-t border-[rgba(255,255,255,0.03)] py-14 md:grid-cols-[4rem_18rem_minmax(0,1fr)] md:gap-16 lg:grid-cols-[4.5rem_18rem_minmax(0,1fr)] lg:gap-24"
                                >
                                    <div className="relative hidden md:block">
                                        <div className="sticky top-24 flex items-start justify-center pt-2">
                                            <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_34%,rgba(255,255,255,0.14))] bg-[var(--ui-bg)] shadow-[0_0_0_5px_rgba(6,8,12,0.94)]">
                                                <span className="h-2 w-2 rounded-full bg-[var(--ui-primary)] shadow-[0_0_22px_color-mix(in_srgb,var(--ui-primary)_42%,transparent)]" />
                                            </span>
                                        </div>
                                    </div>

                                    <div className="md:pt-2">
                                        <div className="md:sticky md:top-24">
                                            <span className="inline-flex rounded-full border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">
                                                {entry.tag}
                                            </span>
                                            <h2 className="mt-5 max-w-[12ch] text-[28px] font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--ui-text)] md:text-[36px]">
                                                {entry.title}
                                            </h2>
                                            <p className="mt-4 text-[13px] text-[var(--ui-text-subtle)]">{entry.date}</p>
                                            <p className="mt-2 text-[12px] uppercase tracking-[0.14em] text-[var(--ui-primary)]">{entry.version}</p>
                                        </div>
                                    </div>

                                    <div className="max-w-[24rem]">
                                        {entry.image ? <ChangelogPreviewCard entry={entry} /> : null}
                                        <div className={`${entry.image ? 'mt-6' : 'mt-0'} space-y-4`}>
                                            {entry.paragraphs.map((paragraph) => (
                                                <p key={paragraph} className="text-[15px] leading-8 text-[var(--ui-text-muted)]">
                                                    {paragraph}
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="px-4 pb-24 md:px-6">
                    <div className="mx-auto max-w-[1180px]">
                        <div className="rounded-[2rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_14%,rgba(255,255,255,0.08))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ui-primary)_6%,rgba(255,255,255,0.03)),rgba(255,255,255,0.02))] px-6 py-8 md:px-8 md:py-10">
                            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">Keep Exploring</p>
                                    <h3 className="mt-4 max-w-[14ch] text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--ui-text)] md:text-[52px]">
                                        Open the product and try the latest updates in context.
                                    </h3>
                                    <p className="mt-4 max-w-[40rem] text-[15px] leading-8 text-[var(--ui-text-muted)]">
                                        The changelog should feel like a preview of the current product state, not a detached archive page.
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
