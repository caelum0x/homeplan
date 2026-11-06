"""Bathtub — real part-based sand3d mesh matching FURNITURE_CATALOG.bathtub's footprint
(2.6ft x 5ft, a real standard 30in x 60in alcove tub) and DIM.bathtubHeight (16in,
a real standard tub-wall height) from components/FloorPlan3D.tsx. Built as a real
hollow basin (sand3d's shell, open on top — the same technique bookshelf.py already
uses for its case) instead of a solid block with a decorative surface rim, plus a
wall-mounted spout, 2 handles and a drain for real multi-part detail.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(2.6)
D = FT(5)
H = IN(16)
WALL_T = IN(1.6)

body = s3d.box("body", W, D, H)
s3d.fillet(body, IN(1.2), edges="top")
s3d.shell(body, WALL_T, open="top")
s3d.material(body, "ceramic", color="#d9eced")

# The shell leaves a real floor WALL_T thick (shell hollows the box leaving walls
# that thick on every face except the open top) — the drain sits on that interior
# floor, not on the outer Z = 0 base.
drain = s3d.cylinder("drain", IN(3), IN(0.4))
s3d.at(drain, z=WALL_T)
s3d.material(drain, "chrome", color="#cfd3d5", metallic=0.35, roughness=0.3)

# Spout + 2 handles mounted on the back wall (sand3d y > 0 — see wardrobe.py for the
# +Y -> glTF -Z axis rule), near the top edge of the tub wall.
spout = s3d.box("spout", IN(1.4), IN(4), IN(1.4))
s3d.at(spout, y=D / 2 - IN(2), z=H - IN(2))
s3d.material(spout, "chrome", color="#cfd3d5", metallic=0.35, roughness=0.3)

handles = []
for i, sx in enumerate((-IN(5), IN(5))):
    handle = s3d.cylinder(f"handle{i}", IN(1.6), IN(1.4))
    s3d.at(handle, x=sx, y=D / 2 - WALL_T * 0.6, z=H - IN(2))
    s3d.material(handle, "chrome", color="#cfd3d5", metallic=0.35, roughness=0.3)
    handles.append(handle)

bathtub = s3d.group("bathtub", body, drain, spout, *handles)
s3d.export(bathtub, out_path("bathtub.glb"))
print("wrote", out_path("bathtub.glb"))
