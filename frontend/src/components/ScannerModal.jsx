import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  Check,
  Upload,
  RefreshCw,
  Sparkles,
  Edit3,
} from 'lucide-react';
import {
  FACE_COLORS,
  COLOR_KEYS,
  facesToFaceletString,
  faceletStringToFaces,
} from '../utils/cubeMath';

// Recommended standard WCA scanning order
const SCAN_STEPS = [
  { key: 'F', name: 'Front',  expectedCenter: 'Green'  },
  { key: 'R', name: 'Right',  expectedCenter: 'Red'    },
  { key: 'B', name: 'Back',   expectedCenter: 'Blue'   },
  { key: 'L', name: 'Left',   expectedCenter: 'Orange' },
  { key: 'U', name: 'Up',     expectedCenter: 'White'  },
  { key: 'D', name: 'Down',   expectedCenter: 'Yellow' },
];

const COLOR_CYCLE = ['U', 'R', 'F', 'D', 'L', 'B'];

// --- Robust HSV-based color classifier for Rubik's Cube stickers ---
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0, s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, v * 100];
}

function classifyRGB(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  const yellowIndex = (r + g) / 2 - b;
  const greenToRed = g / Math.max(1, r);

  // 1. Very low saturation -> White or Yellow under harsh light
  if (s < 20) {
    // If yellow index is high and hue is in warm range, it's yellow
    if (yellowIndex > 50 && h >= 35 && h <= 68) return 'D'; // Yellow
    return 'U'; // White
  }

  // 2. Low-to-moderate saturation: White vs Yellow discrimination
  if (s < 35) {
    if (yellowIndex > 40 && h >= 35 && h <= 70) return 'D'; // Yellow
    if (Math.abs(r - g) < 30 && Math.abs(r - b) < 30 && Math.abs(g - b) < 30) return 'U'; // White
  }

  // 3. High Saturation Colors by Hue:
  // Yellow: Hue 38-70, high yellow index, b is significantly lower than r & g
  if (h >= 36 && h <= 70 && yellowIndex > 30) {
    return 'D'; // Yellow
  }

  // Red vs Orange:
  // Red wraps around 0/360: hue <= 12 or hue >= 340
  // Orange: hue 12-42, with noticeable green component
  if (h <= 13 || h >= 342) {
    if (h >= 9 && greenToRed > 0.40 && g > 75) {
      return 'L'; // Orange
    }
    return 'R'; // Red
  }

  if (h > 13 && h <= 42) {
    if (h > 36 && yellowIndex > 50 && s > 40) return 'D'; // Yellow
    return 'L'; // Orange
  }

  // Green: Hue 70-165
  if (h >= 70 && h <= 165) {
    return 'F'; // Green
  }

  // Blue: Hue 165-265
  if (h > 165 && h <= 270) {
    return 'B'; // Blue
  }

  // Fallback: Euclidean distance in RGB to target points
  const targets = {
    U: [240, 240, 240], // White
    D: [245, 215, 25],  // Yellow
    R: [220, 25, 25],   // Red
    L: [245, 120, 20],  // Orange
    B: [25, 105, 230],  // Blue
    F: [20, 185, 75],   // Green
  };
  let best = 'U', bestDist = Infinity;
  for (const [key, [tr, tg, tb]] of Object.entries(targets)) {
    const dist = Math.hypot(r - tr, g - tg, b - tb);
    if (dist < bestDist) { bestDist = dist; best = key; }
  }
  return best;
}

