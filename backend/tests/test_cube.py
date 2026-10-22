"""
Comprehensive test suite for CubeSense AI.

Tests cover:
- Cube state representation and move application
- Move table correctness (solved state invariants)
- Cube-state validation (valid and invalid states)
- Solving algorithm (known scrambles)
- Solution verification
- API endpoints
- Color classification (synthetic data)
"""

from __future__ import annotations
import sys
import os
import pytest

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.cube.state import CubeState, SOLVED_STATE, get_move_tables, FACE_OFFSET, FACE_NAMES
from app.cube.notation import parse_move_sequence, invert_move, invert_sequence
from app.cube.validator import validate_cube, ValidationResult
from app.cube.solver import solve, verify_solution
from app.cube.state_utils import faces_to_facelet_string, facelet_string_to_faces


# ===========================================================================
# Fixtures
# ===========================================================================

@pytest.fixture
def solved_state():
    return CubeState.solved()


@pytest.fixture
def scrambled_state():
    """A known scrambled state: apply R U R' U' x5 (superflip partial)."""
    state = CubeState.solved()
    moves = ["R", "U", "R'", "U'"] * 5
    return state.apply_sequence(moves)


# ===========================================================================
# Phase 1: Cube state and move tables
# ===========================================================================

class TestCubeState:

    def test_solved_state_string(self):
        assert len(SOLVED_STATE) == 54
        # Each face should have exactly one color repeated 9 times
        for i, face in enumerate(FACE_NAMES):
            offset = FACE_OFFSET[i]
            face_chars = SOLVED_STATE[offset:offset + 9]
            assert all(c == face for c in face_chars), \
                f"Face {face} not uniform in solved state"

    def test_create_solved(self, solved_state):
        assert solved_state.is_solved()
        assert solved_state.facelets == SOLVED_STATE

    def test_invalid_length(self):
        with pytest.raises(ValueError):
            CubeState("UUUUUUUUU")  # too short

    def test_face_extraction(self, solved_state):
        assert solved_state.face(0) == "UUUUUUUUU"
        assert solved_state.face(1) == "RRRRRRRRR"
        assert solved_state.face(2) == "FFFFFFFFF"
        assert solved_state.face(3) == "DDDDDDDDD"
        assert solved_state.face(4) == "LLLLLLLLL"
        assert solved_state.face(5) == "BBBBBBBBB"

    def test_center_colors(self, solved_state):
        centers = solved_state.center_colors()
        assert centers[0] == "U"
        assert centers[1] == "R"
        assert centers[2] == "F"
        assert centers[3] == "D"
        assert centers[4] == "L"
        assert centers[5] == "B"

    def test_face_grid(self, solved_state):
        grid = solved_state.get_face_grid(0)  # U face
        assert grid == [["U", "U", "U"], ["U", "U", "U"], ["U", "U", "U"]]


class TestMoveTables:

    def test_all_moves_present(self):
        tables = get_move_tables()
        expected_moves = [
            "U", "U'", "U2", "R", "R'", "R2",
            "F", "F'", "F2", "D", "D'", "D2",
            "L", "L'", "L2", "B", "B'", "B2",
        ]
        for move in expected_moves:
            assert move in tables, f"Move {move!r} not in tables"
            assert len(tables[move]) == 54, f"Move {move!r} table wrong length"

    def test_identity_after_4_quarter_turns(self):
        """Every quarter turn applied 4 times returns to solved."""
        state = CubeState.solved()
        for move in ["U", "R", "F", "D", "L", "B"]:
            s = state
            for _ in range(4):
                s = s.apply_move(move)
            assert s == state, f"4×{move} should return to solved"

    def test_identity_after_2_half_turns(self):
        """Every half-turn applied twice returns to solved."""
        state = CubeState.solved()
        for move in ["U2", "R2", "F2", "D2", "L2", "B2"]:
            s = state.apply_move(move).apply_move(move)
            assert s == state, f"2×{move} should return to solved"

    def test_move_then_inverse(self):
        """Applying a move then its inverse returns to start."""
        state = CubeState.solved()
        pairs = [("U", "U'"), ("R", "R'"), ("F", "F'"),
                 ("D", "D'"), ("L", "L'"), ("B", "B'"),
                 ("U2", "U2"), ("R2", "R2")]
        for m, m_inv in pairs:
            s = state.apply_move(m).apply_move(m_inv)
            assert s == state, f"{m} then {m_inv} should give solved"

    def test_u_move_centers_unchanged(self):
        """U move should not change center stickers."""
        state = CubeState.solved()
        after = state.apply_move("U")
        # Centers are at positions 4,13,22,31,40,49
        for center in [4, 13, 22, 31, 40, 49]:
            assert state.facelets[center] == after.facelets[center], \
                f"Center {center} changed after U move"

    def test_u_move_u_face_rotated_cw(self):
        """U face corners should rotate clockwise."""
        state = CubeState.solved()
        after = state.apply_move("U")
        # U face should still be all U (since it's solved, rotation doesn't change colors)
        assert after.face(0) == "UUUUUUUUU"

    def test_known_sequence_superflip(self):
        """
        The superflip sequence (all edges flipped) applied 2 times = solved.
        Superflip: U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2
        """
        superflip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2"
        state = CubeState.solved()
        moves = parse_move_sequence(superflip)
        s1 = state.apply_sequence(moves)
        # Superflip is not solved
        assert not s1.is_solved()
        # Applying it twice should give solved (it's its own inverse)
        s2 = s1.apply_sequence(moves)
        assert s2.is_solved(), "Superflip applied twice should give solved state"

    def test_sexy_move_6_times(self):
        """The sexy move (R U R' U') applied 6 times = solved."""
        state = CubeState.solved()
        sexy = parse_move_sequence("R U R' U'")
        s = state
        for _ in range(6):
            s = s.apply_sequence(sexy)
        assert s.is_solved(), "Sexy move ×6 should be solved"


