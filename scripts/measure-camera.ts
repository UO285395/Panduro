/**
 * Mide los ejercicios de cámara con vídeos de otras personas: pasa sus landmarks
 * (scripts/videos_to_signs.py) por los mismos modelos y las mismas reglas de aceptación que
 * la app, fotograma a fotograma, y dice qué ejercicios se darían por buenos y con qué se
 * confunden los que no.
 *
 *   pnpm tsx scripts/measure-camera.ts letters letras.json   # «Signa la letra» (sign_this)
 *   pnpm tsx scripts/measure-camera.ts words palabras.json   # «Signa la palabra» (sign_word)
 *   pnpm tsx scripts/measure-camera.ts words data/dilse/landmarks.json --vocabulary
 *       # qué signos del curso reconoce el modelo de vocabulario (no aprendió del DILSE)
 *
 * Resultados y decisiones que salieron de aquí: docs/reconocimiento.md.
 *
 * Las coordenadas se pasan a la proporción de la cámara de la app (1280×720, la que pide
 * MediaPipeLandmarkSource y con la que se entrenaron los modelos): en coordenadas de imagen la
 * misma mano tiene otra forma en un vídeo 1280×1080 que en uno 16:9. Con --aspect se cambia.
 *
 * El signo de cada muestra es el nombre del vídeo («B.mov», «COMO.mp4»). Los vídeos del DILSE
 * de los signos del curso no sirven para las palabras: de ellos salen las plantillas de forma
 * de mano, y medir con ellos sería medir con lo aprendido.
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  createHandLandmarks,
  type Handedness,
  type HandLandmarks,
  type Landmark,
} from "@/lib/esku/domain/landmarks/value-objects/Landmark";
import {
  dominantHand,
  type LandmarkFrame,
} from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import { SignSegmenter } from "@/lib/esku/domain/recognition/services/SignSegmenter";
import { CtcAlphabetClassifier } from "@/lib/esku/infrastructure/recognition/CtcAlphabetClassifier";
import { VocabularySignClassifier } from "@/lib/esku/infrastructure/recognition/VocabularySignClassifier";
import { parseLevels } from "@/lib/curriculum/structure";
import { normalizeLandmarks } from "@/lib/mediapipe/landmarks";
import {
  HandshapeVote,
  lessonTemplates,
  letterAccepted,
} from "@/lib/recognition/exercises";
import { extractFeatures } from "@/lib/recognition/features";
import { KnnClassifier } from "@/lib/recognition/knn";
import { loadGlobalTemplates } from "@/lib/recognition/templates";
import { conceptFor, glossKey } from "@/lib/recognition/vocabularyMap";

type Point = [number, number, number, number?];
type RawFrame = {
  hands: { image: Point[] }[];
  /** Muñecas de la pose en la imagen: [izquierda, derecha] de quien signa. */
  wrists?: Point[] | null;
  /** Pose 0-10 (nariz, ojos, orejas, boca) en la imagen. */
  face?: Point[];
  /** Pose 11-16 (hombros, codos, muñecas) en la imagen. */
  arms?: Point[];
};
type Sample = {
  sample: string;
  fps: number;
  aspect?: number;
  frames: RawFrame[];
};

const args = process.argv.slice(2);
const aspectAt = args.indexOf("--aspect");
const cameraAspect = aspectAt >= 0 ? Number(args[aspectAt + 1]) : 16 / 9;
const [mode, file] = args.filter(
  (a, i) => !a.startsWith("--") && (aspectAt < 0 || i !== aspectAt + 1),
);
/** En «words», solo los signos que conoce el modelo de vocabulario. */
const onlyModel = args.includes("--vocabulary");
if ((mode !== "letters" && mode !== "words") || !file) {
  console.error(
    "Uso: pnpm tsx scripts/measure-camera.ts letters|words <landmarks.json[.gz]> [--aspect 1.78] [--vocabulary]",
  );
  process.exit(1);
}

