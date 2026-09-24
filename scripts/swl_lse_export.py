#!/usr/bin/env python3
"""Exporta de SWL-LSE los signos que también están en el currículo de Panduro.

SWL-LSE (Docío-Fernández et al., 2024; CC BY 4.0, doi:10.5281/zenodo.13691887) publica,
por cada vídeo, un .pkl con los resultados de MediaPipe Tasks fotograma a fotograma. Este
script los lee y escribe un JSON que /dev/grabar sabe importar: allí se convierte cada
muestra en un clip del avatar con el mismo código que usa la grabación por cámara, se
revisa y se añade con scripts/add-captured.mjs.

Descarga de Zenodo MEDIAPIPE.zip (3,5 GB), ANNOTATIONS.zip y videos_ref_annotations.csv
en una carpeta, y ejecuta desde la raíz del repo:

    pip install mediapipe==1.0.1
    python scripts/swl_lse_export.py --data RUTA/A/LA/CARPETA --out swl-lse.json

Los .pkl se escribieron con un MediaPipe antiguo; el módulo que ya no existe se sustituye
por un marcador, como hace tools/train/extract.py de Esku (MIT).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import pickle
import re
import sys
import types
import unicodedata
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSE_POINTS = 17  # nariz … muñecas: lo que usa lib/avatar/capture.ts
WRISTS = (15, 16)


def install_protobuf_stub() -> None:
    module = types.ModuleType("mediapipe.framework.formats.landmark_pb2")

    class _Placeholder:
        def __init__(self, *args, **kwargs):
            pass

        def __setstate__(self, state):
            self.__dict__.update(state if isinstance(state, dict) else {"raw": state})

    module.LandmarkList = type("LandmarkList", (_Placeholder,), {})
    module.NormalizedLandmarkList = type("NormalizedLandmarkList", (_Placeholder,), {})
    for name in ("mediapipe.framework", "mediapipe.framework.formats"):
        sys.modules.setdefault(name, types.ModuleType(name))
    sys.modules["mediapipe.framework.formats.landmark_pb2"] = module


def concept_id(label: str) -> str:
    """AZUCAR(M-ES)(2M), AZUCAR2 → AZUCAR (igual que conceptIdOf en Esku)."""
    return re.sub(r"\d+$", "", re.sub(r"\([^)]*\)", "", label)).strip()


def gloss_key(label: str) -> str:
    """Igual que glossKey en lib/recognition/vocabularyMap.ts."""
    text = re.sub(r"\([^)]*\)", "", label)
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[-.\s]+", "_", text.upper().strip())
    return re.sub(r"\d+$", "", text)


def curriculum_ids() -> set[str]:
    ids: set[str] = set()

    def walk(node):
        if isinstance(node, dict):
            if "id" in node and "gloss" in node:
                ids.add(node["id"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    for path in sorted((ROOT / "content" / "curriculum").glob("*.json")):
        walk(json.loads(path.read_text(encoding="utf-8")))
    return ids


def read_labels(data: Path) -> tuple[dict[int, str], dict[int, list[str]]]:
    """CLASS_ID → glosa, y los ids de muestra que el CSV asocie a cada clase (vídeo de referencia)."""
    labels: dict[int, str] = {}
    references: dict[int, list[str]] = {}
    with open(data / "videos_ref_annotations.csv", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            class_id = int(row["CLASS_ID"])
            labels[class_id] = row["LABEL"]
            refs = [v.strip() for k, v in row.items() if k not in ("CLASS_ID", "LABEL") and v]
            references.setdefault(class_id, []).extend(refs)
    return labels, references


def read_samples(data: Path) -> dict[int, list[str]]:
    """Muestras por clase, de las particiones oficiales (`sample_id,class_id` sin cabecera)."""
    samples: dict[int, list[str]] = {}
    with zipfile.ZipFile(data / "ANNOTATIONS.zip") as archive:
        for split in ("test", "val", "train"):
            raw = archive.read(f"ANNOTATIONS/{split}_labels.csv").decode("utf-8", "replace")
            for line in raw.strip().splitlines():
                sample, _, klass = line.partition(",")
                if klass.strip().isdigit():
                    samples.setdefault(int(klass), []).append(sample.strip())
    return samples


def point(p, visibility: bool = False) -> list[float]:
    out = [round(float(p.x), 4), round(float(p.y), 4), round(float(p.z), 4)]
    if visibility:
        out.append(round(float(getattr(p, "visibility", 1.0) or 0.0), 3))
    return out


def export_frames(pickled: list) -> list[dict]:
    """Por fotograma: pose en metros, muñecas de la pose en imagen y cada mano (imagen + metros)."""
    frames = []
    for frame in pickled:
        pose = frame.get("pose") if isinstance(frame, dict) else None
        hands = frame.get("hands") if isinstance(frame, dict) else None
        world = getattr(pose, "pose_world_landmarks", None) or []
        image = getattr(pose, "pose_landmarks", None) or []
        entry: dict = {"poseWorld": None, "wrists": None, "hands": []}
        if world and image:
            entry["poseWorld"] = [point(p, visibility=True) for p in world[0][:POSE_POINTS]]
            entry["wrists"] = [point(image[0][i]) for i in WRISTS]
        hand_image = getattr(hands, "hand_landmarks", None) or []
        hand_world = getattr(hands, "hand_world_landmarks", None) or []
        for img, wld in zip(hand_image, hand_world):
            if len(img) == 21 and len(wld) == 21:
                entry["hands"].append({"image": [point(p) for p in img], "world": [point(p) for p in wld]})
        frames.append(entry)
    return frames


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", required=True, type=Path, help="carpeta con MEDIAPIPE.zip, ANNOTATIONS.zip y videos_ref_annotations.csv")
    parser.add_argument("--out", default=Path("swl-lse.json"), type=Path)
    parser.add_argument("--per-sign", default=3, type=int, help="muestras por signo (para elegir la mejor en /dev/grabar)")
    parser.add_argument("--fps", default=30.0, type=float, help="fotogramas por segundo de los vídeos originales")
    args = parser.parse_args()

    install_protobuf_stub()
    wanted = curriculum_ids()
    labels, references = read_labels(args.data)
    samples = read_samples(args.data)

    matches: dict[str, list[tuple[int, str]]] = {}
    for class_id, label in labels.items():
        if not label or label == "#N/A":
            continue
        key = gloss_key(concept_id(label))
        if key in wanted:
            matches.setdefault(key, []).append((class_id, label))

    out: dict = {
        "source": "SWL-LSE",
        "license": "CC BY 4.0",
        "doi": "10.5281/zenodo.13691887",
        "fps": args.fps,
        "signs": {},
    }
    with zipfile.ZipFile(args.data / "MEDIAPIPE.zip") as archive:
        pickles = {Path(n).stem: n for n in archive.namelist() if n.endswith(".pkl")}
        for sign_id, classes in sorted(matches.items()):
            exported = []
            for class_id, label in classes:
                candidates = [s for s in references.get(class_id, []) if s in pickles]
                candidates += [s for s in samples.get(class_id, []) if s in pickles and s not in candidates]
                for sample in candidates[: args.per_sign - len(exported)]:
                    frames = export_frames(pickle.load(io.BytesIO(archive.read(pickles[sample]))))
                    exported.append({"sample": sample, "label": label, "frames": frames})
                if len(exported) >= args.per_sign:
                    break
            if exported:
                out["signs"][sign_id] = exported
                print(f"{sign_id:20} {len(exported)} muestra(s) · {', '.join(sorted({e['label'] for e in exported}))}")

    args.out.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"\n{len(out['signs'])} signos del currículo exportados a {args.out}")


if __name__ == "__main__":
    main()