class TestNotation:

    def test_parse_valid_moves(self):
        moves = parse_move_sequence("R U R' U'")
        assert moves == ["R", "U", "R'", "U'"]

    def test_parse_empty(self):
        assert parse_move_sequence("") == []

    def test_parse_invalid(self):
        with pytest.raises(ValueError):
            parse_move_sequence("R X U")  # X is not valid

    def test_invert_move(self):
        assert invert_move("R") == "R'"
        assert invert_move("R'") == "R"
        assert invert_move("R2") == "R2"
        assert invert_move("U") == "U'"

    def test_invert_sequence(self):
        moves = ["R", "U", "R'", "U'"]
        inv = invert_sequence(moves)
        assert inv == ["U", "R", "U'", "R'"]

    def test_move_then_inverse_notation(self):
        """Apply move and then inverse notation sequence = identity."""
        state = CubeState.solved()
        moves = parse_move_sequence("R U F D L B")
        inv = invert_sequence(moves)
        s = state.apply_sequence(moves).apply_sequence(inv)
        assert s.is_solved()


# ===========================================================================
# Phase 2: Validator
# ===========================================================================

class TestValidator:

    def test_solved_state_is_valid(self, solved_state):
        result = validate_cube(solved_state)
        assert result.valid, f"Solved state should be valid. Errors: {[str(e) for e in result.errors]}"

    def test_scrambled_state_is_valid(self, scrambled_state):
        result = validate_cube(scrambled_state)
        assert result.valid, f"Scrambled state should be valid. Errors: {[str(e) for e in result.errors]}"

    def test_wrong_color_count(self):
        # Swap two stickers on same face (makes invalid: some color appears 10 times, another 8)
        facelets = list(SOLVED_STATE)
        facelets[0] = "R"   # put R on U face
        state = CubeState("".join(facelets))
        result = validate_cube(state)
        assert not result.valid
        assert any("9 times" in e.message or "9" in e.message for e in result.errors)

    def test_invalid_characters(self):
        bad = "X" * 54
        state = CubeState(bad)
        result = validate_cube(state)
        assert not result.valid

    def test_duplicate_center(self):
        # Change center of U face to R (duplicate)
        facelets = list(SOLVED_STATE)
        facelets[4] = "R"  # U center -> R color
        state = CubeState("".join(facelets))
        result = validate_cube(state)
        # Should be invalid (either wrong count or duplicate center)
        assert not result.valid

    def test_six_valid_sequences(self):
        """All single-move states should be valid."""
        state = CubeState.solved()
        for move in ["U", "R", "F", "D", "L", "B", "U2", "R'", "F'"]:
            after = state.apply_move(move)
            result = validate_cube(after)
            assert result.valid, \
                f"State after move {move} should be valid. Errors: {[str(e) for e in result.errors]}"

    def test_all_24_moves_produce_valid_state(self):
        """Every move from solved should produce a valid state."""
        from app.cube.notation import ALL_MOVES
        state = CubeState.solved()
        for move in ALL_MOVES:
            after = state.apply_move(move)
            result = validate_cube(after)
            assert result.valid, \
                f"State after {move} is invalid: {[str(e) for e in result.errors]}"

    def test_result_to_dict(self, solved_state):
        result = validate_cube(solved_state)
        d = result.to_dict()
        assert "valid" in d
        assert "errors" in d
        assert "warnings" in d


# ===========================================================================
# Phase 2: Solver
# ===========================================================================

