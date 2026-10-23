"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import type { AvatarClip } from "@/lib/curriculum/schema";

export type ReviewSign = {
  id: string;
  translation: string;
  gloss: string;
  levelId: string;
  description: string | null;
  /** Animación grabada de un vídeo (si no, generada a partir de la descripción). */
  recorded: boolean;
  /** Entrada del diccionario del DILSE. */
  pageUrl: string | null;
  /** Ya se había dado por bueno al afinar el avatar. */
  approved: boolean;
  /** Vídeos del DILSE, en orden (las frases, uno por signo). */
  video: { id: string; url: string }[];
};

type Verdict = "ok" | "doubt" | "bad";
type Review = { verdict: Verdict; issues: string[]; note: string; at: string };
type Reviews = Record<string, Review>;
type Filter = "all" | "pending" | Verdict | "approved";
type Speed = 1 | 0.5;

const STORAGE_KEY = "panduro.revisar.v1";
const REVIEWER_KEY = "panduro.revisar.reviewer";

const VERDICTS: { id: Verdict; label: string; hint: string; key: string; on: string; off: string }[] = [
  {
    id: "ok",
    label: "Bien",
    hint: "Se entiende y está bien hecho",
    key: "1",
    on: "bg-petrol-600 text-white border-petrol-600",
    off: "border-petrol-300 text-petrol-700 hover:bg-petrol-50 dark:border-petrol-800 dark:text-petrol-300 dark:hover:bg-petrol-950",
  },
  {
    id: "doubt",
    label: "Con dudas",
    hint: "Se entiende, pero algo no está bien",
    key: "2",
    on: "bg-amber-500 text-white border-amber-500",
    off: "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950",
  },
  {
    id: "bad",
    label: "Mal",
    hint: "No se entiende o parece otro signo",
    key: "3",
    on: "bg-ko-600 text-white border-ko-600",
    off: "border-ko-300 text-ko-700 hover:bg-ko-50 dark:border-ko-800 dark:text-ko-300 dark:hover:bg-ko-950",
  },
];

/** Qué puede fallar, para poder ordenar los arreglos (los parámetros de un signo). */
const ISSUES = [
  "Forma de la mano",
  "Orientación de la palma",
  "Posición",
  "Movimiento",
  "Contacto",
  "Otra mano",
  "Expresión de la cara",
  "Velocidad o ritmo",
];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Sin revisar" },
  { id: "ok", label: "Bien" },
  { id: "doubt", label: "Dudas" },
  { id: "bad", label: "Mal" },
  { id: "approved", label: "Aprobados antes" },
];

const DOT: Record<Verdict, string> = { ok: "bg-petrol-500", doubt: "bg-amber-500", bad: "bg-ko-500" };

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento (modo privado): lo marcado se pierde al cerrar, pero se puede exportar.
  }
}

/** La animación a otra velocidad (como en el glosario). */
function atSpeed(clip: AvatarClip, speed: Speed): AvatarClip {
  if (speed === 1) return clip;
  return {
    ...clip,
    duration: clip.duration / speed,
    keyframes: clip.keyframes.map((kf) => ({ ...kf, t: kf.t / speed })),
  };
}

