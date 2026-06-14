import { create } from 'zustand';

interface FinaliserState {
    workspaceDir: string | null;
    logs: string[];
    running: boolean;
    setWorkspaceDir: (dir: string | null) => void;
    addLog: (line: string) => void;
    clearLogs: () => void;
    setRunning: (v: boolean) => void;
}

export const useMetaFinaliserStore = create<FinaliserState>((set) => ({
    workspaceDir: null,
    logs: [],
    running: false,
    setWorkspaceDir: (dir) => set({ workspaceDir: dir }),
    addLog: (line) => set((s) => ({ logs: [...s.logs, line] })),
    clearLogs: () => set({ logs: [] }),
    setRunning: (v) => set({ running: v }),
}));
