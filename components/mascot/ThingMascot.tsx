"use client";

import { useEffect, useRef, useState } from "react";
import { THING_CLIPS } from "@/lib/mascot/clips";
import { sampleClip } from "@/lib/avatar/interpolate";
import { poseFromKeyframe } from "@/lib/avatar/pose";
import {
  BONE_LENGTHS,
  KNUCKLE_RADIUS,
  PALM_DEPTH,
  PALM_HEIGHT,
  PALM_WIDTH,
  RIGHT_SHOULDER_X,
  SHOULDER_HEIGHT,
  THUMB_ABDUCTION,
} from "@/lib/avatar/rig";

export type MascotState = "idle" | "correct" | "incorrect" | "celebrate";

type Props = {
  state: MascotState;
  className?: string;
};

/**
 * Mascota "Thing": mano derecha articulada renderizada al revés, estilo
 * personaje de la Familia Addams. Reacciona a los resultados de los ejercicios.
 *
 * Se renderiza como un canvas pequeño de 96×120 px con Three.js y vuelve
 * a estado idle automáticamente después de 2 s (correcto/incorrecto) o
 * 2,5 s (celebrate).
 */
export function ThingMascot({ state, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    let disposed = false;
    let raf = 0;

    (async () => {
      if (!canvasRef.current) return;
      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        return;
      }
      if (disposed) return;

      const W = 96;
      const H = 120;
      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(W, H, false);

      const scene = new THREE.Scene();

      // Cámara ortográfica apuntando a la mano, con up=(0,-1,0) para invertirla.
      const halfH = 0.28;
      const halfW = halfH * (W / H);
      const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 10);
      camera.position.set(RIGHT_SHOULDER_X + 0.05, SHOULDER_HEIGHT - BONE_LENGTHS.upperArm - BONE_LENGTHS.foreArm - 0.05, 1.5);
      camera.lookAt(RIGHT_SHOULDER_X + 0.05, SHOULDER_HEIGHT - BONE_LENGTHS.upperArm - BONE_LENGTHS.foreArm - 0.05, 0);
      camera.up.set(0, -1, 0);
      camera.updateProjectionMatrix();

      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(1, 2, 2);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xdde6ff, 0.35);
      rim.position.set(-1, -1, -2);
      scene.add(rim);

      const rig = buildHandRig(THREE);
      scene.add(rig.group);

      const started = performance.now();
      const clip = THING_CLIPS[state];
      const looping = state === "idle";

      const loop = () => {
        if (disposed) return;
        const dt = performance.now() - started;
        const t = looping ? dt % clip.duration : Math.min(dt, clip.duration - 1);
        const kf = sampleClip(clip, t);
        const pose = poseFromKeyframe(kf);
        rig.apply(pose);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();

      return () => { renderer.dispose(); };
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mounted, state]);

  if (!mounted) return null;

  return (
    <canvas
      ref={canvasRef}
      width={96}
      height={120}
      aria-hidden
      className={className}
      style={{ width: 96, height: 120 }}
    />
  );
}

// ----------------------------------------------------------------------------
// Rig simplificado: solo la mano (sin torso ni cabeza).
// ----------------------------------------------------------------------------

type FingerHandle = {
  root: import("three").Group;
  joints: [import("three").Group, import("three").Group, import("three").Group];
};

type HandRig = {
  group: import("three").Group;
  apply: (pose: ReturnType<typeof poseFromKeyframe>) => void;
};