export function ReviewView({ signs }: { signs: ReviewSign[] }) {
  const [reviews, setReviews] = useState<Reviews>({});
  const [reviewer, setReviewer] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [currentId, setCurrentId] = useState(signs[0]?.id ?? "");
  const [speed, setSpeed] = useState<Speed>(1);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = loadJson<Reviews>(STORAGE_KEY, {});
    setReviews(saved);
    setReviewer(loadJson<string>(REVIEWER_KEY, ""));
    // El signo pedido (?sign=ID, desde el glosario) o, si no, el primero sin revisar.
    const asked = new URLSearchParams(window.location.search).get("sign");
    const first = signs.find((s) => s.id === asked) ?? signs.find((s) => !saved[s.id]);
    if (first) setCurrentId(first.id);
    setLoaded(true);
  }, [signs]);

  useEffect(() => {
    if (loaded) saveJson(STORAGE_KEY, reviews);
  }, [reviews, loaded]);

  useEffect(() => {
    if (loaded) saveJson(REVIEWER_KEY, reviewer);
  }, [reviewer, loaded]);

  const visible = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return signs.filter((s) => {
      const r = reviews[s.id];
      if (filter === "pending" && r) return false;
      if ((filter === "ok" || filter === "doubt" || filter === "bad") && r?.verdict !== filter) return false;
      if (filter === "approved" && !s.approved) return false;
      if (!q) return true;
      const text = `${s.id} ${s.translation}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return text.includes(q);
    });
  }, [signs, reviews, filter, query]);

  const current = signs.find((s) => s.id === currentId) ?? signs[0];
  const review = current ? reviews[current.id] : undefined;

  const counts = useMemo(() => {
    const c = { ok: 0, doubt: 0, bad: 0 };
    for (const s of signs) {
      const v = reviews[s.id]?.verdict;
      if (v) c[v]++;
    }
    return c;
  }, [signs, reviews]);
  const done = counts.ok + counts.doubt + counts.bad;

  const go = useCallback(
    (delta: number) => {
      const list = visible.length ? visible : signs;
      const i = list.findIndex((s) => s.id === currentId);
      const next = list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + delta))];
      if (next) setCurrentId(next.id);
    },
    [visible, signs, currentId],
  );

  const goPending = useCallback(() => {
    const i = signs.findIndex((s) => s.id === currentId);
    const after = [...signs.slice(i + 1), ...signs.slice(0, i + 1)];
    const next = after.find((s) => !reviews[s.id] && s.id !== currentId);
    if (next) setCurrentId(next.id);
    else setMessage("No quedan signos sin revisar.");
  }, [signs, currentId, reviews]);

  const update = useCallback(
    (patch: Partial<Review>) => {
      if (!current) return;
      setReviews((all) => {
        const prev = all[current.id];
        const verdict = patch.verdict ?? prev?.verdict;
        if (!verdict) return all;
        return {
          ...all,
          [current.id]: {
            verdict,
            issues: patch.issues ?? prev?.issues ?? [],
            note: patch.note ?? prev?.note ?? "",
            at: new Date().toISOString(),
          },
        };
      });
    },
    [current],
  );

  const mark = useCallback(
    (verdict: Verdict) => {
      update({ verdict, ...(verdict === "ok" ? { issues: [] } : {}) });
      if (verdict === "ok" && autoAdvance) {
        window.setTimeout(goPending, 250);
      } else if (verdict !== "ok") {
        window.setTimeout(() => noteRef.current?.focus(), 0);
      }
    },
    [update, autoAdvance, goPending],
  );

  const clear = () => {
    if (!current) return;
    setReviews((all) => {
      const rest = { ...all };
      delete rest[current.id];
      return rest;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        if (e.key === "Escape") el.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const verdict = VERDICTS.find((v) => v.key === e.key);
      if (verdict) mark(verdict.id);
      else if (e.key === "ArrowRight" || e.key === "j") go(1);
      else if (e.key === "ArrowLeft" || e.key === "k") go(-1);
      else if (e.key === "n") goPending();
      else if (e.key === "s") setSpeed((s) => (s === 1 ? 0.5 : 1));
      else if (e.key === "Enter") {
        e.preventDefault();
        noteRef.current?.focus();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mark, go, goPending]);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [message]);

  const exportFile = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      reviewer: reviewer.trim() || null,
      total: signs.length,
      reviews,
    };
    const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const who = reviewer.trim() ? `-${reviewer.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "";
    a.href = url;
    a.download = `revision-signos${who}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { reviews?: Reviews };
      if (!data.reviews || typeof data.reviews !== "object") throw new Error("sin reviews");
      // Lo más reciente de cada signo, entre lo de aquí y lo del archivo.
      const merged = { ...reviews };
      let added = 0;
      for (const [id, r] of Object.entries(data.reviews)) {
        if (!r?.verdict) continue;
        if (!merged[id] || merged[id]!.at < r.at) {
          merged[id] = { verdict: r.verdict, issues: r.issues ?? [], note: r.note ?? "", at: r.at };
          added++;
        }
      }
      setReviews(merged);
      setMessage(`Importado: ${added} signos actualizados.`);
    } catch {
      setMessage("No se ha podido leer el archivo.");
    }
  };

  if (!current) return <p className="text-sm text-slate-500">No hay signos con animación.</p>;

  return (
    <div className="space-y-4">
      {/* Progreso y archivo */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-[220px] flex-1 space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">
              {done} de {signs.length} revisados
            </span>
            <span className="tabular-nums text-slate-500">
              <span className="text-petrol-600">{counts.ok} bien</span> ·{" "}
              <span className="text-amber-600">{counts.doubt} dudas</span> ·{" "}
              <span className="text-ko-600">{counts.bad} mal</span>
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="bg-petrol-500" style={{ width: `${(100 * counts.ok) / signs.length}%` }} />
            <div className="bg-amber-500" style={{ width: `${(100 * counts.doubt) / signs.length}%` }} />
            <div className="bg-ko-500" style={{ width: `${(100 * counts.bad) / signs.length}%` }} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Revisa</span>
          <input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="Tu nombre"
            className="w-36 rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportFile}
            disabled={!done}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Exportar
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Importar
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {message && <p className="w-full text-sm text-brand-700 dark:text-brand-300">{message}</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Lista */}
        <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar signo…"
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700"
          />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  filter === f.id
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{visible.length} signos</p>
          {/* En pantallas pequeñas, un desplegable en vez de la lista. */}
          <select
            value={current.id}
            onChange={(e) => setCurrentId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700 lg:hidden"
          >
            {visible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.translation} ({s.id})
              </option>
            ))}
          </select>
          <ul className="hidden max-h-[560px] overflow-y-auto pr-1 lg:block">
            {visible.map((s) => {
              const r = reviews[s.id];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setCurrentId(s.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm ${
                      s.id === current.id
                        ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        r ? DOT[r.verdict] : "border border-slate-300 dark:border-slate-600"
                      }`}
                    />
                    <span className="truncate">{s.translation}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-400">{s.levelId}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Signo actual */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                  {current.levelId}
                </span>
                {current.approved && (
                  <span className="rounded bg-petrol-100 px-2 py-0.5 text-xs font-semibold text-petrol-700 dark:bg-petrol-900/40 dark:text-petrol-300">
                    Aprobado antes
                  </span>
                )}
                {!current.recorded && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Animación generada
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold">{current.translation}</h2>
              <p className="font-mono text-xs text-slate-500">{current.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Velocidad</span>
              {([1, 0.5] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    speed === s
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {s === 1 ? "Normal" : "Lenta ×½"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <figure className="space-y-1">
              <div className="overflow-hidden rounded-xl bg-slate-900">
                <DilseVideo key={current.id} sign={current} speed={speed} />
              </div>
              <figcaption className="text-xs text-slate-500">
                Vídeo: DILSE · Fundación CNSE (CC BY-NC-SA 3.0)
                {current.pageUrl && (
                  <>
                    {" · "}
                    <a href={current.pageUrl} target="_blank" rel="noreferrer" className="underline hover:text-brand-600">
                      entrada del diccionario
                    </a>
                  </>
                )}
              </figcaption>
            </figure>
            <figure className="space-y-1">
              <div className="flex justify-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <SignAvatar id={current.id} speed={speed} />
              </div>
              <figcaption className="text-xs text-slate-500">Avatar de Panduro</figcaption>
            </figure>
          </div>

          {current.description && (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              {current.description}
            </p>
          )}

          {/* Valoración */}
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {VERDICTS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => mark(v.id)}
                  className={`rounded-xl border-2 px-3 py-2 text-left transition ${review?.verdict === v.id ? v.on : v.off}`}
                >
                  <span className="flex items-center justify-between font-semibold">
                    {v.label}
                    <kbd className="rounded border border-current px-1.5 text-xs opacity-70">{v.key}</kbd>
                  </span>
                  <span className="block text-xs opacity-80">{v.hint}</span>
                </button>
              ))}
            </div>

            {review && review.verdict !== "ok" && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qué falla</p>
                <div className="flex flex-wrap gap-1.5">
                  {ISSUES.map((issue) => {
                    const on = review.issues.includes(issue);
                    return (
                      <button
                        key={issue}
                        type="button"
                        onClick={() =>
                          update({ issues: on ? review.issues.filter((i) => i !== issue) : [...review.issues, issue] })
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          on
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        {issue}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <textarea
              ref={noteRef}
              value={review?.note ?? ""}
              disabled={!review}
              onChange={(e) => update({ note: e.target.value })}
              rows={2}
              placeholder={
                review
                  ? "Nota (opcional): p. ej. «la mano debería tocar el hombro», «el índice va recto»"
                  : "Marca primero bien, dudas o mal para añadir una nota"
              }
              className="w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700"
            />
          </div>

          {/* Navegación */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <button type="button" onClick={() => go(-1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              ← Anterior
            </button>
            <button type="button" onClick={() => go(1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              Siguiente →
            </button>
            <button type="button" onClick={goPending} className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900">
              Siguiente sin revisar
            </button>
            {review && (
              <button type="button" onClick={clear} className="text-xs text-slate-500 hover:text-ko-600 hover:underline">
                Quitar valoración
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
              Pasar al siguiente al marcar «Bien»
            </label>
          </div>
          <p className="text-xs text-slate-400">
            Teclado: <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> valorar · <kbd>←</kbd> <kbd>→</kbd> anterior y siguiente ·{" "}
            <kbd>N</kbd> siguiente sin revisar · <kbd>S</kbd> velocidad · <kbd>Intro</kbd> escribir nota · <kbd>Esc</kbd>{" "}
            salir de la nota. <Link href={`/glossary/${current.id}`} className="underline hover:text-brand-600">Ver en el glosario</Link>
          </p>
        </section>
      </div>
    </div>
  );
}

/**
 * El vídeo del DILSE en bucle: el descargado en data/dilse/videos si lo hay (en desarrollo) y,
 * si no, el de la web del DILSE. Las frases, sus vídeos uno tras otro.
 */
function DilseVideo({ sign, speed }: { sign: ReviewSign; speed: Speed }) {
  const [part, setPart] = useState(0);
  const [remote, setRemote] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const clip = sign.video[part];

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed, part, remote]);

  if (!clip || failed) {
    return (
      <div className="flex aspect-[32/27] items-center justify-center p-4 text-center text-sm text-slate-300">
        {sign.video.length ? "No se ha podido cargar el vídeo." : "Este signo no tiene vídeo del DILSE."}
        {sign.pageUrl && (
          <a href={sign.pageUrl} target="_blank" rel="noreferrer" className="ml-1 underline">
            Abrir en el DILSE
          </a>
        )}
      </div>
    );
  }

  return (
    <video
      ref={ref}
      key={`${part}-${remote}`}
      src={remote ? clip.url : `/api/dev/dilse-video/${clip.id}`}
      autoPlay
      muted
      playsInline
      loop={sign.video.length === 1}
      onLoadedMetadata={(e) => {
        e.currentTarget.playbackRate = speed;
      }}
      onEnded={() => setPart((p) => (p + 1) % sign.video.length)}
      onError={() => (remote ? setFailed(true) : setRemote(true))}
      className="aspect-[32/27] w-full object-contain"
    />
  );
}

/** La animación del signo, pedida al servidor; mientras llega la nueva, se queda la anterior. */
function SignAvatar({ id, speed }: { id: string; speed: Speed }) {
  const cache = useRef(new Map<string, AvatarClip>());
  const [clip, setClip] = useState<AvatarClip | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(false);
    const hit = cache.current.get(id);
    if (hit) {
      setClip(hit);
      return;
    }
    fetch(`/api/clips/${id}`)
      .then((r) => (r.ok ? (r.json() as Promise<AvatarClip>) : Promise.reject(new Error(String(r.status)))))
      .then((c) => {
        cache.current.set(id, c);
        if (alive) setClip(c);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [id]);

  const shown = useMemo(() => (clip ? atSpeed(clip, speed) : null), [clip, speed]);
  if (error) return <p className="p-6 text-sm text-ko-600">No se ha podido cargar la animación.</p>;
  return <AvatarPlayer clip={shown} size={320} label={id} />;
}
