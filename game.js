/**
 * Retro Wall Tennis - Game Engine
 * 70s-inspired local 2-player squash-style wall tennis game.
 */

// ==========================================================================
// Game Configuration & State
// ==========================================================================
const CONFIG = {
  canvasWidth: 800,
  canvasHeight: 600,
  paddleWidth: 16,
  paddleHeight: 90,
  paddleSpeed: 7,
  ballRadius: 8,
  ballInitialSpeedMap: {
    slow: 5,
    normal: 7.5,
    fast: 10
  },
  maxBounceAngle: 5, // Y-velocity modifier on paddle edge hit
  speedIncrement: 0.25, // Speed increase on each bounce
  scoreToWin: 11
};

const state = {
  gameState: 'MENU', // 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
  turn: 'P1', // 'P1' | 'P2' (whose turn it is to hit)
  winner: null,
  ball: {
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    speed: 0,
    trail: [] // Array of {x, y} for CRT phosphor persistence trail
  },
  p1: {
    x: 40, // Back paddle
    y: 255,
    width: CONFIG.paddleWidth,
    height: CONFIG.paddleHeight,
    score: 0,
    color: '#ff3344',
    glowColor: 'rgba(255, 51, 68, 0.8)'
  },
  p2: {
    x: 75, // Front paddle (slightly shifted for visibility)
    y: 255,
    width: CONFIG.paddleWidth,
    height: CONFIG.paddleHeight,
    score: 0,
    color: '#3388ff',
    glowColor: 'rgba(51, 136, 255, 0.8)'
  },
  settings: {
    initialSpeed: 'normal',
    maxScore: 11,
    theme: 'green',
    soundEnabled: true
  },
  // Serve variables
  isServing: false,
  serveTimer: 0,
  server: 'P1',
  // Trail length config
  maxTrailLength: 6
};

// Controls keys mapping
const keysPressed = {};

// Touch position tracking
const touchState = {
  p1: { active: false, startY: 0, paddleY: 0 },
  p2: { active: false, startY: 0, paddleY: 0 }
};

// DOM Elements
let canvas, ctx;
let scoreP1Val, scoreP2Val;
let turnIndicator;
let menuOverlay;
let btnStart, btnSettings, btnPause, btnMenuSettings, btnCloseSettings;
let settingsDialog;
let selectSpeed, selectMaxScore, selectTheme, checkSound;

// Web Audio API Context
let audioCtx = null;

// ==========================================================================
// Initialization & Event Binding
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  initDOM();
  initEvents();
  resizeCanvas();
  
  // Start the render loop (drawing static retro lines initially)
  requestAnimationFrame(gameLoop);
});

function initDOM() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  
  scoreP1Val = document.getElementById('score-p1-val');
  scoreP2Val = document.getElementById('score-p2-val');
  turnIndicator = document.getElementById('turn-indicator');
  menuOverlay = document.getElementById('menu-overlay');
  
  btnStart = document.getElementById('btn-start');
  btnSettings = document.getElementById('btn-settings');
  btnPause = document.getElementById('btn-pause');
  btnMenuSettings = document.getElementById('btn-menu-settings');
  btnCloseSettings = document.getElementById('btn-close-settings');
  
  settingsDialog = document.getElementById('settings-dialog');
  
  selectSpeed = document.getElementById('select-speed');
  selectMaxScore = document.getElementById('select-max-score');
  selectTheme = document.getElementById('select-theme');
  checkSound = document.getElementById('check-sound');
  
  // Set initial settings state from DOM (defaults)
  readSettings();
}

