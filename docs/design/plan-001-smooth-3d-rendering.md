# Plan 001: Smooth 3D Rendering for Mandelbrot Explorer

**Date:** 2026-03-14
**Status:** Ready for Implementation
**Priority:** High
**Based On:**
- `docs/reference/refined-request-smooth-3d-rendering.md`
- `docs/reference/investigation-smooth-3d-rendering.md`
- `docs/reference/codebase-scan-smooth-3d-rendering.md`

---

## Overview

This plan transforms the current spike-prone, jagged 3D heightmap renderer into a smooth, professional-quality fractal landscape visualization. The work is decomposed into seven phases (A through G) with explicit dependencies, file modifications, and verification criteria for each.

---

## Dependency Graph

```
Phase A: Smooth Iteration Count
    |
    v
Phase B: Height Function Redesign
    |
    +-------+-------+
    |               |
    v               v
Phase C:        Phase E:
Spike Detection   Grid Resolution
    |             (parallel with C/D)
    v
Phase D:
Enhanced Gaussian
Smoothing
    |
    +-------+-------+
    |               |
    v               v
Phase F:        Phase G:
Lighting        Background
Improvements    Gradient
(independent)   (independent)
```

**Critical path:** A -> B -> C -> D -> F
**Parallel tracks:** E can run alongside C/D; F and G are independent of each other.

---

## Phase A: Smooth (Continuous) Iteration Count

### Objective
Replace integer iteration counts with continuous floating-point values using the normalized iteration count formula, eliminating discrete height jumps and color banding.

### Rationale
This is the single highest-impact change. All downstream phases (height mapping, smoothing, lighting) benefit from continuous input data. Without this, smoothing algorithms fight against fundamental step discontinuities.

### Files Modified

| File | Symbol | Lines (approx.) | Change Description |
|---|---|---|---|
| `src/index.ts` | `MandelbrotExplorer.mandelbrotIteration()` | 533-549 | Increase bailout from `|z|^2 > 4` to `|z|^2 > 65536` (bailout radius 256). After escape, compute `n + 1 - log2(log2(magnitudeSquared) / 2)` and return floating-point result. Interior points still return `maxIterations`. |
| `src/index.ts` | `MandelbrotExplorer.calculateIterationData()` | 514-531 | No structural change needed -- `iterationData: number[][]` already supports floats. Verify no integer-casting occurs. |

### Implementation Details

1. Change the escape condition from `magnitudeSquared > 4` to `magnitudeSquared > 65536`.
2. When escape occurs, compute the smooth value:
   ```typescript
   const LOG2_HALF = Math.log2(0.5); // Precomputed constant
   const smoothValue = n + 1 - Math.log2(Math.log2(magnitudeSquared)) + LOG2_HALF;
   return Math.max(0, smoothValue);
   ```
3. Interior points (loop completes without escape) return `maxIterations` unchanged.
4. The `calculateIterationData()` method requires no changes since it stores `number[][]`.

### Impact on Existing Functionality

- **2D rendering (Path 2 via `MandelbrotCalculator`):** Unaffected. `MandelbrotCalculator.mandelbrotIteration()` in `src/mandelbrot.ts` is a separate, independent implementation used only by the 2D `calculate()` path.
- **2D rendering (Path 1 via `calculateWithColorScheme()`):** Must verify whether `calculateWithColorScheme()` calls `mandelbrotIteration()`. If it does, fractional values will flow into `ColorSchemes.getColor()` which already handles fractional ratios correctly.
- **Rectangle-to-3D path:** Indirectly improved -- the 2D render produces smoother color gradients, leading to smoother luminance-based heights.
- **Color schemes:** `ColorSchemes.getColor()` already accepts fractional ratio values. No changes needed in `src/colorSchemes.ts`.

### Acceptance Criteria

1. `mandelbrotIteration()` returns floating-point values (not integers) for escaping points.
2. Interior points return exactly `maxIterations`.
3. Smooth iteration values vary continuously across the complex plane (no visible integer banding in 3D heightmap).
4. The bailout radius is 256 (i.e., `magnitudeSquared > 65536`).
5. 2D rendering mode continues to work correctly.

### Verification

