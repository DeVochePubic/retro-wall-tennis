/**
 * Retro Wall Tennis - 3D Game Engine (Three.js Version)
 * 70s-inspired local 2-player squash-style wall tennis game in 3D.
 */

// ==========================================================================
// Game Configuration & State
// ==========================================================================
const CONFIG = {
  canvasWidth: 800,
  canvasHeight: 600,
  paddleWidth: 16,
  paddleHeight: 90,
  paddleSpeed: 13, // Double speed (was 7)
  ballRadius: 10, // Slightly bigger for 3D visibility
  ballInitialSpeedMap: {
    slow: 9,
    normal: 15, // Double speed (was 7.5)
    fast: 21  // Double speed (was 10)
  },
  maxBounceAngle: 9, // Deflection scale
  speedIncrement: 0.5, // Double rate of speed increase (was 0.25)
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
    x: 40,
    y: 255,
    width: CONFIG.paddleWidth,
    height: CONFIG.paddleHeight,
    score: 0,
    color: '#ff3344',
    glowColor: 'rgba(255, 51, 68, 0.8)'
  },
  p2: {
    x: 75,
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
    soundEnabled: true,
    crtEnabled: false
  },
  // Serve variables
  isServing: false,
  serveTimer: 0,
  server: 'P1',
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
let canvas;
let scoreP1Val, scoreP2Val;
let turnIndicator;
let menuOverlay;
let btnStart, btnSettings, btnPause, btnMenuSettings, btnCloseSettings;
let settingsDialog;
let selectSpeed, selectMaxScore, selectTheme, checkSound, checkCrt;

// Web Audio API Context
let audioCtx = null;

// ==========================================================================
// Three.js 3D Graphics Engine Variables
// ==========================================================================
let scene, camera, renderer;
let meshP1, meshP2, meshBall;
let meshGrid, meshRightWall, meshTopWall, meshBottomWall;
let pointLightBall, ambientLight, dirLight;
let trailMeshes = [];

// Theme Colors mapping for 3D elements
const THEME_COLORS = {
  green: {
    primary: 0x00ff66,
    bg: 0x050c06,
    grid: 0x004411,
    wall: 0x00bb44
  },
  amber: {
    primary: 0xffb000,
    bg: 0x0c0700,
    grid: 0x442a00,
    wall: 0xbb8000
  },
  monochrome: {
    primary: 0xffffff,
    bg: 0x0f0f0f,
    grid: 0x333333,
    wall: 0x888888
  }
};

// ==========================================================================
// Initialization & Event Binding
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  initDOM();
  initThree();
  initEvents();
  applyTheme();
  
  // Start the render loop
  requestAnimationFrame(gameLoop);
});

function initDOM() {
  canvas = document.getElementById('game-canvas');
  
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
  checkCrt = document.getElementById('check-crt');
  
  readSettings();
}

