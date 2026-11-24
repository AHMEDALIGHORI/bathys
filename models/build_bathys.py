import bpy
import bmesh
import math
import os
import shutil
from mathutils import Vector, Matrix, Euler

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def make_pbr_mat(name, base_color, metallic=0.0, roughness=0.5, emission=None, emission_strength=0.0, alpha=1.0, ior=1.45, clearcoat=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = ior
    if "Alpha" in bsdf.inputs and alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "blend_method"):
            mat.blend_method = 'BLEND'
    if "Coat Weight" in bsdf.inputs and clearcoat > 0.0:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
    elif "Clearcoat" in bsdf.inputs and clearcoat > 0.0:
        bsdf.inputs["Clearcoat"].default_value = clearcoat
    if emission is not None and emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emission, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat

# Materials matching BATHYS design_reference.png
mat_hull = make_pbr_mat("Mat_CarbonTitanium", (0.28, 0.31, 0.35), metallic=0.90, roughness=0.22, clearcoat=0.45)
mat_hull_dark = make_pbr_mat("Mat_DarkTitanium", (0.08, 0.09, 0.11), metallic=0.84, roughness=0.30)
mat_gold = make_pbr_mat("Mat_ChampagneGold", (0.82, 0.66, 0.36), metallic=0.94, roughness=0.20)
mat_chrome = make_pbr_mat("Mat_BrushedSteel", (0.76, 0.80, 0.84), metallic=0.96, roughness=0.16)
mat_glass = make_pbr_mat("Mat_AcrylicGlass", (0.62, 0.78, 0.88), metallic=0.04, roughness=0.05, alpha=0.24, ior=1.49)
mat_leather = make_pbr_mat("Mat_TanLeather", (0.52, 0.28, 0.13), metallic=0.02, roughness=0.48)
mat_dash = make_pbr_mat("Mat_CarbonDash", (0.045, 0.05, 0.06), metallic=0.38, roughness=0.38)
mat_headlamp = make_pbr_mat("Mat_HeadlampLED", (0.95, 0.98, 1.0), metallic=0.05, roughness=0.08, emission=(0.92, 0.97, 1.0), emission_strength=14.0)
mat_amber_glow = make_pbr_mat("Mat_AmberGlow", (0.95, 0.65, 0.25), metallic=0.1, roughness=0.25, emission=(1.0, 0.62, 0.20), emission_strength=3.5)
mat_cyan_glow = make_pbr_mat("Mat_CyanGlow", (0.30, 0.82, 0.95), metallic=0.1, roughness=0.2, emission=(0.25, 0.80, 0.98), emission_strength=3.2)
mat_red_nav = make_pbr_mat("Mat_RedNav", (0.9, 0.15, 0.12), metallic=0.1, roughness=0.2, emission=(1.0, 0.15, 0.10), emission_strength=4.5)
mat_needle = make_pbr_mat("Mat_GaugeNeedle", (0.98, 0.76, 0.35), metallic=0.3, roughness=0.2, emission=(1.0, 0.72, 0.28), emission_strength=5.0)

def link_obj(obj, mat=None, smooth=True):
    scene.collection.objects.link(obj)
    if mat is not None:
        if obj.data.materials:
            obj.data.materials[0] = mat
        else:
            obj.data.materials.append(mat)
    if smooth and obj.type == 'MESH':
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj

def new_mesh_obj(name, bm, mat=None, smooth=True):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    return link_obj(obj, mat, smooth)

