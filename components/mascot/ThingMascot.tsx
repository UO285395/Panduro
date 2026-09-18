"use client";

import { useEffect, useRef, useState } from "react";
import { THING_CLIPS } from "@/lib/mascot/clips";
import { sampleClip } from "@/lib/avatar/interpolate";
import { distributeFlex } from "@/lib/avatar/pose";
import type { AvatarKeyframe } from "@/lib/curriculum/schema";
import {
  BONE_LENGTHS,
  KNUCKLE_RADIUS,
  PALM_DEPTH,
  PALM_HEIGHT,
  PALM_WIDTH,
  THUMB_ABDUCTION,
} from "@/lib/avatar/rig";

export type MascotState = "idle" | "correct" | "incorrect" | "celebrate";

type Props = {
  state: MascotState;
  className?: string;
};

/**
 * Mascota "Thing" de la Familia Addams: mano aislada con el antebrazo
 * emergiendo desde la parte inferior del canvas y los dedos apuntando
 * hacia arriba. Se anima según el resultado del ejercicio.
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H, false);

      const scene = new THREE.Scene();

      // Ortográfica — dedos hacia arriba, antebrazo emergiendo desde abajo.
      const halfH = 0.19;
      const halfW = halfH * (W / H);
      const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 10);
      camera.position.set(0, 0.05, 1.5);
      camera.lookAt(0, 0.05, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 0.45));
      const key = new THREE.DirectionalLight(0xffffff, 0.85);
      key.position.set(0.8, 2, 2);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xd8e8ff, 0.35);
      fill.position.set(-0.8, 0, 1);
      scene.add(fill);

      const rig = buildThingRig(THREE);
      scene.add(rig.group);

      const started = performance.now();
      const clip = THING_CLIPS[state];
      const looping = state === "idle";

      const loop = () => {
        if (disposed) return;
        const dt = performance.now() - started;
        const t = looping ? dt % clip.duration : Math.min(dt, clip.duration - 1);
        const kf = sampleClip(clip, t);
        rig.apply(kf);
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

// ---------------------------------------------------------------------------
// Rig autónomo estilo "Thing": palma en el centro, dedos hacia +Y,
// antebrazo hacia -Y (parcialmente fuera del canvas = efecto "emergiendo").
// ---------------------------------------------------------------------------

type FingerHandle = {
  root: import("three").Group;
  joints: [import("three").Group, import("three").Group, import("three").Group];
};

type ThingRig = {
  group: import("three").Group;
  apply: (kf: AvatarKeyframe) => void;
};

function buildThingRig(THREE: typeof import("three")): ThingRig {
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xe0aa78, roughness: 0.65, metalness: 0 });
  const matPalm = new THREE.MeshStandardMaterial({ color: 0xf0c89a, roughness: 0.70, metalness: 0 });

  // Grupo raíz — se traslada y rota en apply() para las animaciones del clip.
  const group = new THREE.Group();

  // Antebrazo stub (emerge desde abajo del canvas).
  const foreArmStub = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.024, 0.10, 4, 8),
    matSkin,
  );
  foreArmStub.position.y = -(PALM_HEIGHT / 2 + 0.06);
  group.add(foreArmStub);

  // Muñeca (esfera de unión entre antebrazo y palma).
  const wristSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.027, 12, 10),
    matSkin,
  );
  wristSphere.position.y = -PALM_HEIGHT / 2;
  group.add(wristSphere);

  // Dorso de la palma.
  const dorso = new THREE.Mesh(
    new THREE.BoxGeometry(PALM_WIDTH, PALM_HEIGHT, PALM_DEPTH * 0.55),
    matSkin,
  );
  dorso.position.z = -PALM_DEPTH * 0.22;
  group.add(dorso);

  // Cara palmar (más clara).
  const palma = new THREE.Mesh(
    new THREE.BoxGeometry(PALM_WIDTH * 0.9, PALM_HEIGHT * 0.88, PALM_DEPTH * 0.55),
    matPalm,
  );
  palma.position.z = PALM_DEPTH * 0.22;
  group.add(palma);

  // Bordes laterales redondeados.
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.SphereGeometry(PALM_DEPTH / 2, 8, 6),
      matSkin,
    );
    edge.position.set((side * PALM_WIDTH) / 2, 0, 0);
    edge.scale.set(0.7, PALM_HEIGHT / PALM_DEPTH, 1);
    group.add(edge);
  }

  const fingerRadii: [number, number, number] = [0.013, 0.010, 0.008];
  const spacing = PALM_WIDTH / 4;
  const fingers: FingerHandle[] = [];

  // Pulgar — sale del lateral radial (derecha de la palma desde el punto de
  // vista del espectador cuando ve el dorso).
  const thumbBase = new THREE.Group();
  thumbBase.position.set(PALM_WIDTH * 0.46, PALM_HEIGHT * 0.05, PALM_DEPTH * 0.10);
  thumbBase.rotation.set(-0.25, -Math.PI / 2.4, -THUMB_ABDUCTION);
  group.add(thumbBase);
  const thumb = buildFingerUp(THREE, matSkin, "thumb", [
    BONE_LENGTHS.thumb1, BONE_LENGTHS.thumb2, BONE_LENGTHS.thumb3,
  ], fingerRadii);
  thumbBase.add(thumb.root);
  fingers.push(thumb);

  // Cuatro dedos largos que arrancan desde el borde superior de la palma (+Y).
  const fingerSpecs: Array<{ x: number; lens: [number, number, number] }> = [
    { x: PALM_WIDTH / 2 - spacing * 0.5,  lens: [BONE_LENGTHS.index1, BONE_LENGTHS.index2, BONE_LENGTHS.index3] },
    { x: PALM_WIDTH / 2 - spacing * 1.5,  lens: [BONE_LENGTHS.middle1, BONE_LENGTHS.middle2, BONE_LENGTHS.middle3] },
    { x: PALM_WIDTH / 2 - spacing * 2.5,  lens: [BONE_LENGTHS.ring1, BONE_LENGTHS.ring2, BONE_LENGTHS.ring3] },
    { x: PALM_WIDTH / 2 - spacing * 3.5,  lens: [BONE_LENGTHS.pinky1, BONE_LENGTHS.pinky2, BONE_LENGTHS.pinky3] },
  ];

  for (const spec of fingerSpecs) {
    const anchor = new THREE.Group();
    anchor.position.set(spec.x, PALM_HEIGHT / 2, PALM_DEPTH * 0.05);
    group.add(anchor);

    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS, 10, 8), matSkin);
    anchor.add(knuckle);

    const f = buildFingerUp(THREE, matSkin, "f", spec.lens, fingerRadii);
    anchor.add(f.root);
    fingers.push(f);
  }

  function apply(kf: AvatarKeyframe) {
    // Traslación suave para las animaciones de los clips.
    group.position.set(kf.hand.x * 0.055, kf.hand.y * 0.055 - 0.04, 0);
    // Rotación de muñeca.
    group.rotation.set(kf.hand.rot[0], kf.hand.rot[1], kf.hand.rot[2]);
    // Flexión de dedos (cerrar = curva hacia la cámara).
    for (let i = 0; i < 5; i++) {
      const f = fingers[i]!;
      const fp = distributeFlex(kf.fingers[i]);
      f.joints[0].rotation.x = fp.proximal;
      f.joints[1].rotation.x = fp.middle;
      f.joints[2].rotation.x = fp.distal;
    }
  }

  return { group, apply };
}

/** Construye un dedo con segmentos que se extienden hacia arriba (+Y). */
function buildFingerUp(
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
    mesh.position.y = len / 2; // segmento hacia arriba (+Y)
    return mesh;
  };

  const g1 = new THREE.Group();
  g1.name = `${name}1`;
  g1.add(seg(lengths[0], radii[0]));

  const g2 = new THREE.Group();
  g2.name = `${name}2`;
  g2.position.y = lengths[0]; // hacia arriba
  g2.add(seg(lengths[1], radii[1]));
  g2.add(new THREE.Mesh(new THREE.SphereGeometry(radii[1] * 1.1, 8, 6), material)); // PIP

  const g3 = new THREE.Group();
  g3.name = `${name}3`;
  g3.position.y = lengths[1]; // hacia arriba
  g3.add(seg(lengths[2], radii[2]));
  g3.add(new THREE.Mesh(new THREE.SphereGeometry(radii[2] * 1.1, 8, 6), material)); // DIP

  g2.add(g3);
  g1.add(g2);
  return { root: g1, joints: [g1, g2, g3] };
}
