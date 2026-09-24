# Modelo de la mascota

La mascota (Thing) usa el modelo 3D que pongas en esta carpeta; si no hay ninguno, dibuja
una mano procedimental. Los modelos no se suben al repositorio (`.gitignore`), porque cada
uno tiene su propia licencia.

## Con el modelo de Sketchfab

1. Entra en <https://sketchfab.com/3d-models/thing-addams-a650a8a13a664dad87be13aa2afa2f01>
   con tu cuenta y pulsa **Download 3D Model**.
2. Elige **glTF** (o **GLB**).
3. Descomprime el zip **aquí**, de forma que quede `public/mascot/scene.gltf` junto a
   `scene.bin` y la carpeta `textures/` (con GLB basta `public/mascot/thing.glb`).
4. Recarga la app.

Lee el `license.txt` que viene en el zip: si la licencia es CC BY, añade la atribución
(autor y enlace) a `CREDITS.md`; si no permite redistribuirlo, déjalo solo en local.

## Ajustes (opcional)

`public/mascot/mascot.json`:

```json
{ "file": "scene.gltf", "rotateY": 180, "animation": true }
```

- `rotateY`: grados para girarlo si no mira a la cámara.
- `animation`: `false` para ignorar las animaciones que traiga el modelo y usar solo el
  movimiento de la app (reposo, salto al acertar, negación al fallar, giro al celebrar).
