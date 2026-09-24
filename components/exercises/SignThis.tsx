"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { LandmarkCamera } from "@/components/camera/LandmarkCamera";
import type { Exercise } from "@/lib/curriculum/schema";
import type { LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import { WEAK_LETTERS } from "@/lib/esku/infrastructure/recognition/CtcAlphabetClassifier";
import { createAlphabet } from "@/lib/recognition/engine";
import { getLetterMeta } from "@/lib/recognition/templates";

type Props = {
  exercise: Extract<Exercise, { type: "sign_this" }>;
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

type Phase =
  | { kind: "await_camera" }
  | { kind: "evaluating"; startedAt: number | null }
  | { kind: "done"; correct: boolean };

/** Tiempo mínimo para subir la mano y hacer la letra. */
const MIN_ATTEMPT_MS = 8000;
/** El mismo umbral con el que el traductor escribe una letra. */
const ACCEPT = 0.5;
/** Letras que el modelo reconoce peor: basta con que aparezcan entre las 3 primeras. */
const ACCEPT_WEAK = 0.25;

/**
 * Signar una letra del alfabeto dactilológico. Lo evalúa el modelo CTC de Esku, entrenado
 * con deletreo real (LSE-FS-UVigo), que marca cada letra en uno o dos fotogramas: se da por
 * buena en cuanto aparece como la más probable.
 */
export function SignThis({ exercise, onAnswer, disabled }: Props) {
  const alphabet = useMemo(() => createAlphabet(), []);
  const meta = getLetterMeta(exercise.letterId);
  const target = exercise.letterId.toUpperCase();
  const weak = WEAK_LETTERS.includes(target.toLowerCase());
  const windowMs = Math.max(exercise.voteWindowMs, MIN_ATTEMPT_MS);

  const phaseRef = useRef<Phase>({ kind: "await_camera" });
  const busyRef = useRef(false);
  const [phase, setPhaseState] = useState<Phase>(phaseRef.current);
  const [seen, setSeen] = useState<string | null>(null);

  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  const finish = useCallback(
    (correct: boolean) => {
      if (phaseRef.current.kind === "done") return;
      setPhase({ kind: "done", correct });
      onAnswer(correct);
    },
    [onAnswer],
  );

  const onFrame = useCallback(
    async (frame: LandmarkFrame) => {
      const p = phaseRef.current;
      if (p.kind !== "evaluating" || busyRef.current) return;
      // El plazo empieza con el primer fotograma: en un móvil lento el modelo tarda en arrancar.
      if (p.startedAt === null) phaseRef.current = { kind: "evaluating", startedAt: frame.timestampMs };
      const startedAt = (phaseRef.current as { startedAt: number }).startedAt;
      if (frame.timestampMs - startedAt > windowMs) {
        finish(false);
        return;
      }
      if (frame.hands.length === 0) return;
      busyRef.current = true;
      try {
        const candidates = await alphabet.classify([frame]);
        const top = candidates[0];
        if (top) setSeen(`${top.gloss.text} · ${Math.round(top.confidence * 100)} %`);
        const hit = weak
          ? candidates.some((c) => c.gloss.text === target && c.confidence >= ACCEPT_WEAK)
          : top?.gloss.text === target && top.confidence >= ACCEPT;
        if (hit) finish(true);
      } finally {
        busyRef.current = false;
      }
    },
    [alphabet, finish, target, weak, windowMs],
  );

  return (
    <section className="space-y-4" aria-labelledby={`ex-${exercise.id}`}>
      <div className="space-y-2">
        <h2 id={`ex-${exercise.id}`} className="text-lg font-semibold">
          {exercise.prompt}
        </h2>
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-3xl font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
          >
            {target}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {meta?.description ?? "Signa esta letra con la mano dominante."}
          </p>
        </div>
      </div>

      <LandmarkCamera
        onFrame={onFrame}
        prepare={() => alphabet.load()}
        onStart={() => {
          alphabet.reset();
          setSeen(null);
          setPhase({ kind: "evaluating", startedAt: null });
        }}
        stop={phase.kind === "done"}
        disabled={disabled}
      />

      {phase.kind === "await_camera" && (
        <p className="text-sm text-slate-500">
          Pulsa «Empezar cámara» y signa la letra <b>{target}</b>. Tienes {Math.round(windowMs / 1000)} s.
          {weak && " Esta letra es difícil para el modelo, así que se acepta con menos seguridad."}
        </p>
      )}
      {phase.kind === "evaluating" && (
        <div
          role="status"
          className="rounded-lg border border-brand-300 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-100"
        >
          Signa <b>{target}</b>… {seen ? <>Veo: <b>{seen}</b></> : "todavía no veo ninguna letra."}
        </div>
      )}
      {phase.kind === "done" && (
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            phase.correct
              ? "border-green-500 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100"
              : "border-red-500 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
          }`}
        >
          {phase.correct
            ? `¡Reconocido! Has signado la ${target}.`
            : `No he visto la ${target}${seen ? ` (lo último que vi: ${seen})` : ""}.`}
        </div>
      )}
      {phase.kind === "done" && !disabled && (
        <p className="text-sm text-slate-500">Los ejercicios de cámara no consumen corazones.</p>
      )}
    </section>
  );
}
