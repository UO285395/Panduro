# Acaba el personaje construido por build_avatar.py para exportarlo a VRM:
#  1. expresiones (formas ARKit y visemas de MakeHuman, CC0) en el cuerpo y en las piezas de la cara,
#  2. la forma del cuerpo (fenotipo) horneada en la malla, sin la geometría auxiliar,
#  3. colores (camisa y pelo) y materiales opacos o recortados,
#  4. pose en T (la de reposo de VRM 1.0).
# Uso: blender -b personaje.blend --python finish_avatar.py -- config.json salida.blend
import bpy, bmesh, json, os, sys
import numpy as np
from mathutils import Vector
from bl_ext.user_default.mpfb.services import TargetService, ClothesService, LocationService

args = sys.argv[sys.argv.index("--") + 1:]
cfg = json.load(open(args[0]))
out = args[1]

body = next(o for o in bpy.data.objects if o.name.endswith(".body"))
armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
by_kind = lambda kind: [o for o in meshes if kind in o.name]


def coords(key):
    a = np.empty(len(key.data) * 3, dtype=np.float32)
    key.data.foreach_get("co", a)
    return a.reshape(-1, 3)


def set_coords(key, arr):
    key.data.foreach_set("co", np.ascontiguousarray(arr, dtype=np.float32).ravel())


# --- 1. Expresiones -----------------------------------------------------------------------------
EXPRESSIONS = {
    "aa": {"viseme_aa": 1.0},
    "ih": {"viseme_I": 1.0},
    "ou": {"viseme_U": 1.0},
    "ee": {"viseme_E": 1.0},
    "oh": {"viseme_O": 1.0},
    "blink": {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0},
    "blinkLeft": {"eyeBlinkLeft": 1.0},
    "blinkRight": {"eyeBlinkRight": 1.0},
    "happy": {"mouthSmileLeft": 1.0, "mouthSmileRight": 1.0, "cheekSquintLeft": 0.6, "cheekSquintRight": 0.6,
              "eyeSquintLeft": 0.3, "eyeSquintRight": 0.3},
    "relaxed": {"mouthSmileLeft": 0.4, "mouthSmileRight": 0.4},
    "sad": {"mouthFrownLeft": 0.9, "mouthFrownRight": 0.9, "browInnerUp": 0.7, "mouthShrugLower": 0.3},
    "angry": {"browDownLeft": 1.0, "browDownRight": 1.0, "noseSneerLeft": 0.4, "noseSneerRight": 0.4,
              "mouthPressLeft": 0.4, "mouthPressRight": 0.4},
    "surprised": {"browInnerUp": 1.0, "browOuterUpLeft": 1.0, "browOuterUpRight": 1.0, "eyeWideLeft": 0.8,
                  "eyeWideRight": 0.8, "jawOpen": 0.35},
    # Para el reproductor (vrmMapper: cejas por separado, /eyebrows?[ _.]*(down|up)/).
    "EyebrowsDown": {"browDownLeft": 1.0, "browDownRight": 1.0},
    "EyebrowsUp": {"browInnerUp": 1.0, "browOuterUpLeft": 1.0, "browOuterUpRight": 1.0},
}
# Un estilo de dibujo exagera los gestos: el personaje los da con sus propias mezclas.
EXPRESSIONS.update(cfg.get("expressions", {}))

data = LocationService.get_user_data()
units = {}
for sub in ("faceunits", "visemes"):
    folder = os.path.join(data, "targets", sub)
    for f in sorted(os.listdir(folder)):
        if f.endswith(".target") and os.path.getsize(os.path.join(folder, f)) > 0:
            name = f[: -len(".target")]
            units[name] = TargetService.load_target(body, os.path.join(folder, f), weight=0.0, name="unit." + name)

keys = body.data.shape_keys.key_blocks
basis = coords(keys[0])
for expr, mix in EXPRESSIONS.items():
    co = basis.copy()
    for unit, w in mix.items():
        co += w * (coords(units[unit]) - basis)
    k = body.shape_key_add(name=expr, from_mix=False)
    set_coords(k, co)
    k.value = 0.0
