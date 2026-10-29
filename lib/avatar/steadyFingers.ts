import type { AvatarClip, AvatarKeyframe } from "@/lib/curriculum/schema";

/**
 * Quita el temblor de los dedos grabados. MediaPipe mide cada fotograma por separado y los
 * ángulos de los dedos van y vuelven de un fotograma al siguiente (cada ~100 ms): el 10 % de
 * las medidas, 20° o más, y algunas veces toda la mano «se abre» un solo fotograma (ESPERAR a
 * los 200 ms). En el avatar se veía como dedos que tiemblan o saltan.
 *
 * Primero una mediana de tres fotogramas, que quita esos picos sueltos sin borrar un cambio de
 * forma que dura dos o más (abrir y cerrar la mano de CONFERENCIA, cada ~400 ms); luego una
 * media gaussiana corta en el tiempo. Solo toca lo medido (los dedos como [azimut, elevación,
 * flexión] y el pulgar: dónde va su yema y a quién toca); los dedos escritos a mano, no.
 */

/** Anchura de la media gaussiana (ms): con fotogramas cada 100 ms, cada vecino pesa ~0,2. */
export const STEADY_SIGMA_MS = 70;
/** Dos fotogramas más separados que esto no se tratan como vecinos para la mediana (ms). */
const NEIGHBOR_MS = 160;

type Series = (number | null)[];

const median3 = (a: number, b: number, c: number) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

/** Mediana de tres y media gaussiana de una serie con huecos (null), en los instantes `t`. */
export function steadySeries(values: Series, t: number[]): Series {
  const n = values.length;
  const despiked = values.slice();
  for (let k = 1; k < n - 1; k++) {
    const [a, b, c] = [values[k - 1], values[k], values[k + 1]];
    if (a == null || b == null || c == null) continue;
    if (t[k]! - t[k - 1]! > NEIGHBOR_MS || t[k + 1]! - t[k]! > NEIGHBOR_MS) continue;
    despiked[k] = median3(a, b, c);
  }
  const reach = 2.5 * STEADY_SIGMA_MS;
  return despiked.map((v, k) => {
    if (v == null) return null;
    let sum = 0;
    let wsum = 0;
    for (let j = k; j >= 0 && t[k]! - t[j]! <= reach; j--) {
      const x = despiked[j];
      if (x == null) continue;
      const w = Math.exp(-0.5 * ((t[k]! - t[j]!) / STEADY_SIGMA_MS) ** 2);
      sum += w * x;
      wsum += w;
    }
    for (let j = k + 1; j < n && t[j]! - t[k]! <= reach; j++) {
      const x = despiked[j];
      if (x == null) continue;
      const w = Math.exp(-0.5 * ((t[j]! - t[k]!) / STEADY_SIGMA_MS) ** 2);
      sum += w * x;
      wsum += w;
    }
    return sum / wsum;
  });
}

type Fingers = AvatarKeyframe["fingers"];
type Vec3 = [number, number, number];

const round = (x: number) => Math.round(x * 1000) / 1000;

/** Cada componente de cada dedo medido, suavizado a lo largo del clip. */
function steadyHand(frames: (Fingers | undefined)[], t: number[]): (Fingers | undefined)[] {
  const out = frames.map((f) => (f ? [...f] : undefined)) as (Fingers | undefined)[];
  for (let i = 0; i < 5; i++) {
    for (let c = 0; c < 3; c++) {
      const series = frames.map((f) => {
        const v = f?.[i];
        return Array.isArray(v) ? v[c]! : null;
      });
      if (series.filter((v) => v != null).length < 3) continue;
      const smooth = steadySeries(series, t);
      smooth.forEach((v, k) => {
        const f = out[k];
        const cur = f?.[i];
        if (v == null || !f || !Array.isArray(cur)) return;
        const next = [...cur] as Vec3;
        next[c] = round(v);
        f[i] = next;
      });
    }
  }
  return out;
}

/** Vectores o pesos del pulgar (thumbTip, thumbTouch), componente a componente. */
function steadyVectors<V extends number[]>(frames: (V | undefined)[], t: number[]): (V | undefined)[] {
  const len = frames.find((f) => f)?.length ?? 0;
  const out = frames.map((f) => (f ? ([...f] as V) : undefined));
  for (let c = 0; c < len; c++) {
    const smooth = steadySeries(frames.map((f) => f?.[c] ?? null), t);
    smooth.forEach((v, k) => {
      if (v != null && out[k]) out[k]![c] = round(v);
    });
  }
  return out;
}

export function steadyFingers(clip: AvatarClip): AvatarClip {
  const kfs = clip.keyframes;
  if (kfs.length < 3) return clip;
  const t = kfs.map((k) => k.t);
  const fingers = steadyHand(kfs.map((k) => k.fingers), t);
  const fingers2 = steadyHand(kfs.map((k) => k.fingers2), t);
  const thumbTip = steadyVectors(kfs.map((k) => k.thumbTip), t);
  const thumbTip2 = steadyVectors(kfs.map((k) => k.thumbTip2), t);
  const thumbTouch = steadyVectors(kfs.map((k) => k.thumbTouch), t);
  const thumbTouch2 = steadyVectors(kfs.map((k) => k.thumbTouch2), t);
  return {
    ...clip,
    keyframes: kfs.map((k, i) => ({
      ...k,
      fingers: fingers[i]!,
      ...(k.fingers2 ? { fingers2: fingers2[i] } : {}),
      ...(k.thumbTip ? { thumbTip: thumbTip[i] } : {}),
      ...(k.thumbTip2 ? { thumbTip2: thumbTip2[i] } : {}),
      ...(k.thumbTouch ? { thumbTouch: thumbTouch[i] } : {}),
      ...(k.thumbTouch2 ? { thumbTouch2: thumbTouch2[i] } : {}),
    })),
  };
}
