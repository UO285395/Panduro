#!/usr/bin/env python3
"""Convierte vídeos de signos en animaciones del avatar (vía /dev/grabar).

Sirve para cualquier colección de vídeos de signos aislados: los del Diccionario de la
LSE de la Fundación CNSE (DILSE, CC BY-NC-SA), los del corpus de la UPM para generación
de movimiento, Sign4all, grabaciones propias… Por cada vídeo extrae con MediaPipe la
pose, las dos manos y la cara (giro de la cabeza y gestos) fotograma a fotograma y escribe
un JSON con el mismo formato que scripts/swl_lse_export.py. En /dev/grabar → «Importar
landmarks» se convierte cada muestra en un clip del avatar, se revisa y se descarga; luego
`node scripts/add-captured.mjs archivo.json` lo añade al curso.

Qué signo es cada vídeo:
- por el nombre del archivo o de su carpeta («hola.mp4», «HOLA/1.mp4», «Buenos días.webm»),
  comparado con los ids del currículo igual que el importador de SWL-LSE, o
- con --map, un CSV «archivo,signo» (p. ej. «dilse_01234.mp4,HOLA»).

    python -m venv .venv && .venv/bin/pip install mediapipe==1.0.1 opencv-python-headless
    .venv/bin/python scripts/videos_to_signs.py --videos RUTA --out signos.json \\
        --source "DILSE · Fundación CNSE" --license "CC BY-NC-SA 3.0" --url https://fundacioncnse-dilse.org

Los modelos de MediaPipe se descargan la primera vez (los mismos que usa la app). Con
--jobs se procesan varios vídeos a la vez, y si --out ya existe solo se procesan los
vídeos que faltan (se puede cortar y seguir, o repetir mientras se descargan más).
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from multiprocessing import Pool
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from swl_lse_export import ARMS, POSE_POINTS, WRISTS, curriculum_ids, gloss_key  # noqa: E402

FACE_POINTS = 11  # pose 0-10: nariz, ojos (interior, centro, exterior), orejas, comisuras
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}
MODELS = {
    "pose": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
    "hand": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
    "face": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
}
# Gestos de la cara que se guardan (blendshapes de FaceLandmarker, en este orden): cejas,
# ojos, boca. En LSE son parte del signo (preguntas, negación, intensidad, labialización).
BLENDSHAPES = (
    "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft", "eyeWideRight", "jawOpen", "mouthClose",
    "mouthFunnel", "mouthPucker", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft",
    "mouthStretchRight", "mouthFrownLeft", "mouthFrownRight", "cheekPuff",
)
FORMAT = 4  # 3: con la cara (blendshapes y giro de la cabeza); 4: con los brazos en la imagen


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


def extract(video: Path, pose_model: str, hand_model: str, face_model: str) -> tuple[list[dict], float, float]:
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
    faces = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=face_model), running_mode=mode, num_faces=1,
            output_face_blendshapes=True, output_facial_transformation_matrixes=True,
        )
    )
    capture = cv2.VideoCapture(str(video))
    fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
    width = capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 1.0
    height = capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1.0
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
                # Cara en la imagen (nariz, ojos, orejas, boca): dónde toca la mano, sin la
                # profundidad, que con el brazo levantado es poco fiable.
                entry["face"] = [point(p.pose_landmarks[0][i]) for i in range(FACE_POINTS)]
                # Hombros, codos y muñecas en la imagen: la profundidad del brazo en 3D no es
                # fiable (un antebrazo vertical sale hacia delante) y se rehace con ellos.
                entry["arms"] = [point(p.pose_landmarks[0][i], visibility=True) for i in ARMS]
            for img, wld in zip(h.hand_landmarks or [], h.hand_world_landmarks or []):
                if len(img) == 21 and len(wld) == 21:
                    entry["hands"].append({"image": [point(q) for q in img], "world": [point(q) for q in wld]})
            fc = faces.detect_for_video(image, timestamp)
            if fc.face_blendshapes and fc.facial_transformation_matrixes:
                scores = {c.category_name: c.score for c in fc.face_blendshapes[0]}
                entry["faceBs"] = [round(float(scores.get(n, 0.0)), 3) for n in BLENDSHAPES]
                # Giro de la cabeza respecto a la cámara (matriz 3×3 por filas).
                entry["headR"] = [round(float(x), 4) for x in fc.facial_transformation_matrixes[0][:3, :3].flatten()]
            frames.append(entry)
    finally:
        capture.release()
        pose.close()
        hands.close()
        faces.close()
    return frames, fps, round(width / height, 4)


def extract_task(task: tuple[Path, Path, str, str, str, str]) -> tuple[str, dict]:
    video, root, sign, pose_model, hand_model, face_model = task
    frames, fps, aspect = extract(video, pose_model, hand_model, face_model)
    # aspect (ancho/alto): las coordenadas de imagen van de 0 a 1 en los dos ejes.
    return sign, {"sample": video.relative_to(root).as_posix(), "label": video.stem, "fps": fps,
                  "aspect": aspect, "bytes": video.stat().st_size, "format": FORMAT, "frames": frames}


def sign_for(video: Path, root: Path, mapping: dict[str, str], wanted: set[str]) -> str | None:
    rel = video.relative_to(root).as_posix()
    if rel in mapping or video.name in mapping:
        return mapping.get(rel) or mapping[video.name]
    for name in (video.stem, video.parent.name):
        if name in wanted:  # ya es el id («NUM_1.mov», como los deja dilse_download.py)
            return name
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
    parser.add_argument("--jobs", type=int, default=1, help="vídeos en paralelo")
    parser.add_argument("--manifest", type=Path,
                        help="manifest.csv de dilse_download.py (por defecto, el de la carpeta de encima de --videos)")
    args = parser.parse_args()

    mapping: dict[str, str] = {}
    if args.map:
        with open(args.map, encoding="utf-8") as handle:
            for row in csv.reader(handle):
                if len(row) >= 2 and row[0].strip():
                    mapping[row[0].strip()] = row[1].strip()

    # Página de cada signo en su diccionario, para citarla junto a la animación.
    pages: dict[str, str] = {}
    manifest = args.manifest or args.videos.parent / "manifest.csv"
    if manifest.exists():
        with open(manifest, encoding="utf-8") as handle:
            pages = {r["signId"]: r["page_url"] for r in csv.DictReader(handle) if r.get("page_url")}

    wanted = curriculum_ids()
    videos = sorted(p for p in args.videos.rglob("*") if p.suffix.lower() in VIDEO_EXTENSIONS)
    if not videos:
        sys.exit(f"No hay vídeos en {args.videos}")
    pose_model = model_path("pose", args.models)
    hand_model = model_path("hand", args.models)
    face_model = model_path("face", args.models)

    out: dict = {"source": args.source, "license": args.license, "doi": args.url, "fps": 25.0, "signs": {}}
    if args.out.exists():
        out["signs"] = json.loads(args.out.read_text(encoding="utf-8")).get("signs", {})
    # Fuera las muestras cuyo vídeo ya no está (p. ej. un signo que se descartó).
    out["signs"] = {sign: kept for sign, samples in out["signs"].items()
                    if (kept := [x for x in samples if (args.videos / x["sample"]).exists()])}
    for sign, samples in out["signs"].items():
        for sample in samples:
            if sign in pages:
                sample["url"] = pages[sign]
    # Ya hechos, salvo que el vídeo haya cambiado (p. ej. otra acepción con el mismo nombre).
    done = {sample["sample"]: sample.get("bytes") for samples in out["signs"].values() for sample in samples
            if sample.get("format") == FORMAT}  # las de un formato anterior se rehacen
    skipped = []
    tasks = []
    for video in videos:
        sign = sign_for(video, args.videos, mapping, wanted)
        if sign is None and args.all:
            sign = gloss_key(video.stem)
        if sign is None:
            skipped.append(video.name)
            continue
        rel = video.relative_to(args.videos).as_posix()
        if rel not in done or done[rel] not in (None, video.stat().st_size):
            tasks.append((video, args.videos, sign, pose_model, hand_model, face_model))
    if len(tasks) < len(videos) - len(skipped):
        print(f"Ya en {args.out}: {len(videos) - len(skipped) - len(tasks)} vídeos; faltan {len(tasks)}.")

    def save() -> None:
        args.out.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")

    with Pool(max(1, args.jobs)) as pool:
        for i, (sign, sample) in enumerate(pool.imap_unordered(extract_task, tasks), 1):
            if sign in pages:
                sample["url"] = pages[sign]
            samples = out["signs"].setdefault(sign, [])
            samples[:] = [s for s in samples if s["sample"] != sample["sample"]] + [sample]
            frames = sample["frames"]
            with_hands = sum(1 for f in frames if f["hands"])
            print(f"[{i}/{len(tasks)}] {sign:20} {Path(sample['sample']).name}: {len(frames)} fotogramas a "
                  f"{sample['fps']:.0f} fps, manos en {with_hands}", flush=True)
            if i % 10 == 0:
                save()

    save()
    print(f"\n{sum(len(v) for v in out['signs'].values())} vídeos de {len(out['signs'])} signos → {args.out}")
    if skipped:
        print(f"Sin signo del currículo ({len(skipped)}): {', '.join(skipped[:15])}{'…' if len(skipped) > 15 else ''}")
        print("Usa --map archivo,signo o renómbralos con la glosa (o --all para exportarlos igualmente).")


if __name__ == "__main__":
    main()