for k in list(body.data.shape_keys.key_blocks):
    if k.name.startswith("unit."):
        body.shape_key_remove(k)
print("EXPR body", len(EXPRESSIONS))

# Las piezas de la cara siguen a la malla: se reajustan con cada expresión y se guarda la forma.
face_parts = [o for o in meshes if o is not body and any(t in o.name for t in cfg.get("face_parts", []))]
for part in face_parts:
    ClothesService.fit_clothes_to_human(part, body)
    n = len(part.data.vertices)
    neutral = np.empty(n * 3, dtype=np.float32)
    part.data.vertices.foreach_get("co", neutral)
    shapes = {}
    for expr in EXPRESSIONS:
        body.data.shape_keys.key_blocks[expr].value = 1.0
        ClothesService.fit_clothes_to_human(part, body)
        co = np.empty(n * 3, dtype=np.float32)
        part.data.vertices.foreach_get("co", co)
        body.data.shape_keys.key_blocks[expr].value = 0.0
        if np.abs(co - neutral).max() > 1e-5:
            shapes[expr] = co
    part.data.vertices.foreach_set("co", neutral)
    part.data.update()
    if shapes:
        part.shape_key_add(name="Basis", from_mix=False)
        for expr, co in shapes.items():
            k = part.shape_key_add(name=expr, from_mix=False)
            k.data.foreach_set("co", co)
    print("EXPR", part.name, sorted(shapes))
for k in body.data.shape_keys.key_blocks:
    if k.name.startswith("temporary_fitting_key"):
        body.shape_key_remove(k)

# --- 2. Forma del cuerpo horneada y sin geometría auxiliar ---------------------------------------
keys = body.data.shape_keys.key_blocks
for k in keys:
    if k.name in EXPRESSIONS:
        k.value = 0.0
mix_key = body.shape_key_add(name="__mix", from_mix=True)
mix = coords(mix_key)
basis = coords(keys[0])
for k in keys:
    if k.name in EXPRESSIONS:
        set_coords(k, mix + (coords(k) - basis))
set_coords(keys[0], mix)
body.data.vertices.foreach_set("co", mix.ravel())
for k in list(keys)[1:]:
    if k.name not in EXPRESSIONS:
        body.shape_key_remove(k)
body.data.update()

for m in list(body.modifiers):
    if m.type == "MASK":
        body.modifiers.remove(m)
# Se quitan la geometría auxiliar (lo que no está en «body») y la piel que tapa la ropa
# (los grupos Delete.<prenda>, como los MASK de MPFB), para que no asome al mover los brazos.
group = body.vertex_groups["body"].index
hidden = {vg.index for vg in body.vertex_groups
          if vg.name.startswith("Delete.") and any(c in vg.name for c in cfg.get("clothes", []))}
keep = np.zeros(len(body.data.vertices), dtype=bool)
for v in body.data.vertices:
    gs = {g.group: g.weight for g in v.groups}
    keep[v.index] = gs.get(group, 0) > 0.5 and not any(gs.get(h, 0) > 0.5 for h in hidden)
