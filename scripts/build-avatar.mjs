#!/usr/bin/env node
/**
 * scripts/build-avatar.mjs
 * Genera un avatar VRM1 para Panduro LSE — sin dependencias externas.
 *
 * Uso: node scripts/build-avatar.mjs
 * Salida: public/avatars/panduro.vrm
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/avatars/panduro.vrm');
mkdirSync(join(__dirname, '../public/avatars'), { recursive: true });

// ══════════════════════════════════════════════════════════════════════════════
// GEOMETRÍA
// ══════════════════════════════════════════════════════════════════════════════

function genSphere(r, lat, lon, cx = 0, cy = 0, cz = 0) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI;
    const st = Math.sin(th), ct = Math.cos(th);
    for (let j = 0; j <= lon; j++) {
      const ph = (j / lon) * 2 * Math.PI;
      const nx = Math.cos(ph) * st, ny = ct, nz = Math.sin(ph) * st;
      pos.push(cx + r * nx, cy + r * ny, cz + r * nz);
      nrm.push(nx, ny, nz); uv.push(j / lon, i / lat);
    }
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const a = i*(lon+1)+j, b=a+1, c=(i+1)*(lon+1)+j, d=c+1;
    idx.push(a,c,b, b,c,d);
  }
  return { pos, nrm, uv, idx };
}

// Semiesfera (parte superior) para cabello
function genHemisphere(r, halfLat, lon, cx, cy, cz) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i <= halfLat; i++) {
    const th = (i / (halfLat * 2)) * Math.PI; // solo mitad superior
    const st = Math.sin(th), ct = Math.cos(th);
    for (let j = 0; j <= lon; j++) {
      const ph = (j / lon) * 2 * Math.PI;
      const nx = Math.cos(ph) * st, ny = ct, nz = Math.sin(ph) * st;
      pos.push(cx + r * nx, cy + r * ny, cz + r * nz);
      nrm.push(nx, ny, nz); uv.push(j / lon, i / halfLat);
    }
  }
  for (let i = 0; i < halfLat; i++) for (let j = 0; j < lon; j++) {
    const a = i*(lon+1)+j, b=a+1, c=(i+1)*(lon+1)+j, d=c+1;
    idx.push(a,c,b, b,c,d);
  }
  return { pos, nrm, uv, idx };
}

// Cilindro entre dos puntos 3D
function genCap(p1, p2, r, segs = 10) {
  const [x1,y1,z1]=p1, [x2,y2,z2]=p2;
  const dx=x2-x1, dy=y2-y1, dz=z2-z1;
  const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
  if (len < 1e-6) return { pos:[], nrm:[], uv:[], idx:[] };
  const ux=dx/len, uy=dy/len, uz=dz/len;
  let vx, vy, vz;
  if (Math.abs(ux) < 0.8) { vx=0; vy=-uz; vz=uy; }
  else { vx=uz; vy=0; vz=-ux; }
  const vl=Math.sqrt(vx*vx+vy*vy+vz*vz); vx/=vl; vy/=vl; vz/=vl;
  const wx=uy*vz-uz*vy, wy=uz*vx-ux*vz, wz=ux*vy-uy*vx;

  const pos=[], nrm=[], uv=[], idx=[];
  const stride = segs+1;
  for (let end=0; end<=1; end++) {
    const bx=x1+ux*len*end, by=y1+uy*len*end, bz=z1+uz*len*end;
    for (let i=0; i<=segs; i++) {
      const phi=(i/segs)*2*Math.PI, cp=Math.cos(phi), sp=Math.sin(phi);
      const nx=cp*vx+sp*wx, ny=cp*vy+sp*wy, nz=cp*vz+sp*wz;
      pos.push(bx+r*nx, by+r*ny, bz+r*nz); nrm.push(nx,ny,nz); uv.push(i/segs, end);
    }
  }
  for (let i=0; i<segs; i++) { const a=i,b=i+1,c=stride+i,d=stride+i+1; idx.push(a,c,b, b,c,d); }
  // tapas
  const bc=pos.length/3;
  pos.push(x1,y1,z1); nrm.push(-ux,-uy,-uz); uv.push(0.5,0.5);
  for (let i=0; i<segs; i++) {
    const phi=(i/segs)*2*Math.PI;
    pos.push(x1+r*(Math.cos(phi)*vx+Math.sin(phi)*wx), y1+r*(Math.cos(phi)*vy+Math.sin(phi)*wy), z1+r*(Math.cos(phi)*vz+Math.sin(phi)*wz));
    nrm.push(-ux,-uy,-uz); uv.push(0.5,0.5);
  }
  for (let i=0; i<segs; i++) idx.push(bc, bc+1+(i+1)%segs, bc+1+i);
  const tc=pos.length/3;
  pos.push(x2,y2,z2); nrm.push(ux,uy,uz); uv.push(0.5,0.5);
  for (let i=0; i<segs; i++) {
    const phi=(i/segs)*2*Math.PI;
    pos.push(x2+r*(Math.cos(phi)*vx+Math.sin(phi)*wx), y2+r*(Math.cos(phi)*vy+Math.sin(phi)*wy), z2+r*(Math.cos(phi)*vz+Math.sin(phi)*wz));
    nrm.push(ux,uy,uz); uv.push(0.5,0.5);
  }
  for (let i=0; i<segs; i++) idx.push(tc, tc+1+i, tc+1+(i+1)%segs);
  return { pos, nrm, uv, idx };
}

function genBox(w, h, d, cx=0, cy=0, cz=0) {
  const hw=w/2, hh=h/2, hd=d/2;
  const FACES=[
    {v:[[-hw,-hh,hd],[hw,-hh,hd],[hw,hh,hd],[-hw,hh,hd]], n:[0,0,1]},
    {v:[[hw,-hh,-hd],[-hw,-hh,-hd],[-hw,hh,-hd],[hw,hh,-hd]], n:[0,0,-1]},
    {v:[[-hw,-hh,-hd],[-hw,-hh,hd],[-hw,hh,hd],[-hw,hh,-hd]], n:[-1,0,0]},
    {v:[[hw,-hh,hd],[hw,-hh,-hd],[hw,hh,-hd],[hw,hh,hd]], n:[1,0,0]},
    {v:[[-hw,hh,hd],[hw,hh,hd],[hw,hh,-hd],[-hw,hh,-hd]], n:[0,1,0]},
    {v:[[-hw,-hh,-hd],[hw,-hh,-hd],[hw,-hh,hd],[-hw,-hh,hd]], n:[0,-1,0]},
  ];
  const pos=[], nrm=[], uv=[], idx=[];
  for (const {v,n} of FACES) {
    const base=pos.length/3;
    for (const [x,y,z] of v) { pos.push(cx+x,cy+y,cz+z); nrm.push(...n); uv.push(0,0); }
    idx.push(base,base+1,base+2, base,base+2,base+3);
  }
  return { pos, nrm, uv, idx };
}

// ══════════════════════════════════════════════════════════════════════════════
// ESQUELETO — definición con referencias por nombre
// ══════════════════════════════════════════════════════════════════════════════

// world: posición en espacio mundo (metros, T-pose)
// parent: nombre del hueso padre (null = raíz)
const BONE_DEFS = [
  // Core
  { name:'hips',           vrm:'hips',           parent:null,           world:[ 0.000, 0.890, 0.000] },
  { name:'spine',          vrm:'spine',          parent:'hips',         world:[ 0.000, 1.000, 0.000] },
  { name:'chest',          vrm:'chest',          parent:'spine',        world:[ 0.000, 1.150, 0.000] },
  { name:'upperChest',     vrm:'upperChest',     parent:'chest',        world:[ 0.000, 1.300, 0.000] },
  { name:'neck',           vrm:'neck',           parent:'upperChest',   world:[ 0.000, 1.460, 0.000] },
  { name:'head',           vrm:'head',           parent:'neck',         world:[ 0.000, 1.560, 0.000] },

  // Brazo izquierdo
  { name:'leftShoulder',   vrm:'leftShoulder',   parent:'upperChest',   world:[-0.070, 1.380, 0.000] },
  { name:'leftUpperArm',   vrm:'leftUpperArm',   parent:'leftShoulder', world:[-0.170, 1.380, 0.000] },
  { name:'leftLowerArm',   vrm:'leftLowerArm',   parent:'leftUpperArm', world:[-0.380, 1.380, 0.000] },
  { name:'leftHand',       vrm:'leftHand',       parent:'leftLowerArm', world:[-0.580, 1.360, 0.000] },

  // Dedos izquierda — pulgar
  { name:'lThumbMeta',  vrm:'leftThumbMetacarpal',  parent:'leftHand',    world:[-0.620, 1.360, 0.025] },
  { name:'lThumbProx',  vrm:'leftThumbProximal',    parent:'lThumbMeta',  world:[-0.645, 1.360, 0.043] },
  { name:'lThumbDist',  vrm:'leftThumbDistal',      parent:'lThumbProx',  world:[-0.670, 1.360, 0.057] },

  // Dedos izquierda — índice
  { name:'lIdxProx',    vrm:'leftIndexProximal',    parent:'leftHand',    world:[-0.620, 1.360, 0.012] },
  { name:'lIdxMid',     vrm:'leftIndexIntermediate',parent:'lIdxProx',    world:[-0.655, 1.360, 0.012] },
  { name:'lIdxDist',    vrm:'leftIndexDistal',      parent:'lIdxMid',     world:[-0.685, 1.360, 0.012] },

  // Dedos izquierda — medio
  { name:'lMidProx',    vrm:'leftMiddleProximal',    parent:'leftHand',   world:[-0.620, 1.360, 0.000] },
  { name:'lMidMid',     vrm:'leftMiddleIntermediate',parent:'lMidProx',   world:[-0.660, 1.360, 0.000] },
  { name:'lMidDist',    vrm:'leftMiddleDistal',      parent:'lMidMid',    world:[-0.693, 1.360, 0.000] },

  // Dedos izquierda — anular
  { name:'lRingProx',   vrm:'leftRingProximal',    parent:'leftHand',     world:[-0.620, 1.360,-0.012] },
  { name:'lRingMid',    vrm:'leftRingIntermediate',parent:'lRingProx',    world:[-0.655, 1.360,-0.012] },
  { name:'lRingDist',   vrm:'leftRingDistal',      parent:'lRingMid',     world:[-0.683, 1.360,-0.012] },

  // Dedos izquierda — meñique
  { name:'lLittleProx', vrm:'leftLittleProximal',    parent:'leftHand',   world:[-0.615, 1.355,-0.022] },
  { name:'lLittleMid',  vrm:'leftLittleIntermediate',parent:'lLittleProx',world:[-0.643, 1.355,-0.022] },
  { name:'lLittleDist', vrm:'leftLittleDistal',      parent:'lLittleMid', world:[-0.665, 1.355,-0.022] },

  // Brazo derecho
  { name:'rightShoulder',  vrm:'rightShoulder',   parent:'upperChest',    world:[ 0.070, 1.380, 0.000] },
  { name:'rightUpperArm',  vrm:'rightUpperArm',   parent:'rightShoulder', world:[ 0.170, 1.380, 0.000] },
  { name:'rightLowerArm',  vrm:'rightLowerArm',   parent:'rightUpperArm', world:[ 0.380, 1.380, 0.000] },
  { name:'rightHand',      vrm:'rightHand',       parent:'rightLowerArm', world:[ 0.580, 1.360, 0.000] },

  // Dedos derecha — pulgar
  { name:'rThumbMeta',  vrm:'rightThumbMetacarpal',  parent:'rightHand',   world:[ 0.620, 1.360, 0.025] },
  { name:'rThumbProx',  vrm:'rightThumbProximal',    parent:'rThumbMeta',  world:[ 0.645, 1.360, 0.043] },
  { name:'rThumbDist',  vrm:'rightThumbDistal',      parent:'rThumbProx',  world:[ 0.670, 1.360, 0.057] },

  // Dedos derecha — índice
  { name:'rIdxProx',    vrm:'rightIndexProximal',    parent:'rightHand',   world:[ 0.620, 1.360, 0.012] },
  { name:'rIdxMid',     vrm:'rightIndexIntermediate',parent:'rIdxProx',    world:[ 0.655, 1.360, 0.012] },
  { name:'rIdxDist',    vrm:'rightIndexDistal',      parent:'rIdxMid',     world:[ 0.685, 1.360, 0.012] },

  // Dedos derecha — medio
  { name:'rMidProx',    vrm:'rightMiddleProximal',    parent:'rightHand',  world:[ 0.620, 1.360, 0.000] },
  { name:'rMidMid',     vrm:'rightMiddleIntermediate',parent:'rMidProx',   world:[ 0.660, 1.360, 0.000] },
  { name:'rMidDist',    vrm:'rightMiddleDistal',       parent:'rMidMid',   world:[ 0.693, 1.360, 0.000] },

  // Dedos derecha — anular
  { name:'rRingProx',   vrm:'rightRingProximal',    parent:'rightHand',    world:[ 0.620, 1.360,-0.012] },
  { name:'rRingMid',    vrm:'rightRingIntermediate',parent:'rRingProx',    world:[ 0.655, 1.360,-0.012] },
  { name:'rRingDist',   vrm:'rightRingDistal',      parent:'rRingMid',     world:[ 0.683, 1.360,-0.012] },

  // Dedos derecha — meñique
  { name:'rLittleProx', vrm:'rightLittleProximal',    parent:'rightHand',  world:[ 0.615, 1.355,-0.022] },
  { name:'rLittleMid',  vrm:'rightLittleIntermediate',parent:'rLittleProx',world:[ 0.643, 1.355,-0.022] },
  { name:'rLittleDist', vrm:'rightLittleDistal',      parent:'rLittleMid', world:[ 0.665, 1.355,-0.022] },

  // Piernas
  { name:'leftUpperLeg', vrm:'leftUpperLeg', parent:'hips',         world:[-0.100, 0.880, 0.000] },
  { name:'leftLowerLeg', vrm:'leftLowerLeg', parent:'leftUpperLeg', world:[-0.100, 0.500, 0.000] },
  { name:'leftFoot',     vrm:'leftFoot',     parent:'leftLowerLeg', world:[-0.100, 0.100, 0.000] },
  { name:'leftToes',     vrm:'leftToes',     parent:'leftFoot',     world:[-0.100, 0.020, 0.080] },

  { name:'rightUpperLeg', vrm:'rightUpperLeg', parent:'hips',          world:[ 0.100, 0.880, 0.000] },
  { name:'rightLowerLeg', vrm:'rightLowerLeg', parent:'rightUpperLeg', world:[ 0.100, 0.500, 0.000] },
  { name:'rightFoot',     vrm:'rightFoot',     parent:'rightLowerLeg', world:[ 0.100, 0.100, 0.000] },
  { name:'rightToes',     vrm:'rightToes',     parent:'rightFoot',     world:[ 0.100, 0.020, 0.080] },
];

// Construir índices
const nameToIdx = new Map(BONE_DEFS.map((b, i) => [b.name, i]));
const BONE_COUNT = BONE_DEFS.length;

function boneWorld(name) { return BONE_DEFS[nameToIdx.get(name)].world; }
function boneIdx(name) { return nameToIdx.get(name); }

// ══════════════════════════════════════════════════════════════════════════════
// PARTES DE MALLA
// matIdx: 0=piel 1=cabello 2=camisa 3=pantalón 4=zapatos
// ══════════════════════════════════════════════════════════════════════════════

function buildParts() {
  const S = (n) => boneWorld(n); // shorthand
  const I = (n) => boneIdx(n);

  const parts = [];
  const add = (geo, name, mat) => {
    if (geo.pos.length > 0) parts.push({ geo, boneIdx: I(name), matIdx: mat });
  };

  // ── Cabeza ────────────────────────────────────────────────────────────────
  add(genSphere(0.106, 14, 18, 0, 1.665, 0), 'head', 0);
  add(genHemisphere(0.113, 8, 18, 0, 1.665, 0), 'head', 1); // cabello (casco)
  // Cola de caballo
  add(genCap([0, 1.615, -0.10], [0, 1.25, -0.08], 0.028, 7), 'head', 1);
  // Flequillo
  add(genBox(0.14, 0.035, 0.025, 0, 1.735, 0.095), 'head', 1);

  // ── Cuello ─────────────────────────────────────────────────────────────────
  add(genCap(S('neck'), S('head'), 0.038, 10), 'neck', 0);

  // ── Torso ─────────────────────────────────────────────────────────────────
  // Camisa (cuerpo principal)
  add(genCap([0, 0.88, 0], [0, 1.32, 0], 0.155, 14), 'spine', 2);
  // Hombros laterales (forma de camisa)
  add(genCap(S('upperChest'), S('leftShoulder'), 0.038, 8), 'leftShoulder', 2);
  add(genCap(S('upperChest'), S('rightShoulder'), 0.038, 8), 'rightShoulder', 2);
  // Cadera (pantalón)
  add(genCap([0, 0.62, 0], [0, 0.93, 0], 0.145, 14), 'hips', 3);

  // ── Brazos ─────────────────────────────────────────────────────────────────
  add(genCap(S('leftUpperArm'), S('leftLowerArm'), 0.038, 10), 'leftUpperArm', 2);   // manga
  add(genCap(S('leftLowerArm'), S('leftHand'),     0.033, 10), 'leftLowerArm', 0);   // antebrazo
  add(genBox(0.050, 0.030, 0.082, -0.605, 1.36, 0.003), 'leftHand', 0);              // palma

  add(genCap(S('rightUpperArm'), S('rightLowerArm'), 0.038, 10), 'rightUpperArm', 2);
  add(genCap(S('rightLowerArm'), S('rightHand'),     0.033, 10), 'rightLowerArm', 0);
  add(genBox(0.050, 0.030, 0.082, 0.605, 1.36, 0.003), 'rightHand', 0);

  // ── Dedos izquierda ────────────────────────────────────────────────────────
  const LTip = [-0.690, 1.360, 0.068]; // punta pulgar
  add(genCap(S('lThumbMeta'), S('lThumbProx'), 0.010, 6), 'lThumbMeta', 0);
  add(genCap(S('lThumbProx'), S('lThumbDist'), 0.009, 6), 'lThumbProx', 0);
  add(genCap(S('lThumbDist'), LTip,            0.008, 6), 'lThumbDist', 0);

  const LITip = [-0.707, 1.360, 0.012];
  add(genCap(S('lIdxProx'), S('lIdxMid'),  0.009, 6), 'lIdxProx', 0);
  add(genCap(S('lIdxMid'),  S('lIdxDist'), 0.008, 6), 'lIdxMid', 0);
  add(genCap(S('lIdxDist'), LITip,         0.007, 6), 'lIdxDist', 0);

  const LMTip = [-0.715, 1.360, 0.000];
  add(genCap(S('lMidProx'), S('lMidMid'),  0.009, 6), 'lMidProx', 0);
  add(genCap(S('lMidMid'),  S('lMidDist'), 0.008, 6), 'lMidMid', 0);
  add(genCap(S('lMidDist'), LMTip,         0.007, 6), 'lMidDist', 0);

  const LRTip = [-0.703, 1.360,-0.012];
  add(genCap(S('lRingProx'), S('lRingMid'),  0.009, 6), 'lRingProx', 0);
  add(genCap(S('lRingMid'),  S('lRingDist'), 0.008, 6), 'lRingMid', 0);
  add(genCap(S('lRingDist'), LRTip,          0.007, 6), 'lRingDist', 0);

  const LLTip = [-0.681, 1.355,-0.022];
  add(genCap(S('lLittleProx'), S('lLittleMid'),  0.008, 6), 'lLittleProx', 0);
  add(genCap(S('lLittleMid'),  S('lLittleDist'), 0.007, 6), 'lLittleMid', 0);
  add(genCap(S('lLittleDist'), LLTip,             0.006, 6), 'lLittleDist', 0);

  // ── Dedos derecha ──────────────────────────────────────────────────────────
  const RTip = [0.690, 1.360, 0.068];
  add(genCap(S('rThumbMeta'), S('rThumbProx'), 0.010, 6), 'rThumbMeta', 0);
  add(genCap(S('rThumbProx'), S('rThumbDist'), 0.009, 6), 'rThumbProx', 0);
  add(genCap(S('rThumbDist'), RTip,            0.008, 6), 'rThumbDist', 0);

  const RITip = [0.707, 1.360, 0.012];
  add(genCap(S('rIdxProx'), S('rIdxMid'),  0.009, 6), 'rIdxProx', 0);
  add(genCap(S('rIdxMid'),  S('rIdxDist'), 0.008, 6), 'rIdxMid', 0);
  add(genCap(S('rIdxDist'), RITip,         0.007, 6), 'rIdxDist', 0);

  const RMTip = [0.715, 1.360, 0.000];
  add(genCap(S('rMidProx'), S('rMidMid'),  0.009, 6), 'rMidProx', 0);
  add(genCap(S('rMidMid'),  S('rMidDist'), 0.008, 6), 'rMidMid', 0);
  add(genCap(S('rMidDist'), RMTip,         0.007, 6), 'rMidDist', 0);

  const RRTip = [0.703, 1.360,-0.012];
  add(genCap(S('rRingProx'), S('rRingMid'),  0.009, 6), 'rRingProx', 0);
  add(genCap(S('rRingMid'),  S('rRingDist'), 0.008, 6), 'rRingMid', 0);
  add(genCap(S('rRingDist'), RRTip,          0.007, 6), 'rRingDist', 0);

  const RLTip = [0.681, 1.355,-0.022];
  add(genCap(S('rLittleProx'), S('rLittleMid'),  0.008, 6), 'rLittleProx', 0);
  add(genCap(S('rLittleMid'),  S('rLittleDist'), 0.007, 6), 'rLittleMid', 0);
  add(genCap(S('rLittleDist'), RLTip,             0.006, 6), 'rLittleDist', 0);

  // ── Piernas ────────────────────────────────────────────────────────────────
  add(genCap(S('leftUpperLeg'), S('leftLowerLeg'), 0.062, 12), 'leftUpperLeg', 3);
  add(genCap(S('leftLowerLeg'), S('leftFoot'),     0.046, 12), 'leftLowerLeg', 3);
  add(genBox(0.090, 0.075, 0.195, -0.100, 0.095, 0.058), 'leftFoot', 4);

  add(genCap(S('rightUpperLeg'), S('rightLowerLeg'), 0.062, 12), 'rightUpperLeg', 3);
  add(genCap(S('rightLowerLeg'), S('rightFoot'),     0.046, 12), 'rightLowerLeg', 3);
  add(genBox(0.090, 0.075, 0.195, 0.100, 0.095, 0.058), 'rightFoot', 4);

  return parts;
}

// ══════════════════════════════════════════════════════════════════════════════
// BUILDER GLB / GLTF
// ══════════════════════════════════════════════════════════════════════════════

class BinBuf {
  constructor() { this.bufs = []; this.offset = 0; }
  push(arr) {
    const pad = (arr.byteLength + 3) & ~3;
    const b = new ArrayBuffer(pad); new Uint8Array(b).set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    this.bufs.push(b); const o = this.offset; this.offset += pad; return o;
  }
  build() {
    const total = this.bufs.reduce((s,b)=>s+b.byteLength,0);
    const out = new Uint8Array(total); let off=0;
    for (const b of this.bufs) { out.set(new Uint8Array(b), off); off += b.byteLength; }
    return out.buffer;
  }
}

function buildGLB() {
  const MATS = [
    { name:'skin',  color:[0.875,0.710,0.560,1], r:0.75, m:0 },
    { name:'hair',  color:[0.130,0.085,0.055,1], r:0.65, m:0 },
    { name:'shirt', color:[0.255,0.400,0.640,1], r:0.80, m:0 },
    { name:'pants', color:[0.150,0.150,0.220,1], r:0.90, m:0 },
    { name:'shoes', color:[0.100,0.080,0.070,1], r:0.90, m:0 },
  ];
  const gltfMats = MATS.map(m => ({
    name: m.name,
    pbrMetallicRoughness: { baseColorFactor: m.color, roughnessFactor: m.r, metallicFactor: m.m },
    doubleSided: false,
  }));

  const bb = new BinBuf();
  const bufViews = [], accs = [];

  function addAcc(data, cType, count, type, target=34962) {
    const bvOff = bb.push(data);
    const bvIdx = bufViews.length;
    bufViews.push({ buffer:0, byteOffset:bvOff, byteLength:data.byteLength, target });
    const aIdx = accs.length;
    const acc = { bufferView:bvIdx, componentType:cType, count, type };
    if (type==='VEC3' && cType===5126) {
      let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
      for (let i=0;i<count;i++) { const x=data[i*3],y=data[i*3+1],z=data[i*3+2]; if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;if(z<z0)z0=z;if(z>z1)z1=z; }
      acc.min=[x0,y0,z0]; acc.max=[x1,y1,z1];
    }
    accs.push(acc); return aIdx;
  }

  // Agrupar partes por material
  const parts = buildParts();
  const byMat = new Map();
  for (const p of parts) {
    if (!byMat.has(p.matIdx)) byMat.set(p.matIdx, []);
    byMat.get(p.matIdx).push(p);
  }

  const primitives = [];
  for (const [matIdx, group] of byMat) {
    let P=[],N=[],UV=[],JT=[],WT=[],ID=[]; let base=0;
    for (const { geo, boneIdx } of group) {
      const nv = geo.pos.length/3;
      P.push(...geo.pos); N.push(...geo.nrm); UV.push(...geo.uv);
      for (let i=0;i<nv;i++) { JT.push(boneIdx,0,0,0); WT.push(1,0,0,0); }
      for (const i of geo.idx) ID.push(base+i);
      base += nv;
    }
    const n=P.length/3;
    const posA = addAcc(new Float32Array(P),  5126, n, 'VEC3');
    const nrmA = addAcc(new Float32Array(N),  5126, n, 'VEC3');
    const uvA  = addAcc(new Float32Array(UV), 5126, n, 'VEC2');
    const jtA  = addAcc(new Uint8Array(JT),   5121, n, 'VEC4');
    const wtA  = addAcc(new Float32Array(WT), 5126, n, 'VEC4');
    const useU32 = Math.max(...ID) > 65535;
    const idxArr = useU32 ? new Uint32Array(ID) : new Uint16Array(ID);
    const idxA = addAcc(idxArr, useU32?5125:5123, ID.length, 'SCALAR', 34963);
    primitives.push({ attributes:{POSITION:posA,NORMAL:nrmA,TEXCOORD_0:uvA,JOINTS_0:jtA,WEIGHTS_0:wtA}, indices:idxA, material:matIdx });
  }

  // Nodos de huesos
  const childrenMap = Array.from({length:BONE_COUNT},()=>[]);
  for (let i=0;i<BONE_COUNT;i++) {
    const p = BONE_DEFS[i].parent;
    if (p !== null) childrenMap[nameToIdx.get(p)].push(i);
  }

  const gltfNodes = BONE_DEFS.map((b, i) => {
    const parentWorld = b.parent ? BONE_DEFS[nameToIdx.get(b.parent)].world : [0,0,0];
    const local = b.world.map((v,k)=>v-parentWorld[k]);
    const node = { name:b.name, translation:local };
    if (childrenMap[i].length) node.children = childrenMap[i];
    return node;
  });
  // Nodo de malla (índice BONE_COUNT)
  gltfNodes.push({ name:'Body', mesh:0, skin:0 });

  // Skin — inverse bind matrices
  const ibm = new Float32Array(BONE_COUNT*16);
  for (let i=0;i<BONE_COUNT;i++) {
    const [wx,wy,wz]=BONE_DEFS[i].world, o=i*16;
    ibm[o]=1; ibm[o+5]=1; ibm[o+10]=1; ibm[o+15]=1;
    ibm[o+12]=-wx; ibm[o+13]=-wy; ibm[o+14]=-wz;
  }
  const ibmBV = bb.push(ibm); const ibmBVi = bufViews.length;
  bufViews.push({ buffer:0, byteOffset:ibmBV, byteLength:ibm.byteLength });
  const ibmAcc = accs.length;
  accs.push({ bufferView:ibmBVi, componentType:5126, count:BONE_COUNT, type:'MAT4' });

  const skin = {
    name:'PanduroSkin',
    joints: Array.from({length:BONE_COUNT},(_,i)=>i),
    inverseBindMatrices: ibmAcc,
    skeleton: 0,
  };

  // Raíz de la escena
  const roots = [];
  for (let i=0;i<BONE_COUNT;i++) if (BONE_DEFS[i].parent===null) roots.push(i);
  roots.push(BONE_COUNT); // mesh node

  // VRM1 extension
  const humanBones = {};
  for (let i=0;i<BONE_COUNT;i++) humanBones[BONE_DEFS[i].vrm] = { node:i };

  const vrmExt = {
    specVersion:'1.0',
    meta:{
      name:'Panduro',version:'1.0',authors:['Panduro LSE'],
      licenseUrl:'https://vrm.dev/licenses/1.0/',
      avatarPermission:'onlyAuthor',
      allowExcessivelyViolentUsage:false,allowExcessivelySexualUsage:false,
      commercialUsage:'personalNonProfit',
      allowPoliticalOrReligiousUsage:false,allowAntisocialOrHateUsage:false,
      creditNotation:'unnecessary',allowRedistribution:false,modification:'prohibited',
    },
    humanoid:{ humanBones },
    lookAt:{
      type:'bone',
      rangeMapHorizontalInner:{inputMaxValue:90,outputScale:10},
      rangeMapHorizontalOuter:{inputMaxValue:90,outputScale:10},
      rangeMapVerticalDown:{inputMaxValue:90,outputScale:10},
      rangeMapVerticalUp:{inputMaxValue:90,outputScale:10},
    },
    expressions:{
      preset:{
        happy:{morphTargetBinds:[],materialColorBinds:[]},
        angry:{morphTargetBinds:[],materialColorBinds:[]},
        sad:{morphTargetBinds:[],materialColorBinds:[]},
        relaxed:{morphTargetBinds:[],materialColorBinds:[]},
        surprised:{morphTargetBinds:[],materialColorBinds:[]},
        aa:{morphTargetBinds:[],materialColorBinds:[]},
        ih:{morphTargetBinds:[],materialColorBinds:[]},
        ou:{morphTargetBinds:[],materialColorBinds:[]},
        ee:{morphTargetBinds:[],materialColorBinds:[]},
        oh:{morphTargetBinds:[],materialColorBinds:[]},
        blink:{morphTargetBinds:[],materialColorBinds:[]},
        blinkLeft:{morphTargetBinds:[],materialColorBinds:[]},
        blinkRight:{morphTargetBinds:[],materialColorBinds:[]},
      },
    },
  };

  // Ensamblar glTF
  const binBuf = bb.build();
  const doc = {
    asset:{version:'2.0',generator:'Panduro LSE VRM Builder'},
    scene:0,
    scenes:[{name:'Scene',nodes:roots}],
    nodes:gltfNodes,
    meshes:[{name:'Body',primitives}],
    skins:[skin],
    materials:gltfMats,
    accessors:accs,
    bufferViews:bufViews,
    buffers:[{byteLength:binBuf.byteLength}],
    extensionsUsed:['VRMC_vrm'],
    extensions:{VRMC_vrm:vrmExt},
  };

  // GLB
  const jsonBytes = new TextEncoder().encode(JSON.stringify(doc));
  const jPad = (jsonBytes.length+3)&~3;
  const jChunk = new Uint8Array(jPad); jChunk.set(jsonBytes); jChunk.fill(0x20, jsonBytes.length);
  const bBytes = new Uint8Array(binBuf);
  const bPad = (bBytes.length+3)&~3;
  const bChunk = new Uint8Array(bPad); bChunk.set(bBytes);

  const total = 12 + 8+jPad + 8+bPad;
  const out = new ArrayBuffer(total); const dv = new DataView(out); const u8 = new Uint8Array(out);
  let o=0;
  dv.setUint32(o,0x46546C67,true); o+=4;
  dv.setUint32(o,2,true);          o+=4;
  dv.setUint32(o,total,true);      o+=4;
  dv.setUint32(o,jPad,true);       o+=4;
  dv.setUint32(o,0x4E4F534A,true); o+=4; u8.set(jChunk,o); o+=jPad;
  dv.setUint32(o,bPad,true);       o+=4;
  dv.setUint32(o,0x004E4942,true); o+=4; u8.set(bChunk,o);

  return Buffer.from(out);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
console.log('Generando avatar VRM1 para Panduro LSE...');
const glb = buildGLB();
writeFileSync(OUT, glb);
const kb = (glb.length / 1024).toFixed(1);
console.log(`✓ Avatar guardado en ${OUT} (${kb} KB)`);
console.log(`  ${BONE_COUNT} huesos VRM1 (${BONE_DEFS.filter(b=>b.vrm.includes('Thumb')||b.vrm.includes('Index')||b.vrm.includes('Middle')||b.vrm.includes('Ring')||b.vrm.includes('Little')).length} de dedos)`);
console.log('  Materiales PBR: piel, cabello, camisa azul, pantalón oscuro, zapatos');
