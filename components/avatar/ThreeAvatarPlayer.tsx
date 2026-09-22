"use client";

import { useEffect, useRef, useState } from "react";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { sampleClip } from "@/lib/avatar/interpolate";
import { poseFromKeyframe, type FingerPose, type Pose } from "@/lib/avatar/pose";
import { loadPanduroVrm } from "@/lib/avatar/loadVrm";
import { applyPoseToVrm } from "@/lib/avatar/vrmMapper";
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();

      // Fondo de gradiente cálido con viñeta fotográfica suave.
      const gradCanvas = document.createElement("canvas");
      gradCanvas.width = 256; gradCanvas.height = 256;
      const gctx = gradCanvas.getContext("2d")!;
      const grad = gctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#fff4ea");
      grad.addColorStop(1, "#ffe0c0");
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, 256, 256);
      // Viñeta radial oscura en las esquinas
      const vig = gctx.createRadialGradient(128, 128, 55, 128, 128, 195);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.18)");
      gctx.fillStyle = vig;
      gctx.fillRect(0, 0, 256, 256);
      const bgTex = new THREE.CanvasTexture(gradCanvas);
      bgTex.minFilter = THREE.LinearFilter;
      scene.background = bgTex;

      // IBL — mapa de entorno procedural para materiales PBR realistas.
      // Un gradiente equirectangular cielo/horizonte/tierra da reflexiones naturales.
      const envCanvas2d = document.createElement("canvas");
      envCanvas2d.width = 512; envCanvas2d.height = 256;
      const e2d = envCanvas2d.getContext("2d")!;
      const eGrad = e2d.createLinearGradient(0, 0, 0, 256);
      eGrad.addColorStop(0.00, "#eef6ff"); // overhead — softbox frío
      eGrad.addColorStop(0.15, "#c4dff5"); // cielo superior
      eGrad.addColorStop(0.42, "#fff6ee"); // horizonte key-light cálido
      eGrad.addColorStop(0.65, "#e8c89a"); // suelo reflejado
      eGrad.addColorStop(1.00, "#8a6040"); // sombra suelo
      e2d.fillStyle = eGrad;
      e2d.fillRect(0, 0, 512, 256);
      const envTex = new THREE.CanvasTexture(envCanvas2d);
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(envTex).texture;
      envTex.dispose();
      pmrem.dispose();

      // Plano de suelo para recibir sombras (invisible excepto sombras).
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShadowMaterial({ opacity: 0.18 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = SHOULDER_HEIGHT - BONE_LENGTHS.torso - 0.02;
      floor.receiveShadow = true;
      scene.add(floor);

      // Cámara perspectiva suave — más natural que ortográfica.
      // fov reducido (28°) imita un tele-objetivo y minimiza la distorsión.
      const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 10);
      const CAM_X = RIGHT_SHOULDER_X;
      const CAM_Y = 0.78;
      // Ligeramente a la derecha y elevada para un ángulo de 3/4 sutil.
      camera.position.set(CAM_X + 0.08, CAM_Y + 0.05, 2.0);
      camera.lookAt(CAM_X, CAM_Y - 0.02, 0);

      // ── Iluminación de 4 puntos ──────────────────────────────────────────
      // Hemisférica suave (cielo cálido / suelo frío) como ambient.
      scene.add(new THREE.HemisphereLight(0xfff0e0, 0x806040, 0.50));

      // Key: luz principal desde arriba-derecha-delante.
      const key = new THREE.DirectionalLight(0xfffaf0, 1.20);
      key.position.set(1.2, 3.0, 2.5);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 6;
      key.shadow.camera.left = key.shadow.camera.bottom = -0.4;
      key.shadow.camera.right = key.shadow.camera.top = 0.4;
      key.shadow.radius = 6;
      key.shadow.bias = -0.0008;
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

      // Up-fill: rebote cálido desde el suelo — ilumina la palma por debajo.
      const upFill = new THREE.DirectionalLight(0xffa050, 0.14);
      upFill.position.set(0.0, -1.5, 1.0);
      scene.add(upFill);

      // Spot facial: PointLight sobre el rostro para iluminar ojos y expresión.
      const faceSpot = new THREE.PointLight(0xfff8f0, 0.55, 1.2);
      faceSpot.position.set(0.1, 0.96, 0.55);
      scene.add(faceSpot);

      // Intentar cargar VRM; si no está disponible, usar el rig procedimental.
      const loaded = await loadPanduroVrm();

      if (loaded && !disposed) {
        const { scene: vrmScene, vrm } = loaded as {
          scene: import("three").Group;
          vrm: import("@pixiv/three-vrm").VRM;
        };
        scene.add(vrmScene);
        setMode("vrm");
        onReady?.("vrm");

        const clock = new THREE.Clock();
        const started = performance.now();

        const loop = () => {
          if (disposed) return;
          const dt = performance.now() - started;
          const kf = clip ? sampleClip(clip, dt % clip.duration) : null;
          if (kf) {
            const pose = poseFromKeyframe(kf);
            applyPoseToVrm(vrm, pose);
          }
          vrm.update(clock.getDelta());
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        loop();
      } else {
        // Fallback: rig procedimental
        const rig = buildProceduralRig(THREE);
        scene.add(rig.group);
        onReady?.("procedural");

        const started = performance.now();

        const loop = () => {
          if (disposed) return;
          const dt = performance.now() - started;
          const kf = clip ? sampleClip(clip, dt % clip.duration) : null;
          if (clip && kf) {
            const pose = poseFromKeyframe(kf);
            rig.apply(pose, dt);
          } else {
            rig.applyIdle(dt);
          }
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        loop();
      }

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
  apply: (pose: Pose, tMs: number) => void;
  applyIdle: (tMs: number) => void;
};

function buildProceduralRig(THREE: typeof import("three")): RigHandle {
  // MeshPhysicalMaterial con sheen + thickness para simular SSS de piel.
  // thickness≈0.8 permite que la luz key-light "sangre" a través de la piel
  // de los dedos (efecto visible al contraluz), lo más cercano a SSS sin texturas.
  const matSkin = new THREE.MeshPhysicalMaterial({
    color: 0xc5825a, roughness: 0.40, metalness: 0.01,
    sheen: 0.50, sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0xee9070),
    envMapIntensity: 0.65,
    thickness: 0.80,
    attenuationColor: new THREE.Color(0xff9060),
    attenuationDistance: 0.06,
  });
  const matPalm = new THREE.MeshPhysicalMaterial({
    color: 0xdba070, roughness: 0.46, metalness: 0.00,
    sheen: 0.35, sheenRoughness: 0.80,
    sheenColor: new THREE.Color(0xf2b894),
    envMapIntensity: 0.52,
    thickness: 0.55,
    attenuationColor: new THREE.Color(0xffa070),
    attenuationDistance: 0.04,
  });
  const matShirt = new THREE.MeshPhysicalMaterial({
    color: 0xea580c, roughness: 0.60, metalness: 0.00, envMapIntensity: 0.35,
  });
  const matNail = new THREE.MeshPhysicalMaterial({
    color: 0xf0d8cc, roughness: 0.08, metalness: 0.04,
    clearcoat: 0.65, clearcoatRoughness: 0.03, envMapIntensity: 1.00,
  });
  const matFace = new THREE.MeshPhysicalMaterial({
    color: 0xc47858, roughness: 0.42, metalness: 0.00,
    sheen: 0.28, sheenRoughness: 0.86,
    sheenColor: new THREE.Color(0xdda070),
    clearcoat: 0.10, clearcoatRoughness: 0.38,
    envMapIntensity: 0.48,
    thickness: 0.60,
    attenuationColor: new THREE.Color(0xff8855),
    attenuationDistance: 0.05,
  });
  const matHair = new THREE.MeshPhysicalMaterial({
    color: 0x2a1a10, roughness: 0.70, metalness: 0.00,
    sheen: 0.18, sheenRoughness: 0.92,
    sheenColor: new THREE.Color(0x6a4030),
    envMapIntensity: 0.30,
  });
  // Material para pliegue de muñeca (línea anatómica oscura).
  const matCrease = new THREE.MeshPhysicalMaterial({
    color: 0x8a5038, roughness: 0.90, metalness: 0.00,
    transparent: true, opacity: 0.55,
  });

  const group = new THREE.Group();

  // Torso
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.115, BONE_LENGTHS.torso, 18),
    matShirt,
  );
  torso.position.y = SHOULDER_HEIGHT - BONE_LENGTHS.torso / 2;
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Cuello
  const neck = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.026, BONE_LENGTHS.neck - 0.04, 6, 12),
    matSkin,
  );
  neck.position.y = SHOULDER_HEIGHT + BONE_LENGTHS.neck / 2;
  neck.castShadow = true;
  group.add(neck);

  // Clavícula — cápsula horizontal sobre el hombro derecho.
  const collarBone = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.012, 0.22, 4, 10),
    matSkin,
  );
  collarBone.rotation.z = Math.PI / 2;
  collarBone.position.set(RIGHT_SHOULDER_X * 0.5, SHOULDER_HEIGHT + 0.01, 0.02);
  collarBone.castShadow = true;
  group.add(collarBone);

  // Cabeza — grupo animable (permite nod/shake con spring)
  const headR = BONE_LENGTHS.head / 2;
  const headGroup = new THREE.Group();
  headGroup.position.y = SHOULDER_HEIGHT + BONE_LENGTHS.neck;
  group.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 26, 20), matFace);
  head.position.y = headR;
  head.castShadow = true;
  headGroup.add(head);

  // Ojos: esclerótica + iris + pupila + destello de córnea
  const matSclera = new THREE.MeshPhysicalMaterial({ color: 0xf5ede4, roughness: 0.55, metalness: 0.0 });
  const matIris   = new THREE.MeshPhysicalMaterial({ color: 0x5c3d1e, roughness: 0.18, metalness: 0.0, envMapIntensity: 0.4 });
  const matPupil  = new THREE.MeshPhysicalMaterial({ color: 0x09070a, roughness: 0.05, metalness: 0.0 });
  const matCatch  = new THREE.MeshBasicMaterial({ color: 0xffffff });
  // Cuenca del ojo: esfera oscura detrás del ojo para sombra orbital.
  const matSocket = new THREE.MeshPhysicalMaterial({
    color: 0x4a2810, roughness: 1.0, metalness: 0.0,
    transparent: true, opacity: 0.28,
  });
  const eyes: import("three").Group[] = [];
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.165, 12, 8), matSocket);
    socket.position.set(side * headR * 0.38, headR * 1.06, headR * 0.80);
    headGroup.add(socket);
    const eg = new THREE.Group();
    eg.position.set(side * headR * 0.38, headR * 1.06, headR * 0.86);
    eg.add(new THREE.Mesh(new THREE.SphereGeometry(headR * 0.130, 14, 10), matSclera));
    const iris = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.082, 14, 10), matIris);
    iris.position.z = headR * 0.092;
    eg.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.046, 12, 8), matPupil);
    pupil.position.z = headR * 0.118;
    eg.add(pupil);
    const catchlight = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.020, 8, 6), matCatch);
    catchlight.position.set(side * headR * 0.030, headR * 0.044, headR * 0.128);
    eg.add(catchlight);
    headGroup.add(eg);
    eyes.push(eg);
  }

  // Cejas
  const matBrow = new THREE.MeshPhysicalMaterial({ color: 0x2c1a10, roughness: 0.80 });
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.018, headR * 0.18, 4, 8), matBrow);
    brow.position.set(side * headR * 0.36, headR * 1.24, headR * 0.82);
    brow.rotation.z = side * 0.18;
    headGroup.add(brow);
  }

  // Nariz (esfera ligeramente aplanada en el centro del rostro)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.09, 10, 8), matFace);
  nose.scale.set(0.80, 0.65, 0.70);
  nose.position.set(0, headR * 0.92, headR * 0.95);
  headGroup.add(nose);

  // Boca (línea oscura sutil)
  const matMouth = new THREE.MeshPhysicalMaterial({ color: 0x8a4030, roughness: 0.85 });
  const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.014, headR * 0.14, 4, 8), matMouth);
  mouth.rotation.z = Math.PI / 2;
  mouth.position.set(0, headR * 0.76, headR * 0.93);
  headGroup.add(mouth);

  // Orejas (elipsoides planos a los lados de la cabeza)
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.11, 10, 8), matFace);
    ear.scale.set(0.22, 0.72, 0.60);
    ear.position.set(side * headR * 1.02, headR * 0.90, 0);
    headGroup.add(ear);
  }

  // Pelo — casquete superior + volumen trasero para aspecto más natural.
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.02, 26, 20), matHair);
  hairCap.position.y = headR * 0.22;
  hairCap.scale.set(1.0, 0.62, 1.0);
  hairCap.castShadow = true;
  headGroup.add(hairCap);
  // Volumen trasero (occipital) — masa de pelo por detrás de la cabeza.
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.72, 18, 14), matHair);
  hairBack.position.set(0, headR * 0.12, -headR * 0.62);
  hairBack.scale.set(1.0, 0.90, 0.70);
  hairBack.castShadow = true;
  headGroup.add(hairBack);

  // ── Brazo ─────────────────────────────────────────────────────────────────
  const shoulder = new THREE.Group();
  shoulder.position.set(RIGHT_SHOULDER_X, SHOULDER_HEIGHT, 0);
  group.add(shoulder);

  // Articulación del hombro — esfera visible que cubre la unión torso/brazo.
  const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), matSkin);
  shoulderBall.castShadow = true;
  shoulder.add(shoulderBall);

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

  // Grupo de pronación/supinación del antebrazo (rota en eje Y local).
  const foreArmGroup = new THREE.Group();
  elbow.add(foreArmGroup);

  const foreArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.025, BONE_LENGTHS.foreArm - 0.06, 8, 18),
    matSkin,
  );
  foreArm.position.y = -BONE_LENGTHS.foreArm / 2;
  foreArmGroup.add(foreArm);

  const wrist = new THREE.Group();
  wrist.position.y = -BONE_LENGTHS.foreArm;
  foreArmGroup.add(wrist);

  // Contact shadow — disco translúcido detrás de la palma para profundidad visual.
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.068, 24),
    new THREE.MeshBasicMaterial({ color: 0x7a4c2b, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  shadowDisc.position.set(0, -(BONE_LENGTHS.foreArm * 0.55), -0.016);
  wrist.add(shadowDisc);

  // ── Palma elipsoidal ──────────────────────────────────────────────────────
  const palm = new THREE.Group();
  palm.position.y = -PALM_HEIGHT * 0.40;
  wrist.add(palm);

  // Cuerpo principal: esfera unidad escalada a proporciones de palma.
  const palmBody = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), matSkin);
  palmBody.scale.set(PALM_WIDTH * 0.52, PALM_HEIGHT * 0.50, PALM_DEPTH * 0.30);
  palmBody.castShadow = true;
  palmBody.receiveShadow = true;
  palm.add(palmBody);

  // Capa palmar (más clara, ligeramente desplazada hacia el espectador).
  const palmFace = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), matPalm);
  palmFace.scale.set(PALM_WIDTH * 0.44, PALM_HEIGHT * 0.45, PALM_DEPTH * 0.20);
  palmFace.position.z = PALM_DEPTH * 0.16;
  palmFace.castShadow = true;
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

  // Línea palmar principal (pliegue de vida) — curva de Bézier cuadrática.
  const palmCreaseCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-PALM_WIDTH * 0.40, -PALM_HEIGHT * 0.10, PALM_DEPTH * 0.20),
    new THREE.Vector3( 0,                  PALM_HEIGHT * 0.08,  PALM_DEPTH * 0.22),
    new THREE.Vector3( PALM_WIDTH * 0.32,  PALM_HEIGHT * 0.20,  PALM_DEPTH * 0.20),
  );
  const palmCreaseMesh = new THREE.Mesh(
    new THREE.TubeGeometry(palmCreaseCurve, 18, 0.0022, 5, false),
    matCrease,
  );
  palm.add(palmCreaseMesh);

  // Pliegue palmar distal (línea de los dedos) — ligeramente horizontal bajo los MCP.
  const distalCreaseCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-PALM_WIDTH * 0.28, -PALM_HEIGHT * 0.30, PALM_DEPTH * 0.22),
    new THREE.Vector3( PALM_WIDTH * 0.05, -PALM_HEIGHT * 0.28, PALM_DEPTH * 0.24),
    new THREE.Vector3( PALM_WIDTH * 0.36, -PALM_HEIGHT * 0.24, PALM_DEPTH * 0.21),
  );
  palm.add(new THREE.Mesh(
    new THREE.TubeGeometry(distalCreaseCurve, 14, 0.0018, 5, false),
    matCrease,
  ));

  // Articulación muñeca–palma.
  const wristBall = new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS * 1.6, 18, 14), matSkin);
  wristBall.position.set(0, PALM_HEIGHT * 0.50, 0);
  palm.add(wristBall);

  // Pliegue de muñeca — anillo anatómico oscuro semitransparente.
  const wristCrease = new THREE.Mesh(
    new THREE.TorusGeometry(PALM_WIDTH * 0.28, 0.0032, 6, 32),
    matCrease,
  );
  wristCrease.rotation.x = Math.PI / 2;
  wristCrease.position.set(0, PALM_HEIGHT * 0.46, 0);
  palm.add(wristCrease);

  // ── Dedos ─────────────────────────────────────────────────────────────────
  // Radios: [proximal-base, medial-base, distal-base]
  const radii: [number, number, number] = [0.0158, 0.0132, 0.0108];
  const spacing = PALM_WIDTH / 4;
  const fingers: FingerHandle[] = [];
  // anchors[0]=thumbBase, anchors[1..4]=finger anchors (para abducción lateral)
  const anchors: import("three").Group[] = [];

  // Pulgar — nace en el lateral radial de la palma.
  const thumbBase = new THREE.Group();
  thumbBase.position.set(PALM_WIDTH * 0.46, PALM_HEIGHT * 0.05, PALM_DEPTH * 0.10);
  thumbBase.rotation.set(-0.25, -Math.PI / 2.4, -THUMB_ABDUCTION);
  palm.add(thumbBase);
  anchors.push(thumbBase);

  const thumb = buildFinger(THREE, matSkin, matNail, "thumb",
    [BONE_LENGTHS.thumb1, BONE_LENGTHS.thumb2, BONE_LENGTHS.thumb3], radii);
  thumbBase.add(thumb.root);
  fingers.push(thumb);
  // Pliegues interfalángicos del pulgar (IPJ1 e IPJ2)
  ([thumb.joints[1], thumb.joints[2]] as import("three").Group[]).forEach((j, k) => {
    const cr = new THREE.Mesh(
      new THREE.TorusGeometry(radii[1 + k]! * 1.12, 0.0016 - k * 0.0002, 5, 20),
      matCrease,
    );
    cr.rotation.x = Math.PI / 2;
    j.add(cr);
  });

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
    anchors.push(anchor);

    // Nudillo MCP (articulación metacarpofalángica).
    anchor.add(new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS * 1.2, 14, 12), matSkin));

    const f = buildFinger(THREE, matSkin, matNail, spec.name, spec.lens, radii);
    anchor.add(f.root);
    fingers.push(f);
    // Pliegues PIP (joint[1]) y DIP (joint[2]) de cada dedo largo
    ([f.joints[1], f.joints[2]] as import("three").Group[]).forEach((j, k) => {
      const cr = new THREE.Mesh(
        new THREE.TorusGeometry(radii[1 + k]! * 1.12, 0.0016 - k * 0.0002, 5, 20),
        matCrease,
      );
      cr.rotation.x = Math.PI / 2;
      j.add(cr);
    });
  }

  // Spring state para movimiento secundario — muñeca, antebrazo y cabeza
  // siguen la pose con leve retraso (follow-through) que da naturalidad.
  const spring = {
    wrist: [0, 0, 0] as [number, number, number],
    roll: 0,
    shoulder: [0, 0, 0] as [number, number, number],
    elbow: 0.35,
    headX: 0,
    headY: 0,
  };
  const KW = 0.18; // rigidez muñeca    (≈90 ms a 60 fps)
  const KR = 0.15; // rigidez antebrazo
  const KS = 0.12; // rigidez hombro    (≈120 ms — transición suave entre signos)
  const KH = 0.07; // rigidez cabeza    (≈200 ms — movimiento más lento)
  const KF = 0.22; // rigidez dedos     (≈75 ms — suave pero responsivo)
  // Estado spring para flex por dedo [proximal, medial, distal] × 5
  const fingerSprings: [[number,number,number],[number,number,number],[number,number,number],[number,number,number],[number,number,number]] = [
    [0.18,0.14,0.10],[0.18,0.14,0.10],[0.18,0.14,0.10],[0.18,0.14,0.10],[0.18,0.14,0.10],
  ];

  // Parpadeo espontáneo: siguiente parpadeo en t aleatoria, duración 150 ms.
  const blink = { next: 1500 + Math.random() * 2500, start: -1 };

  function updateBlink(tMs: number) {
    if (blink.start < 0 && tMs >= blink.next) {
      blink.start = tMs;
      blink.next = tMs + 2500 + Math.random() * 3500;
    }
    if (blink.start >= 0) {
      const phase = (tMs - blink.start) / 150;
      if (phase >= 1) {
        blink.start = -1;
        for (const e of eyes) e.scale.y = 1;
      } else {
        const sy = 1 - 0.9 * Math.sin(Math.PI * phase);
        for (const e of eyes) e.scale.y = sy;
      }
    }
  }

  function apply(pose: Pose, tMs: number) {
    const breath = Math.sin(tMs * 0.0018) * 0.003 + Math.sin(tMs * 0.0054) * 0.001;
    shoulder.position.y = breath;
    torso.scale.set(1 + breath * 2, 1 + breath * 8, 1 + breath * 3);

    spring.shoulder[0] += (pose.shoulder[0] - spring.shoulder[0]) * KS;
    spring.shoulder[1] += (pose.shoulder[1] - spring.shoulder[1]) * KS;
    spring.shoulder[2] += (pose.shoulder[2] - spring.shoulder[2]) * KS;
    spring.elbow       += (pose.elbow       - spring.elbow)       * KS;
    shoulder.rotation.set(spring.shoulder[0], spring.shoulder[1], spring.shoulder[2]);
    elbow.rotation.set(-spring.elbow, 0, 0);

    spring.roll     += (pose.forearmRoll  - spring.roll)     * KR;
    spring.wrist[0] += (pose.wrist[0]    - spring.wrist[0]) * KW;
    spring.wrist[1] += (pose.wrist[1]    - spring.wrist[1]) * KW;
    spring.wrist[2] += (pose.wrist[2]    - spring.wrist[2]) * KW;

    foreArmGroup.rotation.y = spring.roll;
    wrist.rotation.set(spring.wrist[0], spring.wrist[1], spring.wrist[2]);
    thumbBase.rotation.z = -THUMB_ABDUCTION + pose.abduction[0];
    for (let i = 1; i < 5; i++) {
      anchors[i]!.rotation.z = pose.abduction[i];
    }
    for (let i = 0; i < 5; i++) {
      const fp = pose.fingers[i];
      const fs = fingerSprings[i]!;
      fs[0] += (fp.proximal - fs[0]) * KF;
      fs[1] += (fp.middle   - fs[1]) * KF;
      fs[2] += (fp.distal   - fs[2]) * KF;
      applyFingerFlex(fingers[i]!, { proximal: fs[0], middle: fs[1], distal: fs[2] });
    }

    // Cabeza: mira ligeramente hacia la mano (solo cuando está en zona facial).
    const handHigh = pose.shoulder[0] < -0.25;
    const targetHX = handHigh ? pose.shoulder[0] * 0.12 : 0;
    const targetHY = handHigh ? pose.shoulder[1] * 0.08 : 0;
    spring.headX += (targetHX - spring.headX) * KH;
    spring.headY += (targetHY - spring.headY) * KH;
    headGroup.rotation.x = spring.headX + Math.sin(tMs * 0.0018) * 0.002;
    headGroup.rotation.y = spring.headY;
    // Ojos siguen la mano: rotación leve hacia la zona del signo.
    const gazeX = -spring.shoulder[0] * 0.14;
    const gazeY = spring.shoulder[1] * 0.10 - spring.headY * 0.8;
    for (const e of eyes) { e.rotation.x = gazeX; e.rotation.y = gazeY; }
    updateBlink(tMs);
  }

  function applyIdle(tMs: number) {
    const breath     = Math.sin(tMs * 0.0018) * 0.004 + Math.sin(tMs * 0.0054) * 0.001;
    const sway       = Math.sin(tMs * 0.0008) * 0.008;
    const microSway  = Math.sin(tMs * 0.0023) * 0.006;
    shoulder.position.y = breath;
    torso.scale.set(1 + breath * 2, 1 + breath * 8, 1 + breath * 3);
    shoulder.rotation.set(0.08 + sway * 0.1, 0, 0);
    elbow.rotation.set(-0.30, 0, 0);
    // Micro-pronación del antebrazo — da sensación de peso natural.
    foreArmGroup.rotation.y = microSway * 0.4;
    // Micro-flexión de muñeca en reposo.
    wrist.rotation.set(microSway * 0.18, 0, microSway * 0.06);
    thumbBase.rotation.z = -THUMB_ABDUCTION;
    for (let i = 1; i < 5; i++) {
      anchors[i]!.rotation.z = 0;
    }
    // Dedos ligeramente curvados en reposo con micro-tremor individual por dedo.
    const curl = 0.06 + Math.sin(tMs * 0.0011) * 0.012;
    for (let i = 0; i < 5; i++) {
      const tremor = Math.sin(tMs * (0.0011 + i * 0.00031) + i * 1.2) * 0.008;
      applyFingerFlex(fingers[i]!, {
        proximal: 0.18 + curl + tremor,
        middle:   0.14 + curl * 0.70 + tremor * 0.60,
        distal:   0.10 + curl * 0.40 + tremor * 0.30,
      });
    }
    // Leve balanceo de cabeza en reposo.
    const headSway = Math.sin(tMs * 0.00055) * 0.012;
    spring.headX += (0 - spring.headX) * KH;
    spring.headY += (0 - spring.headY) * KH;
    headGroup.rotation.x = spring.headX + Math.sin(tMs * 0.0018) * 0.003;
    headGroup.rotation.y = spring.headY + headSway;
    // Ojos vuelven a posición neutra con micro-drift en reposo.
    const idleGazeX = Math.sin(tMs * 0.00028) * 0.018;
    const idleGazeY = Math.sin(tMs * 0.00019) * 0.014;
    for (const e of eyes) { e.rotation.x = idleGazeX; e.rotation.y = idleGazeY; }
    updateBlink(tMs);
  }

  return { group, apply, applyIdle };
}

function applyFingerFlex(finger: FingerHandle, flex: FingerPose): void {
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
  nail.castShadow = true;
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
  const domeSegs = 9;
  const domeR = rTip * 0.82;
  for (let i = 0; i <= domeSegs; i++) {
    const a = ((domeSegs - i) / domeSegs) * (Math.PI / 2);
    pts.push(new THREE.Vector2(domeR * Math.cos(a), domeR * (1 - Math.sin(a))));
  }

  // Transición tip → shaft
  pts.push(new THREE.Vector2(rTip * 1.02, domeR + len * 0.06));

  // Eje cónico principal (taper de punta a base)
  const shaftSteps = 10;
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
  const geo = new THREE.LatheGeometry(pts, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Perfil: y=0 (punta) → y=totalH (base). Mover -totalH en Y:
  // articulación queda en y=0, punta en y=-totalH.
  mesh.position.y = -totalH;
  return mesh;
}