function initThree() {
  // 1. Create WebGL Renderer inside existing Canvas
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(CONFIG.canvasWidth, CONFIG.canvasHeight, false);
  renderer.setClearColor(0x000000, 1.0);
  renderer.shadowMap.enabled = true;

  // 2. Create 3D Scene
  scene = new THREE.Scene();

  // 3. Create Camera (斜め上のレトロクォータービュー)
  camera = new THREE.PerspectiveCamera(60, CONFIG.canvasWidth / CONFIG.canvasHeight, 1, 2000);
  // Positioned to fit both the left paddles (around X=-350) and the right wall (X=400) within the frustum
  camera.position.set(-120, 180, 650);
  camera.lookAt(60, 0, 0);

  // 4. Lights
  ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
  dirLight.position.set(-200, -200, 300);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // Dynamic light attached to the ball (neon glow projection)
  pointLightBall = new THREE.PointLight(0x00ff66, 1.5, 250);
  pointLightBall.castShadow = true;

  // 5. Build 3D Stage Meshes
  // Map 2D coordinate system: (0, 0) top-left -> (800, 600) bottom-right
  // 3D coordinates: X is horizontal (-400 to 400), Y is vertical (300 to -300)
  
  // Floor Grid (Z = -20)
  const gridGeom = new THREE.PlaneGeometry(900, 680, 18, 14);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0x004411, wireframe: true });
  meshGrid = new THREE.Mesh(gridGeom, gridMat);
  meshGrid.position.set(50, 0, -20);
  scene.add(meshGrid);

  // Material for walls
  const wallMat = new THREE.MeshStandardMaterial({ 
    color: 0x00ff66, 
    roughness: 0.4, 
    metalness: 0.8 
  });

  // Right bounce wall (X = 400)
  const rightWallGeom = new THREE.BoxGeometry(20, 640, 40);
  meshRightWall = new THREE.Mesh(rightWallGeom, wallMat);
  meshRightWall.position.set(400, 0, 0);
  meshRightWall.receiveShadow = true;
  scene.add(meshRightWall);

  // Top Wall (Y = 300)
  const topWallGeom = new THREE.BoxGeometry(840, 20, 40);
  meshTopWall = new THREE.Mesh(topWallGeom, wallMat);
  meshTopWall.position.set(-10, 300, 0);
  meshTopWall.receiveShadow = true;
  scene.add(meshTopWall);

  // Bottom Wall (Y = -300)
  meshBottomWall = new THREE.Mesh(topWallGeom, wallMat);
  meshBottomWall.position.set(-10, -300, 0);
  meshBottomWall.receiveShadow = true;
  scene.add(meshBottomWall);

  // 6. Build 3D Paddles (BoxGeometry)
  const paddleGeom = new THREE.BoxGeometry(CONFIG.paddleWidth, CONFIG.paddleHeight, 30);
  
  const p1Mat = new THREE.MeshStandardMaterial({ 
    color: 0xff3344, 
    emissive: 0xff3344, 
    emissiveIntensity: 0.6,
    roughness: 0.2
  });
  meshP1 = new THREE.Mesh(paddleGeom, p1Mat);
  meshP1.castShadow = true;
  scene.add(meshP1);

  const p2Mat = new THREE.MeshStandardMaterial({ 
    color: 0x3388ff, 
    emissive: 0x3388ff, 
    emissiveIntensity: 0.6,
    roughness: 0.2
  });
  meshP2 = new THREE.Mesh(paddleGeom, p2Mat);
  meshP2.castShadow = true;
  scene.add(meshP2);

  // 7. Build 3D Ball (Sphere)
  const ballGeom = new THREE.SphereGeometry(CONFIG.ballRadius, 24, 24);
  const ballMat = new THREE.MeshStandardMaterial({ 
    color: 0xffffff, 
    emissive: 0xffffff, 
    emissiveIntensity: 0.8 
  });
  meshBall = new THREE.Mesh(ballGeom, ballMat);
  meshBall.castShadow = true;
  meshBall.add(pointLightBall); // Attach neon point light
  scene.add(meshBall);

  // 8. Build 3D Trail Meshes (pooling static spheres)
  const trailGeom = new THREE.SphereGeometry(CONFIG.ballRadius * 0.9, 16, 16);
  for (let i = 0; i < state.maxTrailLength; i++) {
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0
    });
    const trailMesh = new THREE.Mesh(trailGeom, trailMat);
    scene.add(trailMesh);
    trailMeshes.push(trailMesh);
  }
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
    
    if (['ArrowUp', 'ArrowDown', ' ', 'w', 's', 'W', 'S'].includes(e.key) && state.gameState === 'PLAYING') {
      e.preventDefault();
    }

    if (e.key === ' ' && (state.gameState === 'PLAYING' || state.gameState === 'PAUSED')) {
      togglePause();
    }
  });

  window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
  });

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
    
    // Scale motion to canvas coordinate space
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    
    let targetY = touchState[playerKey].paddleY + diffY * scaleY;
    
    targetY = Math.max(0, Math.min(canvas.height - CONFIG.paddleHeight, targetY));
    state[playerKey].y = targetY;
  }, { passive: false });

  element.addEventListener('touchend', (e) => {
    touchState[playerKey].active = false;
  });
}

// ==========================================================================
// Settings & Themes
// ==========================================================================
function readSettings() {
  state.settings.initialSpeed = selectSpeed.value;
  state.settings.maxScore = parseInt(selectMaxScore.value, 10);
  state.settings.theme = selectTheme.value;
  state.settings.soundEnabled = checkSound.checked;
  state.settings.crtEnabled = checkCrt.checked;
  
  CONFIG.scoreToWin = state.settings.maxScore;
}

