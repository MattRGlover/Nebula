let BASE_UNIT;
let randomSeedValue;
let reseedTimestamp = 0; // tracks when we last reseeded so we can fade in new fields
let blobStates = {};     // per-blob state so we can change visible subshapes gradually
let recentBlobHues = []; // track last 2 blob hues to prevent repetition
let startTime = 0;       // track when animation started

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

// Mode definitions - random transitions between states
const MODES = {
  BLACK_MULTI: { name: 'BLACK MULTI-COLOR', isBlack: true, isGray: false, isMono: false },
  BLACK_MONO: { name: 'BLACK MONO COLOR', isBlack: true, isGray: false, isMono: true },
  BLACK_GRAY: { name: 'BLACK GRAYSCALE', isBlack: true, isGray: true, isMono: true },
  WHITE_GRAY: { name: 'WHITE GRAYSCALE', isBlack: false, isGray: true, isMono: true },
  WHITE_MONO: { name: 'WHITE MONO COLOR', isBlack: false, isGray: false, isMono: true },
  WHITE_MULTI: { name: 'WHITE MULTI-COLOR', isBlack: false, isGray: false, isMono: false }
};

// Duration ranges for each mode (min, max in seconds)
const MODE_DURATION_MIN = 10000; // 10 seconds minimum
const MODE_DURATION_MAX = 20000; // 20 seconds maximum
const TRANSITION_DURATION = 3000; // 3 seconds to transition between modes

// Global mode state
let currentMode = 'BLACK_MULTI'; // Always start here
let targetMode = null;
let modeStartTime = 0;
let modeDuration = 0;
let transitionStartTime = 0;
let isTransitioning = false;
let justCrossedBridge = false; // Track if we just crossed BLACK_GRAY ↔ WHITE_GRAY

// Per-cloud color change speed: minimum time to cross color wheel
const MIN_COLOR_CHANGE_TIME = 6000; // ms - 6 seconds minimum for 180° change (slow, very smooth)

// Detect mobile for rendering adjustments
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

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

  // Console header for monitoring
  console.clear();
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🌫️  GENERATIVE NEBULA CLOUDS - MONITORING ACTIVE');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('Cycle Duration: 126 seconds | Logging every 1 second');
  console.log('Per-cloud color changes: Minimum 3 seconds for 180° (speed-limited by hue distance)');
  console.log('Format: [Time] Mode | Blend | BG | easedT | transT');
  console.log('        └─ Flags: IN_MONO | NEAR_MONO | BLACK_MONO | WHITE_MONO | GRAYSCALE');
  console.log('        └─ Sample Cloud: H(hue) S(sat) B(bright) A(alpha) | rawMonoT');
  console.log('───────────────────────────────────────────────────────────────────────────────');

  setupControls();
}

// Global debug info (set by generateWatercolorBackground)
let debugInfo = { phase: "", blend: "", bgBri: 0, elapsed: 0, cycle: 0, phaseElapsed: 0, phaseRemaining: 0, phaseDuration: 0 };

// Cloud color tracking for visual debugging
let cloudColors = []; // Array of {hue, sat, bri} for each cloud
let bgColor = { hue: 0, sat: 0, bri: 0 };

// Stable blob ID counter - each blob gets a unique permanent ID
let nextBlobId = 0;

