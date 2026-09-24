import type { CustomSign } from "@/lib/esku/domain/recognition/entities/CustomSign";
import { similarity } from "@/lib/esku/domain/recognition/services/windowSignature";

/** El mismo suelo que `PrototypeSignClassifier` (MIN_SIMILARITY en lib/esku). */
export const TAUGHT_MIN_SIMILARITY = 0.86;

export type SignReliability = {
  id: string;
  text: string;
  /** Tomas que se reconocerían como este signo si se hicieran de nuevo. */
  recognized: number;
  total: number;
  /** El signo enseñado con el que más se confunde, si alguna toma se le parece más. */
  confusedWith: string | null;
};

/**
 * Cuánto acierta cada signo enseñado con las propias tomas del usuario: cada toma se quita
 * de su signo y se clasifica contra todo lo demás (leave-one-out). Es la única medida de
 * acierto posible sin un corpus: la dan los mismos ejemplos, sin grabar nada más.
 */
export function measureReliability(signs: readonly CustomSign[]): SignReliability[] {
  return signs.map((sign) => {
    let recognized = 0;
    const rivals = new Map<string, number>();
    sign.prototypes.forEach((take, i) => {
      let own = 0;
      sign.prototypes.forEach((other, j) => {
        if (j !== i) own = Math.max(own, similarity(take, other));
      });
      let rival: { text: string; score: number } | null = null;
      for (const other of signs) {
        if (other.id === sign.id) continue;
        for (const p of other.prototypes) {
          const score = similarity(take, p);
          if (!rival || score > rival.score) rival = { text: other.text, score };
        }
      }
      const wins = own >= TAUGHT_MIN_SIMILARITY && (!rival || own > rival.score);
      if (wins) recognized += 1;
      else if (rival && rival.score >= own) rivals.set(rival.text, (rivals.get(rival.text) ?? 0) + 1);
    });
    const confusedWith = [...rivals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { id: sign.id, text: sign.text, recognized, total: sign.prototypes.length, confusedWith };
  });
}

export const normalizeWord = (w: string) =>
  w
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export type SequenceScore = {
  hits: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  target: number;
};

/**
 * Compara lo que había que signar con lo que se escribió, palabra a palabra, con la
 * alineación de mínima edición (la métrica habitual en reconocimiento continuo: WER).
 */
export function scoreSequence(target: readonly string[], written: readonly string[]): SequenceScore {
  const a = target.map(normalizeWord);
  const b = written.map(normalizeWord);
  const n = a.length;
  const m = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i]![j] = Math.min(
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
      );
    }
  }
  const score: SequenceScore = { hits: 0, substitutions: 0, deletions: 0, insertions: 0, target: n };
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] === b[j - 1]) score.hits += 1;
      else score.substitutions += 1;
      i -= 1;
      j -= 1;
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) {
      score.deletions += 1;
      i -= 1;
    } else {
      score.insertions += 1;
      j -= 1;
    }
  }
  return score;
}
