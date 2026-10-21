# Avatar 3D

El reproductor carga, por orden:

1. `public/avatars/panduro.vrm`: el modelo de Panduro, versionado en el repositorio (CC0). Se
   puede sustituir por otro VRM con el mismo nombre (ver «Qué tiene que tener el modelo»).
2. Si no existe, Seed-san (VRM Consortium, CC BY) desde la CDN.
3. Si no carga ningún VRM, el rig procedimental de Three.js; sin WebGL, el SVG animado.

El mapper (`lib/avatar/vrmMapper.ts`) mide el modelo al cargarlo: largo de los brazos, cara y
pecho en la malla, grosor de los dedos y hacia dónde mira (VRM0 o VRM1). Las animaciones
(`content/signs/captured.json`) no dependen del modelo: cambiarlo no obliga a volver a capturar.

## El modelo de Panduro

**HairSample_Male**, del **VRoid Project**: un chico de estilo anime, con el pelo negro y
despeinado y una sudadera blanca. Es una de las muestras de las versiones alfa de VRoid Studio
que el VRoid Project publicó con licencia **CC0** (las recoge OpenGameArt,
<https://opengameart.org/content/vroid-studio-cc0-models>; los datos del VRM lo dicen así:
cualquiera puede usarlo, modificarlo y redistribuirlo, también con fines comerciales, sin
citar). El modelo de MakeHuman que lo precedía, aun con estilo de dibujo, seguía pareciendo
barato: una cara realista con sombreado de dibujo encima.

- VRM 0.x, 54 huesos humanoides, con los tres del pulgar y los ojos, y el pelo con física
  (spring bones).
- Expresiones de VRoid: vocales (A, I, U, E, O), parpadeo, Joy, Angry, Sorrow, Fun y
  Surprised, y las formas sueltas de cejas, ojos y boca (`Fcl_BRW_*`, `Fcl_EYE_*`,
  `Fcl_MTH_*`), que el mapper usa por su nombre: el ceño con los ojos de enfado y las cejas
  arriba con los ojos muy abiertos (el flequillo le tapa las cejas), y la sonrisa con los ojos
  abiertos («Joy» los cierra del todo).
- Unos 3 MB (de 19): `scripts/avatar/build_vroid.sh` lo descarga, comprueba el archivo y lo
  aligera con `pack_vrm.py --vroid`: texturas a 1024 (las de normales a 512) y en JPEG las que
  no usan el alfa, las formas de la cara como accesores dispersos y sus nombres en la malla, donde
  los lee three.js (VRoid los deja en cada primitiva y, sin ellos, el mapper no encontraba las
  cejas ni la boca por su nombre), y el contorno a 2 mm (el de VRoid, 0,75 mm, se veía a puntos).

```bash
bash scripts/avatar/build_vroid.sh   # escribe public/avatars/panduro.vrm
```

## El modelo de MakeHuman (el anterior)

Un hombre joven con estilo de dibujo, con camisa azul petróleo, vaqueros oscuros y el pelo
corto y pegado a la cabeza, con las orejas a la vista. Está hecho con **MakeHuman** (complemento
MPFB para Blender) y solo con recursos **CC0** de la comunidad MakeHuman, y se exporta a
**VRM 1.0** con el complemento VRM. El modelo también es **CC0**. Se sigue pudiendo rehacer con
`scripts/avatar/build.sh`, que **sustituye** `public/avatars/panduro.vrm`.

El estilo de dibujo (más amable que uno realista) sale de `panduro.json`:

- **Proporciones** (`cartoon` y `targets`): la cabeza un 25 % mayor y los ojos un 45 %, cabeza
  redonda, mejillas llenas, barbilla pequeña y nariz pequeña.
- **Sombreado toon** (`toon`, MToon de VRM): sombra de dos tonos y un contorno fino por malla,
  salvo alrededor de los ojos (`outline_eyes`: una máscara del ancho del contorno): el pliegue
  que dejan los ojos agrandados salía dibujado como unas gafas.
- **Texturas de dibujo**: piel lisa y sin sombras pintadas, colorete en las mejillas, iris más
  grandes, sin las fibras de la foto, con un aro más oscuro y un brillo (`iris_flat`,
  `iris_ring`), solo las pestañas de arriba, juntas en un trazo con algunas puntas
  (`lash_close`; separadas parecían púas), y cejas, pelo y ropa de color plano (`flatten`), el pelo sin huecos
  entre mechones (`hair_close`), que dejaban el borde deshilachado, ni pelos sueltos en el borde
  (`hair_open`).