```bash
cd /Users/giorgosmarinos/aiwork/mandelbrot && npm run build
```
- Must compile without errors.
- Manual visual verification: toggle 3D mode and confirm no integer-banding step artifacts in the terrain.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Higher bailout radius increases iteration count, slowing computation | Medium | Low | The increase is minimal (a few extra iterations per pixel); bailout 256 is standard practice. |
| `calculateWithColorScheme()` calls `mandelbrotIteration()` and breaks 2D coloring | Low | Medium | Verify call chain during implementation. `ColorSchemes` handles fractional ratios. |

---

## Phase B: Height Function Redesign

### Objective
Replace the complex blended exponential/logarithmic/sinusoidal height curve with a single, tunable power-law function that works naturally with continuous iteration data.

### Dependencies
- **Requires Phase A** (smooth iteration counts provide the continuous input this function needs).

### Files Modified

| File | Symbol | Lines (approx.) | Change Description |
|---|---|---|---|
| `src/renderer3d.ts` | `Renderer3D.calculateSmoothHeight()` | 204-225 | Replace entire body with power-law curve: `heightScale * Math.pow(1 - ratio, exponent)`. |

### Implementation Details

1. Replace the existing method body:
   ```typescript
   private calculateSmoothHeight(
     smoothIteration: number,
     maxIterations: number,
     heightScale: number
   ): number {
     // Interior points (non-escaped) get height 0 (flat lake)
     if (smoothIteration >= maxIterations) {
       return 0;
     }

     // Normalize to [0, 1] range
     const ratio = smoothIteration / maxIterations;

     // Power curve: lower exponent = gentler slopes
     const exponent = 0.5;
     const height = heightScale * Math.pow(1 - ratio, exponent);

     return height;
   }
   ```
2. The exponent value of `0.5` produces balanced, natural-looking mountains. This can later be exposed as a UI parameter.
3. Interior points (`smoothIteration >= maxIterations`) map to height `0`, creating the flat "lake" effect.

### Acceptance Criteria

1. Height function uses a single power-law curve with configurable exponent.
2. Interior points (iterations >= maxIterations) produce height = 0.
3. No blended exponential/logarithmic/sinusoidal curves remain.
4. Terrain appears smooth and mountain-like at all zoom levels.

### Verification

```bash
cd /Users/giorgosmarinos/aiwork/mandelbrot && npm run build
```
- Must compile without errors.
- Visual: 3D terrain shows smooth, rounded mountain ridges with a flat interior "lake".

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Single exponent may not suit all zoom levels | Medium | Low | The exponent can be tuned later or exposed as a UI control. |

---

## Phase C: Spike Detection and Removal

### Objective
Add a pre-smoothing pass that identifies and replaces isolated height outliers (spikes) using a median filter approach.

### Dependencies
- **Requires Phase B** (the height function must be stable before applying spike detection on its output).

### Files Modified

| File | Symbol | Lines (approx.) | Change Description |
|---|---|---|---|
| `src/renderer3d.ts` | `Renderer3D.createSmoothHeightMap()` | 182-202 | Insert a median filter pass between height calculation and Gaussian smoothing. |
| `src/renderer3d.ts` | (new) `Renderer3D.applyMedianFilter()` | new method | Private method implementing a median filter with configurable radius (default: 2, producing a 5x5 window). |

### Implementation Details

1. Add a new private method `applyMedianFilter(heightMap: number[][], radius: number): number[][]`.
   - For each cell, collect all values in the `(2*radius+1) x (2*radius+1)` neighborhood.
   - Sort the collected values and replace the center cell with the median.
   - Use clamped boundary handling (edge pixels replicate the nearest valid pixel).
   - Default radius: 2 (5x5 window).

2. Modify `createSmoothHeightMap()` pipeline order:
   ```
   (a) Calculate heights via calculateSmoothHeight() for all cells
   (b) Apply median filter (NEW - spike removal)
   (c) Apply Gaussian smoothing (existing, enhanced in Phase D)
   ```

3. The median filter radius should be stored as a private property (e.g., `private medianFilterRadius: number = 2`).

### Acceptance Criteria

1. A `applyMedianFilter()` method exists with configurable radius.
2. The pipeline in `createSmoothHeightMap()` applies median filter before Gaussian smoothing.
3. Isolated spike vertices are eliminated from the heightmap.
4. The filter does not significantly distort non-spike regions.

