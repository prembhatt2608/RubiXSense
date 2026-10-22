import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Cube3D from './components/Cube3D';
import CubeNetEditor from './components/CubeNetEditor';
import SolutionViewer from './components/SolutionViewer';
import ScannerModal from './components/ScannerModal';
import {
  SOLVED_STATE,
  applyMove,
  applySequence,
  parseMoveString,
  validateStateLocally,
} from './utils/cubeMath';
import {
  checkBackendHealth,
  solveCubeAPI,
  generateScrambleAPI,
} from './services/api';
import {
  Sparkles,
  Zap,
  RotateCw,
  Box,
  Eye,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
  const [faceletState, setFaceletState] = useState(SOLVED_STATE);
  const [solutionBaseState, setSolutionBaseState] = useState(null);
  const [solutionMoves, setSolutionMoves] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [solveTime, setSolveTime] = useState(null);
  const [isSolving, setIsSolving] = useState(false);
  const [solverError, setSolverError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [viewMode, setViewMode] = useState('both'); // 'both' | '3d' | 'net'

  // Check Backend Health on mount and periodically
  useEffect(() => {
    let mounted = true;
    const ping = async () => {
      const health = await checkBackendHealth();
      if (mounted) {
        setBackendStatus(health.status === 'ok' ? 'online' : 'offline');
      }
    };
    ping();
    const timer = setInterval(ping, 10000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Update State & reset solution if state changed manually
  const handleStateChange = useCallback((newState) => {
    setFaceletState(newState);
    setSolverError(null);
  }, []);

  // Random Scramble
  const handleRandomScramble = async () => {
    try {
      setIsSolving(true);
      const res = await generateScrambleAPI(20);
      const moves = parseMoveString(res.scramble);
      const scrambledState = applySequence(SOLVED_STATE, moves);

      setFaceletState(scrambledState);
      setSolutionBaseState(null);
      setSolutionMoves([]);
      setCurrentStepIndex(0);
      setSolveTime(null);
      setSolverError(null);
    } finally {
      setIsSolving(false);
    }
  };

  // Apply Preset Pattern
  const handleApplyPreset = (moveNotation) => {
    const moves = parseMoveString(moveNotation);
    const newState = applySequence(SOLVED_STATE, moves);
    setFaceletState(newState);
    setSolutionBaseState(null);
    setSolutionMoves([]);
    setCurrentStepIndex(0);
    setSolveTime(null);
    setSolverError(null);
  };

  // Reset to Solved
  const handleResetSolved = () => {
    setFaceletState(SOLVED_STATE);
    setSolutionBaseState(null);
    setSolutionMoves([]);
    setCurrentStepIndex(0);
    setSolveTime(null);
    setSolverError(null);
  };

  // Execute Solve
  const handleSolve = async () => {
    if (faceletState === SOLVED_STATE) {
      confetti({ particleCount: 70, spread: 60 });
      setSolutionMoves([]);
      setCurrentStepIndex(0);
      setSolutionBaseState(null);
      return;
    }

    setIsSolving(true);
    setSolverError(null);
    const currentState = faceletState;
    const startTime = performance.now();

    try {
      const res = await solveCubeAPI(currentState);
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      setSolveTime(duration);

      const moves = parseMoveString(res.solution);
      setSolutionBaseState(currentState);
      setSolutionMoves(moves);
      setCurrentStepIndex(0);

      // Play soft celebration confetti on fast solve
      confetti({
        particleCount: 50,
        spread: 50,
        origin: { y: 0.7 },
      });
    } catch (err) {
      setSolverError(err.message || 'Unable to solve this cube state.');
    } finally {
      setIsSolving(false);
    }
  };

  // Jump to specific step in solution and sync 3D state
  const handleJumpToStep = (targetStep) => {
    if (!solutionBaseState || !solutionMoves.length) {
      setCurrentStepIndex(targetStep);
      return;
    }
    const clamped = Math.max(0, Math.min(targetStep, solutionMoves.length));
    const nextState = applySequence(solutionBaseState, solutionMoves.slice(0, clamped));
    setFaceletState(nextState);
    setCurrentStepIndex(clamped);
  };

  // Apply quick manual face turn
  const handleQuickTurn = (move) => {
    const next = applyMove(faceletState, move);
    setFaceletState(next);
    setSolutionBaseState(null);
    setSolutionMoves([]);
    setCurrentStepIndex(0);
  };

  const isSolved = faceletState === SOLVED_STATE;
  const validation = validateStateLocally(faceletState);

  return (
    <div className="app-layout">
      {/* Top Header */}
      <Header
        backendStatus={backendStatus}
        onRandomScramble={handleRandomScramble}
        onApplyPreset={handleApplyPreset}
        onOpenScanner={() => setIsScannerOpen(true)}
        onResetSolved={handleResetSolved}
        isSolving={isSolving}
      />

      {/* Main Workspace */}
      <main className="main-content">
        {/* Left Column: 3D Visualization & Solution Controls */}
        <section className="left-panel">
          <div className="panel-card cube-stage-card">
            {/* View Mode Switcher */}
            <div className="stage-header">
              <div className="stage-title">
                <Box size={18} className="icon-cyan" />
                <h2>3D Interactive Simulator</h2>
              </div>

              <div className="stage-view-toggles">
                <button
                  className={`toggle-pill ${viewMode === 'both' ? 'active' : ''}`}
                  onClick={() => setViewMode('both')}
                  title="Show 3D View and 2D Net Editor together"
                >
                  Split View
                </button>
                <button
                  className={`toggle-pill ${viewMode === '3d' ? 'active' : ''}`}
                  onClick={() => setViewMode('3d')}
                  title="Maximize 3D Interactive View"
                >
                  3D Solo
                </button>
                <button
                  className={`toggle-pill ${viewMode === 'net' ? 'active' : ''}`}
                  onClick={() => setViewMode('net')}
                  title="Maximize 2D Net Editor"
                >
                  2D Net
                </button>
              </div>
            </div>

            {/* 3D Canvas Component */}
            {viewMode !== 'net' && (
              <Cube3D
                faceletState={faceletState}
                onStateChange={handleStateChange}
                solutionMoves={solutionMoves}
                currentStepIndex={currentStepIndex}
                onStepChange={setCurrentStepIndex}
                isSolving={isSolving}
              />
            )}

            {/* Quick manual quarter-turn controls */}
            <div className="quick-turns-toolbar">
              <span className="toolbar-label">Quick Turns:</span>
              <div className="turns-group">
                {['U', 'D', 'L', 'R', 'F', 'B'].map((f) => (
                  <div key={f} className="turn-pair">
                    <button
                      className="turn-btn"
                      onClick={() => handleQuickTurn(f)}
                      title={`Turn ${f} clockwise`}
                    >
                      {f}
                    </button>
                    <button
                      className="turn-btn prime"
                      onClick={() => handleQuickTurn(f + "'")}
                      title={`Turn ${f}' counter-clockwise`}
                    >
                      {f}'
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Solution Timeline & Move Chips Viewer */}
          <SolutionViewer
            moves={solutionMoves}
            currentStepIndex={currentStepIndex}
            onJumpToStep={handleJumpToStep}
            solveTime={solveTime}
            isSolving={isSolving}
            error={solverError}
          />
        </section>

        {/* Right Column: AI Action Panel & 2D Net Editor */}
        <section className={`right-panel ${viewMode === '3d' ? 'hidden-on-mobile' : ''}`}>
          {/* Main Primary Solve CTA Card */}
          <div className="action-hub-card">
            <div className="hub-top">
              <div className="hub-info">
                <h3>AI Solver Engine</h3>
                <p>
                  {isSolved
                    ? 'Cube is currently in a solved state.'
                    : 'Optimal solution ready to compute in seconds.'}
                </p>
              </div>

              <div className={`cube-state-badge ${isSolved ? 'solved' : 'scrambled'}`}>
                {isSolved ? (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Solved</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Scrambled</span>
                  </>
                )}
              </div>
            </div>

            <button
              className={`solve-cta-btn ${isSolved ? 'disabled-solved' : ''}`}
              onClick={handleSolve}
              disabled={isSolving || isSolved || !validation.valid}
            >
              <Zap size={22} className="cta-icon" />
              <span>
                {isSolving
                  ? 'Calculating Optimal Solution...'
                  : isSolved
                  ? 'Cube is Already Solved'
                  : 'Solve Cube with AI'}
              </span>
            </button>

            {!validation.valid && (
              <div className="validation-warning-callout">
                <AlertCircle size={15} />
                <span>Fix sticker counts in the Net Editor before solving.</span>
              </div>
            )}
          </div>

          {/* 2D Unfolded Net Editor */}
          {viewMode !== '3d' && (
            <CubeNetEditor
              faceletState={faceletState}
              onStateChange={handleStateChange}
            />
          )}
        </section>
      </main>

      {/* Webcam Scanner Modal */}
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        initialState={faceletState}
        onApplyScan={handleStateChange}
      />
    </div>
  );
}
