/**
 * La mascota: una mano de dibujo que flota con su puño de sudadera. En reposo saluda de vez
 * en cuando, levanta el pulgar al acertar, lo baja al fallar y, al terminar la lección, salta
 * y aplaude como se aplaude en lengua de signos: la mano en alto, abierta, girando la muñeca.
 *
 * Aquí está el movimiento, sin three.js, para poder probarlo: `handTarget` dice a dónde va
 * cada parte de la mano en cada instante (con su anticipación, sus botes y sus dedos uno
 * detrás de otro) y `stepHand` la lleva hasta allí con muelles, que son los que le dan el
 * rebote y hacen que un gesto se pueda cortar con otro sin saltos.
 */

export type HandMood = "idle" | "correct" | "incorrect" | "celebrate";

/**
 * Lo que se mueve. Ángulos en radianes; distancias, en altos de la mano.
 * - tilt: giro en el plano de la pantalla. −π/2, los dedos hacia arriba (el brazo viene de
 *   abajo); 0, el pulgar arriba (el brazo, de la derecha); −π, el pulgar abajo (de la izquierda).
 * - roll: giro alrededor del antebrazo (el aplauso). spin: vuelta sobre el eje vertical.
 * - x, y, z: desplazamiento (z, hacia quien mira). sway y bob: vaivén añadido a tilt y a y.
 * - wrist: la mano respecto al puño de la manga, en el plano de la palma.
 * - index…pinky: cierre de cada dedo (0 abierto, 1 puño). spread: dedos en abanico (0 a 1).
 * - thumb: 0 relajado junto a la mano abierta, 1 estirado (pulgar arriba).
 * - squash: achatada (>0) o estirada (<0) en vertical, con el volumen de siempre.
 */
export const CHANNELS = [
  "tilt", "roll", "spin", "x", "y", "z", "sway", "bob", "wrist",
  "index", "middle", "ring", "pinky", "spread", "thumb", "squash",
] as const;
export type Channel = (typeof CHANNELS)[number];
export type HandPose = Record<Channel, number>;

const TAU = 2 * Math.PI;
const UPRIGHT = -Math.PI / 2;
const THUMB_UP = 0.08;
const THUMB_DOWN = -Math.PI - 0.06;

/** En reposo saluda cada tanto; al montarse, enseguida (ver `IDLE_GREETING_MS`). */
const IDLE_CYCLE_MS = 9000;
const WAVE = { from: 4000, to: 5900, hz: 2.1 };
const FINGER_ROLL = { from: 7500, each: 110, lasts: 480 };
/** Con esta ventaja sobre el reloj del reposo, el saludo empieza 300 ms después. */
export const IDLE_GREETING_MS = WAVE.from - 300;

/** Lo que tarda en cerrarse cada dedo detrás del anterior, empezando por el meñique (ms). */
const FINGER_STAGGER_MS = 22;
/** La celebración se repite: salto con vuelta, aplauso y pulgar arriba. */
/** El salto sale de algo más abajo, para que quepa en el encuadre. */
const JUMP_FROM = -0.1;
const CELEBRATE = { crouch: 140, jump: 620, applauseFrom: 1000, applause: 1700, loop: 5600, hz: 4.2 };

const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const smooth = (u: number) => {
  const c = clamp01(u);
  return c * c * (3 - 2 * c);
};
/** Sube de 0 a 1 en `edge` desde `a` y vuelve a bajar hasta `b`. */
const bump = (t: number, a: number, b: number, edge: number) => smooth((t - a) / edge) * smooth((b - t) / edge);
/** Un bote de altura `h` entre `a` y `b`. */
function hop(t: number, a: number, b: number, h: number): number {
  if (t <= a || t >= b) return 0;
  const k = (t - a) / (b - a);
  return h * 4 * k * (1 - k);
}

/** La mano abierta y relajada: cada dedo algo más doblado que el anterior. */
const OPEN: HandPose = {
  tilt: UPRIGHT, roll: 0, spin: 0, x: 0, y: 0, z: 0, sway: 0, bob: 0, wrist: 0,
  index: 0.05, middle: 0.07, ring: 0.1, pinky: 0.14, spread: 0.25, thumb: 0, squash: 0,
};

