"""
Sticker detection module.

Detects the 9 stickers on a Rubik's Cube face using:
1. Contour detection and quadrilateral finding
2. Perspective correction
3. Grid-based region extraction
4. Confidence scoring

Designed to work with live webcam frames from a browser.
"""

from __future__ import annotations
# pyrefly: ignore[missing-import]
import numpy as np
# pyrefly: ignore[missing-import]
import cv2
from typing import List, Tuple, Optional, Dict, Any
from .color_classifier import ColorClassifier, get_classifier


# ---------------------------------------------------------------------------
# Detection result types
# ---------------------------------------------------------------------------

class StickerRegion:
    """Detected region for a single sticker."""
    def __init__(self, bbox: Tuple[int, int, int, int], patch: np.ndarray,
                 color: str, confidence: float, row: int, col: int):
        self.bbox = bbox        # (x, y, w, h)
        self.patch = patch      # BGR image patch
        self.color = color      # Detected color name
        self.confidence = confidence
        self.row = row
        self.col = col


class FaceDetectionResult:
    """Result of detecting a cube face in an image."""
    def __init__(self):
        self.detected: bool = False
        self.confidence: float = 0.0
        self.stickers: List[List[StickerRegion]] = []
        self.colors: List[List[str]] = []
        self.confidences: List[List[float]] = []
        self.quad_corners: Optional[np.ndarray] = None  # 4x2 corner points
        self.warped: Optional[np.ndarray] = None        # perspective-corrected face
        self.message: str = ""
        self.overlay: Optional[np.ndarray] = None       # annotated frame

    def to_dict(self) -> Dict[str, Any]:
        return {
            "detected": self.detected,
            "confidence": self.confidence,
            "colors": self.colors,
            "confidences": self.confidences,
            "message": self.message,
        }


# ---------------------------------------------------------------------------
# Main detector
# ---------------------------------------------------------------------------

