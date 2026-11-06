"""Bathroom vanity sink — real part-based sand3d mesh matching FURNITURE_CATALOG.sink_bath's
footprint (2ft x 1.6ft, a real standard single-vanity size) and DIM.vanityCounter
(32in, a real standard vanity-counter height) from components/FloorPlan3D.tsx. A real
cabinet base (door seam + pull, same convention as dresser.py/nightstand.py) under a
countertop with a real recessed basin (sand3d's pocket) and a faucet, not one solid
block with a decorative surface rim.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(2)
D = FT(1.6)
COUNTER_H = IN(32)
TOP_T = IN(1.5)
CAB_H = COUNTER_H - TOP_T

FRONT_Y = -D / 2

cabinet = s3d.box("cabinet", W * 0.96, D * 0.96, CAB_H)
s3d.material(cabinet, "oak", color="#ad9a82")

seam = s3d.box("seam", 1.0, 1.0, CAB_H - 4)
s3d.at(seam, y=FRONT_Y - 0.2, z=2)
s3d.material(seam, "walnut", color="#8a7760")

pull = s3d.box("pull", W * 0.22, 1.0, 1.2)
s3d.at(pull, y=FRONT_Y - 0.9, z=CAB_H * 0.5 - 0.6)
s3d.material(pull, "brushed_steel", color="#cfcfcf", metallic=0.35, roughness=0.3)

countertop = s3d.box("countertop", W, D, TOP_T)
s3d.at(countertop, z=CAB_H)
s3d.fillet(countertop, IN(0.3), edges="top")
s3d.material(countertop, "marble", color="#e8e4da")

basin = s3d.ellipse(W * 0.46, D * 0.42)
s3d.pocket(countertop, basin, depth=IN(1.1))
s3d.material(countertop, "marble", color="#e8e4da")

faucet_riser = s3d.cylinder("faucet_riser", IN(0.9), IN(5))
s3d.at(faucet_riser, y=D / 2 - IN(1.2), z=CAB_H + TOP_T)
s3d.material(faucet_riser, "chrome", color="#cfd3d5", metallic=0.35, roughness=0.3)

faucet_spout = s3d.box("faucet_spout", IN(0.8), IN(2.4), IN(0.8))
s3d.at(faucet_spout, y=D / 2 - IN(1.2) - IN(1.1), z=CAB_H + TOP_T + IN(4.2))
s3d.material(faucet_spout, "chrome", color="#cfd3d5", metallic=0.35, roughness=0.3)

sink_bath = s3d.group("sink_bath", cabinet, seam, pull, countertop, faucet_riser, faucet_spout)
s3d.export(sink_bath, out_path("sink_bath.glb"))
print("wrote", out_path("sink_bath.glb"))
