import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  copilotOpen: boolean;
  toggleSidebar: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCopilot: () => void;
  setCopilotOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  copilotOpen: true,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCopilot: () => set((state) => ({ copilotOpen: !state.copilotOpen })),
  setCopilotOpen: (open) => set({ copilotOpen: open }),
}));