# Shared exact parametric hull surface so Hull and Viewport_Glass meet with 0mm seamless precision!
def hull_point(t, ang):
    """t in [0, 1] from nose (+2.38) to stern (-2.55), ang in [0, 2*pi] around Y axis."""
    y = 2.38 - t * 4.93
    if t < 0.44:
        u = t / 0.44
        rx = 1.38 * (math.sin(u * math.pi * 0.5) ** 0.60)
    else:
        u = (t - 0.44) / 0.56
        rx = 1.38 * (math.cos(u * math.pi * 0.5) ** 1.12) + 0.06 * (1.0 - u)
    rx = max(rx, 0.03)

    if t < 0.40:
        u = t / 0.40
        rz_top = 0.72 * (math.sin(u * math.pi * 0.5) ** 0.56)
        rz_bot = 0.54 * (math.sin(u * math.pi * 0.5) ** 0.64)
    else:
        u = (t - 0.40) / 0.60
        rz_top = 0.72 * (math.cos(u * math.pi * 0.5) ** 1.12) + 0.04 * (1.0 - u)
        rz_bot = 0.54 * (math.cos(u * math.pi * 0.5) ** 1.22) + 0.03 * (1.0 - u)

    z_center = 0.06 * math.sin(t * math.pi) - 0.03 * t
    ca = math.cos(ang)
    sa = math.sin(ang)
    sign_x = 1.0 if ca >= 0 else -1.0
    px = sign_x * (abs(ca) ** 0.84) * rx
    if sa >= 0:
        pz = z_center + (abs(sa) ** 0.88) * rz_top
    else:
        pz = z_center - (abs(sa) ** 0.74) * rz_bot

    # Subtle sleek dorsal taper near stern
    if t > 0.58 and sa > 0.65:
        pz += 0.06 * ((t - 0.58) / 0.42) * ((sa - 0.65) / 0.35) * (1.0 - t)

    return Vector((px, y, pz))

# Smooth seam curve: t_seam(ang) sweeps slightly back at the top-center and forward on the chin!
def seam_t(ang):
    sa = math.sin(ang)
    # Top of viewport sweeps further back (t=0.27), chin stays tighter forward (t=0.16)
    return 0.215 + 0.055 * sa

# 1. MAIN HULL (From seam_t(ang) to stern t=1.0 — razor-clean elliptical collar!)
def build_hull():
    bm = bmesh.new()
    n_y = 36
    n_theta = 48
    rings = []
    for i in range(n_y + 1):
        frac = i / n_y
        ring = []
        for j in range(n_theta):
            ang = (j / n_theta) * 2.0 * math.pi
            t0 = seam_t(ang)
            t = t0 + frac * (1.0 - t0)
            ring.append(bm.verts.new(hull_point(t, ang)))
        rings.append(ring)

    for i in range(n_y):
        r0, r1 = rings[i], rings[i + 1]
        for j in range(n_theta):
            jn = (j + 1) % n_theta
            bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))

    # Cap stern cleanly
    stern_c = bm.verts.new((0.0, -2.60, -0.02))
    for j in range(n_theta):
        jn = (j + 1) % n_theta
        bm.faces.new((stern_c, rings[-1][j], rings[-1][jn]))

    # Inner dark hull liner ring around the front seam so there is clean wall thickness
    inner_ring = []
    for j in range(n_theta):
        ang = (j / n_theta) * 2.0 * math.pi
        p = hull_point(seam_t(ang), ang)
        inner_ring.append(bm.verts.new(Vector((p.x * 0.92, p.y - 0.04, p.z * 0.90))))
    for j in range(n_theta):
        jn = (j + 1) % n_theta
        bm.faces.new((rings[0][jn], rings[0][j], inner_ring[j], inner_ring[jn]))

    obj = new_mesh_obj("Hull", bm, mat_hull, smooth=True)
    mod_sub = obj.modifiers.new("Subsurf", 'SUBSURF')
    mod_sub.levels = 1
    mod_sub.render_levels = 1
    return obj

# 2. PANORAMIC VIEWPORT GLASS (Exact nose continuation from t=0 to seam_t(ang)!)
def build_viewport_glass():
    bm = bmesh.new()
    n_y = 18
    n_theta = 48
    rings = []
    for i in range(1, n_y + 1):
        frac = i / n_y
        ring = []
        for j in range(n_theta):
            ang = (j / n_theta) * 2.0 * math.pi
            t = frac * (seam_t(ang) + 0.004)
            ring.append(bm.verts.new(hull_point(t, ang)))
        rings.append(ring)

    nose_c = bm.verts.new(hull_point(0.0, 0.0))
    for j in range(n_theta):
        jn = (j + 1) % n_theta
        bm.faces.new((nose_c, rings[0][jn], rings[0][j]))
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for j in range(n_theta):
            jn = (j + 1) % n_theta
            bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))

    return new_mesh_obj("Viewport_Glass", bm, mat_glass, smooth=True)