/** Los cuatro dedos cerrándose desde el meñique, `t` ms después de empezar. */
function fist(t: number, still: boolean): Pick<HandPose, "index" | "middle" | "ring" | "pinky" | "spread"> {
  const at = (order: number, open: number) => (still || t >= order * FINGER_STAGGER_MS ? 1 : open);
  return { pinky: at(0, OPEN.pinky), ring: at(1, OPEN.ring), middle: at(2, OPEN.middle), index: at(3, OPEN.index), spread: 0 };
}

/**
 * A dónde va la mano en el estado `mood`, `sinceMs` después de entrar en él. `clockMs` es el
 * reloj de la página, para la respiración. Con `still` (movimiento reducido) solo cambia de
 * postura: ni botes, ni vaivenes, ni vueltas.
 */
export function handTarget(mood: HandMood, sinceMs: number, clockMs: number, still = false): HandPose {
  const t = Math.max(0, sinceMs);
  const move = still ? 0 : 1;
  const breathe = move * 0.012 * Math.sin((clockMs / 1000) * 2);

  if (mood === "idle") {
    const p = t % IDLE_CYCLE_MS;
    const wave = move * bump(p, WAVE.from, WAVE.to, 300);
    const beat = TAU * WAVE.hz * ((p - WAVE.from) / 1000);
    // Un dedo detrás de otro, como quien tamborilea.
    const roll = (order: number) =>
      move * 0.5 * bump(p, FINGER_ROLL.from + order * FINGER_ROLL.each, FINGER_ROLL.from + order * FINGER_ROLL.each + FINGER_ROLL.lasts, 160);
    return {
      ...OPEN,
      bob: breathe,
      // El antebrazo se mece y la mano lo sigue con retraso, con los dedos más abiertos.
      sway: move * (0.03 * Math.sin((clockMs / 1000) * 0.9) + 0.15 * wave * Math.sin(beat)),
      wrist: 0.3 * wave * Math.sin(beat - 1.1),
      spread: OPEN.spread + 0.6 * wave,
      pinky: OPEN.pinky + roll(0),
      ring: OPEN.ring + roll(1),
      middle: OPEN.middle + roll(2),
      index: OPEN.index + roll(3),
    };
  }

  if (mood === "correct") {
    // Coge impulso (se encoge y gira un poco al revés), sale hacia quien mira y saca el pulgar
    // lo último; dos toques con el pulgar y se queda, con un botecito de vez en cuando.
    const windup = !still && t < 110;
    const later = t > 1400 ? hop((t - 1400) % 2600, 0, 320, 0.03) : 0;
    return {
      ...OPEN,
      ...fist(t, still),
      tilt: windup ? UPRIGHT - 0.2 : THUMB_UP,
      thumb: still || t >= 190 ? 1 : 0,
      z: windup ? -0.04 : move * (t < 700 ? 0.1 : 0.05),
      squash: windup ? 0.14 : move * (t < 260 ? -0.05 : 0),
      bob: breathe + move * (windup ? -0.05 : hop(t, 110, 430, 0.07) + hop(t, 520, 720, 0.045) + hop(t, 770, 940, 0.03) + later),
      sway: move * 0.09 * bump(t, 480, 980, 120) * Math.sin(TAU * 4 * ((t - 480) / 1000)),
    };
  }

  if (mood === "incorrect") {
    // Sin dramatismo: se cierra, gira hacia el otro lado, se aparta un poco y niega despacio.
    const windup = !still && t < 120;
    return {
      ...OPEN,
      ...fist(t, still),
      tilt: windup ? UPRIGHT + 0.16 : THUMB_DOWN,
      thumb: still || t >= 230 ? 1 : 0,
      // Con el pulgar hacia abajo la mano queda más baja: se sube para que siga centrada.
      y: 0.09,
      z: windup ? 0 : move * -0.06,
      squash: move * 0.06 * bump(t, 300, 620, 140),
      bob: breathe + move * (windup ? 0.03 : -0.05 * smooth((t - 120) / 400)),
      sway: move * (0.13 * bump(t, 380, 1300, 200) * Math.sin(TAU * 2.4 * ((t - 380) / 1000)) + 0.02 * Math.sin((clockMs / 1000) * 1.3)),
    };
  }

  // Celebración: salto con vuelta y pulgar arriba; luego, mientras siga la pantalla, aplauso
  // (la mano en alto, abierta, girando la muñeca) y pulgar arriba, una y otra vez.
  if (still) return { ...OPEN, ...fist(t, true), tilt: THUMB_UP, thumb: 1 };
  const c = CELEBRATE;
  if (t < c.crouch) {
    return { ...OPEN, ...fist(t, false), tilt: UPRIGHT - 0.2, y: JUMP_FROM, bob: -0.08, squash: 0.18 };
  }
  const spin = TAU * smooth((t - c.crouch) / (c.jump * 0.9));
  const landed = c.crouch + c.jump;
  if (t < c.applauseFrom) {
    return {
      ...OPEN,
      ...fist(t, false),
      spin,
      tilt: THUMB_UP,
      thumb: t >= c.crouch + 110 ? 1 : 0,
      y: JUMP_FROM,
      z: 0.06,
      squash: t < c.crouch + 200 ? -0.08 : 0.16 * bump(t, landed - 40, landed + 200, 90),
      bob: breathe + hop(t, c.crouch, landed, 0.2),
    };
  }
  const phase = (t - c.applauseFrom) % c.loop;
  if (phase < c.applause) {
    const e = bump(phase, 0, c.applause, 220);
    return {
      ...OPEN,
      spin,
      spread: 1,
      thumb: 0.1,
      index: 0,
      middle: 0,
      ring: 0,
      pinky: 0.03,
      z: 0.06,
      bob: breathe + 0.08 + 0.02 * Math.sin(TAU * 2.1 * (phase / 1000)),
      roll: 0.75 * e * Math.sin(TAU * c.hz * (phase / 1000)),
      sway: 0.05 * e * Math.sin(TAU * 1.05 * (phase / 1000)),
    };
  }
  const held = phase - c.applause;
  return {
    ...OPEN,
    ...fist(held, false),
    spin,
    tilt: THUMB_UP,
    thumb: held >= 150 ? 1 : 0,
    z: 0.05,
    bob: breathe + hop(held, 60, 380, 0.07) + (held > 900 ? hop((held - 900) % 1300, 0, 280, 0.03) : 0),
  };
}