- 54 huesos humanoides, con los tres del pulgar y los ojos.
- Expresiones VRM: vocales (aa, ih, ou, ee, oh), parpadeo (los dos ojos y cada uno), happy,
  relaxed, sad, angry y surprised; las cejas por separado (`EyebrowsUp`, `EyebrowsDown`) y las
  mejillas hinchadas (`CheekPuff`).
  Salen de las formas ARKit (`faceunits01`) y los visemas (`visemes02`) de MakeHuman, también en
  las cejas, las pestañas, los dientes y la lengua. Como en un dibujo, más marcadas que las de
  serie (`expressions` en `panduro.json`: la boca abierta, en «u», la sonrisa, la pena, el ceño y
  la sorpresa), y la boca por dentro oscura (la lengua): a la distancia a la que se ve el avatar
  entero, con las de serie los gestos de la cara apenas se notaban. La cara neutra no cambia.
- Unos 6 MB: texturas opacas en JPEG y las formas de la cara como accesores dispersos.

### Rehacerlo

```bash
bash scripts/avatar/build.sh            # descarga lo que falte en .avatar-build/ y escribe el .vrm
PREVIEW=1 bash scripts/avatar/build.sh  # además, renders de prueba en .avatar-build/out/
```

Descarga Blender 4.2 LTS, MPFB 2.0.18, el complemento VRM 4.10.2 y los paquetes CC0 de MakeHuman
que usa (sistema, `hair01`, `skins02`, `system_clothes_materials01`, `faceunits01`,
`visemes02`), y no toca la configuración de Blender del usuario. Los pasos:

| Script | Qué hace |
|---|---|
| `build_avatar.py` | El personaje de MakeHuman según `panduro.json`: fenotipo, ojos, cejas, pelo, piel, ropa y el esqueleto «mixamo». |
| `finish_avatar.py` | Expresiones en el cuerpo y en las piezas de la cara; la forma del cuerpo horneada y sin la piel que tapa la ropa; proporciones de dibujo (cabeza y ojos); texturas de dibujo (piel, colorete, iris, pestañas, cejas y pelo) y transparencias; pose en T con las palmas hacia abajo. |
| `export_vrm.py` | La pose en T como reposo, huesos de los ojos (el esqueleto de MakeHuman no los trae), nombres legibles (`Hair`, `Eyes`…), materiales MToon y el VRM con huesos, expresiones y licencia (`meta.json`). |
| `pack_vrm.py` | Pelo, cejas, pestañas y ojos recortados (MASK, no BLEND), texturas en JPEG y a menos resolución (según la pieza que las usa), formas de la cara dispersas. |

Para cambiar el aspecto basta con `panduro.json` (pelo, piel, ropa y colores, con los nombres de
los recursos de MakeHuman) y volver a ejecutar el script. Con recursos que no sean CC0 hay que
cambiar también la licencia en `meta.json` y en `CREDITS.md`.

## Qué tiene que tener el modelo

- **Licencia** que deje usarlo a cualquiera y redistribuirlo: en VRM 1.0, «avatar permission:
  everyone» y redistribución permitida; en VRM 0.x, «allowed user: everyone» y una licencia CC
  (CC0, CC BY…). Panduro es público: un modelo «solo el autor» o «redistribución prohibida» no
  se puede publicar.
- **Pose en T con las palmas hacia abajo**, como pide VRM. Si no, el mapper mide la palma con los
  nudillos y sigue funcionando, pero la muñeca del modelo queda retorcida media vuelta.
- **Huesos de los ojos** (`leftEye`, `rightEye`): el mapper mide la cara desde ellos. Sin ellos
  la supone más arriba y las manos que van a la cara se quedan por encima de la cabeza.
- **Orejas a la vista** y **pelo corto pegado a la cabeza**: OREJA, ESCUCHAR o SORDO las tocan, y
  el pelo cerca de la piel cuenta como cabeza: con un tupé, la mano que va a la sien o a la frente
  se queda encima del pelo. (A HairSample_Male el pelo le tapa las orejas: se eligió así, y esos
  signos tocan el pelo que las cubre.)
