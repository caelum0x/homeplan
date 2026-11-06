"""Range/stove — real part-based sand3d mesh matching FURNITURE_CATALOG.stove's
footprint (2.5ft x 2.2ft), DIM.rangeHeight (36in) and DIM.rangeCooktop (1.2in) from
components/FloorPlan3D.tsx: an oven body with a real recessed door + handle, a
cooktop slab with 4 real burner rings, and a control-knob row — not one
undifferentiated box plus a flat cooktop slab.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(2.5)
D = FT(2.2)
BODY_H = IN(36)
COOKTOP_T = IN(1.2)

FRONT_Y = -D / 2

# metallic is capped well below the sand3d preset default (1.0) on every metal part in
# this file — a fully metallic PBR material renders near-black under this scene's
# direct-light-only setup (HemisphereLight + AmbientLight + DirectionalLight, no
# environment map for metals to reflect), confirmed live via the Playwright capture in
# scripts/sand3d/capture.mjs.
body = s3d.box("body", W, D, BODY_H)
s3d.material(body, "brushed_steel", color="#9aa0a4", metallic=0.45, roughness=0.4)

# Oven door: a real recessed panel (sand3d's pocket), not a surface decal.
door_panel = s3d.rect(W * 0.72, BODY_H * 0.62)
s3d.pocket(body, door_panel, depth=0.6, on=body.face("-Y"))

handle = s3d.box("handle", W * 0.6, 1.2, 1.4)
s3d.at(handle, x=0, y=FRONT_Y - 1.3, z=BODY_H * 0.72)
s3d.material(handle, "chrome", color="#d9dde0", metallic=0.35, roughness=0.3)

# Cooktop: matches the original parametric slab's own proportions (w*0.9 x d*0.85),
# set back slightly from the front edge — same real-world footprint, now with 4 real
# burner rings instead of a flat undecorated slab.
cooktop = s3d.box("cooktop", W * 0.9, D * 0.85, COOKTOP_T)
s3d.at(cooktop, x=0, y=D * 0.02, z=BODY_H)
s3d.material(cooktop, "ceramic", color="#2b2b2b")

burners = []
burner_positions = ((-W * 0.2, -D * 0.18), (W * 0.2, -D * 0.18), (-W * 0.2, D * 0.18), (W * 0.2, D * 0.18))
for i, (sx, sy) in enumerate(burner_positions):
    burner = s3d.torus(f"burner{i}", W * 0.16, 0.5)
    s3d.at(burner, x=sx, y=sy, z=BODY_H + COOKTOP_T)
    s3d.material(burner, "chrome", color="#b9bdbf", metallic=0.35, roughness=0.3)
    burners.append(burner)

knobs = []
knob_xs = (-W * 0.3, -W * 0.12, W * 0.12, W * 0.3)
for i, sx in enumerate(knob_xs):
    # A small box protruding toward the viewer (-Y/front), not a cylinder standing on
    # its flat face — a cylinder's axis is Z, so it would present a flat tab from the
    # front instead of a knob sticking out of the control panel.
    knob = s3d.box(f"knob{i}", 1.4, 1.0, 1.4)
    s3d.at(knob, x=sx, y=FRONT_Y - 0.6, z=BODY_H * 0.92 - 0.7)
    s3d.material(knob, "brushed_steel", color="#cfcfcf", metallic=0.35, roughness=0.3)
    knobs.append(knob)

stove = s3d.group("stove", body, handle, cooktop, *burners, *knobs)
s3d.export(stove, out_path("stove.glb"))
print("wrote", out_path("stove.glb"))
