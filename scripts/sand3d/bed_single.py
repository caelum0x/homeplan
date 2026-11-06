"""Single bed — real part-based sand3d mesh matching FURNITURE_CATALOG.bed_single's
footprint (3.2ft x 6.5ft) and the "sleeping" branch of buildFurnitureObject in
components/FloorPlan3D.tsx: DIM.bedFrame (14in), DIM.mattress (10in), a headboard
DIM.headboardAboveMattress (24in) above the mattress top, and one DIM.pillow (6in)
pillow — the exact same real structure bed_queen's vendored CC0 mesh represents, at
the single-bed footprint, plus a folded blanket across the foot for real extra detail.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(3.2)
D = FT(6.5)
FRAME_H = IN(14)
MATTRESS_H = IN(10)
HEADBOARD_ABOVE = IN(24)
PILLOW_H = IN(6)
INSET = IN(2)

HEADBOARD_H = FRAME_H + MATTRESS_H + HEADBOARD_ABOVE

frame = s3d.box("frame", W, D, FRAME_H)
s3d.material(frame, "walnut", color="#8a7760", roughness=0.6)

mattress = s3d.box("mattress", W - INSET * 2, D - INSET * 2, MATTRESS_H)
s3d.fillet(mattress, MATTRESS_H * 0.3, edges="top")
s3d.at(mattress, z=FRAME_H)
s3d.material(mattress, "fabric", color="#b7c9d9", roughness=0.9)

# Headboard sits at sand3d y = +D/2 (back), exported to glTF -Z — the same "back" side
# this project's existing bed/sofa pieces already use (see wardrobe.py's note on the
# sand3d +Y -> glTF -Z axis mapping).
headboard = s3d.box("headboard", W, IN(3), HEADBOARD_H)
s3d.at(headboard, y=D / 2 - IN(1.5))
s3d.material(headboard, "walnut", color="#8a7760", roughness=0.6)

pillow = s3d.box("pillow", W * 0.5, D * 0.22, PILLOW_H)
s3d.fillet(pillow, PILLOW_H * 0.35, edges="top")
s3d.at(pillow, y=D / 2 - D * 0.18, z=FRAME_H + MATTRESS_H)
s3d.material(pillow, "fabric", color="#eef2f5", roughness=0.9)

# Folded blanket across the foot of the bed (opposite the headboard, toward sand3d
# -Y/front) — a real extra detail beyond the parametric placeholder's single pillow.
blanket = s3d.box("blanket", W * 0.92, D * 0.26, IN(3.2))
s3d.at(blanket, y=-D / 2 + D * 0.16, z=FRAME_H + MATTRESS_H)
s3d.material(blanket, "fabric", color="#c7b299", roughness=0.9)

bed_single = s3d.group("bed_single", frame, mattress, headboard, pillow, blanket)
s3d.export(bed_single, out_path("bed_single.glb"))
print("wrote", out_path("bed_single.glb"))
