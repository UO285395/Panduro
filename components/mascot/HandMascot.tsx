"use client";

import { useEffect, useRef, useState } from "react";
import { IDLE_GREETING_MS, handTarget, restAt, stepHand, type HandMood, type HandPose } from "@/lib/mascot/handPose";

export type { HandMood };

/** Mano «generic-hand» de WebXR Input Profiles (MIT, ver public/models/LICENSE.md). */
const MODEL_URL = "/models/hand.glb";
const SKIN = 0xf2bb93;
const CUFF = 0xf26a1b;
const CUFF_BAND = 0xffc9a6;
/** Tinta petróleo del contorno (en lineal, como lo espera OutlineEffect). */
const INK: [number, number, number] = [0.007, 0.019, 0.024];
/** Medio lado del encuadre, en metros del modelo (la mano mide unos 18 cm). */
const FRAME_RADIUS = 0.155;
/** Alto de la mano (m): la unidad de los desplazamientos de la pose. */
const HAND_HEIGHT = 0.18;
/** Giro de tres cuartos sobre el eje vertical. */
const YAW = 0.3;
/**
 * Proporciones de dibujo: los dedos del modelo, de persona, se hacen más gordos y algo más
 * cortos (cada articulación tiene −Z a lo largo de su hueso, así que basta con su escala).
 */
const FINGER = { thick: 1.42, length: 0.86 };
const THUMB = { thick: 1.38, length: 0.9 };
/** Ángulos de un puño (MCP, PIP, DIP) del índice al meñique: el meñique cierra algo más. */
const FIST = [
  [1.5, 1.8, 1.05],
  [1.58, 1.85, 1.1],
  [1.62, 1.85, 1.1],
  [1.66, 1.8, 1.05],
] as const;
/** Lo que se juntan los dedos al cerrar el puño (fracción de su separación en reposo). */
const CONVERGE = 0.85;
/** Lo que se abre cada dedo, del índice al meñique, con los dedos en abanico (rad, hacia el índice). */
const FAN = [0.24, 0.04, -0.14, -0.32] as const;
/** Lo que se endereza el pulgar del modelo, que en reposo viene doblado. */
const THUMB_STRAIGHT = 0.75;
/** Con el pulgar arriba, la última falange se dobla un poco hacia atrás (rad). */
const THUMB_BACK = 0.28;

type Props = {
  mood: HandMood;
  /** Lado del lienzo en píxeles. */
  size?: number;
  className?: string;
};

/**
 * La mascota: una mano 3D con contorno de dibujo. Saluda en reposo, pone el pulgar arriba
 * al acertar y abajo al fallar, y celebra al terminar la lección (lib/mascot/handPose.ts).
 * Es decorativa: si no hay WebGL o el modelo no carga, no ocupa sitio.
 */
export function HandMascot({ mood, size = 120, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Recién montada y en reposo, saluda enseguida.
  const moodRef = useRef({ mood, since: -IDLE_GREETING_MS, fresh: true });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const m = moodRef.current;
    if (m.fresh) {
      moodRef.current = { mood, since: performance.now() - (mood === "idle" ? IDLE_GREETING_MS : 0), fresh: false };
    } else if (m.mood !== mood) {
      moodRef.current = { mood, since: performance.now(), fresh: false };
    }
  }, [mood]);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup: (() => void) | null = null;

    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const THREE = await import("three");
        const { OutlineEffect } = await import("three/examples/jsm/effects/OutlineEffect.js");
        const hand = await loadHand();
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(size, size, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const effect = new OutlineEffect(renderer, { defaultThickness: 0.0045, defaultColor: INK });

        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 1.1));
        const key = new THREE.DirectionalLight(0xfff4ea, 2.2);
        key.position.set(-0.6, 1, 1.4);
        scene.add(key);

        const rig = buildRig(THREE, hand);
        scene.add(rig.root);

        const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
        camera.position.set(0, 0, FRAME_RADIUS / Math.sin(THREE.MathUtils.degToRad(15)));
        camera.lookAt(0, 0, 0);

        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        let last = performance.now();
        const first = moodRef.current;
        // Empieza ya en su pose: lo que se anima es lo que viene después.
        const state = restAt(handTarget(first.mood, last - first.since, last, still));
        const loop = () => {
          if (disposed) return;
          const now = performance.now();
          const dt = now - last;
          last = now;
          const { mood: m, since } = moodRef.current;
          stepHand(state, handTarget(m, now - since, now, still), dt, still);
          // Fuera de la pantalla (p. ej. escondida bajo el borde en la lección) no se dibuja.
          if (visible) {
            rig.pose(state.pos);
            effect.render(scene, camera);
          }
          raf = requestAnimationFrame(loop);
        };
        let visible = true;
        const observer = new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting ?? true;
        });
        observer.observe(canvas);
        loop();

        cleanup = () => {
          observer.disconnect();
          rig.dispose();
          renderer.dispose();
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, [size]);

  if (failed) return null;
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-hidden
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

