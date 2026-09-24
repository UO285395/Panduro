"use client";

import { useEffect, useRef, useState } from "react";
import { THING_CLIPS } from "@/lib/mascot/clips";
import { loadMascotModel, type LoadedMascot } from "@/lib/mascot/loadMascot";
import { MOOD_MS, mascotPose, pickClip, type MascotMood } from "@/lib/mascot/modelMotion";
import { sampleClip } from "@/lib/avatar/interpolate";
import { distributeFlex } from "@/lib/avatar/pose";
import type { AvatarKeyframe } from "@/lib/curriculum/schema";
import { getFingerFlex } from "@/lib/avatar/pose";
import {
  BONE_LENGTHS,
  KNUCKLE_RADIUS,
  PALM_DEPTH,
  PALM_HEIGHT,
  PALM_WIDTH,
  THUMB_ABDUCTION,
} from "@/lib/avatar/rig";

export type MascotState = MascotMood;

type Props = {
  state: MascotState;
  className?: string;
  /** Alto del lienzo en píxeles (el ancho es 4/5). */
  size?: number;
};

const ASPECT = 96 / 120;

/**
 * Mascota "Thing" de la Familia Addams. Si hay un modelo en public/mascot/ (p. ej. el
 * de Sketchfab, ver public/mascot/README.md) se usa ese, animado entero según el estado
 * y con sus propias animaciones si las trae. Si no, una mano procedimental con el
 * antebrazo emergiendo y los dedos animados con THING_CLIPS.
 */
export function ThingMascot({ state, className, size = 120 }: Props) {
  const H = size;
  const W = Math.round(size * ASPECT);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mounted, setMounted] = useState(false);
  // El estado cambia sin reconstruir la escena ni volver a cargar el modelo.
  const moodRef = useRef({ state, since: 0 });

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    moodRef.current = { state, since: performance.now() };
  }, [state]);

  useEffect(() => {
    if (!mounted) return;
    let disposed = false;
    let raf = 0;
    let cleanup: (() => void) | null = null;

    (async () => {
      if (!canvasRef.current) return;
      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        return;
      }
      if (disposed) return;

      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H, false);
      cleanup = () => renderer.dispose();

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 0.40));
      const key = new THREE.DirectionalLight(0xfffaf0, 1.00);
      key.position.set(0.8, 2, 2);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xd8e8ff, 0.35);
      fill.position.set(-0.8, 0, 1);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffddbb, 0.25);
      rim.position.set(0, 1.5, -1.5);
      scene.add(rim);

      const loaded = await loadMascotModel();
      if (disposed) return;
      const frame = loaded
        ? await modelScene(THREE, scene, loaded)
        : proceduralScene(THREE, scene);
      if (disposed) return;

      const clock = new THREE.Clock();
      const loop = () => {
        if (disposed) return;
        frame.update(moodRef.current.state, performance.now() - moodRef.current.since, clock.getDelta());
        renderer.render(scene, frame.camera);
        raf = requestAnimationFrame(loop);
      };
      loop();
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, [mounted, W, H]);

  if (!mounted) return null;

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      aria-hidden
      className={className}
      style={{ width: W, height: H }}
    />
  );
}

type MascotFrame = {
  camera: import("three").Camera;
  update: (mood: MascotMood, sinceMoodMs: number, deltaS: number) => void;
};

/** Mano procedimental con los dedos animados por THING_CLIPS. */
function proceduralScene(THREE: typeof import("three"), scene: import("three").Scene): MascotFrame {
  // Cámara ortográfica ampliada para que los clips no salgan del frustum.
  const halfH = 0.28;
  const halfW = halfH * ASPECT;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 10);
  camera.position.set(0, 0.02, 1.5);
  camera.lookAt(0, 0.02, 0);
  // Invertir el viewport: los dedos (+Y) aparecen abajo, el brazo (-Y) arriba.
  camera.up.set(0, -1, 0);

  const rig = buildThingRig(THREE);
  scene.add(rig.group);
  return {
    camera,
    update(mood, since) {
      const clip = THING_CLIPS[mood];
      const t = mood === "idle" ? since % clip.duration : Math.min(since, clip.duration - 1);
      rig.apply(sampleClip(clip, t));
    },
  };
}

/**
 * Modelo descargado: se normaliza a altura 1 apoyado en el suelo, se encuadra con sitio
 * para los saltos y se anima entero (mascotPose). Si trae animaciones, suenan debajo.
 */