function draw() {
  background(0);

  // Use a fixed seed each frame so the underlying layout stays coherent,
  // but pass time into the generator so blobs themselves can rotate/morph.
  try {
    randomSeed(randomSeedValue);
    generateWatercolorBackground(this, millis());
    
    // Visual debug overlay - shows current mode in corner
    push();
    textAlign(LEFT, TOP);
    textSize(14);
    noStroke();
    
    // Semi-transparent background for readability
    fill(0, 0, 0, 150);
    rect(10, 10, 320, 80);
    
    // Text color based on background brightness
    if (debugInfo.bgBri > 50) {
      fill(0, 0, 0); // Dark text on light background
    } else {
      fill(255); // White text on dark background
    }
    
    text(`MODE: ${debugInfo.phase}`, 20, 20);
    text(`BLEND: ${debugInfo.blend} | BG: ${debugInfo.bgBri}`, 20, 40);
    text(`CYCLE: ${debugInfo.elapsed}s / ${debugInfo.cycle}s`, 20, 60);
    text(`PHASE: ${debugInfo.phaseElapsed}s / ${debugInfo.phaseDuration}s (${debugInfo.phaseRemaining}s left)`, 20, 80);
    pop();
    
    // Draw color wheel overlay in bottom-right corner
    drawColorWheelDebug();
    
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

function keyPressed() {
  // Allow reseed only with "N" to avoid interfering with browser reload or normal typing.
  // Also avoid triggering when the user is focused on a UI control.
  const active = document.activeElement;
  const isInputFocused = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (isInputFocused) return;

  if (key === 'n' || key === 'N') {
    randomSeedValue = int(random(1000000));
    reseedTimestamp = millis();
    blobStates = {}; // reset per-blob state on reseed so cycles restart cleanly
    recentBlobHues = []; // reset color tracking on reseed
    startTime = millis(); // restart transition
    // Prevent default so it doesn't trigger browser shortcuts.
    return false;
  }
}

// ---- Copied background generation logic from sketchdesktopreset.js, with time-based blob animation ----

function generateWatercolorBackground(pg, time = 0) {
  pg.push();
  pg.colorMode(HSB, 360, 100, 100, 100);
  pg.angleMode(DEGREES);

  // Initialize mode system on first run
  if (modeStartTime === 0) {
    modeStartTime = time;
    modeDuration = pg.random(MODE_DURATION_MIN, MODE_DURATION_MAX);
    console.log(`🌈 Starting mode: ${MODES[currentMode].name} for ${(modeDuration/1000).toFixed(1)}s`);
  }
  
  // Check if current mode duration has elapsed
  const timeInCurrentMode = time - modeStartTime;
  
  if (!isTransitioning && timeInCurrentMode >= modeDuration) {
    // Time to pick a new random mode with transition rules
    // Black↔White transitions MUST go through grayscale bridges
    let validModes = [];
    
    if (currentMode === 'BLACK_MULTI' || currentMode === 'BLACK_MONO') {
      // Black modes can go to other black modes OR BLACK_GRAY (bridge to white)
      validModes = ['BLACK_MULTI', 'BLACK_MONO', 'BLACK_GRAY'];
    } else if (currentMode === 'BLACK_GRAY') {
      // If we just crossed from WHITE_GRAY, must exit to black color modes
      // Otherwise, can go back to black modes OR cross to WHITE_GRAY
      if (justCrossedBridge) {
        validModes = ['BLACK_MULTI', 'BLACK_MONO']; // Must exit to color
      } else {
        validModes = ['BLACK_MULTI', 'BLACK_MONO', 'WHITE_GRAY'];
      }
    } else if (currentMode === 'WHITE_GRAY') {
      // If we just crossed from BLACK_GRAY, must exit to white color modes
      // Otherwise, can go to white modes OR cross back to BLACK_GRAY
      if (justCrossedBridge) {
        validModes = ['WHITE_MULTI', 'WHITE_MONO']; // Must exit to color
      } else {
        validModes = ['WHITE_MULTI', 'WHITE_MONO', 'BLACK_GRAY'];
      }
    } else if (currentMode === 'WHITE_MULTI' || currentMode === 'WHITE_MONO') {
      // White modes can go to other white modes OR WHITE_GRAY (bridge to black)
      validModes = ['WHITE_MULTI', 'WHITE_MONO', 'WHITE_GRAY'];
    }
    
    // Remove current mode from valid options
    validModes = validModes.filter(m => m !== currentMode);
    
    // Pick random from valid modes
    targetMode = validModes[Math.floor(pg.random(validModes.length))];
    transitionStartTime = time;
    isTransitioning = true;
    
    console.log(`🎯 Transitioning: ${MODES[currentMode].name} → ${MODES[targetMode].name} (${TRANSITION_DURATION/1000}s)`);
  }
  
  // Handle transition completion
  if (isTransitioning && (time - transitionStartTime) >= TRANSITION_DURATION) {
    const previousMode = currentMode;
    currentMode = targetMode;
    targetMode = null;
    isTransitioning = false;
    modeStartTime = time;
    modeDuration = pg.random(MODE_DURATION_MIN, MODE_DURATION_MAX);
    
    // Track bridge crossings to prevent bouncing
    if ((previousMode === 'BLACK_GRAY' && currentMode === 'WHITE_GRAY') ||
        (previousMode === 'WHITE_GRAY' && currentMode === 'BLACK_GRAY')) {
      justCrossedBridge = true;
      console.log(`🌉 Crossed bridge: ${MODES[previousMode].name} → ${MODES[currentMode].name}`);
    } else if (currentMode === 'BLACK_MULTI' || currentMode === 'BLACK_MONO' ||
               currentMode === 'WHITE_MULTI' || currentMode === 'WHITE_MONO') {
      // Clear flag when exiting to color modes
      justCrossedBridge = false;
    }
    
    console.log(`✨ Arrived at: ${MODES[currentMode].name} for ${(modeDuration/1000).toFixed(1)}s`);
  }
  
  // Calculate transition progress (0 = current mode, 1 = target mode)
  let transitionT = 0;
  if (isTransitioning) {
    const elapsed = time - transitionStartTime;
    transitionT = Math.min(1, elapsed / TRANSITION_DURATION);
  }
  
  // Determine current state based on mode and transition
  const activeMode = isTransitioning ? targetMode : currentMode;
  const fromMode = isTransitioning ? currentMode : currentMode;
  
  const isBlackMode = isTransitioning 
    ? pg.lerp(MODES[fromMode].isBlack ? 0 : 1, MODES[activeMode].isBlack ? 0 : 1, transitionT) < 0.5
    : MODES[activeMode].isBlack;
  const isGrayscale = isTransitioning
    ? (MODES[fromMode].isGray || MODES[activeMode].isGray)
    : MODES[activeMode].isGray;
  const isInMonoMode = isTransitioning
    ? (MODES[fromMode].isMono && MODES[activeMode].isMono)
    : MODES[activeMode].isMono;
  const isNearMonoMode = isTransitioning ? true : MODES[activeMode].isMono;
  
  // Use mode changes to pick new monochrome hue
  const cycleNumber = Math.floor(modeStartTime / 30000); // Change hue every ~30s of mode time
  
  // Warhol-style monochromatic color palette
  // -1 = grayscale (no hue), others are HSB hue values
  const monochromeHues = [-1, 0, 30, 60, 120, 180, 200, 240, 280, 300, 330]; // Grayscale, Red, Orange, Yellow, Green, Cyan, Sky, Blue, Purple, Magenta, Pink
  
  // Use seeded random to pick consistent monochrome settings for this cycle
  // Save random state before changing it
  const savedSeed = randomSeedValue;
  pg.randomSeed(cycleNumber * 12345);
  
  // Pick mother hue (or -1 for grayscale)
  const randomIndex = Math.floor(pg.random(monochromeHues.length));
  const currentMonochromeHue = monochromeHues[randomIndex];
  
  // For white monochrome (color), randomly choose variant A or B
  // A = light desaturated bg + saturated clouds
  // B = saturated tinted bg + lighter clouds
  const whiteMonoVariant = pg.random() > 0.5 ? 'A' : 'B';
  
  // Restore original random seed so noise calculations remain stable
  pg.randomSeed(savedSeed);
  pg.noiseSeed(savedSeed);
  
  // Background transition follows mode transitions (0 = black, 1 = white)
  // During BLACK_GRAY → WHITE_GRAY or WHITE_GRAY → BLACK_GRAY, smoothly transition background
  let easedT;
  if (isTransitioning && 
      ((currentMode === 'BLACK_GRAY' && targetMode === 'WHITE_GRAY') ||
       (currentMode === 'WHITE_GRAY' && targetMode === 'BLACK_GRAY'))) {
    // Transitioning across the grayscale bridge - smoothly transition background
    if (currentMode === 'BLACK_GRAY') {
      easedT = transitionT; // 0 → 1 (black to white)
    } else {
      easedT = 1 - transitionT; // 1 → 0 (white to black)
    }
  } else {
    // Normal: snap to black or white based on mode
    easedT = isBlackMode ? 0 : 1;
  }
  const bgTransitionT = easedT;
  const bgEasedT = easedT;
  
  // Derive mono mode flags from current/target modes
  const isBlackMonoMode = isBlackMode && (isInMonoMode || isNearMonoMode);
  const isWhiteMonoMode = !isBlackMode && (isInMonoMode || isNearMonoMode);

  // Lock global evolution speed to real time (no globalTime scaling)
  const absoluteScaled = time; // ms since start
  const rawElapsedSinceReseed = reseedTimestamp > 0 ? (time - reseedTimestamp) : time;
  const reseedElapsedScaled = rawElapsedSinceReseed;

  pg.blendMode(pg.BLEND);
  
  // Background colors based on mode
  let bgHue, bgSat, bgBri;
  
  if (isBlackMonoMode && isNearMonoMode) {
    // BLACK MONOCHROME (phases 2-4)
    // Background stays black regardless of mono/grayscale
    const normalHue = 0;
    const normalSat = 0;
    const normalBri = 0;
    
    // Always use smooth lerp - monoT will be 0 at mono center, 1 at edges
    const monoT = Math.abs(bgEasedT - 0.5) * 2; // Use slower bg timing
    bgHue = pg.lerp(0, normalHue, monoT);
    bgSat = pg.lerp(0, normalSat, monoT);
    bgBri = pg.lerp(0, normalBri, monoT);
    
  } else if (isWhiteMonoMode && isNearMonoMode) {
    // WHITE MONOCHROME (phases 6-8)
    // Background depends on color/grayscale and variant
    const normalHue = pg.lerp(0, 40, bgEasedT); // Use slower bg timing for transitions
    const normalSat = pg.lerp(0, 8, bgEasedT);
    const normalBri = pg.lerp(0, 88, bgEasedT);
    
    if (isGrayscale) {
      // Grayscale: light to dark background depending on black vs white side
      const monoT = Math.abs(bgEasedT - 0.5) * 2;
      bgHue = pg.lerp(0, normalHue, monoT);
      bgSat = pg.lerp(0, normalSat, monoT);
      // Black grayscale uses low brightness, white grayscale uses high brightness
      const grayBgBri = isBlackMode ? 0 : 82;
      bgBri = pg.lerp(grayBgBri, normalBri, monoT);
    } else {
      // Color white mono: variant A or B
      // Always use smooth lerp - monoT will be 0 at mono center, 1 at edges
      const monoT = Math.abs(bgEasedT - 0.5) * 2; // Slower bg timing
      
      if (whiteMonoVariant === 'A') {
        // Variant A: Medium-light desaturated background for better contrast
        bgHue = pg.lerp(currentMonochromeHue, normalHue, monoT);
        bgSat = pg.lerp(15, normalSat, monoT);
        bgBri = pg.lerp(75, normalBri, monoT);
      } else {
        // Variant B: Light saturated background (like white multi) with MULTIPLY blend
        bgHue = pg.lerp(currentMonochromeHue, normalHue, monoT);
        bgSat = pg.lerp(20, normalSat, monoT); // More saturation than A
        bgBri = pg.lerp(78, normalBri, monoT); // Light enough for MULTIPLY
      }
    }
    
  } else {
    // NORMAL MULTI-COLOR MODES (black or white)
    // Use slower background timing for smoother transitions
    bgHue = pg.lerp(0, 35, bgEasedT);
    bgSat = pg.lerp(0, 12, bgEasedT);
    bgBri = pg.lerp(0, 80, bgEasedT); // Darker for better cloud contrast with MULTIPLY
  }
  
  pg.background(bgHue, bgSat, bgBri);
  
  // Capture background color for visual debugging
  bgColor = { hue: bgHue, sat: bgSat, bri: bgBri };
  
  // Reset cloud colors array for this frame
  cloudColors = [];
  
  // Blend mode: ADD for black backgrounds, MULTIPLY for white backgrounds
  // Use BLEND mode during transitions to keep clouds visible
  if (isBlackMonoMode && isNearMonoMode) {
    // BLACK MONOCHROME: always ADD
    pg.blendMode(pg.ADD);
  } else if (isWhiteMonoMode && isNearMonoMode) {
    // WHITE MONOCHROME: both variants use MULTIPLY like white multi-color
    pg.blendMode(pg.MULTIPLY); // MULTIPLY for light backgrounds
  } else if (easedT < 0.40) {
    // Black multi-color and early transition: ADD
    pg.blendMode(pg.ADD);
  } else if (easedT > 0.60) {
    // White multi-color and late transition: MULTIPLY
    pg.blendMode(pg.MULTIPLY);
  } else {
    // Middle transition zone (0.40-0.60): use BLEND for smooth switch
    pg.blendMode(pg.BLEND);
  }
  
  // Track blend mode for alpha adjustments (0 = ADD, 1 = MULTIPLY)
  const blendModeT = transitionT < 0.5 ? 0 : 1;
  
  // DEBUG: Determine current mode name for display
  let currentPhaseName = isTransitioning 
    ? `→ ${MODES[targetMode].name}`
    : MODES[currentMode].name;
  
  let currentBlendMode = "";
  
  // Track blend mode
  if (pg.drawingContext.globalCompositeOperation === 'lighter') {
    currentBlendMode = "ADD";
  } else if (pg.drawingContext.globalCompositeOperation === 'multiply') {
    currentBlendMode = "MULTIPLY";
  } else {
    currentBlendMode = "BLEND";
  }
  
  // Calculate time remaining in current mode for debug display
  const phaseElapsed = isTransitioning 
    ? (time - transitionStartTime) 
    : (time - modeStartTime);
  const phaseDuration = isTransitioning ? TRANSITION_DURATION : modeDuration;
  const phaseRemaining = phaseDuration - phaseElapsed;
  
  // Store debug info for overlay
  debugInfo = {
    phase: currentPhaseName,
    blend: currentBlendMode,
    bgBri: Math.round(bgBri),
    elapsed: Math.floor((time - startTime) / 1000),
    cycle: 0, // No fixed cycle anymore
    phaseElapsed: Math.floor(phaseElapsed / 1000),
    phaseRemaining: Math.floor(phaseRemaining / 1000),
    phaseDuration: Math.floor(phaseDuration / 1000)
  };
  
  const numSplotches = 8; // More manageable count (was 12, reduced for less stress)
  const arr_num = 150; // Good detail level (was 180, slightly reduced)
  
  // Mobile: reduce opacity modulation depth for smoother appearance
  if (isMobile && params.opacityDepth > 0.5) {
    params.opacityDepth = 0.5; // Less flickering on mobile
  }

  // Shared one-shot life timing for all blobs (DYNAMIC - slow, graceful evolution)
  const assembleDuration = 4000;   // ms (was 2500 - slower, more gradual birth)
  const sustainDuration  = 14000;  // ms (longer dance)
  const fadeDuration     = 5000;   // ms (was 3500 - slower, more graceful fadeout)
  const totalLife        = assembleDuration + sustainDuration + fadeDuration; // 23s total (was 20s)
  const spawnInterval    = 3000;   // ms between blob spawns (graceful pacing)

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
    // Per-blob spawn timing and life-cycle index so that each time a blob
    // loops through its life, it can appear in a new place.
    const spawnOffset   = i * spawnInterval;
    const timeSinceStart = rawElapsedSinceReseed - spawnOffset;
    const cycleIndex = timeSinceStart <= 0 ? 0 : Math.floor(timeSinceStart / totalLife);

    // Use slot index as key, but assign permanent IDs to new blobs
    const slotKey = `slot_${i}`;
    const prevState = blobStates[slotKey] || { visible: 0, cycleIndex: -1 };
    let state = prevState;
    
    // Assign a permanent unique ID and variation values when blob is first created
    if (state.permanentId === undefined) {
      state.permanentId = nextBlobId++;
      // Store permanent variation values so they never change
      state.blobVariation = pg.noise(state.permanentId * 123.45, 0);
      state.particleVariationBase = state.permanentId * 0.1;
      // Store when this blob was born for per-blob transition timing
      state.birthTime = time;
    }
    const blobId = state.permanentId; // Use permanent ID for color calculations

    // Stable per-blob hue (no time component) so each splotch keeps a
    // consistent color over its life. Use a richer "Malibu sunset"
    // palette: oranges, corals, pinks, magentas, violets, sea-greens,
    // and soft sky blues. Avoid harsh, electric greens.
    
    // Only assign a new hue if this blob doesn't already have one
    if (state.hue === undefined) {
      let hueNoise = pg.noise(blobId * 0.71);
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
        
        // Check if this hue is too similar to the last 4 blobs (within 45 degrees)
        const isSimilarToRecent = recentBlobHues.length > 0 && 
          recentBlobHues.some(recentHue => {
            let diff = Math.abs(zone_hue - recentHue);
            if (diff > 180) diff = 360 - diff; // Handle hue wrapping
            return diff < 45; // Too similar if within 45 degrees (increased from 30)
          });
        
        if (!isSimilarToRecent) break;
        
        // Try a different hue by perturbing the noise
        hueNoise = (hueNoise + 0.237 * (attempt + 1)) % 1.0;
        attempt++;
      } while (attempt < maxHueAttempts);
      
      // Track this hue (only when first assigned)
      recentBlobHues.push(zone_hue);
      if (recentBlobHues.length > 4) recentBlobHues.shift(); // Keep last 4 (was 2)

      state.hue = zone_hue;
    }
    
    // Always save state to ensure permanentId and variations are persisted
    blobStates[slotKey] = state;

    // When we enter a new life cycle, choose a new radius and center once,
    // and then reuse them every frame so the blob doesn't drift mid-life.
    if (state.cycleIndex !== cycleIndex) {
      // Blob size varies independently per blob; slightly larger fields
      // overall so color washes feel broader, but still with variety.
      // Blob 0 gets a fixed medium size, others get random sizes
      let baseRadius, radius;
      if (i === 0) {
        radius = BASE_UNIT * 0.18; // Fixed medium size for blob 0
      } else {
        // Wider size range for more variation: small to very large clouds
        baseRadius = pg.random(BASE_UNIT * 0.10, BASE_UNIT * 0.32) * 0.9;
        // Make very first-generation blobs a bit smaller so they don't
        // dominate the early composition compared to later cycles.
        if (cycleIndex === 0) {
          baseRadius *= 0.78;
        }
        // More random variation within each blob's range
        radius = pg.random(baseRadius * 0.7, baseRadius * 1.25);
      }

      let zone_x, zone_y;

      // First blob (i=0) is ALWAYS dead center, others near center
      if (i === 0) {
        // First blob: exactly at center, always
        zone_x = pg.width / 2;
        zone_y = pg.height / 2;
      } else if (i < 3) {
        // Blobs 1-2: spread far from center to respect 35% min spacing
        const angleOffset = (i * 120 + cycleIndex * 40) % 360;
        const radiusOffset = BASE_UNIT * 0.40; // 40% offset to ensure 35%+ separation from center blob
        zone_x = pg.width / 2 + pg.cos(angleOffset) * radiusOffset;
        zone_y = pg.height / 2 + pg.sin(angleOffset) * radiusOffset;
      } else {
        // Other blobs use standard placement logic
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // Use noise-based sampling keyed by blob index, life-cycle index, and
          // attempt so that respawns get new, but stable, positions without
          // relying on the global random seed. Allow centers to drift slightly
          // beyond the canvas so blobs can grow in from the edges.
          const baseKey = i * 10 + cycleIndex * 3.17;
          const edgeMargin = radius * 0.25;
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
          let isOverlapping = false;
          for (const s of placedSplotches) {
            const d = pg.dist(zone_x, zone_y, s.x, s.y);

            // Enforce minimum separation of 40% of screen size to prevent formless blobs
            const minSeparation = BASE_UNIT * 0.40;
            
            // Avoid stacking blobs with very similar hues directly on top
            // of each other: if hues are close, enforce a larger minimum
            // separation so same-colored blobs form separate fields. Also
            // give extra space to near-complementary hues that can mix
            // toward gray when heavily layered.
            let hueDiff = Math.abs(state.hue - s.hue);
            if (hueDiff > 180) hueDiff = 360 - hueDiff;
            const sameHue = hueDiff < 25;       // very similar hues
            const complementary = hueDiff > 140 && hueDiff < 220; // near opposites - mix to brown/gray
            // Same-hue and complementary colors get LARGE separation to prevent formless masses
            const sepFactor = sameHue ? 1.0 : complementary ? 1.3 : 0.65;

            // Check both blob radius-based spacing AND minimum 10% screen separation
            const radiusBasedSep = (radius + s.radius) * sepFactor;
            const requiredSep = Math.max(radiusBasedSep, minSeparation);
            
            if (d < requiredSep) {
              isOverlapping = true;
              break;
            }
          }
          if (!isOverlapping) {
            break;
          }
        }
      }

      // Calculate destination point for this lifecycle (where blob will drift to)
      let decay_x, decay_y;
      if (i === 0) {
        // Blob 0 stays at center
        decay_x = zone_x;
        decay_y = zone_y;
      } else {
        // Other blobs drift to a different point - longer, more flowing movement
        const driftAngle = pg.noise(i * 7.53 + cycleIndex * 2.91) * 360;
        const driftDist = pg.map(pg.noise(i * 3.17 + cycleIndex * 5.43), 0, 1, BASE_UNIT * 0.15, BASE_UNIT * 0.4);
        decay_x = zone_x + pg.cos(driftAngle) * driftDist;
        decay_y = zone_y + pg.sin(driftAngle) * driftDist;
      }
      
      state = {
        ...state,
        cycleIndex,
        radius,
        x: zone_x,
        y: zone_y,
        decayX: decay_x,
        decayY: decay_y,
      };
      blobStates[slotKey] = state;
      placedSplotches.push({ x: zone_x, y: zone_y, radius: radius, hue: state.hue });
    }

    const radius = state.radius;
    const origin_x = state.x;
    const origin_y = state.y;
    const decay_x = state.decayX || origin_x;
    const decay_y = state.decayY || origin_y;
    const zone_hue = state.hue;
    
    // Calculate lifeTime FIRST so we can use it for drift
    const lifeTime = timeSinceStart <= 0 ? 0 : (timeSinceStart % totalLife);
    const lifeT = lifeTime / totalLife;
    
    // Purposeful drift from origin to decay point over blob's lifetime
    const driftProgress = pg.constrain(lifeT, 0, 1);
    const easedDrift = driftProgress * driftProgress * (3 - 2 * driftProgress); // smoothstep
    const driftX = pg.lerp(0, decay_x - origin_x, easedDrift);
    const driftY = pg.lerp(0, decay_y - origin_y, easedDrift);

    let arr = [];

    // Animate each splotch:
    // - rotation (unique speed per splotch)
    // - pulsing (unique rate/amplitude per splotch)
    const t = absoluteScaled * 0.0005; // global time in seconds-ish

    // Unique spin speed and direction per splotch - slower, more graceful rotation
    const spinSpeed = pg.map(pg.noise(i * 0.7), 0, 1, -12, 12); // deg/sec - slow, fluid rotation
    const splotchAngle = t * spinSpeed + i * 20;

    // Per-splotch size pulsing: DYNAMIC VERSION with gentler breathing
    let pulse = 1;
    if (params.sizeFxEnabled) {
      const basePulseAmt = pg.map(pg.noise(i * 1.1 + 1500), 0, 1, 0.10, 0.25); // base depth (was 0.15-0.35 - less dramatic)
      const pulseAmp = basePulseAmt * params.sizeDepth;
      const sizePhase = absoluteScaled * params.sizeSpeed * 1.8 + i * 0.8; // 1.8x pulsing (was 2.5x)
      const sizeWave = 0.5 * (1 + pg.sin(sizePhase)); // 0..1
      const easedSize = sizeWave * sizeWave * (3 - 2 * sizeWave); // smoothstep
      const signedWave = (easedSize - 0.5) * 2; // -1..1
      pulse = 1 + pulseAmp * signedWave;
    }

    pg.push();
    pg.translate(origin_x + driftX, origin_y + driftY);
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
    // Note: lifeTime and drift calculations moved to top of blob rendering

    // FREEZE LIFECYCLE DURING MODE TRANSITIONS
    // Prevent blobs from spawning or dying during transitions to avoid solid geometry artifacts
    let frozenLifeTime = lifeTime;
    if (isTransitioning && state.frozenLifeTime !== undefined) {
      // Use frozen life time during transition
      frozenLifeTime = state.frozenLifeTime;
    } else if (!isTransitioning) {
      // Not transitioning - update frozen snapshot for next transition
      state.frozenLifeTime = lifeTime;
    } else if (isTransitioning && state.frozenLifeTime === undefined) {
      // First frame of transition - freeze current state
      state.frozenLifeTime = lifeTime;
      frozenLifeTime = lifeTime;
    }

    // Use the same lifeT to derive a target geometry count. We keep
    // this simple and let later smoothing enforce the 3-subshape-per-
    // frame pacing.
    let targetVisibleForms = 0;
    if (frozenLifeTime <= 0) {
      targetVisibleForms = 0;
    } else if (frozenLifeTime < assembleDuration) {
      // Assembly phase: ramp 0 -> full
      // Blob 0 assembles instantly for immediate visual impact
      if (i === 0) {
        targetVisibleForms = arr_num; // Instant full appearance
      } else {
        const t = frozenLifeTime / assembleDuration; // 0..1
        targetVisibleForms = pg.floor(pg.map(t, 0, 1, 0, arr_num));
      }
    } else if (frozenLifeTime < assembleDuration + sustainDuration) {
      // Sustain: full geometry
      targetVisibleForms = arr_num;
    } else if (frozenLifeTime < totalLife) {
      // Fade/undraw: ramp full -> 0
      const t = (frozenLifeTime - assembleDuration - sustainDuration) / fadeDuration; // 0..1
      targetVisibleForms = pg.floor(pg.map(t, 0, 1, arr_num, 0));
    } else {
      // After death: stay at 0 geometry
      targetVisibleForms = 0;
    }

    // Smooth the change in visible form count so we never add/remove
    // too many forms in a single frame. This makes both assembly and
    // disassembly feel like individual strokes being laid down or
    // erased, rather than chunks popping in/out.
    // EXCEPT blob 0 which appears instantly
    const prevStateForVisible = blobStates[blobId] || state || { visible: 0 };
    let newVisible;
    
    if (i === 0) {
      // Blob 0: no smoothing, instant appearance
      newVisible = targetVisibleForms;
    } else {
      // Other blobs: smooth assembly/disassembly
      const maxStepPerFrame = 3; // add/remove at most 3 subshapes per frame
      const diff = targetVisibleForms - prevStateForVisible.visible;
      newVisible = prevStateForVisible.visible;
      if (diff > 0) {
        newVisible += Math.min(diff, maxStepPerFrame);
      } else if (diff < 0) {
        newVisible += Math.max(diff, -maxStepPerFrame);
      }
      newVisible = pg.constrain(newVisible, 0, arr_num);
    }
    
    // Update and save state to ensure transition timing and visibility are persisted
    state.visible = newVisible;
    blobStates[slotKey] = state;
    
    const maxVisibleForms = newVisible;
    
    // PRE-DETERMINE target colors ONCE per blob (outside particle loop)
    // This ensures all particles in the blob transition to the same target
    const blobVariation = state.blobVariation; // Stored at blob creation
    
    // Track the base hue for rotation (initially zone_hue, updated after mono transitions)
    if (state.rotationBaseHue === undefined) {
      state.rotationBaseHue = zone_hue;
    }
    
    // ALWAYS calculate rotating hue first (even during mono modes)
    const HUE_ROTATION_SPEED = 360 / 60000; // degrees per millisecond (60s per full rotation)
    const hueOffset = (time * HUE_ROTATION_SPEED) % 360;
    let blobCurrentHue = (state.rotationBaseHue + hueOffset) % 360;
    
    // Per-blob transition timing: track when THIS transition phase started for this blob
    // Include isGrayscale in the key so grayscale bridge forces re-initialization
    const currentPhaseKey = `${isBlackMonoMode ? 'black' : 'white'}_${isGrayscale ? 'gray' : currentMonochromeHue}`;
    
    // Initialize targets if we're in mono mode but targets aren't set (for newly spawned blobs)
    const needsInitialization = isNearMonoMode && (state.targetHue === undefined || state.lastPhaseKey !== currentPhaseKey);
    
    if (needsInitialization) {
      // New phase OR new blob - pre-determine target color ONCE for entire blob
      if (isGrayscale) {
        // Grayscale: target is desaturation (no hue change)
        // Use isGrayscale (forced during phases 4-7) not currentMonochromeHue
        state.targetHue = blobCurrentHue; // Keep current hue, just desaturate
        state.targetSat = 0;
        
        // Target brightness depends on black/white mode (blob-level variation only)
        if (isBlackMonoMode) {
          // BLACK grayscale: SAFE low brightness for ADD blend mode
          state.targetBrightness = pg.map(blobVariation, 0, 1, 38, 48);
          state.targetBrightness = pg.constrain(state.targetBrightness, 35, 50);
        } else {
          // WHITE grayscale: higher brightness for MULTIPLY blend mode
          state.targetBrightness = pg.map(blobVariation, 0, 1, 8, 40);
          state.targetBrightness = pg.constrain(state.targetBrightness, 3, 50);
        }
      } else {
        // Monochromatic color: mother hue ± variation
        const hueVariation = pg.map(blobVariation, 0, 1, -10, 10);
        state.targetHue = (currentMonochromeHue + hueVariation + 360) % 360;
        
        // Target saturation and brightness depend on mode and variant
        if (isBlackMonoMode) {
          state.targetSat = pg.map(blobVariation, 0, 1, 75, 100);
          state.targetSat = pg.constrain(state.targetSat, 65, 100);
          // BLACK mono color: SAFE low brightness for ADD blend mode
          state.targetBrightness = pg.map(blobVariation, 0, 1, 38, 48);
          state.targetBrightness = pg.constrain(state.targetBrightness, 35, 50);
        } else {
          if (whiteMonoVariant === 'A') {
            state.targetSat = pg.map(blobVariation, 0, 1, 80, 100);
            state.targetSat = pg.constrain(state.targetSat, 70, 100);
            state.targetBrightness = pg.map(blobVariation, 0, 1, 60, 95);
            state.targetBrightness = pg.constrain(state.targetBrightness, 55, 98);
          } else {
            state.targetSat = pg.map(blobVariation, 0, 1, 70, 100);
            state.targetSat = pg.constrain(state.targetSat, 60, 100);
            state.targetBrightness = pg.map(blobVariation, 0, 1, 85, 100);
            state.targetBrightness = pg.constrain(state.targetBrightness, 80, 100);
          }
        }
      }
      
      // Calculate shortest hue path from current to target
      // Use the LAST RENDERED values (if available) as starting point, not recalculated base values
      // This prevents color jumps/resaturation when transitioning between phases
      const actualCurrentHue = state.lastRenderedHue !== undefined ? state.lastRenderedHue : blobCurrentHue;
      const actualCurrentSat = state.lastRenderedSat !== undefined ? state.lastRenderedSat : saturation;
      // CRITICAL: Use SAFE fallback brightness for black modes to prevent white geometric edges
      const safeFallbackBri = isBlackMode ? 55 : 96;
      const actualCurrentBri = state.lastRenderedBrightness !== undefined ? state.lastRenderedBrightness : safeFallbackBri;
      
      let hueDiff = state.targetHue - actualCurrentHue;
      if (hueDiff > 180) hueDiff -= 360;
      if (hueDiff < -180) hueDiff += 360;
      state.targetHueDiff = hueDiff;
      
      // Store starting color for smooth interpolation
      state.startHue = actualCurrentHue;
      state.startSat = actualCurrentSat;
      state.startBrightness = actualCurrentBri;
      
      // Log the predetermined target color
      console.log(`🎨 BLOB ${blobId} → ${currentPhaseName}`);
      console.log(`   Current (rendered): H${Math.round(actualCurrentHue)}°`);
      console.log(`   Target:  H${Math.round(state.targetHue)}° S${Math.round(state.targetSat)}% B${Math.round(state.targetBrightness)}%`);
      console.log(`   Path:    ${hueDiff > 0 ? '+' : ''}${Math.round(hueDiff)}° over ${Math.max(MIN_COLOR_CHANGE_TIME/1000, (Math.abs(hueDiff)/180) * (MIN_COLOR_CHANGE_TIME/1000)).toFixed(1)}s`);
      
      // Reset transition timer to current time
      state.transitionStartTime = time;
      state.lastPhaseKey = currentPhaseKey;
    }
    
    // Calculate transition progress (outside particle loop) - clamp to 0 minimum
    const transitionElapsed = Math.max(0, time - (state.transitionStartTime || time));
    
    // Flag to capture this blob's color once per frame (even if not fully visible yet)
    let colorCapturedForThisBlob = false;

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

      // Alpha transitions smoothly with the ACTUAL background transition
      // Use easedT (same as background) for perfectly synchronized changes
      const alphaT = easedT; // 0 = black bg, 1 = white bg (already has smoothstep easing)
      
      // Use alphaT directly - easedT already has smooth easing
      const extraSmoothAlpha = alphaT;
      
      // Saturation curve is no longer used - monochrome phases handle color directly
      // Keep at 1.0 for normal black/white phases
      let saturationCurve = 1.0;
      
      // Alpha: smoothly transition between modes
      let baseAlpha;
      if (isNearMonoMode) {
        // Monochrome mode: alpha depends on black/white and color/grayscale
        let monoAlpha;
        
        if (isBlackMonoMode) {
          // BLACK MONOCHROME: standard alpha for both color and grayscale
          monoAlpha = 1.0;
        } else if (isWhiteMonoMode) {
          // WHITE MONOCHROME: grayscale needs higher alpha than color
          if (isGrayscale) {
            monoAlpha = 1.6; // Dark grays on light bg need more opacity
          } else if (whiteMonoVariant === 'A') {
            monoAlpha = 1.3; // Higher alpha for saturated clouds on medium bg (MULTIPLY mode)
          } else {
            monoAlpha = 0.8; // Lower alpha for variant B with ADD mode on dark bg
          }
        } else {
          // Default during transitions
          monoAlpha = 1.0;
        }
        
        // Calculate how far into the transition we are (0 at edges, 1 at center)
        const transitionProgress = 1 - Math.abs(easedT - 0.5) * 2;
        
        // Interpolate alpha based on which side of the cycle - use linear for visible changes
        const normalAlpha = alphaT < 0.5 ? 1.0 : 1.1;
        baseAlpha = pg.lerp(normalAlpha, monoAlpha, transitionProgress) * (100 / arr_num);
        
      } else if (alphaT < 0.5) {
        // Black/ADD phase: stay at 1.0
        baseAlpha = 1.0 * (100 / arr_num);
      } else {
        // White/MULTIPLY phase: balanced at 1.1 for detail without blinding
        const whiteT = (alphaT - 0.5) * 2;
        baseAlpha = pg.lerp(1.0, 1.1, whiteT) * (100 / arr_num);
      }
      
      // Apply saturation - boost white mode for more vibrancy
      // Smoothly transition saturation between black and white modes
      let baseSat;
      if (isNearMonoMode) {
        // Monochrome: saturation will be overridden later
        baseSat = pg.lerp(94, 100, alphaT);
      } else {
        // Normal black/white: smooth saturation transition - linear for visible changes
        baseSat = pg.lerp(94, 100, alphaT);
      }

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

      // Per-sub-shape opacity wave: DYNAMIC VERSION with more active flickering
      // Each form gets its own local speed and phase based on noise so timing is desynchronized.
      let fadeFactor = 1;
      if (params.opacityFxEnabled) {
        const noiseSeed = i * 5.17 + formIndex * 3.41;
        // DYNAMIC: Moderate local speed for gentle shimmer
        const localSpeed = params.opacitySpeed * 1.3 * pg.noise(noiseSeed);
        const phaseOffset = pg.noise(noiseSeed + 1000) * pg.TWO_PI;

        const fadePhase  = time * localSpeed + phaseOffset;
        const wave       = 0.5 * (1 + pg.sin(fadePhase));  // pure sine, 0..1

        // When opacityDepth=0 -> always 1; when =1 -> full 0..1 range across 0..1 wave
        fadeFactor = 1 - params.opacityDepth * (1 - wave);

        // For very dim blobs (birth/death), damp modulation based on lifeAlpha so entry/exit
        // feels smooth and not flickery. lifeAlpha is 0..1 across the entire bell.
        const dimFactor = pg.constrain(lifeAlpha / 0.3, 0, 1); // 0 when very dim, 1 once fairly bright
        fadeFactor = 1 - (1 - fadeFactor) * dimFactor;

        // DYNAMIC: Lower minimum for more dramatic opacity variation
        // Mobile: higher minimum for smoother, less jumpy appearance
        const minFade = isMobile ? 0.55 : 0.35;
        fadeFactor = minFade + (1 - minFade) * fadeFactor;
      }

      // Radial attenuation so centers stay softer: reduce opacity near
      // the blob origin and let it build slightly toward a mid-ring,
      // then fall off toward the edge. This mimics watercolor pooling.
      const distFromCenter = pg.sqrt(jx * jx + jy * jy);
      const rNorm = pg.constrain(distFromCenter / radius, 0, 1); // 0 at center, 1 at approx edge
      const midRing = rNorm * (1 - rNorm); // 0 at center/edge, peak ~0.25 at rNorm=0.5
      // Mobile: softer radial falloff for more feathered edges (0.65 instead of 0.5)
      const centerOpacity = isMobile ? 0.65 : 0.5;
      const radialFactor = pg.map(midRing, 0, 0.25, centerOpacity, 1.0);

      // Radial saturation gradient with per-particle variation for internal structure
      // Black: pow(rNorm, 0.5) - concentrated center but not too tight
      // White: pow(rNorm, 1.4) - very gentle falloff, colors stay vibrant to edges
      // Mobile: even gentler falloff for softer edges
      const saturationPower = isMobile ? pg.lerp(0.7, 1.6, easedT) : pg.lerp(0.5, 1.4, easedT);
      // White phase: keep 75% saturation at edges for more vibrancy (was 55%)
      const minSat = isMobile ? pg.lerp(0.40, 0.80, easedT) : pg.lerp(0.35, 0.75, easedT);
      const saturationFactor = pg.map(pg.pow(rNorm, saturationPower), 0, 1, 1.0, minSat);
      // Add radial-dependent per-particle variation for more internal detail
      const radialVariation = pg.noise(formIndex * 3.7 + i * 1.9, rNorm * 5.0);
      const satVariation = pg.map(radialVariation, 0, 1, -0.15, 0.15); // ±15% based on radius
      let saturation = baseSat * saturationFactor * (1 + satVariation);

      // Final alpha combines: baseAlpha * blob life envelope * local opacity FX * global reseed fade-in * radial
      let alpha = baseAlpha * lifeAlpha * fadeFactor * reseedFade * radialFactor;

      if (boldIndices.includes(i)) {
        // Make bold blobs only slightly stronger so they stand out
        // without flattening the texture.
        alpha *= 1.3; // was 2.5
        saturation = min(100, saturation * 1.05);
      }
      
      // CRITICAL: Enforce minimum alpha to ensure clouds are ALWAYS visible
      let minAlpha = 0;
      if (currentBlendMode === "MULTIPLY" && bgBri > 50) {
        minAlpha = 0.25; // Higher minimum on light backgrounds with MULTIPLY
      } else if (currentBlendMode === "ADD" && bgBri < 20) {
        minAlpha = 0.08; // Low minimum for ADD to prevent solid edges
      }
      alpha = Math.max(alpha, minAlpha);
      
      // CRITICAL: Reduce alpha in ALL black modes to prevent white geometric accumulation
      if (isBlackMode) {
        alpha *= 0.70; // Reduce by 30% to prevent white edges from overlapping particles
      }

      // White glow creates depth but must be controlled
      // ONLY show in white modes (easedT > 0.5), never in black modes
      const showGlow = easedT > 0.5 && !isBlackMode;
      
      if (showGlow) {
        // Determine glow strength based on mode
        let whiteGlowStrength;
        if (isInMonoMode) {
          whiteGlowStrength = 0.15; // Subtle for light mono mode
        } else {
          // White/MULTIPLY version: 0.15 alpha (subtle halo)
          whiteGlowStrength = 0.15;
        }
        if (whiteGlowStrength > 0.05) {
          const whiteAlpha = alpha * whiteGlowStrength;
          drawShape(form, pg.color(0, 0, 100, whiteAlpha), pg);
        }
      }
      
      // Apply Warhol-style monochromatic color during monochrome mode and transitions
      let rawMonoT = 0;
      let finalHue = blobCurrentHue; // Use blob-level rotating hue
      let finalSat = saturation;
      let brightness;
      
      if (isNearMonoMode) {
        // Simple: if in stable mono mode, rawMonoT = 1; if transitioning, use progress
        rawMonoT = isInMonoMode ? 1.0 : (isTransitioning ? transitionT : 0);
        const monoTransitionT = rawMonoT;
        const particleVariation = pg.noise(formIndex * state.particleVariationBase, 0);
        
        if (isGrayscale) {
          // Grayscale: use predetermined target from state
          // Use isGrayscale (forced during phases 4-7) not currentMonochromeHue
          // Use ONLY per-blob timing for slow, smooth desaturation
          // Scale time by saturation distance for proportional speed
          const satDistance = Math.abs((state.startSat || 100) - (state.targetSat || 0));
          const requiredTime = Math.max(MIN_COLOR_CHANGE_TIME, (satDistance / 100) * MIN_COLOR_CHANGE_TIME);
          const actualProgress = Math.min(1, transitionElapsed / requiredTime);
          
          // Use predetermined targets with particle-level variation applied to brightness only
          finalHue = state.targetHue !== undefined ? state.targetHue : blobCurrentHue;
          
          // Newly spawned blobs during stable grayscale should snap to grayscale immediately
          const isNewlySpawned = transitionElapsed < 100; // Spawned in last 100ms
          
          if (isInMonoMode && isNewlySpawned) {
            // Newly spawned during stable grayscale - snap to grayscale immediately
            finalSat = 0;
          } else if (actualProgress >= 1) {
            // Finished transition - lock at grayscale
            finalSat = 0;
          } else {
            // Transitioning to grayscale - smoothly desaturate from ACTUAL last rendered sat
            const startSat = state.startSat !== undefined ? state.startSat : saturation;
            finalSat = pg.lerp(startSat, state.targetSat || 0, actualProgress);
          }
          
          // Apply particle variation to target brightness for texture
          let targetBri = state.targetBrightness || 50;
          if (isBlackMonoMode) {
            targetBri += pg.map(particleVariation, 0, 1, -8, 8);
            targetBri = pg.constrain(targetBri, 35, 50); // SAFE range for ADD blend
          } else {
            targetBri += pg.map(particleVariation, 0, 1, -30, 30);
            targetBri = pg.constrain(targetBri, 3, 50);
          }
          // Transition brightness from ACTUAL last rendered value with SAFE fallback
          const safeFallbackBri = isBlackMode ? 55 : 96;
          const startBri = state.startBrightness !== undefined ? state.startBrightness : safeFallbackBri;
          brightness = pg.lerp(startBri, targetBri, actualProgress);
          
        } else {
          // Monochromatic color: use predetermined target from state
          // Scale time by hue distance for proportional speed (slow and smooth)
          const absHueDist = Math.abs(state.targetHueDiff || 0);
          const hueRequiredTime = Math.max(MIN_COLOR_CHANGE_TIME, (absHueDist / 180) * MIN_COLOR_CHANGE_TIME);
          
          // Also consider saturation distance for color→grayscale or grayscale→color transitions
          const satDistance = Math.abs((state.startSat || 100) - (state.targetSat || 100));
          const satRequiredTime = Math.max(MIN_COLOR_CHANGE_TIME, (satDistance / 100) * MIN_COLOR_CHANGE_TIME);
          
          // Use the longer of the two times for smoothest overall transition
          const requiredTime = Math.max(hueRequiredTime, satRequiredTime);
          const actualProgress = Math.min(1, transitionElapsed / requiredTime);
          
          // If we're in a STABLE mono phase, newly spawned blobs should snap to target immediately
          // Blobs that were alive before the phase should transition smoothly
          const isNewlySpawned = transitionElapsed < 100; // Spawned in last 100ms
          
          if (isInMonoMode && isNewlySpawned) {
            // Newly spawned during stable mono - snap to target immediately
            finalHue = state.targetHue !== undefined ? state.targetHue : blobCurrentHue;
          } else if (actualProgress >= 1) {
            // Finished transition - lock at target
            finalHue = state.targetHue !== undefined ? state.targetHue : blobCurrentHue;
          } else {
            // Transitioning to mono - interpolate smoothly
            const startHue = state.startHue !== undefined ? state.startHue : blobCurrentHue;
            finalHue = (startHue + (state.targetHueDiff || 0) * actualProgress + 360) % 360;
          }
          
          // Apply particle variation to target sat/brightness for texture
          let targetSat = state.targetSat || saturation;
          let targetBri = state.targetBrightness || 50;
          
          if (isBlackMonoMode) {
            targetSat += pg.map(particleVariation, 0, 1, -15, 15);
            targetSat = pg.constrain(targetSat, 65, 100);
            targetBri += pg.map(particleVariation, 0, 1, -8, 8);
            targetBri = pg.constrain(targetBri, 35, 50); // SAFE low brightness for ADD blend
          } else {
            if (whiteMonoVariant === 'A') {
              targetSat += pg.map(particleVariation, 0, 1, -15, 15);
              targetSat = pg.constrain(targetSat, 70, 100);
              targetBri += pg.map(particleVariation, 0, 1, -15, 15);
              targetBri = pg.constrain(targetBri, 55, 98);
            } else {
              targetSat += pg.map(particleVariation, 0, 1, -15, 15);
              targetSat = pg.constrain(targetSat, 60, 100);
              targetBri += pg.map(particleVariation, 0, 1, -10, 10);
              targetBri = pg.constrain(targetBri, 80, 100);
            }
          }
          
          // Transition sat/brightness from ACTUAL last rendered values
          // BUT: newly spawned blobs should snap to target immediately to avoid white flashes
          if (isNewlySpawned) {
            // Newly spawned during mono mode or transition - snap to target brightness/sat immediately
            // This prevents white geometric shapes from high fallback brightness values
            finalSat = targetSat;
            brightness = targetBri;
          } else if (actualProgress >= 1) {
            // Finished transition - lock at target
            finalSat = targetSat;
            brightness = targetBri;
          } else {
            // Transitioning - interpolate smoothly from last rendered values with SAFE fallbacks
            const startSat = state.startSat !== undefined ? state.startSat : saturation;
            // CRITICAL: Use target as fallback for brightness to stay in safe range
            const startBri = state.startBrightness !== undefined ? state.startBrightness : targetBri;
            finalSat = pg.lerp(startSat, targetSat, actualProgress);
            brightness = pg.lerp(startBri, targetBri, actualProgress);
          }
        }
      } else {
        // Normal colored mode: brightness depends on blend mode
        // Black ADD mode: LOW brightness (48) to prevent white accumulation
        // White MULTIPLY mode: higher brightness (96-98) for contrast
        brightness = pg.lerp(48, 98, easedT); // Safe for ADD, high for MULTIPLY
      }
      
      // Store the actual rendered color values for next transition
      // This ensures we always transition from the current state, not recalculated base values
      state.lastRenderedHue = finalHue;
      state.lastRenderedSat = finalSat;
      state.lastRenderedBrightness = brightness;
      
      // Update rotation base when exiting mono mode to prevent jumps
      // When rawMonoT becomes 0 (fully exited mono), capture current hue as new rotation base
      if (isNearMonoMode && rawMonoT < 0.05 && state.rotationBaseHue !== undefined) {
        // Exiting mono mode - update rotation base to current position
        // ADD blob-specific variation so each cloud has unique position on color wheel
        // This prevents all clouds from moving together in multi-color mode
        const HUE_ROTATION_SPEED = 360 / 60000;
        const currentOffset = (time * HUE_ROTATION_SPEED) % 360;
        const blobHueSpread = pg.map(blobVariation, 0, 1, -50, 50); // ±50° spread across color wheel
        state.rotationBaseHue = (finalHue - currentOffset + blobHueSpread + 720) % 360;
      }
      
      // Add radial-dependent brightness variation for internal structure
      // Creates depth within clouds to prevent flat, uniform masses
      const brightnessVariation = pg.noise(formIndex * 4.3 + i * 2.1, rNorm * 6.0);
      // Minimal variation in black modes to prevent white edges
      const brightVaryRange = isBlackMode ? 0.03 : 0.15;
      const brightVary = pg.map(brightnessVariation, 0, 1, -brightVaryRange, brightVaryRange * 0.5);
      // CRITICAL: Simple unified brightness cap for ALL BLACK modes to prevent white geometries
      // 48 max ensures even 3 overlapping particles (48+48+48=144→100) won't create pure white
      const maxBrightness = isBlackMode ? 48 : 100;
      brightness = pg.constrain(brightness * (1 + brightVary), 0, maxBrightness);
      
      // Sample cloud color logging (first blob, center particle for representative values)
      if (i === 0 && formIndex === Math.floor(arr_num / 2)) {
        if (!window.debugCloudLogged || Math.floor(time / 1000) !== window.debugCloudLogged) {
          const hueStr = finalHue.toFixed(0).padStart(3);
          const satStr = finalSat.toFixed(0).padStart(3);
          const briStr = brightness.toFixed(0).padStart(2);
          const alphaStr = alpha.toFixed(2).padStart(4);
          // Store for next console log cycle
          window.debugCloudData = { hue: hueStr, sat: satStr, bri: briStr, alpha: alphaStr };
          window.debugCloudLogged = Math.floor(time / 1000);
        }
      }
      
      // Capture cloud color for visual debugging (first visible particle of each blob)
      // This ensures color appears on wheel as soon as blob starts forming
      if (!colorCapturedForThisBlob) {
        cloudColors.push({ hue: finalHue, sat: finalSat, bri: brightness });
        colorCapturedForThisBlob = true;
      }
      
      drawShape(form, pg.color(finalHue, finalSat, brightness, alpha), pg);
      pg.pop();
    }
    pg.pop();
  }
  pg.pop();
}

