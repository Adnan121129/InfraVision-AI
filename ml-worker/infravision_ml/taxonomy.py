"""Canonical defect taxonomy shared by every model adapter.

Model outputs are normalised to these keys, which match the Django
``DefectType`` choices. Labels that denote "no defect" map to ``None``.
"""

from __future__ import annotations

DEFECT_TYPES = (
    "CRACK",
    "SPALLING",
    "CORROSION",
    "RUST",
    "EXPOSED_REBAR",
    "EFFLORESCENCE",
    "SURFACE_DAMAGE",
    "DEFORMATION",
    "OTHER",
)

DISPLAY_NAMES = {
    "CRACK": "Concrete crack",
    "SPALLING": "Spalling",
    "CORROSION": "Corrosion",
    "RUST": "Rust staining",
    "EXPOSED_REBAR": "Exposed rebar",
    "EFFLORESCENCE": "Efflorescence",
    "SURFACE_DAMAGE": "Surface damage",
    "DEFORMATION": "Deformation",
    "OTHER": "Other defect",
}

BACKGROUND_LABELS = {"background", "no_defect", "nodefect", "none", "normal", "uncracked", "intact", "ud", "up", "uw", "negative"}

LABEL_ALIASES = {
    "crack": "CRACK",
    "cracked": "CRACK",
    "cracks": "CRACK",
    "cd": "CRACK",  # SDNET2018 cracked deck
    "cp": "CRACK",  # SDNET2018 cracked pavement
    "cw": "CRACK",  # SDNET2018 cracked wall
    "positive": "CRACK",
    "spall": "SPALLING",
    "spalling": "SPALLING",
    "delamination": "SPALLING",
    "corrosion": "CORROSION",
    "corrosionstain": "CORROSION",
    "rust": "RUST",
    "rust_stain": "RUST",
    "exposed_rebar": "EXPOSED_REBAR",
    "exposedbars": "EXPOSED_REBAR",
    "exposed_bars": "EXPOSED_REBAR",
    "efflorescence": "EFFLORESCENCE",
    "surface_damage": "SURFACE_DAMAGE",
    "scaling": "SURFACE_DAMAGE",
    "abrasion": "SURFACE_DAMAGE",
    "deformation": "DEFORMATION",
    "other": "OTHER",
}


def normalize_label(label: str) -> str | None:
    """Map a model/dataset label to a canonical defect type, or ``None`` for background."""
    key = label.strip().lower().replace(" ", "_").replace("-", "_")
    if key in BACKGROUND_LABELS:
        return None
    if key.upper() in DEFECT_TYPES:
        return key.upper()
    return LABEL_ALIASES.get(key, "OTHER")
