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
 * Avatar 3D con cámara dinámica que sigue la mano.
 * La mano ocupa ~60% del canvas y la cámara suaviza el seguimiento.
 *
 * Materiales MeshPhysicalMaterial con clearcoat para piel realista.
 * Palma con eminencias tenar/hipotenar. Dedos con CapsuleGeometry de
 * 8 lados y nudillos esféricos. Iluminación de tres puntos.
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size, false);
      renderer.shadowMap.enabled = false;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xfff3e8);

      // Cámara ortográfica — halfH 0.20 para que la mano tenga margen.
      const halfH = 0.20;
      const camera = new THREE.OrthographicCamera(-halfH, halfH, halfH, -halfH, 0.01, 10);
      // Inicializar la cámara directamente en la posición del primer keyframe para
      // evitar el LERP largo desde una posición incorrecta.
      const initKf = clip?.keyframes[0];
      let camX = RIGHT_SHOULDER_X + (initKf ? initKf.hand.x * 0.5 : 0.05);
      let camY = initKf
        ? SHOULDER_HEIGHT + initKf.hand.y * 0.5
          - BONE_LENGTHS.upperArm * 0.5
          - BONE_LENGTHS.foreArm * 0.3
        : SHOULDER_HEIGHT - BONE_LENGTHS.upperArm - BONE_LENGTHS.foreArm * 0.5;
      camera.position.set(camX, camY, 1.5);
      camera.lookAt(camX, camY, 0);

      // Iluminación de tres puntos más hemisphere para ambient suave.
      const hemi = new THREE.HemisphereLight(0xfff0e0, 0x806040, 0.45);
      scene.add(hemi);

      const key = new THREE.DirectionalLight(0xfffaf0, 1.05);
      key.position.set(0.8, 2.5, 2.0);
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xd0e8ff, 0.45);
      fill.position.set(-1.2, 1.5, 1.5);
      scene.add(fill);

      const rim = new THREE.DirectionalLight(0xffd8b0, 0.3);
      rim.position.set(0.0, -1.0, -1.5);
      scene.add(rim);

      const rig = buildProceduralRig(THREE);
      scene.add(rig.group);

      onReady?.("procedural");

      const started = performance.now();

      const loop = () => {
        if (disposed) return;
        const dt = performance.now() - started;

        let kf = clip ? sampleClip(clip, dt % clip.duration) : null;
        if (clip && kf) {
          const pose = poseFromKeyframe(kf);
          rig.apply(pose);

          // Seguimiento suave de la cámara hacia la posición de la mano.
          const targetX = RIGHT_SHOULDER_X + kf.hand.x * 0.5;
          const targetY = SHOULDER_HEIGHT + kf.hand.y * 0.5
            - BONE_LENGTHS.upperArm * 0.5
            - BONE_LENGTHS.foreArm * 0.3;
          const LERP = 0.04;
          camX += (targetX - camX) * LERP;
          camY += (targetY - camY) * LERP;
          camera.position.set(camX, camY, 1.5);
          camera.lookAt(camX, camY, 0);
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
      className="rounded-xl"
      style={{ width: size, height: size }}
    />
  );
}