function buildHandRig(THREE: typeof import("three")): HandRig {
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xe8b895, roughness: 0.7, metalness: 0 });
  const matPalm = new THREE.MeshStandardMaterial({ color: 0xf4d0b3, roughness: 0.75, metalness: 0 });

  const group = new THREE.Group();
  group.position.set(RIGHT_SHOULDER_X, SHOULDER_HEIGHT, 0);

  // Antebrazo (visible en la parte superior porque la cámara está al revés)
  const foreArmGroup = new THREE.Group();
  foreArmGroup.position.y = -BONE_LENGTHS.upperArm;
  group.add(foreArmGroup);

  const foreArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.024, BONE_LENGTHS.foreArm - 0.05, 4, 8),
    matSkin,
  );
  foreArm.position.y = -BONE_LENGTHS.foreArm / 2;
  foreArmGroup.add(foreArm);

  const wrist = new THREE.Group();
  wrist.position.y = -BONE_LENGTHS.foreArm;
  foreArmGroup.add(wrist);

  // Palma
  const palm = new THREE.Group();
  palm.position.y = -PALM_HEIGHT / 2;
  wrist.add(palm);

  const dorso = new THREE.Mesh(
    new THREE.BoxGeometry(PALM_WIDTH, PALM_HEIGHT, PALM_DEPTH * 0.55),
    matSkin,
  );
  dorso.position.z = -PALM_DEPTH * 0.22;
  palm.add(dorso);

  const palma = new THREE.Mesh(
    new THREE.BoxGeometry(PALM_WIDTH * 0.9, PALM_HEIGHT * 0.9, PALM_DEPTH * 0.55),
    matPalm,
  );
  palma.position.z = PALM_DEPTH * 0.22;
  palm.add(palma);

  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.SphereGeometry(PALM_DEPTH / 2, 8, 6), matSkin);
    edge.position.set((side * PALM_WIDTH) / 2, 0, 0);
    edge.scale.set(0.7, PALM_HEIGHT / PALM_DEPTH, 1);
    palm.add(edge);
  }

  const fingerRadii: [number, number, number] = [0.013, 0.010, 0.009];
  const spacing = PALM_WIDTH / 4;
  const fingers: FingerHandle[] = [];

  // Pulgar
  const thumbBase = new THREE.Group();
  thumbBase.position.set(PALM_WIDTH * 0.48, -PALM_HEIGHT * 0.25, PALM_DEPTH * 0.15);
  thumbBase.rotation.set(0, -Math.PI / 2.4, -THUMB_ABDUCTION);
  palm.add(thumbBase);
  const thumb = buildFinger(THREE, matSkin, "thumb", [
    BONE_LENGTHS.thumb1, BONE_LENGTHS.thumb2, BONE_LENGTHS.thumb3,
  ], fingerRadii);
  thumbBase.add(thumb.root);
  fingers.push(thumb);

  // Cuatro dedos largos
  const specs = [
    { x: PALM_WIDTH / 2 - spacing * 0.5, lens: [BONE_LENGTHS.index1, BONE_LENGTHS.index2, BONE_LENGTHS.index3] as [number, number, number] },
    { x: PALM_WIDTH / 2 - spacing * 1.5, lens: [BONE_LENGTHS.middle1, BONE_LENGTHS.middle2, BONE_LENGTHS.middle3] as [number, number, number] },
    { x: PALM_WIDTH / 2 - spacing * 2.5, lens: [BONE_LENGTHS.ring1, BONE_LENGTHS.ring2, BONE_LENGTHS.ring3] as [number, number, number] },
    { x: PALM_WIDTH / 2 - spacing * 3.5, lens: [BONE_LENGTHS.pinky1, BONE_LENGTHS.pinky2, BONE_LENGTHS.pinky3] as [number, number, number] },
  ];
  for (const spec of specs) {
    const anchor = new THREE.Group();
    anchor.position.set(spec.x, -PALM_HEIGHT / 2, PALM_DEPTH * 0.05);
    palm.add(anchor);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS, 10, 8), matSkin);
    anchor.add(knuckle);
    const f = buildFinger(THREE, matSkin, "f", spec.lens, fingerRadii);
    anchor.add(f.root);
    fingers.push(f);
  }

  function apply(pose: ReturnType<typeof poseFromKeyframe>) {
    foreArmGroup.rotation.set(pose.shoulder[0], pose.shoulder[1], pose.shoulder[2]);
    wrist.rotation.set(pose.wrist[0], pose.wrist[1], pose.wrist[2]);
    for (let i = 0; i < 5; i++) {
      const f = fingers[i];
      const fp = pose.fingers[i];
      if (!f || !fp) continue;
      f.joints[0].rotation.x = -fp.proximal;
      f.joints[1].rotation.x = -fp.middle;
      f.joints[2].rotation.x = -fp.distal;
    }
  }

  return { group, apply };
}

function buildFinger(
  THREE: typeof import("three"),
  material: import("three").Material,
  name: string,
  lengths: [number, number, number],
  radii: [number, number, number],
): FingerHandle {
  const seg = (len: number, r: number) => {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, Math.max(len - r * 2, 0.001), 4, 8),
      material,
    );
    mesh.position.y = -len / 2;
    return mesh;
  };

  const g1 = new THREE.Group(); g1.name = `${name}1`; g1.add(seg(lengths[0], radii[0]));
  const g2 = new THREE.Group(); g2.name = `${name}2`; g2.position.y = -lengths[0]; g2.add(seg(lengths[1], radii[1]));
  const g3 = new THREE.Group(); g3.name = `${name}3`; g3.position.y = -lengths[1]; g3.add(seg(lengths[2], radii[2]));

  g2.add(g3);
  g1.add(g2);
  return { root: g1, joints: [g1, g2, g3] };
}