// Sample the center pixel of each of 9 cells in a 3x3 grid from canvas
function sampleGrid(ctx, canvasW, canvasH) {
  const size = Math.min(canvasW, canvasH) * 0.6;
  const startX = (canvasW - size) / 2;
  const startY = (canvasH - size) / 2;
  const cell = size / 3;
  // Inner sticker patch (radius 14% of cell) to avoid black plastic gaps
  const patchRadius = Math.max(3, Math.floor(cell * 0.14));

  const grid = [];
  for (let row = 0; row < 3; row++) {
    const rowArr = [];
    for (let col = 0; col < 3; col++) {
      const cx = Math.floor(startX + col * cell + cell / 2);
      const cy = Math.floor(startY + row * cell + cell / 2);
      const px = Math.max(0, cx - patchRadius);
      const py = Math.max(0, cy - patchRadius);
      const pw = Math.min(patchRadius * 2 + 1, canvasW - px);
      const ph = Math.min(patchRadius * 2 + 1, canvasH - py);
      const imgData = ctx.getImageData(px, py, pw, ph).data;

      // Extract pixel values, filtering out dark borders and extreme specular glare
      const rs = [], gs = [], bs = [];
      for (let p = 0; p < imgData.length; p += 4) {
        const pr = imgData[p];
        const pg = imgData[p + 1];
        const pb = imgData[p + 2];
        // Filter out extreme dark black plastic borders
        if (pr < 35 && pg < 35 && pb < 35) continue;
        // Filter out extreme light reflections
        if (pr > 248 && pg > 248 && pb > 248) continue;
        rs.push(pr); gs.push(pg); bs.push(pb);
      }

      if (rs.length === 0) {
        // Fallback to all pixels if filtering was too aggressive
        for (let p = 0; p < imgData.length; p += 4) {
          rs.push(imgData[p]); gs.push(imgData[p + 1]); bs.push(imgData[p + 2]);
        }
      }

      rs.sort((a, b) => a - b);
      gs.sort((a, b) => a - b);
      bs.sort((a, b) => a - b);
      const mid = Math.floor(rs.length / 2);
      rowArr.push(classifyRGB(rs[mid] || 128, gs[mid] || 128, bs[mid] || 128));
    }
    grid.push(rowArr);
  }
  return grid;
}

