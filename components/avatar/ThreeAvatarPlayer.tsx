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
 * Avatar 3D — rig procedimental de alta calidad.
 * Palma elipsoidal, dedos con LatheGeometry cónica + nudillos,
 * iluminación de 4 puntos con hemisférica.
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

      // Cámara ortográfica — halfH 0.22 con foco en la mano.
      const halfH = 0.22;
      const camera = new THREE.OrthographicCamera(-halfH, halfH, halfH, -halfH, 0.01, 10);
      const initKf = clip?.keyframes[0];
      let camX = RIGHT_SHOULDER_X + (initKf ? initKf.hand.x * 0.5 : 0.05);
      let camY = initKf
        ? SHOULDER_HEIGHT + initKf.hand.y * 0.5
          - BONE_LENGTHS.upperArm * 0.5
          - BONE_LENGTHS.foreArm * 0.3
        : SHOULDER_HEIGHT - BONE_LENGTHS.upperArm - BONE_LENGTHS.foreArm * 0.5;
      camera.position.set(camX, camY, 1.5);
      camera.lookAt(camX, camY, 0);

      // ── Iluminación de 4 puntos ──────────────────────────────────────────
      // Hemisférica suave (cielo cálido / suelo frío) como ambient.
      scene.add(new THREE.HemisphereLight(0xfff0e0, 0x806040, 0.50));

      // Key: luz principal desde arriba-derecha-delante.
      const key = new THREE.DirectionalLight(0xfffaf0, 1.10);
      key.position.set(1.2, 3.0, 2.5);
      scene.add(key);

      // Fill: suave desde la izquierda, reduce sombras duras.
      const fill = new THREE.DirectionalLight(0xd0e8ff, 0.40);
      fill.position.set(-1.5, 1.5, 1.5);
      scene.add(fill);

      // Rim: luz de contorno desde detrás-arriba para separar la mano del fondo.
      const rim = new THREE.DirectionalLight(0xffddbb, 0.35);
      rim.position.set(0.0, 2.0, -2.0);
      scene.add(rim);

      // Micro-fill: luz frontal cercana para iluminar el detalle de la piel.
      const micro = new THREE.DirectionalLight(0xffffff, 0.20);
      micro.position.set(0.0, 0.0, 3.0);
      scene.add(micro);

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

          // Seguimiento suave de la cámara.
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

      return () => { renderer.dispose(); };
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
// Rig procedimental de alta calidad
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
  // MeshStandardMaterial: funciona en software WebGL (Windows SwiftShader).
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xd4956a, roughness: 0.55, metalness: 0 });
  const matPalm = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.62, metalness: 0 });
  const matShirt = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.55, metalness: 0 });
  const matNail  = new THREE.MeshStandardMaterial({ color: 0xf0d5bf, roughness: 0.22, metalness: 0.05 });

  const group = new THREE.Group();

  // Torso (decorativo, se ve parcialmente en el encuadre).
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.115, BONE_LENGTHS.torso, 18),
    matShirt,
  );
  torso.position.y = SHOULDER_HEIGHT - BONE_LENGTHS.torso / 2;
  group.add(torso);

  // ── Brazo ─────────────────────────────────────────────────────────────────
  const shoulder = new THREE.Group();
  shoulder.position.set(RIGHT_SHOULDER_X, SHOULDER_HEIGHT, 0);
  group.add(shoulder);

  const upperArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.030, BONE_LENGTHS.upperArm - 0.06, 8, 18),
    matSkin,
  );
  upperArm.position.y = -BONE_LENGTHS.upperArm / 2;
  shoulder.add(upperArm);

  const elbow = new THREE.Group();
  elbow.position.y = -BONE_LENGTHS.upperArm;
  shoulder.add(elbow);
  elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.028, 18, 14), matSkin));

  const foreArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.025, BONE_LENGTHS.foreArm - 0.06, 8, 18),
    matSkin,
  );
  foreArm.position.y = -BONE_LENGTHS.foreArm / 2;
  elbow.add(foreArm);

  const wrist = new THREE.Group();
  wrist.position.y = -BONE_LENGTHS.foreArm;
  elbow.add(wrist);

  // ── Palma elipsoidal ──────────────────────────────────────────────────────
  const palm = new THREE.Group();
  palm.position.y = -PALM_HEIGHT * 0.40;
  wrist.add(palm);

  // Cuerpo principal: esfera unidad escalada a proporciones de palma.
  const palmBody = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), matSkin);
  palmBody.scale.set(PALM_WIDTH * 0.52, PALM_HEIGHT * 0.50, PALM_DEPTH * 0.30);
  palm.add(palmBody);

  // Capa palmar (más clara, ligeramente desplazada hacia el espectador).
  const palmFace = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), matPalm);
  palmFace.scale.set(PALM_WIDTH * 0.44, PALM_HEIGHT * 0.45, PALM_DEPTH * 0.20);
  palmFace.position.z = PALM_DEPTH * 0.16;
  palm.add(palmFace);

  // Eminencia tenar (músculo de la base del pulgar).
  const thenar = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), matPalm);
  thenar.scale.set(0.022, 0.038, 0.016);
  thenar.position.set(PALM_WIDTH * 0.38, PALM_HEIGHT * 0.06, PALM_DEPTH * 0.18);
  palm.add(thenar);

  // Eminencia hipotenar (músculo del meñique).
  const hypothenar = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), matPalm);
  hypothenar.scale.set(0.016, 0.030, 0.012);
  hypothenar.position.set(-PALM_WIDTH * 0.38, PALM_HEIGHT * 0.10, PALM_DEPTH * 0.14);
  palm.add(hypothenar);

  // Articulación muñeca–palma.
  const wristBall = new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS * 1.6, 18, 14), matSkin);
  wristBall.position.set(0, PALM_HEIGHT * 0.50, 0);
  palm.add(wristBall);

  // ── Dedos ─────────────────────────────────────────────────────────────────
  // Radios: [proximal-base, medial-base, distal-base]
  const radii: [number, number, number] = [0.0158, 0.0132, 0.0108];
  const spacing = PALM_WIDTH / 4;
  const fingers: FingerHandle[] = [];

  // Pulgar — nace en el lateral radial de la palma.
  const thumbBase = new THREE.Group();
  thumbBase.position.set(PALM_WIDTH * 0.46, PALM_HEIGHT * 0.05, PALM_DEPTH * 0.10);
  thumbBase.rotation.set(-0.25, -Math.PI / 2.4, -THUMB_ABDUCTION);
  palm.add(thumbBase);

  const thumb = buildFinger(THREE, matSkin, matNail, "thumb",
    [BONE_LENGTHS.thumb1, BONE_LENGTHS.thumb2, BONE_LENGTHS.thumb3], radii);
  thumbBase.add(thumb.root);
  fingers.push(thumb);

  // Cuatro dedos largos.
  const fingerSpecs: Array<{ name: string; x: number; lens: [number, number, number] }> = [
    { name: "index",  x: PALM_WIDTH / 2 - spacing * 0.5,
      lens: [BONE_LENGTHS.index1,  BONE_LENGTHS.index2,  BONE_LENGTHS.index3]  },
    { name: "middle", x: PALM_WIDTH / 2 - spacing * 1.5,
      lens: [BONE_LENGTHS.middle1, BONE_LENGTHS.middle2, BONE_LENGTHS.middle3] },
    { name: "ring",   x: PALM_WIDTH / 2 - spacing * 2.5,
      lens: [BONE_LENGTHS.ring1,   BONE_LENGTHS.ring2,   BONE_LENGTHS.ring3]   },
    { name: "pinky",  x: PALM_WIDTH / 2 - spacing * 3.5,
      lens: [BONE_LENGTHS.pinky1,  BONE_LENGTHS.pinky2,  BONE_LENGTHS.pinky3]  },
  ];

  for (const spec of fingerSpecs) {
    const anchor = new THREE.Group();
    anchor.position.set(spec.x, -PALM_HEIGHT / 2, PALM_DEPTH * 0.04);
    palm.add(anchor);

    // Nudillo MCP (articulación metacarpofalángica).
    anchor.add(new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS * 1.2, 14, 12), matSkin));

    const f = buildFinger(THREE, matSkin, matNail, spec.name, spec.lens, radii);
    anchor.add(f.root);
    fingers.push(f);
  }

  function apply(pose: ReturnType<typeof poseFromKeyframe>) {
    shoulder.rotation.set(pose.shoulder[0], pose.shoulder[1], pose.shoulder[2]);
    elbow.rotation.set(-pose.elbow, 0, 0);
    wrist.rotation.set(pose.wrist[0], pose.wrist[1], pose.wrist[2]);
    for (let i = 0; i < 5; i++) {
      applyFingerFlex(fingers[i]!, pose.fingers[i]);
    }
  }

  return { group, apply };
}