function initEvents() {
  // Game Setup & Overlay Buttons
  btnStart.addEventListener('click', startGame);
  btnSettings.addEventListener('click', () => settingsDialog.showModal());
  btnPause.addEventListener('click', togglePause);
  btnMenuSettings.addEventListener('click', () => settingsDialog.showModal());
  btnCloseSettings.addEventListener('click', () => settingsDialog.close());
  
  // Settings Form Submit
  settingsDialog.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    readSettings();
    applyTheme();
    // Audio Context Init on User Interaction
    initAudioContext();
    playBeep(440, 'triangle', 0.1);
    settingsDialog.close();
  });

  // Keyboard events
  window.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
    
    // Prevent default scrolling for arrows and spacebar during game play
    if (['ArrowUp', 'ArrowDown', ' ', 'w', 's', 'W', 'S'].includes(e.key) && state.gameState === 'PLAYING') {
      e.preventDefault();
    }

    // Spacebar to pause
    if (e.key === ' ' && (state.gameState === 'PLAYING' || state.gameState === 'PAUSED')) {
      togglePause();
    }
  });

  window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
  });

  // Resize canvas when window size changes
  window.addEventListener('resize', resizeCanvas);

  // Touch controls binding
  const zoneP1 = document.getElementById('zone-p1');
  const zoneP2 = document.getElementById('zone-p2');

  if ('ontouchstart' in window) {
    document.body.classList.add('is-touch');
    
    setupTouchZone(zoneP1, 'p1');
    setupTouchZone(zoneP2, 'p2');
  }
}

function setupTouchZone(element, playerKey) {
  element.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    touchState[playerKey].active = true;
    touchState[playerKey].startY = touch.clientY;
    touchState[playerKey].paddleY = state[playerKey].y;
  }, { passive: false });

  element.addEventListener('touchmove', (e) => {
    if (!touchState[playerKey].active) return;
    e.preventDefault();
    const touch = e.touches[0];
    const diffY = touch.clientY - touchState[playerKey].startY;
    
    // Smoothly scale Y motion relative to canvas sizing
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    
    let targetY = touchState[playerKey].paddleY + diffY * scaleY;
    
    // Keep in bounds
    targetY = Math.max(0, Math.min(canvas.height - CONFIG.paddleHeight, targetY));
    state[playerKey].y = targetY;
  }, { passive: false });

  element.addEventListener('touchend', (e) => {
    touchState[playerKey].active = false;
  });
}

function resizeCanvas() {
  // Visual layout handling is managed by CSS via object-fit,
  // so we keep the logical canvas resolution constant.
}

// ==========================================================================
// Settings & Themes
// ==========================================================================
function readSettings() {
  state.settings.initialSpeed = selectSpeed.value;
  state.settings.maxScore = parseInt(selectMaxScore.value, 10);
  state.settings.theme = selectTheme.value;
  state.settings.soundEnabled = checkSound.checked;
  
  CONFIG.scoreToWin = state.settings.maxScore;
}

function applyTheme() {
  // Remove all theme classes
  document.body.classList.remove('crt-theme-green', 'crt-theme-amber', 'crt-theme-monochrome');
  // Add selected theme class
  document.body.classList.add(`crt-theme-${state.settings.theme}`);
}

// ==========================================================================
// Web Audio Synthesis (70s retro sound simulator)
// ==========================================================================
function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/**
 * Generate synthetic retro sound effects using OscillatorNodes
 */
