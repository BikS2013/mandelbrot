# Mandelbrot Explorer - Project Overview

## Purpose
Interactive web-based Mandelbrot set explorer with real-time rendering, multiple color schemes, and 3D visualization.

## Tech Stack
- **Language**: TypeScript (strict mode, ES2020 target)
- **Runtime**: Browser (DOM) + Node.js for serving
- **Build**: `tsc` (TypeScript compiler)
- **Server**: Custom Node.js HTTP server (`serve.js`, port 8000)
- **Containerization**: Docker (node:20-alpine, multi-stage build)

## Project Structure
```
├── src/
│   ├── index.ts          # Main entry - MandelbrotExplorer class, event handling, UI
│   ├── mandelbrot.ts     # MandelbrotCalculator class - core fractal computation
│   ├── renderer3d.ts     # Renderer3D class - 3D heightmap visualization
│   └── colorSchemes.ts   # ColorSchemes class - 12+ color palettes
├── index.html            # Single-page app with controls UI
├── serve.js              # Static file HTTP server
├── Dockerfile            # Multi-stage Docker build
├── bin/mandelbrot        # CLI entry point
├── books/                # Reference material (fractal books)
└── dist/                 # Compiled JS output
```

## Key Classes
- **MandelbrotExplorer** (index.ts): Main app orchestrator - canvas setup, event listeners, zoom/pan, rectangle selection, 3D mode toggle
- **MandelbrotCalculator** (mandelbrot.ts): Core math - iteration calculation, color mapping. Interfaces: Complex, ViewPort
- **Renderer3D** (renderer3d.ts): 3D surface rendering with rotation, projection, wireframe/surface modes. Interfaces: Point3D, ProjectedPoint
- **ColorSchemes** (colorSchemes.ts): Static class with 12 schemes (classic, fire, ocean, rainbow, grayscale, sunset, neon, forest, cosmic, copper, ice, volcanic)

## Features
- Real-time Mandelbrot rendering on HTML5 Canvas
- Click-drag zoom, mouse wheel zoom
- Adjustable max iterations (10-1000)
- 12 color schemes
- 3D heightmap mode with rotation controls (X/Y/Z axes, keyboard arrows)
- Rectangle selection for 3D area rendering
- Quick location presets (Seahorse Valley, Mini Mandelbrot, Spiral Detail)
- Save as PNG
- Collapsible controls panel (H key toggle)
