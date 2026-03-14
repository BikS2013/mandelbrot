# Technical Investigation: Smooth 3D Heightmap Rendering of Mandelbrot Set on Canvas 2D

**Date:** 2026-03-14
**Author:** Technical Research Team
**Purpose:** Comprehensive investigation of techniques for producing smooth, professional-quality 3D heightmap renderings of the Mandelbrot set using only Canvas 2D API (no WebGL)

---

## Executive Summary

This investigation addresses seven critical technical areas required to transform the current spike-prone, jagged 3D Mandelbrot heightmap renderer into a smooth, professional-quality visualization resembling classic fractal landscape art. The research identifies specific algorithms, formulas, and implementation strategies suitable for Canvas 2D software rendering.

### Key Findings Summary

| Area | Recommended Solution | Impact |
|------|---------------------|---------|
| **Smooth Iteration Count** | `n + 1 - log2(log2(\|z\|))` with bailout radius 256+ | **Critical** - Eliminates discrete height jumps |
| **Smoothing Technique** | Separable Gaussian (2-3 passes, radius 4-6, sigma=radius/2) | **High** - Removes remaining noise efficiently |
| **Spike Detection** | MAD-based outlier detection (threshold: 2.5-3.0 MAD) | **High** - Removes statistical outliers before smoothing |
| **Grid Resolution** | Downsample to gridResolution=3-4 using area averaging | **Medium** - Reduces noise and improves performance |
| **Height Mapping** | Power curve: `height = heightScale * pow(1 - ratio, 0.5)` | **Medium** - Produces smooth, natural terrain |
| **Lighting** | Multi-light Phong with interpolated vertex normals | **High** - Creates realistic surface appearance |
| **Background** | Warm gradient (orange to dark) with optional glow element | **Low** - Aesthetic enhancement |

---

## 1. Smooth/Continuous Iteration Count

### Problem Statement
The current implementation returns integer iteration counts, causing adjacent pixels to have drastically different heights (e.g., 5 vs. 95), which creates sharp cliffs and spikes in the heightmap.

### The Solution: Normalized Iteration Count

The smooth iteration count (also called "continuous potential" or "normalized iteration count") produces a floating-point value that varies continuously across the complex plane.

#### Mathematical Derivation

For the Mandelbrot set iteration `z_{n+1} = z_n^2 + c`:

**Basic Formula:**
```
smoothIteration = n + 1 - log(log(|z|)) / log(2)
```

Where:
- `n` = integer iteration count at escape
- `|z|` = magnitude of the complex number when it escaped
- Escape condition: `|z| > bailout_radius`

**Generalized Formula (for polynomial degree d):**
```
smoothIteration = n + 1 - log_d(log_B(|z_n|))
```

Where:
- `d` = polynomial degree (2 for standard Mandelbrot)
- `B` = bailout radius
- For d=2, this simplifies to the formula above using log base 2

#### Why It Works

When a point escapes beyond the bailout radius, the iteration behaves approximately as `f(z) ≈ z^d` (the leading term dominates). Each iteration multiplies the magnitude by approximately `|z|^d`.

The double logarithm:
1. **First log**: Maps the escape magnitude to a linear scale
2. **Second log**: Compensates for the exponential growth rate between iterations

This creates a fractional component that represents "how far into the next iteration" the point has progressed, smoothly varying from 0 to 1.

#### Optimal Bailout Radius

**Minimum for accuracy:** The standard bailout of 2 (or 4 for `|z|^2`) works mathematically but provides poor accuracy for the smooth formula.

**Recommended bailout radius:** 256 or higher

**Rationale:**
- At higher bailout radii, the approximation `f(z) ≈ z^d` becomes more accurate
- The leading term overwhelms lower-order terms
- Linas Vepstas' research shows error decreases **double-exponentially** with each iteration past the bailout
- With bailout=10 and 4 extra iterations, error is ~1 part in 10^32

**Implementation trade-off:**
- Higher bailout = more iterations = slower computation
- Bailout of 256 provides excellent accuracy without excessive performance cost
- Can use `|z|^2 > 65536` to avoid square root computation

#### Optimized Implementation for Standard Mandelbrot (d=2)

```typescript
// Optimized formula avoiding some logarithm computations
const B = 256.0;
const LOG_B = Math.log2(B); // Precompute: log2(256) = 8

function mandelbrotIterationSmooth(
  c: Complex,
  maxIterations: number
): number {
  let z = { real: 0, imag: 0 };
  let n = 0;

  for (n = 0; n < maxIterations; n++) {
    const zReal2 = z.real * z.real;
    const zImag2 = z.imag * z.imag;
    const magnitudeSquared = zReal2 + zImag2;

    // Escape check using squared magnitude
    if (magnitudeSquared > B * B) {
      // Smooth iteration formula (using |z|^2 directly)
      // smoothIteration = n + 1 - log2(log2(|z|^2)) / 2 + constant
      const smoothValue = n + 1 - Math.log2(Math.log2(magnitudeSquared)) / 2 + LOG_B;
      return smoothValue;
    }

    // Standard Mandelbrot iteration
    z.imag = 2 * z.real * z.imag + c.imag;
    z.real = zReal2 - zImag2 + c.real;
  }

  // Interior point - not escaped
  return maxIterations;
}
```

**Key optimizations:**
- Uses `|z|^2` directly, avoiding square root
- Precomputes `log2(B)` as a constant
- Formula adjusted for squared magnitude: division by 2 in the log-log term

#### Effect on Coloring and Height Mapping

**2D Coloring:** Color schemes using `ratio = smoothIteration / maxIterations` will produce smooth gradients without banding. The existing ColorSchemes already handle fractional ratios correctly.

**3D Height Mapping:** The smooth iteration count eliminates step-artifacts in the heightmap, allowing subsequent smoothing operations to be far more effective.

#### Continuity Analysis

The smooth iteration count is continuous everywhere except at the boundary of the Mandelbrot set. As a point approaches a band boundary:
- From inside the band (lower n): smooth value approaches n
- From outside the band (higher n): smooth value approaches n from n-1
- At the boundary: smooth value equals exactly n

This ensures seamless transitions between iteration bands.

#### References and Validation

The formula is well-established in fractal literature:
- **Inigo Quilez** (graphics programmer, Shadertoy): Detailed derivation and shader implementation
- **Ruben van Nieuwpoort**: Mathematical derivation with continuity proof
- **Linas Vepstas**: Analysis using spectral theory and error bounds
- **Wikipedia - Plotting algorithms for the Mandelbrot set**: Standard reference

---

## 2. Height Map Smoothing Techniques

### Overview of Smoothing Methods

Multiple smoothing techniques can be applied to heightmaps. For Canvas 2D software rendering, computational efficiency is critical.

### Option A: Gaussian Blur

#### Description
Convolves the heightmap with a Gaussian kernel, producing weighted averages where weights follow a bell curve distribution.

#### Mathematical Formula

**2D Gaussian kernel:**
```
G(x, y) = (1 / (2π σ^2)) * exp(-(x^2 + y^2) / (2σ^2))
```

Where:
- `σ` (sigma) = standard deviation, controls blur spread
- `x, y` = offsets from center pixel
- Kernel size: typically `radius = 2-3 σ`

