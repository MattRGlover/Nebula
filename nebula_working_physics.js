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

// Orbital path system - shared path for all clouds
let sharedPathVelocity = 0.001; // Velocity along the shared orbital path (affected by vertical drags)
let targetPathVelocity = 0.001; // Target velocity to lerp toward
const BASE_PATH_VELOCITY = 0.001; // Default orbital speed (increased from 0.0003)

// 2D Water ripple simulation (based on Hugo Elias algorithm)
let waterCols;
let waterRows;
let currentWater;
let previousWater;
let dampening = 0.96; // Faster decay to prevent spreading too far
let lastDisturbanceX = -1;
let lastDisturbanceY = -1;
let maxRippleRadius = 0; // Track how far ripples should spread

console.log('🚀 NEBULA_WORKING.JS LOADED AND EXECUTING');

function setup() {
  console.log('🎨 SETUP FUNCTION CALLED');
  createCanvas(windowWidth, windowHeight);
  console.log(`📐 Canvas created: ${windowWidth}x${windowHeight}`);
  
  // Lower pixel density for better performance, especially on mobile
  pixelDensity(1);
  BASE_UNIT = Math.min(width, height);

  // Initial seed so the structure is stable until user changes it
  randomSeedValue = int(random(1000000));
  // Start with a fade-in on first load as well
  reseedTimestamp = millis();
  startTime = millis();
  
  // Initialize water ripple simulation at lower resolution for performance
  waterCols = floor(width / 8); // 1/8 resolution for better performance
  waterRows = floor(height / 8);
  currentWater = new Array(waterCols).fill(0).map(n => new Array(waterRows).fill(0));
  previousWater = new Array(waterCols).fill(0).map(n => new Array(waterRows).fill(0));
  
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

  // Apply 2D water ripple simulation
  simulateWaterRipples();
  applyWaterDistortion();
  
  // DEBUG: Draw coordinate grid and cloud positions
  if (ENABLE_DEBUG_GRID) {
    drawDebugGrid();
  }
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
  // Track mouse path for gesture analysis
  touchPath.push({x: mouseX, y: mouseY, t: millis()});
  lastDragTime = millis(); // Update last drag activity time
  
  // No longer detecting swipes during drag - will calculate once on release
  
  return false;
}