# 3. VIEWPORT FRAME, MULLIONS & GOLD TRIM (Sits flush along the exact parametric seam!)
def add_tube_along(bm, pts, radius=0.028, segs=10, closed=False):
    rings = []
    n = len(pts)
    for idx, p in enumerate(pts):
        p_prev = pts[(idx - 1) % n] if closed else pts[max(0, idx - 1)]
        p_next = pts[(idx + 1) % n] if closed else pts[min(n - 1, idx + 1)]
        tang = (p_next - p_prev)
        if tang.length < 1e-6:
            tang = Vector((1, 0, 0))
        tang.normalize()
        up = Vector((0, 0, 1)) if abs(tang.z) < 0.9 else Vector((1, 0, 0))
        side = tang.cross(up).normalized()
        up2 = side.cross(tang).normalized()
        ring = [bm.verts.new(p + (side * math.cos(k / segs * 2 * math.pi) + up2 * math.sin(k / segs * 2 * math.pi)) * radius) for k in range(segs)]
        rings.append(ring)
    count = n if closed else n - 1
    for i in range(count):
        inext = (i + 1) % n
        for k in range(segs):
            kn = (k + 1) % segs
            bm.faces.new((rings[i][k], rings[i][kn], rings[inext][kn], rings[inext][k]))

def build_viewport_frame():
    bm = bmesh.new()
    # Flush outer collar bezel right along seam_t(ang)
    n_theta = 48
    bezel_pts = [hull_point(seam_t((j / n_theta) * 2 * math.pi), (j / n_theta) * 2 * math.pi) for j in range(n_theta)]
    add_tube_along(bm, bezel_pts, radius=0.036, segs=12, closed=True)

    # Two sleek side structural ribs curving forward from top to chin (keeping center pilot view wide open!)
    for side_sign in (-1.0, 1.0):
        rib_pts = []
        for i in range(19):
            frac = i / 18.0
            # Sweep from upper side (ang ~ 65 deg or 115 deg) down to lower side
            ang = (math.radians(52) if side_sign > 0 else math.radians(128)) * (1.0 - frac) + \
                  (math.radians(-58) if side_sign > 0 else math.radians(238)) * frac
            # Curve forward smoothly near center
            t = seam_t(ang) * (0.42 + 0.58 * abs(2.0 * frac - 1.0) ** 1.4)
            p = hull_point(t, ang) * 1.008
            rib_pts.append(p)
        add_tube_along(bm, rib_pts, radius=0.020, segs=10, closed=False)

    new_mesh_obj("Viewport_Frame", bm, mat_hull_dark, smooth=True)

    # Subtle champagne-gold lower chin trim
    bm_g = bmesh.new()
    gold_pts = []
    for i in range(21):
        ang = math.radians(-130 + (i / 20.0) * 80)
        p = hull_point(seam_t(ang) * 0.72, ang) * 1.01
        gold_pts.append(p)
    add_tube_along(bm_g, gold_pts, radius=0.014, segs=8, closed=False)
    new_mesh_obj("Viewport_Gold_Trim", bm_g, mat_gold, smooth=True)

