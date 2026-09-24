/**
 * Movimiento de la mascota cuando es un modelo 3D descargado (sin rig conocido): se anima
 * el modelo entero, en unidades de su propia altura (1 = alto del modelo).
 */

export type MascotMood = "idle" | "correct" | "incorrect" | "celebrate";

export type MascotPose = {
  /** Desplazamiento vertical. */
  y: number;
  /** Giros (rad): sobre sí mismo, cabeceo adelante/atrás y balanceo lateral. */
  rotY: number;
  rotX: number;
  rotZ: number;
  /** Aplastamiento al despegar y aterrizar (1 = normal). */
  squash: number;
};

/** Cuánto dura cada reacción antes de volver al reposo (ms). */
export const MOOD_MS: Record<MascotMood, number> = {
  idle: 0,
  correct: 900,
  incorrect: 1000,
  celebrate: 1500,
};

const ease = (u: number) => u * u * (3 - 2 * u);

function idle(tMs: number): MascotPose {
  const s = tMs / 1000;
  return {
    y: 0.012 * Math.sin(s * 2.6),
    rotY: 0.18 * Math.sin(s * 0.7),
    rotX: 0.03 * Math.sin(s * 1.3),
    rotZ: 0.035 * Math.sin(s * 1.1),
    squash: 1 + 0.012 * Math.sin(s * 2.6),
  };
}

/** Salto parabólico de altura `h` entre u0 y u1 (fracción de la reacción). */
function hop(u: number, u0: number, u1: number, h: number): { y: number; squash: number } {
  if (u < u0 - 0.06 || u > u1 + 0.08) return { y: 0, squash: 1 };
  if (u < u0) return { y: 0, squash: 1 - 0.12 * ease((u - (u0 - 0.06)) / 0.06) }; // se agacha
  if (u > u1) return { y: 0, squash: 1 - 0.1 * Math.sin((Math.PI * (u - u1)) / 0.08) }; // aterriza
  const k = (u - u0) / (u1 - u0);
  return { y: h * 4 * k * (1 - k), squash: 1 + 0.06 * Math.sin(Math.PI * k) };
}

export function mascotPose(mood: MascotMood, sinceMoodMs: number, clockMs: number): MascotPose {
  const base = idle(clockMs);
  const total = MOOD_MS[mood];
  if (mood === "idle" || sinceMoodMs >= total) return base;
  const u = sinceMoodMs / total;
  // La reacción se funde con el reposo al final para no dar un tirón.
  const w = u < 0.85 ? 1 : 1 - ease((u - 0.85) / 0.15);
  const mix = (a: number, b: number) => a * (1 - w) + b * w;

  if (mood === "correct") {
    const j = hop(u, 0.1, 0.55, 0.22);
    return {
      y: mix(base.y, j.y),
      rotY: mix(base.rotY, 0),
      rotX: mix(base.rotX, -0.15 * Math.sin(Math.PI * Math.min(1, u / 0.6))),
      rotZ: mix(base.rotZ, 0.12 * Math.sin(u * Math.PI * 4) * (1 - u)),
      squash: mix(base.squash, j.squash),
    };
  }
  if (mood === "incorrect") {
    return {
      y: mix(base.y, -0.03 * ease(Math.min(1, u / 0.3))),
      rotY: mix(base.rotY, 0.45 * Math.sin(u * Math.PI * 6) * (1 - u)),
      rotX: mix(base.rotX, 0.18 * ease(Math.min(1, u / 0.3))),
      rotZ: mix(base.rotZ, 0),
      squash: mix(base.squash, 0.96),
    };
  }
  const a = hop(u, 0.08, 0.4, 0.28);
  const b = hop(u, 0.5, 0.8, 0.2);
  return {
    y: mix(base.y, a.y + b.y),
    rotY: mix(base.rotY, 2 * Math.PI * ease(Math.min(1, Math.max(0, (u - 0.08) / 0.32)))),
    rotX: mix(base.rotX, 0),
    rotZ: mix(base.rotZ, 0.15 * Math.sin(u * Math.PI * 5) * (1 - u)),
    squash: mix(base.squash, a.squash * b.squash),
  };
}

/** Nombre de animación del propio modelo que mejor encaja con cada estado, si trae alguna. */
const CLIP_HINTS: Record<MascotMood, RegExp> = {
  idle: /idle|breath|stand|rest|loop/i,
  correct: /yes|happy|thumb|wave|clap|good|win/i,
  incorrect: /no|sad|shake|fail|wrong|angry/i,
  celebrate: /dance|celebr|jump|party|victory|run|walk/i,
};

export function pickClip<T extends { name: string }>(clips: readonly T[], mood: MascotMood): T | null {
  return clips.find((c) => CLIP_HINTS[mood].test(c.name)) ?? clips.find((c) => CLIP_HINTS.idle.test(c.name)) ?? clips[0] ?? null;
}
