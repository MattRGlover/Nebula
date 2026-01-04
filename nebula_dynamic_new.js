// ═══════════════════════════════════════════════════════════════════════════════
// GENERATIVE NEBULA CLOUDS - CLEAN REBUILD
// Starting with ONE persistent cloud, then build up incrementally
// ═══════════════════════════════════════════════════════════════════════════════

let BASE_UNIT;
let startTime = 0;

// Mode definitions
const MODES = {
  BLACK_MULTI: { name: 'BLACK MULTI-COLOR', isBlack: true, isGray: false, isMono: false },
  BLACK_MONO: { name: 'BLACK MONO COLOR', isBlack: true, isGray: false, isMono: true },
  BLACK_GRAY: { name: 'BLACK GRAYSCALE', isBlack: true, isGray: true, isMono: true },
  WHITE_GRAY: { name: 'WHITE GRAYSCALE', isBlack: false, isGray: true, isMono: true },
  WHITE_MONO: { name: 'WHITE MONO COLOR', isBlack: false, isGray: false, isMono: true },
  WHITE_MULTI: { name: 'WHITE MULTI-COLOR', isBlack: false, isGray: false, isMono: false }
};

const MODE_DURATION_MIN = 10000;
const MODE_DURATION_MAX = 20000;
const TRANSITION_DURATION = 3000;
const MIN_COLOR_CHANGE_TIME = 6000;

// Mode state
let currentMode = 'BLACK_MULTI';
let targetMode = null;
let modeStartTime = 0;
let modeDuration = 0;
let transitionStartTime = 0;
let isTransitioning = false;
let justCrossedBridge = false;

// Single cloud state
let cloud = {
  x: 0,
  y: 0,
  radius: 0,
  rotationBaseHue: 0,
  currentHue: 0,
  currentSat: 100,
  currentBri: 55,
  targetHue: 0,
  targetSat: 100,
  targetBri: 55,
  transitionStartTime: 0
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  colorMode(HSB, 360, 100, 100, 1); // CRITICAL: Use HSB color mode
  BASE_UNIT = Math.min(width, height);
  startTime = millis();
  
  // Initialize single cloud at center
  cloud.x = width / 2;
  cloud.y = height / 2;
  cloud.radius = BASE_UNIT * 0.25;
  cloud.rotationBaseHue = 0; // Start at red
  cloud.currentHue = 0;
  
  console.log('🌫️ NEBULA CLOUDS - CLEAN BUILD - ONE CLOUD');
  console.log('Starting in BLACK MULTI-COLOR mode');
}

