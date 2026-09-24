import { describe, expect, it } from "vitest";
import { RecognizeSignsUseCase } from "@/lib/esku/application/use-cases/RecognizeSignsUseCase";
import { TeachCustomSignUseCase } from "@/lib/esku/application/use-cases/TeachCustomSignUseCase";
import type { ILandmarkSource, LandmarkListener } from "@/lib/esku/domain/landmarks/services/ILandmarkSource";
import type { LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import { InMemoryCustomSignRepository } from "@/lib/esku/infrastructure/persistence/InMemoryCustomSignRepository";
import { PrototypeSignClassifier } from "@/lib/esku/infrastructure/recognition/PrototypeSignClassifier";
import { buildHand } from "@/lib/esku/test/handFixtures";
import { measureReliability, scoreSequence } from "@/lib/recognition/reliability";
import { SwitchableClassifier } from "@/lib/recognition/session";

class ScriptedSource implements ILandmarkSource {
  private listener: LandmarkListener | null = null;
  async start(listener: LandmarkListener) {
    this.listener = listener;
  }
  stop() {
    this.listener = null;
  }
  isRunning() {
    return this.listener !== null;
  }
  push(frame: LandmarkFrame) {
    this.listener?.(frame);
  }
}

const FRAME_MS = 33;
type Curls = [number, number, number, number, number];

/**
 * Un signo sintético: una forma de mano que recorre una trayectoria y frena al final,
 * como un signo real (el segmentador corta donde la mano desacelera).
 */
function sign(curls: Curls, path: (u: number) => { x: number; y: number }, durationMs: number) {
  const frames: ((t0: number) => LandmarkFrame)[] = [];
  const n = Math.round(durationMs / FRAME_MS);
  for (let i = 0; i <= n; i++) {
    const u = (1 - Math.cos((Math.PI * i) / n)) / 2; // arranca y frena suave
    frames.push((t0) => ({ timestampMs: t0 + i * FRAME_MS, hands: [buildHand({ curls, offset: path(u) })] }));
  }
  return frames;
}

const hold = (curls: Curls, at: { x: number; y: number }, ms: number) =>
  Array.from({ length: Math.round(ms / FRAME_MS) }, (_, i) => (t0: number): LandmarkFrame => ({
    timestampMs: t0 + (i + 1) * FRAME_MS,
    hands: [buildHand({ curls, offset: at })],
  }));

// HOLA: mano abierta que barre de lado a lado. AGUA: puño que baja. CASA: mano abierta que sube.
const OPEN: Curls = [0, 0, 0, 0, 0];
const FIST: Curls = [1, 1, 1, 1, 1];
const SIGNS = {
  hola: (k = 1) => ({ curls: OPEN, path: (u: number) => ({ x: -0.25 * k + 0.5 * k * u, y: 0 }), ms: 1100 * k }),
  agua: (k = 1) => ({ curls: FIST, path: (u: number) => ({ x: 0, y: -0.2 * k + 0.4 * k * u }), ms: 1000 * k }),
  casa: (k = 1) => ({ curls: OPEN, path: (u: number) => ({ x: 0.05, y: 0.2 * k - 0.4 * k * u }), ms: 1000 * k }),
};

/** Transición entre dos signos: la mano viaja de donde acabó a donde empieza el siguiente. */
function transition(from: { curls: Curls; at: { x: number; y: number } }, to: { curls: Curls; at: { x: number; y: number } }, ms: number) {
  const n = Math.round(ms / FRAME_MS);
  return Array.from({ length: n }, (_, i) => (t0: number): LandmarkFrame => {
    const u = (1 - Math.cos((Math.PI * (i + 1)) / n)) / 2;
    const curls = from.curls.map((c, f) => c + (to.curls[f]! - c) * u) as Curls;
    const at = { x: from.at.x + (to.at.x - from.at.x) * u, y: from.at.y + (to.at.y - from.at.y) * u };
    return { timestampMs: t0 + (i + 1) * FRAME_MS, hands: [buildHand({ curls, offset: at })] };
  });
}

/**
 * Reproduce signos seguidos sin bajar la mano: entre uno y otro, una pausa breve y el
 * movimiento de transición, que es justo lo que confunde al reconocimiento continuo.
 */
async function perform(source: ScriptedSource, names: (keyof typeof SIGNS)[], variation = 1, clock = { t: 0 }) {
  let previous: { curls: Curls; at: { x: number; y: number } } | null = null;
  const frames: ((t0: number) => LandmarkFrame)[] = [];
  for (const name of names) {
    const s = SIGNS[name](variation);
    const start = { curls: s.curls, at: s.path(0) };
    if (previous) frames.push(...transition(previous, start, 300));
    frames.push(...hold(s.curls, s.path(0), 100), ...sign(s.curls, s.path, s.ms), ...hold(s.curls, s.path(1), 200));
    previous = { curls: s.curls, at: s.path(1) };
  }
  let t = clock.t;
  for (const f of frames) {
    t += FRAME_MS;
    source.push({ ...f(0), timestampMs: t });
    await Promise.resolve();
    await Promise.resolve();
  }
  // Mano fuera de cuadro al terminar: cierra la última ventana.
  t += FRAME_MS;
  source.push({ timestampMs: t, hands: [] });
  await new Promise((r) => setTimeout(r, 0));
  clock.t = t + 1000;
}

describe("signos enseñados en una secuencia continua", () => {
  it("se enseñan con el segmentador real y se reconocen seguidos, en orden", async () => {
    const source = new ScriptedSource();
    const repository = new InMemoryCustomSignRepository();
    const taught = new PrototypeSignClassifier(repository);
    const recognize = new RecognizeSignsUseCase(source, [new SwitchableClassifier(taught)]);
    const teach = new TeachCustomSignUseCase(repository);
    const clock = { t: 0 };
    await recognize.start(() => {});

    for (const name of ["hola", "agua", "casa"] as const) {
      const takes = [];
      for (const k of [0.9, 1, 1.1]) {
        const capture = recognize.captureWindow();
        await perform(source, [name], k, clock);
        takes.push(await capture);
      }
      await teach.execute(name, takes);
    }
    await taught.refresh();

    const reliability = measureReliability(await repository.findAll());
    expect(reliability.every((r) => r.recognized === r.total)).toBe(true);

    const target = ["hola", "agua", "casa", "hola"] as const;
    await perform(source, [...target], 1.05, clock);
    const written = recognize.current.entries.map((e) => e.text);
    expect(scoreSequence([...target], written)).toMatchObject({ hits: 4, insertions: 0 });
  });
});
