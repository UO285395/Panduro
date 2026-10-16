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

Un hombre joven de proporciones reales, con camisa azul petróleo, vaqueros oscuros y el pelo
corto y pegado a la cabeza, con las orejas a la vista. Está hecho con **MakeHuman** (complemento
MPFB para Blender) y solo con recursos **CC0** de la comunidad MakeHuman, y se exporta a
**VRM 1.0** con el complemento VRM. El modelo también es **CC0**: se puede usar, modificar y
redistribuir sin pedir permiso ni citar (los datos del VRM lo dicen así).

- 54 huesos humanoides, con los tres del pulgar y los ojos.
- Expresiones VRM: vocales (aa, ih, ou, ee, oh), parpadeo (los dos ojos y cada uno), happy,
  relaxed, sad, angry y surprised; y las cejas por separado (`EyebrowsUp`, `EyebrowsDown`).
  Salen de las formas ARKit (`faceunits01`) y los visemas (`visemes02`) de MakeHuman, también en
  las cejas, las pestañas, los dientes y la lengua.
- Unos 5,8 MB: texturas opacas en JPEG y las formas de la cara como accesores dispersos.

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
| `finish_avatar.py` | Expresiones en el cuerpo y en las piezas de la cara; la forma del cuerpo horneada y sin la piel que tapa la ropa; colores (camisa, iris) y transparencias; pose en T. |
| `export_vrm.py` | La pose en T como reposo, huesos de los ojos (el esqueleto de MakeHuman no los trae), nombres legibles (`Hair`, `Eyes`…) y el VRM con huesos, expresiones y licencia (`meta.json`). |
| `pack_vrm.py` | Pelo, cejas, pestañas y ojos recortados (MASK, no BLEND), texturas en JPEG y a menos resolución, formas de la cara dispersas. |

Para cambiar el aspecto basta con `panduro.json` (pelo, piel, ropa y colores, con los nombres de
los recursos de MakeHuman) y volver a ejecutar el script. Con recursos que no sean CC0 hay que
cambiar también la licencia en `meta.json` y en `CREDITS.md`.

## Qué tiene que tener el modelo

- **Licencia** que deje usarlo a cualquiera y redistribuirlo: en VRM 1.0, «avatar permission:
  everyone» y redistribución permitida; en VRM 0.x, «allowed user: everyone» y una licencia CC
  (CC0, CC BY…). Panduro es público: un modelo «solo el autor» o «redistribución prohibida» no
  se puede publicar.
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

- Las manos se agrandan solas si son pequeñas para la cabeza (`createVrmRigWithHands`, hasta
  `HAND_SCALE`): en un modelo anime sí, en este no.
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
- La mano puede meterse en la cabeza unos 8 mm antes de girarla o apartarla (antes, 2 mm): con
  nariz y pómulos, la mano que toca con una parte roza con otra.

Midiendo el error de cada contacto en los 81 signos grabados que tocan la cara o el cuerpo
(536 contactos), los dos modelos quedan parecidos: mediana de 0,038 brazos con este y 0,033 con
el anterior, y 88 contactos a más de 0,1 brazos frente a 93. En la oreja, la sien y la mejilla
este sigue fallando más (74 contra 55). Los que se ven peor:

- **ESCUCHAR**: la mano ahuecada queda delante de la mejilla y no detrás de la oreja.
- **DOMINGO, CALOR, VERANO, TEORÍA**: el pulgar toca la frente, pero la muñeca queda a la altura
  de la barbilla y la mano tapa la cara; en el vídeo la mano está por encima de la frente. El
  pulgar grabado apunta hacia los dedos y, con el pulgar del modelo, eso baja toda la mano.
- **PADRE**: el tramo de la frente se pierde; el de debajo de la nariz está bien.
- **DORMIRSE, LEY, DULCE, SORPRENDIDO**: el contacto queda más lejos que con el modelo anterior.
