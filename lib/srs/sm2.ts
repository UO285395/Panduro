/**
 * SM-2 (SuperMemo 2), versión clásica. Se aplica frame por frame:
 *
 *   next = nextReview(current, quality)
 *
 * `quality ∈ {0..5}`:
 *   0..2 → fallo: se resetea el contador de repeticiones y la card vuelve a "hoy".
 *   3..5 → acierto: la card avanza en el ciclo (1d → 6d → interval * ease).
 *
 * `ease` empieza en 2.5 y queda acotado a [1.3, ∞). El delta clásico es:
 *   e' = e + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
 *
 * `intervalDays` es siempre un número entero de días para poder pintarlo en la UI.
 */

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ReviewState = {
  ease: number;
  intervalDays: number;
  repetitions: number;
  /** Epoch ms de cuándo toca la próxima revisión. */
  dueAt: number;
};

export type Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** UI simplificada: 4 botones mapeados al espacio 0..5. */
export const QUALITY_LABELS = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
} as const;
export type QualityKey = keyof typeof QUALITY_LABELS;

export function initialReview(now = Date.now()): ReviewState {
  return {
    ease: DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    dueAt: now,
  };
}

export function nextReview(
  current: ReviewState,
  quality: Quality,
  now = Date.now(),
): ReviewState {
  const q = clamp(quality, 0, 5) as Quality;
  const failed = q < 3;

  // Actualiza el factor de facilidad ANTES de decidir el intervalo (SM-2 clásico).
  const easeDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const ease = Math.max(MIN_EASE, current.ease + easeDelta);

  if (failed) {
    return {
      ease,
      intervalDays: 0,
      repetitions: 0,
      dueAt: now,
    };
  }

  const nextReps = current.repetitions + 1;
  let interval: number;
  if (nextReps === 1) interval = 1;
  else if (nextReps === 2) interval = 6;
  else interval = Math.round(current.intervalDays * ease);
  if (interval < 1) interval = 1;

  return {
    ease,
    intervalDays: interval,
    repetitions: nextReps,
    dueAt: now + interval * MS_PER_DAY,
  };
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
