"""最小限の glTF 2.0 (.glb) 書き出し: スキンメッシュ1つ + 骨格（レスト回転なし）。"""
import json
import struct

import numpy as np


def _pad4(b, fill=b"\x00"):
    while len(b) % 4:
        b += fill
    return b


def write_glb(path, rig, verts, normals, faces, colors, joints, weights):
    bones = rig["bones"]
    nb = len(bones)
    buf = bytearray()
    views, accessors = [], []

    def add(arr, target, comp, typ, normalized=False, minmax=False):
        nonlocal buf
        data = np.ascontiguousarray(arr).tobytes()
        off = len(buf)
        buf += data
        buf = bytearray(_pad4(bytes(buf)))
        view = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            view["target"] = target
        views.append(view)
        acc = {"bufferView": len(views) - 1, "componentType": comp, "count": int(arr.shape[0]), "type": typ}
        if normalized:
            acc["normalized"] = True
        if minmax:
            acc["min"] = [float(x) for x in arr.min(axis=0)]
            acc["max"] = [float(x) for x in arr.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    a_pos = add(verts.astype(np.float32), 34962, 5126, "VEC3", minmax=True)
    a_nrm = add(normals.astype(np.float32), 34962, 5126, "VEC3")
    a_col = add(colors.astype(np.float32), 34962, 5126, "VEC4")
    a_jnt = add(joints.astype(np.uint8), 34962, 5121, "VEC4")
    a_wgt = add(weights.astype(np.float32), 34962, 5126, "VEC4")
    a_idx = add(faces.astype(np.uint32).reshape(-1), 34963, 5125, "SCALAR")
    ibm = np.zeros((nb, 16), dtype=np.float32)
    for i, b in enumerate(bones):
        m = np.eye(4, dtype=np.float32)
        m[:3, 3] = -np.array(b["pos"], dtype=np.float32)
        ibm[i] = m.T.reshape(-1)  # 列優先
    a_ibm = add(ibm, None, 5126, "MAT4")
    nodes = []
    # ボーンノード（0..nb-1）
    for i, b in enumerate(bones):
        p = np.array(b["pos"], dtype=np.float64)
        par = b["parent"]
        if par >= 0:
            p = p - np.array(bones[par]["pos"], dtype=np.float64)
        nodes.append({"name": b["name"], "translation": [float(x) for x in p], "children": []})
    for i, b in enumerate(bones):
        if b["parent"] >= 0:
            nodes[b["parent"]]["children"].append(i)
    for n in nodes:
        if not n["children"]:
            del n["children"]
    mesh_node = len(nodes)
    nodes.append({"name": "Body", "mesh": 0, "skin": 0})
    roots = [i for i, b in enumerate(bones) if b["parent"] < 0]
    arm = len(nodes)
    nodes.append({"name": "Armature", "children": roots + [mesh_node]})
    gltf = {
        "asset": {"version": "2.0", "generator": "RINGBOUND charmodel"},
        "scene": 0,
        "scenes": [{"nodes": [arm]}],
        "nodes": nodes,
        "meshes": [{"name": "Body", "primitives": [{
            "attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "COLOR_0": a_col, "JOINTS_0": a_jnt, "WEIGHTS_0": a_wgt},
            "indices": a_idx, "material": 0}]}],
        "materials": [{"name": "Body", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.0, "roughnessFactor": 0.7}}],
        "skins": [{"joints": list(range(nb)), "inverseBindMatrices": a_ibm, "skeleton": roots[0]}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(buf)}],
    }
    js = _pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bb = _pad4(bytes(buf))
    total = 12 + 8 + len(js) + 8 + len(bb)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(bb), 0x004E4942))
        f.write(bb)
