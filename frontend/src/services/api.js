/**
 * API service for RubiXSense backend communication.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      status: 'offline',
      error: err.message,
      solver_ready: false,
      opencv_available: false,
    };
  }
}

export async function solveCubeAPI(faceletString, timeout = 15.0) {
  const res = await fetch(`${API_BASE}/cube/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      facelet_string: faceletString,
      cube_state: faceletString,
      timeout,
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
    throw new Error(msg || `Failed to solve cube (${res.status})`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || data.message || 'Solver failed to find a solution.');
  }

  return data;
}

export async function validateCubeAPI(faceletString) {
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
