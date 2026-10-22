"""
Color classifier for Rubik's Cube sticker detection.

Uses HSV and Lab color spaces with calibrated reference colors.
Handles white, yellow, red, orange, blue, and green.
"""

from __future__ import annotations
# pyrefly: ignore[missing-import]
import numpy as np
from typing import List, Tuple, Dict, Optional
# pyrefly: ignore[missing-import]
import cv2


# ---------------------------------------------------------------------------
# Reference HSV color ranges for each face color
# Format: (H_min, H_max, S_min, S_max, V_min, V_max)
# H is in [0,180] in OpenCV, S and V in [0,255]
# ---------------------------------------------------------------------------

COLOR_NAMES = ["White", "Yellow", "Red", "Orange", "Blue", "Green"]

# Standard cube face letters
COLOR_LETTERS = ["U", "D", "R", "L", "B", "F"]  # Will be mapped based on centers

# HSV reference ranges for each color
HSV_RANGES: Dict[str, List[Tuple[int, int, int, int, int, int]]] = {
    "white":  [(0, 180, 0, 80, 180, 255)],   # low saturation, high value
    "yellow": [(20, 35, 100, 255, 100, 255)],
    "red":    [(0, 10, 100, 255, 100, 255),(165, 180, 100, 255, 100, 255)],  # red wraps around in HSV
    "orange": [(10, 25, 120, 255, 100, 255)],
    "blue":   [(95, 135, 100, 255, 50, 255)],
    "green":  [(36, 90, 60, 255, 50, 255)],
}

# Reference Lab values for distance-based classification (calibrated)
# (L, a, b) in OpenCV Lab space (L: 0-255, a: 0-255, b: 0-255, shifted by 128)
LAB_REFERENCE: Dict[str, Tuple[float, float, float]] = {
    "white":  (200, 128, 128),   # High L, neutral a/b
    "yellow": (170, 115, 175),   # High L, negative a, positive b
    "red":    (80, 185, 148),    # Medium L, positive a
    "orange": (120, 170, 175),   # Medium L, positive a+b
    "blue":   (80, 125, 90),     # Low L, negative b
    "green":  (100, 105, 148),   # Medium L, negative a+b
}


