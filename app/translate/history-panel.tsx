"use client";

import type { TranslationRow } from "@/lib/translator/persistence";

export function HistoryPanel({ entries }: { entries: TranslationRow[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Aún no has guardado ninguna traducción. Pulsa «Guardar» para conservarla
        aquí.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li
          key={String(e.id)}
          className="card rounded-2xl p-3 text-sm"
        >
          <p className="font-display text-base font-bold">{e.text}</p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(e.createdAt).toLocaleString("es-ES")} · {e.cardIds.length}{" "}
            signo{e.cardIds.length === 1 ? "" : "s"}
          </p>
        </li>
      ))}
    </ul>
  );
}
