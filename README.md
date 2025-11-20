# Generative Nebula Clouds

A mesmerizing generative art piece featuring continuously evolving watercolor-like blobs inspired by Malibu sunsets. Each blob smoothly assembles, sustains, and fades away, creating an endless, meditative visual experience.

## Features

- **Malibu Sunset Palette**: Warm oranges, corals, peachy pinks, magentas, violets, sea-greens, and soft sky blues
- **Smooth Life Cycles**: Blobs assemble piece-by-piece, sustain for ~20 seconds, then gracefully fade
- **Dynamic Placement**: Each blob respawns in a new location with intelligent color-based spacing to prevent muddy overlaps
- **Watercolor Texture**: Radial opacity attenuation creates authentic watercolor pooling effects
- **Edge-to-Edge Composition**: Blobs can originate from any part of the canvas, including near edges
- **Continuous Generation**: 6 overlapping blobs with staggered timing ensure the canvas is never empty

## Technical Highlights

- Built with [p5.js](https://p5js.org/)
- HSB color space for stable, vibrant hues
- Noise-based smooth jitter for organic motion
- Per-blob state management for flicker-free assembly/disassembly
- Complementary hue avoidance to prevent gray/muddy mixing
- First-generation scaling for balanced composition evolution

## Usage

Simply open `index.html` in a web browser. The sketch will fill the window and begin its continuous generative cycle.

**Keyboard Shortcuts:**
- Press `N` to reseed and generate a fresh layout

## Files

- `index.html` - Main HTML entry point
- `sketch.js` - p5.js sketch with all generation logic

## License

Created by Matt Glover, 2024
