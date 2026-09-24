"use client";

import { useEffect, useRef, useState } from "react";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { SIGN_PLAYBACK_RATE, sampleClip } from "@/lib/avatar/interpolate";
import { poseFromKeyframe, poseFromKeyframeLeft, type FingerPose, type Pose } from "@/lib/avatar/pose";
import { loadPanduroVrm } from "@/lib/avatar/loadVrm";
import { applyVrmIdle, applyVrmKeyframe, createVrmRig } from "@/lib/avatar/vrmMapper";
import { addHandOutline } from "@/lib/avatar/handOutline";
import {
  BONE_LENGTHS,
  KNUCKLE_RADIUS,
  LEFT_SHOULDER_X,
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

  // Cambiar de clip o recibir callbacks nuevos no debe reconstruir la escena
  // ni volver a cargar el VRM: el bucle lee siempre el clip vigente.
  const clipRef = useRef({ clip, startedAt: 0 });
  const callbacksRef = useRef({ onReady, onFailed });
  useEffect(() => {
    callbacksRef.current = { onReady, onFailed };
  });
  useEffect(() => {
    clipRef.current = { clip, startedAt: performance.now() };
  }, [clip]);

  useEffect(() => {
    let disposed = false;
    let raf = 0;

    (async () => {
      if (!canvasRef.current) return;
      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        callbacksRef.current.onFailed?.();
        return;
      }
      if (disposed) return;

      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();

      // Fondo estudio 512×512: gradiente cálido + bokeh central + viñeta fotográfica.
      const BG = 512;
      const gradCanvas = document.createElement("canvas");
      gradCanvas.width = BG; gradCanvas.height = BG;
      const gctx = gradCanvas.getContext("2d")!;
      // Gradiente base diagonal — evita el look plano de un gradiente puro vertical.
      const bgBase = gctx.createLinearGradient(0, 0, BG, BG);
      bgBase.addColorStop(0.00, "#f8eede");
      bgBase.addColorStop(0.50, "#ffe8ca");
      bgBase.addColorStop(1.00, "#f0d8b8");
      gctx.fillStyle = bgBase;
      gctx.fillRect(0, 0, BG, BG);
      // Bokeh central — halo suave detrás del sujeto como un softbox en el fondo.
      const bokeh = gctx.createRadialGradient(BG * 0.52, BG * 0.44, 0, BG * 0.52, BG * 0.44, BG * 0.42);
      bokeh.addColorStop(0, "rgba(255,252,240,0.72)");
      bokeh.addColorStop(1, "rgba(255,252,240,0.00)");
      gctx.fillStyle = bokeh;
      gctx.fillRect(0, 0, BG, BG);
      // Viñeta fotográfica — oscurece las esquinas suavemente.
      const vig = gctx.createRadialGradient(BG / 2, BG / 2, BG * 0.22, BG / 2, BG / 2, BG * 0.82);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(30,10,0,0.28)");
      gctx.fillStyle = vig;
      gctx.fillRect(0, 0, BG, BG);
      const bgTex = new THREE.CanvasTexture(gradCanvas);
      bgTex.minFilter = THREE.LinearFilter;
      scene.background = bgTex;

      // IBL 1024×512 — studio three-point: softbox superior + key window lateral.
      const EW = 1024, EH = 512;
      const envCanvas2d = document.createElement("canvas");
      envCanvas2d.width = EW; envCanvas2d.height = EH;
      const e2d = envCanvas2d.getContext("2d")!;
      // Fondo base — gradiente vertical cielo→suelo.
      const eGrad = e2d.createLinearGradient(0, 0, 0, EH);
      eGrad.addColorStop(0.00, "#dde8f8");
      eGrad.addColorStop(0.35, "#f8f4ec");
      eGrad.addColorStop(0.65, "#ead4a0");
      eGrad.addColorStop(1.00, "#7a5830");
      e2d.fillStyle = eGrad;
      e2d.fillRect(0, 0, EW, EH);
      // Key window cálido — halo elíptico a la derecha (simulando luz de estudio).
      const kGrad = e2d.createRadialGradient(EW * 0.72, EH * 0.35, 0, EW * 0.72, EH * 0.35, EW * 0.32);
      kGrad.addColorStop(0, "rgba(255,245,210,0.82)");
      kGrad.addColorStop(1, "rgba(255,245,210,0.00)");
      e2d.fillStyle = kGrad;
      e2d.fillRect(0, 0, EW, EH);
      // Fill frío desde la izquierda.
      const fGrad = e2d.createRadialGradient(EW * 0.10, EH * 0.42, 0, EW * 0.10, EH * 0.42, EW * 0.28);
      fGrad.addColorStop(0, "rgba(190,215,240,0.50)");
      fGrad.addColorStop(1, "rgba(190,215,240,0.00)");
      e2d.fillStyle = fGrad;
      e2d.fillRect(0, 0, EW, EH);
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

      // Cámara centrada — muestra ambos brazos simétricamente.
      const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 10);
      camera.position.set(0, 0.86, 1.7);
      camera.lookAt(0, 0.78, 0);

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

      // Rim: luz de contorno principal desde detrás-arriba-izquierda.
      // Intensidad aumentada para separar mejor la silueta del fondo neutro.
      const rim = new THREE.DirectionalLight(0xffe8cc, 0.58);
      rim.position.set(-0.3, 2.5, -2.2);
      scene.add(rim);
      // Rim frío secundario desde la derecha — da profundidad y separación adicional.
      const rimCool = new THREE.DirectionalLight(0xc8e8ff, 0.22);
      rimCool.position.set(0.6, 1.8, -1.8);
      scene.add(rimCool);

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

      // Mapa de normales procedural: fBm 4-octavas 128×128 para poros realistas.
      // Cada octava suma sinusoides ortogonales con amplitud ÷2 y frecuencia ×2.
      const SZ = 128;
      const normCanvas = document.createElement("canvas");
      normCanvas.width = SZ; normCanvas.height = SZ;
      const nctx = normCanvas.getContext("2d")!;
      const normImgd = nctx.createImageData(SZ, SZ);
      for (let pi = 0; pi < SZ * SZ; pi++) {
        const px = (pi % SZ) / SZ, py = Math.floor(pi / SZ) / SZ;
        let nx = 0, ny = 0, amp = 1, freq = 4;
        for (let oct = 0; oct < 4; oct++) {
          nx += Math.sin(px * freq * 6.28 + py * freq * 3.14) * amp;
          ny += Math.sin(py * freq * 6.28 + px * freq * 3.14) * amp;
          amp *= 0.50; freq *= 2.10;
        }
        normImgd.data[pi * 4]     = Math.round(128 + nx * 20);
        normImgd.data[pi * 4 + 1] = Math.round(128 + ny * 20);
        normImgd.data[pi * 4 + 2] = 255;
        normImgd.data[pi * 4 + 3] = 255;
      }
      nctx.putImageData(normImgd, 0, 0);
      const skinNormTex = new THREE.CanvasTexture(normCanvas);
      skinNormTex.wrapS = skinNormTex.wrapT = THREE.RepeatWrapping;
      skinNormTex.repeat.set(14, 14);

      // Mapa de rugosidad procedural: ruido de 3 octavas que rompe la uniformidad
      // del especular y simula la variación natural de los poros de la piel.
      // Three.js usa el canal G del roughnessMap: 0=liso, 255=rugoso.
      const roughCanvas = document.createElement("canvas");
      roughCanvas.width = SZ; roughCanvas.height = SZ;
      const rctx = roughCanvas.getContext("2d")!;
      const roughImgd = rctx.createImageData(SZ, SZ);
      for (let pi = 0; pi < SZ * SZ; pi++) {
        const px = (pi % SZ) / SZ, py = Math.floor(pi / SZ) / SZ;
        let v = 0, ramp = 1, rfreq = 3;
        for (let oct = 0; oct < 3; oct++) {
          v += Math.sin(px * rfreq * 7.12 + py * rfreq * 2.88) * ramp;
          v += Math.cos(px * rfreq * 3.44 + py * rfreq * 5.76) * ramp * 0.5;
          ramp *= 0.55; rfreq *= 2.05;
        }
        // Centrado en 168 (≈0.66 roughness) con variación ±32 (±0.125 roughness)
        const g = Math.max(0, Math.min(255, Math.round(168 + v * 22)));
        roughImgd.data[pi * 4]     = 255;
        roughImgd.data[pi * 4 + 1] = g;
        roughImgd.data[pi * 4 + 2] = 255;
        roughImgd.data[pi * 4 + 3] = 255;
      }
      rctx.putImageData(roughImgd, 0, 0);
      const skinRoughTex = new THREE.CanvasTexture(roughCanvas);
      skinRoughTex.wrapS = skinRoughTex.wrapT = THREE.RepeatWrapping;
      skinRoughTex.repeat.set(14, 14);

      // Intentar cargar VRM; si no está disponible, usar el rig procedimental.
      const loaded = await loadPanduroVrm();

      if (loaded && !disposed) {
        const { scene: vrmScene, vrm } = loaded as {
          scene: import("three").Group;
          vrm: import("@pixiv/three-vrm").VRM;
        };
        const rig = createVrmRig(vrm);
        addHandOutline(vrm, 0.016 * rig.armLen);
        vrmScene.rotation.y = rig.facingY;
        scene.add(vrmScene);
        setMode("vrm");
        callbacksRef.current.onReady?.("vrm");

        // Escena limpia estilo referencia (fondo blanco, softbox frontal)
        scene.background = new THREE.Color(0xffffff);
        const softbox = new THREE.DirectionalLight(0xffffff, 0.85);
        softbox.position.set(0, 1.5, 2.0);
        scene.add(softbox);

        // Auto-fit camera to VRM bounding box — works regardless of model scale
        {
          const box = new THREE.Box3().setFromObject(vrmScene);
          const bCenter = box.getCenter(new THREE.Vector3());
          const bSize = box.getSize(new THREE.Vector3());
          // Encuadre torso→cabeza: de 40% a 105% de la altura total
          const showMin = box.min.y + bSize.y * 0.40;
          const showMax = box.max.y + bSize.y * 0.05;
          const showCy = (showMin + showMax) / 2;
          const showH = showMax - showMin;
          camera.fov = 28;
          camera.updateProjectionMatrix();
          const halfFov = (camera.fov / 2) * Math.PI / 180;
          const dist = (showH / 2) / Math.tan(halfFov) * 1.25;
          camera.position.set(bCenter.x, showCy, bCenter.z + dist);
          camera.lookAt(bCenter.x, showCy, bCenter.z);
        }

        const clock = new THREE.Clock();

        const loop = () => {
          if (disposed) return;
          const { clip: active, startedAt } = clipRef.current;
          const dt = (performance.now() - startedAt) * SIGN_PLAYBACK_RATE;
          const kf = active ? sampleClip(active, dt % active.duration) : null;
          // setNormalizedLocalRotation ANTES de vrm.update() para que
          // update() propague normalized→raw en el mismo frame.
          if (kf) {
            applyVrmKeyframe(rig, kf, dt);
          } else {
            applyVrmIdle(rig, dt);
          }
          vrm.update(clock.getDelta());
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        loop();
      } else {
        // Fallback: rig procedimental
        const rig = buildProceduralRig(THREE, skinNormTex, skinRoughTex);
        scene.add(rig.group);
        callbacksRef.current.onReady?.("procedural");

        const loop = () => {
          if (disposed) return;
          const { clip: active, startedAt } = clipRef.current;
          const dt = (performance.now() - startedAt) * SIGN_PLAYBACK_RATE;
          const kf = active ? sampleClip(active, dt % active.duration) : null;
          if (kf) {
            const poseR = poseFromKeyframe(kf);
            const poseL = poseFromKeyframeLeft(kf);
            rig.apply(poseR, poseL, dt);
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
  }, [size]);

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

type ArmMats = {
  skin: import("three").MeshPhysicalMaterial;
  nail: import("three").MeshPhysicalMaterial;
  crease: import("three").MeshPhysicalMaterial;
  palm: import("three").MeshPhysicalMaterial;
};

type ArmHandle = {
  shoulder: import("three").Group;
  elbow: import("three").Group;
  foreArmGroup: import("three").Group;
  wrist: import("three").Group;
  thumbBase: import("three").Group;
  anchors: import("three").Group[];
  fingers: FingerHandle[];
};

type RigHandle = {
  group: import("three").Group;
  apply: (poseR: Pose, poseL: Pose, tMs: number) => void;
  applyIdle: (tMs: number) => void;
};

function buildArm(
  THREE: typeof import("three"),
  mats: ArmMats,
  sx: 1 | -1,
  group: import("three").Group,
): ArmHandle {
  const { skin: matSkin, nail: matNail, crease: matCrease, palm: matPalm } = mats;

  const shoulder = new THREE.Group();
  shoulder.position.set(sx * RIGHT_SHOULDER_X, SHOULDER_HEIGHT, 0);
  group.add(shoulder);

  const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), matSkin);
  shoulderBall.castShadow = true;
  shoulder.add(shoulderBall);
  const deltoid = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.034, BONE_LENGTHS.upperArm * 0.42, 6, 14),
    matSkin,
  );
  deltoid.position.set(sx * 0.024, -BONE_LENGTHS.upperArm * 0.22, 0.010);
  deltoid.rotation.z = sx * 0.18;
  deltoid.castShadow = true;
  shoulder.add(deltoid);

  const upperArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.030, BONE_LENGTHS.upperArm - 0.06, 8, 18),
    matSkin,
  );
  upperArm.position.y = -BONE_LENGTHS.upperArm / 2;
  shoulder.add(upperArm);
  const bicep = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.028, BONE_LENGTHS.upperArm * 0.50, 6, 12),
    matSkin,
  );
  bicep.position.set(sx * 0.006, -BONE_LENGTHS.upperArm * 0.44, 0.014);
  bicep.castShadow = true;
  shoulder.add(bicep);

  const elbow = new THREE.Group();
  elbow.position.y = -BONE_LENGTHS.upperArm;
  shoulder.add(elbow);
  elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.028, 18, 14), matSkin));

  const foreArmGroup = new THREE.Group();
  elbow.add(foreArmGroup);

  const foreArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.025, BONE_LENGTHS.foreArm - 0.06, 8, 18),
    matSkin,
  );
  foreArm.position.y = -BONE_LENGTHS.foreArm / 2;
  foreArmGroup.add(foreArm);
  const extensor = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), matSkin);
  extensor.scale.set(0.78, 1.40, 0.68);
  extensor.position.set(sx * 0.006, -BONE_LENGTHS.foreArm * 0.28, -0.006);
  extensor.castShadow = true;
  foreArmGroup.add(extensor);

  const wrist = new THREE.Group();
  wrist.position.y = -BONE_LENGTHS.foreArm;
  foreArmGroup.add(wrist);

  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.068, 24),
    new THREE.MeshBasicMaterial({ color: 0x7a4c2b, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  shadowDisc.position.set(0, -(BONE_LENGTHS.foreArm * 0.55), -0.016);
  wrist.add(shadowDisc);

  // ── Palma ─────────────────────────────────────────────────────────────────
  const palm = new THREE.Group();
  palm.position.y = -PALM_HEIGHT * 0.40;
  wrist.add(palm);

  const palmBody = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), matSkin);
  palmBody.scale.set(PALM_WIDTH * 0.52, PALM_HEIGHT * 0.50, PALM_DEPTH * 0.30);
  palmBody.castShadow = true;
  palmBody.receiveShadow = true;
  palm.add(palmBody);

  const palmFace = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), matPalm);
  palmFace.scale.set(PALM_WIDTH * 0.44, PALM_HEIGHT * 0.45, PALM_DEPTH * 0.20);
  palmFace.position.z = PALM_DEPTH * 0.16;
  palmFace.castShadow = true;
  palm.add(palmFace);

  const thenar = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), matPalm);
  thenar.scale.set(0.022, 0.038, 0.016);
  thenar.position.set(sx * PALM_WIDTH * 0.38, PALM_HEIGHT * 0.06, PALM_DEPTH * 0.18);
  palm.add(thenar);

  const hypothenar = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), matPalm);
  hypothenar.scale.set(0.016, 0.030, 0.012);
  hypothenar.position.set(-sx * PALM_WIDTH * 0.38, PALM_HEIGHT * 0.10, PALM_DEPTH * 0.14);
  palm.add(hypothenar);

  const palmCreaseCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-sx * PALM_WIDTH * 0.40, -PALM_HEIGHT * 0.10, PALM_DEPTH * 0.20),
    new THREE.Vector3(0,                         PALM_HEIGHT * 0.08,  PALM_DEPTH * 0.22),
    new THREE.Vector3( sx * PALM_WIDTH * 0.32,   PALM_HEIGHT * 0.20,  PALM_DEPTH * 0.20),
  );
  palm.add(new THREE.Mesh(new THREE.TubeGeometry(palmCreaseCurve, 18, 0.0022, 5, false), matCrease));

  const distalCreaseCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-sx * PALM_WIDTH * 0.28, -PALM_HEIGHT * 0.30, PALM_DEPTH * 0.22),
    new THREE.Vector3( sx * PALM_WIDTH * 0.05, -PALM_HEIGHT * 0.28, PALM_DEPTH * 0.24),
    new THREE.Vector3( sx * PALM_WIDTH * 0.36, -PALM_HEIGHT * 0.24, PALM_DEPTH * 0.21),
  );
  palm.add(new THREE.Mesh(new THREE.TubeGeometry(distalCreaseCurve, 14, 0.0018, 5, false), matCrease));

  const wristBall = new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS * 1.6, 18, 14), matSkin);
  wristBall.position.set(0, PALM_HEIGHT * 0.50, 0);
  palm.add(wristBall);

  const wristCrease = new THREE.Mesh(
    new THREE.TorusGeometry(PALM_WIDTH * 0.28, 0.0032, 6, 32),
    matCrease,
  );
  wristCrease.rotation.x = Math.PI / 2;
  wristCrease.position.set(0, PALM_HEIGHT * 0.46, 0);
  palm.add(wristCrease);

  const tendonMat = new THREE.MeshPhysicalMaterial({
    color: 0xb07050, roughness: 0.62, metalness: 0.0,
    transparent: true, opacity: 0.45, depthWrite: false,
  });
  for (let ti = 0; ti < 4; ti++) {
    const tx = sx * (PALM_WIDTH / 2 - (PALM_WIDTH / 4) * (0.5 + ti));
    const tendon = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0028, PALM_HEIGHT * 0.72, 4, 8),
      tendonMat,
    );
    tendon.position.set(tx, -PALM_HEIGHT * 0.06, -PALM_DEPTH * 0.14);
    palm.add(tendon);
  }

  // ── Dedos ─────────────────────────────────────────────────────────────────
  const radii: [number, number, number] = [0.0158, 0.0132, 0.0108];
  const spacing = PALM_WIDTH / 4;
  const fingers: FingerHandle[] = [];
  const anchors: import("three").Group[] = [];

  const thumbBase = new THREE.Group();
  thumbBase.position.set(sx * PALM_WIDTH * 0.46, PALM_HEIGHT * 0.05, PALM_DEPTH * 0.10);
  thumbBase.rotation.set(-0.25, -sx * Math.PI / 2.4, -sx * THUMB_ABDUCTION);
  palm.add(thumbBase);
  anchors.push(thumbBase);

  const thumb = buildFinger(THREE, matSkin, matNail, "thumb",
    [BONE_LENGTHS.thumb1, BONE_LENGTHS.thumb2, BONE_LENGTHS.thumb3], radii);
  thumbBase.add(thumb.root);
  fingers.push(thumb);
  ([thumb.joints[1], thumb.joints[2]] as import("three").Group[]).forEach((j, k) => {
    const cr = new THREE.Mesh(
      new THREE.TorusGeometry(radii[1 + k]! * 1.12, 0.0016 - k * 0.0002, 5, 20),
      matCrease,
    );
    cr.rotation.x = Math.PI / 2;
    j.add(cr);
  });

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
    anchor.position.set(sx * spec.x, -PALM_HEIGHT / 2, PALM_DEPTH * 0.04);
    palm.add(anchor);
    anchors.push(anchor);

    anchor.add(new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS * 1.2, 14, 12), matSkin));

    const f = buildFinger(THREE, matSkin, matNail, spec.name, spec.lens, radii);
    anchor.add(f.root);
    fingers.push(f);
    ([f.joints[1], f.joints[2]] as import("three").Group[]).forEach((j, k) => {
      const cr = new THREE.Mesh(
        new THREE.TorusGeometry(radii[1 + k]! * 1.12, 0.0016 - k * 0.0002, 5, 20),
        matCrease,
      );
      cr.rotation.x = Math.PI / 2;
      j.add(cr);
    });
  }

  const webMat = new THREE.MeshPhysicalMaterial({
    color: 0xb87050, roughness: 0.55, metalness: 0.0,
    transparent: true, opacity: 0.72, depthWrite: false,
    thickness: 0.30, attenuationColor: new THREE.Color(0xff9060), attenuationDistance: 0.03,
  });
  for (let wi = 0; wi < 3; wi++) {
    const xA = sx * (PALM_WIDTH / 2 - spacing * (0.5 + wi));
    const xB = sx * (PALM_WIDTH / 2 - spacing * (1.5 + wi));
    const web = new THREE.Mesh(new THREE.SphereGeometry(KNUCKLE_RADIUS * 1.05, 10, 8), webMat);
    web.scale.set(0.72, 0.55, 0.88);
    web.position.set((xA + xB) * 0.5, -PALM_HEIGHT / 2, PALM_DEPTH * 0.06);
    palm.add(web);
  }

  return { shoulder, elbow, foreArmGroup, wrist, thumbBase, anchors, fingers };
}

