"""Wardrobe — real part-based sand3d mesh matching HomePlan's existing dimensions:
FURNITURE_CATALOG.wardrobe footprint (4ft x 2ft) and DIM.wardrobeHeight (72in) from
components/FloorPlan3D.tsx. A recessed plinth, a cabinet body, a cornice top trim, a
center door seam and two door pulls — not one undifferentiated box.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(4)
D = FT(2)
H = IN(72)
PLINTH_H = IN(4)
CORNICE_T = IN(1.5)
BODY_H = H - PLINTH_H - CORNICE_T

plinth = s3d.box("plinth", W - 4, D - 4, PLINTH_H)
s3d.at(plinth, x=0, y=1, z=0)

body = s3d.box("body", W, D, BODY_H)
s3d.at(body, z=PLINTH_H)

cornice = s3d.box("cornice", W + 2, D + 2, CORNICE_T)
s3d.at(cornice, z=PLINTH_H + BODY_H)

# Door side faces sand3d's -Y (sand3d's +Y exports to glTF's -Z; the existing parametric
# furniture already puts its "front" at +Z/+d-half — e.g. the bed headboard sits at
# -d/2 as the back — so this mesh's visible/handle side has to sit at sand3d y = -D/2
# to land on the matching +Z front once exported, keeping auto-rotation-to-face-the-room
# logic correct for the swapped-in real mesh).
FRONT_Y = -D / 2

seam = s3d.box("seam", 1.6, 1.2, BODY_H - 4)
s3d.at(seam, x=0, y=FRONT_Y - 0.3, z=PLINTH_H + 2)

pull_offset = W * 0.09
pull_len = IN(6)
pull_center_z = PLINTH_H + BODY_H * 0.45
pulls = []
for i, sx in enumerate((-pull_offset, pull_offset)):
    # Vertical door pull: axis along Z already (cylinder's native orientation), just
    # moved flush against the front face and centred at handle height.
    pull = s3d.cylinder(f"pull{i}", 1.6, pull_len)
    s3d.at(pull, x=sx, y=FRONT_Y - 0.9, z=pull_center_z - pull_len / 2)
    pulls.append(pull)

wardrobe = s3d.group("wardrobe", plinth, body, cornice, seam, *pulls)
s3d.material(plinth, "walnut", color="#8a7760")
s3d.material(body, "oak", color="#ad9a82")
s3d.material(cornice, "walnut", color="#8a7760")
s3d.material(seam, "walnut", color="#8a7760")
for p in pulls:
    s3d.material(p, "brushed_steel", color="#cfcfcf", metallic=0.35, roughness=0.3)

s3d.export(wardrobe, out_path("wardrobe.glb"))
print("wrote", out_path("wardrobe.glb"))