# 4. TOP OBSERVATION CUPOLA DOME (with arched structural ribs) & SENSOR ANTENNAE
def build_top_cupola():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=16, radius=0.44)
    to_del = [v for v in bm.verts if v.co.z < -0.02]
    bmesh.ops.delete(bm, geom=to_del, context='VERTS')
    for v in bm.verts:
        v.co.y *= 1.14
        v.co.z *= 0.86
        v.co += Vector((0.0, 0.08, 0.62))
    new_mesh_obj("Top_Cupola_Glass", bm, mat_glass, smooth=True)

    # Collar + arched cupola ribs matching design_reference.png
    bm_f = bmesh.new()
    segs = 36
    collar_pts = [Vector((math.cos(i / segs * 2 * math.pi) * 0.45, 0.08 + math.sin(i / segs * 2 * math.pi) * 0.51, 0.63)) for i in range(segs)]
    add_tube_along(bm_f, collar_pts, radius=0.036, segs=10, closed=True)
    for arch_ang in (0.0, math.pi * 0.5, math.pi * 0.25, -math.pi * 0.25):
        arch_pts = []
        for i in range(17):
            phi = (i / 16.0) * math.pi
            r = 0.45 * math.cos(phi)
            z = 0.62 + 0.39 * math.sin(phi)
            x = r * math.cos(arch_ang)
            y = 0.08 + r * 1.14 * math.sin(arch_ang)
            arch_pts.append(Vector((x, y, z)))
        add_tube_along(bm_f, arch_pts, radius=0.016, segs=8, closed=False)
    new_mesh_obj("Top_Cupola_Frame", bm_f, mat_hull_dark, smooth=True)

    for name, sx in [("Sensor_Antenna_L", -0.25), ("Sensor_Antenna_R", 0.25)]:
        bm_a = bmesh.new()
        bmesh.ops.create_cone(bm_a, cap_ends=True, segments=12, radius1=0.024, radius2=0.017, depth=0.42)
        bmesh.ops.translate(bm_a, verts=bm_a.verts, vec=(sx, -0.58, 0.78))
        ret = bmesh.ops.create_uvsphere(bm_a, u_segments=16, v_segments=12, radius=0.082)
        bmesh.ops.translate(bm_a, verts=ret["verts"], vec=(sx, -0.58, 1.02))
        new_mesh_obj(name, bm_a, mat_hull_dark, smooth=True)

# 5. THRUSTERS, PROPELLERS, HEADLAMPS, TAIL FINS & VENTRAL SKIDS
def build_propeller(name, center, radius=0.22, n_blades=5):
    bm = bmesh.new()
    ret_hub = bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=radius * 0.28, radius2=radius * 0.16, depth=radius * 0.55)
    bmesh.ops.rotate(bm, verts=ret_hub["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi * 0.5, 3, 'X'))
    for i in range(n_blades):
        ang = (i / n_blades) * 2.0 * math.pi
        ret_b = bmesh.ops.create_cube(bm, size=1.0)
        verts = ret_b["verts"]
        for v in verts:
            v.co.x *= radius * 0.26
            v.co.y *= radius * 0.055
            v.co.z = (v.co.z + 0.5) * (radius * 0.84) + radius * 0.12
        bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(0.45, 3, 'Z'))
        bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, 'Y'))
    obj = new_mesh_obj(name, bm, mat_chrome, smooth=True)
    obj.location = center
    return obj

