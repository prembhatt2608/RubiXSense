"""
RubiXSense — FastAPI application entry point.
"""

from __future__ import annotations
# pyrefly: ignore[missing-import]
from fastapi import FastAPI
# pyrefly: ignore[missing-import]
from fastapi.middleware.cors import CORSMiddleware

from .api.scan import router as scan_router
from .api.cube import router as cube_router
from .schemas.cube import HealthResponse

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="RubiXSense",
    description="AI-powered Rubik's Cube scanner and solver API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS: allow the frontend dev server and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",    # Vite dev server
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(scan_router, prefix="/api")
app.include_router(cube_router, prefix="/api")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    """Check that the backend is running and dependencies are available."""
    opencv_ok = False
    try:
        import cv2
        opencv_ok = True
    except ImportError:
        pass

    solver_ok = False
    try:
        from .cube.state import CubeState
        s = CubeState.solved()
        solver_ok = s.is_solved()
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        version="1.0.0",
        opencv_available=opencv_ok,
        solver_ready=solver_ok,
        message="RubiXSense backend is running.",
    )


@app.get("/", include_in_schema=False)
async def root():
    return {
        "name": "RubiXSense",
        "status": "running",
        "docs": "/docs",
    }
