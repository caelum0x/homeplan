"""Kitchen sink — real part-based sand3d mesh matching FURNITURE_CATALOG.sink_kitchen's
footprint (2.3ft x 2ft) at DIM.islandCounter's real standard 36in kitchen-counter
height (the same counter-height constant kitchen_island.py already uses, from
components/FloorPlan3D.tsx) — a real cabinet base (2 doors + pulls, same convention as
kitchen_island.py) under a countertop with a real recessed single-bowl basin (sand3d's
pocket) and a gooseneck faucet, not one solid block with a flat lid.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(2.3)
D = FT(2)
TOTAL_H = IN(36)
TOP_T = IN(1.5)
CAB_H = TOTAL_H - TOP_T

FRONT_Y = -D / 2

cabinet = s3d.box("cabinet", W * 0.96, D * 0.96, CAB_H)
s3d.material(cabinet, "oak", color="#cfc6b8")

seam = s3d.box("seam", 1.0, 1.0, CAB_H - 4)
s3d.at(seam, y=FRONT_Y - 0.2, z=2)
s3d.material(seam, "walnut", color="#8a7760")

pulls = []
for i, sx in enumerate((-W * 0.18, W * 0.18)):
    pull = s3d.box(f"pull{i}", W * 0.16, 1.0, 1.2)
    s3d.at(pull, x=sx, y=FRONT_Y - 0.9, z=CAB_H * 0.5 - 0.6)
    s3d.material(pull, "brushed_steel", color="#cfcfcf", metallic=0.35, roughness=0.3)
    pulls.append(pull)

countertop = s3d.box("countertop", W, D, TOP_T)
s3d.at(countertop, z=CAB_H)
s3d.fillet(countertop, IN(0.3), edges="top")
s3d.material(countertop, "marble", color="#e8e4da")

basin = s3d.rect(W * 0.6, D * 0.55, r=IN(1))
s3d.pocket(countertop, basin, depth=IN(5))
s3d.material(countertop, "marble", color="#e8e4da")

# Gooseneck faucet: a vertical riser plus a short horizontal spout, mounted at the
# back of the counter (sand3d y > 0 — see wardrobe.py for the +Y -> glTF -Z rule).
faucet_riser = s3d.cylinder("faucet_riser", IN(1), IN(7))
s3d.at(faucet_riser, y=D / 2 - IN(1.3), z=CAB_H + TOP_T)
s3d.material(faucet_riser, "brushed_steel", color="#b9bdbf", metallic=0.4, roughness=0.3)

faucet_spout = s3d.box("faucet_spout", IN(0.9), IN(3), IN(0.9))
s3d.at(faucet_spout, y=D / 2 - IN(1.3) - IN(1.4), z=CAB_H + TOP_T + IN(6))
s3d.material(faucet_spout, "brushed_steel", color="#b9bdbf", metallic=0.4, roughness=0.3)

sink_kitchen = s3d.group("sink_kitchen", cabinet, seam, *pulls, countertop, faucet_riser, faucet_spout)
s3d.export(sink_kitchen, out_path("sink_kitchen.glb"))
print("wrote", out_path("sink_kitchen.glb"))
