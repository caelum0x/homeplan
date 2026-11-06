"""Kitchen island — real part-based sand3d mesh matching FURNITURE_CATALOG.kitchen_island's
footprint (5.5ft x 3ft), DIM.islandCounter (36in total height) and DIM.islandCounterTop
(1.5in slab thickness) from components/FloorPlan3D.tsx: a cabinet base (inset 0.94x, the
same ratio the original parametric version used) with real cabinet-door seams/pulls and
an overhanging fillet-edged countertop slab, not a plain box with a flat lid.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(5.5)
D = FT(3)
TOTAL_H = IN(36)
TOP_T = IN(1.5)
BASE_H = TOTAL_H - TOP_T
BASE_W = W * 0.94
BASE_D = D * 0.94

FRONT_Y = -BASE_D / 2

base = s3d.box("base", BASE_W, BASE_D, BASE_H)
s3d.material(base, "oak", color="#cfc6b8")

n_doors = 3
door_w = BASE_W / n_doors
seams = []
for i in range(1, n_doors):
    seam = s3d.box(f"seam{i}", 1.0, 1.0, BASE_H - 4)
    s3d.at(seam, x=-BASE_W / 2 + door_w * i, y=FRONT_Y - 0.2, z=2)
    s3d.material(seam, "walnut", color="#8a7760")
    seams.append(seam)

pulls = []
for i in range(n_doors):
    center_x = -BASE_W / 2 + door_w * (i + 0.5)
    pull = s3d.box(f"pull{i}", door_w * 0.3, 1.0, 1.2)
    s3d.at(pull, x=center_x, y=FRONT_Y - 0.9, z=BASE_H * 0.5 - 0.6)
    s3d.material(pull, "brushed_steel", color="#cfcfcf", metallic=0.35, roughness=0.3)
    pulls.append(pull)

countertop = s3d.box("countertop", W, D, TOP_T)
s3d.at(countertop, z=BASE_H)
s3d.fillet(countertop, 0.6, edges="top")
s3d.material(countertop, "marble", color="#e8e4da")

kitchen_island = s3d.group("kitchen_island", base, countertop, *seams, *pulls)
s3d.export(kitchen_island, out_path("kitchen_island.glb"))
print("wrote", out_path("kitchen_island.glb"))