function applyFingerFlex(finger: FingerHandle, flex: FingerPose) {
  finger.joints[0].rotation.x = -flex.proximal;
  finger.joints[1].rotation.x = -flex.middle;
  finger.joints[2].rotation.x = -flex.distal;
}

/**
 * Construye un dedo con tres falanges.
 * Cada falange usa LatheGeometry (perfil de revolución): sección cónica con
 * protuberancia articular en la base y yema redondeada en la distal.
 * El perfil se define de punta (y=0) a base (y=len) y se traslada -len en Y
 * para que la articulación quede en y=0 y la punta en y=-len.
 */
function buildFinger(
  THREE: typeof import("three"),
  matSkin: import("three").Material,
  matNail: import("three").Material,
  name: string,
  lengths: [number, number, number],
  radii: [number, number, number],
): FingerHandle {
  const [len1, len2, len3] = lengths;
  const [r0, r1, r2] = radii;

  const g1 = new THREE.Group();
  g1.name = `${name}1`;
  // Falange proximal: nudillo MCP en la base → taper hacia PIP
  g1.add(makeLatheSegment(THREE, matSkin, len1, r0, r1 * 0.90, true));

  const g2 = new THREE.Group();
  g2.name = `${name}2`;
  g2.position.y = -len1;
  // Falange medial: nudillo PIP en la base → taper hacia DIP
  g2.add(makeLatheSegment(THREE, matSkin, len2, r1, r2 * 0.90, true));

  const g3 = new THREE.Group();
  g3.name = `${name}3`;
  g3.position.y = -len2;
  // Falange distal: sin nudillo, yema redondeada
  g3.add(makeLatheSegment(THREE, matSkin, len3, r2, r2 * 0.68, false));

  // Uña en la distal (pequeño box brillante).
  const nail = new THREE.Mesh(
    new THREE.BoxGeometry(r2 * 1.5, r2 * 0.28, len3 * 0.44),
    matNail,
  );
  nail.position.set(0, -len3 * 0.52, r2 * 0.82);
  g3.add(nail);

  g2.add(g3);
  g1.add(g2);
  return { root: g1, joints: [g1, g2, g3] };
}

