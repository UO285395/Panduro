#!/usr/bin/env python3
"""Convierte vídeos de signos en animaciones del avatar (vía /dev/grabar).

Sirve para cualquier colección de vídeos de signos aislados: los del Diccionario de la
LSE de la Fundación CNSE (DILSE, CC BY-NC-SA), los del corpus de la UPM para generación
de movimiento, Sign4all, grabaciones propias… Por cada vídeo extrae con MediaPipe la
pose y las dos manos fotograma a fotograma y escribe un JSON con el mismo formato que
scripts/swl_lse_export.py. En /dev/grabar → «Importar landmarks» se convierte cada
muestra en un clip del avatar, se revisa y se descarga; luego
`node scripts/add-captured.mjs archivo.json` lo añade al curso.

Qué signo es cada vídeo:
- por el nombre del archivo o de su carpeta («hola.mp4», «HOLA/1.mp4», «Buenos días.webm»),
  comparado con los ids del currículo igual que el importador de SWL-LSE, o
- con --map, un CSV «archivo,signo» (p. ej. «dilse_01234.mp4,HOLA»).

    python -m venv .venv && .venv/bin/pip install mediapipe==1.0.1 opencv-python-headless
    .venv/bin/python scripts/videos_to_signs.py --videos RUTA --out signos.json \\
        --source "DILSE · Fundación CNSE" --license "CC BY-NC-SA 3.0" --url https://fundacioncnse-dilse.org

Los modelos de MediaPipe se descargan la primera vez (los mismos que usa la app).
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from swl_lse_export import POSE_POINTS, WRISTS, curriculum_ids, gloss_key  # noqa: E402

VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}
MODELS = {
    "pose": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
    "hand": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
}


def model_path(kind: str, cache: Path) -> str:
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / Path(MODELS[kind]).name
    if not target.exists():
        print(f"Descargando {target.name}…")
        urllib.request.urlretrieve(MODELS[kind], target)
    return str(target)


def point(p, visibility: bool = False) -> list[float]:
    out = [round(float(p.x), 4), round(float(p.y), 4), round(float(p.z), 4)]
    if visibility:
        out.append(round(float(getattr(p, "visibility", 1.0) or 0.0), 3))
    return out


def extract(video: Path, pose_model: str, hand_model: str) -> tuple[list[dict], float]:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python import vision

    mode = vision.RunningMode.VIDEO
    pose = vision.PoseLandmarker.create_from_options(
        vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=pose_model), running_mode=mode)
    )
    hands = vision.HandLandmarker.create_from_options(
        vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=hand_model), running_mode=mode, num_hands=2)
    )
    capture = cv2.VideoCapture(str(video))
    fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
    if not 5 <= fps <= 120:
        fps = 25.0
    frames: list[dict] = []
    index = 0
    try:
        while True:
            ok, bgr = capture.read()
            if not ok:
                break
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            timestamp = int(index * 1000 / fps)
            index += 1
            p = pose.detect_for_video(image, timestamp)
            h = hands.detect_for_video(image, timestamp)
            entry: dict = {"poseWorld": None, "wrists": None, "hands": []}
            if p.pose_world_landmarks and p.pose_landmarks:
                entry["poseWorld"] = [point(q, visibility=True) for q in p.pose_world_landmarks[0][:POSE_POINTS]]
                entry["wrists"] = [point(p.pose_landmarks[0][i]) for i in WRISTS]
            for img, wld in zip(h.hand_landmarks or [], h.hand_world_landmarks or []):
                if len(img) == 21 and len(wld) == 21:
                    entry["hands"].append({"image": [point(q) for q in img], "world": [point(q) for q in wld]})
            frames.append(entry)
    finally:
        capture.release()
        pose.close()
        hands.close()
    return frames, fps


def sign_for(video: Path, root: Path, mapping: dict[str, str], wanted: set[str]) -> str | None:
    rel = video.relative_to(root).as_posix()
    if rel in mapping or video.name in mapping:
        return mapping.get(rel) or mapping[video.name]
    for name in (video.stem, video.parent.name):
        key = gloss_key(name)
        if key in wanted:
            return key
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--videos", required=True, type=Path, help="carpeta con los vídeos (se recorre entera)")
    parser.add_argument("--out", default=Path("signos-video.json"), type=Path)
    parser.add_argument("--map", type=Path, help="CSV archivo,signo para nombres que no son la glosa")
    parser.add_argument("--source", default="Vídeos propios")
    parser.add_argument("--license", default="propia")
    parser.add_argument("--url", default="", help="de dónde salen los vídeos (se guarda en la atribución)")
    parser.add_argument("--all", action="store_true", help="incluir también vídeos que no son del currículo")
    parser.add_argument("--models", type=Path, default=ROOT / ".cache" / "mediapipe")
    args = parser.parse_args()

    mapping: dict[str, str] = {}
    if args.map:
        with open(args.map, encoding="utf-8") as handle:
            for row in csv.reader(handle):
                if len(row) >= 2 and row[0].strip():
                    mapping[row[0].strip()] = row[1].strip()

    wanted = curriculum_ids()
    videos = sorted(p for p in args.videos.rglob("*") if p.suffix.lower() in VIDEO_EXTENSIONS)
    if not videos:
        sys.exit(f"No hay vídeos en {args.videos}")
    pose_model = model_path("pose", args.models)
    hand_model = model_path("hand", args.models)

    out: dict = {"source": args.source, "license": args.license, "doi": args.url, "fps": 25.0, "signs": {}}
    skipped = []
    for video in videos:
        sign = sign_for(video, args.videos, mapping, wanted)
        if sign is None and args.all:
            sign = gloss_key(video.stem)
        if sign is None:
            skipped.append(video.name)
            continue
        frames, fps = extract(video, pose_model, hand_model)
        with_hands = sum(1 for f in frames if f["hands"])
        out["signs"].setdefault(sign, []).append(
            {"sample": video.relative_to(args.videos).as_posix(), "label": video.stem, "fps": fps, "frames": frames}
        )
        print(f"{sign:20} {video.name}: {len(frames)} fotogramas a {fps:.0f} fps, manos en {with_hands}")

    args.out.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"\n{sum(len(v) for v in out['signs'].values())} vídeos de {len(out['signs'])} signos → {args.out}")
    if skipped:
        print(f"Sin signo del currículo ({len(skipped)}): {', '.join(skipped[:15])}{'…' if len(skipped) > 15 else ''}")
        print("Usa --map archivo,signo o renómbralos con la glosa (o --all para exportarlos igualmente).")


if __name__ == "__main__":
    main()
