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
        return px
    recolor("high-poly", iris_fn, "iris")

hair = cfg.get("hair_value")
if hair:
    def hair_fn(px):
        px[:, :3] *= hair
        return px
    for kind in ("hair", "eyebrow"):
        recolor(kind, hair_fn, "dark")

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
    roll_palm_down(side, 1.0 if side == "Left" else -1.0)
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