function applyTheme() {
  // 1. Update HTML/CSS Theme Class
  document.body.classList.remove('crt-theme-green', 'crt-theme-amber', 'crt-theme-monochrome');
  document.body.classList.add(`crt-theme-${state.settings.theme}`);

  // 2. Update 3D Colors based on theme
  const theme = THEME_COLORS[state.settings.theme];
  if (!theme) return;

  renderer.setClearColor(theme.bg, 1.0);
  meshGrid.material.color.setHex(theme.grid);
  meshRightWall.material.color.setHex(theme.wall);
  meshTopWall.material.color.setHex(theme.wall);
  meshBottomWall.material.color.setHex(theme.wall);

  // Sync ball glow light color
  if (state.settings.theme === 'monochrome') {
    pointLightBall.color.setHex(0xffffff);
    // Neutralize paddle materials for monochrome
    meshP1.material.color.setHex(0xffffff);
    meshP1.material.emissive.setHex(0xffffff);
    meshP2.material.color.setHex(0xaaaaaa);
    meshP2.material.emissive.setHex(0xaaaaaa);
  } else {
    pointLightBall.color.setHex(theme.primary);
    // Restore red and blue neon for color themes
    meshP1.material.color.setHex(0xff3344);
    meshP1.material.emissive.setHex(0xff3344);
    meshP2.material.color.setHex(0x3388ff);
    meshP2.material.emissive.setHex(0x3388ff);
  }

  // Toggle CRT class on body
  if (state.settings.crtEnabled) {
    document.body.classList.add('crt-enabled');
  } else {
    document.body.classList.remove('crt-enabled');
  }
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
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playWinSound() {
  const notes = [261.63, 329.63, 392.00, 523.25];
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
  
  state.server = Math.random() > 0.5 ? 'P1' : 'P2';
  setupServe();
  
  playBeep(523.25, 'triangle', 0.2);
}

function togglePause() {
  if (state.gameState === 'PLAYING') {
    state.gameState = 'PAUSED';
    btnPause.innerText = 'RESUME';
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
  state.serveTimer = 90;
  state.turn = state.server;
  
  const ball = state.ball;
  ball.trail = [];
  
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
  
  ball.dx = ball.speed;
  ball.dy = (Math.random() * 2 - 1) * (ball.speed * 0.4);
  
  playBeep(587.33, 'square', 0.1);
}

function swapTurn() {
  state.turn = state.turn === 'P1' ? 'P2' : 'P1';
  updateHUD();
}

function updateHUD() {
  const activeName = state.turn === 'P1' ? 'P1 TURN (RED)' : 'P2 TURN (BLUE)';
  turnIndicator.innerText = activeName;
  
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

  // 2. Handle Gamepad Input
  handleGamepads();

  // 3. Serve Countdown Handling
  if (state.isServing) {
    const serverPaddle = state.server === 'P1' ? state.p1 : state.p2;
    state.ball.x = serverPaddle.x + serverPaddle.width + CONFIG.ballRadius + 2;
    state.ball.y = serverPaddle.y + serverPaddle.height / 2;
    
    state.serveTimer--;
    if (state.serveTimer <= 0) {
      fireServe();
    }
    return;
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
  if (ball.y - CONFIG.ballRadius <= 0) {
    ball.y = CONFIG.ballRadius;
    ball.dy = -ball.dy;
    playBeep(220, 'triangle', 0.08);
  }
  if (ball.y + CONFIG.ballRadius >= CONFIG.canvasHeight) {
    ball.y = CONFIG.canvasHeight - CONFIG.ballRadius;
    ball.dy = -ball.dy;
    playBeep(220, 'triangle', 0.08);
  }
  if (ball.x + CONFIG.ballRadius >= CONFIG.canvasWidth) {
    ball.x = CONFIG.canvasWidth - CONFIG.ballRadius;
    ball.dx = -ball.dx;
    playBeep(293.66, 'triangle', 0.08);
  }

  // 6. Paddle Collisions
  const activePaddle = state.turn === 'P1' ? state.p1 : state.p2;
  
  if (
    ball.dx < 0 &&
    ball.x - CONFIG.ballRadius <= activePaddle.x + activePaddle.width &&
    ball.x + CONFIG.ballRadius >= activePaddle.x &&
    ball.y + CONFIG.ballRadius >= activePaddle.y &&
    ball.y - CONFIG.ballRadius <= activePaddle.y + activePaddle.height
  ) {
    ball.x = activePaddle.x + activePaddle.width + CONFIG.ballRadius;
    ball.dx = -ball.dx;

    const relativeY = (ball.y - (activePaddle.y + activePaddle.height / 2)) / (activePaddle.height / 2);
    ball.dy = relativeY * CONFIG.maxBounceAngle;

    ball.speed += CONFIG.speedIncrement;
    const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
    ball.dx = (ball.dx / currentSpeed) * ball.speed;
    ball.dy = (ball.dy / currentSpeed) * ball.speed;

    playBeep(state.turn === 'P1' ? 440 : 493.88, 'square', 0.1);
    swapTurn();
  }

  // 7. Left Boundary Breach (Score event)
  if (ball.x - CONFIG.ballRadius < 0) {
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
      state.server = scorer;
      setupServe();
    }
  }
}

function movePaddles() {
  if (keysPressed['w'] || keysPressed['W']) {
    state.p1.y = Math.max(0, state.p1.y - CONFIG.paddleSpeed);
  }
  if (keysPressed['s'] || keysPressed['S']) {
    state.p1.y = Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p1.y + CONFIG.paddleSpeed);
  }

  if (keysPressed['ArrowUp']) {
    state.p2.y = Math.max(0, state.p2.y - CONFIG.paddleSpeed);
  }
  if (keysPressed['ArrowDown']) {
    state.p2.y = Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p2.y + CONFIG.paddleSpeed);
  }
}

