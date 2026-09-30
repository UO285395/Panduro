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
  Entre las dos manos también se guarda el punto exacto (`hand`): la articulación de la otra
  mano junto a la que toca (numeración de MediaPipe, 21 el centro de la palma) y hacia dónde
  queda, en el marco de esa mano (hacia los dedos, hacia el índice, hacia la palma). El
  avatar pone la parte que toca sobre la superficie de su propia mano en ese punto: las
  yemas de CASA juntas en el vértice, el puño de ESPERAR sobre el otro, los dedos de MÉDICO
  en el dorso de la muñeca. Si la mano pasa sin soltarse de la cara a la otra mano (o al
  revés), el contacto dura solo lo que toca lo que se queda: en BUENAS NOCHES y CENA las
  puntas rozan la cara antes de juntarse, y el avatar juntaba las manos delante de ella
  antes de tiempo.
- Las manos no se atraviesan: el avatar mira su propia mano como cápsulas (palma y falanges,
  con el grosor medido en su malla) y, si en un instante del signo una se mete en la otra
  (la profundidad de la cámara no es fiable: en los números cruzados en X o con un puño
  sobre los dedos de la otra salían metidas), las aparta lo justo. La dirección se elige a lo
  largo de todo el signo para no cambiar de lado de golpe y el resultado se suaviza. Lo que
  siga metido se corrige en unas pasadas más, mirando también los instantes que no se metían
  pero se han movido al apartar los de al lado y sin invertir el sentido de una muestra a la
  siguiente: cuando una mano atravesaba la otra de atrás adelante, salir por detrás en un
  instante y por delante en el siguiente se anulaba al suavizar; ahora la rodea.
- Con los dedos de las dos manos cruzados vistos de frente (una X, los números del 16 al 19,
  BUENAS NOCHES, PROGRAMA), una mano va entera por delante de la otra en todos los cruces y
  se apartan solo hacia el que mira, así que la figura de frente no cambia. Entre las dos
  queda además el grosor del contorno: pegadas, el de la mano de atrás asomaba por los dedos
  de la de delante y se veían los dedos de las dos mezclados. Entre las dos manos la
  profundidad de la grabación no es fiable (en PROGRAMA ponía la derecha 0,3 brazos por detrás
  de la izquierda, y en el vídeo pasa por delante), así que en un cruce que dura la dominante
  va delante, que es lo habitual (la pasiva hace de base y la otra actúa sobre ella), salvo
  que se estén tocando. Ese apartar hacia el que mira se reparte en el tiempo: empieza antes
  del cruce y acaba después, sin adelantar y atrasar las manos de golpe. En los 160 signos a
  dos manos, los que dejaban dedos entrelazados pasan de 17 a ninguno y los que tenían las
  manos metidas más de 0,02 brazos, de 15 a 2.
- Cada grabación guarda la media distancia entre los hombros del signante (`shoulderX`, en
  brazos). La posición de cada mano se mide desde su hombro, y el avatar tiene los hombros
  más separados que una persona (0,42 brazos frente a 0,35): dos manos que se juntaban o se
  cruzaban delante del pecho le quedaban a casi una palma. Ahora, junto al centro del cuerpo
  se conserva lo que distaba de él, y a la altura del hombro y más afuera, del hombro.
- La mano dominante se toma de la derecha salvo que la izquierda signe mucho más (2,5 veces
  el tiempo levantada). En los signos a dos manos la pasiva suele estar levantada más rato
  que la que se mueve, y con poco margen 20 signos del DILSE (PROGRAMA, NOMBRE, SÍMBOLO,
  LIBRO…) salían en espejo, con la mano pasiva haciendo de dominante. Basta además con que la
  dominante se vea en la mitad de los fotogramas: se pierde cuando tapa a la otra y esos
  huecos se rellenan interpolando.
