import { create } from "zustand";

export interface GeneratedCasePreview {
  id: string;
  name: string;
  source: "deterministic" | "ai" | "business-logic";
  selected: boolean;
}

interface ScanState {
  cases: GeneratedCasePreview[];
  running: boolean;
  setCases: (cases: GeneratedCasePreview[]) => void;
  toggleCase: (id: string) => void;
  setRunning: (running: boolean) => void;
}

export const useScanStore = create<ScanState>((set) => ({
  cases: [],
  running: false,
  setCases: (cases) => set({ cases }),
  toggleCase: (id) =>
    set((state) => ({
      cases: state.cases.map((c) =>
        c.id === id ? { ...c, selected: !c.selected } : c,
      ),
    })),
  setRunning: (running) => set({ running }),
}));
