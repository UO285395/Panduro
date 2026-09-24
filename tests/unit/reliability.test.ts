import { describe, expect, it } from "vitest";
import type { CustomSign } from "@/lib/esku/domain/recognition/entities/CustomSign";
import { SIGNATURE_LENGTH } from "@/lib/esku/domain/recognition/services/windowSignature";
import { measureReliability, scoreSequence } from "@/lib/recognition/reliability";

/** Prototipo alrededor de un patrón base, con un poco de variación por toma. */
function take(base: number, jitter: number): Float32Array {
  const v = new Float32Array(SIGNATURE_LENGTH);
  for (let i = 0; i < v.length; i++) v[i] = Math.sin(i * 0.01 * base) + jitter * Math.cos(i * 0.37);
  return v;
}

const sign = (id: string, base: number, jitters: number[]): CustomSign => ({
  id,
  text: id,
  prototypes: jitters.map((j) => take(base, j)),
  createdAtMs: 0,
});

describe("measureReliability", () => {
  it("un signo con tomas coherentes y distinto de los demás acierta todas", () => {
    const [hola, gracias] = measureReliability([sign("hola", 1, [0, 0.02, 0.04]), sign("gracias", 7, [0, 0.03, 0.05])]);
    expect(hola).toMatchObject({ recognized: 3, total: 3, confusedWith: null });
    expect(gracias!.recognized).toBe(3);
  });

  it("detecta con qué otro signo se confunde", () => {
    const signs = [sign("madre", 3, [0, 0.9, 1.8]), sign("padre", 3, [0.45, 1.35])];
    const [madre] = measureReliability(signs);
    expect(madre!.recognized).toBeLessThan(3);
    expect(madre!.confusedWith).toBe("padre");
  });
});

describe("scoreSequence", () => {
  it("cuenta aciertos, cambios, olvidos y palabras de más (sin tildes ni mayúsculas)", () => {
    expect(scoreSequence(["Hola", "Gracias", "Agua"], ["hola", "agua"])).toMatchObject({ hits: 2, deletions: 1 });
    expect(scoreSequence(["hola", "gracias"], ["hola", "casa", "gracias"])).toMatchObject({ hits: 2, insertions: 1 });
    expect(scoreSequence(["cafe"], ["Café"])).toMatchObject({ hits: 1 });
    expect(scoreSequence(["hola", "agua"], ["hola", "sano"])).toMatchObject({ hits: 1, substitutions: 1 });
  });
});