function handleGamepads() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp1 = gamepads[0];
  const gp2 = gamepads[1];

  if (gp1) {
    const stickY = gp1.axes[1];
    if (Math.abs(stickY) > 0.15) {
      state.p1.y = Math.max(0, Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p1.y + stickY * CONFIG.paddleSpeed));
    }
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
    const stick2Y = gp1.axes[3];
    if (Math.abs(stick2Y) > 0.15) {
      state.p2.y = Math.max(0, Math.min(CONFIG.canvasHeight - CONFIG.paddleHeight, state.p2.y + stick2Y * CONFIG.paddleSpeed));
    }
  }
}

// ==========================================================================
// Rendering Engine (Three.js WebGL & 3D Coordinate Mapping)
// ==========================================================================
function render() {
  // Update 3D object coordinates based on internal 2D physics values
  
  // 1. Map 2D coordinates to 3D space
  // 2D bounds: X is [0 to 800], Y is [0 to 600]
  // 3D bounds: X mapping is [x - 400], Y mapping is [-(y - 300)]
  
  // Update Paddle P1 position
  const p1X_3d = state.p1.x + state.p1.width / 2 - 400;
  const p1Y_3d = -(state.p1.y + state.p1.height / 2 - 300);
  meshP1.position.set(p1X_3d, p1Y_3d, 0);

  // Update Paddle P2 position
  const p2X_3d = state.p2.x + state.p2.width / 2 - 400;
  const p2Y_3d = -(state.p2.y + state.p2.height / 2 - 300);
  meshP2.position.set(p2X_3d, p2Y_3d, 0);

  // Visual opacity feedback for turn status
  const p1Active = state.turn === 'P1';
  meshP1.material.opacity = p1Active ? 1.0 : 0.22;
  meshP1.material.transparent = true;
  meshP2.material.opacity = !p1Active ? 1.0 : 0.22;
  meshP2.material.transparent = true;

  // Update Ball position
  const ballX_3d = state.ball.x - 400;
  const ballY_3d = -(state.ball.y - 300);
  
  // Add a slight bounce height (Z axis bounce effect on hits)
  let ballZ_3d = 0;
  if (!state.isServing) {
    // Fake elevation curve based on absolute speed components (cos curve)
    ballZ_3d = Math.abs(Math.sin(state.ball.x * 0.015)) * 15;
  }
  meshBall.position.set(ballX_3d, ballY_3d, ballZ_3d);

  // Serve blink visual
  if (state.isServing && Math.floor(Date.now() / 200) % 2 === 0) {
    meshBall.visible = false;
    pointLightBall.intensity = 0.0;
  } else {
    meshBall.visible = true;
    pointLightBall.intensity = 2.0;
  }

  // Update light color & trail colors to match current turn player
  if (state.settings.theme !== 'monochrome') {
    const activeColor = p1Active ? 0xff3344 : 0x3388ff;
    pointLightBall.color.setHex(activeColor);
    meshBall.material.color.setHex(activeColor);
    meshBall.material.emissive.setHex(activeColor);
  } else {
    meshBall.material.color.setHex(0xffffff);
    meshBall.material.emissive.setHex(0xffffff);
  }

  // 2. Render 3D Trail
  // Sync trail meshes to state.ball.trail history array
  const trailLen = state.ball.trail.length;
  for (let i = 0; i < state.maxTrailLength; i++) {
    const trailMesh = trailMeshes[i];
    if (i < trailLen && !state.isServing) {
      const pt = state.ball.trail[i];
      const tx = pt.x - 400;
      const ty = -(pt.y - 300);
      const tz = Math.abs(Math.sin(pt.x * 0.015)) * 12; // trace Z height
      
      trailMesh.position.set(tx, ty, tz);
      trailMesh.visible = true;

      // Setup fade out opacity and scale towards the tail
      const progress = (i + 1) / trailLen;
      trailMesh.material.opacity = progress * 0.15;
      trailMesh.material.transparent = true;
      trailMesh.scale.setScalar(0.5 + progress * 0.5);

      // Set trail color matching active color
      if (state.settings.theme !== 'monochrome') {
        trailMesh.material.color.setHex(p1Active ? 0xff3344 : 0x3388ff);
      } else {
        trailMesh.material.color.setHex(0xffffff);
      }
    } else {
      trailMesh.visible = false;
    }
  }

  // 3. Render Three.js WebGL Scene
  renderer.render(scene, camera);
}
