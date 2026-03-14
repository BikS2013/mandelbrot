# Codebase Scan: Smooth 3D Rendering for Mandelbrot Explorer

**Date:** 2026-03-14
**Scope:** Analysis of existing codebase relevant to the smooth 3D rendering request

---

## 1. Project Overview

| Aspect | Detail |
|---|---|
| **Language** | TypeScript (strict mode) |
| **Target** | ES2020, browser DOM environment |
| **Build System** | `tsc` via `npm run build` |
| **Serve** | `node serve.js` on port 8000 |
| **Dependencies** | Zero runtime dependencies; only `@types/node` and `typescript` as devDependencies |
| **Rendering** | Canvas 2D API only (no WebGL, no external libraries) |
| **Module System** | ES2020 modules with `.js` import extensions |

### Directory Layout

```
mandelbrot/
  src/
    index.ts          -- Main application class (MandelbrotExplorer), entry point
    renderer3d.ts     -- 3D heightmap renderer (Renderer3D)
    colorSchemes.ts   -- Color scheme definitions (ColorSchemes)
    mandelbrot.ts     -- Standalone Mandelbrot calculator (MandelbrotCalculator)
  dist/               -- Compiled output (tsc)
  index.html          -- Single-page UI with inline controls
  serve.js            -- Static file server
  docs/reference/     -- Specification documents
  docs/design/        -- Design documents
```

---

## 2. Module Map

### `src/index.ts` -- MandelbrotExplorer (main orchestrator)

| Symbol | Kind | Lines | Responsibility |
|---|---|---|---|
| `MandelbrotExplorer` | Class | entire file | Main application: canvas setup, event handling, 2D/3D mode switching, iteration calculation |
| `constructor` | Method | -- | Initializes canvas, `Renderer3D`, `MandelbrotCalculator`, sets up event listeners |
| `render()` | Method | 463-486 | Branch: if `is3DMode`, calculates iteration data and calls `renderer3D.render()`; else renders 2D via `calculateWithColorScheme()` |
| `calculateIterationData()` | Method | 514-531 | Fills `this.iterationData: number[][]` by calling `mandelbrotIteration()` for every pixel |
| `mandelbrotIteration()` | Method | 533-549 | **Core iteration function** -- returns integer `n` (escape count) or `maxIterations` |
| `createHeightMapFromRectangle()` | Method | 585-617 | Extracts luminance-based heightmap from canvas pixel data for rectangle-selection 3D |
| `render3DFromSelectedRectangle()` | Method | 551-583 | Orchestrates rectangle-to-3D workflow, calls `renderer3D.renderFromHeightMap()` |

### `src/renderer3d.ts` -- Renderer3D (3D rendering engine)

