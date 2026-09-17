import { describe, expect, it } from "vitest";
import { getLetterMeta, listLetters, loadGlobalTemplates } from "@/lib/recognition/templates";
import { KnnClassifier } from "@/lib/recognition/knn";

describe("fingerspelling templates", () => {
  it("expone las 27 letras A-Z + Ñ", () => {
    const letters = listLetters();
    expect(letters.length).toBe(27);
    expect(letters).toContain("A");
    expect(letters).toContain("Z");
    expect(letters).toContain("Ñ");
  });

  it("cada letra tiene translation y description", () => {
    for (const l of listLetters()) {
      const meta = getLetterMeta(l);
      expect(meta).toBeDefined();
      expect(meta!.translation).toBe(l);
      expect(meta!.description.length).toBeGreaterThan(10);
    }
  });

  it("loadGlobalTemplates devuelve al menos 12 letras + 6 signos con plantillas sintéticas", () => {
    const templates = loadGlobalTemplates();
    expect(templates.length).toBeGreaterThanOrEqual((12 + 6) * 3);
    for (const t of templates) {
      expect(t.features.length).toBe(63);
    }
    const labels = new Set(templates.map((t) => t.label));
    for (const letter of ["A", "B", "C", "L", "O", "Y", "I", "U", "V", "W", "F", "P"]) {
      expect(labels.has(letter)).toBe(true);
    }
    for (const sign of ["HOLA", "GRACIAS", "SI", "NO", "BIEN", "ADIOS"]) {
      expect(labels.has(sign)).toBe(true);
    }
  });

  it("el corpus sintético es intra-separable (accuracy 100% sobre sí mismo)", () => {
    const templates = loadGlobalTemplates();
    const cls = new KnnClassifier(templates, 3);
    let correct = 0;
    for (const t of templates) {
      const p = cls.predict(t.features);
      if (p?.label === t.label) correct++;
    }
    expect(correct).toBe(templates.length);
  });
});