def build_thrusters_and_headlamps():
    for side, sx in [("L", -1.40), ("R", 1.40)]:
        bm = bmesh.new()
        segs = 32
        r_in, r_out = 0.25, 0.34
        y_f, y_b = 0.82, -0.05
        profile = [
            (y_f, r_in + 0.02),
            (y_f + 0.04, r_in + 0.055),
            (y_f - 0.15, r_out),
            (y_b + 0.18, r_out * 0.96),
            (y_b, r_in + 0.03),
            (y_b + 0.06, r_in),
            (y_f - 0.06, r_in),
        ]
        rings = [[bm.verts.new((sx + math.cos(k / segs * 2 * math.pi) * pr, py, -0.06 + math.sin(k / segs * 2 * math.pi) * pr)) for k in range(segs)] for py, pr in profile]
        for i in range(len(rings)):
            inext = (i + 1) % len(rings)
            for k in range(segs):
                kn = (k + 1) % segs
                bm.faces.new((rings[i][k], rings[i][kn], rings[inext][kn], rings[inext][k]))
        ret_py = bmesh.ops.create_cube(bm, size=1.0)
        for v in ret_py["verts"]:
            v.co.x = sx * 0.78 + v.co.x * 0.45
            v.co.y = 0.38 + v.co.y * 0.44
            v.co.z = -0.06 + v.co.z * 0.15
        new_mesh_obj(f"Thruster_Pod_F{side}", bm, mat_hull, smooth=True)
        build_propeller(f"Propeller_F{side}", Vector((sx, 0.56, -0.06)), radius=0.22, n_blades=5)

        bm_hl = bmesh.new()
        ret_hl = bmesh.ops.create_uvsphere(bm_hl, u_segments=14, v_segments=10, radius=0.062)
        for v in ret_hl["verts"]:
            v.co.y *= 0.45
            v.co += Vector((sx + (0.29 if sx > 0 else -0.29), 0.82, -0.04))
        new_mesh_obj(f"Headlamp_F{side}", bm_hl, mat_headlamp, smooth=True)

    for side, sx in [("L", -0.88), ("R", 0.88)]:
        bm_hl2 = bmesh.new()
        ret = bmesh.ops.create_uvsphere(bm_hl2, u_segments=12, v_segments=8, radius=0.048)
        for v in ret["verts"]:
            v.co.y *= 0.45
            v.co += Vector((sx, 1.50, -0.20))
        new_mesh_obj(f"Headlamp_Nose_{side}", bm_hl2, mat_headlamp, smooth=True)

    for side, sx in [("L", -1.26), ("R", 1.26)]:
        bm = bmesh.new()
        segs = 32
        r_in, r_out = 0.34, 0.45
        y_f, y_b = -0.62, -1.55
        profile = [
            (y_f, r_in + 0.03),
            (y_f - 0.18, r_out),
            (y_b + 0.20, r_out * 0.95),
            (y_b, r_in + 0.02),
            (y_b + 0.06, r_in),
            (y_f - 0.06, r_in),
        ]
        rings = [[bm.verts.new((sx + math.cos(k / segs * 2 * math.pi) * pr, py, -0.02 + math.sin(k / segs * 2 * math.pi) * pr)) for k in range(segs)] for py, pr in profile]
        for i in range(len(rings)):
            inext = (i + 1) % len(rings)
            for k in range(segs):
                kn = (k + 1) % segs
                bm.faces.new((rings[i][k], rings[i][kn], rings[inext][kn], rings[inext][k]))
        ret_py = bmesh.ops.create_cube(bm, size=1.0)
        for v in ret_py["verts"]:
            v.co.x = sx * 0.65 + v.co.x * 0.55
            v.co.y = -1.08 + v.co.y * 0.55
            v.co.z = -0.02 + v.co.z * 0.16
        new_mesh_obj(f"Thruster_Rear_{side}", bm, mat_hull, smooth=True)

        bm_g = bmesh.new()
        r_g = r_out + 0.015
        g_rings = [[bm_g.verts.new((sx + math.cos(k / segs * 2 * math.pi) * pr, py, -0.02 + math.sin(k / segs * 2 * math.pi) * pr)) for k in range(segs)]
                   for py, pr in [(-0.74, r_g - 0.02), (-0.82, r_g + 0.015), (-0.98, r_g + 0.015), (-1.06, r_g - 0.02)]]
        for i in range(len(g_rings)):
            inext = (i + 1) % len(g_rings)
            for k in range(segs):
                kn = (k + 1) % segs
                bm_g.faces.new((g_rings[i][k], g_rings[i][kn], g_rings[inext][kn], g_rings[inext][k]))
        new_mesh_obj(f"Thruster_GoldRing_{side}", bm_g, mat_gold, smooth=True)
        build_propeller(f"Propeller_R{side}", Vector((sx, -1.12, -0.02)), radius=0.30, n_blades=5)

    for side, sx in [("L", -1.0), ("R", 1.0)]:
        bm_fin = bmesh.new()
        pts = [(sx * 0.25, -1.75, 0.02), (sx * 0.25, -2.42, 0.00), (sx * 1.18, -2.35, -0.03), (sx * 1.05, -1.96, -0.02)]
        top_v = [bm_fin.verts.new((x, y, z + 0.030)) for x, y, z in pts]
        bot_v = [bm_fin.verts.new((x, y, z - 0.030)) for x, y, z in pts]
        bm_fin.faces.new(top_v if sx > 0 else list(reversed(top_v)))
        bm_fin.faces.new(list(reversed(bot_v)) if sx > 0 else bot_v)
        for i in range(4):
            inext = (i + 1) % 4
            bm_fin.faces.new((top_v[i], top_v[inext], bot_v[inext], bot_v[i]))
        new_mesh_obj(f"Tail_Fin_{side}", bm_fin, mat_hull, smooth=True)

    bm_nav = bmesh.new()
    ret = bmesh.ops.create_uvsphere(bm_nav, u_segments=12, v_segments=8, radius=0.042)
    bmesh.ops.translate(bm_nav, verts=ret["verts"], vec=(0.0, -2.58, 0.02))
    new_mesh_obj("Stern_NavLight", bm_nav, mat_red_nav, smooth=True)

    bm_skid = bmesh.new()
    for sx in (-0.50, 0.50):
        ret = bmesh.ops.create_cube(bm_skid, size=1.0)
        for v in ret["verts"]:
            v.co.x = sx + v.co.x * 0.08
            v.co.y = -0.10 + v.co.y * 2.30
            v.co.z = -0.57 + v.co.z * 0.07
    new_mesh_obj("Ventral_Keel_Skids", bm_skid, mat_hull_dark, smooth=True)

