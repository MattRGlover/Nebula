let BASE_UNIT;
let randomSeedValue;
let reseedTimestamp = 0; // tracks when we last reseeded so we can fade in new fields
let blobStates = {};     // per-blob state so we can change visible subshapes gradually
let recentBlobHues = []; // track last 2 blob hues to prevent repetition
let startTime = 0;       // track when animation started
let nextPermanentId = 0; // counter for unique blob IDs

// Dashboard-controlled parameters
const params = {
  globalSpeed: 0.6,       // overall animation speed multiplier (even slower default)
  radialSpeed: 0.003,    // scaled by BASE_UNIT (slider max)
  flowStrength: 1.0,     // multiplier on flowSpeed
  sizeDepth: 2.0,        // depth of size pulsing (slider max)
  sizeSpeed: 0.0015,     // frequency of size pulsing (slower default)
  opacityDepth: 0.8,     // how far toward invisible opacity can go (0..1)
  opacitySpeed: 0.002,   // frequency of opacity pulsing (slower by default)
  sizeFxEnabled: true,
  opacityFxEnabled: true,
  attractStrength: 0.05,  // blob-blob attraction, 0..1 (reduced for subtlety)
  repelStrength: 0.05,    // blob-blob repulsion, 0..1 (reduced for subtlety)
};

const ENABLE_RENDER_DEBUG_LOGS = false;
const ENABLE_DEBUG_GRID = false;

// Performance monitoring
let lastFrameTime = 0;
let frameDeltas = []; // Rolling window of frame times
let droppedFrames = 0;
let lagSpikes = 0;
let perfWarnings = []; // Recent performance warnings
const FRAME_HISTORY = 60; // Track last 60 frames
const TARGET_FRAME_TIME = 16.67; // 60fps target = 16.67ms per frame
const LAG_THRESHOLD = 33; // Frame taking >33ms is a lag spike (dropped below 30fps)
const DROP_THRESHOLD = 66; // Frame taking >66ms likely dropped frames

// Transition settings - full cycle
const BLACK_DURATION = 30000;      // 30 seconds at black
const TO_WHITE_DURATION = 10000;   // 10 seconds transitioning to white
const WHITE_DURATION = 20000;      // 20 seconds at white
const TO_BLACK_DURATION = 10000;   // 10 seconds transitioning back to black
const FULL_CYCLE = BLACK_DURATION + TO_WHITE_DURATION + WHITE_DURATION + TO_BLACK_DURATION; // 70 seconds total

// Automatic grayscale mode - randomized intervals
let isGrayscaleMode = false;
let nextGrayscaleToggleTime = 0;
let grayscaleMinInterval = 15000; // Minimum 15 seconds between toggles
let grayscaleMaxInterval = 35000; // Maximum 35 seconds between toggles
let grayscaleDuration = 8000; // How long to stay in grayscale mode (8 seconds)
let lastGrayscaleToggleTime = 0;

// Touch gesture tracking
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let touchPath = []; // Track touch path for gesture recognition
let cloudSpawned = false; // Prevent multiple spawns during hold

// Swipe-influenced cloud behavior - accumulating momentum system
let globalFlowBoost = 0; // Temporary flow speed boost from swipes
let globalRotationBoost = 0; // Temporary rotation boost from circular swipes
let lastSwipeDirection = null; // Track last swipe direction for accumulation
let swipeAccumulationTime = 0; // When was the last swipe
let lastSwipeCheckIndex = 0; // Track where we last checked for swipes
let isDragging = false; // Track if user is currently dragging
let lastDragTime = 0; // When was the last drag activity
let currentGestureType = ""; // For debug display: "⟳ CW", "⟲ CCW", "∞", "→", etc.
let lockedGestureType = ""; // Locked gesture type until release or 1s of different movement
let lockedGestureTime = 0; // When the gesture was locked
let lockedGestureCW = true; // Locked direction (true = CW, false = CCW)

// Persistent drag tracking - predict and lock direction
let predictedDirection = 0;  // 1=CW, -1=CCW, 0=unknown
let directionConfidence = 0; // How many consistent turns we've seen
let lastProcessedIndex = 0;  // Track which points we've processed
let consecutiveLoops = 0;    // How many loops in same direction (for intensity)
let directionFlips = 0;      // Count direction changes (for infinity detection)
let lastLockedDirection = 0; // Track previous direction for flip detection
let infinityModeActive = false; // When true, disable shared orbital path
let infinityExplosionApplied = false; // Track if we've applied the one-time explosion

// Orbital path system - shared path for all clouds
let sharedPathVelocity = 0.001; // Velocity along the shared orbital path (affected by vertical drags)
let targetPathVelocity = 0.001; // Target velocity to lerp toward
const BASE_PATH_VELOCITY = 0.001; // Default orbital speed (increased from 0.0003)

// 2D Water ripple simulation (based on Hugo Elias algorithm)
let waterCols;
let waterRows;
let currentWater;
let previousWater;
let dampening = 0.85; // Faster decay for shorter-lived ripples (was 0.92)
const WATER_CELL_SIZE = 6; // Grid cell size for water simulation (desktop: 6 for smoother ripples)
let lastDisturbanceX = -1;
let lastDisturbanceY = -1;
let maxRippleRadius = 0; // Track how far ripples should spread

console.log('🚀 NEBULA_WORKING.JS LOADED AND EXECUTING');

function setup() {
  console.log('🎨 SETUP FUNCTION CALLED');
  createCanvas(windowWidth, windowHeight);
  console.log(`📐 Canvas created: ${windowWidth}x${windowHeight}`);
  
  // Standard pixel density for desktop
  pixelDensity(1);
  BASE_UNIT = Math.min(width, height);

  // Initial seed so the structure is stable until user changes it
  randomSeedValue = int(random(1000000));
  // Start with a fade-in on first load as well
  reseedTimestamp = millis();
  startTime = millis();
  
  // Initialize water ripple simulation at higher resolution for desktop quality
  waterCols = floor(width / WATER_CELL_SIZE);
  waterRows = floor(height / WATER_CELL_SIZE);
  currentWater = new Array(waterCols).fill(0).map(n => new Array(waterRows).fill(0));
  previousWater = new Array(waterCols).fill(0).map(n => new Array(waterRows).fill(0));
  
  // Target 60fps on desktop for smooth animation
  frameRate(60);
  
  console.log('✅ SETUP COMPLETE - Click anywhere to spawn cloud');

  setupControls();
}

function draw() {
  background(0);
  
  // Check if it's time to toggle grayscale mode automatically
  const currentTime = millis();
  if (nextGrayscaleToggleTime === 0) {
    // First time - schedule initial grayscale phase
    const interval = random(grayscaleMinInterval, grayscaleMaxInterval);
    nextGrayscaleToggleTime = currentTime + interval;
    console.log(`⏰ First grayscale in ${(interval/1000).toFixed(1)}s`);
  } else if (currentTime >= nextGrayscaleToggleTime) {
    // Time to toggle grayscale
    toggleGrayscaleMode();
  }

  // Use a fixed seed each frame so the underlying layout stays coherent,
  // but pass time into the generator so blobs themselves can rotate/morph.
  try {
    randomSeed(randomSeedValue);
    generateWatercolorBackground(this, millis(), deltaTime);
  } catch (err) {
    console.error('Error in draw/generateWatercolorBackground:', err);

    // On-canvas indicator so failures are visible even without console
    push();
    fill(255, 0, 0);
    noStroke();
    textSize(14);
    text('Render error - see console', 10, 20);
    pop();
  }

  // Apply 2D water ripple simulation (DISABLED for performance)
  // simulateWaterRipples();
  // applyWaterDistortion();
  
  // DEBUG: Draw coordinate grid and cloud positions
  if (ENABLE_DEBUG_GRID) {
    drawDebugGrid();
  }
  
  // GESTURE TYPE DISPLAY - disabled for production
  // if (isDragging && currentGestureType) {
  //   push();
  //   textAlign(CENTER, TOP);
  //   textSize(36);
  //   // Background box for visibility
  //   fill(0, 0, 0, 200);
  //   noStroke();
  //   rectMode(CENTER);
  //   rect(width / 2, 50, 320, 60, 10);
  //   // Gesture type text
  //   fill(255, 255, 0);
  //   text(currentGestureType, width / 2, 30);
  //   pop();
  // }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  BASE_UNIT = Math.min(width, height);
}

function mousePressed() {
  touchStartX = mouseX;
  touchStartY = mouseY;
  touchStartTime = millis();
  touchPath = [{x: mouseX, y: mouseY, t: millis()}];
  cloudSpawned = false;
  lastSwipeCheckIndex = 0; // Reset swipe detection for new touch
  isDragging = true; // Start tracking drag
  lastDragTime = millis();
  
  // Create water ripple disturbance
  addWaterDisturbance(mouseX, mouseY);
  
  console.log(`🖱️ Mouse pressed at (${mouseX}, ${mouseY})`);
  return false;
}

function mouseDragged() {
  // Track mouse path for gesture analysis with interpolation for fast movements
  const currentTime = millis();
  lastDragTime = currentTime;
  
  // Calculate distance from last recorded point
  const vx = mouseX - pmouseX;
  const vy = mouseY - pmouseY;
  const moveDist = sqrt(vx * vx + vy * vy);
  
  // Interpolate path points for fast movements (every 8 pixels minimum)
  const minPointSpacing = 8;
  if (moveDist > minPointSpacing && touchPath.length > 0) {
    const interpSteps = ceil(moveDist / minPointSpacing);
    for (let i = 1; i <= interpSteps; i++) {
      const t = i / interpSteps;
      touchPath.push({
        x: pmouseX + vx * t, 
        y: pmouseY + vy * t, 
        t: currentTime - (interpSteps - i) // Spread timestamps
      });
    }
  } else {
    touchPath.push({x: mouseX, y: mouseY, t: currentTime});
  }
  
  // Smooth interpolation - balanced for performance
  const dist = sqrt(vx * vx + vy * vy);
  const stepSize = 2; // 2 pixel steps - smooth but performant
  const steps = max(1, min(ceil(dist / stepSize), 15)); // Cap for performance
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ix = pmouseX + vx * t;
    const iy = pmouseY + vy * t;
    addWaterDisturbance(ix, iy, vx, vy, true);
  }
  
  // LIVE GESTURE ANALYSIS - effects grow during drag
  if (touchPath.length > 10) {
    applyLiveGestureEffects();
  }
  
  return false;
}

