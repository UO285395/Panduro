import type { AvatarClip, AvatarKeyframe, HandSpec } from "@/lib/curriculum/schema";

/**
 * Frases del curso que se signan como una secuencia de signos grabados (su glosa):
 * «¿Puede repetir?» es PODER + REPETIR. El diccionario no las tiene como entrada propia.
 */
export const PHRASES: Record<string, string[]> = {
  GRACIAS_MUCHO: ["GRACIAS", "MUCHO"],
  PUEDE_REPETIR: ["PODER", "REPETIR"],
  VER_TV: ["VER", "TELEVISION"],
};

/** Pausa entre un signo y el siguiente de una frase (ms de clip). */
export const PHRASE_GAP_MS = 200;

/**
 * Desde qué parte de su recorrido en altura la mano está signando y no subiendo desde el
 * reposo o volviendo a él.
 */
const ACTIVE_FRACTION = 0.4;

/**
 * La mano pasiva en reposo, como la deja el avatar en los signos a una mano (`idleGoal` del
 * mapper: el brazo caído junto al cuerpo, algo por delante, con la palma hacia el muslo),
 * expresada en el espacio de signado del modelo. Los vídeos del DILSE empiezan con las manos
 * ya subiendo: la pose más baja de la pasiva en un signo es la del arranque, a media altura y
 * con la forma de mano del signo (VER_TV la llevaba a la tripa con la de TELEVISION).
 */
const PASSIVE_REST: HandSpec = { x: 0.1, y: -0.25, z: -0.52, rot: [0, 0, 0], palmDir: [1, 0, 0], elbowDir: [-0.29, 0, -0.96] };
const RELAXED: AvatarKeyframe["fingers"] = [0.15, 0.15, 0.15, 0.15, 0.15];

/** Primer y último keyframe de cada signo con la mano arriba. */
function activeRange(keyframes: AvatarKeyframe[]): [number, number] {
  const ys = keyframes.map((k) => k.hand.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const up = (k: AvatarKeyframe) => k.hand.y >= lo + ACTIVE_FRACTION * (hi - lo);
  return [keyframes.findIndex(up), keyframes.length - 1 - [...keyframes].reverse().findIndex(up)];
}

/**
 * Los signos seguidos, como los signa una persona: sin volver al reposo entre uno y otro (del
 * primero se quita la bajada y del último la subida; de los de en medio, las dos) y con una
 * pausa corta. Si alguno es a una mano y otro a dos, en los de una la pasiva descansa como en
 * cualquier signo a una mano.
 */
export function composeClips(parts: AvatarClip[], gapMs = PHRASE_GAP_MS): AvatarClip {
  const all = parts.flatMap((p) => p.keyframes);
  const twoHands = all.some((k) => k.hand2);
  const withHead = all.some((k) => k.head);
  const keyframes: AvatarKeyframe[] = [];
  let end = 0;
  parts.forEach((clip, i) => {
    const [a, b] = activeRange(clip.keyframes);
    const from = i === 0 ? 0 : a;
    const to = i === parts.length - 1 ? clip.keyframes.length - 1 : b;
    const slice = clip.keyframes.slice(from, to + 1);
    const t0 = slice[0]!.t;
    const start = i === 0 ? 0 : end + gapMs;
    for (const k of slice) {
      const kf: AvatarKeyframe = { ...k, t: Math.round(start + k.t - t0) };
      if (twoHands && !kf.hand2) {
        kf.hand2 = PASSIVE_REST;
        kf.fingers2 = RELAXED;
      }
      if (withHead && !kf.head) kf.head = [0, 0, 0];
      keyframes.push(kf);
    }
    end = keyframes[keyframes.length - 1]!.t;
  });
  const shoulders = parts.map((p) => p.shoulderX).filter((x): x is number => x !== undefined);
  const yaws = parts.map((p) => p.bodyYaw ?? 0);
  // El cuerpo girado solo si lo está igual en todos (el giro es de todo el clip).
  const yaw = Math.max(...yaws) - Math.min(...yaws) < 0.15 ? yaws.reduce((s, y) => s + y, 0) / yaws.length : 0;
  return {
    handedness: twoHands ? "two" : "one",
    duration: Math.max(200, Math.min(6000, end)),
    keyframes,
    ...(shoulders.length ? { shoulderX: Math.round((shoulders.reduce((s, x) => s + x, 0) / shoulders.length) * 100) / 100 } : {}),
    ...(yaw ? { bodyYaw: Math.round(yaw * 100) / 100 } : {}),
  };
}
