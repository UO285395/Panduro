# Datos de LSE para Panduro

Qué conjuntos de datos de lengua de signos española existen, para qué sirven aquí y cómo
meterlos en la app. Las animaciones del avatar mejoran de verdad cuando salen de personas
signando; el reconocimiento, cuando el modelo ha visto los signos que se quieren leer.

| Conjunto | Qué tiene | Licencia | Para qué | Cómo |
| --- | --- | --- | --- | --- |
| [DILSE, Fundación CNSE](https://fundacioncnse-dilse.org/) | Diccionario normativo: vídeo de cada signo, vocabulario general (miles de entradas) | CC BY-NC-SA 3.0 | **Animaciones de casi todo el curso** | Descargar los vídeos de los signos del curso → `scripts/videos_to_signs.py` → `/dev/grabar` |
| [Sign Language Dataset for Automatic Motion Generation (UPM)](https://doi.org/10.3390/jimaging9120262) | 754 signos frecuentes (alfabeto, números, meses, días…), 3 signantes, 6.786 vídeos, HamNoSys y landmarks de MediaPipe | Se pide por correo a los autores | Animaciones y descripciones fonológicas (HamNoSys) | Con los vídeos: `scripts/videos_to_signs.py` |
| [SWL-LSE](https://zenodo.org/records/13691887) | 300 signos sanitarios, 8.000 muestras, solo landmarks de MediaPipe | CC BY 4.0 | Animaciones de los ~25 signos que coinciden con el curso; es con lo que se entrenó el traductor | `scripts/swl_lse_export.py` → `/dev/grabar` |
| [LSE-Health-UVigo](https://zenodo.org/records/10234465) | 10,8 h de discurso continuo anotado | CC BY-NC 4.0 | Medir y mejorar el reconocimiento continuo | Pendiente (necesita el acceso a Zenodo) |
| [LSE-FS-UVigo](https://zenodo.org/records/15797079) | Deletreo continuo | CC BY 4.0 | Ya usado por el modelo de alfabeto | — |
| [Spanish Sign Language (LSE) Fingerspelling Dataset](https://zenodo.org/records/21351703) | 160.000 imágenes del alfabeto | CC BY 4.0 | Mejorar las letras estáticas | Pendiente |
| [Sign4all](https://www.scidb.cn/en/detail?dataSetId=12775cc0026841979bdaba60484ad067) | 24 signos de hostelería, 7.756 vídeos y keypoints | Ver repositorio | Pocos signos del curso | `scripts/videos_to_signs.py` con los vídeos |
| [LSE-Sign (BCBL)](https://www.bcbl.eu/bcbl-corporativa/wp-content/uploads/2015/02/Gutierrez15-LSE-Sign.pdf) | 2.400 signos con configuración, lugar y movimiento codificados | Consulta web gratuita | Corregir descripciones y formas de mano | Consulta manual |
| [Signario de LSE (UCM)](https://github.com/griffos-ucm/signario) | Diccionario paramétrico; en GitHub solo el código y las glosas | OSL 3.0 (código) | Glosas; los vídeos no son públicos en el repositorio | — |

Desde el entorno de desarrollo en la nube solo se llega a GitHub, npm y PyPI: Zenodo, los
diccionarios y los repositorios científicos están bloqueados por la política de red. Los
datos se descargan en local, o se añaden sus dominios a la red permitida del entorno.

## DILSE de principio a fin

```bash
python3 scripts/dilse_download.py                       # data/dilse/videos/<ID>.mov + manifest.csv
.venv/bin/python scripts/videos_to_signs.py --videos data/dilse/videos --out data/dilse/landmarks.json --jobs 3 \
    --source "DILSE · Fundación CNSE" --license "CC BY-NC-SA 3.0" --url https://fundacioncnse-dilse.org
pnpm tsx scripts/landmarks-to-captured.ts data/dilse/landmarks.json --merge
```

- `dilse_download.py` busca cada signo del currículo en el diccionario (también femeninos,
  plurales y expresiones que son sublemas de otra entrada, como «buenos días» en «día») y
  anota en `manifest.csv` la entrada, la acepción elegida y si había varias (`ambiguo`). La
  acepción se elige por el nombre del vídeo (`rosa-color`, `metro-tren`) y la definición frente a
  las etiquetas y la descripción del signo; las que no quedan claras se fijan a mano en `CHOSEN`
  (también `None` si ninguna es la del curso) y se rehacen con `--only ID…`. Lo que no encuentra
  no lo adivina: esos signos siguen con su animación generada.
- Va a una petición por segundo como mucho. Si se corta, se vuelve a lanzar y sigue.
- `videos_to_signs.py` también sigue donde lo dejó si `--out` ya existe (vuelve a procesar un
  vídeo si ha cambiado y quita los que ya no están), y guarda en cada muestra el enlace a su
  entrada del diccionario (lo lee de `manifest.csv`), que la app muestra junto a la animación.
- `data/` no se sube al repositorio: solo las animaciones resultantes.

## De vídeos a animaciones

```bash
python -m venv .venv
.venv/bin/pip install mediapipe==1.0.1 opencv-python-headless   # en Windows: .venv\Scripts\pip
.venv/bin/python scripts/videos_to_signs.py --videos RUTA/A/LOS/VIDEOS --out dilse.json \
    --source "DILSE · Fundación CNSE" --license "CC BY-NC-SA 3.0" --url https://fundacioncnse-dilse.org
```

- Cada vídeo se asigna a un signo del curso por su nombre o el de su carpeta
  (`hola.mp4`, `HOLA/1.mp4`, `Buenos días.mp4`), o con `--map archivo,signo` en un CSV.
- Para muchos signos de golpe: `pnpm tsx scripts/landmarks-to-captured.ts dilse.json --merge`
  convierte cada signo con la mejor de sus muestras (descarta las que apenas detectan la mano)
  y lo añade a `content/signs/captured.json`. Sin `--merge` escribe un archivo para revisarlo.
- Para revisar uno a uno: `/dev/grabar` → «Importar landmarks», elige la mejor muestra mirando
  el avatar, descarga y `node scripts/add-captured.mjs archivo-descargado.json`.
- En los dos casos se detectan los contactos (yemas en la barbilla, índice en la sien, mano
  sobre la palma de la otra…) y el avatar los reproduce sobre su propia cara y manos. En la
  cara se guarda el punto exacto (`face`: dónde queda la parte que toca respecto a ojos y
  boca en la imagen, que se sigue si la mano se desliza) y el avatar lo busca en su propia
  cabeza, así que toca la mejilla contraria o el lado de la frente aunque su cara sea otra.
- Cada dedo se guarda como `[azimut, elevación, flexión]`: nudillo y falanges por separado
  (B doblada frente a garra), separación de los dedos y posición del pulgar. MediaPipe dobla
  de más los dedos estirados; la calibración sale de los propios vídeos del DILSE.
- Las trayectorias se suavizan más con la mano casi quieta (donde se nota el temblor) que en
  los movimientos rápidos (para no perder un saludo o un golpe doble), y se quitan los
  keyframes que se pueden sacar interpolando.
- La fuente y la licencia quedan en cada signo; añádelas a `CREDITS.md`.

Con licencias NC (DILSE, LSE-Health) Panduro puede usarlos porque no es comercial; con SA
(DILSE) las animaciones derivadas se comparten con la misma licencia.
