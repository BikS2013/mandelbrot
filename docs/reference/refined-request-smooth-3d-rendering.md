# Refined Request: Smooth 3D Rendering for Mandelbrot Explorer

**Date:** 2026-03-14
**Status:** Ready for Implementation
**Priority:** High
**Affected File:** `src/renderer3d.ts` (primary), `src/index.ts` (secondary)

---

## 1. Problem Statement

The current 3D heightmap renderer in `src/renderer3d.ts` produces **random spikes** and jagged, unnatural surfaces when visualizing the Mandelbrot set as a 3D landscape. The user expects smooth, flowing mountain-like terrain with organic contours -- similar to professional-quality 3D Mandelbrot heightmap renderings found in fractal art.

### Current Defects Observed

1. **Random height spikes** -- isolated pixels with drastically different iteration counts create sharp vertical spikes in the mesh.
2. **Insufficient smoothing** -- the Gaussian kernel with `radius=2` and `sigma = radius/3 ~ 0.67` is too narrow to eliminate spikes caused by large local iteration count differences.
3. **Height function produces abrupt transitions** -- `calculateSmoothHeight()` maps raw iteration counts through blended exponential/logarithmic/sinusoidal curves, but the raw iteration data itself has discontinuities (e.g., a pixel at iteration 5 next to one at iteration 95) that these curves do not address.
4. **No outlier/spike detection** -- no mechanism to detect and suppress isolated extreme-height points before they enter the mesh.
5. **Grid resolution of 1** -- every pixel becomes a mesh vertex, meaning single-pixel noise maps directly to single-vertex spikes.
6. **No continuous (smooth) iteration algorithm** -- the Mandelbrot iteration function in `src/index.ts` returns integer iteration counts, causing banding and step artifacts in the heightmap.

---

## 2. Target Quality (Reference Image Characteristics)

The desired output should exhibit:

| Property | Description |
|---|---|
| **Surface continuity** | No isolated spikes; surfaces flow smoothly between adjacent vertices |
| **Organic ridges** | Mountain-like ridges along fractal boundaries with smooth, rounded contours |
| **Flat interior ("lake")** | The Mandelbrot set interior (iterations == maxIterations) renders as a dark, flat plane at z=0 |
| **Smooth gradients** | Colors and shading transition smoothly across the surface without banding |
| **Professional lighting** | Multi-directional Phong-like illumination producing realistic highlights and shadows |
| **Gradient sky/background** | Warm-to-dark gradient background (orange to dark) instead of the current dark-to-dark |
| **Decorative elements** | Optional: a decorative sphere or similar element in the background for visual depth |
| **Photorealistic landscape feel** | The overall rendering looks like a 3D terrain flyover, not a mathematical wireframe |

---

## 3. Root Cause Analysis

### 3.1 Integer Iteration Counts (Primary Cause)

**Location:** `src/index.ts`, method `mandelbrotIteration()`, lines 534-550.

The iteration function returns an integer `n` when the escape condition is met. Adjacent pixels can have iteration counts that differ by large amounts (e.g., 5 vs. 95) even though they are spatially close. When mapped to height, this creates cliffs and spikes.

**Required fix:** Implement **normalized iteration count** (also known as "smooth iteration count" or "continuous potential") using the formula:

```
smoothIteration = n + 1 - log(log(|z|)) / log(2)
```

This produces a floating-point iteration value that varies continuously across the complex plane, eliminating integer banding.

### 3.2 Insufficient Gaussian Smoothing (Contributing Cause)

**Location:** `src/renderer3d.ts`, method `applyGaussianSmoothing()`, lines 228-281.

- `smoothingRadius = 2` (5x5 kernel) is too small to absorb spikes spanning multiple pixels.
- `sigma = radius / 3` is too tight -- values at the kernel edges contribute almost nothing.
- Only one pass of smoothing is applied.

