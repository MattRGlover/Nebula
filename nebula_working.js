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
  attractStrength: 0.3,  // blob-blob attraction, 0..1
  repelStrength: 0.3,    // blob-blob repulsion, 0..1
};

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

function setup() {
  createCanvas(windowWidth, windowHeight);
  // Lower pixel density for better performance, especially on mobile
  pixelDensity(1);
  BASE_UNIT = Math.min(width, height);

  // Initial seed so the structure is stable until user changes it
  randomSeedValue = int(random(1000000));
  // Start with a fade-in on first load as well
  reseedTimestamp = millis();
  startTime = millis();

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
    generateWatercolorBackground(this, millis());
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
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  BASE_UNIT = Math.min(width, height);
}

function mousePressed() {
  // Do not reseed on every click anymore; interaction is via dashboard.
}

// ═══════════════════════════════════════════════════════════════════════
// MOBILE TOUCH GESTURES
// ═══════════════════════════════════════════════════════════════════════
function touchStarted() {
  touchStartX = mouseX;
  touchStartY = mouseY;
  touchStartTime = millis();
  return false; // Prevent default
}

function touchEnded() {
  const touchEndX = mouseX;
  const touchEndY = mouseY;
  const touchDuration = millis() - touchStartTime;
  
  const deltaX = touchEndX - touchStartX;
  const deltaY = touchEndY - touchStartY;
  const distance = sqrt(deltaX * deltaX + deltaY * deltaY);
  
  // Tap detection: small movement, short duration
  const isTap = distance < 30 && touchDuration < 300;
  
  // Swipe detection: significant vertical movement
  const isSwipe = distance > 50 && abs(deltaY) > abs(deltaX);
  const isSwipeDown = isSwipe && deltaY > 0;
  const isSwipeUp = isSwipe && deltaY < 0;
  
  if (isTap) {
    // TAP: Spawn a new cloud at touch position
    spawnCloudAtPosition(touchEndX, touchEndY);
    console.log('👆 Tap detected - spawning cloud');
  } else if (isSwipeDown) {
    // SWIPE DOWN: Enter grayscale mode
    if (!isGrayscaleMode) {
      toggleGrayscaleMode();
      console.log('👇 Swipe down - entering grayscale');
    }
  } else if (isSwipeUp) {
    // SWIPE UP: Exit grayscale mode (return to color)
    if (isGrayscaleMode) {
      toggleGrayscaleMode();
      console.log('👆 Swipe up - returning to color');
    }
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
// SPAWN CLOUD AT TOUCH POSITION
// ═══════════════════════════════════════════════════════════════════════
function spawnCloudAtPosition(x, y) {
  // Find next available blob ID (beyond normal 8 clouds)
  const currentTime = millis();
  const newBlobId = Object.keys(blobStates).length;
  const permanentId = nextPermanentId++;
  
  // Generate random size
  const baseRadius = random(BASE_UNIT * 0.10, BASE_UNIT * 0.32) * 0.9;
  const radius = random(baseRadius * 0.6, baseRadius * 1.3);
  
  // Pick a random hue avoiding recent colors
  let zone_hue;
  let attempt = 0;
  const maxHueAttempts = 5;
  
  do {
    let hueNoise = random();
    zone_hue = hueNoise * 360;
    
    const isSimilarToRecent = recentBlobHues.length >= 2 && 
      recentBlobHues.slice(-2).every(recentHue => {
        let diff = Math.abs(zone_hue - recentHue);
        if (diff > 180) diff = 360 - diff;
        return diff < 30;
      });
    
    if (!isSimilarToRecent) break;
    attempt++;
  } while (attempt < maxHueAttempts);
  
  recentBlobHues.push(zone_hue);
  if (recentBlobHues.length > 2) recentBlobHues.shift();
  
  // Create blob state
  const state = {
    permanentId: permanentId,
    cycleIndex: 0,
    radius: radius,
    x: x,
    y: y,
    hue: zone_hue,
    currentHue: zone_hue,
    targetHue: zone_hue,
    startHue: zone_hue,
    currentSat: isGrayscaleMode ? 0 : 100,
    targetSat: isGrayscaleMode ? 0 : 100,
    startSat: isGrayscaleMode ? 0 : 100,
    transitionStartTime: 0,
    transitionDuration: 0,
    spawnTime: currentTime // Track when manually spawned
  };
  
  blobStates[newBlobId] = state;
  
  console.log(`✨ Spawned cloud ${permanentId} at (${Math.round(x)}, ${Math.round(y)}) - Hue: ${Math.round(zone_hue)}° Radius: ${Math.round(radius)}`);
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

function generateWatercolorBackground(pg, time = 0) {
  pg.push();
  pg.colorMode(HSB, 360, 100, 100, 100);
  pg.angleMode(DEGREES);

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
  const rawElapsedSinceReseed = reseedTimestamp > 0 ? (time - reseedTimestamp) : time;
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

    // Per-blob spawn timing and life-cycle index so that each time a blob
    // loops through its life, it can appear in a new place.
    const spawnOffset   = i * spawnInterval;
    const timeSinceStart = rawElapsedSinceReseed - spawnOffset;
    const cycleIndex = timeSinceStart <= 0 ? 0 : Math.floor(timeSinceStart / totalLife);

    // Retrieve or initialize persistent state for this blob and life cycle.
    const prevState = blobStates[blobId] || { visible: 0, cycleIndex: -1 };
    let state = prevState;

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
    if (state.cycleIndex !== cycleIndex) {
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
        // attempt so that respawns get new, but stable, positions without
        // relying on the global random seed. Allow centers to drift slightly
        // beyond the canvas so blobs can grow in from the edges.
        const baseKey = i * 10 + cycleIndex * 3.17;
        const edgeMargin = radius * 0.35; // Increased from 0.25 for wider spread
        zone_x = pg.map(
          pg.noise(baseKey + attempt * 5.31),
          0,
          1,
          -edgeMargin,
          pg.width + edgeMargin
        );
        zone_y = pg.map(
          pg.noise(baseKey + 1000 + attempt * 4.79),
          0,
          1,
          -edgeMargin,
          pg.height + edgeMargin
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
      };
      blobStates[blobId] = state;
      placedSplotches.push({ x: zone_x, y: zone_y, radius: radius, hue: state.hue });
    }

    const radius = state.radius;
    const zone_x = state.x;
    const zone_y = state.y;
    
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
      if (i === 0 && frameCount % 10 === 0) {
        console.log(`📊 Saturation Transition: ${Math.round(actualSat)}% | Progress: ${Math.round(progress * 100)}% | ColorBlend: ${(actualSat/100).toFixed(2)}`);
      }
      
      // Transition complete - lock to target
      if (progress >= 1.0) {
        state.currentHue = state.targetHue;
        state.currentSat = state.targetSat;
        state.transitionDuration = 0; // Mark transition as complete
        console.log(`✅ Blob ${state.permanentId}: Transition complete at H:${Math.round(state.currentHue)}° S:${Math.round(state.currentSat)}%`);
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
    const spinSpeed = pg.map(pg.noise(i * 0.7), 0, 1, -15, 15); // deg/sec - increased from -6,6
    const splotchAngle = t * spinSpeed + i * 20;

    // Add organic drift/flow for traveling blobs
    const flowSpeed = 0.00003; // Very slow for wide, gradual cycles
    const flowScale = BASE_UNIT * 0.25; // Drift up to 25% of screen size - blobs actually travel
    const driftX = (pg.noise(i * 0.53, absoluteScaled * flowSpeed) - 0.5) * 2 * flowScale;
    const driftY = (pg.noise(i * 0.53 + 100, absoluteScaled * flowSpeed) - 0.5) * 2 * flowScale;

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
    pg.translate(zone_x + driftX, zone_y + driftY);
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
      if (i === 0 && formIndex === 0 && frameCount % 10 === 0 && state.transitionDuration > 0) {
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
