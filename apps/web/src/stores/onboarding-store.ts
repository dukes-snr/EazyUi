import { create } from 'zustand';

type OnboardingState = {
    activeGuideId: string | null;
    stepIndex: number;
    seenGuideIds: string[];
    startGuide: (guideId: string, startIndex?: number) => void;
    nextStep: (maxSteps: number) => void;
    prevStep: () => void;
    finishGuide: () => void;
    skipGuide: () => void;
    hasSeenGuide: (guideId: string) => boolean;
};

const SEEN_GUIDES_STORAGE_KEY = 'eazyui:onboarding:seen-guides';

function getInitialSeenGuides(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(SEEN_GUIDES_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

function persistSeenGuides(seenGuideIds: string[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SEEN_GUIDES_STORAGE_KEY, JSON.stringify(seenGuideIds));
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
    activeGuideId: null,
    stepIndex: 0,
    seenGuideIds: getInitialSeenGuides(),
    startGuide: (guideId, startIndex = 0) => set({
        activeGuideId: guideId,
        stepIndex: Math.max(0, startIndex),
    }),
    nextStep: (maxSteps) => set((state) => ({
        stepIndex: Math.min(state.stepIndex + 1, Math.max(0, maxSteps - 1)),
    })),
    prevStep: () => set((state) => ({
        stepIndex: Math.max(0, state.stepIndex - 1),
    })),
    finishGuide: () => {
        const { activeGuideId, seenGuideIds } = get();
        if (!activeGuideId) {
            set({ activeGuideId: null, stepIndex: 0 });
            return;
        }
        const nextSeenGuideIds = seenGuideIds.includes(activeGuideId)
            ? seenGuideIds
            : [...seenGuideIds, activeGuideId];
        persistSeenGuides(nextSeenGuideIds);
        set({
            activeGuideId: null,
            stepIndex: 0,
            seenGuideIds: nextSeenGuideIds,
        });
    },
    skipGuide: () => {
        get().finishGuide();
    },
    hasSeenGuide: (guideId) => get().seenGuideIds.includes(guideId),
}));
