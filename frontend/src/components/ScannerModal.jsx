import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  Check,
  ChevronRight,
  Upload,
  RefreshCw,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  FACE_NAMES,
  FACE_COLORS,
  facesToFaceletString,
  faceletStringToFaces,
} from '../utils/cubeMath';

// Recommended standard WCA scanning order
const SCAN_STEPS = [
  { key: 'F', name: 'Front', expectedCenter: 'Green', colorKey: 'F' },
  { key: 'R', name: 'Right', expectedCenter: 'Red', colorKey: 'R' },
  { key: 'B', name: 'Back', expectedCenter: 'Blue', colorKey: 'B' },
  { key: 'L', name: 'Left', expectedCenter: 'Orange', colorKey: 'L' },
  { key: 'U', name: 'Up', expectedCenter: 'White', colorKey: 'U' },
  { key: 'D', name: 'Down', expectedCenter: 'Yellow', colorKey: 'D' },
];

export default function ScannerModal({
  isOpen,
  onClose,
  initialState,
  onApplyScan,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [scannedFaces, setScannedFaces] = useState(() => faceletStringToFaces(initialState));
  const [liveDetectedGrid, setLiveDetectedGrid] = useState([
    ['F', 'F', 'F'],
    ['F', 'F', 'F'],
    ['F', 'F', 'F'],
  ]);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const stepInfo = SCAN_STEPS[currentStep] || SCAN_STEPS[0];

  // Start webcam
  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        'Unable to access camera. Please allow webcam permissions or upload face photos below.'
      );
      setCameraActive(false);
    }
  };

  // Stop webcam
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  // Nearest Color classifier based on RGB
  const classifyRGB = useCallback((r, g, b) => {
    // Quick Euclidean distance to standard colors
    const targets = {
      U: [240, 240, 240], // White
      D: [240, 210, 20],  // Yellow
      R: [220, 30, 30],   // Red
      L: [245, 115, 20],  // Orange
      B: [30, 110, 235],  // Blue
      F: [20, 180, 80],   // Green
    };

    let bestColor = 'U';
    let bestDist = Infinity;

    for (const [key, [tr, tg, tb]] of Object.entries(targets)) {
      const dist = Math.hypot(r - tr, g - tg, b - tb);
      if (dist < bestDist) {
        bestDist = dist;
        bestColor = key;
      }
    }
    return bestColor;
  }, []);

  // Frame processing loop to detect 3x3 colors
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !cameraActive) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Define 3x3 sampling grid in center of video
      const size = Math.min(canvas.width, canvas.height) * 0.6;
      const startX = (canvas.width - size) / 2;
      const startY = (canvas.height - size) / 2;
      const cellSize = size / 3;

      const detected = [];
      for (let r = 0; r < 3; r++) {
        const row = [];
        for (let c = 0; c < 3; c++) {
          const sampleX = Math.floor(startX + c * cellSize + cellSize / 2);
          const sampleY = Math.floor(startY + r * cellSize + cellSize / 2);

          // Sample 7x7 pixel patch average
          const sampleRadius = 3;
          const imgData = ctx.getImageData(
            sampleX - sampleRadius,
            sampleY - sampleRadius,
            sampleRadius * 2 + 1,
            sampleRadius * 2 + 1
          ).data;

          let sumR = 0, sumG = 0, sumB = 0;
          const count = imgData.length / 4;
          for (let p = 0; p < imgData.length; p += 4) {
            sumR += imgData[p];
            sumG += imgData[p + 1];
            sumB += imgData[p + 2];
          }

          const avgR = sumR / count;
          const avgG = sumG / count;
          const avgB = sumB / count;

          row.push(classifyRGB(avgR, avgG, avgB));
        }
        detected.push(row);
      }

      setLiveDetectedGrid(detected);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [cameraActive, classifyRGB]);

  useEffect(() => {
    if (cameraActive) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [cameraActive, processFrame]);

  // Capture current face from live detected grid
  const handleCaptureFace = () => {
    const updated = { ...scannedFaces };
    // Ensure center sticker matches expected face key
    const currentGrid = liveDetectedGrid.map((rowArr, rIdx) =>
      rowArr.map((col, cIdx) => (rIdx === 1 && cIdx === 1 ? stepInfo.key : col))
    );
    updated[stepInfo.key] = currentGrid;
    setScannedFaces(updated);

    if (currentStep < SCAN_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  // Handle image file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const size = Math.min(canvas.width, canvas.height) * 0.7;
      const startX = (canvas.width - size) / 2;
      const startY = (canvas.height - size) / 2;
      const cellSize = size / 3;

      const detected = [];
      for (let r = 0; r < 3; r++) {
        const row = [];
        for (let c = 0; c < 3; c++) {
          const sampleX = Math.floor(startX + c * cellSize + cellSize / 2);
          const sampleY = Math.floor(startY + r * cellSize + cellSize / 2);
          const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
          row.push(classifyRGB(pixel[0], pixel[1], pixel[2]));
        }
        detected.push(row);
      }

      const updated = { ...scannedFaces };
      detected[1][1] = stepInfo.key; // lock center
      updated[stepInfo.key] = detected;
      setScannedFaces(updated);

      if (currentStep < SCAN_STEPS.length - 1) {
        setCurrentStep((prev) => prev + 1);
      }
    };
    img.src = URL.createObjectURL(file);
  };

  // Finish scan & apply to 3D cube
  const handleCompleteScan = () => {
    const faceletString = facesToFaceletString(scannedFaces);
    if (onApplyScan) onApplyScan(faceletString);
    onClose();
  };

  if (!isOpen) return null;

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
                scannedFaces[s.key] ? 'completed' : ''
              }`}
              onClick={() => setCurrentStep(idx)}
            >
              <span className="step-num">{idx + 1}</span>
              <span className="step-title">{s.name}</span>
              {scannedFaces[s.key] && <Check size={12} className="check-icon" />}
            </button>
          ))}
        </div>

        {/* Scanner View Area */}
        <div className="scanner-body">
          {/* Webcam view with overlay */}
          <div className="webcam-viewport-box">
            {cameraActive ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="scanner-video" />
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {/* 3x3 Overlay Grid */}
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
            ) : (
              <div className="camera-offline-placeholder">
                <Camera size={44} className="text-slate-500" />
                <p>{cameraError || 'Camera stream is initializing...'}</p>
                <button className="retry-cam-btn" onClick={startCamera}>
                  <RefreshCw size={16} />
                  <span>Try Camera Again</span>
                </button>
              </div>
            )}
          </div>

          {/* Right sidebar: Live Detected Preview */}
          <div className="scanner-sidebar">
            <div className="sidebar-section">
              <h4>Face Preview: {stepInfo.name}</h4>
              <p className="sidebar-subtitle">Center must be {stepInfo.expectedCenter}</p>

              <div className="detected-preview-grid">
                {liveDetectedGrid.map((row, rIdx) =>
                  row.map((colKey, cIdx) => {
                    const isCenter = rIdx === 1 && cIdx === 1;
                    const finalKey = isCenter ? stepInfo.key : colKey;
                    const info = FACE_COLORS[finalKey] || FACE_COLORS.U;
                    return (
                      <div
                        key={`${rIdx}-${cIdx}`}
                        className={`preview-cell ${isCenter ? 'preview-center' : ''}`}
                        style={{ backgroundColor: info.hex }}
                        title={`${info.name}`}
                      />
                    );
                  })
                )}
              </div>
            </div>

            <div className="action-buttons-group">
              <button className="capture-face-btn" onClick={handleCaptureFace}>
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
            <span>
              {Object.keys(scannedFaces).length} of 6 faces recorded
            </span>
          </div>

          <div className="footer-actions">
            <button className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="apply-scan-btn" onClick={handleCompleteScan}>
              <Sparkles size={16} />
              <span>Apply Scanned Cube</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
