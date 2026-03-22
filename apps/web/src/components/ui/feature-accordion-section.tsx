'use client';

import { cn } from '@/lib/utils';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion';

export type FeatureAccordionItem = {
    id: string;
    title: string;
    eyebrow: string;
    stat: string;
    image: string;
    description: string;
    highlights: string[];
    prompt?: string;
};

type FeatureAccordionSectionProps = {
    title?: string;
    description?: string;
    features: FeatureAccordionItem[];
    className?: string;
};

export function FeatureAccordionSection({
    title = 'Core features built for real product work.',
    description = 'Explore the main EazyUI capabilities and see how each one helps teams move from rough ideas into sharper, more usable interface direction.',
    features,
    className,
}: FeatureAccordionSectionProps) {
    if (features.length === 0) return null;

    return (
        <section className={cn('w-full', className)}>
            <div className="mx-auto max-w-[800px]">
                <div className="text-center">
                    <h3 className="text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--ui-text)] md:text-[52px]">
                        {title}
                    </h3>
                    <p className="mx-auto mt-5 max-w-[42rem] text-[15px] leading-8 text-[var(--ui-text-muted)] md:text-[17px]">
                        {description}
                    </p>
                </div>

                <div className="mt-12 rounded-[18px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 md:px-4 md:py-3">
                    <Accordion type="single" collapsible defaultValue={features[0].id} className="w-full">
                        {features.map((feature) => (
                            <AccordionItem
                                key={feature.id}
                                value={feature.id}
                                className="last:border-b-0"
                            >
                                <AccordionTrigger className="rounded-[14px] px-2 py-3.5 hover:no-underline md:px-2.5">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <img
                                            src={feature.image}
                                            alt={feature.title}
                                            className="h-[18px] w-[18px] shrink-0 rounded-[5px] object-cover"
                                            loading="lazy"
                                        />
                                        <div className="min-w-0">
                                            <p className="truncate text-[15px] font-semibold leading-6 text-[var(--ui-text)] md:text-[16px]">
                                                {feature.title}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="hidden shrink-0 text-[11px] font-medium text-[var(--ui-text-subtle)] md:inline-flex">
                                        {/* ({feature.stat}) */}
                                    </span>
                                </AccordionTrigger>

                                <AccordionContent className="px-2 pb-4 pt-0 md:px-2.5">
                                    <img
                                        src={feature.image}
                                        alt={feature.title}
                                        className="mx-auto mt-1 aspect-[16/10] w-full max-w-[640px] rounded-[10px] object-cover"
                                        loading="lazy"
                                    />
                                    <p className="px-3 pt-4 text-center text-[14px] leading-7 text-[var(--ui-text-muted)] md:px-8 md:text-[15px]">
                                        {feature.description}
                                    </p>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </section>
    );
}