function buildProceduralRig(THREE: typeof import("three"), skinNormTex?: import("three").CanvasTexture, skinRoughTex?: import("three").CanvasTexture): RigHandle {
  // MeshPhysicalMaterial con sheen + thickness para simular SSS de piel.
  // thickness≈0.8 permite que la luz key-light "sangre" a través de la piel
  // de los dedos (efecto visible al contraluz), lo más cercano a SSS sin texturas.
  const matSkin = new THREE.MeshPhysicalMaterial({
    color: 0xc5825a, roughness: 0.40, metalness: 0.01,
    sheen: 0.50, sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0xee9070),
    envMapIntensity: 0.65,
    thickness: 0.80,
    // atenuación sangre-rojiza (hemoglobina): más realista que naranja.
    attenuationColor: new THREE.Color(0xff3820),
    attenuationDistance: 0.055,
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
  if (skinNormTex) {
    const nv2 = new THREE.Vector2;
    matSkin.normalMap = skinNormTex; matSkin.normalScale = nv2.set(0.05, 0.05);
    matPalm.normalMap = skinNormTex; matPalm.normalScale = nv2.clone().set(0.04, 0.04);
    matFace.normalMap = skinNormTex; matFace.normalScale = nv2.clone().set(0.03, 0.03);
  }
  // Mapa de rugosidad: modula el radio del lóbulo especular por zona de piel.
  // roughness material × roughnessMap.G → variación orgánica en la respuesta.
  if (skinRoughTex) {
    matSkin.roughnessMap = skinRoughTex; matSkin.roughness = 0.55;
    matPalm.roughnessMap = skinRoughTex; matPalm.roughness = 0.65;
    matFace.roughnessMap = skinRoughTex; matFace.roughness = 0.55;
  }
  const matHair = new THREE.MeshPhysicalMaterial({
    color: 0x2a1a10, roughness: 0.62, metalness: 0.00,
    sheen: 0.55, sheenRoughness: 0.75,
    sheenColor: new THREE.Color(0x7a5038),
    clearcoat: 0.22, clearcoatRoughness: 0.30,
    envMapIntensity: 0.50,
    // Anisotropía: simula el reflejo en línea de los mechones de pelo.
    anisotropy: 0.78, anisotropyRotation: 0.12,
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

  // Esternocleidomastoideo (SCM) — banda muscular diagonal del cuello.
  // Corre desde la región mastoidea (detrás de la oreja) hasta el manubrio esternal.
  for (const side of [-1, 1]) {
    const scm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0082, 0.072, 4, 8), matSkin,
    );
    scm.position.set(side * 0.021, SHOULDER_HEIGHT + BONE_LENGTHS.neck * 0.26, 0.020);
    scm.rotation.z = side * 0.52;
    scm.rotation.x = 0.14;
    scm.castShadow = true;
    group.add(scm);
  }

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
  const HEAD_BASE_Y = SHOULDER_HEIGHT + BONE_LENGTHS.neck;
  const headGroup = new THREE.Group();
  headGroup.position.y = HEAD_BASE_Y;
  group.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 26, 20), matFace);
  head.position.y = headR;
  head.castShadow = true;
  headGroup.add(head);

  // Ojos: esclerótica + iris + pupila + córnea (clearcoat) + destello
  const matSclera = new THREE.MeshPhysicalMaterial({ color: 0xf5ede4, roughness: 0.55, metalness: 0.0 });
  const matIris   = new THREE.MeshPhysicalMaterial({ color: 0x5c3d1e, roughness: 0.18, metalness: 0.0, envMapIntensity: 0.8 });
  const matPupil  = new THREE.MeshPhysicalMaterial({ color: 0x09070a, roughness: 0.04, metalness: 0.0 });
  // Córnea: cúpula transparente con clearcoat alto para efecto "ojo húmedo".
  const matCornea = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.0, metalness: 0.0,
    transparent: true, opacity: 0.08,
    clearcoat: 1.0, clearcoatRoughness: 0.0,
    envMapIntensity: 2.0,
    depthWrite: false,
  });
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
    // Anillo limbal — círculo oscuro en el borde exterior del iris.
    const matLimbal = new THREE.MeshBasicMaterial({ color: 0x120805 });
    const limbal = new THREE.Mesh(
      new THREE.TorusGeometry(headR * 0.082, headR * 0.009, 6, 24),
      matLimbal,
    );
    limbal.position.z = headR * 0.090;
    eg.add(limbal);
    // Pestaña superior — arco oscuro encima del ojo.
    const matLash = new THREE.MeshBasicMaterial({ color: 0x180a06 });
    const lash = new THREE.Mesh(
      new THREE.TorusGeometry(headR * 0.128, 0.0018, 4, 20, Math.PI),
      matLash,
    );
    lash.rotation.z = 0;
    lash.position.set(0, headR * 0.008, headR * 0.090);
    eg.add(lash);
    // Pliegue supratarsal — arco cutáneo sobre el párpado que da profundidad al ojo.
    const matFold = new THREE.MeshBasicMaterial({ color: 0x7a3818, transparent: true, opacity: 0.18 });
    const fold = new THREE.Mesh(
      new THREE.TorusGeometry(headR * 0.132, 0.0013, 4, 18, Math.PI * 0.80),
      matFold,
    );
    fold.position.set(0, headR * 0.016, headR * 0.090);
    eg.add(fold);
    // Cúpula corneal — esfera casi transparente con clearcoat máximo.
    const cornea = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.135, 16, 12), matCornea);
    eg.add(cornea);
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

  // Nariz: punta + puente + narinas.
  const nose = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.09, 10, 8), matFace);
  nose.scale.set(0.80, 0.65, 0.70);
  nose.position.set(0, headR * 0.92, headR * 0.95);
  headGroup.add(nose);
  // Puente nasal (cápsula vertical sutil).
  const noseBridge = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.016, headR * 0.07, 4, 8), matFace);
  noseBridge.rotation.x = 0.22;
  noseBridge.position.set(0, headR * 0.985, headR * 0.884);
  headGroup.add(noseBridge);
  // Columelas del filtrum — dos crestas verticales del surco nasolabial.
  for (const side of [-1, 1]) {
    const philtrum = new THREE.Mesh(
      new THREE.CapsuleGeometry(headR * 0.007, headR * 0.034, 4, 6), matFace,
    );
    philtrum.position.set(side * headR * 0.025, headR * 0.812, headR * 0.942);
    headGroup.add(philtrum);
  }

  // Narinas (fosas nasales oscuras).
  const matNostril = new THREE.MeshPhysicalMaterial({ color: 0x5a2616, roughness: 0.95 });
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.024, 8, 6), matNostril);
    nostril.scale.set(0.75, 0.50, 1.10);
    nostril.position.set(side * headR * 0.052, headR * 0.882, headR * 0.972);
    headGroup.add(nostril);
  }
  // Barbilla (protuberancia suave en la base del mentón).
  const chin = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.052, 10, 8), matFace);
  chin.scale.set(0.88, 0.58, 0.68);
  chin.position.set(0, headR * 0.55, headR * 0.90);
  headGroup.add(chin);
  // Ángulo mandibular — volumen lateral que define la línea de la mandíbula.
  for (const side of [-1, 1]) {
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.22, 14, 10), matFace);
    jaw.scale.set(0.58, 0.46, 0.70);
    jaw.position.set(side * headR * 0.55, headR * 0.52, headR * 0.46);
    headGroup.add(jaw);
  }
  // Conducto auditivo externo — disco oscuro dentro de cada pabellón.
  const matCanal = new THREE.MeshBasicMaterial({ color: 0x160808 });
  for (const side of [-1, 1]) {
    const canal = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.028, 8, 6), matCanal);
    canal.scale.set(0.36, 0.44, 1.0);
    canal.position.set(side * headR * 1.022, headR * 0.90, 0.001);
    headGroup.add(canal);
  }

  // Boca: labio superior + inferior + línea de comisura.
  const matMouth = new THREE.MeshPhysicalMaterial({
    color: 0x8a4030, roughness: 0.58, metalness: 0.0,
    clearcoat: 0.55, clearcoatRoughness: 0.12,
    sheen: 0.22, sheenRoughness: 0.70, sheenColor: new THREE.Color(0xcc6050),
  });
  // Labio inferior — esfera aplanada ligeramente protuberante.
  const lowerLip = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.068, 12, 8), matMouth);
  lowerLip.scale.set(1.20, 0.38, 0.68);
  lowerLip.position.set(0, headR * 0.735, headR * 0.938);
  headGroup.add(lowerLip);
  // Labio superior — dos semiesferas para el arco de Cupido.
  for (const side of [-1, 1]) {
    const up = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.044, 10, 7), matMouth);
    up.scale.set(0.80, 0.36, 0.65);
    up.position.set(side * headR * 0.044, headR * 0.775, headR * 0.940);
    headGroup.add(up);
  }
  // Línea de cierre de boca.
  const mouthLine = new THREE.Mesh(new THREE.CapsuleGeometry(headR * 0.010, headR * 0.13, 4, 8), matMouth);
  mouthLine.rotation.z = Math.PI / 2;
  mouthLine.position.set(0, headR * 0.758, headR * 0.935);
  headGroup.add(mouthLine);

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
  // Volumen temporal (sien) — dos piezas laterales para silueta más realista.
  for (const side of [-1, 1]) {
    const hairSide = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.52, 14, 10), matHair);
    hairSide.position.set(side * headR * 0.82, headR * 0.40, -headR * 0.08);
    hairSide.scale.set(0.38, 0.72, 0.70);
    hairSide.castShadow = true;
    headGroup.add(hairSide);
  }
  // Pómulos (huesos zigomáticos) — protuberancias sutiles en la zona media-lateral.
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.072, 10, 8), matFace);
    cheek.scale.set(0.55, 0.42, 0.50);
    cheek.position.set(side * headR * 0.82, headR * 0.86, headR * 0.72);
    headGroup.add(cheek);
  }
  // Lóbulo de la oreja — esfera pequeña en la parte inferior del pabellón.
  for (const side of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.046, 8, 6), matFace);
    lobe.position.set(side * headR * 1.06, headR * 0.62, 0);
    headGroup.add(lobe);
  }
  // Arco ceja superciliar (reborde óseo frontal) — protuberancia muy suave.
  for (const side of [-1, 1]) {
    const brow3d = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.062, 8, 6), matFace);
    brow3d.scale.set(0.70, 0.28, 0.44);
    brow3d.position.set(side * headR * 0.34, headR * 1.19, headR * 0.86);
    headGroup.add(brow3d);
  }
  // Pestaña inferior — arco pequeño bajo cada ojo.
  for (const eg of eyes) {
    const matLashL = new THREE.MeshBasicMaterial({ color: 0x180a06 });
    const lashLow = new THREE.Mesh(
      new THREE.TorusGeometry(headR * 0.118, 0.0012, 4, 18, Math.PI),
      matLashL,
    );
    lashLow.rotation.z = Math.PI;
    lashLow.position.set(0, -headR * 0.006, headR * 0.088);
    eg.add(lashLow);
  }

  // ── Brazos (derecho e izquierdo) ──────────────────────────────────────────
  const armMats: ArmMats = { skin: matSkin, nail: matNail, crease: matCrease, palm: matPalm };
  const rightArm = buildArm(THREE, armMats, 1, group);
  const leftArm  = buildArm(THREE, armMats, -1, group);


  const springR = {
    wrist: [0, 0, 0] as [number, number, number],
    roll: 0,
    shoulder: [0, 0, 0] as [number, number, number],
    elbow: 0.35,
  };
  const springL = {
    wrist: [0, 0, 0] as [number, number, number],
    roll: 0,
    shoulder: [0, 0, 0] as [number, number, number],
    elbow: 0.35,
  };
  const springHead = { headX: 0, headY: 0 };
  const KW = 0.18;
  const KR = 0.15;
  const KS = 0.12;
  const KH = 0.07;
  const KF = 0.22;
  const fingerSpringsR: [[number,number,number],[number,number,number],[number,number,number],[number,number,number],[number,number,number]] = [
    [0.18,0.14,0.10],[0.18,0.14,0.10],[0.18,0.14,0.10],[0.18,0.14,0.10],[0.18,0.14,0.10],
  ];
  const fingerSpringsL: [[number,number,number],[number,number,number],[number,number,number],[number,number,number],[number,number,number]] = [
    [0.18,0.14,0.10],[0.18,0.14,0.10],[0.18,0.14,0.10],[0.18,0.14,0.10],[0.18,0.14,0.10],
  ];

  // Parpadeo espontáneo: cierre 80 ms + apertura 140 ms = 220 ms total.
  // doubleBlink: 10% de probabilidad de un segundo parpadeo rápido 200 ms después.
  const BLINK_CLOSE = 80, BLINK_OPEN = 140, BLINK_DUR = BLINK_CLOSE + BLINK_OPEN;
  const blink = { next: 1500 + Math.random() * 2500, start: -1, double: false };

  function updateBlink(tMs: number) {
    if (blink.start < 0 && tMs >= blink.next) {
      blink.start = tMs;
      blink.double = Math.random() < 0.10;
      blink.next = tMs + (blink.double ? BLINK_DUR + 200 + BLINK_DUR : 2000 + Math.random() * 4000);
    }
    if (blink.start >= 0) {
      const elapsed = tMs - blink.start;
      const phase = elapsed / BLINK_DUR;
      if (phase >= 1) {
        // Si doble parpadeo, programar el segundo 200 ms después.
        if (blink.double) {
          blink.double = false;
          blink.start = -1;
          blink.next = tMs + 200; // pausa breve antes del segundo parpadeo
        } else {
          blink.start = -1;
        }
        for (const e of eyes) e.scale.y = 1;
      } else {
        // Cierre rápido (fase 0→t_close) + apertura más lenta (t_close→1)
        const raw = elapsed < BLINK_CLOSE
          ? (elapsed / BLINK_CLOSE)
          : 1 - ((elapsed - BLINK_CLOSE) / BLINK_OPEN);
        const sy = 1 - 0.92 * raw;
        for (const e of eyes) e.scale.y = sy;
      }
    }
  }

  function apply(poseR: Pose, poseL: Pose, tMs: number) {
    const breath = Math.sin(tMs * 0.0018) * 0.003 + Math.sin(tMs * 0.0054) * 0.001;
    // CRITICAL FIX: Y must be SHOULDER_HEIGHT + breath, not just breath.
    rightArm.shoulder.position.y = SHOULDER_HEIGHT + breath;
    leftArm.shoulder.position.y  = SHOULDER_HEIGHT + breath;
    torso.scale.set(1 + breath * 2, 1 + breath * 8, 1 + breath * 3);

    // Right arm
    springR.shoulder[0] += (poseR.shoulder[0] - springR.shoulder[0]) * KS;
    springR.shoulder[1] += (poseR.shoulder[1] - springR.shoulder[1]) * KS;
    springR.shoulder[2] += (poseR.shoulder[2] - springR.shoulder[2]) * KS;
    springR.elbow       += (poseR.elbow       - springR.elbow)       * KS;
    rightArm.shoulder.rotation.set(springR.shoulder[0], springR.shoulder[1], springR.shoulder[2]);
    rightArm.elbow.rotation.set(-springR.elbow, 0, 0);
    springR.roll     += (poseR.forearmRoll  - springR.roll)     * KR;
    springR.wrist[0] += (poseR.wrist[0]    - springR.wrist[0]) * KW;
    springR.wrist[1] += (poseR.wrist[1]    - springR.wrist[1]) * KW;
    springR.wrist[2] += (poseR.wrist[2]    - springR.wrist[2]) * KW;
    rightArm.foreArmGroup.rotation.y = springR.roll;
    rightArm.wrist.rotation.set(springR.wrist[0], springR.wrist[1], springR.wrist[2]);
    rightArm.thumbBase.rotation.z = -THUMB_ABDUCTION + poseR.abduction[0];
    for (let i = 1; i < 5; i++) rightArm.anchors[i]!.rotation.z = poseR.abduction[i];
    for (let i = 0; i < 5; i++) {
      const fp = poseR.fingers[i]!;
      const fs = fingerSpringsR[i]!;
      fs[0] += (fp.proximal - fs[0]) * KF;
      fs[1] += (fp.middle   - fs[1]) * KF;
      fs[2] += (fp.distal   - fs[2]) * KF;
      applyFingerFlex(rightArm.fingers[i]!, { proximal: fs[0], middle: fs[1], distal: fs[2] });
    }

    // Left arm (mirrored pose already computed by poseFromKeyframeLeft)
    springL.shoulder[0] += (poseL.shoulder[0] - springL.shoulder[0]) * KS;
    springL.shoulder[1] += (poseL.shoulder[1] - springL.shoulder[1]) * KS;
    springL.shoulder[2] += (poseL.shoulder[2] - springL.shoulder[2]) * KS;
    springL.elbow       += (poseL.elbow       - springL.elbow)       * KS;
    leftArm.shoulder.rotation.set(springL.shoulder[0], springL.shoulder[1], springL.shoulder[2]);
    leftArm.elbow.rotation.set(-springL.elbow, 0, 0);
    springL.roll     += (poseL.forearmRoll  - springL.roll)     * KR;
    springL.wrist[0] += (poseL.wrist[0]    - springL.wrist[0]) * KW;
    springL.wrist[1] += (poseL.wrist[1]    - springL.wrist[1]) * KW;
    springL.wrist[2] += (poseL.wrist[2]    - springL.wrist[2]) * KW;
    leftArm.foreArmGroup.rotation.y = springL.roll;
    leftArm.wrist.rotation.set(springL.wrist[0], springL.wrist[1], springL.wrist[2]);
    leftArm.thumbBase.rotation.z = THUMB_ABDUCTION - poseL.abduction[0];
    for (let i = 1; i < 5; i++) leftArm.anchors[i]!.rotation.z = -poseL.abduction[i];
    for (let i = 0; i < 5; i++) {
      const fp = poseL.fingers[i]!;
      const fs = fingerSpringsL[i]!;
      fs[0] += (fp.proximal - fs[0]) * KF;
      fs[1] += (fp.middle   - fs[1]) * KF;
      fs[2] += (fp.distal   - fs[2]) * KF;
      applyFingerFlex(leftArm.fingers[i]!, { proximal: fs[0], middle: fs[1], distal: fs[2] });
    }

    const handHigh = poseR.shoulder[0] < -0.25;
    const targetHX = handHigh ? poseR.shoulder[0] * 0.12 : 0;
    const targetHY = handHigh ? poseR.shoulder[1] * 0.08 : 0;
    springHead.headX += (targetHX - springHead.headX) * KH;
    springHead.headY += (targetHY - springHead.headY) * KH;
    headGroup.rotation.x = springHead.headX + Math.sin(tMs * 0.0018) * 0.002;
    headGroup.rotation.y = springHead.headY;
    headGroup.position.y = HEAD_BASE_Y + breath * 0.45;
    const gazeX = -springR.shoulder[0] * 0.14;
    const gazeY = springR.shoulder[1] * 0.10 - springHead.headY * 0.8;
    for (const e of eyes) { e.rotation.x = gazeX; e.rotation.y = gazeY; }
    updateBlink(tMs);
  }

  function applyIdle(tMs: number) {
    const breath    = Math.sin(tMs * 0.0018) * 0.004 + Math.sin(tMs * 0.0054) * 0.001;
    const sway      = Math.sin(tMs * 0.0008) * 0.008;
    const microSway = Math.sin(tMs * 0.0023) * 0.006;
    // CRITICAL FIX: Y must be SHOULDER_HEIGHT + breath, not just breath.
    rightArm.shoulder.position.y = SHOULDER_HEIGHT + breath;
    leftArm.shoulder.position.y  = SHOULDER_HEIGHT + breath;
    torso.scale.set(1 + breath * 2, 1 + breath * 8, 1 + breath * 3);
    const lateralSway = Math.sin(tMs * 0.00055) * 0.010;
    const curl = 0.06 + Math.sin(tMs * 0.0011) * 0.012;

    // Right arm idle
    springR.shoulder[0] += (0.08 + sway * 0.1 - springR.shoulder[0]) * KS;
    springR.shoulder[1] += (0                  - springR.shoulder[1]) * KS;
    springR.shoulder[2] += (lateralSway        - springR.shoulder[2]) * KS;
    springR.elbow       += (0.32 + sway * 0.04 - springR.elbow)       * KS;
    rightArm.shoulder.rotation.set(springR.shoulder[0], springR.shoulder[1], springR.shoulder[2]);
    rightArm.elbow.rotation.set(-springR.elbow, 0, 0);
    springR.roll += (0 - springR.roll) * KR;
    rightArm.foreArmGroup.rotation.y = springR.roll + microSway * 0.4;
    springR.wrist[0] += (microSway * 0.18 - springR.wrist[0]) * KW;
    springR.wrist[1] += (0                - springR.wrist[1]) * KW;
    springR.wrist[2] += (microSway * 0.06 - springR.wrist[2]) * KW;
    rightArm.wrist.rotation.set(springR.wrist[0], springR.wrist[1], springR.wrist[2]);
    rightArm.thumbBase.rotation.z = -THUMB_ABDUCTION;
    for (let i = 1; i < 5; i++) rightArm.anchors[i]!.rotation.z = 0;
    for (let i = 0; i < 5; i++) {
      const tremor = Math.sin(tMs * (0.0011 + i * 0.00031) + i * 1.2) * 0.008;
      const fs = fingerSpringsR[i]!;
      fs[0] += (0.18 + curl + tremor              - fs[0]) * KF;
      fs[1] += (0.14 + curl * 0.70 + tremor * 0.60 - fs[1]) * KF;
      fs[2] += (0.10 + curl * 0.40 + tremor * 0.30 - fs[2]) * KF;
      applyFingerFlex(rightArm.fingers[i]!, { proximal: fs[0], middle: fs[1], distal: fs[2] });
    }

    // Left arm idle (symmetric mirror)
    springL.shoulder[0] += (0.08 + sway * 0.1 - springL.shoulder[0]) * KS;
    springL.shoulder[1] += (0                  - springL.shoulder[1]) * KS;
    springL.shoulder[2] += (-lateralSway       - springL.shoulder[2]) * KS;
    springL.elbow       += (0.32 + sway * 0.04 - springL.elbow)       * KS;
    leftArm.shoulder.rotation.set(springL.shoulder[0], springL.shoulder[1], springL.shoulder[2]);
    leftArm.elbow.rotation.set(-springL.elbow, 0, 0);
    springL.roll += (0 - springL.roll) * KR;
    leftArm.foreArmGroup.rotation.y = springL.roll - microSway * 0.4;
    springL.wrist[0] += (microSway * 0.18 - springL.wrist[0]) * KW;
    springL.wrist[1] += (0                - springL.wrist[1]) * KW;
    springL.wrist[2] += (-microSway * 0.06 - springL.wrist[2]) * KW;
    leftArm.wrist.rotation.set(springL.wrist[0], springL.wrist[1], springL.wrist[2]);
    leftArm.thumbBase.rotation.z = THUMB_ABDUCTION;
    for (let i = 1; i < 5; i++) leftArm.anchors[i]!.rotation.z = 0;
    for (let i = 0; i < 5; i++) {
      const tremor = Math.sin(tMs * (0.0011 + i * 0.00031) + i * 1.2) * 0.008;
      const fs = fingerSpringsL[i]!;
      fs[0] += (0.18 + curl + tremor              - fs[0]) * KF;
      fs[1] += (0.14 + curl * 0.70 + tremor * 0.60 - fs[1]) * KF;
      fs[2] += (0.10 + curl * 0.40 + tremor * 0.30 - fs[2]) * KF;
      applyFingerFlex(leftArm.fingers[i]!, { proximal: fs[0], middle: fs[1], distal: fs[2] });
    }

    const headSway = Math.sin(tMs * 0.00055) * 0.010;
    const chinDown  = 0.025 + Math.sin(tMs * 0.0018) * 0.004;
    springHead.headX += (chinDown - springHead.headX) * KH;
    springHead.headY += (0        - springHead.headY) * KH;
    headGroup.rotation.x = springHead.headX;
    headGroup.rotation.y = springHead.headY + headSway;
    headGroup.rotation.z = Math.sin(tMs * 0.00038) * 0.006;
    headGroup.position.y = HEAD_BASE_Y + breath * 0.45;
    const idleGazeX = Math.sin(tMs * 0.000267) * 0.016 + Math.sin(tMs * 0.000891) * 0.006;
    const idleGazeY = Math.sin(tMs * 0.000184) * 0.013 + Math.sin(tMs * 0.000712) * 0.005;
    const sacX = Math.sign(Math.sin(tMs * 0.00312)) * 0.004 * (Math.random() < 0.002 ? 1 : 0);
    const sacY = Math.sign(Math.sin(tMs * 0.00289)) * 0.003 * (Math.random() < 0.002 ? 1 : 0);
    for (const e of eyes) { e.rotation.x = idleGazeX + sacX; e.rotation.y = idleGazeY + sacY; }
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

  // Uña en la distal — esfera aplanada para simular la curvatura natural.
  const nail = new THREE.Mesh(
    new THREE.SphereGeometry(r2 * 0.80, 14, 8),
    matNail,
  );
  nail.scale.set(1.10, 0.20, 0.72);
  nail.castShadow = true;
  nail.position.set(0, -len3 * 0.48, r2 * 0.84);
  g3.add(nail);
  // Pulpejo — esfera carnosa en la yema del dedo (palmar).
  const pulpMat = new THREE.MeshPhysicalMaterial({
    color: 0xc06050, roughness: 0.52, metalness: 0.00,
    // Hemoglobina visible en la yema: atenuación roja como la piel real.
    thickness: 0.45, attenuationColor: new THREE.Color(0xff3010), attenuationDistance: 0.032,
  });
  const pulp = new THREE.Mesh(new THREE.SphereGeometry(r2 * 0.78, 10, 8), pulpMat);
  pulp.scale.set(0.92, 0.34, 0.88);
  pulp.position.set(0, -len3 * 0.54, -r2 * 0.66);
  g3.add(pulp);

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