# 6. COCKPIT INTERIOR (Refined luxury console, leather bolsters, functional speed needle, compass dial, clickable headlamp switch)
def build_cockpit_interior():
    bm_dash = bmesh.new()
    n_seg = 24
    for i in range(n_seg):
        a0 = -0.92 + (i / n_seg) * 1.84
        a1 = -0.92 + ((i + 1) / n_seg) * 1.84
        r_in, r_out, y_off = 0.72, 1.00, 0.70
        z_bot, z_top = -0.34, -0.10
        v0 = bm_dash.verts.new((math.sin(a0) * r_in, y_off + math.cos(a0) * r_in * 0.85, z_bot))
        v1 = bm_dash.verts.new((math.sin(a1) * r_in, y_off + math.cos(a1) * r_in * 0.85, z_bot))
        v2 = bm_dash.verts.new((math.sin(a1) * r_out, y_off + math.cos(a1) * r_out * 0.85, z_top))
        v3 = bm_dash.verts.new((math.sin(a0) * r_out, y_off + math.cos(a0) * r_out * 0.85, z_top))
        bm_dash.faces.new((v0, v1, v2, v3))
        v4 = bm_dash.verts.new((math.sin(a1) * (r_out + 0.14), y_off + math.cos(a1) * (r_out + 0.14) * 0.85, z_top - 0.04))
        v5 = bm_dash.verts.new((math.sin(a0) * (r_out + 0.14), y_off + math.cos(a0) * (r_out + 0.14) * 0.85, z_top - 0.04))
        bm_dash.faces.new((v3, v2, v4, v5))
    ret_fl = bmesh.ops.create_cube(bm_dash, size=1.0)
    for v in ret_fl["verts"]:
        v.co.x *= 1.50
        v.co.y = 0.55 + v.co.y * 1.55
        v.co.z = -0.39 + v.co.z * 0.06
    new_mesh_obj("Cockpit_Dashboard", bm_dash, mat_dash, smooth=True)

    bm_seat = bmesh.new()
    ret = bmesh.ops.create_cube(bm_seat, size=1.0)
    for v in ret["verts"]:
        v.co.x *= 0.50
        v.co.y = 0.35 + v.co.y * 0.50
        v.co.z = -0.22 + v.co.z * 0.14
    ret2 = bmesh.ops.create_cube(bm_seat, size=1.0)
    for v in ret2["verts"]:
        v.co.x *= 0.46
        v.co.y = 0.08 + v.co.y * 0.14
        v.co.z = 0.16 + v.co.z * 0.68
    for sx in (-0.54, 0.54):
        ret3 = bmesh.ops.create_cube(bm_seat, size=1.0)
        for v in ret3["verts"]:
            v.co.x = sx + v.co.x * 0.30
            v.co.y = 1.24 + v.co.y * 0.22
            v.co.z = -0.09 + v.co.z * 0.08
    new_mesh_obj("Cockpit_Leather_Interior", bm_seat, mat_leather, smooth=True)

    bm_sticks = bmesh.new()
    for sx in (-0.28, 0.28):
        ret_s = bmesh.ops.create_cone(bm_sticks, cap_ends=True, segments=12, radius1=0.025, radius2=0.018, depth=0.22)
        bmesh.ops.translate(bm_sticks, verts=ret_s["verts"], vec=(sx, 0.92, -0.14))
    new_mesh_obj("Cockpit_Control_Sticks", bm_sticks, mat_hull_dark, smooth=True)

    bm_bez = bmesh.new()
    for bx, by in [(-0.24, 1.42), (0.0, 1.47), (0.24, 1.42)]:
        ret_c = bmesh.ops.create_cone(bm_bez, cap_ends=True, segments=20, radius1=0.076, radius2=0.070, depth=0.024)
        bmesh.ops.rotate(bm_bez, verts=ret_c["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(52), 3, 'X'))
        bmesh.ops.translate(bm_bez, verts=ret_c["verts"], vec=(bx, by, -0.15))
    new_mesh_obj("Cockpit_Instrument_Bezels", bm_bez, mat_gold, smooth=True)

    bm_spd = bmesh.new()
    ret_n = bmesh.ops.create_cube(bm_spd, size=1.0)
    for v in ret_n["verts"]:
        v.co.x *= 0.008
        v.co.y = (v.co.y + 0.45) * 0.055
        v.co.z *= 0.006
    obj_spd = new_mesh_obj("Cockpit_SpeedNeedle", bm_spd, mat_needle, smooth=False)
    obj_spd.location = Vector((-0.24, 1.405, -0.14))
    obj_spd.rotation_euler = Euler((math.radians(52), 0.0, 0.0), 'XYZ')

    bm_cmp = bmesh.new()
    bmesh.ops.create_cone(bm_cmp, cap_ends=True, segments=16, radius1=0.056, radius2=0.056, depth=0.01)
    ret_np = bmesh.ops.create_cube(bm_cmp, size=1.0)
    for v in ret_np["verts"]:
        v.co.x *= 0.012
        v.co.y = 0.024 + v.co.y * 0.040
        v.co.z = 0.008 + v.co.z * 0.008
    obj_cmp = new_mesh_obj("Cockpit_CompassDial", bm_cmp, mat_cyan_glow, smooth=False)
    obj_cmp.location = Vector((0.0, 1.455, -0.14))
    obj_cmp.rotation_euler = Euler((math.radians(52), 0.0, 0.0), 'XYZ')

    bm_sw = bmesh.new()
    ret_sw = bmesh.ops.create_cube(bm_sw, size=1.0)
    for v in ret_sw["verts"]:
        v.co.x *= 0.055
        v.co.y *= 0.032
        v.co.z *= 0.028
    obj_sw = new_mesh_obj("Cockpit_HeadlampSwitch", bm_sw, mat_amber_glow, smooth=False)
    obj_sw.location = Vector((0.24, 1.405, -0.135))
    obj_sw.rotation_euler = Euler((math.radians(52), 0.0, 0.0), 'XYZ')

    bm_strip = bmesh.new()
    for sx in (-0.42, -0.36, 0.36, 0.42):
        ret_st = bmesh.ops.create_cube(bm_strip, size=1.0)
        for v in ret_st["verts"]:
            v.co.x = sx + v.co.x * 0.024
            v.co.y = 1.36 + v.co.y * 0.014
            v.co.z = -0.14 + v.co.z * 0.014
    new_mesh_obj("Cockpit_Amber_Switches", bm_strip, mat_amber_glow, smooth=False)

build_hull()
build_viewport_glass()
build_viewport_frame()
build_top_cupola()
build_thrusters_and_headlamps()
build_cockpit_interior()

# Apply modifiers before export
bpy.ops.object.select_all(action='SELECT')
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH' and obj.modifiers:
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)

os.makedirs(r"E:\Bathys\models", exist_ok=True)
os.makedirs(r"E:\Bathys\references", exist_ok=True)
os.makedirs(r"E:\Bathys\web\public\models", exist_ok=True)

glb_path = r"E:\Bathys\models\bathys.glb"
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
)
shutil.copy2(glb_path, r"E:\Bathys\web\public\models\bathys.glb")
bpy.ops.wm.save_as_mainfile(filepath=r"E:\Bathys\models\bathys.blend")
print(f"Exported {glb_path} ({os.path.getsize(glb_path)} bytes)")

