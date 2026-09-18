"use client";

import { useEffect, useState } from "react";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { sampleClip } from "@/lib/avatar/interpolate";

/**
 * Fallback estilizado en SVG. Representa una mano como cinco círculos
 * (yemas de los dedos) sobre una palma. Interpola los keyframes del clip
 * en cliente y anima la posición y flexión de los dedos.
 *
 * Es intencionalmente esquemático: no pretende ser LSE correcta, solo
 * evidenciar que el avatar responde al signo. Cuando haya un VRM real
 * en `public/avatars/panduro.vrm`, `AvatarPlayer` lo usará en su lugar.
 */
export function AvatarFallback({
  clip,
  size = 240,
  label,
}: {
  clip: AvatarClip | null;
  size?: number;
  label?: string;
}) {
  const [tMs, setTMs] = useState(0);

  useEffect(() => {
    if (!clip) return;
    const started = performance.now();
    let raf = 0;
    const step = () => {
      const dt = performance.now() - started;
      setTMs(dt % clip.duration);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [clip]);

  if (!clip) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
        style={{ width: size, height: size }}
      >
        <span className="text-3xl font-bold">{label ?? "Signo"}</span>
        <span className="mt-1 text-xs uppercase tracking-wider opacity-70">
          Sin animación
        </span>
      </div>
    );
  }

  const pose = sampleClip(clip, tMs);
  // Mapea el rango normalizado (~ -1..1) a coordenadas SVG.
  const cx = size / 2 + pose.hand.x * (size * 0.25);
  const cy = size / 2 - pose.hand.y * (size * 0.25);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="rounded-xl bg-brand-100 dark:bg-brand-900/40"
      role="img"
      aria-label={label ? `Avatar signando ${label}` : "Avatar signando"}
    >
      <defs>
        <radialGradient id="palm" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ea580c" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ea580c" stopOpacity="0.3" />
        </radialGradient>
      </defs>

      {/* palma */}
      <circle cx={cx} cy={cy} r={size * 0.12} fill="url(#palm)" />

      {/* dedos */}
      {pose.fingers.map((flex, i) => {
        const angle = (-Math.PI / 3) + (i * Math.PI / 6);
        const len = size * 0.18 * (1 - 0.5 * flex);
        const fx = cx + Math.cos(angle) * len;
        const fy = cy - Math.sin(angle) * len;
        return (
          <g key={i}>
            <line
              x1={cx}
              y1={cy}
              x2={fx}
              y2={fy}
              stroke="#ea580c"
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.7}
            />
            <circle cx={fx} cy={fy} r={size * 0.028} fill="#ffb020" />
          </g>
        );
      })}

      {label && (
        <text
          x={size / 2}
          y={size - 12}
          textAnchor="middle"
          fontSize={size * 0.11}
          fontWeight="bold"
          fill="#c2410c"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      )}
    </svg>
  );
}