- Tampoco se meten en la cabeza, que en un modelo anime es casi el doble de grande que la de
  una persona en proporción al brazo: con los nudillos en la mejilla o el pulgar en la
  frente, el resto de la mano quedaba dentro. La mano gira sobre el punto de contacto hasta
  quedar fuera (el contacto se mantiene) y, si no basta, se aparta de la cabeza lo justo;
  también de camino entre keyframes. La cabeza se mide en la malla del modelo, triángulo a
  triángulo (con solo los vértices, en las mejillas quedaban huecos y un contacto acababa
  dentro), sin contar los mechones sueltos. Lo que se mete una mano es lo mínimo para salir
  (por delante, de lado o por arriba o abajo), y se aparta contando con lo que llega el
  brazo. Tanto aquí como entre las manos, tras suavizar se vuelve a mirar cada instante y
  lo que siga metido se saca.
- Cada dedo se guarda como `[azimut, elevación, flexión]`: nudillo y falanges por separado
  (B doblada frente a garra), separación de los dedos y posición del pulgar. MediaPipe dobla
  de más los dedos estirados; la calibración sale de los propios vídeos del DILSE. Con la
  palma de frente (o de espaldas) a la cámara, la separación de los dedos se mide en la
  imagen: en 3D la profundidad juntaba los dedos de la mano derecha y abría los de la
  izquierda, y en los números a dos manos (18, 19) la derecha salía plana. El avatar los
  separa del corazón un 30 % más que el signante: sus dedos son más gruesos y cortos, y con
  la misma separación no quedaba hueco entre ellos.
- Las pinzas (la O, la F, el «pico», el pulgar sobre una yema) se guardan como cuánto toca
  el pulgar cada yema, y el avatar junta las puntas en su propia mano aunque sus dedos
  tengan otras proporciones: el pulgar va hacia las yemas y los dedos se doblan hacia él.
- El pulgar guarda además dónde tiene la yema (`thumbTip`: respecto a su base, en el marco
  de la mano y en largos de pulgar). Su flexión se mide hacia la palma y no veía un pulgar
  doblado sobre ella (el 4, el 9, el 1 con los dedos recogidos): quedaba estirado hacia
  fuera. El avatar dobla su pulgar lo mismo y lo apunta igual, aunque sea más largo y salga
  más de fuera que el de una persona. Medido contra los vídeos, el error de dirección del
  pulgar baja de 19° a 0° (mediana) y de 38° a 14° (percentil 90); y quitar el giro fijo de
  8° que se daba a todos los dedos baja 2-3° el del resto.
- La mano del modelo es más gruesa que la de una persona (media palma de 0,28 palmas frente a
  unas 0,17): el pulgar puesto donde lo tenía el signante, pegado a la palma o cruzado sobre
  los dedos, quedaba dentro. Tras colocarlo, el avatar lo gira desde su base lo justo para
  sacarlo de la palma y de los dedos que no pinza. En las 1709 poses de mano de los vídeos,
  las que lo tenían metido más de un 20 % de la palma bajan de 103 a 22 (más de un 10 %, de
  383 a 148), a cambio de unos 3° más de error medio en su dirección.
- En la cara, el punto de contacto se lleva a la cabeza del modelo anclado en lo que tienen
  las dos caras (el contorno del ojo, medido en las mallas de ojos del modelo, el borde de
  la cara, la boca y la barbilla): lo que en la persona queda junto al ojo cae junto al ojo
  del modelo aunque este sea enorme, como en los modelos anime.
- La oreja queda fuera del contorno de la cara (y más con la cabeza algo girada), así que
  también cuenta cuánto queda de ella en la imagen la parte de la mano. Encima de la oreja,
  como dentro de la cara, pesa poco la profundidad: con el brazo levantado MediaPipe pone la
  mano unos 30 cm por delante aunque la toque. Así se detectan el índice de OREJA, el pulgar
  de ESCUCHAR y el de MÓVIL, que antes no tocaban nada.
- Sin contacto, junto a la cara se guarda a qué lado de ella queda el centro de la palma
  (`faceH`, en coordenadas de cara) y el avatar la pone igual respecto a la suya: medida en
  brazos, una mano junto a la oreja (ESCUCHAR, PENSAR) le quedaba delante del ojo, porque su
  cara es tres veces más ancha que la de una persona en proporción al brazo. Más allá del
  borde de la cara, lo que sobra se cuenta en brazos (tamaño de mano, no de cara); y al lado
  de la cabeza no se adelanta la mano para que no se meta en ella.
