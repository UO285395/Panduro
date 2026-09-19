"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import type { AvatarClip } from "@/lib/curriculum/schema";

type SignEntry = {
  id: string;
  gloss: string;
  translation: string;
  description: string | null;
  avatarClip: AvatarClip | null;
};

type LevelGroup = {
  levelId: string;
  levelTitle: string;
  signs: SignEntry[];
};

export function GlossaryView({ signsByLevel }: { signsByLevel: LevelGroup[] }) {
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string | null>(null);

  const allLevelIds = signsByLevel.map((g) => g.levelId);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return signsByLevel
      .filter((g) => !levelFilter || g.levelId === levelFilter)
      .map((g) => ({
        ...g,
        signs: g.signs.filter(
          (s) =>
            !q ||
            s.translation.toLowerCase().includes(q) ||
            s.gloss.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.signs.length > 0);
  }, [signsByLevel, query, levelFilter]);

  const totalShown = filtered.reduce((sum, g) => sum + g.signs.length, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <header className="space-y-1">
        <Link
          href="/dashboard"
          className="text-xs text-brand-600 hover:underline"
        >
          ← Panel
        </Link>
        <h1 className="text-2xl font-bold">Glosario de signos</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {totalShown} signo{totalShown !== 1 ? "s" : ""} · busca o filtra por nivel.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar signo…"
          className="flex-1 min-w-[180px] rounded-full border border-slate-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-900"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setLevelFilter(null)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              !levelFilter
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Todos
          </button>
          {allLevelIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setLevelFilter(id === levelFilter ? null : id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                levelFilter === id
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500">Sin resultados para "{query}".</p>
      )}

      {filtered.map((group) => (
        <section key={group.levelId} className="space-y-4">
          {!levelFilter && (
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
              <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                {group.levelId}
              </span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {group.levelTitle}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {group.signs.map((sign) => (
              <SignCard key={sign.id} sign={sign} levelId={group.levelId} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function SignCard({
  sign,
  levelId,
}: {
  sign: SignEntry;
  levelId: string;
}) {
  return (
    <Link
      href={`/glossary/${sign.id}`}
      className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 hover:border-brand-400 hover:shadow-md transition dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="w-full overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-800">
        <AvatarPlayer clip={sign.avatarClip} size={140} />
      </div>
      <div className="w-full text-center">
        <p className="font-semibold text-sm">{sign.translation}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{sign.gloss}</p>
        {sign.description && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 line-clamp-2">
            {sign.description}
          </p>
        )}
      </div>
      <span className="self-end rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
        {levelId}
      </span>
    </Link>
  );
}