- **Muñecas a la vista**: mangas ajustadas, sin capucha puesta ni ropa holgada en los brazos.
- **Sin accesorios en la cara** (gafas, mascarilla): las manos pasan por ahí.
- **Expresiones VRM** de serie (aa, ih, ou, ee, oh, happy, sad, angry, surprised, blink) y, si
  puede ser, cejas por separado (`EyebrowsUp`/`EyebrowsDown` o los `Fcl_BRW_*` de VRoid).
- **Pelo** en mallas o materiales con «hair» en el nombre: el mapper lo distingue de la piel para
  poner los contactos en la cara.

Un modelo hecho en VRoid Studio también vale (con sus piezas de serie es de quien lo hace; las
compradas traen su propia licencia): cabeza un 15 % más pequeña que la de serie, peinado corto
que deje ver las orejas, ropa con las muñecas a la vista y exportar en VRM 1.0 con texturas de
2048.

## Al cambiar de modelo

- Las manos se agrandan solas si son pequeñas para la cabeza y para el cuerpo
  (`createVrmRigWithHands`, hasta `HAND_SCALE`): en un modelo anime sí, en este no.
- Revisar `SPREAD_GAIN` (`lib/avatar/vrmMapper.ts`), la mano pasiva de las frases
  (`PASSIVE_REST` en `lib/avatar/compose.ts`) y el contorno de las manos
  (`lib/avatar/handOutline.ts`).
- Comparar con los vídeos los signos que ya estaban bien (CASA, ESPERAR, MÉDICO, PROGRAMA, HOLA,
  TELÉFONO, PADRE, OREJA, ESCUCHAR, PENSAR, LLUVIA, GRACIAS, BIEN, NARIZ, DESCUBRIR, 18) y los
  que tocan la cabeza.
- Añadir el modelo, su autor y su licencia a `CREDITS.md`.

## Con el modelo de VRoid

- La cara se mide de la malla, pero la de VRoid hay que leerla con cuidado:
  - Sus partes (piel, ojos, boca, pestañas) son primitivas que comparten los vértices: cada una
    cuenta solo los de sus triángulos (`collectCloud`), y los ojos se reconocen también por el
    material. Así se mide el contorno de los ojos del modelo (del 5 % al 90 % de lo ancho, sin
    el rabillo del delineado), que antes salía con las proporciones de una persona: el ojo
    llega a 7 cm del centro, el doble.
  - La boca es una textura y de la nariz a la barbilla la cara es casi plana, de triángulos
    grandes: el perfil con el que se busca la barbilla sale también de los triángulos que
    cruzan la línea media (`midlineFront`), sin parar en el hueso del cuello (en una cabeza
    grande queda por encima de la barbilla) y con el cuello donde el perfil se va de golpe
    hacia atrás. Antes la barbilla se quedaba en la punta de la nariz y la distancia de los
    ojos a la boca salía a la mitad (3,8 cm en vez de 7,5): todo lo de debajo de la nariz
    quedaba alto (el índice de NARIZ en la mejilla, las manos de GRACIAS delante de la boca).
  - La rejilla de la cabeza deja fuera la ropa: el cuello de la capucha llega a la barbilla y
    echaba hacia delante la mano que la sostiene.
- Lo que en una persona está en la nariz o pegado a ella (NARIZ, DESCUBRIR, INFERIR) queda junto
  a la nariz del modelo, un bultito de 6 mm de semiancho (`besideNose`, con `noseHalf` medido),
  y no en medio de la mejilla.
- Por debajo de la boca, el cuello no cuenta como cara, y lo que cae fuera de una barbilla
  estrecha va al borde de la mandíbula de encima: las yemas de GRACIAS la tocan desde abajo,
  sin tapar la boca.
- En los signos a dos manos simétricas en la boca o la barbilla (GRACIAS, DESAYUNO, HISTORIA),
  la otra mano también toca, en el punto reflejado (`bothHandsTouch`): las grabaciones solo
  detectan el contacto de la dominante. Más arriba no (en LLUVIA no tocan la cabeza).
- La mano plana bajo la barbilla (ENFADADO, PADRE) va debajo, sosteniéndola (`chinUnderside`),
  bajo la fila más baja de la barbilla en esa vertical (no la del cuello).
- NARIZ y PADRE se han vuelto a convertir de los vídeos con la corrección del giro de la cabeza
  y el camino de la parte que toca: el índice de NARIZ va a la nariz y PADRE empieza en la
  frente.
- DOLOR también: el índice bajo el labio ya cuenta como contacto todo el signo (ver
  `docs/datasets.md`) y no baja al pecho a la mitad.
