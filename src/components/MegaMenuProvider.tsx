"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CinematicNavMenu } from "./CinematicNavMenu";

// Shared open/close state for the full-screen cinematic nav (the phone menu opens
// it). No ⌘K binding here — the CommandLauncher already owns that gesture.
type MegaMenuCtx = { open: boolean; setOpen: (v: boolean) => void };
const Ctx = createContext<MegaMenuCtx | null>(null);

export function useMegaMenu(): MegaMenuCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMegaMenu must be used within <MegaMenuProvider>");
  return c;
}

export function MegaMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open, setOpen }}>
      {children}
      <CinematicNavMenu />
    </Ctx.Provider>
  );
}
