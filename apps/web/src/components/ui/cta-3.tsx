import { ArrowRightIcon, PlusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from './button';

type CallToActionProps = {
    className?: string;
    onContactSales?: () => void;
    onGetStarted?: () => void;
};

export function CallToAction({ className, onContactSales, onGetStarted }: CallToActionProps) {
    return (
        <div
            className={cn(
                'relative mx-auto flex w-full max-w-5xl flex-col justify-between gap-y-6 border-y border-[var(--ui-border)]',
                'bg-[radial-gradient(35%_80%_at_25%_0%,color-mix(in_srgb,var(--ui-text)_8%,transparent),transparent)] px-4 py-8 md:px-8 md:py-10',
                className,
            )}
        >
            <PlusIcon
                className="absolute left-[-11.5px] top-[-12.5px] z-[1] h-6 w-6 text-[var(--ui-text-subtle)]"
                strokeWidth={1}
            />
            <PlusIcon
                className="absolute right-[-11.5px] top-[-12.5px] z-[1] h-6 w-6 text-[var(--ui-text-subtle)]"
                strokeWidth={1}
            />
            <PlusIcon
                className="absolute bottom-[-12.5px] left-[-11.5px] z-[1] h-6 w-6 text-[var(--ui-text-subtle)]"
                strokeWidth={1}
            />
            <PlusIcon
                className="absolute bottom-[-12.5px] right-[-11.5px] z-[1] h-6 w-6 text-[var(--ui-text-subtle)]"
                strokeWidth={1}
            />

            <div className="pointer-events-none absolute -inset-y-6 left-0 w-px border-l border-[var(--ui-border)]" />
            <div className="pointer-events-none absolute -inset-y-6 right-0 w-px border-r border-[var(--ui-border)]" />
            <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-full border-l border-dashed border-[var(--ui-border)]" />

            <div className="space-y-1">
                <h2 className="text-center text-2xl font-bold text-[var(--ui-text)] md:text-[2rem]">
                    Let your next product direction land faster.
                </h2>
                <p className="text-center text-[var(--ui-text-muted)]">
                    Start designing with EazyUI today. No design bottlenecks, no slow first drafts.
                </p>
            </div>

            <div className="flex items-center justify-center gap-2">
                <Button
                    variant="outline"
                    onClick={onContactSales}
                    className="border-[var(--ui-border)] bg-[var(--ui-surface-1)] text-white hover:border-[var(--ui-primary)] hover:bg-[var(--ui-surface-1)] hover:text-[var(--ui-primary)]"
                >
                    Contact Sales
                </Button>
                <Button
                    onClick={onGetStarted}
                    className="bg-[var(--ui-primary)] text-white hover:bg-[var(--ui-primary-hover)]"
                >
                    Get Started <ArrowRightIcon className="ml-1 h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
