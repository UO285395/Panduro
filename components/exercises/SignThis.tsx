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
          className="rounded-lg border border-brand-300 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-100"
        >
          Signa <b>{target}</b>… {seen ? <>Veo: <b>{seen}</b></> : "todavía no veo ninguna letra."}
        </div>
      )}
      {phase.kind === "self" && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p>
            La cámara no ha podido comprobar la <b>{target}</b>. Compara tu mano con la descripción:
            ¿te ha salido así?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => finish(true, true)}
              disabled={disabled}
              className="flex-1 rounded-full bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Sí, me ha salido
            </button>
            <button
              type="button"
              onClick={() => finish(false, true)}
              disabled={disabled}
              className="flex-1 rounded-full border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Todavía no
            </button>
          </div>
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
