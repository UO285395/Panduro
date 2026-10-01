# Avatar 3D

El reproductor carga, por orden:

1. `public/avatars/panduro.vrm` (no se versiona: es un binario grande y cada modelo tiene su
   licencia).
2. Si no existe, Seed-san (VRM Consortium, CC BY) desde la CDN.
3. Si no carga ningún VRM, el rig procedimental de Three.js; sin WebGL, el SVG animado.

El mapper (`lib/avatar/vrmMapper.ts`) mide el modelo al cargarlo: largo de los brazos, cara y
pecho en la malla, grosor de los dedos y hacia dónde mira (VRM0 o VRM1). Las animaciones
(`content/signs/captured.json`) no dependen del modelo: cambiarlo no obliga a volver a capturar.

## Qué tiene que tener el modelo

- **Licencia** que deje usarlo a cualquiera y redistribuirlo: en VRM 1.0, «avatar permission:
  everyone» y redistribución permitida; en VRM 0.x, «allowed user: everyone» y una licencia CC
  (CC0, CC BY…). Panduro es público: un modelo «solo el autor» o «redistribución prohibida» no
  se puede publicar. Un modelo hecho en VRoid Studio con sus piezas de serie es de quien lo hace;
  las piezas compradas (BOOTH…) traen su propia licencia.
- **Cabeza pequeña**, cerca de la proporción real. Con la cabeza grande del estilo anime, la mano
  que va a la sien o a la mejilla queda dentro de la cabeza, el mapper tiene que girarla para
  sacarla y el brazo sube más que en el vídeo (DOMINGO, SÁBADO, MÓVIL, PENSAR). Con la cabeza al
  85 % mejoraban 9 signos y no empeoraba ninguno de los correctos.
- **Orejas a la vista**: OREJA, ESCUCHAR o SORDO las tocan. Pelo corto por los lados, sin
  mechones que caigan sobre la cara ni puntas grandes.
- **Muñecas a la vista**: mangas ajustadas que acaben antes de la muñeca, sin capucha puesta ni
  ropa holgada en los brazos, que atraviesa la cabeza al signar cerca de ella.
- **Sin accesorios en la cara** (gafas, mascarilla): las manos pasan por ahí.
- **Expresiones VRM** de serie (aa, ih, ou, ee, oh, happy, sad, angry, surprised, blink) y, si
  puede ser, cejas por separado (los morphs `Fcl_BRW_*` de VRoid).
- **Pelo** en mallas o materiales con «hair» en el nombre (VRoid ya lo hace): el mapper lo
  distingue de la piel para poner los contactos en la cara.

## Hacerlo en VRoid Studio

Los nombres de los menús cambian un poco según la versión y el idioma.

1. **Nuevo** modelo con la base masculina.
2. **Cara**: un preset amable, iris castaño o verde, boca normal (se usa para las vocales y las
   expresiones), cejas que no tape el flequillo.
3. **Peinado**: un preset corto con raya al lado, castaño oscuro, que deje ver las orejas.
4. **Cuerpo**: la cabeza (*Head size*) un 15 % más pequeña; cuello normal; si la versión deja
   alargar los brazos o agrandar las manos, un poco de cada (el código ya agranda las manos un
   15 %: `HAND_SCALE`).
5. **Ropa**: sudadera o chaqueta con cremallera de un color propio, camiseta clara, pantalón
   oscuro; mangas que no tapen las muñecas.
6. **Accesorios**: ninguno.
7. **Exportar como VRM** (VRM 1.0; el mapper también lee VRM 0.x): reducir materiales y textura
   de 2048 para que pese poco. En la información del avatar: título, autor y versión; uso
   permitido a todos, redistribución y modificación permitidas.
8. Guardar también el proyecto `.vroid` para poder retocarlo, y copiar el `.vrm` a
   `public/avatars/panduro.vrm`.

## Al cambiar de modelo

- Revisar `HAND_SCALE` y `SPREAD_GAIN` (`lib/avatar/vrmMapper.ts`), la mano pasiva de las frases
  (`PASSIVE_REST` en `lib/avatar/compose.ts`) y el color del contorno de las manos
  (`lib/avatar/handOutline.ts`).
- Comparar con los vídeos los signos que ya estaban bien (CASA, ESPERAR, MÉDICO, PROGRAMA, HOLA,
  TELÉFONO, PADRE, OREJA, ESCUCHAR, PENSAR, LLUVIA, GRACIAS, BIEN, NARIZ, DESCUBRIR, 18) y los
  que tocan la cabeza.
- Añadir el modelo, su autor y su licencia a `CREDITS.md`.
