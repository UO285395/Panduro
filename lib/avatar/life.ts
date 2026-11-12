import type { AvatarKeyframe } from "@/lib/curriculum/schema";

/**
 * Lo que hace que el avatar no sea una estatua mientras signa o espera: respira, cambia el
 * peso de un pie a otro, acompaña con el tronco hacia donde van las manos, mueve un poco la
 * cabeza cuando no signa y mantiene la mirada en quien aprende aunque gire la cabeza, con
 * algún vistazo a un lado.
 *
 * Todo lo del tronco se aplica por debajo del pecho, así que la cabeza, los hombros y los
 * brazos se mueven juntos: las manos quedan donde estaban respecto a la cara y al cuerpo, y
 * los contactos del signo no cambian. Aquí están las cuentas, sin three.js; quien las aplica
 * al modelo es `applyLife` (lib/avatar/vrmMapper.ts).
 */

type Vec3 = [number, number, number];

/** Giro del tronco (rad): hacia la derecha del signante, hacia delante y ladeado a su derecha. */
export type Lean = { yaw: number; pitch: number; roll: number };

export const NO_LEAN: Lean = { yaw: 0, pitch: 0, roll: 0 };

const TAU = 2 * Math.PI;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Un ciclo de respiración (ms) y cuánto se nota: giro del pecho (rad) y subida del cuerpo (brazos). */
const BREATH_MS = 3900;
export const BREATH = { chest: 0.014, rise: 0.004 };

/** La respiración en `clockMs`: de −1 (sin aire) a 1 (lleno); se coge aire más deprisa de lo que se suelta. */
export function breathAt(clockMs: number): number {
  const u = ((clockMs % BREATH_MS) + BREATH_MS) % BREATH_MS / BREATH_MS;
  const IN = 0.42;
  const k = u < IN ? u / IN : 1 - (u - IN) / (1 - IN);
  return -Math.cos(Math.PI * k);
}

/** El peso de un pie a otro: un vaivén lento del tronco, casi nada. */
export function swayAt(clockMs: number): Lean {
  const s = clockMs / 1000;
  return {
    yaw: 0.008 * Math.sin((TAU * s) / 11.3),
    pitch: 0.004 * Math.sin((TAU * s) / 8.1 + 1),
    roll: 0.007 * Math.sin((TAU * s) / 7.3 + 2),
  };
}

/** Dónde tiene la mano dominante quien signa delante de su hombro (x del espacio de signado). */
const NEUTRAL_X = 0.1;
const LEAN_GAIN = { yaw: 0.13, roll: 0.045, pitch: 0.075 };
const LEAN_MAX = { yaw: 0.06, roll: 0.022, pitch: 0.045 };

/**
 * Hacia dónde acompaña el tronco al signo: gira hacia el lado al que van las manos (la
 * derecha que cruza a la izquierda, o que se abre a la derecha), se ladea un poco con ellas y
 * se inclina cuando se adelantan. Con las dos manos iguales a cada lado, no gira.
 */
export function signLean(kf: Pick<AvatarKeyframe, "hand" | "hand2">): Lean {
  const { hand, hand2 } = kf;
  // Hacia la derecha del signante: la x de cada mano va hacia fuera de su hombro.
  const lateral = hand2 ? (hand.x - hand2.x) / 2 : hand.x - NEUTRAL_X;
  const forward = hand2 ? (hand.z + hand2.z) / 2 : hand.z;
  return {
    yaw: clamp(LEAN_GAIN.yaw * lateral, -LEAN_MAX.yaw, LEAN_MAX.yaw),
    roll: clamp(LEAN_GAIN.roll * lateral, -LEAN_MAX.roll, LEAN_MAX.roll),
    pitch: clamp(LEAN_GAIN.pitch * (forward - 0.05), -0.5 * LEAN_MAX.pitch, LEAN_MAX.pitch),
  };
}

/** Lo que tarda el tronco en seguir a las manos (ms): va detrás de ellas, no a la vez. */
export const LEAN_TAU_MS = 220;

/** `from` acercándose a `to` durante `dtMs` (no depende de los fps). */
export function easeLean(from: Lean, to: Lean, dtMs: number, tauMs = LEAN_TAU_MS): Lean {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  return {
    yaw: from.yaw + (to.yaw - from.yaw) * k,
    pitch: from.pitch + (to.pitch - from.pitch) * k,
    roll: from.roll + (to.roll - from.roll) * k,
  };
}

/** Número entre 0 y 1 que depende solo de `n` (el mismo siempre). */
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Cabeza en reposo ([giro, cabeceo, ladeo], como AvatarKeyframe.head): se mueve despacio, poco. */
export function idleHeadAt(clockMs: number): Vec3 {
  const s = clockMs / 1000;
  return [
    0.035 * Math.sin((TAU * s) / 9.7) + 0.012 * Math.sin((TAU * s) / 3.1),
    0.018 * Math.sin((TAU * s) / 6.3 + 1.3),
    0.02 * Math.sin((TAU * s) / 12.9 + 0.6),
  ];
}

const GLANCE_SLOT_MS = 2900;

/**
 * Un vistazo a un lado ([giro, cabeceo] del ojo, rad): cada tres segundos más o menos los
 * ojos se van un momento y vuelven. El resto del tiempo, 0: miran a quien aprende.
 */
export function glanceAt(clockMs: number): [number, number] {
  const slot = Math.floor(clockMs / GLANCE_SLOT_MS);
  const start = 500 + 1700 * noise(slot);
  const lasts = 170 + 260 * noise(slot + 0.5);
  const u = clockMs - slot * GLANCE_SLOT_MS - start;
  if (u < 0 || u > lasts) return [0, 0];
  const yaw = (0.035 + 0.035 * noise(slot + 0.25)) * (noise(slot + 0.75) < 0.5 ? -1 : 1);
  const pitch = 0.03 * (noise(slot + 0.9) - 0.5);
  return [yaw, pitch];
}

/** Lo más que giran los ojos para seguir mirando al frente (rad). */
export const GAZE_MAX = 0.24;
/** Parte del cabeceo que deshacen los ojos, y su tope (rad). */
const GAZE_PITCH = 0.6;
const GAZE_PITCH_MAX = 0.1;

/**
 * Giro de los ojos ([hacia la derecha del signante, hacia abajo], rad) para que sigan mirando
 * a quien aprende con la cabeza girada `head` y el tronco `lean`, más el vistazo del momento.
 * Los ojos deshacen el giro de la cabeza hasta donde llegan.
 */
export function gazeFor(head: Vec3 | undefined, lean: Lean, glance: [number, number] = [0, 0]): [number, number] {
  const yaw = (head?.[0] ?? 0) + lean.yaw;
  const pitch = (head?.[1] ?? 0) + lean.pitch;
  // En vertical, menos: el iris se esconde enseguida bajo el párpado.
  return [clamp(-yaw + glance[0], -GAZE_MAX, GAZE_MAX), clamp(-GAZE_PITCH * pitch + glance[1], -GAZE_PITCH_MAX, GAZE_PITCH_MAX)];
}
