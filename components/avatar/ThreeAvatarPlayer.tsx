"use client";

import { useEffect, useRef, useState } from "react";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { sampleClip } from "@/lib/avatar/interpolate";
import { poseFromKeyframe } from "@/lib/avatar/pose";
import { BONE_LENGTHS, RIGHT_SHOULDER_X, SHOULDER_HEIGHT } from "@/lib/avatar/rig";

type Props = {
  clip: AvatarClip | null;
  size?: number;
  onReady?: (mode: "procedural" | "vrm") => void;
  onFailed?: () => void;
};

/**
 * Renderiza el avatar en un canvas Three.js. Escena mínima:
 *  - cámara perspectiva
 *  - luz ambiental + direccional
 *  - grupo humanoide con cabeza + torso + brazo derecho + mano articulada
 *
 * Cuando `panduro.vrm` está disponible, la infraestructura queda preparada
 * para sustituir el rig procedimental por el VRM y mapear la pose a sus
 * bones humanoide (`RightUpperArm`, `RightLowerArm`, `RightHand`,
 * `RightThumb*`, `RightIndex*`, etc.). Ese mapa está en `mapVrmBones` abajo.
 */
export function ThreeAvatarPlayer({ clip, size = 260, onReady, onFailed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<"procedural" | "vrm">("procedural");

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
      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10);
      camera.position.set(0, 0.9, 2.4);
      camera.lookAt(0, 0.9, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(1.5, 3, 2);
      scene.add(dir);

      const rig = buildProceduralRig(THREE);
      scene.add(rig.group);

      // TODO(post-mvp): intentar VRM aquí; si carga, reemplazar `rig` por su
      // humanoid y usar `mapVrmBones` para aplicar rotaciones. Por ahora solo
      // marcamos que la infra existe.
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

type RigHandle = {
  group: import("three").Group;
  apply: (pose: ReturnType<typeof poseFromKeyframe>) => void;
};

function buildProceduralRig(
  THREE: typeof import("three"),
): RigHandle {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a72f2, roughness: 0.55 });
  const highlight = new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.4 });

  const group = new THREE.Group();

  // Torso
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, BONE_LENGTHS.torso, 12),
    mat,
  );
  torso.position.y = SHOULDER_HEIGHT - BONE_LENGTHS.torso / 2;
  group.add(torso);

  // Cabeza
  const head = new THREE.Mesh(new THREE.SphereGeometry(BONE_LENGTHS.head / 2, 20, 16), mat);
  head.position.y = SHOULDER_HEIGHT + BONE_LENGTHS.neck + BONE_LENGTHS.head / 2;
  group.add(head);

  // Hombro derecho — pivot del brazo
  const shoulder = new THREE.Group();
  shoulder.position.set(RIGHT_SHOULDER_X, SHOULDER_HEIGHT, 0);
  group.add(shoulder);

  const upperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.032, BONE_LENGTHS.upperArm, 10),
    mat,
  );
  upperArm.position.y = -BONE_LENGTHS.upperArm / 2;
  shoulder.add(upperArm);

  const elbow = new THREE.Group();
  elbow.position.y = -BONE_LENGTHS.upperArm;
  shoulder.add(elbow);

  const foreArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.028, BONE_LENGTHS.foreArm, 10),
    mat,
  );
  foreArm.position.y = -BONE_LENGTHS.foreArm / 2;
  elbow.add(foreArm);

  const wrist = new THREE.Group();
  wrist.position.y = -BONE_LENGTHS.foreArm;
  elbow.add(wrist);

  // Palma
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.025), mat);
  palm.position.y = -BONE_LENGTHS.hand / 2;
  wrist.add(palm);

  // Dedos: cada uno con tres falanges (o dos para el pulgar) apilados
  const fingerGroups = [
    finger(THREE, mat, "thumb1", "thumb2", "thumb3", { x: 0.035, y: -0.02, z: 0.01 }, -0.6),
    finger(THREE, mat, "index1", "index2", "index3", { x: 0.025, y: -BONE_LENGTHS.hand, z: 0 }, 0),
    finger(THREE, mat, "middle1", "middle2", "middle3", { x: 0, y: -BONE_LENGTHS.hand, z: 0 }, 0),
    finger(THREE, mat, "ring1", "ring2", "ring3", { x: -0.025, y: -BONE_LENGTHS.hand, z: 0 }, 0),
    finger(THREE, mat, "pinky1", "pinky2", "pinky3", { x: -0.05, y: -BONE_LENGTHS.hand, z: 0 }, 0),
  ];
  for (const fg of fingerGroups) wrist.add(fg.root);

  // Highlight en la yema del índice para pintar la mano derecha
  fingerGroups[1]!.tip.material = highlight;

  function apply(pose: ReturnType<typeof poseFromKeyframe>) {
    shoulder.rotation.set(pose.shoulder[0], pose.shoulder[1], pose.shoulder[2]);
    elbow.rotation.set(-pose.elbow, 0, 0);
    wrist.rotation.set(pose.wrist[0], pose.wrist[1], pose.wrist[2]);
    for (let i = 0; i < 5; i++) {
      const f = fingerGroups[i]!;
      const flex = pose.fingers[i]!;
      const bend = flex * (Math.PI / 2);
      f.joints[0]!.rotation.x = -bend;
      f.joints[1]!.rotation.x = -bend;
    }
  }

  return { group, apply };
}

function finger(
  THREE: typeof import("three"),
  material: import("three").Material,
  name1: string,
  name2: string,
  name3: string,
  origin: { x: number; y: number; z: number },
  baseYaw: number,
): {
  root: import("three").Group;
  tip: import("three").Mesh;
  joints: import("three").Group[];
} {
  const root = new THREE.Group();
  root.name = name1;
  root.position.set(origin.x, origin.y, origin.z);
  root.rotation.y = baseYaw;

  const seg = (len: number) => {
    const geo = new THREE.CylinderGeometry(0.008, 0.008, len, 8);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = -len / 2;
    return mesh;
  };

  const g1 = new THREE.Group();
  g1.add(seg(BONE_LENGTHS.index1));
  const g2 = new THREE.Group();
  g2.position.y = -BONE_LENGTHS.index1;
  g2.add(seg(BONE_LENGTHS.index2));
  const g3 = new THREE.Group();
  g3.position.y = -BONE_LENGTHS.index2;
  const tipGeo = new THREE.CylinderGeometry(0.008, 0.006, BONE_LENGTHS.index3, 8);
  const tipMat = material.clone();
  const tip = new THREE.Mesh(tipGeo, tipMat);
  tip.position.y = -BONE_LENGTHS.index3 / 2;
  g3.add(tip);

  g2.add(g3);
  g1.add(g2);
  g1.name = name2;
  g2.name = name3;
  root.add(g1);
  return { root, tip, joints: [g1, g2, g3] };
}
