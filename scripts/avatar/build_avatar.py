# Construye el personaje de Panduro con MPFB (MakeHuman, recursos CC0) y lo guarda en .blend.
# Uso: blender -b --python build_avatar.py -- config.json salida.blend
import bpy, json, sys
from bl_ext.user_default.mpfb.services import HumanService, ObjectService

args = sys.argv[sys.argv.index("--") + 1:]
cfg = json.load(open(args[0]))
out = args[1]

bpy.ops.wm.read_factory_settings(use_empty=True)

info = HumanService._create_default_human_info_dict()
info["name"] = "Panduro"
info["phenotype"].update(cfg.get("phenotype", {}))
info["rig"] = cfg.get("rig", "mixamo")
for part in ("eyes", "eyebrows", "eyelashes", "teeth", "tongue", "hair"):
    if cfg.get(part):
        info[part] = f"{cfg[part]}/{cfg[part]}.mhclo"
info["clothes"] = [f"{c}/{c}.mhclo" for c in cfg.get("clothes", [])]
info["skin_mhmat"] = f"{cfg['skin']}/{cfg['skin']}.mhmat"
info["skin_material_type"] = "GAMEENGINE"
info["eyes_material_type"] = "GAMEENGINE"
info["clothes_material_type"] = "GAMEENGINE"
info["targets"] = cfg.get("targets", [])

# Materiales alternativos: {"short04": "short04/toigo_short_04_brown/toigo_short_04_brown.mhmat"}, por el uuid del mhclo.
from bl_ext.user_default.mpfb.services import AssetService
alts = {}
for asset, mat in cfg.get("materials", {}).items():
    for sub in ("hair", "clothes", "eyebrows", "eyelashes", "eyes"):
        path = AssetService.find_asset_absolute_path(f"{asset}/{asset}.mhclo", asset_subdir=sub)
        if path:
            uuid = next(l.split()[1] for l in open(path) if l.startswith("uuid "))
            alts[uuid] = mat
            break
info["alternative_materials"] = alts
print("ALTS", alts)

settings = HumanService.get_default_deserialization_settings()
settings.update({"subdiv_levels": 0, "material_instances": "NEVER", "load_clothes": True})
basemesh = HumanService.deserialize_from_dict(info, settings)
print("BASEMESH", basemesh.name, len(basemesh.data.vertices))
for o in bpy.data.objects:
    print("OBJ", o.name, o.type, len(o.data.vertices) if o.type == "MESH" else "", [m.name for m in o.data.materials] if o.type == "MESH" else "")
bpy.ops.wm.save_as_mainfile(filepath=out)
