# Mandelbrot Explorer - Functional Requirements

**Date:** 2026-03-14
**Status:** Active
**Last Updated:** 2026-07-02 (Plan 002 — 3D representation improvements)

---

## 1. 3D Rendering Improvements

### FR-3D-001: Continuous Iteration Count
**Priority:** Critical
**Status:** Planned (Plan 001, Phase A)
**Affected Files:** `src/index.ts`

The Mandelbrot iteration function (`MandelbrotExplorer.mandelbrotIteration()`) must return a floating-point "smooth iteration count" instead of an integer. The formula uses the escape radius and final |z| magnitude to interpolate between integer iterations:

```
smoothIteration = n + 1 - log2(log2(|z|^2) / 2)
```

- The bailout radius must be increased to 256 (i.e., `|z|^2 > 65536`) for formula accuracy.
- Interior points (non-escaping) must return exactly `maxIterations`.
- The change must not break 2D rendering mode.

---

### FR-3D-002: Multi-Pass Gaussian Smoothing with Configurable Parameters
**Priority:** High
**Status:** Planned (Plan 001, Phase D)
**Affected Files:** `src/renderer3d.ts`

The heightmap smoothing implementation must support:

- Configurable smoothing radius (default: 4 pixels, producing a 9x9 effective kernel per pass).
- Sigma defaults to `radius / 2` (broader bell curve than the current `radius / 3`).
- Multiple smoothing passes (default: 2).
- Separable Gaussian implementation (two 1D passes -- horizontal then vertical -- instead of one 2D pass) for O(2r) instead of O(r^2) per-pixel performance.

---

### FR-3D-003: Spike Detection and Suppression
**Priority:** High
**Status:** Planned (Plan 001, Phase C)
**Affected Files:** `src/renderer3d.ts`

Before Gaussian smoothing, a median filter pass must be applied to the heightmap:

- The median filter replaces each cell with the median of its local neighborhood.
- Default filter radius: 2 (5x5 window).
- The filter must use clamped boundary handling.
- The filter must effectively eliminate isolated height spikes without distorting the overall terrain shape.

---

### FR-3D-004: Grid Resolution / Mesh Downsampling
**Priority:** Medium
**Status:** Superseded by Plan 002 (FR-3D-009: the fractal is sampled directly at grid resolution with supersampling; no full-canvas pass or downsampling exists anymore)
**Affected Files:** `src/renderer3d.ts`

The default grid resolution must be increased from 1 to 3 to reduce vertex count:

- When downsampling, use area-averaging of the iteration data (not point-sampling).
- Area-averaging computes the mean of all pixels within each grid cell.
- The grid resolution must remain configurable for fine-tuning.
- At gridResolution=3 on a 1920x1080 canvas, the vertex count drops from ~2M to ~230K.

---

### FR-3D-005: Simplified Height Mapping Function
**Priority:** Medium
**Status:** Superseded by Plan 002 (FR-3D-010: inverted to the classic mesa — interior plateau high, exterior low)
**Affected Files:** `src/renderer3d.ts`

The current multi-function blend (exponential/logarithmic/sinusoidal) in `calculateSmoothHeight()` must be replaced with a single power-law curve:

```
height = heightScale * pow(1 - (smoothIteration / maxIterations), exponent)
```

- Default exponent: 0.5 (balanced, natural-looking terrain).
- Interior points (smoothIteration >= maxIterations) must map to height = 0 (flat lake).
- The exponent should be configurable.

---

### FR-3D-006: Lighting Improvements
**Priority:** Medium
**Status:** Superseded by Plan 002 (FR-3D-011: terrain-space per-vertex normals, normalized hillshade lights, linear-space compositing)
**Affected Files:** `src/renderer3d.ts`

The lighting model must be enhanced with:

- **Vertex normals:** Computed by averaging adjacent face normals at each vertex, then averaged per-triangle for smooth shading.
- **Phong lighting model:** Ambient + diffuse + specular components.
  - Ambient coefficient: 0.25
  - Diffuse coefficient: 0.6
  - Specular coefficient: 0.4
  - Shininess exponent: 40
- The specular highlights must be visible on terrain ridges facing the light source.
- The lighting must work correctly with all 13 existing color schemes.

---

### FR-3D-007: Background Enhancement
**Priority:** Low
**Status:** Planned (Plan 001, Phase G)
**Affected Files:** `src/renderer3d.ts`

The `drawBackground()` method must be updated:

