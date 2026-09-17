import { describe, expect, it } from "vitest";
import {
  cardIdsForLesson,
  getAllCardIds,
  labelForCard,
  letterCardId,
  signCardId,
} from "@/lib/srs/scheduler";
import { getLesson } from "@/lib/curriculum/loader";

describe("scheduler.cardIdsForLesson", () => {
  it("recoge signos referenciados por múltiples ejercicios sin duplicar", () => {
    const l = getLesson("a1.u1.l1")!;
    const cards = cardIdsForLesson(l);
    // Todos son signos
    expect(cards.every((c) => c.startsWith("sign:"))).toBe(true);
    // No hay duplicados
    expect(new Set(cards).size).toBe(cards.length);
    // Al menos los que declara la lección
    expect(cards).toContain(signCardId("HOLA"));
    expect(cards).toContain(signCardId("ADIOS"));
  });

  it("una lección de dactilología produce cards letter:*", () => {
    const l = getLesson("a1.u2.l1")!;
    const cards = cardIdsForLesson(l);
    for (const letter of ["A", "E", "I", "O", "U"]) {
      expect(cards).toContain(letterCardId(letter));
    }
  });
});

describe("scheduler.getAllCardIds", () => {
  it("hay al menos 15 signos y 10 letras únicas en el currículo A1", () => {
    const all = getAllCardIds();
    const signs = all.filter((c) => c.startsWith("sign:"));
    const letters = all.filter((c) => c.startsWith("letter:"));
    expect(signs.length).toBeGreaterThanOrEqual(15);
    expect(letters.length).toBeGreaterThanOrEqual(10);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("labelForCard", () => {
  it("strips prefixes", () => {
    expect(labelForCard("sign:HOLA")).toBe("HOLA");
    expect(labelForCard("letter:A")).toBe("A");
    expect(labelForCard("misc")).toBe("misc");
  });
});
