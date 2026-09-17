"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { AvatarFallback } from "./AvatarFallback";

const ThreeAvatarPlayer = dynamic(
  () => import("./ThreeAvatarPlayer").then((m) => m.ThreeAvatarPlayer),
  { ssr: false, loading: () => null },
);

type Props = {
  clip: AvatarClip | null;
  label?: string;
  size?: number;
};

/**
 * Player del avatar con cadena de fallback:
 *   1. Three.js procedimental (o VRM cuando esté implementado)
 *   2. SVG animado si Three.js falla (WebGL desactivado, iOS antiguo…)
 */
export function AvatarPlayer({ clip, label, size = 240 }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed || !clip) {
    return <AvatarFallback clip={clip} label={label} size={size} />;
  }
  return (
    <ThreeAvatarPlayer
      clip={clip}
      size={size}
      onFailed={() => setFailed(true)}
    />
  );
}
