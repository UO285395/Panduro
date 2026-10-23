"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LandmarkCamera } from "@/components/camera/LandmarkCamera";
import type { Exercise, Sign } from "@/lib/curriculum/schema";
import { dominantHand, type LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import { SignSegmenter } from "@/lib/esku/domain/recognition/services/SignSegmenter";
import { normalizeLandmarks } from "@/lib/mediapipe/landmarks";
import { createVocabulary, vocabularyConcepts } from "@/lib/recognition/engine";
import { HandshapeVote, lessonTemplates } from "@/lib/recognition/exercises";
import { extractFeatures } from "@/lib/recognition/features";
import { KnnClassifier } from "@/lib/recognition/knn";
import { conceptFor, glossKey } from "@/lib/recognition/vocabularyMap";

type Props = {
  exercise: Extract<Exercise, { type: "sign_word" }>;
  sign: Sign | undefined;
  /** Los signos de la lección: contra ellos se compara la forma de la mano. */
  lessonSigns?: readonly string[];
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

type Phase =
  | { kind: "await_camera" }
  | { kind: "evaluating"; startedAt: number | null }
  | { kind: "done"; correct: boolean };

/** Hay que dar tiempo a subir las manos, signar y bajarlas (así se cierra el signo). */
const MIN_ATTEMPT_MS = 10000;

/**
 * Signar una palabra. Si el signo está en el vocabulario entrenado de Esku (SWL-LSE), se
 * reconoce completo —forma, lugar y movimiento— cuando el signo termina, y vale si está
 * entre las 3 respuestas del modelo. Si no está, se comprueba solo la forma de la mano con
 * las plantillas de los signos de la lección, y así se le indica a quien estudia.
 */
export function SignWord({ exercise, sign, lessonSigns = [], onAnswer, disabled }: Props) {
  const vocabulary = useMemo(() => createVocabulary(), []);
  // Las plantillas de formas de mano pesan varios MB: se cargan al llegar al ejercicio.
  const [handshapes, setHandshapes] = useState<KnnClassifier | null>(null);
  const rivals = lessonSigns.join(",");
  useEffect(() => {
    let alive = true;
    import("@/lib/recognition/templates").then(({ loadGlobalTemplates, loadLocalTemplates }) => {
      if (!alive) return;
      const all = [...loadGlobalTemplates(), ...loadLocalTemplates()];
      const lesson = rivals ? rivals.split(",") : [];
      setHandshapes(new KnnClassifier(lessonTemplates(all, exercise.signId, lesson), 3));
    });
    return () => {
      alive = false;
    };
  }, [exercise.signId, rivals]);
  const [concept, setConcept] = useState<string | null | undefined>(undefined);
  const conceptRef = useRef<string | null>(null);
  const segmenterRef = useRef(new SignSegmenter());
  const voteRef = useRef(new HandshapeVote(exercise.signId, exercise.minConfidence));
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

  const finishHandshapeVote = useCallback(() => finish(voteRef.current.verdict()), [finish]);

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
      if (!hand || !handshapes) {
        voteRef.current.lost();
        return;
      }
      const pred = handshapes.predict(extractFeatures(normalizeLandmarks([...hand.points])));
      if (!pred) return;
      if (voteRef.current.push(pred, frame.timestampMs)) finish(true);
    },
    [finish, finishHandshapeVote, handshapes, vocabulary, windowMs],
  );

  return (
    <section className="space-y-4" aria-labelledby={`ex-${exercise.id}`}>
      <div className="space-y-2">
        <h2 id={`ex-${exercise.id}`} className="exercise-title">
          {exercise.prompt}
        </h2>
        <div className="card flex items-center gap-4 p-4">
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
          voteRef.current = new HandshapeVote(exercise.signId, exercise.minConfidence);
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
          className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-100"
        >
          Signa <b>{signLabel}</b>…{seen && <> Veo: <b>{seen}</b></>}
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