- Midiendo el error de los 545 contactos de los 81 signos grabados que tocan la cara o el
  cuerpo, la mediana es 0,004 brazos y 2 pasan de 0,1, los dos de ROSA al pasar por la mejilla
  junto al ojo: entre el rabillo del ojo y el borde de la cara la de dibujo está tapada por el
  pelo de los lados, y la mano no cabe (lo mismo deja las yemas de TRISTE en el pelo de la
  sien).
- Revisados frente al vídeo los 81 signos con contacto en la cara: siguen algo altos los de lo
  alto de la frente (PENSAR, DOMINGO, en el flequillo) y el índice de DOLOR, HABLAR o MAL bajo el
  labio sale más inclinado hacia arriba que en el vídeo.
- Sin contacto, la altura de la mano se cuenta respecto a la boca medida (`mouthY`). Con el
  hueso de la cabeza, que en una cabeza de dibujo está a la altura de la mandíbula, la boca
  salía a 3,4 cm de los ojos en vez de 7,5: por encima de ella las manos quedaban bajas (en
  ENFERMERO las yemas se juntaban delante de la frente y no sobre la cabeza).
- Contactos entre manos (91 signos, 593 contactos): vistos de frente, como los ve la cámara, la
  mediana del error es 0,001 brazos y solo 2 pasan de 0,05. En profundidad la dominante queda
  de media 3,5 cm por delante: `keepHandsApart` aparta así las manos que se meterían una en la
  otra, que de frente no se nota. Revisados frente al vídeo, coinciden salvo NARANJA (ver
  abajo).
- Revisados también frente al vídeo los 161 signos sin contacto: coinciden en posición,
  orientación y movimiento casi todos. Lo que no:
  - CANSADO y DERECHO venían de una conversión antigua que no coincidía con el vídeo (CANSADO
    con el meñique levantado y lejos de la sien; DERECHO con la mano a la altura del hombro):
    se han vuelto a convertir.
  - COMO no tocaba la barbilla (el contacto, en la punta de la barbilla, quedaba fuera de la
    cara para la captura; ver `docs/datasets.md`).
  - Algunas formas de la mano con los dedos rectos salen con algún dedo doblado: el 2, el 15 o
    el 20, A VECES, ALTO. MediaPipe se inventa la flexión en profundidad, y con la palma casi de
    frente (no del todo) `unbendFingers` no la quita. Bajar ese umbral apenas los arreglaba y
    aplanaba la mano ahuecada de ESCUCHAR, así que se queda como está.
  - Los contactos con el cuerpo (los hombros de RESPONSABLE) y algunos casi-contactos (las
    yemas de las dos manos de IGUALDAD, la mano junto a la cabeza de ENTENDER) no se detectan
    en la captura y el avatar deja la mano un poco separada.
  - En NARANJA la mano pasiva sale con los nudillos rectos (MediaPipe) y las garras se
    entrecruzan en vez de tocarse punta con punta.
- Los gestos de la cara salen de las formas sueltas de VRoid por su nombre (ver arriba).

## Con el modelo de MakeHuman: lo que cambió y lo que falta

El mapper se había afinado con un modelo anime, de cabeza enorme y cara plana. Con una cabeza de
persona:

- La distancia entre los ojos se medía a la mitad (un fallo que con aquel modelo no se notaba) y
  la barbilla salía a la altura de los ojos: ahora se mide bien, y una franja suelta sin cara
  delante (entre el labio y la barbilla) ya no corta la búsqueda de la barbilla.
- Un contacto fuera del contorno de la cabeza (la oreja) va al punto del contorno más cercano, no
  a la mandíbula de debajo.
- La palma en reposo se mide con los nudillos (`restPalm`), no se supone hacia abajo. La primera
  versión de este modelo tenía las palmas hacia arriba en la pose en T, y todas las manos salían
  del revés: el dorso donde tenía que verse la palma y el pulgar por fuera. Con la palma bien, en
  DOMINGO, CALOR o TEORÍA el pulgar toca la frente con la mano por encima, como en el vídeo, y no
  tapando la cara.
- Con la palma de frente a la cámara, MediaPipe da los dedos doblados hacia ella aunque estén
  rectos (la profundidad no la ve bien): la mano abierta de HOLA salía como una garra. Lo poco
  doblado se endereza (`unbendFingers`); un puño se queda como está. Solo con la palma de frente
  del todo: con la palma algo girada (la mano ahuecada de ESCUCHAR) lo doblado se ve en la imagen
  y es de verdad.
