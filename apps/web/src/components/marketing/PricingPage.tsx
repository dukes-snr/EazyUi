import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check, Linkedin, Loader2, Monitor, Moon, Sun, X, Youtube } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import appLogo from '../../assets/Ui-logo.png';
import { apiClient, type BillingCatalogPrice, type BillingCatalogResponse, type BillingCreditPackProductKey } from '../../api/client';
import { useUiStore } from '../../stores';

type PricingPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

type BillingCadence = 'monthly' | 'annual';
type CorePlanKey = 'pro' | 'team';
type ComparisonKey = 'pro' | 'team' | 'credits';

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

const FALLBACK_PRICE_CENTS: Record<CorePlanKey, { monthly: number; currency: string }> = {
    pro: { monthly: 2400, currency: 'USD' },
    team: { monthly: 7900, currency: 'USD' },
};

const FALLBACK_CREDIT_PACKS: Record<BillingCreditPackProductKey, { credits: number; oneTime: number; currency: string }> = {
    credits_1000: { credits: 1000, oneTime: 1000, currency: 'USD' },
    credits_5000: { credits: 5000, oneTime: 4000, currency: 'USD' },
    credits_10000: { credits: 10000, oneTime: 7000, currency: 'USD' },
};

const PLAN_CARDS: PlanCard[] = [
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

const COMPARISON_ROWS: Array<{ label: string; values: Record<ComparisonKey, ComparisonValue> }> = [
    {
        label: 'Included credits',
        values: { pro: '3,000 / month', team: '15,000 / month', credits: '1k, 5k, or 10k packs' },
    },
    {
        label: 'Purchase type',
        values: { pro: 'Recurring subscription', team: 'Recurring subscription', credits: 'One-time credits' },
    },
    {
        label: 'Prompt composer',
        values: { pro: true, team: true, credits: true },
    },
    {
        label: 'Image attachments',
        values: { pro: true, team: true, credits: true },
    },
    {
        label: 'Inline URL references',
        values: { pro: true, team: true, credits: true },
    },
    {
        label: 'Credits rollover',
        values: { pro: true, team: true, credits: false },
    },
    {
        label: 'Shared team rollout capacity',
        values: { pro: false, team: true, credits: false },
    },
    {
        label: 'Works with any active plan',
        values: { pro: false, team: false, credits: true },
    },
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
    const theme = useUiStore((state) => state.theme);
    const toggleTheme = useUiStore((state) => state.toggleTheme);
    const [cadence, setCadence] = useState<BillingCadence>('monthly');
    const [catalog, setCatalog] = useState<BillingCatalogResponse | null>(null);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [selectedCreditPackKey, setSelectedCreditPackKey] = useState<BillingCreditPackProductKey>('credits_5000');

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

    useEffect(() => {
        const defaultProductKey = catalog?.creditPacks.defaultProductKey;
        if (defaultProductKey) {
            setSelectedCreditPackKey(defaultProductKey);
        }
    }, [catalog?.creditPacks.defaultProductKey]);

    const pricingCards = useMemo(() => {
        const plans = catalog?.plans;
        return PLAN_CARDS.map((plan) => {
            return {
                ...plan,
                price: getDisplayPrice(plans?.[plan.key].price, cadence, FALLBACK_PRICE_CENTS[plan.key]),
            };
        });
    }, [cadence, catalog]);

    const selectedCreditPack = useMemo(() => {
        const livePack = catalog?.creditPacks.items.find((item) => item.productKey === selectedCreditPackKey);
        if (livePack) return livePack;
        const fallback = FALLBACK_CREDIT_PACKS[selectedCreditPackKey];
        return {
            productKey: selectedCreditPackKey,
            label: `${fallback.credits.toLocaleString()} credits`,
            credits: fallback.credits,
            price: {
                productKey: selectedCreditPackKey,
                priceId: null,
                configured: false,
                active: false,
                currency: fallback.currency,
                unitAmount: fallback.oneTime,
                type: 'one_time' as const,
                interval: null,
                intervalCount: null,
            },
        };
    }, [catalog, selectedCreditPackKey]);

    const selectedCreditPackPrice = useMemo(() => {
        const fallback = FALLBACK_CREDIT_PACKS[selectedCreditPackKey];
        return getDisplayPrice(selectedCreditPack.price, 'monthly', { monthly: fallback.oneTime, currency: fallback.currency });
    }, [selectedCreditPack, selectedCreditPackKey]);

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
                                                    {loadingCatalog ? <Loader2 size={34} className="animate-spin" /> : plan.price.amount}
                                                </p>
                                                {!loadingCatalog ? (
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
                                <article className="rounded-[1.8rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-surface-1)_90%,white)] p-5 text-[var(--ui-text)] shadow-[0_16px_40px_rgba(15,23,42,0.06)] dark:bg-[color:color-mix(in_srgb,var(--ui-surface-1)_96%,transparent)] dark:shadow-[0_18px_40px_rgba(2,6,23,0.18)] md:p-6">
                                    <p className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--ui-text)]">Credit Packs</p>
                                    <p className="mt-1 text-[12px] text-[var(--ui-text-subtle)]">For bursts, launches, and overflow usage</p>
                                    <div className="mt-5 flex items-end gap-2">
                                        <p className="text-[44px] font-semibold leading-none tracking-[-0.05em] text-[var(--ui-text)]">
                                            {loadingCatalog ? <Loader2 size={34} className="animate-spin" /> : selectedCreditPackPrice.amount}
                                        </p>
                                    </div>
                                    <p className="mt-4 min-h-[56px] text-[13px] leading-6 text-[var(--ui-text-muted)]">
                                        Choose the pack size you need. Credit packs stack on top of your current balance and work alongside any subscription.
                                    </p>
                                    <div className="mt-5 grid grid-cols-3 gap-2">
                                        {(catalog?.creditPacks.items || (Object.keys(FALLBACK_CREDIT_PACKS) as BillingCreditPackProductKey[]).map((key) => ({
                                            productKey: key,
                                            label: `${FALLBACK_CREDIT_PACKS[key].credits.toLocaleString()} credits`,
                                            credits: FALLBACK_CREDIT_PACKS[key].credits,
                                            price: null as unknown as BillingCatalogPrice,
                                        }))).map((pack) => (
                                            <button
                                                key={pack.productKey}
                                                type="button"
                                                onClick={() => setSelectedCreditPackKey(pack.productKey)}
                                                className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                                                    selectedCreditPackKey === pack.productKey
                                                        ? 'border-[var(--ui-primary)] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,transparent)]'
                                                        : 'border-[var(--ui-border)] bg-[var(--ui-surface-1)] hover:bg-[var(--ui-surface-2)]'
                                                }`}
                                            >
                                                <p className="text-[13px] font-semibold text-[var(--ui-text)]">{pack.credits.toLocaleString()}</p>
                                                <p className="mt-1 text-[11px] text-[var(--ui-text-subtle)]">credits</p>
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onOpenApp}
                                        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full border-2 border-[var(--ui-primary)] bg-transparent text-[12px] font-semibold text-[var(--ui-primary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--ui-primary)_22%,transparent)] transition-colors hover:border-[var(--ui-primary-hover)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,transparent)] hover:text-[var(--ui-primary-hover)]"
                                    >
                                        Buy credits
                                    </button>
                                    <div className="mt-6 space-y-3">
                                        {[
                                            `${selectedCreditPack.credits.toLocaleString()} one-time credits`,
                                            'Stacks with your current balance',
                                            'Works with Pro or Team',
                                            'Good for launches and heavy weeks',
                                        ].map((feature) => (
                                            <div key={feature} className="flex items-start gap-3">
                                                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ui-primary)_10%,transparent)] text-[var(--ui-primary)]">
                                                    <Check size={11} />
                                                </span>
                                                <span className="text-[13px] leading-6 text-[var(--ui-text-muted)]">{feature}</span>
                                            </div>
                                        ))}
                                    </div>
                                </article>
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
                                        {[...pricingCards, {
                                            key: 'credits',
                                            name: 'Credit Packs',
                                            price: selectedCreditPackPrice,
                                            featured: false,
                                        }].map((plan) => {
                                            const isFeatured = Boolean(plan.featured);
                                            return (
                                                <div
                                                    key={`header-${plan.key}`}
                                                    className={`px-4 py-6 text-center ${isFeatured ? 'bg-[#232323]' : ''}`}
                                                >
                                                    <p className={`text-[12px] ${isFeatured ? 'text-white' : 'text-[var(--ui-text-subtle)]'}`}>{plan.name}</p>
                                                    <div className="mt-3 flex items-end justify-center gap-1.5">
                                                        <p className={`text-[34px] font-semibold leading-none tracking-[-0.05em] ${isFeatured ? 'text-white' : 'text-[var(--ui-text)]'}`}>
                                                            {loadingCatalog ? '...' : plan.price.amount}
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
                                                {(['pro', 'team', 'credits'] as const).map((planKey) => {
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

                                <footer className="landing-footer">
                    <div className="landing-footer-shell">
                        <div className="landing-footer-panel">
                            <button
                                type="button"
                                className="landing-footer-scrolltop"
                                onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
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
                                        AI UI design workspace for creating screens, flows, and interface concepts in seconds. Export to HTML and Figma. Trusted by 140,000+ users worldwide.
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
                                    <p className="landing-footer-copyright">Copyright 2026 EazyUI. All rights reserved.</p>
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
                    </div>
                </footer>
            </main>
        </div>
    );
}