function mouseReleased() {
  const mouseEndX = mouseX;
  const mouseEndY = mouseY;
  const mouseDuration = millis() - touchStartTime;
  
  const deltaX = mouseEndX - touchStartX;
  const deltaY = mouseEndY - touchStartY;
  const distance = sqrt(deltaX * deltaX + deltaY * deltaY);
  
  console.log(`🖱️ Mouse released - Duration: ${mouseDuration}ms, Distance: ${distance.toFixed(1)}px`);
  
  // HOLD gestures (no movement)
  if (distance < 30) {
    console.log(`🖱️ HOLD DETECTED: ${mouseDuration}ms at (${touchStartX}, ${touchStartY})`);
    if (mouseDuration >= 5000) {
      // HOLD 5s: Toggle grayscale mode
      toggleGrayscaleMode();
      console.log('🖱️ ✅ Hold 5s - toggled grayscale');
    } else if (mouseDuration >= 500) {
      // HOLD 500ms: Spawn cloud
      console.log(`🎯 Calling spawnCloudAtPosition(${touchStartX}, ${touchStartY})`);
      spawnCloudAtPosition(touchStartX, touchStartY);
      console.log('🖱️ ✅ Hold 500ms - spawn complete');
    } else {
      console.log(`⏱️ Hold too short: ${mouseDuration}ms (need 500ms for spawn, 5000ms for grayscale)`);
    }
    return false;
  }
  
  // Mark drag as ended
  isDragging = false;
  
  // Calculate velocity-based momentum from entire drag gesture
  if (distance > 10 && mouseDuration > 0) {
    const velocity = distance / mouseDuration; // px/ms
    
    const horizontalStrength = abs(deltaX) / distance;
    const verticalStrength = abs(deltaY) / distance;
    
    if (horizontalStrength > verticalStrength) {
      // Horizontal drag - affects rotation
      const direction = deltaX > 0 ? 1 : -1;
      const velocityScale = constrain(velocity / 0.5, 0.1, 5.0);
      const momentumChange = direction * 6.0 * velocityScale; // Doubled sensitivity
      
      // Get current average momentum across all clouds
      let avgCurrentMomentum = 0;
      let cloudCount = 0;
      for (let blobId in blobStates) {
        avgCurrentMomentum += blobStates[blobId].targetRotation || 0;
        cloudCount++;
      }
      avgCurrentMomentum = cloudCount > 0 ? avgCurrentMomentum / cloudCount : 0;
      
      // Check if drag opposes current momentum
      if ((avgCurrentMomentum > 0.5 && momentumChange < 0) || (avgCurrentMomentum < -0.5 && momentumChange > 0)) {
        // Opposing direction - slow down toward 0 instead of reversing
        globalRotationBoost = momentumChange;
        console.log(`🛑 BRAKING: current=${avgCurrentMomentum.toFixed(1)}, brake force=${globalRotationBoost.toFixed(1)}`);
      } else {
        // Same direction or near 0 - add momentum normally
        globalRotationBoost = momentumChange;
        console.log(` Horizontal drag: velocity=${velocity.toFixed(2)} px/ms, momentum=${globalRotationBoost.toFixed(1)}`);
      }
    } else {
      // Vertical drag - affects ORBITAL PATH SPEED
      // Drag UP = increase speed, Drag DOWN = decrease speed
      const velocityScale = constrain(velocity / 0.01, 0.1, 500.0); 
      const speedChange = (deltaY < 0 ? 1 : -1) * 0.05 * velocityScale;
      
      // Add to target velocity (will be lerped)
      targetPathVelocity = constrain(targetPathVelocity + speedChange, -2.0, 2.0);
      console.log(` Vertical drag: speedChange=${speedChange.toFixed(5)}, targetVelocity=${targetPathVelocity.toFixed(5)}`);
    }
  }
  
  // Set target momentum for rotation (horizontal drags only now)
  if (globalRotationBoost !== 0) {
    for (let blobId in blobStates) {
      const state = blobStates[blobId];
      state.targetRotation = state.accumulatedRotation + globalRotationBoost;
      blobStates[blobId] = state;
    }
    console.log(`✅ Applied rotation momentum: ${globalRotationBoost.toFixed(1)}`);
    globalRotationBoost = 0;
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
  // Track path for gesture analysis
  touchPath.push({x: mouseX, y: mouseY, t: millis()});
  lastDragTime = millis(); // Update last drag activity time
  
  // No longer detecting swipes during drag - will calculate once on release
  
  return false; // Prevent default
}

function touchEnded() {
  const touchEndX = mouseX;
  const touchEndY = mouseY;
  const touchDuration = millis() - touchStartTime;
  
  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;
  const distance = sqrt(deltaX * deltaX + deltaY * deltaY);
  
  console.log(`📱 Touch ended - Duration: ${touchDuration}ms, Distance: ${distance.toFixed(1)}px`);
  
  // HOLD gestures (no movement)
  if (distance < 30) {
    console.log(`📱 HOLD DETECTED: ${touchDuration}ms at (${touchStartX}, ${touchStartY})`);
    if (touchDuration >= 5000) {
      // HOLD 5s: Toggle grayscale mode
      toggleGrayscaleMode();
      console.log('👆 ✅ Hold 5s - toggled grayscale');
    } else if (touchDuration >= 500) {
      // HOLD 500ms: Spawn cloud
      console.log(`🎯 Calling spawnCloudAtPosition(${touchStartX}, ${touchStartY})`);
      spawnCloudAtPosition(touchStartX, touchStartY);
      console.log('👆 ✅ Hold 500ms - spawn complete');
    } else {
      console.log(`⏱️ Hold too short: ${touchDuration}ms (need 500ms for spawn, 5000ms for grayscale)`);
    }
    return false;
  }
  
  // Mark drag as ended
  isDragging = false;
  
  // Calculate velocity-based momentum from entire drag gesture
  if (distance > 10 && touchDuration > 0) {
    const velocity = distance / touchDuration; // px/ms
    
    const horizontalStrength = abs(deltaX) / distance;
    const verticalStrength = abs(deltaY) / distance;
    
    if (horizontalStrength > verticalStrength) {
      // Horizontal drag - affects rotation
      const direction = deltaX > 0 ? 1 : -1;
      const velocityScale = constrain(velocity / 0.5, 0.1, 5.0);
      const momentumChange = direction * 6.0 * velocityScale; // Doubled sensitivity
      
      // Get current average momentum across all clouds
      let avgCurrentMomentum = 0;
      let cloudCount = 0;
      for (let blobId in blobStates) {
        avgCurrentMomentum += blobStates[blobId].targetRotation || 0;
        cloudCount++;
      }
      avgCurrentMomentum = cloudCount > 0 ? avgCurrentMomentum / cloudCount : 0;
      
      // Check if drag opposes current momentum
      if ((avgCurrentMomentum > 0.5 && momentumChange < 0) || (avgCurrentMomentum < -0.5 && momentumChange > 0)) {
        // Opposing direction - slow down toward 0 instead of reversing
        globalRotationBoost = momentumChange;
        console.log(`🛑 BRAKING: current=${avgCurrentMomentum.toFixed(1)}, brake force=${globalRotationBoost.toFixed(1)}`);
      } else {
        // Same direction or near 0 - add momentum normally
        globalRotationBoost = momentumChange;
        console.log(` Horizontal drag: velocity=${velocity.toFixed(2)} px/ms, momentum=${globalRotationBoost.toFixed(1)}`);
      }
    } else {
      // Vertical drag - affects ORBITAL PATH SPEED
      // Drag UP = increase speed, Drag DOWN = decrease speed
      const velocityScale = constrain(velocity / 0.025, 0.1, 200.0); // Ultra high sensitivity
      const speedChange = (deltaY < 0 ? 1 : -1) * 0.05 * velocityScale; // Much stronger effect
      
      // Add to target velocity (will be lerped)
      // Max range increased to 2.0 for extreme orbiting potential
      targetPathVelocity = constrain(targetPathVelocity + speedChange, -2.0, 2.0);
      console.log(`🌀 Vertical drag (Touch): speedChange=${speedChange.toFixed(5)}, targetVelocity=${targetPathVelocity.toFixed(5)}`);
    }
  }
  
  // Set target momentum for rotation (horizontal drags only now)
  if (globalRotationBoost !== 0) {
    for (let blobId in blobStates) {
      const state = blobStates[blobId];
      state.targetRotation = state.accumulatedRotation + globalRotationBoost;
      blobStates[blobId] = state;
    }
    console.log(`✅ Applied rotation momentum: ${globalRotationBoost.toFixed(1)}`);
    globalRotationBoost = 0;
  }
  
  return false; // Prevent default
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
    const swipePower = 6.0; // Doubled to 6.0 for consistent sensitivity
    
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
// GESTURE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════
function analyzeGesture(path) {
  if (path.length < 3) {
    return { type: 'none', direction: null, intensity: 0 };
  }
  
  // Calculate total angle change to detect circular motion
  let totalAngleChange = 0;
  let prevAngle = null;
  
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i-1].x;
    const dy = path[i].y - path[i-1].y;
    const angle = atan2(dy, dx);
    
    if (prevAngle !== null) {
      let angleDiff = angle - prevAngle;
      // Normalize to -PI to PI
      while (angleDiff > PI) angleDiff -= TWO_PI;
      while (angleDiff < -PI) angleDiff += TWO_PI;
      totalAngleChange += angleDiff;
    }
    prevAngle = angle;
  }
  
  // Detect circular motion (total angle change > 180 degrees)
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
  
  // Generate random size with WIDE variety (no size reduction multiplier)
  const baseRadius = random(BASE_UNIT * 0.10, BASE_UNIT * 0.32);
  // Add more variation: 0.5x to 1.5x for dramatic size differences
  const radius = random(baseRadius * 0.5, baseRadius * 1.5);
  
  // Pick a random hue avoiding the last spawned color
  let zone_hue;
  let attempt = 0;
  const maxHueAttempts = 10;
  const minHueDifference = 60; // Minimum 60° difference from last spawned
  
  do {
    let hueNoise = random();
    zone_hue = hueNoise * 360;
    
    // Check if different enough from last spawned cloud
    const isSimilarToLast = recentBlobHues.length > 0 && (() => {
      const lastHue = recentBlobHues[recentBlobHues.length - 1];
      let diff = Math.abs(zone_hue - lastHue);
      if (diff > 180) diff = 360 - diff;
      return diff < minHueDifference;
    })();
    
    if (!isSimilarToLast) break;
    attempt++;
  } while (attempt < maxHueAttempts);
  
  recentBlobHues.push(zone_hue);
  if (recentBlobHues.length > 3) recentBlobHues.shift();
  
  console.log(`🎨 New cloud hue: ${Math.round(zone_hue)}° (${recentBlobHues.length > 1 ? 'different from last: ' + Math.round(recentBlobHues[recentBlobHues.length - 2]) + '°' : 'first spawn'})`);
  
    // Orbital path parameters - unique ellipse for each blob
    // We calculate these first so we can adjust the center position (state.x/y)
    // to ensure the blob visually spawns exactly at the touch point
    const orbitalAngle = Math.random() * Math.PI * 2;
    const orbitalSemiMajor = BASE_UNIT * (0.15 + Math.random() * 0.25);
    const orbitalSemiMinor = BASE_UNIT * (0.08 + Math.random() * 0.15);
    const orbitalTilt = Math.random() * Math.PI;
    const orbitalPhaseOffset = Math.random() * Math.PI * 2;

    // Calculate initial orbital offset
    const orbitX = orbitalSemiMajor * Math.cos(orbitalAngle);
    const orbitY = orbitalSemiMinor * Math.sin(orbitalAngle);
    const tiltCos = Math.cos(orbitalTilt);
    const tiltSin = Math.sin(orbitalTilt);
    const initialOffsetX = orbitX * tiltCos - orbitY * tiltSin;
    const initialOffsetY = orbitX * tiltSin + orbitY * tiltCos;

    // Adjust state.x/y (the center of the orbit)
    // We place the ORBIT CENTER exactly at the touch point.
    // The cloud itself will spawn somewhere on the orbit ring around this center.
    // This matches the debug visualization where the cyan point marks the center.
    const finalX = screenX - width / 2;
    const finalY = screenY - height / 2;

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
  const timeScale = dt / 16.666;

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
  const arr_num = 120; // Reduced from 230 - less subshapes but still looks good

  // Shared one-shot life timing for all blobs
  const assembleDuration = 3000;   // ms
  const sustainDuration  = 20000;  // ms
  const fadeDuration     = 7000;   // ms
  const totalLife        = assembleDuration + sustainDuration + fadeDuration;
  const spawnInterval    = 7000;   // ms between blob spawns; with looping this yields 4+ overlaps

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
      const spawnOffset = i * spawnInterval;
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
      
      // Regenerate hue if it's too similar to the last 2 blobs
      do {
        if (hueNoise < 0.28) {
          // ~28%: warm oranges and corals (~10°..40°)
          zone_hue = pg.map(hueNoise, 0.0, 0.28, 10, 40);
        } else if (hueNoise < 0.48) {
          // ~20%: peachy pinks (~340°..360° wrapping to 0°..15°)
          const tHue = pg.map(hueNoise, 0.28, 0.48, 0, 1);
          const warm1 = pg.map(tHue, 0, 0.5, 340, 360); // late sunset sky
          const warm2 = pg.map(tHue, 0.5, 1, 0, 15);    // soft rose
          zone_hue = tHue < 0.5 ? warm1 : warm2;
        } else if (hueNoise < 0.7) {
          // ~22%: magentas and violets (~280°..330°)
          zone_hue = pg.map(hueNoise, 0.48, 0.7, 280, 330);
        } else if (hueNoise < 0.86) {
          // ~16%: sea-greens / aqua (~165°..210°), soft and slightly desaturated
          zone_hue = pg.map(hueNoise, 0.7, 0.86, 165, 210);
        } else {
          // ~14%: soft sky blues (~205°..230°) for cooler twilight accents
          zone_hue = pg.map(hueNoise, 0.86, 1.0, 205, 230);
        }
        
        // Check if this hue is too similar to the last 2 blobs (within 30 degrees)
        const isSimilarToRecent = recentBlobHues.length >= 2 && 
          recentBlobHues.slice(-2).every(recentHue => {
            let diff = Math.abs(zone_hue - recentHue);
            if (diff > 180) diff = 360 - diff; // Handle hue wrapping
            return diff < 30; // Too similar if within 30 degrees
          });
        
        if (!isSimilarToRecent) break;
        
        // Try a different hue by perturbing the noise
        hueNoise = (hueNoise + 0.237 * (attempt + 1)) % 1.0;
        attempt++;
      } while (attempt < maxHueAttempts);
      
      // Track this hue (only when first assigned)
      recentBlobHues.push(zone_hue);
      if (recentBlobHues.length > 2) recentBlobHues.shift(); // Keep only last 2

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
      // Blob size varies independently per blob with WIDE variation
      // Range from small accent clouds to large dominant washes
      let baseRadius = pg.random(BASE_UNIT * 0.10, BASE_UNIT * 0.32) * 0.9;
      // Make very first-generation blobs a bit smaller so they don't
      // dominate the early composition compared to later cycles.
      if (cycleIndex === 0) {
        baseRadius *= 0.78;
      }
      // Add even more per-blob variation: 0.6x to 1.3x
      const radius = pg.random(baseRadius * 0.6, baseRadius * 1.3);

      let zone_x, zone_y;

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
        
        // Count how many clouds are already nearby this position
        let nearbyCount = 0;
        const proximityRadius = radius * 2.5; // Check within 2.5x radius
        
        let isOverlapping = false;
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
    
    // Gradually lerp accumulated momentum toward target (very slow, no visible jumps)
    state.accumulatedRotation = timeLerp(state.accumulatedRotation, state.targetRotation, 0.02);
    
    // Calculate spin speed from base + accumulated momentum
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
    state.accumulatedDrift = timeLerp(state.accumulatedDrift, state.targetDrift, 0.02);
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
    // ORBITAL PATH SYSTEM - Each blob moves along its own elliptical orbit
    // ═══════════════════════════════════════════════════════════════════
    
    // Smoothly lerp shared path velocity toward target
    sharedPathVelocity = timeLerp(sharedPathVelocity, targetPathVelocity, 0.05);
    
    // Decay target velocity back to base when not dragging (after 3 seconds)
    if (!isDragging && (millis() - lastDragTime > 3000)) {
      targetPathVelocity = timeLerp(targetPathVelocity, BASE_PATH_VELOCITY, 0.005);
    }
    
    // Update this blob's orbital angle based on shared velocity
    // Each blob has a unique speed multiplier based on its phase offset
    const speedMultiplier = 0.7 + 0.6 * pg.sin(state.orbitalPhaseOffset); // 0.1 to 1.3x speed variation
    state.orbitalAngle += sharedPathVelocity * speedMultiplier * timeScale;
    
    // Calculate elliptical orbital position
    // x = a * cos(angle), y = b * sin(angle), then rotate by tilt
    const orbitX = state.orbitalSemiMajor * pg.cos(state.orbitalAngle);
    const orbitY = state.orbitalSemiMinor * pg.sin(state.orbitalAngle);
    
    // Apply tilt rotation to the orbital position
    const tiltCos = pg.cos(state.orbitalTilt);
    const tiltSin = pg.sin(state.orbitalTilt);
    const orbitalOffsetX = orbitX * tiltCos - orbitY * tiltSin;
    const orbitalOffsetY = orbitX * tiltSin + orbitY * tiltCos;
    
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
      let points = createShape(radius, angle_sep, pg);
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
      const jitterScale = radius * 0.15;
      const jx = (pg.noise(i * 10 + formIndex * 0.37, absoluteScaled * 0.0002) - 0.5) * 2 * jitterScale;
      const jy = (pg.noise(i * 10 + formIndex * 0.37 + 500, absoluteScaled * 0.0002) - 0.5) * 2 * jitterScale;
      pg.push();
      pg.translate(jx, jy);

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
        // Fade-out: 1 -> 0 with a gentle ease-out
        const t = (lifeTime - assembleDuration - sustainDuration) / fadeDuration; // 0..1
        const eased = t * t * (3 - 2 * t);     // smoothstep
        lifeAlpha = 1 - eased;
      } else {
        // After death: remain dark
        lifeAlpha = 0;
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
      const saturationPower = pg.lerp(0.5, 1.2, easedT);
      const minSat = pg.lerp(0.35, 0.55, easedT);
      const saturationFactor = pg.map(pg.pow(rNorm, saturationPower), 0, 1, 1.0, minSat);
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

function addWaterDisturbance(x, y) {
  // Convert screen coordinates to water grid coordinates
  const waterX = floor(x / 8);
  const waterY = floor(y / 8);
  
  // Track disturbance location and set max spread radius
  lastDisturbanceX = waterX;
  lastDisturbanceY = waterY;
  maxRippleRadius = min(waterCols, waterRows) * 0.25; // Ripples spread to 25% of grid size
  
  // Add disturbance in a small radius (like a finger press)
  const radius = 3; // Smaller radius for coarser grid
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      const wx = waterX + i;
      const wy = waterY + j;
      if (wx > 0 && wx < waterCols - 1 && wy > 0 && wy < waterRows - 1) {
        const dist = sqrt(i * i + j * j);
        if (dist <= radius) {
          // Stronger in center, weaker at edges
          const strength = (1 - dist / radius) * 1500;
          previousWater[wx][wy] = strength;
        }
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
        const x = i * 8;
        const y = j * 8;
        
        // Interpolate with neighboring cells for smoother gradients
        const avgValue = (waterValue + 
                         currentWater[i-1][j] + 
                         currentWater[i+1][j] + 
                         currentWater[i][j-1] + 
                         currentWater[i][j+1]) / 5;
        
        // Water value represents displacement - positive is raised, negative is lowered
        // Create subtle highlight for positive (raised), shadow for negative (lowered)
        const intensity = constrain(abs(avgValue) * 0.035, 0, 12); // Subtle
        
        if (avgValue > 0) {
          // Raised area: white highlight with soft edges
          fill(255, 255, 255, intensity);
        } else {
          // Lowered area: dark shadow with soft edges
          fill(0, 0, 0, intensity);
        }
        
        // Draw soft ellipse for each water cell for smoother appearance
        ellipse(x + 4, y + 4, 12, 12);
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
