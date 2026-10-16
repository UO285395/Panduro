# Render de prueba (Cycles en CPU): cuerpo entero de frente, tres cuartos, cara, ojos, manos.
# Uso: SHOTS=full,tq,face [EXPR=happy] blender -b archivo.blend --python render_preview.py -- prefijo
import bpy, os, sys
from mathutils import Vector

prefix = sys.argv[sys.argv.index("--") + 1]
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.film_transparent = False
scene.render.resolution_percentage = 100

world = bpy.data.worlds.new("w") if not scene.world else scene.world
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.82, 0.85, 0.9, 1)
bg.inputs[1].default_value = 0.6

def light(name, loc, energy, size=2.0):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = (Vector((0, 0, 1.4)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)

light("key", (1.5, -2.5, 2.4), 400)
light("fill", (-2.0, -2.0, 1.6), 180)
light("rim", (0.5, 2.5, 2.2), 250)

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

meshes = [o for o in scene.objects if o.type == "MESH"]
# EXPR=aa,blink: esas expresiones puestas del todo.
for expr in filter(None, os.environ.get("EXPR", "").split(",")):
    for o in meshes:
        if o.data.shape_keys and expr in o.data.shape_keys.key_blocks:
            o.data.shape_keys.key_blocks[expr].value = 1.0
zmax = max((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)

def shot(name, loc, target, lens, w, h):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = lens
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.filepath = f"{prefix}-{name}.png"
    bpy.ops.render.render(write_still=True)

want = os.environ.get("SHOTS", "full,tq,face").split(",")
if "full" in want: shot("full", (0, -4.2, 0.95), (0, 0, 0.9), 50, 420, 640)
if "tq" in want: shot("tq", (2.6, -3.3, 1.2), (0, 0, 1.05), 50, 420, 640)
if "face" in want: shot("face", (0, -1.1, zmax - 0.12), (0, 0, zmax - 0.13), 85, 480, 480)
if "face34" in want: shot("face34", (0.75, -0.8, zmax - 0.1), (0, 0, zmax - 0.13), 85, 480, 480)
if "shin" in want: shot("shin", (0.1, -1.3, 0.35), (0.1, 0, 0.3), 50, 600, 500)
if "hands" in want: shot("hands", (0.75, -0.9, 1.45), (0.75, 0, 1.4), 60, 600, 500)
if "eyes" in want: shot("eyes", (0, -0.55, zmax - 0.155), (0, 0, zmax - 0.16), 85, 640, 280)
