import React, { useState } from 'react';
import {
  Check,
  Copy,
  Zap,
  Clock,
  Hash,
  Sparkles,
  ArrowRight,
  RotateCw,
} from 'lucide-react';

export default function SolutionViewer({
  moves = [],
  currentStepIndex = 0,
  onJumpToStep,
  solveTime = null,
  isSolving = false,
  error = null,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!moves.length) return;
    const text = moves.join(' ');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <div className="solution-viewer-card error-state">
        <div className="error-title">Solver Error</div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (isSolving) {
    return (
      <div className="solution-viewer-card loading-state">
        <div className="pulsing-cube-loader">
          <div className="cube-spinner" />
        </div>
        <h4>AI Computing Optimal Path...</h4>
        <p>Running two-phase IDA* search to find minimum move sequence.</p>
      </div>
    );
  }

  if (!moves || moves.length === 0) {
    return (
      <div className="solution-viewer-card empty-state">
        <Sparkles size={32} className="empty-icon text-indigo-400" />
        <h4>No Active Solution</h4>
        <p>
          Scramble the cube, scan your faces, or click <strong>"Solve Cube"</strong> to generate step-by-step instructions.
        </p>
      </div>
    );
  }

  return (
    <div className="solution-viewer-card">
      {/* Metrics Row */}
      <div className="solution-metrics-row">
        <div className="metric-badge">
          <Hash size={15} className="metric-icon text-cyan" />
          <div className="metric-content">
            <span className="metric-val">{moves.length}</span>
            <span className="metric-lbl">Total Moves</span>
          </div>
        </div>

        {solveTime !== null && (
          <div className="metric-badge">
            <Clock size={15} className="metric-icon text-emerald" />
            <div className="metric-content">
              <span className="metric-val">{solveTime}s</span>
              <span className="metric-lbl">Compute Time</span>
            </div>
          </div>
        )}

        <div className="metric-badge">
          <Zap size={15} className="metric-icon text-amber" />
          <div className="metric-content">
            <span className="metric-val">
              {currentStepIndex} / {moves.length}
            </span>
            <span className="metric-lbl">Current Step</span>
          </div>
        </div>

        <button
          className="copy-notation-btn"
          onClick={handleCopy}
          title="Copy move sequence to clipboard"
        >
          {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      {/* Interactive Moves Flow */}
      <div className="moves-flow-container">
        <div className="moves-chips-list">
          {moves.map((move, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex - 1;
            const isNext = idx === currentStepIndex;

            return (
              <button
                key={`${move}-${idx}`}
                className={`move-chip ${isCompleted ? 'completed' : ''} ${
                  isCurrent ? 'current-active' : ''
                } ${isNext ? 'next-up' : ''}`}
                onClick={() => onJumpToStep && onJumpToStep(idx + 1)}
                title={`Jump to step ${idx + 1}: ${move}`}
              >
                <span className="chip-step">{idx + 1}</span>
                <span className="chip-notation">{move}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
