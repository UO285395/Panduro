import { euclidean } from "./features";

export type Template = {
  label: string;
  features: number[];
};

export type Prediction = {
  label: string;
  /** Score normalizado en [0,1]: fracción del voto ganador entre el total. */
  confidence: number;
  /** Distancia mediana de los vecinos ganadores (más pequeña = mejor). */
  distance: number;
};

/** Confianza mínima para reportar una predicción; por debajo se devuelve null. */
export const REJECT_THRESHOLD = 0.30;

/**
 * Clasificador k-NN con voto ponderado por 1/(d+ε).
 *
 * Diseñado para signos estáticos (configuraciones de mano), donde el vector
 * de features son 21 landmarks normalizados (63 dimensiones).
 */
export class KnnClassifier {
  private readonly templates: Template[];
  readonly k: number;

  constructor(templates: Template[], k = 5) {
    this.templates = templates;
    this.k = k;
  }

  /** Devuelve las etiquetas distintas con plantillas cargadas. */
  labels(): string[] {
    const s = new Set<string>();
    for (const t of this.templates) s.add(t.label);
    return [...s];
  }

  /** Nº de plantillas cargadas para una etiqueta. 0 si no hay ninguna. */
  countFor(label: string): number {
    let n = 0;
    for (const t of this.templates) if (t.label === label) n++;
    return n;
  }

  /**
   * Predice la etiqueta más probable para el vector `features`.
   * Devuelve null si no hay plantillas cargadas.
   */
  predict(features: number[]): Prediction | null {
    const top = this.predictTopN(features, 1);
    return top[0] ?? null;
  }

  /** Devuelve los N mejores candidatos (por confianza decreciente), filtrados por REJECT_THRESHOLD. */
  predictTopN(features: number[], n = 3): Prediction[] {
    if (this.templates.length === 0) return [];
    const dists: { label: string; d: number }[] = new Array(this.templates.length);
    for (let i = 0; i < this.templates.length; i++) {
      const t = this.templates[i]!;
      dists[i] = { label: t.label, d: euclidean(features, t.features) };
    }
    dists.sort((a, b) => a.d - b.d);

    const kEff = Math.min(this.k, dists.length);
    const top = dists.slice(0, kEff);

    const eps = 1e-6;
    const votes = new Map<string, number>();
    let total = 0;
    for (const { label, d } of top) {
      const w = 1 / (d + eps);
      votes.set(label, (votes.get(label) ?? 0) + w);
      total += w;
    }

    const results: Prediction[] = [];
    for (const [label, score] of votes) {
      const confidence = total > 0 ? score / total : 0;
      if (confidence < REJECT_THRESHOLD) continue;
      const winners = top.filter((t) => t.label === label);
      const meds = medianOfNumbers(winners.map((w) => w.d));
      results.push({ label, confidence, distance: meds });
    }
    results.sort((a, b) => b.confidence - a.confidence);
    return results.slice(0, n);
  }
}

/**
 * Quita las plantillas de otras etiquetas cuya configuración de mano coincide
 * con alguna de `label`. Muchos signos comparten forma (difieren en lugar o
 * movimiento) y un k-NN estático no puede separarlos: sin este filtro el
 * empate lo gana una etiqueta arbitraria y el objetivo nunca se reconoce.
 * `eps` (0.1) queda por debajo de la dispersión entre las propias plantillas
 * de un signo (~0.17): más cerca que eso no se distingue de forma fiable.
 */
export function withoutSameHandshape(
  templates: Template[],
  label: string,
  eps = 0.1,
): Template[] {
  const target = templates.filter((t) => t.label === label);
  return templates.filter(
    (t) =>
      t.label === label ||
      !target.some((x) => euclidean(x.features, t.features) < eps),
  );
}

function medianOfNumbers(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[m - 1]! + sorted[m]!) / 2
    : sorted[m]!;
}
