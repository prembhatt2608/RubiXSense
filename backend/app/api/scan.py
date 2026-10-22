"""
FastAPI router for cube scanning (image detection) endpoints.
"""

from __future__ import annotations
import base64
from typing import Optional

from fastapi import APIRouter, HTTPException, status

from ..schemas.cube import DetectRequest, DetectResponse, StickerInfo
from ..vision.sticker_detector import detect_face_from_image_bytes

router = APIRouter(prefix="/scan", tags=["scan"])


@router.post("/detect", response_model=DetectResponse)
async def detect_face(request: DetectRequest) -> DetectResponse:
    """
    Detect sticker colors from a base64-encoded image.
    
    The image should be a photo of one face of the Rubik's Cube,
    taken with the webcam. The backend will:
    1. Decode the image
    2. Detect the cube face region
    3. Extract and classify the 9 stickers
    4. Return color grid and confidence values
    """
    # Decode base64 image
    try:
        # Handle data URL prefix
        img_data = request.image_base64
        if "," in img_data:
            img_data = img_data.split(",", 1)[1]
        image_bytes = base64.b64decode(img_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 image data: {e}",
        )

    if len(image_bytes) < 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image data too small. Please capture a valid image.",
        )

    # Run detection
    try:
        result = detect_face_from_image_bytes(image_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Detection failed: {e}",
        )

    # Build sticker list
    stickers = []
    for row in range(3):
        for col in range(3):
            if result.colors and row < len(result.colors) and col < len(result.colors[row]):
                stickers.append(StickerInfo(
                    row=row,
                    col=col,
                    color=result.colors[row][col],
                    confidence=result.confidences[row][col] if result.confidences else 0.0,
                ))

    # Encode overlay if available
    overlay_b64: Optional[str] = None
    if result.overlay is not None:
        try:
            import cv2
            _, buf = cv2.imencode(".jpg", result.overlay, [cv2.IMWRITE_JPEG_QUALITY, 80])
            overlay_b64 = "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()
        except Exception:
            pass

    return DetectResponse(
        success=True,
        face_letter=request.face_letter,
        detected=result.detected,
        confidence=result.confidence,
        colors=result.colors if result.colors else [["unknown"] * 3] * 3,
        confidences=result.confidences if result.confidences else [[0.0] * 3] * 3,
        stickers=stickers,
        message=result.message,
        overlay_base64=overlay_b64,
    )
