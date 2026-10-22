"""
FastAPI router for cube validation, solving, and simulation.
"""

from __future__ import annotations
from typing import List, Optional

# pyrefly: ignore[missing-import]
from fastapi import APIRouter, HTTPException

from ..schemas.cube import (
    CubeStateRequest, ValidateRequest, ValidationResponse, ValidationErrorDetail,
    SolveRequest, SolveResponse, MoveInfo,
    SimulateRequest, SimulateResponse,
)
from ..cube.state import CubeState
from ..cube.validator import validate_cube
from ..cube.solver import solve, verify_solution
from ..cube.state_utils import faces_to_facelet_string, move_to_info
from ..cube.notation import parse_move_sequence

router = APIRouter(prefix="/cube", tags=["cube"])


@router.post("/validate", response_model=ValidationResponse)
async def validate_cube_state(request: ValidateRequest) -> ValidationResponse:
    """
    Validate a 54-character facelet string.
    
    Checks:
    - Correct character set and color counts
    - Valid center stickers
    - Valid corner and edge pieces
    - Orientation constraints
    - Permutation parity
    """
    try:
        state = CubeState(request.facelet_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = validate_cube(state)
    return ValidationResponse(
        valid=result.valid,
        errors=[
            ValidationErrorDetail(
                message=e.message,
                affected_facelets=e.affected_facelets,
            )
            for e in result.errors
        ],
        warnings=result.warnings,
    )


@router.post("/from-faces", response_model=ValidateRequest)
async def convert_faces_to_facelet(request: CubeStateRequest) -> ValidateRequest:
    """
    Convert a dict of face color grids to a facelet string.
    Useful for preprocessing before solving.
    """
    facelet_str, error = faces_to_facelet_string(request.faces)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return ValidateRequest(facelet_string=facelet_str)


@router.post("/solve", response_model=SolveResponse)
async def solve_cube(request: SolveRequest) -> SolveResponse:
    """
    Solve a Rubik's Cube given its 54-character facelet string.
    
    Returns a move sequence in standard notation (R, U', F2, etc.)
    and verifies the solution by simulating all moves.
    """
    # First validate
    try:
        state = CubeState(request.facelet_string)
    except ValueError as e:
        return SolveResponse(
            success=False,
            error=str(e),
            message="Invalid facelet string.",
        )

    validation = validate_cube(state)
    if not validation.valid:
        errors = [e.message for e in validation.errors[:3]]
        return SolveResponse(
            success=False,
            error="; ".join(errors),
            message="Cube state is invalid. Please rescan or correct the colors.",
        )

    # Check if already solved
    if state.is_solved():
        return SolveResponse(
            success=True,
            already_solved=True,
            solution="",
            moves=[],
            move_count=0,
            verified=True,
            message="The cube is already solved! 🎉",
        )

    # Solve
    try:
        solution_str = solve(
            request.facelet_string,
            max_length=request.max_length,
            timeout=request.timeout,
        )
    except (ValueError, RuntimeError) as e:
        return SolveResponse(
            success=False,
            error=str(e),
            message="Solver failed. Please check the cube state and try again.",
        )
    except Exception as e:
        return SolveResponse(
            success=False,
            error=f"Unexpected error: {e}",
            message="An unexpected error occurred in the solver.",
        )

    # Parse and build move info
    try:
        moves_list = parse_move_sequence(solution_str)
    except ValueError as e:
        return SolveResponse(
            success=False,
            error=str(e),
            message="Solver returned invalid move notation.",
        )

    move_infos = []
    for m in moves_list:
        info = move_to_info(m)
        move_infos.append(MoveInfo(
            notation=info["notation"],
            description=info["description"],
            face=info["face"],
            direction=info["direction"],
        ))

    # Verify solution
    verified = verify_solution(request.facelet_string, solution_str)

    return SolveResponse(
        success=True,
        already_solved=False,
        solution=solution_str,
        moves=move_infos,
        move_count=len(moves_list),
        verified=verified,
        message=f"Solution found in {len(moves_list)} moves!",
    )


@router.post("/simulate", response_model=SimulateResponse)
async def simulate_moves(request: SimulateRequest) -> SimulateResponse:
    """
    Simulate applying a sequence of moves to a cube state.
    
    Returns the final state and optionally each intermediate state.
    """
    try:
        state = CubeState(request.facelet_string)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        moves_list = request.moves
        if not moves_list:
            return SimulateResponse(
                success=True,
                final_state=request.facelet_string,
                is_solved=state.is_solved(),
                message="No moves to apply.",
            )

        steps: Optional[List] = [] if request.step_by_step else None
        current = state
        for move in moves_list:
            current = current.apply_move(move)
            if steps is not None:
                steps.append({"move": move, "state": current.facelets})

        return SimulateResponse(
            success=True,
            final_state=current.facelets,
            is_solved=current.is_solved(),
            steps=steps,
            message="Simulation complete.",
        )

    except ValueError as e:
        return SimulateResponse(
            success=False,
            final_state=request.facelet_string,
            is_solved=False,
            message=f"Move error: {e}",
        )


@router.post("/scramble")
@router.get("/scramble")
async def generate_scramble(moves: int = 20) -> dict:
    """Generate a random valid scramble move sequence."""
    import random
    faces = ["U", "D", "R", "L", "F", "B"]
    modifiers = ["", "'", "2"]
    scramble_moves = []
    last_face = ""
    for _ in range(moves):
        face = random.choice([f for f in faces if f != last_face])
        last_face = face
        scramble_moves.append(face + random.choice(modifiers))
    return {
        "scramble": " ".join(scramble_moves),
        "moves_count": len(scramble_moves),
    }
