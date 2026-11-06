"""Office chair — real part-based sand3d mesh matching FURNITURE_CATALOG.office_chair's
footprint (1.8ft x 1.8ft, same square as dining_chair) and DIM.chairSeat (18in seat
height) / DIM.chairBack (20in backrest above the seat) from components/FloorPlan3D.tsx
— a genuine swivel chair (5-leg star base on casters, a gas-lift column, a seat
cushion, a backrest and 2 armrests), not the plain 4-leg dining-chair primitive it
replaces, since office_chair is a distinct real-world object with a distinct real
shape.
"""

import math

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(1.8)
D = FT(1.8)
SEAT_H = IN(18)
BACK_H = IN(20)
CUSHION_T = IN(3)
BASE_H = IN(1.4)
STAR_R = min(W, D) / 2 - IN(1.0)
COLUMN_D = IN(2)

column_h = SEAT_H - CUSHION_T - BASE_H

# 5-leg star base on casters, radiating out from the centre column — a real swivel-chair
# base, not the dining chair's 4 straight legs. Each leg is a centred box placed at the
# midpoint of its own radius and turned to point outward (`at`'s single x/y/rz call is
# enough: a box centred at (r/2, 0) then turned rz degrees about the origin lands with
# one end near the hub and the other under its caster).
legs = []
casters = []
for i in range(5):
    angle_deg = i * 72
    angle_rad = math.radians(angle_deg)
    leg = s3d.box(f"base_leg{i}", STAR_R, IN(1.1), BASE_H)
    s3d.at(leg, x=(STAR_R / 2) * math.cos(angle_rad), y=(STAR_R / 2) * math.sin(angle_rad), rz=angle_deg)
    s3d.material(leg, "brushed_steel", color="#3a3a3a", metallic=0.35, roughness=0.4)
    legs.append(leg)

    caster = s3d.sphere(f"caster{i}", IN(1.6))
    s3d.at(caster, x=STAR_R * math.cos(angle_rad), y=STAR_R * math.sin(angle_rad))
    s3d.material(caster, "plastic", color="#1f1f1f", roughness=0.5)
    casters.append(caster)

column = s3d.cylinder("column", COLUMN_D, column_h)
s3d.at(column, z=BASE_H)
s3d.material(column, "brushed_steel", color="#b9bdbf", metallic=0.4, roughness=0.3)

seat = s3d.box("seat", W * 0.92, D * 0.92, CUSHION_T)
s3d.fillet(seat, IN(0.6), edges="top")
s3d.at(seat, z=SEAT_H - CUSHION_T)
s3d.material(seat, "fabric", color="#9fa6ad", roughness=0.85)

BACK_T = IN(2)
back = s3d.box("back", W * 0.88, BACK_T, BACK_H)
# Front/back is arbitrary for a symmetric swivel chair (it rotates freely) — the
# backrest simply sits toward sand3d +Y, same "back lives at +Y" convention already
# used for every other piece in this directory.
s3d.at(back, y=D / 2 - BACK_T / 2, z=SEAT_H)
s3d.material(back, "fabric", color="#878d93", roughness=0.85)

ARM_H = IN(7)
ARM_T = IN(1.4)
armrests = []
for i, sx in enumerate((-1, 1)):
    arm = s3d.box(f"armrest{i}", ARM_T, D * 0.5, ARM_H)
    s3d.at(arm, x=sx * (W / 2 - ARM_T / 2), y=-D * 0.1, z=SEAT_H + IN(1))
    s3d.material(arm, "brushed_steel", color="#3a3a3a", metallic=0.35, roughness=0.4)
    armrests.append(arm)

office_chair = s3d.group("office_chair", *legs, *casters, column, seat, back, *armrests)
s3d.export(office_chair, out_path("office_chair.glb"))
print("wrote", out_path("office_chair.glb"))
