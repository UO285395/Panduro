/**
 * Umbrales del motor de traducción. Todos configurables desde aquí para
 * poder ajustarlos por telemetría en post-MVP sin tocar la máquina de estados.
 */

/** Velocidad de la muñeca (unidades normalizadas / frame) por debajo de la
 * cual consideramos que la mano está "quieta". */
export const WRIST_VELOCITY_HOLD = 0.02;

/** Milisegundos de estabilidad continua para consolidar un signo. */
export const HOLD_MS = 300;

/** Sin detección durante N ms → insertamos un espacio (dactilología). */
export const SPACE_PAUSE_MS = 1000;

/** Sin detección durante N ms → cerramos frase con punto. */
export const SENTENCE_PAUSE_MS = 2000;

/** Ventana anti-rebote: el mismo signo repetido dentro de este intervalo se
 * descarta. */
export const DEDUPE_MS = 400;

/** Confianza mínima que emite el clasificador para publicar un signo. */
export const MIN_TRANSLATE_CONFIDENCE = 0.35;

/** Nº de frames que promediamos para obtener el snapshot de landmarks. */
export const HOLD_SAMPLE_FRAMES = 10;
