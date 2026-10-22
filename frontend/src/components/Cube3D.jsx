import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Maximize2,
  Gauge,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  SOLVED_STATE,
  applyMove,
  FACE_COLORS,
  invertMove,
} from '../utils/cubeMath';

// Mapping facelet indices to (cubie coord [x,y,z], face normal)
// Index layout:
// U: 0-8  (y = +1, z from -1 to 1, x from -1 to 1)
// R: 9-17 (x = +1, y from 1 to -1, z from 1 to -1)
// F: 18-26(z = +1, y from 1 to -1, x from -1 to 1)
// D: 27-35(y = -1, z from 1 to -1, x from -1 to 1)
// L: 36-44(x = -1, y from 1 to -1, z from -1 to 1)
// B: 45-53(z = -1, y from 1 to -1, x from 1 to -1)

const COLOR_MAP = {
  U: 0xf8fafc, // White
  R: 0xef4444, // Red
  F: 0x10b981, // Green
  D: 0xfacc15, // Yellow
  L: 0xf97316, // Orange
  B: 0x3b82f6, // Blue
};

const INNER_COLOR = 0x18181b; // Dark Charcoal core

export default function Cube3D({
  faceletState = SOLVED_STATE,
  onStateChange,
  solutionMoves = [],
  currentStepIndex = 0,
  onStepChange,
  isSolving = false,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const cubeGroupRef = useRef(null);
  const cubiesRef = useRef([]);
  const isDraggingRef = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const isAnimatingRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 4x
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Helper to get sticker face index on a cubie (Three.js materials order: +X, -X, +Y, -Y, +Z, -Z)
  // +X = R (0), -X = L (1), +Y = U (2), -Y = D (3), +Z = F (4), -Z = B (5)
  const getFaceletIndex = useCallback((x, y, z, faceDir) => {
    // faceDir: 'U', 'D', 'L', 'R', 'F', 'B'
    if (faceDir === 'U' && y === 1) {
      const row = z + 1; // z=-1 -> 0, z=0 -> 1, z=1 -> 2
      const col = x + 1; // x=-1 -> 0, x=0 -> 1, x=1 -> 2
      return row * 3 + col; // 0..8
    }
    if (faceDir === 'R' && x === 1) {
      const row = 1 - y; // y=1 -> 0, y=0 -> 1, y=-1 -> 2
      const col = 1 - z; // z=1 -> 0, z=0 -> 1, z=-1 -> 2
      return 9 + row * 3 + col; // 9..17
    }
    if (faceDir === 'F' && z === 1) {
      const row = 1 - y; // y=1 -> 0, y=0 -> 1, y=-1 -> 2
      const col = x + 1; // x=-1 -> 0, x=0 -> 1, x=1 -> 2
      return 18 + row * 3 + col; // 18..26
    }
    if (faceDir === 'D' && y === -1) {
      const row = 1 - z; // z=1 -> 0, z=0 -> 1, z=-1 -> 2
      const col = x + 1; // x=-1 -> 0, x=0 -> 1, x=1 -> 2
      return 27 + row * 3 + col; // 27..35
    }
    if (faceDir === 'L' && x === -1) {
      const row = 1 - y; // y=1 -> 0, y=0 -> 1, y=-1 -> 2
      const col = z + 1; // z=-1 -> 0, z=0 -> 1, z=1 -> 2
      return 36 + row * 3 + col; // 36..44
    }
    if (faceDir === 'B' && z === -1) {
      const row = 1 - y; // y=1 -> 0, y=0 -> 1, y=-1 -> 2
      const col = 1 - x; // x=1 -> 0, x=0 -> 1, x=-1 -> 2
      return 45 + row * 3 + col; // 45..53
    }
    return -1;
  }, []);

  // Update cubies sticker colors based on faceletState
  const updateStickerColors = useCallback((stateString) => {
    if (!cubiesRef.current.length || !stateString) return;
    const s = stateString.length === 54 ? stateString : SOLVED_STATE;

    cubiesRef.current.forEach((cubie) => {
      const { x, y, z } = cubie.userData.gridPos;
      const materials = cubie.material;

      // +X (Right, R)
      if (x === 1) {
        const idx = getFaceletIndex(x, y, z, 'R');
        const colorChar = s[idx] || 'R';
        materials[0].color.setHex(COLOR_MAP[colorChar] || COLOR_MAP.R);
      }
      // -X (Left, L)
      if (x === -1) {
        const idx = getFaceletIndex(x, y, z, 'L');
        const colorChar = s[idx] || 'L';
        materials[1].color.setHex(COLOR_MAP[colorChar] || COLOR_MAP.L);
      }
      // +Y (Up, U)
      if (y === 1) {
        const idx = getFaceletIndex(x, y, z, 'U');
        const colorChar = s[idx] || 'U';
        materials[2].color.setHex(COLOR_MAP[colorChar] || COLOR_MAP.U);
      }
      // -Y (Down, D)
      if (y === -1) {
        const idx = getFaceletIndex(x, y, z, 'D');
        const colorChar = s[idx] || 'D';
        materials[3].color.setHex(COLOR_MAP[colorChar] || COLOR_MAP.D);
      }
      // +Z (Front, F)
      if (z === 1) {
        const idx = getFaceletIndex(x, y, z, 'F');
        const colorChar = s[idx] || 'F';
        materials[4].color.setHex(COLOR_MAP[colorChar] || COLOR_MAP.F);
      }
      // -Z (Back, B)
      if (z === -1) {
        const idx = getFaceletIndex(x, y, z, 'B');
        const colorChar = s[idx] || 'B';
        materials[5].color.setHex(COLOR_MAP[colorChar] || COLOR_MAP.B);
      }
    });
  }, [getFaceletIndex]);

  // Three.js Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Dimensions
    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(4.5, 4.2, 5.8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer with antialias and alpha
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight1.position.set(6, 8, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.6);
    dirLight2.position.set(-6, -4, -6);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x818cf8, 1, 15);
    pointLight.position.set(0, 5, 4);
    scene.add(pointLight);

    // Root Cube Group
    const cubeGroup = new THREE.Group();
    scene.add(cubeGroup);
    cubeGroupRef.current = cubeGroup;

    // Build 27 Cubies
    const cubies = [];
    const geometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // 6 Materials (+X, -X, +Y, -Y, +Z, -Z)
          const materials = [
            new THREE.MeshStandardMaterial({
              color: x === 1 ? COLOR_MAP.R : INNER_COLOR,
              roughness: 0.25,
              metalness: 0.1,
            }),
            new THREE.MeshStandardMaterial({
              color: x === -1 ? COLOR_MAP.L : INNER_COLOR,
              roughness: 0.25,
              metalness: 0.1,
            }),
            new THREE.MeshStandardMaterial({
              color: y === 1 ? COLOR_MAP.U : INNER_COLOR,
              roughness: 0.25,
              metalness: 0.1,
            }),
            new THREE.MeshStandardMaterial({
              color: y === -1 ? COLOR_MAP.D : INNER_COLOR,
              roughness: 0.25,
              metalness: 0.1,
            }),
            new THREE.MeshStandardMaterial({
              color: z === 1 ? COLOR_MAP.F : INNER_COLOR,
              roughness: 0.25,
              metalness: 0.1,
            }),
            new THREE.MeshStandardMaterial({
              color: z === -1 ? COLOR_MAP.B : INNER_COLOR,
              roughness: 0.25,
              metalness: 0.1,
            }),
          ];

          const cubie = new THREE.Mesh(geometry, materials);
          cubie.position.set(x, y, z);
          cubie.userData = { gridPos: { x, y, z } };
          cubeGroup.add(cubie);
          cubies.push(cubie);
        }
      }
    }
    cubiesRef.current = cubies;

    // Initial sticker color update
    updateStickerColors(faceletState);

    // Render loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geometry.dispose();
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update whenever faceletState changes
  useEffect(() => {
    updateStickerColors(faceletState);
    if (faceletState === SOLVED_STATE && solutionMoves.length > 0 && currentStepIndex === solutionMoves.length) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [faceletState, updateStickerColors, solutionMoves.length, currentStepIndex]);

  // Auto-play when a new non-empty solution is loaded
  const prevMovesRef = useRef(solutionMoves);
  useEffect(() => {
    if (solutionMoves && solutionMoves.length > 0 && solutionMoves !== prevMovesRef.current) {
      setIsPlaying(true);
    }
    prevMovesRef.current = solutionMoves;
  }, [solutionMoves]);

  // Orbit controls via Mouse/Touch Drag
  const handlePointerDown = (e) => {
    isDraggingRef.current = true;
    prevMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current || !cubeGroupRef.current) return;
    const deltaX = e.clientX - prevMousePos.current.x;
    const deltaY = e.clientY - prevMousePos.current.y;

    cubeGroupRef.current.rotation.y += deltaX * 0.008;
    cubeGroupRef.current.rotation.x += deltaY * 0.008;

    prevMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  // Reset Camera View Angle
  const resetCameraView = () => {
    if (!cubeGroupRef.current) return;
    cubeGroupRef.current.rotation.set(0, 0, 0);
  };

  // Execute Step Forward
  const stepForward = useCallback(() => {
    if (currentStepIndex >= solutionMoves.length || isAnimatingRef.current) return;
    const move = solutionMoves[currentStepIndex];
    if (!move) return;

    const nextState = applyMove(faceletState, move);
    if (onStateChange) onStateChange(nextState);
    if (onStepChange) onStepChange(currentStepIndex + 1);
  }, [currentStepIndex, solutionMoves, faceletState, onStateChange, onStepChange]);

  // Execute Step Backward
  const stepBackward = useCallback(() => {
    if (currentStepIndex <= 0 || isAnimatingRef.current) return;
    const move = solutionMoves[currentStepIndex - 1];
    if (!move) return;

    const inv = invertMove(move);
    const prevState = applyMove(faceletState, inv);
    if (onStateChange) onStateChange(prevState);
    if (onStepChange) onStepChange(currentStepIndex - 1);
  }, [currentStepIndex, solutionMoves, faceletState, onStateChange, onStepChange]);

  // Auto-Play solution timer
  useEffect(() => {
    if (!isPlaying) return;
    if (currentStepIndex >= solutionMoves.length) {
      setIsPlaying(false);
      return;
    }

    const intervalMs = Math.max(200, 1000 / speed);
    const timer = setTimeout(() => {
      stepForward();
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [isPlaying, currentStepIndex, solutionMoves.length, speed, stepForward]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepForward();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepBackward();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepForward, stepBackward]);

  const hasSolution = solutionMoves && solutionMoves.length > 0;
  const progressPercent = hasSolution
    ? Math.round((currentStepIndex / solutionMoves.length) * 100)
    : 0;

  return (
    <div className={`cube3d-container ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* 3D Canvas Viewport */}
      <div
        className="canvas-viewport"
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* Floating Viewport Controls */}
      <div className="viewport-overlay-controls">
        <button
          className="viewport-btn"
          onClick={resetCameraView}
          title="Reset 3D View Angle"
        >
          <RotateCcw size={16} />
          <span>Reset View</span>
        </button>

        <button
          className="viewport-btn"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title="Toggle Fullscreen"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      {/* Current Step / Move Indicator badge */}
      {hasSolution && (
        <div className="current-move-badge">
          {currentStepIndex > 0 ? (
            <>
              <span className="badge-label">Step {currentStepIndex}:</span>
              <span className="badge-move">{solutionMoves[currentStepIndex - 1]}</span>
            </>
          ) : (
            <span className="badge-ready">Ready to solve ({solutionMoves.length} moves)</span>
          )}
        </div>
      )}

      {/* Solution Playback Control Dock */}
      {hasSolution && (
        <div className="playback-dock">
          {/* Progress Bar */}
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
            <span className="progress-text">
              {currentStepIndex} / {solutionMoves.length} moves ({progressPercent}%)
            </span>
          </div>

          <div className="dock-actions">
            <button
              className="dock-btn secondary"
              onClick={stepBackward}
              disabled={currentStepIndex <= 0}
              title="Previous Step (Left Arrow)"
            >
              <SkipBack size={18} />
            </button>

            <button
              className="dock-btn primary play-pause"
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} />}
            </button>

            <button
              className="dock-btn secondary"
              onClick={stepForward}
              disabled={currentStepIndex >= solutionMoves.length}
              title="Next Step (Right Arrow)"
            >
              <SkipForward size={18} />
            </button>

            <div className="speed-selector">
              <Gauge size={15} />
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  key={s}
                  className={`speed-pill ${speed === s ? 'active' : ''}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
