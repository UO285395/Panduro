"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import { MIN_PROTOTYPES_PER_SIGN } from "@/lib/esku/domain/recognition/entities/CustomSign";
import { useSignClip } from "@/lib/avatar/useSignClip";
import type { Recognizer } from "@/lib/recognition/engine";
import {
  measureReliability,
  normalizeWord,
  scoreSequence,
  type SequenceScore,
  type SignReliability,
} from "@/lib/recognition/reliability";

const AvatarPlayer = dynamic(
  () => import("@/components/avatar/AvatarPlayer").then((m) => m.AvatarPlayer),
  { ssr: false, loading: () => null },
);

export type SignOption = { id: string; translation: string };

type Props = {
  recognizer: () => Recognizer | null;
  running: boolean;
  signOptions: SignOption[];
  /** Palabras escritas ahora mismo en la transcripción. */
  words: string[];
  clearTranscript: () => void;
};

const SEQUENCE_LENGTH = 3;
const TAKES_SUGGESTED = 5;

const ERRORS: Record<string, string> = {
  EmptySignTextError: "Escribe la palabra que debe aparecer.",
  NotEnoughExamplesError: `Hacen falta al menos ${MIN_PROTOTYPES_PER_SIGN} tomas con la mano visible.`,
  DuplicateSignTextError: "Ya has enseñado un signo con esa palabra. Bórralo antes para regrabarlo.",
};

