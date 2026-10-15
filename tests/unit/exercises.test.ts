import type { SignCandidate } from "@/lib/esku/domain/recognition/value-objects/Gloss";
import {
  HANDSHAPE_MAX_DISTANCE,
  HandshapeVote,
  isUnrecognizedLetter,
  lessonTemplates,
  letterAccepted,
  WORD_EARLY_HOLD_MS,
} from "@/lib/recognition/exercises";
import type { Template } from "@/lib/recognition/knn";

const letters = (...pairs: [string, number][]): SignCandidate[] =>
  pairs.map(([text, confidence]) => ({
    gloss: { id: text, conceptId: text, text },
    confidence,
    source: "alphabet",
  }));

describe("letterAccepted", () => {
  it("vale si la letra pedida es la primera y con seguridad", () => {
    expect(letterAccepted(letters(["B", 0.9], ["C", 0.05]), "b")).toBe(true);
    expect(letterAccepted(letters(["B", 0.4]), "B")).toBe(false);
    expect(letterAccepted(letters(["C", 0.6], ["B", 0.3]), "B")).toBe(false);
  });

  it("en las letras débiles basta con estar entre las tres primeras", () => {
    expect(letterAccepted(letters(["I", 0.6], ["Y", 0.3]), "Y")).toBe(true);
    expect(letterAccepted(letters(["I", 0.8], ["Y", 0.1]), "Y")).toBe(false);
  });
});

describe("isUnrecognizedLetter", () => {
  it("son las que el modelo no ve sueltas", () => {
    expect(isUnrecognizedLetter("ñ")).toBe(true);
    expect(isUnrecognizedLetter("Q")).toBe(true);
    expect(isUnrecognizedLetter("A")).toBe(false);
  });
});

describe("HandshapeVote", () => {
  const near = (label: string, confidence = 1) => ({
    label,
    confidence,
    distance: 1,
  });

  it("vale en cuanto la forma pedida se mantiene segura un momento", () => {
    const vote = new HandshapeVote("COMO", 0.45);
    expect(vote.push(near("COMO"), 0)).toBe(false);
    expect(vote.push(near("COMO"), WORD_EARLY_HOLD_MS)).toBe(true);
  });

  it("perder la mano corta la racha", () => {
    const vote = new HandshapeVote("COMO", 0.45);
    vote.push(near("COMO"), 0);
    vote.lost();
    expect(vote.push(near("COMO"), WORD_EARLY_HOLD_MS)).toBe(false);
  });

  it("una mano lejos de toda plantilla no vota", () => {
    const vote = new HandshapeVote("COMO", 0.45);
    vote.push(
      { label: "COMO", confidence: 1, distance: HANDSHAPE_MAX_DISTANCE + 1 },
      0,
    );
    expect(vote.verdict()).toBe(false);
  });

  it("al acabar gana la forma más votada", () => {
    const vote = new HandshapeVote("QUE", 0.45);
    vote.push(near("QUE", 0.6), 0);
    vote.push(near("QUE", 0.6), 100);
    vote.push(near("QUIEN", 0.9), 200);
    expect(vote.verdict()).toBe(true);
  });
});

describe("lessonTemplates", () => {
  const t = (label: string, x: number): Template => ({
    label,
    features: [x, 0],
  });

  it("compara con los signos de la lección y no con todo el curso", () => {
    const all = [t("QUE", 0), t("QUIEN", 1), t("ESTUDIAR", 0.5), t("DONDE", 3)];
    const labels = lessonTemplates(all, "QUE", ["QUE", "QUIEN", "DONDE"]).map(
      (x) => x.label,
    );
    expect(labels).toEqual(["QUE", "QUIEN", "DONDE"]);
  });

  it("sin lección, todas", () => {
    expect(
      lessonTemplates([t("QUE", 0), t("ESTUDIAR", 1)], "QUE", []),
    ).toHaveLength(2);
  });
});
