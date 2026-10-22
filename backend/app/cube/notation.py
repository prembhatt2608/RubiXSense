"""
Rubik's Cube notation and move definitions.

Standard face notation:
  U = Up, D = Down, F = Front, B = Back, R = Right, L = Left
  
Move suffixes:
  (none) = clockwise 90°
  '      = counter-clockwise 90°  (prime)
  2      = 180° turn

Face index in the flat facelet string (54 chars):
  U:  0-8
  R:  9-17
  F: 18-26
  D: 27-35
  L: 36-44
  B: 45-53

Facelet layout for each face (row-major, viewed from outside):
  0 1 2
  3 4 5
  6 7 8
"""

from enum import IntEnum
from typing import Dict, List, Tuple

# ---------------------------------------------------------------------------
# Faces
# ---------------------------------------------------------------------------

class Face(IntEnum):
    U = 0
    R = 1
    F = 2
    D = 3
    L = 4
    B = 5

FACE_NAMES: Dict[Face, str] = {
    Face.U: "Up",
    Face.R: "Right",
    Face.F: "Front",
    Face.D: "Down",
    Face.L: "Left",
    Face.B: "Back",
}

FACE_LETTERS: Dict[str, Face] = {
    "U": Face.U,
    "R": Face.R,
    "F": Face.F,
    "D": Face.D,
    "L": Face.L,
    "B": Face.B,
}

# Centers (fixed) — index of the center facelet for each face
CENTER_FACELETS: Dict[Face, int] = {
    Face.U: 4,
    Face.R: 13,
    Face.F: 22,
    Face.D: 31,
    Face.L: 40,
    Face.B: 49,
}

# ---------------------------------------------------------------------------
# Moves
# ---------------------------------------------------------------------------

ALL_MOVES: List[str] = [
    "U", "U'", "U2",
    "D", "D'", "D2",
    "F", "F'", "F2",
    "B", "B'", "B2",
    "R", "R'", "R2",
    "L", "L'", "L2",
]

MOVE_DESCRIPTIONS: Dict[str, str] = {
    "U":  "Rotate the Up face clockwise (when viewed from above).",
    "U'": "Rotate the Up face counter-clockwise.",
    "U2": "Rotate the Up face 180°.",
    "D":  "Rotate the Down face clockwise (when viewed from below).",
    "D'": "Rotate the Down face counter-clockwise.",
    "D2": "Rotate the Down face 180°.",
    "F":  "Rotate the Front face clockwise (when viewed from the front).",
    "F'": "Rotate the Front face counter-clockwise.",
    "F2": "Rotate the Front face 180°.",
    "B":  "Rotate the Back face clockwise (when viewed from the back).",
    "B'": "Rotate the Back face counter-clockwise.",
    "B2": "Rotate the Back face 180°.",
    "R":  "Rotate the Right face clockwise (when viewed from the right).",
    "R'": "Rotate the Right face counter-clockwise.",
    "R2": "Rotate the Right face 180°.",
    "L":  "Rotate the Left face clockwise (when viewed from the left).",
    "L'": "Rotate the Left face counter-clockwise.",
    "L2": "Rotate the Left face 180°.",
}

def parse_move_sequence(solution_str: str) -> List[str]:
    """Parse a space-separated move string into a list of moves."""
    if not solution_str or solution_str.strip() == "":
        return []
    moves = solution_str.strip().split()
    valid = set(ALL_MOVES)
    result = []
    for m in moves:
        if m in valid:
            result.append(m)
        else:
            raise ValueError(f"Unknown move: {m!r}")
    return result

def invert_move(move: str) -> str:
    """Return the inverse of a single move."""
    if move.endswith("2"):
        return move  # 180° is its own inverse
    if move.endswith("'"):
        return move[:-1]
    return move + "'"

def invert_sequence(moves: List[str]) -> List[str]:
    """Return the inverse of a move sequence."""
    return [invert_move(m) for m in reversed(moves)]