### Verification

```bash
cd /Users/giorgosmarinos/aiwork/mandelbrot && npm run build
```
- Must compile without errors.
- Visual: 3D terrain should show no isolated vertical spikes.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Median filter is slow on large heightmaps | Medium | Medium | Grid resolution increase (Phase E) reduces the data size. With gridResolution=3, the heightmap is 9x smaller. |
| Over-aggressive median radius distorts terrain | Low | Medium | Keep default radius at 2 (5x5 window); larger values only for extreme cases. |

---

## Phase D: Enhanced Gaussian Smoothing

### Objective
Replace the current narrow, single-pass 2D Gaussian with a wider, multi-pass separable Gaussian implementation for more effective smoothing.

### Dependencies
- **Requires Phase C** (spike detection must precede smoothing to prevent spikes from "bleeding" into neighboring vertices).

### Files Modified

| File | Symbol | Lines (approx.) | Change Description |
|---|---|---|---|
| `src/renderer3d.ts` | `Renderer3D.applyGaussianSmoothing()` | 227-280 | Complete rewrite: separable 1D horizontal + vertical passes, configurable radius/sigma/passes. |
| `src/renderer3d.ts` | `Renderer3D.smoothingRadius` | 28 | Change default from `2` to `4`. |
| `src/renderer3d.ts` | (new) `Renderer3D.smoothingPasses` | new property | Private property, default `2`. |

### Implementation Details

1. Replace the existing 2D convolution with a separable implementation:
   - **Build 1D kernel:** Gaussian with `sigma = radius / 2` (changed from `radius / 3`).
   - **Horizontal pass:** Convolve each row with the 1D kernel.
   - **Vertical pass:** Convolve each column of the horizontal result with the same 1D kernel.
   - **Multi-pass:** Repeat horizontal+vertical for `smoothingPasses` iterations (default: 2).

2. New method signature:
   ```typescript
   private applyGaussianSmoothing(
     heightMap: number[][],
     radius: number,
     sigma: number,
     passes: number
   ): number[][]
   ```

3. Add two private helper methods:
   - `private convolve1DHorizontal(data: number[][], kernel: number[], radius: number): number[][]`
   - `private convolve1DVertical(data: number[][], kernel: number[], radius: number): number[][]`

4. Update default parameters:
   - `smoothingRadius`: `2` -> `4` (9x9 effective kernel per pass)
   - `sigma`: `radius / 3` -> `radius / 2` (broader bell curve)
   - Add `smoothingPasses = 2`

5. Update `createSmoothHeightMap()` to call the new signature.

### Performance Analysis

| Approach | Operations per pixel (radius=4) | Total for 640x360 grid (gridRes=3, 1920x1080) |
|---|---|---|
| Current 2D kernel | 81 multiplications | ~18.6M ops |
| Separable 1D (1 pass) | 18 multiplications | ~4.1M ops |
| Separable 1D (2 passes) | 36 multiplications | ~8.3M ops |

The separable implementation with 2 passes is still 2x faster than the current single-pass 2D kernel, while providing significantly better smoothing.

### Acceptance Criteria

1. Gaussian smoothing uses separable 1D passes (horizontal + vertical).
2. Default radius is 4, sigma is `radius / 2`, passes is 2.
3. Multi-pass smoothing is supported and configurable.
4. The heightmap surface is visibly smoother than with the previous 5x5 kernel.
5. No performance regression (should be faster due to separable implementation + grid resolution increase from Phase E).

### Verification

```bash
cd /Users/giorgosmarinos/aiwork/mandelbrot && npm run build
```
- Must compile without errors.
- Visual: terrain surfaces flow smoothly without visible noise or jagged edges.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Over-smoothing loses fine fractal detail | Medium | Medium | Radius and passes are configurable; tune empirically. Consider exposing smoothing level in UI. |

---

## Phase E: Grid Resolution Optimization

### Objective
Increase the default grid resolution (downsampling factor) from 1 to 3, using area-averaging to reduce vertex count and naturally suppress noise.

### Dependencies
- **Requires Phase B** (height function must be stable).
- **Can run in parallel with Phases C and D** (independent of the smoothing pipeline).

