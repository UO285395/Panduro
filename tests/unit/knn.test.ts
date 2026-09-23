import { describe, expect, it } from "vitest";
import { KnnClassifier, withoutSameHandshape, type Template } from "@/lib/recognition/knn";
import { loadGlobalTemplates } from "@/lib/recognition/templates";
import { euclidean, extractFeatures } from "@/lib/recognition/features";
import type { NormalizedLandmark } from "@/lib/mediapipe/types";

function randomHand(seed: number): NormalizedLandmark[] {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: 21 }, (_, i) => ({
    x: rand() + i * 0.01,
    y: rand() + i * 0.01,
    z: rand() * 0.1,
  }));
}

function makeTemplates(): Template[] {
  const A: Template[] = [];
  const B: Template[] = [];
  // A: hands centradas cerca del origen
  for (let i = 0; i < 5; i++) {
    const hand: NormalizedLandmark[] = Array.from({ length: 21 }, (_, k) => ({
      x: k * 0.02,
      y: k * 0.02,
      z: 0,
    }));
    A.push({ label: "A", features: extractFeatures(hand) });
  }
  // B: hands claramente distintas (offset grande)
  for (let i = 0; i < 5; i++) {
    const hand: NormalizedLandmark[] = Array.from({ length: 21 }, (_, k) => ({
      x: 5 + k * 0.02,
      y: -5 + k * 0.02,
      z: 0.1,
    }));
    B.push({ label: "B", features: extractFeatures(hand) });
  }
  return [...A, ...B];
}

describe("features.extractFeatures", () => {
  it("aplana 21 landmarks a 81 números con normalización de rotación", () => {
    const hand = randomHand(1);
    const out = extractFeatures(hand);
    expect(out).toHaveLength(84); // 63 coords + 15 derived + 3 adjacent-tip + 3 palm-normal
    // z no se toca en la rotación XY — se preserva exacto
    expect(out[2]).toBe(hand[0]!.z);
    expect(out[62]).toBe(hand[20]!.z);
    // la distancia euclídea entre dos puntos se preserva (rotación es isométrica)
    const d_before = Math.hypot(hand[1]!.x - hand[0]!.x, hand[1]!.y - hand[0]!.y);
    const d_after  = Math.hypot(out[3]! - out[0]!, out[4]! - out[1]!);
    expect(d_after).toBeCloseTo(d_before, 10);
  });

  it("lanza si el número de landmarks no es 21", () => {
    expect(() => extractFeatures([])).toThrow();
    expect(() => extractFeatures(new Array(5))).toThrow();
  });
});

describe("euclidean", () => {
  it("mide distancia entre vectores del mismo largo", () => {
    expect(euclidean([0, 0], [3, 4])).toBe(5);
    expect(euclidean([1, 1, 1], [1, 1, 1])).toBe(0);
  });
  it("lanza si las dimensiones difieren", () => {
    expect(() => euclidean([1, 2], [1])).toThrow();
  });
});

describe("KnnClassifier", () => {
  const cls = new KnnClassifier(makeTemplates(), 5);

  it("distingue A de B con muestras muy separadas", () => {
    const nearA: NormalizedLandmark[] = Array.from({ length: 21 }, (_, k) => ({
      x: k * 0.02 + 0.01,
      y: k * 0.02 - 0.01,
      z: 0,
    }));
    const p = cls.predict(extractFeatures(nearA));
    expect(p).not.toBeNull();
    expect(p!.label).toBe("A");
    expect(p!.confidence).toBeGreaterThan(0.5);
  });

  it("con 0 plantillas devuelve null", () => {
    const empty = new KnnClassifier([], 3);
    expect(empty.predict([1, 2, 3])).toBeNull();
  });

  it("labels() y countFor()", () => {
    expect(cls.labels().sort()).toEqual(["A", "B"]);
    expect(cls.countFor("A")).toBe(5);
    expect(cls.countFor("Z")).toBe(0);
  });

  it("k mayor que el número de plantillas usa todas sin fallar", () => {
    const small = new KnnClassifier(
      [
        { label: "A", features: [0, 0] },
        { label: "B", features: [10, 10] },
      ],
      10,
    );
    const p = small.predict([0.1, 0.1]);
    expect(p?.label).toBe("A");
  });
});

describe("withoutSameHandshape", () => {
  it("quita plantillas de otras etiquetas con la misma forma y conserva las distintas", () => {
    const templates: Template[] = [
      { label: "HOLA", features: [0, 0] },
      { label: "ADIOS", features: [0, 0.01] },
      { label: "NUM_1", features: [5, 5] },
    ];
    const kept = withoutSameHandshape(templates, "HOLA").map((t) => t.label);
    expect(kept).toEqual(["HOLA", "NUM_1"]);
  });

  it("cada signo del corpus es reconocible por su propia configuración", () => {
    const all = loadGlobalTemplates();
    const labels = [...new Set(all.map((t) => t.label))];
    const missed = labels.filter((label) => {
      const probe = all
        .find((t) => t.label === label)!
        .features.map((v, i) => v + (i % 2 ? 0.01 : -0.01));
      const cls = new KnnClassifier(withoutSameHandshape(all, label), 3);
      return cls.predict(probe)?.label !== label;
    });
    expect(missed.length / labels.length).toBeLessThan(0.01);
  });
});
