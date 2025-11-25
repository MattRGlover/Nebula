# Technical Documentation

Detailed technical documentation for the Generative Nebula Clouds project.

## Architecture Overview

### Core Components

1. **Setup & Configuration**
   - Canvas creation with responsive sizing
   - Pixel density set to 1 for performance
   - BASE_UNIT calculated from minimum viewport dimension
   - Random seed initialization for deterministic generation

2. **Draw Loop**
   - Fixed random seed per frame for stable layout
   - Time-based parameter passing for animation
   - Error handling with on-canvas indicators

3. **Generation Pipeline**
   - Background transition calculation
   - Blend mode switching
   - Blob lifecycle management
   - Shape generation and rendering

## Transition System

### Timing Architecture

```javascript
const BLACK_DURATION = 30000;      // 30 seconds at black
const TO_WHITE_DURATION = 10000;   // 10 seconds transitioning
const WHITE_DURATION = 20000;      // 20 seconds at white
const TO_BLACK_DURATION = 10000;   // 10 seconds transitioning
const FULL_CYCLE = 70000;          // Total: 70 seconds
```

### Phase Calculation

```javascript
const elapsed = (time - startTime) % FULL_CYCLE;
let transitionT = 0; // 0 = black, 1 = white

if (elapsed < BLACK_DURATION) {
  transitionT = 0;
} else if (elapsed < BLACK_DURATION + TO_WHITE_DURATION) {
  const t = (elapsed - BLACK_DURATION) / TO_WHITE_DURATION;
  transitionT = t;
} else if (elapsed < BLACK_DURATION + TO_WHITE_DURATION + WHITE_DURATION) {
  transitionT = 1;
} else {
  const t = (elapsed - BLACK_DURATION - TO_WHITE_DURATION - WHITE_DURATION) / TO_BLACK_DURATION;
  transitionT = 1 - t;
}
```

### Smootherstep Easing

5th-order polynomial for ultra-smooth interpolation:

```javascript
const easedT = transitionT * transitionT * transitionT * 
               (transitionT * (transitionT * 6 - 15) + 10);
```

This produces smoother acceleration/deceleration than standard smoothstep (3rd order).

## Blend Mode System

### Mode Selection

```javascript
if (easedT < 0.15) {
  pg.blendMode(pg.ADD);      // Additive on black
} else if (easedT >= 0.85) {
  pg.blendMode(pg.MULTIPLY); // Subtractive on white
} else {
  pg.blendMode(pg.BLEND);    // Smooth transition
}
```

### Blend Mode Transition Factor

```javascript
let blendModeT = 0.5; // 0 = ADD, 1 = MULTIPLY, 0.5 = BLEND

if (easedT < 0.15) {
  blendModeT = 0;
} else if (easedT >= 0.85) {
  blendModeT = 1;
} else {
  blendModeT = (easedT - 0.15) / (0.85 - 0.15);
}
```

## Vibrancy Management

### Alpha Interpolation

```javascript
const blendModeSmooth = blendModeT * blendModeT * blendModeT * 
                        (blendModeT * (blendModeT * 6 - 15) + 10);
let baseAlpha = pg.lerp(1.2, 2.2, blendModeSmooth) * (100 / arr_num);
```

- **ADD mode** (1.2): Lower to prevent white blowout from additive overlap
- **MULTIPLY mode** (2.2): Much higher to compensate for darkening

### Additive Fade Protection

Prevents "popping" when returning to black:

```javascript
let additiveFade = 1.0;
if (easedT < 0.18) {
  additiveFade = pg.map(easedT, 0, 0.18, 0.85, 1.0); // Fade in
} else if (easedT > 0.82) {
  additiveFade = pg.map(easedT, 0.82, 1.0, 1.0, 0.85); // Fade out
}
baseAlpha *= additiveFade;
```

### Saturation Gradient

Dynamic radial falloff based on background:

```javascript
const saturationPower = pg.lerp(0.5, 1.2, easedT);
const minSat = pg.lerp(0.35, 0.55, easedT);
const saturationFactor = pg.map(
  pg.pow(rNorm, saturationPower), 
  0, 1, 
  1.0, 
  minSat
);
```

