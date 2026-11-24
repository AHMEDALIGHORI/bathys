import bpy
import bmesh
import math
import os
import random
import shutil
from mathutils import Vector, Matrix, Euler

os.makedirs(r"E:\Bathys\models", exist_ok=True)
os.makedirs(r"E:\Bathys\web\public\models", exist_ok=True)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene

def make_mat(name, color, metallic=0.0, roughness=0.5, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None and emission_strength > 0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat

def new_obj(scene, name, bm, mat=None, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj

def export_glb(filename):
    dst_models = os.path.join(r"E:\Bathys\models", filename)
    dst_web = os.path.join(r"E:\Bathys\web\public\models", filename)
    bpy.ops.export_scene.gltf(
        filepath=dst_models,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
    )
    shutil.copy2(dst_models, dst_web)
    print(f"Exported {filename} ({os.path.getsize(dst_models)} bytes)")

# ------------------------------------------------------------------
# 1. THREE DISTINCT FISH SPECIES
# ------------------------------------------------------------------
def build_fish(filename, body_color, belly_color, fin_color, length=0.7, height=0.22, width=0.11, dorsal_h=0.14, tail_spread=0.24):
    scene = reset_scene()
    mat_body = make_mat("FishBody", body_color, metallic=0.45, roughness=0.28)
    mat_fin = make_mat("FishFin", fin_color, metallic=0.15, roughness=0.42)
    mat_eye = make_mat("FishEye", (0.04, 0.04, 0.05), metallic=0.1, roughness=0.05)

    bm = bmesh.new()
    # Lofted fusiform fish body along +Y (nose) to -Y (tail base)
    n_y = 14
    n_th = 16
    rings = []
    for i in range(n_y + 1):
        t = i / n_y  # 0 nose -> 1 tail peduncle
        y = (0.5 - t) * length
        # Smooth torpedo profile
        prof = math.sin(t * math.pi) ** 0.72 * (1.0 - 0.35 * t)
        rx = max(0.008, width * 0.5 * prof)
        rz = max(0.010, height * 0.5 * prof)
        ring = []
        for j in range(n_th):
            a = (j / n_th) * 2 * math.pi
            ring.append(bm.verts.new((math.cos(a) * rx, y, math.sin(a) * rz)))
        rings.append(ring)
    for i in range(n_y):
        for j in range(n_th):
            jn = (j + 1) % n_th
            bm.faces.new((rings[i][j], rings[i][jn], rings[i + 1][jn], rings[i + 1][j]))
    nose_v = bm.verts.new((0, length * 0.52, 0))
    tail_v = bm.verts.new((0, -length * 0.52, 0))
    for j in range(n_th):
        jn = (j + 1) % n_th
        bm.faces.new((nose_v, rings[0][jn], rings[0][j]))
        bm.faces.new((tail_v, rings[-1][j], rings[-1][jn]))
    new_obj(scene, "Fish_Body", bm, mat_body, smooth=True)

    # Forked tail fin (caudal)
    bm_t = bmesh.new()
    y0 = -length * 0.46
    y1 = -length * 0.78
    ym = -length * 0.62
    pts = [
        (0, y0, height * 0.10),
        (0, y1, tail_spread),
        (0, ym, 0.0),
        (0, y1, -tail_spread),
        (0, y0, -height * 0.10),
    ]
    vl = [bm_t.verts.new((p[0] - 0.008, p[1], p[2])) for p in pts]
    vr = [bm_t.verts.new((p[0] + 0.008, p[1], p[2])) for p in pts]
    bm_t.faces.new(vl)
    bm_t.faces.new(list(reversed(vr)))
    for i in range(len(pts)):
        inext = (i + 1) % len(pts)
        bm_t.faces.new((vl[i], vl[inext], vr[inext], vr[i]))
    new_obj(scene, "Fish_TailFin", bm_t, mat_fin, smooth=False)

    # Dorsal & pectoral fins
    bm_f = bmesh.new()
    # Dorsal
    d_pts = [(0, length * 0.14, height * 0.42), (0, -length * 0.16, height * 0.34), (0, -length * 0.24, height * 0.42 + dorsal_h), (0, length * 0.02, height * 0.42 + dorsal_h * 0.85)]
    dl = [bm_f.verts.new((-0.006, p[1], p[2])) for p in d_pts]
    dr = [bm_f.verts.new((0.006, p[1], p[2])) for p in d_pts]
    bm_f.faces.new(dl)
    bm_f.faces.new(list(reversed(dr)))
    for i in range(4):
        inext = (i + 1) % 4
        bm_f.faces.new((dl[i], dl[inext], dr[inext], dr[i]))
    # Pectoral fins (L/R)
    for sx in (-1.0, 1.0):
        p_pts = [
            (sx * width * 0.42, length * 0.12, -height * 0.08),
            (sx * (width * 0.42 + length * 0.22), -length * 0.04, -height * 0.22),
            (sx * (width * 0.42 + length * 0.14), -length * 0.10, -height * 0.14),
            (sx * width * 0.38, length * 0.02, -height * 0.12),
        ]
        pt = [bm_f.verts.new((p[0], p[1], p[2] + 0.005)) for p in p_pts]
        pb = [bm_f.verts.new((p[0], p[1], p[2] - 0.005)) for p in p_pts]
        bm_f.faces.new(pt if sx > 0 else list(reversed(pt)))
        bm_f.faces.new(list(reversed(pb)) if sx > 0 else pb)
    new_obj(scene, "Fish_Fins", bm_f, mat_fin, smooth=True)

    # Eyes
    bm_e = bmesh.new()
    for sx in (-1.0, 1.0):
        ret = bmesh.ops.create_uvsphere(bm_e, u_segments=8, v_segments=6, radius=height * 0.10)
        bmesh.ops.translate(bm_e, verts=ret["verts"], vec=(sx * width * 0.36, length * 0.34, height * 0.10))
    new_obj(scene, "Fish_Eyes", bm_e, mat_eye, smooth=True)

    export_glb(filename)

build_fish("fish_silver_blue.glb", (0.56, 0.72, 0.86), (0.85, 0.90, 0.95), (0.42, 0.58, 0.74), length=0.72, height=0.22, width=0.11, dorsal_h=0.14, tail_spread=0.22)
build_fish("fish_muted_gold.glb", (0.76, 0.62, 0.30), (0.88, 0.78, 0.50), (0.64, 0.48, 0.22), length=0.58, height=0.28, width=0.10, dorsal_h=0.18, tail_spread=0.20)
build_fish("fish_copper_red.glb", (0.72, 0.30, 0.20), (0.84, 0.52, 0.38), (0.58, 0.22, 0.16), length=0.66, height=0.20, width=0.12, dorsal_h=0.13, tail_spread=0.21)

# ------------------------------------------------------------------
# 2. SHARK (Strong silhouette, dark back, pale underside)
# ------------------------------------------------------------------
def build_shark():
    scene = reset_scene()
    mat_dorsal = make_mat("SharkDorsal", (0.20, 0.27, 0.34), metallic=0.12, roughness=0.40)
    mat_belly = make_mat("SharkBelly", (0.76, 0.80, 0.84), metallic=0.05, roughness=0.45)
    mat_eye = make_mat("SharkEye", (0.02, 0.02, 0.03), metallic=0.0, roughness=0.08)

    bm = bmesh.new()
    length = 4.6
    n_y = 24
    n_th = 20
    rings = []
    for i in range(n_y + 1):
        t = i / n_y  # 0 snout -> 1 tail base
        y = (0.5 - t) * length
        if t < 0.30:
            u = t / 0.30
            rx = 0.42 * (math.sin(u * math.pi * 0.5) ** 0.75)
            rz = 0.44 * (math.sin(u * math.pi * 0.5) ** 0.72)
        else:
            u = (t - 0.30) / 0.70
            rx = 0.42 * ((1.0 - u) ** 1.25) + 0.04
            rz = 0.44 * ((1.0 - u) ** 1.15) + 0.05
        ring = []
        for j in range(n_th):
            a = (j / n_th) * 2 * math.pi
            ring.append(bm.verts.new((math.cos(a) * rx, y, math.sin(a) * rz)))
        rings.append(ring)

    # Assign dorsal vs belly material indices on faces
    mesh = bpy.data.meshes.new("Shark_Body")
    for i in range(n_y):
        for j in range(n_th):
            jn = (j + 1) % n_th
            f = bm.faces.new((rings[i][j], rings[i][jn], rings[i + 1][jn], rings[i + 1][j]))
            f.material_index = 0 if f.calc_center_median().z >= -0.04 else 1
    snout = bm.verts.new((0, length * 0.54, -0.02))
    tail_b = bm.verts.new((0, -length * 0.52, 0.0))
    for j in range(n_th):
        jn = (j + 1) % n_th
        f1 = bm.faces.new((snout, rings[0][jn], rings[0][j]))
        f1.material_index = 0 if f1.calc_center_median().z >= -0.04 else 1
        f2 = bm.faces.new((tail_b, rings[-1][j], rings[-1][jn]))
        f2.material_index = 0

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj_body = bpy.data.objects.new("Shark_Body", mesh)
    scene.collection.objects.link(obj_body)
    obj_body.data.materials.append(mat_dorsal)
    obj_body.data.materials.append(mat_belly)
    for p in obj_body.data.polygons:
        p.use_smooth = True

    # Iconic swept dorsal fin
    bm_d = bmesh.new()
    d_pts = [(0, 0.55, 0.36), (0, -0.18, 0.30), (0, -0.45, 1.05), (0, 0.10, 0.88)]
    dl = [bm_d.verts.new((-0.035, p[1], p[2])) for p in d_pts]
    dr = [bm_d.verts.new((0.035, p[1], p[2])) for p in d_pts]
    bm_d.faces.new(dl)
    bm_d.faces.new(list(reversed(dr)))
    for i in range(4):
        inext = (i + 1) % 4
        bm_d.faces.new((dl[i], dl[inext], dr[inext], dr[i]))
    new_obj(scene, "Shark_DorsalFin", bm_d, mat_dorsal, smooth=True)

    # Wide pectoral fins
    bm_p = bmesh.new()
    for sx in (-1.0, 1.0):
        pts = [(sx * 0.34, 0.72, -0.16), (sx * 1.38, -0.10, -0.34), (sx * 0.96, -0.32, -0.26), (sx * 0.30, 0.12, -0.18)]
        pt = [bm_p.verts.new((p[0], p[1], p[2] + 0.025)) for p in pts]
        pb = [bm_p.verts.new((p[0], p[1], p[2] - 0.025)) for p in pts]
        bm_p.faces.new(pt if sx > 0 else list(reversed(pt)))
        bm_p.faces.new(list(reversed(pb)) if sx > 0 else pb)
        for i in range(4):
            inext = (i + 1) % 4
            bm_p.faces.new((pt[i], pt[inext], pb[inext], pb[i]))
    new_obj(scene, "Shark_PectoralFins", bm_p, mat_dorsal, smooth=True)

    # Heterocercal crescent tail fin (separately named so we can animate powerful tail sweep!)
    bm_t = bmesh.new()
    t_pts = [(0, 0.0, 0.14), (0, -0.92, 0.92), (0, -0.42, 0.04), (0, -0.70, -0.58), (0, 0.0, -0.12)]
    tl = [bm_t.verts.new((-0.028, p[1], p[2])) for p in t_pts]
    tr = [bm_t.verts.new((0.028, p[1], p[2])) for p in t_pts]
    bm_t.faces.new(tl)
    bm_t.faces.new(list(reversed(tr)))
    for i in range(len(t_pts)):
        inext = (i + 1) % len(t_pts)
        bm_t.faces.new((tl[i], tl[inext], tr[inext], tr[i]))
    tail_obj = new_obj(scene, "Shark_Tail", bm_t, mat_dorsal, smooth=True)
    tail_obj.location = Vector((0.0, -length * 0.48, 0.0))

    # Eyes
    bm_e = bmesh.new()
    for sx in (-1.0, 1.0):
        ret = bmesh.ops.create_uvsphere(bm_e, u_segments=8, v_segments=6, radius=0.045)
        bmesh.ops.translate(bm_e, verts=ret["verts"], vec=(sx * 0.25, 1.78, 0.06))
    new_obj(scene, "Shark_Eyes", bm_e, mat_eye, smooth=True)

    export_glb("shark.glb")

build_shark()

# ------------------------------------------------------------------
# 3. SUNKEN STEEL SHIPWRECK (Bow, collapsed deck, torn opening with exposed hull ribs, rust/corrosion)
# ------------------------------------------------------------------
def build_shipwreck():
    scene = reset_scene()
    mat_steel = make_mat("WreckSteel", (0.14, 0.16, 0.18), metallic=0.65, roughness=0.72)
    mat_rust = make_mat("WreckRust", (0.38, 0.16, 0.09), metallic=0.35, roughness=0.86)
    mat_deck = make_mat("WreckDeck", (0.18, 0.14, 0.11), metallic=0.20, roughness=0.88)
    mat_algae = make_mat("WreckAlgae", (0.14, 0.24, 0.18), metallic=0.05, roughness=0.92)

    # Outer hull shell (~22m long) with torn midship breach exposing interior ribs
    bm = bmesh.new()
    n_y = 22
    L = 22.0
    # Cross-section U-shape from starboard gunwale down around keel to port gunwale
    profile_pts = [
        (1.0, 1.0), (1.02, 0.55), (0.94, 0.12), (0.62, -0.45), (0.0, -0.68),
        (-0.62, -0.45), (-0.94, 0.12), (-1.02, 0.55), (-1.0, 1.0)
    ]
    rings = []
    for i in range(n_y + 1):
        t = i / n_y  # 0 bow (+11) -> 1 stern (-11)
        y = (0.5 - t) * L
        # Sharp raked bow, broad midship, tapered stern
        if t < 0.25:
            w = 3.2 * ((t / 0.25) ** 0.72)
            sheer = 1.2 * (1.0 - t / 0.25)
        elif t < 0.80:
            w = 3.2
            sheer = 0.0
        else:
            u = (t - 0.80) / 0.20
            w = 3.2 * (1.0 - 0.35 * u)
            sheer = 0.3 * u
        h = 2.8
        ring = [bm.verts.new((px * w, y, pz * h + sheer)) for px, pz in profile_pts]
        rings.append(ring)

    mesh = bpy.data.meshes.new("Wreck_Hull")
    random.seed(42)
    for i in range(n_y):
        t = i / n_y
        for j in range(len(profile_pts) - 1):
            # Create a dramatic torn breach on the mid-forward hull sides (t in 0.22..0.52, upper sides)
            is_breach = (0.22 <= t <= 0.52) and (j in (0, 1, 6, 7))
            if is_breach and (i + j) % 3 != 0:
                continue
            f = bm.faces.new((rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]))
            # Mix rust & oxidized steel plates
            f.material_index = 1 if random.random() < 0.45 else 0

    # Stern transom
    bm.faces.new(rings[-1])
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    hull_obj = bpy.data.objects.new("Wreck_Hull", mesh)
    scene.collection.objects.link(hull_obj)
    hull_obj.data.materials.append(mat_steel)
    hull_obj.data.materials.append(mat_rust)
    mod_sol = hull_obj.modifiers.new("Solidify", 'SOLIDIFY')
    mod_sol.thickness = 0.18
    bpy.context.view_layer.objects.active = hull_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")

    # Exposed curved steel hull ribs inside the breach & along the length!
    bm_ribs = bmesh.new()
    for i in range(2, n_y - 1):
        t = i / n_y
        y = (0.5 - t) * L
        w = 3.05 * ((t / 0.25) ** 0.72) if t < 0.25 else (3.05 if t < 0.80 else 3.05 * (1.0 - 0.35 * (t - 0.80) / 0.20))
        sheer = 1.15 * (1.0 - t / 0.25) if t < 0.25 else 0.0
        for j in range(len(profile_pts) - 1):
            p0 = Vector((profile_pts[j][0] * w, y, profile_pts[j][1] * 2.75 + sheer))
            p1 = Vector((profile_pts[j + 1][0] * w, y, profile_pts[j + 1][1] * 2.75 + sheer))
            mid = (p0 + p1) * 0.5
            seg_len = (p1 - p0).length
            ret = bmesh.ops.create_cube(bm_ribs, size=1.0)
            verts = ret["verts"]
            for v in verts:
                v.co.x *= 0.16
                v.co.y *= 0.18
                v.co.z *= seg_len
            d = (p1 - p0).normalized()
            rot = Vector((0, 0, 1)).rotation_difference(d).to_matrix()
            bmesh.ops.rotate(bm_ribs, verts=verts, cent=(0, 0, 0), matrix=rot)
            bmesh.ops.translate(bm_ribs, verts=verts, vec=mid)
    new_obj(scene, "Wreck_Ribs", bm_ribs, mat_rust, smooth=False)

    # Collapsed deck planks (tilted and broken)
    bm_deck = bmesh.new()
    for k, (yc, yl, zc, tilt) in enumerate([(5.5, 4.5, 2.35, -0.14), (-0.5, 5.0, 2.10, 0.18), (-6.5, 6.5, 2.55, -0.05)]):
        ret = bmesh.ops.create_cube(bm_deck, size=1.0)
        for v in ret["verts"]:
            v.co.x *= 5.6
            v.co.y *= yl
            v.co.z *= 0.22
        bmesh.ops.rotate(bm_deck, verts=ret["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(tilt, 3, 'Y'))
        bmesh.ops.translate(bm_deck, verts=ret["verts"], vec=(0.0, yc, zc))
    new_obj(scene, "Wreck_Deck", bm_deck, mat_deck, smooth=False)

    # Superstructure / wheelhouse & tilted smokestack funnel
    bm_sup = bmesh.new()
    # Main cabin block
    ret1 = bmesh.ops.create_cube(bm_sup, size=1.0)
    for v in ret1["verts"]:
        v.co.x *= 4.4
        v.co.y *= 5.6
        v.co.z *= 2.6
    bmesh.ops.translate(bm_sup, verts=ret1["verts"], vec=(0.0, -4.6, 3.8))
    # Bridge roof
    ret2 = bmesh.ops.create_cube(bm_sup, size=1.0)
    for v in ret2["verts"]:
        v.co.x *= 4.9
        v.co.y *= 3.4
        v.co.z *= 0.30
    bmesh.ops.rotate(bm_sup, verts=ret2["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(0.08, 3, 'X'))
    bmesh.ops.translate(bm_sup, verts=ret2["verts"], vec=(0.0, -3.5, 6.2))
    # Bridge corner pillars
    for px in (-2.0, 2.0):
        for py in (-2.2, -4.8):
            retp = bmesh.ops.create_cube(bm_sup, size=1.0)
            for v in retp["verts"]:
                v.co.x = px + v.co.x * 0.22
                v.co.y = py + v.co.y * 0.22
                v.co.z = 5.55 + v.co.z * 1.35
    # Tilted smokestack funnel
    retf = bmesh.ops.create_cone(bm_sup, cap_ends=True, segments=16, radius1=1.05, radius2=0.88, depth=3.8)
    bmesh.ops.rotate(bm_sup, verts=retf["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-14), 3, 'X'))
    bmesh.ops.translate(bm_sup, verts=retf["verts"], vec=(0.0, -6.4, 5.8))
    # Broken mast
    retm = bmesh.ops.create_cone(bm_sup, cap_ends=True, segments=10, radius1=0.16, radius2=0.09, depth=5.5)
    bmesh.ops.rotate(bm_sup, verts=retm["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(32), 3, 'Y'))
    bmesh.ops.translate(bm_sup, verts=retm["verts"], vec=(0.4, 3.8, 4.2))
    new_obj(scene, "Wreck_Superstructure", bm_sup, mat_rust, smooth=False)

    # Marine growth / barnacle patches on hull
    bm_ag = bmesh.new()
    for _ in range(18):
        ret = bmesh.ops.create_icosphere(bm_ag, subdivisions=1, radius=random.uniform(0.35, 0.85))
        side = random.choice([-1, 1])
        bmesh.ops.translate(bm_ag, verts=ret["verts"], vec=(side * random.uniform(2.2, 3.1), random.uniform(-8.0, 7.5), random.uniform(-0.8, 2.2)))
    new_obj(scene, "Wreck_MarineGrowth", bm_ag, mat_algae, smooth=True)

    export_glb("shipwreck.glb")

build_shipwreck()

# ------------------------------------------------------------------
# 4. FOUR OCEAN FLOOR MARINE LIFE ASSETS
# ------------------------------------------------------------------
# 4a. Olive-green seaweed with long ribbon-like fronds
def build_seaweed():
    scene = reset_scene()
    mat_sw = make_mat("SeaweedOlive", (0.24, 0.38, 0.18), metallic=0.02, roughness=0.68)
    bm = bmesh.new()
    random.seed(101)
    for b in range(7):
        ang = (b / 7.0) * 2 * math.pi + random.uniform(-0.2, 0.2)
        h = random.uniform(1.3, 2.3)
        w0 = random.uniform(0.08, 0.14)
        lean = random.uniform(0.15, 0.40)
        segs = 10
        prev_l = prev_r = None
        for i in range(segs + 1):
            t = i / segs
            z = t * h
            sway = math.sin(t * math.pi * 1.4 + b) * 0.18 * t + lean * (t ** 1.5)
            cx = math.cos(ang) * (0.06 + sway)
            cy = math.sin(ang) * (0.06 + sway)
            w = w0 * (1.0 - 0.82 * (t ** 1.4)) * (0.8 + 0.25 * math.sin(t * 9.0))
            px = -math.sin(ang) * w
            py = math.cos(ang) * w
            vl = bm.verts.new((cx - px, cy - py, z))
            vr = bm.verts.new((cx + px, cy + py, z))
            if prev_l is not None:
                bm.faces.new((prev_l, prev_r, vr, vl))
            prev_l, prev_r = vl, vr
    new_obj(scene, "Seaweed_Fronds", bm, mat_sw, smooth=True)
    export_glb("seaweed.glb")

build_seaweed()

# 4b. Dusky violet sea fan
def build_sea_fan():
    scene = reset_scene()
    mat_sf = make_mat("SeaFanViolet", (0.44, 0.26, 0.56), metallic=0.05, roughness=0.72)
    bm = bmesh.new()

    def add_branch(p0, p1, r0, r1):
        d = p1 - p0
        length = d.length
        if length < 1e-4:
            return
        ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r0, radius2=r1, depth=length)
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
        bmesh.ops.rotate(bm, verts=ret["verts"], cent=(0, 0, 0), matrix=rot)
        bmesh.ops.translate(bm, verts=ret["verts"], vec=(p0 + p1) * 0.5)

    def grow(p, direction, length, radius, depth):
        p_end = p + direction * length
        add_branch(p, p_end, radius, radius * 0.68)
        if depth <= 0:
            return
        for sign in (-1.0, 1.0):
            # Fan primarily in XZ plane with slight organic Y curve
            ang = sign * (0.38 + 0.08 * depth)
            nd = Vector((
                direction.x * math.cos(ang) - direction.z * math.sin(ang),
                direction.y + sign * 0.04,
                direction.x * math.sin(ang) + direction.z * math.cos(ang),
            )).normalized()
            grow(p_end, nd, length * 0.72, radius * 0.68, depth - 1)

    grow(Vector((0, 0, 0)), Vector((0, 0, 1)), 0.34, 0.042, 4)
    new_obj(scene, "SeaFan_Branches", bm, mat_sf, smooth=True)
    export_glb("sea_fan.glb")

build_sea_fan()

# 4c. Muted pink tube sponges
def build_tube_sponge():
    scene = reset_scene()
    mat_sp = make_mat("TubeSpongePink", (0.74, 0.42, 0.52), metallic=0.02, roughness=0.82)
    bm = bmesh.new()
    tubes = [
        (0.0, 0.0, 0.72, 0.11, 0.0, 0.0),
        (0.18, 0.08, 0.56, 0.09, 0.16, -0.10),
        (-0.16, 0.12, 0.48, 0.085, -0.18, -0.12),
        (0.06, -0.17, 0.62, 0.095, 0.08, 0.18),
        (-0.14, -0.12, 0.38, 0.075, -0.22, 0.16),
    ]
    segs = 14
    for tx, ty, h, r, tilt_x, tilt_y in tubes:
        n_rings = 7
        outer = []
        inner = []
        for i in range(n_rings + 1):
            t = i / n_rings
            z = t * h
            rad = r * (0.82 + 0.25 * math.sin(t * math.pi * 0.85))
            ox = tx + tilt_x * t * 0.55
            oy = ty + tilt_y * t * 0.55
            outer.append([bm.verts.new((ox + math.cos(k / segs * 2 * math.pi) * rad, oy + math.sin(k / segs * 2 * math.pi) * rad, z)) for k in range(segs)])
            inner.append([bm.verts.new((ox + math.cos(k / segs * 2 * math.pi) * rad * 0.64, oy + math.sin(k / segs * 2 * math.pi) * rad * 0.64, z)) for k in range(segs)])
        for i in range(n_rings):
            for k in range(segs):
                kn = (k + 1) % segs
                bm.faces.new((outer[i][k], outer[i][kn], outer[i + 1][kn], outer[i + 1][k]))
                bm.faces.new((inner[i][kn], inner[i][k], inner[i + 1][k], inner[i + 1][kn]))
        # Top lip connecting outer and inner
        for k in range(segs):
            kn = (k + 1) % segs
            bm.faces.new((outer[-1][k], outer[-1][kn], inner[-1][kn], inner[-1][k]))
    new_obj(scene, "TubeSponge_Cluster", bm, mat_sp, smooth=True)
    export_glb("tube_sponge.glb")

build_tube_sponge()

# 4d. Small pink anemone
def build_anemone():
    scene = reset_scene()
    mat_base = make_mat("AnemoneBase", (0.64, 0.28, 0.38), metallic=0.02, roughness=0.75)
    mat_tent = make_mat("AnemoneTentacle", (0.90, 0.52, 0.66), metallic=0.02, roughness=0.58, emission=(0.85, 0.35, 0.55), emission_strength=0.18)

    bm_b = bmesh.new()
    ret = bmesh.ops.create_cone(bm_b, cap_ends=True, segments=16, radius1=0.18, radius2=0.14, depth=0.16)
    bmesh.ops.translate(bm_b, verts=ret["verts"], vec=(0, 0, 0.08))
    new_obj(scene, "Anemone_Base", bm_b, mat_base, smooth=True)

    bm_t = bmesh.new()
    for ring_i, (n_t, r_off, tilt, length) in enumerate([(14, 0.11, 0.58, 0.24), (10, 0.06, 0.28, 0.22), (6, 0.02, 0.10, 0.18)]):
        for k in range(n_t):
            ang = (k / n_t) * 2 * math.pi + ring_i * 0.35
            ret_t = bmesh.ops.create_cone(bm_t, cap_ends=True, segments=6, radius1=0.018, radius2=0.005, depth=length)
            bmesh.ops.translate(bm_t, verts=ret_t["verts"], vec=(0, 0, length * 0.5))
            bmesh.ops.rotate(bm_t, verts=ret_t["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(tilt, 3, 'Y'))
            bmesh.ops.rotate(bm_t, verts=ret_t["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, 'Z'))
            bmesh.ops.translate(bm_t, verts=ret_t["verts"], vec=(math.cos(ang) * r_off, math.sin(ang) * r_off, 0.14))
    new_obj(scene, "Anemone_Tentacles", bm_t, mat_tent, smooth=True)
    export_glb("anemone.glb")

build_anemone()
print("All ocean marine life & shipwreck GLB models generated successfully!")