**Required fix:**
- Increase default smoothing radius to at least 4-6 (9x9 to 13x13 kernel).
- Use `sigma = radius / 2` for a broader bell curve.
- Apply multiple passes (2-3) of Gaussian smoothing for more aggressive spike suppression.
- Consider separable Gaussian (two 1D passes instead of one 2D pass) for performance.

### 3.3 No Outlier Detection (Contributing Cause)

**Location:** `src/renderer3d.ts`, method `createSmoothHeightMap()`, lines 183-203.

There is no mechanism to detect and clamp height values that are statistical outliers relative to their neighbors.

**Required fix:** Before Gaussian smoothing, apply a **median filter** or **spike detection pass** that identifies vertices whose height deviates from their local neighborhood mean by more than a configurable threshold (e.g., 2x the local standard deviation), and clamp or replace those values.

### 3.4 Grid Resolution Too Fine (Contributing Cause)

**Location:** `src/renderer3d.ts`, property `gridResolution = 1`, line 27.

Every screen pixel is a mesh vertex. For a 1920x1080 canvas, this produces ~2M vertices and ~4M triangles, which is:
- Slow to render with the painter's algorithm on a 2D canvas.
- Unnecessarily fine-grained, amplifying single-pixel noise.

**Required fix:**
- Increase `gridResolution` to 2-4 by default (effectively downsampling the mesh).
- Before creating mesh vertices, downsample the iteration data using area-averaging (not point-sampling) to naturally suppress noise.

### 3.5 Height Function Curve Shape (Minor Cause)

**Location:** `src/renderer3d.ts`, method `calculateSmoothHeight()`, lines 205-226.

The current blend of exponential, logarithmic, and sinusoidal curves with a "smoothingFactor" based on maxIterations adds complexity but does not address the fundamental issue of discontinuous input data. Once continuous iteration counts are provided, a simpler and more predictable height function can be used.

**Required fix:** With continuous iteration counts, simplify to:
```
height = heightScale * pow(1 - (smoothIteration / maxIterations), exponent)
```
where `exponent` (e.g., 0.4-0.6) controls the terrain profile. Lower exponents produce gentler slopes.

---

## 4. Functional Requirements

### FR-1: Continuous Iteration Count
- Modify the Mandelbrot iteration function to return a floating-point "smooth iteration count" instead of an integer.
- The formula must use the escape radius and final |z| value to interpolate between integer iterations.
- Interior points (non-escaping) must still return exactly `maxIterations`.

### FR-2: Multi-Pass Gaussian Smoothing with Configurable Parameters
- The smoothing radius must be configurable (default: 4-6 pixels).
- Sigma should default to `radius / 2`.
- Support multiple smoothing passes (default: 2).
- Consider separable implementation for performance.

### FR-3: Spike Detection and Suppression
- Before smoothing, run a pass that detects height values deviating significantly from their local neighborhood.
- Replace outlier values with the local median or clamped mean.
- The detection threshold must be configurable.

### FR-4: Grid Resolution / Mesh Downsampling
- Increase the default grid resolution to reduce vertex count.
- When downsampling, use area-averaging of the continuous iteration data (not point-sampling).
- The grid resolution must remain user-configurable.

### FR-5: Simplified Height Mapping Function
- Replace the current multi-function blend with a single power-curve function once FR-1 is in place.
- Mandelbrot set interior points must map to height = 0 (flat lake).
- The exponent must be configurable.

### FR-6: Background Enhancement
- Replace the current dark gradient background with a warm gradient (e.g., dark at top transitioning to warm orange/amber near the horizon).
- Optionally add a decorative sphere or glow element in the background.

### FR-7: Preserve Existing Functionality
- The 2D rendering mode must remain unaffected.
- All existing color schemes must continue to work with 3D mode.
- Existing controls (rotation, height scale, smoothing level, keyboard navigation) must remain functional.
- The rectangle-selection-to-3D workflow must continue to work.

