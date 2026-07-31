"use client";

import { useEffect, useState, type ComponentType } from "react";
import { ListeningSeaMobileVisual } from "./listening-sea-mobile-visual";
import type { ListeningMode, SeaEvent, SeaSource } from "./listening-sea-model";

export type ListeningSeaVisualProps = {
  active: boolean;
  paused: boolean;
  mode: ListeningMode;
  event?: SeaEvent;
  focusSource: SeaSource | "ALL";
  infrastructureRisk: number;
  audioLevel: number;
};

export function ListeningSeaVisual(props: ListeningSeaVisualProps) {
  const [mobile, setMobile] = useState(true);
  const [DesktopVisual, setDesktopVisual] = useState<ComponentType<ListeningSeaVisualProps> | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px), (pointer: coarse)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (mobile || DesktopVisual) return;
    let current = true;
    import("./listening-sea-visual").then((module) => {
      if (current) setDesktopVisual(() => module.ListeningSeaVisual);
    });
    return () => { current = false; };
  }, [mobile, DesktopVisual]);

  if (mobile) return <ListeningSeaMobileVisual {...props} />;
  if (DesktopVisual) return <DesktopVisual {...props} />;
  return <canvas className="listening-sea-canvas" aria-hidden="true" />;
}
