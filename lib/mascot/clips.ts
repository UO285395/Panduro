import type { AvatarClip } from "@/lib/curriculum/schema";

/**
 * Animaciones de la mascota "Thing" (mano expresiva, dedos hacia arriba).
 * Duraciones ×1.5 respecto al diseño original para movimientos más naturales.
 */

export const THING_CLIPS: Record<"idle" | "correct" | "incorrect" | "celebrate", AvatarClip> = {
  /** Idle: balanceo suave cíclico. */
  idle: {
    handedness: "one",
    duration: 3600,
    keyframes: [
      { t: 0,    hand: { x: 0.05,  y: 0.15, z: 0, rot: [0, 0, 0] },       fingers: [0, 0.2, 0.2, 0.2, 0.1] },
      { t: 900,  hand: { x: -0.05, y: 0.18, z: 0, rot: [0, 0.05, 0] },    fingers: [0, 0.3, 0.3, 0.3, 0.2] },
      { t: 1800, hand: { x: 0.05,  y: 0.15, z: 0, rot: [0, -0.05, 0] },   fingers: [0, 0.2, 0.2, 0.2, 0.1] },
      { t: 2700, hand: { x: -0.05, y: 0.18, z: 0, rot: [0, 0.05, 0] },    fingers: [0, 0.3, 0.3, 0.3, 0.2] },
      { t: 3600, hand: { x: 0.05,  y: 0.15, z: 0, rot: [0, 0, 0] },       fingers: [0, 0.2, 0.2, 0.2, 0.1] },
    ],
  },

  /**
   * Correcto: pulgar extendido (thumbs up), rebote suave.
   * Pico de y reducido a 0.22 para asegurar visibilidad dentro del frustum.
   */
  correct: {
    handedness: "one",
    duration: 1800,
    keyframes: [
      { t: 0,    hand: { x: 0, y: 0.10, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
      { t: 300,  hand: { x: 0, y: 0.22, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
      { t: 750,  hand: { x: 0, y: 0.16, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
      { t: 1200, hand: { x: 0, y: 0.20, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
      { t: 1800, hand: { x: 0, y: 0.15, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
    ],
  },

  /** Incorrecto: índice wagging de lado a lado. */
  incorrect: {
    handedness: "one",
    duration: 1800,
    keyframes: [
      { t: 0,    hand: { x: 0,     y: 0.15, z: 0, rot: [0, 0, 0] },    fingers: [1, 0, 1, 1, 1] },
      { t: 300,  hand: { x: 0.12,  y: 0.15, z: 0, rot: [0, 0, 0.4] }, fingers: [1, 0, 1, 1, 1] },
      { t: 750,  hand: { x: -0.12, y: 0.15, z: 0, rot: [0, 0, -0.4] },fingers: [1, 0, 1, 1, 1] },
      { t: 1200, hand: { x: 0.10,  y: 0.15, z: 0, rot: [0, 0, 0.3] }, fingers: [1, 0, 1, 1, 1] },
      { t: 1800, hand: { x: 0,     y: 0.15, z: 0, rot: [0, 0, 0] },    fingers: [1, 0, 1, 1, 1] },
    ],
  },

  /** Celebración: mano abierta agitándose, movimiento amplio y suave. */
  celebrate: {
    handedness: "one",
    duration: 3000,
    keyframes: [
      { t: 0,    hand: { x: 0,     y: 0.12, z: 0, rot: [0, 0, 0] },    fingers: [0, 0, 0, 0, 0] },
      { t: 375,  hand: { x: 0.13,  y: 0.20, z: 0, rot: [0, 0, 0.3] },  fingers: [0, 0, 0, 0, 0] },
      { t: 750,  hand: { x: -0.13, y: 0.12, z: 0, rot: [0, 0, -0.3] }, fingers: [0, 0, 0, 0, 0] },
      { t: 1125, hand: { x: 0.13,  y: 0.20, z: 0, rot: [0, 0, 0.3] },  fingers: [0, 0, 0, 0, 0] },
      { t: 1500, hand: { x: -0.13, y: 0.12, z: 0, rot: [0, 0, -0.3] }, fingers: [0, 0, 0, 0, 0] },
      { t: 1950, hand: { x: 0.08,  y: 0.17, z: 0, rot: [0, 0, 0.2] },  fingers: [0, 0, 0, 0, 0] },
      { t: 3000, hand: { x: 0,     y: 0.12, z: 0, rot: [0, 0, 0] },    fingers: [0, 0, 0, 0, 0] },
    ],
  },
};
