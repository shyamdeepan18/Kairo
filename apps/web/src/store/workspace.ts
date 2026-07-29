import { create } from 'zustand';

export interface WorkspaceTab {
  path: string;
  label: string;
}

interface WorkspaceState {
  tabs: WorkspaceTab[];
  addTab: (tab: WorkspaceTab) => void;
  removeTab: (path: string) => void;
  closeAll: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  tabs: [],
  addTab: (tab) =>
    set((state) => {
      // If tab already exists, do nothing
      if (state.tabs.some((t) => t.path === tab.path)) {
        return state;
      }
      return { tabs: [...state.tabs, tab] };
    }),
  removeTab: (path) =>
    set((state) => ({
      tabs: state.tabs.filter((t) => t.path !== path),
    })),
  closeAll: () => set({ tabs: [] }),
}));