async function modelScene(
  THREE: typeof import("three"),
  scene: import("three").Scene,
  { gltf, config }: LoadedMascot,
): Promise<MascotFrame> {
  const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
  const model = clone(gltf.scene);
  model.rotation.y = THREE.MathUtils.degToRad(config.rotateY ?? 0);

  const fit = new THREE.Group();
  fit.add(model);
  const box = new THREE.Box3().setFromObject(fit, true);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Altura 1, apoyado en el suelo y centrado: los movimientos van en esas unidades.
  const scale = 1 / Math.max(size.y, 1e-6);
  model.position.set(-center.x, -box.min.y, -center.z);
  fit.scale.setScalar(scale);

  const holder = new THREE.Group();
  holder.add(fit);
  scene.add(holder);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 0.5));

  // Encuadre: de los pies a lo más alto de un salto, y el ancho que ocupa al girar.
  const reach = Math.hypot(size.x, size.z) * scale / 2;
  const camera = new THREE.PerspectiveCamera(28, ASPECT, 0.01, 100);
  const top = 1.32;
  const bottom = -0.06;
  const cy = (top + bottom) / 2;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max((top - bottom) / 2 / tanV, reach / (tanV * ASPECT)) + reach;
  camera.position.set(0, cy + 0.08, dist);
  camera.lookAt(0, cy, 0);

  const mixer = gltf.animations.length && config.animation !== false ? new THREE.AnimationMixer(model) : null;
  let playing: { mood: MascotMood; action: import("three").AnimationAction } | null = null;
  const play = (mood: MascotMood) => {
    if (!mixer || playing?.mood === mood) return;
    const clip = pickClip(gltf.animations, mood);
    if (!clip) return;
    const action = mixer.clipAction(clip);
    if (playing?.action === action) {
      playing = { mood, action };
      return;
    }
    action.reset().fadeIn(0.25).play();
    playing?.action.fadeOut(0.25);
    playing = { mood, action };
  };

  return {
    camera,
    update(mood, since, delta) {
      const active = since < MOOD_MS[mood] ? mood : "idle";
      play(active);
      mixer?.update(delta);
      const pose = mascotPose(mood, since, performance.now());
      holder.position.y = pose.y;
      holder.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
      const side = 1 / Math.sqrt(pose.squash);
      holder.scale.set(side, pose.squash, side);
    },
  };
}

// ---------------------------------------------------------------------------
// Rig autónomo estilo "Thing": palma elipsoidal, dedos LatheGeometry hacia +Y,
// antebrazo emergiendo desde -Y (efecto "emergiendo del suelo").
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
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xe0aa78, roughness: 0.62, metalness: 0 });
  const matPalm = new THREE.MeshStandardMaterial({ color: 0xf0c89a, roughness: 0.68, metalness: 0 });
  const matNail = new THREE.MeshStandardMaterial({ color: 0xf5e0cc, roughness: 0.22, metalness: 0.05 });

  const group = new THREE.Group();

  // Antebrazo (emerge desde abajo).
  const foreArmStub = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.024, 0.10, 6, 12),
    matSkin,
  );
  foreArmStub.position.y = -(PALM_HEIGHT / 2 + 0.06);
  group.add(foreArmStub);

  // Muñeca.
  const wristSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.027, 14, 12),
    matSkin,
  );
  wristSphere.position.y = -PALM_HEIGHT / 2;
  group.add(wristSphere);

  // Palma elipsoidal (dorso).
  const palmBody = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), matSkin);
  palmBody.scale.set(PALM_WIDTH * 0.52, PALM_HEIGHT * 0.50, PALM_DEPTH * 0.30);
  group.add(palmBody);

  // Cara palmar (más clara, ligeramente hacia el espectador).
  const palmFace = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), matPalm);
  palmFace.scale.set(PALM_WIDTH * 0.44, PALM_HEIGHT * 0.45, PALM_DEPTH * 0.20);
  palmFace.position.z = PALM_DEPTH * 0.16;
  group.add(palmFace);

  // Eminencia tenar.
  const thenar = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), matPalm);
  thenar.scale.set(0.022, 0.038, 0.016);
  thenar.position.set(PALM_WIDTH * 0.38, PALM_HEIGHT * 0.06, PALM_DEPTH * 0.18);
  group.add(thenar);

  const fingerRadii: [number, number, number] = [0.0158, 0.0132, 0.0108];
  const spacing = PALM_WIDTH / 4;
  const fingers: FingerHandle[] = [];

  // Pulgar — nace del lateral radial de la palma.
  const thumbBase = new THREE.Group();
  thumbBase.position.set(PALM_WIDTH * 0.46, PALM_HEIGHT * 0.05, PALM_DEPTH * 0.10);
  thumbBase.rotation.set(-0.25, -Math.PI / 2.4, -THUMB_ABDUCTION);
  group.add(thumbBase);
  const thumb = buildFingerUp(THREE, matSkin, matNail, "thumb", [
    BONE_LENGTHS.thumb1, BONE_LENGTHS.thumb2, BONE_LENGTHS.thumb3,
  ], fingerRadii);
  thumbBase.add(thumb.root);
  fingers.push(thumb);

  // Cuatro dedos largos desde el borde superior de la palma (+Y).
  const fingerSpecs: Array<{ x: number; lens: [number, number, number] }> = [
    { x: PALM_WIDTH / 2 - spacing * 0.5,  lens: [BONE_LENGTHS.index1,  BONE_LENGTHS.index2,  BONE_LENGTHS.index3]  },
    { x: PALM_WIDTH / 2 - spacing * 1.5,  lens: [BONE_LENGTHS.middle1, BONE_LENGTHS.middle2, BONE_LENGTHS.middle3] },
    { x: PALM_WIDTH / 2 - spacing * 2.5,  lens: [BONE_LENGTHS.ring1,   BONE_LENGTHS.ring2,   BONE_LENGTHS.ring3]   },
    { x: PALM_WIDTH / 2 - spacing * 3.5,  lens: [BONE_LENGTHS.pinky1,  BONE_LENGTHS.pinky2,  BONE_LENGTHS.pinky3]  },
  ];

  for (const spec of fingerSpecs) {
    const anchor = new THREE.Group();
    anchor.position.set(spec.x, PALM_HEIGHT / 2, PALM_DEPTH * 0.05);
    group.add(anchor);

    anchor.add(new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS * 1.2, 14, 12), matSkin));

    const f = buildFingerUp(THREE, matSkin, matNail, "f", spec.lens, fingerRadii);
    anchor.add(f.root);
    fingers.push(f);
  }

  function apply(kf: AvatarKeyframe) {
    group.position.set(kf.hand.x * 0.055, kf.hand.y * 0.055 - 0.04, 0);
    group.rotation.set(kf.hand.rot[0], kf.hand.rot[1], kf.hand.rot[2]);
    for (let i = 0; i < 5; i++) {
      const f = fingers[i]!;
      const fp = distributeFlex(getFingerFlex(kf.fingers[i]));
      // Flexión positiva alrededor de X curva los dedos hacia el espectador (+Z).
      f.joints[0].rotation.x = fp.proximal;
      f.joints[1].rotation.x = fp.middle;
      f.joints[2].rotation.x = fp.distal;
    }
  }

  return { group, apply };
}

