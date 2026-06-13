'use client';

import { type ReactNode, type RefObject } from 'react';

import { cn } from '@/lib/utils';
import { TracingBeam } from '@/components/ui/tracing-beam';

export interface TimelineEntry {
    title: string;
    content: ReactNode;
}

type TimelineProps = {
    data: TimelineEntry[];
    title?: string;
    description?: string;
    className?: string;
    scrollContainerRef?: RefObject<HTMLElement | null>;
};

export function Timeline({
    data,
    title = 'Changelog from the product journey',
    description = 'Track the latest EazyUI updates across generation quality, workflow controls, and product systems that make the app more useful over time.',
    className,
    scrollContainerRef,
}: TimelineProps) {
    return (
        <div className={cn('w-full bg-[var(--ui-surface-1)] text-[var(--ui-text)] md:px-10', className)}>
            <div className="mx-auto max-w-6xl px-4 pb-10 pt-20 md:px-8 lg:px-10">
                <h1 className="max-w-4xl text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--ui-text)] md:text-[60px]">
                    {title}
                </h1>
                <p className="mt-5 max-w-2xl text-[15px] leading-8 text-[var(--ui-text-muted)] md:text-[17px]">
                    {description}
                </p>
            </div>

            <TracingBeam className="max-w-6xl px-4 pb-20 md:px-8 lg:px-10" scrollContainerRef={scrollContainerRef}>
                {data.map((item, index) => (
                    <div
                        key={`${item.title}-${index}`}
                        className="flex justify-start pt-10 md:gap-10 md:pt-28"
                    >
                        <div className="sticky top-32 z-20 flex max-w-xs self-start md:w-full md:max-w-sm md:flex-row md:items-center">
                            <h2 className="hidden pl-20 text-xl font-bold text-[var(--ui-text-subtle)] md:block md:text-5xl">
                                {item.title}
                            </h2>
                        </div>

                        <div className="relative w-full pl-20 pr-0 md:pl-4 md:pr-4">
                            <h2 className="mb-4 block text-2xl font-bold text-[var(--ui-text-subtle)] md:hidden">
                                {item.title}
                            </h2>
                            {item.content}
                        </div>
                    </div>
                ))}
            </TracingBeam>
        </div>
    );
}
