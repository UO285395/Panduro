#!/usr/bin/env python3
"""Descarga del DILSE (Fundación CNSE) el vídeo de cada signo del currículo.

Diccionario de la Lengua de Signos Española, Fundación CNSE, CC BY-NC-SA 3.0
(https://fundacioncnse-dilse.org). La web permite descargar las fotos y los vídeos.

Cómo funciona la web (septiembre de 2026):
- `php/buscador-autocompletar_nuevo.php?buscar=PREFIJO` devuelve las entradas que empiezan
  así, en forma de diccionario («bueno, na», «gracia»), con el parámetro de su página.
- `?buscar=ENTRADA` es la página de la entrada: un <article class="content__item"> por
  acepción, con la palabra, la definición y el vídeo (<source src=".../stories/xxx.mov">).

Para cada signo se prueba la traducción y variantes (cada alternativa de «a / b», sin
signos de puntuación ni paréntesis, sin tildes, en singular, cifras en letra, verbos sin
«-se», participios como su verbo), se toma la entrada del autocompletado que coincide
exactamente (también en femenino: «hermano, na» vale para «hermana») y, si tiene varias
acepciones, la que mejor encaja con el nombre del vídeo y con las etiquetas y la
descripción del signo (y CHOSEN, las revisadas a mano). Las expresiones («buenos días»,
«por favor») no son entradas propias sino sublemas de otra («día», «favor»): se buscan
dentro de la entrada de cada palabra. Lo que no coincide se marca como no encontrado: no
se adivina.

    python3 scripts/dilse_download.py --out data/dilse          # vídeos + manifest.csv
    python3 scripts/videos_to_signs.py --videos data/dilse/videos --out dilse.json \\
        --source "DILSE · Fundación CNSE" --license "CC BY-NC-SA 3.0" --url https://fundacioncnse-dilse.org

Una petición cada segundo como mucho (varias en vuelo, porque la web tarda en responder).
Se puede cortar y volver a lanzar: sigue con los signos que faltan en el manifest. Con
--only se rehacen unos signos concretos y con --refresh todos.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIELDS = ["signId", "translation", "dilse_word", "page_url", "video_url", "status", "notes"]
BASE = "https://fundacioncnse-dilse.org/"
USER_AGENT = "Panduro (proyecto educativo sin ánimo de lucro)"
DELAY = 1.0  # entre el inicio de dos peticiones, sumando todos los hilos
WORKERS = 5  # la web tarda 2-4 s en responder: así sale ~1 petición por segundo
_last = 0.0
_lock = threading.Lock()


def get(url: str) -> bytes:
    global _last
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(3):
        with _lock:
            wait = DELAY - (time.monotonic() - _last)
            if wait > 0:
                time.sleep(wait)
            _last = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))
    return b""


def decode(raw: bytes) -> str:
    """UTF-8, salvo algún byte suelto en latin-1 que tienen ciertas definiciones."""
    out, i = [], 0
    while i < len(raw):
        try:
            out.append(raw[i:].decode("utf-8"))
            break
        except UnicodeDecodeError as e:
            out.append(raw[i:i + e.start].decode("utf-8") + raw[i + e.start:i + e.end].decode("latin-1"))
            i += e.end
    return "".join(out)


def norm(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", text).strip()


def squash(text: str) -> str:
    return norm(text).replace(" ", "")


def forms(label: str) -> set[str]:
    """«hermano, na» → {hermano, hermana}; «tío, a» → {tio, tia}."""
    head, _, suffix = label.partition(",")
    base, suffix = norm(head), norm(suffix)
    out = {base}
    if suffix and " " not in suffix:
        if len(suffix) == 1:
            out.add(base[:-1] + suffix)
        elif (i := base.rfind(suffix[0])) > 0:
            out.add(base[:i] + suffix)
    return out


NUMBERS = {"11": "once", "12": "doce", "13": "trece", "14": "catorce", "15": "quince", "16": "dieciséis",
           "17": "diecisiete", "18": "dieciocho", "19": "diecinueve", "20": "veinte", "30": "treinta",
           "40": "cuarenta", "50": "cincuenta", "100": "cien"}


def singular(word: str) -> list[str]:
    out = []
    if word.endswith("ces") and len(word) > 4:
        out.append(word[:-3] + "z")
    if word.endswith("es") and len(word) > 4:
        out.append(word[:-2])
    if word.endswith("s") and len(word) > 3:
        out.append(word[:-1])
    return out


def variants(translation: str) -> list[str]:
    out: list[str] = []
    for alt in translation.split("/"):
        base = re.sub(r"\([^)]*\)", " ", alt)
        base = re.sub(r"[¿?¡!.,;:\"«»]", " ", base).strip().lower()
        base = re.sub(r"\s+", " ", base)
        base = NUMBERS.get(base, base)
        plain = "".join(c for c in unicodedata.normalize("NFD", base) if unicodedata.category(c) != "Mn")
        out += [base, plain]
        for word in (base, plain):
            if " " in word:
                out.append(word.replace(" ", ""))  # «medio ambiente» → «medioambiente»
            else:
                out += singular(word)
                if word.endswith("rse"):
                    out.append(word[:-2])  # «levantarse» → «levantar»
                # Participio → verbo, que en LSE suele ser el mismo signo: «prohibido» → «prohibir».
                if re.search(r"[ai]d[oa]$", word) and len(word) > 5:
                    stem = word[:-3]
                    out += [stem + "ar"] if word[-3] == "a" else [stem + "er", stem + "ir"]
    seen: list[str] = []
    for v in out:
        if v and v not in seen:
            seen.append(v)
    return seen


# La web a veces contesta vacío a una búsqueda que sí tiene resultados: se repite antes de
# darla por no encontrada.
EMPTY_RETRIES = 3


def autocomplete(prefix: str) -> list[dict]:
    for attempt in range(EMPTY_RETRIES):
        raw = get(f"{BASE}php/buscador-autocompletar_nuevo.php?buscar={urllib.parse.quote(prefix)}")
        try:
            found = json.loads(decode(raw))
        except json.JSONDecodeError:
            found = []
        if found:
            return found
        time.sleep(2 * (attempt + 1))
    return []


_pages: dict[str, list[dict]] = {}


def senses(parametros: str) -> list[dict]:
    """Acepciones (palabra, definición, vídeo) de la página de una entrada."""
    query = parametros.split("buscar=", 1)[-1]
    if query in _pages:
        return _pages[query]
    for attempt in range(EMPTY_RETRIES):
        page = decode(get(f"{BASE}?buscar={urllib.parse.quote(query)}"))
        if '<article class="content__item">' in page:
            break
        time.sleep(2 * (attempt + 1))
    out = []
    clean = lambda s: html.unescape(re.sub(r"<[^>]+>|\s+", " ", s)).replace("\ufffd", " ").strip()
    for article in re.findall(r'<article class="content__item">(.*?)</article>', page, flags=re.S):
        video = re.search(r'<source src="([^"]+\.(?:mov|mp4|webm|m4v))"', article, flags=re.I)
        if not video:
            continue
        head = re.search(r'<h2 class="title title--full">(.*?)</h2>', article, flags=re.S)
        desc = re.search(r'<p class="parrafo_descripcion">(.*?)</p>', article, flags=re.S)
        word = clean(head.group(1)) if head else ""
        sub = re.search(r"\((.*)\)", word)
        out.append({
            "word": word,
            # «día ( buenos días)» → [«buenosdias»]: la expresión (o expresiones) de la que es sublema
            "sublemma": [squash(re.sub(r"^\s*o\s+", "", alt)) for alt in sub.group(1).split(",")] if sub else [],
            "definition": clean(desc.group(1)) if desc else "",
            "video": video.group(1),
        })
    _pages[query] = out
    return out


STOPWORDS = set("para como pero sobre desde hasta entre donde cuando mano manos dedo dedos palma "
                "hacia delante arriba abajo movimiento signo otra otro misma mismo".split())


def stems(text: str) -> set[str]:
    """Raíces de 5 letras: «colores» y «color», «transporte» y «transportes» coinciden."""
    return {w[:5] for w in norm(text).split() if len(w) >= 4 and w not in STOPWORDS}


# Acepciones revisadas a mano cuando ni el nombre del vídeo ni la definición lo dejan claro
# (signo del curso → nombre del vídeo del DILSE; None: ninguna acepción es la del curso).
CHOSEN: dict[str, str | None] = {
    "ACENTO": "acento-entonacion-signado",  # el acento al signar, no la tilde
    "ACUERDO_C1": "acuerdo",  # llegar a un acuerdo, no «de acuerdo»
    "ALTO": "alto-estatura",  # descripción física, no «¡alto!»
    "BIEN": "bien_c",  # «¿cómo estás? — bien»: con buena salud, no «el bien»
    "INTERPRETAR": None,  # interpretar resultados: el DILSE solo tiene «actuar» y «traducir»
    "LISTO": "listo_a",  # inteligente, no preparado
    "MAYOR": "mayor-adulto",  # anciano
    "MEJOR": "mejor-salud",  # unidad de salud: recobrar la salud
    "MEJOR_B1": "mejor-que",  # comparativo
    "METRO": "metro-tren",  # medio de transporte, no la unidad de longitud
    "MIGRACION": "migracion-persona",  # de personas, no de animales ni de datos
    "PAN": "pan",  # el alimento, no «pan comido»
    "PARQUE": "parque",  # el de la ciudad (unidad de lugares)
    "PODER": "poder-capacidad",  # ser capaz (en «¿puede repetir?»), no «el poder»
    "TELEVISION": "television",
    "VER": "ver_aa",  # percibir con los ojos (en «ver la televisión»)
    "VOLVER": "volver_B",  # regresar, no «traducir» ni «vomitar»
}


# Signos del curso cuya traducción no es la entrada del DILSE: la expresión o palabra que
# sí lo es («No entiendo» es el sublema «no entender» de ENTENDER; «Más despacio» se signa
# DESPACIO).
QUERIES: dict[str, str] = {
    "NO_ENTIENDO": "no entender",
    "MAS_DESPACIO": "despacio",
    "EN_DESACUERDO": "desacuerdo",
    "ACUERDO_C1": "acuerdo",
}


def choose(options: list[dict], sign: dict, query: str) -> tuple[dict, str]:
    """La acepción que mejor encaja con el signo del curso.

    El nombre del vídeo suele llevar la acepción («rosa-color», «metro-transporte»): cuenta
    mucho si coincide con las etiquetas o la descripción del signo. Después, las palabras de
    la definición.
    """
    context = stems(f"{sign.get('description', '')} {' '.join(sign.get('tags', []))}")
    wanted = squash(query)
    full = squash(sign["translation"])

    def score(o: dict) -> tuple[float, int]:
        stem = Path(o["video"]).stem
        name = squash(stem)
        s = 4.0 if name in (wanted, full) else 3.0 if name.startswith(wanted) or name.startswith(full) else 0.0
        extra = stems(stem.replace("_", " ").replace("-", " ")) - stems(query)
        s += 2.5 * len(extra & context)
        s += 0.5 * len(context & stems(o["definition"]))
        return (s, -options.index(o))

    forced = [o for o in options if Path(o["video"]).stem == CHOSEN.get(sign["id"])]
    best = forced[0] if forced else max(options, key=score)
    note = "" if len({o["video"] for o in options}) == 1 else f"{len(options)} acepciones"
    return best, (note + (" (revisada)" if forced else "")).strip()


def entry(query: str) -> dict | None:
    """Entrada del autocompletado cuyo lema (o su femenino) es exactamente `query`."""
    return next((e for e in autocomplete(query) if norm(query) in forms(e["label"])), None)


def lookup(sign: dict) -> tuple[dict, dict, str] | None:
    """(entrada, acepción, nota) del signo, o None."""
    if sign["id"] in CHOSEN and CHOSEN[sign["id"]] is None:
        return None
    queries = variants(sign["translation"])
    if sign["id"] in QUERIES:
        queries = [QUERIES[sign["id"]], *queries]
    for query in queries:
        match = entry(query)
        if not match:
            continue
        options = [o for o in senses(match["parametros"]) if not o["sublemma"]] or senses(match["parametros"])
        if options:
            best, note = choose(options, sign, query)
            return match, best, note
    # Expresiones: sublema dentro de la entrada de una de sus palabras.
    phrases = {squash(q) for q in queries if " " in q}

    def expresses(o: dict, q: str) -> bool:
        stem = set(norm(Path(o["video"]).stem.replace("_", " ").replace("-", " ")).split())
        # «a veces» es «a la de veces, o a las de veces…» pero su vídeo se llama veces_a.mov
        return any(alt in phrases for alt in o["sublemma"]) or (bool(o["sublemma"]) and set(norm(q).split()) <= stem)

    for q in [q for q in queries if " " in q]:
        words = sorted({w for w in q.split() if len(w) >= 3}, key=len, reverse=True)
        for word in words:
            for form in [word, *singular(word)]:
                match = entry(form)
                if not match:
                    continue
                options = [o for o in senses(match["parametros"]) if expresses(o, q)]
                if options:
                    best, note = choose(options, sign, q)
                    return match, best, ("sublema; " + note).strip("; ")
                break
    return None


def whole(video: bytes) -> bool:
    """Si el vídeo (QuickTime/MP4) está entero: la web a veces corta la descarga y sin el índice
    (el átomo «moov») no se puede abrir."""
    return b"moov" in video


# Signos que no son del curso pero forman parte de sus frases (lib/avatar/compose.ts: «¿Puede
# repetir?» es PODER + REPETIR): se descargan igual, con la acepción fijada en CHOSEN.
PARTS: dict[str, str] = {"PODER": "poder", "VER": "ver", "TELEVISION": "televisión"}


def curriculum_signs() -> list[dict]:
    seen: dict[str, dict] = {}
    for path in sorted((ROOT / "content" / "curriculum").glob("*.json")):
        for sign in json.loads(path.read_text(encoding="utf-8")).get("signs", []):
            seen.setdefault(sign["id"], sign)
    for part, word in PARTS.items():
        seen.setdefault(part, {"id": part, "translation": word, "tags": []})
    return list(seen.values())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=ROOT / "data" / "dilse")
    parser.add_argument("--only", nargs="*", help="ids concretos (por defecto, todo el currículo)")
    parser.add_argument("--refresh", action="store_true", help="volver a buscar también los que ya están en el manifest")
    args = parser.parse_args()

    videos = args.out / "videos"
    videos.mkdir(parents=True, exist_ok=True)
    manifest = args.out / "manifest.csv"
    previous: dict[str, dict] = {}
    if manifest.exists():
        with open(manifest, newline="", encoding="utf-8") as handle:
            previous = {r["signId"]: r for r in csv.DictReader(handle)}

    order = [s["id"] for s in curriculum_signs()]
    signs = [s for s in curriculum_signs() if not args.only or s["id"] in args.only]
    if not args.only and not args.refresh:  # continuar donde se quedó
        signs = [s for s in signs if previous.get(s["id"], {}).get("status") not in ("ok", "ambiguo", "no_encontrado")]
    rows: dict[str, dict] = {}
    done = 0
    write_lock = threading.Lock()

    def save() -> list[dict]:
        merged = {**previous, **rows}
        out = sorted(merged.values(), key=lambda r: order.index(r["signId"]) if r["signId"] in order else len(order))
        with open(manifest, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(out)
        return out

    def process(sign: dict) -> None:
        nonlocal done
        row = {"signId": sign["id"], "translation": sign["translation"], "dilse_word": "", "page_url": "",
               "video_url": "", "status": "no_encontrado", "notes": ""}
        try:
            found = lookup(sign)
            if found:
                match, best, note = found
                target = videos / f"{sign['id']}{Path(best['video']).suffix.lower()}"
                before = previous.get(sign["id"])
                if not target.exists() or not before or before["video_url"] != best["video"] or not whole(target.read_bytes()):
                    data = get(best["video"])
                    for attempt in range(EMPTY_RETRIES):
                        if whole(data):
                            break
                        time.sleep(5 * (attempt + 1))
                        data = get(best["video"])
                    if not whole(data):
                        raise ValueError(f"vídeo incompleto ({len(data)} bytes)")
                    partial = target.with_suffix(".part")
                    partial.write_bytes(data)
                    partial.replace(target)  # nunca queda un vídeo a medias con el nombre bueno
                row.update(dilse_word=best["word"] or match["label"], page_url=f"{BASE}{match['parametros']}",
                           video_url=best["video"], status="ambiguo" if "acepciones" in note and "revisada" not in note else "ok",
                           notes=f"{note}; {best['definition'][:120]}".strip("; "))
            else:
                for stale in videos.glob(f"{sign['id']}.*"):
                    stale.unlink()
        except Exception as error:  # red, página rara…
            row.update(status="error", notes=str(error)[:200])
        with write_lock:
            rows[sign["id"]] = row
            done += 1
            save()  # se puede cortar y seguir: lo ya descargado no se repite
            print(f"[{done}/{len(signs)}] {sign['id']:18} {row['status']:13} {row['dilse_word'][:40]} "
                  f"{Path(row['video_url']).name}", flush=True)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(process, signs))

    rows_out = save()
    found = sum(r["status"] in ("ok", "ambiguo") for r in rows_out)
    print(f"\n{found} de {len(rows_out)} signos con vídeo → {videos}")
    print(f"Manifest: {manifest}")
    missing = [r["signId"] for r in rows_out if r["status"] not in ("ok", "ambiguo")]
    if missing:
        print("No encontrados:", ", ".join(missing))


if __name__ == "__main__":
    sys.exit(main())