class ColorClassifier:
    """
    Classifies a color patch as one of the 6 standard cube colors.
    
    Uses a weighted combination of:
    1. HSV range matching
    2. Lab color distance
    """

    def __init__(self, calibration: Optional[Dict[str, np.ndarray]] = None):
        """
        Args:
            calibration: Optional dict mapping color names to reference BGR arrays.
                         Used to adapt reference values to specific lighting conditions.
        """
        self.lab_refs = dict(LAB_REFERENCE)
        if calibration:
            self._update_calibration(calibration)

    def _update_calibration(self, calibration: Dict[str, np.ndarray]) -> None:
        """Update Lab reference values from calibrated color patches."""
        for color_name, bgr_patch in calibration.items():
            if color_name not in self.lab_refs:
                continue
            # Convert BGR patch to Lab
            if bgr_patch.ndim == 2:
                bgr_patch = bgr_patch[:, :, np.newaxis].repeat(3, axis=2)
            mean_bgr = bgr_patch.mean(axis=(0, 1)).astype(np.uint8)
            lab_pixel = cv2.cvtColor(
                mean_bgr.reshape(1, 1, 3), cv2.COLOR_BGR2Lab
            )[0, 0]
            self.lab_refs[color_name] = (
                float(lab_pixel[0]),
                float(lab_pixel[1]),
                float(lab_pixel[2]),
            )

    def classify_patch(self, bgr_patch: np.ndarray) -> Tuple[str, float]:
        """
        Classify a BGR image patch as a cube color.
        
        Args:
            bgr_patch: HxWx3 BGR numpy array (center region of a sticker)
            
        Returns:
            (color_name, confidence) where color_name is one of:
            "white", "yellow", "red", "orange", "blue", "green"
            and confidence is in [0, 1].
        """
        if bgr_patch.size == 0:
            return "unknown", 0.0

        # Sample the central region to avoid edge effects
        h, w = bgr_patch.shape[:2]
        cy, cx = h // 2, w // 2
        margin = min(h, w) // 4
        sample = bgr_patch[
            max(0, cy - margin):cy + margin + 1,
            max(0, cx - margin):cx + margin + 1
        ]
        if sample.size == 0:
            sample = bgr_patch

        # Convert to HSV and Lab
        hsv = cv2.cvtColor(sample, cv2.COLOR_BGR2HSV)
        lab = cv2.cvtColor(sample, cv2.COLOR_BGR2Lab)

        mean_hsv = hsv.mean(axis=(0, 1))
        mean_lab = lab.mean(axis=(0, 1))

        # Score each color
        scores: Dict[str, float] = {}
        for color_name, ranges in HSV_RANGES.items():
            hsv_score = self._hsv_score(mean_hsv, ranges)
            lab_score = self._lab_score(mean_lab, self.lab_refs[color_name])
            scores[color_name] = 0.5 * hsv_score + 0.5 * lab_score

        # Best match
        best_color = max(scores, key=lambda k: scores[k])
        best_score = scores[best_color]

        # Confidence: difference between best and second-best
        sorted_scores = sorted(scores.values(), reverse=True)
        if len(sorted_scores) > 1:
            confidence = min(1.0, (sorted_scores[0] - sorted_scores[1]) * 2 + sorted_scores[0] * 0.5)
        else:
            confidence = best_score

        return best_color, min(1.0, max(0.0, confidence))

    def _hsv_score(self, mean_hsv: np.ndarray, ranges: List[Tuple]) -> float:
        """Score how well a mean HSV value matches a set of HSV ranges."""
        h, s, v = float(mean_hsv[0]), float(mean_hsv[1]), float(mean_hsv[2])
        best = 0.0
        for h_min, h_max, s_min, s_max, v_min, v_max in ranges:
            # Check membership with soft margins
            h_in = _in_range_soft(h, h_min, h_max, 10)
            s_in = _in_range_soft(s, s_min, s_max, 20)
            v_in = _in_range_soft(v, v_min, v_max, 30)
            score = h_in * s_in * v_in
            best = max(best, score)
        return best

    def _lab_score(self, mean_lab: np.ndarray, ref: Tuple[float, float, float]) -> float:
        """Score based on Euclidean distance in Lab space."""
        L, a, b = float(mean_lab[0]), float(mean_lab[1]), float(mean_lab[2])
        rL, ra, rb = ref
        # Weighted distance (L is less discriminative than a,b for cube colors)
        dist = ((L - rL) ** 2 * 0.5 + (a - ra) ** 2 + (b - rb) ** 2) ** 0.5
        # Convert to score: max distance ≈ 200, score = 1 - dist/200
        score = max(0.0, 1.0 - dist / 150.0)
        return score

    def classify_face_grid(
        self, grid_patches: List[List[np.ndarray]]
    ) -> Tuple[List[List[str]], List[List[float]]]:
        """
        Classify all 9 patches in a 3×3 grid.
        
        Args:
            grid_patches: 3×3 list of BGR patches
            
        Returns:
            (colors, confidences): both 3×3 lists
        """
        colors = []
        confidences = []
        for row in grid_patches:
            color_row = []
            conf_row = []
            for patch in row:
                color, conf = self.classify_patch(patch)
                color_row.append(color)
                conf_row.append(conf)
            colors.append(color_row)
            confidences.append(conf_row)
        return colors, confidences

    def get_dominant_color_bgr(self, color_name: str) -> Tuple[int, int, int]:
        """Return a representative BGR color for a color name."""
        COLOR_BGR = {
            "white":  (255, 255, 255),
            "yellow": (0, 255, 255),
            "red":    (0, 0, 220),
            "orange": (0, 128, 255),
            "blue":   (220, 60, 0),
            "green":  (0, 180, 0),
            "unknown": (128, 128, 128),
        }
        return COLOR_BGR.get(color_name, (128, 128, 128))


def _in_range_soft(val: float, lo: float, hi: float, margin: float) -> float:
    """Soft range membership: 1.0 inside, tapering at edges."""
    if lo <= val <= hi:
        return 1.0
    elif val < lo:
        return max(0.0, 1.0 - (lo - val) / margin)
    else:
        return max(0.0, 1.0 - (val - hi) / margin)


# Singleton classifier
_default_classifier: Optional[ColorClassifier] = None


def get_classifier() -> ColorClassifier:
    global _default_classifier
    if _default_classifier is None:
        _default_classifier = ColorClassifier()
    return _default_classifier


def color_name_to_face_letter(
    color_name: str,
    color_to_letter_map: Dict[str, str],
) -> str:
    """
    Convert a color name (e.g. 'white') to a face letter (e.g. 'U').
    Requires a calibrated map built from center stickers.
    """
    return color_to_letter_map.get(color_name, "?")
