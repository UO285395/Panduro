#!/usr/bin/env python3
"""Compara el avatar con el vídeo del DILSE de cada signo y ordena los signos por lo que se apartan.

Para que la revisión humana (/dev/revisar) empiece por los signos que más probablemente estén
mal. Lee el esqueleto del avatar que saca /dev/auditar («Descargar esqueletos-avatar.json») y
los landmarks de MediaPipe de los vídeos (data/dilse/landmarks.json, de videos_to_signs.py), y
escribe content/signs/audit.json:

    .venv/bin/python scripts/audit_signs.py esqueletos-avatar.json

Por cada mano compara, fotograma a fotograma, tres cosas que se ven al poner el vídeo y el
avatar uno al lado del otro:

- posición: el centro de la palma respecto a los hombros y la boca; junto a la cara, en
  coordenadas de cara (el avatar tiene la cabeza de dibujo, más grande que la de una persona);
- forma: los ángulos de cada articulación de los dedos y la separación entre ellos (en 3D,
  sin depender de hacia dónde mire la mano);
- orientación: la normal de la palma y la dirección de la mano, respecto a la cámara.

Los dos lados se alinean en el tiempo con DTW (el clip contra el tramo del vídeo en que mejor
encaja). Cada medida se divide por la que no supera el 75 % de los signos, y un signo puntúa
por lo peor que tiene (más la mitad de lo segundo peor).

Lo que la auditoría no ve: un error de MediaPipe que el avatar copia igual (la grabación y el
avatar coinciden, pero los dos con el vídeo mal medido). Para eso sigue haciendo falta mirar.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
# La de una persona en coordenadas de cara (ver HUMAN en lib/avatar/bodyPoints.ts).
HUMAN = dict(chinV=-1.75, topV=1.7, edgeH=2.3, eyeInH=0.52, eyeOutH=1.48, eyeTopV=0.12, eyeBottomV=-0.12)
# Una distancia ojos→boca en anchos de hombros, para comparar errores de cara y de cuerpo.
FACE_TO_BODY = 0.18
# Escala de cada medida para alinear en el tiempo (lo que se considera un error normal).
SCALE = {"pos": 0.25, "shape": 0.25, "orient": 0.5}
# Mientras la mano toca algo, el avatar la gira a propósito para que el contacto quede bien
# (PENSAR, CÓMO): su orientación cuenta la mitad.
CONTACT_ORIENT = 0.5
FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
CHAINS = [[0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]]
# Para reflejar un fotograma: cara (nariz, ojos, orejas, boca) y brazos de un lado al otro.
FACE_SWAP = [0, 4, 5, 6, 1, 2, 3, 8, 7, 10, 9]
ARMS_SWAP = [1, 0, 3, 2, 5, 4]
STEP_S = 0.04  # el avatar se muestrea cada 40 ms (/dev/auditar)


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def angle(a, b):
    return float(np.arccos(np.clip(np.sum(unit(a) * unit(b), -1), -1, 1)))


def piecewise(x, xs, ys):
    """Como piecewise de bodyPoints.ts: por tramos y, fuera, siguiendo el primero o el último."""
    k = 0
    while k < len(xs) - 2 and x > xs[k + 1]:
        k += 1
    return ys[k] + (x - xs[k]) / (xs[k + 1] - xs[k]) * (ys[k + 1] - ys[k])


def shape(j):
    """Flexión de cada articulación de los dedos y separación entre ellos (rad)."""
    out = []
    for f in FINGERS:
        pts = [j[0]] + [j[k] for k in f]
        out += [angle(pts[a + 1] - pts[a], pts[a + 2] - pts[a + 1]) for a in range(3)]
    prox = [j[f[1]] - j[f[0]] for f in FINGERS]
    out += [angle(prox[a], prox[a + 1]) for a in range(1, 4)]
    out.append(angle(j[4] - j[2], j[6] - j[5]))
    return np.array(out)


def orient(j, side):
    """Normal de la palma (hacia fuera de ella) y dirección muñeca → nudillo del corazón."""
    n = np.cross(j[5] - j[0], j[17] - j[0])
    return unit(-n if side == "L" else n), unit(j[9] - j[0])


def mirrored_hand(w, side):
    """Como mirroredHand de lib/avatar/capture.ts: los dedos doblados hacia el dorso."""
    point = w[9] - w[0]
    across = w[5] - w[17]
    palm = np.cross(across, point) if side == "R" else np.cross(point, across)
    k = unit(across)
    if np.dot(k, np.cross(point, palm)) < 0:
        k = -k
    plane = lambda a: a - k * np.dot(a, k)  # noqa: E731
    total = 0.0
    for ch in CHAINS:
        prev = plane(w[9] - w[0])
        for a in range(1, len(ch) - 1):
            seg = plane(w[ch[a + 1]] - w[ch[a]])
            total += np.arctan2(np.dot(np.cross(prev, seg), k), np.dot(prev, seg))
            prev = seg
    return total < np.radians(-120)


def body_frame(eyes, mouth, sh_l, sh_r):
    o = (sh_l + sh_r) / 2
    return o, np.linalg.norm(sh_l[:2] - sh_r[:2]), o[1] - mouth[1], o[1] - eyes[1]


def body_pos(p, body):
    """De lado en anchos de hombros; de alto, 0 en los hombros, 1 en la boca y de ahí en ojos→boca."""
    o, width, mouth_up, eyes_up = body
    up = o[1] - p[1]
    h = up / mouth_up if up <= mouth_up else 1 + (up - mouth_up) / max(1e-6, eyes_up - mouth_up)
    return np.array([(p[0] - o[0]) / width, h])


def video_face(face):
    """Coordenadas de cara de un punto de la imagen (como flatFaceCoords de capture.ts)."""
    eye_l, eye_r = face[2], face[5]
    mouth = (face[9] + face[10]) / 2
    o = (eye_l + eye_r) / 2
    half = np.linalg.norm(eye_r - eye_l) / 2
    r = (eye_r - eye_l) / (2 * half)
    u = np.array([-r[1], r[0]])
    if np.dot(o - mouth, u) < 0:
        u = -u
    em = np.dot(o - mouth, u)
    return lambda q: np.array([np.dot(q[:2] - o, r) / half, np.dot(q[:2] - o, u) / em])


def avatar_face(eyes, fr, fu, g):
    """Coordenadas de cara de una persona para un punto junto a la cara del modelo (faceToModel al revés)."""
    right, up = unit(fr - eyes), unit(fu - eyes)

    def f(q):
        r, u = np.dot(q - eyes, right), np.dot(q - eyes, up)
        v = piecewise(u, [g["chinU"], -g["eyesToMouth"], g["eye"]["bottom"], g["eye"]["top"], 0.8 * g["topU"]],
                      [HUMAN["chinV"], -1, HUMAN["eyeBottomV"], HUMAN["eyeTopV"], HUMAN["topV"]])
        h = np.sign(r) * piecewise(abs(r), [0, g["eye"]["inR"], g["eye"]["outR"], g["halfWidth"]],
                                   [0, HUMAN["eyeInH"], HUMAN["eyeOutH"], HUMAN["edgeH"]])
        return np.array([h, v])

    return f


def near_face(fc):
    return fc[1] > -3.5 and abs(fc[0]) < 7


def hand_features(img_or_joints, world, side, body, face):
    palm = img_or_joints[[0, 5, 9, 13, 17]].mean(0)
    return {"pos": body_pos(palm, body), "face": [face(palm), face(img_or_joints[8])],
            "shape": shape(world), "orient": orient(world, side)}


def mirrored(f, aspect):
    """El fotograma en espejo: el avatar hace como diestro lo que el signante zurdo."""
    if not f.get("arms") or not f.get("face"):
        return f
    flip = lambda q: [1 - q[0]] + list(q[1:])  # noqa: E731
    return {
        "arms": [flip(f["arms"][i]) for i in ARMS_SWAP],
        "face": [flip(f["face"][i]) for i in FACE_SWAP],
        "hands": [{"image": [flip(q) for q in h["image"]], "world": [[-q[0], q[1], q[2]] for q in h["world"]]}
                  for h in f["hands"]],
    }


def video_frames(sample, mirror):
    a = sample["aspect"]
    out = []
    for f in sample["frames"]:
        if mirror:
            f = mirrored(f, a)
        if not f.get("arms") or not f.get("face"):
            out.append(None)
            continue
        P = lambda q: np.array([q[0] * a, q[1]])  # noqa: E731 (unidades iguales en x e y)
        arms = [P(q) for q in f["arms"]]
        face_pts = [P(q) for q in f["face"]]
        body = body_frame((face_pts[2] + face_pts[5]) / 2, (face_pts[9] + face_pts[10]) / 2, arms[0], arms[1])
        face = video_face(face_pts)
        # Cada mano, a la muñeca de la pose más cercana; las reflejadas no sirven.
        cands = []
        for k, hd in enumerate(f["hands"]):
            img = np.array([P(q) for q in hd["image"]])
            for side, wi in (("L", 4), ("R", 5)):
                cands.append((float(np.linalg.norm(img[0] - arms[wi])), side, k, img))
        hands, used = {}, set()
        for d, side, k, img in sorted(cands, key=lambda c: c[0]):
            if side in hands or k in used or d > 0.6 * body[1]:
                continue
            used.add(k)
            world = np.array(f["hands"][k]["world"])  # x a la derecha, y hacia abajo, z hacia dentro
            if not mirrored_hand(world, side):
                hands[side] = hand_features(img, world, side, body, face)
        vis = {"L": f["arms"][4][3], "R": f["arms"][5][3]}
        out.append({"hands": hands, "wrist": {"L": body_pos(arms[4], body), "R": body_pos(arms[5], body)}, "vis": vis})
    # A 40 ms entre fotogramas, como el avatar.
    step = sample["fps"] * STEP_S
    return [out[min(int(round(i)), len(out) - 1)] for i in np.arange(0, len(out) - 0.5, step)], step


def avatar_frames(sk):
    out = []
    for f in sk["frames"]:
        cam = lambda q: np.array([q[0], -q[1], -q[2]])  # noqa: E731 (mundo → ejes de cámara de MediaPipe)
        arms = [cam(q) for q in f["arms"]]
        eyes = cam(f["eyes"])
        body = body_frame(eyes, cam(f["mouth"]), arms[0], arms[1])
        face = avatar_face(eyes, cam(f["fr"]), cam(f["fu"]), sk["grid"])
        hands = {}
        for side in ("L", "R"):
            j = np.array([cam(q) for q in f[side]])
            hands[side] = hand_features(j, j, side, body, face)
        out.append({"t": f["t"], "hands": hands, "contact": {"R": f["contact"][0], "L": f["contact"][1]}})
    return out


def errors(a, v, side):
    """Lo que se aparta una mano del avatar de la del vídeo en un par de fotogramas."""
    if v is None:
        return None
    ah, vh = a["hands"][side], v["hands"].get(side)
    if vh is None:
        # Sin la mano en el vídeo, al menos la muñeca de la pose, si se ve.
        ok = v["vis"][side] > 0.5
        return {"pos": float(np.linalg.norm(ah["pos"] - v["wrist"][side])) if ok else None, "shape": None, "orient": None}
    pos = float(np.linalg.norm(ah["pos"] - vh["pos"]))
    if near_face(vh["face"][0]) or near_face(vh["face"][1]):
        # Junto a la cara cuenta lo que más se acerca: el centro de la palma o la yema del índice.
        pos = min(float(np.linalg.norm(ah["face"][k] - vh["face"][k])) for k in (0, 1)) * FACE_TO_BODY
    o = (angle(ah["orient"][0], vh["orient"][0]) + angle(ah["orient"][1], vh["orient"][1])) / 2
    return {
        "pos": pos,
        "shape": float(np.mean(np.abs(ah["shape"] - vh["shape"]))),
        "orient": o * (CONTACT_ORIENT if a["contact"][side] else 1),
    }


def cost(e):
    if e is None:
        return 3.0
    vals = [e[k] / s for k, s in SCALE.items() if e[k] is not None]
    return float(np.mean(vals)) if vals else 3.0


def dtw(C):
    """DTW de subsecuencia: el clip entero contra el tramo del vídeo en que mejor encaja."""
    n, m = C.shape
    D = np.full((n + 1, m + 1), np.inf)
    D[0, :] = 0
    step = np.zeros((n + 1, m + 1), dtype=int)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            opts = (D[i - 1, j - 1], D[i - 1, j] + 0.3, D[i, j - 1] + 0.3)
            k = int(np.argmin(opts))
            D[i, j] = C[i - 1, j - 1] + opts[k]
            step[i, j] = k
    i, j = n, int(np.argmin(D[n, 1:])) + 1
    path = []
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        k = step[i, j]
        i, j = (i - 1, j - 1) if k == 0 else (i - 1, j) if k == 1 else (i, j - 1)
    return path[::-1]


def compare(sk, sample, lefty):
    V, _ = video_frames(sample, lefty)
    A = avatar_frames(sk)
    sides = ["R"] + (["L"] if sk["handedness"] == "two" else [])
    E = [[{s: errors(a, v, s) for s in sides} for v in V] for a in A]
    path = dtw(np.array([[np.mean([cost(e[s]) for s in sides]) for e in row] for row in E]))
    out = {}
    for s in sides:
        vals = {k: [] for k in SCALE}
        worst = {k: (0.0, 0) for k in SCALE}
        seen = 0
        for i, j in path:
            e = E[i][j][s]
            if e and e["shape"] is not None:
                seen += 1
            for k in SCALE:
                if e and e[k] is not None:
                    vals[k].append(e[k])
                    if e[k] > worst[k][0]:
                        worst[k] = (e[k], A[i]["t"])
        out[s] = {k: (float(np.mean(v)), worst[k][1]) if v else None for k, v in vals.items()}
        out[s]["seen"] = seen / len(path)
    return out


def rank(results):
    """Cada medida dividida por la que no supera el 75 % de los signos; la puntuación, lo peor."""
    ref = {}
    for side in ("R", "L"):
        for k in SCALE:
            vals = [r[side][k][0] for r in results.values() if side in r and r[side][k]]
            ref[(side, k)] = float(np.percentile(vals, 75))
    scored = []
    for sid, r in results.items():
        checks = []
        for side in ("R", "L"):
            for k in SCALE:
                if side in r and r[side][k]:
                    value, at = r[side][k]
                    checks.append({"aspect": k, "hand": "dom" if side == "R" else "pas",
                                   "ratio": round(value / ref[(side, k)], 2), "at": at})
        checks.sort(key=lambda c: -c["ratio"])
        score = checks[0]["ratio"] + 0.5 * (checks[1]["ratio"] if len(checks) > 1 else 0)
        scored.append((score, sid, checks, r))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return scored, ref


def same_video(ids, folder):
    """Signos cuyo vídeo descargado es el mismo archivo: a veces el DILSE da el mismo signo para
    varias palabras (HIJO e HIJA), y a veces conviene comprobar que es el de esta."""
    by_hash = {}
    for sid in ids:
        f = folder / f"{sid}.mov"
        if f.exists():
            by_hash.setdefault(hashlib.md5(f.read_bytes()).hexdigest(), []).append(sid)
    return {sid: sorted(set(g) - {sid}) for g in by_hash.values() if len(g) > 1 for sid in g}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("skeletons", type=Path, help="esqueletos-avatar.json de /dev/auditar")
    ap.add_argument("--landmarks", type=Path, default=ROOT / "data/dilse/landmarks.json")
    ap.add_argument("--out", type=Path, default=ROOT / "content/signs/audit.json")
    args = ap.parse_args()

    skeletons = json.loads(args.skeletons.read_text())
    videos = json.loads(args.landmarks.read_text())["signs"]
    captured = json.loads((ROOT / "content/signs/captured.json").read_text())["signs"]
    results = {}
    for sid, sk in sorted(skeletons.items()):
        if sid not in videos or not sk.get("frames"):
            continue
        lefty = "zurdo" in captured.get(sid, {}).get("source", "")
        results[sid] = compare(sk, videos[sid][0], lefty)
        print(f"\r{len(results)} signos", end="", flush=True)
    print()

    scored, ref = rank(results)
    same = same_video(list(results), args.landmarks.parent / "videos")
    signs = {}
    for n, (score, sid, checks, r) in enumerate(scored, 1):
        signs[sid] = {"rank": n, "score": round(score, 2), "checks": [c for c in checks if c["ratio"] >= 1.3][:4],
                      "seen": round(min(r[s]["seen"] for s in r), 2)}
        if same.get(sid):
            signs[sid]["sameVideo"] = same[sid]
    head = {"version": 1, "date": date.today().isoformat(), "source": "DILSE · Fundación CNSE",
            "reference": {f"{'dom' if s == 'R' else 'pas'}.{k}": round(v, 3) for (s, k), v in ref.items()}}
    # Un signo por línea, como captured.json: los cambios de uno no mueven los demás.
    body = ",\n".join(f"    {json.dumps(sid)}: {json.dumps(e, ensure_ascii=False)}" for sid, e in signs.items())
    lines = json.dumps(head, ensure_ascii=False, indent=2)[:-2] + ',\n  "signs": {\n' + body + "\n  }\n}\n"
    args.out.write_text(lines)
    print(f"{args.out.relative_to(ROOT)}: {len(signs)} signos; los 10 primeros:",
          ", ".join(sid for _, sid, _, _ in scored[:10]))


if __name__ == "__main__":
    main()
