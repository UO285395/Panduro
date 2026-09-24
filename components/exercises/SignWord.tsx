"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LandmarkCamera } from "@/components/camera/LandmarkCamera";
import type { Exercise, Sign } from "@/lib/curriculum/schema";
import { dominantHand, type LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import { SignSegmenter } from "@/lib/esku/domain/recognition/services/SignSegmenter";
import { normalizeLandmarks } from "@/lib/mediapipe/landmarks";
import { createVocabulary, vocabularyConcepts } from "@/lib/recognition/engine";
import { extractFeatures } from "@/lib/recognition/features";
import { KnnClassifier, withoutSameHandshape } from "@/lib/recognition/knn";
import { loadGlobalTemplates, loadLocalTemplates } from "@/lib/recognition/templates";
import { conceptFor, glossKey } from "@/lib/recognition/vocabularyMap";

type Props = {
  exercise: Extract<Exercise, { type: "sign_word" }>;
  sign: Sign | undefined;
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

type Phase =
  | { kind: "await_camera" }
  | { kind: "evaluating"; startedAt: number | null }
  | { kind: "done"; correct: boolean };

/** Hay que dar tiempo a subir las manos, signar y bajarlas (así se cierra el signo). */
const MIN_ATTEMPT_MS = 10000;
const EARLY_EXIT_CONF = 0.8;
const EARLY_EXIT_MS = 350;

/**
 * Signar una palabra. Si el signo está en el vocabulario entrenado de Esku (SWL-LSE), se
 * reconoce completo —forma, lugar y movimiento— cuando el signo termina, y vale si está
 * entre las 3 respuestas del modelo. Si no está, se comprueba solo la forma de la mano con
 * las plantillas locales, y así se le indica a quien estudia.
 */
export function SignWord({ exercise, sign, onAnswer, disabled }: Props) {
  const vocabulary = useMemo(() => createVocabulary(), []);
  const handshapes = useMemo(
    () =>
      new KnnClassifier(
        withoutSameHandshape([...loadGlobalTemplates(), ...loadLocalTemplates()], exercise.signId),
        3,
      ),
    [exercise.signId],
  );
  const [concept, setConcept] = useState<string | null | undefined>(undefined);
  const conceptRef = useRef<string | null>(null);
  const segmenterRef = useRef(new SignSegmenter());
  const votesRef = useRef<{ label: string; confidence: number }[]>([]);
  const highSinceRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const phaseRef = useRef<Phase>({ kind: "await_camera" });
  const [phase, setPhaseState] = useState<Phase>(phaseRef.current);
  const [seen, setSeen] = useState<string | null>(null);

  const windowMs = Math.max(exercise.voteWindowMs, MIN_ATTEMPT_MS);
  const signLabel = sign?.translation ?? exercise.signId;

  useEffect(() => {
    let alive = true;
    vocabularyConcepts().then((concepts) => {
      if (!alive) return;
      const c = conceptFor(exercise.signId, concepts);
      conceptRef.current = c;
      setConcept(c);
    });
    return () => {
      alive = false;
    };
  }, [exercise.signId]);

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

  const finishHandshapeVote = useCallback(() => {
    const counts = new Map<string, { n: number; conf: number }>();
    for (const v of votesRef.current) {
      const c = counts.get(v.label) ?? { n: 0, conf: 0 };
      c.n += 1;
      c.conf += v.confidence;
      counts.set(v.label, c);
    }
    let winner = "";
    let best = { n: -1, conf: 0 };
    for (const [label, c] of counts) if (c.n > best.n) [winner, best] = [label, c];
    finish(winner === exercise.signId && best.conf / Math.max(1, best.n) >= exercise.minConfidence);
  }, [exercise.minConfidence, exercise.signId, finish]);

  const onFrame = useCallback(
    async (frame: LandmarkFrame) => {
      const p = phaseRef.current;
      if (p.kind !== "evaluating") return;
      const target = conceptRef.current;
      // El plazo empieza con el primer fotograma: en un móvil lento el modelo tarda en arrancar.
      if (p.startedAt === null) phaseRef.current = { kind: "evaluating", startedAt: frame.timestampMs };
      const startedAt = (phaseRef.current as { startedAt: number }).startedAt;

      if (frame.timestampMs - startedAt > windowMs) {
        if (target) finish(false);
        else finishHandshapeVote();
        return;
      }

      if (target) {
        const window = segmenterRef.current.push(frame);
        if (!window || busyRef.current) return;
        busyRef.current = true;
        try {
          const candidates = await vocabulary.classify(window);
          setSeen(candidates.length ? candidates.map((c) => c.gloss.text).join(", ") : "ningún signo claro");
          if (candidates.some((c) => glossKey(c.gloss.conceptId) === glossKey(target))) finish(true);
        } finally {
          busyRef.current = false;
        }
        return;
      }

      const hand = dominantHand(frame);
      if (!hand) {
        highSinceRef.current = null;
        return;
      }
      const pred = handshapes.predict(extractFeatures(normalizeLandmarks([...hand.points])));
      if (!pred) return;
      votesRef.current.push({ label: pred.label, confidence: pred.confidence });
      if (pred.label === exercise.signId && pred.confidence >= EARLY_EXIT_CONF) {
        highSinceRef.current ??= frame.timestampMs;
        if (frame.timestampMs - highSinceRef.current >= EARLY_EXIT_MS) finish(true);
      } else {
        highSinceRef.current = null;
      }
    },
    [exercise.signId, finish, finishHandshapeVote, handshapes, vocabulary, windowMs],
  );

  return (
    <section className="space-y-4" aria-labelledby={`ex-${exercise.id}`}>
      <div className="space-y-2">
        <h2 id={`ex-${exercise.id}`} className="text-lg font-semibold">
          {exercise.prompt}
        </h2>
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <p className="font-semibold">{signLabel}</p>
            {sign?.description && (
              <p className="text-sm text-slate-600 dark:text-slate-300">{sign.description}</p>
            )}
          </div>
        </div>
        {concept !== undefined && (
          <p className="text-xs text-slate-500">
            {concept
              ? "Se reconoce el signo completo, movimiento incluido: empieza y termina con las manos bajadas."
              : "Este signo aún no está en el modelo entrenado: solo se comprueba la forma de la mano."}
          </p>
        )}
      </div>

      <LandmarkCamera
        onFrame={onFrame}
        prepare={async () => {
          const concepts = await vocabularyConcepts();
          if (conceptFor(exercise.signId, concepts)) await vocabulary.load();
        }}
        onStart={() => {
          segmenterRef.current.reset();
          votesRef.current = [];
          highSinceRef.current = null;
          setSeen(null);
          setPhase({ kind: "evaluating", startedAt: null });
        }}
        stop={phase.kind === "done"}
        disabled={disabled || concept === undefined}
      />

      {phase.kind === "await_camera" && (
        <p className="text-sm text-slate-500">
          Pulsa «Empezar cámara» y signa <b>{signLabel}</b>. Tienes {Math.round(windowMs / 1000)} s.
        </p>
      )}
      {phase.kind === "evaluating" && (
        <div
          role="status"
          className="rounded-lg border border-brand-300 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-100"
        >
          Signa <b>{signLabel}</b>…{seen && <> Veo: <b>{seen}</b></>}
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
            ? `¡Reconocido! Has signado ${signLabel}.`
            : `No he reconocido ${signLabel}${seen ? ` (vi: ${seen})` : ""}.`}
        </div>
      )}
      {phase.kind === "done" && !disabled && (
        <p className="text-sm text-slate-500">Los ejercicios de cámara no consumen corazones.</p>
      )}
    </section>
  );
}