// ----------------------------------------------------------------------------
// Rig procedimental mejorado
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
  // MeshStandardMaterial: compatible con software WebGL / SwiftShader en Windows.
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xe0aa78, roughness: 0.62, metalness: 0 });
  const matPalm = new THREE.MeshStandardMaterial({ color: 0xf0c89a, roughness: 0.68, metalness: 0 });
  const matShirt = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.55, metalness: 0 });
  const matNail = new THREE.MeshStandardMaterial({ color: 0xf8e0c8, roughness: 0.30, metalness: 0 });
  const matHighlight = new THREE.MeshStandardMaterial({ color: 0xff9900, roughness: 0.42, metalness: 0.05 });

  const group = new THREE.Group();

  // Torso (decoración de fondo, se ve parcialmente).
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, BONE_LENGTHS.torso, 16),
    matShirt,
  );
  torso.position.y = SHOULDER_HEIGHT - BONE_LENGTHS.torso / 2;
  group.add(torso);

  // Hombro derecho — pivot del brazo.
  const shoulder = new THREE.Group();
  shoulder.position.set(RIGHT_SHOULDER_X, SHOULDER_HEIGHT, 0);
  group.add(shoulder);

  const upperArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.031, BONE_LENGTHS.upperArm - 0.06, 6, 14),
    matSkin,
  );
  upperArm.position.y = -BONE_LENGTHS.upperArm / 2;
  shoulder.add(upperArm);

  const elbow = new THREE.Group();
  elbow.position.y = -BONE_LENGTHS.upperArm;
  shoulder.add(elbow);

  const elbowKnob = new THREE.Mesh(new THREE.SphereGeometry(0.030, 16, 14), matSkin);
  elbow.add(elbowKnob);

  const foreArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.027, BONE_LENGTHS.foreArm - 0.06, 6, 14),
    matSkin,
  );
  foreArm.position.y = -BONE_LENGTHS.foreArm / 2;
  elbow.add(foreArm);

  const wrist = new THREE.Group();
  wrist.position.y = -BONE_LENGTHS.foreArm;
  elbow.add(wrist);

  // ── Palma mejorada ──────────────────────────────────────────────────────

  const palm = new THREE.Group();
  palm.position.y = -PALM_HEIGHT / 2;
  wrist.add(palm);

  // Dorso de la mano (más oscuro).
  const dorso = new THREE.Mesh(
    new THREE.BoxGeometry(PALM_WIDTH, PALM_HEIGHT, PALM_DEPTH * 0.55),
    matSkin,
  );
  dorso.position.z = -PALM_DEPTH * 0.22;
  palm.add(dorso);

  // Palmar (más claro).
  const palma = new THREE.Mesh(
    new THREE.BoxGeometry(PALM_WIDTH * 0.9, PALM_HEIGHT * 0.88, PALM_DEPTH * 0.55),
    matPalm,
  );
  palma.position.z = PALM_DEPTH * 0.22;
  palm.add(palma);

  // Bordes redondeados laterales.
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.SphereGeometry(PALM_DEPTH / 2, 12, 10),
      side === 1 ? matSkin : matSkin,
    );
    edge.position.set((side * PALM_WIDTH) / 2, 0, 0);
    edge.scale.set(0.7, PALM_HEIGHT / PALM_DEPTH, 1);
    palm.add(edge);
  }

  // Eminencia tenar (base del pulgar — músculo otenar).
  const thenar = new THREE.Mesh(
    new THREE.SphereGeometry(0.023, 14, 10),
    matPalm,
  );
  thenar.position.set(PALM_WIDTH * 0.42, PALM_HEIGHT * 0.10, PALM_DEPTH * 0.25);
  thenar.scale.set(1, 1.4, 0.85);
  palm.add(thenar);

  // Eminencia hipotenar (base del meñique).
  const hypothenar = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 14, 10),
    matPalm,
  );
  hypothenar.position.set(-PALM_WIDTH * 0.42, PALM_HEIGHT * 0.15, PALM_DEPTH * 0.20);
  hypothenar.scale.set(0.8, 1.2, 0.8);
  palm.add(hypothenar);

  // Muñeca base (esfera que une antebrazo con palma).
  const wristBase = new THREE.Mesh(
    new THREE.SphereGeometry(0.030, 16, 12),
    matSkin,
  );
  wristBase.position.set(0, PALM_HEIGHT / 2, 0);
  palm.add(wristBase);

  // ── Dedos ───────────────────────────────────────────────────────────────

  const fingerRadii: [number, number, number] = [0.015, 0.012, 0.010];
  const spacing = PALM_WIDTH / 4;
  const fingers: FingerHandle[] = [];

  // Pulgar en el lateral radial.
  const thumbBase = new THREE.Group();
  thumbBase.position.set(PALM_WIDTH * 0.48, -PALM_HEIGHT * 0.22, PALM_DEPTH * 0.15);
  thumbBase.rotation.set(0, -Math.PI / 2.2, -THUMB_ABDUCTION);
  palm.add(thumbBase);

  const thumb = buildFinger(THREE, matSkin, matNail, "thumb", [
    BONE_LENGTHS.thumb1,
    BONE_LENGTHS.thumb2,
    BONE_LENGTHS.thumb3,
  ], fingerRadii);
  thumbBase.add(thumb.root);
  fingers.push(thumb);

  // Cuatro dedos largos.
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

    // Nudillo (articulación MCP).
    const knuckle = new THREE.Mesh(
      new THREE.SphereGeometry(KNUCKLE_RADIUS * 1.1, 14, 12),
      matSkin,
    );
    anchor.add(knuckle);

    const f = buildFinger(THREE, matSkin, matNail, spec.name, spec.lens, fingerRadii);
    anchor.add(f.root);
    fingers.push(f);
  }

  // Uña destacada en el índice para identificar la mano dominante.
  const indexTip = fingers[1]!.joints[2];
  const nail = new THREE.Mesh(
    new THREE.BoxGeometry(fingerRadii[2] * 1.6, fingerRadii[2] * 0.5, BONE_LENGTHS.index3 * 0.55),
    matHighlight,
  );
  nail.position.set(0, -BONE_LENGTHS.index3 * 0.4, fingerRadii[2] * 0.9);
  indexTip.add(nail);

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
  nailMat: import("three").Material,
  name: string,
  lengths: [number, number, number],
  radii: [number, number, number],
): FingerHandle {
  const seg = (len: number, r: number, tip: boolean) => {
    const geo = new THREE.CapsuleGeometry(r, Math.max(len - r * 2, 0.002), 8, 12);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = -len / 2;
    return mesh;
  };

  const g1 = new THREE.Group();
  g1.name = `${name}1`;
  g1.add(seg(lengths[0], radii[0], false));

  const g2 = new THREE.Group();
  g2.name = `${name}2`;
  g2.position.y = -lengths[0];
  g2.add(seg(lengths[1], radii[1], false));

  // PIP knuckle
  const pip = new THREE.Mesh(new THREE.SphereGeometry(radii[1] * 1.15, 10, 8), material);
  g2.add(pip);

  const g3 = new THREE.Group();
  g3.name = `${name}3`;
  g3.position.y = -lengths[1];
  g3.add(seg(lengths[2], radii[2], true));

  // DIP knuckle
  const dip = new THREE.Mesh(new THREE.SphereGeometry(radii[2] * 1.15, 10, 8), material);
  g3.add(dip);

  g2.add(g3);
  g1.add(g2);

  return { root: g1, joints: [g1, g2, g3] };
}