# Setup clean studio lighting & render ALL 5 TRUE-TRANSPARENT PNG reference views + 3/4 turntable preview!
world = bpy.data.worlds.new("StudioWorld")
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.04, 0.06, 0.10, 1.0)
bg.inputs["Strength"].default_value = 1.2

def add_light(name, loc, rot, energy, color, ltype='AREA', size=5.0):
    ld = bpy.data.lights.new(name=name, type=ltype)
    ld.energy = energy
    ld.color = color
    if ltype == 'AREA':
        ld.size = size
    lo = bpy.data.objects.new(name, ld)
    lo.location = loc
    lo.rotation_euler = rot
    scene.collection.objects.link(lo)

add_light("KeyTop", (3.2, 4.2, 4.5), (math.radians(48), 0, math.radians(142)), 750, (0.94, 0.97, 1.0), 'AREA', 5.0)
add_light("FillLeft", (-4.5, 2.0, 2.5), (math.radians(60), 0, math.radians(-115)), 480, (0.78, 0.88, 1.0), 'AREA', 5.0)
add_light("RimBack", (0.0, -5.0, 2.8), (math.radians(65), 0, 0), 420, (0.75, 0.88, 1.0), 'AREA', 5.0)
add_light("WarmCockpit", (0.0, 1.15, 0.25), (0, 0, 0), 22, (1.0, 0.68, 0.30), 'POINT', 0.3)