/**
 * Construye un dedo cuyos segmentos se extienden hacia arriba (+Y).
 * Usa LatheGeometry (perfil de revolución cónico) como el avatar principal.
 */
function buildFingerUp(
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
  g1.add(makeLatheSegmentUp(THREE, matSkin, len1, r0, r1 * 0.90, true));

  const g2 = new THREE.Group();
  g2.name = `${name}2`;
  g2.position.y = len1;
  g2.add(makeLatheSegmentUp(THREE, matSkin, len2, r1, r2 * 0.90, true));

  const g3 = new THREE.Group();
  g3.name = `${name}3`;
  g3.position.y = len2;
  g3.add(makeLatheSegmentUp(THREE, matSkin, len3, r2, r2 * 0.68, false));

  // Uña en la falange distal.
  const nail = new THREE.Mesh(
    new THREE.BoxGeometry(r2 * 1.5, len3 * 0.44, r2 * 0.28),
    matNail,
  );
  nail.position.set(0, len3 * 0.52, -r2 * 0.82);
  g3.add(nail);

  g2.add(g3);
  g1.add(g2);
  return { root: g1, joints: [g1, g2, g3] };
}

/**
 * Segmento de falange como sólido de revolución que apunta hacia +Y.
 * Perfil: base (y=0, nudillo) → taper cónico → yema redondeada en y≈len.
 */
function makeLatheSegmentUp(
  THREE: typeof import("three"),
  material: import("three").Material,
  len: number,
  rBase: number,
  rTip:  number,
  withKnuckle: boolean,
): import("three").Mesh {
  const pts: import("three").Vector2[] = [];

  // Nudillo / zona articular en la base (y=0)
  if (withKnuckle) {
    pts.push(new THREE.Vector2(rBase * 1.18, 0));
    pts.push(new THREE.Vector2(rBase * 1.20, len * 0.06));
    pts.push(new THREE.Vector2(rBase * 1.10, len * 0.12));
    pts.push(new THREE.Vector2(rBase * 0.96, len * 0.20));
  } else {
    pts.push(new THREE.Vector2(rBase, 0));
  }

  // Eje cónico: base → taper suave hacia la punta
  const shaftSteps = 6;
  for (let i = 1; i <= shaftSteps; i++) {
    const t = i / shaftSteps;
    const r = rBase + (rTip - rBase) * (t * t * (3 - 2 * t));
    pts.push(new THREE.Vector2(r, len * (0.22 + t * 0.60)));
  }

  // Yema redondeada en la punta (y ≈ len)
  const domeR = rTip * 0.82;
  const domeSegs = 7;
  for (let i = 0; i <= domeSegs; i++) {
    const a = (i / domeSegs) * (Math.PI / 2);
    pts.push(new THREE.Vector2(
      domeR * Math.cos(a),
      len * 0.82 + domeR * Math.sin(a),
    ));
  }

  const geo = new THREE.LatheGeometry(pts, 18);
  return new THREE.Mesh(geo, material);
}
