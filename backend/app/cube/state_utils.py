"""
Utility: convert between color-name grids and facelet strings.
"""

from __future__ import annotations
from typing import Dict, List, Optional, Tuple


# Mapping from color name to default face letter (solved cube, WCA standard)
# White=U, Yellow=D, Red=R, Orange=L, Green=F, Blue=B
DEFAULT_COLOR_TO_FACE: Dict[str, str] = {
    "white":  "U",
    "yellow": "D",
    "red":    "R",
    "orange": "L",
    "green":  "F",
    "blue":   "B",
}

FACE_TO_DEFAULT_COLOR: Dict[str, str] = {v: k for k, v in DEFAULT_COLOR_TO_FACE.items()}

FACE_ORDER = ["U", "R", "F", "D", "L", "B"]


def build_color_to_face_map(
    scanned_centers: Dict[str, str]
) -> Dict[str, str]:
    """
    Build a color→face mapping from the center stickers of each face.
    
    Args:
        scanned_centers: {face_letter: color_name} from the center sticker of each face
        
    Returns:
        {color_name: face_letter}
    """
    return {color: face for face, color in scanned_centers.items()}


def faces_to_facelet_string(
    faces: Dict[str, List[List[str]]],
    color_to_face: Optional[Dict[str, str]] = None,
) -> Tuple[str, Optional[str]]:
    """
    Convert a dict of face grids (color names) to a 54-char facelet string.
    
    Args:
        faces: {face_letter: 3×3 color name grid}
        color_to_face: {color_name: face_letter} mapping
                       If None, builds from center stickers.
        
    Returns:
        (facelet_string, error_message)
        error_message is None if successful.
    """
    # Build the color→face mapping if not provided
    if color_to_face is None:
        scanned_centers: Dict[str, str] = {}
        for face_letter, grid in faces.items():
            center_color = grid[1][1]
            if center_color in scanned_centers.values():
                return "", f"Duplicate center color '{center_color}' on face {face_letter}"
            scanned_centers[face_letter] = center_color
        color_to_face = build_color_to_face_map(scanned_centers)

    # Build facelet string in order U R F D L B
    facelet_str = ""
    for face_letter in FACE_ORDER:
        grid = faces.get(face_letter)
        if grid is None:
            return "", f"Missing face: {face_letter}"
        for row in grid:
            for color in row:
                face_for_color = color_to_face.get(color)
                if face_for_color is None:
                    # Try to map directly (color might already be a face letter)
                    if color.upper() in ("U", "R", "F", "D", "L", "B"):
                        face_for_color = color.upper()
                    else:
                        return "", f"Unknown color: {color!r} on face {face_letter}"
                facelet_str += face_for_color

    if len(facelet_str) != 54:
        return "", f"Expected 54 facelets, got {len(facelet_str)}"

    return facelet_str, None


def facelet_string_to_faces(facelet_string: str) -> Dict[str, List[List[str]]]:
    """
    Convert a 54-char facelet string back to a dict of face grids.
    
    Returns:
        {face_letter: 3×3 grid of face letters}
    """
    if len(facelet_string) != 54:
        raise ValueError(f"Expected 54-char string, got {len(facelet_string)}")

    result: Dict[str, List[List[str]]] = {}
    for i, face_letter in enumerate(FACE_ORDER):
        offset = i * 9
        face_data = facelet_string[offset:offset + 9]
        grid = [
            list(face_data[0:3]),
            list(face_data[3:6]),
            list(face_data[6:9]),
        ]
        result[face_letter] = grid
    return result


def normalize_color(color: str) -> str:
    """Normalize a color string to lowercase."""
    return color.lower().strip()


def color_to_hex(color_name: str) -> str:
    """Convert a color name to a hex color for display."""
    COLOR_HEX = {
        "white":   "#FFFFFF",
        "yellow":  "#FFD700",
        "red":     "#E53935",
        "orange":  "#FF6F00",
        "blue":    "#1565C0",
        "green":   "#2E7D32",
        "unknown": "#9E9E9E",
        # Face letters
        "U": "#FFFFFF",
        "D": "#FFD700",
        "R": "#E53935",
        "L": "#FF6F00",
        "F": "#2E7D32",
        "B": "#1565C0",
    }
    return COLOR_HEX.get(color_name, "#9E9E9E")


def move_to_info(move: str) -> Dict[str, str]:
    """Return display info for a move notation string."""
    from ..cube.notation import MOVE_DESCRIPTIONS, FACE_LETTERS

    face = move[0]
    if move.endswith("2"):
        direction = "180°"
    elif move.endswith("'"):
        direction = "Counter-clockwise"
    else:
        direction = "Clockwise"

    return {
        "notation": move,
        "description": MOVE_DESCRIPTIONS.get(move, f"Rotate {face} face {direction}"),
        "face": face,
        "direction": direction,
    }