- Replace the current dark gradient (#0a0a0a to #1a1a2e) with a warm sunset gradient.
- The gradient transitions from dark brown/black at the top to warm orange/amber at the bottom.
- The gradient must complement all existing color schemes.
- Optional: add a decorative gradient sphere/orb element in the background for visual depth.

---

### FR-3D-008: Preserve Existing Functionality
**Priority:** Critical
**Status:** Ongoing constraint for all 3D rendering changes
**Affected Files:** All

All changes must preserve:

- 2D rendering mode must remain completely unaffected.
- All 13 existing color schemes must continue to work in both 2D and 3D modes.
- All existing controls (rotation, height scale, smoothing level, keyboard navigation) must remain functional.
- The rectangle-selection-to-3D workflow must continue to work.
- The project must build cleanly with `npm run build` (TypeScript strict mode, ES2020 target).
- The project must serve with `npm run serve` on port 8000.

---

## 1b. 3D Representation Improvements (Plan 002 — 2026-07-02)

Authoritative design: `docs/design/plan-002-3d-representation-improvements.md`.

### FR-3D-009: Cached-Scene 3D Rendering
**Priority:** Critical — **Status:** Implemented — **Files:** `src/renderer3d.ts`, `src/index.ts`

The 3D renderer must separate surface building from drawing. The fractal is
sampled only when the viewport, iteration count, or canvas size changes
(`buildSurfaceFromIterations`, direct grid-resolution sampling with 2x2
supersampling, grid capped at 300 vertices per axis). Rotation, height-scale,
color-scheme, and 3D-zoom changes must reuse the cached surface:
- rotation / zoom → `draw()` only (re-project + depth-sort + paint)
- height scale → recompute normals + relight only
- color scheme → recolor + relight only

### FR-3D-010: Mesa Height Mapping
**Priority:** Critical — **Status:** Implemented — **Files:** `src/renderer3d.ts`

Normalized heights: set interior = plateau at 1.0; exterior = `(iter/max)^2.2`,
rising steeply toward the boundary so filaments read as ridges. World height =
`h * heightScale * 2.5`. Vertex colors derive from the smoothed height field
(inverse of the height curve) so color bands follow terrain contours.

### FR-3D-011: Terrain-Space Lighting
**Priority:** High — **Status:** Implemented — **Files:** `src/renderer3d.ts`

Smooth per-vertex normals from central differences of the smoothed height field
(terrain space, +z up, unit length — verified by tests). Three normalized
hillshade lights (weights 0.62/0.25/0.13), `ambientCoefficient = 0.22`,
`specularStrength = 0.35`, `shininess = 40` as named constants. Ambient+diffuse
baked per vertex in linear color space; per-triangle Phong specular using the
inverse-rotated view direction; single gamma (2.2) encode at composite time.

### FR-3D-012: Direct 3D Mouse Interaction
**Priority:** High — **Status:** Implemented — **Files:** `src/index.ts`

In 3D mode: drag orbits (yaw 0.4°/px, pitch 0.25°/px clamped 0–90°) with
decimated fast-quality redraws while dragging and a high-quality redraw on
release; scroll wheel zooms the view (0.3x–4x) with a 150 ms idle timer for the
final high-quality pass. Sliders stay in sync; arrow keys keep working. All
redraws are coalesced through `requestAnimationFrame`.

### FR-3D-013: Heightmap Path Parity
**Priority:** Medium — **Status:** Implemented — **Files:** `src/renderer3d.ts`, `src/index.ts`

The rectangle-selection heightmap surface must run the same median + Gaussian
smoothing and lighting pipeline as the iteration path, must be extracted from
the cached 2D image (selection overlay strokes must not leak into heights), and
must survive rotation / recolor / height-scale changes without being replaced
by the viewport surface.

### FR-3D-015: View Side Selection (Above / Underside)
**Priority:** Low — **Status:** Implemented — **Files:** `src/renderer3d.ts`, `src/index.ts`, `index.html`

A "View from Underside" checkbox in the 3D controls lets the user choose the
camera side. Default (unchecked) is the above-surface view. The switch is a
draw-time concern only — `Renderer3D.setViewSide('above' | 'below')` flips the
view-depth sign and the specular view direction; no fractal resampling occurs,
so toggling redraws instantly from the cached surface.

### FR-3D-014: Orbit-Correct Rotation Semantics
**Priority:** Medium — **Status:** Implemented — **Files:** `src/renderer3d.ts`

Rotation order is yaw (Z, around the terrain up-axis) → roll (Y) → pitch (X),
so heights always rise toward the top of the screen and yaw never flips the
terrain vertically. Default view: pitch 60°, yaw 180°.

---

## 2. Existing Functional Requirements (Baseline)

The following functional requirements describe the existing system capabilities that must not be regressed.

### FR-BASE-001: 2D Mandelbrot Rendering
The application renders the Mandelbrot set in 2D mode using Canvas 2D API with configurable:
- Center coordinates (real, imaginary)
- Zoom level
- Maximum iteration count
- Color scheme (13 available schemes)

### FR-BASE-002: 3D Heightmap Rendering
The application renders the Mandelbrot set as a 3D heightmap terrain using:
- Iteration count mapped to height
- Painter's algorithm for triangle rendering
- Perspective projection with configurable rotation and camera parameters

### FR-BASE-003: Rectangle Selection to 3D
Users can draw a rectangle on the 2D render and generate a 3D heightmap from the selected region using luminance-based height extraction.

### FR-BASE-004: Interactive Controls
- Mouse-based zoom and pan in 2D mode
- Keyboard navigation (WASD/arrow keys) in 3D mode
- UI controls for iterations, color scheme, height scale, smoothing level
- Toggle between 2D and 3D modes

### FR-BASE-005: Color Schemes
13 named color schemes are available, implemented in `src/colorSchemes.ts`. All schemes accept fractional ratio values and produce smooth color gradients.

---

## Non-Functional Requirements

### NFR-001: No External Dependencies
All rendering must use only the Canvas 2D API and native TypeScript/JavaScript. No WebGL, Three.js, or other external libraries.

### NFR-002: Performance
3D rendering at 1920x1080 must complete initial render in under 5 seconds on a standard desktop browser.

### NFR-003: Code Quality
- TypeScript strict mode compliance
- No `any` types
- Explicit return types on all methods
- Clear separation of concerns (smoothing, height mapping, rendering as distinct methods)
- Single-class-per-file pattern with named exports

### NFR-004: Build Compatibility
- Must compile with `npm run build` (tsc targeting ES2020)
- Must serve with `npm run serve` (port 8000)
- Import paths use `.js` extension