**Separable implementation** (much faster):
1. Apply 1D horizontal Gaussian pass
2. Apply 1D vertical Gaussian pass on result

#### Performance Analysis

| Implementation | Complexity per pixel | Notes |
|----------------|---------------------|--------|
| 2D kernel (radius r) | O(r²) | Direct convolution, 81 samples for r=4 |
| Separable 1D (radius r) | O(2r) | Two 1D passes, 18 samples for r=4 |
| Multi-pass separable | O(2rp) | p passes, each with 2r samples |

**Separable implementation is 4-5x faster** for typical kernel sizes.

#### Recommended Parameters

Based on heightmap smoothing literature and image processing best practices:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Radius** | 4-6 pixels | Wide enough to smooth spikes, not so wide as to blur fractal detail |
| **Sigma** | `radius / 2` | Standard relationship: kernel extends to ~3σ |
| **Passes** | 2-3 | Multiple narrow passes approximate one wide pass |
| **Implementation** | Separable | 4-5x performance improvement |

**Example configurations:**
- **Conservative**: radius=4, sigma=2, passes=2
- **Aggressive**: radius=6, sigma=3, passes=3

#### Current Implementation Issues

The existing `applyGaussianSmoothing()` in `renderer3d.ts`:
- Radius = 2 (5x5 kernel) - **too narrow**
- Sigma = radius/3 ≈ 0.67 - **too tight**, edge pixels contribute almost nothing
- Single pass - **insufficient for spike removal**
- Non-separable - **slower than necessary**

#### Pseudocode for Separable Gaussian

```typescript
function applyGaussianSmoothingSeparable(
  heightMap: number[][],
  radius: number,
  sigma: number,
  passes: number
): number[][] {

  let result = heightMap;

  // Build 1D Gaussian kernel
  const kernel = new Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const value = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = value;
    sum += value;
  }
  // Normalize
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }

  // Apply multiple passes
  for (let pass = 0; pass < passes; pass++) {
    // Horizontal pass
    result = convolve1DHorizontal(result, kernel, radius);
    // Vertical pass
    result = convolve1DVertical(result, kernel, radius);
  }

  return result;
}
```

### Option B: Bilateral Filter

#### Description
Edge-preserving smoothing that considers both spatial proximity and intensity similarity. Smooths flat areas while preserving sharp edges.

#### Formula
```
BF[I]_p = (1/W_p) * Σ_q (G_σs(||p - q||) * G_σr(|I_p - I_q|) * I_q)
```

Where:
- `G_σs` = spatial Gaussian (distance-based weight)
- `G_σr` = range Gaussian (intensity-based weight)
- `W_p` = normalization factor

#### Advantages
- Preserves fractal boundary ridges (edges)
- Smooths flat regions aggressively
- Better visual quality than pure Gaussian

#### Disadvantages
- **Significantly slower** than Gaussian (cannot be separated)
- Complexity: O(r²) per pixel
- For Canvas 2D software rendering, performance cost is **prohibitive**

#### Verdict for Canvas 2D
**Not recommended** for primary smoothing. Could be used for a final polish pass if performance allows.

### Option C: Median Filter

#### Description
Replaces each pixel with the median of its neighborhood. Excellent for removing impulse noise and isolated spikes.

#### Implementation
```typescript
function medianFilter(heightMap: number[][], radius: number): number[][] {
  const result = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const neighbors = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          // Collect neighborhood values with bounds checking
          const ny = clamp(y + dy, 0, height - 1);
          const nx = clamp(x + dx, 0, width - 1);
          neighbors.push(heightMap[ny][nx]);
        }
      }
      // Sort and take median
      neighbors.sort((a, b) => a - b);
      row.push(neighbors[Math.floor(neighbors.length / 2)]);
    }
    result.push(row);
  }
  return result;
}
```

#### Recommended Use
**Not for primary smoothing**, but excellent for **spike detection/removal** (see Section 3).

#### Recommended Window Size
- **Radius 2-3** (5x5 to 7x7 window)
- Larger windows distort the data
- Effective for rare, isolated spikes

### Option D: Laplacian Smoothing

#### Description
Mesh-based smoothing that moves each vertex toward the average of its neighbors. More common in 3D mesh processing than heightmap images.

#### Verdict for Canvas 2D
**Not recommended**. Gaussian smoothing on the 2D heightmap is simpler and more efficient than converting to mesh, smoothing vertices, and converting back.

### Comparison Matrix

| Method | Speed | Edge Preservation | Spike Removal | Recommendation |
|--------|-------|-------------------|---------------|----------------|
| **Gaussian (separable)** | Very Fast | Poor | Good (multi-pass) | **Primary smoothing** |
| **Bilateral** | Slow | Excellent | Good | Optional polish (performance cost high) |
| **Median** | Medium | Excellent | Excellent | **Spike detection stage only** |
| **Laplacian** | Medium | Medium | Poor | Not suitable for heightmaps |

### Recommended Approach

**Two-stage pipeline:**

1. **Stage 1 - Spike Detection/Removal:** Use median filter (radius 2-3) or statistical outlier detection
2. **Stage 2 - Smoothing:** Multi-pass separable Gaussian (radius 4-6, sigma=radius/2, 2-3 passes)

This combination provides:
- Aggressive spike removal without over-smoothing
- Efficient computation suitable for Canvas 2D
- Preservation of overall fractal character

---

## 3. Outlier/Spike Detection and Removal

### Problem Statement

Even with smooth iteration counts, some isolated pixels may have anomalous height values due to numerical edge cases or points very close to the set boundary. These create visible spikes in the mesh.

### Option A: Median Absolute Deviation (MAD)

#### Description

MAD is a robust statistical measure of variability that is resistant to outliers. It's defined as the median of absolute deviations from the data's median.

#### Formula

```
MAD = median(|X_i - median(X)|)

For outlier detection:
  lower_threshold = median(X) - k * MAD
  upper_threshold = median(X) + k * MAD

  Outliers: values outside [lower_threshold, upper_threshold]
```

#### Consistency Constant

For normally distributed data, `MAD * 1.4826 ≈ standard deviation`. This constant makes MAD a consistent estimator.

#### Recommended Threshold Values

From statistical literature:
- **k = 3**: Very conservative (default)
- **k = 2.5**: Moderately conservative
- **k = 2**: Less conservative, flags more outliers

For heightmap spike detection: **k = 2.5 to 3.0**

#### Implementation

```typescript
function detectOutliersMAD(
  heightMap: number[][],
  radius: number,
  threshold: number = 3.0
): boolean[][] {
  const outlierMap = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      // Collect neighborhood
      const neighbors = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = clamp(y + dy, 0, height - 1);
          const nx = clamp(x + dx, 0, width - 1);
          neighbors.push(heightMap[ny][nx]);
        }
      }

      // Compute median
      neighbors.sort((a, b) => a - b);
      const median = neighbors[Math.floor(neighbors.length / 2)];

      // Compute MAD
      const deviations = neighbors.map(v => Math.abs(v - median));
      deviations.sort((a, b) => a - b);
      const mad = deviations[Math.floor(deviations.length / 2)];

      // Detect outlier
      const centerValue = heightMap[y][x];
      const deviation = Math.abs(centerValue - median);
      const isOutlier = deviation > threshold * mad * 1.4826;

      row.push(isOutlier);
    }
    outlierMap.push(row);
  }

  return outlierMap;
}
```

