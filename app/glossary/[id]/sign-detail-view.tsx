"use client";

import { useState } from "react";
import Link from "next/link";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import type { AvatarClip } from "@/lib/curriculum/schema";

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
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/dashboard" className="hover:text-brand-600">Panel</Link>
        <span>›</span>
        <Link href="/glossary" className="hover:text-brand-600">Glosario</Link>
        <span>›</span>
        <span className="text-slate-800 dark:text-slate-200 font-medium">{sign.translation}</span>
      </nav>

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* Avatar grande */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
            <AvatarPlayer clip={slowClip} size={280} label={sign.gloss} />
          </div>

          {/* Controles de velocidad */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Velocidad:</span>
            {([1, 0.5, 0.25] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  speed === s
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {s === 1 ? "Normal" : s === 0.5 ? "Lenta ×½" : "Muy lenta ×¼"}
              </button>
            ))}
          </div>
        </div>

        {/* Info del signo */}
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                {levelId}
              </span>
              <span className="text-xs text-slate-500">
                {sign.handedness === "two" ? "Bimanual" : "Una mano"}
              </span>
            </div>
            <h1 className="text-3xl font-bold">{sign.translation}</h1>
            <p className="text-slate-500 text-sm font-mono mt-0.5">{sign.gloss}</p>
          </div>

          {sign.description && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Cómo ejecutarlo
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-300">{sign.description}</p>
            </div>
          )}

          {sign.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sign.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {lessons.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Aparece en
              </h2>
              <ul className="space-y-1">
                {lessons.map((l) => (
                  <li key={l.lessonId}>
                    <Link
                      href={`/lesson/${l.lessonId}`}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:border-brand-400 hover:shadow-sm transition dark:border-slate-800 dark:bg-slate-900"
                    >
                      <span className="text-brand-500">▶</span>
                      <span>
                        <span className="font-medium">{l.lessonTitle}</span>
                        <span className="text-slate-500"> · {l.unitTitle}</span>
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
