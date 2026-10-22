/**
 * Pure JavaScript Rubik's Cube state logic, move tables, and notation utilities.
 * Uses the exact, verified permutation tables.
 */

export const SOLVED_STATE = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

export const FACE_NAMES = ["U", "R", "F", "D", "L", "B"];
export const FACE_COLORS = {
  U: { name: "White", hex: "#f8fafc", text: "#0f172a" },
  R: { name: "Red", hex: "#ef4444", text: "#ffffff" },
  F: { name: "Green", hex: "#10b981", text: "#ffffff" },
  D: { name: "Yellow", hex: "#facc15", text: "#0f172a" },
  L: { name: "Orange", hex: "#f97316", text: "#ffffff" },
  B: { name: "Blue", hex: "#3b82f6", text: "#ffffff" },
};

export const COLOR_KEYS = ["U", "R", "F", "D", "L", "B"];

// Verified base move permutations mapping new[i] = old[perm[i]]
function buildBaseMoveTables() {
  const m = {};

  // U
  const u = Array.from({ length: 54 }, (_, i) => i);
  u[2] = 0; u[8] = 2; u[6] = 8; u[0] = 6;
  u[5] = 1; u[7] = 5; u[3] = 7; u[1] = 3;
  u[45] = 36; u[9] = 45; u[18] = 9; u[36] = 18;
  u[11] = 47; u[20] = 11; u[38] = 20; u[47] = 38;
  u[10] = 46; u[19] = 10; u[37] = 19; u[46] = 37;
  m["U"] = u;

  // D
  const d = Array.from({ length: 54 }, (_, i) => i);
  d[29] = 27; d[35] = 29; d[33] = 35; d[27] = 33;
  d[32] = 28; d[34] = 32; d[30] = 34; d[28] = 30;
  d[26] = 44; d[17] = 26; d[53] = 17; d[44] = 53;
  d[15] = 24; d[51] = 15; d[42] = 51; d[24] = 42;
  d[16] = 25; d[52] = 16; d[43] = 52; d[25] = 43;
  m["D"] = d;

  // F
  const f = Array.from({ length: 54 }, (_, i) => i);
  f[20] = 18; f[26] = 20; f[24] = 26; f[18] = 24;
  f[23] = 19; f[25] = 23; f[21] = 25; f[19] = 21;
  f[9] = 6; f[29] = 9; f[44] = 29; f[6] = 44;
  f[8] = 38; f[15] = 8; f[27] = 15; f[38] = 27;
  f[12] = 7; f[28] = 12; f[41] = 28; f[7] = 41;
  m["F"] = f;

  // B
  const b = Array.from({ length: 54 }, (_, i) => i);
  b[47] = 45; b[53] = 47; b[51] = 53; b[45] = 51;
  b[50] = 46; b[52] = 50; b[48] = 52; b[46] = 48;
  b[36] = 2; b[33] = 36; b[17] = 33; b[2] = 17;
  b[0] = 11; b[42] = 0; b[35] = 42; b[11] = 35;
  b[39] = 1; b[34] = 39; b[14] = 34; b[1] = 14;
  m["B"] = b;

  // L
  const l = Array.from({ length: 54 }, (_, i) => i);
  l[38] = 36; l[44] = 38; l[42] = 44; l[36] = 42;
  l[41] = 37; l[43] = 41; l[39] = 43; l[37] = 39;
  l[18] = 0; l[27] = 18; l[53] = 27; l[0] = 53;
  l[6] = 47; l[24] = 6; l[33] = 24; l[47] = 33;
  l[21] = 3; l[30] = 21; l[50] = 30; l[3] = 50;
  m["L"] = l;

  // R
  const r = Array.from({ length: 54 }, (_, i) => i);
  r[11] = 9; r[17] = 11; r[15] = 17; r[9] = 15;
  r[14] = 10; r[16] = 14; r[12] = 16; r[10] = 12;
  r[45] = 8; r[35] = 45; r[26] = 35; r[8] = 26;
  r[2] = 20; r[51] = 2; r[29] = 51; r[20] = 29;
  r[48] = 5; r[32] = 48; r[23] = 32; r[5] = 23;
  m["R"] = r;

  function compose(p1, p2) {
    return Array.from({ length: 54 }, (_, i) => p1[p2[i]]);
  }

  const all = {};
  for (const [face, perm] of Object.entries(m)) {
    all[face] = perm;
    const p2 = compose(perm, perm);
    const p3 = compose(p2, perm);
    all[face + "2"] = p2;
    all[face + "'"] = p3;
  }
  return all;
}

