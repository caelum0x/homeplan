"""Dresser — real part-based sand3d mesh matching FURNITURE_CATALOG.dresser's footprint
(3.5ft x 1.6ft) and DIM.dresserHeight (32in) from components/FloorPlan3D.tsx: a cabinet
body with 4 real drawer bands (3 seams) and a pull per drawer, not one undifferentiated box.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(3.5)
D = FT(1.6)
H = IN(32)

# Front faces sand3d's -Y (see wardrobe.py for why: sand3d +Y exports to glTF -Z, and
# this codebase's existing furniture convention puts the visible/handle side at +Z).
FRONT_Y = -D / 2

body = s3d.box("body", W, D, H)
s3d.material(body, "oak", color="#ad9a82")

parts = [body]
n_drawers = 4
drawer_h = H / n_drawers
for i in range(1, n_drawers):
    seam = s3d.box(f"seam{i}", W - 3, 1.0, 0.8)
    s3d.at(seam, x=0, y=FRONT_Y - 0.2, z=drawer_h * i)
    s3d.material(seam, "walnut", color="#8a7760")
    parts.append(seam)

for i in range(n_drawers):
    center_z = drawer_h * (i + 0.5)
    pull = s3d.box(f"pull{i}", W * 0.18, 1.0, 1.2)
    s3d.at(pull, x=0, y=FRONT_Y - 1.0, z=center_z - 0.6)
    s3d.material(pull, "brushed_steel", color="#cfcfcf", metallic=0.35, roughness=0.3)
    parts.append(pull)

dresser = s3d.group("dresser", *parts)
s3d.export(dresser, out_path("dresser.glb"))
print("wrote", out_path("dresser.glb"))
