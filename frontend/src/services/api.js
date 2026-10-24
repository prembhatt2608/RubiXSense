/**
 * API service for RubiXSense backend communication.
 * Includes automatic client-side Kociemba solver fallback
 * so the solver works seamlessly even when the backend is offline.
 */

import Cube from 'cubejs';
import { parseMoveString } from '../utils/cubeMath';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Pre-initialize client-side Kociemba solver tables in the background
let solverInitialized = false;
let solverInitPromise = null;

export function initClientSolver() {
  if (solverInitialized) return Promise.resolve();
  if (solverInitPromise) return solverInitPromise;
  solverInitPromise = new Promise((resolve) => {
    setTimeout(() => {
      try {
        Cube.initSolver();
        solverInitialized = true;
      } catch (e) {
        console.warn('Client solver init warning:', e);
      }
      resolve();
    }, 50);
  });
  return solverInitPromise;
}

if (typeof window !== 'undefined') {
  initClientSolver();
}

/**
 * Solve cube using client-side Kociemba algorithm.
 */
export function solveClientSide(faceletString) {
  if (!solverInitialized) {
    Cube.initSolver();
    solverInitialized = true;
  }

  const cube = Cube.fromString(faceletString);
  if (cube.isSolved()) {
    return {
      success: true,
      already_solved: true,
      solution: '',
      moves: [],
      move_count: 0,
      verified: true,
      message: 'The cube is already solved! 🎉',
    };
  }

  const solution = cube.solve();
  const movesList = parseMoveString(solution);

  return {
    success: true,
    already_solved: false,
    solution,
    moves: movesList.map((m) => ({
      notation: m,
      description: `Turn ${m[0]} face`,
      face: m[0],
      direction: m.includes("'") ? 'CCW' : m.includes('2') ? '180' : 'CW',
    })),
    move_count: movesList.length,
    verified: true,
    message: `Solution found in ${movesList.length} moves!`,
  };
}

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      status: 'offline',
      error: err.message,
      solver_ready: true, // Client engine is ready
      opencv_available: false,
    };
  }
}

export async function solveCubeAPI(faceletString, timeout = 15.0) {
  // First attempt to solve with the FastAPI backend
  try {
    const res = await fetch(`${API_BASE}/cube/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facelet_string: faceletString,
        cube_state: faceletString,
        timeout,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        return data;
      }
      // If backend reports invalid parity or impossible pieces, report that clearly
      if (data.error && (data.error.includes('parity') || data.error.includes('orientation') || data.error.includes('impossible'))) {
        throw new Error(data.error || data.message);
      }
    }
  } catch (err) {
    // If it's a specific cube validation error, propagate it
    if (err.message && (err.message.includes('parity') || err.message.includes('orientation') || err.message.includes('impossible'))) {
      throw err;
    }
    // Otherwise fallback to client solver
    console.info('Backend API unavailable or errored, solving client-side with Kociemba engine.');
  }

  // Client-side fallback solver
  try {
    return solveClientSide(faceletString);
  } catch (clientErr) {
    throw new Error(clientErr.message || 'Unable to solve this cube state. Please verify sticker colors and centers.');
  }
}

export async function validateCubeAPI(faceletString) {
  try {
    const res = await fetch(`${API_BASE}/cube/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facelet_string: faceletString,
        cube_state: faceletString,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      let msg = errData.message;
      if (typeof errData.detail === 'string') {
        msg = errData.detail;
      } else if (Array.isArray(errData.detail) && errData.detail.length > 0) {
        msg = errData.detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
      }
      throw new Error(msg || `Validation error (${res.status})`);
    }

    return await res.json();
  } catch {
    // Client-side fallback validation
    const counts = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
    for (const char of faceletString) {
      if (counts[char] !== undefined) counts[char]++;
    }
    const valid = Object.values(counts).every((c) => c === 9);
    return {
      valid,
      errors: valid ? [] : [{ message: 'Each of the 6 colors must have exactly 9 stickers.' }],
      warnings: [],
    };
  }
}

export async function generateScrambleAPI(movesCount = 20) {
  try {
    const res = await fetch(`${API_BASE}/cube/scramble?moves=${movesCount}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Scramble API unavailable');
    return await res.json();
  } catch {
    // Client-side fallback random scramble generator
    const MOVES = ["U", "D", "R", "L", "F", "B"];
    const MODS = ["", "'", "2"];
    const moves = [];
    let lastFace = -1;

    for (let i = 0; i < movesCount; i++) {
      let face;
      do {
        face = Math.floor(Math.random() * MOVES.length);
      } while (face === lastFace);
      lastFace = face;
      const mod = MODS[Math.floor(Math.random() * MODS.length)];
      moves.push(MOVES[face] + mod);
    }

    return {
      scramble: moves.join(' '),
      moves_count: moves.length,
    };
  }
}

export async function uploadFaceScan(faceName, imageBlob) {
  const formData = new FormData();
  formData.append('file', imageBlob, `${faceName}.png`);
  formData.append('face_name', faceName);

  const res = await fetch(`${API_BASE}/scan/face`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Face scan failed (${res.status})`);
  }

  return await res.json();
}