- **Black** (power 0.5): Tight concentrated core, 35% at edges
- **White** (power 1.2): Gentle falloff, 55% at edges

### Brightness Adjustment

```javascript
const brightnessT = easedT * easedT * easedT * 
                    (easedT * (easedT * 6 - 15) + 10);
const brightness = pg.lerp(96, 100, brightnessT);
```

- **Black**: 96 (bright but controlled)
- **White**: 100 (maximum to fight MULTIPLY darkening)

## Blob Lifecycle System

### Timing Parameters

```javascript
const assembleDuration = 3000;   // Assembly: 0 → full
const sustainDuration = 20000;   // Sustain at full
const fadeDuration = 7000;       // Fade: full → 0
const totalLife = 30000;         // Total lifecycle
const spawnInterval = 7000;      // Spawn every 7 seconds
```

### Life Curve

```javascript
let lifeAlpha = 0;

if (lifeTime < assembleDuration) {
  const t = lifeTime / assembleDuration;
  const eased = t * t * (3 - 2 * t); // smoothstep
  lifeAlpha = eased;
} else if (lifeTime < assembleDuration + sustainDuration) {
  lifeAlpha = 1.0; // Full sustain
} else if (lifeTime < totalLife) {
  const fadeT = (lifeTime - assembleDuration - sustainDuration) / fadeDuration;
  const eased = 1 - (fadeT * fadeT * (3 - 2 * fadeT));
  lifeAlpha = eased;
} else {
  lifeAlpha = 0; // Dead
}
```

### Staggered Spawning

```javascript
const spawnTime = i * spawnInterval;
const lifeTime = absoluteScaled - spawnTime;
```

With 4 blobs spawning every 7 seconds and 30-second lifecycles, there's always overlap.

## Movement System

### Rotation

Each blob has unique rotation speed and direction:

```javascript
const spinSpeed = pg.map(pg.noise(i * 0.7), 0, 1, -15, 15); // ±15°/sec
const t = absoluteScaled * 0.0005; // Time factor
const splotchAngle = t * spinSpeed + i * 20; // Initial offset
```

### Organic Flow

Noise-based drift for smooth, wide traveling motion:

```javascript
const flowSpeed = 0.00003;
const flowScale = BASE_UNIT * 0.25; // 25% of screen

const driftX = (pg.noise(i * 0.53, absoluteScaled * flowSpeed) - 0.5) * 2 * flowScale;
const driftY = (pg.noise(i * 0.53 + 100, absoluteScaled * flowSpeed) - 0.5) * 2 * flowScale;
```

- Very slow speed (0.00003) creates wide, smooth cycles
- Maximum drift of 25% screen size in any direction
- Different noise offsets for X and Y create organic paths

## Color System

### Hue Zones

```javascript
if (hueNoise < 0.28) {
  zone_hue = pg.map(hueNoise, 0.0, 0.28, 10, 40);      // Warm oranges
} else if (hueNoise < 0.48) {
  // Peachy pinks (340°-360° wrapping to 0°-15°)
} else if (hueNoise < 0.7) {
  zone_hue = pg.map(hueNoise, 0.48, 0.7, 280, 330);    // Magentas/violets
} else if (hueNoise < 0.86) {
  zone_hue = pg.map(hueNoise, 0.7, 0.86, 165, 210);    // Sea-greens
} else {
  zone_hue = pg.map(hueNoise, 0.86, 1.0, 205, 230);    // Sky blues
}
```

### Repetition Prevention

```javascript
const isSimilarToRecent = recentBlobHues.length >= 2 && 
  recentBlobHues.slice(-2).every(recentHue => {
    let diff = Math.abs(zone_hue - recentHue);
    if (diff > 180) diff = 360 - diff; // Handle wrap
    return diff < 30; // Within 30° considered similar
  });

if (!isSimilarToRecent) break;

// Try different hue
hueNoise = (hueNoise + 0.237 * (attempt + 1)) % 1.0;
```

Prevents more than 2 similar hues (within 30°) consecutively.

## Shape Generation

### Base Shape Creation