function drawColorWheelDebug() {
  push();
  
  // Position in top-right corner
  const wheelSize = 200;
  const wheelX = width - wheelSize - 20;
  const wheelY = 20;
  const wheelRadius = wheelSize / 2;
  const centerX = wheelX + wheelRadius;
  const centerY = wheelY + wheelRadius;
  
  // Draw background circle
  fill(0, 0, 0, 180);
  noStroke();
  ellipse(centerX, centerY, wheelSize + 20, wheelSize + 20);
  
  // Draw color wheel
  colorMode(HSB, 360, 100, 100);
  for (let angle = 0; angle < 360; angle += 2) {
    const x1 = centerX + cos(angle - 90) * (wheelRadius - 20);
    const y1 = centerY + sin(angle - 90) * (wheelRadius - 20);
    const x2 = centerX + cos(angle - 90) * wheelRadius;
    const y2 = centerY + sin(angle - 90) * wheelRadius;
    
    stroke(angle, 100, 90);
    strokeWeight(3);
    line(x1, y1, x2, y2);
  }
  
  // Draw actual background color in center of wheel
  noStroke();
  fill(bgColor.hue, bgColor.sat, bgColor.bri);
  ellipse(centerX, centerY, (wheelRadius - 20) * 2 - 10, (wheelRadius - 20) * 2 - 10);
  
  // Add label for background color
  fill(bgColor.bri > 50 ? 0 : 100, 0, bgColor.bri > 50 ? 0 : 100); // Contrast text
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(11);
  text('Background', centerX, centerY - 10);
  textSize(9);
  text(`H:${Math.round(bgColor.hue)}°`, centerX, centerY + 5);
  text(`S:${Math.round(bgColor.sat)}% B:${Math.round(bgColor.bri)}%`, centerX, centerY + 18);
  
  // Draw background color marker (large circle)
  if (bgColor.sat > 5) { // Only show if background has color
    const bgAngle = bgColor.hue - 90;
    const bgX = centerX + cos(bgAngle) * (wheelRadius - 10);
    const bgY = centerY + sin(bgAngle) * (wheelRadius - 10);
    
    // Outer ring
    stroke(0, 0, 100);
    strokeWeight(3);
    noFill();
    ellipse(bgX, bgY, 20, 20);
    
    // Label
    fill(0, 0, 100);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(10);
    text('BG', bgX, bgY);
  }
  
  // Draw cloud color markers (show all clouds for better visibility of intermediate colors)
  for (let i = 0; i < cloudColors.length; i++) {
    const cloud = cloudColors[i];
    const cloudAngle = cloud.hue - 90;
    const cloudX = centerX + cos(cloudAngle) * (wheelRadius - 10);
    const cloudY = centerY + sin(cloudAngle) * (wheelRadius - 10);
    
    // Dot colored with actual cloud color
    fill(cloud.hue, cloud.sat, cloud.bri);
    stroke(0, 0, 100);
    strokeWeight(2);
    ellipse(cloudX, cloudY, 14, 14);
    
    // Label only first 4 clouds to avoid clutter
    if (i < 4) {
      fill(0, 0, 100);
      noStroke();
      textAlign(CENTER, CENTER);
      textSize(9);
      text(`C${i + 1}`, cloudX, cloudY);
    }
  }
  
  // Legend
  fill(0, 0, 100);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(12);
  text('Color Wheel', wheelX, wheelY - 20);
  textSize(10);
  text(`${cloudColors.length} clouds`, wheelX, wheelY - 5);
  
  colorMode(RGB, 255);
  pop();
}

function setupControls() {
  // Sliders and DOM controls removed: params are now fixed by their
  // defaults above, so just no-op here.
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  BASE_UNIT = Math.min(width, height);
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
