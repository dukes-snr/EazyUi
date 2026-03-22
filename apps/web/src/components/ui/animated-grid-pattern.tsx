import { useEffect, useId, useRef, useState, type SVGProps } from 'react';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';

interface AnimatedGridPatternProps extends SVGProps<SVGSVGElement> {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    strokeDasharray?: number | string;
    numSquares?: number;
    className?: string;
    maxOpacity?: number;
    duration?: number;
    repeatDelay?: number;
    lineColor?: string;
    squareColor?: string;
}

type Square = {
    id: number;
    pos: [number, number];
};

export function AnimatedGridPattern({
    width = 40,
    height = 40,
    x = -1,
    y = -1,
    strokeDasharray = 0,
    numSquares = 50,
    className,
    maxOpacity = 0.5,
    duration = 4,
    repeatDelay = 0.5,
    lineColor = 'var(--landing-hero-grid-line)',
    squareColor = 'var(--landing-hero-grid-fill)',
    ...props
}: AnimatedGridPatternProps) {
    const id = useId();
    const containerRef = useRef<SVGSVGElement | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const getPos = () => ([
        Math.floor((Math.random() * dimensions.width) / width),
        Math.floor((Math.random() * dimensions.height) / height),
    ] as [number, number]);

    const generateSquares = (count: number): Square[] => Array.from({ length: count }, (_, index) => ({
        id: index,
        pos: getPos(),
    }));

    const [squares, setSquares] = useState<Square[]>(() => generateSquares(numSquares));

    const updateSquarePosition = (squareId: number) => {
        setSquares((currentSquares) => currentSquares.map((square) => (
            square.id === squareId
                ? {
                    ...square,
                    pos: getPos(),
                }
                : square
        )));
    };

    useEffect(() => {
        if (dimensions.width && dimensions.height) {
            setSquares(generateSquares(numSquares));
        }
    }, [dimensions.width, dimensions.height, numSquares]);

    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            }
        });

        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    return (
        <svg
            ref={containerRef}
            aria-hidden="true"
            className={cn(
                'pointer-events-none absolute inset-0 h-full w-full',
                className,
            )}
            {...props}
        >
            <defs>
                <pattern
                    id={id}
                    width={width}
                    height={height}
                    patternUnits="userSpaceOnUse"
                    x={x}
                    y={y}
                >
                    <path
                        d={`M.5 ${height}V.5H${width}`}
                        fill="none"
                        stroke={lineColor}
                        strokeDasharray={strokeDasharray}
                    />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${id})`} opacity={1} />
            <svg x={x} y={y} className="overflow-visible">
                {squares.map(({ pos: [squareX, squareY], id: squareId }, index) => (
                    <motion.rect
                        key={`${squareId}-${squareX}-${squareY}-${index}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: maxOpacity }}
                        transition={{
                            duration,
                            repeat: 1,
                            delay: index * 0.08,
                            repeatType: 'reverse',
                            repeatDelay,
                        }}
                        onAnimationComplete={() => updateSquarePosition(squareId)}
                        width={width - 1}
                        height={height - 1}
                        x={squareX * width + 1}
                        y={squareY * height + 1}
                        fill={squareColor}
                        strokeWidth="0"
                    />
                ))}
            </svg>
        </svg>
    );
}