class CubeFaceDetector:
    """
    Detects a Rubik's Cube face in a camera frame.
    
    Strategy:
    1. Find the largest square/rectangular contour in the frame.
    2. Apply perspective transform to get a frontal view.
    3. Divide into a 3×3 grid and classify each cell's color.
    4. Alternatively, use the guide rectangle directly if no contour found.
    """

    def __init__(self, classifier: Optional[ColorClassifier] = None):
        self.classifier = classifier or get_classifier()
        # Guide rectangle as fraction of frame (center region)
        self.guide_x_frac = 0.15
        self.guide_y_frac = 0.10
        self.guide_w_frac = 0.70
        self.guide_h_frac = 0.80

    def detect_face(self, frame: np.ndarray) -> FaceDetectionResult:
        """
        Detect a cube face in the given BGR frame.
        
        Args:
            frame: HxWx3 BGR image from webcam
            
        Returns:
            FaceDetectionResult with detected colors and confidence
        """
        result = FaceDetectionResult()
        h, w = frame.shape[:2]

        # Create a working copy for processing
        work = frame.copy()

        # Try contour-based detection first
        quad = self._find_cube_quad(frame, w, h)

        if quad is not None:
            # Apply perspective transform
            warped = self._perspective_warp(frame, quad, size=480)
            result.warped = warped
            result.quad_corners = quad
            result.detected = True
            result.message = "Cube face detected!"
        else:
            # Fallback: use the guide rectangle directly
            gx = int(w * self.guide_x_frac)
            gy = int(h * self.guide_y_frac)
            gw = int(w * self.guide_w_frac)
            gh = int(h * self.guide_h_frac)
            warped = frame[gy:gy+gh, gx:gx+gw]
            if warped.size == 0:
                result.message = "Could not detect cube face."
                return result
            result.warped = warped
            result.detected = True
            result.message = "Using guide rectangle (align cube with the guide)"

        # Extract 3×3 grid patches
        grid_patches = self._extract_grid(result.warped)

        # Classify each sticker
        colors_2d, confs_2d = self.classifier.classify_face_grid(grid_patches)
        result.colors = colors_2d
        result.confidences = confs_2d

        # Build sticker regions
        cell_h = result.warped.shape[0] // 3
        cell_w = result.warped.shape[1] // 3
        sticker_rows = []
        for row in range(3):
            sticker_row = []
            for col in range(3):
                x = col * cell_w
                y = row * cell_h
                bbox = (x, y, cell_w, cell_h)
                patch = grid_patches[row][col]
                sticker = StickerRegion(
                    bbox=bbox,
                    patch=patch,
                    color=colors_2d[row][col],
                    confidence=confs_2d[row][col],
                    row=row,
                    col=col,
                )
                sticker_row.append(sticker)
            sticker_rows.append(sticker_row)
        result.stickers = sticker_rows

        # Overall confidence: average of all sticker confidences
        all_confs = [c for row in confs_2d for c in row]
        result.confidence = sum(all_confs) / len(all_confs) if all_confs else 0.0

        # Generate overlay
        result.overlay = self._draw_overlay(frame, result)

        return result

    def _find_cube_quad(
        self, frame: np.ndarray, w: int, h: int
    ) -> Optional[np.ndarray]:
        """
        Find a quadrilateral that likely represents the cube face.
        Returns 4×2 array of corner points, or None.
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (7, 7), 0)
        edges = cv2.Canny(blurred, 30, 100)

        # Dilate edges slightly
        kernel = np.ones((3, 3), np.uint8)
        edges = cv2.dilate(edges, kernel, iterations=1)

        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        # Filter and sort by area
        min_area = w * h * 0.05
        max_area = w * h * 0.90
        candidates = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if not (min_area < area < max_area):
                continue
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
            if len(approx) == 4:
                # Check roughly square aspect ratio
                rect = cv2.minAreaRect(approx)
                rw, rh = rect[1]
                if rw == 0 or rh == 0:
                    continue
                ratio = max(rw, rh) / min(rw, rh)
                if ratio < 1.6:  # roughly square
                    candidates.append((area, approx.reshape(4, 2)))

        if not candidates:
            return None

        # Use the largest candidate that's reasonably square
        candidates.sort(key=lambda x: x[0], reverse=True)
        _, best_quad = candidates[0]

        # Order corners: top-left, top-right, bottom-right, bottom-left
        return self._order_corners(best_quad.astype(np.float32))

    def _order_corners(self, pts: np.ndarray) -> np.ndarray:
        """Order 4 corners as TL, TR, BR, BL."""
        s = pts.sum(axis=1)
        diff = np.diff(pts, axis=1).ravel()
        tl = pts[np.argmin(s)]
        br = pts[np.argmax(s)]
        tr = pts[np.argmin(diff)]
        bl = pts[np.argmax(diff)]
        return np.array([tl, tr, br, bl], dtype=np.float32)

    def _perspective_warp(
        self, frame: np.ndarray, corners: np.ndarray, size: int = 480
    ) -> np.ndarray:
        """Apply perspective transform to get a square frontal view."""
        dst = np.array([
            [0, 0],
            [size - 1, 0],
            [size - 1, size - 1],
            [0, size - 1],
        ], dtype=np.float32)
        M = cv2.getPerspectiveTransform(corners, dst)
        return cv2.warpPerspective(frame, M, (size, size))

    def _extract_grid(self, face_img: np.ndarray) -> List[List[np.ndarray]]:
        """
        Extract 3×3 grid of patches from a face image.
        Each patch is the inner 60% of each cell to avoid borders.
        """
        h, w = face_img.shape[:2]
        cell_h = h // 3
        cell_w = w // 3
        inner_frac = 0.3  # margin fraction

        grid = []
        for row in range(3):
            row_patches = []
            for col in range(3):
                x0 = col * cell_w
                y0 = row * cell_h
                # Inner region to avoid borders and glare
                mx = int(cell_w * inner_frac)
                my = int(cell_h * inner_frac)
                patch = face_img[y0 + my:y0 + cell_h - my, x0 + mx:x0 + cell_w - mx]
                if patch.size == 0:
                    patch = face_img[y0:y0 + cell_h, x0:x0 + cell_w]
                row_patches.append(patch)
            grid.append(row_patches)
        return grid

    def _draw_overlay(self, frame: np.ndarray, result: FaceDetectionResult) -> np.ndarray:
        """Draw detection overlay on the frame."""
        overlay = frame.copy()
        h, w = frame.shape[:2]

        # Draw guide rectangle
        gx = int(w * self.guide_x_frac)
        gy = int(h * self.guide_y_frac)
        gw = int(w * self.guide_w_frac)
        gh = int(h * self.guide_h_frac)
        cv2.rectangle(overlay, (gx, gy), (gx + gw, gy + gh), (100, 100, 255), 2)

        # Draw detected quad if found
        if result.quad_corners is not None:
            pts = result.quad_corners.astype(np.int32)
            cv2.polylines(overlay, [pts], True, (0, 255, 0), 3)

        # Draw sticker grid overlay
        if result.stickers and result.warped is not None:
            fw = result.warped.shape[1]
            fh = result.warped.shape[0]
            cell_w = fw // 3
            cell_h = fh // 3

            # Scale to overlay position
            if result.quad_corners is not None:
                # Approximate grid cells on original image
                pass  # Complex mapping, skip for overlay

        # Status text
        color_bgr = (0, 255, 0) if result.detected else (0, 0, 255)
        cv2.putText(
            overlay, result.message,
            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color_bgr, 2
        )

        if result.detected:
            conf_pct = int(result.confidence * 100)
            cv2.putText(
                overlay, f"Confidence: {conf_pct}%",
                (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2
            )

        return overlay


def detect_face_from_image_bytes(
    image_bytes: bytes,
    classifier: Optional[ColorClassifier] = None,
) -> FaceDetectionResult:
    """
    Convenience function: detect a cube face from JPEG/PNG image bytes.
    
    Args:
        image_bytes: Raw image bytes (JPEG or PNG)
        classifier: Optional custom classifier
        
    Returns:
        FaceDetectionResult
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        result = FaceDetectionResult()
        result.message = "Could not decode image."
        return result

    detector = CubeFaceDetector(classifier)
    return detector.detect_face(frame)


def extract_dominant_colors_from_centers(
    faces: Dict[str, List[List[str]]],
) -> Dict[str, str]:
    """
    Build color → face letter mapping from center stickers.
    
    Args:
        faces: Dict of face_letter -> 3x3 grid of color names
        
    Returns:
        Dict mapping color name -> face letter
    """
    mapping: Dict[str, str] = {}
    for face_letter, grid in faces.items():
        center_color = grid[1][1]  # center sticker is [1][1]
        mapping[center_color] = face_letter
    return mapping
