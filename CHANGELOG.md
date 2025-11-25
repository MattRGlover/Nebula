# Changelog

All notable changes to the Generative Nebula Clouds project.

## [2.0.0] - 2024-11-21

### Major Features Added
- **Infinite Background Transition System**: 70-second cycle transitioning between black and white backgrounds
- **Dual Blend Modes**: ADD mode for additive light on black, MULTIPLY mode for subtractive paint on white
- **Three Distinct Versions**: Created `nebula_black.js`, `nebula_white.js`, and `nebula_transition.js`
- **Organic Flow System**: Blobs now drift up to 25% of screen size with noise-based movement
- **Increased Rotation**: Blob rotation increased from ±6°/sec to ±15°/sec

### Visual Enhancements
- **Black Background Phase**:
  - Pure black background (0,0,0 HSB)
  - ADD blend mode for glowing, luminous nebula effect
  - White glow layer underneath each blob (40% alpha) for depth
  - Moderate alpha (1.2) to prevent white blowout from additive mixing
  - Radial saturation with tight concentrated cores (power 0.5)

- **White Background Phase**:
  - Cream background (40,8,96 HSB)
  - MULTIPLY blend mode for watercolor paint effect
  - Extreme vibrancy boost to compensate for darkening:
    - Alpha: 2.2 (very high)
    - Saturation: 100 (maximum)
    - Brightness: 100 (maximum)
  - Gentle saturation falloff (power 1.2) to keep colors vibrant throughout
  - 55% saturation maintained at blob edges (vs 35% on black)

- **Transition Smoothness**:
  - Smootherstep easing (5th-order polynomial) for ultra-smooth interpolation
  - Extended blend zones: 70% of transition time in BLEND mode (15%-85%)
  - Additive fade protection to prevent "popping" when returning to black
  - Fade-in from 85% to 100% opacity over first 18% of cycle
  - Separate smoothing curves for alpha, saturation, and brightness

### Color System Improvements
- **Color Repetition Prevention**: Tracks last 2 blob hues, prevents similar colors (within 30°) consecutively
- **Stable Hue Assignment**: Each blob maintains its hue throughout entire lifecycle
- **Hue Tracking Reset**: Pressing 'N' clears color history for fresh generation

### Performance Optimizations
- Reduced blobs from 6 to 4 (33% fewer)
- Reduced subshapes per blob from 230 to 120 (48% fewer)
- Reduced recursion depth from 4 to 3 levels
- Pixel density reduced from 2 to 1 for mobile (50% fewer pixels)
- **Overall Performance**: 60-70% improvement, runs smoothly on iPhone 17 Pro

### Technical Improvements
- **Blend-Mode-Aware Parameters**: Alpha, saturation, brightness adjust dynamically based on `blendModeT` (0-1)
- **Radial Saturation Gradient**: Adaptive power curves (0.5 for black, 1.2 for white)
- **Flow System**: Noise-based drift with very slow speed (0.00003) for wide, smooth cycles
- **State Management**: Per-blob state tracks hue, position, radius, cycle index, and visible subshape count

### Files Added
- `nebula_transition.js` - Main infinite transition version (active)
- `nebula_black.js` - Pure black background with additive glow
- `nebula_white.js` - Original cream background renamed from `sketch.js`
- `README.md` - Comprehensive documentation
- `CHANGELOG.md` - This file

### Files Removed
- `sketch.js` - Renamed to `nebula_white.js`
- `index-mobile.html` - Removed in favor of unified responsive design

### Bug Fixes
- Fixed white blowout in ADD mode by reducing base alpha and white glow strength
- Fixed blobs disappearing during transitions by maintaining minimum visibility thresholds
- Fixed "popping" effect when returning to black by implementing gradual fade-in
- Fixed performance lag on mobile devices through optimization pass

### Configuration Changes
- **Transition Timing**:
  - Black Duration: 30 seconds
  - To White Transition: 10 seconds
  - White Duration: 20 seconds
  - To Black Transition: 10 seconds
  - Total Cycle: 70 seconds

- **Blend Mode Thresholds**:
  - ADD: `easedT < 0.15`
  - BLEND: `0.15 ≤ easedT < 0.85`
  - MULTIPLY: `easedT ≥ 0.85`

- **Movement Parameters**:
  - Flow Speed: 0.00003 (very slow)
  - Flow Scale: 25% of screen
  - Rotation: ±15°/sec

## [1.0.0] - 2024-11-20

### Initial Release
- Basic generative nebula cloud system
- Malibu sunset color palette
- 6 overlapping blobs with smooth lifecycles
- Watercolor-like texture with radial attenuation
- Staggered spawning and intelligent placement
- GitHub Pages deployment

---

**Repository**: https://github.com/MattRGlover/Nebula
**Live Demo**: https://mattRGlover.github.io/Nebula/
