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
    if (this.templates.length === 0) return null;
    const dists: { label: string; d: number }[] = new Array(this.templates.length);
    for (let i = 0; i < this.templates.length; i++) {
      const t = this.templates[i]!;
      dists[i] = { label: t.label, d: euclidean(features, t.features) };
    }
    dists.sort((a, b) => a.d - b.d);

    const kEff = Math.min(this.k, dists.length);
    const top = dists.slice(0, kEff);

    // Voto ponderado 1/(d+eps)
    const eps = 1e-6;
    const votes = new Map<string, number>();
    let total = 0;
    for (const { label, d } of top) {
      const w = 1 / (d + eps);
      votes.set(label, (votes.get(label) ?? 0) + w);
      total += w;
    }

    let bestLabel = top[0]!.label;
    let bestScore = -Infinity;
    for (const [label, score] of votes) {
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }

    const winners = top.filter((t) => t.label === bestLabel);
    const meds = medianOfNumbers(winners.map((w) => w.d));

    return {
      label: bestLabel,
      confidence: total > 0 ? bestScore / total : 0,
      distance: meds,
    };
  }
}

function medianOfNumbers(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[m - 1]! + sorted[m]!) / 2
    : sorted[m]!;
}
