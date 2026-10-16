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

Un hombre joven con estilo de dibujo, con camisa azul petróleo, vaqueros oscuros y el pelo
corto y pegado a la cabeza, con las orejas a la vista. Está hecho con **MakeHuman** (complemento
MPFB para Blender) y solo con recursos **CC0** de la comunidad MakeHuman, y se exporta a
**VRM 1.0** con el complemento VRM. El modelo también es **CC0**: se puede usar, modificar y
redistribuir sin pedir permiso ni citar (los datos del VRM lo dicen así).

El estilo de dibujo (más amable que uno realista) sale de `panduro.json`:

- **Proporciones** (`cartoon` y `targets`): la cabeza un 25 % mayor y los ojos un 45 %, cabeza
  redonda, mejillas llenas, barbilla pequeña y nariz pequeña.
- **Sombreado toon** (`toon`, MToon de VRM): sombra de dos tonos y un contorno fino por malla.
- **Texturas de dibujo**: piel lisa y sin sombras pintadas, colorete en las mejillas, iris más
  grandes con un brillo, solo las pestañas de arriba, y cejas y pelo de color plano.

- 54 huesos humanoides, con los tres del pulgar y los ojos.
- Expresiones VRM: vocales (aa, ih, ou, ee, oh), parpadeo (los dos ojos y cada uno), happy,
  relaxed, sad, angry y surprised; y las cejas por separado (`EyebrowsUp`, `EyebrowsDown`).
  Salen de las formas ARKit (`faceunits01`) y los visemas (`visemes02`) de MakeHuman, también en
  las cejas, las pestañas, los dientes y la lengua.
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
  se queda encima del pelo.
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

## Con este modelo: lo que cambió y lo que falta

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
  nariz y pómulos, la mano que toca con una parte roza con otra.
- El peso de un contacto dice a cuánto de la piel se quedó la mano en la grabación (de 0 a
  3,5 cm), como con la otra mano. Antes, en la cara, era la fracción del camino desde donde
  estaba la muñeca grabada, y un contacto sostenido (peso 0,9: tocar) se quedaba a 3-4 cm: la
  yema de BUENOS DÍAS o el índice de DOLOR no llegaban.

Midiendo el error de cada contacto en los 81 signos grabados que tocan la cara o el cuerpo (536
contactos), la mediana queda en 0,005 brazos (3 mm) y solo 8 pasan de 0,1; con la palma del
revés eran 0,040 y 105. Los que quedan son de la mejilla: la mano llega al punto, pero se mete
en la cabeza y ni girándola sale, así que se aparta un poco. Los contactos parciales (FRUTA,
DULCE, MAL…) quedan a la distancia que dice la grabación, a propósito.
