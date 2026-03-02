import { create } from 'zustand';
import type { ProjectMemory } from '@/api/client';

type ProjectMemoryState = {
    memory: ProjectMemory | null;
    setMemory: (memory: ProjectMemory | null | undefined) => void;
    resetMemory: () => void;
};

export const useProjectMemoryStore = create<ProjectMemoryState>((set) => ({
    memory: null,
    setMemory: (memory) => set({ memory: memory || null }),
    resetMemory: () => set({ memory: null }),
}));

