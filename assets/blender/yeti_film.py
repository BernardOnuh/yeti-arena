# Yeti Arena's film-quality hero render, for Blender 4.x (Cycles).
#
# Builds an original creature from scratch: a massive, hunched, knuckle-walking Yeti with an organic sculpted body
# (metaballs, remeshed and smoothed), long silky frost-tipped fur (particle hair: guide strands plus interpolated
# children, Principled Hair BSDF), a heart-shaped grey-blue face with eyes that track the camera, a broad nose and an
# asymmetric grin with small gapped teeth; set in a frozen valley with translucent ice formations, snow-capped rocks,
# distant peaks and haze. Renders a 16:9 hero and a 1:1 mascot.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P yeti_film.py -- <out_dir> [preview|final]
import bpy, bmesh, math, os, random, sys, time
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "renders")
MODE = argv[1] if len(argv) > 1 else "final"
PREVIEW = MODE in ("preview", "face")
os.makedirs(OUT, exist_ok=True)
random.seed(7)
T0 = time.time()
def stage(name): print(f"[{time.time() - T0:6.1f}s] {name}", flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


# ---------------------------------------------------------------- helpers
def link(obj):
    col.objects.link(obj); return obj


def set_in(node, names, value):
    """Sets the first input that exists (input names differ a little between Blender versions)."""
    for n in names if isinstance(names, (list, tuple)) else [names]:
        if n in node.inputs:
            node.inputs[n].default_value = value; return True
    return False


def principled(name, color, rough=0.5, sss=0.0, sss_radius=(1.0, 0.5, 0.3), transmission=0.0, ior=1.45, coat=0.0, emission=None, bump=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes["Principled BSDF"]
    set_in(p, "Base Color", (*color, 1)); set_in(p, "Roughness", rough); set_in(p, "IOR", ior)
    if sss:
        set_in(p, ["Subsurface Weight", "Subsurface"], sss); set_in(p, "Subsurface Radius", sss_radius); set_in(p, "Subsurface Scale", 0.05)
    if transmission: set_in(p, ["Transmission Weight", "Transmission"], transmission)
    if coat: set_in(p, ["Coat Weight", "Clearcoat"], coat)
    if emission: set_in(p, ["Emission Color", "Emission"], (*emission[0], 1)); set_in(p, "Emission Strength", emission[1])
    if bump:  # fine surface detail: pores, sparkle, cracks
        tex = nt.nodes.new("ShaderNodeTexNoise"); set_in(tex, "Scale", bump[0]); set_in(tex, "Detail", 8)
        b = nt.nodes.new("ShaderNodeBump"); set_in(b, "Strength", bump[1]); set_in(b, "Distance", 0.02)
        nt.links.new(tex.outputs["Fac"], b.inputs["Height"]); nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    return m


def mesh_from_bmesh(name, bm, mat=None, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for poly in me.polygons: poly.use_smooth = smooth
    obj = link(bpy.data.objects.new(name, me))
    if mat: obj.data.materials.append(mat)
    return obj


def ellipsoid(name, center, radii, mat, rot=(0, 0, 0), segs=48, deform=None, parent=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=1.0)
    for v in bm.verts:
        co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if deform: co = deform(co)
        v.co = co
    obj = mesh_from_bmesh(name, bm, mat)
    obj.location = center; obj.rotation_euler = Euler(rot)
    if parent: obj.parent = parent
    return obj


def apply_mod(obj, mtype, **kw):
    bpy.context.view_layer.objects.active = obj
    m = obj.modifiers.new(mtype.lower(), mtype)
    for k, v in kw.items(): setattr(m, k, v)
    bpy.ops.object.modifier_apply(modifier=m.name)


def sculpt_from_metaballs(name, parts, resolution):
    """parts: ("ball"|"ellipsoid"|"capsule", ...) -> one organic, smoothed mesh."""
    mb = bpy.data.metaballs.new(name); mb.resolution = resolution; mb.render_resolution = resolution; mb.threshold = 0.6
    obj = link(bpy.data.objects.new(name, mb))
    for p in parts:
        e = mb.elements.new(); e.stiffness = 2.0
        if p[0] == "ball": e.type = "BALL"; e.co = p[1]; e.radius = p[2]
        elif p[0] == "ellipsoid":
            e.type = "ELLIPSOID"; e.co = p[1]; e.radius = p[2]; e.size_x, e.size_y, e.size_z = p[3]
            if len(p) > 4: e.rotation = Euler(p[4]).to_quaternion()
        else:  # capsule from a to b
            a, b = Vector(p[1]), Vector(p[2]); d = b - a
            e.type = "CAPSULE"; e.co = (a + b) / 2; e.radius = p[3]; e.size_x = d.length / 2
            e.rotation = Vector((1, 0, 0)).rotation_difference(d)
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active; obj.name = name
    apply_mod(obj, "REMESH", mode="VOXEL", voxel_size=resolution * 0.6)
    apply_mod(obj, "SMOOTH", factor=0.8, iterations=12)
    for poly in obj.data.polygons: poly.use_smooth = True
    return obj


# ---------------------------------------------------------------- materials
SKIN = principled("Skin", (0.15, 0.22, 0.32), rough=0.52, sss=0.35, sss_radius=(0.9, 0.6, 0.45), bump=(220, 0.12))
SKIN_DARK = principled("SkinDark", (0.07, 0.1, 0.15), rough=0.38, sss=0.2, bump=(300, 0.08))
UNDERCOAT = principled("Undercoat", (0.52, 0.58, 0.66), rough=0.8)  # the body under the fur: soft grey, so gaps look deep
NAIL = principled("Nail", (0.72, 0.72, 0.68), rough=0.3, coat=0.3)
TEETH = principled("Teeth", (0.93, 0.89, 0.8), rough=0.22, sss=0.1, coat=0.2)
MOUTH = principled("Mouth", (0.09, 0.03, 0.05), rough=0.5, sss=0.2, sss_radius=(1, 0.2, 0.2))
TONGUE = principled("Tongue", (0.42, 0.1, 0.14), rough=0.35, sss=0.4, sss_radius=(1, 0.3, 0.3))
CORNEA = principled("Cornea", (1, 1, 1), rough=0.0, transmission=1.0, ior=1.376)


def fur_material():
    m = bpy.data.materials.new("Fur"); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    hair = nt.nodes.new("ShaderNodeBsdfHairPrincipled")
    try: hair.parametrization = "MELANIN"
    except Exception: pass
    set_in(hair, "Melanin", 0.015); set_in(hair, "Melanin Redness", 0.05)
    set_in(hair, "Roughness", 0.22); set_in(hair, "Radial Roughness", 0.32); set_in(hair, "Coat", 0.12)
    set_in(hair, "Random Roughness", 0.12); set_in(hair, "Random Color", 0.06); set_in(hair, "IOR", 1.55)
    # frost tips: white at the root, icy blue toward the ends (our Yeti's signature)
    info = nt.nodes.new("ShaderNodeHairInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.9, 0.95, 1.0, 1)
    ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = (0.6, 0.82, 1.0, 1)
    mid = ramp.color_ramp.elements.new(0.62); mid.color = (0.97, 0.99, 1.0, 1)
    nt.links.new(info.outputs["Intercept"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], hair.inputs["Tint"])
    nt.links.new(hair.outputs[0], out.inputs["Surface"])
    return m


FUR = fur_material()


def eye_material():
    """Procedural eye in the eye object's own space: -Y looks out (the eye tracks the camera along -Y)."""
    m = bpy.data.materials.new("Eye"); m.use_nodes = True; nt = m.node_tree
    p = nt.nodes["Principled BSDF"]; set_in(p, "Roughness", 0.15); set_in(p, ["Subsurface Weight", "Subsurface"], 0.15)
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); comb = nt.nodes.new("ShaderNodeCombineXYZ")
    length = nt.nodes.new("ShaderNodeVectorMath"); length.operation = "LENGTH"
    div = nt.nodes.new("ShaderNodeMath"); div.operation = "DIVIDE"; div.inputs[1].default_value = 0.082
    streak = nt.nodes.new("ShaderNodeTexNoise"); set_in(streak, "Scale", 60); set_in(streak, "Detail", 4)
    add = nt.nodes.new("ShaderNodeMath"); add.operation = "MULTIPLY_ADD"; add.inputs[1].default_value = 0.06
    ramp = nt.nodes.new("ShaderNodeValToRGB"); cr = ramp.color_ramp; cr.interpolation = "EASE"
    stops = [(0.0, (0.005, 0.005, 0.01)), (0.3, (0.01, 0.012, 0.02)), (0.33, (0.03, 0.16, 0.42)), (0.5, (0.12, 0.45, 0.85)),
             (0.6, (0.06, 0.25, 0.55)), (0.66, (0.02, 0.06, 0.14)), (0.71, (0.9, 0.88, 0.85)), (1.0, (0.85, 0.82, 0.8))]
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, c in stops[1:-1]: e = cr.elements.new(pos); e.color = (*c, 1)
    L = nt.links.new
    L(tc.outputs["Object"], sep.inputs[0]); L(sep.outputs["X"], comb.inputs["X"]); L(sep.outputs["Z"], comb.inputs["Z"])
    L(comb.outputs[0], length.inputs[0]); L(length.outputs["Value"], div.inputs[0])
    L(streak.outputs["Fac"], add.inputs[0]); L(div.outputs[0], add.inputs[2]); L(add.outputs[0], ramp.inputs["Fac"])
    L(ramp.outputs["Color"], p.inputs["Base Color"])
    return m


EYE = eye_material()

# ---------------------------------------------------------------- the creature
# Faces -Y. About 2.1 m tall when hunched, about 2.7 m across the shoulders: wider than it is tall.
HEAD = Vector((0.0, -0.6, 1.62))
body_parts = [
    ("ellipsoid", (0, 0.05, 1.2), 1.0, (1.12, 0.82, 0.78), (-0.35, 0, 0)),     # chest and torso, tipped forward
    ("ball", (0, 0.4, 1.55), 0.82),                                            # the big rounded back
    ("ellipsoid", (0, 0.4, 0.72), 1.0, (0.86, 0.72, 0.52)),                    # hips and belly
    ("ellipsoid", (-0.98, -0.15, 1.5), 1.0, (0.62, 0.55, 0.52)),              # shoulders
    ("ellipsoid", (0.98, -0.15, 1.5), 1.0, (0.62, 0.55, 0.52)),
    ("ellipsoid", tuple(HEAD), 1.0, (0.56, 0.5, 0.56)),                       # the head, sunk into the shoulders
]
for s in (-1, 1):
    body_parts += [
        ("capsule", (s * 1.08, -0.2, 1.42), (s * 1.3, -0.62, 0.86), 0.36),     # upper arm
        ("capsule", (s * 1.3, -0.62, 0.86), (s * 1.18, -1.02, 0.24), 0.43),    # enormous forearm
        ("ellipsoid", (s * 1.16, -1.1, 0.14), 1.0, (0.34, 0.33, 0.17)),        # broad hand on the ground
        ("capsule", (s * 0.58, 0.42, 0.58), (s * 0.66, 0.24, 0.2), 0.34),      # short sturdy leg
        ("ellipsoid", (s * 0.66, 0.06, 0.1), 1.0, (0.32, 0.44, 0.12)),         # wide heavy foot
    ]
body = sculpt_from_metaballs("YetiBody", body_parts, 0.045 if PREVIEW else 0.03)
body.data.materials.append(UNDERCOAT); body.data.materials.append(FUR)

# the face rig: the head turns a little toward the camera
face_rig = link(bpy.data.objects.new("FaceRig", None)); face_rig.location = HEAD + Vector((0, 0.065, -0.13)); face_rig.rotation_euler = Euler((0.12, 0, -0.32))


def grin(co):  # bend the mouth into a lopsided smile: corners rise, the right corner higher
    co.z += 2.6 * co.x * co.x + 0.12 * co.x
    return co


face = ellipsoid("Face", (0, -0.34, -0.04), (0.34, 0.13, 0.31), SKIN, parent=face_rig,
                 deform=lambda c: Vector((c.x * (1.06 - 0.32 * max(0, -c.z / 0.31) ** 1.3), c.y - 0.04 * (c.x / 0.34) ** 2, c.z)))  # heart-shaped: narrower at the chin
cutter = ellipsoid("GrinCutter", (0.015, -0.5, -0.17), (0.17, 0.12, 0.034), None, parent=face_rig, deform=grin)
bool_mod = face.modifiers.new("grin", "BOOLEAN"); bool_mod.operation = "DIFFERENCE"; bool_mod.object = cutter
try: bool_mod.solver = "EXACT"
except Exception: pass
bpy.context.view_layer.objects.active = face; bpy.ops.object.modifier_apply(modifier=bool_mod.name)
cutter.hide_render = True; cutter.hide_viewport = True
ellipsoid("MouthCavity", (0.015, -0.44, -0.17), (0.16, 0.08, 0.05), MOUTH, parent=face_rig, deform=grin)
ellipsoid("Tongue", (0.03, -0.47, -0.2), (0.07, 0.05, 0.022), TONGUE, parent=face_rig)
for i, x in enumerate((-0.075, -0.028, 0.022, 0.07)):  # small rounded teeth along the top of the grin, with gaps
    t = ellipsoid(f"Tooth{i}", (x, -0.505, -0.143 + 2.6 * x * x + 0.12 * x), (0.019, 0.016, 0.017 + (0.003 if i in (1, 2) else 0)), TEETH, parent=face_rig, segs=24)
ellipsoid("Nose", (0, -0.535, -0.04), (0.085, 0.055, 0.048), SKIN_DARK, parent=face_rig)
for s in (-1, 1):
    ellipsoid(f"Nostril{s}", (s * 0.03, -0.585, -0.055), (0.016, 0.01, 0.009), SKIN_DARK, parent=face_rig, segs=16)

# eyes that look down the lens, with a clear cornea and heavy upper lids (confident, a little sly)
camera_data = bpy.data.cameras.new("Camera"); camera = link(bpy.data.objects.new("Camera", camera_data))
eyes = []
for s in (-1, 1):
    pivot = link(bpy.data.objects.new(f"EyePivot{s}", None)); pivot.parent = face_rig; pivot.location = (s * 0.135, -0.43, 0.075)
    eye = ellipsoid(f"Eye{s}", (0, 0, 0), (0.082, 0.082, 0.082), EYE, parent=pivot, segs=48)
    cornea = ellipsoid(f"Cornea{s}", (0, 0, 0), (0.086, 0.086, 0.086), CORNEA, parent=eye, segs=48)
    cornea.visible_shadow = False
    c = eye.constraints.new("TRACK_TO"); c.target = camera; c.track_axis = "TRACK_NEGATIVE_Y"; c.up_axis = "UP_Z"
    lid = ellipsoid(f"Lid{s}", (0, 0, 0), (0.09, 0.09, 0.09), SKIN, parent=pivot, segs=48,
                    deform=lambda c: c if c.z > 0.058 else Vector((c.x, c.y, 0.058)))
    lid.rotation_euler = Euler((-0.12, 0, 0))  # covers the top of the eye
    low = ellipsoid(f"LowerLid{s}", (0, 0, 0), (0.088, 0.088, 0.088), SKIN, parent=pivot, segs=48,
                    deform=lambda c: c if c.z < -0.062 else Vector((c.x, c.y, -0.062)))
    eyes.append(eye)

# fingers and toes: short, rounded, bare grey-blue with subtle nails
for s in (-1, 1):
    hand, foot = Vector((s * 1.16, -1.1, 0.1)), Vector((s * 0.66, 0.06, 0.07))
    parts = []
    for k, ox in enumerate((-0.17, -0.06, 0.05, 0.16)):
        a = hand + Vector((ox * s, -0.12, 0.02)); b = hand + Vector((ox * s * 1.12, -0.34, -0.03))
        parts.append(("capsule", tuple(a), tuple(b), 0.088))
    parts.append(("capsule", tuple(hand + Vector((-s * 0.27, -0.1, 0.02))), tuple(hand + Vector((-s * 0.33, -0.24, -0.03))), 0.07))  # thumb
    for ox in (-0.18, -0.06, 0.06, 0.18):
        parts.append(("capsule", tuple(foot + Vector((ox, -0.3, 0.01))), tuple(foot + Vector((ox * 1.05, -0.48, -0.02))), 0.09))
    digits = sculpt_from_metaballs(f"Digits{s}", parts, 0.03 if PREVIEW else 0.018); digits.data.materials.append(SKIN)
    for ox in (-0.17, -0.06, 0.05, 0.16):
        tip = hand + Vector((ox * s * 1.12, -0.42, 0.01))
        ellipsoid(f"Nail{s}{ox}", tuple(tip), (0.04, 0.03, 0.014), NAIL, rot=(0.25, 0, 0), segs=20)
    for ox in (-0.18, -0.06, 0.06, 0.18):
        ellipsoid(f"ToeNail{s}{ox}", tuple(foot + Vector((ox * 1.05, -0.57, 0.0))), (0.042, 0.03, 0.014), NAIL, rot=(0.2, 0, 0), segs=20)

stage("creature built")
# ---------------------------------------------------------------- fur
bpy.context.view_layer.update()
face_inv = face.matrix_world.inverted()
dens, length = body.vertex_groups.new(name="density"), body.vertex_groups.new(name="length")
head_w = face_rig.matrix_world
for v in body.data.vertices:
    w = body.matrix_world @ v.co
    # no fur on the face: distance inside the (scaled) face shape, eased out to full fur around it
    f = face_inv @ w; fl = math.sqrt((f.x / 0.36) ** 2 + (f.y / 0.2) ** 2 + (f.z / 0.33) ** 2)
    d = min(1.0, max(0.0, (fl - 0.98) / 0.3))
    if w.z < 0.06: d *= 0.2                        # palms and soles touch the ground
    dens.add([v.index], d, "REPLACE")
    # long fur on the cheeks, chin, crown, shoulders and forearms; short on hands and feet
    hd = (w - HEAD).length
    L = 0.55
    if hd < 0.75: L = 0.95 if fl < 1.9 else 0.8                        # cascading cheek and chin fur, and the swept crown
    elif w.z > 1.35: L = 0.85                                           # shoulders and back
    elif abs(w.x) > 0.95 and w.z > 0.3: L = 0.9                         # forearms
    if w.z < 0.3: L = 0.3                                               # hands and feet
    if fl < 1.45 and f.z > -0.1: L = min(L, 0.22 + 0.4 * max(0.0, fl - 1.0))  # short around the eyes and brow, so it frames the face instead of covering it
    length.add([v.index], L, "REPLACE")

bpy.context.view_layer.objects.active = body
body.modifiers.new("fur", "PARTICLE_SYSTEM")
psys = body.particle_systems[-1]; ps = psys.settings
ps.type = "HAIR"; ps.use_advanced_hair = True; ps.emit_from = "FACE"; ps.use_even_distribution = True
ps.count = 6000 if PREVIEW else 32000
ps.hair_length = 0.3; ps.hair_step = 6
ps.normal_factor = 0.2
ps.object_align_factor = (0.0, 0.13, -0.18)   # sweep back and drape down: windswept and cascading
ps.factor_random = 0.03
ps.material = 2  # Fur
ps.child_type = "INTERPOLATED"; ps.child_percent = 6; ps.rendered_child_count = 10 if PREVIEW else 42
ps.child_length = 0.85; ps.child_length_threshold = 0.25
ps.clump_factor = 0.65; ps.clump_shape = 0.3; ps.use_hair_bspline = True
ps.roughness_1 = 0.012; ps.roughness_1_size = 1.0; ps.roughness_endpoint = 0.03; ps.roughness_2 = 0.02; ps.roughness_2_size = 0.6
ps.kink = "WAVE"; ps.kink_amplitude = 0.008; ps.kink_frequency = 1.6
ps.root_radius = 1.0; ps.tip_radius = 0.0; ps.radius_scale = 0.0032
psys.vertex_group_density = "density"; psys.vertex_group_length = "length"

# fur growing from the rim of the face, spilling over its edges so the face blends into the head
face.data.materials.append(FUR)
rim = face.vertex_groups.new(name="rim"); rim_len = face.vertex_groups.new(name="rim_len")
for v in face.data.vertices:
    c = v.co - Vector((0, -0.34, -0.04))
    e = math.sqrt((c.x / 0.34) ** 2 + (c.z / 0.31) ** 2)                 # 0 at the middle of the face, 1 at its edge
    w = min(1.0, max(0.0, (e - 0.72) / 0.2))
    if c.z < -0.12 and abs(c.x) < 0.2: w *= 0.35                       # lighter on the chin, so the grin stays clear
    top = max(0.0, c.z / 0.31)                                          # 0 at the middle, 1 at the top of the face
    rim.add([v.index], w, "REPLACE"); rim_len.add([v.index], (0.4 + 0.6 * w) * (1 - 0.75 * top), "REPLACE")  # short above the eyes
bpy.context.view_layer.objects.active = face
face.modifiers.new("rim fur", "PARTICLE_SYSTEM")
fps = face.particle_systems[-1]; fs = fps.settings
fs.type = "HAIR"; fs.use_advanced_hair = True; fs.emit_from = "FACE"; fs.use_even_distribution = True
fs.count = 1500 if PREVIEW else 6000; fs.hair_length = 0.16; fs.hair_step = 5
fs.normal_factor = 0.14; fs.object_align_factor = (0.0, 0.1, -0.03); fs.factor_random = 0.04
fs.material = 2
fs.child_type = "INTERPOLATED"; fs.child_percent = 6; fs.rendered_child_count = 10 if PREVIEW else 30
fs.clump_factor = 0.5; fs.roughness_endpoint = 0.02; fs.roughness_2 = 0.01; fs.use_hair_bspline = True
fs.root_radius = 1.0; fs.tip_radius = 0.0; fs.radius_scale = 0.0025
fps.vertex_group_density = "rim"; fps.vertex_group_length = "rim_len"
stage("fur set up")
# ---------------------------------------------------------------- the frozen valley
SNOW = principled("Snow", (0.86, 0.91, 0.97), rough=0.5, sss=0.45, sss_radius=(0.8, 0.9, 1.2), bump=(80, 0.25))
ROCK = bpy.data.materials.new("SnowRock"); ROCK.use_nodes = True
nt = ROCK.node_tree; p = nt.nodes["Principled BSDF"]; set_in(p, "Roughness", 0.7)
geo = nt.nodes.new("ShaderNodeNewGeometry"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); rr = nt.nodes.new("ShaderNodeValToRGB")
rr.color_ramp.elements[0].position = 0.35; rr.color_ramp.elements[0].color = (0.11, 0.13, 0.16, 1)
rr.color_ramp.elements[1].position = 0.6; rr.color_ramp.elements[1].color = (0.88, 0.92, 0.97, 1)
nt.links.new(geo.outputs["Normal"], sep.inputs[0]); nt.links.new(sep.outputs["Z"], rr.inputs["Fac"]); nt.links.new(rr.outputs["Color"], p.inputs["Base Color"])
ICE = principled("Ice", (0.62, 0.84, 1.0), rough=0.03, transmission=1.0, ior=1.31, bump=(9, 0.25))
vol = ICE.node_tree.nodes.new("ShaderNodeVolumeAbsorption"); set_in(vol, "Color", (0.25, 0.6, 0.95, 1)); set_in(vol, "Density", 0.45)
ICE.node_tree.links.new(vol.outputs[0], ICE.node_tree.nodes["Material Output"].inputs["Volume"])

# ground: rolling snow with frozen patches
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=300, y_segments=300, size=60)
for v in bm.verts:
    x, y = v.co.x, v.co.y; d = math.hypot(x, y)
    v.co.z = (math.sin(x * 0.21) * math.cos(y * 0.17) * 0.6 + math.sin(x * 0.53 + y * 0.31) * 0.2) * min(1, max(0, (d - 4) / 12)) - 0.02
ground = mesh_from_bmesh("Ground", bm, SNOW)
ellipsoid("FrozenPatch", (0.6, -0.9, -0.01), (3.0, 2.0, 0.02), principled("FrozenIce", (0.62, 0.78, 0.9), rough=0.16, coat=0.6, bump=(14, 0.3)), segs=96,
          deform=lambda c: Vector((c.x * (1 + 0.18 * math.sin(math.atan2(c.y, c.x) * 5) + 0.08 * math.sin(math.atan2(c.y, c.x) * 11)), c.y * (1 + 0.15 * math.cos(math.atan2(c.y, c.x) * 4)), c.z)))

# towering translucent ice formations
def crystal(name, base, h, r, tilt):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r * 0.85, depth=h)
    for v in bm.verts: v.co.z += h / 2
    top = [v for v in bm.verts if v.co.z > h - 1e-4]
    tip = bm.verts.new((0, 0, h + r * 1.9))
    for e in list(bm.faces):
        if all(v in top for v in e.verts): bm.faces.remove(e)
    for i in range(6): bm.faces.new((top[i], top[(i + 1) % 6], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_from_bmesh(name, bm, ICE, smooth=False); o.location = base; o.rotation_euler = Euler(tilt)
    return o
for k, (cx, cy, sc, n) in enumerate([(-3.4, 3.8, 1.4, 7), (3.8, 4.6, 1.2, 6), (-7.5, 9, 2.2, 6), (8.5, 11, 2.0, 5), (0.5, 14, 2.8, 6), (-12, 18, 3.0, 5)]):
    for i in range(n):
        a = random.uniform(0, 6.28); d = 0 if i == 0 else random.uniform(0.3, 1.2) * sc
        h = random.uniform(2.0, 5.5) * sc * (1.3 if i == 0 else 1)
        crystal(f"Ice{k}_{i}", (cx + math.cos(a) * d, cy + math.sin(a) * d, -0.2), h, random.uniform(0.25, 0.5) * sc,
                (random.uniform(-0.3, 0.3) + (math.sin(a) * -0.35 if i else 0), random.uniform(-0.3, 0.3) + (math.cos(a) * 0.35 if i else 0), random.uniform(0, 6.28)))

# rugged snow-capped rocks
for k, (x, y, s) in enumerate([(-2.6, 1.6, 0.9), (2.9, 2.2, 1.2), (-4.5, -1.5, 0.7), (4.8, -0.5, 0.8), (-6, 6, 1.8), (6.5, 7, 2.0), (-1.5, 7.5, 1.3)]):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1.0)
    ph = [random.uniform(0, 9) for _ in range(3)]
    for v in bm.verts:
        c = v.co; k1 = 1 + 0.16 * math.sin(c.x * 3 + ph[0]) + 0.12 * math.sin(c.y * 4.3 + ph[1]) + 0.08 * math.sin(c.z * 6 + ph[2])
        v.co = Vector((c.x * k1, c.y * k1, c.z * k1 * 0.72))
    o = mesh_from_bmesh(f"Rock{k}", bm, ROCK); o.location = (x, y, s * 0.25); o.scale = (s, s, s); o.rotation_euler = (0, 0, random.uniform(0, 6.28))

# distant peaks, fading into a pale blue haze with distance
PEAK = ROCK.copy(); PEAK.name = "Peak"
pn = PEAK.node_tree; pp = pn.nodes["Principled BSDF"]; pout = pn.nodes["Material Output"]
camd = pn.nodes.new("ShaderNodeCameraData"); fog = pn.nodes.new("ShaderNodeMath"); fog.operation = "MULTIPLY"; fog.inputs[1].default_value = -0.0045
ex = pn.nodes.new("ShaderNodeMath"); ex.operation = "EXPONENT"; inv = pn.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
hz = pn.nodes.new("ShaderNodeEmission"); set_in(hz, "Color", (0.72, 0.83, 0.97, 1)); set_in(hz, "Strength", 1.0)
mix = pn.nodes.new("ShaderNodeMixShader")
pn.links.new(camd.outputs["View Distance"], fog.inputs[0]); pn.links.new(fog.outputs[0], ex.inputs[0]); pn.links.new(ex.outputs[0], inv.inputs[1])
pn.links.new(inv.outputs[0], mix.inputs[0]); pn.links.new(pp.outputs[0], mix.inputs[1]); pn.links.new(hz.outputs[0], mix.inputs[2]); pn.links.new(mix.outputs[0], pout.inputs["Surface"])
for k in range(9):
    bm = bmesh.new(); h = random.uniform(80, 170); r = random.uniform(70, 130)
    bmesh.ops.create_cone(bm, cap_ends=False, segments=160, radius1=r, radius2=0.5, depth=h)
    ph = random.uniform(0, 9)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x); f = 1 + 0.12 * math.sin(a * 5 + ph) + 0.05 * math.sin(a * 11 + ph * 2)
        v.co.x *= f; v.co.y *= f; v.co.z += h / 2
    a = math.radians(55 + k * 10); d = random.uniform(260, 420)
    if abs(k - 4) <= 1: a += math.radians(14 * (1 if k >= 4 else -1))  # nothing directly behind the head
    o = mesh_from_bmesh(f"Peak{k}", bm, PEAK); o.location = (math.cos(a) * d - 80, math.sin(a) * d, -10)
    cam_xy, head_xy = Vector((-5.3, -8.4)), HEAD.xy
    want, got = (head_xy - cam_xy).angle_signed(Vector((1, 0))), (o.location.xy - cam_xy).angle_signed(Vector((1, 0)))
    if abs(want - got) < 0.2: o.location.x += 160 * (1 if got <= want else -1)

# ---------------------------------------------------------------- light, haze, camera
world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True
wn = world.node_tree
bg = wn.nodes.get("Background") or wn.nodes.new("ShaderNodeBackground")
wout = wn.nodes.get("World Output") or wn.nodes.new("ShaderNodeOutputWorld")
wn.links.new(bg.outputs[0], wout.inputs["Surface"])
sky = wn.nodes.new("ShaderNodeTexSky")
try:
    sky.sky_type = "MULTIPLE_SCATTERING" if "MULTIPLE_SCATTERING" in [i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items] else "NISHITA"
except Exception: pass
for k, v in (("sun_elevation", math.radians(24)), ("sun_rotation", math.radians(215)), ("altitude", 2500), ("air_density", 1.2), ("dust_density", 1.5), ("aerosol_density", 1.5)):
    try: setattr(sky, k, v)
    except Exception: pass
wn.links.new(sky.outputs["Color"], bg.inputs["Color"]); set_in(bg, "Strength", 0.06)


sun = link(bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")))
sun.data.energy = 3.2; sun.data.angle = math.radians(5); sun.data.color = (1.0, 0.97, 0.92)
sun.rotation_euler = Euler((math.radians(58), 0, math.radians(-35)))
rim = link(bpy.data.objects.new("Rim", bpy.data.lights.new("Rim", "AREA")))
rim.data.energy = 1400; rim.data.size = 3; rim.data.color = (0.62, 0.82, 1.0); rim.location = (3.5, 4.0, 3.2)
rim.rotation_euler = (Vector((0, -0.4, 1.1)) - rim.location).to_track_quat("-Z", "Y").to_euler()
fill = link(bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "AREA")))
fill.data.energy = 260; fill.data.size = 6; fill.data.color = (0.75, 0.86, 1.0); fill.location = (-5.5, -5.0, 1.6)
fill.rotation_euler = (Vector((0, -0.4, 1.0)) - fill.location).to_track_quat("-Z", "Y").to_euler()