/** Muelle de cada canal: frecuencia (Hz) y amortiguación (1, sin rebote). */
const SPRINGS: Record<Channel, readonly [number, number]> = {
  tilt: [2.5, 0.62],
  roll: [6, 0.8],
  spin: [7, 1],
  x: [3, 0.7],
  y: [3, 0.7],
  z: [3.2, 0.5],
  sway: [8, 1],
  bob: [7, 0.85],
  wrist: [3.4, 0.38],
  index: [5.5, 0.72],
  middle: [5.5, 0.72],
  ring: [5.5, 0.72],
  pinky: [5.5, 0.72],
  spread: [3.6, 0.5],
  thumb: [4.2, 0.4],
  squash: [4.5, 0.5],
};

/** Lo que se queda atrás la mano respecto a la manga cuando esta gira deprisa (s) y su tope (rad). */
const WRIST_DRAG = 0.05;
const WRIST_MAX = 0.5;
const SUBSTEP_MS = 4;
const MAX_STEP_MS = 64;

/** Dónde está y a qué velocidad va cada canal. */
export type HandState = { pos: HandPose; vel: HandPose };

/** La mano quieta en una pose. */
export function restAt(pose: HandPose): HandState {
  const vel = Object.fromEntries(CHANNELS.map((c) => [c, 0])) as HandPose;
  return { pos: { ...pose }, vel };
}

/**
 * Avanza `dtMs` hacia `target`. Cada canal es un muelle; la muñeca, además, se queda atrás
 * cuando la manga gira deprisa (y luego la alcanza, con su rebote). Con `still`, sin rebote.
 */
export function stepHand(state: HandState, target: HandPose, dtMs: number, still = false): void {
  const { pos, vel } = state;
  // La vuelta entera de la celebración no se deshace al cambiar de estado.
  pos.spin -= TAU * Math.round((pos.spin - target.spin) / TAU);
  let left = Math.min(MAX_STEP_MS, Math.max(0, dtMs));
  while (left > 1e-6) {
    const dt = Math.min(SUBSTEP_MS, left) / 1000;
    left -= SUBSTEP_MS;
    const drag = still ? 0 : Math.min(WRIST_MAX, Math.max(-WRIST_MAX, -WRIST_DRAG * (vel.tilt + vel.sway)));
    for (const c of CHANNELS) {
      const [hz, damping] = SPRINGS[c];
      const w = TAU * hz;
      const goal = c === "wrist" ? target.wrist + drag : target[c];
      vel[c] += (-w * w * (pos[c] - goal) - 2 * (still ? 1 : damping) * w * vel[c]) * dt;
      pos[c] += vel[c] * dt;
    }
  }
}
