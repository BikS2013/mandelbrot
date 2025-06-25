# Mandelbrot Set Explorer

A TypeScript-based interactive explorer for the Mandelbrot set with real-time rendering and multiple color schemes.

## Installation

```bash
npm install
```

## Running the Explorer

### Quick Start
```bash
npm start
```
This will build the TypeScript files and start the server automatically.

### Manual Steps
1. Build the TypeScript files:
   ```bash
   npm run build
   ```

2. Start the server:
   ```bash
   npm run serve
   ```

3. Open your browser and navigate to `http://localhost:8000`

## Controls

- **Click and drag**: Zoom into a specific rectangular area
- **Mouse wheel**: Zoom in/out at the cursor position
- **Iterations slider**: Adjust the level of detail (higher = more detail but slower)
- **Color scheme**: Choose from multiple color palettes
- **Reset View**: Return to the default view
- **Save Image**: Download the current view as a PNG file

## Development

To run TypeScript in watch mode:
```bash
npm run dev
```

## Features

- Real-time Mandelbrot set calculation
- Interactive zoom and pan
- Multiple color schemes (Classic, Fire, Ocean, Rainbow, Grayscale)
- Adjustable iteration count for detail control
- Save current view as image
- Responsive canvas that fills the browser window
- Real-time coordinate display