for light in (rim, fill):
    light.visible_camera = False  # the lights shape the creature; the camera should not see the panels

# 50 mm, low and three-quarter
camera_data.lens = 50; camera_data.sensor_width = 36
camera.location = (-5.3, -8.4, 0.7)
target = Vector((0.1, -0.3, 0.95))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = camera
if MODE == "face":
    camera.location = (-1.5, -3.6, 1.45); camera.rotation_euler = (HEAD - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.dof.use_dof = True; camera_data.dof.focus_object = eyes[0]; camera_data.dof.aperture_fstop = 2.8

stage("environment built")
# ---------------------------------------------------------------- render
scene.render.engine = "CYCLES"
cy = scene.cycles
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    cy.device = "GPU"
except Exception as e:
    print("GPU unavailable, using CPU:", e)
cy.samples = 48 if PREVIEW else 256
cy.use_denoising = True
try: cy.denoiser = "OPENIMAGEDENOISE"
except Exception: pass
cy.max_bounces = 8; cy.diffuse_bounces = 3; cy.glossy_bounces = 4; cy.transmission_bounces = 8; cy.volume_bounces = 0; cy.transparent_max_bounces = 16
cy.caustics_reflective = False; cy.caustics_refractive = False
try: scene.cycles_curves.shape = "RIBBONS"; scene.cycles_curves.subdivisions = 2
except Exception: pass
try: scene.view_settings.view_transform = "AgX"; scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    try: scene.view_settings.view_transform = "Filmic"; scene.view_settings.look = "Medium High Contrast"
    except Exception: pass
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_depth = "16"
scene.render.film_transparent = False

shots = [("yeti-film-face", 900, 900)] if MODE == "face" else [("yeti-film-preview", 1280, 720)] if PREVIEW else [("yeti-film-hero-3840x2160", 3840, 2160), ("yeti-film-mascot-2048", 2048, 2048)]
for name, w, h in shots:
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = w, h, 100
    scene.render.filepath = os.path.join(OUT, name + ".png")
    print(f"Rendering {name} ({w}x{h})...", flush=True)
    bpy.ops.render.render(write_still=True); stage(f"rendered {name}")
    print("Saved", scene.render.filepath, flush=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "yeti_film.blend"))
