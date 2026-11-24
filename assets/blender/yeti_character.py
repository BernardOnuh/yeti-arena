# Yeti Arena's hero character, rebuilt to the design spec (Blender 5, Cycles).
#
# An original design: a charming Yeti with a large rounded head (~40% of its height), a compact rounded body, thick
# forearms supporting a relaxed forward lean, short hind legs and big soft paws. The head and face are ONE organic
# sculpt (metaballs with carving elements for the eye sockets and the grin, remeshed and smoothed): recessed blue eyes
# wrapped by the socket rims, soft cheeks, an expressive brow ridge, a small nose, a wide lopsided grin with a few ivory
# teeth. The groom is scripted strand by strand as hair curves: a dense undercoat, curved body fur, long cheek and chin
# fur, and windswept forehead hair, with clumping, length variation and surface collision; white with frost-blue tips.
#
#   Blender -b -P yeti_character.py -- <out_dir> [turn|preview|final]
#     turn:    front, side and three-quarter views (1024 px) for design review
#     preview: the hero shot at 1280x720, low samples
#     final:   the 3840x2160 hero, a 2048 px 1:1 mascot, and the .blend
import bpy, bmesh, math, os, random, sys, time
import numpy as np
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "renders")
MODE = argv[1] if len(argv) > 1 else "preview"
FINAL = MODE == "final"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11); random.seed(11)
T0 = time.time()
def stage(name): print(f"[{time.time() - T0:6.1f}s] {name}", flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; col = scene.collection


# ---------------------------------------------------------------- helpers
def link(o): col.objects.link(o); return o
def set_in(node, names, value):
    for n in (names if isinstance(names, (list, tuple)) else [names]):
        if n in node.inputs: node.inputs[n].default_value = value; return True
    return False
def principled(name, color, rough=0.5, sss=0.0, sss_radius=(1.0, 0.5, 0.3), transmission=0.0, ior=1.45, coat=0.0, bump=None, ao_darken=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; p = nt.nodes["Principled BSDF"]
    set_in(p, "Base Color", (*color, 1)); set_in(p, "Roughness", rough); set_in(p, "IOR", ior)
    if sss: set_in(p, ["Subsurface Weight", "Subsurface"], sss); set_in(p, "Subsurface Radius", sss_radius); set_in(p, "Subsurface Scale", 0.04)
    if transmission: set_in(p, ["Transmission Weight", "Transmission"], transmission)
    if coat: set_in(p, ["Coat Weight", "Clearcoat"], coat)
    if bump:
        tex = nt.nodes.new("ShaderNodeTexNoise"); set_in(tex, "Scale", bump[0]); set_in(tex, "Detail", 8)
        b = nt.nodes.new("ShaderNodeBump"); set_in(b, "Strength", bump[1]); set_in(b, "Distance", 0.01)
        nt.links.new(tex.outputs["Fac"], b.inputs["Height"]); nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    if ao_darken:  # deepen creases (eye sockets, the grin, under the brow) like a sculptor's cavity shading
        ao = nt.nodes.new("ShaderNodeAmbientOcclusion"); set_in(ao, "Distance", 0.05)
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = ao_darken
        mix.inputs["A"].default_value = (*color, 1)
        nt.links.new(ao.outputs["AO"], mix.inputs["B"]); nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
    return m
def mesh_obj(name, bm, mats=(), smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for poly in me.polygons: poly.use_smooth = smooth
    o = link(bpy.data.objects.new(name, me))
    for m in mats: o.data.materials.append(m)
    return o
def ellipsoid(name, center, radii, mat, rot=(0, 0, 0), segs=48, deform=None, parent=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=1.0)
    for v in bm.verts:
        co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        v.co = deform(co) if deform else co
    o = mesh_obj(name, bm, [mat] if mat else [])
    o.location = center; o.rotation_euler = Euler(rot)
    if parent: o.parent = parent
    return o
def apply_mod(o, mtype, **kw):
    bpy.context.view_layer.objects.active = o
    m = o.modifiers.new(mtype.lower(), mtype)
    for k, v in kw.items(): setattr(m, k, v)
    bpy.ops.object.modifier_apply(modifier=m.name)


# ---------------------------------------------------------------- materials
SKIN = principled("Skin", (0.15, 0.21, 0.3), rough=0.5, sss=0.3, sss_radius=(0.9, 0.6, 0.5), bump=(260, 0.08), ao_darken=0.85)
def add_mouth_shading(m):
    nt = m.node_tree; p = nt.nodes["Principled BSDF"]; src = p.inputs["Base Color"].links[0].from_socket
    attr = nt.nodes.new("ShaderNodeAttribute"); attr.attribute_name = "mouthw"
    mr = nt.nodes.new("ShaderNodeMapRange"); mr.interpolation_type = "SMOOTHSTEP"; mr.inputs["From Min"].default_value = 0.3; mr.inputs["From Max"].default_value = 0.75
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.inputs["B"].default_value = (0.03, 0.018, 0.025, 1)
    nt.links.new(attr.outputs["Fac"], mr.inputs["Value"]); nt.links.new(mr.outputs["Result"], mix.inputs["Factor"])
    nt.links.new(src, mix.inputs["A"]); nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
add_mouth_shading(SKIN)
UNDER = principled("Undercoat", (0.6, 0.67, 0.76), rough=0.85)         # under the fur: a cool grey, so the gaps read as icy shadow
MOUTH = principled("Mouth", (0.03, 0.02, 0.03), rough=0.6)
TEETH = principled("Teeth", (0.9, 0.86, 0.76), rough=0.25, sss=0.12, coat=0.25)
CORNEA = principled("Cornea", (1, 1, 1), rough=0.0, transmission=1.0, ior=1.376)

def fur_material():
    m = bpy.data.materials.new("Fur"); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); hair = nt.nodes.new("ShaderNodeBsdfHairPrincipled")
    try: hair.parametrization = "MELANIN"
    except Exception: pass
    set_in(hair, "Melanin", 0.012); set_in(hair, "Melanin Redness", 0.04); set_in(hair, "Roughness", 0.28)
    set_in(hair, "Radial Roughness", 0.4); set_in(hair, "Coat", 0.15); set_in(hair, "Random Roughness", 0.15); set_in(hair, "Random Color", 0.05)
    info = nt.nodes.new("ShaderNodeHairInfo"); ramp = nt.nodes.new("ShaderNodeValToRGB"); cr = ramp.color_ramp
    cr.elements[0].position = 0.0; cr.elements[0].color = (0.78, 0.86, 0.95, 1)      # a cooler root: natural icy-blue depth
    cr.elements[1].position = 1.0; cr.elements[1].color = (0.7, 0.86, 1.0, 1)        # frost-blue tips: our Yeti's signature
    e = cr.elements.new(0.35); e.color = (0.97, 0.99, 1.0, 1); e = cr.elements.new(0.78); e.color = (0.96, 0.98, 1.0, 1)
    nt.links.new(info.outputs["Intercept"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], hair.inputs["Tint"])
    nt.links.new(hair.outputs[0], out.inputs["Surface"])
    return m
FUR = fur_material()

def eye_material(radius):
    m = bpy.data.materials.new("Eye"); m.use_nodes = True; nt = m.node_tree; p = nt.nodes["Principled BSDF"]
    set_in(p, "Roughness", 0.45); set_in(p, ["Specular IOR Level", "Specular"], 0.0)   # the cornea does the reflecting
    tc = nt.nodes.new("ShaderNodeTexCoord"); sep = nt.nodes.new("ShaderNodeSeparateXYZ"); comb = nt.nodes.new("ShaderNodeCombineXYZ")
    length = nt.nodes.new("ShaderNodeVectorMath"); length.operation = "LENGTH"
    div = nt.nodes.new("ShaderNodeMath"); div.operation = "DIVIDE"; div.inputs[1].default_value = radius
    streak = nt.nodes.new("ShaderNodeTexNoise"); set_in(streak, "Scale", 90); set_in(streak, "Detail", 6)
    add = nt.nodes.new("ShaderNodeMath"); add.operation = "MULTIPLY_ADD"; add.inputs[1].default_value = 0.05
    ramp = nt.nodes.new("ShaderNodeValToRGB"); cr = ramp.color_ramp; cr.interpolation = "EASE"
    stops = [(0.0, (0.004, 0.004, 0.008)), (0.3, (0.006, 0.008, 0.014)), (0.34, (0.03, 0.15, 0.4)), (0.55, (0.12, 0.47, 0.9)),
             (0.68, (0.2, 0.6, 0.97)), (0.76, (0.04, 0.15, 0.36)), (0.8, (0.012, 0.03, 0.07)), (0.84, (0.86, 0.85, 0.83)), (1.0, (0.8, 0.79, 0.78))]
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, c in stops[1:-1]: el = cr.elements.new(pos); el.color = (*c, 1)
    L = nt.links.new
    L(tc.outputs["Object"], sep.inputs[0]); L(sep.outputs["X"], comb.inputs["X"]); L(sep.outputs["Z"], comb.inputs["Z"])
    L(comb.outputs[0], length.inputs[0]); L(length.outputs["Value"], div.inputs[0])
    L(streak.outputs["Fac"], add.inputs[0]); L(div.outputs[0], add.inputs[2]); L(add.outputs[0], ramp.inputs["Fac"])
    L(ramp.outputs["Color"], p.inputs["Base Color"])
    return m


# ---------------------------------------------------------------- the sculpt
# The Yeti faces -Y. About 1.35 m tall in its stance, with the head about 40-45% of that.
HEAD = Vector((0.0, -0.27, 0.98))
HEAD_ROT = Euler((-0.14, 0.0, -0.3)).to_matrix()          # raised a little and turned toward the camera (front-left)
HEAD_INV = HEAD_ROT.inverted()
HR = Vector((0.34, 0.31, 0.31))                            # head radii
def H(x, y, z): return HEAD + HEAD_ROT @ Vector((x, y, z))   # head-local -> world
def head_local(w): return HEAD_INV @ (Vector(w) - HEAD)
def on_head_surface(x, z):                                   # the base ellipsoid's front surface at (x, z)
    return Vector((x, -HR.y * math.sqrt(max(0.0, 1 - (x / HR.x) ** 2 - (z / HR.z) ** 2)), z))
EYE_R = 0.075
EYES = [on_head_surface(s * 0.138, 0.035) for s in (-1, 1)]
def grin_z(x): return -0.15 + 1.8 * x * x + 0.08 * x       # the smile: corners up, the right one higher
GRIN_X = (-0.165, 0.185)
def smooth(e0, e1, x): t = min(1.0, max(0.0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)

def head_shape(p, n):
    """Sculpt offsets along the normal at a point of the base head: returns (offset, mouth weight)."""
    g = lambda c, s: math.exp(-(p - Vector(c)).length_squared / (2 * s * s))
    front = max(0.0, -n.y)
    d = 0.05 * (g((-0.15, -0.22, -0.11), 0.08) + g((0.15, -0.22, -0.11), 0.08))         # full cheeks
    d += 0.04 * g((0, -0.28, -0.14), 0.09)                                                # muzzle and chin
    d += 0.03 * math.exp(-((p.z - 0.1) / 0.03) ** 2) * math.exp(-(p.x / 0.21) ** 4) * front   # brow ridge
    d += 0.03 * g((0, -0.3, -0.045), 0.028)                                               # small nose
    for e in EYES:
        d -= 0.058 * g(e, 0.055)                                                          # eye socket
        rho = math.hypot(p.x - e.x, p.z - e.z)
        if p.y < 0: d += 0.022 * math.exp(-((rho - EYE_R - 0.004) / 0.015) ** 2) * (1.0 if p.z > e.z else 0.55) * front   # rolled lids
    dz = p.z - grin_z(p.x)
    ends = smooth(GRIN_X[0] - 0.02, GRIN_X[0] + 0.03, p.x) * (1 - smooth(GRIN_X[1] - 0.03, GRIN_X[1] + 0.02, p.x))
    groove = math.exp(-(dz / 0.021) ** 2) * ends * front
    d -= 0.04 * groove                                                                    # the grin
    return d, groove

bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=7 if FINAL else 6, radius=1.0)
mouth_w = {}
for v in bm.verts:
    u = v.co.normalized(); p = Vector((u.x * HR.x, u.y * HR.y, u.z * HR.z))
    n = Vector((u.x / HR.x, u.y / HR.y, u.z / HR.z)).normalized()
    d, m = head_shape(p, n); mouth_w[v.index] = m
    v.co = H(*(p + n * d))
bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
def face_mask(l): return 9.0 if l.y > -0.1 else math.sqrt((l.x / 0.24) ** 2 + ((l.z + 0.05) / 0.23) ** 2)
for f in bm.faces:
    l = head_local(f.calc_center_median()); mw = sum(mouth_w[v.index] for v in f.verts) / len(f.verts)
    f.material_index = 1 if face_mask(l) < 1.0 or mw > 0.3 else 0
mw_arr = np.array([mouth_w[i] for i in range(len(bm.verts))], dtype=np.float32)
head = mesh_obj("YetiHead", bm, [UNDER, SKIN, MOUTH])
head.data.attributes.new("mouthw", "FLOAT", "POINT").data.foreach_set("value", mw_arr)

# body: organic metaballs (they surface at about two thirds of their nominal size, hence the 1.45 factor)
Kb = 1.45
parts = [
    ("ellipsoid", (0, 0.1, 0.6), Kb, (0.44, 0.48, 0.4), (-0.35, 0, 0)),          # compact rounded body, gently curved back
    ("ellipsoid", (0, 0.3, 0.52), Kb, (0.38, 0.36, 0.34)),
    ("ellipsoid", (0, -0.15, 0.78), Kb, (0.3, 0.22, 0.22)),                      # the neck sinks into the shoulders
    ("ellipsoid", (-0.3, -0.1, 0.72), Kb, (0.2, 0.2, 0.2)), ("ellipsoid", (0.3, -0.1, 0.72), Kb, (0.2, 0.2, 0.2)),  # rounded shoulders
]
for s in (-1, 1):
    parts += [
        ("capsule", (s * 0.34, -0.12, 0.66), (s * 0.4, -0.3, 0.4), 0.15 * Kb),     # upper arm
        ("capsule", (s * 0.4, -0.3, 0.4), (s * 0.39, -0.42, 0.12), 0.165 * Kb),    # thick forearm
        ("ellipsoid", (s * 0.39, -0.5, 0.06), Kb, (0.15, 0.18, 0.075)),            # big soft paw
        ("capsule", (s * 0.26, 0.36, 0.34), (s * 0.29, 0.28, 0.12), 0.15 * Kb),    # short hind leg
        ("ellipsoid", (s * 0.29, 0.18, 0.055), Kb, (0.13, 0.18, 0.06)),            # hind paw
    ]
    for ox in (-0.08, -0.027, 0.027, 0.08):                                       # subtle toes on the front paws
        parts.append(("ellipsoid", (s * 0.39 + ox * 1.1, -0.66 + abs(ox) * 0.25, 0.045), Kb, (0.036, 0.045, 0.034)))
mb = bpy.data.metaballs.new("YetiBody"); res = 0.014 if FINAL else 0.02
mb.resolution = res; mb.render_resolution = res; mb.threshold = 0.6
mbo = link(bpy.data.objects.new("YetiBody", mb))
for p in parts:
    e = mb.elements.new(); e.stiffness = 2.0
    if p[0] == "ellipsoid":
        e.type = "ELLIPSOID"; e.co = p[1]; e.radius = p[2]; e.size_x, e.size_y, e.size_z = p[3]
        if len(p) > 4: e.rotation = Euler(p[4]).to_quaternion()
    else:
        a_, b_ = Vector(p[1]), Vector(p[2]); dd = b_ - a_
        e.type = "CAPSULE"; e.co = (a_ + b_) / 2; e.radius = p[3]; e.size_x = dd.length / 2; e.rotation = Vector((1, 0, 0)).rotation_difference(dd)
bpy.ops.object.select_all(action="DESELECT"); mbo.select_set(True); bpy.context.view_layer.objects.active = mbo
bpy.ops.object.convert(target="MESH"); torso = bpy.context.view_layer.objects.active; torso.name = "YetiTorso"
apply_mod(torso, "REMESH", mode="VOXEL", voxel_size=res * 0.6)
apply_mod(torso, "SMOOTH", factor=0.6, iterations=8)
torso.data.materials.append(UNDER); torso.data.materials.append(SKIN); torso.data.materials.append(MOUTH)
for poly in torso.data.polygons:
    c = poly.center; poly.use_smooth = True
    poly.material_index = 1 if (c.z < 0.08 and c.y < -0.69 and abs(abs(c.x) - 0.39) < 0.13) else 0   # bare toe tips only
# one object: the sculpted head set into the body (the join is buried in fur)
bpy.ops.object.select_all(action="DESELECT"); head.select_set(True); torso.select_set(True); bpy.context.view_layer.objects.active = torso
bpy.ops.object.join(); body = bpy.context.view_layer.objects.active; body.name = "Yeti"
for poly in body.data.polygons: poly.use_smooth = True
stage(f"sculpt: {len(body.data.polygons)} faces")

# eyes set into their sockets, wrapped by the lids, with clear corneas; they look at whichever camera renders
EYE = eye_material(EYE_R)
eyes = []
for i, e in enumerate(EYES):
    n = Vector((e.x / HR.x ** 2, e.y / HR.y ** 2, e.z / HR.z ** 2)).normalized()
    pivot = link(bpy.data.objects.new(f"EyeSocket{i}", None)); pivot.location = H(*(e - n * 0.047))
    eye = ellipsoid(f"Eye{i}", (0, 0, 0), (EYE_R,) * 3, EYE, parent=pivot, segs=64)
    cornea = ellipsoid(f"Cornea{i}", (0, 0, 0), (EYE_R * 1.04,) * 3, CORNEA, parent=eye, segs=64); cornea.visible_shadow = False
    pivot.rotation_euler = HEAD_ROT.to_euler()
    def lid_edge(c, cut, upper):
        """Points past the cut fold onto the eyeball, so the lid's edge rolls onto the eye with no visible rim."""
        if (c.z > cut) == upper: return c
        rr = math.sqrt(max(EYE_R ** 2 - cut ** 2, 0.0)) * 1.005; xy = Vector((c.x, c.y)); xy = xy.normalized() * rr if xy.length else xy
        return Vector((xy.x, xy.y, cut))
    up = ellipsoid(f"UpperLid{i}", (0, 0, 0), (EYE_R * 1.07,) * 3, SKIN, parent=pivot, segs=96, deform=lambda c: lid_edge(c, EYE_R * 0.6, True))
    up.rotation_euler = (0.08, 0, 0)                     # tipped forward over the eye: a relaxed, confident lid
    lo = ellipsoid(f"LowerLid{i}", (0, 0, 0), (EYE_R * 1.05,) * 3, SKIN, parent=pivot, segs=96, deform=lambda c: lid_edge(c, -EYE_R * 0.7, False))
    eyes.append(eye)
# a few small ivory teeth, set into the top edge of the grin
bpy.context.view_layer.update()
hbvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
for i, x in enumerate((-0.05, -0.008, 0.042)):
    origin = H(x, -0.8, grin_z(x) + 0.006); hit, nrm, _, _ = hbvh.ray_cast(origin, HEAD_ROT @ Vector((0, 1, 0)))
    if hit: ellipsoid(f"Tooth{i}", tuple(hit - nrm * 0.004), (0.014, 0.01, 0.013), TEETH, rot=tuple(HEAD_ROT.to_euler()), segs=24)  # set into the groove
stage("face details")

# ---------------------------------------------------------------- the groom
bpy.context.view_layer.update()
me = body.data; me.calc_loop_triangles()
V = np.zeros(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get("co", V); V = V.reshape(-1, 3)
N = np.zeros(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get("normal", N); N = N.reshape(-1, 3)
T = np.zeros(len(me.loop_triangles) * 3, dtype=np.int32); me.loop_triangles.foreach_get("vertices", T); T = T.reshape(-1, 3)
TM = np.zeros(len(me.loop_triangles), dtype=np.int32); me.loop_triangles.foreach_get("material_index", TM)
hc_ = np.array(HEAD); hli = np.array(HEAD_INV)
Cn = (V[T[:, 0]] + V[T[:, 1]] + V[T[:, 2]]) / 3; Lc = (Cn - hc_) @ hli.T
edge_e = np.sqrt((Lc[:, 0] / 0.24) ** 2 + ((Lc[:, 2] + 0.05) / 0.23) ** 2)
mouthy = np.zeros(len(T), dtype=bool)
if "mouthw" in me.attributes:
    MW = np.zeros(len(me.vertices), dtype=np.float32); me.attributes["mouthw"].data.foreach_get("value", MW); mouthy = MW[T].max(1) > 0.05
face_edge = (TM == 1) & (Lc[:, 1] < -0.1) & (np.linalg.norm(Cn - hc_, axis=1) < 0.45) & (edge_e > 0.8) & ~mouthy
keep = (TM == 0) | face_edge                                               # fur where there's no skin, plus a fringe onto the face edge
fringe = np.where(face_edge, np.clip((edge_e - 0.8) / 0.2, 0, 1) ** 1.5, 1.0)[keep]
T = T[keep]
a, b, c = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1) * fringe
bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
hl_inv = np.array(HEAD_INV); hc = np.array(HEAD)

def sample(n):
    tri = rng.choice(len(T), n, p=area / area.sum())
    u, v = rng.random(n), rng.random(n); flip = u + v > 1; u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
    w0 = 1 - u - v
    P = w0[:, None] * a[tri] + u[:, None] * b[tri] + v[:, None] * c[tri]
    Nn = w0[:, None] * N[T[tri, 0]] + u[:, None] * N[T[tri, 1]] + v[:, None] * N[T[tri, 2]]
    return P, Nn / np.linalg.norm(Nn, axis=1, keepdims=True)

def flow(P, Nn):
    """Where fur wants to lie at each point: back from the brow and crown, out and down from the cheeks, down the
    chin and limbs, back and down over the body. Returned as a tangent to the surface."""
    L = (P - hc) @ hl_inv.T                                                # head-local
    on_head = np.linalg.norm(P - hc, axis=1) < 0.45
    F = np.tile(np.array([0.0, 0.55, -1.0]), (len(P), 1))                  # body: down and back
    limb = (np.abs(P[:, 0]) > 0.27) & (P[:, 2] < 0.55) & (P[:, 1] < 0.0)
    F[limb] = [0.0, 0.2, -1.0]                                             # forearms: down the limb
    # head: radiate from the face, sweeping back on top and dropping down on the cheeks and chin
    radial = L.copy(); radial[:, 1] = np.minimum(radial[:, 1], 0) * 0.3 + 0.35
    up = L[:, 2] > 0.05
    radial[up] = radial[up] * [0.6, 1, 0.3] + [0, 0.9, 0.25]                # forehead and crown: windswept back
    radial[~up] = radial[~up] + [0, 0.2, -0.9]                             # cheeks and chin: cascade down
    F[on_head] = (radial[on_head] @ np.array(HEAD_ROT).T)
    F -= (F * Nn).sum(1, keepdims=True) * Nn
    return F / (np.linalg.norm(F, axis=1, keepdims=True) + 1e-9)

def grow(P, Nn, length, lift, steps, gravity, curl):
    """Integrates strands from the roots: they leave the skin at an angle, curve along the flow and droop."""
    F = flow(P, Nn); seg = (length / steps)[:, None]
    d = Nn * lift[:, None] + F * (1 - lift[:, None]); d /= np.linalg.norm(d, axis=1, keepdims=True)
    pts = [P + Nn * 0.002]
    side = np.cross(Nn, F)
    for k in range(steps):
        t = (k + 1) / steps
        d = d + F * 0.38 + np.array([0, 0, -gravity]) * t + side * (np.sin(t * 6.0 + rng.random(len(P)) * 0.5) * curl)[:, None]
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        pts.append(pts[-1] + d * seg)
    return np.stack(pts, 1)  # (n, steps+1, 3)

def collide(S, offset=0.004):
    """Keeps every strand point outside the body."""
    flat = S.reshape(-1, 3)
    for i in range(len(flat)):
        loc, nrm, _, dist = bvh.find_nearest(Vector(flat[i]))
        if loc is None or dist > 0.05: continue
        if (Vector(flat[i]) - loc).dot(nrm) < offset: flat[i] = loc + nrm * offset
    return flat.reshape(S.shape)

def clump(S, guides, amount):
    """Pulls each strand toward its nearest guide strand, more toward the tip: natural locks."""
    kd = KDTree(len(guides)); [kd.insert(Vector(g[0]), i) for i, g in enumerate(guides)]; kd.balance()
    steps = S.shape[1]; w = (np.linspace(0, 1, steps) ** 1.2 * amount)[None, :, None]
    G = np.stack([guides[kd.find(Vector(s[0]))[1]] for s in S])
    G = G - G[:, :1] + S[:, :1]                                           # the guide's shape, from this strand's root
    return S * (1 - w) + G * w

def layer(n, length, length_var, lift, steps, gravity, curl, clump_amt, radius, region=None):
    P, Nn = sample(int(n * 1.6))
    if region is not None: keep = region(P); P, Nn = P[keep], Nn[keep]
    P, Nn = P[:n], Nn[:n]
    Lm = length(P) * (1 + (rng.random(len(P)) - 0.5) * 2 * length_var)
    lift_v = np.full(len(P), lift)
    S = grow(P, Nn, Lm, lift_v, steps, gravity, curl)
    if clump_amt:
        gi = rng.choice(len(P), max(8, len(P) // 40), replace=False)
        S = clump(S, S[gi], clump_amt)
    return S, np.full(len(P), radius)

def head_dist(P): return np.linalg.norm(P - hc, axis=1)
def face_ring(P):  # how close to the face rim (head-local, front)
    L = (P - hc) @ hl_inv.T; e = np.sqrt((L[:, 0] / 0.24) ** 2 + ((L[:, 2] + 0.05) / 0.23) ** 2); return e, L
def body_len(P):
    e, L = face_ring(P); hd = head_dist(P)
    out = np.full(len(P), 0.16)
    out[P[:, 2] > 0.7] = 0.19                                             # shoulders and back
    out[(np.abs(P[:, 0]) > 0.27) & (P[:, 2] < 0.55) & (P[:, 1] < 0.0)] = 0.19   # forearms
    head = hd < 0.45; out[head] = 0.1
    cheek = head & (L[:, 1] < 0.05) & (L[:, 2] < 0.02); out[cheek] = 0.22 + 0.1 * np.clip(1.6 - e[cheek], 0, 1)  # long cheek and chin fur
    brow = head & (L[:, 2] > 0.05); out[brow] = 0.12 + 0.05 * np.clip(L[brow, 2] / 0.35, 0, 1)              # windswept crown
    near_eyes = head & (e < 1.3) & (L[:, 2] > -0.06); out[near_eyes] = 0.04                                # short around the eyes
    out[P[:, 2] < 0.14] = 0.07                                            # paws
    return out

FAST = not FINAL
k = 0.25 if FAST else 1.0
layers = [
    layer(int(300000 * k), lambda P: body_len(P) * 0.35, 0.3, 0.55, 4, 0.06, 0.01, 0.0, 0.00045),      # dense undercoat
    layer(int(260000 * k), body_len, 0.25, 0.32, 9, 0.24, 0.03, 0.45, 0.0006),                          # curved body coat
    layer(int(90000 * k), lambda P: body_len(P) * 1.35, 0.3, 0.22, 11, 0.3, 0.035, 0.6, 0.0006,         # long cheek, chin, shoulder and forearm locks
          region=lambda P: (head_dist(P) < 0.5) | (P[:, 2] > 0.68) | ((np.abs(P[:, 0]) > 0.27) & (P[:, 1] < 0))),
]
stage("groom grown")
strands = []
for S, R in layers:
    S = collide(S) if FINAL or len(S) < 60000 else S
    strands.append((S, R))
stage("groom collided")

curves = bpy.data.hair_curves.new("YetiFur")
total = sum(len(S) for S, _ in strands)
sizes = []; pos = []; rad = []
for S, R in strands:
    n, m, _ = S.shape; sizes += [m] * n; pos.append(S.reshape(-1, 3))
    taper = np.linspace(1.0, 0.15, m)[None, :] * R[:, None]; rad.append(taper.reshape(-1))
curves.add_curves(sizes)
curves.attributes["position"].data.foreach_set("vector", np.concatenate(pos).astype(np.float32).ravel())
ra = curves.attributes.new("radius", "FLOAT", "POINT"); ra.data.foreach_set("value", np.concatenate(rad).astype(np.float32))
curves.materials.append(FUR)
fur = link(bpy.data.objects.new("YetiFur", curves))
stage(f"fur: {total} strands")

# ---------------------------------------------------------------- the frozen valley
SNOW = principled("Snow", (0.84, 0.89, 0.96), rough=0.45, sss=0.45, sss_radius=(0.8, 0.9, 1.2), bump=(70, 0.3))
ROCK = bpy.data.materials.new("SnowRock"); ROCK.use_nodes = True; rn = ROCK.node_tree; rp = rn.nodes["Principled BSDF"]; set_in(rp, "Roughness", 0.75)
geo = rn.nodes.new("ShaderNodeNewGeometry"); sp = rn.nodes.new("ShaderNodeSeparateXYZ"); rr = rn.nodes.new("ShaderNodeValToRGB")
rr.color_ramp.elements[0].position = 0.3; rr.color_ramp.elements[0].color = (0.1, 0.12, 0.15, 1)
rr.color_ramp.elements[1].position = 0.62; rr.color_ramp.elements[1].color = (0.86, 0.9, 0.96, 1)
rn.links.new(geo.outputs["Normal"], sp.inputs[0]); rn.links.new(sp.outputs["Z"], rr.inputs["Fac"]); rn.links.new(rr.outputs["Color"], rp.inputs["Base Color"])
ICE = principled("Ice", (0.6, 0.83, 1.0), rough=0.04, transmission=1.0, ior=1.31, bump=(6, 0.35))
vol = ICE.node_tree.nodes.new("ShaderNodeVolumeAbsorption"); set_in(vol, "Color", (0.22, 0.58, 0.95, 1)); set_in(vol, "Density", 0.5)
ICE.node_tree.links.new(vol.outputs[0], ICE.node_tree.nodes["Material Output"].inputs["Volume"])

bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=320, y_segments=320, size=60)
for v in bm.verts:
    x, y = v.co.x, v.co.y; d = math.hypot(x, y)
    v.co.z = (math.sin(x * 0.21) * math.cos(y * 0.17) * 0.6 + math.sin(x * 0.53 + y * 0.31) * 0.2 + math.sin(x * 2.1 + y * 1.7) * 0.03) * min(1, max(0, (d - 3) / 12)) - 0.01
mesh_obj("Ground", bm, [SNOW])

def spire(name, base, h, r, tilt):
    """A naturally formed ice spire: an irregular hexagonal shaft that narrows to a point."""
    bm = bmesh.new(); rings = 6; ring_verts = []
    jag = [random.uniform(0.8, 1.15) for _ in range(6)]
    for i in range(rings + 1):
        t = i / rings; rad = r * (1 - 0.35 * t) * (1 + 0.05 * math.sin(t * 9))
        ring_verts.append([bm.verts.new((math.cos(a * math.pi / 3) * rad * jag[a], math.sin(a * math.pi / 3) * rad * jag[a], t * h)) for a in range(6)])
    tip = bm.verts.new((r * 0.1, 0, h + r * 2.2))
    for i in range(rings):
        for a in range(6): bm.faces.new((ring_verts[i][a], ring_verts[i][(a + 1) % 6], ring_verts[i + 1][(a + 1) % 6], ring_verts[i + 1][a]))
    for a in range(6): bm.faces.new((ring_verts[-1][a], ring_verts[-1][(a + 1) % 6], tip))
    bm.faces.new(list(reversed(ring_verts[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, [ICE], smooth=False); o.location = base; o.rotation_euler = Euler(tilt); return o
for kk, (cx, cy, sc, n) in enumerate([(-2.8, 3.2, 1.2, 7), (3.0, 4.2, 1.0, 6), (-6.5, 8, 2.0, 6), (7.5, 10, 1.8, 5), (0.5, 12, 2.6, 6), (-11, 16, 2.8, 5)]):
    for i in range(n):
        ang = random.uniform(0, 6.28); d = 0 if i == 0 else random.uniform(0.3, 1.2) * sc
        spire(f"Spire{kk}_{i}", (cx + math.cos(ang) * d, cy + math.sin(ang) * d, -0.2), random.uniform(1.8, 5.0) * sc * (1.3 if i == 0 else 1),
              random.uniform(0.22, 0.45) * sc, (random.uniform(-0.25, 0.25) + (math.sin(ang) * -0.3 if i else 0), random.uniform(-0.25, 0.25) + (math.cos(ang) * 0.3 if i else 0), random.uniform(0, 6.28)))
for kk, (x, y, s) in enumerate([(-1.9, 1.3, 0.55), (2.2, 1.6, 0.75), (-3.4, -1.0, 0.45), (3.6, -0.3, 0.5), (-5, 5, 1.4), (5.5, 6, 1.6), (-1.2, 6.5, 1.0)]):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1.0)
    ph = [random.uniform(0, 9) for _ in range(3)]
    for v in bm.verts:
        cc = v.co; k1 = 1 + 0.16 * math.sin(cc.x * 3 + ph[0]) + 0.12 * math.sin(cc.y * 4.3 + ph[1]) + 0.08 * math.sin(cc.z * 6 + ph[2])
        v.co = Vector((cc.x * k1, cc.y * k1, cc.z * k1 * 0.7))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    o = mesh_obj(f"Rock{kk}", bm, [ROCK]); o.location = (x, y, s * 0.22); o.scale = (s, s, s); o.rotation_euler = (0, 0, random.uniform(0, 6.28))

PEAK = ROCK.copy(); PEAK.name = "Peak"; pn = PEAK.node_tree; pp = pn.nodes["Principled BSDF"]; pout = pn.nodes["Material Output"]
camd = pn.nodes.new("ShaderNodeCameraData"); fogm = pn.nodes.new("ShaderNodeMath"); fogm.operation = "MULTIPLY"; fogm.inputs[1].default_value = -0.0045
ex = pn.nodes.new("ShaderNodeMath"); ex.operation = "EXPONENT"; inv = pn.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
hz = pn.nodes.new("ShaderNodeEmission"); set_in(hz, "Color", (0.6, 0.72, 0.88, 1)); set_in(hz, "Strength", 1.0)
mix = pn.nodes.new("ShaderNodeMixShader")
for a_, b_ in ((camd.outputs["View Distance"], fogm.inputs[0]), (fogm.outputs[0], ex.inputs[0]), (ex.outputs[0], inv.inputs[1]), (inv.outputs[0], mix.inputs[0]), (pp.outputs[0], mix.inputs[1]), (hz.outputs[0], mix.inputs[2]), (mix.outputs[0], pout.inputs["Surface"])):
    pn.links.new(a_, b_)
for kk in range(9):
    bm = bmesh.new(); h = random.uniform(80, 170); r = random.uniform(70, 130)
    bmesh.ops.create_cone(bm, cap_ends=False, segments=160, radius1=r, radius2=0.5, depth=h)
    ph = random.uniform(0, 9)
    for v in bm.verts:
        ang = math.atan2(v.co.y, v.co.x); f = 1 + 0.12 * math.sin(ang * 5 + ph) + 0.05 * math.sin(ang * 11 + ph * 2)
        v.co.x *= f; v.co.y *= f; v.co.z += h / 2
    ang = math.radians(50 + kk * 11); d = random.uniform(260, 420)
    mesh_obj(f"Peak{kk}", bm, [PEAK]).location = (math.cos(ang) * d - 60, math.sin(ang) * d, -10)

# low drifting mist over the valley floor
mist = ellipsoid("Mist", (0, 16, 0.2), (34, 8, 1.1), None, segs=32)
mm = bpy.data.materials.new("Mist"); mm.use_nodes = True; mn = mm.node_tree
for nd in list(mn.nodes):
    if nd.type == "BSDF_PRINCIPLED": mn.nodes.remove(nd)
pv = mn.nodes.new("ShaderNodeVolumePrincipled"); set_in(pv, "Color", (0.85, 0.92, 1.0, 1)); set_in(pv, "Density", 0.05)
nz = mn.nodes.new("ShaderNodeTexNoise"); set_in(nz, "Scale", 0.4); dm = mn.nodes.new("ShaderNodeMath"); dm.operation = "MULTIPLY"; dm.inputs[1].default_value = 0.04
mn.links.new(nz.outputs["Fac"], dm.inputs[0]); mn.links.new(dm.outputs[0], pv.inputs["Density"]); mn.links.new(pv.outputs[0], mn.nodes["Material Output"].inputs["Volume"])
mist.data.materials.append(mm)
stage("environment")

# ---------------------------------------------------------------- light and camera
world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True; wn = world.node_tree
bg = wn.nodes.get("Background") or wn.nodes.new("ShaderNodeBackground"); wout = wn.nodes.get("World Output") or wn.nodes.new("ShaderNodeOutputWorld")
wn.links.new(bg.outputs[0], wout.inputs["Surface"])
sky = wn.nodes.new("ShaderNodeTexSky")
try: sky.sky_type = "MULTIPLE_SCATTERING"
except Exception: pass
for kk, v in (("sun_elevation", math.radians(26)), ("sun_rotation", math.radians(215)), ("altitude", 2500), ("air_density", 1.2), ("aerosol_density", 1.6)):
    try: setattr(sky, kk, v)
    except Exception: pass
wn.links.new(sky.outputs["Color"], bg.inputs["Color"]); set_in(bg, "Strength", 0.055)

def light(name, kind, energy, color, loc=None, rot=None, size=None, target=Vector((0, -0.2, 0.7))):
    o = link(bpy.data.objects.new(name, bpy.data.lights.new(name, kind))); o.data.energy = energy; o.data.color = color
    if loc: o.location = loc; o.rotation_euler = (target - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    if rot: o.rotation_euler = Euler(rot)
    if size: o.data.size = size
    o.visible_camera = False; return o
sun = light("Sun", "SUN", 2.4, (1.0, 0.97, 0.93), rot=(math.radians(55), 0, math.radians(-38))); sun.data.angle = math.radians(6)
light("Rim", "AREA", 700, (0.6, 0.8, 1.0), loc=(2.4, 2.6, 2.2), size=2.5)        # cool rim that lights the strand edges
light("Fill", "AREA", 160, (0.75, 0.86, 1.0), loc=(-3.6, -3.2, 1.3), size=4)       # cool environmental fill
light("Kicker", "AREA", 120, (0.85, 0.92, 1.0), loc=(-2.0, 2.4, 2.4), size=2)

cam_data = bpy.data.cameras.new("Camera"); cam = link(bpy.data.objects.new("Camera", cam_data)); scene.camera = cam
def place_camera(loc, target, lens, fstop=None):
    cam.location = loc; cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = lens; cam_data.sensor_width = 36
    cam_data.dof.use_dof = fstop is not None
    if fstop: cam_data.dof.focus_object = eyes[0]; cam_data.dof.aperture_fstop = fstop
for e in eyes:
    c = e.constraints.new("TRACK_TO"); c.target = cam; c.track_axis = "TRACK_NEGATIVE_Y"; c.up_axis = "UP_Z"

# ---------------------------------------------------------------- render
scene.render.engine = "CYCLES"; cy = scene.cycles
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences; prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices: d.use = d.type != "CPU"
    cy.device = "GPU"
except Exception as e: print("GPU unavailable:", e)
cy.samples = 512 if FINAL else 64; cy.use_denoising = True
try: cy.denoiser = "OPENIMAGEDENOISE"
except Exception: pass
cy.max_bounces = 10; cy.diffuse_bounces = 3; cy.glossy_bounces = 4; cy.transmission_bounces = 8; cy.volume_bounces = 1; cy.transparent_max_bounces = 32
cy.caustics_reflective = False; cy.caustics_refractive = False
try: scene.cycles_curves.shape = "THICK" if FINAL else "RIBBONS"; scene.cycles_curves.subdivisions = 3
except Exception: pass
try: scene.view_settings.view_transform = "AgX"; scene.view_settings.look = "AgX - Medium High Contrast"
except Exception: pass
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_depth = "16"

HERO = ((-2.3, -3.4, 1.0), (0.05, -0.12, 0.66), 50)           # three-quarter, at the Yeti's eye level
def shot(name, w, h, camera, fstop=None):
    place_camera(*camera, fstop=fstop)
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = w, h, 100
    scene.render.filepath = os.path.join(OUT, name + ".png"); bpy.ops.render.render(write_still=True); stage(f"rendered {name}")

if MODE == "face":
    cy.samples = 48
    shot("turn-face", 1024, 1024, ((-0.75, -1.75, 1.12), tuple(HEAD), 85), fstop=5.6)
elif MODE == "turn":
    cy.samples = 48
    shot("turn-front", 1024, 1024, ((0, -4.6, 0.8), (0, 0, 0.64), 70))
    shot("turn-side", 1024, 1024, ((4.6, -0.1, 0.8), (0, -0.1, 0.64), 70))
    shot("turn-threequarter", 1024, 1024, HERO, fstop=4)
    shot("turn-face", 1024, 1024, ((-0.75, -1.75, 1.12), tuple(HEAD), 85), fstop=5.6)
elif MODE == "preview":
    shot("hero-preview", 1280, 720, HERO, fstop=2.8)
else:
    shot("yeti-hero-3840x2160", 3840, 2160, HERO, fstop=2.8)
    shot("yeti-mascot-2048", 2048, 2048, HERO, fstop=2.8)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "yeti_character.blend"))
