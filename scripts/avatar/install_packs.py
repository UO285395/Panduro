# Instala en los datos de usuario de MPFB los paquetes de recursos de MakeHuman (.zip).
# Uso: blender -b --python install_packs.py -- carpeta_con_zips
import bpy, zipfile, os, sys
from bl_ext.user_default.mpfb.services import LocationService, AssetService
data = LocationService.get_user_data()
print("USERDATA", data)
mh = sys.argv[sys.argv.index("--") + 1]
for z in sorted(os.listdir(mh)):
    if z.endswith(".zip"):
        with zipfile.ZipFile(os.path.join(mh, z)) as f:
            f.extractall(data)
        print("installed", z)
AssetService.update_all_asset_lists()
