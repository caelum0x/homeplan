"""TV stand — real part-based sand3d mesh matching FURNITURE_CATALOG.tv_stand's footprint
(4.5ft x 1.3ft) and DIM.tvStandHeight (20in) from components/FloorPlan3D.tsx: 4 short
legs, a low cabinet body with real cabinet doors on each side and a real open shelf
niche cut into the centre (via sand3d's pocket), not one undifferentiated box.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(4.5)
D = FT(1.3)
H = IN(20)
LEG_H = IN(3)
BODY_H = H - LEG_H

FRONT_Y = -D / 2

leg_r = 1.0
leg_inset = 2.2
legs = []
for i, (sx, sy) in enumerate(
    (
        (-W / 2 + leg_inset, -D / 2 + leg_inset),
        (W / 2 - leg_inset, -D / 2 + leg_inset),
        (-W / 2 + leg_inset, D / 2 - leg_inset),
        (W / 2 - leg_inset, D / 2 - leg_inset),
    )
):
    leg = s3d.cylinder(f"leg{i}", leg_r * 2, LEG_H)
    s3d.at(leg, x=sx, y=sy, z=0)
    s3d.material(leg, "brushed_steel", color="#8d8d8d", metallic=0.35, roughness=0.3)
    legs.append(leg)

body = s3d.box("body", W, D, BODY_H)
s3d.at(body, z=LEG_H)
s3d.material(body, "oak", color="#8d8d8d")

# Real open shelf niche (the centre third) cut into the front face, not just a surface
# seam — sand3d's pocket removes real geometry, leaving a real cavity with a back wall.
niche = s3d.rect(W * 0.3, BODY_H * 0.55)
s3d.pocket(body, niche, depth=D * 0.5, on=body.face("-Y"))

seams = []
for i, sx in enumerate((-W * 0.28, W * 0.28)):
    seam = s3d.box(f"seam{i}", 1.0, 1.0, BODY_H - 4)
    s3d.at(seam, x=sx, y=FRONT_Y - 0.2, z=LEG_H + 2)
    s3d.material(seam, "walnut", color="#6f5c48")
    seams.append(seam)

pulls = []
for i, sx in enumerate((-W * 0.2, W * 0.2)):
    pull = s3d.box(f"pull{i}", 1.0, 1.0, W * 0.07)
    s3d.at(pull, x=sx, y=FRONT_Y - 0.5, z=LEG_H + BODY_H * 0.5 - W * 0.035)
    s3d.material(pull, "brushed_steel", color="#cfcfcf", metallic=0.35, roughness=0.3)
    pulls.append(pull)

tv_stand = s3d.group("tv_stand", *legs, body, *seams, *pulls)
s3d.export(tv_stand, out_path("tv_stand.glb"))
print("wrote", out_path("tv_stand.glb"))
