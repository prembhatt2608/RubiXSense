"""
Cube state validator.

Checks that a given cube state is physically reachable:
  1. Correct count of each color (9 each).
  2. Six distinct centers (one per face).
  3. Valid corner pieces (proper color triples, no repeated corners).
  4. Valid edge pieces (proper color pairs, no repeated edges).
  5. Corner orientation sum ≡ 0 (mod 3).
  6. Edge orientation sum ≡ 0 (mod 2).
  7. Permutation parity (corner and edge permutations have same parity).
"""

from __future__ import annotations
from typing import List, Tuple, Dict, Optional
from .state import CubeState, FACE_NAMES, FACE_OFFSET, CENTER_IDX


# ---------------------------------------------------------------------------
# Helper: facelet indices for corners and edges
# ---------------------------------------------------------------------------

# 8 corners, each defined by 3 facelet indices (in URF ordering)
# Format: (facelet_URF, facelet_clockwise_next, facelet_clockwise_prev)
CORNER_FACELETS: List[Tuple[int, int, int]] = [
    (8, 9, 20),    # URF
    (6, 18, 38),   # UFL
    (0, 36, 47),   # ULB
    (2, 45, 11),   # UBR
    (29, 26, 15),  # DFR
    (27, 44, 24),  # DLF
    (33, 53, 42),  # DBL
    (35, 17, 51),  # DRB
]

# 12 edges, each defined by 2 facelet indices
EDGE_FACELETS: List[Tuple[int, int]] = [
    (5, 10),   # UR
    (7, 19),   # UF
    (3, 37),   # UL
    (1, 46),   # UB
    (32, 16),  # DR
    (28, 25),  # DF
    (30, 43),  # DL
    (34, 52),  # DB
    (23, 12),  # FR
    (21, 41),  # FL
    (50, 39),  # BL
    (48, 14),  # BR
]

# Expected corner color triples for solved state (URF order)
# Colors: U=0, R=1, F=2, D=3, L=4, B=5
CORNER_COLORS: List[Tuple[int, int, int]] = [
    (0, 1, 2),  # URF: white, red, green
    (0, 2, 4),  # UFL: white, green, orange
    (0, 4, 5),  # ULB: white, orange, blue
    (0, 5, 1),  # UBR: white, blue, red
    (3, 2, 1),  # DFR: yellow, green, red
    (3, 4, 2),  # DLF: yellow, orange, green
    (3, 5, 4),  # DBL: yellow, blue, orange
    (3, 1, 5),  # DRB: yellow, red, blue
]

# Expected edge color pairs for solved state
EDGE_COLORS: List[Tuple[int, int]] = [
    (0, 1),  # UR
    (0, 2),  # UF
    (0, 4),  # UL
    (0, 5),  # UB
    (3, 1),  # DR
    (3, 2),  # DF
    (3, 4),  # DL
    (3, 5),  # DB
    (2, 1),  # FR
    (2, 4),  # FL
    (5, 4),  # BL
    (5, 1),  # BR
]


class ValidationError:
    def __init__(self, message: str, affected_facelets: Optional[List[int]] = None):
        self.message = message
        self.affected_facelets = affected_facelets or []

    def __str__(self) -> str:
        return self.message

    def to_dict(self) -> dict:
        return {
            "message": self.message,
            "affected_facelets": self.affected_facelets,
        }


class ValidationResult:
    def __init__(self):
        self.valid: bool = True
        self.errors: List[ValidationError] = []
        self.warnings: List[str] = []

    def add_error(self, msg: str, facelets: Optional[List[int]] = None) -> None:
        self.valid = False
        self.errors.append(ValidationError(msg, facelets))

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "errors": [e.to_dict() for e in self.errors],
            "warnings": self.warnings,
        }