```javascript
function createShape(radius, angle_sep, pg) {
  let arr = [];
  let angle = 0;
  while (angle < 360) {
    let r = radius + pg.randomGaussian(0, radius * 0.03);
    let x = r * pg.cos(angle);
    let y = r * pg.sin(angle);
    arr.push({ x, y });
    angle += angle_sep;
  }
  return arr;
}
```

### Recursive Transformation

```javascript
function transformShape(points, depth, factor, pg) {
  if (depth <= 0) return points;
  
  let newPoints = [];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    
    newPoints.push(p1);
    
    const midX = (p1.x + p2.x) / 2 + pg.randomGaussian(0, 5);
    const midY = (p1.y + p2.y) / 2 + pg.randomGaussian(0, 5);
    newPoints.push({ x: midX, y: midY });
  }
  
  return transformShape(newPoints, depth - 1, factor, pg);
}
```

Recursion depth of 3 balances detail with performance.

## Performance Optimizations

### Computational Complexity

| Parameter | Before | After | Reduction |
|-----------|--------|-------|-----------|
| Blobs | 6 | 4 | 33% |
| Subshapes/blob | 230 | 120 | 48% |
| Recursion depth | 4 | 3 | 25% |
| Pixel density | 2 | 1 | 50% |

### Shape Count Per Frame

- Before: 6 blobs × 230 shapes = 1,380 shapes
- After: 4 blobs × 120 shapes = 480 shapes
- **65% reduction** in shapes drawn per frame

### Noise Sampling Strategy

Smooth jitter instead of random per-frame:

```javascript
const jx = (pg.noise(i * 10 + formIndex * 0.37, absoluteScaled * 0.0002) - 0.5) * 2 * jitterScale;
```

This reduces visual jitter and is more performant than `randomGaussian()` each frame.

## State Management

### Per-Blob State

```javascript
blobStates = {
  'blob_0': {
    hue: 280,
    x: 512,
    y: 384,
    radius: 200,
    cycleIndex: 0,
    maxVisibleForms: 230
  },
  // ... more blobs
}
```

State persists across frames for:
- Stable hue assignment
- Consistent placement
- Smooth geometry transitions

### Reseed Behavior

Pressing 'N' triggers:

```javascript
randomSeedValue = int(random(1000000));
reseedTimestamp = millis();
blobStates = {}; // Clear all state
recentBlobHues = []; // Clear color history
```

## White Glow Layer

Depth effect with blend-mode-aware alpha:

```javascript
const whiteGlowStrength = pg.lerp(0.4, 0.15, pg.pow(easedT, 2.0));
if (whiteGlowStrength > 0.05) {
  const whiteAlpha = alpha * whiteGlowStrength;
  drawShape(form, pg.color(0, 0, 100, whiteAlpha), pg);
}
```

- **Black/ADD**: 40% alpha for strong glow
- **White/MULTIPLY**: 15% alpha for subtle halo
- Power curve (squared) keeps glow visible longer during transition

## Browser Compatibility

### Tested Platforms
- Desktop: Chrome, Firefox, Safari, Edge
- Mobile: iOS Safari (iPhone 17 Pro), Chrome Mobile
- Performance: 60fps on iPhone 17 Pro with optimizations

### Responsive Design
- Canvas fills viewport with `windowWidth` and `windowHeight`
- BASE_UNIT scales with minimum dimension for proportional sizing
- Touch-friendly (no hover effects)

## Future Optimization Opportunities

1. **WebGL Renderer**: p5.js WEBGL mode for GPU acceleration
2. **Level of Detail**: Reduce complexity based on frame rate
3. **Offscreen Canvas**: Pre-render static elements
4. **Shader-based Blending**: Custom blend modes in GPU
5. **Worker Threads**: Move noise calculation off main thread

## Development Tools

### Debugging
- Comment out blend mode lines to see raw shapes
- Add `text()` calls to display parameter values
- Use browser dev tools Performance tab for profiling

### Testing Transitions
- Reduce cycle times temporarily for faster iteration
- Add keyboard shortcuts to jump to specific phases
- Enable debug counter to monitor transition progress

---

**Last Updated**: November 21, 2024  
**Version**: 2.0.0