- De la cara se sacan el giro de la cabeza y sus gestos (MediaPipe FaceLandmarker): cabeceo,
  giro e inclinación respecto a como el signante la tiene en reposo, y boca (la palabra que
  vocaliza), sonrisa, ceño y cejas levantadas respecto a su cara neutra, sin el temblor de la
  detección. El avatar gira el cuello y la cabeza y pone esas expresiones con las de su modelo
  (las cejas, con los morphs de cejas si los tiene). Los contactos con la cara siguen a la
  cabeza cuando esta se mueve.
- El codo se guarda como la dirección en la que sale de la línea hombro→muñeca y el avatar lo
  usa para doblar el brazo como en el vídeo.
- Si el vídeo ya se había procesado con una versión anterior del script, se vuelve a procesar
  (cada muestra guarda su `format`).
- La profundidad del brazo se rehace con la imagen: la pose en 3D de MediaPipe falla sobre
  todo en ella (un antebrazo vertical delante del pecho, como en FRÍO, le sale casi
  horizontal hacia la cámara y con la muñeca más baja). Con hombros, codos y muñecas en la
  imagen (`arms`, desde el formato 4 de `videos_to_signs.py`) y el largo de brazo y
  antebrazo, lo que no se ve de cada segmento en la imagen es lo que va hacia la cámara.
  Solo con la mano por debajo de la barbilla: a la altura de la cara la altura ya sale de la
  imagen, y la cabeza del avatar, más grande, apartaba las manos. Los contactos se siguen
  detectando con la pose tal cual.
- Un contacto parcial con la otra mano (las manos casi se tocan) deja entre ellas lo que
  dejaban en la grabación y no una fracción del camino desde donde estaría la mano sin
  contacto: como la profundidad de cada brazo se rehace por separado, ese camino podía ser
  de medio brazo, y en POESÍA, EUFEMISMO o PARA las manos quedaban a un palmo.
- Las trayectorias se suavizan más con la mano casi quieta (donde se nota el temblor) que en
  los movimientos rápidos (para no perder un saludo o un golpe doble), y se quitan los
  keyframes que se pueden sacar interpolando. La posición, la orientación de la mano y los
  dedos se suavizan cada uno según su propia velocidad: un golpe de dedos o un aleteo con
  la muñeca quieta se conserva.
- En el reproductor, las manos del modelo se ven un 15 % más grandes (en un modelo anime son
  pequeñas para el cuerpo y, del tamaño del reproductor, no se distinguía la forma de la
  mano). Se agrandan antes de medir el modelo, así que contactos y colisiones cuentan ya con
  las manos grandes. La cámara encuadra cada signo lo más cerca que deja lo que ocupan la
  cabeza, los hombros y las manos durante él (medido en el propio avatar, sin la subida
  desde el reposo ni la vuelta), sin alejarse más que antes, y pasa de un encuadre a otro
  con suavidad.
- Donde una mano pasa deprisa junto a la otra o junto a la cabeza (VIDEOLLAMADA, GRACIAS,
  SORPRENDIDO), el avatar mira más a menudo que cada 1/60 s si se meten una en otra: si no,
  entre dos muestras una mano atravesaba la otra sin que se viera al comprobarlo. El
  suavizado y la elección del lado cuentan cada muestra por lo que dura, así que esas
  muestras de más no cambian los contactos. Al repetir el signo, la vuelta al inicio también
  se resuelve (en VIDEOLLAMADA y METRO las manos se fundían al volver). Medido cada 4 ms en
  todos los signos: solapes entre manos de más de 0,02 brazos en 3 signos (antes 12) y con
  la cabeza en 20 (antes 37); lo que queda dura uno o dos fotogramas.
- La fuente y la licencia quedan en cada signo; añádelas a `CREDITS.md`.

Con licencias NC (DILSE, LSE-Health) Panduro puede usarlos porque no es comercial; con SA
(DILSE) las animaciones derivadas se comparten con la misma licencia.
