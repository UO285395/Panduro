import type { VRM } from "@pixiv/three-vrm";
import { VRMHumanBoneName as B } from "@pixiv/three-vrm";
import * as THREE from "three";

const FINGER_BONES: B[] = [
  B.RightThumbMetacarpal, B.RightThumbProximal, B.RightThumbDistal,
  B.RightIndexProximal, B.RightIndexIntermediate, B.RightIndexDistal,
  B.RightMiddleProximal, B.RightMiddleIntermediate, B.RightMiddleDistal,
  B.RightRingProximal, B.RightRingIntermediate, B.RightRingDistal,
  B.RightLittleProximal, B.RightLittleIntermediate, B.RightLittleDistal,
  B.LeftThumbMetacarpal, B.LeftThumbProximal, B.LeftThumbDistal,
  B.LeftIndexProximal, B.LeftIndexIntermediate, B.LeftIndexDistal,
  B.LeftMiddleProximal, B.LeftMiddleIntermediate, B.LeftMiddleDistal,
  B.LeftRingProximal, B.LeftRingIntermediate, B.LeftRingDistal,
  B.LeftLittleProximal, B.LeftLittleIntermediate, B.LeftLittleDistal,
];

/**
 * Contorno de las manos con la técnica de casco invertido (la misma que usa
 * MToon): se duplican los triángulos de piel que tocan la mano o los dedos,
 * se dibujan solo sus caras traseras y se desplazan a lo largo de la normal ya
 * skinneada. Basta con que un vértice tenga peso de mano para incluir el
 * triángulo: así el contorno recorre la mano entera y su borde abierto queda
 * dentro de la manga. Comparte el esqueleto, así que sigue cada pose.
 */
export function addHandOutline(vrm: VRM, width: number, color = 0x4a2c24) {
  const node = (b: B) => vrm.humanoid.getRawBoneNode(b);
  const fingerNodes = new Set(FINGER_BONES.map(node).filter((n): n is THREE.Object3D => !!n));
  const handNodes = new Set(fingerNodes);
  for (const b of [B.RightHand, B.LeftHand]) {
    const n = node(b);
    if (n) handNodes.add(n);
  }

  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uOutlineWidth;")
      .replace(
        "#include <skinning_vertex>",
        "#include <skinning_vertex>\ntransformed += normalize(objectNormal) * uOutlineWidth;",
      );
  };

  const meshes: THREE.SkinnedMesh[] = [];
  vrm.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh);
  });

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const skinIndex = geo.getAttribute("skinIndex");
    const skinWeight = geo.getAttribute("skinWeight");
    if (!skinIndex || !skinWeight || !geo.getAttribute("normal")) continue;

    const isHandBone = mesh.skeleton.bones.map((b) => handNodes.has(b));
    const isFingerBone = mesh.skeleton.bones.map((b) => fingerNodes.has(b));
    const weightOn = (flags: boolean[], v: number) => {
      let w = 0;
      for (let k = 0; k < 4; k++) {
        if (flags[skinIndex.getComponent(v, k)]) w += skinWeight.getComponent(v, k);
      }
      return w;
    };

    // Solo la malla de piel llega a los dedos; la ropa (puños) se queda fuera.
    let reachesFingers = false;
    for (let v = 0; v < skinIndex.count && !reachesFingers; v++) {
      reachesFingers = weightOn(isFingerBone, v) > 0.5;
    }
    if (!reachesFingers) continue;

    const index = geo.getIndex();
    const triCount = (index ? index.count : geo.getAttribute("position").count) / 3;
    const vertexAt = (i: number) => (index ? index.getX(i) : i);
    const touchesHand = (v: number) => weightOn(isHandBone, v) > 0.01;
    const kept: number[] = [];
    for (let t = 0; t < triCount; t++) {
      const a = vertexAt(t * 3), b = vertexAt(t * 3 + 1), c = vertexAt(t * 3 + 2);
      if (touchesHand(a) || touchesHand(b) || touchesHand(c)) kept.push(a, b, c);
    }
    if (kept.length === 0) continue;

    const outlineGeo = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "skinIndex", "skinWeight"]) {
      outlineGeo.setAttribute(name, geo.getAttribute(name));
    }
    outlineGeo.setIndex(kept);

    const outline = new THREE.SkinnedMesh(outlineGeo, material);
    outline.name = `${mesh.name}_handOutline`;
    outline.frustumCulled = false;
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    outline.bind(mesh.skeleton, mesh.bindMatrix);
    mesh.parent?.add(outline);
  }
}