export const MOVE_TABLES = buildBaseMoveTables();

/**
 * Apply a single move (e.g. "R", "U'", "F2") to a 54-char facelet string.
 */
export function applyMove(facelets, move) {
  const perm = MOVE_TABLES[move];
  if (!perm) return facelets;
  let res = "";
  for (let i = 0; i < 54; i++) {
    res += facelets[perm[i]];
  }
  return res;
}

/**
 * Apply a sequence of moves to a cube state.
 */
export function applySequence(facelets, moveList) {
  let cur = facelets;
  for (const m of moveList) {
    cur = applyMove(cur, m);
  }
  return cur;
}

/**
 * Split notation string into array of clean move tokens.
 */
export function parseMoveString(notation) {
  if (!notation) return [];
  return notation
    .trim()
    .split(/\s+/)
    .filter((m) => m && MOVE_TABLES[m]);
}

/**
 * Reverse a move (e.g. "R" -> "R'", "U'" -> "U", "F2" -> "F2")
 */
export function invertMove(move) {
  if (move.endsWith("'")) return move.slice(0, -1);
  if (move.endsWith("2")) return move;
  return move + "'";
}

/**
 * Reverse a whole move sequence.
 */
export function invertSequence(moveList) {
  return [...moveList].reverse().map(invertMove);
}

/**
 * Extract 6 face 3x3 grids from 54-char string.
 */
export function faceletStringToFaces(str) {
  const s = str.length === 54 ? str : SOLVED_STATE;
  return {
    U: [
      [s[0], s[1], s[2]],
      [s[3], s[4], s[5]],
      [s[6], s[7], s[8]],
    ],
    R: [
      [s[9], s[10], s[11]],
      [s[12], s[13], s[14]],
      [s[15], s[16], s[17]],
    ],
    F: [
      [s[18], s[19], s[20]],
      [s[21], s[22], s[23]],
      [s[24], s[25], s[26]],
    ],
    D: [
      [s[27], s[28], s[29]],
      [s[30], s[31], s[32]],
      [s[33], s[34], s[35]],
    ],
    L: [
      [s[36], s[37], s[38]],
      [s[39], s[40], s[41]],
      [s[42], s[43], s[44]],
    ],
    B: [
      [s[45], s[46], s[47]],
      [s[48], s[49], s[50]],
      [s[51], s[52], s[53]],
    ],
  };
}

/**
 * Convert 6 face 3x3 grids back into 54-char string.
 */
export function facesToFaceletString(faces) {
  let s = "";
  for (const f of FACE_NAMES) {
    if (!faces[f]) return SOLVED_STATE;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        s += faces[f][r][c] || f;
      }
    }
  }
  return s;
}

/**
 * Basic client-side validation check (counts, centers).
 */
export function validateStateLocally(facelets) {
  const counts = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
  for (const char of facelets) {
    if (counts[char] !== undefined) counts[char]++;
  }

  const centers = [
    facelets[4],
    facelets[13],
    facelets[22],
    facelets[31],
    facelets[40],
    facelets[49],
  ];

  const uniqueCenters = new Set(centers);
  const isValidCounts = Object.values(counts).every((c) => c === 9);
  const isValidCenters = uniqueCenters.size === 6;

  return {
    valid: isValidCounts && isValidCenters,
    counts,
    centers,
    hasNineEach: isValidCounts,
    hasDistinctCenters: isValidCenters,
    isSolved: facelets === SOLVED_STATE,
  };
}

/**
 * Built-in famous preset scrambles & patterns.
 */
export const PRESET_PATTERNS = {
  superflip: {
    name: "Superflip (All Edges Flipped)",
    moves: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
    description: "God's Algorithm benchmark (20 moves)",
  },
  checkerboard: {
    name: "Checkerboard",
    moves: "U2 D2 R2 L2 F2 B2",
    description: "Classic alternating 6-face pattern",
  },
  cubeInCube: {
    name: "Cube in a Cube",
    moves: "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    description: "Miniature 2x2 cube nestled inside a 3x3",
  },
  anaconda: {
    name: "Anaconda",
    moves: "L U B' U' R L' B R' F B' D R D' F'",
    description: "Serpentine color path winding across the faces",
  },
  sexyMove: {
    name: "Sexy Move (x1)",
    moves: "R U R' U'",
    description: "Fundamental speedcubing trigger",
  },
};
