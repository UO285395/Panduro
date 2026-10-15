#!/usr/bin/env python3
"""Descarga del DILSE el vídeo de cada letra del alfabeto dactilológico, para medir con
scripts/measure-camera.ts el ejercicio «Signa la letra» con personas que no son las del
entrenamiento del modelo.

El DILSE tiene las letras como entradas con su nombre («be», «jota», «eñe»): se toma la
acepción de esa palabra que habla de la letra. La W no tiene entrada.

    python3 scripts/dilse_letters.py --out data/dilse-letras        # videos/<LETRA>.mov
    python3 scripts/videos_to_signs.py --videos data/dilse-letras/videos --out data/dilse-letras/landmarks.json --all
    pnpm tsx scripts/measure-camera.ts letters data/dilse-letras/landmarks.json
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import dilse_download as dilse

NAMES = {
    "A": "a", "B": "be", "C": "ce", "D": "de", "E": "e", "F": "efe", "G": "ge", "H": "hache",
    "I": "i", "J": "jota", "K": "ka", "L": "ele", "M": "eme", "N": "ene", "Ñ": "eñe", "O": "o",
    "P": "pe", "Q": "cu", "R": "erre", "S": "ese", "T": "te", "U": "u", "V": "uve", "X": "equis",
    "Y": "ye", "Z": "zeta",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=dilse.ROOT / "data" / "dilse-letras")
    args = parser.parse_args()
    videos = args.out / "videos"
    videos.mkdir(parents=True, exist_ok=True)
    for letter, name in NAMES.items():
        senses = [s for s in dilse.senses(f"?buscar={name}") if re.search(r"\bletra\b", s["definition"], re.I)]
        # La página de «eñe» trae también la «ene»: vale la acepción de la propia palabra.
        sense = next((s for s in senses if s["word"] == name), next(iter(senses), None))
        if not sense:
            print(f"{letter}: sin entrada")
            continue
        (videos / f"{letter}{Path(sense['video']).suffix.lower()}").write_bytes(dilse.get(sense["video"]))
        print(f"{letter}: {sense['word']} → {sense['video']}")


if __name__ == "__main__":
    main()
