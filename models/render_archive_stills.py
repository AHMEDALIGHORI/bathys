import bpy
import math
from mathutils import Vector

def setup_underwater_scene(bg_color=(0.012, 0.036, 0.072, 1.0)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    world = bpy.data.worlds.new("OceanWorld")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = bg_color
    bg.inputs["Strength"].default_value = 0.85

    def add_light(name, loc, energy, color, ltype='AREA', size=8.0, rot=(0, 0, 0)):
        ld = bpy.data.lights.new(name=name, type=ltype)
        ld.energy = energy
        ld.color = color
        if ltype == 'AREA':
            ld.size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = rot
        scene.collection.objects.link(lo)

    add_light("BeamKey", (-5, -8, 4), 1200, (0.72, 0.88, 1.0), 'AREA', 8.0, (math.radians(65), 0, math.radians(-30)))
    add_light("RimBlue", (6, 8, 6), 600, (0.30, 0.65, 1.0), 'AREA', 10.0, (math.radians(55), 0, math.radians(145)))

    cam_d = bpy.data.cameras.new("Cam")
    cam_d.lens = 38
    cam_o = bpy.data.objects.new("Cam", cam_d)
    scene.collection.objects.link(cam_o)
    scene.camera = cam_o

    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.image_settings.file_format = 'PNG'
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        try:
            scene.render.engine = 'BLENDER_EEVEE'
        except TypeError:
            scene.render.engine = 'CYCLES'
            scene.cycles.samples = 16
    return scene, cam_o

def aim(cam_o, loc, target):
    cam_o.location = Vector(loc)
    cam_o.rotation_euler = (Vector(target) - cam_o.location).to_track_quat('-Z', 'Y').to_euler()

# 1. Render Marine Life still (fish schools, shark, seaweed, sea fans, tube sponges, anemones)
scene, cam = setup_underwater_scene()
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -1.2))
floor = bpy.context.active_object
m_fl = bpy.data.materials.new("Sand")
m_fl.use_nodes = True
bsdf = next(n for n in m_fl.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (0.04, 0.08, 0.13, 1.0)
bsdf.inputs["Roughness"].default_value = 0.92
floor.data.materials.append(m_fl)

assets = [
    (r"E:\Bathys\models\seaweed.glb", (-2.2, 1.2, -1.2), (0, 0, 0.4), 1.2),
    (r"E:\Bathys\models\seaweed.glb", (2.4, 2.0, -1.2), (0, 0, -0.5), 1.3),
    (r"E:\Bathys\models\sea_fan.glb", (-1.1, 0.6, -1.2), (0.1, 0, 0.3), 1.4),
    (r"E:\Bathys\models\sea_fan.glb", (1.6, 0.8, -1.2), (-0.1, 0, -0.4), 1.3),
    (r"E:\Bathys\models\tube_sponge.glb", (-0.2, 0.2, -1.2), (0, 0, 0.2), 1.5),
    (r"E:\Bathys\models\tube_sponge.glb", (1.1, -0.4, -1.2), (0, 0, 1.4), 1.2),
    (r"E:\Bathys\models\anemone.glb", (0.5, -0.8, -1.2), (0, 0, 0.0), 1.4),
    (r"E:\Bathys\models\anemone.glb", (-1.3, -0.6, -1.2), (0, 0, 0.8), 1.3),
    (r"E:\Bathys\models\fish_silver_blue.glb", (-1.2, 0.0, 0.8), (0, 0, -0.8), 1.4),
    (r"E:\Bathys\models\fish_muted_gold.glb", (0.6, 0.4, 0.4), (0, 0, -1.1), 1.5),
    (r"E:\Bathys\models\fish_copper_red.glb", (1.5, -0.2, 1.0), (0, 0, -0.7), 1.3),
    (r"E:\Bathys\models\shark.glb", (-1.0, 7.5, 2.8), (0, 0, -1.2), 1.1),
]
for path, loc, rot, sc in assets:
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new_objs = set(bpy.context.scene.objects) - before
    roots = [o for o in new_objs if o.parent is None]
    for r in roots:
        r.location = loc
        r.rotation_euler = rot
        r.scale = (sc, sc, sc)

aim(cam, (-0.4, -5.8, 0.8), (0.1, 1.0, 0.1))
scene.render.filepath = r"E:\Bathys\web\public\images\archive_marine.png"
bpy.ops.render.render(write_still=True)

# 2. Render Sunken Shipwreck still
scene, cam = setup_underwater_scene((0.010, 0.028, 0.058, 1.0))
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -1.8))
floor = bpy.context.active_object
m_fl = bpy.data.materials.new("Sand2")
m_fl.use_nodes = True
bsdf = next(n for n in m_fl.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (0.04, 0.07, 0.11, 1.0)
bsdf.inputs["Roughness"].default_value = 0.94
floor.data.materials.append(m_fl)

bpy.ops.import_scene.gltf(filepath=r"E:\Bathys\models\shipwreck.glb")
for o in bpy.context.scene.objects:
    if o != floor and o.type == 'MESH' and o.parent is None:
        o.rotation_euler = (0.12, -0.22, 0.45)

# Dramatic headlight spot illuminating the exposed ribs
ld = bpy.data.lights.new("SubBeam", 'SPOT')
ld.energy = 8500
ld.color = (0.85, 0.94, 1.0)
ld.spot_size = math.radians(52)
ld.spot_blend = 0.45
lo = bpy.data.objects.new("SubBeam", ld)
lo.location = Vector((-14, -14, 5))
lo.rotation_euler = (Vector((0, 0, 1.2)) - lo.location).to_track_quat('-Z', 'Y').to_euler()
scene.collection.objects.link(lo)

aim(cam, (-15.5, -16.5, 4.8), (0.0, 0.0, 1.8))
scene.render.filepath = r"E:\Bathys\web\public\images\archive_wreck.png"
bpy.ops.render.render(write_still=True)
print("Rendered clean archive_marine.png and archive_wreck.png!")
