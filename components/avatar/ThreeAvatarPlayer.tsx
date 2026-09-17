"use client";

import { useEffect, useRef, useState } from "react";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { sampleClip } from "@/lib/avatar/interpolate";
import { poseFromKeyframe, type FingerPose } from "@/lib/avatar/pose";
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

type Props = {
  clip: AvatarClip | null;
  size?: number;
  onReady?: (mode: "procedural" | "vrm") => void;
  onFailed?: () => void;
};

/**
 * Renderiza el avatar en un canvas Three.js. Escena centrada en la mano
 * derecha para que los cinco dedos sean identificables:
 *  - Palma anatómica (dorso oscuro / palma clara).
 *  - Dedos como cápsulas con nudillos esféricos.
 *  - Pulgar rotado 90° respecto al plano de la palma.
 *  - Cascada de flexión progresiva por falange.
 *
 * Cuando `panduro.vrm` está disponible, la infraestructura queda preparada
 * para sustituir el rig procedimental por el VRM.
 */
export function ThreeAvatarPlayer({ clip, size = 320, onReady, onFailed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode] = useState<"procedural" | "vrm">("procedural");

  useEffect(() => {
    let disposed = false;
    let raf = 0;

    (async () => {
      if (!canvasRef.current) return;
      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        onFailed?.();
        return;
      }
      if (disposed) return;

      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(size, size, false);

      const scene = new THREE.Scene();
      // Cámara acercada a la mano derecha: el brazo y la mano ocupan el frame.
      const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 10);
      camera.position.set(0.55, 0.92, 1.1);
      camera.lookAt(RIGHT_SHOULDER_X + 0.15, 0.75, 0.05);

      // Iluminación: ambiental baja + frontal + rim light detrás para volumen.
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(1.5, 3, 2);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xdde6ff, 0.4);
      rim.position.set(-1, 2, -2);
      scene.add(rim);

      const rig = buildProceduralRig(THREE);
      scene.add(rig.group);

      onReady?.("procedural");

      const started = performance.now();

      const loop = () => {
        if (disposed) return;
        const dt = performance.now() - started;
        if (clip) {
          const kf = sampleClip(clip, dt % clip.duration);
          const pose = poseFromKeyframe(kf);
          rig.apply(pose);
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();

      return () => {
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [clip, size, onReady, onFailed]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      data-avatar-status={mode}
      aria-hidden
      className="rounded-xl bg-brand-100 dark:bg-brand-900/40"
      style={{ width: size, height: size }}
    />
  );
}

// ----------------------------------------------------------------------------
// Rig procedimental
// ----------------------------------------------------------------------------

type FingerHandle = {
  root: import("three").Group;
  joints: [import("three").Group, import("three").Group, import("three").Group];
};

type RigHandle = {
  group: import("three").Group;
  apply: (pose: ReturnType<typeof poseFromKeyframe>) => void;
};

function buildProceduralRig(THREE: typeof import("three")): RigHandle {
  const matSkin = new THREE.MeshStandardMaterial({
    color: 0xe8b895,
    roughness: 0.7,
    metalness: 0,
  });
  const matPalm = new THREE.MeshStandardMaterial({
    color: 0xf4d0b3,
    roughness: 0.75,
    metalness: 0,
  });
  const matShirt = new THREE.MeshStandardMaterial({
    color: 0x1a72f2,
    roughness: 0.55,
    metalness: 0,
  });
  const matHair = new THREE.MeshStandardMaterial({
    color: 0x3a2f24,
    roughness: 0.8,
    metalness: 0,
  });
  const matHighlight = new THREE.MeshStandardMaterial({
    color: 0xffb020,
    roughness: 0.45,
    metalness: 0,
  });

  const group = new THREE.Group();

  // Torso
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, BONE_LENGTHS.torso, 12),
    matShirt,
  );
  torso.position.y = SHOULDER_HEIGHT - BONE_LENGTHS.torso / 2;
  group.add(torso);

  // Cabeza (decoración; queda en el borde superior del frame)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(BONE_LENGTHS.head / 2, 20, 16),
    matSkin,
  );
  head.position.y = SHOULDER_HEIGHT + BONE_LENGTHS.neck + BONE_LENGTHS.head / 2;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(BONE_LENGTHS.head / 2 + 0.005, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.2),
    matHair,
  );
  hair.position.copy(head.position);
  group.add(hair);

  // Hombro derecho — pivot del brazo
  const shoulder = new THREE.Group();
  shoulder.position.set(RIGHT_SHOULDER_X, SHOULDER_HEIGHT, 0);
  group.add(shoulder);

  const upperArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.030, BONE_LENGTHS.upperArm - 0.06, 4, 10),
    matSkin,
  );
  upperArm.position.y = -BONE_LENGTHS.upperArm / 2;
  shoulder.add(upperArm);

  const elbow = new THREE.Group();
  elbow.position.y = -BONE_LENGTHS.upperArm;
  shoulder.add(elbow);

  const elbowKnob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), matSkin);
  elbow.add(elbowKnob);

  const foreArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.026, BONE_LENGTHS.foreArm - 0.06, 4, 10),
    matSkin,
  );
  foreArm.position.y = -BONE_LENGTHS.foreArm / 2;
  elbow.add(foreArm);

  const wrist = new THREE.Group();
  wrist.position.y = -BONE_LENGTHS.foreArm;
  elbow.add(wrist);

  // Palma: dorso (más oscuro, atrás) + palma clara (delante) + laterales redondeados
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

  // Bordes redondeados de la palma
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.SphereGeometry(PALM_DEPTH / 2, 10, 8), matSkin);
    edge.position.set((side * PALM_WIDTH) / 2, 0, 0);
    edge.scale.set(0.7, PALM_HEIGHT / PALM_DEPTH, 1);
    palm.add(edge);
  }

  // Base proximal (muñeca ancha) para que la mano no salga plana del antebrazo
  const wristBase = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 10), matSkin);
  wristBase.position.set(0, PALM_HEIGHT / 2, 0);
  palm.add(wristBase);

  // Dedos (index → pinky) anclados al borde distal de la palma
  const fingerRadii: [number, number, number] = [0.014, 0.011, 0.010];
  const spacing = PALM_WIDTH / 4;
  const fingers: FingerHandle[] = [];

  // Pulgar en el lateral radial de la palma
  const thumbBase = new THREE.Group();
  thumbBase.position.set(PALM_WIDTH * 0.48, -PALM_HEIGHT * 0.25, PALM_DEPTH * 0.15);
  thumbBase.rotation.set(0, -Math.PI / 2.4, -THUMB_ABDUCTION);
  palm.add(thumbBase);
  const thumb = buildFinger(THREE, matSkin, "thumb", [
    BONE_LENGTHS.thumb1,
    BONE_LENGTHS.thumb2,
    BONE_LENGTHS.thumb3,
  ], fingerRadii);
  thumbBase.add(thumb.root);
  fingers.push(thumb);

  // Cuatro dedos largos anclados al borde inferior de la palma
  const fingerSpecs: Array<{
    name: string;
    x: number;
    lens: [number, number, number];
  }> = [
    {
      name: "index",
      x: PALM_WIDTH / 2 - spacing * 0.5,
      lens: [BONE_LENGTHS.index1, BONE_LENGTHS.index2, BONE_LENGTHS.index3],
    },
    {
      name: "middle",
      x: PALM_WIDTH / 2 - spacing * 1.5,
      lens: [BONE_LENGTHS.middle1, BONE_LENGTHS.middle2, BONE_LENGTHS.middle3],
    },
    {
      name: "ring",
      x: PALM_WIDTH / 2 - spacing * 2.5,
      lens: [BONE_LENGTHS.ring1, BONE_LENGTHS.ring2, BONE_LENGTHS.ring3],
    },
    {
      name: "pinky",
      x: PALM_WIDTH / 2 - spacing * 3.5,
      lens: [BONE_LENGTHS.pinky1, BONE_LENGTHS.pinky2, BONE_LENGTHS.pinky3],
    },
  ];
  for (const spec of fingerSpecs) {
    const anchor = new THREE.Group();
    anchor.position.set(spec.x, -PALM_HEIGHT / 2, PALM_DEPTH * 0.05);
    palm.add(anchor);
    // Nudillo (esfera que oculta la unión)
    const knuckle = new THREE.Mesh(
      new THREE.SphereGeometry(KNUCKLE_RADIUS, 12, 10),
      matSkin,
    );
    anchor.add(knuckle);
    const f = buildFinger(THREE, matSkin, spec.name, spec.lens, fingerRadii);
    anchor.add(f.root);
    fingers.push(f);
  }

  // Highlight en la yema del índice para pintar la mano dominante
  const indexTipMesh = fingers[1]!.joints[2].children.find(
    (c): c is import("three").Mesh => (c as import("three").Mesh).isMesh === true,
  );
  if (indexTipMesh) indexTipMesh.material = matHighlight;

  function apply(pose: ReturnType<typeof poseFromKeyframe>) {
    shoulder.rotation.set(pose.shoulder[0], pose.shoulder[1], pose.shoulder[2]);
    elbow.rotation.set(-pose.elbow, 0, 0);
    wrist.rotation.set(pose.wrist[0], pose.wrist[1], pose.wrist[2]);
    applyFingerFlex(fingers[0]!, pose.fingers[0]);
    applyFingerFlex(fingers[1]!, pose.fingers[1]);
    applyFingerFlex(fingers[2]!, pose.fingers[2]);
    applyFingerFlex(fingers[3]!, pose.fingers[3]);
    applyFingerFlex(fingers[4]!, pose.fingers[4]);
  }

  return { group, apply };
}

function applyFingerFlex(finger: FingerHandle, flex: FingerPose) {
  finger.joints[0].rotation.x = -flex.proximal;
  finger.joints[1].rotation.x = -flex.middle;
  finger.joints[2].rotation.x = -flex.distal;
}

function buildFinger(
  THREE: typeof import("three"),
  material: import("three").Material,
  name: string,
  lengths: [number, number, number],
  radii: [number, number, number],
): FingerHandle {
  const seg = (len: number, r: number) => {
    const geo = new THREE.CapsuleGeometry(r, Math.max(len - r * 2, 0.001), 4, 8);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = -len / 2;
    return mesh;
  };

  const g1 = new THREE.Group();
  g1.name = `${name}1`;
  g1.add(seg(lengths[0], radii[0]));

  const g2 = new THREE.Group();
  g2.name = `${name}2`;
  g2.position.y = -lengths[0];
  g2.add(seg(lengths[1], radii[1]));

  const g3 = new THREE.Group();
  g3.name = `${name}3`;
  g3.position.y = -lengths[1];
  g3.add(seg(lengths[2], radii[2]));

  g2.add(g3);
  g1.add(g2);

  return { root: g1, joints: [g1, g2, g3] };
}
