"""Bookshelf — real part-based sand3d mesh matching FURNITURE_CATALOG.bookshelf's
footprint (3ft x 1.1ft) and DIM.bookshelfHeight (72in) from components/FloorPlan3D.tsx
("3 shelf seams" in the old parametric placeholder). This version is a real hollow
case (sand3d's shell, open on the front) with 3 real shelf boards making 4 real
compartments, not a solid box with surface-only seam lines.
"""

import sand3d as s3d
from common import FT, IN, out_path

s3d.units("cm")

W = FT(3)
D = FT(1.1)
H = IN(72)
WALL_T = IN(0.9)

FRONT_Y = -D / 2

case = s3d.box("case", W, D, H)
s3d.shell(case, WALL_T, open="-Y")
s3d.material(case, "oak", color="#ad9a82")

shelf_w = W - 2 * WALL_T
shelf_d = D - WALL_T  # back wall stays; front stays open
shelf_t = IN(0.8)

shelves = []
for i, frac in enumerate((0.25, 0.5, 0.75)):
    shelf = s3d.box(f"shelf{i}", shelf_w, shelf_d, shelf_t)
    # Interior cavity runs from the open front (y = -D/2) to the inside of the back
    # wall (y = D/2 - WALL_T) — centred at -WALL_T/2, not the front/back midpoint.
    s3d.at(shelf, x=0, y=-WALL_T / 2, z=H * frac - shelf_t / 2)
    s3d.material(shelf, "oak", color="#ad9a82")
    shelves.append(shelf)

bookshelf = s3d.group("bookshelf", case, *shelves)
s3d.export(bookshelf, out_path("bookshelf.glb"))
print("wrote", out_path("bookshelf.glb"))
