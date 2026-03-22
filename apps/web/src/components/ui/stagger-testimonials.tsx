'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

const SQRT_5000 = Math.sqrt(5000);

export type StaggerTestimonial = {
    tempId: number;
    testimonial: string;
    by: string;
    imgSrc: string;
};

interface TestimonialCardProps {
    position: number;
    testimonial: StaggerTestimonial;
    handleMove: (steps: number) => void;
    cardSize: number;
}

function TestimonialCard({
    position,
    testimonial,
    handleMove,
    cardSize,
}: TestimonialCardProps) {
    const isCenter = position === 0;

    return (
        <button
            type="button"
            onClick={() => handleMove(position)}
            className={cn(
                'absolute left-1/2 top-1/2 cursor-pointer overflow-hidden border-2 p-7 text-left transition-all duration-500 ease-in-out sm:p-8',
                isCenter
                    ? 'z-20 border-[var(--ui-primary)] bg-[var(--ui-primary)] text-white'
                    : 'z-0 border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[var(--ui-text)] hover:border-[color:color-mix(in_srgb,var(--ui-primary)_50%,var(--ui-border))]',
            )}
            style={{
                width: cardSize,
                height: cardSize,
                clipPath: 'polygon(50px 0%, calc(100% - 50px) 0%, 100% 50px, 100% 100%, calc(100% - 50px) 100%, 50px 100%, 0 100%, 0 0)',
                transform: `
                  translate(-50%, -50%)
                  translateX(${(cardSize / 1.5) * position}px)
                  translateY(${isCenter ? -65 : position % 2 ? 15 : -15}px)
                  rotate(${isCenter ? 0 : position % 2 ? 2.5 : -2.5}deg)
                `,
                boxShadow: isCenter
                    ? '0px 10px 0px 4px color-mix(in srgb, var(--ui-border) 90%, transparent)'
                    : '0px 0px 0px 0px transparent',
            }}
            aria-label={`View testimonial from ${testimonial.by}`}
        >
            <span
                className="absolute block origin-top-right rotate-45 bg-[var(--ui-border)]"
                style={{
                    right: -2,
                    top: 48,
                    width: SQRT_5000,
                    height: 2,
                }}
            />
            <img
                src={testimonial.imgSrc}
                alt={testimonial.by.split(',')[0]}
                className="mb-5 h-14 w-12 bg-[var(--ui-surface-2)] object-cover object-top"
                style={{
                    boxShadow: '3px 3px 0px var(--ui-surface-1)',
                }}
            />
            <h3 className={cn(
                'text-base font-medium leading-7 sm:text-[1.35rem] sm:leading-8',
                isCenter ? 'text-white' : 'text-[var(--ui-text)]',
            )}
            >
                "{testimonial.testimonial}"
            </h3>
            <p className={cn(
                'absolute bottom-7 left-7 right-7 mt-2 text-sm italic sm:bottom-8 sm:left-8 sm:right-8',
                isCenter ? 'text-white/82' : 'text-[var(--ui-text-muted)]',
            )}
            >
                - {testimonial.by}
            </p>
        </button>
    );
}

type StaggerTestimonialsProps = {
    testimonials: StaggerTestimonial[];
    className?: string;
};

export function StaggerTestimonials({ testimonials, className }: StaggerTestimonialsProps) {
    const [cardSize, setCardSize] = useState(365);
    const [testimonialsList, setTestimonialsList] = useState(testimonials);

    const handleMove = (steps: number) => {
        if (steps === 0) return;

        const newList = [...testimonialsList];
        if (steps > 0) {
            for (let i = steps; i > 0; i--) {
                const item = newList.shift();
                if (!item) return;
                newList.push({ ...item, tempId: Math.random() });
            }
        } else {
            for (let i = steps; i < 0; i++) {
                const item = newList.pop();
                if (!item) return;
                newList.unshift({ ...item, tempId: Math.random() });
            }
        }
        setTestimonialsList(newList);
    };

    useEffect(() => {
        setTestimonialsList(testimonials);
    }, [testimonials]);

    useEffect(() => {
        const updateSize = () => {
            if (window.matchMedia('(min-width: 1280px)').matches) {
                setCardSize(430);
                return;
            }

            if (window.matchMedia('(min-width: 640px)').matches) {
                setCardSize(365);
                return;
            }

            setCardSize(290);
        };

        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    return (
        <div
            className={cn('relative w-full overflow-hidden rounded-[32px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)]', className)}
            style={{ height: cardSize + 250 }}
        >
            {testimonialsList.map((testimonial, index) => {
                const position = testimonialsList.length % 2
                    ? index - (testimonialsList.length + 1) / 2
                    : index - testimonialsList.length / 2;

                return (
                    <TestimonialCard
                        key={testimonial.tempId}
                        testimonial={testimonial}
                        handleMove={handleMove}
                        position={position}
                        cardSize={cardSize}
                    />
                );
            })}

            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                <button
                    type="button"
                    onClick={() => handleMove(-1)}
                    className={cn(
                        'flex h-14 w-14 items-center justify-center border-2 text-2xl transition-colors',
                        'border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[var(--ui-text)] hover:border-[var(--ui-primary)] hover:bg-[var(--ui-primary)] hover:text-white',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-surface-2)]',
                    )}
                    aria-label="Previous testimonial"
                >
                    <ChevronLeft />
                </button>
                <button
                    type="button"
                    onClick={() => handleMove(1)}
                    className={cn(
                        'flex h-14 w-14 items-center justify-center border-2 text-2xl transition-colors',
                        'border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-[var(--ui-text)] hover:border-[var(--ui-primary)] hover:bg-[var(--ui-primary)] hover:text-white',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-surface-2)]',
                    )}
                    aria-label="Next testimonial"
                >
                    <ChevronRight />
                </button>
            </div>
        </div>
    );
}