#### Advantages
- **Robust against outliers** (unlike standard deviation)
- Works well with non-normal distributions
- Well-established in statistics literature

#### Disadvantages
- Requires sorting for median computation (O(n log n))
- Slower than z-score method

### Option B: Z-Score Method

#### Description

Identifies outliers based on how many standard deviations they are from the mean.

#### Formula

```
z = (X - mean) / std_dev

Outlier if: |z| > threshold

Common thresholds:
  |z| > 3: Based on 3-sigma rule (99.7% of normal data within ±3σ)
  |z| > 2: More aggressive, flags ~5% of normal data
```

#### Implementation

```typescript
function detectOutliersZScore(
  heightMap: number[][],
  radius: number,
  threshold: number = 3.0
): boolean[][] {
  const outlierMap = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      // Collect neighborhood
      const neighbors = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = clamp(y + dy, 0, height - 1);
          const nx = clamp(x + dx, 0, width - 1);
          neighbors.push(heightMap[ny][nx]);
        }
      }

      // Compute mean and std dev
      const mean = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
      const variance = neighbors.reduce((sum, v) => sum + (v - mean) ** 2, 0) / neighbors.length;
      const stdDev = Math.sqrt(variance);

      // Compute z-score
      const centerValue = heightMap[y][x];
      const zScore = Math.abs((centerValue - mean) / (stdDev + 1e-10));

      row.push(zScore > threshold);
    }
    outlierMap.push(row);
  }

  return outlierMap;
}
```

#### Advantages
- **Very fast** - no sorting required
- Simple to implement
- Based on well-known 3-sigma rule