const raw = readFileSync(file);
const data = JSON.parse(
  (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"),
) as {
  signs: Record<string, Sample[]>;
};
const samples = Object.values(data.signs)
  .flat()
  .map((s) => ({
    ...s,
    label: basename(s.sample, extname(s.sample)).toUpperCase(),
  }))
  .sort((a, b) => a.label.localeCompare(b.label, "es"));

/** x en una imagen de la proporción de la cámara, con la misma altura y la escena centrada. */
let widen = (x: number) => x;
const point = ([x, y, z]: Point): Landmark => ({ x: widen(x), y, z });

/**
 * El fotograma como lo recibe la app: imagen sin espejo y cada mano con su lado real. El
 * script de vídeos no guarda qué mano es cuál; sale de la muñeca de la pose más cercana.
 */
function toFrame(frame: RawFrame, index: number, fps: number): LandmarkFrame {
  const wrists = frame.wrists;
  const sideOf = (hand: Point[]): Handedness => {
    const [x, y] = hand[0]!;
    if (!wrists || wrists.length < 2) return x > 0.5 ? "left" : "right";
    const d = (w: Point) => Math.hypot(w[0] - x, w[1] - y);
    return d(wrists[0]!) < d(wrists[1]!) ? "left" : "right";
  };
  let sides = frame.hands.map((h) => sideOf(h.image));
  // Dos manos del mismo lado: la de más a la derecha de la imagen es la izquierda de quien signa.
  if (sides.length === 2 && sides[0] === sides[1]) {
    sides =
      frame.hands[0]!.image[0]![0] > frame.hands[1]!.image[0]![0]
        ? ["left", "right"]
        : ["right", "left"];
  }
  const hands: HandLandmarks[] = frame.hands.map((h, i) =>
    createHandLandmarks(sides[i]!, h.image.map(point)),
  );
  const pose =
    frame.face && frame.arms
      ? {
          points: [
            ...frame.face.map(point),
            ...frame.arms.map((p) => ({ ...point(p), visibility: p[3] })),
          ],
        }
      : undefined;
  return { timestampMs: Math.round((index * 1000) / fps), hands, pose };
}

function loadModel(name: string) {
  const manifest = JSON.parse(
    readFileSync(`public/models/${name}.json`, "utf8"),
  );
  const bin = readFileSync(`public/models/${name}.bin`);
  return {
    manifest,
    weights: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
  };
}

const pct = (n: number, d: number) => `${d ? Math.round((100 * n) / d) : 0} %`;

/** Los «Signa la palabra» del curso: confianza mínima y signos de la lección de cada uno. */
function wordExercises(): Map<
  string,
  { minConfidence: number; lesson: string[] }
> {
  const out = new Map<string, { minConfidence: number; lesson: string[] }>();
  for (const level of parseLevels())
    for (const unit of level.units)
      for (const lesson of unit.lessons)
        for (const e of lesson.exercises)
          if (e.type === "sign_word")
            out.set(e.signId, {
              minConfidence: e.minConfidence,
              lesson: lesson.signs,
            });
  return out;
}

async function measureWords() {
  const exercises = wordExercises();
  const { manifest, weights } = loadModel("lse-vocabulary");
  const concepts = (manifest.concepts as string[]).filter(
    (c) => c !== manifest.abstentionConcept,
  );
  // El clasificador de vocabulario solo sabe cargar por fetch: se le sirven los archivos locales.
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) =>
    new Response(
      url.endsWith(".json") ? JSON.stringify(manifest) : weights,
    )) as typeof fetch;
  const vocabulary = new VocabularySignClassifier(
    "lse-vocabulary.json",
    "lse-vocabulary.bin",
  );
  await vocabulary.load();
  globalThis.fetch = real;
  const templates = loadGlobalTemplates();
  // Por cada signo pedido, el clasificador de formas que usa su ejercicio.
  const knn = new Map<string, KnnClassifier>();
  const knnFor = (id: string) => {
    if (!knn.has(id))
      knn.set(
        id,
        new KnnClassifier(
          lessonTemplates(templates, id, exercises.get(id)?.lesson ?? []),
          3,
        ),
      );
    return knn.get(id)!;
  };
  const targets = [...exercises.keys()];
  let passed = 0;
  let wrong = 0;
  console.log(
    "signo        cómo se comprueba      ¿vale?  formas más vistas          también daría por bueno",
  );
  for (const s of samples) {
    if (onlyModel && !conceptFor(s.label, concepts)) continue;
    const ratio = (s.aspect ?? cameraAspect) / cameraAspect;
    widen = (x) => 0.5 + (x - 0.5) * ratio;
    const frames = s.frames.map((raw, i) => toFrame(raw, i, s.fps));
    const accepts = new Set<string>();
    let seen = "";
    for (const target of onlyModel
      ? [s.label]
      : new Set([s.label, ...targets])) {
      const concept = conceptFor(target, concepts);
      if (concept) {
        // El signo completo con el modelo de vocabulario: vale si sale entre sus 3 respuestas.
        const segmenter = new SignSegmenter();
        for (const frame of [
          ...frames,
          { timestampMs: frames.at(-1)!.timestampMs + 2000, hands: [] },
        ]) {
          const window = segmenter.push(frame);
          if (!window) continue;
          const candidates = await vocabulary.classify(window);
          if (target === s.label)
            seen ||= candidates.map((c) => c.gloss.text).join(" ");
          if (
            candidates.some(
              (c) => glossKey(c.gloss.conceptId) === glossKey(concept),
            )
          )
            accepts.add(target);
        }
        continue;
      }
      // Solo la forma de la mano, contra las plantillas.
      const vote = new HandshapeVote(
        target,
        exercises.get(target)?.minConfidence ?? 0.5,
      );
      const counts = new Map<string, number>();
      let early = false;
      for (const frame of frames) {
        const hand = dominantHand(frame);
        if (!hand) {
          vote.lost();
          continue;
        }
        const pred = knnFor(target).predict(
          extractFeatures(normalizeLandmarks([...hand.points])),
        );
        if (!pred) continue;
        counts.set(pred.label, (counts.get(pred.label) ?? 0) + 1);
        early ||= vote.push(pred, frame.timestampMs);
      }
      if (early || vote.verdict()) accepts.add(target);
      if (target === s.label)
        seen = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, n]) => `${k}×${n}`)
          .join(" ");
    }
    const how = conceptFor(s.label, concepts)
      ? "vocabulario (signo)"
      : "forma de la mano";
    const accepted = accepts.has(s.label);
    const others = [...accepts].filter((t) => t !== s.label);
    if (accepted) passed += 1;
    wrong += others.length;
    console.log(
      `${s.label.padEnd(12)} ${how.padEnd(22)} ${accepted ? "sí" : "NO"}      ${seen.padEnd(26)} ${others.join(" ") || "—"}`,
    );
  }
  const total = onlyModel
    ? samples.filter((s) => conceptFor(s.label, concepts)).length
    : samples.length;
  console.log(
    `\n${passed} de ${total} signos se darían por buenos (${pct(passed, total)});`,
  );
  console.log(
    `${wrong} veces se daría por bueno otro de los ejercicios (${targets.join(", ")}).`,
  );
}

