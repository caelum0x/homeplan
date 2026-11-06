"""Shared unit helpers for HomePlan's sand3d-generated furniture/appliance meshes.

Mirrors the IN()/DIM-in-feet convention already used by `buildFurnitureObject` in
components/FloorPlan3D.tsx and by FURNITURE_CATALOG in lib/layout/furniture.ts — every
script in this directory builds its item at the *exact same real-world dimensions*
already used for that type's parametric placeholder, just authored as a real
part-based sand3d program (https://github.com/Sandflow-ai/sand3d, Apache-2.0,
`pip install sand3d`) instead of a hand-stacked THREE.BoxGeometry/CylinderGeometry
stack. Each program sets sand3d's unit to centimetres and exports a real .glb to
public/assets/furniture-sand3d/ — see that directory's LICENSE.txt for provenance.

Run any script directly from this directory's venv, e.g.:
    scripts/sand3d/.venv/bin/python scripts/sand3d/wardrobe.py
"""

import os

CM_PER_IN = 2.54
CM_PER_FT = 30.48


def IN(inches: float) -> float:
    """Inches to centimetres — same unit sand3d's program is set to (`units('cm')`)."""
    return inches * CM_PER_IN


def FT(feet: float) -> float:
    """Feet to centimetres — FURNITURE_CATALOG's w/h footprints are stored in feet."""
    return feet * CM_PER_FT


OUT_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "furniture-sand3d")
)


def out_path(filename: str) -> str:
    os.makedirs(OUT_DIR, exist_ok=True)
    return os.path.join(OUT_DIR, filename)
