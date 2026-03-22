'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface TimelineEntry {
    title: string;
    content: ReactNode;
}

type TimelineProps = {
    data: TimelineEntry[];
    title?: string;
    description?: string;
    className?: string;
};

export function Timeline({
    data,
    title = 'Changelog from the product journey',
    description = 'Track the latest EazyUI updates across generation quality, workflow controls, and product systems that make the app more useful over time.',
    className,
}: TimelineProps) {
    const ref = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (!ref.current) return;

        const updateHeight = () => {
            setHeight(ref.current?.getBoundingClientRect().height ?? 0);
        };

        updateHeight();

        const resizeObserver = new ResizeObserver(() => updateHeight());
        resizeObserver.observe(ref.current);

        return () => resizeObserver.disconnect();
    }, []);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ['start 10%', 'end 50%'],
    });

    const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
    const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

    return (
        <div
            className={cn('w-full bg-[var(--ui-surface-1)] text-[var(--ui-text)] md:px-10', className)}
            ref={containerRef}
        >
            <div className="mx-auto max-w-6xl px-4 pb-10 pt-20 md:px-8 lg:px-10">
                <h1 className="max-w-4xl text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--ui-text)] md:text-[60px]">
                    {title}
                </h1>
                <p className="mt-5 max-w-2xl text-[15px] leading-8 text-[var(--ui-text-muted)] md:text-[17px]">
                    {description}
                </p>
            </div>

            <div ref={ref} className="relative mx-auto max-w-6xl px-4 pb-20 md:px-8 lg:px-10">
                {data.map((item, index) => (
                    <div
                        key={`${item.title}-${index}`}
                        className="flex justify-start pt-10 md:gap-10 md:pt-28"
                    >
                        <div className="sticky top-32 z-20 flex max-w-xs self-start md:w-full md:max-w-sm md:flex-row md:items-center">
                            <div className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ui-surface-1)] md:left-3">
                                <div className="h-4 w-4 rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] shadow-[0_0_0_4px_var(--ui-surface-1)]" />
                            </div>
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
                <div
                    style={{ height: `${height}px` }}
                    className="absolute left-8 top-0 w-[2px] overflow-hidden bg-[linear-gradient(to_bottom,transparent_0%,color-mix(in_srgb,var(--ui-border)_88%,transparent)_12%,color-mix(in_srgb,var(--ui-border)_88%,transparent)_88%,transparent_100%)] [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)] md:left-[3.25rem]"
                >
                    <motion.div
                        style={{
                            height: heightTransform,
                            opacity: opacityTransform,
                        }}
                        className="absolute inset-x-0 top-0 w-[2px] rounded-full bg-gradient-to-t from-[var(--ui-primary)] via-[color:color-mix(in_srgb,var(--ui-primary)_55%,transparent)] to-transparent"
                    />
                </div>
            </div>
        </div>
    );
}