def validate_cube(state: CubeState) -> ValidationResult:
    """
    Validate a CubeState fully.
    Returns a ValidationResult with errors and warnings.
    """
    result = ValidationResult()
    facelets = state.facelets

    # Step 1: Check color counts
    color_counts: Dict[str, int] = {}
    for ch in facelets:
        color_counts[ch] = color_counts.get(ch, 0) + 1

    valid_colors = set("URFDLB")
    invalid_chars = set(color_counts.keys()) - valid_colors
    if invalid_chars:
        result.add_error(
            f"Invalid color characters found: {', '.join(sorted(invalid_chars))}. "
            f"Only U, R, F, D, L, B are allowed.",
        )
        return result  # Can't continue if basic chars are wrong

    missing_colors = valid_colors - set(color_counts.keys())
    if missing_colors:
        result.add_error(
            f"Missing colors: {', '.join(sorted(missing_colors))}. "
            f"Each of the 6 colors must appear exactly 9 times."
        )

    for color, count in color_counts.items():
        if count != 9:
            result.add_error(
                f"Color '{color}' appears {count} times (expected 9).",
                [i for i, c in enumerate(facelets) if c == color],
            )

    if not result.valid:
        return result

    # Step 2: Check centers are all distinct
    centers = {i: facelets[CENTER_IDX[i]] for i in range(6)}
    center_values = list(centers.values())
    if len(set(center_values)) != 6:
        result.add_error(
            "The six center stickers are not all distinct. "
            "Each face center must be a unique color.",
            CENTER_IDX,
        )
        return result

    # Build color -> face index mapping from centers
    color_to_face: Dict[str, int] = {v: k for k, v in centers.items()}

    def facelet_face(idx: int) -> int:
        """Return the face index for the color at facelet idx."""
        return color_to_face[facelets[idx]]

    # Step 3: Validate corners
    corner_seen = set()
    for i, (f0, f1, f2) in enumerate(CORNER_FACELETS):
        colors = (facelet_face(f0), facelet_face(f1), facelet_face(f2))
        color_set = frozenset(colors)

        # Each corner must have 3 distinct face colors
        if len(color_set) != 3:
            result.add_error(
                f"Corner {i} has duplicate face colors: {tuple(FACE_NAMES[c] for c in colors)}. "
                f"This corner piece is invalid.",
                [f0, f1, f2],
            )
            continue

        # Must be a known corner piece (ignoring orientation)
        expected_sets = [frozenset(c) for c in CORNER_COLORS]
        if color_set not in expected_sets:
            result.add_error(
                f"Corner {i} has an impossible color combination: "
                f"{tuple(FACE_NAMES[c] for c in colors)}.",
                [f0, f1, f2],
            )
            continue

        if color_set in corner_seen:
            result.add_error(
                f"Corner piece {tuple(FACE_NAMES[c] for c in sorted(colors))} "
                f"appears more than once.",
                [f0, f1, f2],
            )
        corner_seen.add(color_set)

    # Step 4: Validate edges
    edge_seen = set()
    for i, (f0, f1) in enumerate(EDGE_FACELETS):
        colors = (facelet_face(f0), facelet_face(f1))
        color_set = frozenset(colors)

        if len(color_set) != 2:
            result.add_error(
                f"Edge {i} has duplicate face colors: {tuple(FACE_NAMES[c] for c in colors)}. "
                f"This edge piece is invalid.",
                [f0, f1],
            )
            continue

        expected_sets = [frozenset(e) for e in EDGE_COLORS]
        if color_set not in expected_sets:
            result.add_error(
                f"Edge {i} has an impossible color combination: "
                f"{tuple(FACE_NAMES[c] for c in colors)}.",
                [f0, f1],
            )
            continue

        if color_set in edge_seen:
            result.add_error(
                f"Edge piece {tuple(FACE_NAMES[c] for c in sorted(colors))} "
                f"appears more than once.",
                [f0, f1],
            )
        edge_seen.add(color_set)

    if not result.valid:
        return result

    # Step 5: Corner orientation sum ≡ 0 (mod 3)
    corner_orientation_sum = 0
    for i, (f0, f1, f2) in enumerate(CORNER_FACELETS):
        c0, c1, c2 = facelet_face(f0), facelet_face(f1), facelet_face(f2)
        colors = (c0, c1, c2)
        # Expected (solved) positions for this corner
        expected = CORNER_COLORS[i]
        # Find which rotation brings the U/D color to the URF position
        ud_colors = {color_to_face["U"], color_to_face["D"]}
        # Find orientation: 0 if U/D face is at f0 position, 1 if at f1, 2 if at f2
        if c0 in ud_colors:
            orient = 0
        elif c1 in ud_colors:
            orient = 1
        elif c2 in ud_colors:
            orient = 2
        else:
            # Should not happen after previous checks
            orient = 0
        corner_orientation_sum += orient

    if corner_orientation_sum % 3 != 0:
        result.add_error(
            f"Corner orientation sum is {corner_orientation_sum} (must be divisible by 3). "
            f"One or more corners are twisted. Please rescan or manually correct the affected stickers.",
        )

    # Step 6: Edge orientation sum ≡ 0 (mod 2)
    edge_orientation_sum = 0
    u_face = color_to_face["U"]
    d_face = color_to_face["D"]
    f_face = color_to_face["F"]
    b_face = color_to_face["B"]

    for i, (f0, f1) in enumerate(EDGE_FACELETS):
        c0, c1 = facelet_face(f0), facelet_face(f1)
        # Edge orientation: 0 = correctly oriented, 1 = flipped
        # An edge is oriented correctly if:
        # - The U/D sticker faces U/D, OR
        # - (no U/D sticker) the F/B sticker faces F/B
        if c0 in (u_face, d_face):
            edge_orientation_sum += 0
        elif c1 in (u_face, d_face):
            edge_orientation_sum += 1
        elif c0 in (f_face, b_face):
            edge_orientation_sum += 0
        elif c1 in (f_face, b_face):
            edge_orientation_sum += 1
        else:
            edge_orientation_sum += 0

    if edge_orientation_sum % 2 != 0:
        result.add_error(
            f"Edge orientation sum is {edge_orientation_sum} (must be even). "
            f"One or more edges are flipped. This cube state is not reachable by legal moves.",
        )

    # Step 7: Permutation parity
    # Corner permutation parity
    corner_perm = _get_corner_permutation(state, color_to_face)
    edge_perm = _get_edge_permutation(state, color_to_face)

    if corner_perm is not None and edge_perm is not None:
        corner_parity = _permutation_parity(corner_perm)
        edge_parity = _permutation_parity(edge_perm)
        if corner_parity != edge_parity:
            result.add_error(
                "The permutation parity is wrong (corner parity ≠ edge parity). "
                "This cube state cannot be solved without disassembling the cube. "
                "Please check for swapped pieces.",
            )

    return result


