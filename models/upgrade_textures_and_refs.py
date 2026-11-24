import bpy
import math
import os
import random
import shutil
from mathutils import Vector

MODELS_DIR = r"E:\Bathys\models"
WEB_MODELS_DIR = r"E:\Bathys\web\public\models"
REFS_DIR = r"E:\Bathys\references"
os.makedirs(REFS_DIR, exist_ok=True)

def make_pixel_texture(name, width, height, pixel_fn):
    img = bpy.data.images.new(name=name, width=width, height=height, alpha=False)
    pixels = [0.0] * (width * height * 4)
    for y in range(height):
        for x in range(width):
            r, g, b = pixel_fn(x / width, y / height, x, y)
            idx = (y * width + x) * 4
            pixels[idx] = max(0.0, min(1.0, r))
            pixels[idx + 1] = max(0.0, min(1.0, g))
            pixels[idx + 2] = max(0.0, min(1.0, b))
            pixels[idx + 3] = 1.0
    img.pixels.foreach_set(pixels)
    img.pack()
    return img

def box_uv_project(obj):
    if obj.type != 'MESH' or not obj.data.polygons:
        return
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                uv_layer[li].uv = (v.x * 0.45, v.y * 0.45)
            elif ax >= ay:
                uv_layer[li].uv = (v.y * 0.45, v.z * 0.45)
            else:
                uv_layer[li].uv = (v.x * 0.45, v.z * 0.45)

def attach_image_to_mat(mat, img, rough_img=None):
    if not mat or not mat.use_nodes:
        return
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if rough_img is not None:
        rtex = nt.nodes.new("ShaderNodeTexImage")
        rtex.image = rough_img
        rtex.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])

# ------------------------------------------------------------------
# 1. UPGRADE BATHYS.GLB WITH EMBEDDED BRUSHED TITANIUM + CARBON TEXTURES
# ------------------------------------------------------------------
bpy.ops.wm.open_mainfile(filepath=os.path.join(MODELS_DIR, "bathys.blend"))