function mouseReleased() {
  const mouseDuration = millis() - touchStartTime;
  const deltaX = mouseX - touchStartX;
  const deltaY = mouseY - touchStartY;
  const distance = sqrt(deltaX * deltaX + deltaY * deltaY);
  
  // Mark drag as ended - no jump, just stop input
  isDragging = false;
  lockedGestureType = ""; // Clear gesture lock on release
  lockedGestureTime = 0;
  lockedGestureCW = true;
  predictedDirection = 0;  // Reset prediction
  directionConfidence = 0;
  lastProcessedIndex = 0;
  consecutiveLoops = 0;
  directionFlips = 0;
  lastLockedDirection = 0;
  infinityModeActive = false;
  infinityExplosionApplied = false;
  
  // HOLD gestures (no movement) - only action on release
  if (distance < 30) {
    if (mouseDuration >= 5000) {
      toggleGrayscaleMode();
      console.log('🖱️ Hold 5s - toggled grayscale');
    } else if (mouseDuration >= 500) {
      spawnCloudAtPosition(touchStartX, touchStartY);
      console.log('🖱️ Hold 500ms - spawned cloud');
    }
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// MOBILE TOUCH GESTURES
// ═══════════════════════════════════════════════════════════════════════
function touchStarted() {
  touchStartX = mouseX;
  touchStartY = mouseY;
  touchStartTime = millis();
  touchPath = [{x: mouseX, y: mouseY, t: millis()}];
  cloudSpawned = false;
  lastSwipeCheckIndex = 0; // Reset swipe detection for new touch
  isDragging = true; // Start tracking drag
  lastDragTime = millis();
  
  // Create water ripple disturbance
  addWaterDisturbance(mouseX, mouseY);
  
  return false; // Prevent default
}

function touchMoved() {
  // Track path for gesture analysis with interpolation for fast movements
  const currentTime = millis();
  lastDragTime = currentTime;
  
  // Calculate distance from last recorded point
  const vx = mouseX - pmouseX;
  const vy = mouseY - pmouseY;
  const moveDist = sqrt(vx * vx + vy * vy);
  
  // Interpolate path points for fast movements (every 8 pixels minimum)
  const minPointSpacing = 8;
  if (moveDist > minPointSpacing && touchPath.length > 0) {
    const interpSteps = ceil(moveDist / minPointSpacing);
    for (let i = 1; i <= interpSteps; i++) {
      const t = i / interpSteps;
      touchPath.push({
        x: pmouseX + vx * t, 
        y: pmouseY + vy * t, 
        t: currentTime - (interpSteps - i)
      });
    }
  } else {
    touchPath.push({x: mouseX, y: mouseY, t: currentTime});
  }
  
  // Smooth interpolation - balanced for performance
  const dist = moveDist;
  const stepSize = 2; // 2 pixel steps - smooth but performant
  const steps = max(1, min(ceil(dist / stepSize), 15)); // Cap for performance
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ix = pmouseX + vx * t;
    const iy = pmouseY + vy * t;
    addWaterDisturbance(ix, iy, vx, vy, true);
  }
  
  // LIVE GESTURE ANALYSIS - effects grow during drag
  if (touchPath.length > 10) {
    applyLiveGestureEffects();
  }
  
  return false; // Prevent default
}

function touchEnded() {
  const touchDuration = millis() - touchStartTime;
  const deltaX = mouseX - touchStartX;
  const deltaY = mouseY - touchStartY;
  const distance = sqrt(deltaX * deltaX + deltaY * deltaY);
  
  // Mark drag as ended - no jump, just stop input
  isDragging = false;
  lockedGestureType = ""; // Clear gesture lock on release
  lockedGestureTime = 0;
  lockedGestureCW = true;
  predictedDirection = 0;  // Reset prediction
  directionConfidence = 0;
  lastProcessedIndex = 0;
  consecutiveLoops = 0;
  directionFlips = 0;
  lastLockedDirection = 0;
  infinityModeActive = false;
  infinityExplosionApplied = false;
  
  // HOLD gestures (no movement) - only action on release
  if (distance < 30) {
    if (touchDuration >= 5000) {
      toggleGrayscaleMode();
      console.log('👆 Hold 5s - toggled grayscale');
    } else if (touchDuration >= 500) {
      spawnCloudAtPosition(touchStartX, touchStartY);
      console.log('👆 Hold 500ms - spawned cloud');
    }
  }
  
  return false;
}

function keyPressed() {
  console.log(`🔑 Key pressed: "${key}" (keyCode: ${keyCode})`);
  
  // Allow reseed only with "N" to avoid interfering with browser reload or normal typing.
  // Also avoid triggering when the user is focused on a UI control.
  const active = document.activeElement;
  const isInputFocused = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (isInputFocused) {
    console.log('⚠️ Input focused, ignoring key');
    return;
  }

  if (key === 'n' || key === 'N') {
    randomSeedValue = int(random(1000000));
    reseedTimestamp = millis();
    blobStates = {}; // reset per-blob state on reseed so cycles restart cleanly
    recentBlobHues = []; // reset color tracking on reseed
    startTime = millis(); // restart transition
    nextPermanentId = 0; // reset ID counter
    // Prevent default so it doesn't trigger browser shortcuts.
    return false;
  }
  
  if (key === 'g' || key === 'G') {
    // Manual override: force toggle grayscale immediately
    toggleGrayscaleMode();
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SWIPE ACCUMULATION SYSTEM - Like cranking a handle
// ═══════════════════════════════════════════════════════════════════════
function applyDragEffects() {
  // Look for completed swipe gestures in the touch path
  // Multiple swipes in same direction accumulate momentum
  
  if (touchPath.length < lastSwipeCheckIndex + 5) return; // Reduced from 8 to 5 for more responsive detection
  
  // Check recent segment for a swipe
  const checkStart = max(lastSwipeCheckIndex, touchPath.length - 12);
  const segmentPath = touchPath.slice(checkStart);
  
  if (segmentPath.length < 3) return; // Reduced from 5 to 3
  
  const start = segmentPath[0];
  const end = segmentPath[segmentPath.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = sqrt(dx * dx + dy * dy);
  const duration = end.t - start.t;
  
  // Detect if this is a distinct swipe gesture (minimum distance and velocity)
  if (distance < 25 || duration === 0) return; // Reduced from 40 to 25 for easier detection
  
  const velocity = distance / duration; // px/ms
  if (velocity < 0.3) return; // Reduced from 0.5 to 0.3 for slower swipes
  
  // Determine swipe direction
  let swipeDirection;
  const horizontalStrength = abs(dx) / distance;
  const verticalStrength = abs(dy) / distance;
  
  if (horizontalStrength > verticalStrength) {
    // Horizontal swipe
    swipeDirection = dx > 0 ? 'right' : 'left';
    
    // Accumulate rotation momentum
    const currentTime = millis();
    const timeSinceLastSwipe = currentTime - swipeAccumulationTime;
    
    // Each swipe adds 10% of the speed range (base range is -15 to 15, so 10% = 3.0 deg/sec)
    const swipePower = 5.0; // High sensitivity for video wall
    
    // If same direction within 800ms, accumulate momentum
    if ((lastSwipeDirection === swipeDirection) && (timeSinceLastSwipe < 800)) {
      // ACCUMULATE: Each swipe in same direction adds more momentum
      globalRotationBoost += (dx > 0 ? 1 : -1) * swipePower;
      console.log(`🔄 ${swipeDirection.toUpperCase()} swipe - momentum: ${globalRotationBoost.toFixed(1)}`);
    } else {
      // RESET: New direction, start fresh
      globalRotationBoost = (dx > 0 ? 1 : -1) * swipePower;
      console.log(`🔄 ${swipeDirection.toUpperCase()} swipe - starting momentum: ${globalRotationBoost.toFixed(1)}`);
    }
    
    lastSwipeDirection = swipeDirection;
    swipeAccumulationTime = currentTime;
  } else {
    // Vertical swipe
    swipeDirection = dy < 0 ? 'up' : 'down';
    
    // Accumulate drift/flow momentum
    const currentTime = millis();
    const timeSinceLastSwipe = currentTime - swipeAccumulationTime;
    
    // Each swipe adds significant drift change to make UP/DOWN drags more impactful
    const swipePower = 3.0; // Strong increase per swipe to see visible drift/dance changes
    
    // If same direction within 800ms, accumulate momentum
    if ((lastSwipeDirection === swipeDirection) && (timeSinceLastSwipe < 800)) {
      // ACCUMULATE: Each swipe in same direction adds more momentum
      globalFlowBoost += (dy < 0 ? 1 : -1) * swipePower;
      console.log(`⬆️ ${swipeDirection.toUpperCase()} swipe - momentum: ${globalFlowBoost.toFixed(1)}`);
    } else {
      // RESET: New direction, start fresh
      globalFlowBoost = (dy < 0 ? 1 : -1) * swipePower;
      console.log(`⬆️ ${swipeDirection.toUpperCase()} swipe - starting momentum: ${globalFlowBoost.toFixed(1)}`);
    }
    
    lastSwipeDirection = swipeDirection;
    swipeAccumulationTime = currentTime;
  }
  
  // Mark this position as checked
  lastSwipeCheckIndex = touchPath.length - 3;
}

// ═══════════════════════════════════════════════════════════════════════
// LIVE GESTURE EFFECTS - Applied continuously during drag
// ═══════════════════════════════════════════════════════════════════════
function applyLiveGestureEffects() {
  if (touchPath.length < 5) return;
  
  // Wait 150ms before detecting gesture type to determine intent
  const gestureDuration = millis() - touchStartTime;
  if (gestureDuration < 150) {
    currentGestureType = "⏳ WAITING...";
    return; // Not enough time to determine intent
  }
  
  // Analyze recent portion of path for responsive feel
  const recentPath = touchPath.slice(-30); // Last 30 points
  
  // Calculate movement delta from recent path
  const start = recentPath[0];
  const end = recentPath[recentPath.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = sqrt(dx * dx + dy * dy);
  
  if (distance < 3) return; // Ignore tiny movements
  
  // PREDICT AND LOCK DIRECTION
  // Look at 3 points: A → B → C, determine turn direction
  // Lock prediction, require multiple opposite turns to change
  const currentTime = millis();
  
  // Process new points since last check
  const minPoints = 5; // Need at least 5 points to detect a turn
  const pointSpacing = 3; // Look at every 3rd point for cleaner signal
  
  while (lastProcessedIndex + pointSpacing * 2 < touchPath.length) {
    const i = lastProcessedIndex;
    const A = touchPath[i];
    const B = touchPath[i + pointSpacing];
    const C = touchPath[i + pointSpacing * 2];
    
    // Vector AB and BC
    const ABx = B.x - A.x, ABy = B.y - A.y;
    const BCx = C.x - B.x, BCy = C.y - B.y;
    
    // Cross product: positive = right turn (CW), negative = left turn (CCW)
    const cross = ABx * BCy - ABy * BCx;
    const turnDir = cross > 5 ? 1 : (cross < -5 ? -1 : 0); // 1=CW, -1=CCW, 0=straight
    
    if (turnDir !== 0) {
      if (predictedDirection === 0) {
        // First prediction - set it
        predictedDirection = turnDir;
        directionConfidence = 1;
      } else if (turnDir === predictedDirection) {
        // Same direction - increase confidence
        directionConfidence = min(directionConfidence + 1, 10);
      } else {
        // Opposite direction - decrease confidence, maybe flip
        directionConfidence--;
        if (directionConfidence <= 0) {
          // Track prediction flip for infinity detection
          if (predictedDirection !== 0 && predictedDirection !== turnDir) {
            directionFlips++;
          }
          predictedDirection = turnDir;
          directionConfidence = 1;
        }
      }
    }
    
    lastProcessedIndex += pointSpacing;
  }
  
  // Calculate cumulative angle AND check turn consistency for circle detection
  let actualCumulativeAngle = 0;
  let prevAngle = null;
  let pathLength = 0;
  let sameDirTurns = 0;  // Turns in same direction as prediction
  let oppDirTurns = 0;   // Turns opposite to prediction
  
  // Use recentPath for curvature calculation (consistent time window)
  for (let i = 2; i < recentPath.length; i += 2) {
    const pdx = recentPath[i].x - recentPath[i-2].x;
    const pdy = recentPath[i].y - recentPath[i-2].y;
    const segLen = sqrt(pdx*pdx + pdy*pdy);
    pathLength += segLen;
    
    if (segLen < 3) continue;
    
    const angle = atan2(pdy, pdx);
    if (prevAngle !== null) {
      let angleDiff = angle - prevAngle;
      while (angleDiff > PI) angleDiff -= TWO_PI;
      while (angleDiff < -PI) angleDiff += TWO_PI;
      actualCumulativeAngle += angleDiff;
      
      // Count turn direction consistency
      if (abs(angleDiff) > 0.05) { // ~3 degrees - ignore tiny noise
        if ((predictedDirection > 0 && angleDiff > 0) || 
            (predictedDirection < 0 && angleDiff < 0)) {
          sameDirTurns++;
        } else {
          oppDirTurns++;
        }
      }
    }
    prevAngle = angle;
  }
  
  // Direction from prediction, magnitude from actual rotation
  const rotationMagnitude = abs(actualCumulativeAngle);
  const cwRotation = predictedDirection > 0 ? rotationMagnitude : 0;
  const ccwRotation = predictedDirection < 0 ? rotationMagnitude : 0;
  
  const totalAbsRotation = cwRotation + ccwRotation;
  
  // Debug values
  const cwDeg = Math.round(cwRotation * 180 / PI);
  const ccwDeg = Math.round(ccwRotation * 180 / PI);
  const cumDeg = Math.round(actualCumulativeAngle * 180 / PI);
  const netAngle = abs(actualCumulativeAngle);
  
  // LOOPS DETECTION - requires CONSISTENT turning in one direction
  // Linear motions have random turns that cancel out
  // Circles have consistent same-direction turns
  const totalTurns = sameDirTurns + oppDirTurns;
  const turnConsistency = totalTurns > 3 ? sameDirTurns / totalTurns : 0;
  
  // Need: >60% turns in same direction AND >45° cumulative AND have a prediction
  // Lower thresholds for faster loop detection
  const isLoopsLike = turnConsistency > 0.6 && netAngle > (PI / 4) && predictedDirection !== 0;
  
  // Determine detected gesture type (before lock)
  let detectedGesture = "LINEAR";
  if (isLoopsLike) detectedGesture = "LOOPS";
  
  // Press-and-hold detection: if movement is tiny, don't count as gesture change
  const isHolding = distance < 30; // Less than 30px movement = holding still
  
  // GESTURE LOCK SYSTEM - only lock ROTATIONAL gestures, not LINEAR
  // This allows circular motion to be detected even if it starts linear
  // GESTURE LINKING - allow transitions within single drag based on behavior change
  // (currentTime already declared above)
  const isRotationalGesture = detectedGesture !== "LINEAR";
  // Determine direction from which rotation is dominant (more stable than cumulative angle sign)
  const currentCW = cwRotation > ccwRotation;
  
  // Detect direction reversal - require 1 full circle (~360°) of opposite rotation
  const reverseThreshold = 2 * PI; // 1 circle worth - more responsive
  const directionReversed = lockedGestureType === "LOOPS" && 
    ((lockedGestureCW && ccwRotation > cwRotation + reverseThreshold) || 
     (!lockedGestureCW && cwRotation > ccwRotation + reverseThreshold));
  
  if (lockedGestureType === "" || lockedGestureType === "LINEAR") {
    // No lock yet OR locked on LINEAR - upgrade to rotational if detected
    if (isRotationalGesture) {
      lockedGestureType = detectedGesture;
      lockedGestureTime = currentTime;
      lockedGestureCW = currentCW;
    }
  } else if (directionReversed) {
    // DIRECTION REVERSAL - immediately allow switch to new direction
    lockedGestureCW = currentCW;
    lockedGestureTime = currentTime;
    
    // Track direction flip for infinity detection
    if (lastLockedDirection !== 0 && lastLockedDirection !== (currentCW ? 1 : -1)) {
      directionFlips++;
      consecutiveLoops = 0; // Reset consecutive on flip
    }
    lastLockedDirection = currentCW ? 1 : -1;
  } else if (detectedGesture === lockedGestureType) {
    // Same gesture - reset timer
    lockedGestureTime = currentTime;
    // Track consecutive loops in same direction
    if (lockedGestureType === "LOOPS") {
      const currentDir = currentCW ? 1 : -1;
      if (lastLockedDirection === currentDir) {
        consecutiveLoops += 0.02; // Gradual increase while circling
      } else if (lastLockedDirection === 0) {
        lastLockedDirection = currentDir;
      }
    }
  }
  // Note: LOOPS stays locked until drag ends - no auto-unlock to LINEAR
  
  // Detect INFINITY pattern: 3+ direction flips = infinity gesture
  const isInfinity = directionFlips >= 3;
  
  // Use locked gesture if rotational, otherwise use detected
  const effectiveGesture = (lockedGestureType === "LOOPS") ? "LOOPS" : detectedGesture;
  const useLoops = effectiveGesture === "LOOPS";
  // Use current direction for immediate response to direction changes
  const gestureCW = currentCW;
  
  // Show debug info with detection status
  const lockStr = (lockedGestureType && lockedGestureType !== "LINEAR") ? lockedGestureType : "---";
  currentGestureType = `[${lockStr}] ${detectedGesture} ${cwDeg}°`;
  
  // Calculate effect intensity based on gesture size relative to screen
  const gestureScale = distance / min(width, height);
  const baseIntensity = gestureScale * 10; // 10% screen = intensity 1, no cap
  
  if (useLoops) {
    // Use dominant direction's rotation
    const dominantRotation = gestureCW ? cwRotation : ccwRotation;
    const numRotations = dominantRotation / TWO_PI;
    
    // INTENSITY scales with consecutive loops in same direction
    const intensityMultiplier = 1 + consecutiveLoops; // Starts at 1x, grows over time
    const chaosLevel = min(numRotations * 0.2 * intensityMultiplier, 2.0); // Can go to 200%
    
    if (isInfinity) {
      // INFINITY EFFECT - ANTI-GRAVITY EXPLOSION
      currentGestureType = `∞ INFINITY ${directionFlips}x ${Math.round(chaosLevel*100)}%`;
      infinityModeActive = true; // Disable shared orbital path
      
      // ONE-TIME EXPLOSION - only apply on first detection
      if (!infinityExplosionApplied) {
        infinityExplosionApplied = true;
        
        for (let blobId in blobStates) {
          const state = blobStates[blobId];
          const blobIndex = parseInt(blobId.replace('blob_', ''));
          
          // COMPLETELY RESET VELOCITY - kill all shared momentum
          state.vx = 0;
          state.vy = 0;
          
          // UNIQUE EXPLOSION DIRECTION - golden angle spread
          const explosionAngle = blobIndex * 2.399963; // ~137.5° between each
          const explosionForce = 3.0; // Strong one-time impulse
          state.vx = cos(explosionAngle) * explosionForce;
          state.vy = sin(explosionAngle) * explosionForce;
          
          blobStates[blobId] = state;
        }
        
        // Kill orbital velocity completely
        targetPathVelocity = 0;
        sharedPathVelocity = 0;
      }
      
    } else {
      // NORMAL LOOPS - spin intensifies with consecutive circles
      currentGestureType = gestureCW ? 
        `⟳ CW ${numRotations.toFixed(1)}x ${consecutiveLoops.toFixed(1)}loops ${Math.round(chaosLevel*100)}%` : 
        `⟲ CCW ${numRotations.toFixed(1)}x ${consecutiveLoops.toFixed(1)}loops ${Math.round(chaosLevel*100)}%`;
      
      // Calculate gesture center (centroid of recent touch path)
      let gestureCenterX = 0;
      let gestureCenterY = 0;
      const recentCount = min(touchPath.length, 30); // Use last 30 points
      for (let i = touchPath.length - recentCount; i < touchPath.length; i++) {
        gestureCenterX += touchPath[i].x;
        gestureCenterY += touchPath[i].y;
      }
      gestureCenterX /= recentCount;
      gestureCenterY /= recentCount;
      
      // Base rotation boost scales with intensity
      const baseRotationBoost = (gestureCW ? 1 : -1) * (2 + numRotations * 5) * intensityMultiplier;
      
      // Find max distance for normalization (use screen diagonal as reference)
      const maxProximityDist = sqrt(width * width + height * height) * 0.5;
      
      for (let blobId in blobStates) {
        const state = blobStates[blobId];
        
        // PROXIMITY-BASED SPIN - closer clouds spin more
        const cloudX = state.x + width / 2; // Convert from centered coords
        const cloudY = state.y + height / 2;
        const distToGesture = sqrt((cloudX - gestureCenterX) ** 2 + (cloudY - gestureCenterY) ** 2);
        
        // Proximity factor: 1.0 at gesture center, 0.15 at max distance (minimum 15% effect)
        const proximityFactor = max(0.15, 1.0 - (distToGesture / maxProximityDist) * 0.85);
        
        // Scale rotation boost by proximity
        const rotationBoost = baseRotationBoost * proximityFactor;
        
        // SMOOTH DIRECTION CHANGE - gradual deceleration then acceleration
        const isOpposite = (gestureCW && state.targetRotation < -0.5) || 
                           (!gestureCW && state.targetRotation > 0.5);
        const isSameDirection = (gestureCW && state.targetRotation >= 0) || 
                                (!gestureCW && state.targetRotation <= 0);
        
        if (isOpposite) {
          // Opposite direction: gradually slow down existing spin (drag toward zero)
          // Don't apply boost in new direction until we're near zero
          state.targetRotation *= 0.92; // Gentle deceleration
          state.vx *= 0.98;
          state.vy *= 0.98;
          // Only start boosting in new direction once nearly stopped
          if (abs(state.targetRotation) < 5) {
            state.targetRotation += rotationBoost * 0.3; // Gentle start in new direction
          }
        } else if (isSameDirection) {
          // Same direction: apply full boost
          state.targetRotation += rotationBoost;
        } else {
          // Near zero: gentle boost to establish direction
          state.targetRotation += rotationBoost * 0.5;
        }
        
        state.targetRotation = constrain(state.targetRotation, -120, 120); // Higher cap for intense spin
        
        // CENTRIFUGAL EFFECT - scales with intensity and proximity
        if (numRotations > 0.25) {
          const centrifugalForce = chaosLevel * 0.8 * proximityFactor;
          const distFromCenter = sqrt(state.x * state.x + state.y * state.y);
          if (distFromCenter > 10) {
            state.vx += (state.x / distFromCenter) * centrifugalForce;
            state.vy += (state.y / distFromCenter) * centrifugalForce;
          }
        }
        
        // INDIVIDUAL DANCE - scales with intensity
        if (numRotations > 0.15) {
          const danceIntensity = chaosLevel * 0.5 * proximityFactor;
          const blobIndex = parseInt(blobId.replace('blob_', ''));
          const danceAngle = noise(blobIndex * 0.5, millis() * 0.005) * TWO_PI * 2;
          state.vx += cos(danceAngle) * danceIntensity;
          state.vy += sin(danceAngle) * danceIntensity;
        }
        
        blobStates[blobId] = state;
      }
      
      // Boost orbital velocity - scales with intensity
      targetPathVelocity += (gestureCW ? 1 : -1) * chaosLevel * 0.1;
      targetPathVelocity = constrain(targetPathVelocity, -2.0, 2.0);
    }
  }
  
  // KICK PHYSICS - Only apply when NOT a rotational gesture
  // Once intent is determined to be rotational, stop kick side effects
  if (distance > 20 && !useLoops) {
    // Set gesture type based on primary direction (12 directions, every 30°)
    const angle = atan2(dy, dx);
    const deg = angle * 180 / PI; // Convert to degrees (-180 to 180)
    let dirSymbol = "→";
    if (deg >= -15 && deg < 15) dirSymbol = "→";
    else if (deg >= 15 && deg < 45) dirSymbol = "↘";
    else if (deg >= 45 && deg < 75) dirSymbol = "↘";
    else if (deg >= 75 && deg < 105) dirSymbol = "↓";
    else if (deg >= 105 && deg < 135) dirSymbol = "↙";
    else if (deg >= 135 && deg < 165) dirSymbol = "↙";
    else if (deg >= 165 || deg < -165) dirSymbol = "←";
    else if (deg >= -165 && deg < -135) dirSymbol = "↖";
    else if (deg >= -135 && deg < -105) dirSymbol = "↖";
    else if (deg >= -105 && deg < -75) dirSymbol = "↑";
    else if (deg >= -75 && deg < -45) dirSymbol = "↗";
    else if (deg >= -45 && deg < -15) dirSymbol = "↗";
    currentGestureType = `${dirSymbol} LINEAR ${Math.round(deg)}°`;
    
    const dirX = dx / distance;
    const dirY = dy / distance;
    
    // Get gesture END position in centered coordinates
    const lastPoint = touchPath[touchPath.length - 1];
    const gestureX = lastPoint.x - width / 2;
    const gestureY = lastPoint.y - height / 2;
    
    // Effect radius and strength
    const maxEffectDist = min(width, height) * 0.5;
    
    for (let blobId in blobStates) {
      const state = blobStates[blobId];
      if (state.x === undefined) continue;
      
      const cloudDist = sqrt((state.x - gestureX) * (state.x - gestureX) + 
                             (state.y - gestureY) * (state.y - gestureY));
      
      const distanceFactor = max(0, 1 - (cloudDist / maxEffectDist));
      const kickStrength = baseIntensity * 5.0 * distanceFactor;
      
      if (distanceFactor > 0.1) { // Only affect nearby clouds
        // Dampen existing velocity proportional to proximity
        const dampFactor = 1 - (0.5 * distanceFactor);
        state.vx *= dampFactor;
        state.vy *= dampFactor;
        
        // Push in swipe direction
        state.vx += dirX * kickStrength;
        state.vy += dirY * kickStrength;
      }
      
      blobStates[blobId] = state;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GESTURE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════
function analyzeGesture(path) {
  if (path.length < 3) {
    return { type: 'none', direction: null, intensity: 0 };
  }
  
  // Calculate angle changes and track direction reversals for infinity detection
  let totalAngleChange = 0;
  let prevAngle = null;
  let cumulativeAngle = 0;
  let maxCumulative = 0;
  let minCumulative = 0;
  let directionReversals = 0;
  let lastDirection = 0; // 1 = CW, -1 = CCW
  let smoothedDirection = 0;
  const smoothingWindow = 5;
  let recentAngles = [];
  
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i-1].x;
    const dy = path[i].y - path[i-1].y;
    const dist = sqrt(dx * dx + dy * dy);
    
    // Skip tiny movements
    if (dist < 2) continue;
    
    const angle = atan2(dy, dx);
    
    if (prevAngle !== null) {
      let angleDiff = angle - prevAngle;
      // Normalize to -PI to PI
      while (angleDiff > PI) angleDiff -= TWO_PI;
      while (angleDiff < -PI) angleDiff += TWO_PI;
      
      totalAngleChange += angleDiff;
      cumulativeAngle += angleDiff;
      
      // Track cumulative extremes
      maxCumulative = max(maxCumulative, cumulativeAngle);
      minCumulative = min(minCumulative, cumulativeAngle);
      
      // Smooth direction detection
      recentAngles.push(angleDiff);
      if (recentAngles.length > smoothingWindow) recentAngles.shift();
      
      const avgAngle = recentAngles.reduce((a, b) => a + b, 0) / recentAngles.length;
      const currentDirection = avgAngle > 0.02 ? 1 : (avgAngle < -0.02 ? -1 : 0);
      
      // Detect direction reversal
      if (currentDirection !== 0 && lastDirection !== 0 && currentDirection !== lastDirection) {
        directionReversals++;
      }
      if (currentDirection !== 0) lastDirection = currentDirection;
    }
    prevAngle = angle;
  }
  
  // INFINITY SYMBOL DETECTION (∞)
  // Characteristics: two loops in opposite directions, cumulative angle swings positive then negative (or vice versa)
  const cwRotation = maxCumulative; // Peak clockwise rotation
  const ccwRotation = abs(minCumulative); // Peak counter-clockwise rotation
  const totalAbsRotation = cwRotation + ccwRotation;
  
  // Infinity requires: both directions have significant rotation (>90°), at least one reversal
  const hasSignificantCW = cwRotation > PI / 2;
  const hasSignificantCCW = ccwRotation > PI / 2;
  const isInfinity = hasSignificantCW && hasSignificantCCW && directionReversals >= 1 && totalAbsRotation > PI;
  
  if (isInfinity) {
    const intensity = min(totalAbsRotation / (TWO_PI * 2), 2.0); // Full infinity = 720°
    console.log(`∞ INFINITY detected! CW: ${degrees(cwRotation).toFixed(0)}°, CCW: ${degrees(ccwRotation).toFixed(0)}°, reversals: ${directionReversals}, intensity: ${intensity.toFixed(2)}`);
    
    return {
      type: 'infinity',
      direction: cwRotation > ccwRotation ? 'cw-first' : 'ccw-first',
      intensity: intensity,
      cwRotation: cwRotation,
      ccwRotation: ccwRotation,
      reversals: directionReversals
    };
  }
  
  // Detect circular motion (total angle change > 180 degrees, single direction)
  const isCircular = abs(totalAngleChange) > PI;
  
  if (isCircular) {
    const direction = totalAngleChange > 0 ? 'clockwise' : 'counter-clockwise';
    const intensity = min(abs(totalAngleChange) / TWO_PI, 2.0); // 0-2 range
    
    console.log(`🔄 Circular gesture: ${direction}, angle: ${degrees(totalAngleChange).toFixed(1)}°, intensity: ${intensity.toFixed(2)}`);
    
    return {
      type: 'circular',
      direction: direction,
      intensity: intensity,
      totalAngle: totalAngleChange
    };
  }
  
  // Linear swipe analysis
  const start = path[0];
  const end = path[path.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = sqrt(dx * dx + dy * dy);
  const duration = end.t - start.t;
  const velocity = distance / max(duration, 1); // px/ms
  
  // Determine primary direction
  let direction;
  if (abs(dy) > abs(dx)) {
    direction = dy > 0 ? 'down' : 'up';
  } else {
    direction = dx > 0 ? 'right' : 'left';
  }
  
  return {
    type: 'linear',
    direction: direction,
    intensity: velocity * 1000, // px/s
    distance: distance
  };
}

function handleCircularGesture(gesture) {
  const { direction, intensity } = gesture;
  
  // Boost rotation speed based on gesture
  const rotationMultiplier = direction === 'clockwise' ? 1 : -1;
  globalRotationBoost = intensity * rotationMultiplier * 5.0; // Decay over time
  
  console.log(`🌀 ${direction} swipe - rotation boost: ${globalRotationBoost.toFixed(2)}`);
}

function handleInfinityGesture(gesture) {
  const { intensity, cwRotation, ccwRotation } = gesture;
  
  // Infinity gesture creates a special "breathing" effect
  // All clouds pulse and orbit in alternating directions
  console.log(`∞ INFINITY EFFECT TRIGGERED - intensity: ${intensity.toFixed(2)}`);
  
  // Create dramatic orbital speed oscillation
  // Alternate between positive and negative velocity
  const oscillationStrength = intensity * 1.5;
  targetPathVelocity = oscillationStrength;
  
  // Also add rotation that will naturally decay
  // Direction based on which loop was bigger
  const dominantDirection = cwRotation > ccwRotation ? 1 : -1;
  globalRotationBoost = dominantDirection * intensity * 8.0;
  
  // Apply to all clouds with enhanced effect
  for (let blobId in blobStates) {
    const state = blobStates[blobId];
    state.targetRotation = state.accumulatedRotation + globalRotationBoost;
    // Add some chaos to each cloud's orbit
    state.orbitalSemiMajor *= (1 + intensity * 0.3);
    state.orbitalSemiMinor *= (1 + intensity * 0.3);
    blobStates[blobId] = state;
  }
  
  console.log(`∞ Applied: rotation=${globalRotationBoost.toFixed(1)}, orbital speed=${targetPathVelocity.toFixed(3)}`);
  globalRotationBoost = 0; // Already applied directly
}

function handleLinearGesture(gesture) {
  const { direction, intensity, distance } = gesture;
  
  // Get detailed swipe vector from touchPath
  const start = touchPath[0];
  const end = touchPath[touchPath.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  
  // Horizontal component controls rotation (left→right = clockwise, right→left = counter-clockwise)
  const horizontalStrength = abs(dx) / distance; // 0-1
  if (horizontalStrength > 0.3) { // Significant horizontal component
    const rotationDirection = dx > 0 ? 1 : -1; // Right = clockwise, Left = counter-clockwise
    const rotationMagnitude = min(distance / 500, 3.0); // Scale by swipe distance
    globalRotationBoost = rotationDirection * rotationMagnitude * 10.0; // Doubled sensitivity
    console.log(`🔄 ${dx > 0 ? 'Clockwise' : 'Counter-clockwise'} rotation: ${globalRotationBoost.toFixed(2)}`);
  }
  
  // Vertical component controls speed/drift (up = faster/more drift, down = slower/stiller)
  const verticalStrength = abs(dy) / distance; // 0-1
  if (verticalStrength > 0.3) { // Significant vertical component
    if (dy < 0) {
      // Swipe UP: Increase speed and drift
      const speedBoost = min(abs(dy) / 200, 3.0);
      globalFlowBoost = speedBoost;
      console.log(`⬆️ Speed UP: flow boost ${globalFlowBoost.toFixed(2)}`);
    } else {
      // Swipe DOWN: Decrease speed (make stiller)
      const speedReduce = -min(dy / 200, 2.0);
      globalFlowBoost = speedReduce;
      console.log(`⬇️ Speed DOWN: flow reduce ${globalFlowBoost.toFixed(2)}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// SPAWN CLOUD AT TOUCH POSITION
// ═══════════════════════════════════════════════════════════════════════
function spawnCloudAtPosition(screenX, screenY) {
  const currentTime = millis();
  
  // Convert screen coordinates (0,0 at top-left) to centered coordinates (0,0 at center)
  // This matches the rendering system which translates to center before drawing
  const x = screenX - width / 2;
  const y = screenY - height / 2;
  
  // Find oldest cloud to replace (one furthest in its lifecycle)
  let oldestBlobId = 0;
  let maxLifeProgress = -1;
  
  // Cloud lifecycle constants (match generateWatercolorBackground)
  const assembleDur = 9000;
  const sustainDur = 20000;
  const fadeDur = 7000;
  const totalLife = assembleDur + sustainDur + fadeDur;
  const spawnInt = 7000;
  
  for (let i = 0; i < 8; i++) {
    const state = blobStates[i];
    if (state && state.spawnTime !== undefined) {
      // This is a manually spawned cloud - check its age
      const age = currentTime - state.spawnTime;
      const lifeProgress = age / totalLife;
      
      // Strongly prefer clouds in fade phase (80%+) for smooth overlap
      const fadePriority = lifeProgress > 0.8 ? lifeProgress + 10 : lifeProgress;
      if (fadePriority > maxLifeProgress) {
        maxLifeProgress = fadePriority;
        oldestBlobId = i;
      }
    } else if (state) {
      // This is an automatic cloud - check cycle index and time
      const spawnOffset = i * spawnInt;
      const timeSinceStart = (currentTime - reseedTimestamp) - spawnOffset;
      const cycleIndex = Math.floor(timeSinceStart / totalLife);
      const lifeTime = timeSinceStart - cycleIndex * totalLife;
      const lifeProgress = lifeTime / totalLife;
      
      // Strongly prefer clouds in fade phase (80%+) for smooth overlap
      const fadePriority = lifeProgress > 0.8 ? lifeProgress + 10 + cycleIndex : lifeProgress;
      if (fadePriority > maxLifeProgress) {
        maxLifeProgress = fadePriority;
        oldestBlobId = i;
      }
    }
  }
  
  const newBlobId = oldestBlobId;
  const permanentId = nextPermanentId++;
  
  console.log(`🔄 Replacing blob ${newBlobId} (lifecycle ${maxLifeProgress.toFixed(2)})`);
  
  // GUARANTEED SIZE DIVERSITY for manual spawns
  // Use the blob slot to pick a distinct size different from other clouds
  // Size range: 10% to 40% of screen (using smaller dimension)
  const screenSize = min(width, height);
  const minSize = screenSize * 0.15; // 15% of screen
  const maxSize = screenSize * 0.50; // 50% of screen
  
  // Fully random size within range
  const radius = random(minSize, maxSize);
  
  // MALIBU SUNSET + FOREST palette with guaranteed diversity
  // 7 distinct color zones to cycle through
  const COLOR_ZONES = [
    { name: 'coral-orange', min: 10, max: 35 },      // warm corals
    { name: 'peachy-pink', min: 345, max: 15 },      // peachy pinks (wraps)
    { name: 'magenta-violet', min: 290, max: 330 },  // magentas
    { name: 'forest-green', min: 90, max: 140 },     // FOREST GREENS
    { name: 'sea-green', min: 165, max: 195 },       // sea-greens/aqua
    { name: 'sky-blue', min: 200, max: 225 },        // sky blues
    { name: 'golden-yellow', min: 40, max: 55 },     // golden sunset
  ];
  
  let zone_hue;
  let attempt = 0;
  const maxHueAttempts = 15;
  
  // Find which zones are NOT recently used
  const usedZoneIndices = recentBlobHues.map(hue => {
    for (let i = 0; i < COLOR_ZONES.length; i++) {
      const zone = COLOR_ZONES[i];
      let inZone = false;
      if (zone.min > zone.max) { // Wrapping zone (e.g., 345-15)
        inZone = hue >= zone.min || hue <= zone.max;
      } else {
        inZone = hue >= zone.min && hue <= zone.max;
      }
      if (inZone) return i;
    }
    return -1;
  });
  
  // Get available zones (not used in last 5 spawns)
  const availableZones = COLOR_ZONES.map((_, i) => i).filter(i => !usedZoneIndices.includes(i));
  
  do {
    // Pick from available zones first, otherwise random zone
    const zoneIndex = availableZones.length > 0 
      ? availableZones[Math.floor(random() * availableZones.length)]
      : Math.floor(random() * COLOR_ZONES.length);
    const zone = COLOR_ZONES[zoneIndex];
    
    // Generate hue within zone
    if (zone.min > zone.max) { // Wrapping zone
      const range = (360 - zone.min) + zone.max;
      const offset = random() * range;
      zone_hue = (zone.min + offset) % 360;
    } else {
      zone_hue = zone.min + random() * (zone.max - zone.min);
    }
    
    // Check if too similar to ANY recent hue (within 50°)
    const isSimilar = recentBlobHues.some(recentHue => {
      let diff = Math.abs(zone_hue - recentHue);
      if (diff > 180) diff = 360 - diff;
      return diff < 50;
    });
    
    if (!isSimilar || availableZones.length === 0) break;
    attempt++;
  } while (attempt < maxHueAttempts);
  
  recentBlobHues.push(zone_hue);
  if (recentBlobHues.length > 7) recentBlobHues.shift(); // Track last 7 for full palette cycling
  
  const zoneName = COLOR_ZONES.find(z => {
    if (z.min > z.max) return zone_hue >= z.min || zone_hue <= z.max;
    return zone_hue >= z.min && zone_hue <= z.max;
  })?.name || 'unknown';
  console.log(`🎨 New cloud hue: ${Math.round(zone_hue)}° (${zoneName}) | Recent: [${recentBlobHues.map(h => Math.round(h)).join(', ')}]`);
  
    // Orbital path parameters - unique ellipse for each blob
    // Start orbital angle at 0 for predictable spawn position
    const orbitalAngle = 0;
    const orbitalSemiMajor = BASE_UNIT * (0.15 + Math.random() * 0.25);
    const orbitalSemiMinor = BASE_UNIT * (0.08 + Math.random() * 0.15);
    const orbitalTilt = Math.random() * Math.PI;
    const orbitalPhaseOffset = Math.random() * Math.PI * 2;

    // Calculate initial orbital offset (angle = 0, so orbitX = semiMajor, orbitY = 0)
    const orbitX = orbitalSemiMajor; // cos(0) = 1
    const orbitY = 0; // sin(0) = 0
    const tiltCos = Math.cos(orbitalTilt);
    const tiltSin = Math.sin(orbitalTilt);
    const initialOffsetX = orbitX * tiltCos - orbitY * tiltSin;
    const initialOffsetY = orbitX * tiltSin + orbitY * tiltCos;

    // Calculate drift offset that will be applied at render time
    // Match the noise calculation from generateWatercolorBackground
    const absoluteScaled = millis() * 0.001;
    const baseFlowSpeed = 0.00003;
    const flowScale = BASE_UNIT * 0.25;
    const driftX = (noise(newBlobId * 0.53, absoluteScaled * baseFlowSpeed) - 0.5) * 2 * flowScale;
    const driftY = (noise(newBlobId * 0.53 + 100, absoluteScaled * baseFlowSpeed) - 0.5) * 2 * flowScale;

    // Adjust state.x/y (the center of the orbit)
    // Account for orbital offset AND drift so cloud appears exactly at touch point
    const finalX = (screenX - width / 2) - initialOffsetX - driftX;
    const finalY = (screenY - height / 2) - initialOffsetY - driftY;

    const state = {
    permanentId: permanentId,
    cycleIndex: 0,
    radius: radius,
    x: finalX,
    y: finalY,
    hue: zone_hue,
    targetRotation: 0,
    accumulatedRotation: 0,
    accumulatedAngle: 0,
    targetDrift: 0,
    accumulatedDrift: 0,
    currentHue: zone_hue,
    currentSat: isGrayscaleMode ? 0 : 100,
    startHue: zone_hue,
    startSat: isGrayscaleMode ? 0 : 100,
    targetHue: zone_hue,
    targetSat: isGrayscaleMode ? 0 : 100,
    transitionStartTime: 0,
    transitionDuration: 0,
    spawnTime: currentTime, // Track when manually spawned
    // Orbital path parameters
    orbitalAngle: orbitalAngle, 
    orbitalSemiMajor: orbitalSemiMajor,
    orbitalSemiMinor: orbitalSemiMinor,
    orbitalTilt: orbitalTilt,
    orbitalPhaseOffset: orbitalPhaseOffset
  };
  
  // Mark as manually spawned with fresh lifecycle
  state.spawnTime = currentTime;
  state.cycleIndex = 0; // Reset to first cycle
  
  blobStates[newBlobId] = state;
  
  console.log(`✨ SPAWNED CLOUD ${permanentId} at blob slot ${newBlobId}`);
  console.log(`   Position: (${Math.round(x)}, ${Math.round(y)})`);
  console.log(`   Hue: ${Math.round(zone_hue)}°, Radius: ${Math.round(radius)}`);
  console.log(`   State saved:`, state);
}

// ═══════════════════════════════════════════════════════════════════════
// COLOR TRANSITION HELPER FUNCTION
// ═══════════════════════════════════════════════════════════════════════
// Toggle grayscale mode for all blobs
function toggleGrayscaleMode() {
  isGrayscaleMode = !isGrayscaleMode;
  const currentTime = millis();
  lastGrayscaleToggleTime = currentTime;
  
  console.log(`🎨 Grayscale mode: ${isGrayscaleMode ? 'ON' : 'OFF'}`);
  
  // Transition all blobs to grayscale or back to color
  for (let blobId in blobStates) {
    const state = blobStates[blobId];
    if (isGrayscaleMode) {
      // Desaturate to grayscale (keep current hue for when we return to color)
      setColorTarget(parseInt(blobId), state.currentHue, 0, 4000, currentTime); // 4 seconds
    } else {
      // Return to color (restore saturation)
      setColorTarget(parseInt(blobId), state.currentHue, 100, 4000, currentTime); // 4 seconds
    }
  }
  
  // Schedule next toggle
  if (isGrayscaleMode) {
    // We just entered grayscale - schedule exit
    nextGrayscaleToggleTime = currentTime + grayscaleDuration;
  } else {
    // We just exited grayscale - schedule next entry with random interval
    const interval = random(grayscaleMinInterval, grayscaleMaxInterval);
    nextGrayscaleToggleTime = currentTime + interval;
    console.log(`⏰ Next grayscale in ${(interval/1000).toFixed(1)}s`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Call this to smoothly transition a blob to a new target color
function setColorTarget(blobId, targetHue, targetSat, durationMs, currentTime) {
  if (!blobStates[blobId]) {
    console.warn(`⚠️ Cannot set color target for blob ${blobId} - blob not found`);
    return;
  }
  
  const state = blobStates[blobId];
  
  // Set up transition from current color to new target
  state.startHue = state.currentHue;
  state.startSat = state.currentSat;
  state.targetHue = targetHue;
  state.targetSat = targetSat;
  state.transitionStartTime = currentTime;
  state.transitionDuration = durationMs;
  
  // Calculate shortest path for logging
  let hueDiff = targetHue - state.startHue;
  if (hueDiff > 180) hueDiff -= 360;
  if (hueDiff < -180) hueDiff += 360;
  
  console.log(`🎨 Blob ${state.permanentId}: Transition started`);
  console.log(`   From: H:${Math.round(state.startHue)}° S:${Math.round(state.startSat)}%`);
  console.log(`   To:   H:${Math.round(targetHue)}° S:${Math.round(targetSat)}%`);
  console.log(`   Path: ${hueDiff > 0 ? '+' : ''}${Math.round(hueDiff)}° over ${(durationMs/1000).toFixed(1)}s`);
  
  blobStates[blobId] = state;
}

// ---- Copied background generation logic from sketchdesktopreset.js, with time-based blob animation ----

function generateWatercolorBackground(pg, time = 0, dt = 16.666) {
  pg.push();
  pg.colorMode(HSB, 360, 100, 100, 100);
  pg.angleMode(DEGREES);

  // Time-correction factor relative to 60fps (16.666ms)
  // If dt is 33ms (30fps), factor is 2.0, so we move twice as far per frame
  // Cap deltaTime to prevent huge jumps when tab regains focus
  const cappedDt = Math.min(dt, 100); // Max 100ms (~10fps minimum)
  const timeScale = cappedDt / 16.666;
  
  // Screen scale factor - normalize movement to a reference screen size
  // Smaller screens move proportionally slower so clouds don't zip around
  const referenceSize = 1920; // Desktop reference
  const screenScale = BASE_UNIT / referenceSize;

  // Helper for time-based lerp to maintain consistent speed regardless of framerate
  // baseRate is the lerp amount at 60fps
  const timeLerp = (current, target, baseRate) => {
    const rate = 1 - Math.pow(1 - baseRate, timeScale);
    return pg.lerp(current, target, rate);
  };

  // Time tracking for cloud lifecycle
  const currentElapsed = time;
  const rawElapsedSinceReseed = currentElapsed - reseedTimestamp;

  // Calculate transition factor (0 = black, 1 = white)
  // Loop through full cycle: black → to white → white → to black
  const elapsed = (time - startTime) % FULL_CYCLE;
  let transitionT = 0;
  
  if (elapsed < BLACK_DURATION) {
    // Phase 1: Black
    transitionT = 0;
  } else if (elapsed < BLACK_DURATION + TO_WHITE_DURATION) {
    // Phase 2: Transitioning to white
    const t = (elapsed - BLACK_DURATION) / TO_WHITE_DURATION;
    transitionT = t;
  } else if (elapsed < BLACK_DURATION + TO_WHITE_DURATION + WHITE_DURATION) {
    // Phase 3: White
    transitionT = 1;
  } else {
    // Phase 4: Transitioning back to black
    const t = (elapsed - BLACK_DURATION - TO_WHITE_DURATION - WHITE_DURATION) / TO_BLACK_DURATION;
    transitionT = 1 - t; // Reverse: 1 -> 0
  }
  // Use super smooth easing (smootherstep) for buttery transitions
  const easedT = transitionT * transitionT * transitionT * (transitionT * (transitionT * 6 - 15) + 10);

  // Lock global evolution speed to real time (no globalTime scaling)
  const absoluteScaled = time; // ms since start
  const reseedElapsedScaled = rawElapsedSinceReseed;

  pg.blendMode(pg.BLEND);
  
  // Interpolate background from black (0,0,0) to cream (40,8,96)
  const bgHue = pg.lerp(0, 40, easedT);
  const bgSat = pg.lerp(0, 8, easedT);
  const bgBri = pg.lerp(0, 96, easedT);
  pg.background(bgHue, bgSat, bgBri);
  
  // Switch blend mode with extended zones for smoother transitions
  // Black background (easedT < 0.15): ADD mode for color (additive light), BLEND for grayscale
  // Long transition (0.15 <= easedT < 0.85): BLEND mode for ultra smooth fade
  // White background (easedT >= 0.85): MULTIPLY for color, BLEND for grayscale
  if (easedT < 0.15) {
    // Black background: use BLEND for grayscale (smooth transitions), ADD for color (vibrant overlaps)
    if (isGrayscaleMode) {
      pg.blendMode(pg.BLEND); // Grayscale needs normal alpha for smooth gradual appearance
    } else {
      pg.blendMode(pg.ADD); // Color clouds use additive on black
    }
  } else if (easedT >= 0.85) {
    // White background: use BLEND for grayscale (dark clouds need normal alpha), MULTIPLY for color
    if (isGrayscaleMode) {
      pg.blendMode(pg.BLEND); // Grayscale needs normal alpha to show dark clouds on white
    } else {
      pg.blendMode(pg.MULTIPLY); // Color clouds use multiply on white
    }
  } else {
    pg.blendMode(pg.BLEND); // Very long smooth transition between modes
  }
  
  // Calculate blend mode transition factor for gradual fade effects
  // 0 = fully ADD, 1 = fully MULTIPLY, 0.5 = pure BLEND
  let blendModeT = 0.5;
  if (easedT < 0.15) {
    blendModeT = 0; // ADD territory
  } else if (easedT >= 0.85) {
    blendModeT = 1; // MULTIPLY territory
  } else {
    // Smooth transition from 0 to 1 across the BLEND zone
    blendModeT = (easedT - 0.15) / (0.85 - 0.15);
  }

  const numSplotches = 8; // More clouds for richer composition
  const arr_num = 150; // Balanced shape count
  const shapeScale = 0.50; // Smaller individual shapes

  // Shared one-shot life timing for all blobs
  const assembleDuration = 3000;   // ms
  const sustainDuration  = 20000;  // ms
  const fadeDuration     = 18000;  // ms
  const totalLife        = assembleDuration + sustainDuration + fadeDuration;
  
  // Initial spawn interval: 3.5s to quickly populate, then 7s for normal cycle
  const initialSpawnInterval = 3500;  // ms - fast initial spawning
  const normalSpawnInterval  = 7000;  // ms - normal cycle after initial population
  const initialSpawnDuration = initialSpawnInterval * numSplotches; // Time to spawn all initial clouds

  const placedSplotches = [];
  const maxAttempts = 20;

  const boldCount = floor(random(1));
  let boldIndices = [];
  for (let j = 0; j < boldCount; j++) {
    let index;
    do {
      index = floor(random(numSplotches));
    } while (boldIndices.includes(index));
    boldIndices.push(index);
  }

  // No noticeable global fade; blobs themselves have their own long envelopes.
  const reseedFade = 1;

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED ORBITAL VELOCITY - Update once per frame, not per blob
  // ═══════════════════════════════════════════════════════════════════════
  sharedPathVelocity = timeLerp(sharedPathVelocity, targetPathVelocity, 0.08); // Fast response for video wall
  
  // Decay target velocity back to base when not dragging (after 3 seconds)
  if (!isDragging && (millis() - lastDragTime > 3000)) {
    targetPathVelocity = timeLerp(targetPathVelocity, BASE_PATH_VELOCITY, 0.005);
  }

  for (let i = 0; i < numSplotches; i++) {
    const blobId = i; // stable index per blob

    // Retrieve or initialize persistent state for this blob and life cycle.
    const prevState = blobStates[blobId] || { visible: 0, cycleIndex: -1 };
    let state = prevState;

    // Per-blob spawn timing and life-cycle index
    let timeSinceStart, cycleIndex;
    
    // Check if this is a manually spawned cloud
    if (state.spawnTime !== undefined) {
      // Manually spawned: calculate time from spawn timestamp
      timeSinceStart = currentElapsed - (state.spawnTime - reseedTimestamp);
      cycleIndex = 0; // Manual clouds only live one cycle
      
      if (i === 0 || (state.spawnTime && (currentElapsed - (state.spawnTime - reseedTimestamp)) < 2000)) {
        console.log(`🔍 Blob ${i} (manual): timeSinceStart=${timeSinceStart.toFixed(0)}ms, spawnTime=${state.spawnTime}, reseedTimestamp=${reseedTimestamp}`);
      }
    } else {
      // Automatic cloud: use spawn interval
      // Use fast 3.5s interval for initial spawn, then normal 7s interval
      const isInitialPhase = rawElapsedSinceReseed < initialSpawnDuration;
      const spawnInterval = isInitialPhase ? initialSpawnInterval : normalSpawnInterval;
      const spawnOffset = isInitialPhase 
        ? i * initialSpawnInterval  // Initial: staggered by 3.5s
        : initialSpawnDuration + (i * normalSpawnInterval) - (numSplotches * initialSpawnInterval); // After initial
      timeSinceStart = rawElapsedSinceReseed - spawnOffset;
      cycleIndex = timeSinceStart <= 0 ? 0 : Math.floor(timeSinceStart / totalLife);
    }

    // Assign permanent unique ID on first creation
    if (state.permanentId === undefined) {
      state.permanentId = nextPermanentId++;
      console.log(`🆔 Created blob ${blobId} with permanent ID: ${state.permanentId}`);
    }

    // Initialize color transition tracking
    if (state.currentHue === undefined) {
      state.currentHue = 0; // Will be set below
      state.targetHue = 0;
      state.startHue = 0;
      state.currentSat = 100;
      state.targetSat = 100;
      state.startSat = 100;
      state.transitionStartTime = 0;
      state.transitionDuration = 0;
    }
    
    // Initialize permanent rotation and drift momentum (accumulated from swipes)
    if (state.accumulatedRotation === undefined) {
      state.accumulatedRotation = 0; // Permanent rotation velocity added from swipes
    }
    if (state.accumulatedDrift === undefined) {
      state.accumulatedDrift = 0; // Permanent drift velocity added from swipes
    }
    if (state.targetRotation === undefined) {
      state.targetRotation = 0; // Target rotation to lerp toward
    }
    if (state.accumulatedAngle === undefined) {
      state.accumulatedAngle = 0; // Accumulated angle over time (prevents snapback)
    }
    if (state.targetDrift === undefined) {
      state.targetDrift = 0; // Target drift to lerp toward
    }
    
    // GRAVITATIONAL PHYSICS - velocity-based momentum system
    if (state.vx === undefined) {
      // Initialize with slow random velocity for gentle movement
      const angle = pg.random(pg.TWO_PI);
      const speed = pg.random(0.05, 0.15); // Slower initial speed
      state.vx = pg.cos(angle) * speed;
      state.vy = pg.sin(angle) * speed;
    }

    // Stable per-blob hue (no time component) so each splotch keeps a
    // consistent color over its life. Use a richer "Malibu sunset"
    // palette: oranges, corals, pinks, magentas, violets, sea-greens,
    // and soft sky blues. Avoid harsh, electric greens.
    
    // Only assign initial hue if this blob doesn't already have one
    if (state.hue === undefined) {
      let hueNoise = pg.noise(i * 0.71);
      let zone_hue;
      let attempt = 0;
      const maxHueAttempts = 10;
      
      // MALIBU SUNSET + FOREST palette - same as manual spawn
      const COLOR_ZONES = [
        { name: 'coral-orange', min: 10, max: 35 },
        { name: 'peachy-pink', min: 345, max: 15 },
        { name: 'magenta-violet', min: 290, max: 330 },
        { name: 'forest-green', min: 90, max: 140 },
        { name: 'sea-green', min: 165, max: 195 },
        { name: 'sky-blue', min: 200, max: 225 },
        { name: 'golden-yellow', min: 40, max: 55 },
      ];
      
      // Find which zones are NOT recently used
      const usedZoneIndices = recentBlobHues.map(hue => {
        for (let zi = 0; zi < COLOR_ZONES.length; zi++) {
          const zone = COLOR_ZONES[zi];
          let inZone = false;
          if (zone.min > zone.max) {
            inZone = hue >= zone.min || hue <= zone.max;
          } else {
            inZone = hue >= zone.min && hue <= zone.max;
          }
          if (inZone) return zi;
        }
        return -1;
      });
      
      const availableZones = COLOR_ZONES.map((_, zi) => zi).filter(zi => !usedZoneIndices.includes(zi));
      
      do {
        const zoneIndex = availableZones.length > 0 
          ? availableZones[Math.floor(pg.random() * availableZones.length)]
          : Math.floor(pg.random() * COLOR_ZONES.length);
        const zone = COLOR_ZONES[zoneIndex];
        
        if (zone.min > zone.max) {
          const range = (360 - zone.min) + zone.max;
          const offset = pg.random() * range;
          zone_hue = (zone.min + offset) % 360;
        } else {
          zone_hue = zone.min + pg.random() * (zone.max - zone.min);
        }
        
        const isSimilarToRecent = recentBlobHues.some(recentHue => {
          let diff = Math.abs(zone_hue - recentHue);
          if (diff > 180) diff = 360 - diff;
          return diff < 50;
        });
        
        if (!isSimilarToRecent || availableZones.length === 0) break;
        attempt++;
      } while (attempt < maxHueAttempts);
      
      // Track this hue (only when first assigned)
      recentBlobHues.push(zone_hue);
      if (recentBlobHues.length > 7) recentBlobHues.shift(); // Track last 7 for full palette cycling

      // Initialize both static hue and color transition state
      state.hue = zone_hue;
      state.currentHue = zone_hue;
      state.targetHue = zone_hue;
      state.startHue = zone_hue;
      
      console.log(`🎨 Blob ${state.permanentId}: Initial hue ${Math.round(zone_hue)}°`);
      
      blobStates[blobId] = state;
    }

    // When we enter a new life cycle, choose a new radius and center once,
    // and then reuse them every frame so the blob doesn't drift mid-life.
    // For manually spawned clouds, respect their preset position/radius
    const isManuallySpawned = state.spawnTime !== undefined && state.x !== undefined;
    
    if (state.cycleIndex !== cycleIndex && !isManuallySpawned) {
      // GUARANTEED SIZE DIVERSITY - each blob gets a distinct size slot
      // Size range: 10% to 40% of screen (using smaller dimension)
      const screenSize = pg.min(pg.width, pg.height);
      const minSize = screenSize * 0.15; // 15% of screen
      const maxSize = screenSize * 0.50; // 50% of screen
      
      // Fully random size within range (no slot-based progression)
      const radius = pg.random(minSize, maxSize);

      let zone_x, zone_y;
      
      // Every 3rd cloud (indices 2, 5) should spawn FAR from the group
      const shouldSpawnFar = (i % 3 === 2);
      const minFarDist = BASE_UNIT * 0.70; // 70% of screen away from group centroid
      
      // Calculate centroid of existing clouds
      let centroidX = 0, centroidY = 0, cloudCount = 0;
      for (let existingId in blobStates) {
        const existing = blobStates[existingId];
        if (existing.x !== undefined) {
          centroidX += existing.x;
          centroidY += existing.y;
          cloudCount++;
        }
      }
      if (cloudCount > 0) {
        centroidX /= cloudCount;
        centroidY /= cloudCount;
      }

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Use noise-based sampling keyed by blob index, life-cycle index, and
        // attempt # to pick a location. Allow a small range slightly
        // beyond the canvas so blobs can grow in from the edges.
        const baseKey = i * 10 + cycleIndex * 3.17;
        const edgeMargin = radius * 0.35; // Increased from 0.25 for wider spread
        zone_x = pg.map(
          pg.noise(baseKey + attempt * 5.31),
          0,
          1,
          -pg.width / 2 - edgeMargin,
          pg.width / 2 + edgeMargin
        );
        zone_y = pg.map(
          pg.noise(baseKey + 1000 + attempt * 4.79),
          0,
          1,
          -pg.height / 2 - edgeMargin,
          pg.height / 2 + edgeMargin
        );
        
        // If this cloud should spawn far, check distance from centroid
        if (shouldSpawnFar && cloudCount > 0) {
          const distFromCentroid = pg.dist(zone_x, zone_y, centroidX, centroidY);
          if (distFromCentroid < minFarDist) {
            continue; // Try again - too close to the group
          }
        }
        
        // Count how many clouds are already nearby this position
        let nearbyCount = 0;
        const proximityRadius = radius * 2.5; // Check within 2.5x radius
        const minSpawnDist = BASE_UNIT * 0.40; // Minimum distance from any existing cloud (40% of screen)
        
        let isOverlapping = false;
        
        // First check against ALL existing clouds in blobStates
        for (let existingId in blobStates) {
          if (existingId == blobId) continue; // Skip self
          const existing = blobStates[existingId];
          if (existing.x === undefined) continue;
          
          const d = pg.dist(zone_x, zone_y, existing.x, existing.y);
          if (d < minSpawnDist) {
            isOverlapping = true;
            break;
          }
          if (d < proximityRadius) {
            nearbyCount++;
          }
        }
        
        // Then check against clouds placed this frame
        if (!isOverlapping) {
          for (const s of placedSplotches) {
            const d = pg.dist(zone_x, zone_y, s.x, s.y);
          
            // Count nearby clouds
            if (d < proximityRadius) {
              nearbyCount++;
            }

            // Avoid stacking blobs with very similar hues directly on top
            // of each other: if hues are close, enforce a larger minimum
            // separation so same-colored blobs form separate fields. Also
            // give extra space to near-complementary hues that can mix
            // toward gray when heavily layered.
            let hueDiff = Math.abs(state.hue - s.hue);
            if (hueDiff > 180) hueDiff = 360 - hueDiff;
            const sameHue = hueDiff < 25;       // very similar hues
            const complementary = hueDiff > 140 && hueDiff < 220; // near opposites
            const sepFactor = sameHue ? 0.65 : complementary ? 0.60 : 0.45; // Reduced for more spread

            if (d < (radius + s.radius) * sepFactor) {
              isOverlapping = true;
              break;
            }
          }
        }
        
        // Reject if more than 2 clouds already nearby (prevent clusters of 3+)
        if (nearbyCount >= 2) {
          isOverlapping = true;
        }
        
        if (!isOverlapping) {
          break;
        }
      }

      state = {
        ...state,
        cycleIndex,
        radius,
        x: zone_x,
        y: zone_y,
        // Orbital path parameters - unique ellipse for each blob
        orbitalAngle: pg.random(pg.TWO_PI), // Starting angle on orbital
        orbitalSemiMajor: BASE_UNIT * (0.15 + pg.random(0.25)), // Semi-major axis
        orbitalSemiMinor: BASE_UNIT * (0.08 + pg.random(0.15)), // Semi-minor axis
        orbitalTilt: pg.random(pg.PI), // Tilt of the ellipse
        orbitalPhaseOffset: pg.random(pg.TWO_PI) // Phase offset for variety
      };
      blobStates[blobId] = state;
      placedSplotches.push({ x: zone_x, y: zone_y, radius: radius, hue: state.hue });
    }
    
    // Initialize orbital parameters if missing (for existing blobs)
    if (state.orbitalAngle === undefined) {
      state.orbitalAngle = pg.random(pg.TWO_PI);
      state.orbitalSemiMajor = BASE_UNIT * (0.15 + pg.random(0.25));
      state.orbitalSemiMinor = BASE_UNIT * (0.08 + pg.random(0.15));
      state.orbitalTilt = pg.random(pg.PI);
      state.orbitalPhaseOffset = pg.random(pg.TWO_PI);
    }

    const radius = state.radius;
    const zone_x = state.x;
    const zone_y = state.y;
    
    // ═══════════════════════════════════════════════════════════════════
    // SECONDARY ORBITS - soft mutual attraction/repulsion between blob centers
    // ═══════════════════════════════════════════════════════════════════
    if (params.attractStrength > 0 || params.repelStrength > 0) {
      if (state.gravityVX === undefined) state.gravityVX = 0;
      if (state.gravityVY === undefined) state.gravityVY = 0;

      let accX = 0;
      let accY = 0;

      for (let otherId in blobStates) {
        if (parseInt(otherId) === blobId) continue;
        const other = blobStates[otherId];
        if (!other || other.x === undefined || other.y === undefined || other.radius === undefined) continue;

        const dx = other.x - state.x;
        const dy = other.y - state.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 1e-4) continue;

        const dist = pg.sqrt(distSq);
        const dirX = dx / dist;
        const dirY = dy / dist;

        const combinedRadius = radius + other.radius;
        const minDist = combinedRadius * 0.35; // start repelling when very close

        // Treat radius as proxy for mass, normalized by BASE_UNIT to keep scale stable
        const mass = other.radius / BASE_UNIT;
        let force = params.attractStrength * mass / (1.0 + distSq / (BASE_UNIT * BASE_UNIT));

        // Mild repulsion at very close range to prevent collapse
        if (dist < minDist) {
          force *= -params.repelStrength;
        }

        accX += dirX * force;
        accY += dirY * force;
      }

      // Integrate with damping so motion stays slow and orbital, not ballistic
      const gravityDamping = 0.96;
      state.gravityVX = state.gravityVX * gravityDamping + accX;
      state.gravityVY = state.gravityVY * gravityDamping + accY;

      // Apply small offset to the orbital center
      state.x += state.gravityVX;
      state.y += state.gravityVY;
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // COLOR TRANSITION LOGIC - Interpolate between current and target hue/sat
    // ═══════════════════════════════════════════════════════════════════
    let actualHue, actualSat;
    
    if (state.transitionDuration > 0 && time >= state.transitionStartTime) {
      // Currently in a color transition
      const elapsed = time - state.transitionStartTime;
      const progress = Math.min(1.0, elapsed / state.transitionDuration);
      
      // Smooth easing for color transitions
      const easedProgress = progress * progress * (3 - 2 * progress); // smoothstep
      
      // Calculate shortest path around color wheel for hue
      let hueDiff = state.targetHue - state.startHue;
      if (hueDiff > 180) hueDiff -= 360;
      if (hueDiff < -180) hueDiff += 360;
      
      actualHue = (state.startHue + hueDiff * easedProgress + 360) % 360;
      actualSat = pg.lerp(state.startSat, state.targetSat, easedProgress);
      
      // Update current color state
      state.currentHue = actualHue;
      state.currentSat = actualSat;
      
      // LOG TRANSITION PROGRESS - only for first blob to avoid spam
      if (ENABLE_RENDER_DEBUG_LOGS && i === 0 && frameCount % 10 === 0) {
        console.log(`📊 Saturation Transition: ${Math.round(actualSat)}% | Progress: ${Math.round(progress * 100)}% | ColorBlend: ${(actualSat/100).toFixed(2)}`);
      }
      
      // Transition complete - lock to target
      if (progress >= 1.0) {
        state.currentHue = state.targetHue;
        state.currentSat = state.targetSat;
        state.transitionDuration = 0; // Mark transition as complete
        if (ENABLE_RENDER_DEBUG_LOGS) {
          console.log(`✅ Blob ${state.permanentId}: Transition complete at H:${Math.round(state.currentHue)}° S:${Math.round(state.currentSat)}%`);
        }
      }
    } else {
      // No active transition - use current color
      actualHue = state.currentHue;
      actualSat = state.currentSat;
    }
    
    const zone_hue = actualHue; // This is what will be rendered

    let arr = [];

    // Animate each splotch:
    // - rotation (unique speed per splotch)
    // - gentle drifting based on noise
    // - pulsing (unique rate/amplitude per splotch)
    const t = absoluteScaled * 0.0005; // global time in seconds-ish

    // Unique spin speed and direction per splotch - increased for more rotation
    // Apply accumulated rotation from swipes - each cloud maintains its own momentum
    const baseSpinSpeed = pg.map(pg.noise(i * 0.7), 0, 1, -15, 15); // deg/sec
    
    // If not dragging, decay target momentum back to 0 (natural state)
    // Wait 5 seconds after drag stops, then decay at moderate pace
    if (!isDragging && (millis() - lastDragTime > 5000)) {
      state.targetRotation = timeLerp(state.targetRotation, 0, 0.01); // Decay ~10 seconds to baseline
    }
    
    // Lerp accumulated momentum toward target - very fast for immediate direction changes
    state.accumulatedRotation = timeLerp(state.accumulatedRotation, state.targetRotation, 0.25);
    
    // Calculate spin speed from base + accumulated momentum
    // Add to match visual direction (CCW gesture → CCW spin)
    const spinSpeed = baseSpinSpeed + state.accumulatedRotation;
    
    // ACCUMULATED ANGLE: Add to angle each frame (prevents snapback when momentum changes)
    state.accumulatedAngle += spinSpeed * 0.016 * timeScale; // Scale by timeScale
    const splotchAngle = state.accumulatedAngle + i * 20;
    
    blobStates[blobId] = state;

    // Add organic drift/flow for traveling blobs
    // If not dragging, decay target drift back to 0 (natural state)
    // Wait 5 seconds after drag stops, then decay at moderate pace
    if (!isDragging && (millis() - lastDragTime > 5000)) {
      state.targetDrift = timeLerp(state.targetDrift, 0, 0.01); // Decay ~10 seconds to baseline
    }
    
    // Gradually lerp accumulated drift toward target (very slow, no visible jumps)
    state.accumulatedDrift = timeLerp(state.accumulatedDrift, state.targetDrift, 0.04); // Fast response for video wall
    blobStates[blobId] = state;
    
    // Calculate drift multiplier from accumulated drift (positive = more chaotic, negative = more stagnant)
    const driftMultiplier = 1.0 + (state.accumulatedDrift * 1000); // Scale up the effect
    const clampedMultiplier = pg.constrain(driftMultiplier, 0.1, 5.0); // Range from 10% (stagnant) to 500% (chaotic)
    
    const baseFlowSpeed = 0.00003; // Very slow for wide, gradual cycles
    const flowSpeed = baseFlowSpeed * clampedMultiplier; // Speed affected by drift
    const flowScale = BASE_UNIT * 0.25 * clampedMultiplier; // Scale affected by drift - more movement!
    const driftX = (pg.noise(i * 0.53, absoluteScaled * flowSpeed) - 0.5) * 2 * flowScale;
    const driftY = (pg.noise(i * 0.53 + 100, absoluteScaled * flowSpeed) - 0.5) * 2 * flowScale;

    // ═══════════════════════════════════════════════════════════════════
    // GRAVITATIONAL PHYSICS - Clouds orbit with momentum, pass and return
    // ═══════════════════════════════════════════════════════════════════
    
    // Gravity pulls toward center (0,0 in centered coordinates)
    const gravityStrength = 0.00001; // Minimal gravity - prevents clumping
    const distToCenter = pg.sqrt(state.x * state.x + state.y * state.y);
    const minDist = 50; // Prevent extreme forces when very close
    const effectiveDist = pg.max(distToCenter, minDist);
    
    // Gravitational acceleration toward center (F = G/r²)
    // SKIP if infinity mode - clouds are free from gravity
    if (!infinityModeActive) {
      const gravityForce = gravityStrength * BASE_UNIT / effectiveDist;
      const gravityX = -state.x / effectiveDist * gravityForce;
      const gravityY = -state.y / effectiveDist * gravityForce;
      
      // Apply gravity to velocity (momentum carries through)
      state.vx += gravityX * timeScale;
      state.vy += gravityY * timeScale;
    }
    
    // Apply gesture-based velocity boost from sharedPathVelocity
    // SKIP if infinity mode - clouds are independent
    if (!infinityModeActive) {
      const tangentX = -state.y / effectiveDist;
      const tangentY = state.x / effectiveDist;
      state.vx += tangentX * sharedPathVelocity * 0.1 * timeScale;
      state.vy += tangentY * sharedPathVelocity * 0.1 * timeScale;
    }
    
    // AUTOMATED RANDOM WANDERING - prevents clumping when idle
    // Each cloud gets unique noise-based random nudges
    const wanderTime = absoluteScaled * 0.00002; // Very slow evolution
    const wanderStrength = 0.015; // Gentle random force
    const wanderX = (pg.noise(i * 0.73, wanderTime) - 0.5) * 2 * wanderStrength;
    const wanderY = (pg.noise(i * 0.73 + 500, wanderTime) - 0.5) * 2 * wanderStrength;
    state.vx += wanderX * timeScale;
    state.vy += wanderY * timeScale;
    
    // Very light damping - preserves momentum while preventing runaway
    const damping = 0.9998;
    state.vx *= pg.pow(damping, timeScale);
    state.vy *= pg.pow(damping, timeScale);
    
    // Constrain max speed to prevent chaos
    const speed = pg.sqrt(state.vx * state.vx + state.vy * state.vy);
    const maxSpeed = 6.0;
    if (speed > maxSpeed) {
      state.vx = (state.vx / speed) * maxSpeed;
      state.vy = (state.vy / speed) * maxSpeed;
    }
    
    // Update position based on velocity (momentum!)
    // Scale by screenScale so smaller screens have proportionally slower movement
    state.x += state.vx * timeScale * screenScale;
    state.y += state.vy * timeScale * screenScale;
    
    // BOUNCE BOUNDARY - clouds bounce off screen edges
    // Allow some overshoot (20% of screen) before bouncing
    const halfWidth = pg.width / 2;
    const halfHeight = pg.height / 2;
    const bounceMargin = pg.min(halfWidth, halfHeight) * 0.2; // 20% past edge before bounce
    const bounceDamping = 0.6; // Lose 40% velocity on bounce
    
    if (state.x > halfWidth + bounceMargin) {
      state.x = halfWidth + bounceMargin;
      state.vx *= -bounceDamping; // Reverse and dampen
    } else if (state.x < -halfWidth - bounceMargin) {
      state.x = -halfWidth - bounceMargin;
      state.vx *= -bounceDamping;
    }
    
    if (state.y > halfHeight + bounceMargin) {
      state.y = halfHeight + bounceMargin;
      state.vy *= -bounceDamping;
    } else if (state.y < -halfHeight - bounceMargin) {
      state.y = -halfHeight - bounceMargin;
      state.vy *= -bounceDamping;
    }
    
    // Minimal center pull - just enough to keep clouds from drifting forever
    const centerPull = 0.00002; // Very weak pull
    state.vx -= state.x * centerPull * timeScale;
    state.vy -= state.y * centerPull * timeScale;
    
    // Cloud repulsion - push away from other clouds to prevent clumping
    // ENHANCED: Repulsion increases with spin speed - clouds break apart when spinning fast
    const spinMultiplier = 1 + abs(state.targetRotation || 0) * 0.15; // Up to 5.5x at max spin
    for (let otherBlobId in blobStates) {
      if (otherBlobId === blobId) continue;
      const other = blobStates[otherBlobId];
      if (other.x === undefined) continue;
      const ddx = state.x - other.x;
      const ddy = state.y - other.y;
      const distSq = ddx * ddx + ddy * ddy;
      const minRepelDist = 100 + abs(state.targetRotation || 0) * 5; // Larger repel zone when spinning
      if (distSq < minRepelDist * minRepelDist && distSq > 1) {
        const dist = pg.sqrt(distSq);
        const repelForce = 0.02 * spinMultiplier * (1 - dist / minRepelDist);
        state.vx += (ddx / dist) * repelForce * timeScale;
        state.vy += (ddy / dist) * repelForce * timeScale;
      }
    }
    
    // Orbital offset is now zero - position comes directly from state.x/y
    const orbitalOffsetX = 0;
    const orbitalOffsetY = 0;
    
    // Update state for next frame
    blobStates[blobId] = state;

    // Per-splotch size pulsing: base noise-driven depth, modulated by dashboard speed/depth
    let pulse = 1;
    if (params.sizeFxEnabled) {
      const basePulseAmt = pg.map(pg.noise(i * 1.1 + 1500), 0, 1, 0.08, 0.22); // base depth
      const pulseAmp = basePulseAmt * params.sizeDepth;
      const sizePhase = absoluteScaled * params.sizeSpeed + i * 0.8;
      const sizeWave = 0.5 * (1 + pg.sin(sizePhase)); // 0..1
      const easedSize = sizeWave * sizeWave * (3 - 2 * sizeWave); // smoothstep
      const signedWave = (easedSize - 0.5) * 2; // -1..1
      pulse = 1 + pulseAmp * signedWave;
    }

    pg.push();
    // Move origin to center of screen
    pg.translate(pg.width / 2, pg.height / 2);
    
    // Position cloud: base position + orbital offset + drift
    const finalX = state.x + orbitalOffsetX + driftX;
    const finalY = state.y + orbitalOffsetY + driftY;
    
    // DEBUG: Log render position for first cloud
    if (ENABLE_RENDER_DEBUG_LOGS && i === 0 && frameCount % 60 === 0) {
      console.log(`Blob ${blobId}: orbital=(${Math.round(orbitalOffsetX)},${Math.round(orbitalOffsetY)})`);
    }
    
    pg.translate(finalX, finalY);
    pg.rotate(splotchAngle);
    pg.scale(pulse);

    for (let k = 0; k < arr_num; k++) {
      let angle_sep = pg.int(3, pg.noise(k) * 6); // Simplified range
      let points = createShape(radius * shapeScale, angle_sep, pg); // Smaller shapes
      let form = transformShape(points, 3, 0.5, pg); // Reduced recursion from 4 to 3
      arr.push(form);
    }

    // One-shot life curve for a single blob:
    // - 0..3s: assemble (geometry/alpha ramp up)
    // - 3..23s: sustain (full geometry/alpha)
    // - 23..30s: fade/undraw (geometry/alpha ramp down)
    // - >30s: dead (no geometry/alpha) and does NOT cycle.

    // Staggered spawn: each blob i starts its life at a different time
    // so they form one after another with overlap. After that, each
    // blob loops through the same smooth assemble/sustain/fade curve
    // repeatedly, so the field never "runs out" of blobs.
    // Before this blob's spawn time, it is simply absent.
    const lifeTime = timeSinceStart <= 0 ? 0 : (timeSinceStart % totalLife); // ms within current life cycle

    // Compute a normalized life position 0..1 over the life cycle
    const lifeT = lifeTime / totalLife;

    // Use the same lifeT to derive a target geometry count. We keep
    // this simple and let later smoothing enforce the 3-subshape-per-
    // frame pacing.
    let targetVisibleForms = 0;
    if (lifeTime <= 0) {
      targetVisibleForms = 0;
    } else if (lifeTime < assembleDuration) {
      // Assembly phase: ramp 0 -> full
      const t = lifeTime / assembleDuration; // 0..1
      targetVisibleForms = pg.floor(pg.map(t, 0, 1, 0, arr_num));
    } else if (lifeTime < assembleDuration + sustainDuration) {
      // Sustain: full geometry
      targetVisibleForms = arr_num;
    } else if (lifeTime < totalLife) {
      // Fade/undraw: ramp full -> 0
      const t = (lifeTime - assembleDuration - sustainDuration) / fadeDuration; // 0..1
      targetVisibleForms = pg.floor(pg.map(t, 0, 1, arr_num, 0));
    } else {
      // After death: stay at 0 geometry
      targetVisibleForms = 0;
    }

    // Smooth the change in visible form count so we never add/remove
    // too many forms in a single frame. This makes both assembly and
    // disassembly feel like individual strokes being laid down or
    // erased, rather than chunks popping in/out.
    const prevStateForVisible = blobStates[blobId] || state || { visible: 0 };
    const maxStepPerFrame = 3; // add/remove at most 3 subshapes per frame

    const diff = targetVisibleForms - prevStateForVisible.visible;
    let newVisible = prevStateForVisible.visible;
    if (diff > 0) {
      newVisible += Math.min(diff, maxStepPerFrame);
    } else if (diff < 0) {
      newVisible += Math.max(diff, -maxStepPerFrame);
    }
    newVisible = pg.constrain(newVisible, 0, arr_num);
    blobStates[blobId] = { ...state, visible: newVisible };
    const maxVisibleForms = newVisible;

    for (let formIndex = 0; formIndex < arr.length; formIndex++) {
      if (formIndex >= maxVisibleForms) break;
      const form = arr[formIndex];
      // Smooth, noise-based jitter instead of per-frame randomGaussian,
      // so subshapes drift gently instead of jumping.
      const jitterScale = radius * 0.35; // Wider spread to avoid center concentration
      const jx = (pg.noise(i * 10 + formIndex * 0.37, absoluteScaled * 0.0002) - 0.5) * 2 * jitterScale;
      const jy = (pg.noise(i * 10 + formIndex * 0.37 + 500, absoluteScaled * 0.0002) - 0.5) * 2 * jitterScale;
      pg.push();
      pg.translate(jx, jy);
      
      // INTERNAL DIFFERENTIAL SPIN - opposes the cloud's overall spin direction
      // Creates a counter-rotating churning effect within each cloud
      // Use smooth direction factor that transitions gradually through zero
      const shapeSpinSpeed = pg.noise(i * 7.3 + formIndex * 0.19) * 1.5 + 0.5; // 0.5 to 2.0 variation (stronger)
      // Smooth direction: tanh gives gradual -1 to 1 transition, scaled to be responsive
      const smoothDir = -Math.tanh(state.accumulatedRotation * 0.006); // Ultra-gradual: 5x slower than macro spin
      const internalSpin = absoluteScaled * 0.0006 * shapeSpinSpeed * smoothDir;
      pg.rotate(internalSpin);

      // Smoothly interpolate alpha/saturation with blend-mode-aware adjustments
      // Use blendModeT for ultra-smooth alpha transitions
      const blendModeSmooth = blendModeT * blendModeT * blendModeT * (blendModeT * (blendModeT * 6 - 15) + 10);
      
      // Base alpha adjusts based on blend mode
      // ADD mode (blendModeT=0): 1.2 alpha (higher to ensure visibility)
      // BLEND mode (blendModeT=0.5): 1.6 alpha (transition)
      // MULTIPLY mode (blendModeT=1): 2.2 alpha (very high for vibrant colors on white)
      let baseAlpha = pg.lerp(1.2, 2.2, blendModeSmooth) * (100 / arr_num);
      
      // BOOST alpha in grayscale mode for whiter clouds
      if (actualSat < 50) {
        // When desaturating, boost alpha to maintain visual intensity
        const grayscaleBoost = pg.map(actualSat, 0, 50, 1.5, 1.0); // 1.5x at full grayscale, 1.0x at half saturation
        baseAlpha *= grayscaleBoost;
      }
      
      // Fade in/out multiplier for ADD mode to prevent popping
      // Near ADD mode edges, gradually fade but keep visible
      let additiveFade = 1.0;
      if (easedT < 0.18) {
        // Fading in to ADD from black - start higher to stay visible
        additiveFade = pg.map(easedT, 0, 0.18, 0.85, 1.0); // Gentle fade in
      } else if (easedT > 0.82) {
        // Fading out of ADD when leaving black
        additiveFade = pg.map(easedT, 0.82, 1.0, 1.0, 0.85); // Gentle fade out
      }
      baseAlpha *= additiveFade;
      
      // Saturation handling - use actualSat from color transition, not baseSat
      // This ensures grayscale mode (actualSat = 0) is fully desaturated
      // Boost saturation on black backgrounds for more vibrant colors
      let baseSat = pg.lerp(98, 100, blendModeSmooth); // Increased from 94 to 98
      
      // OVERRIDE: If in grayscale mode, use actualSat directly (should be 0 or transitioning to 0)
      // Otherwise apply radial gradient to baseSat
      let finalSatBeforeRadial = actualSat;

      // One-shot life curve for brightness (lifeAlpha) that matches the
      // same timing as the geometry life above.
      let lifeAlpha = 0;
      if (lifeTime <= 0) {
        lifeAlpha = 0;
      } else if (lifeTime < assembleDuration) {
        // Assembly: 0 -> 1 with a gentle ease-in
        const t = lifeTime / assembleDuration; // 0..1
        const eased = t * t * (3 - 2 * t);     // smoothstep
        lifeAlpha = eased;
      } else if (lifeTime < assembleDuration + sustainDuration) {
        // Sustain: hold near full brightness
        lifeAlpha = 1;
      } else if (lifeTime < totalLife) {
        // Fade-out: 1 -> 0 with gentle ease-out that slows at the end
        const t = (lifeTime - assembleDuration - sustainDuration) / fadeDuration; // 0..1
        // Quadratic ease-out: fast start, slow finish (opposite of smoothstep)
        const eased = t * (2 - t);
        lifeAlpha = 1 - eased;
        // Never go fully invisible - keep minimum 5% alpha
        lifeAlpha = Math.max(lifeAlpha, 0.05);
      } else {
        // After death: very dim but not instant disappear
        lifeAlpha = 0.02;
      }

      // Per-sub-shape opacity wave: center around 1, dip toward 0 based on depth.
      // Each form gets its own local speed and phase based on noise so timing is desynchronized.
      let fadeFactor = 1;
      if (params.opacityFxEnabled) {
        const noiseSeed = i * 5.17 + formIndex * 3.41;
        // Local speed range: 0..opacitySpeed, so slider is a cap, not a common base
        const localSpeed = params.opacitySpeed * pg.noise(noiseSeed);
        const phaseOffset = pg.noise(noiseSeed + 1000) * pg.TWO_PI;

        const fadePhase  = time * localSpeed + phaseOffset;
        const wave       = 0.5 * (1 + pg.sin(fadePhase));  // pure sine, 0..1

        // When opacityDepth=0 -> always 1; when =1 -> full 0..1 range across 0..1 wave
        fadeFactor = 1 - params.opacityDepth * (1 - wave);

        // For very dim blobs (birth/death), damp modulation based on lifeAlpha so entry/exit
        // feels smooth and not flickery. lifeAlpha is 0..1 across the entire bell.
        const dimFactor = pg.constrain(lifeAlpha / 0.3, 0, 1); // 0 when very dim, 1 once fairly bright
        fadeFactor = 1 - (1 - fadeFactor) * dimFactor;

        // Lift the minimum modulation so mid-life blobs can still reach a strong,
        // consistent vibrancy even as the composition evolves. This avoids them
        // getting stuck in a too-dim state from the local opacity wave.
        fadeFactor = 0.45 + 0.55 * fadeFactor; // clamp roughly to [0.45, 1]
      }

      // Radial attenuation so centers stay softer: reduce opacity near
      // the blob origin and let it build slightly toward a mid-ring,
      // then fall off toward the edge. This mimics watercolor pooling.
      const distFromCenter = pg.sqrt(jx * jx + jy * jy);
      const rNorm = pg.constrain(distFromCenter / radius, 0, 1); // 0 at center, 1 at approx edge
      const midRing = rNorm * (1 - rNorm); // 0 at center/edge, peak ~0.25 at rNorm=0.5
      const radialFactor = pg.map(midRing, 0, 0.25, 0.5, 1.0); // center ~0.5, mid ~1.0, edge ~0.5

      // Radial saturation gradient - smoothly blend between color and grayscale modes
      // Calculate color mode saturation (with radial gradient)
      // Higher power = faster falloff from center (smaller saturated core)
      const saturationPower = pg.lerp(1.5, 2.0, easedT);
      const minSat = pg.lerp(0.25, 0.45, easedT);
      const maxCenterSat = 0.75; // Cap center saturation at 75%
      const saturationFactor = pg.map(pg.pow(rNorm, saturationPower), 0, 1, maxCenterSat, minSat);
      const colorModeSat = baseSat * saturationFactor;
      
      // Grayscale mode saturation (flat, no gradient)
      const grayscaleModeSat = actualSat;
      
      // Smooth blend factor: 0 = grayscale, 1 = color
      // Use actualSat as blend factor (0-100 range)
      const colorBlend = pg.constrain(actualSat / 100, 0, 1); // 0 when actualSat=0, 1 when actualSat=100
      
      // Smoothly interpolate between grayscale and color saturation
      let saturation = pg.lerp(grayscaleModeSat, colorModeSat, colorBlend);

      // Final alpha combines: baseAlpha * blob life envelope * local opacity FX * global reseed fade-in * radial
      let alpha = baseAlpha * lifeAlpha * fadeFactor * reseedFade * radialFactor;

      if (boldIndices.includes(i)) {
        // Make bold blobs only slightly stronger so they stand out
        // without flattening the texture.
        alpha *= 1.3; // was 2.5
        saturation = min(100, saturation * 1.05);
      }

      // White glow creates depth but must be controlled in ADD mode
      // Black/ADD version: 0.4 alpha (moderate glow to avoid blowout)
      // White/MULTIPLY version: 0.15 alpha (subtle halo)
      // Use power curve to keep glow visible longer
      const whiteGlowStrength = pg.lerp(0.4, 0.15, pg.pow(easedT, 2.0));
      if (whiteGlowStrength > 0.05) {
        const whiteAlpha = alpha * whiteGlowStrength;
        drawShape(form, pg.color(0, 0, 100, whiteAlpha), pg);
      }
      
      // Brightness calculation - smoothly blend between grayscale and color modes
      
      // GRAYSCALE MODE brightness: Invert based on background
      let grayscaleBrightness;
      if (easedT < 0.15) {
        grayscaleBrightness = 100;  // Brighter white clouds on black
      } else if (easedT < 0.85) {
        const transitionT = (easedT - 0.15) / (0.85 - 0.15);
        grayscaleBrightness = pg.lerp(100, 8, transitionT);
      } else {
        grayscaleBrightness = 8;  // Black clouds on white
      }
      
      // COLOR MODE brightness: Boost on black backgrounds for vibrant colors
      const brightnessT = easedT * easedT * easedT * (easedT * (easedT * 6 - 15) + 10);
      // Black/ADD: 100 (maximum vibrancy), White/MULTIPLY: 100 (maintain brightness)
      const colorBrightness = pg.lerp(100, 100, brightnessT); // Increased from 96 to 100
      
      // Smooth blend between grayscale and color brightness using colorBlend factor
      // colorBlend was calculated above: 0 = grayscale, 1 = color
      let brightness = pg.lerp(grayscaleBrightness, colorBrightness, colorBlend);
      
      // DETAILED LOGGING - only for first blob, first form, every 10 frames
      if (ENABLE_RENDER_DEBUG_LOGS && i === 0 && formIndex === 0 && frameCount % 10 === 0 && state.transitionDuration > 0) {
        console.log(`🔍 Saturation ${Math.round(actualSat)}%:`);
        console.log(`   ColorBlend: ${colorBlend.toFixed(3)}`);
        console.log(`   Sat: gray=${grayscaleModeSat.toFixed(1)} color=${colorModeSat.toFixed(1)} → final=${saturation.toFixed(1)}`);
        console.log(`   Bri: gray=${grayscaleBrightness.toFixed(1)} color=${colorBrightness.toFixed(1)} → final=${brightness.toFixed(1)}`);
        console.log(`   EasedT: ${easedT.toFixed(3)} | bgBri: ${bgBri.toFixed(1)}`);
      }
      
      drawShape(form, pg.color(zone_hue, saturation, brightness, alpha), pg);
      pg.pop();
    }
    pg.pop();
  }
  
  // Global boosts are NOT cleared here - they accumulate during drag
  // and are applied to all clouds on mouse/touch release
  
  pg.pop();
}

function setupControls() {
  // Sliders and DOM controls removed: params are now fixed by their
  // defaults at the top of this file.
}

function createShape(shape_radius, angle_sep, pg) {
  let points = [];
  let start_angle = pg.random(360);
  let angle_step = 360 / angle_sep;
  for (let angle = start_angle; angle < start_angle + 360; angle += angle_step) {
    let x = pg.cos(angle) * shape_radius;
    let y = pg.sin(angle) * shape_radius;
    let point = pg.createVector(x, y);
    points.push(point);
  }
  return points;
}

function transformShape(points, count, variance, pg) {
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
    mid.x += pg.randomGaussian(0, variance * len);
    mid.y += pg.randomGaussian(0, variance * len);
    new_points.push(mid);
  }
  return transformShape(new_points, count - 1, variance, pg);
}

function drawShape(points, col, pg) {
  pg.push();
  pg.fill(col);
  pg.noStroke();
  pg.beginShape();
  for (let p of points) {
    pg.vertex(p.x, p.y);
  }
  pg.endShape(CLOSE);
  pg.pop();
}

// ═══════════════════════════════════════════════════════════════════════
// 2D WATER RIPPLE SIMULATION
// Based on Hugo Elias algorithm
// ═══════════════════════════════════════════════════════════════════════

function addWaterDisturbance(x, y, vx = 0, vy = 0, isDrag = false) {
  // Convert screen coordinates to water grid coordinates
  const waterX = floor(x / WATER_CELL_SIZE);
  const waterY = floor(y / WATER_CELL_SIZE);
  
  // Track disturbance location and set max spread radius
  lastDisturbanceX = waterX;
  lastDisturbanceY = waterY;
  maxRippleRadius = min(waterCols, waterRows) * 0.08; // Smaller spread (8% of grid, was 12%)
  
  // Cap velocity for fast drags - prevents effect from breaking at high speeds
  const maxVelocity = 25;
  const rawSpeed = sqrt(vx * vx + vy * vy);
  const cappedSpeed = min(rawSpeed, maxVelocity);
  const velocityScale = rawSpeed > 0 ? cappedSpeed / rawSpeed : 1;
  const cappedVx = vx * velocityScale;
  const cappedVy = vy * velocityScale;
  
  // Calculate velocity magnitude for directional effect
  const speed = cappedSpeed;
  const hasVelocity = speed > 1; // Lower threshold for V-wake
  
  // Normalize velocity for direction
  const dirX = hasVelocity ? cappedVx / speed : 0;
  const dirY = hasVelocity ? cappedVy / speed : 0;
  
  // CIRCULAR RIPPLES: Only on click/release (NOT during drag)
  if (!isDrag) {
    const radius = 3; // Circular ripple radius
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        const wx = waterX + i;
        const wy = waterY + j;
        if (wx > 0 && wx < waterCols - 1 && wy > 0 && wy < waterRows - 1) {
          const dist = sqrt(i * i + j * j);
          if (dist <= radius) {
            // Stronger circular ripple for click/release
            const strength = (1 - dist / radius) * 2000;
            previousWater[wx][wy] = strength;
          }
        }
      }
    }
  }
  
  // V-SHAPED WAKE: Only during drag (has velocity)
  if (hasVelocity) {
    // Calculate perpendicular direction for wake spread
    const perpX = -dirY; // Perpendicular to movement direction
    const perpY = dirX;
    
    // Bow wave at front (small disturbance at touch point)
    if (waterX > 0 && waterX < waterCols - 1 && waterY > 0 && waterY < waterRows - 1) {
      previousWater[waterX][waterY] = 800;
    }
    
    // V-wake trail behind the touch point
    const wakeLength = min(floor(speed / 3), 12); // Longer trail based on speed
    
    for (let t = 1; t <= wakeLength; t++) {
      // Base position behind the touch point (use capped velocity)
      const backDist = t * 0.5; // How far back
      const baseX = x - cappedVx * backDist;
      const baseY = y - cappedVy * backDist;
      
      // Wake spreads wider as it goes back (V-shape)
      const spread = t * 2.0; // How wide the V spreads
      
      // Left side of wake
      const leftX = floor((baseX + perpX * spread) / WATER_CELL_SIZE);
      const leftY = floor((baseY + perpY * spread) / WATER_CELL_SIZE);
      
      // Right side of wake
      const rightX = floor((baseX - perpX * spread) / WATER_CELL_SIZE);
      const rightY = floor((baseY - perpY * spread) / WATER_CELL_SIZE);
      
      const wakeStrength = 900 / t; // Stronger, fading intensity
      
      // Draw left wake line
      if (leftX > 0 && leftX < waterCols - 1 && leftY > 0 && leftY < waterRows - 1) {
        previousWater[leftX][leftY] = wakeStrength;
      }
      
      // Draw right wake line
      if (rightX > 0 && rightX < waterCols - 1 && rightY > 0 && rightY < waterRows - 1) {
        previousWater[rightX][rightY] = wakeStrength;
      }
    }
  }
}

function simulateWaterRipples() {
  // Hugo Elias water ripple algorithm
  for (let i = 1; i < waterCols - 1; i++) {
    for (let j = 1; j < waterRows - 1; j++) {
      // Calculate distance from disturbance origin
      if (lastDisturbanceX >= 0 && lastDisturbanceY >= 0) {
        const dx = i - lastDisturbanceX;
        const dy = j - lastDisturbanceY;
        const distFromOrigin = sqrt(dx * dx + dy * dy);
        
        // If beyond max radius, dampen heavily to stop spread
        if (distFromOrigin > maxRippleRadius) {
          currentWater[i][j] *= 0.8; // Heavy dampening outside radius
          previousWater[i][j] *= 0.8;
          continue;
        }
      }
      
      currentWater[i][j] =
        (previousWater[i - 1][j] +
          previousWater[i + 1][j] +
          previousWater[i][j - 1] +
          previousWater[i][j + 1]) / 2 -
        currentWater[i][j];
      currentWater[i][j] = currentWater[i][j] * dampening;
    }
  }
  
  // Swap buffers
  let temp = previousWater;
  previousWater = currentWater;
  currentWater = temp;
}

function applyWaterDistortion() {
  // Render the water ripples as subtle highlight/shadow distortion with smooth gradients
  push();
  noStroke();
  
  // Render all cells for smooth appearance
  for (let i = 1; i < waterCols - 1; i++) {
    for (let j = 1; j < waterRows - 1; j++) {
      const waterValue = currentWater[i][j];
      
      if (abs(waterValue) > 2) { // Only render significant values
        // Convert water grid position back to screen coordinates
        const x = i * WATER_CELL_SIZE;
        const y = j * WATER_CELL_SIZE;
        
        // Interpolate with neighboring cells for smoother gradients
        const avgValue = (waterValue + 
                         currentWater[i-1][j] + 
                         currentWater[i+1][j] + 
                         currentWater[i][j-1] + 
                         currentWater[i][j+1]) / 5;
        
        // Water value represents displacement - positive is raised, negative is lowered
        // Create highlight for positive (raised), shadow for negative (lowered)
        const intensity = constrain(abs(avgValue) * 0.055, 0, 20); // Higher contrast
        
        if (avgValue > 0) {
          // Raised area: white highlight with soft edges
          fill(255, 255, 255, intensity);
        } else {
          // Lowered area: dark shadow with soft edges
          fill(0, 0, 0, intensity);
        }
        
        // Draw larger soft ellipse for smoother blending between cells
        const halfCell = WATER_CELL_SIZE / 2;
        ellipse(x + halfCell, y + halfCell, WATER_CELL_SIZE * 3.0, WATER_CELL_SIZE * 3.0);
      }
    }
  }
  
  pop();
}

function drawDebugGrid() {
  push();
  
  // Grid lines every 100px
  stroke(100, 100, 100, 80); // Gray, semi-transparent
  strokeWeight(1);
  
  // Vertical lines
  for (let x = 0; x <= width; x += 100) {
    line(x, 0, x, height);
  }
  
  // Horizontal lines
  for (let y = 0; y <= height; y += 100) {
    line(0, y, width, y);
  }
  
  // Cartesian axes (brighter)
  stroke(255, 255, 0, 150); // Yellow
  strokeWeight(2);
  
  // X-axis (horizontal through center)
  line(0, height / 2, width, height / 2);
  
  // Y-axis (vertical through center)
  line(width / 2, 0, width / 2, height);
  
  // Coordinate labels
  fill(255, 255, 0);
  noStroke();
  textSize(12);
  textAlign(LEFT, TOP);
  
  // Label grid intersections every 200px
  for (let x = 0; x <= width; x += 200) {
    for (let y = 0; y <= height; y += 200) {
      // Show cartesian coordinates relative to center
      const cartX = Math.round(x - width/2);
      const cartY = Math.round(y - height/2);
      text(`(${cartX},${cartY})`, x + 5, y + 5);
    }
  }
  
  // Canvas dimensions at corners (Cartesian)
  textAlign(LEFT, TOP);
  fill(0, 255, 0);
  text(`${Math.round(-width/2)},${Math.round(-height/2)}`, 10, 10);
  
  textAlign(RIGHT, TOP);
  text(`${Math.round(width/2)},${Math.round(-height/2)}`, width - 10, 10);
  
  textAlign(LEFT, BOTTOM);
  text(`${Math.round(-width/2)},${Math.round(height/2)}`, 10, height - 10);
  
  textAlign(RIGHT, BOTTOM);
  text(`${Math.round(width/2)},${Math.round(height/2)}`, width - 10, height - 10);
  
  // Center marker
  textAlign(CENTER, CENTER);
  fill(255, 0, 0);
  text(`CENTER\n(0,0)`, width / 2, height / 2 - 30);
  
  // PERFORMANCE MONITORING
  const currentFrameTime = millis();
  if (lastFrameTime > 0) {
    const delta = currentFrameTime - lastFrameTime;
    frameDeltas.push(delta);
    if (frameDeltas.length > FRAME_HISTORY) frameDeltas.shift();
    
    // Detect issues and log to console
    if (delta > DROP_THRESHOLD) {
      droppedFrames++;
      const droppedCount = Math.floor(delta / TARGET_FRAME_TIME) - 1;
      console.error(`🚨 FRAME DROP: ~${droppedCount} frames dropped (${Math.round(delta)}ms) | Total drops: ${droppedFrames}`);
      perfWarnings.push({ time: currentFrameTime, msg: `⚠️ DROPPED ~${droppedCount} FRAMES (${Math.round(delta)}ms)`, severity: 'error' });
    } else if (delta > LAG_THRESHOLD) {
      lagSpikes++;
      console.warn(`⚡ LAG SPIKE: ${Math.round(delta)}ms frame time | Total lags: ${lagSpikes}`);
      perfWarnings.push({ time: currentFrameTime, msg: `⚡ LAG SPIKE (${Math.round(delta)}ms)`, severity: 'warn' });
    }
    
    // Keep only recent warnings (last 5 seconds)
    perfWarnings = perfWarnings.filter(w => currentFrameTime - w.time < 5000);
  }
  lastFrameTime = currentFrameTime;
  
  // Calculate average FPS
  const avgDelta = frameDeltas.length > 0 ? frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length : TARGET_FRAME_TIME;
  const currentFPS = Math.round(1000 / avgDelta);
  const minDelta = frameDeltas.length > 0 ? Math.max(...frameDeltas) : 0; // Worst frame
  
  // Display performance stats
  textAlign(LEFT, TOP);
  textSize(14);
  const fpsColor = currentFPS >= 50 ? color(0, 255, 0) : (currentFPS >= 30 ? color(255, 255, 0) : color(255, 0, 0));
  fill(fpsColor);
  text(`FPS: ${currentFPS} | Worst: ${Math.round(minDelta)}ms | Drops: ${droppedFrames} | Lags: ${lagSpikes}`, 10, 30);
  
  // Display recent warnings
  if (perfWarnings.length > 0) {
    textSize(12);
    let warnY = 50;
    for (let i = Math.max(0, perfWarnings.length - 3); i < perfWarnings.length; i++) {
      const w = perfWarnings[i];
      fill(w.severity === 'error' ? color(255, 100, 100) : color(255, 200, 100));
      text(w.msg, 10, warnY);
      warnY += 15;
    }
  }
  
  // GESTURE TYPE DISPLAY - large and prominent at top center
  textAlign(CENTER, TOP);
  textSize(32);
  if (isDragging && currentGestureType) {
    // Background box for visibility
    fill(0, 0, 0, 180);
    noStroke();
    rectMode(CENTER);
    rect(width / 2, 60, 300, 50, 10);
    
    // Gesture type text
    fill(255, 255, 0);
    text(currentGestureType, width / 2, 45);
  } else {
    currentGestureType = ""; // Clear when not dragging
  }
  textSize(12); // Reset text size
  
  // Draw cloud spawn positions
  push();
  translate(width/2, height/2); // Move origin to center for debug drawing
  
  stroke(0, 255, 255, 200); // Cyan
  strokeWeight(3);
  noFill();
  
  for (let blobId in blobStates) {
    const state = blobStates[blobId];
    if (state && state.x !== undefined && state.y !== undefined) {
      // Draw spawn position marker
      ellipse(state.x, state.y, 20, 20);
      
      // Draw cross at spawn point
      line(state.x - 10, state.y, state.x + 10, state.y);
      line(state.x, state.y - 10, state.x, state.y + 10);
      
      // Label with blob ID
      fill(0, 255, 255);
      noStroke();
      textAlign(CENTER, BOTTOM);
      textSize(10);
      text(`Blob ${blobId}\n(${Math.round(state.x)},${Math.round(state.y)})`, state.x, state.y - 15);
    }
  }
  pop();
  
  pop();
}
