import React, { useState } from 'react';
import {
  Boxes,
  Shuffle,
  Camera,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Activity,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { PRESET_PATTERNS } from '../utils/cubeMath';

export default function Header({
  backendStatus = 'checking',
  onRandomScramble,
  onApplyPreset,
  onOpenScanner,
  onResetSolved,
  isSolving = false,
}) {
  const [presetOpen, setPresetOpen] = useState(false);

  return (
    <header className="app-header">
      {/* Brand & Logo */}
      <div className="header-brand">
        <div className="logo-icon-box">
          <Boxes size={24} className="logo-icon" />
          <div className="logo-glow" />
        </div>
        <div className="brand-text">
          <div className="brand-title">
            <span className="brand-cube">Rubi</span>
            <span className="brand-x">X</span>
            <span className="brand-sense">Sense</span>
          </div>
          <span className="brand-tagline">Rubik's Cube Scanner & 3D Solver</span>
        </div>
      </div>

      {/* Center Quick Actions */}
      <div className="header-actions">
        {/* Presets dropdown */}
        <div className="preset-dropdown-container">
          <button
            className="action-btn secondary preset-btn"
            onClick={() => setPresetOpen(!presetOpen)}
            disabled={isSolving}
          >
            <Layers size={16} />
            <span>Preset Patterns</span>
            <ChevronDown size={14} className={presetOpen ? 'rotated' : ''} />
          </button>

          {presetOpen && (
            <div className="preset-menu-card">
              {Object.entries(PRESET_PATTERNS).map(([key, item]) => (
                <button
                  key={key}
                  className="preset-item"
                  onClick={() => {
                    onApplyPreset(item.moves);
                    setPresetOpen(false);
                  }}
                >
                  <span className="preset-item-name">{item.name}</span>
                  <span className="preset-item-desc">{item.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Random Scramble button */}
        <button
          className="action-btn secondary scramble-btn"
          onClick={onRandomScramble}
          disabled={isSolving}
          title="Apply random 20-move scramble"
        >
          <Shuffle size={16} />
          <span>Scramble</span>
        </button>

        {/* Webcam Scanner button */}
        <button
          className="action-btn secondary scanner-btn"
          onClick={onOpenScanner}
          disabled={isSolving}
          title="Open Camera Cube Scanner"
        >
          <Camera size={16} />
          <span>Scan Cube</span>
        </button>

        {/* Reset Solved button */}
        <button
          className="action-btn ghost reset-btn"
          onClick={onResetSolved}
          disabled={isSolving}
          title="Reset Cube to Solved State"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Backend Status indicator */}
      <div className="header-status">
        <div
          className={`status-indicator ${
            backendStatus === 'online' ? 'online' : 'offline'
          }`}
          title={
            backendStatus === 'online'
              ? 'FastAPI Backend Online & Ready'
              : 'Backend Offline (Using Client-side Engine)'
          }
        >
          <span className="status-dot" />
          <span className="status-label">
            {backendStatus === 'online' ? 'API Online' : 'Local Engine'}
          </span>
        </div>
      </div>
    </header>
  );
}