# Brushed satin carbon-titanium hull texture (256x256 packed)
random.seed(7)
streak_row = [random.uniform(-0.035, 0.035) for _ in range(256)]
img_titanium = make_pixel_texture(
    "Tex_BrushedTitanium", 256, 256,
    lambda u, v, x, y: (
        0.27 + streak_row[y] + 0.015 * math.sin(u * 38.0 + y * 0.1),
        0.30 + streak_row[y] + 0.015 * math.sin(u * 38.0 + y * 0.1),
        0.34 + streak_row[y] + 0.018 * math.sin(u * 38.0 + y * 0.1),
    )
)
img_titanium_rough = make_pixel_texture(
    "Tex_BrushedTitanium_Rough", 256, 256,
    lambda u, v, x, y: (
        0.20 + abs(streak_row[y]) * 2.2,
        0.20 + abs(streak_row[y]) * 2.2,
        0.20 + abs(streak_row[y]) * 2.2,
    )
)
# Carbon fiber weave for dashboard
img_carbon = make_pixel_texture(
    "Tex_CarbonWeave", 128, 128,
    lambda u, v, x, y: (
        0.045 + (0.03 if ((x // 4 + y // 4) % 2 == 0) else 0.0),
        0.050 + (0.03 if ((x // 4 + y // 4) % 2 == 0) else 0.0),
        0.060 + (0.03 if ((x // 4 + y // 4) % 2 == 0) else 0.0),
    )
)
# Tan leather grain
img_leather = make_pixel_texture(
    "Tex_TanLeather", 128, 128,
    lambda u, v, x, y: (
        0.50 + 0.04 * math.sin(x * 0.7) * math.cos(y * 0.7),
        0.27 + 0.025 * math.sin(x * 0.7) * math.cos(y * 0.7),
        0.13 + 0.015 * math.sin(x * 0.7) * math.cos(y * 0.7),
    )
)

for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        box_uv_project(obj)

attach_image_to_mat(bpy.data.materials.get("Mat_CarbonTitanium"), img_titanium, img_titanium_rough)
attach_image_to_mat(bpy.data.materials.get("Mat_CarbonDash"), img_carbon)
attach_image_to_mat(bpy.data.materials.get("Mat_TanLeather"), img_leather)

# Export upgraded bathys.glb (only mesh objects, skip studio lights/camera)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH' and not obj.name.startswith("Temp_"):
        obj.select_set(True)

bathys_glb = os.path.join(MODELS_DIR, "bathys.glb")
bpy.ops.export_scene.gltf(
    filepath=bathys_glb,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
)
shutil.copy2(bathys_glb, os.path.join(WEB_MODELS_DIR, "bathys.glb"))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MODELS_DIR, "bathys.blend"))
print(f"Upgraded bathys.glb with embedded textures ({os.path.getsize(bathys_glb)} bytes)")

# ------------------------------------------------------------------
# 2. UPGRADE SHIPWRECK.GLB WITH EMBEDDED RUST & CORROSION TEXTURE
# ------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS_DIR, "shipwreck.glb"))
img_rust = make_pixel_texture(
    "Tex_RustSteel", 256, 256,
    lambda u, v, x, y: (
        0.20 + 0.24 * (0.5 + 0.5 * math.sin(u * 18 + math.cos(v * 14) * 2.2)),
        0.12 + 0.09 * (0.5 + 0.5 * math.sin(u * 18 + math.cos(v * 14) * 2.2)),
        0.09 + 0.05 * (0.5 + 0.5 * math.cos(u * 12 - v * 16)),
    )
)
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH':
        box_uv_project(obj)
for mat in bpy.data.materials:
    if "Rust" in mat.name or "Steel" in mat.name:
        attach_image_to_mat(mat, img_rust)

wreck_glb = os.path.join(MODELS_DIR, "shipwreck.glb")
bpy.ops.export_scene.gltf(filepath=wreck_glb, export_format='GLB', export_yup=True, export_apply=True, export_materials='EXPORT')
shutil.copy2(wreck_glb, os.path.join(WEB_MODELS_DIR, "shipwreck.glb"))
print(f"Upgraded shipwreck.glb with embedded rust texture ({os.path.getsize(wreck_glb)} bytes)")

# ------------------------------------------------------------------
# 3. RENDER CLEAN REFERENCE PNGs FOR ALL 9 MARINE LIFE & SHIPWRECK ASSETS
# ------------------------------------------------------------------
def render_asset_ref(glb_name, ref_name, cam_loc, target=(0, 0, 0), lens=44, transparent=True):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS_DIR, glb_name))

    world = bpy.data.worlds.new("RefWorld")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.04, 0.08, 0.14, 1.0)
    bg.inputs["Strength"].default_value = 1.1

    for lname, loc, energy, col in [
        ("Key", (cam_loc[0] * 1.2 + 2.0, cam_loc[1] * 1.2 - 2.0, abs(cam_loc[2]) + 4.0), 650, (0.95, 0.98, 1.0)),
        ("Fill", (-cam_loc[0] - 2.0, -cam_loc[1] + 2.0, 2.5), 320, (0.65, 0.82, 1.0)),
    ]:
        ld = bpy.data.lights.new(lname, 'AREA')
        ld.energy = energy
        ld.color = col
        ld.size = 5.0
        lo = bpy.data.objects.new(lname, ld)
        lo.location = loc
        lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo)

    cam_d = bpy.data.cameras.new("RefCam")
    cam_d.lens = lens
    cam_o = bpy.data.objects.new("RefCam", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o
    cam_o.location = Vector(cam_loc)
    cam_o.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat('-Z', 'Y').to_euler()

    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    scene.render.film_transparent = transparent
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        try:
            scene.render.engine = 'BLENDER_EEVEE'
        except TypeError:
            scene.render.engine = 'CYCLES'
            scene.cycles.samples = 16

    out = os.path.join(REFS_DIR, ref_name)
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f"Rendered reference: {out}")

render_asset_ref("fish_silver_blue.glb", "fish_silver_blue_ref.png", (-1.15, 0.45, 0.25), (0, -0.05, 0))
render_asset_ref("fish_muted_gold.glb", "fish_muted_gold_ref.png", (-1.05, 0.40, 0.22), (0, -0.05, 0))
render_asset_ref("fish_copper_red.glb", "fish_copper_red_ref.png", (-1.10, 0.42, 0.22), (0, -0.05, 0))
render_asset_ref("shark.glb", "shark_ref.png", (-5.6, 2.4, 1.4), (0, -0.2, 0.1))
render_asset_ref("shipwreck.glb", "shipwreck_ref.png", (-24.0, 14.0, 9.5), (0, 0, 1.8), transparent=False)
render_asset_ref("seaweed.glb", "seaweed_ref.png", (-2.6, 1.8, 1.5), (0, 0, 1.0))
render_asset_ref("sea_fan.glb", "sea_fan_ref.png", (-1.4, 1.8, 1.0), (0, 0, 0.75))
render_asset_ref("tube_sponge.glb", "tube_sponge_ref.png", (-1.1, 1.0, 0.65), (0, 0, 0.35))
render_asset_ref("anemone.glb", "anemone_ref.png", (-0.65, 0.55, 0.42), (0, 0, 0.16))
print("All 9 asset reference PNGs + textured GLBs completed!")