function draw() {
  const time = millis() - startTime;
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // MODE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════
  
  if (modeStartTime === 0) {
    modeStartTime = time;
    modeDuration = random(MODE_DURATION_MIN, MODE_DURATION_MAX);
    console.log(`✨ Starting: ${MODES[currentMode].name} for ${(modeDuration/1000).toFixed(1)}s`);
  }
  
  const timeInCurrentMode = time - modeStartTime;
  
  // Pick new mode after duration
  if (!isTransitioning && timeInCurrentMode >= modeDuration) {
    let validModes = [];
    
    if (currentMode === 'BLACK_MULTI' || currentMode === 'BLACK_MONO') {
      validModes = ['BLACK_MULTI', 'BLACK_MONO', 'BLACK_GRAY'];
    } else if (currentMode === 'BLACK_GRAY') {
      validModes = justCrossedBridge ? ['BLACK_MULTI', 'BLACK_MONO'] : ['BLACK_MULTI', 'BLACK_MONO', 'WHITE_GRAY'];
    } else if (currentMode === 'WHITE_GRAY') {
      validModes = justCrossedBridge ? ['WHITE_MULTI', 'WHITE_MONO'] : ['WHITE_MULTI', 'WHITE_MONO', 'BLACK_GRAY'];
    } else if (currentMode === 'WHITE_MULTI' || currentMode === 'WHITE_MONO') {
      validModes = ['WHITE_MULTI', 'WHITE_MONO', 'WHITE_GRAY'];
    }
    
    validModes = validModes.filter(m => m !== currentMode);
    targetMode = validModes[Math.floor(random(validModes.length))];
    transitionStartTime = time;
    isTransitioning = true;
    
    console.log(`🎯 Transitioning: ${MODES[currentMode].name} → ${MODES[targetMode].name}`);
  }
  
  // Complete transition
  if (isTransitioning && (time - transitionStartTime) >= TRANSITION_DURATION) {
    const previousMode = currentMode;
    currentMode = targetMode;
    targetMode = null;
    isTransitioning = false;
    modeStartTime = time;
    modeDuration = random(MODE_DURATION_MIN, MODE_DURATION_MAX);
    
    if ((previousMode === 'BLACK_GRAY' && currentMode === 'WHITE_GRAY') ||
        (previousMode === 'WHITE_GRAY' && currentMode === 'BLACK_GRAY')) {
      justCrossedBridge = true;
    } else if (currentMode === 'BLACK_MULTI' || currentMode === 'BLACK_MONO' ||
               currentMode === 'WHITE_MULTI' || currentMode === 'WHITE_MONO') {
      justCrossedBridge = false;
    }
    
    console.log(`✨ Arrived at: ${MODES[currentMode].name} for ${(modeDuration/1000).toFixed(1)}s`);
  }
  
  // Calculate transition progress
  const transitionT = isTransitioning ? 
    constrain((time - transitionStartTime) / TRANSITION_DURATION, 0, 1) : 
    (MODES[currentMode].isBlack ? 0 : 1);
  
  const currentModeObj = MODES[currentMode];
  const targetModeObj = targetMode ? MODES[targetMode] : currentModeObj;
  const isBlackMode = isTransitioning ? 
    (transitionT < 0.5 ? currentModeObj.isBlack : targetModeObj.isBlack) :
    currentModeObj.isBlack;
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // BACKGROUND
  // ═══════════════════════════════════════════════════════════════════════════════
  
  const bgBri = isBlackMode ? 0 : 80;
  background(0, 0, bgBri);
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // BLEND MODE
  // ═══════════════════════════════════════════════════════════════════════════════
  
  blendMode(isBlackMode ? ADD : MULTIPLY);
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // CLOUD COLOR LOGIC
  // ═══════════════════════════════════════════════════════════════════════════════
  
  const HUE_ROTATION_SPEED = 360 / 60000;
  const hueOffset = (time * HUE_ROTATION_SPEED) % 360;
  const rotatingHue = (cloud.rotationBaseHue + hueOffset) % 360;
  
  let finalHue = rotatingHue;
  let finalSat = 100;
  let finalBri = 55;
  
  // MULTI-COLOR: rotating hue
  if (!currentModeObj.isMono) {
    finalHue = rotatingHue;
    finalSat = 100;
    finalBri = isBlackMode ? 55 : 96;
  }
  // MONO COLOR: single color
  else if (!currentModeObj.isGray) {
    // Pick a mono color based on cycle
    const monoHue = Math.floor(time / 30000) * 30 % 360; // Change every 30s
    finalHue = monoHue;
    finalSat = 100;
    finalBri = isBlackMode ? 50 : 85;
  }
  // GRAYSCALE: desaturated
  else {
    finalHue = rotatingHue; // Keep hue but desaturate
    finalSat = 0;
    finalBri = isBlackMode ? 45 : 30;
  }
  
  // CRITICAL: Cap brightness for BLACK modes to prevent white accumulation
  if (isBlackMode) {
    finalBri = constrain(finalBri, 0, 52);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // DRAW SINGLE CLOUD (GEOMETRIC SHAPES)
  // ═══════════════════════════════════════════════════════════════════════════════
  
  push();
  translate(cloud.x, cloud.y);
  
  // Generate cloud shapes array ONCE (not randomizing every frame)
  if (cloud.shapes === undefined) {
    cloud.shapes = [];
    const numShapes = 40;
    for (let i = 0; i < numShapes; i++) {
      const shapeRadius = cloud.radius * 0.4;
      const angleSep = int(random(4, 7));
      const points = createShape(shapeRadius, angleSep);
      const transformedPoints = transformShape(points, 3, 0.3);
      cloud.shapes.push(transformedPoints);
    }
  }
  
  // Draw pre-generated shapes
  for (let i = 0; i < cloud.shapes.length; i++) {
    const shape = cloud.shapes[i];
    
    push();
    
    // Gentle jitter using noise (not random every frame)
    const jitterX = noise(i * 0.5, time * 0.00005) * cloud.radius * 0.1 - cloud.radius * 0.05;
    const jitterY = noise(i * 0.5 + 100, time * 0.00005) * cloud.radius * 0.1 - cloud.radius * 0.05;
    translate(jitterX, jitterY);
    
    // Radial falloff for alpha based on distance from center
    const dist = sqrt(jitterX * jitterX + jitterY * jitterY);
    const distNorm = dist / cloud.radius;
    const radialFalloff = 1 - (distNorm * distNorm);
    const alpha = constrain(radialFalloff * 0.12, 0, 0.12);
    
    // Color with subtle variation
    const noiseVal = noise(i * 0.7, time * 0.0001);
    const shapeHue = (finalHue + map(noiseVal, 0, 1, -8, 8) + 360) % 360;
    const shapeBri = constrain(finalBri + map(noiseVal, 0, 1, -5, 5), 0, isBlackMode ? 52 : 100);
    
    drawShape(shape, color(shapeHue, finalSat, shapeBri, alpha));
    
    pop();
  }
  
  pop();
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // DEBUG INFO
  // ═══════════════════════════════════════════════════════════════════════════════
  
  blendMode(BLEND);
  fill(255);
  noStroke();
  textSize(12);
  textAlign(LEFT, TOP);
  text(`MODE: ${MODES[currentMode].name}`, 10, 10);
  text(`BLEND: ${isBlackMode ? 'ADD' : 'MULTIPLY'}`, 10, 25);
  text(`BG BRI: ${bgBri}`, 10, 40);
  text(`Cloud H:${Math.round(finalHue)} S:${Math.round(finalSat)} B:${Math.round(finalBri)}`, 10, 55);
  
  // Color wheel debug
  push();
  translate(width - 130, 130);
  
  // Draw color wheel background
  for (let a = 0; a < 360; a += 6) {
    fill(a, 100, 80);
    noStroke();
    arc(0, 0, 200, 200, radians(a), radians(a + 6), PIE);
  }
  
  // Black center
  fill(0);
  ellipse(0, 0, 100, 100);
  
  // White ring
  noFill();
  stroke(255);
  strokeWeight(2);
  ellipse(0, 0, 200, 200);
  
  // Show current hue
  const angle = radians(finalHue - 90);
  const x = cos(angle) * 100;
  const y = sin(angle) * 100;
  fill(255);
  stroke(0);
  strokeWeight(2);
  ellipse(x, y, 20, 20);
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  BASE_UNIT = Math.min(width, height);
  cloud.x = width / 2;
  cloud.y = height / 2;
  cloud.radius = BASE_UNIT * 0.25;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEOMETRIC SHAPE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function createShape(shape_radius, angle_sep) {
  let points = [];
  let start_angle = random(360);
  let angle_step = 360 / angle_sep;
  for (let angle = start_angle; angle < start_angle + 360; angle += angle_step) {
    let x = cos(angle) * shape_radius;
    let y = sin(angle) * shape_radius;
    let point = createVector(x, y);
    points.push(point);
  }
  return points;
}

function transformShape(points, count, variance) {
  if (count <= 0) {
    return points;
  }
  let new_points = [];
  for (let i = 0; i < points.length; i++) {
    let p1 = points[i];
    let p2 = points[(i + 1) % points.length];
    new_points.push(p1);
    let mid = p5.Vector.lerp(p1, p2, 0.5);
    let len = p5.Vector.dist(p1, p2);
    mid.x += randomGaussian(0, variance * len);
    mid.y += randomGaussian(0, variance * len);
    new_points.push(mid);
  }
  return transformShape(new_points, count - 1, variance);
}

function drawShape(points, col) {
  push();
  fill(col);
  noStroke();
  beginShape();
  for (let p of points) {
    vertex(p.x, p.y);
  }
  endShape(CLOSE);
  pop();
}