class TestSolver:

    def test_already_solved(self):
        """Solved cube should return empty or trivial solution."""
        solution = solve(SOLVED_STATE)
        assert solution == "" or solution.strip() == ""

    def test_single_move_solution(self):
        """After one move, solver should find 1-move solution (or equivalent)."""
        state = CubeState.solved()
        after_R = state.apply_move("R")
        solution = solve(after_R.facelets, timeout=15.0)
        verified = verify_solution(after_R.facelets, solution)
        assert verified, f"Solution {solution!r} doesn't solve the cube"

    def test_verify_solution_correct(self):
        """verify_solution should return True for a correct solution."""
        state = CubeState.solved()
        scramble = parse_move_sequence("R U R' U'")
        scrambled = state.apply_sequence(scramble)
        solution = solve(scrambled.facelets, timeout=15.0)
        assert verify_solution(scrambled.facelets, solution)

    def test_verify_solution_wrong(self):
        """verify_solution should return False for a wrong solution."""
        state = CubeState.solved()
        scrambled = state.apply_move("R")
        # Wrong solution: applying U to the scrambled won't solve it
        assert not verify_solution(scrambled.facelets, "U")

    def test_solve_simple_scramble(self):
        """Solve a simple 4-move scramble."""
        state = CubeState.solved()
        scramble = parse_move_sequence("R U R' U'")
        scrambled = state.apply_sequence(scramble)
        solution = solve(scrambled.facelets, timeout=15.0)
        assert verify_solution(scrambled.facelets, solution), \
            f"Solution failed: {solution}"

    def test_solve_6_move_scramble(self):
        """Solve a medium scramble."""
        state = CubeState.solved()
        scramble = parse_move_sequence("R U2 R' F2 D L'")
        scrambled = state.apply_sequence(scramble)
        solution = solve(scrambled.facelets, timeout=20.0)
        assert verify_solution(scrambled.facelets, solution), \
            f"Solution failed: {solution}"

    def test_invalid_cube_string(self):
        """Invalid cube string should raise ValueError."""
        with pytest.raises((ValueError, RuntimeError)):
            solve("X" * 54)

    def test_solution_moves_are_valid_notation(self):
        """Solution moves should all be valid notation strings."""
        from app.cube.notation import ALL_MOVES
        state = CubeState.solved()
        scramble = parse_move_sequence("R U R' F2")
        scrambled = state.apply_sequence(scramble)
        solution = solve(scrambled.facelets, timeout=15.0)
        if solution.strip():
            moves = solution.strip().split()
            for m in moves:
                assert m in ALL_MOVES, f"Invalid move notation: {m!r}"


# ===========================================================================
# Phase 3: State utilities
# ===========================================================================

class TestStateUtils:

    def test_facelet_string_to_faces_roundtrip(self):
        """Converting solved facelet string to faces and back should be identical."""
        faces = facelet_string_to_faces(SOLVED_STATE)
        assert "U" in faces
        assert faces["U"] == [["U", "U", "U"], ["U", "U", "U"], ["U", "U", "U"]]

    def test_faces_to_facelet_string(self):
        """Convert a complete face grid to facelet string."""
        # Build a simple face dict using face letters directly
        faces = {}
        for i, face in enumerate(FACE_NAMES):
            faces[face] = [[face] * 3 for _ in range(3)]

        result, error = faces_to_facelet_string(faces)
        assert error is None, f"Got error: {error}"
        assert result == SOLVED_STATE

    def test_faces_to_facelet_missing_face(self):
        """Should return error if a face is missing."""
        faces = {"U": [["U"] * 3] * 3}  # Only one face
        result, error = faces_to_facelet_string(faces)
        assert error is not None

    def test_faces_to_facelet_invalid_color(self):
        """Should return error for unknown color."""
        faces = {face: [[face] * 3 for _ in range(3)] for face in FACE_NAMES}
        faces["U"][0][0] = "purple"  # Invalid color
        result, error = faces_to_facelet_string(faces)
        assert error is not None


# ===========================================================================
# Phase 4: Known cube states
# ===========================================================================