- La mano en la oreja con la palma hacia delante (ESCUCHAR) está detrás de ella, ahuecada: el
  contacto va a la cara de atrás de la oreja, no a lo que se ve de frente, que la dejaba delante
  de la cara.
- Las manos no se agrandan con esta cabeza de dibujo: grandes para el cuerpo, el tejado de CASA
  llegaba a la boca. Y su contorno es la mitad de grueso que con el modelo anime: con el contorno
  toon del cuerpo, uno grueso las convertía en manchas.
- La mano puede meterse en la cabeza unos 4 mm antes de girarla o apartarla (antes, 2 mm): con
  nariz y pómulos, la mano que toca con una parte roza con otra. Para sacarla se gira sobre el
  contacto hasta 90° (antes, 60°: la mano de ROSA o el índice de DOLOR no salían y, apartados
  enteros, no llegaban a la mejilla).
- El peso de un contacto dice a cuánto de la piel se quedó la mano en la grabación (de 0 a
  3,5 cm), como con la otra mano. Antes, en la cara, era la fracción del camino desde donde
  estaba la muñeca grabada, y un contacto sostenido (peso 0,9: tocar) se quedaba a 3-4 cm: la
  yema de BUENOS DÍAS o el índice de DOLOR no llegaban.
- Los gestos de la cara se ven: con expresiones de dibujo más marcadas en el modelo, y un gesto
  medido a medias (el ceño de QUÉ, la boca hacia abajo de ABURRIDO, 0,3-0,5) casi entero
  (`exprBoost`). La sonrisa y la pena, a peso 1 (antes 0,8).
- Lo recortado (pelo, cejas, pestañas) se suaviza con el antialiasing (alpha to coverage) sin
  bajar el alfa del lienzo: el borde de cada mechón lo dejaba a medias y el fondo de la página se
  veía a través del pelo en rayitas blancas (`loadVrm`).
- Parpadea entre una repetición del signo y la siguiente, al volver las manos al inicio
  (`loopBlink`), como se parpadea al signar entre signos. Antes parpadeaba a los 0,9 s de
  empezar, en mitad de casi todos los signos, justo cuando la cara dice algo.

Midiendo el error de cada contacto en los 81 signos grabados que tocan la cara o el cuerpo (536
contactos), la mediana queda en 0,005 brazos (3 mm) y solo 8 pasan de 0,1; con la palma del
revés eran 0,040 y 105. Los que quedan son de la mejilla: la mano llega al punto, pero se mete
en la cabeza y ni girándola sale, así que se aparta un poco. Los contactos parciales (FRUTA,
DULCE, MAL…) quedan a la distancia que dice la grabación, a propósito.

Lo que viene mal de MediaPipe y no se corrige aquí:

- Un gesto que la signante mantiene todo el vídeo, también antes y después del signo (el ceño
  de ENFADADO o NERVIOSO), se toma por su cara neutra y no sale. Tomar la cara neutra de otros
  vídeos de la misma persona no sirve: los blendshapes en reposo cambian mucho de un vídeo a otro
  (la sonrisa de TRABAJAR, 0,7 con la cara casi seria) y saldrían gestos que no están.
- Algunos gestos no los ve (la pena de TRISTE) y las mejillas hinchadas, nunca (`cheekPuff`
  sale siempre 0).

Para esos, el signo lleva en el currículo el gesto de su descripción (`face`: «con el ceño
fruncido» es `{"browDown": 0.8}`) y el loader lo pone mientras la mano signa, si la animación no
trae más (`withFace`): ENFADADO, TRISTE, CONFLICTO, COMPLEJIDAD, las preguntas sin él (CÓMO,
CUÁNTO), los de desagrado o malestar (PEOR, FEO, MAL, ENFERMO…), la súplica de POR FAVOR y las
mejillas de GORDO y VIENTO (`puff`, con la forma `CheekPuff` del modelo).
- En la «Y» de TELÉFONO vista por el dorso confunde el pulgar con el índice: da el índice
  estirado hasta la oreja y el pulgar doblado, y el avatar hace índice y meñique.
- Con la palma de frente, la imagen no sirve para saber cuánto doblado está un dedo de verdad:
  las falanges no miden en la imagen lo mismo que en 3D (la primera, un 30-50 % más), y esa
  diferencia es mayor que lo que acorta un dedo doblado 30°.
