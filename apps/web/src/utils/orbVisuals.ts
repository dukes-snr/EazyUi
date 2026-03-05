import { useEffect, useMemo, useState } from 'react';
import type { AgentState } from '../components/ui/Orb';

export type OrbActivityState = 'idle' | 'thinking' | 'talking' | 'listening';

type OrbColorPair = [string, string];

const FALLBACK_COLORS: Record<OrbActivityState, OrbColorPair> = {
    idle: ['#64748B', '#94A3B8'],
    thinking: ['#6366F1', '#22D3EE'],
    talking: ['#22C55E', '#14B8A6'],
    listening: ['#F59E0B', '#F97316'],
};

function readThemeColor(variableName: string, fallback: string): string {
    if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
    const styles = window.getComputedStyle(document.documentElement);
    const value = styles.getPropertyValue(variableName).trim();
    return value || fallback;
}

function resolveOrbColors(state: OrbActivityState): OrbColorPair {
    const fallback = FALLBACK_COLORS[state];
    if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
    return [
        readThemeColor(`--ui-orb-${state}-1`, fallback[0]),
        readThemeColor(`--ui-orb-${state}-2`, fallback[1]),
    ];
}

function toAgentState(state: OrbActivityState): AgentState {
    return state === 'idle' ? null : state;
}

export function useOrbVisuals(state: OrbActivityState): { agentState: AgentState; colors: OrbColorPair } {
    const [colors, setColors] = useState<OrbColorPair>(() => resolveOrbColors(state));
    const agentState = useMemo(() => toAgentState(state), [state]);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const apply = () => setColors(resolveOrbColors(state));
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme'],
        });
        return () => observer.disconnect();
    }, [state]);

    return { agentState, colors };
}