type Three = typeof import("three");
type GLTF = import("three/examples/jsm/loaders/GLTFLoader.js").GLTF;

let handPromise: Promise<GLTF> | null = null;

/** Una sola descarga por página; cada mascota usa su propia copia del esqueleto. */
async function loadHand(): Promise<import("three").Object3D> {
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
  handPromise ??= new GLTFLoader().loadAsync(MODEL_URL);
  try {
    return clone((await handPromise).scene);
  } catch (e) {
    handPromise = null;
    throw e;
  }
}

const FINGERS = ["index", "middle", "ring", "pinky"] as const;

type Joint = {
  node: import("three").Object3D;
  pos: import("three").Vector3;
  quat: import("three").Quaternion;
};

/**
 * Prepara la mano para posarla. Las articulaciones del modelo de WebXR no se anidan (todas
 * cuelgan del Armature, porque en realidad virtual cada una llega ya colocada), así que la
 * cadena de cada dedo se calcula aquí: cada falange gira alrededor del nudillo anterior.
 */
function buildRig(THREE: Three, model: import("three").Object3D) {
  const armature = model.getObjectByName("Armature") ?? model;
  armature.position.set(0, 0, 0);
  armature.quaternion.identity();
  armature.scale.set(1, 1, 1);

  const joint = (name: string): Joint => {
    const node = armature.getObjectByName(name);
    if (!node) throw new Error(`Falta la articulación ${name}`);
    return { node, pos: node.position.clone(), quat: node.quaternion.clone() };
  };
  const wrist = joint("wrist");
  const fingers = FINGERS.map((f) =>
    ["phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip"].map((p) => joint(`${f}-finger-${p}`)),
  );
  const thumb = ["metacarpal", "phalanx-proximal", "phalanx-distal", "tip"].map((p) => joint(`thumb-${p}`));
  for (const chain of fingers) for (const j of chain) j.node.scale.set(FINGER.thick, FINGER.thick, FINGER.length);
  for (const j of thumb) j.node.scale.set(THUMB.thick, THUMB.thick, THUMB.length);

  // Ejes de la mano: hacia los nudillos (F), del meñique al índice (L) y la normal de la palma (N).
  const W = wrist.pos;
  const F = fingers[1]![0]!.pos.clone().sub(W).normalize();
  const L = fingers[0]![0]!.pos.clone().sub(fingers[3]![0]!.pos);
  L.addScaledVector(F, -L.dot(F)).normalize();
  const N = new THREE.Vector3().crossVectors(L, F);
  // La palma es el lado hacia el que queda el pulgar.
  if (thumb[3]!.pos.clone().sub(W).dot(N) < 0) N.negate();
  // Al cerrar, las yemas van hacia la palma: giro positivo alrededor de F × N.
  const curlAxis = new THREE.Vector3().crossVectors(F, N).normalize();

  // Pose base: pulgar (L) hacia arriba y palma (N) hacia la cámara.
  const toView = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(L, N), L, N).transpose();
  const base = new THREE.Quaternion().setFromRotationMatrix(toView);

  // root (posición y achatado, en la pantalla) → pivot (giros, alrededor de la palma) →
  // offset → la manga y, girando sobre la muñeca, la mano.
  const center = W.clone().lerp(fingers[1]![0]!.pos, 0.3);
  const inner = new THREE.Group();
  inner.position.copy(W).negate();
  inner.add(model);
  const wristGroup = new THREE.Group();
  wristGroup.position.copy(W);
  wristGroup.add(inner);
  const offset = new THREE.Group();
  offset.position.copy(center).negate();
  offset.add(wristGroup);
  const pivot = new THREE.Group();
  pivot.add(offset);
  const root = new THREE.Group();
  root.add(pivot);

  // Material de dibujo: tres tonos.
  const ramp = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  const skin = new THREE.MeshToonMaterial({ color: SKIN, gradientMap: ramp });
  model.traverse((o) => {
    if ((o as import("three").Mesh).isMesh) (o as import("three").Mesh).material = skin;
  });

  // Puño de sudadera: el elástico, más claro, y un trozo de manga mandarina de final redondo
  // (la mano flota, como las de los dibujos). Perfiles (radio, a lo largo del antebrazo desde
  // la muñeca) que giran alrededor del antebrazo.
  const sleeveBasis = new THREE.Matrix4().makeBasis(L, F, new THREE.Vector3().crossVectors(L, F));
  const lathe = (profile: [number, number][], color: number) => {
    const mesh = new THREE.Mesh(
      new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 40),
      new THREE.MeshToonMaterial({ color, gradientMap: ramp, side: THREE.DoubleSide }),
    );
    mesh.quaternion.setFromRotationMatrix(sleeveBasis);
    mesh.scale.set(1.2, 1, 0.82);
    mesh.position.copy(W);
    return mesh;
  };
  const band = lathe(
    [[0.026, 0.008], [0.033, 0.0075], [0.0365, 0.003], [0.037, -0.009], [0.0355, -0.015], [0.03, -0.017]],
    CUFF_BAND,
  );
  const cuff = lathe(
    [[0.03, -0.012], [0.038, -0.015], [0.04, -0.026], [0.0395, -0.04], [0.0365, -0.051], [0.03, -0.059], [0.02, -0.0645], [0.008, -0.067], [0, -0.0675]],
    CUFF,
  );
  offset.add(cuff, band);

  // Cada dedo se dobla en su propio plano (perpendicular a la palma y a su dirección): con un
  // eje común, los que no apuntan como el corazón se cruzaban y asomaban del puño. Al cerrar,
  // se juntan hacia el corazón deshaciendo parte de su separación en reposo.
  const chains = fingers.map((chain, i) => {
    const dir = chain[1]!.pos.clone().sub(chain[0]!.pos);
    dir.addScaledVector(N, -dir.dot(N)).normalize();
    const axis = new THREE.Vector3().crossVectors(dir, N).normalize();
    if (axis.dot(curlAxis) < 0) axis.negate();
    const splay = Math.atan2(dir.dot(L), dir.dot(F));
    return { chain, axis, splay, fist: FIST[i]!, fan: FAN[i]!, key: FINGERS[i]! };
  });
  const middleSplay = chains[1]!.splay;
  // Girar alrededor de N en este sentido lleva F hacia L.
  const towardL = Math.sign(new THREE.Vector3().crossVectors(N, F).dot(L)) || 1;

  // Pulgar: abierto a un lado de la mano o estirado hacia arriba (hacia L, un poco hacia los
  // nudillos y la palma). El del modelo viene doblado: cada tramo se endereza hacia la
  // dirección del pulgar entero.
  const thumbRest = thumb[3]!.pos.clone().sub(thumb[0]!.pos).normalize();
  const thumbTo = (l: number, f: number, n: number) =>
    new THREE.Quaternion().setFromUnitVectors(
      thumbRest,
      L.clone().multiplyScalar(l).addScaledVector(F, f).addScaledVector(N, n).normalize(),
    );
  const thumbOpen = thumbTo(0.62, 0.78, 0.14);
  const thumbUp = thumbTo(1, 0.2, 0.2);
  const identity = new THREE.Quaternion();
  const thumbStraight = thumb.slice(0, 3).map((j, k) =>
    identity.clone().slerp(
      new THREE.Quaternion().setFromUnitVectors(thumb[k + 1]!.pos.clone().sub(j.pos).normalize(), thumbRest),
      THUMB_STRAIGHT,
    ),
  );
  // Hacia atrás: lejos de los nudillos.
  const thumbBackAxis = new THREE.Vector3().crossVectors(L, F).normalize().negate();

  const q = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const qs = new THREE.Quaternion();
  const qt = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);

  function pose(p: HandPose) {
    let closed = 0;
    for (const { chain, axis, splay, fist, fan, key } of chains) {
      const curl = Math.min(1.08, Math.max(-0.08, p[key]));
      closed += curl / chains.length;
      // Alrededor de la normal de la palma por el nudillo: hacia el corazón al cerrar y en
      // abanico al abrir.
      qs.setFromAxisAngle(N, towardL * (-(splay - middleSplay) * CONVERGE * curl + fan * p.spread * (1 - Math.max(0, curl))));
      let acc = 0;
      for (let k = 0; k < chain.length; k++) {
        const j = chain[k]!;
        if (k > 0) {
          const prev = chain[k - 1]!;
          q.copy(qs).multiply(qa.setFromAxisAngle(axis, acc));
          v.copy(j.pos).sub(prev.pos).multiplyScalar(FINGER.length).applyQuaternion(q);
          j.node.position.copy(prev.node.position).add(v);
        }
        acc += (fist[k] ?? 0) * curl;
        j.node.quaternion.copy(qs).multiply(q.setFromAxisAngle(axis, acc)).multiply(j.quat);
      }
    }

    const up = Math.min(1.2, Math.max(-0.2, p.thumb));
    qt.slerpQuaternions(thumbOpen, thumbUp, up);
    for (let k = 0; k < thumb.length; k++) {
      const j = thumb[k]!;
      const seg = Math.min(k, 2);
      q.copy(qt).multiply(thumbStraight[seg]!);
      if (seg === 2) q.premultiply(qa.setFromAxisAngle(thumbBackAxis, THUMB_BACK * Math.max(0, up)));
      if (k > 0) {
        // El tramo anterior lleva esta articulación; ella gira con el suyo.
        const prev = thumb[k - 1]!;
        qa.copy(qt).multiply(thumbStraight[k - 1]!);
        v.copy(j.pos).sub(prev.pos).multiplyScalar(THUMB.length).applyQuaternion(qa);
        j.node.position.copy(prev.node.position).add(v);
      } else {
        j.node.position.copy(j.pos);
      }
      j.node.quaternion.copy(q).multiply(j.quat);
    }

    // La normal de la palma es la de la pantalla en la pose base: mismo sentido que `tilt`.
    wristGroup.quaternion.setFromAxisAngle(N, p.wrist);

    // Tres cuartos para que se vea el volumen; luego el plano, el antebrazo y la base.
    pivot.quaternion
      .setFromAxisAngle(Y, YAW + p.spin)
      .multiply(qa.setFromAxisAngle(Z, p.tilt + p.sway))
      .multiply(q.setFromAxisAngle(X, p.roll))
      .multiply(base);
    // La mano abierta es más larga: se baja a lo largo de los dedos para que quepa.
    v.copy(F).applyQuaternion(pivot.quaternion);
    root.position
      .set(p.x * HAND_HEIGHT, (p.y + p.bob) * HAND_HEIGHT, p.z * HAND_HEIGHT)
      .addScaledVector(v, -0.035 * (1 - Math.min(1, Math.max(0, closed))));
    const tall = 1 - Math.min(0.3, Math.max(-0.3, p.squash));
    const wide = 1 / Math.sqrt(tall);
    root.scale.set(wide, tall, wide);
  }

  return {
    root,
    pose,
    dispose() {
      skin.dispose();
      ramp.dispose();
      for (const m of [cuff, band]) {
        m.geometry.dispose();
        (m.material as import("three").Material).dispose();
      }
    },
  };
}