| Symbol | Kind | Lines | Responsibility |
|---|---|---|---|
| `Point3D` | Interface | 3-10 | Vertex with x, y, z, iterations, gridX, gridY |
| `ProjectedPoint` | Interface | 12-20 | Projected vertex adding `scale` field |
| `Renderer3D` | Class | 22-end | All 3D rendering logic |
| `gridResolution` | Property | 27 | Default `1` -- every pixel is a vertex |
| `smoothingRadius` | Property | 28 | Default `2` -- Gaussian kernel radius |
| `render()` | Method | 42-73 | **Public API (path 1)**: iteration data -> grid points -> transform -> render surface |
| `renderFromHeightMap()` | Method | 75-98 | **Public API (path 2)**: heightmap -> grid points -> transform -> render surface |
| `drawBackground()` | Method | 100-107 | Dark gradient background (#0a0a0a to #1a1a2e) |
| `createGridPoints()` | Method | 109-141 | Builds Point3D grid from iteration data via `createSmoothHeightMap()` |
| `createSmoothHeightMap()` | Method | 182-202 | Converts iterations to heights via `calculateSmoothHeight()`, then applies single-pass Gaussian |
| `calculateSmoothHeight()` | Method | 204-225 | Maps iteration count to height using blended exponential/logarithmic/sinusoidal curves |
| `applyGaussianSmoothing()` | Method | 227-280 | Single-pass 2D Gaussian with `sigma = radius/3`, 5x5 kernel at default |
| `transformAndProject()` | Method | -- | 3D rotation and perspective projection |
| `renderSurface()` | Method | -- | Triangle-based surface rendering with painter's algorithm |
| `renderTriangle()` | Method | -- | Individual triangle fill with color from `ColorSchemes.getColor()` |

### `src/colorSchemes.ts` -- ColorSchemes

| Symbol | Kind | Responsibility |
|---|---|---|
| `ColorScheme` | Type | String union of scheme names |
| `RGB` | Interface | `{ r, g, b }` |
| `ColorSchemes` | Class | Static methods: `getColor(scheme, ratio)` returns RGB; 13 named schemes |

### `src/mandelbrot.ts` -- MandelbrotCalculator

| Symbol | Kind | Responsibility |
|---|---|---|
| `Complex` | Interface | `{ real, imag }` |
| `ViewPort` | Interface | `{ centerX, centerY, zoom }` |
| `MandelbrotCalculator` | Class | Standalone calculator used for the 2D `calculate()` path that returns `Uint8ClampedArray` image data |
| `mandelbrotIteration()` | Method (31-47) | Same integer iteration logic as `MandelbrotExplorer.mandelbrotIteration()` |

**Note:** `MandelbrotCalculator` is used only for the 2D render path. The 3D render path uses `MandelbrotExplorer.mandelbrotIteration()` directly.

---

## 3. Conventions

### Coding Patterns
- **Single-class-per-file** pattern with named exports
- **Private methods** for internal logic, public methods only for API surface
- **No external dependencies** -- pure Canvas 2D API
- **Import paths** use `.js` extension (e.g., `import { ColorSchemes } from './colorSchemes.js'`)
- **Type annotations** on all parameters and return types (strict mode)
- **No `any` types** observed

### Configuration
- All rendering parameters come from HTML input elements read at render time (e.g., `document.getElementById('iterations')`)
- No configuration files; all state is in `MandelbrotExplorer` instance properties
- Properties like `gridResolution` and `smoothingRadius` are hardcoded class defaults, not exposed to UI

### Testing
- No test framework or test files present in the project

---

## 4. Integration Points

### Files That Must Change

| File | What Changes | Why |
|---|---|---|
| `src/index.ts` | `mandelbrotIteration()` (lines 533-549) | Must return smooth float instead of integer. Escape radius must increase from 4 (i.e., bailout radius 2) to support the `log(log(|z|))/log(2)` formula. |
| `src/index.ts` | `calculateIterationData()` (lines 514-531) | The `iterationData: number[][]` array will now hold floats -- no structural change needed since it is already `number[][]`. |
| `src/renderer3d.ts` | `createSmoothHeightMap()` (lines 182-202) | Add spike detection pass before Gaussian smoothing. |
| `src/renderer3d.ts` | `calculateSmoothHeight()` (lines 204-225) | Replace blended curve with single power function. |
| `src/renderer3d.ts` | `applyGaussianSmoothing()` (lines 227-280) | Increase radius, adjust sigma to `radius/2`, add multi-pass support. |
| `src/renderer3d.ts` | `gridResolution` property (line 27) | Increase default from 1 to 2-4. |
| `src/renderer3d.ts` | `drawBackground()` (lines 100-107) | Replace dark gradient with warm gradient. |

### Files That Must NOT Change
| File | Reason |
|---|---|
| `src/mandelbrot.ts` | Only used by 2D render path; the refined request confirms no changes needed. |
| `src/colorSchemes.ts` | Already handles fractional ratios; no changes needed. |

### Patterns New Code Must Follow
1. All new methods must be `private` unless they form part of the public render API
2. TypeScript strict mode -- no `any`, explicit return types
3. Import extensions must use `.js`
4. No external libraries (Canvas 2D only)
5. Height for interior points (iterations === maxIterations) must remain 0

---

## 5. Call Chains

### Path 1: Full-Canvas 3D Render (toggle 3D mode)

```
User toggles "Render 3D" checkbox
  -> MandelbrotExplorer.render()                          [index.ts:463]
    -> MandelbrotExplorer.calculateIterationData()        [index.ts:514]
      -> MandelbrotExplorer.mandelbrotIteration()         [index.ts:533]  ** CHANGE: return smooth float **
         (loops over every pixel, fills this.iterationData[][])
    -> Renderer3D.render(iterationData, maxIter, ...)     [renderer3d.ts:42]
      -> Renderer3D.drawBackground()                      [renderer3d.ts:100]  ** CHANGE: warm gradient **
      -> Renderer3D.createGridPoints(iterationData, ...)  [renderer3d.ts:109]
        -> Renderer3D.createSmoothHeightMap(...)           [renderer3d.ts:182]  ** CHANGE: add spike detection **
          -> Renderer3D.calculateSmoothHeight(...)         [renderer3d.ts:204]  ** CHANGE: simplify to power curve **
          -> Renderer3D.applyGaussianSmoothing(...)        [renderer3d.ts:227]  ** CHANGE: multi-pass, wider kernel **
      -> Renderer3D.transformAndProject(gridPoints, ...)
      -> Renderer3D.renderSurface(projectedPoints, ...)
        -> Renderer3D.renderTriangle(...)
          -> ColorSchemes.getColor(scheme, ratio)
```

### Path 2: Rectangle-Selection 3D Render

```
User draws rectangle, clicks "Render 3D from Rectangle"
  -> MandelbrotExplorer.render3DFromSelectedRectangle()   [index.ts:551]
    -> MandelbrotExplorer.createHeightMapFromRectangle()  [index.ts:585]
       (extracts luminance from canvas pixels -- NOT iteration-based)
    -> Renderer3D.renderFromHeightMap(heightMap, ...)     [renderer3d.ts:75]
      -> Renderer3D.drawBackground()                      [renderer3d.ts:100]  ** CHANGE: warm gradient **
      -> Renderer3D.createGridPointsFromHeightMap(...)
      -> Renderer3D.transformAndProject(...)
      -> Renderer3D.renderSurfaceFromHeightMap(...)
```

**Important:** Path 2 uses luminance-based heights from already-rendered 2D pixels, not raw iteration data. The smooth iteration count change (FR-1) will indirectly improve Path 2 because the 2D render will produce smoother color gradients, leading to smoother luminance values. However, the spike detection and enhanced smoothing (FR-2, FR-3) in `createSmoothHeightMap()` only apply to Path 1.

### 2D Render Path (must remain unaffected)

```
User in 2D mode
  -> MandelbrotExplorer.render()                          [index.ts:463]
    -> MandelbrotExplorer.calculateWithColorScheme()
       (uses its own iteration loop, independent of mandelbrotIteration())
```

**Caution:** Verify that `calculateWithColorScheme()` has its own iteration loop and does not call `mandelbrotIteration()`. If it does call `mandelbrotIteration()`, the change to return floats could affect 2D coloring. The `ColorSchemes.getColor()` method already accepts fractional ratios, so this should be safe, but it needs verification during implementation.

---

## 6. Key Observations for Implementation

1. **Two separate iteration functions exist**: `MandelbrotExplorer.mandelbrotIteration()` (used by 3D path) and `MandelbrotCalculator.mandelbrotIteration()` (used by 2D path via `calculate()`). They are identical in logic but independent. Only the one in `index.ts` needs modification for smooth iteration counts.

2. **The `gridResolution = 1` at line 27** means every pixel becomes a vertex. At default, a 1920x1080 canvas produces ~2M vertices. Increasing to 3-4 would reduce to ~170K-500K vertices, significantly improving performance.

3. **The `smoothingRadius = 2` at line 28** produces a 5x5 kernel with `sigma = 0.67`. This is far too narrow. Values at kernel edge contribute negligibly. The request calls for radius 4-6, sigma = radius/2.

4. **The escape bailout is `> 4`** (i.e., `|z|^2 > 4`, meaning bailout radius = 2). For the smooth iteration formula `n + 1 - log(log(|z|))/log(2)`, a larger bailout radius (e.g., 256 or higher) produces more accurate smooth values. The bailout should be increased.

5. **No outlier detection exists** in the pipeline. The `createSmoothHeightMap()` method goes directly from per-pixel height calculation to single-pass Gaussian. A spike detection/median filter pass must be inserted between these two steps.

6. **The `drawBackground()` method** is shared by both render paths and is a simple 8-line method -- straightforward to update.
