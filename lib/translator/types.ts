import type { HandFrame, NormalizedLandmark } from "@/lib/mediapipe/types";

export type SegmentPhase = "idle" | "moving" | "holding";

export type SegmentEvent =
  | { kind: "start"; at: number }
  | { kind: "hold"; at: number; centroid: NormalizedLandmark[] }
  | { kind: "end"; at: number };

export type RecognizedSign = {
  /** Etiqueta que el clasificador devolvió (letra o gloss). */
  label: string;
  /** Confianza normalizada [0,1]. */
  confidence: number;
  /** Momento en el que se cerró el segmento (epoch ms). */
  at: number;
};

/** Snapshot resumido del último frame consumido. Facilita depurar en la UI. */
export type SegmentState = {
  phase: SegmentPhase;
  lastFrame: HandFrame | null;
  /** ms sin detección continua. */
  missingMs: number;
};
