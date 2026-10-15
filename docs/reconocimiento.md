# Reconocimiento por cámara: cuánto acierta

Los ejercicios de cámara de las lecciones son dos:

- **«Signa la letra»** (`sign_this`, unidad 2 de A1): el modelo de deletreo de Esku (GRU con
  CTC, entrenado con LSE-FS-UVigo) lee la mano fotograma a fotograma. Vale en cuanto la letra
  pedida sale la primera con un 50 % (en las letras débiles de Esku, entre las tres primeras
  con un 25 %).
- **«Signa la palabra»** (`sign_word`, interrogativos de A2): si el signo está entre los 287
  del modelo de vocabulario (SWL-LSE y LSE-Health, sobre todo vocabulario médico), se reconoce
  el signo completo y vale si sale entre sus tres respuestas. Si no está, solo se comprueba la
  forma de la mano contra las plantillas del DILSE.

Las reglas de los dos están en `lib/recognition/exercises.ts`, que usan a la vez los
componentes y la medición.

## Cómo se mide

`scripts/measure-camera.ts` pasa vídeos de personas que no son las del entrenamiento por los
mismos modelos y reglas que la app, como si cada vídeo fuera un intento:

```bash
python3 scripts/dilse_letters.py --out data/dilse-letras
python3 scripts/videos_to_signs.py --videos data/dilse-letras/videos --out data/dilse-letras/landmarks.json --all
pnpm tsx scripts/measure-camera.ts letters data/dilse-letras/landmarks.json
pnpm tsx scripts/measure-camera.ts words palabras.json        # vídeos COMO.mp4, QUE.mp4…
pnpm tsx scripts/measure-camera.ts words data/dilse/landmarks.json --vocabulary
```

Las coordenadas se pasan a la proporción de la cámara de la app (16:9): la misma mano tiene otra
forma, en coordenadas de imagen, en un vídeo 1280×1080 que en uno 1280×720. Para las palabras
no sirven los vídeos del DILSE de los propios signos, porque de ellos salen las plantillas.

Se ha medido con dos fuentes:
- **DILSE**: vídeos de las letras, varias personas. No tiene la W.
- **Spread the Sign**: el alfabeto dactilológico de España y los interrogativos, otra persona,
  vídeo 4:3. Sus vídeos se usan solo para medir y no se guardan.

## Letras (octubre de 2026)

| | Se reconoce con las dos fuentes | Depende de quién | No se reconoce con ninguna |
|---|---|---|---|
| Letras | C D E G I K L M N P R | A B F H J O S T U V X (W solo en Spread the Sign: sí) | **Ñ Q Y Z** |

- En total, 17 de 26 letras del DILSE y 17 de 27 de Spread the Sign (un 64 %) a la primera.
- **Ñ, Q, Y y Z** no pasan del 10 % en ningún fotograma: la Ñ la ve como N (no distingue el
  movimiento), la Y y la Z como I, y la Q no la ve.
- Falsos aciertos (el ejercicio daría por buena otra letra): 3 con el DILSE y 22 con Spread the
  Sign. Casi todos son una **A** al bajar la mano cerrada al acabar, o la letra de paso al subirla.
- Exigir que la letra salga en dos fotogramas quita casi todos los falsos aciertos, pero también
  un tercio de los buenos: el modelo marca cada letra en uno o dos fotogramas. Se ha dejado como
  estaba.
- Unas plantillas de forma de mano hechas con las letras del DILSE no mejoran al modelo con otra
  persona (14 de 27 y 12 falsos aciertos).

## Palabras

| Signo | Cómo se comprueba | Con Spread the Sign |
|---|---|---|
| DÓNDE | modelo de vocabulario | sí |
| CÓMO | forma de la mano | sí |
| QUÉ | forma de la mano | sí |
| QUIÉN | forma de la mano | no: se confunde con QUÉ, y QUIÉN se daría por bueno como QUÉ |
| CUÁNDO | forma de la mano | no: Spread the Sign signa otra variante (los dedos en la barbilla) |

- Con la forma de la mano contra **todo** el curso no se reconocía ninguno: el voto se reparte
  entre las plantillas de más de 300 signos, y una forma compartida la gana casi siempre otro
  (CÓMO perdía con ESTRATEGIA y QUÉ con ESTUDIAR).
- El modelo de vocabulario reconoce, con los vídeos del DILSE, 13 de los 26 signos del curso
  que conoce. Sí: ANALIZAR, BIEN, CANSADO, DESCUBRIR, DESPUÉS, DÓNDE, ENFERMO, FRÍO, GORDO,
  HOSPITAL, MAYOR, NERVIOSO, PIE. No: AYUDAR, DOLOR, ESCUCHAR, ESPALDA, FARMACIA, FIEBRE,
  IMPORTANTE, IR, MES, NO, NOMBRE, PODER, RESULTADO. Es una cota baja: los vídeos no traen los
  puntos de la cara que usa el modelo.

## Qué se ha cambiado

- **Ñ, Q, Y y Z** (`UNRECOGNIZED_LETTERS`): si se acaba el tiempo sin que la cámara las vea,
  el ejercicio no las da por falladas. Quien aprende compara su mano con la descripción y dice
  si le ha salido.
- **Descripciones de las letras**: describían en parte el alfabeto americano (la B con la
  palma hacia delante, la M y la N con los dedos sobre el pulgar, la S en puño, la E con las
  yemas sobre el pulgar). Se han reescrito todas mirando los vídeos del DILSE y de Spread the
  Sign, que ahora son la referencia para corregirse.
- **«Signa la palabra» por forma de mano**: se compara solo con los signos de la lección, y una
  mano más lejos que `HANDSHAPE_MAX_DISTANCE` (2,5) de toda plantilla no vota. Ese umbral sale de
  las letras entre dos personas: por debajo queda el 83 % de las veces la misma forma y el 11 %
  una forma distinta. Con los dos cambios se reconocen 3 de los 6 vídeos de Spread the Sign en
  lugar de 1. Solo con la lección eran 4, pero con 4 falsos aciertos; con el umbral queda 1.
- El ejercicio de **QUIÉN** de «Pronombres interrogativos I» pasa a ser de **DÓNDE**, que el
  modelo de vocabulario reconoce con las dos fuentes. QUIÉN se sigue practicando en los
  ejercicios sin cámara de la lección.

## Lo que falta

- Cada fuente es una sola persona por letra: un resultado por letra es poco y hay que leerlo
  junto con el de la otra fuente.
- Medir con más personas (grabaciones propias, con permiso) y con cámaras de móvil en vertical.
  Con el móvil en vertical la imagen es 9:16 y las manos llegan al modelo con otra forma.
- CUÁNDO, CUÁNTO, PORQUE y PARA no tienen otro vídeo con la misma variante que el DILSE.
