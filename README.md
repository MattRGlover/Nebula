# Generative Nebula Clouds

A mesmerizing interactive generative art piece featuring continuously evolving nebula-like clouds inspired by Malibu sunsets. The artwork features an infinite loop transitioning between additive light (black background) and subtractive paint (white background) modes, with touch/mouse gesture controls for dynamic interaction.

🌐 **Live Demo**: [https://mattRGlover.github.io/Nebula/](https://mattRGlover.github.io/Nebula/)

## ✨ Features

### Interactive Gesture System
- **Linear Gestures**: Drag to kick clouds in any direction with momentum-based physics
- **Circular Gestures (LOOPS)**: Draw circles to spin all clouds together with intensity scaling
- **Infinity Gestures**: Rapid figure-8 motions trigger an explosion effect, scattering clouds independently
- **30ms Intent Detection**: Brief delay determines gesture type before applying physics
- **Predict-and-Lock Direction**: Cross-product analysis with 2-circle threshold for direction reversal

### Visual Effects
- **Infinite Background Transition**: 70-second cycle smoothly transitioning between:
  - **Black Background (30s)**: Additive (ADD) blend mode for glowing, luminous nebula effect
  - **Transition to White (10s)**: Ultra-smooth blend mode fade (ADD → BLEND → MULTIPLY)
  - **White Background (20s)**: Subtractive (MULTIPLY) blend mode for watercolor paint effect  
  - **Transition to Black (10s)**: Smooth return with gentle fade-in to prevent popping
- **Automatic Grayscale Mode**: Random intervals of monochrome rendering
- **Dual Aesthetics**: Experience both cosmic glowing light and traditional watercolor in one continuous loop

### Cloud Physics
- **Momentum System**: Clouds maintain velocity with very light damping (0.9995)
- **Cloud Repulsion**: Prevents clumping with distance-based repulsion
- **Automated Wandering**: Noise-based velocity nudges prevent idle clumping
- **Pacman Wrap**: Clouds wrap around screen edges at 50% past boundary
- **Screen-Normalized Movement**: Velocity scaled to 1920px reference for consistent feel across devices

### Color & Composition
- **Malibu Sunset Palette**: Warm oranges, corals, peachy pinks, magentas, violets, sea-greens, and soft sky blues
- **Color Diversity**: 70° minimum hue difference between clouds, checks last 5 spawned
- **Radial Saturation Gradient**: Concentrated color cores with adaptive falloff based on background
- **White Glow Layer**: Each blob has a luminous white halo underneath for depth and dimension

### Spawning System
- **Initial Fast Spawn**: 3.5-second intervals until 8 clouds populate the screen
- **Normal Spawn**: 7-second intervals maintain cloud density
- **Minimum Distance**: 40% screen distance from existing clouds required

## 🎨 Versions

The site automatically detects your device and loads the appropriate version:

### `nebula_mobile.js` (Mobile Devices)
Optimized for touch devices with:
- Touch gesture support
- 10% larger cloud scale (0.787 vs 0.715)
- Full gesture detection system

### `nebula_desktop.js` (Desktop/Laptop)
Full quality version with:
- Mouse gesture support
- Standard cloud scale (0.715)
- Full gesture detection system

### Legacy Files
- `nebula_dynamic.js` - Previous dynamic version with color rotation
- `nebula_working_physics.js` - Development version with orbital physics
- `nebula_working_live.js` - Stable backup version

## 🔧 Technical Highlights

### Core Technologies
- Built with [p5.js](https://p5js.org/)
- HSB color space for stable, vibrant hues
- Delta-time integration for frame-rate independent physics
- Per-cloud state management for flicker-free animation

### Gesture Detection
- **Turn Analysis**: Cross-product of consecutive movement vectors
- **Direction Confidence**: Multiple consistent turns required before locking direction
- **Intensity Scaling**: Consecutive loops increase chaos multiplier up to 200%
- **Infinity Detection**: 3+ rapid direction flips trigger scatter effect

### Performance
- 8 numSplotches per cloud
- 180 arr_num subshapes
- Efficient noise sampling
- Single pixel density for mobile devices

## 🚀 Usage

### Web Browser
Simply open `index.html` in a web browser. The site automatically detects mobile vs desktop.

### Live Version
Visit [https://mattRGlover.github.io/Nebula/](https://mattRGlover.github.io/Nebula/)

### Interactions
- **Drag**: Kick clouds in the drag direction
- **Circle**: Spin all clouds (intensity increases with consecutive circles)
- **Figure-8**: Scatter clouds in all directions (one-time explosion)

## 📁 Files

- `index.html` - Main HTML entry point with device detection
- `nebula_mobile.js` - **Active**: Touch-optimized version
- `nebula_desktop.js` - **Active**: Mouse-optimized version
- `nebula_dynamic.js` - Legacy dynamic color rotation version
- `nebula_working_physics.js` - Development orbital physics version

## 🎯 Key Parameters

### Transition Timing
- Black Duration: 30 seconds
- To White Transition: 10 seconds
- White Duration: 20 seconds  
- To Black Transition: 10 seconds
- **Full Cycle**: 70 seconds

### Physics Settings
- **Max Speed**: 3.0
- **Damping**: 0.9995 (very light)
- **Spin Cap**: ±80
- **Spin Momentum Cap**: ±15

### Gesture Thresholds
- **Circular Detection**: >60° cumulative rotation
- **Loop Direction Lock**: 720° (2 full circles)
- **Infinity Trigger**: 3+ direction flips

## 🛠️ Development Notes

### Latest Updates (Jan 2026)
1. Implemented gesture detection system (LINEAR, LOOPS, INFINITY)
2. Created separate mobile/desktop versions with automatic detection
3. Added predict-and-lock direction system for circular gestures
4. Infinity gesture triggers one-time explosion with golden angle spread
5. Distance-based kick physics using gesture end position
6. Cloud repulsion system prevents clumping

### Performance Optimizations
- DeltaTime integration for frame-rate independence
- Screen-scale factor normalizes movement across devices
- Efficient gesture analysis with turn consistency checks

## 📝 License

Created by Matt Glover, 2024-2026

---

**Repository**: [https://github.com/MattRGlover/Nebula](https://github.com/MattRGlover/Nebula)