function playBeep(frequency, type = 'square', duration = 0.1, slideToFreq = null) {
  if (!state.settings.soundEnabled) return;
  initAudioContext();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

  if (slideToFreq) {
    osc.frequency.exponentialRampToValueAtTime(slideToFreq, audioCtx.currentTime + duration);
  }

  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  // Smooth volume envelope to avoid audio clicks
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playWinSound() {
  const notes = [261.63, 329.63, 392.00, 523.25]; // C E G C melody
  notes.forEach((freq, index) => {
    setTimeout(() => {
      playBeep(freq, 'triangle', 0.15);
    }, index * 160);
  });
}

function playLoseSound() {
  playBeep(180, 'sawtooth', 0.4, 60);
}

// ==========================================================================
// Game Logic & State Transitions
// ==========================================================================
function startGame() {
  initAudioContext();
  
  state.gameState = 'PLAYING';
  state.winner = null;
  state.p1.score = 0;
  state.p2.score = 0;
  
  updateScoreboard();
  
  menuOverlay.style.display = 'none';
  btnPause.disabled = false;
  
  // Initial serve
  state.server = Math.random() > 0.5 ? 'P1' : 'P2';
  setupServe();
  
  playBeep(523.25, 'triangle', 0.2); // Start game chime
}

function togglePause() {
  if (state.gameState === 'PLAYING') {
    state.gameState = 'PAUSED';
    btnPause.innerText = 'RESUME';
    // Show partial overlay
    menuOverlay.style.display = 'flex';
    menuOverlay.querySelector('.overlay-title').innerText = 'PAUSED';
    menuOverlay.querySelector('.overlay-subtitle').innerText = 'スペースキーまたはRESUMEボタンで再開';
    btnStart.innerText = 'RESUME GAME';
  } else if (state.gameState === 'PAUSED') {
    state.gameState = 'PLAYING';
    btnPause.innerText = 'PAUSE';
    menuOverlay.style.display = 'none';
    btnStart.innerText = 'GAME START';
    initAudioContext();
  }
}

function gameOver(winnerName) {
  state.gameState = 'GAMEOVER';
  state.winner = winnerName;
  btnPause.disabled = true;
  
  menuOverlay.style.display = 'flex';
  menuOverlay.querySelector('.overlay-title').innerText = `${winnerName} WINS!`;
  menuOverlay.querySelector('.overlay-subtitle').innerText = 'おめでとう！レトロテニスの王者は君だ。';
  btnStart.innerText = 'PLAY AGAIN';
  
  playWinSound();
}

function setupServe() {
  state.isServing = true;
  state.serveTimer = 90; // Frame count countdown (~1.5s)
  state.turn = state.server;
  
  const ball = state.ball;
  ball.trail = [];
  
  // Place ball in front of the server's paddle
  const serverPaddle = state.server === 'P1' ? state.p1 : state.p2;
  ball.x = serverPaddle.x + serverPaddle.width + CONFIG.ballRadius + 2;
  ball.y = serverPaddle.y + serverPaddle.height / 2;
  ball.dx = 0;
  ball.dy = 0;
  ball.speed = CONFIG.ballInitialSpeedMap[state.settings.initialSpeed];
  
  updateHUD();
}

function fireServe() {
  state.isServing = false;
  const ball = state.ball;
  
  // Serve towards the wall (right side)
  ball.dx = ball.speed;
  // Random slight vertical angle
  ball.dy = (Math.random() * 2 - 1) * (ball.speed * 0.4);
  
  playBeep(587.33, 'square', 0.1); // Serve beep
}

function swapTurn() {
  state.turn = state.turn === 'P1' ? 'P2' : 'P1';
  updateHUD();
}

function updateHUD() {
  const activeName = state.turn === 'P1' ? 'P1 TURN (RED)' : 'P2 TURN (BLUE)';
  turnIndicator.innerText = activeName;
  
  // Visual indicators on HUD
  turnIndicator.style.borderColor = state.turn === 'P1' ? 'var(--color-p1)' : 'var(--color-p2)';
  turnIndicator.style.textShadow = state.turn === 'P1' ? '0 0 5px var(--color-p1-glow)' : '0 0 5px var(--color-p2-glow)';
}

function updateScoreboard() {
  scoreP1Val.innerText = state.p1.score.toString().padStart(2, '0');
  scoreP2Val.innerText = state.p2.score.toString().padStart(2, '0');
}

// ==========================================================================
// Update Loop & Physics
// ==========================================================================
function gameLoop(timestamp) {
  updatePhysics();
  render();
  requestAnimationFrame(gameLoop);
}

function updatePhysics() {
  if (state.gameState !== 'PLAYING') return;

  // 1. Paddle movement based on keys
  movePaddles();

  // 2. Handle Gamepad Input if active
  handleGamepads();

  // 3. Serve Countdown Handling
  if (state.isServing) {
    // Keep ball locked to server paddle center before fire
    const serverPaddle = state.server === 'P1' ? state.p1 : state.p2;
    state.ball.x = serverPaddle.x + serverPaddle.width + CONFIG.ballRadius + 2;
    state.ball.y = serverPaddle.y + serverPaddle.height / 2;
    
    state.serveTimer--;
    if (state.serveTimer <= 0) {
      fireServe();
    }
    return; // Skip ball movement during serve setup
  }

  // 4. Ball motion physics
  const ball = state.ball;
  
  // Record trail
  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > state.maxTrailLength) {
    ball.trail.shift();
  }

  ball.x += ball.dx;
  ball.y += ball.dy;

  // 5. Wall bounce collisions (Top, Bottom, Right)
  // Top Wall
  if (ball.y - CONFIG.ballRadius <= 0) {
    ball.y = CONFIG.ballRadius;
    ball.dy = -ball.dy;
    playBeep(220, 'triangle', 0.08); // Low tone for wall hit
  }
  // Bottom Wall
  if (ball.y + CONFIG.ballRadius >= CONFIG.canvasHeight) {
    ball.y = CONFIG.canvasHeight - CONFIG.ballRadius;
    ball.dy = -ball.dy;
    playBeep(220, 'triangle', 0.08);
  }
  // Right Wall (Primary reflection wall)
  if (ball.x + CONFIG.ballRadius >= CONFIG.canvasWidth) {
    ball.x = CONFIG.canvasWidth - CONFIG.ballRadius;
    ball.dx = -ball.dx;
    playBeep(293.66, 'triangle', 0.08); // Mid-tone for back wall
  }

  // 6. Paddle Collisions (Only test active player's paddle)
  const activePaddle = state.turn === 'P1' ? state.p1 : state.p2;
  
  // Check if ball intersects active paddle
  // Standard AABB collision check
  if (
    ball.dx < 0 && // Only check collision if ball is moving left towards paddles
    ball.x - CONFIG.ballRadius <= activePaddle.x + activePaddle.width &&
    ball.x + CONFIG.ballRadius >= activePaddle.x &&
    ball.y + CONFIG.ballRadius >= activePaddle.y &&
    ball.y - CONFIG.ballRadius <= activePaddle.y + activePaddle.height
  ) {
    // Collision detected! Bounce back right
    ball.x = activePaddle.x + activePaddle.width + CONFIG.ballRadius;
    ball.dx = -ball.dx;

    // Calculate Y deflection based on where ball hits paddle (center is 0, edges scale to max angle)
    const relativeY = (ball.y - (activePaddle.y + activePaddle.height / 2)) / (activePaddle.height / 2);
    ball.dy = relativeY * CONFIG.maxBounceAngle;

    // Increment speed slightly for progressive difficulty
    ball.speed += CONFIG.speedIncrement;
    // Keep direction but scale up speed
    const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
    ball.dx = (ball.dx / currentSpeed) * ball.speed;
    ball.dy = (ball.dy / currentSpeed) * ball.speed;

    // Play hit sound
    playBeep(state.turn === 'P1' ? 440 : 493.88, 'square', 0.1);

    // Bounce successful: Swap turn to the other player
    swapTurn();
  }

  // 7. Left Boundary Breach (Score event)
  if (ball.x - CONFIG.ballRadius < 0) {
    // Current turn player failed to return. Opponent scores!
    const scorer = state.turn === 'P1' ? 'P2' : 'P1';
    
    if (scorer === 'P1') {
      state.p1.score++;
    } else {
      state.p2.score++;
    }

    updateScoreboard();
    playLoseSound();

    if (state.p1.score >= CONFIG.scoreToWin) {
      gameOver('P1 (RED)');
    } else if (state.p2.score >= CONFIG.scoreToWin) {
      gameOver('P2 (BLUE)');
    } else {
      // Setup next serve. Scorer serves.
      state.server = scorer;
      setupServe();
    }
  }
}

