# Retoques del .vrm exportado, sobre el glTF binario:
#  - pelo, cejas, pestañas y ojos con alphaMode MASK (BLEND se ordena mal en three.js),
#  - texturas opacas en JPEG y las pequeñas a menos resolución (de ~21 MB a unos pocos).
# Uso: python3 pack_vrm.py entrada.vrm salida.vrm
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
data = open(src, "rb").read()
json_len = struct.unpack("<I", data[12:16])[0]
gltf = json.loads(data[20:20 + json_len])
bin_start = 20 + json_len + 8
binary = data[bin_start:bin_start + struct.unpack("<I", data[20 + json_len:24 + json_len])[0]]

MASK = {"Hair", "Eyebrows", "Eyelashes", "Eyes"}
for mat in gltf["materials"]:
    if mat["name"] in MASK:
        mat["alphaMode"] = "MASK"
        mat["alphaCutoff"] = 0.5
    else:
        mat.pop("alphaMode", None)
        mat.pop("alphaCutoff", None)

# Lado máximo de cada imagen (por el material que la usa o por su nombre) y si conserva el alfa.
# Las texturas recoloreadas no llevan el nombre de la pieza (la del pelo es «male02_diffuse…»).
SIZE = {"teeth": 512, "tongue": 256, "shoes": 512, "eyes": 512, "iris": 512, "normal": 1024, "hair": 1024,
        "outline": 256}


def material_images(mat):
    """Imágenes de un material: la base, la de sombra de MToon y el resto (normales…)."""
    refs = [mat.get("pbrMetallicRoughness", {}).get("baseColorTexture"), mat.get("normalTexture"),
            mat.get("extensions", {}).get("VRMC_materials_mtoon", {}).get("shadeMultiplyTexture")]
    return [gltf["textures"][r["index"]]["source"] for r in refs if r]


owner = {}
alpha_images = set()
for mat in gltf["materials"]:
    images = material_images(mat)
    for i in images:
        owner.setdefault(i, mat["name"].lower())
    if mat.get("alphaMode") == "MASK":
        alpha_images.update(images[:1] + images[2:])

views = [binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in gltf["bufferViews"]]
for i, im in enumerate(gltf["images"]):
    raw = views[im["bufferView"]]
    pic = Image.open(io.BytesIO(raw))
    name = im["name"].lower()
    limit = next((s for k, s in SIZE.items() if k in name or k == owner.get(i, "")), None)
    if limit and max(pic.size) > limit:
        pic = pic.resize((limit, limit * pic.size[1] // pic.size[0]), Image.LANCZOS)
    out = io.BytesIO()
    if i in alpha_images:
        pic.save(out, "PNG", optimize=True)
        im["mimeType"] = "image/png"
    else:
        pic.convert("RGB").save(out, "JPEG", quality=88, optimize=True)
        im["mimeType"] = "image/jpeg"
    print(f"{im['name']}: {len(raw) / 1e6:.2f} MB -> {out.tell() / 1e6:.2f} MB {pic.size} {im['mimeType']}")
    views[im["bufferView"]] = out.getvalue()

# Formas de la cara como accesores dispersos: casi todos sus vértices no se mueven.
import numpy as np
dropped = set()
for mesh in gltf["meshes"]:
    for prim in mesh["primitives"]:
        for target in prim.get("targets", []):
            for attr, ai in target.items():
                acc = gltf["accessors"][ai]
                if "bufferView" not in acc or acc["componentType"] != 5126:
                    continue
                bv = acc["bufferView"]
                arr = np.frombuffer(views[bv], dtype=np.float32).reshape(acc["count"], 3)
                # Lo que se mueve menos de 0,1 mm (o gira la normal menos de 0,001) es ruido del ajuste.
                noise = 1e-4 if attr == "POSITION" else 1e-3
                moved = np.nonzero(np.abs(arr).max(1) > noise)[0].astype(np.uint32)
                if len(moved) * 14 > acc["count"] * 12:
                    continue
                itype, idx = (5123, moved.astype(np.uint16)) if acc["count"] < 65536 else (5125, moved)
                gltf["bufferViews"].append({"buffer": 0, "byteLength": 0})
                views.append(idx.tobytes())
                gltf["bufferViews"].append({"buffer": 0, "byteLength": 0})
                views.append(np.ascontiguousarray(arr[moved]).tobytes())
                n = len(gltf["bufferViews"])
                del acc["bufferView"]
                acc.pop("byteOffset", None)
                acc["sparse"] = {"count": int(len(moved)),
                                 "indices": {"bufferView": n - 2, "componentType": itype},
                                 "values": {"bufferView": n - 1}}
                dropped.add(bv)
# Las vistas que ya no usa nadie se quitan y se renumeran las demás.
keep = [i for i in range(len(views)) if i not in dropped]
renum = {old: new for new, old in enumerate(keep)}
gltf["bufferViews"] = [gltf["bufferViews"][i] for i in keep]
views = [views[i] for i in keep]
for acc in gltf["accessors"]:
    if "bufferView" in acc:
        acc["bufferView"] = renum[acc["bufferView"]]
    if "sparse" in acc:
        acc["sparse"]["indices"]["bufferView"] = renum[acc["sparse"]["indices"]["bufferView"]]
        acc["sparse"]["values"]["bufferView"] = renum[acc["sparse"]["values"]["bufferView"]]
for im in gltf["images"]:
    im["bufferView"] = renum[im["bufferView"]]
print("sparse targets:", len(dropped))

blob = bytearray()
for view, chunk in zip(gltf["bufferViews"], views):
    blob += b"\0" * (-len(blob) % 4)
    view["byteOffset"] = len(blob)
    view["byteLength"] = len(chunk)
    blob += chunk
blob += b"\0" * (-len(blob) % 4)
gltf["buffers"][0]["byteLength"] = len(blob)

js = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4)
total = 12 + 8 + len(js) + 8 + len(blob)
with open(dst, "wb") as f:
    f.write(struct.pack("<III", 0x46546C67, 2, total))
    f.write(struct.pack("<I4s", len(js), b"JSON") + js)
    f.write(struct.pack("<I4s", len(blob), b"BIN\0") + blob)
print(f"{dst}: {total / 1e6:.2f} MB")
