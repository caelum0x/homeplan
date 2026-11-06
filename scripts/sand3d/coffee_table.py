"""Coffee table — real part-based sand3d mesh matching FURNITURE_CATALOG.coffee_table's
footprint (3.5ft x 2ft) and the "surface" branch of buildFurnitureObject in
components/FloorPlan3D.tsx: DIM.coffeeTable (18in overall height), DIM.tableTop (1.5in
top thickness) and DIM.tableLegInset (2.5in leg inset) — same proportions as the
dining table/desk this project already models, just at coffee-table height. A real
lower stretcher shelf (common on actual coffee tables) ties the 4 legs together and
adds a 6th real part beyond the plain top+legs.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(3.5)
D = FT(2)
TOP_T = IN(1.5)
TOTAL_H = IN(18)
LEG_H = TOTAL_H - TOP_T
LEG_R = IN(1.5)
LEG_INSET = IN(2.5)

top = s3d.box("top", W, D, TOP_T)
s3d.at(top, z=LEG_H)
s3d.fillet(top, IN(0.4), edges="top")
s3d.material(top, "walnut", color="#c7b299")

shelf_t = IN(0.8)
shelf = s3d.box("shelf", W - LEG_INSET * 1.6, D - LEG_INSET * 1.6, shelf_t)
s3d.at(shelf, z=LEG_H * 0.32)
s3d.material(shelf, "walnut", color="#ad9a82")

legs = []
for i, (sx, sy) in enumerate(
    (
        (-W / 2 + LEG_INSET, -D / 2 + LEG_INSET),
        (W / 2 - LEG_INSET, -D / 2 + LEG_INSET),
        (-W / 2 + LEG_INSET, D / 2 - LEG_INSET),
        (W / 2 - LEG_INSET, D / 2 - LEG_INSET),
    )
):
    leg = s3d.cylinder(f"leg{i}", LEG_R * 2, LEG_H)
    s3d.at(leg, x=sx, y=sy)
    s3d.material(leg, "walnut", color="#8a7760", roughness=0.6)
    legs.append(leg)

coffee_table = s3d.group("coffee_table", top, shelf, *legs)
s3d.export(coffee_table, out_path("coffee_table.glb"))
print("wrote", out_path("coffee_table.glb"))
