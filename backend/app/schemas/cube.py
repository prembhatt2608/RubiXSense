"""
Pydantic schemas for CubeSense AI API requests and responses.
"""

from __future__ import annotations
from typing import List, Optional, Dict, Any
# pyrefly: ignore[missing-import]
from pydantic import BaseModel, Field, field_validator, AliasChoices


# ---------------------------------------------------------------------------
# Shared types
# ---------------------------------------------------------------------------

class ColorGrid(BaseModel):
    """3×3 grid of color names or face letters."""
    grid: List[List[str]] = Field(..., description="3×3 grid of color values")

    @field_validator("grid")
    @classmethod
    def validate_grid(cls, v: List[List[str]]) -> List[List[str]]:
        if len(v) != 3:
            raise ValueError("Grid must have exactly 3 rows")
        for row in v:
            if len(row) != 3:
                raise ValueError("Each grid row must have exactly 3 columns")
        return v


class ValidationErrorDetail(BaseModel):
    message: str
    affected_facelets: List[int] = []


class ValidationResponse(BaseModel):
    valid: bool
    errors: List[ValidationErrorDetail] = []
    warnings: List[str] = []


# ---------------------------------------------------------------------------
# Scan / detect endpoint
# ---------------------------------------------------------------------------

class DetectRequest(BaseModel):
    """
    Request to detect sticker colors from a base64-encoded image.
    The image should be a JPEG/PNG from the browser webcam.
    """
    image_base64: str = Field(..., description="Base64-encoded image bytes")
    face_letter: str = Field(..., description="Which face is being scanned: U/R/F/D/L/B")

    @field_validator("face_letter")
    @classmethod
    def validate_face(cls, v: str) -> str:
        v = v.upper()
        if v not in ("U", "R", "F", "D", "L", "B"):
            raise ValueError(f"face_letter must be one of U,R,F,D,L,B, got {v!r}")
        return v


class StickerInfo(BaseModel):
    row: int
    col: int
    color: str
    confidence: float


class DetectResponse(BaseModel):
    success: bool
    face_letter: str
    detected: bool
    confidence: float
    colors: List[List[str]]     # 3×3 grid of color names
    confidences: List[List[float]]  # 3×3 grid of confidence values
    stickers: List[StickerInfo]
    message: str
    overlay_base64: Optional[str] = None  # annotated image


# ---------------------------------------------------------------------------
# Cube state submission
# ---------------------------------------------------------------------------

class FaceData(BaseModel):
    """Data for one face of the cube."""
    face_letter: str
    colors: List[List[str]]   # 3×3 grid

    @field_validator("face_letter")
    @classmethod
    def validate_face(cls, v: str) -> str:
        v = v.upper()
        if v not in ("U", "R", "F", "D", "L", "B"):
            raise ValueError(f"face_letter must be one of U,R,F,D,L,B")
        return v

    @field_validator("colors")
    @classmethod
    def validate_colors(cls, v: List[List[str]]) -> List[List[str]]:
        if len(v) != 3:
            raise ValueError("Colors grid must have 3 rows")
        for row in v:
            if len(row) != 3:
                raise ValueError("Each row must have 3 elements")
        return v


class CubeStateRequest(BaseModel):
    """
    Complete cube state from all 6 scanned faces.
    Colors are specified as color names (white/yellow/red/orange/blue/green)
    or directly as face letters (U/R/F/D/L/B).
    """
    faces: Dict[str, List[List[str]]] = Field(
        ...,
        description="Mapping of face_letter -> 3x3 color grid"
    )

    @field_validator("faces")
    @classmethod
    def validate_faces(cls, v: Dict[str, List[List[str]]]) -> Dict[str, List[List[str]]]:
        required = {"U", "R", "F", "D", "L", "B"}
        provided = {k.upper() for k in v.keys()}
        missing = required - provided
        if missing:
            raise ValueError(f"Missing faces: {', '.join(sorted(missing))}")
        return {k.upper(): val for k, val in v.items()}


class ValidateRequest(BaseModel):
    """Request to validate a cube state."""
    facelet_string: str = Field(
        ...,
        validation_alias=AliasChoices("facelet_string", "cube_state"),
        description="54-character facelet string using U/R/F/D/L/B",
        min_length=54,
        max_length=54,
    )


class SolveRequest(BaseModel):
    """Request to solve a cube given its facelet string."""
    facelet_string: str = Field(
        ...,
        validation_alias=AliasChoices("facelet_string", "cube_state"),
        description="54-character facelet string",
        min_length=54,
        max_length=54,
    )
    max_length: int = Field(default=25, ge=1, le=30)
    timeout: float = Field(default=10.0, ge=1.0, le=30.0)


class MoveInfo(BaseModel):
    """Information about a single move."""
    notation: str
    description: str
    face: str
    direction: str   # "CW", "CCW", "180"


class SolveResponse(BaseModel):
    success: bool
    already_solved: bool = False
    solution: str = ""                    # Space-separated move string
    moves: List[MoveInfo] = []
    move_count: int = 0
    verified: bool = False
    message: str = ""
    error: Optional[str] = None


class SimulateRequest(BaseModel):
    """Request to simulate applying moves to a cube state."""
    facelet_string: str = Field(
        ...,
        validation_alias=AliasChoices("facelet_string", "cube_state"),
        min_length=54,
        max_length=54,
    )
    moves: List[str] = Field(..., description="List of moves to apply")
    step_by_step: bool = Field(default=False, description="Return state after each move")


class SimulateResponse(BaseModel):
    success: bool
    final_state: str
    is_solved: bool
    steps: Optional[List[Dict[str, str]]] = None   # if step_by_step=True
    message: str = ""


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    opencv_available: bool
    solver_ready: bool
    message: str = ""