async function measureLetters() {
  const { manifest, weights } = loadModel("lse-alphabet");
  const alphabet = new CtcAlphabetClassifier();
  await alphabet.loadFrom(manifest, weights);
  const letters: string[] = manifest.letters;
  let passed = 0;
  let wrong = 0;
  console.log("letra  ¿vale?  máx. de la letra  también daría por buena");
  for (const s of samples) {
    const target = s.label;
    const ratio = (s.aspect ?? cameraAspect) / cameraAspect;
    widen = (x) => 0.5 + (x - 0.5) * ratio;
    alphabet.reset();
    let best = 0;
    // Las letras que el ejercicio daría por buenas con este vídeo, sea cual sea la pedida.
    const accepts = new Set<string>();
    for (const [i, raw] of s.frames.entries()) {
      const frame = toFrame(raw, i, s.fps);
      if (frame.hands.length === 0) continue;
      const candidates = await alphabet.classify([frame]);
      best = Math.max(
        best,
        alphabet.lastScores.find((x) => x.text === target)?.confidence ?? 0,
      );
      for (const letter of letters)
        if (letterAccepted(candidates, letter)) accepts.add(letter);
    }
    const accepted = accepts.has(target);
    const others = [...accepts].filter((l) => l !== target);
    if (accepted) passed += 1;
    wrong += others.length;
    console.log(
      `${target.padEnd(5)}  ${accepted ? "sí" : "NO"}      ${String(Math.round(best * 100)).padStart(3)} %` +
        `            ${others.join(" ") || "—"}`,
    );
  }
  console.log(
    `\n${passed} de ${samples.length} letras se darían por buenas (${pct(passed, samples.length)});`,
  );
  console.log(
    `${wrong} veces se daría por buena otra letra que no es la signada.`,
  );
}

(mode === "letters" ? measureLetters() : measureWords()).catch((e) => {
  console.error(e);
  process.exit(1);
});
