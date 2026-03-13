import { Check } from 'lucide-react';

type GlassPricingSectionProps = {
    className?: string;
    onGetStarted?: () => void;
};

const TIERS = [
    {
        plan: 'Starter',
        price: '$0',
        cadence: '/mo',
        summary: 'For exploring prompts, testing screen directions, and getting a feel for the workflow.',
        features: [
            'Core prompt composer',
            'Mobile, tablet, and desktop targets',
            'Basic style preset access',
            'Image references and export-ready drafts',
            'Email support',
        ],
        emphasized: false,
        cta: 'Start free',
    },
    {
        plan: 'Pro',
        price: '$24',
        cadence: '/editor / mo',
        summary: 'For designers and product teams who want faster iteration and sharper first-pass quality.',
        features: [
            'Unlimited generations',
            'All five style presets',
            'Voice input and inline URL references',
            'Faster iteration history and saved prompts',
            'Priority support',
        ],
        emphasized: true,
        cta: 'Go pro',
    },
    {
        plan: 'Studio',
        price: 'Custom',
        cadence: '',
        summary: 'For teams aligning brand systems, collaboration, and rollout across multiple products.',
        features: [
            'Shared team workspaces',
            'Brand-aligned prompt libraries',
            'Advanced review workflows',
            'Priority onboarding and support',
            'Custom rollout guidance',
        ],
        emphasized: false,
        cta: 'Talk to us',
    },
] as const;

export function GlassPricingSection({ className = '', onGetStarted }: GlassPricingSectionProps) {
    return (
        <section className={`relative ${className}`}>
            <div className="landing-page-section-inner landing-page-section-inner-full">
                <div className="landing-pricing-shell rounded-[34px] border border-white/10 px-4 py-6 md:px-8 md:py-8">
                    <div className="landing-fade-up flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-[660px]">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Pricing</p>
                            <h3 className="mt-3 text-[30px] md:text-[44px] leading-[1.04] tracking-[-0.03em] font-semibold text-white">
                                Pick the plan that matches how fast your team wants to move.
                            </h3>
                        </div>
                        <p className="max-w-[420px] text-[14px] leading-7 text-slate-300">
                            Start lean, upgrade when you need stronger collaboration, more control, and a tighter system around the same core workflow.
                        </p>
                    </div>

                    <div className="mt-10 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
                        <article className="landing-pricing-intro landing-fade-up">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Included in every plan</p>
                            <h4 className="mt-3 text-[28px] leading-[1.08] tracking-[-0.03em] font-semibold text-white">
                                The same calm, screen-first workflow from solo exploration to studio rollout.
                            </h4>
                            <div className="mt-6 space-y-4">
                                {[
                                    'Prompt-to-screen generation built for real product review.',
                                    'Device-aware outputs for mobile, tablet, and desktop.',
                                    'Refinement tools that keep the first draft worth discussing.',
                                ].map((item) => (
                                    <div key={item} className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4 text-[14px] leading-7 text-slate-300">
                                        {item}
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={onGetStarted}
                                className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] px-5 text-[13px] font-semibold text-white hover:bg-white/10 transition-colors"
                            >
                                Generate a pricing concept
                            </button>
                        </article>

                        <div className="grid gap-4 md:grid-cols-3">
                            {TIERS.map((tier) => (
                                <article
                                    key={tier.plan}
                                    className={`landing-pricing-card ${tier.emphasized ? 'is-featured' : ''}`}
                                >
                                    <div className="landing-pricing-card-top">
                                        <span className="landing-pricing-chip">{tier.plan}</span>
                                        {tier.emphasized && <span className="landing-pricing-chip landing-pricing-chip-featured">Most chosen</span>}
                                    </div>
                                    <div className="mt-6">
                                        <div className="flex items-end gap-1.5">
                                            <h4 className="text-[42px] leading-none tracking-[-0.04em] font-semibold text-white">{tier.price}</h4>
                                            {tier.cadence && <span className="pb-1 text-[13px] text-slate-400">{tier.cadence}</span>}
                                        </div>
                                        <p className="mt-3 text-[13px] leading-6 text-slate-300">{tier.summary}</p>
                                    </div>

                                    <ul className="mt-8 space-y-3">
                                        {tier.features.map((feature) => (
                                            <li key={feature} className="flex items-start gap-3 text-[13px] leading-6 text-slate-300">
                                                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-white">
                                                    <Check size={12} />
                                                </span>
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <button
                                        type="button"
                                        onClick={onGetStarted}
                                        className={`mt-8 h-11 w-full rounded-full text-[13px] font-semibold transition-colors ${tier.emphasized
                                            ? 'bg-white text-[#070a12] hover:bg-slate-200'
                                            : 'border border-white/15 bg-white/[0.06] text-white hover:bg-white/10'
                                            }`}
                                    >
                                        {tier.cta}
                                    </button>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
