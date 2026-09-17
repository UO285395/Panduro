/**
 * Tipos internos del pipeline de reconocimiento de mano.
 * No dependen de @mediapipe/tasks-vision para poder importarse desde
 * módulos server-safe (tests, clasificador).
 */

export type Point3 = { x: number; y: number; z: number };

/** 21 landmarks tal cual los devuelve MediaPipe (x,y en [0,1], z relativo). */
export type RawLandmark = Point3;

/** 21 landmarks normalizados: traslación por muñeca + escala por longitud mano. */
export type NormalizedLandmark = Point3;

export type Handedness = "Left" | "Right";

/** Un frame procesado, listo para consumo por overlay o clasificador. */
export type HandFrame = {
  /** ms desde origen (performance.now). */
  timestamp: number;
  /** Latencia de inferencia del frame en ms. */
  inferenceMs: number;
  /** Landmarks en coordenadas de imagen (2D + z). */
  imageLandmarks: RawLandmark[];
  /** Landmarks normalizados (invariantes a traslación y escala). */
  normalized: NormalizedLandmark[];
  /** Mano detectada. */
  handedness: Handedness;
  /** Confianza del clasificador de mano [0,1]. */
  handednessScore: number;
};

export type PerfStats = {
  /** Frames por segundo medidos en la última ventana. */
  fps: number;
  /** Latencia mediana de inferencia (ms). */
  p50: number;
  /** Latencia P95 (ms). */
  p95: number;
  /** Número de frames en la ventana. */
  samples: number;
};
