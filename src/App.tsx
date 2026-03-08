/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Trophy, Play, RotateCcw, Zap, Volume2, VolumeX, Pause, PlayCircle, Info, ChevronRight, MousePointer2, Keyboard, Palette, Lock, Check, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Sound Synthesis Utility
const playSound = (type: 'jump' | 'score' | 'collision' | 'powerup', enabled: boolean, volume: number = 0.5) => {
  if (!enabled || volume <= 0) return;
  
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  
  const ctx = new AudioContextClass();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  const now = ctx.currentTime;
  const masterVolume = volume * 0.5; // Scale down for comfort
  
  if (type === 'jump') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
    gain.gain.setValueAtTime(0.1 * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.01 * masterVolume, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'score') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
    gain.gain.setValueAtTime(0.05 * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.01 * masterVolume, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'collision') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    gain.gain.setValueAtTime(0.2 * masterVolume, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'powerup') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
    gain.gain.setValueAtTime(0.1 * masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.01 * masterVolume, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
};

// Constants
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_HEIGHT = 100;
const PLAYER_SIZE = 40;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 40;
const INITIAL_SPEED = 5;
const SPEED_INCREMENT = 0.001;
const POWERUP_SIZE = 30;

type PowerUpType = 'SHIELD' | 'BOOST' | 'BLAST';

interface Obstacle {
  x: number;
  width: number;
  height: number;
  passed: boolean;
}

interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  width: number;
  height: number;
  collected: boolean;
}

// Customization Types
interface CustomizationOption {
  id: string;
  name: string;
  value: string;
  unlockScore: number;
}

const COLORS: CustomizationOption[] = [
  { id: 'blue', name: 'Cyan', value: '#00f3ff', unlockScore: 0 },
  { id: 'pink', name: 'Magenta', value: '#ff00ff', unlockScore: 0 },
  { id: 'green', name: 'Lime', value: '#39ff14', unlockScore: 20 },
  { id: 'yellow', name: 'Gold', value: '#ffff00', unlockScore: 50 },
  { id: 'red', name: 'Crimson', value: '#ff0000', unlockScore: 100 },
];