### Files Modified

| File | Symbol | Lines (approx.) | Change Description |
|---|---|---|---|
| `src/renderer3d.ts` | `Renderer3D.gridResolution` | 27 | Change default from `1` to `3`. |
| `src/renderer3d.ts` | `Renderer3D.createGridPoints()` | 109-141 | Verify or update to use area-averaging when sampling iteration data at grid resolution > 1. |
| `src/renderer3d.ts` | (new) `Renderer3D.downsampleWithAreaAverage()` | new method | Private method that area-averages iteration data into a coarser grid. |

### Implementation Details

1. Change `gridResolution` default from `1` to `3`.

2. Add `downsampleWithAreaAverage()`:
   ```typescript
   private downsampleWithAreaAverage(
     iterationData: number[][],
     width: number,
     height: number,
     gridResolution: number
   ): number[][]
   ```
   - For each grid cell, average all `gridResolution x gridResolution` pixels within that cell.
   - Handle boundary cells where the cell extends beyond the data dimensions.

3. Modify `createGridPoints()` to call `downsampleWithAreaAverage()` instead of point-sampling at grid intervals.

4. The downsampled data feeds into `createSmoothHeightMap()` which then applies spike detection and Gaussian smoothing on the reduced-size grid.

### Performance Impact

| Grid Resolution | Vertices (1920x1080) | Triangles | Speedup vs. gridRes=1 |
|---|---|---|---|
| 1 (current) | ~2,073,600 | ~4,147,200 | 1x (baseline) |
| 3 (proposed) | ~230,400 | ~460,800 | ~9x |
| 4 (alternative) | ~129,600 | ~259,200 | ~16x |

### Acceptance Criteria

1. Default `gridResolution` is 3.
2. Downsampling uses area-averaging (not point-sampling).
3. Terrain appearance is smooth with no visible loss of fractal character.
4. Rendering performance improves noticeably (fewer triangles to sort and draw).
5. `gridResolution` remains configurable for fine-tuning.

### Verification

```bash
cd /Users/giorgosmarinos/aiwork/mandelbrot && npm run build
```
- Must compile without errors.
- Visual: terrain appears smooth, rendering is noticeably faster.
- Verify vertex count is ~9x lower by inspecting the grid dimensions in the code or adding a console log during development.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| gridResolution=3 loses too much detail at high zoom | Low | Medium | Keep gridResolution configurable; users can reduce to 2 or 1 for detail. |
| Area-averaging mixes interior and exterior points at set boundary | Medium | Low | Interior points (maxIterations) are handled explicitly in height function (height=0). Mixed cells will have intermediate heights, creating a natural slope at the boundary. |

---

## Phase F: Lighting Improvements

### Objective
Add specular highlights and improve the ambient lighting term for a more realistic, "porcelain" surface appearance.

### Dependencies
- **Should come after Phases A-D** (the heightmap pipeline must be stable before tuning visual appearance).
- **Independent of Phase G** (background changes).

### Files Modified

| File | Symbol | Lines (approx.) | Change Description |
|---|---|---|---|
| `src/renderer3d.ts` | `Renderer3D.renderTriangle()` | (rendering section) | Add Phong specular calculation to the existing diffuse lighting. |
| `src/renderer3d.ts` | `Renderer3D.renderSurface()` | (rendering section) | Compute vertex normals for smooth normal averaging per triangle. |
| `src/renderer3d.ts` | (new) `Renderer3D.calculateVertexNormals()` | new method | Compute averaged normals at each vertex from adjacent face normals. |
| `src/renderer3d.ts` | (new) `Renderer3D.calculatePhongLighting()` | new method | Compute ambient + diffuse + specular lighting per triangle using averaged vertex normals. |

### Implementation Details

1. **Vertex Normals:** Add `calculateVertexNormals(gridPoints: Point3D[][]): Vector3[][]` that:
   - For each vertex, collects face normals of all adjacent triangles (up to 6 for interior vertices).
   - Averages and normalizes to produce a smooth vertex normal.

2. **Per-Triangle Smooth Normal:** For each triangle, average its three vertex normals to get a "smooth triangle normal" (Option D from investigation -- simplified Phong).

