/**
 * Poses de la mascota: una mano que saluda en reposo, pone el pulgar hacia arriba al
 * acertar y hacia abajo al fallar. Funciones puras (sin three.js) para poder probarlas.
 *
 * Ángulos en radianes. La mano parte del puño con el pulgar arriba y la palma hacia la
 * cámara; `tilt` la gira en el plano de la pantalla (−π/2: dedos hacia arriba, para
 * saludar) y `roll` alrededor del antebrazo (π: pulgar hacia abajo, se ve el dorso).
 */

export type HandMood = "idle" | "correct" | "incorrect" | "celebrate";

export type HandPose = {
  /** Giro en el plano de la pantalla. */
  tilt: number;
  /** Giro alrededor del antebrazo. */
  roll: number;
  /** Cierre de los cuatro dedos largos: 0 abiertos, 1 puño. */
  curl: number;
  /** 0 pulgar relajado, 1 estirado a lo largo del puño. */
  thumb: number;
  /** Desplazamiento vertical, en altos de la mano. */
  y: number;
  /** Balanceo añadido a `tilt` (saludo, sacudida). */
  sway: number;
  /** Giro sobre el eje vertical (vuelta de la celebración). */
  spin: number;
};

/** Lo que dura el gesto de cada reacción; después la mano se queda quieta en la pose. */
export const REACTION_MS: Record<HandMood, number> = {
  idle: 0,
  correct: 900,
  incorrect: 900,
  celebrate: 1600,
};

const ease = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

/** Bote de altura `h` entre u0 y u1 (fracción del gesto). */
function hop(u: number, u0: number, u1: number, h: number): number {
  if (u <= u0 || u >= u1) return 0;
  const k = (u - u0) / (u1 - u0);
  return h * 4 * k * (1 - k);
}

const OPEN = { tilt: -Math.PI / 2, roll: 0, curl: 0.12, thumb: 0 };
const UP = { tilt: 0, roll: 0, curl: 1, thumb: 1 };
const DOWN = { tilt: 0, roll: Math.PI, curl: 1, thumb: 1 };

/**
 * Pose objetivo para un estado, `sinceMs` después de entrar en él (`clockMs` es el reloj
 * de la página, para el vaivén del reposo). El componente suaviza el paso entre poses.
 */
export function handPose(mood: HandMood, sinceMs: number, clockMs: number, still = false): HandPose {
  const s = clockMs / 1000;
  const breathe = still ? 0 : 0.01 * Math.sin(s * 2.2);
  const u = REACTION_MS[mood] ? clamp01(sinceMs / REACTION_MS[mood]) : 1;
  const moving = still ? 0 : 1;

  if (mood === "idle") {
    // Un «hola» tranquilo: la mano abierta se mece de lado a lado.
    return { ...OPEN, y: breathe, sway: moving * 0.09 * Math.sin(s * 1.6), spin: 0 };
  }
  if (mood === "correct") {
    // Sube de un bote y da un par de «toques» con el pulgar.
    const pump = moving * 0.16 * Math.sin(u * Math.PI * 4) * (1 - ease(u));
    return { ...UP, y: breathe + moving * hop(u, 0.05, 0.45, 0.12), sway: pump, spin: 0 };
  }
  if (mood === "incorrect") {
    // Baja un poco y niega con una sacudida que se apaga.
    const shake = moving * 0.18 * Math.sin(u * Math.PI * 6) * (1 - ease(u));
    return { ...DOWN, y: breathe - moving * 0.05 * ease(clamp01(u / 0.3)), sway: shake, spin: 0 };
  }
  // Celebración: dos botes y una vuelta completa con el pulgar arriba.
  return {
    ...UP,
    y: breathe + moving * (hop(u, 0.04, 0.4, 0.16) + hop(u, 0.48, 0.78, 0.1)),
    sway: moving * 0.1 * Math.sin(u * Math.PI * 5) * (1 - ease(u)),
    spin: moving * 2 * Math.PI * ease(clamp01((u - 0.04) / 0.4)),
  };
}

/**
 * Acerca `from` a `to` con una constante de tiempo `tauMs` (independiente de los fps).
 * Solo para los parámetros que definen la pose; el vaivén y los botes van sin suavizar.
 */
export function approach(from: number, to: number, dtMs: number, tauMs: number): number {
  return to + (from - to) * Math.exp(-dtMs / tauMs);
}
