import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Instagram, Linkedin, Loader2, Mail, X, Youtube } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import appLogo from '../../assets/Ui-logo.png';
import { apiClient, type BillingCatalogPrice, type BillingCatalogResponse } from '../../api/client';

type PricingPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

type BillingCadence = 'monthly' | 'annual';
type CorePlanKey = 'free' | 'pro' | 'team';

type PlanCard = {
    key: CorePlanKey;
    name: string;
    caption: string;
    description: string;
    buttonLabel: string;
    featured?: boolean;
    features: string[];
};

type ComparisonValue = boolean | 'limited' | string;

const FALLBACK_PRICE_CENTS: Record<Exclude<CorePlanKey, 'free'>, { monthly: number; currency: string }> = {
    pro: { monthly: 2400, currency: 'USD' },
    team: { monthly: 7900, currency: 'USD' },
};

const PLAN_CARDS: PlanCard[] = [
    {
        key: 'free',
        name: 'Free Plan',
        caption: 'Best for trying the workflow',
        description: 'A clean starting point for testing prompts, comparing directions, and understanding the product before upgrading.',
        buttonLabel: 'Get Started',
        features: [
            '100 monthly credits',
            'Web, mobile, and tablet targets',
            'Prompt composer with references',
            'Fast first-pass generation',
        ],
    },
    {
        key: 'pro',
        name: 'Pro Plan',
        caption: 'For solo builders and designers',
        description: 'Sharper first passes, better control over direction, and more room to iterate when quality matters.',
        buttonLabel: 'Get Started',
        featured: true,
        features: [
            '3,000 monthly credits',
            'Voice input and inline URL references',
            'All style controls and model modes',
            'Priority support',
        ],
    },
    {
        key: 'team',
        name: 'Team Plan',
        caption: 'For product teams shipping together',
        description: 'Higher capacity for shared projects, tighter review loops, and more room during launch-heavy periods.',
        buttonLabel: 'Get Started',
        features: [
            '15,000 monthly credits',
            'Shared team rollout capacity',
            'Credits rollover on paid usage',
            'Faster team-wide iteration',
        ],
    },
];

const COMPARISON_ROWS: Array<{ label: string; values: Record<CorePlanKey, ComparisonValue> }> = [
    {
        label: 'Monthly credits',
        values: { free: '100', pro: '3,000', team: '15,000' },
    },
    {
        label: 'Platform targets',
        values: { free: 'Web, mobile, tablet', pro: 'Web, mobile, tablet', team: 'Web, mobile, tablet' },
    },
    {
        label: 'Prompt composer',
        values: { free: true, pro: true, team: true },
    },
    {
        label: 'Image attachments',
        values: { free: true, pro: true, team: true },
    },
    {
        label: 'Inline URL references',
        values: { free: 'Limited', pro: true, team: true },
    },
    {
        label: 'Voice input',
        values: { free: false, pro: true, team: true },
    },
    {
        label: 'Style controls',
        values: { free: 'Limited', pro: true, team: true },
    },
    {
        label: 'Model modes',
        values: { free: 'Limited', pro: true, team: true },
    },
    {
        label: 'Priority support',
        values: { free: false, pro: true, team: true },
    },
    {
        label: 'Credits rollover',
        values: { free: false, pro: true, team: true },
    },
    {
        label: 'Shared team rollout capacity',
        values: { free: false, pro: false, team: true },
    },
    {
        label: 'Faster team-wide iteration',
        values: { free: false, pro: false, team: true },
    },
] as const;

function formatMoney(amountCents: number | null, currency: string | null): string {
    if (amountCents === null || Number.isNaN(amountCents)) return 'Contact';
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: (currency || 'USD').toUpperCase(),
        maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    }).format(amountCents / 100);
}