/**
 * Segmento de dedo como sólido de revolución (LatheGeometry).
 * El perfil va de punta (y=0, radio pequeño) a base (y=len, radio grande + nudillo).
 * `mesh.position.y = -len` → articulación en y=0, punta en y=-len.
 */
function makeLatheSegment(
  THREE: typeof import("three"),
  material: import("three").Material,
  len: number,
  rBase: number,
  rTip:  number,
  withKnuckle: boolean,
): import("three").Mesh {
  const pts: import("three").Vector2[] = [];

  // Yema redondeada en y=0..rTip*dome
  const domeSegs = 7;
  const domeR = rTip * 0.82;
  for (let i = 0; i <= domeSegs; i++) {
    const a = ((domeSegs - i) / domeSegs) * (Math.PI / 2);
    pts.push(new THREE.Vector2(domeR * Math.cos(a), domeR * (1 - Math.sin(a))));
  }

  // Transición tip → shaft
  pts.push(new THREE.Vector2(rTip * 1.02, domeR + len * 0.06));

  // Eje cónico principal (taper de punta a base)
  const shaftSteps = 6;
  for (let i = 1; i <= shaftSteps; i++) {
    const t = i / shaftSteps;
    // Curva suave con easing cúbico
    const r = rTip + (rBase - rTip) * (t * t * (3 - 2 * t));
    pts.push(new THREE.Vector2(r, domeR + len * (0.06 + t * 0.72)));
  }

  // Zona articular en la base
  const shaftEnd = domeR + len * 0.78;
  if (withKnuckle) {
    pts.push(new THREE.Vector2(rBase * 0.96, shaftEnd + len * 0.04));
    pts.push(new THREE.Vector2(rBase * 1.10, shaftEnd + len * 0.10));
    pts.push(new THREE.Vector2(rBase * 1.20, shaftEnd + len * 0.17));
    pts.push(new THREE.Vector2(rBase * 1.18, len));
  } else {
    pts.push(new THREE.Vector2(rBase, len));
  }

  const totalH = len; // altura total del perfil
  const geo = new THREE.LatheGeometry(pts, 18);
  const mesh = new THREE.Mesh(geo, material);
  // Perfil: y=0 (punta) → y=totalH (base). Mover -totalH en Y:
  // articulación queda en y=0, punta en y=-totalH.
  mesh.position.y = -totalH;
  return mesh;
}