export default function ScannerModal({ isOpen, onClose, initialState, onApplyScan }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [cameraState, setCameraState] = useState('idle'); // 'idle' | 'starting' | 'active' | 'error'
  const [cameraError, setCameraError] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null); // [row, col] or null

  // capturedFaces tracks faces explicitly captured; pre-fill from initialState
  const [capturedFaces, setCapturedFaces] = useState({});

  // Live 3x3 color preview from the video feed
  const [liveGrid, setLiveGrid] = useState(() =>
    Array.from({ length: 3 }, () => Array(3).fill('U'))
  );

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const cameraActiveRef = useRef(false);

  const stepInfo = SCAN_STEPS[currentStep] ?? SCAN_STEPS[0];
  const isCaptured = Boolean(capturedFaces[stepInfo.key]);
  const activeGrid = isCaptured ? capturedFaces[stepInfo.key] : liveGrid;

  // ---------- camera lifecycle ----------

  const stopCamera = useCallback(() => {
    cameraActiveRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setCameraState('starting');

    const constraints = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } } },
      { video: { width: { ideal: 640 }, height: { ideal: 480 } } },
      { video: true },
    ];

    let stream = null;
    for (const c of constraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch {
        // try next constraint
      }
    }

    if (!stream) {
      setCameraError('Unable to access camera. Please allow webcam permissions or upload face photos below.');
      setCameraState('error');
      return;
    }

    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }

    video.srcObject = stream;

    const onReady = () => {
      video.removeEventListener('loadedmetadata', onReady);
      video.play().catch(() => {});
      cameraActiveRef.current = true;
      setCameraState('active');
    };

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onReady();
    } else {
      video.addEventListener('loadedmetadata', onReady);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setCapturedFaces({});
      setSelectedCell(null);
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- frame processing loop ----------
  const processFrame = useCallback(() => {
    if (!cameraActiveRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0);
      const detected = sampleGrid(ctx, canvas.width, canvas.height);
      setLiveGrid(detected);
    }

    rafRef.current = requestAnimationFrame(processFrame);
  }, []);

  useEffect(() => {
    if (cameraState === 'active') {
      rafRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [cameraState, processFrame]);

  // ---------- manual editing / tweaking colors ----------

  const handleCellClick = (rIdx, cIdx) => {
    if (rIdx === 1 && cIdx === 1) return; // Keep center locked to expected face
    setSelectedCell([rIdx, cIdx]);

    // Cycle color on click
    const current = activeGrid[rIdx][cIdx];
    const nextIdx = (COLOR_CYCLE.indexOf(current) + 1) % COLOR_CYCLE.length;
    const nextColor = COLOR_CYCLE[nextIdx];

    const updated = activeGrid.map((row, r) =>
      row.map((col, c) => (r === rIdx && c === cIdx ? nextColor : (r === 1 && c === 1 ? stepInfo.key : col)))
    );
    setCapturedFaces((prev) => ({ ...prev, [stepInfo.key]: updated }));
  };

  const handlePaletteSelect = (colorKey) => {
    if (!selectedCell) return;
    const [rIdx, cIdx] = selectedCell;
    if (rIdx === 1 && cIdx === 1) return;

    const updated = activeGrid.map((row, r) =>
      row.map((col, c) => (r === rIdx && c === cIdx ? colorKey : (r === 1 && c === 1 ? stepInfo.key : col)))
    );
    setCapturedFaces((prev) => ({ ...prev, [stepInfo.key]: updated }));
  };

  // ---------- capture / upload ----------

  const handleCaptureFace = useCallback(() => {
    const grid = liveGrid.map((row, ri) =>
      row.map((cell, ci) => (ri === 1 && ci === 1 ? stepInfo.key : cell))
    );
    setCapturedFaces((prev) => ({ ...prev, [stepInfo.key]: grid }));
    setSelectedCell(null);
    if (currentStep < SCAN_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  }, [liveGrid, stepInfo, currentStep]);

  const handleRescanFace = () => {
    setCapturedFaces((prev) => {
      const copy = { ...prev };
      delete copy[stepInfo.key];
      return copy;
    });
    setSelectedCell(null);
  };

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const detected = sampleGrid(ctx, img.width, img.height);
      detected[1][1] = stepInfo.key;
      setCapturedFaces((prev) => ({ ...prev, [stepInfo.key]: detected }));
      setSelectedCell(null);
      if (currentStep < SCAN_STEPS.length - 1) setCurrentStep((s) => s + 1);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }, [stepInfo, currentStep]);

  const handleCompleteScan = useCallback(() => {
    const base = faceletStringToFaces(initialState);
    const merged = { ...base, ...capturedFaces };
    const faceletString = facesToFaceletString(merged);
    if (onApplyScan) onApplyScan(faceletString);
    onClose();
  }, [capturedFaces, initialState, onApplyScan, onClose]);

  if (!isOpen) return null;

  const capturedCount = Object.keys(capturedFaces).length;
  const isActive = cameraState === 'active';
  const isStarting = cameraState === 'starting';

  return (
    <div className="modal-backdrop">
      <div className="scanner-modal-card">
        {/* Header */}
        <div className="scanner-modal-header">
          <div className="header-badge">
            <Camera size={18} className="icon-cyan" />
            <h2>Webcam Cube Scanner</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Step Progression Tabs */}
        <div className="scan-steps-progress">
          {SCAN_STEPS.map((s, idx) => (
            <button
              key={s.key}
              className={`scan-step-pill ${currentStep === idx ? 'active' : ''} ${
                capturedFaces[s.key] ? 'completed' : ''
              }`}
              onClick={() => {
                setCurrentStep(idx);
                setSelectedCell(null);
              }}
            >
              <span className="step-num">{idx + 1}</span>
              <span className="step-title">{s.name}</span>
              {capturedFaces[s.key] && <Check size={12} className="check-icon" />}
            </button>
          ))}
        </div>

        {/* Scanner View Area */}
        <div className="scanner-body">
          {/* Webcam view with overlay */}
          <div className="webcam-viewport-box">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="scanner-video"
              style={{ display: isActive ? 'block' : 'none' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {isActive && (
              <>
                {/* 3x3 Overlay Grid matching sampling area */}
                <div className="scanner-grid-overlay">
                  <div className="grid-corner tl" />
                  <div className="grid-corner tr" />
                  <div className="grid-corner bl" />
                  <div className="grid-corner br" />
                  <div className="grid-3x3-mesh">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="grid-cell" />
                    ))}
                  </div>
                </div>

                <div className="scanner-instruction-banner">
                  Align <strong>{stepInfo.name} ({stepInfo.expectedCenter} center)</strong> inside the dashed box
                </div>
              </>
            )}

            {!isActive && (
              <div className="camera-offline-placeholder">
                <Camera size={44} className="text-slate-500" />
                <p>
                  {isStarting
                    ? 'Starting camera…'
                    : cameraError || 'Camera stream is initializing…'}
                </p>
                {!isStarting && (
                  <button className="retry-cam-btn" onClick={startCamera}>
                    <RefreshCw size={16} />
                    <span>Try Camera Again</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right sidebar: Detected Preview & Interactive Correction */}
          <div className="scanner-sidebar">
            <div className="sidebar-section">
              <h4>Face Preview: {stepInfo.name}</h4>
              <p className="sidebar-subtitle">
                {isCaptured
                  ? 'Face captured! Click any sticker below to tweak'
                  : `Align cube — center must be ${stepInfo.expectedCenter}`}
              </p>

              <div className="detected-preview-grid">
                {activeGrid.map((row, rIdx) =>
                  row.map((colKey, cIdx) => {
                    const isCenter = rIdx === 1 && cIdx === 1;
                    const finalKey = isCenter ? stepInfo.key : colKey;
                    const info = FACE_COLORS[finalKey] ?? FACE_COLORS.U;
                    const isSelected = selectedCell && selectedCell[0] === rIdx && selectedCell[1] === cIdx;
                    return (
                      <div
                        key={`${rIdx}-${cIdx}`}
                        className={`preview-cell clickable ${isCenter ? 'preview-center' : ''} ${
                          isSelected ? 'preview-cell-selected' : ''
                        }`}
                        style={{ backgroundColor: info.hex }}
                        onClick={() => handleCellClick(rIdx, cIdx)}
                        title={isCenter ? `${info.name} (Fixed Center)` : `${info.name} (Click to change)`}
                      />
                    );
                  })
                )}
              </div>

              {/* Color Palette Quick-Bar */}
              <div className="preview-hint-text">
                💡 Click sticker to cycle color or pick below:
              </div>
              <div className="scanner-palette-bar">
                {COLOR_KEYS.map((k) => (
                  <button
                    key={k}
                    className="palette-chip"
                    style={{ backgroundColor: FACE_COLORS[k].hex }}
                    onClick={() => handlePaletteSelect(k)}
                    title={FACE_COLORS[k].name}
                  />
                ))}
              </div>
            </div>

            <div className="action-buttons-group">
              {isCaptured ? (
                <button className="capture-face-btn" onClick={handleRescanFace}>
                  <RefreshCw size={16} />
                  <span>Re-scan {stepInfo.name} Face</span>
                </button>
              ) : (
                <button className="capture-face-btn" onClick={handleCaptureFace} disabled={!isActive}>
                  <Camera size={18} />
                  <span>Capture {stepInfo.name} Face</span>
                </button>
              )}

              <label className="upload-photo-btn">
                <Upload size={16} />
                <span>Upload Face Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="scanner-modal-footer">
          <div className="scan-summary-status">
            <span>{capturedCount} of 6 faces captured</span>
          </div>

          <div className="footer-actions">
            <button className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="apply-scan-btn"
              onClick={handleCompleteScan}
              disabled={capturedCount === 0}
            >
              <Sparkles size={16} />
              <span>Apply Scanned Cube</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