3. **Phong Lighting:** Add `calculatePhongLighting()` that computes:
   - **Ambient:** `k_a * baseColor` with `k_a = 0.25`
   - **Diffuse:** `k_d * baseColor * max(0, N dot L)` with `k_d = 0.6`
   - **Specular:** `k_s * max(0, R dot V)^shininess` with `k_s = 0.4`, `shininess = 40`
   - Light direction: primary light from upper-left-front.

4. **Integration:** Modify `renderTriangle()` to use the new Phong calculation instead of the existing simple diffuse-only lighting.

5. Store lighting parameters as private properties:
   ```typescript
   private readonly ambientCoefficient: number = 0.25;
   private readonly diffuseCoefficient: number = 0.6;
   private readonly specularCoefficient: number = 0.4;
   private readonly shininess: number = 40;
   ```

### Acceptance Criteria

1. Specular highlights are visible on the terrain surface (bright spots on ridges facing the light).
2. Ambient lighting provides a base illumination that prevents fully black areas.
3. The overall appearance is richer and more three-dimensional than before.
4. Lighting parameters are stored as named constants (not magic numbers).
5. Existing color schemes continue to render correctly with the new lighting.

### Verification

```bash
cd /Users/giorgosmarinos/aiwork/mandelbrot && npm run build
```
- Must compile without errors.
- Visual: terrain shows visible specular highlights, smooth shading transitions, no fully black areas.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Specular highlights overpower base colors on some schemes | Medium | Medium | Tune `k_s` and `shininess` empirically. Lower `k_s` for subtler highlights. |
| Vertex normal computation adds overhead | Low | Low | With gridResolution=3, the vertex count is manageable (~230K). Normal computation is O(vertices). |

---

## Phase G: Background Gradient

### Objective
Replace the current dark-to-dark gradient background with a warm orange-to-dark sky gradient that evokes a sunset landscape aesthetic.

### Dependencies
- **Independent of other phases** but best applied after the heightmap pipeline is stable (after Phase D).
- **Independent of Phase F** (can be done in parallel).

### Files Modified

| File | Symbol | Lines (approx.) | Change Description |
|---|---|---|---|
| `src/renderer3d.ts` | `Renderer3D.drawBackground()` | 100-107 | Replace the dark gradient color stops with warm sunset gradient stops. |

### Implementation Details

1. Replace the existing gradient:
   ```typescript
   // Current: #0a0a0a to #1a1a2e (dark to dark-blue)

   // New: warm sunset gradient
   gradient.addColorStop(0, '#1a0f0a');      // Dark brown/black at top
   gradient.addColorStop(0.3, '#2d1810');    // Deep brown
   gradient.addColorStop(0.5, '#4a2818');    // Brown
   gradient.addColorStop(0.7, '#8a4520');    // Orange-brown
   gradient.addColorStop(0.85, '#c9692a');   // Warm orange
   gradient.addColorStop(1.0, '#e89a5a');    // Light amber at bottom
   ```

2. Optionally add a decorative gradient sphere/orb in the background (low priority):
   ```typescript
   private drawDecorativeSphere(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void
   ```

### Acceptance Criteria

1. Background displays a warm gradient transitioning from dark at the top to warm orange/amber at the bottom.
2. The gradient complements all existing color schemes without clashing.
3. The `drawBackground()` method remains a simple, self-contained method.
4. Optional: decorative sphere element adds visual depth.

### Verification

```bash
cd /Users/giorgosmarinos/aiwork/mandelbrot && npm run build
```
- Must compile without errors.
- Visual: background shows warm sunset-like gradient.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Warm background clashes with certain color schemes | Low | Low | Use neutral warm tones. The terrain surface covers most of the viewport anyway. |

---

## Implementation Schedule

### Recommended Execution Order

| Order | Phase | Effort Estimate | Depends On | Can Parallel With |
|---|---|---|---|---|
| 1 | **A: Smooth Iteration Count** | Small (1 method change) | None | Nothing (must be first) |
| 2 | **B: Height Function Redesign** | Small (1 method rewrite) | A | Nothing |
| 3a | **C: Spike Detection** | Medium (1 new method + pipeline change) | B | E |
| 3b | **E: Grid Resolution** | Medium (1 new method + property change) | B | C, D |
| 4 | **D: Enhanced Gaussian** | Medium (method rewrite + 2 helpers) | C | E |
| 5a | **F: Lighting Improvements** | Large (2 new methods + integration) | D | G |
| 5b | **G: Background Gradient** | Small (method rewrite) | D | F |