export function TeachPanel({ recognizer, running, signOptions, words, clearTranscript }: Props) {
  const [text, setText] = useState("");
  const [takes, setTakes] = useState<(readonly LandmarkFrame[])[]>([]);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [signs, setSigns] = useState<SignReliability[]>([]);
  const [sequence, setSequence] = useState<string[] | null>(null);
  const [totals, setTotals] = useState<SequenceScore | null>(null);
  const [lastScore, setLastScore] = useState<SequenceScore | null>(null);

  const byTranslation = useMemo(
    () => new Map(signOptions.map((o) => [normalizeWord(o.translation), o.id])),
    [signOptions],
  );
  const guideId = byTranslation.get(normalizeWord(text));
  const guideClip = useSignClip(guideId);

  const refresh = useCallback(async () => {
    const rec = recognizer();
    if (!rec) return;
    try {
      setSigns(measureReliability(await rec.repository.findAll()));
    } catch {
      setStatus("Este navegador no deja guardar datos (¿ventana privada?): los signos no se conservarán.");
    }
  }, [recognizer]);

  useEffect(() => {
    if (running) void refresh();
  }, [running, refresh]);

  async function recordTake() {
    const rec = recognizer();
    if (!rec || !running || recording) return;
    setRecording(true);
    setStatus("Haz el signo ahora. Al frenar se guarda la toma.");
    try {
      const window = await rec.recognize.captureWindow();
      setTakes((t) => [...t, window]);
      setStatus("Toma guardada. Repite el signo con pequeñas variaciones (más rápido, más lento…).");
    } finally {
      setRecording(false);
    }
  }

  function discard() {
    recognizer()?.recognize.cancelCapture();
    setRecording(false);
    setTakes([]);
    setStatus("Tomas descartadas.");
  }

  async function save() {
    const rec = recognizer();
    if (!rec) return;
    try {
      await rec.teach.execute(text, takes);
      await rec.refreshTaught();
      setTakes([]);
      setText("");
      setStatus("Signo guardado: ya lo reconoce, también dentro de una secuencia.");
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? (ERRORS[e.name] ?? e.message) : "No se pudo guardar.");
    }
  }

  async function remove(id: string) {
    const rec = recognizer();
    if (!rec) return;
    await rec.repository.delete(id);
    await rec.refreshTaught();
    await refresh();
  }

  function newSequence() {
    const pool = signs.map((s) => s.text);
    const picked: string[] = [];
    while (picked.length < SEQUENCE_LENGTH) {
      const next = pool[Math.floor(Math.random() * pool.length)]!;
      if (pool.length > 1 && next === picked.at(-1)) continue;
      picked.push(next);
    }
    clearTranscript();
    setLastScore(null);
    setSequence(picked);
  }

  function check() {
    if (!sequence) return;
    const score = scoreSequence(sequence, words);
    setLastScore(score);
    setTotals((t) =>
      t
        ? {
            hits: t.hits + score.hits,
            substitutions: t.substitutions + score.substitutions,
            deletions: t.deletions + score.deletions,
            insertions: t.insertions + score.insertions,
            target: t.target + score.target,
          }
        : score,
    );
    setSequence(null);
  }

  const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

  return (
    <details className="card p-4 text-sm">
      <summary className="cursor-pointer font-display text-base font-bold">
        Enseñar tus signos {signs.length > 0 && `(${signs.length})`}
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-slate-600 dark:text-slate-300">
          El modelo general solo conoce signos sanitarios. Enseña los que uses (HOLA, GRACIAS…)
          grabando cada uno {MIN_PROTOTYPES_PER_SIGN}–{TAKES_SUGGESTED} veces: se guardan solo en
          este navegador y se reconocen también en medio de una frase. Funciona mejor con tus
          propias manos que con las de otra persona.
        </p>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="eyebrow">
                Palabra que se escribirá
              </span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                list="teach-options"
                maxLength={40}
                placeholder="Hola"
                className="input py-2 text-base"
              />
              <datalist id="teach-options">
                {signOptions.map((o) => (
                  <option key={o.id} value={o.translation} />
                ))}
              </datalist>
            </label>
            <div className="flex items-center gap-1" aria-label={`${takes.length} tomas grabadas`}>
              {Array.from({ length: Math.max(TAKES_SUGGESTED, takes.length) }, (_, i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rounded-full ${i < takes.length ? "bg-brand-500" : "bg-slate-200 dark:bg-slate-700"}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={recordTake}
                disabled={!running || recording}
                className="btn-primary btn-sm"
              >
                {recording ? "Grabando…" : "Grabar una toma"}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={takes.length < MIN_PROTOTYPES_PER_SIGN || !text.trim()}
                className="btn-secondary btn-sm"
              >
                Guardar
              </button>
              {(takes.length > 0 || recording) && (
                <button type="button" onClick={discard} className="font-semibold text-slate-500 hover:underline">
                  {recording && takes.length === 0 ? "Cancelar" : "Descartar tomas"}
                </button>
              )}
            </div>
            {!running && <p className="text-xs text-slate-500">Enciende la cámara para grabar.</p>}
            {status && <p role="status" className="text-slate-600 dark:text-slate-300">{status}</p>}
          </div>
          {guideClip && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Referencia del curso</p>
              <div className="overflow-hidden rounded-3xl bg-brand-100 dark:bg-brand-900/40">
                <AvatarPlayer clip={guideClip} size={160} />
              </div>
            </div>
          )}
        </div>

        {signs.length > 0 && (
          <div className="space-y-2">
            <h3 className="eyebrow">
              Tus signos · fiabilidad con tus propias tomas
            </h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {signs.map((s) => {
                const good = s.recognized === s.total;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="font-medium">{s.text}</span>
                    <span className={`text-xs ${good ? "text-petrol-700 dark:text-petrol-300" : "text-accent-700 dark:text-accent-100"}`}>
                      {s.recognized}/{s.total} tomas
                      {s.confusedWith && ` · se confunde con «${s.confusedWith}»`}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="text-xs text-ko-600 hover:underline"
                    >
                      Borrar
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-slate-500">
              Cada toma se prueba contra las demás. Si un signo falla, grábalo de nuevo con más
              tomas o más marcado; si se confunde con otro, exagera lo que los diferencia.
            </p>
          </div>
        )}

        {signs.length >= 2 && (
          <div className="space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
            <h3 className="eyebrow">
              Prueba de secuencias
            </h3>
            {sequence ? (
              <>
                <p>
                  Signa las tres seguidas y pulsa comprobar:{" "}
                  <strong className="text-base">{sequence.join(" · ")}</strong>
                </p>
                <button
                  type="button"
                  onClick={check}
                  className="btn-primary btn-sm"
                >
                  Comprobar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={newSequence}
                disabled={!running}
                className="btn-secondary btn-sm"
              >
                Probar una secuencia de {SEQUENCE_LENGTH} signos
              </button>
            )}
            {lastScore && (
              <p>
                {lastScore.hits}/{lastScore.target} bien
                {lastScore.substitutions > 0 && ` · ${lastScore.substitutions} cambiados`}
                {lastScore.deletions > 0 && ` · ${lastScore.deletions} sin escribir`}
                {lastScore.insertions > 0 && ` · ${lastScore.insertions} de más`}
              </p>
            )}
            {totals && (
              <p className="text-xs text-slate-500">
                Acumulado: {pct(totals.hits, totals.target)} % de signos bien en {totals.target} ·
                WER {pct(totals.substitutions + totals.deletions + totals.insertions, totals.target)} %
              </p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
