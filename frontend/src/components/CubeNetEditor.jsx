import React, { useState } from 'react';
import {
  FACE_NAMES,
  FACE_COLORS,
  SOLVED_STATE,
  validateStateLocally,
  faceletStringToFaces,
  facesToFaceletString,
} from '../utils/cubeMath';
import { Paintbrush, RotateCcw, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';

export default function CubeNetEditor({
  faceletState = SOLVED_STATE,
  onStateChange,
}) {
  const [selectedColor, setSelectedColor] = useState('U'); // Default paint color: White (U)
  const validation = validateStateLocally(faceletState);
  const faces = faceletStringToFaces(faceletState);

  // Paint single sticker
  const handleStickerClick = (faceKey, row, col) => {
    // Center stickers are at row 1, col 1
    const isCenter = row === 1 && col === 1;
    if (isCenter) {
      // Optional: warning that changing center changes face orientation
    }

    const updatedFaces = { ...faces };
    const newGrid = updatedFaces[faceKey].map((rArr) => [...rArr]);
    newGrid[row][col] = selectedColor;
    updatedFaces[faceKey] = newGrid;

    const newFaceletString = facesToFaceletString(updatedFaces);
    if (onStateChange) onStateChange(newFaceletString);
  };

  // Fill entire face with selected color
  const fillFace = (faceKey) => {
    const updatedFaces = { ...faces };
    updatedFaces[faceKey] = [
      [selectedColor, selectedColor, selectedColor],
      [selectedColor, selectedColor, selectedColor],
      [selectedColor, selectedColor, selectedColor],
    ];
    const newFaceletString = facesToFaceletString(updatedFaces);
    if (onStateChange) onStateChange(newFaceletString);
  };

  // Reset to solved state
  const handleResetSolved = () => {
    if (onStateChange) onStateChange(SOLVED_STATE);
  };

  // Render a 3x3 face grid in the net
  const renderFaceGrid = (faceKey, label) => {
    const grid = faces[faceKey];
    return (
      <div className={`net-face-card face-${faceKey}`}>
        <div className="face-header">
          <span className="face-title">{label} ({faceKey})</span>
          <button
            className="fill-face-btn"
            onClick={() => fillFace(faceKey)}
            title={`Fill all 9 stickers with ${FACE_COLORS[selectedColor].name}`}
          >
            Fill
          </button>
        </div>

        <div className="face-grid-3x3">
          {grid.map((rowArr, rIdx) =>
            rowArr.map((colorKey, cIdx) => {
              const isCenter = rIdx === 1 && cIdx === 1;
              const colorInfo = FACE_COLORS[colorKey] || FACE_COLORS.U;

              return (
                <button
                  key={`${faceKey}-${rIdx}-${cIdx}`}
                  className={`sticker-cell ${isCenter ? 'center-sticker' : ''}`}
                  style={{
                    backgroundColor: colorInfo.hex,
                    color: colorInfo.text,
                  }}
                  onClick={() => handleStickerClick(faceKey, rIdx, cIdx)}
                  title={`Face ${faceKey} [${rIdx},${cIdx}] — Color: ${colorInfo.name}${isCenter ? ' (Center Sticker)' : ''}`}
                >
                  {isCenter && <Lock size={10} className="center-lock-icon" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="cubenet-editor-card">
      <div className="cubenet-header">
        <div className="title-block">
          <Paintbrush size={18} className="icon-cyan" />
          <h3>Interactive Net Editor</h3>
        </div>

        <button className="reset-btn" onClick={handleResetSolved}>
          <RotateCcw size={14} />
          <span>Reset to Solved</span>
        </button>
      </div>

      {/* Color Palette Picker */}
      <div className="color-palette-bar">
        <span className="palette-label">Paint Color:</span>
        <div className="palette-swatches">
          {FACE_NAMES.map((fKey) => {
            const info = FACE_COLORS[fKey];
            const isSelected = selectedColor === fKey;
            const count = validation.counts[fKey] || 0;

            return (
              <button
                key={fKey}
                className={`color-swatch-btn ${isSelected ? 'selected' : ''}`}
                style={{
                  '--swatch-color': info.hex,
                  '--swatch-text': info.text,
                }}
                onClick={() => setSelectedColor(fKey)}
              >
                <span className="swatch-circle" style={{ backgroundColor: info.hex }} />
                <span className="swatch-name">{info.name}</span>
                <span className={`swatch-count ${count === 9 ? 'count-ok' : count > 9 ? 'count-over' : 'count-under'}`}>
                  {count}/9
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Validation status pill */}
      <div className={`validation-pill ${validation.valid ? 'valid' : 'invalid'}`}>
        {validation.valid ? (
          <>
            <CheckCircle2 size={16} className="text-emerald" />
            <span>Valid Sticker Counts (9 stickers of each color)</span>
          </>
        ) : (
          <>
            <AlertTriangle size={16} className="text-amber" />
            <span>
              {!validation.hasNineEach
                ? 'Invalid sticker counts! Each color must appear exactly 9 times.'
                : 'Invalid center stickers! Each of the 6 faces must have a distinct center.'}
            </span>
          </>
        )}
      </div>

      {/* 2D Unfolded Cross Layout */}
      <div className="net-unfolded-wrapper">
        <div className="net-row row-top">
          <div className="net-spacer" />
          {renderFaceGrid('U', 'Up (White)')}
          <div className="net-spacer" />
          <div className="net-spacer" />
        </div>

        <div className="net-row row-middle">
          {renderFaceGrid('L', 'Left (Orange)')}
          {renderFaceGrid('F', 'Front (Green)')}
          {renderFaceGrid('R', 'Right (Red)')}
          {renderFaceGrid('B', 'Back (Blue)')}
        </div>

        <div className="net-row row-bottom">
          <div className="net-spacer" />
          {renderFaceGrid('D', 'Down (Yellow)')}
          <div className="net-spacer" />
          <div className="net-spacer" />
        </div>
      </div>
    </div>
  );
}