function movePaddles() {
  // P1 Control: W (Up), S (Down)
  if (keysPressed['w'] || keysPressed['W']) {
    state.p1.y = Math.max(0, state.p1.y - CONFIG.paddleSpeed);
  }
  if (keysPressed['s'] || keysPressed['S']) {
    state.p1.y = Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p1.y + CONFIG.paddleSpeed);
  }

  // P2 Control: ArrowUp, ArrowDown
  if (keysPressed['ArrowUp']) {
    state.p2.y = Math.max(0, state.p2.y - CONFIG.paddleSpeed);
  }
  if (keysPressed['ArrowDown']) {
    state.p2.y = Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p2.y + CONFIG.paddleSpeed);
  }
}

/**
 * Gamepad API implementation for local dual play
 */
function handleGamepads() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  
  // Gamepad 1 controls P1, Gamepad 2 controls P2 (or fallback to Gamepad 1 second stick)
  const gp1 = gamepads[0];
  const gp2 = gamepads[1];

  if (gp1) {
    // Joystick Y-Axis
    const stickY = gp1.axes[1];
    if (Math.abs(stickY) > 0.15) { // Deadzone check
      state.p1.y = Math.max(0, Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p1.y + stickY * CONFIG.paddleSpeed));
    }
    // D-pad Up / Down (buttons 12 / 13)
    if (gp1.buttons[12]?.pressed) {
      state.p1.y = Math.max(0, state.p1.y - CONFIG.paddleSpeed);
    }
    if (gp1.buttons[13]?.pressed) {
      state.p1.y = Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p1.y + CONFIG.paddleSpeed);
    }
  }

  if (gp2) {
    const stickY = gp2.axes[1];
    if (Math.abs(stickY) > 0.15) {
      state.p2.y = Math.max(0, Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p2.y + stickY * CONFIG.paddleSpeed));
    }
    if (gp2.buttons[12]?.pressed) {
      state.p2.y = Math.max(0, state.p2.y - CONFIG.paddleSpeed);
    }
    if (gp2.buttons[13]?.pressed) {
      state.p2.y = Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p2.y + CONFIG.paddleSpeed);
    }
  } else if (gp1 && gp1.axes.length >= 4) {
    // Fallback: If only 1 gamepad is connected, map Stick 2 (axes 3) to Player 2
    const stick2Y = gp1.axes[3];
    if (Math.abs(stick2Y) > 0.15) {
      state.p2.y = Math.max(0, Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p2.y + stick2Y * CONFIG.paddleSpeed));
    }
  }
}

