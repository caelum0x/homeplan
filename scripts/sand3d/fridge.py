"""Fridge — real part-based sand3d mesh matching FURNITURE_CATALOG.fridge's footprint
(2.8ft x 2.6ft) and DIM.fridgeHeight (68in) from components/FloorPlan3D.tsx: a
bottom-freezer silhouette (freezer-drawer seam near the base, french-door seam above
it) with two door handles, not one undifferentiated box.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(2.8)
D = FT(2.6)
H = IN(68)

FRONT_Y = -D / 2

# metallic is capped well below the sand3d preset default (1.0) on every metal part in
# this file — a fully metallic PBR material renders near-black under this scene's
# direct-light-only setup (HemisphereLight + AmbientLight + DirectionalLight, no
# environment map for metals to reflect), confirmed live via the Playwright capture in
# scripts/sand3d/capture.mjs.
body = s3d.box("body", W, D, H)
s3d.material(body, "brushed_steel", color="#c7cdd1", metallic=0.45, roughness=0.4)

freezer_seam_z = H * 0.24
freezer_seam = s3d.box("freezer_seam", W - 2, 1.0, 0.8)
s3d.at(freezer_seam, x=0, y=FRONT_Y - 0.2, z=freezer_seam_z)
s3d.material(freezer_seam, "aluminium", color="#9aa0a4", metallic=0.35, roughness=0.45)

door_seam = s3d.box("door_seam", 1.2, 1.0, H - freezer_seam_z - 2)
s3d.at(door_seam, x=0, y=FRONT_Y - 0.2, z=freezer_seam_z + 1)
s3d.material(door_seam, "aluminium", color="#9aa0a4", metallic=0.35, roughness=0.45)

door_handle_len = H * 0.4
handles = []
for i, sx in enumerate((-W * 0.2, W * 0.2)):
    handle = s3d.box(f"handle{i}", 1.4, 1.2, door_handle_len)
    s3d.at(handle, x=sx, y=FRONT_Y - 1.2, z=freezer_seam_z + (H - freezer_seam_z) * 0.5 - door_handle_len / 2)
    s3d.material(handle, "chrome", color="#d9dde0", metallic=0.35, roughness=0.3)
    handles.append(handle)

freezer_handle = s3d.box("freezer_handle", W * 0.4, 1.2, 1.2)
s3d.at(freezer_handle, x=0, y=FRONT_Y - 1.2, z=freezer_seam_z * 0.5 - 0.6)
s3d.material(freezer_handle, "chrome", color="#d9dde0", metallic=0.35, roughness=0.3)

fridge = s3d.group("fridge", body, freezer_seam, door_seam, *handles, freezer_handle)
s3d.export(fridge, out_path("fridge.glb"))
print("wrote", out_path("fridge.glb"))