print("HIDDEN groups", [body.vertex_groups[h].name for h in hidden])
bm = bmesh.new()
bm.from_mesh(body.data)
bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep[v.index]], context="VERTS")
bm.to_mesh(body.data)
bm.free()
body.data.update()
# Piezas que asoman por otra prenda (la caña de shoes01 atraviesa el vaquero): se recortan por altura.
for kind, zmax in cfg.get("trim", {}).items():
    for o in by_kind(kind):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        drop = [v for v in bm.verts if (o.matrix_world @ v.co).z > zmax]
        bmesh.ops.delete(bm, geom=drop, context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
        print("TRIM", o.name, len(drop))
# Grupos que no son huesos (MakeHuman trae decenas de grupos de ayuda): fuera.
bone_names = {b.name for b in armature.data.bones}
for o in meshes:
    for vg in list(o.vertex_groups):
        if vg.name not in bone_names:
            o.vertex_groups.remove(vg)
print("BODY verts", len(body.data.vertices), "keys", [k.name for k in body.data.shape_keys.key_blocks])

# --- 2b. Proporciones de dibujo -------------------------------------------------------------------
# Cabeza algo mayor (desde el cuello, sin tocar el cuerpo) y ojos grandes (cada uno desde su
# centro, con el párpado y las pestañas). Los targets de MakeHuman no pasan de cierto tamaño.
# Es una deformación suave del espacio aplicada a todas las mallas y a cada forma de expresión,
# así que el parpadeo sigue cerrando el ojo agrandado.
cartoon = cfg.get("cartoon")
if cartoon:
    def smoothstep(e0, e1, x):
        t = np.clip((x - e0) / (e1 - e0), 0, 1)
        return t * t * (3 - 2 * t)

    head_bone = armature.data.bones["mixamorig:Head"]
    pivot = np.array(armature.matrix_world @ head_bone.head_local)
    eye_obj = next(o for o in meshes if "high-poly" in o.name)
    eco = np.array([eye_obj.matrix_world @ v.co for v in eye_obj.data.vertices])
    eye_centers = [(eco[m].min(0) + eco[m].max(0)) / 2 for m in (eco[:, 0] > 0, eco[:, 0] <= 0)]
    eye_r = cartoon.get("eye_radius", 0.02)

    def warp(p):
        out = p.copy()
        se = cartoon.get("eyes", 1.0)
        for c in eye_centers:
            d = np.linalg.norm(out - c, axis=1)
            w = 1 - smoothstep(eye_r, eye_r * cartoon.get("eye_falloff", 1.9), d)
            out = c + (out - c) * (1 + (se - 1) * w)[:, None]
        sh = cartoon.get("head", 1.0)
        w = smoothstep(pivot[2] - 0.02, pivot[2] + 0.05, out[:, 2])
        return pivot + (out - pivot) * (1 + (sh - 1) * w)[:, None]

    for o in meshes:
        if not o.data.vertices:
            continue
        mw = np.array(o.matrix_world)
        inv = np.linalg.inv(mw)
        to_world = lambda co: co @ mw[:3, :3].T + mw[:3, 3]
        to_local = lambda co: co @ inv[:3, :3].T + inv[:3, 3]
        n = len(o.data.vertices)
        co = np.empty(n * 3, dtype=np.float32)
        o.data.vertices.foreach_get("co", co)
        o.data.vertices.foreach_set("co", to_local(warp(to_world(co.reshape(-1, 3)))).astype(np.float32).ravel())
        if o.data.shape_keys:
            for k in o.data.shape_keys.key_blocks:
                kc = coords(k)
                set_coords(k, to_local(warp(to_world(kc))))
        o.data.update()
    print("CARTOON", cartoon, "eyes at", [c.round(3) for c in eye_centers], "pivot", pivot.round(3))

    # Solo las pestañas de arriba, como un trazo de dibujo: las de abajo parecían maquillaje.
    if cartoon.get("upper_lashes_only"):
        for o in by_kind("eyelash"):
            mw = np.array(o.matrix_world)
            bm = bmesh.new()
            bm.from_mesh(o.data)
            z = np.array([(mw[:3, :3] @ np.array(v.co) + mw[:3, 3])[2] for v in bm.verts])
            # Dos grupos por altura (los párpados de arriba y de abajo); el corte, entre los dos.
            lo, hi = np.percentile(z, 15), np.percentile(z, 85)
            for _ in range(10):
                up = np.abs(z - hi) < np.abs(z - lo)
                lo, hi = z[~up].mean(), z[up].mean()
            low = [v for v, u in zip(bm.verts, up) if not u]
            bmesh.ops.delete(bm, geom=low, context="VERTS")
            bm.to_mesh(o.data)
            bm.free()
            print("LASHES lower removed", o.name, len(low))

# --- 3. Colores y transparencias ----------------------------------------------------------------
def recolor(obj_kind, fn, suffix):
    for o in by_kind(obj_kind):
        for mat in o.data.materials:
            for node in mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.name == "DiffuseTexture" and node.image:
                    img = node.image
                    w, h = img.size
                    px = np.empty(w * h * 4, dtype=np.float32)
                    img.pixels.foreach_get(px)
                    # Las funciones reciben los píxeles en fila (N×4); las que miran vecinos, el
                    # tamaño en recolor.shape.
                    recolor.shape = (h, w)
                    px = fn(pad(px.reshape(h, w, 4), cfg.get("pad", {}).get(obj_kind)).reshape(-1, 4)).ravel()
                    new = bpy.data.images.new(f"{img.name}.{suffix}", w, h, alpha=True)
                    new.pixels.foreach_set(px)
                    new.filepath_raw = os.path.join(os.path.dirname(out), f"{o.name}.{suffix}.png")
                    new.file_format = "PNG"
                    new.save()
                    for n2 in mat.node_tree.nodes:
                        if n2.type == "TEX_IMAGE" and n2.image == img and n2.name != "NormalMapTextue":
                            n2.image = new
                    print("RECOLOR", o.name, img.name, "->", new.name)


def pad(img, background, steps=24):
    """Rellena con el color de las islas el fondo que las rodea (las costuras del UV caen en él)."""
    if not background:
        return img
    bg = np.array(background, dtype=np.float32) / 255
    known = np.abs(img[..., :3] - bg).max(-1) > 0.03
    for _ in range(steps):
        acc = np.zeros(img.shape[:2] + (3,), np.float32)
        cnt = np.zeros(img.shape[:2], np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(img[..., :3], (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        grow = ~known & (cnt > 0)
        img[grow, :3] = acc[grow] / cnt[grow, None]
        known |= grow
    return img


def blur(a, r, passes=3):
    """Desenfoque de caja separable, repetido (casi gaussiano), de un array H×W(×C)."""
    for _ in range(passes):
        for axis in (0, 1):
            pad_width = [(r + 1, r) if k == axis else (0, 0) for k in range(a.ndim)]
            c = np.cumsum(np.pad(a, pad_width, mode="edge"), axis=axis, dtype=np.float64)
            n = c.shape[axis]
            a = (np.take(c, range(2 * r + 1, n), axis) - np.take(c, range(0, n - 2 * r - 1), axis)) / (2 * r + 1)
    return a.astype(np.float32)


def rgb_to_hsv(rgb):
    mx, mn = rgb.max(1), rgb.min(1)
    d = mx - mn + 1e-8
    r, g, b = rgb.T
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-8), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    out = np.stack([np.choose(i.astype(int), c) for c in ((v, q, p, p, t, v), (t, v, v, q, p, p), (p, p, t, v, v, q))], 1)
    return out


shirt = cfg.get("shirt")
if shirt:
    def shirt_fn(px):
        h, s, v = rgb_to_hsv(px[:, :3])
        teal = (s > 0.18) & (h > 0.38) & (h < 0.6)
        h2 = np.where(teal, shirt["hue"], h)
        s2 = np.where(teal, np.clip(s * shirt["sat"], 0, 1), s)
        v2 = np.where(teal, v * shirt["value"], v)
        px[:, :3] = hsv_to_rgb(h2, s2, v2)
        return px
    recolor("casualsuit", shirt_fn, "shirt")

def blush_mask(h, w):
    """Peso del colorete en la textura de la piel: las mejillas, debajo y por fuera de cada ojo."""
    blush = cfg.get("blush")
    mask = np.zeros((h, w), dtype=np.float32)
    if not blush:
        return mask
    eye_obj = next(o for o in meshes if "high-poly" in o.name)
    eco = np.array([eye_obj.matrix_world @ v.co for v in eye_obj.data.vertices])
    mw = np.array(body.matrix_world)
    co = np.empty(len(body.data.vertices) * 3, dtype=np.float32)
    body.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    uv = body.data.uv_layers.active.data
    r = blush.get("radius", 0.02)
    for side in (eco[:, 0] > 0, eco[:, 0] <= 0):
        c = (eco[side].min(0) + eco[side].max(0)) / 2
        cheek = c + np.array([np.sign(c[0]) * blush.get("out", 0.008), 0, -blush.get("down", 0.03)])
        # La piel de la mejilla: lo más adelantado de la cara a esa altura y ese lado, y a su
        # alrededor en 3D (por anchura y altura cogía también el párpado, más adelantado).
        col = np.nonzero(np.hypot(co[:, 0] - cheek[0], co[:, 2] - cheek[2]) < 0.006)[0]
        surf = co[col[co[col, 1].argmin()]]  # la cara mira a -Y
        dist = np.linalg.norm(co - surf, axis=1)
        weight = {int(i): 1 - dist[i] / r for i in np.nonzero(dist < r)[0]}
        # Cada polígono de la mejilla se pinta entero en la textura (su caja en UV), con el peso
        # medio de sus vértices: con puntos sueltos, al suavizar casi no quedaba color.
        for poly in body.data.polygons:
            ws = [weight.get(body.data.loops[li].vertex_index, 0.0) for li in poly.loop_indices]
            if max(ws) <= 0:
                continue
            us = np.array([uv[li].uv for li in poly.loop_indices])
            x0, y0 = np.floor(us.min(0) * [w - 1, h - 1]).astype(int)
            x1, y1 = np.ceil(us.max(0) * [w - 1, h - 1]).astype(int) + 1
            mask[y0:y1, x0:x1] = np.maximum(mask[y0:y1, x0:x1], float(np.mean(ws)))
    soft = blur(mask, blush.get("soft", 10))
    return np.clip(soft / max(soft.max(), 1e-6), 0, 1) * blush.get("strength", 0.3)


skin = cfg.get("skin_tone")
if skin:
    # Piel de dibujo: sin poros ni barba incipiente (desenfoque fino) y sin las sombras pintadas
    # en la textura (ojeras, surcos): el brillo se iguala con el de alrededor, a lo grande, y el
    # sombreado toon pone las suyas.
    def skin_fn(px):
        h, w = recolor.shape
        img = px.reshape(h, w, 4)
        rgb = blur(img[..., :3], skin.get("smooth", 3))
        lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        big = blur(lum, skin.get("flatten_radius", 48))
        gain = np.clip((np.median(lum) / np.maximum(big, 1e-3)) ** skin.get("flatten", 0.7), 0.6, 1.6)
        rgb = rgb * gain[..., None]
        hh, ss, vv = rgb_to_hsv(np.clip(rgb.reshape(-1, 3), 0, 1))
        hh = (hh + skin.get("hue", 0.0)) % 1.0
        rgb = hsv_to_rgb(hh, np.clip(ss * skin.get("sat", 1.0), 0, 1), np.clip(vv * skin.get("value", 1.0), 0, 1))
        rgb = rgb.reshape(h, w, 3)
        a = blush_mask(h, w)[..., None]
        rgb = rgb * (1 - a) + np.array(cfg.get("blush", {}).get("color", [1.0, 0.6, 0.6]), dtype=np.float32) * rgb.max(-1, keepdims=True) * a
        img[..., :3] = rgb
        return img.reshape(-1, 4)
    recolor("body", skin_fn, "toon")

eyes = cfg.get("eye_color")
if eyes:
    # Otro iris de MakeHuman, oscurecido (el «brown» de serie sale rojizo).
    src = bpy.data.images.load(os.path.join(data, "eyes", "materials", eyes["texture"]))
    for o in by_kind("high-poly"):
        for mat in o.data.materials:
            for node in mat.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    node.image = src

    def iris_fn(px):
        h, s, v = rgb_to_hsv(px[:, :3])
        iris = s > 0.3
        px[:, :3] = hsv_to_rgb(h, s, np.where(iris, v * eyes["iris_value"], v))
        scale = eyes.get("iris_scale", 1.0)
        shine = eyes.get("catchlight", 0.0)
        if scale == 1.0 and not shine:
            return px
        # Iris más grandes (de dibujo) y un brillo en cada uno. La textura trae los dos globos:
        # se separan los iris en dos grupos y cada uno se amplía desde su centro.
        hgt, wid = recolor.shape
        img = px.reshape(hgt, wid, 4)
        ys, xs = np.nonzero(iris.reshape(hgt, wid))
        pts = np.stack([xs, ys], 1).astype(np.float32)
        d = pts[:, 0] - pts[:, 1]
        centers = np.stack([pts[d.argmax()], pts[d.argmin()]])
        for _ in range(10):
            lab = np.linalg.norm(pts[:, None] - centers[None], axis=2).argmin(1)
            centers = np.stack([pts[lab == k].mean(0) for k in (0, 1)])
        src = img.copy()
        gy, gx = np.mgrid[0:hgt, 0:wid].astype(np.float32)
        for k in (0, 1):
            cx, cy = centers[k]
            radius = np.percentile(np.linalg.norm(pts[lab == k] - centers[k], axis=1), 97)
            dist = np.hypot(gx - cx, gy - cy)
            inside = dist < radius * scale
            sx = np.clip(np.round(cx + (gx - cx) / scale), 0, wid - 1).astype(int)
            sy = np.clip(np.round(cy + (gy - cy) / scale), 0, hgt - 1).astype(int)
            img[inside] = src[sy[inside], sx[inside]]
            if shine:
                # Arriba a la izquierda (las filas de Blender van de abajo arriba).
                spot = np.hypot(gx - (cx - 0.38 * radius * scale), gy - (cy + 0.38 * radius * scale))
                a = np.clip(1 - spot / (0.2 * radius * scale), 0, 1) ** 0.6 * shine
                img[..., :3] = img[..., :3] * (1 - a[..., None]) + a[..., None]
        return img.reshape(-1, 4)
    recolor("high-poly", iris_fn, "iris")

def morph(a, r, op, disc=False):
    """Dilata (np.maximum) o erosiona (np.minimum) el alfa con un cuadrado (o un disco) de radio r."""
    out = a.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if not disc or dx * dx + dy * dy <= r * r:
                out = op(out, np.roll(a, (dy, dx), (0, 1)))
    return out


def darken(value, bold=0, close=0, open_=0):
    """Más oscuro y, con bold, el trazo más grueso (el alfa se dilata bold píxeles); con close,
    lo que queda a menos de 2·close píxeles se rellena (cierre: dilatar y erosionar); con open_,
    se quita lo más fino que 2·open_ píxeles (apertura: erosionar y dilatar)."""
    def fn(px):
        px[:, :3] *= value
        h, w = recolor.shape
        a = px[:, 3].reshape(h, w)
        if bold:
            a = morph(a, bold, np.maximum)
        if close:
            a = morph(morph(a, close, np.maximum, True), close, np.minimum, True)
        if open_:
            a = morph(morph(a, open_, np.minimum, True), open_, np.maximum, True)
        px[:, 3] = a.ravel()
        return px
    return fn


# Con hair_close, los huecos entre mechones se rellenan: el borde (las patillas, la nuca)
# salía deshilachado, con trozos sueltos; con hair_open, fuera los pelos sueltos del borde.
if cfg.get("hair_value"):
    recolor("hair", darken(cfg["hair_value"], close=cfg.get("hair_close", 0), open_=cfg.get("hair_open", 0)), "dark")
# Colores planos de dibujo: sin la trama de la tela ni los mechones finos (el sombreado toon
# pone el volumen). {"casualsuit": 3, "hair": 4}: radio del desenfoque por pieza.
for kind, radius in cfg.get("flatten", {}).items():
    def flat_fn(px, radius=radius):
        h, w = recolor.shape
        img = px.reshape(h, w, 4)
        img[..., :3] = blur(img[..., :3], radius)
        return img.reshape(-1, 4)
    recolor(kind, flat_fn, "flat")

# Pestañas de dibujo: los pelos sueltos se juntan en un trazo (con MASK salían como puntos) y,
# con lash_close, los mechones en una raya con algunas puntas (separados parecían púas).
if cfg.get("lash_bold"):
    recolor("eyelash", darken(cfg.get("lash_value", 0.4), cfg["lash_bold"], cfg.get("lash_close", 0)), "bold")
# Cejas: por defecto como el pelo; en un estilo de dibujo, más oscuras y gruesas.
brow = cfg.get("brow_value", cfg.get("hair_value"))
if brow:
    recolor("eyebrow", darken(brow, cfg.get("brow_bold", 0)), "dark")

for o in meshes:
    for mat in o.data.materials:
        cutout = any(t in o.name for t in ("hair", "eyebrow", "eyelash", "high-poly"))
        mat.blend_method = "CLIP" if cutout else "OPAQUE"
        if hasattr(mat, "alpha_threshold"):
            mat.alpha_threshold = 0.5
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf and not cutout:
            for l in list(mat.node_tree.links):
                if l.to_node == bsdf and l.to_socket.name == "Alpha":
                    mat.node_tree.links.remove(l)
            bsdf.inputs["Alpha"].default_value = 1.0
        if bsdf:
            bsdf.inputs["Roughness"].default_value = cfg.get("roughness", {}).get(o.name.split(".")[-1], 0.75)
            if "Specular IOR Level" in bsdf.inputs:
                bsdf.inputs["Specular IOR Level"].default_value = 0.3

# --- 4. Pose en T ---------------------------------------------------------------------------------
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode="POSE")
pb = armature.pose.bones


def aim(bone, direction):
    """Gira el hueso (en el espacio del esqueleto) para que apunte hacia direction."""
    bpy.context.view_layer.update()
    m = pb[bone].matrix.copy()
    cur = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    # pb.matrix no se recalcula hasta el siguiente update: se asigna una sola vez.
    nm = q.to_matrix().to_4x4() @ m.to_3x3().to_4x4()
    nm.translation = m.to_translation()
    pb[bone].matrix = nm


def roll_palm_down(side, sign):
    """Gira la mano sobre su eje hasta que la palma mira hacia abajo."""
    bpy.context.view_layer.update()
    hand = pb[f"mixamorig:{side}Hand"]
    w = hand.head
    a = pb[f"mixamorig:{side}HandIndex1"].head - w
    b = pb[f"mixamorig:{side}HandPinky1"].head - w
    normal = (a.cross(b) * sign).normalized()  # hacia la palma
    axis = (hand.tail - hand.head).normalized()
    target = Vector((0, 0, -1))
    nproj = (normal - axis * normal.dot(axis)).normalized()
    tproj = (target - axis * target.dot(axis)).normalized()
    q = nproj.rotation_difference(tproj)
    m = hand.matrix.copy()
    loc = m.to_translation()
    nm = q.to_matrix().to_4x4() @ m.to_3x3().to_4x4()
    nm.translation = loc
    hand.matrix = nm


for side, x in (("Left", 1.0), ("Right", -1.0)):
    # MakeHuman mira hacia -Y: la izquierda del personaje está en +X.
    for b in ("Arm", "ForeArm", "Hand"):
        aim(f"mixamorig:{side}{b}", (x, 0, 0))
    # Índice × meñique (desde la muñeca) sale por el dorso de la izquierda y por la palma de la derecha.
    roll_palm_down(side, -1.0 if side == "Left" else 1.0)
    bpy.context.view_layer.update()
    hand_dir = (pb[f"mixamorig:{side}Hand"].tail - pb[f"mixamorig:{side}Hand"].head).normalized()
    for finger in ("Index", "Middle", "Ring", "Pinky"):
        base = pb[f"mixamorig:{side}Hand{finger}1"]
        d = (base.tail - base.head).normalized()
        d.z = 0  # recto en el plano de la palma, sin perder la separación entre dedos
        for i in (1, 2, 3):
            aim(f"mixamorig:{side}Hand{finger}{i}", d)
bpy.ops.object.mode_set(mode="OBJECT")

bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
