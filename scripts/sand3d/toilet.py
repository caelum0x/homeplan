"""Toilet — real part-based sand3d mesh matching FURNITURE_CATALOG.toilet's footprint
(1.6ft x 2.3ft, a real standard toilet's ~19in x 28in footprint) and the "fixture"
branch of buildFurnitureObject in components/FloorPlan3D.tsx: DIM.toiletBowl (16in)
and DIM.toiletTank (20in) — plus a tank lid, a seat ring and a flush handle for real
multi-part detail beyond the original bowl+tank primitive.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(1.6)
D = FT(2.3)
BOWL_H = IN(16)
TANK_H = IN(20)
TANK_W = W * 0.85
TANK_D = D * 0.3

# Bowl: a real tapered frustum (sand3d's cone with d2), wider at the rim than the
# base — matches the original CylinderGeometry(radiusTop=w*0.38, radiusBottom=w*0.3).
# Front is sand3d y < 0 (see wardrobe.py for the +Y -> glTF -Z axis rule).
bowl = s3d.cone("bowl", W * 0.6, BOWL_H, d2=W * 0.76)
s3d.at(bowl, y=-D * 0.12)
s3d.material(bowl, "ceramic", color="#e2eeef")

seat_ring = s3d.torus("seat_ring", W * 0.72, IN(0.9))
s3d.at(seat_ring, y=-D * 0.12, z=BOWL_H)
s3d.material(seat_ring, "plastic", color="#eef6f6", roughness=0.4)

# Tank sits at the back (sand3d y > 0), against the wall.
tank = s3d.box("tank", TANK_W, TANK_D, TANK_H)
s3d.at(tank, y=D / 2 - TANK_D / 2)
s3d.material(tank, "ceramic", color="#e9f4f4")

lid = s3d.box("tank_lid", TANK_W * 1.06, TANK_D * 1.1, IN(1.5))
s3d.at(lid, y=D / 2 - TANK_D / 2, z=TANK_H)
s3d.material(lid, "ceramic", color="#eef7f7")

# Flush button on top of the lid (a vertical cylinder, no rotation needed — simpler
# and just as real as a side lever, and most current toilets are built this way).
handle = s3d.cylinder("flush_handle", IN(1.4), IN(0.6))
s3d.at(handle, y=D / 2 - TANK_D / 2, z=TANK_H + IN(1.5))
s3d.material(handle, "chrome", color="#cfd3d5", metallic=0.35, roughness=0.3)

toilet = s3d.group("toilet", bowl, seat_ring, tank, lid, handle)
s3d.export(toilet, out_path("toilet.glb"))
print("wrote", out_path("toilet.glb"))