cam_data = bpy.data.cameras.new("RefCam")
cam_obj = bpy.data.objects.new("RefCam", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj

scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
try:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError:
    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 16

def render_view(filepath, loc, target, ortho=True, ortho_scale=6.2, lens=35, res=(1024, 640)):
    scene.render.resolution_x, scene.render.resolution_y = res
    cam_data.type = 'ORTHO' if ortho else 'PERSP'
    cam_data.ortho_scale = ortho_scale
    cam_data.lens = lens
    cam_obj.location = Vector(loc)
    direction = Vector(target) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)

# 1. Left side (nose +Y pointing LEFT -> camera at -X looking toward +X)
render_view(r"E:\Bathys\references\bathys_left.png", (-7.0, -0.1, 0.15), (0.0, -0.1, 0.15), ortho=True, ortho_scale=6.2)
# 2. Right side (nose +Y pointing RIGHT -> camera at +X looking toward -X)
render_view(r"E:\Bathys\references\bathys_right.png", (7.0, -0.1, 0.15), (0.0, -0.1, 0.15), ortho=True, ortho_scale=6.2)
# 3. Front (straight-on centered on viewport -> camera at +Y looking toward -Y)
render_view(r"E:\Bathys\references\bathys_front.png", (0.0, 7.0, 0.15), (0.0, 0.0, 0.15), ortho=True, ortho_scale=6.2)
# 4. Rear (straight-on from behind -> camera at -Y looking toward +Y)
render_view(r"E:\Bathys\references\bathys_rear.png", (0.0, -7.0, 0.15), (0.0, 0.0, 0.15), ortho=True, ortho_scale=6.2)

# 5. Cockpit interior: seated pilot eye level looking forward (+Y), dark blue ocean visible ONLY through viewport!
bm_ocean = bmesh.new()
bmesh.ops.create_grid(bm_ocean, x_segments=4, y_segments=4, size=2.4)
bmesh.ops.rotate(bm_ocean, verts=bm_ocean.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi * 0.5, 3, 'X'))
bmesh.ops.translate(bm_ocean, verts=bm_ocean.verts, vec=(0.0, 3.8, 0.1))
mat_ocean_bg = make_pbr_mat("Mat_OceanBackdrop", (0.015, 0.055, 0.12), roughness=0.9, emission=(0.015, 0.065, 0.14), emission_strength=0.9)
ocean_plane = new_mesh_obj("Temp_OceanBackdrop", bm_ocean, mat_ocean_bg, smooth=False)
render_view(r"E:\Bathys\references\bathys_cockpit.png", (0.0, 0.52, 0.18), (0.0, 2.5, 0.04), ortho=False, lens=22, res=(1024, 640))
bpy.data.objects.remove(ocean_plane, do_unlink=True)

# 6. Turntable 3/4 preview (dark ocean background)
scene.render.film_transparent = False
bg.inputs["Color"].default_value = (0.012, 0.024, 0.048, 1.0)
render_view(r"E:\Bathys\models\bathys_preview.png", (-4.1, 4.3, 2.0), (0.0, -0.05, 0.05), ortho=False, lens=44, res=(960, 540))
print("All 5 transparent reference PNGs + turntable preview rendered successfully!")
