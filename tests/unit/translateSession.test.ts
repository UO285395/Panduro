import { describe, expect, it, vi } from "vitest";
import type { LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import type { ISignClassifier } from "@/lib/esku/domain/recognition/services/ISignClassifier";
import type { TranscriptEntry } from "@/lib/esku/domain/transcript/entities/Transcript";
import {
  ALPHABET_RESET_MS,
  entryKey,
  FpsMeter,
  renderTokens,
  SPELLING_WORD_GAP_MS,
  SwitchableClassifier,
  tokenize,
} from "@/lib/recognition/session";

const engine = (): ISignClassifier => ({
  id: "fake",
  granularity: "frame",
  isReady: () => true,
  load: async () => {},
  classify: vi.fn(async () => []),
});

const frame = (t: number, hands: boolean): LandmarkFrame =>
  ({ timestampMs: t, hands: hands ? [{}] : [] }) as unknown as LandmarkFrame;

describe("SwitchableClassifier", () => {
  it("apagado no está listo, así que el caso de uso no le pregunta", () => {
    const s = new SwitchableClassifier(engine());
    expect(s.isReady()).toBe(true);
    s.enabled = false;
    expect(s.isReady()).toBe(false);
  });

  it("reinicia el alfabeto tras una pausa sin mano, no en un parpadeo", async () => {
    const reset = vi.fn();
    const s = new SwitchableClassifier(engine(), reset);
    await s.classify([frame(0, true)]);
    await s.classify([frame(50, false)]);
    await s.classify([frame(100, true)]);
    expect(reset).not.toHaveBeenCalled();
    await s.classify([frame(200, false)]);
    await s.classify([frame(200 + ALPHABET_RESET_MS + 50, true)]);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

const entry = (text: string, source: TranscriptEntry["source"], atMs: number): TranscriptEntry => ({
  text,
  source,
  confidence: 0.9,
  atMs,
});

describe("tokenize", () => {
  const entries = [
    entry("yo", "vocabulary", 100),
    entry("a", "alphabet", 1000),
    entry("n", "alphabet", 1400),
    entry("a", "alphabet", 1800),
    entry("l", "alphabet", 1800 + SPELLING_WORD_GAP_MS + 100),
    entry("u", "alphabet", 1800 + SPELLING_WORD_GAP_MS + 500),
    entry("dolor", "vocabulary", 5000),
  ];

  it("junta las letras seguidas y corta la palabra tras una pausa larga", () => {
    const tokens = tokenize(entries, new Map());
    expect(tokens.map((t) => t.text)).toEqual(["yo", "ana", "lu", "dolor"]);
    expect(renderTokens(tokens)).toBe("Yo ana lu dolor");
  });

  it("aplica correcciones y borra lo que se vacía", () => {
    const edits = new Map([
      [entryKey(entries[6]!), "cabeza"],
      [entryKey(entries[0]!), ""],
    ]);
    expect(renderTokens(tokenize(entries, edits))).toBe("Ana lu cabeza");
  });

  it("un deletreo corregido se sustituye entero", () => {
    const spelled = tokenize(entries, new Map())[1]!;
    const edits = new Map(spelled.keys.map((k, i) => [k, i === 0 ? "Ana" : ""]));
    expect(tokenize(entries, edits)[1]!.text).toBe("ana");
  });
});

describe("FpsMeter", () => {
  it("mide los fotogramas por segundo reales", () => {
    const m = new FpsMeter();
    for (let i = 0; i < 20; i++) m.push(1000 + i * 100);
    expect(m.fps).toBeCloseTo(10, 5);
  });

  it("también en un dispositivo muy lento, que es cuando hay que avisar", () => {
    const m = new FpsMeter();
    for (let i = 0; i < 3; i++) m.push(1000 + i * 4000);
    expect(m.fps).toBeCloseTo(0.25, 5);
  });
});
