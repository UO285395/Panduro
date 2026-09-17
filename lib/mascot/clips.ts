import type { AvatarClip } from "@/lib/curriculum/schema";

/**
 * Animaciones de la mascota "Thing" (mano al revés, expresiva).
 * Los valores de `hand` están en el espacio del clip, escalados al rig
 * procedimental del avatar. Los `fingers` siguen el esquema [thumb, index,
 * middle, ring, pinky] con 0 = extendido y 1 = cerrado.
 */

export const THING_CLIPS: Record<"idle" | "correct" | "incorrect" | "celebrate", AvatarClip> = {
  /**
   * Idle: balanceo suave con los dedos semi-abiertos.
   * El ciclo es suficientemente largo para no verse repetitivo.
   */
  idle: {
    handedness: "one",
    duration: 2400,
    keyframes: [
      { t: 0,    hand: { x: 0.05,  y: 0.15, z: 0, rot: [0, 0, 0] },       fingers: [0, 0.2, 0.2, 0.2, 0.1] },
      { t: 600,  hand: { x: -0.05, y: 0.18, z: 0, rot: [0, 0.05, 0] },    fingers: [0, 0.3, 0.3, 0.3, 0.2] },
      { t: 1200, hand: { x: 0.05,  y: 0.15, z: 0, rot: [0, -0.05, 0] },   fingers: [0, 0.2, 0.2, 0.2, 0.1] },
      { t: 1800, hand: { x: -0.05, y: 0.18, z: 0, rot: [0, 0.05, 0] },    fingers: [0, 0.3, 0.3, 0.3, 0.2] },
      { t: 2400, hand: { x: 0.05,  y: 0.15, z: 0, rot: [0, 0, 0] },       fingers: [0, 0.2, 0.2, 0.2, 0.1] },
    ],
  },

  /**
   * Correcto: pulgar extendido (thumbs up), rebote hacia arriba.
   * Los otros cuatro dedos permanecen cerrados.
   */
  correct: {
    handedness: "one",
    duration: 1200,
    keyframes: [
      { t: 0,   hand: { x: 0,     y: 0.10, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
      { t: 200, hand: { x: 0,     y: 0.30, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
      { t: 500, hand: { x: 0,     y: 0.20, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
      { t: 800, hand: { x: 0,     y: 0.26, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
      { t: 1200,hand: { x: 0,     y: 0.20, z: 0, rot: [0, 0, 0] },  fingers: [0, 1, 1, 1, 1] },
    ],
  },

  /**
   * Incorrecto: índice wagging de lado a lado (como "no-no").
   * El resto de dedos cerrados. Movimiento lateral de la muñeca.
   */
  incorrect: {
    handedness: "one",
    duration: 1200,
    keyframes: [
      { t: 0,   hand: { x: 0,     y: 0.15, z: 0, rot: [0, 0, 0] },       fingers: [1, 0, 1, 1, 1] },
      { t: 200, hand: { x: 0.12,  y: 0.15, z: 0, rot: [0, 0, 0.4] },     fingers: [1, 0, 1, 1, 1] },
      { t: 500, hand: { x: -0.12, y: 0.15, z: 0, rot: [0, 0, -0.4] },    fingers: [1, 0, 1, 1, 1] },
      { t: 800, hand: { x: 0.10,  y: 0.15, z: 0, rot: [0, 0, 0.3] },     fingers: [1, 0, 1, 1, 1] },
      { t: 1200,hand: { x: 0,     y: 0.15, z: 0, rot: [0, 0, 0] },       fingers: [1, 0, 1, 1, 1] },
    ],
  },

  /**
   * Celebración al completar una lección: mano abierta agitándose.
   */
  celebrate: {
    handedness: "one",
    duration: 2000,
    keyframes: [
      { t: 0,    hand: { x: 0,     y: 0.15, z: 0, rot: [0, 0, 0] },      fingers: [0, 0, 0, 0, 0] },
      { t: 250,  hand: { x: 0.15,  y: 0.25, z: 0, rot: [0, 0, 0.3] },    fingers: [0, 0, 0, 0, 0] },
      { t: 500,  hand: { x: -0.15, y: 0.15, z: 0, rot: [0, 0, -0.3] },   fingers: [0, 0, 0, 0, 0] },
      { t: 750,  hand: { x: 0.15,  y: 0.25, z: 0, rot: [0, 0, 0.3] },    fingers: [0, 0, 0, 0, 0] },
      { t: 1000, hand: { x: -0.15, y: 0.15, z: 0, rot: [0, 0, -0.3] },   fingers: [0, 0, 0, 0, 0] },
      { t: 1300, hand: { x: 0.10,  y: 0.20, z: 0, rot: [0, 0, 0.2] },    fingers: [0, 0, 0, 0, 0] },
      { t: 2000, hand: { x: 0,     y: 0.15, z: 0, rot: [0, 0, 0] },      fingers: [0, 0, 0, 0, 0] },
    ],
  },
};
