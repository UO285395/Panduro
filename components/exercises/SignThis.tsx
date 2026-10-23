"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { LandmarkCamera } from "@/components/camera/LandmarkCamera";
import type { Exercise } from "@/lib/curriculum/schema";
import type { LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import { createAlphabet } from "@/lib/recognition/engine";
import { isUnrecognizedLetter, isWeakLetter, letterAccepted } from "@/lib/recognition/exercises";
import { getLetterMeta } from "@/lib/recognition/letters";

type Props = {
  exercise: Extract<Exercise, { type: "sign_this" }>;
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

type Phase =
  | { kind: "await_camera" }
  | { kind: "evaluating"; startedAt: number | null }
  /** Se acabó el tiempo con una letra que la cámara no sabe reconocer: lo dice quien aprende. */
  | { kind: "self" }
  | { kind: "done"; correct: boolean; self?: boolean };

/** Tiempo mínimo para subir la mano y hacer la letra. */
const MIN_ATTEMPT_MS = 8000;

/**
 * Signar una letra del alfabeto dactilológico. Lo evalúa el modelo CTC de Esku, entrenado
 * con deletreo real (LSE-FS-UVigo), que marca cada letra en uno o dos fotogramas: se da por
 * buena en cuanto aparece como la más probable. Las letras que el modelo no reconoce
 * (`UNRECOGNIZED_LETTERS`) no se dan por falladas al acabarse el tiempo: quien aprende compara
 * con la descripción y dice si le ha salido.
 */
export function SignThis({ exercise, onAnswer, disabled }: Props) {
  const alphabet = useMemo(() => createAlphabet(), []);
  const meta = getLetterMeta(exercise.letterId);
  const target = exercise.letterId.toUpperCase();
  const weak = isWeakLetter(target);
  const unrecognized = isUnrecognizedLetter(target);
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
    (correct: boolean, self = false) => {
      if (phaseRef.current.kind === "done") return;
      setPhase({ kind: "done", correct, self });
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
        if (unrecognized) setPhase({ kind: "self" });
        else finish(false);
        return;
      }
      if (frame.hands.length === 0) return;
      busyRef.current = true;
      try {
        const candidates = await alphabet.classify([frame]);
        const top = candidates[0];
        if (top) setSeen(`${top.gloss.text} · ${Math.round(top.confidence * 100)} %`);
        if (letterAccepted(candidates, target)) finish(true);
      } finally {
        busyRef.current = false;
      }
    },
    [alphabet, finish, target, unrecognized, windowMs],
  );

  return (
    <section className="space-y-4" aria-labelledby={`ex-${exercise.id}`}>
      <div className="space-y-2">
        <h2 id={`ex-${exercise.id}`} className="exercise-title">
          {exercise.prompt}
        </h2>
        <div className="card flex items-center gap-4 p-4">
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-100 font-display text-4xl font-extrabold text-brand-600 dark:bg-brand-900/40 dark:text-brand-200"
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
        stop={phase.kind === "done" || phase.kind === "self"}
        disabled={disabled}
      />

      {phase.kind === "await_camera" && (
        <p className="text-sm text-slate-500">
          Pulsa «Empezar cámara» y signa la letra <b>{target}</b>. Tienes {Math.round(windowMs / 1000)} s.
          {unrecognized
            ? ` La cámara todavía no reconoce bien la ${target}: hazla mirando la descripción y, si no la ve, dirás tú si te ha salido.`
            : weak && " Esta letra es difícil para el modelo, así que se acepta con menos seguridad."}
        </p>
      )}
      {phase.kind === "evaluating" && (
        <div
          role="status"
          className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-100"
        >
          Signa <b>{target}</b>… {seen ? <>Veo: <b>{seen}</b></> : "todavía no veo ninguna letra."}
        </div>
      )}
      {phase.kind === "self" && (
        <div className="space-y-3 rounded-2xl border-2 border-accent-500/60 bg-accent-100 p-3 text-sm text-accent-700 dark:bg-accent-700/20 dark:text-accent-100">
          <p>
            La cámara no ha podido comprobar la <b>{target}</b>. Compara tu mano con la descripción:
            ¿te ha salido así?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => finish(true, true)}
              disabled={disabled}
              className="btn-primary btn-sm flex-1"
            >
              Sí, me ha salido
            </button>
            <button
              type="button"
              onClick={() => finish(false, true)}
              disabled={disabled}
              className="btn-secondary btn-sm flex-1"
            >
              Todavía no
            </button>
          </div>
        </div>
      )}
      {phase.kind === "done" && (
        <div
          role="status"
          className={`rounded-2xl border-2 p-3 text-sm ${
            phase.correct
              ? "border-petrol-500 bg-petrol-50 text-petrol-900 dark:border-petrol-700 dark:bg-petrol-950 dark:text-petrol-100"
              : "border-ko-500 bg-ko-50 text-ko-900 dark:border-ko-700 dark:bg-ko-950 dark:text-ko-100"
          }`}
        >
          {phase.self
            ? phase.correct
              ? `Apuntado: te ha salido la ${target}.`
              : `Apuntado: sigue practicando la ${target}.`
            : phase.correct
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
