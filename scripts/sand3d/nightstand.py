"""Nightstand — real part-based sand3d mesh matching FURNITURE_CATALOG.nightstand's
footprint (1.6ft x 1.6ft) and DIM.nightstandHeight (24in) from components/FloorPlan3D.tsx:
4 short legs, a cabinet body with one drawer + one door, a drawer pull and a door knob.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(1.6)
D = FT(1.6)
H = IN(24)
LEG_H = IN(4)
BODY_H = H - LEG_H

FRONT_Y = -D / 2

leg_r = 1.1
leg_inset = 2.5
legs = []
for i, (sx, sy) in enumerate(
    (
        (-W / 2 + leg_inset, -D / 2 + leg_inset),
        (W / 2 - leg_inset, -D / 2 + leg_inset),
        (-W / 2 + leg_inset, D / 2 - leg_inset),
        (W / 2 - leg_inset, D / 2 - leg_inset),
    )
):
    leg = s3d.cylinder(f"leg{i}", leg_r * 2, LEG_H)
    s3d.at(leg, x=sx, y=sy, z=0)
    s3d.material(leg, "walnut", color="#8a7760")
    legs.append(leg)

body = s3d.box("body", W, D, BODY_H)
s3d.at(body, z=LEG_H)
s3d.material(body, "oak", color="#ad9a82")

drawer_h = BODY_H * 0.4
door_h = BODY_H - drawer_h
seam = s3d.box("seam", W - 2, 1.0, 0.8)
s3d.at(seam, x=0, y=FRONT_Y - 0.2, z=LEG_H + door_h)
s3d.material(seam, "walnut", color="#8a7760")

# Small protruding boxes rather than rotated cylinders — box() is centred on its own
# (x, y) origin by construction, so no rotation bookkeeping is needed to stick a pull
# out past the front face.
drawer_pull = s3d.box("drawer_pull", W * 0.3, 1.0, 1.0)
s3d.at(drawer_pull, x=0, y=FRONT_Y - 0.5, z=LEG_H + door_h + drawer_h * 0.5 - 0.5)
s3d.material(drawer_pull, "brushed_steel", color="#cfcfcf", metallic=0.35, roughness=0.3)

door_knob = s3d.box("door_knob", 1.6, 1.0, 1.6)
s3d.at(door_knob, x=W * 0.28, y=FRONT_Y - 0.5, z=LEG_H + door_h * 0.5 - 0.8)
s3d.material(door_knob, "brushed_steel", color="#cfcfcf", metallic=0.35, roughness=0.3)

nightstand = s3d.group("nightstand", *legs, body, seam, drawer_pull, door_knob)
s3d.export(nightstand, out_path("nightstand.glb"))
print("wrote", out_path("nightstand.glb"))