#### Disadvantages
- **Sensitive to outliers** (mean and std dev are affected by the outliers you're trying to detect)
- Assumes approximately normal distribution

### Option C: Local Neighborhood Median Filter

#### Description

Replace each pixel with the median of its neighborhood. Effectively removes isolated spikes without statistical thresholds.

#### Implementation

See Section 2, Option C (Median Filter). This is the simplest approach.

#### Recommended Use

**Best for spike removal when:**
- Spikes are rare and isolated
- Distribution is unknown or non-normal
- Simplicity is preferred

### Comparison Matrix

| Method | Robustness | Speed | Complexity | Best For |
|--------|-----------|-------|------------|----------|
| **MAD** | Excellent | Medium (sorting) | Medium | Non-normal distributions, robust detection |
| **Z-Score** | Poor (sensitive to outliers) | Very Fast | Low | Quick detection, normal distributions |
| **Median Filter** | Excellent | Fast | Low | **Simple spike removal** |

### Recommended Approach

**For Canvas 2D implementation:**

**Primary recommendation: Median Filter (radius 2-3)**
- Simplest to implement
- Excellent spike removal
- No statistical assumptions
- Fast enough for software rendering

**Alternative: MAD-based detection + replacement**
- More sophisticated
- Use for heightmaps with many outliers
- Threshold: k = 2.5 to 3.0
- Replace outlier values with local median

### Clamping Strategy

After detecting outliers, replace them:

```typescript
function removeSpikes(
  heightMap: number[][],
  outlierMap: boolean[][],
  radius: number = 2
): number[][] {
  const result = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      if (outlierMap[y][x]) {
        // Replace outlier with local median
        const neighbors = [];
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dy === 0) continue; // Skip center
            const ny = clamp(y + dy, 0, height - 1);
            const nx = clamp(x + dx, 0, width - 1);
            neighbors.push(heightMap[ny][nx]);
          }
        }
        neighbors.sort((a, b) => a - b);
        row.push(neighbors[Math.floor(neighbors.length / 2)]);
      } else {
        row.push(heightMap[y][x]);
      }
    }
    result.push(row);
  }

  return result;
}
```

---

## 4. Grid Resolution and Downsampling

### Problem Statement

The current `gridResolution = 1` creates a mesh vertex for every pixel. For a 1920x1080 canvas:
- ~2 million vertices
- ~4 million triangles
- Slow painter's algorithm rendering
- Single-pixel noise amplified into single-vertex spikes

### Solution: Increase Grid Resolution and Downsample

#### Recommended Grid Resolution

| Resolution | Vertex Count (1920x1080) | Triangle Count | Quality | Performance |
|------------|--------------------------|----------------|---------|-------------|
| 1 | ~2,073,600 | ~4,147,200 | Excessive detail | Very Slow |
| 2 | ~518,400 | ~1,036,800 | High detail | Slow |
| **3** | ~230,400 | ~460,800 | **Optimal balance** | **Medium** |
| **4** | ~129,600 | ~259,200 | **Good detail** | **Fast** |
| 5 | ~82,944 | ~165,888 | Moderate detail | Very Fast |

**Recommended: gridResolution = 3 or 4**

This reduces vertex count by 9-16x while maintaining smooth terrain appearance.

### Downsampling Methods

When creating a coarser grid from the full-resolution iteration data, the sampling method matters.

#### Option A: Point Sampling (Nearest Neighbor)

**Description:** Take the value of one pixel at grid intervals.

**Pseudocode:**
```typescript
const sampledValue = iterationData[y * gridResolution][x * gridResolution];
```

**Advantages:**
- Extremely fast
- Simple to implement

**Disadvantages:**
- **Ignores neighboring pixels** - wastes computed data
- **Amplifies noise** - if the sampled pixel is an outlier, the grid point becomes a spike
- **Not recommended for heightmaps**

#### Option B: Area Averaging (Box Filter)

**Description:** Average all pixels within a grid cell.

**Pseudocode:**
```typescript
function areaAverage(iterationData: number[][], x: number, y: number, gridRes: number): number {
  let sum = 0;
  let count = 0;

  for (let dy = 0; dy < gridRes; dy++) {
    for (let dx = 0; dx < gridRes; dx++) {
      const px = x * gridRes + dx;
      const py = y * gridRes + dy;
      if (px < width && py < height) {
        sum += iterationData[py][px];
        count++;
      }
    }
  }

  return sum / count;
}
```

**Advantages:**
- **Natural noise suppression** - averaging inherently smooths
- **Uses all computed data** - no information wasted
- **Fast** - simple arithmetic
- **Optimal for downsampling**

**Disadvantages:**
- Slightly more complex than point sampling

#### Option C: Bilinear Interpolation

**Description:** Weighted average of 4 nearest neighbors.

**Use case:** Upsampling or resampling to non-integer grids.

**For downsampling:** Bilinear 2x downsampling is equivalent to box filtering. For larger downsampling (3x, 4x), bilinear **ignores pixels**, making it inferior to area averaging.

**Verdict:** Use area averaging instead.

#### Option D: Bicubic Interpolation

**Description:** Weighted average of 16 nearest neighbors (4x4 grid) using cubic polynomials.

**Advantages:**
- Smoother than bilinear
- Better edge preservation

**Disadvantages:**
- **Significantly slower** (~4x computational cost of bilinear)
- For aggressive downsampling (3x, 4x), still ignores many pixels
- **Overkill for heightmap downsampling**

**Verdict:** Not recommended for Canvas 2D software rendering.

### Comparison Matrix

| Method | Speed | Noise Suppression | Data Utilization | Recommendation |
|--------|-------|-------------------|------------------|----------------|
| **Point Sampling** | Fastest | Poor | Poor (wastes data) | **Not recommended** |
| **Area Averaging** | Very Fast | Excellent | Excellent | **Highly recommended** |
| **Bilinear** | Fast | Good (2x only) | Poor (>2x) | Use for upsampling only |
| **Bicubic** | Slow | Good | Poor | **Too slow for Canvas 2D** |

### Recommended Implementation

**Use area averaging:**

```typescript
function downsampleIterationData(
  iterationData: number[][],
  width: number,
  height: number,
  gridResolution: number
): number[][] {
  const gridWidth = Math.ceil(width / gridResolution);
  const gridHeight = Math.ceil(height / gridResolution);
  const downsampled: number[][] = [];

  for (let gy = 0; gy < gridHeight; gy++) {
    const row: number[] = [];
    for (let gx = 0; gx < gridWidth; gx++) {
      let sum = 0;
      let count = 0;

      // Average all pixels in this grid cell
      for (let dy = 0; dy < gridResolution; dy++) {
        for (let dx = 0; dx < gridResolution; dx++) {
          const px = gx * gridResolution + dx;
          const py = gy * gridResolution + dy;

          if (px < width && py < height) {
            sum += iterationData[py][px];
            count++;
          }
        }
      }

      row.push(sum / count);
    }
    downsampled.push(row);
  }

  return downsampled;
}
```

**Benefits:**
- Each grid point represents the true average of its cell
- Natural noise reduction before spike detection and smoothing
- Preserves overall fractal structure while eliminating pixel-level noise

### Performance Impact

Assuming 1920x1080 canvas:

| Grid Resolution | Downsampling Time | Rendering Time (triangles) | Total Improvement |
|-----------------|-------------------|---------------------------|-------------------|
| 1 (current) | 0 ms | 100% (baseline) | 0% |
| 3 | +5 ms | ~11% of baseline | **~9x faster rendering** |
| 4 | +3 ms | ~6% of baseline | **~16x faster rendering** |

The small downsampling cost is vastly outweighed by the rendering speedup.

---

## 5. Height Function Design

### Problem Statement

The current `calculateSmoothHeight()` blends exponential, logarithmic, and sinusoidal curves with a "smoothingFactor" based on maxIterations. This complexity is unnecessary once continuous iteration counts are available, and the specific curve shape affects terrain appearance.

### Goal

Design a height function that:
- Maps smooth iteration count to height
- Produces natural, mountain-like terrain profiles
- Sets interior points (maxIterations) to height = 0 (flat lake)
- Is simple, predictable, and tunable

### Mathematical Options

#### Option A: Linear Mapping

```typescript
const ratio = smoothIteration / maxIterations;
const height = heightScale * (1 - ratio);
```

**Profile:** Linear slope from boundary (height ≈ heightScale) to infinity (height = 0)

**Characteristics:**
- Uniform slope
- No differentiation between near-boundary and far regions
- **Not visually interesting**

**Verdict:** Too simplistic.

#### Option B: Exponential Decay

```typescript
const ratio = smoothIteration / maxIterations;
const height = heightScale * Math.exp(-exponent * ratio);
```

**Profile:** Rapid drop near boundary, slow decay toward infinity

**Characteristics:**
- Steep mountains at boundary
- Very flat regions far from set
- Good for dramatic landscapes

**Tuning:** `exponent = 2-4` for typical terrain

**Verdict:** Good for steep, dramatic landscapes.

#### Option C: Power Law (Recommended)

```typescript
const ratio = smoothIteration / maxIterations;
const height = heightScale * Math.pow(1 - ratio, exponent);
```

**Profile:** Controlled by exponent:
- `exponent < 1`: Concave (gentle near boundary, steeper far away)
- `exponent = 1`: Linear
- `exponent > 1`: Convex (steep near boundary, gentler far away)

**Characteristics:**
- **Highly tunable** with single parameter
- **Natural terrain appearance** with exponent ≈ 0.4-0.6
- Smooth, continuous derivatives

**Recommended exponent values:**
- `0.4`: Very gentle, rolling hills
- `0.5`: Balanced, natural mountains
- `0.6`: Moderately steep
- `0.8`: Steep mountains
- `1.0`: Linear (for comparison)

**Verdict:** **Best overall choice** - simple, tunable, produces organic terrain.

#### Option D: Logarithmic

```typescript
const ratio = smoothIteration / maxIterations;
const height = heightScale * Math.log(1 + exponent * (1 - ratio)) / Math.log(1 + exponent);
```

**Profile:** Smooth compression across the range

**Characteristics:**
- Gradual height changes
- Good for emphasizing fine detail
- Requires careful tuning of exponent

**Verdict:** More complex than power law, without clear advantages.

### Comparison Matrix

| Function | Simplicity | Tunability | Terrain Quality | Performance |
|----------|------------|------------|-----------------|-------------|
| **Linear** | Excellent | Poor | Poor | Excellent |
| **Exponential** | Good | Medium | Good (dramatic) | Good |
| **Power Law** | Excellent | Excellent | **Excellent** | Excellent |
| **Logarithmic** | Medium | Medium | Good | Medium |

### Recommended Implementation

**Power law with exponent = 0.5:**

```typescript
function calculateSmoothHeight(
  smoothIteration: number,
  maxIterations: number,
  heightScale: number,
  exponent: number = 0.5
): number {
  // Interior points (non-escaped) get height 0
  if (smoothIteration >= maxIterations) {
    return 0;
  }

  // Normalize to [0, 1] range
  const ratio = smoothIteration / maxIterations;

  // Power curve: height decreases from 1 to 0 as ratio goes 0 to 1
  const height = heightScale * Math.pow(1 - ratio, exponent);

  return height;
}
```

**Configurable exponent:**
Expose `exponent` as a parameter (e.g., UI slider) to allow users to adjust terrain steepness interactively.

### Handling Interior Points

**Critical:** Points with `smoothIteration === maxIterations` (interior of the set) must map to **height = 0**.

This creates the "flat lake" appearance and ensures the Mandelbrot set interior is visually distinct from the exterior terrain.

### Comparison with Current Implementation

**Current:** Blended exponential/logarithmic/sinusoidal curves

**Proposed:** Single power curve

**Advantages of proposed:**
- **Simpler code** - easier to understand and maintain
- **More predictable** - single parameter controls shape
- **Works with smooth iteration counts** - no need for complex blending to hide banding
- **Tunable** - exponent can be adjusted for different visual styles

---

## 6. Lighting and Shading on Canvas 2D

### Problem Statement

The reference image shows smooth, realistic lighting with:
- Soft shading across surfaces
- Specular highlights (shiny, "porcelain" appearance)
- Multiple light sources or ambient light
- No harsh flat shading

Achieving this on Canvas 2D requires per-pixel or per-triangle lighting calculations.

### Lighting Model: Phong Reflection

The Phong reflection model is the industry standard for realistic lighting.

#### Phong Components

```
I = I_ambient + I_diffuse + I_specular

Where:
  I_ambient  = k_a * L_ambient
  I_diffuse  = k_d * L_light * max(0, N · L)
  I_specular = k_s * L_light * max(0, R · V)^shininess

  N = surface normal
  L = light direction (toward light)
  R = reflection direction
  V = view direction (toward camera)
```

**Coefficients:**
- `k_a`: Ambient reflectance (0.2-0.3 typical)
- `k_d`: Diffuse reflectance (0.5-0.7 typical)
- `k_s`: Specular reflectance (0.3-0.5 for shiny surfaces)
- `shininess`: Specular exponent (10-100+, higher = smaller, tighter highlights)

#### Reflection Direction Calculation

```typescript
// R = 2(N · L)N - L
function reflect(L: Vector3, N: Vector3): Vector3 {
  const dotNL = dot(N, L);
  return {
    x: 2 * dotNL * N.x - L.x,
    y: 2 * dotNL * N.y - L.y,
    z: 2 * dotNL * N.z - L.z
  };
}
```

### Surface Normal Calculation

#### Face Normals (Per-Triangle)

For a triangle with vertices `p1`, `p2`, `p3`:

```typescript
function calculateFaceNormal(p1: Point3D, p2: Point3D, p3: Point3D): Vector3 {
  // Two edge vectors
  const edge1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
  const edge2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };

  // Cross product
  const normal = {
    x: edge1.y * edge2.z - edge1.z * edge2.y,
    y: edge1.z * edge2.x - edge1.x * edge2.z,
    z: edge1.x * edge2.y - edge1.y * edge2.x
  };

  // Normalize
  const length = Math.sqrt(normal.x**2 + normal.y**2 + normal.z**2);
  return {
    x: normal.x / length,
    y: normal.y / length,
    z: normal.z / length
  };
}
```

**Result:** One normal per triangle, flat shading appearance.

#### Vertex Normals (Per-Vertex)

For smooth shading, compute normals at vertices by averaging adjacent face normals.

```typescript
function calculateVertexNormals(gridPoints: Point3D[][]): Vector3[][] {
  const normals: Vector3[][] = [];

  for (let y = 0; y < gridHeight; y++) {
    const row: Vector3[] = [];
    for (let x = 0; x < gridWidth; x++) {
      const adjacentFaces: Vector3[] = [];

      // Collect normals of all triangles sharing this vertex
      // (up to 6 triangles for interior vertices)
      // ... (implementation details omitted for brevity)

      // Average face normals
      let avgNormal = { x: 0, y: 0, z: 0 };
      for (const faceNormal of adjacentFaces) {
        avgNormal.x += faceNormal.x;
        avgNormal.y += faceNormal.y;
        avgNormal.z += faceNormal.z;
      }

      // Normalize
      const length = Math.sqrt(avgNormal.x**2 + avgNormal.y**2 + avgNormal.z**2);
      row.push({
        x: avgNormal.x / length,
        y: avgNormal.y / length,
        z: avgNormal.z / length
      });
    }
    normals.push(row);
  }

  return normals;
}
```

**Result:** Smooth normal interpolation across surfaces.

### Shading Techniques

#### Option A: Flat Shading (Per-Triangle)

**Process:**
1. Calculate face normal for each triangle
2. Apply Phong lighting once per triangle
3. Fill triangle with single color

**Appearance:** Faceted, geometric

**Performance:** Fast (one lighting calculation per triangle)

**Verdict:** **Not suitable** for smooth terrain appearance.

#### Option B: Gouraud Shading (Per-Vertex)

**Process:**
1. Calculate vertex normals
2. Apply Phong lighting at each vertex
3. Linearly interpolate colors across triangle during rasterization

**Appearance:** Smooth shading, but **specular highlights are blurred/incorrect**

**Performance:** Good (lighting at vertices only)

**Verdict:** Better than flat, but specular highlights are poor quality.

#### Option C: Phong Shading (Per-Pixel)

**Process:**
1. Calculate vertex normals
2. Linearly interpolate normals across triangle
3. Apply Phong lighting **at each pixel** using interpolated normal

**Appearance:** **Smooth, realistic, accurate specular highlights**

**Performance:** Slower (lighting calculation per pixel)

**Verdict:** **Best quality**, but potentially too slow for Canvas 2D software rendering.

#### Option D: Simplified Phong (Per-Triangle with Enhanced Normals)

**Hybrid approach for Canvas 2D:**
1. Calculate vertex normals (smooth)
2. Average vertex normals to get triangle "smooth normal"
3. Apply Phong lighting once per triangle
4. Fill triangle with single color

**Appearance:** Smoother than flat shading, faster than per-pixel

**Performance:** Fast (one calculation per triangle)

**Verdict:** **Recommended compromise for Canvas 2D**.

### Multi-Light Setup

To achieve the soft, well-lit appearance of the reference image:

**Recommended light configuration:**

```typescript
const lights = [
  {
    position: { x: -100, y: -100, z: 500 },  // Upper-left, in front
    color: { r: 0.8, g: 0.8, b: 0.8 },       // Slightly warm white
    intensity: 1.0
  },
  {
    position: { x: 100, y: -50, z: 300 },    // Upper-right, closer
    color: { r: 0.6, g: 0.6, b: 0.7 },       // Slightly cool
    intensity: 0.5
  },
  {
    position: { x: 0, y: 200, z: 200 },      // From below (rim light)
    color: { r: 0.4, g: 0.4, b: 0.5 },
    intensity: 0.3
  }
];

const ambientLight = { r: 0.3, g: 0.3, b: 0.3 };  // Moderate ambient
```

**Multi-light Phong:**

```typescript
function calculateLighting(
  position: Point3D,
  normal: Vector3,
  viewDir: Vector3,
  baseColor: RGB
): RGB {
  let finalColor = {
    r: baseColor.r * ambientLight.r,
    g: baseColor.g * ambientLight.g,
    b: baseColor.b * ambientLight.b
  };

  for (const light of lights) {
    const lightDir = normalize(subtract(light.position, position));

    // Diffuse
    const diffuse = Math.max(0, dot(normal, lightDir));
    finalColor.r += baseColor.r * k_d * diffuse * light.color.r * light.intensity;
    finalColor.g += baseColor.g * k_d * diffuse * light.color.g * light.intensity;
    finalColor.b += baseColor.b * k_d * diffuse * light.color.b * light.intensity;

    // Specular
    const reflectDir = reflect(lightDir, normal);
    const specular = Math.pow(Math.max(0, dot(reflectDir, viewDir)), shininess);
    finalColor.r += k_s * specular * light.color.r * light.intensity;
    finalColor.g += k_s * specular * light.color.g * light.intensity;
    finalColor.b += k_s * specular * light.color.b * light.intensity;
  }

  // Clamp to [0, 255]
  return {
    r: Math.min(255, finalColor.r),
    g: Math.min(255, finalColor.g),
    b: Math.min(255, finalColor.b)
  };
}
```

### Specular Highlights

To achieve the "porcelain" or "glazed ceramic" appearance:

**Recommended specular parameters:**
- `k_s = 0.4-0.6`: Moderate to high specular reflectance
- `shininess = 30-60`: Tight, bright highlights (higher = smaller, sharper)

**For glossy, shiny terrain:** shininess = 40-80
**For matte, subtle highlights:** shininess = 10-20

### Ambient Occlusion (Optional)

True screen-space ambient occlusion (SSAO) is computationally expensive and requires depth buffers, making it impractical for Canvas 2D.

**Simplified approximation:**

Use a "height-based ambient darkening" where lower regions (valleys) receive less ambient light:

```typescript
const ambientOcclusion = Math.pow(heightRatio, 0.5);  // 0 at height 0, 1 at max height
const adjustedAmbient = {
  r: ambientLight.r * ambientOcclusion,
  g: ambientLight.g * ambientOcclusion,
  b: ambientLight.b * ambientOcclusion
};
```

This is a crude approximation but adds subtle depth to valleys.

**Verdict:** Optional enhancement, low priority.

### Gamma Correction

Modern rendering pipelines perform lighting calculations in linear color space and apply gamma correction at the end.

#### Why Gamma Correction Matters

- sRGB displays have a gamma of approximately 2.2
- Without correction, lighting appears washed out
- Colors should be linearized before lighting, then gamma-encoded for display

#### Implementation

```typescript
// Linearize sRGB to linear RGB before lighting
function sRGBToLinear(value: number): number {
  return Math.pow(value / 255, 2.2);
}

// Convert linear RGB back to sRGB for display
function linearToSRGB(value: number): number {
  return Math.pow(value, 1 / 2.2) * 255;
}

// In lighting calculation:
const linearR = sRGBToLinear(baseColor.r);
const linearG = sRGBToLinear(baseColor.g);
const linearB = sRGBToLinear(baseColor.b);

// ... perform lighting in linear space ...

const displayR = linearToSRGB(finalColor.r);
const displayG = linearToSRGB(finalColor.g);
const displayB = linearToSRGB(finalColor.b);
```

**Impact:** More physically accurate lighting, richer colors, better contrast.

**Verdict:** **Recommended** for professional-quality output.

### Performance Considerations

For Canvas 2D software rendering on a ~2M triangle mesh:

**Per-pixel Phong:** ~10-30 seconds render time (too slow)
**Per-triangle simplified Phong:** ~1-3 seconds (acceptable)
**Flat shading:** <1 second (fast but poor quality)

**Recommendation:** Per-triangle Phong with vertex normals (Option D) strikes the best balance.

---

## 7. Background Rendering

### Problem Statement

The current `drawBackground()` creates a dark gradient from `#0a0a0a` to `#1a1a2e`. The reference image shows a warm gradient (orange/amber to dark) creating an atmospheric, sunset-like appearance.

### Gradient Sky Techniques

#### Option A: Linear Gradient (Recommended)

**Description:** Canvas 2D `createLinearGradient()` API.

**Implementation:**

```typescript
function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);

  // Warm sunset gradient
  gradient.addColorStop(0, '#1a0f0a');      // Dark brown/black at top
  gradient.addColorStop(0.3, '#2d1810');    // Deep brown
  gradient.addColorStop(0.5, '#4a2818');    // Brown
  gradient.addColorStop(0.7, '#8a4520');    // Orange-brown
  gradient.addColorStop(0.85, '#c9692a');   // Warm orange
  gradient.addColorStop(1.0, '#e89a5a');    // Light amber at horizon

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
```

**Color stop positions:**
- 0 (top): Very dark
- 0.3-0.5: Transition zone
- 0.7-1.0: Warm colors near horizon

**Advantages:**
- Native Canvas API - very fast
- Simple to implement
- Looks professional

**Verdict:** **Best choice**.

#### Option B: Radial Gradient

**Description:** `createRadialGradient()` for a sun/glow effect.

**Implementation:**

```typescript
const centerX = width / 2;
const horizonY = height * 0.7;  // Sun near horizon
const gradient = ctx.createRadialGradient(centerX, horizonY, 0, centerX, horizonY, height);

gradient.addColorStop(0, '#ffcc66');      // Bright yellow center
gradient.addColorStop(0.2, '#ff9944');    // Orange
gradient.addColorStop(0.5, '#cc4422');    // Red-orange
gradient.addColorStop(1.0, '#1a0f0a');    // Dark at edges
```

**Advantages:**
- Creates a "sun" or "glow" focal point
- Atmospheric depth

**Disadvantages:**
- More complex
- May distract from fractal terrain

**Verdict:** Optional enhancement, lower priority than linear gradient.

#### Option C: Fractal Clouds (Advanced)

**Description:** Procedural clouds using Perlin/Simplex noise or fractal noise.

**Implementation outline:**

```typescript
// Generate cloud layer using fractal noise
function generateClouds(width: number, height: number): ImageData {
  const imageData = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Multi-octave Perlin noise (requires noise library or implementation)
      const cloudValue = fractalNoise(x / 100, y / 100, 6);  // 6 octaves

      // Threshold and blend with sky gradient
      const alpha = cloudValue > 0.5 ? (cloudValue - 0.5) * 2 : 0;
      // ... set pixel with cloud color and alpha
    }
  }

  return imageData;
}
```

**Advantages:**
- Highly realistic
- Fractal aesthetic matches Mandelbrot theme

**Disadvantages:**
- **Computationally expensive** (noise generation for every pixel)
- Requires noise algorithm implementation (e.g., Perlin noise)
- Overkill for background element

**Verdict:** **Not recommended** for Canvas 2D - too slow for the benefit.

### Decorative Elements

The reference image includes a decorative sphere or orb element.

#### Option: Gradient Sphere/Orb

```typescript
function drawDecorativeSphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
): void {
  const gradient = ctx.createRadialGradient(
    x - radius * 0.3, y - radius * 0.3, 0,  // Light source offset
    x, y, radius
  );

  gradient.addColorStop(0, '#ffffee');      // Bright center
  gradient.addColorStop(0.5, '#ffaa44');    // Orange
  gradient.addColorStop(0.8, '#aa4422');    // Dark orange
  gradient.addColorStop(1.0, '#330a00');    // Dark edge

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();
}

// Usage: draw sphere in upper-right or upper-left corner
drawDecorativeSphere(ctx, width * 0.85, height * 0.15, 60);
```

**Advantages:**
- Simple to implement
- Adds visual interest
- Theme-appropriate (fractal orb/sun)

**Verdict:** **Optional enhancement** - nice to have, not critical.

### Recommended Background Implementation

**Primary recommendation:**

```typescript
function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // Warm linear gradient (sunset/amber theme)
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1a0f0a');
  gradient.addColorStop(0.3, '#2d1810');
  gradient.addColorStop(0.5, '#4a2818');
  gradient.addColorStop(0.7, '#8a4520');
  gradient.addColorStop(0.85, '#c9692a');
  gradient.addColorStop(1.0, '#e89a5a');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Optional: decorative sphere
  drawDecorativeSphere(ctx, width * 0.85, height * 0.15, 50);
}
```

**Alternative (cooler tones):**

```typescript
// Blue-to-dark gradient (night sky)
gradient.addColorStop(0, '#0a0a1a');      // Very dark blue-black
gradient.addColorStop(0.4, '#1a1a3a');    // Deep blue
gradient.addColorStop(0.7, '#2a3a6a');    // Medium blue
gradient.addColorStop(1.0, '#4a5a8a');    // Lighter blue at horizon
```

**Performance:** Negligible - gradient rendering is native and extremely fast.

---

## Recommended Approach: Complete Pipeline

### Integration Strategy

Combine all techniques into a cohesive pipeline:

```
1. Mandelbrot Iteration (SMOOTH)
   └─> Return continuous iteration count (n + 1 - log2(log2(|z|)))

2. Grid Downsampling (AREA AVERAGING)
   └─> Reduce resolution by 3-4x using box filter

3. Spike Detection and Removal (MEDIAN FILTER or MAD)
   └─> Identify and replace outliers with local median

4. Height Mapping (POWER CURVE)
   └─> height = heightScale * pow(1 - ratio, 0.5)

5. Smoothing (MULTI-PASS SEPARABLE GAUSSIAN)
   └─> 2-3 passes, radius 4-6, sigma = radius/2

6. Mesh Generation
   └─> Create triangle mesh from smoothed heightmap

7. Normal Calculation (VERTEX NORMALS)
   └─> Average face normals at each vertex

8. Lighting (MULTI-LIGHT PHONG)
   └─> Per-triangle lighting with vertex normals, gamma correction

9. Rendering (PAINTER'S ALGORITHM)
   └─> Sort triangles by depth, render back-to-front

10. Background (WARM GRADIENT)
    └─> Linear gradient from dark to warm orange/amber
```

### Parameter Recommendations

| Parameter | Recommended Value | Rationale |
|-----------|-------------------|-----------|
| **Bailout Radius** | 256 | Accurate smooth iteration count |
| **Grid Resolution** | 3-4 | Balance of quality and performance |
| **Downsampling** | Area averaging | Natural noise suppression |
| **Spike Removal** | Median filter, radius 2-3 | Simple, effective |
| **Smoothing Method** | Separable Gaussian | Fast, smooth results |
| **Smoothing Radius** | 4-6 | Wide enough to remove spikes |
| **Smoothing Sigma** | radius / 2 | Standard Gaussian relationship |
| **Smoothing Passes** | 2-3 | Aggressive smoothing |
| **Height Exponent** | 0.5 | Natural terrain profile |
| **Lighting Model** | Phong | Industry standard |
| **Shading** | Per-triangle with vertex normals | Canvas 2D performance balance |
| **Specular Shininess** | 40-60 | Glossy, porcelain appearance |
| **Gamma Correction** | 2.2 | sRGB standard |
| **Background** | Warm linear gradient | Matches reference aesthetic |

### Expected Results

With this complete pipeline:

- **No random spikes** - continuous iteration + spike detection + smoothing
- **Smooth, organic terrain** - power curve + multi-pass Gaussian
- **Realistic lighting** - Phong shading with vertex normals
- **Professional appearance** - gamma correction + warm gradient
- **Acceptable performance** - grid downsampling + separable filters + per-triangle lighting
- **Flat interior "lake"** - height = 0 for maxIterations points

### Performance Estimate

For 1920x1080 canvas, gridResolution=3, maxIterations=200:

| Stage | Time (estimated) |
|-------|------------------|
| Smooth iteration calculation | 800-1200 ms |
| Grid downsampling | 5-10 ms |
| Spike detection/removal | 20-40 ms |
| Height mapping | 2-5 ms |
| Separable Gaussian (2 passes) | 30-60 ms |
| Normal calculation | 10-20 ms |
| Triangle sorting & rendering | 500-1500 ms |
| **Total** | **~2-3 seconds** |

This is acceptable for interactive use (not real-time, but responsive for exploratory visualization).

---

## Assumptions and Scope

### Assumptions Made

| Assumption | Confidence | Impact if Wrong |
|------------|------------|-----------------|
| Canvas 2D performance is acceptable for ~460K triangles | **MEDIUM** | May need to reduce grid resolution further (to 5-6) |
| Smooth iteration count will eliminate most spikes | **HIGH** | If not, increase smoothing passes or kernel size |
| Power curve exponent 0.5 produces natural terrain | **MEDIUM** | Make exponent configurable for user adjustment |
| Per-triangle Phong is sufficient (not per-pixel) | **MEDIUM** | May need to selectively apply per-pixel to large triangles |
| Gamma correction improves appearance | **HIGH** | Minimal downside if it doesn't - can be toggled |
| Warm gradient background matches user preference | **MEDIUM** | Make gradient colors configurable |
| Separable Gaussian is fast enough | **HIGH** | Well-established optimization technique |
| Area averaging better than point sampling | **HIGH** | Proven in image processing literature |

### Uncertainties and Gaps

- **Optimal grid resolution for visual quality**: Requires empirical testing. Recommendation (3-4) is based on typical mesh density guidelines, but user's display and zoom level may affect optimal choice.

- **Exact smoothing parameters**: Radius, sigma, and pass count interact in complex ways. Recommended values (radius 4-6, sigma=radius/2, 2-3 passes) are based on image processing best practices, but fractal heightmaps may have unique characteristics requiring tuning.

- **Lighting configuration**: Number of lights, positions, colors, and intensities significantly affect appearance. Recommendation is a starting point; visual iteration will be needed.

- **Performance on lower-end hardware**: Estimates assume modern desktop browser on decent hardware. Performance on older machines or mobile devices is unknown.

- **Interaction with different color schemes**: Some color schemes may interact poorly with lighting (e.g., very dark schemes may lose detail with shadows). This needs testing across all 13 schemes.

- **Rectangle-selection 3D mode**: The investigation focused on full-canvas iteration-based 3D. The rectangle-selection path uses luminance-based heights, which will benefit from smooth iteration indirectly (smoother 2D colors → smoother luminance), but spike detection and enhanced smoothing in `createSmoothHeightMap()` only apply to iteration-based path. Rectangle mode may still have spikes.

### Clarifying Questions for Follow-up

1. **Performance requirements**: What is the maximum acceptable render time for 3D mode? (Current estimate: 2-3 seconds for 1920x1080)

2. **Grid resolution preference**: Should grid resolution be user-configurable via UI, or hardcoded with a sensible default?

3. **Height exponent configurability**: Should the height function exponent be exposed as a UI control (slider), or determined automatically?

4. **Lighting complexity**: Is multi-light Phong acceptable in complexity, or should a simpler single-light model be used? Should lighting parameters be configurable?

5. **Gamma correction**: Should gamma correction be applied unconditionally, or made optional via a toggle?

6. **Background customization**: Should the background gradient colors be hardcoded, or user-configurable (e.g., preset themes: "Sunset", "Night", "Neutral")?

7. **Rectangle-selection 3D mode**: Should the same smoothing enhancements (spike detection, multi-pass Gaussian) be applied to the luminance-based heightmap path, or is it acceptable to leave that path as-is?

8. **Specular highlights**: Are glossy, shiny surfaces desired (high shininess), or matte/subtle surfaces (low shininess)?

9. **Ambient occlusion**: Is the height-based AO approximation worth implementing, or should it be skipped to keep the implementation simpler?

10. **Progressive rendering**: For very slow renders, should a progressive approach be used (low-res preview, then refine), or is a single-pass render acceptable?

---

## References

### Smooth Iteration Count

1. [Inigo Quilez - Smooth Iteration Count for Mandelbrot](https://iquilezles.org/articles/msetsmooth/) - Detailed mathematical derivation and shader implementation
2. [Ruben van Nieuwpoort - Smooth Iteration Count](https://rubenvannieuwpoort.nl/posts/smooth-iteration-count-for-the-mandelbrot-set) - Clear derivation with continuity proof
3. [Linas Vepstas - Renormalizing the Mandelbrot Escape](https://linas.org/art-gallery/escape/escape.html) - Spectral analysis approach, error bounds, practical examples
4. [Wikipedia - Plotting Algorithms for the Mandelbrot Set](https://en.wikipedia.org/wiki/Plotting_algorithms_for_the_Mandelbrot_set) - Standard reference
5. [Wikibooks - Fractals/Iterations in the Complex Plane](https://en.wikibooks.org/wiki/Fractals/Iterations_in_the_complex_plane/MandelbrotSetExterior) - Educational resource

### Gaussian Smoothing

6. [Bart Wronski - Separate Your Filters](https://bartwronski.com/2020/02/03/separate-your-filters-svd-and-low-rank-approximation-of-image-filters/) - Separable filter theory
7. [Wikipedia - Gaussian Blur](https://en.wikipedia.org/wiki/Gaussian_blur) - Mathematical foundations
8. [Homepages - Spatial Filters - Gaussian Smoothing](https://homepages.inf.ed.ac.uk/rbf/HIPR2/gsmooth.htm) - Image processing fundamentals
9. [Gilles Leblanc - Using Gaussian Blurring on Heightmaps](https://gillesleblanc.wordpress.com/2012/08/24/using-gaussian-blurring-on-heightmap/) - Direct application to heightmaps
10. [Real-Time Rendering - Quick Gaussian Filtering](https://www.realtimerendering.com/blog/quick-gaussian-filtering/) - Performance optimization

### Outlier Detection

11. [Eureka Statistics - Using MAD to Find Outliers](https://eurekastatistics.com/using-the-median-absolute-deviation-to-find-outliers/) - MAD methodology
12. [Real-Statistics - MAD and Outliers](https://real-statistics.com/descriptive-statistics/mad-and-outliers/) - Statistical foundations
13. [Machine Learning Plus - Z-Score Outlier Detection](https://www.machinelearningplus.com/machine-learning/how-to-detect-outliers-with-z-score/) - Z-score method
14. [MATLAB - Data Smoothing and Outlier Detection](https://www.mathworks.com/help/matlab/data_analysis/data-smoothing-and-outlier-detection.html) - Practical guidance
15. [ResearchGate - Remove Data Spikes in Geophysical Maps](https://www.researchgate.net/publication/305687010_Remove_data_spikes_in_geophysical_maps) - Terrain-specific applications

### Downsampling and Interpolation

16. [Bart Wronski - Bilinear Down/Upsampling](https://bartwronski.com/2021/02/15/bilinear-down-upsampling-pixel-grids-and-that-half-pixel-offset/) - Detailed analysis
17. [Wikipedia - Image Scaling](https://en.wikipedia.org/wiki/Image_scaling) - Overview of methods
18. [Wikipedia - Bilinear Interpolation](https://en.wikipedia.org/wiki/Bilinear_interpolation) - Mathematical foundation
19. [Wikipedia - Bicubic Interpolation](https://en.wikipedia.org/wiki/Bicubic_interpolation) - Higher-quality alternative
20. [MIT Vision Book - Downsampling and Upsampling](https://visionbook.mit.edu/upsamplig_downsampling_2.html) - Academic perspective

### Lighting and Shading

21. [Wikipedia - Phong Shading](https://en.wikipedia.org/wiki/Phong_shading) - Industry standard technique
22. [Wikipedia - Phong Reflection Model](https://en.wikipedia.org/wiki/Phong_reflection_model) - Lighting mathematics
23. [LearnOpenGL - Basic Lighting](https://learnopengl.com/Lighting/Basic-Lighting) - Practical tutorial
24. [Graphics Compendium - Surface Normals](https://graphicscompendium.com/opengl/17-lighting-3) - Normal calculation
25. [Polycount - Per-Pixel Lighting on Smooth Shaded Mesh](https://polycount.com/discussion/88447/per-pixel-lighting-equations-on-a-smooth-shaded-mesh) - Practical discussion
26. [Scratchapixel - Introduction to Shading](https://www.scratchapixel.com/lessons/3d-basic-rendering/introduction-to-shading/shading-normals.html) - Comprehensive guide

### Gamma Correction

27. [LearnOpenGL - Gamma Correction](https://learnopengl.com/Advanced-Lighting/Gamma-Correction) - Detailed explanation
28. [Wikipedia - Gamma Correction](https://en.wikipedia.org/wiki/Gamma_correction) - Technical background
29. [Cambridge in Colour - Gamma Correction](https://www.cambridgeincolour.com/tutorials/gamma-correction.htm) - Photographic perspective
30. [Matt77hias - Linear, Gamma and sRGB Color Spaces](https://matt77hias.github.io/blog/2018/07/01/linear-gamma-and-sRGB-color-spaces.html) - Color space mathematics

### Fractal Landscapes

31. [Wikipedia - Fractal Landscape](https://en.wikipedia.org/wiki/Fractal_landscape) - Overview
32. [Springer - 3D Rendering of Fractal Landscapes](https://link.springer.com/chapter/10.1007/978-3-642-95678-2_9) - Academic research
33. [ACM - Generation of 3D Fractal Images for Mandelbrot Set](https://dl.acm.org/doi/10.1145/1947940.1947990) - Direct application to Mandelbrot
34. [Wikipedia - Diamond-Square Algorithm](https://en.wikipedia.org/wiki/Diamond-square_algorithm) - Terrain generation technique

### Screen Space Ambient Occlusion

35. [Wikipedia - Screen Space Ambient Occlusion](https://en.wikipedia.org/wiki/Screen_space_ambient_occlusion) - SSAO overview
36. [LearnOpenGL - SSAO](https://learnopengl.com/Advanced-Lighting/SSAO) - Implementation tutorial
37. [Wikipedia - Ambient Occlusion](https://en.wikipedia.org/wiki/Ambient_occlusion) - General AO concept

---

## Document Metadata

**Total Sources Consulted:** 37 primary sources
**Research Areas Covered:** 7 (all specified in request)
**Formulas Provided:** 15+ mathematical formulas and pseudocode implementations
**Comparison Matrices:** 6 technique comparison tables
**Estimated Reading Time:** 45-60 minutes
**Target Audience:** Senior developers implementing Canvas 2D 3D rendering
**Assumptions Documented:** 8 major assumptions with confidence levels
**Clarifying Questions:** 10 questions for follow-up refinement

**Ready for Implementation:** Yes - all critical technical details provided for immediate development.

---

*End of Investigation Document*
