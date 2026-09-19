/**
 * URLs y constantes del pipeline.
 * El modelo se sirve localmente desde /public/models/ cuando está disponible,
 * con fallback al CDN de Google para la primera carga o si el archivo local falta.
 */

export const MEDIAPIPE_TASKS_VISION_VERSION = "0.10.14";

export const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_TASKS_VISION_VERSION}/wasm`;

const REMOTE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const LOCAL_MODEL_PATH = "/models/hand_landmarker.task";

// Servir el modelo local cuando el navegador está offline; de lo contrario CDN.
export const HAND_LANDMARKER_MODEL_URL =
  typeof window !== "undefined" && !navigator.onLine
    ? LOCAL_MODEL_PATH
    : REMOTE_MODEL_URL;

/**
 * Conexiones entre landmarks para pintar el esqueleto de la mano.
 * Referencia: https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
 */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  // pulgar
  [0, 1], [1, 2], [2, 3], [3, 4],
  // índice
  [0, 5], [5, 6], [6, 7], [7, 8],
  // medio
  [5, 9], [9, 10], [10, 11], [11, 12],
  // anular
  [9, 13], [13, 14], [14, 15], [15, 16],
  // meñique
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

// Índices notables
export const WRIST = 0;
export const MIDDLE_MCP = 9;
export const INDEX_TIP = 8;
export const THUMB_TIP = 4;

/** Ventana móvil para métricas de rendimiento. */
export const PERF_WINDOW_FRAMES = 60;

/** Umbral mínimo de confianza para reportar una detección. */
export const DETECTION_CONFIDENCE = 0.5;
