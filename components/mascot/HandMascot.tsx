"use client";

import { useEffect, useRef, useState } from "react";
import { approach, handPose, type HandMood } from "@/lib/mascot/handPose";

export type { HandMood };

/** Mano «generic-hand» de WebXR Input Profiles (MIT, ver public/models/LICENSE.md). */
const MODEL_URL = "/models/hand.glb";
const SKIN = 0xf2bb93;
const CUFF = 0xf26a1b;
const CUFF_BAND = 0xffc9a6;
/** Tinta petróleo del contorno (en lineal, como lo espera OutlineEffect). */
const INK: [number, number, number] = [0.007, 0.019, 0.024];
/** Constante de tiempo del paso entre poses (ms). */
const POSE_TAU_MS = 90;
/** Medio lado del encuadre, en metros del modelo (la mano mide unos 19 cm). */
const FRAME_RADIUS = 0.14;
/** Giro de tres cuartos sobre el eje vertical. */
const YAW = 0.3;
/** Ángulos de un puño (MCP, PIP, DIP). */
const FIST = [1.6, 1.85, 1.1] as const;

type Props = {
  mood: HandMood;
  /** Lado del lienzo en píxeles. */
  size?: number;
  className?: string;
};

/**
 * La mascota: una mano 3D con contorno de dibujo. Saluda en reposo, pone el pulgar arriba
 * al acertar y abajo al fallar, y celebra al terminar la lección. Es decorativa: si no hay
 * WebGL o el modelo no carga, no ocupa sitio.
 */
export function HandMascot({ mood, size = 120, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moodRef = useRef({ mood, since: 0 });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    moodRef.current = { mood, since: performance.now() };
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
        scene.add(rig.pivot);

        const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
        camera.position.set(0, 0, FRAME_RADIUS / Math.sin(THREE.MathUtils.degToRad(15)));
        camera.lookAt(0, 0, 0);

        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        const cur = { tilt: -Math.PI / 2, roll: 0, curl: 0.12, thumb: 0 };
        let last = performance.now();
        const loop = () => {
          if (disposed) return;
          const now = performance.now();
          const dt = Math.min(100, now - last);
          last = now;
          const { mood: m, since } = moodRef.current;
          const target = handPose(m, now - since, now, still);
          cur.tilt = approach(cur.tilt, target.tilt, dt, POSE_TAU_MS);
          cur.roll = approach(cur.roll, target.roll, dt, POSE_TAU_MS);
          cur.curl = approach(cur.curl, target.curl, dt, POSE_TAU_MS);
          cur.thumb = approach(cur.thumb, target.thumb, dt, POSE_TAU_MS);
          // Fuera de la pantalla (p. ej. escondida bajo el borde en la lección) no se dibuja.
          if (visible) {
            rig.pose({ ...cur, y: target.y, sway: target.sway, spin: target.spin });
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

  // Gira alrededor de la palma, algo hacia la muñeca para que la manga también quepa.
  const center = W.clone().lerp(fingers[1]![0]!.pos, 0.3);
  const offset = new THREE.Group();
  offset.position.copy(center).negate();
  offset.add(model);
  const pivot = new THREE.Group();
  pivot.add(offset);

  // Material de dibujo: tres tonos.
  const ramp = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  const skin = new THREE.MeshToonMaterial({ color: SKIN, gradientMap: ramp });
  model.traverse((o) => {
    if ((o as import("three").Mesh).isMesh) (o as import("three").Mesh).material = skin;
  });

  // Manga mandarina con el puño elástico más claro, a lo largo del antebrazo.
  const sleeveBasis = new THREE.Matrix4().makeBasis(L, F, new THREE.Vector3().crossVectors(L, F));
  const tube = (r0: number, r1: number, from: number, to: number, color: number) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, to - from, 32),
      new THREE.MeshToonMaterial({ color, gradientMap: ramp }),
    );
    mesh.quaternion.setFromRotationMatrix(sleeveBasis);
    mesh.scale.set(1.2, 1, 0.8);
    mesh.position.copy(W).addScaledVector(F, (from + to) / 2);
    return mesh;
  };
  const cuff = tube(0.036, 0.034, -0.085, -0.014, CUFF);
  const band = tube(0.033, 0.031, -0.016, 0.004, CUFF_BAND);
  armature.add(cuff, band);

  // Pulgar estirado a lo largo del puño (hacia L, un poco hacia los nudillos y la palma).
  const thumbRest = thumb[3]!.pos.clone().sub(thumb[0]!.pos).normalize();
  const thumbUp = L.clone().addScaledVector(F, 0.3).addScaledVector(N, 0.35).normalize();
  const thumbAlign = new THREE.Quaternion().setFromUnitVectors(thumbRest, thumbUp);

  const q = new THREE.Quaternion();
  const qa = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const id = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const offsetQuat = new THREE.Quaternion();

  function pose(p: { tilt: number; roll: number; curl: number; thumb: number; y: number; sway: number; spin: number }) {
    for (const chain of fingers) {
      let acc = 0;
      for (let k = 0; k < chain.length; k++) {
        const j = chain[k]!;
        if (k > 0) {
          const prev = chain[k - 1]!;
          q.setFromAxisAngle(curlAxis, acc);
          v.copy(j.pos).sub(prev.pos).applyQuaternion(q);
          j.node.position.copy(prev.node.position).add(v);
        }
        acc += (FIST[k] ?? 0) * p.curl;
        j.node.quaternion.copy(q.setFromAxisAngle(curlAxis, acc)).multiply(j.quat);
      }
    }
    q.slerpQuaternions(id, thumbAlign, p.thumb);
    for (const j of thumb) {
      v.copy(j.pos).sub(thumb[0]!.pos).applyQuaternion(q);
      j.node.position.copy(thumb[0]!.pos).add(v);
      j.node.quaternion.copy(q).multiply(j.quat);
    }

    // Tres cuartos para que se vea el volumen; luego el plano, el antebrazo y la base.
    pivot.quaternion
      .setFromAxisAngle(Y, YAW + p.spin)
      .multiply(qa.setFromAxisAngle(Z, p.tilt + p.sway))
      .multiply(q.setFromAxisAngle(X, p.roll))
      .multiply(base);
    // La mano abierta es más larga: se baja a lo largo de los dedos para que quepan.
    v.copy(F).applyQuaternion(offsetQuat.copy(pivot.quaternion));
    pivot.position.set(0, p.y * 0.19, 0).addScaledVector(v, -0.04 * (1 - p.curl));
  }

  return {
    pivot,
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
