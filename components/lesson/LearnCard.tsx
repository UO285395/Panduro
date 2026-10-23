"use client";

import { useMemo, useState } from "react";
import { AnimationCredit } from "@/components/avatar/AnimationCredit";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import type { AvatarClip, Sign } from "@/lib/curriculum/schema";

const SPEEDS = [1, 0.5] as const;

function slowed(clip: AvatarClip, speed: number): AvatarClip {
  if (speed === 1) return clip;
  return {
    ...clip,
    duration: Math.round(clip.duration / speed),
    keyframes: clip.keyframes.map((k) => ({ ...k, t: k.t / speed })),
  };
}

/**
 * Presentación de un signo nuevo antes de practicarlo: el avatar, la palabra y cómo se
 * hace. No puntúa ni gasta corazones.
 */
export function LearnCard({ sign, onContinue }: { sign: Sign; onContinue: () => void }) {
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const clip = useMemo(() => (sign.avatarClip ? slowed(sign.avatarClip, speed) : null), [sign.avatarClip, speed]);

  return (
    <section className="space-y-6">
      <p className="eyebrow">Signo nuevo</p>
      <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="mx-auto overflow-hidden rounded-3xl bg-brand-100 dark:bg-brand-900/40">
          <AvatarPlayer clip={clip} label={sign.gloss} size={280} />
        </div>
        <div className="space-y-3">
          <h2 className="text-4xl font-extrabold leading-none">{sign.translation}</h2>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Glosa: {sign.gloss}</p>
          {sign.description && <p className="text-slate-700 dark:text-slate-200">{sign.description}</p>}
          {sign.handedness === "two" && (
            <p className="chip bg-petrol-50 text-petrol-700 dark:bg-petrol-950 dark:text-petrol-200">
              Con las dos manos
            </p>
          )}
          <AnimationCredit credit={sign.animationCredit} />
          <div className="flex items-center gap-2 text-sm" role="group" aria-label="Velocidad">
            <span className="text-slate-500">Velocidad</span>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={`rounded-lg px-3 py-1 font-display font-bold transition ${
                    speed === s
                      ? "bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-400"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {s === 1 ? "Normal" : "Lenta"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Imítalo un par de veces antes de seguir.</p>
        </div>
      </div>
      <button type="button" onClick={onContinue} className="btn-primary w-full">
        Entendido
      </button>
    </section>
  );
}