### Total Files Modified

| File | Phases Affecting It | Summary of Changes |
|---|---|---|
| `src/index.ts` | A | `mandelbrotIteration()`: smooth iteration formula with increased bailout. |
| `src/renderer3d.ts` | B, C, D, E, F, G | Major changes across multiple methods and new methods. |
| `src/colorSchemes.ts` | None | No changes required. |
| `src/mandelbrot.ts` | None | No changes required. |
| `index.html` | None (optional) | Optionally add UI controls for smoothing parameters in a future follow-up. |

### New Private Methods in `Renderer3D`

| Method | Phase | Purpose |
|---|---|---|
| `applyMedianFilter()` | C | Spike removal via median filter |
| `convolve1DHorizontal()` | D | Horizontal Gaussian pass |
| `convolve1DVertical()` | D | Vertical Gaussian pass |
| `downsampleWithAreaAverage()` | E | Area-averaged grid downsampling |
| `calculateVertexNormals()` | F | Smooth vertex normal computation |
| `calculatePhongLighting()` | F | Full Phong (ambient + diffuse + specular) |
| `drawDecorativeSphere()` | G (optional) | Background decorative element |

---

## Global Verification Criteria

After all phases are complete, the following must hold:

1. **Build:** `npm run build` completes without errors or warnings.
2. **Serve:** `npm run serve` starts the server on port 8000 and the application loads in a browser.
3. **2D Mode:** 2D rendering is completely unaffected by any changes. All 13 color schemes render correctly.
4. **3D Mode (full canvas):** Toggling 3D mode produces a smooth, spike-free heightmap with:
   - No random vertical spikes
   - Smooth, mountain-like ridges along fractal boundaries
   - Flat dark "lake" for the Mandelbrot set interior
   - Visible specular highlights on the terrain
   - Warm gradient background
5. **3D Mode (rectangle selection):** The rectangle-to-3D workflow continues to function. The rendered terrain benefits indirectly from smoother 2D output.
6. **Controls:** All existing controls work: rotation, height scale, smoothing level, keyboard navigation (WASD/arrow keys), color scheme selection, iteration count adjustment.
7. **Performance:** Initial 3D render completes in under 5 seconds on a standard desktop browser at 1920x1080.
8. **Code Quality:** No `any` types, all methods have explicit return types, TypeScript strict mode compliance.

---

## Global Risk Summary

| Risk | Phase | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 2D rendering regression | A | Low | High | Verify `calculateWithColorScheme()` call chain; `ColorSchemes` handles fractional ratios |
| Over-smoothing loses fractal detail | C, D | Medium | Medium | All smoothing parameters are configurable; tune empirically |
| Performance regression from smoothing passes | D | Low | Medium | Separable Gaussian is faster than current 2D kernel; grid resolution reduces data size |
| Lighting clashes with some color schemes | F | Medium | Low | Tune specular coefficient; test all 13 schemes |
| Background clashes with color schemes | G | Low | Low | Use neutral warm tones |
| Area averaging at set boundary creates artifacts | E | Medium | Low | Interior points map to height=0; mixed cells create natural slopes |

---

## Post-Implementation Follow-Up (Out of Scope for This Plan)

These items are identified for future consideration but are NOT part of the current plan:

1. **UI controls for new parameters:** Expose smoothing radius, smoothing passes, median filter radius, height exponent, and lighting parameters as UI sliders in `index.html`.
2. **Gamma correction:** Perform lighting calculations in linear color space with sRGB gamma correction for more physically accurate rendering.
3. **Height-based ambient occlusion:** Darken valleys with a simple `pow(heightRatio, 0.5)` ambient adjustment.
4. **Bilateral filter polish pass:** Optional edge-preserving smoothing after Gaussian for sharper ridges (performance cost must be evaluated).
5. **`MandelbrotCalculator` sync:** Consider updating `src/mandelbrot.ts` `mandelbrotIteration()` to also use smooth iteration counts for consistency, if the 2D `calculate()` path would benefit.
