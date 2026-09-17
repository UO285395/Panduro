import { describe, expect, it } from "vitest";
import { SegmentStream } from "@/lib/translator/segment";
import type { HandFrame, NormalizedLandmark } from "@/lib/mediapipe/types";

function frameAt(x: number, y: number, ts: number): HandFrame {
  const wrist: NormalizedLandmark = { x, y, z: 0 };
  const rest: NormalizedLandmark[] = Array.from({ length: 20 }, () => ({ x, y, z: 0 }));
  const normalized = [wrist, ...rest];
  return {
    timestamp: ts,
    inferenceMs: 10,
    imageLandmarks: normalized,
    normalized,
    handedness: "Right",
    handednessScore: 0.99,
  };
}

describe("SegmentStream", () => {
  it("emite `start` cuando aparece la mano", () => {
    const s = new SegmentStream();
    const events = s.push(frameAt(0, 0, 0), 0);
    expect(events.map((e) => e.kind)).toEqual(["start"]);
  });

  it("emite `hold` cuando la mano permanece quieta > HOLD_MS", () => {
    const s = new SegmentStream();
    s.push(frameAt(0, 0, 0), 0);
    // Alimenta frames "en el mismo punto" a 30 fps hasta pasar 300 ms.
    let events: ReturnType<typeof s.push> = [];
    for (let t = 33; t <= 400; t += 33) {
      const evs = s.push(frameAt(0.001, 0.001, t), t);
      events = events.concat(evs);
    }
    expect(events.some((e) => e.kind === "hold")).toBe(true);
    const hold = events.find((e) => e.kind === "hold");
    if (hold?.kind === "hold") {
      expect(hold.centroid).toHaveLength(21);
    }
  });

  it("emite `end` cuando la mano desaparece", () => {
    const s = new SegmentStream();
    s.push(frameAt(0, 0, 0), 0);
    const events = s.push(null, 100);
    expect(events.map((e) => e.kind)).toEqual(["end"]);
  });

  it("emite `end` al reanudarse el movimiento tras un `hold`", () => {
    const s = new SegmentStream();
    s.push(frameAt(0, 0, 0), 0);
    for (let t = 33; t <= 400; t += 33) {
      s.push(frameAt(0, 0, t), t);
    }
    // Movimiento grande (velocidad alta): la mano vuelve a moverse.
    const events = s.push(frameAt(0.5, 0.5, 500), 500);
    expect(events.some((e) => e.kind === "end")).toBe(true);
  });

  it("no vuelve a emitir `hold` mientras la mano sigue quieta", () => {
    const s = new SegmentStream();
    s.push(frameAt(0, 0, 0), 0);
    for (let t = 33; t <= 900; t += 33) {
      s.push(frameAt(0, 0, t), t);
    }
    // A los 900 ms deberíamos ver un único `hold` en toda la secuencia
    let holds = 0;
    const s2 = new SegmentStream();
    s2.push(frameAt(0, 0, 0), 0);
    for (let t = 33; t <= 900; t += 33) {
      holds += s2.push(frameAt(0, 0, t), t).filter((e) => e.kind === "hold").length;
    }
    expect(holds).toBe(1);
  });
});
