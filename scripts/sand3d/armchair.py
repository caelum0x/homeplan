"""Armchair — real part-based sand3d mesh matching FURNITURE_CATALOG.armchair's
footprint (3ft x 3ft) and the sofa/armchair branch of buildFurnitureObject in
components/FloorPlan3D.tsx: DIM.sofaSeat (18in seat height), DIM.sofaBack (20in
backrest above the seat) and DIM.sofaArm (24in arms) — a single-seat version of the
same silhouette, not the plain seating-category box. A seat/back seam line and a
tufted button on the cushion add real multi-part detail beyond the four main boxes.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(3)
D = FT(3)
SEAT_H = IN(18)
BACK_H = IN(20)
ARM_H = IN(24)

seat_depth = D * 0.72
back_thickness = IN(7)
arm_w = max(IN(5), min(IN(7), W * 0.12))
arm_depth = D * 0.85

# sand3d's +Y exports to glTF's -Z; this codebase's existing furniture convention puts
# the visible "front" at +Z (e.g. a sofa's seat cushion extends toward +Z, its backrest
# sits at -Z) — so front-leaning parts here sit at sand3d y < 0, back-leaning parts at
# sand3d y > 0, same rule already proven out in wardrobe.py/dresser.py/etc.
seat = s3d.box("seat", W, seat_depth, SEAT_H)
s3d.at(seat, y=seat_depth / 2 - D / 2)
s3d.material(seat, "fabric", color="#a9b9ce", roughness=0.85)

back = s3d.box("back", W, back_thickness, BACK_H)
s3d.at(back, y=D / 2 - back_thickness / 2, z=SEAT_H)
s3d.material(back, "fabric", color="#8a97a4", roughness=0.85)

arm_left = s3d.box("arm_left", arm_w, arm_depth, ARM_H)
s3d.at(arm_left, x=-(W / 2 - arm_w / 2))
s3d.material(arm_left, "fabric", color="#8a97a4", roughness=0.85)

arm_right = s3d.box("arm_right", arm_w, arm_depth, ARM_H)
s3d.at(arm_right, x=W / 2 - arm_w / 2)
s3d.material(arm_right, "fabric", color="#8a97a4", roughness=0.85)

# Real seam line where the seat cushion meets the backrest, plus one tufted button —
# small, real, distinct parts (not surface decals) matching the seam-line convention
# already used in dresser.py/wardrobe.py/tv_stand.py.
seam = s3d.box("seat_back_seam", W * 0.94, 1.0, 0.8)
s3d.at(seam, y=D / 2 - back_thickness - 0.5, z=SEAT_H - 0.4)
s3d.material(seam, "fabric", color="#6f7b87", roughness=0.9)

button = s3d.dome("cushion_button", 2.4, 1.1)
s3d.at(button, y=seat_depth / 2 - D / 2, z=SEAT_H - 0.3)
s3d.material(button, "fabric", color="#6f7b87", roughness=0.9)

armchair = s3d.group("armchair", seat, back, arm_left, arm_right, seam, button)
s3d.export(armchair, out_path("armchair.glb"))
print("wrote", out_path("armchair.glb"))