const SHAPES: CustomizationOption[] = [
  { id: 'square', name: 'Square', value: 'square', unlockScore: 0 },
  { id: 'circle', name: 'Circle', value: 'circle', unlockScore: 10 },
  { id: 'diamond', name: 'Diamond', value: 'diamond', unlockScore: 30 },
  { id: 'star', name: 'Star', value: 'star', unlockScore: 75 },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'TUTORIAL' | 'CUSTOMIZE' | 'SETTINGS'>('START');
  const [tutorialStep, setTutorialStep] = useState(0);
  const [score, setScore] = useState(0);
  const [survivalTime, setSurvivalTime] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Settings State
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('neon-runner-volume');
    return saved ? parseFloat(saved) : 0.5;
  });
  const [visualEffects, setVisualEffects] = useState(() => {
    const saved = localStorage.getItem('neon-runner-effects');
    return saved !== 'false'; // Default to true
  });
  const [controlScheme, setControlScheme] = useState<'standard' | 'arrows'>(() => {
    return (localStorage.getItem('neon-runner-controls') as 'standard' | 'arrows') || 'standard';
  });
  
  const [selectedColor, setSelectedColor] = useState(() => {
    return localStorage.getItem('neon-runner-color') || COLORS[0].value;
  });
  const [selectedShape, setSelectedShape] = useState(() => {
    return localStorage.getItem('neon-runner-shape') || SHAPES[0].value;
  });

  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('neon-runner-highscore');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [activePowerUps, setActivePowerUps] = useState<{ [key in PowerUpType]?: number }>({});

  const hasSeenTutorial = useRef(localStorage.getItem('neon-runner-tutorial-seen') === 'true');

  // Game state refs for the loop
  const playerY = useRef(0);
  const playerVelocity = useRef(0);
  const obstacles = useRef<Obstacle[]>([]);
  const powerUps = useRef<PowerUp[]>([]);
  const gameSpeed = useRef(INITIAL_SPEED);
  const frameId = useRef<number>(0);
  const lastTime = useRef<number>(0);
  const obstacleTimer = useRef<number>(0);
  const powerUpTimer = useRef<number>(0);
  const activePowerUpTimers = useRef<{ [key in PowerUpType]?: number }>({});

  const resetGame = useCallback(() => {
    if (!hasSeenTutorial.current && gameState !== 'TUTORIAL') {
      setGameState('TUTORIAL');
      setTutorialStep(0);
      return;
    }
    playerY.current = window.innerHeight - GROUND_HEIGHT - PLAYER_SIZE;
    playerVelocity.current = 0;
    obstacles.current = [];
    powerUps.current = [];
    setActivePowerUps({});
    activePowerUpTimers.current = {};
    gameSpeed.current = INITIAL_SPEED;
    setScore(0);
    setSurvivalTime(0);
    setGameState('PLAYING');
    lastTime.current = performance.now();
    obstacleTimer.current = 0;
    powerUpTimer.current = 0;
  }, [gameState]);

  const completeTutorial = () => {
    hasSeenTutorial.current = true;
    localStorage.setItem('neon-runner-tutorial-seen', 'true');
    resetGame();
  };

  const togglePause = useCallback(() => {
    setGameState(prev => {
      if (prev === 'PLAYING') return 'PAUSED';
      if (prev === 'PAUSED') {
        lastTime.current = performance.now(); // Reset lastTime to avoid huge deltaTime
        return 'PLAYING';
      }
      return prev;
    });
  }, []);

  const jump = useCallback(() => {
    if (gameState !== 'PLAYING') return;
    
    const groundY = window.innerHeight - GROUND_HEIGHT - PLAYER_SIZE;
    if (playerY.current >= groundY - 1) {
      playerVelocity.current = JUMP_FORCE;
      playSound('jump', soundEnabled, volume);
    }
  }, [gameState, soundEnabled, volume]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Pause/Resume
      if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
        return;
      }

      // Jump/Start logic based on control scheme
      const isJumpKey = controlScheme === 'standard' 
        ? (e.code === 'Space' || e.code === 'ArrowUp')
        : (e.code === 'ArrowUp' || e.code === 'KeyW');

      if (isJumpKey) {
        if (gameState === 'PLAYING') {
          jump();
        } else if (gameState === 'START' || gameState === 'GAMEOVER') {
          resetGame();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, jump, resetGame, togglePause]);

  useEffect(() => {
    if (gameState !== 'PLAYING' && gameState !== 'PAUSED') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const update = (time: number) => {
      if (gameState === 'PAUSED') {
        // Just keep drawing current state without updating logic
        draw(ctx, canvas, performance.now());
        frameId.current = requestAnimationFrame(update);
        return;
      }

      const deltaTime = time - lastTime.current;
      lastTime.current = time;

      if (gameState === 'PLAYING') {
        setSurvivalTime(prev => prev + deltaTime / 1000);
      }

      // Update power-up timers
      const currentTimers = activePowerUpTimers.current;
      let timersChanged = false;
      (Object.keys(currentTimers) as PowerUpType[]).forEach(type => {
        if (currentTimers[type]! > 0) {
          currentTimers[type]! -= deltaTime;
        } else {
          delete currentTimers[type];
          timersChanged = true;
        }
      });
      if (timersChanged) {
        setActivePowerUps({ ...currentTimers });
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update player
      playerVelocity.current += GRAVITY;
      playerY.current += playerVelocity.current;

      const groundY = canvas.height - GROUND_HEIGHT - PLAYER_SIZE;
      if (playerY.current > groundY) {
        playerY.current = groundY;
        playerVelocity.current = 0;
      }

      // Update game speed
      const isBoosted = activePowerUpTimers.current['BOOST'] && activePowerUpTimers.current['BOOST']! > 0;
      const effectiveSpeed = isBoosted ? gameSpeed.current * 1.5 : gameSpeed.current;
      gameSpeed.current += SPEED_INCREMENT;

      // Spawn obstacles
      obstacleTimer.current += deltaTime;
      const spawnInterval = Math.max(800, 2000 - gameSpeed.current * 100);
      if (obstacleTimer.current > spawnInterval) {
        obstacles.current.push({
          x: canvas.width,
          width: OBSTACLE_WIDTH,
          height: OBSTACLE_HEIGHT + Math.random() * 20,
          passed: false,
        });
        obstacleTimer.current = 0;
      }

      // Spawn power-ups
      powerUpTimer.current += deltaTime;
      const powerUpInterval = 8000 + Math.random() * 7000; // Every 8-15 seconds
      if (powerUpTimer.current > powerUpInterval) {
        const types: PowerUpType[] = ['SHIELD', 'BOOST', 'BLAST'];
        const type = types[Math.floor(Math.random() * types.length)];
        powerUps.current.push({
          x: canvas.width,
          y: canvas.height - GROUND_HEIGHT - PLAYER_SIZE - 50 - Math.random() * 100,
          type,
          width: POWERUP_SIZE,
          height: POWERUP_SIZE,
          collected: false,
        });
        powerUpTimer.current = 0;
      }

      // Update obstacles
      for (let i = obstacles.current.length - 1; i >= 0; i--) {
        const obs = obstacles.current[i];
        obs.x -= effectiveSpeed;

        // Collision detection
        const playerX = 100;
        const playerWidth = PLAYER_SIZE;
        const playerHeight = PLAYER_SIZE;

        const isShielded = activePowerUpTimers.current['SHIELD'] && activePowerUpTimers.current['SHIELD']! > 0;

        if (
          playerX < obs.x + obs.width &&
          playerX + playerWidth > obs.x &&
          playerY.current < canvas.height - GROUND_HEIGHT &&
          playerY.current + playerHeight > canvas.height - GROUND_HEIGHT - obs.height
        ) {
          if (isBoosted || isShielded) {
            // Destroy obstacle if boosted or shielded
            obstacles.current.splice(i, 1);
            if (isShielded && !isBoosted) {
              delete activePowerUpTimers.current['SHIELD'];
              setActivePowerUps({ ...activePowerUpTimers.current });
            }
            continue;
          } else {
            setGameState('GAMEOVER');
            playSound('collision', soundEnabled, volume);
            return;
          }
        }

        // Score tracking
        if (!obs.passed && obs.x + obs.width < playerX) {
          obs.passed = true;
          setScore(s => {
            playSound('score', soundEnabled, volume);
            return s + 1;
          });
        }

        // Remove off-screen obstacles
        if (obs.x + obs.width < 0) {
          obstacles.current.splice(i, 1);
        }
      }

      // Update power-ups
      for (let i = powerUps.current.length - 1; i >= 0; i--) {
        const pu = powerUps.current[i];
        pu.x -= effectiveSpeed;

        // Collision detection
        const playerX = 100;
        const playerWidth = PLAYER_SIZE;
        const playerHeight = PLAYER_SIZE;

        if (
          !pu.collected &&
          playerX < pu.x + pu.width &&
          playerX + playerWidth > pu.x &&
          playerY.current < pu.y + pu.height &&
          playerY.current + playerHeight > pu.y
        ) {
          pu.collected = true;
          playSound('powerup', soundEnabled, volume);
          
          if (pu.type === 'BLAST') {
            obstacles.current = [];
          } else {
            activePowerUpTimers.current[pu.type] = 5000; // 5 seconds
            setActivePowerUps({ ...activePowerUpTimers.current });
          }
          powerUps.current.splice(i, 1);
          continue;
        }

        // Remove off-screen power-ups
        if (pu.x + pu.width < 0) {
          powerUps.current.splice(i, 1);
        }
      }

      draw(ctx, canvas, time);
      frameId.current = requestAnimationFrame(update);
    };

    const draw = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, time: number) => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Ground
      ctx.strokeStyle = '#9d00ff';
      ctx.lineWidth = 2;
      if (visualEffects) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#9d00ff';
      }
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - GROUND_HEIGHT);
      ctx.lineTo(canvas.width, canvas.height - GROUND_HEIGHT);
      ctx.stroke();
      
      // Draw Grid Lines (Perspective effect)
      ctx.strokeStyle = `rgba(157, 0, 255, 0.2)`;
      for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, canvas.height - GROUND_HEIGHT);
        ctx.lineTo(i + (i - canvas.width / 2) * 2, canvas.height);
        ctx.stroke();
      }

      // Draw Horizontal Grid Lines (Moving effect)
      const gridOffset = (time * 0.1 * gameSpeed.current) % 50;
      for (let i = 0; i < GROUND_HEIGHT; i += 20) {
        const y = canvas.height - GROUND_HEIGHT + i + (gridOffset * (i / GROUND_HEIGHT));
        if (y < canvas.height) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      }

      // Draw Player
      const playerScale = 1;
      ctx.fillStyle = selectedColor;
      if (visualEffects) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = selectedColor;
      }
      
      const px = 100;
      const py = playerY.current;
      const ps = PLAYER_SIZE * playerScale;
      const offset = (PLAYER_SIZE - ps) / 2;

      if (selectedShape === 'square') {
        ctx.fillRect(px + offset, py + offset, ps, ps);
      } else if (selectedShape === 'circle') {
        ctx.beginPath();
        ctx.arc(px + PLAYER_SIZE / 2, py + PLAYER_SIZE / 2, ps / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (selectedShape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(px + PLAYER_SIZE / 2, py + offset);
        ctx.lineTo(px + PLAYER_SIZE / 2 + ps / 2, py + PLAYER_SIZE / 2);
        ctx.lineTo(px + PLAYER_SIZE / 2, py + PLAYER_SIZE / 2 + ps / 2);
        ctx.lineTo(px + PLAYER_SIZE / 2 - ps / 2, py + PLAYER_SIZE / 2);
        ctx.closePath();
        ctx.fill();
      } else if (selectedShape === 'star') {
        const spikes = 5;
        const outerRadius = ps / 2;
        const innerRadius = ps / 4;
        let rot = (Math.PI / 2) * 3;
        let x = px + PLAYER_SIZE / 2;
        let y = py + PLAYER_SIZE / 2;
        let step = Math.PI / spikes;

        ctx.beginPath();
        ctx.moveTo(px + PLAYER_SIZE / 2, py + PLAYER_SIZE / 2 - outerRadius);
        for (let i = 0; i < spikes; i++) {
          x = px + PLAYER_SIZE / 2 + Math.cos(rot) * outerRadius;
          y = py + PLAYER_SIZE / 2 + Math.sin(rot) * outerRadius;
          ctx.lineTo(x, y);
          rot += step;

          x = px + PLAYER_SIZE / 2 + Math.cos(rot) * innerRadius;
          y = py + PLAYER_SIZE / 2 + Math.sin(rot) * innerRadius;
          ctx.lineTo(x, y);
          rot += step;
        }
        ctx.lineTo(px + PLAYER_SIZE / 2, py + PLAYER_SIZE / 2 - outerRadius);
        ctx.closePath();
        ctx.fill();
      }
      
      // Draw Player Effects
      const isShielded = activePowerUpTimers.current['SHIELD'] && activePowerUpTimers.current['SHIELD']! > 0;
      const isBoosted = activePowerUpTimers.current['BOOST'] && activePowerUpTimers.current['BOOST']! > 0;

      if (isShielded) {
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px + ps / 2, py + ps / 2, ps * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        if (visualEffects) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#00f3ff';
        }
      }

      if (isBoosted) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.fillRect(px - 20, py, 15, ps);
        ctx.fillRect(px - 40, py + 10, 10, ps - 20);
      }
      
      ctx.shadowBlur = 0;

      // Draw Obstacles
      ctx.fillStyle = '#ff00ff';
      if (visualEffects) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff00ff';
      }
      obstacles.current.forEach(obs => {
        ctx.beginPath();
        ctx.moveTo(obs.x, canvas.height - GROUND_HEIGHT);
        ctx.lineTo(obs.x + obs.width / 2, canvas.height - GROUND_HEIGHT - obs.height);
        ctx.lineTo(obs.x + obs.width, canvas.height - GROUND_HEIGHT);
        ctx.closePath();
        ctx.fill();
      });

      // Draw Power-ups
      powerUps.current.forEach(pu => {
        ctx.shadowBlur = visualEffects ? 15 : 0;
        if (pu.type === 'SHIELD') {
          ctx.fillStyle = '#00f3ff';
          ctx.shadowColor = '#00f3ff';
          ctx.beginPath();
          ctx.arc(pu.x + pu.width / 2, pu.y + pu.height / 2, pu.width / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (pu.type === 'BOOST') {
          ctx.fillStyle = '#ffff00';
          ctx.shadowColor = '#ffff00';
          ctx.fillRect(pu.x, pu.y, pu.width, pu.height);
        } else if (pu.type === 'BLAST') {
          ctx.fillStyle = '#ff0055';
          ctx.shadowColor = '#ff0055';
          ctx.beginPath();
          ctx.moveTo(pu.x + pu.width / 2, pu.y);
          ctx.lineTo(pu.x + pu.width, pu.y + pu.height);
          ctx.lineTo(pu.x, pu.y + pu.height);
          ctx.closePath();
          ctx.fill();
        }
      });
      ctx.shadowBlur = 0;
    };

    frameId.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId.current);
  }, [gameState, soundEnabled, volume, visualEffects, selectedColor, selectedShape]);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('neon-runner-highscore', score.toString());
    }
  }, [score, highScore]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col items-center justify-center select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
        onClick={jump}
      />

      {/* Active Power-ups */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 flex gap-4">
        <AnimatePresence>
          {(Object.entries(activePowerUps) as [PowerUpType, number][]).map(([type, time]) => (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-md ${
                type === 'SHIELD' ? 'border-neon-blue text-neon-blue bg-neon-blue/10' :
                type === 'BOOST' ? 'border-yellow-400 text-yellow-400 bg-yellow-400/10' :
                'border-neon-pink text-neon-pink bg-neon-pink/10'
              }`}
            >
              <Zap className={`w-4 h-4 ${type === 'BOOST' ? 'animate-pulse' : ''}`} />
              <span className="text-xs font-bold tracking-widest">{type}</span>
              <div className="w-12 h-1 bg-white/20 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-current"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: (time || 0) / 1000, ease: 'linear' }}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* UI Overlay */}
      <div className="absolute top-8 left-8 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-neon-blue neon-glow-blue font-bold text-2xl">
          <Zap className="w-6 h-6" />
          <span>SCORE: {score}</span>
        </div>
        <div className="flex items-center gap-2 text-neon-green neon-glow-green font-bold text-xl">
          <Clock className="w-5 h-5" />
          <span className="font-mono">
            {Math.floor(survivalTime / 60).toString().padStart(2, '0')}:
            {Math.floor(survivalTime % 60).toString().padStart(2, '0')}.
            {Math.floor((survivalTime % 1) * 100).toString().padStart(2, '0')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-neon-pink neon-glow-pink font-semibold text-lg opacity-80">
          <Trophy className="w-5 h-5" />
          <span>BEST: {highScore}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-8 right-8 z-10 flex items-center gap-3">
        {gameState === 'PLAYING' && (
          <button 
            onClick={togglePause}
            className="p-3 rounded-full border border-neon-blue/30 text-neon-blue hover:bg-neon-blue/10 transition-colors"
            title="Pause (P)"
          >
            <Pause className="w-6 h-6" />
          </button>
        )}
        <button 
          onClick={() => {
            setGameState('SETTINGS');
          }}
          className="p-3 rounded-full border border-neon-blue/30 text-neon-blue hover:bg-neon-blue/10 transition-colors"
          title="Settings"
        >
          <Zap className="w-6 h-6" />
        </button>
        <button 
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-3 rounded-full border border-neon-blue/30 text-neon-blue hover:bg-neon-blue/10 transition-colors"
          title={soundEnabled ? "Mute" : "Unmute"}
        >
          {soundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
        </button>
      </div>

      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="z-20 flex flex-col items-center gap-8 p-12 rounded-3xl bg-black/40 backdrop-blur-md border border-neon-blue/30 neon-border-blue"
          >
            <h1 className="text-7xl font-black tracking-tighter text-white neon-glow-blue italic">
              NEON RUNNER
            </h1>
            <div className="flex flex-col items-center gap-2">
              <p className="text-neon-blue/70 text-center max-w-xs font-medium uppercase tracking-widest text-sm">
                Avoid the triangles. Jump to survive.
              </p>
              {!hasSeenTutorial.current && (
                <span className="text-[10px] text-neon-pink font-bold uppercase tracking-[0.2em] animate-pulse">
                  New Player Detected
                </span>
              )}
            </div>
            <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={resetGame}
                  className="group relative px-12 py-4 bg-transparent text-neon-blue border-2 border-neon-blue rounded-full font-bold text-xl overflow-hidden transition-all hover:bg-neon-blue hover:text-black active:scale-95"
                >
                  <div className="flex items-center justify-center gap-3">
                    <Play className="w-6 h-6 fill-current" />
                    {hasSeenTutorial.current ? 'START GAME' : 'BEGIN MISSION'}
                  </div>
                </button>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setGameState('CUSTOMIZE');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all text-sm font-bold uppercase tracking-widest"
                  >
                    <Palette className="w-4 h-4" />
                    Skins
                  </button>
                  {hasSeenTutorial.current && (
                    <button
                      onClick={() => {
                        setGameState('TUTORIAL');
                        setTutorialStep(0);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all text-sm font-bold uppercase tracking-widest"
                    >
                      <Info className="w-4 h-4" />
                      Help
                    </button>
                  )}
                </div>
            </div>
          </motion.div>
        )}

        {gameState === 'CUSTOMIZE' && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="z-40 absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
          >
            <div className="max-w-2xl w-full flex flex-col gap-8 p-10 rounded-3xl border border-neon-blue/30 bg-black/60 neon-border-blue">
              <div className="flex justify-between items-center">
                <h2 className="text-4xl font-black text-white italic">CUSTOMIZE</h2>
                <div className="flex items-center gap-2 text-neon-pink font-bold">
                  <Trophy className="w-5 h-5" />
                  <span>BEST: {highScore}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Colors Section */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-white/50 uppercase tracking-[0.2em]">Neon Colors</h3>
                  <div className="grid grid-cols-5 gap-3">
                    {COLORS.map(color => {
                      const isLocked = highScore < color.unlockScore;
                      const isSelected = selectedColor === color.value;
                      return (
                        <button
                          key={color.id}
                          disabled={isLocked}
                          onClick={() => {
                            setSelectedColor(color.value);
                            localStorage.setItem('neon-runner-color', color.value);
                          }}
                          className={`relative aspect-square rounded-xl border-2 transition-all flex items-center justify-center ${
                            isSelected ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                          } ${isLocked ? 'opacity-30 grayscale' : ''}`}
                          style={{ backgroundColor: color.value }}
                        >
                          {isSelected && <Check className="w-5 h-5 text-black" />}
                          {isLocked && <Lock className="w-4 h-4 text-white absolute -bottom-1 -right-1 bg-black rounded-full p-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Shapes Section */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-white/50 uppercase tracking-[0.2em]">Pulse Shapes</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {SHAPES.map(shape => {
                      const isLocked = highScore < shape.unlockScore;
                      const isSelected = selectedShape === shape.value;
                      return (
                        <button
                          key={shape.id}
                          disabled={isLocked}
                          onClick={() => {
                            setSelectedShape(shape.value);
                            localStorage.setItem('neon-runner-shape', shape.value);
                          }}
                          className={`relative aspect-square rounded-xl border-2 transition-all flex items-center justify-center bg-white/5 ${
                            isSelected ? 'border-neon-blue scale-110' : 'border-white/10 hover:border-white/30'
                          } ${isLocked ? 'opacity-30' : ''}`}
                        >
                          <div 
                            className="w-6 h-6" 
                            style={{ 
                              backgroundColor: isLocked ? '#fff' : selectedColor,
                              clipPath: shape.value === 'square' ? 'inset(0)' : 
                                       shape.value === 'circle' ? 'circle(50%)' :
                                       shape.value === 'diamond' ? 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' :
                                       shape.value === 'star' ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' : 'none'
                            }}
                          />
                          {isLocked && <Lock className="w-4 h-4 text-white absolute -bottom-1 -right-1 bg-black rounded-full p-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex flex-col gap-4">
                <div className="flex items-center gap-4 text-sm text-white/50">
                  <div className="w-10 h-10 rounded-lg border border-white/20 flex items-center justify-center overflow-hidden bg-black">
                    <div 
                      className="w-6 h-6" 
                      style={{ 
                        backgroundColor: selectedColor,
                        clipPath: selectedShape === 'square' ? 'inset(0)' : 
                                 selectedShape === 'circle' ? 'circle(50%)' :
                                 selectedShape === 'diamond' ? 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' :
                                 selectedShape === 'star' ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' : 'none'
                      }}
                    />
                  </div>
                  <p>Preview: {COLORS.find(c => c.value === selectedColor)?.name} {SHAPES.find(s => s.value === selectedShape)?.name}</p>
                </div>
                
                <button
                  onClick={() => setGameState('START')}
                  className="w-full py-4 bg-neon-blue text-black rounded-full font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(0,243,255,0.4)]"
                >
                  SAVE & RETURN
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'TUTORIAL' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="z-40 absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          >
            <motion.div
              key={tutorialStep}
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              className="flex flex-col items-center gap-8 max-w-md w-full p-10 rounded-3xl border border-neon-blue/30 bg-black/60 neon-border-blue text-center"
            >
              <div className="w-20 h-20 rounded-2xl bg-neon-blue/10 flex items-center justify-center text-neon-blue border border-neon-blue/20">
                {tutorialStep === 0 && <Zap className="w-10 h-10" />}
                {tutorialStep === 1 && <MousePointer2 className="w-10 h-10" />}
                {tutorialStep === 2 && <Keyboard className="w-10 h-10" />}
                {tutorialStep === 3 && <Zap className="w-10 h-10 text-yellow-400" />}
              </div>

              <div className="space-y-4">
                <h3 className="text-3xl font-black text-white italic">
                  {tutorialStep === 0 && "THE MISSION"}
                  {tutorialStep === 1 && "MOVEMENT"}
                  {tutorialStep === 2 && "STRATEGY"}
                  {tutorialStep === 3 && "POWER-UPS"}
                </h3>
                <p className="text-neon-blue/80 leading-relaxed">
                  {tutorialStep === 0 && "You are a data pulse in the neon grid. Avoid the pink corruption spikes. Every spike cleared increases your score."}
                  {tutorialStep === 1 && "Jump over obstacles by clicking anywhere on the screen or pressing the SPACE bar or UP arrow."}
                  {tutorialStep === 2 && "The grid accelerates over time. Use P or ESC to pause if you need a breather. Good luck, runner."}
                  {tutorialStep === 3 && "Collect glowing orbs for temporary advantages: Shields, Speed Boosts, or Screen Blasts."}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {[0, 1, 2, 3].map(i => (
                  <div 
                    key={i} 
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === tutorialStep ? 'w-8 bg-neon-blue' : 'w-2 bg-neon-blue/20'}`} 
                  />
                ))}
              </div>

              <button
                onClick={() => {
                  if (tutorialStep < 3) setTutorialStep(s => s + 1);
                  else completeTutorial();
                }}
                className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-neon-blue text-black rounded-full font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(0,243,255,0.4)]"
              >
                {tutorialStep < 3 ? "NEXT" : "I'M READY"}
                <ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'SETTINGS' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="z-40 absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
          >
            <div className="max-w-md w-full flex flex-col gap-8 p-10 rounded-3xl border border-neon-blue/30 bg-black/60 neon-border-blue">
              <h2 className="text-4xl font-black text-white italic text-center">SETTINGS</h2>

              <div className="space-y-6">
                {/* Volume */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-white/50 uppercase tracking-[0.2em]">Volume</label>
                    <span className="text-neon-blue font-mono text-xs">{Math.round(volume * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    value={volume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setVolume(v);
                      localStorage.setItem('neon-runner-volume', v.toString());
                    }}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-neon-blue"
                  />
                </div>

                {/* Visual Effects */}
                <div className="flex justify-between items-center py-2 border-y border-white/5">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-[0.2em]">Visual Effects</label>
                  <button
                    onClick={() => {
                      const next = !visualEffects;
                      setVisualEffects(next);
                      localStorage.setItem('neon-runner-effects', next.toString());
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative ${visualEffects ? 'bg-neon-blue' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${visualEffects ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                {/* Control Scheme */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-[0.2em]">Control Scheme</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setControlScheme('standard');
                        localStorage.setItem('neon-runner-controls', 'standard');
                      }}
                      className={`flex-1 py-3 rounded-xl border transition-all text-xs font-bold ${
                        controlScheme === 'standard' ? 'border-neon-blue bg-neon-blue/10 text-white' : 'border-white/10 text-white/40 hover:border-white/30'
                      }`}
                    >
                      SPACE / CLICK
                    </button>
                    <button
                      onClick={() => {
                        setControlScheme('arrows');
                        localStorage.setItem('neon-runner-controls', 'arrows');
                      }}
                      className={`flex-1 py-3 rounded-xl border transition-all text-xs font-bold ${
                        controlScheme === 'arrows' ? 'border-neon-blue bg-neon-blue/10 text-white' : 'border-white/10 text-white/40 hover:border-white/30'
                      }`}
                    >
                      ARROWS / WASD
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setGameState('START');
                }}
                className="w-full py-4 bg-neon-blue text-black rounded-full font-bold text-lg transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(0,243,255,0.4)]"
              >
                CLOSE
              </button>
            </div>
          </motion.div>
        )}

        {gameState === 'PAUSED' && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(8px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            className="z-30 absolute inset-0 flex flex-col items-center justify-center bg-black/20"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-8 p-12 rounded-3xl border border-neon-blue/30 neon-border-blue bg-black/60"
            >
              <h2 className="text-6xl font-black text-neon-blue neon-glow-blue italic">
                PAUSED
              </h2>
              <button
                onClick={togglePause}
                className="flex items-center gap-3 px-10 py-4 bg-neon-blue text-black rounded-full font-bold text-xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(0,243,255,0.4)]"
              >
                <PlayCircle className="w-6 h-6" />
                RESUME
              </button>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'GAMEOVER' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="z-20 flex flex-col items-center gap-6 p-12 rounded-3xl bg-black/60 backdrop-blur-xl border border-neon-pink/30 neon-border-pink"
          >
            <h2 className="text-6xl font-black text-neon-pink neon-glow-pink italic">
              GAME OVER
            </h2>
            <div className="flex flex-col items-center gap-1">
              <span className="text-neon-pink/60 uppercase tracking-widest text-xs font-bold">Final Score</span>
              <span className="text-5xl font-bold text-white">{score}</span>
            </div>
            {score === highScore && score > 0 && (
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-neon-green font-bold text-sm tracking-widest uppercase"
              >
                New High Score!
              </motion.div>
            )}
            <button
              onClick={resetGame}
              className="mt-4 flex items-center gap-3 px-10 py-4 bg-neon-pink text-black rounded-full font-bold text-xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,0,255,0.4)]"
            >
              <RotateCcw className="w-6 h-6" />
              TRY AGAIN
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Ambience */}
      {visualEffects && (
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-blue rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-pink rounded-full blur-[120px]" />
        </div>
      )}
    </div>
  );
}
