# Generative Nebula Clouds

A mesmerizing generative art piece featuring continuously evolving nebula-like blobs inspired by Malibu sunsets. The artwork features an infinite loop transitioning between additive light (black background) and subtractive paint (white background) modes, creating two distinct visual experiences in one seamless animation.

🌐 **Live Demo**: [https://mattRGlover.github.io/Nebula/](https://mattRGlover.github.io/Nebula/)

## ✨ Features

### Visual Effects
- **Infinite Background Transition**: 70-second cycle smoothly transitioning between:
  - **Black Background (30s)**: Additive (ADD) blend mode for glowing, luminous nebula effect
  - **Transition to White (10s)**: Ultra-smooth blend mode fade (ADD → BLEND → MULTIPLY)
  - **White Background (20s)**: Subtractive (MULTIPLY) blend mode for watercolor paint effect  
  - **Transition to Black (10s)**: Smooth return with gentle fade-in to prevent popping
- **Dual Aesthetics**: Experience both cosmic glowing light and traditional watercolor in one continuous loop
- **Organic Movement**: Blobs drift up to 25% of screen size with slow, noise-based flow patterns
- **Dynamic Rotation**: Each blob spins at ±15°/sec with unique speeds and directions

### Color & Composition
- **Malibu Sunset Palette**: Warm oranges, corals, peachy pinks, magentas, violets, sea-greens, and soft sky blues
- **Color Repetition Prevention**: No more than 2 similar hues consecutively (within 30° on color wheel)
- **Radial Saturation Gradient**: Concentrated color cores with adaptive falloff based on background
  - Black: Tight center (power 0.5) fading to 35% at edges
  - White: Gentle falloff (power 1.2) maintaining 55% saturation at edges
- **White Glow Layer**: Each blob has a luminous white halo underneath for depth and dimension
  - Strong on black (40% alpha) for additive glow
  - Subtle on white (15% alpha) for soft halos

### Animation & Life Cycles
- **Smooth Life Cycles**: Blobs assemble piece-by-piece (3s), sustain (20s), then gracefully fade (7s)
- **Staggered Spawning**: 4 overlapping blobs with 7-second intervals ensure canvas is never empty
- **Intelligent Placement**: Color-based spacing prevents muddy overlaps (similar hues stay apart)
- **Persistent Visibility**: Blobs remain visible throughout transitions with blend-mode-aware alpha adjustments

### Performance Optimizations
- **Mobile-Optimized**: Runs smoothly on iPhone 17 Pro and other high-end devices
- **Reduced Complexity**: 4 blobs (was 6), 120 subshapes per blob (was 230)
- **Efficient Rendering**: Single pixel density, simplified recursion (3 levels vs 4)
- **Smooth 60fps**: Optimized calculations and noise-based smooth transformations

## 🎨 Versions

### `nebula_transition.js` (Active/Default)
The main version featuring infinite black-to-white transitions with:
- Additive/subtractive blend mode switching
- Extreme vibrancy on white (alpha 2.2, saturation 100)
- Smooth flow and rotation
- Performance optimizations for mobile

### `nebula_black.js`
Pure black background version with:
- ADD blend mode for glowing additive effects
- White supporting layers for luminosity
- Tight radial saturation cores
- High vibrancy (alpha 1.5, saturation 95)

### `nebula_white.js`
Original cream background version with:
- MULTIPLY blend mode for watercolor effect
- Traditional gentle appearance
- Softer, more subdued palette

## 🔧 Technical Highlights

### Core Technologies
- Built with [p5.js](https://p5js.org/)
- HSB color space for stable, vibrant hues
- Noise-based smooth jitter and flow for organic motion
- Per-blob state management for flicker-free animation

### Advanced Features
- **Smootherstep Easing**: 5th-order polynomial interpolation for ultra-smooth transitions
- **Blend-Mode-Aware Parameters**: Alpha, saturation, and brightness adjust dynamically based on current blend mode
- **Additive Fade Protection**: Special fade curves prevent "popping" when returning to ADD mode
- **Extended Blend Zones**: 70% of transition time (15%-85%) in BLEND mode for seamless effect changes
- **Radial Attenuation**: Watercolor pooling effect with mid-ring peaks
- **Life Cycle Management**: Individual blob timers with assembly/sustain/fade phases

### Performance
- Smart shape generation with reduced recursion
- Efficient noise sampling for smooth transformations
- Optimized blend mode switching
- Single pixel density for mobile devices

## 🚀 Usage

### Web Browser
Simply open `index.html` in a web browser. The sketch will fill the window and begin its infinite transition cycle.

### Live Version
Visit [https://mattRGlover.github.io/Nebula/](https://mattRGlover.github.io/Nebula/)

**Keyboard Shortcuts:**
- Press `N` to restart the cycle from the beginning

## 📁 Files

- `index.html` - Main HTML entry point
- `nebula_transition.js` - **Active**: Infinite black/white transition with full feature set
- `nebula_black.js` - Pure black background with additive glow
- `nebula_white.js` - Original cream background with watercolor effect

## 🎯 Key Parameters

### Transition Timing
- Black Duration: 30 seconds
- To White Transition: 10 seconds
- White Duration: 20 seconds  
- To Black Transition: 10 seconds
- **Full Cycle**: 70 seconds

### Blend Modes by Phase
- `easedT < 0.15`: ADD mode (additive light)
- `0.15 ≤ easedT < 0.85`: BLEND mode (smooth transition)
- `easedT ≥ 0.85`: MULTIPLY mode (subtractive paint)

### Vibrancy Settings
**Black Background:**
- Alpha: 1.2
- Saturation: 94
- Brightness: 96

**White Background:**
- Alpha: 2.2 (extreme boost for MULTIPLY)
- Saturation: 100 (maximum)
- Brightness: 100 (maximum)

### Movement
- Flow Speed: 0.00003 (very slow for wide cycles)
- Flow Scale: 25% of screen size
- Rotation: ±15°/second

## 🛠️ Development Notes

### Session Highlights (Nov 21, 2025)
1. Created three distinct versions (black, white, transition)
2. Implemented infinite loop with smooth blend mode transitions
3. Added organic flow and increased rotation for dynamic movement
4. Optimized for mobile performance (60-70% improvement)
5. Extreme vibrancy boost for white background to match black
6. Solved "popping" issue when returning to black with fade curves
7. Extended blend zones (15%-85%) for ultra-smooth transitions

### Performance Optimizations Applied
- Blobs: 6 → 4 (33% reduction)
- Subshapes: 230 → 120 (48% reduction)
- Recursion depth: 4 → 3 levels
- Pixel density: 2 → 1 (50% fewer pixels)

## 📝 License

Created by Matt Glover, 2024-2025

---

**Repository**: [https://github.com/MattRGlover/Nebula](https://github.com/MattRGlover/Nebula)