// ==========================================================================
// Rendering Engine (CRT glow & trail effect)
// ==========================================================================
function render() {
  // Clear with dark scanline backdrop color
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);

  // Draw background grids (retro guidelines)
  drawBackgroundDecors();

  // Draw paddles
  drawPaddle(state.p1, state.turn === 'P1');
  drawPaddle(state.p2, state.turn === 'P2');

  // Draw ball (and trail)
  drawBall();
}

function drawBackgroundDecors() {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 2;
  
  // Right Wall border line
  ctx.beginPath();
  ctx.moveTo(CONFIG.canvasWidth - 5, 0);
  ctx.lineTo(CONFIG.canvasWidth - 5, CONFIG.canvasHeight);
  ctx.stroke();

  // Center horizontal net/dashed line to split space visually
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.setLineDash([10, 15]);
  ctx.beginPath();
  ctx.moveTo(110, CONFIG.canvasHeight / 2);
  ctx.lineTo(CONFIG.canvasWidth, CONFIG.canvasHeight / 2);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash pattern
}

function drawPaddle(paddle, isActive) {
  // Save context state
  ctx.save();

  // Color scheme: active player is full color, waiting player is faded
  let strokeColor, fillColor, glowColor;
  
  if (state.settings.theme === 'monochrome') {
    strokeColor = paddle.color;
    fillColor = isActive ? paddle.color : 'rgba(255, 255, 255, 0.15)';
    glowColor = isActive ? paddle.glowColor : 'transparent';
  } else {
    strokeColor = paddle.color;
    fillColor = isActive ? paddle.color : 'rgba(255, 255, 255, 0.05)'; // Super transparent if inactive
    glowColor = isActive ? paddle.glowColor : 'transparent';
  }

  // CRT glow (heavy shadow blur)
  if (isActive) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;
  }
  
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3;

  // Rounded retro rectangle style
  const r = 4; // corner radius
  const x = paddle.x;
  const y = paddle.y;
  const w = paddle.width;
  const h = paddle.height;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Restore context state
  ctx.restore();
}

function drawBall() {
  const ball = state.ball;
  
  ctx.save();

  // Color matching current active player
  let ballColor = 'var(--color-primary)';
  let ballGlow = 'var(--color-glow)';
  
  if (state.settings.theme !== 'monochrome') {
    ballColor = state.turn === 'P1' ? state.p1.color : state.p2.color;
    ballGlow = state.turn === 'P1' ? state.p1.glowColor : state.p2.glowColor;
  }

  // 1. Draw trail (persistence effect)
  ball.trail.forEach((pos, index) => {
    const alpha = (index + 1) / (ball.trail.length * 2.5); // Fade trail out
    ctx.fillStyle = ballColor;
    ctx.globalAlpha = alpha;
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, CONFIG.ballRadius * (0.6 + index * 0.08), 0, Math.PI * 2);
    ctx.fill();
  });

  // 2. Draw actual active ball
  ctx.globalAlpha = 1.0;
  ctx.shadowColor = ballGlow;
  ctx.shadowBlur = 18;
  ctx.fillStyle = ballColor;

  // Serve blink
  if (state.isServing && Math.floor(Date.now() / 200) % 2 === 0) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
  }

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, CONFIG.ballRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
