import { ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import heroBg2 from '../../assets/img1.jpg';

type ChangelogPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

type ChangelogImage = {
    src: string;
    alt: string;
    caption?: string;
};

type ChangelogEntry = {
    id: string;
    date: string;
    version: string;
    title: string;
    notes: string[];
    images?: ChangelogImage[];
};

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
    {
        id: '2026-03-03',
        date: '2026-03-03',
        version: 'v3.8.0',
        title: 'Project-aware design planning',
        notes: [
            'Added request routing so chat can decide whether to edit an existing screen, answer in chat, or generate new screens.',
            'Planner now reads project memory and recent screen context before taking action.',
            'Improved consistency pass for repeated components like navigation, headers, and action buttons.',
        ],
    },
    {
        id: '2026-03-02',
        date: '2026-03-02',
        version: 'v3.7.4',
        title: 'Design system first-generation flow',
        notes: [
            'First request now generates a full design system before screen generation.',
            'Added design-system message widget in chat with quick navigation to the design tab.',
            'Design system response is now persisted in project chat history.',
        ],
    },
    {
        id: '2026-03-01',
        date: '2026-03-01',
        version: 'v3.7.1',
        title: 'Streaming and canvas interaction upgrades',
        notes: [
            'Reduced streaming flicker by applying smoother partial render behavior.',
            'Added keyboard shortcuts for canvas operations and improved focus-selected behavior.',
            'Introduced optional device animation visibility toggle in code defaults.',
        ],
        images: [
            {
                src: 'https://i.postimg.cc/tJv2Ct25/01-dashboard.png',
                alt: 'Dashboard screen preview',
                caption: 'New generation output with improved consistency.',
            },
            {
                src: 'https://i.postimg.cc/WzNH44Vx/01-profile.png',
                alt: 'Profile screen preview',
                caption: 'Profile layout generated using project context.',
            },
        ],
    },
    {
        id: '2026-02-28',
        date: '2026-02-28',
        version: 'v3.6.9',
        title: 'Billing and credits v1 foundation',
        notes: [
            'Added Stripe checkout + billing portal integration for plans and top-ups.',
            'Implemented credit accounting with monthly credits and on-demand usage support.',
            'Added billing API logs and setup documentation for local testing.',
        ],
    },
];

export function ChangelogPage({ onNavigate, onOpenApp }: ChangelogPageProps) {
    return (
        <div className="h-screen w-screen overflow-y-auto bg-[var(--ui-bg)] text-[var(--ui-text)]">
            <div className="pointer-events-none fixed inset-0">
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
            </div>

            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} />

            <main className="relative z-10 mx-auto max-w-[1120px] px-4 md:px-6 pt-10 pb-20">
                <section className="text-center">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">Changelog</p>
                    <h1 className="mt-3 text-[42px] md:text-[64px] leading-[1.02] tracking-[-0.03em] font-semibold">
                        What&apos;s New in <span className="text-[var(--color-accent)]">EazyUI</span>
                    </h1>
                    <p className="mx-auto mt-4 max-w-[62ch] text-[15px] text-[var(--ui-text-muted)]">
                        Product updates, fixes, and rollout progress. Each release can include rich notes and image previews.
                    </p>
                    <button
                        type="button"
                        onClick={onOpenApp}
                        className="mt-6 inline-flex h-10 items-center gap-2 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 text-[11px] uppercase tracking-[0.12em] text-[var(--ui-text)] hover:bg-[var(--ui-surface-3)] transition-colors"
                    >
                        Open app <ArrowUpRight size={13} />
                    </button>
                </section>

                <section className="mt-14">
                    <div className="relative">
                        <div className="absolute left-3 top-0 bottom-4 w-px border-l border-dashed border-[var(--ui-border-light)] md:hidden" />
                        <div className="absolute left-[184px] top-0 bottom-4 hidden w-px border-l border-dashed border-[var(--ui-border-light)] md:block" />

                        <div className="space-y-12 md:space-y-14">
                            {CHANGELOG_ENTRIES.map((entry) => (
                                <article key={entry.id} className="relative grid gap-5 pl-8 md:grid-cols-[170px_1fr] md:gap-14 md:pl-0">
                                    <span className="absolute left-[9px] top-3 h-2.5 w-2.5 rounded-sm border border-[var(--ui-border)] bg-[var(--color-accent)] md:hidden" />
                                    <span className="absolute left-[179px] top-3 hidden h-2.5 w-2.5 rounded-sm border border-[var(--ui-border)] bg-[var(--color-accent)] md:block" />
                                    <div className="md:pt-1">
                                        <p className="text-[24px] leading-none font-semibold text-[var(--color-accent)] md:text-[28px]">
                                            {entry.date}
                                        </p>
                                        <span className="mt-2 inline-flex rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-1 text-[11px] text-[var(--ui-text-muted)]">
                                            {entry.version}
                                        </span>
                                    </div>

                                    <div className="pt-0.5">
                                        <h2 className="text-[22px] leading-tight font-semibold text-[var(--ui-text)]">{entry.title}</h2>
                                        <ul className="mt-3 space-y-2">
                                            {entry.notes.map((note) => (
                                                <li key={note} className="text-[14px] leading-relaxed text-[var(--ui-text-muted)]">
                                                    <span className="mr-2 text-[var(--color-accent)]">&bull;</span>
                                                    {note}
                                                </li>
                                            ))}
                                        </ul>

                                        {entry.images && entry.images.length > 0 && (
                                            <div className="mt-5">
                                                <p className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[var(--ui-text-muted)]">
                                                    <ImageIcon size={12} /> Media
                                                </p>
                                                <div className={`grid gap-3 ${entry.images.length === 1 ? 'grid-cols-1 max-w-[460px]' : 'grid-cols-1 md:grid-cols-2'}`}>
                                                    {entry.images.map((image) => (
                                                        <figure key={`${entry.id}-${image.src}`} className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                                                            <img
                                                                src={image.src}
                                                                alt={image.alt}
                                                                loading="lazy"
                                                                className="h-[230px] w-full object-cover"
                                                            />
                                                            {image.caption && (
                                                                <figcaption className="border-t border-[var(--ui-border)] px-3 py-2 text-[12px] text-[var(--ui-text-muted)]">
                                                                    {image.caption}
                                                                </figcaption>
                                                            )}
                                                        </figure>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

