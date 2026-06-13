'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';

import { cn } from '@/lib/utils';

type TracingBeamProps = {
    children: ReactNode;
    className?: string;
    scrollContainerRef?: RefObject<HTMLElement | null>;
};

export function TracingBeam({ children, className, scrollContainerRef }: TracingBeamProps) {
    const ref = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [svgHeight, setSvgHeight] = useState(0);
    const { scrollYProgress } = useScroll({
        container: scrollContainerRef,
        target: ref,
        offset: ['start 18%', 'end 58%'],
    });

    useEffect(() => {
        if (!contentRef.current) return;

        const updateHeight = () => setSvgHeight(contentRef.current?.offsetHeight ?? 0);
        updateHeight();

        const resizeObserver = new ResizeObserver(updateHeight);
        resizeObserver.observe(contentRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const y1 = useSpring(useTransform(scrollYProgress, [0, 0.8], [50, svgHeight]), {
        stiffness: 500,
        damping: 90,
    });
    const y2 = useSpring(useTransform(scrollYProgress, [0, 1], [50, Math.max(svgHeight - 200, 50)]), {
        stiffness: 500,
        damping: 90,
    });

    return (
        <motion.div ref={ref} className={cn('relative mx-auto h-full w-full max-w-4xl', className)}>
            <div className="absolute left-4 top-3 z-10 md:-left-8">
                <motion.div
                    style={{ boxShadow: useTransform(scrollYProgress, [0, 0.02], ['0 3px 8px rgba(0, 0, 0, 0.24)', '0 0 0 rgba(0, 0, 0, 0)']) }}
                    className="ml-[27px] flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-1)] shadow-sm"
                >
                    <motion.div
                        style={{ backgroundColor: useTransform(scrollYProgress, [0, 0.02], ['var(--ui-primary)', '#ffffff']) }}
                        className="h-2 w-2 rounded-full border border-[var(--ui-border)]"
                    />
                </motion.div>
                <svg viewBox={`0 0 20 ${svgHeight}`} width="20" height={svgHeight} className="ml-4 block" aria-hidden="true">
                    <motion.path
                        d={`M 1 0V -36 l 18 24 V ${svgHeight * 0.8} l -18 24V ${svgHeight}`}
                        fill="none"
                        stroke="var(--ui-border)"
                        strokeOpacity="0.42"
                    />
                    <motion.path
                        d={`M 1 0V -36 l 18 24 V ${svgHeight * 0.8} l -18 24V ${svgHeight}`}
                        fill="none"
                        stroke="url(#eazyui-tracing-gradient)"
                        strokeWidth="1.5"
                        className="motion-reduce:hidden"
                    />
                    <defs>
                        <motion.linearGradient
                            id="eazyui-tracing-gradient"
                            gradientUnits="userSpaceOnUse"
                            x1="0"
                            x2="0"
                            y1={y1}
                            y2={y2}
                        >
                            <stop stopColor="#01a6cb" stopOpacity="0" />
                            <stop stopColor="#01a6cb" />
                            <stop offset="0.42" stopColor="#5ae14c" />
                            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                        </motion.linearGradient>
                    </defs>
                </svg>
            </div>
            <div ref={contentRef}>{children}</div>
        </motion.div>
    );
}