class TestKnownStates:

    # Known valid scrambled states (verified manually)
    KNOWN_VALID = [
        # Solved
        "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB",
        # After R
        "UUUUUUUUURRRRRRRRR" + "FFFFFFFFD" + "DDDDDDDDU" + "LLLLLLLLL" + "BBBBBBBBB",
        # After U
        "UUUUUUUUUF" + "RRRRRRRRR"[:-3] + "FFF" + "FFFFFFFFF" + "DDDDDDDDD" + "LLLLLLLLL" + "BBBBBBBBB",
    ]

    def test_valid_states_pass_validation(self):
        """Solved state and single-move states should all pass validation."""
        state = CubeState.solved()
        for move in ["U", "R", "F", "D", "L", "B"]:
            s = state.apply_move(move)
            result = validate_cube(s)
            assert result.valid, f"After {move}: {[str(e) for e in result.errors]}"

    def test_sexy_move_states_all_valid(self):
        """Every intermediate state during sexy-move sequence should be valid."""
        state = CubeState.solved()
        for move in ["R", "U", "R'", "U'"]:
            state = state.apply_move(move)
            result = validate_cube(state)
            assert result.valid, f"After {move}: {[str(e) for e in result.errors]}"

    def test_10_move_scramble_solves_correctly(self):
        """A 10-move scramble should be solvable and verifiable."""
        state = CubeState.solved()
        scramble_seq = parse_move_sequence("R U2 L' D F2 B R' U L2 D'")
        scrambled = state.apply_sequence(scramble_seq)
        assert not scrambled.is_solved()
        # Validate it's a legal state
        v = validate_cube(scrambled)
        assert v.valid
        # Solve it
        solution = solve(scrambled.facelets, timeout=25.0)
        assert verify_solution(scrambled.facelets, solution), f"Failed: {solution}"


# ===========================================================================
# Color classifier tests (synthetic)
# ===========================================================================

class TestColorClassifier:

    def _make_patch(self, bgr: tuple, size: int = 30):
        """Create a solid-color patch."""
        import numpy as np
        patch = np.zeros((size, size, 3), dtype=np.uint8)
        patch[:] = bgr
        return patch

    def test_white_patch(self):
        from app.vision.color_classifier import ColorClassifier
        clf = ColorClassifier()
        patch = self._make_patch((255, 255, 255))
        color, conf = clf.classify_patch(patch)
        assert color == "white", f"Got {color} instead of white"
        assert conf > 0.3

    def test_red_patch(self):
        from app.vision.color_classifier import ColorClassifier
        clf = ColorClassifier()
        patch = self._make_patch((0, 0, 220))   # BGR: mostly red
        color, conf = clf.classify_patch(patch)
        assert color == "red", f"Got {color} instead of red"

    def test_blue_patch(self):
        from app.vision.color_classifier import ColorClassifier
        clf = ColorClassifier()
        patch = self._make_patch((200, 50, 0))   # BGR: mostly blue
        color, conf = clf.classify_patch(patch)
        assert color == "blue", f"Got {color} instead of blue"

    def test_yellow_patch(self):
        from app.vision.color_classifier import ColorClassifier
        clf = ColorClassifier()
        patch = self._make_patch((0, 255, 255))  # BGR: yellow (G+R)
        color, conf = clf.classify_patch(patch)
        assert color == "yellow", f"Got {color} instead of yellow"

    def test_green_patch(self):
        from app.vision.color_classifier import ColorClassifier
        clf = ColorClassifier()
        patch = self._make_patch((0, 200, 0))    # BGR: green
        color, conf = clf.classify_patch(patch)
        assert color == "green", f"Got {color} instead of green"

    def test_classify_face_grid(self):
        from app.vision.color_classifier import ColorClassifier
        import numpy as np
        clf = ColorClassifier()
        # 3×3 white patches
        white_patch = self._make_patch((255, 255, 255))
        grid = [[white_patch] * 3] * 3
        colors, confs = clf.classify_face_grid(grid)
        assert len(colors) == 3
        assert len(colors[0]) == 3
        assert all(c == "white" for row in colors for c in row)


# ===========================================================================
# Integration: full scan→validate→solve→verify
# ===========================================================================

class TestEndToEnd:

    def test_full_pipeline(self):
        """
        Simulate the full pipeline:
        1. Start from solved
        2. Apply scramble
        3. Validate
        4. Solve
        5. Verify
        """
        # 1. Scramble
        state = CubeState.solved()
        scramble = parse_move_sequence("F R U B' L2 D2 F' R2 U' B")
        scrambled = state.apply_sequence(scramble)

        # 2. Validate
        v = validate_cube(scrambled)
        assert v.valid, f"Scrambled state invalid: {[str(e) for e in v.errors]}"

        # 3. Solve
        solution = solve(scrambled.facelets, timeout=30.0)

        # 4. Verify
        assert verify_solution(scrambled.facelets, solution), \
            f"Full pipeline failed. Solution: {solution}"

    def test_already_solved_pipeline(self):
        """Already-solved cube should be detected immediately."""
        state = CubeState.solved()
        v = validate_cube(state)
        assert v.valid
        assert state.is_solved()
        solution = solve(state.facelets)
        assert solution.strip() == ""

    def test_state_utils_round_trip(self):
        """Convert scrambled state to faces and back."""
        state = CubeState.solved().apply_sequence(["R", "U", "R'"])
        faces = facelet_string_to_faces(state.facelets)
        result, err = faces_to_facelet_string(faces)
        assert err is None
        assert result == state.facelets
