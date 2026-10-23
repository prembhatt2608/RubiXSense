import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  Check,
  Upload,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  FACE_COLORS,
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

// --- Color classifier (Euclidean distance in RGB space) ---
function classifyRGB(r, g, b) {
  const targets = {
    U: [240, 240, 240], // White
    D: [240, 210, 20],  // Yellow
    R: [220, 30,  30],  // Red
    L: [245, 115, 20],  // Orange
    B: [30,  110, 235], // Blue
    F: [20,  180, 80],  // Green
  };
  let best = 'U', bestDist = Infinity;
  for (const [key, [tr, tg, tb]] of Object.entries(targets)) {
    const dist = Math.hypot(r - tr, g - tg, b - tb);
    if (dist < bestDist) { bestDist = dist; best = key; }
  }
  return best;
}

// Sample the center pixel of each of 9 cells in a 3×3 grid from canvas
function sampleGrid(ctx, canvasW, canvasH) {
  const size = Math.min(canvasW, canvasH) * 0.6;
  const startX = (canvasW - size) / 2;
  const startY = (canvasH - size) / 2;
  const cell = size / 3;
  const radius = 3; // sample a 7×7 patch per sticker

  const grid = [];
  for (let row = 0; row < 3; row++) {
    const rowArr = [];
    for (let col = 0; col < 3; col++) {
      const cx = Math.floor(startX + col * cell + cell / 2);
      const cy = Math.floor(startY + row * cell + cell / 2);
      const px = Math.max(0, cx - radius);
      const py = Math.max(0, cy - radius);
      const pw = Math.min(radius * 2 + 1, canvasW - px);
      const ph = Math.min(radius * 2 + 1, canvasH - py);
      const imgData = ctx.getImageData(px, py, pw, ph).data;
      let sumR = 0, sumG = 0, sumB = 0;
      const count = imgData.length / 4;
      for (let p = 0; p < imgData.length; p += 4) {
        sumR += imgData[p]; sumG += imgData[p + 1]; sumB += imgData[p + 2];
      }
      rowArr.push(classifyRGB(sumR / count, sumG / count, sumB / count));
    }
    grid.push(rowArr);
  }
  return grid;
}

export default function ScannerModal({ isOpen, onClose, initialState, onApplyScan }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [cameraState, setCameraState] = useState('idle'); // 'idle' | 'starting' | 'active' | 'error'
  const [cameraError, setCameraError] = useState(null);

  // capturedFaces tracks only faces explicitly captured; pre-fill from initialState
  const [capturedFaces, setCapturedFaces] = useState({});

  // Live 3×3 color preview from the video feed
  const [liveGrid, setLiveGrid] = useState(() =>
    Array.from({ length: 3 }, () => Array(3).fill('U'))
  );

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  // Ref so the rAF loop always sees the latest value without closure staleness
  const cameraActiveRef = useRef(false);

  const stepInfo = SCAN_STEPS[currentStep] ?? SCAN_STEPS[0];

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

    // Try environment (back-cam) first, then fall back to any camera.
    // On desktops, 'environment' raises OverconstrainedError — the fallback handles that.
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
        // try next constraint set
      }
    }

    if (!stream) {
      setCameraError('Unable to access camera. Please allow webcam permissions or upload face photos below.');
      setCameraState('error');
      return;
    }

    streamRef.current = stream;

    // Attach stream and wait for metadata before marking active
    const video = videoRef.current;
    if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }

    video.srcObject = stream;

    const onReady = () => {
      video.removeEventListener('loadedmetadata', onReady);
      video.play().catch(() => {}); // ignore autoplay policy errors
      cameraActiveRef.current = true;
      setCameraState('active');
    };

    // If metadata already loaded (unlikely but safe), fire immediately
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onReady();
    } else {
      video.addEventListener('loadedmetadata', onReady);
    }
  }, [stopCamera]);

  // Start/stop when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setCapturedFaces({});
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- frame processing loop ----------
  // Uses refs so it never goes stale inside the rAF closure
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
  }, []); // intentionally no deps — uses refs

  // Kick off the loop once the camera is active
  useEffect(() => {
    if (cameraState === 'active') {
      rafRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [cameraState, processFrame]);

  // ---------- capture / upload ----------

  const handleCaptureFace = useCallback(() => {
    // Lock center to the expected face key
    const grid = liveGrid.map((row, ri) =>
      row.map((cell, ci) => (ri === 1 && ci === 1 ? stepInfo.key : cell))
    );
    setCapturedFaces((prev) => ({ ...prev, [stepInfo.key]: grid }));
    if (currentStep < SCAN_STEPS.length - 1) setCurrentStep((s) => s + 1);
  }, [liveGrid, stepInfo, currentStep]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-uploaded
    e.target.value = '';

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const detected = sampleGrid(ctx, img.width, img.height);
      detected[1][1] = stepInfo.key; // lock center
      setCapturedFaces((prev) => ({ ...prev, [stepInfo.key]: detected }));
      if (currentStep < SCAN_STEPS.length - 1) setCurrentStep((s) => s + 1);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }, [stepInfo, currentStep]);

  const handleCompleteScan = useCallback(() => {
    // Merge captured faces onto initial state so uncaptured faces keep their values
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
              onClick={() => setCurrentStep(idx)}
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
            {/* Always render video/canvas so refs are available when camera starts */}
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
                {/* 3×3 Overlay Grid */}
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
                  Align <strong>{stepInfo.name} ({stepInfo.expectedCenter} center)</strong> inside the frame
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

          {/* Right sidebar: Live Detected Preview */}
          <div className="scanner-sidebar">
            <div className="sidebar-section">
              <h4>Face Preview: {stepInfo.name}</h4>
              <p className="sidebar-subtitle">Center must be {stepInfo.expectedCenter}</p>

              <div className="detected-preview-grid">
                {liveGrid.map((row, rIdx) =>
                  row.map((colKey, cIdx) => {
                    const isCenter = rIdx === 1 && cIdx === 1;
                    const finalKey = isCenter ? stepInfo.key : colKey;
                    const info = FACE_COLORS[finalKey] ?? FACE_COLORS.U;
                    return (
                      <div
                        key={`${rIdx}-${cIdx}`}
                        className={`preview-cell ${isCenter ? 'preview-center' : ''}`}
                        style={{ backgroundColor: info.hex }}
                        title={info.name}
                      />
                    );
                  })
                )}
              </div>
            </div>

            <div className="action-buttons-group">
              <button className="capture-face-btn" onClick={handleCaptureFace} disabled={!isActive}>
                <Camera size={18} />
                <span>Capture {stepInfo.name} Face</span>
              </button>

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
