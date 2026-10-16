# Exporta el personaje acabado (finish_avatar.py) a VRM 1.0.
#  1. La pose en T pasa a ser la de reposo (malla y formas de la cara deformadas con el esqueleto).
#  2. Nombres de mallas y materiales legibles (el reproductor busca «Hair», «Eyes»…).
#  3. Huesos humanoides, expresiones y datos de licencia (CC0).
# Uso: blender -b personaje.blend --python export_vrm.py -- meta.json salida.vrm
import bpy, json, sys
import numpy as np
from bl_ext.user_default.vrm.editor.extension import get_armature_extension

args = sys.argv[sys.argv.index("--") + 1:]
meta = json.load(open(args[0]))
out = args[1]

armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]


def evaluated(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    return co


# --- 1. Pose en T como reposo ---------------------------------------------------------------------
# El skinning es lineal en la posición: deformar cada forma por separado y restar la base da
# exactamente la forma deformada.
baked = {}
for o in meshes:
    keys = o.data.shape_keys.key_blocks if o.data.shape_keys else []
    for k in keys:
        k.value = 0.0
    bpy.context.view_layer.update()
    base = evaluated(o)
    shapes = {}
    for k in list(keys)[1:]:
        k.value = 1.0
        bpy.context.view_layer.update()
        shapes[k.name] = evaluated(o) - base
        k.value = 0.0
    baked[o.name] = (base, shapes)

for o in meshes:
    base, shapes = baked[o.name]
    o.data.vertices.foreach_set("co", base)
    if o.data.shape_keys:
        kb = o.data.shape_keys.key_blocks
        kb[0].data.foreach_set("co", base)
        for name, delta in shapes.items():
            kb[name].data.foreach_set("co", base + delta)
    o.data.update()

bpy.context.view_layer.objects.active = armature
for o in bpy.context.selected_objects:
    o.select_set(False)
armature.select_set(True)
bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.select_all(action="SELECT")
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.update()
# Comprobación: con la pose aplicada, la malla evaluada debe quedar donde se ha horneado.
worst = max(np.abs(evaluated(o) - baked[o.name][0]).max() for o in meshes)
print("REST check, max offset (m):", worst)
assert worst < 1e-4

# --- 1b. Huesos de los ojos --------------------------------------------------------------------------
# El rig «mixamo» de MakeHuman no los trae y el reproductor mide la cara desde ellos (y VRM los
# usa para mirar). Uno por globo, en su centro, hijo de la cabeza; cada ojo pesa entero en el suyo.
eyes = next(o for o in bpy.data.objects if o.type == "MESH" and "high-poly" in o.name)
co = np.empty(len(eyes.data.vertices) * 3, dtype=np.float32)
eyes.data.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode="EDIT")
eb = armature.data.edit_bones
for side, mask in (("Left", co[:, 0] > 0), ("Right", co[:, 0] <= 0)):
    c = (co[mask].min(0) + co[mask].max(0)) / 2
    bone = eb.new(f"mixamorig:{side}Eye")
    bone.head = c.tolist()
    bone.tail = (c + np.array([0, -0.02, 0])).tolist()  # hacia delante (-Y)
    bone.parent = eb["mixamorig:Head"]
    print("EYE", side, c.round(4))
bpy.ops.object.mode_set(mode="OBJECT")
for vg in list(eyes.vertex_groups):
    eyes.vertex_groups.remove(vg)
for side, mask in (("Left", co[:, 0] > 0), ("Right", co[:, 0] <= 0)):
    vg = eyes.vertex_groups.new(name=f"mixamorig:{side}Eye")
    vg.add([int(i) for i in np.nonzero(mask)[0]], 1.0, "REPLACE")

# --- 2. Nombres -----------------------------------------------------------------------------------
NAMES = [("body", "Body"), ("hair", "Hair"), ("eyebrow", "Eyebrows"), ("eyelash", "Eyelashes"),
         ("high-poly", "Eyes"), ("teeth", "Teeth"), ("tongue", "Tongue"), ("casualsuit", "Clothes"),
         ("shoes", "Shoes")]
for o in meshes:
    new = next(n for k, n in NAMES if k in o.name)
    o.name = new
    o.data.name = new
    for i, mat in enumerate(o.data.materials):
        mat.name = new if i == 0 else f"{new}{i}"
armature.name = "Panduro"
armature.data.name = "Panduro"

# --- 3. VRM ---------------------------------------------------------------------------------------
ext = get_armature_extension(armature.data)
ext.spec_version = "1.0"
vrm1 = ext.vrm1
bpy.ops.vrm.assign_vrm1_humanoid_human_bones_automatically(armature_object_name=armature.name)
human_bones = vrm1.humanoid.human_bones
human_bones.left_eye.node.bone_name = "mixamorig:LeftEye"
human_bones.right_eye.node.bone_name = "mixamorig:RightEye"
assigned = {}
for prop in human_bones.bl_rna.properties:
    v = getattr(human_bones, prop.identifier, None)
    if hasattr(v, "node") and getattr(v.node, "bone_name", ""):
        assigned[prop.identifier] = v.node.bone_name
print("HUMAN BONES", len(assigned))
vrm1.humanoid.pose = "restPositionPose"

PRESETS = {"aa": "aa", "ih": "ih", "ou": "ou", "ee": "ee", "oh": "oh", "blink": "blink",
           "blink_left": "blinkLeft", "blink_right": "blinkRight", "happy": "happy", "angry": "angry",
           "sad": "sad", "relaxed": "relaxed", "surprised": "surprised"}
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for attr, key in PRESETS.items():
    expr = getattr(vrm1.expressions.preset, attr)
    expr.morph_target_binds.clear()
    for o in meshes:
        if o.data.shape_keys and key in o.data.shape_keys.key_blocks:
            b = expr.morph_target_binds.add()
            b.node.mesh_object_name = o.name
            b.index = key
            b.weight = 1.0
    print("EXPR", key, [b.node.mesh_object_name for b in expr.morph_target_binds])
# Al parpadear o sonreír no se mezclan las vocales con los ojos cerrados de más.
for attr in ("blink", "blink_left", "blink_right"):
    getattr(vrm1.expressions.preset, attr).override_blink = "none"

m = vrm1.meta
m.vrm_name = meta["name"]
m.version = meta["version"]
m.authors.clear()
for a in meta["authors"]:
    m.authors.add().value = a
m.copyright_information = meta.get("copyright", "")
m.contact_information = meta.get("contact", "")
m.references.clear()
for r in meta.get("references", []):
    m.references.add().value = r
m.third_party_licenses = meta.get("third_party_licenses", "")
m.avatar_permission = "everyone"
m.commercial_usage = "corporation"
m.allow_excessively_violent_usage = False
m.allow_excessively_sexual_usage = False
m.allow_political_or_religious_usage = False
m.allow_antisocial_or_hate_usage = False
m.credit_notation = "unnecessary"
m.allow_redistribution = True
m.modification = "allowModificationRedistribution"
m.other_license_url = meta.get("other_license_url", "")

bpy.ops.wm.save_as_mainfile(filepath=out.replace(".vrm", ".blend"))
res = bpy.ops.export_scene.vrm(filepath=out, armature_object_name=armature.name, ignore_warning=True,
                               export_try_sparse_sk=True)
print("EXPORT", res, out)