def _get_corner_permutation(state: CubeState, color_to_face: Dict[str, int]) -> Optional[List[int]]:
    """Return corner permutation as a list of 8 integers."""
    facelets = state.facelets
    perm = []
    for f0, f1, f2 in CORNER_FACELETS:
        colors = frozenset([color_to_face[facelets[f0]], color_to_face[facelets[f1]], color_to_face[facelets[f2]]])
        found = False
        for j, expected in enumerate(CORNER_COLORS):
            if frozenset(expected) == colors:
                perm.append(j)
                found = True
                break
        if not found:
            return None
    return perm


def _get_edge_permutation(state: CubeState, color_to_face: Dict[str, int]) -> Optional[List[int]]:
    """Return edge permutation as a list of 12 integers."""
    facelets = state.facelets
    perm = []
    for f0, f1 in EDGE_FACELETS:
        colors = frozenset([color_to_face[facelets[f0]], color_to_face[facelets[f1]]])
        found = False
        for j, expected in enumerate(EDGE_COLORS):
            if frozenset(expected) == colors:
                perm.append(j)
                found = True
                break
        if not found:
            return None
    return perm


def _permutation_parity(perm: List[int]) -> int:
    """Return 0 for even permutation, 1 for odd."""
    visited = [False] * len(perm)
    parity = 0
    for i in range(len(perm)):
        if not visited[i]:
            cycle_length = 0
            j = i
            while not visited[j]:
                visited[j] = True
                j = perm[j]
                cycle_length += 1
            if cycle_length % 2 == 0:
                parity ^= 1
    return parity
