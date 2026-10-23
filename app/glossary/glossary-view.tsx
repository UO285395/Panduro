"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

type SignEntry = {
  id: string;
  gloss: string;
  translation: string;
  description: string | null;
  twoHands: boolean;
};

type LevelGroup = {
  levelId: string;
  levelTitle: string;
  signs: SignEntry[];
};

/** Para buscar sin tildes ni mayúsculas. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function GlossaryView({ signsByLevel }: { signsByLevel: LevelGroup[] }) {
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string | null>(null);

  const allLevelIds = signsByLevel.map((g) => g.levelId);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return signsByLevel
      .filter((g) => !levelFilter || g.levelId === levelFilter)
      .map((g) => ({
        ...g,
        signs: g.signs.filter(
          (s) => !q || fold(s.translation).includes(q) || fold(s.gloss).includes(q) || fold(s.id).includes(q),
        ),
      }))
      .filter((g) => g.signs.length > 0);
  }, [signsByLevel, query, levelFilter]);

  const totalShown = filtered.reduce((sum, g) => sum + g.signs.length, 0);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <header className="space-y-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 font-display font-bold text-brand-600 hover:underline dark:text-brand-400">
          <Icon name="arrow" size={16} className="rotate-180" /> Panel
        </Link>
        <h1 className="text-4xl font-extrabold">Glosario de signos</h1>
        <p className="text-slate-600 dark:text-slate-400">
          {totalShown} signo{totalShown !== 1 ? "s" : ""}. Toca uno para verlo signado.
        </p>
      </header>

      <div className="sticky top-0 z-20 -mx-4 space-y-3 bg-[color:var(--background)] px-4 py-3 sm:-mx-6 sm:px-6">
        <label className="relative block">
          <span className="sr-only">Buscar signo</span>
          <Icon name="search" size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar: casa, gracias, familia…"
            className="input pl-12"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Nivel">
          {[null, ...allLevelIds].map((id) => (
            <button
              key={id ?? "all"}
              type="button"
              onClick={() => setLevelFilter(id === levelFilter ? null : id)}
              aria-pressed={levelFilter === id}
              className={`chip border-2 transition ${
                levelFilter === id
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {id ?? "Todos"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-slate-500">Ningún signo coincide con «{query}».</p>
      )}

      {filtered.map((group) => (
        <section key={group.levelId} className="space-y-4" aria-labelledby={`lvl-${group.levelId}`}>
          <h2 id={`lvl-${group.levelId}`} className="flex items-center gap-3 text-2xl font-extrabold">
            <span className="rounded-xl bg-brand-500 px-2.5 py-0.5 text-lg text-white">{group.levelId}</span>
            {group.levelTitle.replace(/^LSE [A-C][12] · /, "")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.signs.map((sign) => (
              <li key={sign.id}>
                <Link
                  href={`/glossary/${sign.id}`}
                  className="card group flex h-full items-start gap-3 p-4 transition hover:border-brand-300 hover:shadow-press hover:shadow-brand-100 dark:hover:border-brand-700 dark:hover:shadow-brand-950"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl font-extrabold leading-tight">{sign.translation}</span>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">{sign.gloss}</span>
                    {sign.description && (
                      <span className="mt-1.5 line-clamp-2 block text-sm text-slate-600 dark:text-slate-400">
                        {sign.description}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500 transition group-hover:bg-brand-500 group-hover:text-white dark:bg-brand-950/50">
                      <Icon name="play" size={16} />
                    </span>
                    {sign.twoHands && (
                      <span className="text-[11px] font-semibold text-petrol-600 dark:text-petrol-300">2 manos</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
