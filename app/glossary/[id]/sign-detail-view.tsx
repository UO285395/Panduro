"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimationCredit } from "@/components/avatar/AnimationCredit";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import { Icon } from "@/components/ui/Icon";
import type { AvatarClip, Sign } from "@/lib/curriculum/schema";

type LessonRef = {
  lessonId: string;
  lessonTitle: string;
  unitTitle: string;
};

type Props = {
  sign: {
    id: string;
    gloss: string;
    translation: string;
    description: string | null;
    tags: string[];
    handedness: "one" | "two";
    avatarClip: AvatarClip | null;
    animationCredit: Sign["animationCredit"] | null;
  };
  levelId: string;
  lessons: LessonRef[];
};

export function SignDetailView({ sign, levelId, lessons }: Props) {
  const [speed, setSpeed] = useState<1 | 0.5 | 0.25>(1);

  const slowClip: AvatarClip | null = sign.avatarClip
    ? {
        ...sign.avatarClip,
        duration: sign.avatarClip.duration / speed,
        keyframes: sign.avatarClip.keyframes.map((kf) => ({
          ...kf,
          t: kf.t / speed,
        })),
      }
    : null;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6">
      <nav className="flex items-center gap-2 font-display font-bold text-slate-500" aria-label="Migas">
        <Link href="/dashboard" className="hover:text-brand-600">Panel</Link>
        <span aria-hidden>›</span>
        <Link href="/glossary" className="hover:text-brand-600">Glosario</Link>
        <span aria-hidden>›</span>
        <span className="text-slate-800 dark:text-slate-200">{sign.translation}</span>
      </nav>

      <div className="grid items-start gap-8 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-4">
          <div className="overflow-hidden rounded-[2rem] border-4 border-white bg-brand-100 shadow-[0_8px_0_0] shadow-brand-200 dark:border-slate-800 dark:bg-brand-900/40 dark:shadow-slate-950">
            <AvatarPlayer clip={slowClip} size={320} label={sign.gloss} />
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-800" role="group" aria-label="Velocidad">
            {([1, 0.5, 0.25] as const).map((s) => (
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
                {s === 1 ? "Normal" : s === 0.5 ? "Lenta" : "Muy lenta"}
              </button>
            ))}
          </div>
          <div className="max-w-[320px] text-center">
            <AnimationCredit credit={sign.animationCredit} />
          </div>
          <div className="flex gap-3 text-xs text-slate-500">
            <Link href={`/dev/revisar?sign=${sign.id}`} className="hover:text-brand-600 hover:underline">
              Revisar con el vídeo
            </Link>
            <Link href={`/dev/grabar?sign=${sign.id}`} className="hover:text-brand-600 hover:underline">
              ¿Está mal? Grabar este signo
            </Link>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip bg-brand-500 text-white">{levelId}</span>
              <span className="chip bg-petrol-50 text-petrol-700 dark:bg-petrol-950 dark:text-petrol-200">
                {sign.handedness === "two" ? "Con las dos manos" : "Con una mano"}
              </span>
            </div>
            <h1 className="text-5xl font-extrabold leading-none">{sign.translation}</h1>
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">{sign.gloss}</p>
          </div>

          {sign.description && (
            <div className="card space-y-1 p-5">
              <h2 className="eyebrow">Cómo se hace</h2>
              <p className="text-slate-700 dark:text-slate-200">{sign.description}</p>
            </div>
          )}

          {sign.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sign.tags.map((tag) => (
                <span key={tag} className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {lessons.length > 0 && (
            <div className="space-y-2">
              <h2 className="eyebrow">Aparece en</h2>
              <ul className="space-y-2">
                {lessons.map((l) => (
                  <li key={l.lessonId}>
                    <Link
                      href={`/lesson/${l.lessonId}`}
                      className="card flex items-center gap-3 px-4 py-3 transition hover:border-brand-300"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
                        <Icon name="play" size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-display font-bold leading-tight">{l.lessonTitle}</span>
                        <span className="block text-sm text-slate-500">{l.unitTitle}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