function getDisplayPrice(price: BillingCatalogPrice | null | undefined, cadence: BillingCadence, fallback: { monthly: number; currency: string }) {
    if (!price?.configured || !price.active || price.unitAmount === null) {
        if (cadence === 'annual') {
            return {
                amount: formatMoney(fallback.monthly * 12, fallback.currency),
                cadenceLabel: '/year',
            };
        }
        return {
            amount: formatMoney(fallback.monthly, fallback.currency),
            cadenceLabel: '/month',
        };
    }

    if (price.type === 'recurring') {
        const monthlyAmount = price.interval === 'year' && price.intervalCount
            ? Math.round(price.unitAmount / (12 * price.intervalCount))
            : price.unitAmount;

        if (cadence === 'annual') {
            return {
                amount: formatMoney(monthlyAmount * 12, price.currency),
                cadenceLabel: '/year',
            };
        }

        return {
            amount: formatMoney(monthlyAmount, price.currency),
            cadenceLabel: '/month',
        };
    }

    return {
        amount: formatMoney(price.unitAmount, price.currency),
        cadenceLabel: '',
    };
}

function renderComparisonValue(value: ComparisonValue, featured = false) {
    if (value === true) {
        return (
            <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${featured ? 'bg-white/14 text-white' : 'bg-[color:color-mix(in_srgb,var(--ui-primary)_12%,transparent)] text-[var(--ui-primary)]'}`}
            >
                <Check size={13} />
            </span>
        );
    }

    if (value === false) {
        return <span className={`text-[13px] ${featured ? 'text-white/72' : 'text-[var(--ui-text-subtle)]'}`}>-</span>;
    }

    if (value === 'limited' || value === 'Limited') {
        return <span className={`text-[12px] font-medium ${featured ? 'text-white' : 'text-[var(--ui-primary)]'}`}>Limited</span>;
    }

    return <span className={`text-[12px] font-medium leading-5 ${featured ? 'text-white' : 'text-[var(--ui-text-muted)]'}`}>{value}</span>;
}

export function PricingPage({ onNavigate, onOpenApp }: PricingPageProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [cadence, setCadence] = useState<BillingCadence>('monthly');
    const [catalog, setCatalog] = useState<BillingCatalogResponse | null>(null);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [newsletterEmail, setNewsletterEmail] = useState('');
    const [newsletterBusy, setNewsletterBusy] = useState(false);
    const [newsletterStatus, setNewsletterStatus] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        const loadCatalog = async () => {
            try {
                setLoadingCatalog(true);
                const response = await apiClient.getBillingCatalog(controller.signal);
                setCatalog(response);
            } finally {
                if (!controller.signal.aborted) setLoadingCatalog(false);
            }
        };

        void loadCatalog();
        return () => controller.abort();
    }, []);

    const pricingCards = useMemo(() => {
        const plans = catalog?.plans;
        return PLAN_CARDS.map((plan) => {
            if (plan.key === 'free') {
                return {
                    ...plan,
                    price: { amount: '$0', cadenceLabel: '/month' },
                };
            }

            return {
                ...plan,
                price: getDisplayPrice(plans?.[plan.key].price, cadence, FALLBACK_PRICE_CENTS[plan.key]),
            };
        });
    }, [cadence, catalog]);

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

    return (
        <div ref={scrollContainerRef} className="h-screen w-screen overflow-y-auto bg-[var(--ui-surface-1)] text-[var(--ui-text)]">
            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} scrollContainerRef={scrollContainerRef} />

            <main className="relative">
                <section className="landing-surface-band landing-surface-band-1 px-4 pb-20 pt-10 md:px-6 md:pt-14">
                    <div className="mx-auto w-full max-w-[1120px]">
                        <div className="px-1 py-4 md:px-0 md:py-6">
                            <div className="text-center">
                                <div className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--ui-primary)]">
                                    <span className="rounded-full bg-[var(--ui-primary)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-white">Close</span>
                                    Best pricing for you
                                </div>
                                <h1 className="mx-auto mt-5 max-w-[12ch] text-[42px] font-semibold leading-[0.96] tracking-[-0.06em] text-[var(--ui-text)] md:text-[72px]">
                                    Boost your <span className="text-[var(--ui-primary)]">teamwork.</span>
                                </h1>
                                <p className="mx-auto mt-3 max-w-[52ch] text-[14px] leading-7 text-[var(--ui-text-muted)] md:text-[15px]">
                                    Unlimited experts and easy flows, so every card, screen, and product review moves faster with less guesswork.
                                </p>

                                <div className="mt-7 inline-flex rounded-full bg-[color:color-mix(in_srgb,var(--ui-surface-1)_88%,white)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:bg-[color:color-mix(in_srgb,var(--ui-surface-1)_92%,transparent)]">
                                    {(['monthly', 'annual'] as const).map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setCadence(option)}
                                            className={`min-w-[92px] rounded-full px-4 py-2 text-[12px] font-medium transition-all ${cadence === option
                                                ? 'bg-[#252525] text-white shadow-[0_8px_24px_rgba(15,23,42,0.24)]'
                                                : 'text-[var(--ui-text-muted)]'
                                                }`}
                                        >
                                            {option === 'monthly' ? 'Monthly' : 'Yearly'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-10 grid gap-4 lg:grid-cols-3">
                                {pricingCards.map((plan) => {
                                    const isFeatured = Boolean(plan.featured);
                                    return (
                                        <article
                                            key={plan.key}
                                            className={`rounded-[1.8rem] border p-5 md:p-6 ${isFeatured
                                                ? 'border-[#2a2a2a] bg-[#232323] text-white shadow-[0_18px_40px_rgba(15,23,42,0.24)]'
                                                : 'border-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-surface-1)_90%,white)] text-[var(--ui-text)] shadow-[0_16px_40px_rgba(15,23,42,0.06)] dark:bg-[color:color-mix(in_srgb,var(--ui-surface-1)_96%,transparent)] dark:shadow-[0_18px_40px_rgba(2,6,23,0.18)]'
                                                }`}
                                        >
                                            <p className={`text-[18px] font-semibold tracking-[-0.03em] ${isFeatured ? 'text-white' : 'text-[var(--ui-text)]'}`}>{plan.name}</p>
                                            <p className={`mt-1 text-[12px] ${isFeatured ? 'text-white/58' : 'text-[var(--ui-text-subtle)]'}`}>{plan.caption}</p>
                                            <div className="mt-5 flex items-end gap-2">
                                                <p className={`text-[44px] font-semibold leading-none tracking-[-0.05em] ${isFeatured ? 'text-white' : 'text-[var(--ui-text)]'}`}>
                                                    {loadingCatalog && plan.key !== 'free' ? <Loader2 size={34} className="animate-spin" /> : plan.price.amount}
                                                </p>
                                                {!loadingCatalog || plan.key === 'free' ? (
                                                    <span className={`pb-1 text-[11px] ${isFeatured ? 'text-white/58' : 'text-[var(--ui-text-subtle)]'}`}>{plan.price.cadenceLabel}</span>
                                                ) : null}
                                            </div>
                                            <p className={`mt-4 min-h-[56px] text-[13px] leading-6 ${isFeatured ? 'text-white/70' : 'text-[var(--ui-text-muted)]'}`}>
                                                {plan.description}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={onOpenApp}
                                                className={`mt-5 inline-flex h-11 w-full items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${isFeatured
                                                    ? 'border border-white/18 bg-[var(--ui-primary)] text-white hover:bg-[var(--ui-primary-hover)]'
                                                    : 'border-2 border-[var(--ui-primary)] bg-transparent text-[var(--ui-primary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--ui-primary)_22%,transparent)] hover:border-[var(--ui-primary-hover)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,transparent)] hover:text-[var(--ui-primary-hover)]'
                                                    }`}
                                            >
                                                {plan.buttonLabel}
                                            </button>
                                            <div className="mt-6 space-y-3">
                                                {plan.features.map((feature) => (
                                                    <div key={feature} className="flex items-start gap-3">
                                                        <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full ${isFeatured ? 'bg-white/12 text-white' : 'bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)] text-[var(--ui-primary)]'}`}>
                                                            <Check size={11} />
                                                        </span>
                                                        <span className={`text-[13px] leading-6 ${isFeatured ? 'text-white/76' : 'text-[var(--ui-text-muted)]'}`}>{feature}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>

                            <div className="mt-8 rounded-[1.7rem] bg-[#232323] px-5 py-5 text-white md:flex md:items-center md:justify-between md:px-6">
                                <div>
                                    <p className="text-[26px] font-semibold leading-[1.05] tracking-[-0.04em]">Need more than a standard plan?</p>
                                    <p className="mt-2 text-[14px] leading-7 text-white/72">
                                        Add extra credits for spikes or reach out if your enterprise team needs a custom rollout.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onNavigate('/contact')}
                                    className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-[12px] font-semibold text-[#232323] transition-colors hover:bg-white/90 md:mt-0"
                                >
                                    Contact Us
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="landing-surface-band landing-surface-band-1 px-4 pb-24 md:px-6">
                    <div className="mx-auto w-full max-w-[1120px]">
                        <div>
                            <div className="px-1 py-2 md:px-0 md:py-0">
                                <h2 className="text-[32px] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--ui-text)] md:text-[48px]">
                                    Compare every plan against the full workflow.
                                </h2>
                                <p className="mt-3 max-w-[56ch] text-[14px] leading-7 text-[var(--ui-text-muted)]">
                                    Prices first, then a full feature matrix. That keeps the page aligned with the reference while still reflecting the actual EazyUI product.
                                </p>
                            </div>

                            <div className="mt-8 overflow-x-auto">
                                <div className="min-w-[860px]">
                                    <div className="grid grid-cols-[1.25fr_repeat(3,minmax(0,1fr))] border-b border-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-border))]">
                                        <div className="px-5 py-6 md:px-8" />
                                        {pricingCards.map((plan) => {
                                            const isFeatured = Boolean(plan.featured);
                                            return (
                                                <div
                                                    key={`header-${plan.key}`}
                                                    className={`px-4 py-6 text-center ${isFeatured ? 'bg-[#232323]' : ''}`}
                                                >
                                                    <p className={`text-[12px] ${isFeatured ? 'text-white' : 'text-[var(--ui-text-subtle)]'}`}>{plan.name}</p>
                                                    <div className="mt-3 flex items-end justify-center gap-1.5">
                                                        <p className={`text-[34px] font-semibold leading-none tracking-[-0.05em] ${isFeatured ? 'text-white' : 'text-[var(--ui-text)]'}`}>
                                                            {loadingCatalog && plan.key !== 'free' ? '...' : plan.price.amount}
                                                        </p>
                                                        <span className={`pb-1 text-[11px] ${isFeatured ? 'text-white' : 'text-[var(--ui-text-subtle)]'}`}>
                                                            {plan.price.cadenceLabel}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="divide-y divide-[color:color-mix(in_srgb,var(--ui-primary)_7%,var(--ui-border))]">
                                        {COMPARISON_ROWS.map((row, index) => (
                                            <div
                                                key={row.label}
                                                className={`grid grid-cols-[1.25fr_repeat(3,minmax(0,1fr))] ${index % 2 === 0 ? 'bg-[color:color-mix(in_srgb,var(--ui-surface-2)_55%,white)] dark:bg-[color:color-mix(in_srgb,var(--ui-surface-2)_72%,transparent)]' : ''}`}
                                            >
                                                <div className="px-5 py-4 md:px-8">
                                                    <p className="text-[13px] font-medium text-[var(--ui-text)]">{row.label}</p>
                                                </div>
                                                {(['free', 'pro', 'team'] as const).map((planKey) => {
                                                    const isFeatured = planKey === 'pro';
                                                    return (
                                                        <div
                                                            key={`${row.label}-${planKey}`}
                                                            className={`flex items-center justify-center px-4 py-4 text-center ${isFeatured ? 'bg-[#232323]' : ''}`}
                                                        >
                                                            {renderComparisonValue(row.values[planKey], isFeatured)}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <footer className="landing-footer" style={{ background: 'var(--ui-surface-1)' }}>
                    <div className="landing-footer-shell">
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
                                    {newsletterStatus ? <p className="landing-footer-newsletter-status">{newsletterStatus}</p> : null}
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
                    </div>
                </footer>
            </main>
        </div>
    );
}