---

## 5. Non-Functional Requirements

### NFR-1: No External Dependencies
- All changes must use only the Canvas 2D API and native TypeScript/JavaScript.
- No WebGL, Three.js, or other libraries.

### NFR-2: Performance
- Rendering time for a 1920x1080 canvas in 3D mode should remain interactive (under 5 seconds for initial render).
- Performance may be improved by reducing vertex count via grid resolution increase.

### NFR-3: Code Quality
- TypeScript strict mode compliance.
- No `any` types.
- Clear separation of concerns (smoothing, height mapping, rendering remain distinct methods).

### NFR-4: Build Compatibility
- Must compile with `npm run build` (tsc with ES2020 target).
- Must serve with `npm run serve` (port 8000).

---

## 6. Affected Files and Scope

| File | Changes |
|---|---|
| `src/index.ts` | Modify `mandelbrotIteration()` to return smooth (floating-point) iteration count. Modify `calculateIterationData()` to store float values. |
| `src/renderer3d.ts` | Major changes: spike detection, enhanced smoothing, simplified height function, background gradient, grid resolution tuning. |
| `src/colorSchemes.ts` | No changes required (already handles fractional ratios). |
| `src/mandelbrot.ts` | No changes required (the `MandelbrotCalculator` class is used for the basic `calculate()` path which returns image data, not iteration counts). |
| `index.html` | Potentially add UI controls for new parameters (smoothing passes, spike threshold) -- optional, can use sensible defaults. |

---

## 7. Implementation Strategy (Recommended Order)

1. **Phase 1 -- Continuous iteration count** (FR-1): Modify `mandelbrotIteration()` in `src/index.ts` to return smooth floats. This is the single highest-impact change.

2. **Phase 2 -- Spike detection** (FR-3): Add a pre-smoothing pass in `src/renderer3d.ts` that detects and clamps outlier heights.

3. **Phase 3 -- Enhanced smoothing** (FR-2): Increase kernel size, adjust sigma, add multi-pass support.

4. **Phase 4 -- Grid resolution and downsampling** (FR-4): Increase default `gridResolution`, implement area-averaged downsampling.

5. **Phase 5 -- Simplified height function** (FR-5): Replace the current blended curve with a single power function.

6. **Phase 6 -- Background enhancement** (FR-6): Update `drawBackground()` with warm gradient and optional decorative elements.

7. **Phase 7 -- Testing and tuning**: Verify smooth output across different zoom levels, iteration counts, and color schemes.

---

## 8. Acceptance Criteria

1. The 3D rendering shows **no random spikes** -- surfaces are smooth and continuous.
2. The Mandelbrot set interior ("lake") renders as a flat dark area at the base.
3. Fractal boundaries form smooth mountain-like ridges with organic contours.
4. Color gradients across the surface are smooth, without visible banding.
5. The background uses a warm gradient.
6. 2D rendering mode is completely unaffected by the changes.
7. All existing controls and interaction modes work correctly.
8. The project builds cleanly with `npm run build`.
9. Performance remains interactive on a standard desktop browser.

---

## 9. Key Technical References

- **Smooth iteration count formula**: `n + 1 - log2(log2(|z|))` where `|z|` is the escape magnitude.
- **Normalized iteration count**: Often called "continuous potential" in fractal literature.
- **Median filter**: Standard image processing technique for impulse noise removal -- effective against isolated spikes.
- **Gaussian smoothing**: Separable kernel implementation for O(n*r) instead of O(n*r^2) per pixel.

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Continuous iteration changes break 2D coloring | The ColorSchemes already handle fractional ratios; verify visually |
| Over-smoothing loses fractal detail | Make smoothing parameters configurable; tune empirically |
| Performance regression from multi-pass smoothing | Use separable Gaussian; offset with increased grid resolution |
| Background changes clash with certain color schemes | Use neutral warm tones that complement most schemes |
