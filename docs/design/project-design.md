# Project Design: Smooth 3D Rendering Engine for Mandelbrot Explorer

**Date:** 2026-03-14
**Status:** Ready for Implementation
**Based On:**
- `docs/design/plan-001-smooth-3d-rendering.md`
- `docs/reference/refined-request-smooth-3d-rendering.md`
- `docs/reference/investigation-smooth-3d-rendering.md`
- `docs/reference/codebase-scan-smooth-3d-rendering.md`

---

## A. System Architecture

### A.1 Rendering Pipeline Flow

```
+-------------------------+       +---------------------------+
| src/index.ts            |       | src/renderer3d.ts         |
|                         |       |                           |
| MandelbrotExplorer      |       | Renderer3D                |
|                         |       |                           |
| [1] calculateIteration  |       |                           |
|     Data()              |       |                           |
|       |                 |       |                           |
|       v                 |       |                           |
| [2] mandelbrotIteration |       |                           |
|     () -- returns       |       |                           |
|     smooth float        |       |                           |
|       |                 |       |                           |
|       v                 |       |                           |
| iterationData[][]       |       |                           |
|   (float values)        |------>| [3] render()              |
|                         |       |       |                   |
+-------------------------+       |       v                   |
                                  | [4] drawBackground()      |
                                  |       |                   |
                                  |       v                   |
                                  | [5] createGridPoints()    |
                                  |       |                   |
                                  |       v                   |
                                  | [6] createSmoothHeightMap |
                                  |     ()                    |
                                  |     |                     |
                                  |     +-> [6a] calculate    |
                                  |     |   SmoothHeight()    |
                                  |     |   for each cell     |
                                  |     |                     |
                                  |     +-> [6b] applyMedian  |
                                  |     |   Filter()          |
                                  |     |   (NEW - spike      |
                                  |     |    removal)         |
                                  |     |                     |
                                  |     +-> [6c] applyGaussian|
                                  |         Smoothing()       |
                                  |         (2 passes,        |
                                  |          separable)       |
                                  |       |                   |
                                  |       v                   |
                                  | [7] transformAndProject() |
                                  |       |                   |
                                  |       v                   |
                                  | [8] renderSurface()       |
                                  |     (painter's algorithm) |
                                  |       |                   |
                                  |       v                   |
                                  | [9] renderTriangle()      |
                                  |     (Phong lighting +     |
                                  |      specular)            |
                                  +---------------------------+
```

### A.2 Data Flow Summary

```
mandelbrotIteration()
  -> iterationData: number[][] (smooth floats, per-pixel)
    -> createGridPoints()
      -> area-average downsample (gridResolution=3)
        -> createSmoothHeightMap()
          -> calculateSmoothHeight() per cell (power-law curve)
            -> applyMedianFilter() (radius=2, 5x5 window)
              -> applyGaussianSmoothing() (separable, radius=4, sigma=2.0, 2 passes)
                -> Point3D[][] grid
                  -> transformAndProject() (rotation + perspective)
                    -> ProjectedPoint[][] grid
                      -> renderSurface() (depth-sort triangles)
                        -> renderTriangle() (Phong: ambient + diffuse + specular)
                          -> Canvas 2D fill
```

### A.3 Method Call Order Within `render()`

1. `drawBackground()` -- clear canvas with warm gradient
2. `createGridPoints(iterationData, maxIterations, heightScale)` -- build 3D mesh
   - Internally calls `createSmoothHeightMap()` which calls:
     - `calculateSmoothHeight()` for each grid cell
     - `applyMedianFilter()` on the raw height map
     - `applyGaussianSmoothing()` twice (2 passes)
   - Uses bilinear interpolation via `getInterpolatedIterations()` for iteration values
3. `transformAndProject(gridPoints, rotationX, rotationY, rotationZ)` -- 3D to 2D projection
4. `renderSurface(projectedPoints, maxIterations, colorScheme)` -- depth-sorted triangle rendering
   - Calls `renderTriangle()` for each triangle with Phong lighting

---

## B. Detailed Method Changes

---

### B.1: mandelbrotIteration (src/index.ts, lines 533-549)

#### Current Signature

```typescript
private mandelbrotIteration(c: { real: number, imag: number }, maxIterations: number): number
```

#### New Signature

No change to the signature. The return type is already `number` which supports floats.

#### Current Behavior

- Escape condition: `z.real * z.real + z.imag * z.imag > 4` (bailout radius = 2)
- Returns integer `n` on escape
- Returns `maxIterations` for interior points

#### New Behavior

- Escape condition: `magnitudeSquared > 65536` (bailout radius = 256)
- Returns smooth float on escape using normalized iteration count formula
- Returns `maxIterations` for interior points (unchanged)

#### Algorithm (Pseudocode)

```
function mandelbrotIteration(c, maxIterations):
    z = {real: 0, imag: 0}
    n = 0

    while n < maxIterations:
        realTemp = z.real * z.real - z.imag * z.imag + c.real
        z.imag = 2 * z.real * z.imag + c.imag
        z.real = realTemp

        magnitudeSquared = z.real * z.real + z.imag * z.imag
        if magnitudeSquared > 65536:                           // CHANGED: was > 4
            // Smooth iteration count formula
            smoothValue = n + 1 - Math.log2(Math.log2(magnitudeSquared) / 2)
            return Math.max(0, smoothValue)                    // CHANGED: was return n
        n++

    return maxIterations                                       // unchanged
```

#### Exact TypeScript Implementation

```typescript
private mandelbrotIteration(c: { real: number, imag: number }, maxIterations: number): number {
    let z = { real: 0, imag: 0 };
    let n = 0;

    while (n < maxIterations) {
        const realTemp = z.real * z.real - z.imag * z.imag + c.real;
        z.imag = 2 * z.real * z.imag + c.imag;
        z.real = realTemp;

        const magnitudeSquared = z.real * z.real + z.imag * z.imag;
        if (magnitudeSquared > 65536) {
            // Normalized iteration count (smooth coloring)
            // Formula: n + 1 - log2(log2(|z|^2) / 2)
            // Equivalent to: n + 1 - log2(log2(|z|)) which is the standard smooth iteration formula
            const smoothValue = n + 1 - Math.log2(Math.log2(magnitudeSquared) / 2);
            return Math.max(0, smoothValue);
        }
        n++;
    }

    return maxIterations;
}
```

#### Key Formula

```
smoothIteration = n + 1 - log2( log2(|z|^2) / 2 )
```

This is mathematically equivalent to `n + 1 - log2(log2(|z|))` since:
- `log2(|z|^2 / 2) = log2(|z|^2) - 1 = 2*log2(|z|) - 1`

But using `magnitudeSquared` directly avoids a `Math.sqrt()` call.

#### Bailout Rationale

- **Old bailout:** `> 4` (radius 2) -- minimal; `log2(log2(4))` = `log2(2)` = 1, producing large correction terms
- **New bailout:** `> 65536` (radius 256 = 2^8) -- `log2(log2(65536))` = `log2(16)` = 4, producing small correction terms (0 to ~1.0), which ensures the smooth value is always close to the integer `n`
- A higher bailout ensures the smooth interpolation formula converges accurately. Bailout 256 is standard practice in fractal rendering.

#### Impact on 2D Rendering

**IMPORTANT FINDING:** The 2D rendering method `calculateWithColorScheme()` (src/index.ts, lines 488-512) DOES call `this.mandelbrotIteration()`. This means the smooth iteration change WILL also affect the 2D rendering path.

This is SAFE because:
1. `ColorSchemes.getColor(iterations, maxIterations, scheme)` computes `ratio = iterations / maxIterations` and already handles fractional ratio values correctly.
2. The smooth values are very close to their integer counterparts (differing by at most ~1.0), so color mapping will be nearly identical but smoother.
3. The 2D rendering will actually BENEFIT from this change, producing smoother color gradients without banding.

The separate `MandelbrotCalculator.mandelbrotIteration()` in `src/mandelbrot.ts` is NOT affected -- it is a completely independent implementation used only by the `MandelbrotCalculator.calculate()` path.

---

### B.2: calculateSmoothHeight (src/renderer3d.ts, lines 204-225)

#### Current Signature

```typescript
private calculateSmoothHeight(iterations: number, maxIterations: number, heightScale: number): number
```

#### New Signature

No change.

#### Current Behavior

Blends three functions (exponential, logarithmic, sinusoidal) with a `smoothingFactor` based on `maxIterations`. Complex and produces inconsistent terrain profiles.

#### New Behavior

Single power-law curve: `heightScale * Math.pow(1 - ratio, 0.5)`. Interior points return 0.

#### Algorithm (Pseudocode)

```
function calculateSmoothHeight(iterations, maxIterations, heightScale):
    if iterations >= maxIterations:
        return 0                           // interior = flat lake

    ratio = iterations / maxIterations     // [0, 1) range
    exponent = 0.5                         // controls terrain profile
    height = heightScale * pow(1 - ratio, exponent)
    return height
```

#### Exact TypeScript Implementation

```typescript
private calculateSmoothHeight(iterations: number, maxIterations: number, heightScale: number): number {
    // Interior points (non-escaped) get height 0 (flat lake)
    if (iterations >= maxIterations) {
        return 0;
    }

    // Normalize to [0, 1) range
    const ratio = iterations / maxIterations;

    // Power curve: exponent 0.5 (square root) produces gentle, natural slopes
    // Lower exponent = gentler slopes; higher = steeper ridges
    const exponent = 0.5;
    const height = heightScale * Math.pow(1 - ratio, exponent);

    return height;
}
```

#### Key Formula

```
height = heightScale * (1 - iterations/maxIterations)^0.5
```

#### Parameter Rationale

- **Exponent 0.5 (square root):** Produces a concave-down curve that rises steeply near the set boundary (where iterations are low relative to max) and flattens out toward the exterior. This creates natural-looking mountain ridges at fractal boundaries.
- **Interior check uses `>=`:** Changed from `===` to `>=` to handle the case where smooth iteration values might exactly equal `maxIterations`.

---

### B.3: NEW METHOD -- applyMedianFilter (src/renderer3d.ts)

#### Signature

```typescript
private applyMedianFilter(heightMap: number[][], radius: number): number[][]
```

#### Purpose

Remove isolated height spikes (impulse noise) before Gaussian smoothing. The median filter replaces each value with the median of its local neighborhood, which is highly effective at removing outliers without blurring edges.

#### Algorithm (Pseudocode)

```
function applyMedianFilter(heightMap, radius):
    height = heightMap.length
    width = heightMap[0].length
    result = new 2D array [height][width]
    windowSize = (2 * radius + 1)^2    // 25 for radius=2

    for y = 0 to height-1:
        for x = 0 to width-1:
            values = []

            for ky = -radius to +radius:
                for kx = -radius to +radius:
                    // Clamp to valid coordinates (edge replication)
                    ny = clamp(y + ky, 0, height - 1)
                    nx = clamp(x + kx, 0, width - 1)
                    values.push(heightMap[ny][nx])

            // Sort and take median
            values.sort(ascending)
            result[y][x] = values[floor(values.length / 2)]

    return result
```

#### Exact TypeScript Implementation

```typescript
private applyMedianFilter(heightMap: number[][], radius: number): number[][] {
    const height = heightMap.length;
    const width = heightMap[0]?.length || 0;
    const result: number[][] = [];

    for (let y = 0; y < height; y++) {
        result[y] = [];
        for (let x = 0; x < width; x++) {
            const values: number[] = [];

            for (let ky = -radius; ky <= radius; ky++) {
                for (let kx = -radius; kx <= radius; kx++) {
                    // Clamp coordinates (edge replication)
                    const ny = Math.max(0, Math.min(height - 1, y + ky));
                    const nx = Math.max(0, Math.min(width - 1, x + kx));
                    values.push(heightMap[ny][nx]);
                }
            }

            // Sort ascending and take median
            values.sort((a, b) => a - b);
            result[y][x] = values[Math.floor(values.length / 2)];
        }
    }

    return result;
}
```

#### Parameters

| Parameter | Value | Rationale |
|---|---|---|
| `radius` | 2 | Produces a 5x5 window (25 values). Large enough to absorb single-pixel and small-cluster spikes. Small enough to preserve terrain features. |

#### Performance Note

With `gridResolution=3` (Phase E), the heightmap is ~640x360 = ~230K pixels. Each pixel examines 25 neighbors. Total: ~5.8M comparisons + 230K sorts of 25 elements. This completes in well under 100ms on modern hardware.

---

### B.4: applyGaussianSmoothing (src/renderer3d.ts, lines 227-280)

#### Current Signature

```typescript
private applyGaussianSmoothing(heightMap: number[][]): number[][]
```

#### New Signature

```typescript
private applyGaussianSmoothing(heightMap: number[][], radius: number, sigma: number, passes: number): number[][]
```

#### Current Behavior

- Single-pass 2D convolution with a `(2*radius+1) x (2*radius+1)` kernel
- `sigma = radius / 3` (too narrow)
- `radius = this.smoothingRadius` (default 2, producing a 5x5 kernel)
- O(n * r^2) per pixel

#### New Behavior

- Separable implementation: horizontal 1D pass + vertical 1D pass
- `sigma = radius / 2 = 2.0` (broader bell curve)
- `radius = 4` (9-element 1D kernel)
- Multi-pass: repeat for `passes` iterations (default: 2)
- O(n * r) per pixel per pass (4x faster than 2D kernel for same radius)

#### Algorithm (Pseudocode)

```
function applyGaussianSmoothing(heightMap, radius, sigma, passes):
    // Build 1D Gaussian kernel
    kernel = new array [2 * radius + 1]
    kernelSum = 0
    for i = -radius to +radius:
        value = exp(-(i * i) / (2 * sigma * sigma))
        kernel[i + radius] = value
        kernelSum += value
    // Normalize
    for i = 0 to kernel.length - 1:
        kernel[i] /= kernelSum

    result = heightMap
    for pass = 0 to passes - 1:
        result = convolve1DHorizontal(result, kernel, radius)
        result = convolve1DVertical(result, kernel, radius)

    return result

function convolve1DHorizontal(data, kernel, radius):
    height = data.length
    width = data[0].length
    result = new 2D array [height][width]

    for y = 0 to height - 1:
        for x = 0 to width - 1:
            sum = 0
            weightSum = 0
            for k = -radius to +radius:
                nx = clamp(x + k, 0, width - 1)
                weight = kernel[k + radius]
                sum += data[y][nx] * weight
                weightSum += weight
            result[y][x] = sum / weightSum

    return result

function convolve1DVertical(data, kernel, radius):
    height = data.length
    width = data[0].length
    result = new 2D array [height][width]

    for y = 0 to height - 1:
        for x = 0 to width - 1:
            sum = 0
            weightSum = 0
            for k = -radius to +radius:
                ny = clamp(y + k, 0, height - 1)
                weight = kernel[k + radius]
                sum += data[ny][x] * weight
                weightSum += weight
            result[y][x] = sum / weightSum

    return result
```

#### Exact TypeScript Implementation

```typescript
private applyGaussianSmoothing(heightMap: number[][], radius: number, sigma: number, passes: number): number[][] {
    const height = heightMap.length;
    const width = heightMap[0]?.length || 0;

    // Build 1D Gaussian kernel
    const kernelSize = 2 * radius + 1;
    const kernel: number[] = [];
    let kernelSum = 0;

    for (let i = -radius; i <= radius; i++) {
        const value = Math.exp(-(i * i) / (2 * sigma * sigma));
        kernel[i + radius] = value;
        kernelSum += value;
    }

    // Normalize kernel
    for (let i = 0; i < kernelSize; i++) {
        kernel[i] /= kernelSum;
    }

    let result = heightMap;

    for (let pass = 0; pass < passes; pass++) {
        result = this.convolve1DHorizontal(result, kernel, radius);
        result = this.convolve1DVertical(result, kernel, radius);
    }

    return result;
}

private convolve1DHorizontal(data: number[][], kernel: number[], radius: number): number[][] {
    const height = data.length;
    const width = data[0]?.length || 0;
    const result: number[][] = [];

    for (let y = 0; y < height; y++) {
        result[y] = [];
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let weightSum = 0;

            for (let k = -radius; k <= radius; k++) {
                const nx = Math.max(0, Math.min(width - 1, x + k));
                const weight = kernel[k + radius];
                sum += data[y][nx] * weight;
                weightSum += weight;
            }

            result[y][x] = weightSum > 0 ? sum / weightSum : data[y][x];
        }
    }

    return result;
}

private convolve1DVertical(data: number[][], kernel: number[], radius: number): number[][] {
    const height = data.length;
    const width = data[0]?.length || 0;
    const result: number[][] = [];

    for (let y = 0; y < height; y++) {
        result[y] = [];
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let weightSum = 0;

            for (let k = -radius; k <= radius; k++) {
                const ny = Math.max(0, Math.min(height - 1, y + k));
                const weight = kernel[k + radius];
                sum += data[ny][x] * weight;
                weightSum += weight;
            }

            result[y][x] = weightSum > 0 ? sum / weightSum : data[y][x];
        }
    }

    return result;
}
```

#### Parameters

| Parameter | Value | Rationale |
|---|---|---|
| `radius` | 4 | 9-element kernel per dimension. Broad enough to smooth multi-pixel noise regions after median filter. |
| `sigma` | `radius / 2 = 2.0` | Changed from `radius / 3`. Values at kernel edge (distance=4) have weight `exp(-4) ~ 0.018`, still contributing meaningfully. With the old `sigma = radius/3 ~ 1.33`, edge weight was `exp(-4.5) ~ 0.011`, nearly zero. |
| `passes` | 2 | Two passes of a Gaussian approximate a wider Gaussian (effective sigma = `sigma * sqrt(passes)` = 2.83). This provides strong smoothing without an excessively large kernel. |

#### Property Changes

```typescript
// BEFORE:
private smoothingRadius: number = 2;

// AFTER:
private smoothingRadius: number = 4;
private smoothingPasses: number = 2;
```

Note: The `render()` method currently sets `this.smoothingRadius = Math.max(1, Math.floor(smoothingLevel))`. This continues to work -- the UI-provided `smoothingLevel` parameter overrides the default. The `smoothingPasses` property uses a fixed default of 2.

---

### B.5: createGridPoints (src/renderer3d.ts, lines 109-141)

#### Current Signature

```typescript
private createGridPoints(iterationData: number[][], maxIterations: number, heightScale: number): Point3D[][]
```

#### New Signature

No change.

#### Current Behavior

- `gridResolution = 1` (every pixel is a vertex)
- Calls `createSmoothHeightMap()` at FULL resolution (per-pixel), then samples from the result at `gridResolution` intervals
- Uses `getInterpolatedIterations()` which is actually nearest-neighbor (no interpolation)

#### New Behavior

- `gridResolution = 3` (9x fewer vertices)
- Area-average the iteration data into a downsampled grid BEFORE creating the height map
- Use bilinear interpolation for iteration values at grid vertices
- The smooth height map is created at the downsampled resolution (much faster)

#### Algorithm (Pseudocode)

```
function createGridPoints(iterationData, maxIterations, heightScale):
    gridWidth = floor(width / gridResolution)
    gridHeight = floor(height / gridResolution)

    // Downsample iteration data using area averaging
    downsampledData = downsampleWithAreaAverage(iterationData, gridResolution)

    // Create smooth height map at downsampled resolution
    smoothHeightMap = createSmoothHeightMap(downsampledData, maxIterations, heightScale)

    grid = new 2D array [gridHeight][gridWidth]

    for gridY = 0 to gridHeight - 1:
        for gridX = 0 to gridWidth - 1:
            x = gridX * gridResolution
            y = gridY * gridResolution

            smoothedHeight = smoothHeightMap[gridY][gridX]
            iterations = getInterpolatedIterations(iterationData, x, y)  // bilinear

            grid[gridY][gridX] = {
                x: x - width/2,
                y: y - height/2,
                z: smoothedHeight,
                iterations: iterations,
                gridX: gridX,
                gridY: gridY
            }

    return grid
```

#### Exact TypeScript Implementation

```typescript
private createGridPoints(iterationData: number[][], maxIterations: number, heightScale: number): Point3D[][] {
    const gridWidth = Math.floor(this.width / this.gridResolution);
    const gridHeight = Math.floor(this.height / this.gridResolution);

    // Downsample iteration data using area averaging
    const downsampledData = this.downsampleWithAreaAverage(
        iterationData, this.width, iterationData.length, this.gridResolution
    );

    // Create smooth height map at downsampled resolution
    const smoothHeightMap = this.createSmoothHeightMap(downsampledData, maxIterations, heightScale);

    const grid: Point3D[][] = [];

    for (let gridY = 0; gridY < gridHeight; gridY++) {
        grid[gridY] = [];
        for (let gridX = 0; gridX < gridWidth; gridX++) {
            const x = gridX * this.gridResolution;
            const y = gridY * this.gridResolution;

            if (gridY < smoothHeightMap.length && gridX < smoothHeightMap[0].length) {
                const smoothedHeight = smoothHeightMap[gridY][gridX];
                const iterations = this.getInterpolatedIterations(iterationData, x, y);

                grid[gridY][gridX] = {
                    x: x - this.width / 2,
                    y: y - this.height / 2,
                    z: smoothedHeight,
                    iterations: iterations,
                    gridX: gridX,
                    gridY: gridY
                };
            }
        }
    }

    return grid;
}
```

#### NEW METHOD: downsampleWithAreaAverage

```typescript
private downsampleWithAreaAverage(
    iterationData: number[][],
    width: number,
    height: number,
    gridResolution: number
): number[][] {
    const gridWidth = Math.floor(width / gridResolution);
    const gridHeight = Math.floor(height / gridResolution);
    const downsampled: number[][] = [];

    for (let gridY = 0; gridY < gridHeight; gridY++) {
        downsampled[gridY] = [];
        for (let gridX = 0; gridX < gridWidth; gridX++) {
            let sum = 0;
            let count = 0;

            // Average all pixels within this grid cell
            const startY = gridY * gridResolution;
            const startX = gridX * gridResolution;
            const endY = Math.min(startY + gridResolution, height);
            const endX = Math.min(startX + gridResolution, width);

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    if (iterationData[y] && iterationData[y][x] !== undefined) {
                        sum += iterationData[y][x];
                        count++;
                    }
                }
            }

            downsampled[gridY][gridX] = count > 0 ? sum / count : 0;
        }
    }

    return downsampled;
}
```

#### Property Change

```typescript
// BEFORE:
private gridResolution: number = 1;

// AFTER:
private gridResolution: number = 3;
```

#### Key Design Decision: Height Map at Downsampled Resolution

The current code creates the smooth height map at FULL pixel resolution, then point-samples from it at grid intervals. This is wasteful: computing heights and smoothing for millions of pixels when only ~230K grid vertices are needed.

The new design first downsamples the iteration data, then creates the height map at the reduced grid resolution. This means the median filter and Gaussian smoothing operate on a ~640x360 grid instead of a 1920x1080 grid -- approximately 9x faster for each smoothing pass.

---

### B.6: getInterpolatedIterations -- Bilinear Interpolation (src/renderer3d.ts, lines 282-295)

#### Current Signature

```typescript
private getInterpolatedIterations(iterationData: number[][], x: number, y: number): number
```

#### New Signature

No change.

#### Current Behavior (Nearest-Neighbor)

```typescript
// Floors x and y, returns the single nearest pixel value
const clampedY = Math.max(0, Math.min(height - 1, Math.floor(y)));
const clampedX = Math.max(0, Math.min(width - 1, Math.floor(x)));
return iterationData[clampedY][clampedX];
```

#### New Behavior (Bilinear Interpolation)

Interpolates between the four surrounding pixels using fractional coordinates.

#### Exact TypeScript Implementation

```typescript
private getInterpolatedIterations(iterationData: number[][], x: number, y: number): number {
    const height = iterationData.length;
    const width = iterationData[0]?.length || 0;

    // Get integer and fractional parts
    const x0 = Math.max(0, Math.min(width - 2, Math.floor(x)));
    const y0 = Math.max(0, Math.min(height - 2, Math.floor(y)));
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const fx = x - Math.floor(x); // Fractional part [0, 1)
    const fy = y - Math.floor(y);

    // Get four surrounding values
    const v00 = (iterationData[y0] && iterationData[y0][x0] !== undefined) ? iterationData[y0][x0] : 0;
    const v10 = (iterationData[y0] && iterationData[y0][x1] !== undefined) ? iterationData[y0][x1] : 0;
    const v01 = (iterationData[y1] && iterationData[y1][x0] !== undefined) ? iterationData[y1][x0] : 0;
    const v11 = (iterationData[y1] && iterationData[y1][x1] !== undefined) ? iterationData[y1][x1] : 0;

    // Bilinear interpolation
    const top = v00 * (1 - fx) + v10 * fx;
    const bottom = v01 * (1 - fx) + v11 * fx;
    return top * (1 - fy) + bottom * fy;
}
```

#### Formula

```
interpolated = v00*(1-fx)*(1-fy) + v10*fx*(1-fy) + v01*(1-fx)*fy + v11*fx*fy
```

Where `fx` and `fy` are the fractional parts of the coordinates.

---

### B.7: renderTriangle -- Specular Highlight (src/renderer3d.ts, lines 429-501)

#### Current Signature

```typescript
private renderTriangle(points: ProjectedPoint[], iterations: number, maxIterations: number, colorScheme: ColorScheme): void
```

#### New Signature

No change.

#### Current Behavior

- Computes flat face normal from triangle edges (cross product)
- Three diffuse-only light sources with fixed weights
- No specular component
- Gamma correction applied

#### New Behavior

- Same flat face normal computation
- Same three light sources for diffuse
- ADD specular highlight using Phong reflection model on the primary light
- Specular term is additive (white highlight on top of diffuse color)

#### Algorithm (Pseudocode)

```
function renderTriangle(points, iterations, maxIterations, colorScheme):
    // ... existing normal calculation (unchanged) ...

    // Diffuse lighting (unchanged from current)
    lightDir1 = normalize({-0.5, -0.5, 1})     // Main light
    lightDir2 = normalize({0.3, 0.3, 0.8})      // Fill light
    lightDir3 = normalize({0, 1, 0.2})           // Ambient light

    diffuse1 = max(0, dot(normal, lightDir1))
    diffuse2 = max(0, dot(normal, lightDir2))
    diffuse3 = max(0, dot(normal, lightDir3))

    diffuseIntensity = max(0.15, diffuse1*0.6 + diffuse2*0.25 + diffuse3*0.15)

    // NEW: Specular highlight (Phong model, primary light only)
    viewDir = normalize({0, 0, 1})               // Camera looks down +Z in screen space
    reflectDir = 2 * dot(normal, lightDir1) * normal - lightDir1
    specDot = max(0, dot(reflectDir, viewDir))
    specular = specularCoefficient * pow(specDot, shininess)

    // Get base color
    avgIterations = (p1.iterations + p2.iterations + p3.iterations) / 3
    baseColor = ColorSchemes.getColor(avgIterations, maxIterations, colorScheme)

    // Apply lighting: diffuse * baseColor + specular (white highlight)
    gamma = 2.2
    r = floor(255 * min(1.0, pow((baseColor.r/255) * diffuseIntensity, 1/gamma) + specular))
    g = floor(255 * min(1.0, pow((baseColor.g/255) * diffuseIntensity, 1/gamma) + specular))
    b = floor(255 * min(1.0, pow((baseColor.b/255) * diffuseIntensity, 1/gamma) + specular))

    // ... existing triangle drawing (unchanged) ...
```

#### Key Addition to TypeScript

The following code is ADDED inside `renderTriangle()`, after the existing `lightIntensity` calculation and before the color computation:

```typescript
// Specular highlight (Phong model, primary light only)
// Normalize the primary light direction
const lightLen1 = Math.sqrt(
    lightDir1.x * lightDir1.x + lightDir1.y * lightDir1.y + lightDir1.z * lightDir1.z
);
const normLight1 = {
    x: lightDir1.x / lightLen1,
    y: lightDir1.y / lightLen1,
    z: lightDir1.z / lightLen1
};

// View direction (camera looks down +Z axis)
const viewDir = { x: 0, y: 0, z: 1 };

// Reflection vector: R = 2 * (N dot L) * N - L
const nDotL = Math.max(0,
    normal.x * normLight1.x + normal.y * normLight1.y + normal.z * normLight1.z
);
const reflectDir = {
    x: 2 * nDotL * normal.x - normLight1.x,
    y: 2 * nDotL * normal.y - normLight1.y,
    z: 2 * nDotL * normal.z - normLight1.z
};

// Specular intensity
const specDot = Math.max(0,
    reflectDir.x * viewDir.x + reflectDir.y * viewDir.y + reflectDir.z * viewDir.z
);
const specular = this.specularCoefficient * Math.pow(specDot, this.shininess);
```

And the color computation changes from:

```typescript
// BEFORE:
const r = Math.floor(255 * Math.pow((baseColor.r / 255) * lightIntensity, 1 / gamma));
const g = Math.floor(255 * Math.pow((baseColor.g / 255) * lightIntensity, 1 / gamma));
const b = Math.floor(255 * Math.pow((baseColor.b / 255) * lightIntensity, 1 / gamma));
```

To:

```typescript
// AFTER (specular added as white highlight):
const r = Math.floor(255 * Math.min(1.0, Math.pow((baseColor.r / 255) * lightIntensity, 1 / gamma) + specular));
const g = Math.floor(255 * Math.min(1.0, Math.pow((baseColor.g / 255) * lightIntensity, 1 / gamma) + specular));
const b = Math.floor(255 * Math.min(1.0, Math.pow((baseColor.b / 255) * lightIntensity, 1 / gamma) + specular));
```

#### New Class Properties

```typescript
private readonly specularCoefficient: number = 0.4;
private readonly shininess: number = 40;
```

#### Parameter Rationale

| Parameter | Value | Effect |
|---|---|---|
| `specularCoefficient` (k_s) | 0.4 | Moderate specular intensity. Visible highlights but does not wash out base colors. |
| `shininess` | 40 | Medium-tight specular lobe. Creates distinct but not pinpoint highlights. Values 20-80 are typical for terrain. |

---

### B.8: drawBackground (src/renderer3d.ts, lines 100-107)

#### Current Signature

```typescript
private drawBackground(): void
```

#### New Signature

No change.

#### Current Behavior

Linear gradient from `#0a0a0a` (near-black) at top to `#1a1a2e` (dark blue) at bottom.

#### New Behavior

Warm sunset gradient: orange at top transitioning to dark blue at bottom. Note: the gradient direction is "top = sky, bottom = horizon/foreground", and the 3D terrain typically sits in the lower portion of the canvas, so the warm colors at the top create a sunset sky effect above the terrain.

#### Exact TypeScript Implementation

```typescript
private drawBackground(): void {
    // Warm sunset gradient background
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#FF6B35');    // Warm orange at top (sky)
    gradient.addColorStop(0.4, '#8a4520');  // Orange-brown transition
    gradient.addColorStop(0.7, '#2d1810');  // Deep brown
    gradient.addColorStop(1, '#1a1a2e');    // Dark blue at bottom (horizon)
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
}
```

#### Color Rationale

The gradient flows from warm orange (#FF6B35) through earth tones down to the original dark blue (#1a1a2e) at the bottom. This creates a sunset sky effect that complements the terrain without clashing with any of the 13 color schemes, since the terrain surface covers most of the lower viewport area.

---

### B.9: createSmoothHeightMap (src/renderer3d.ts, lines 182-202)

#### Current Signature

```typescript
private createSmoothHeightMap(iterationData: number[][], maxIterations: number, heightScale: number): number[][]
```

#### New Signature

No change.

#### Current Behavior (Pipeline)

1. `calculateSmoothHeight()` for each pixel
2. `applyGaussianSmoothing()` (single pass)

#### New Behavior (Pipeline)

1. `calculateSmoothHeight()` for each cell (now operating on downsampled data)
2. `applyMedianFilter()` with radius 2 **(NEW STEP)**
3. `applyGaussianSmoothing()` with radius 4, sigma 2.0, 2 passes **(ENHANCED)**

#### Exact TypeScript Implementation

```typescript
private createSmoothHeightMap(iterationData: number[][], maxIterations: number, heightScale: number): number[][] {
    const height = iterationData.length;
    const width = iterationData[0]?.length || 0;
    let heightMap: number[][] = [];

    // Step 1: Calculate heights via power-law curve
    for (let y = 0; y < height; y++) {
        heightMap[y] = [];
        for (let x = 0; x < width; x++) {
            if (iterationData[y] && iterationData[y][x] !== undefined) {
                const iterations = iterationData[y][x];
                heightMap[y][x] = this.calculateSmoothHeight(iterations, maxIterations, heightScale);
            } else {
                heightMap[y][x] = 0;
            }
        }
    }

    // Step 2: Median filter for spike removal (NEW)
    heightMap = this.applyMedianFilter(heightMap, 2);

    // Step 3: Gaussian smoothing (enhanced: separable, multi-pass)
    const sigma = this.smoothingRadius / 2;
    heightMap = this.applyGaussianSmoothing(heightMap, this.smoothingRadius, sigma, this.smoothingPasses);

    return heightMap;
}
```

#### Pipeline Visualization

```
Input: downsampled iteration data (from downsampleWithAreaAverage)
  |
  v
[calculateSmoothHeight per cell] -- power-law: heightScale * (1-ratio)^0.5
  |
  v
Raw height map (may contain spikes from sharp iteration boundaries)
  |
  v
[applyMedianFilter, radius=2] -- removes isolated spikes (5x5 window median)
  |
  v
Spike-free height map (still has some noise/roughness)
  |
  v
[applyGaussianSmoothing, radius=4, sigma=2.0, pass 1] -- first smoothing pass
  |
  v
[applyGaussianSmoothing, radius=4, sigma=2.0, pass 2] -- second smoothing pass
  |
  v
Output: smooth height map ready for 3D mesh construction
```

---

## C. New Interfaces / Types

No new interfaces or types are needed. The existing `Point3D` and `ProjectedPoint` interfaces are sufficient for all changes.

The existing interfaces remain unchanged:

```typescript
export interface Point3D {
    x: number;
    y: number;
    z: number;
    iterations: number;
    gridX: number;
    gridY: number;
}

export interface ProjectedPoint {
    x: number;
    y: number;
    z: number;
    iterations: number;
    scale: number;
    gridX: number;
    gridY: number;
}
```

---

## D. Implementation Units for Parallel Coding

The changes can be split into two independent implementation units that touch NO shared files:

### Unit 1: Smooth Iteration Count (src/index.ts ONLY)

**File:** `src/index.ts`
**Scope:** Modify `mandelbrotIteration()` method only (lines 533-549)

**Changes:**
1. Increase bailout from `> 4` to `> 65536`
2. Compute smooth iteration value: `n + 1 - Math.log2(Math.log2(magnitudeSquared) / 2)`
3. Return `Math.max(0, smoothValue)` instead of `n`
4. Interior points still return `maxIterations` (unchanged)

**No other methods in index.ts need modification.** The `calculateIterationData()` method stores results in `number[][]` which already supports floats. The `calculateWithColorScheme()` method calls `mandelbrotIteration()` and will receive float values, but `ColorSchemes.getColor()` handles fractional ratios correctly.

**Dependencies:** None. This unit can start immediately.

**Verification:** `npm run build` must succeed. Visual check: 2D mode should show smoother color gradients (no banding). 3D mode should show smoother terrain even before the renderer3d.ts changes.

---

### Unit 2: Renderer3D Enhancements (src/renderer3d.ts ONLY)

**File:** `src/renderer3d.ts`
**Scope:** All renderer changes

**Changes (in dependency order within the file):**

1. **Property changes:**
   - `gridResolution`: 1 -> 3
   - `smoothingRadius`: 2 -> 4
   - NEW: `smoothingPasses`: 2
   - NEW: `specularCoefficient`: 0.4
   - NEW: `shininess`: 40

2. **drawBackground()** -- Replace gradient colors (B.8)

3. **calculateSmoothHeight()** -- Replace with power-law curve (B.2)

4. **NEW: applyMedianFilter()** -- Add median filter method (B.3)

5. **applyGaussianSmoothing()** -- Complete rewrite as separable with new signature (B.4)
   - NEW: `convolve1DHorizontal()` -- helper method
   - NEW: `convolve1DVertical()` -- helper method

6. **createSmoothHeightMap()** -- Update pipeline to include median filter and new Gaussian params (B.9)

7. **NEW: downsampleWithAreaAverage()** -- Area-averaging downsampler (B.5)

8. **createGridPoints()** -- Integrate downsampling, change data flow (B.5)

9. **getInterpolatedIterations()** -- Replace nearest-neighbor with bilinear interpolation (B.6)

10. **renderTriangle()** -- Add specular highlight computation (B.7)

**Dependencies:** None external. All changes are within `src/renderer3d.ts`. Internal ordering matters (the height map pipeline must be consistent), but all changes are committed together.

**Verification:** `npm run build` must succeed. Visual check: 3D mode should show smooth terrain, no spikes, warm background, visible specular highlights.

---

### Unit Independence Guarantee

| Aspect | Unit 1 (index.ts) | Unit 2 (renderer3d.ts) |
|---|---|---|
| Files modified | `src/index.ts` | `src/renderer3d.ts` |
| Shared files | NONE | NONE |
| Interface changes | NONE (returns float instead of int, same `number` type) | NONE (existing interfaces unchanged) |
| Can run in parallel | YES | YES |
| Integration point | `iterationData: number[][]` passed to `Renderer3D.render()` | Receives `iterationData: number[][]` from caller |

---

## E. Integration Points

### E.1: Data Flow from index.ts to renderer3d.ts

The sole integration point between the two files is the `render()` method call:

```
MandelbrotExplorer.render() [index.ts:463-486]
  -> this.calculateIterationData()
     -> this.mandelbrotIteration() -- NOW returns smooth floats
     -> stores in this.iterationData: number[][]
  -> this.renderer3D.render(
       this.iterationData,    // <-- float[][] instead of int[][]
       maxIterations,
       this.colorScheme,
       rotationX, rotationY, rotationZ,
       heightScale,
       smoothingLevel
     )
```

**Contract:** `iterationData` is `number[][]` where each value is in the range `[0, maxIterations]`. Before this change, values were integers. After, values are floats. The Renderer3D methods already use `number` types throughout, so no type changes are needed at the interface boundary.

### E.2: Backward Compatibility -- 2D Rendering

There are TWO 2D rendering paths. Both must remain functional:

#### Path A: calculateWithColorScheme (index.ts, lines 488-512)

- **Calls `mandelbrotIteration()`**: YES (confirmed by code inspection)
- **Impact:** Will receive smooth float values instead of integers
- **Safe because:** `ColorSchemes.getColor(iterations, maxIterations, scheme)` computes `ratio = iterations / maxIterations` and uses this ratio for color interpolation. Fractional ratios produce smoother color transitions -- this is a visual improvement, not a regression.

#### Path B: MandelbrotCalculator.calculate() (mandelbrot.ts)

- **Calls `MandelbrotExplorer.mandelbrotIteration()`**: NO. Uses its own independent `MandelbrotCalculator.mandelbrotIteration()`.
- **Impact:** NONE. Completely unaffected.

### E.3: Rectangle-to-3D Path

The `render3DFromSelectedRectangle()` method (index.ts, lines 551-583) uses `renderFromHeightMap()` which takes a pre-computed height map from canvas pixel luminance. This path does NOT use `iterationData` and does NOT go through the `createSmoothHeightMap()` pipeline.

**Impact:** Only the `drawBackground()` change (warm gradient) affects this path. The smooth iteration change indirectly improves it by producing smoother 2D renders, which yield smoother luminance-based height maps.

### E.4: Existing Controls Compatibility

| Control | Affected? | Notes |
|---|---|---|
| Rotation (X/Y/Z sliders) | No | `transformAndProject()` is unchanged |
| Height scale slider | No | Passed through to `calculateSmoothHeight()` which still uses it |
| Smoothing level slider | Partially | Still sets `this.smoothingRadius` via `render()`. The new `smoothingPasses` is not UI-exposed (uses default 2). |
| Color scheme selector | No | `ColorSchemes.getColor()` is unchanged |
| Iteration count input | No | `maxIterations` still drives the iteration loop |
| WASD/Arrow key navigation | No | Viewport changes are independent of rendering logic |
| 3D mode toggle | No | The toggle logic in `render()` is unchanged |

---

## F. Summary of All New and Modified Symbols

### New Private Methods in Renderer3D

| Method | Signature | Purpose |
|---|---|---|
| `applyMedianFilter` | `(heightMap: number[][], radius: number): number[][]` | Spike removal via median of local neighborhood |
| `convolve1DHorizontal` | `(data: number[][], kernel: number[], radius: number): number[][]` | Horizontal pass of separable Gaussian |
| `convolve1DVertical` | `(data: number[][], kernel: number[], radius: number): number[][]` | Vertical pass of separable Gaussian |
| `downsampleWithAreaAverage` | `(iterationData: number[][], width: number, height: number, gridResolution: number): number[][]` | Area-averaged grid downsampling |

### Modified Methods

| File | Method | Nature of Change |
|---|---|---|
| `src/index.ts` | `mandelbrotIteration` | Bailout 4->65536, return smooth float |
| `src/renderer3d.ts` | `calculateSmoothHeight` | Replace 3-function blend with single power curve |
| `src/renderer3d.ts` | `applyGaussianSmoothing` | Complete rewrite: separable, new signature with radius/sigma/passes params |
| `src/renderer3d.ts` | `createSmoothHeightMap` | Add median filter step, update Gaussian call |
| `src/renderer3d.ts` | `createGridPoints` | Integrate area-average downsampling |
| `src/renderer3d.ts` | `getInterpolatedIterations` | Replace nearest-neighbor with bilinear interpolation |
| `src/renderer3d.ts` | `renderTriangle` | Add Phong specular highlight |
| `src/renderer3d.ts` | `drawBackground` | Replace dark gradient with warm sunset |

### New Properties in Renderer3D

| Property | Type | Default | Purpose |
|---|---|---|---|
| `smoothingPasses` | `number` | 2 | Number of Gaussian smoothing passes |
| `specularCoefficient` | `number` (readonly) | 0.4 | Phong specular coefficient (k_s) |
| `shininess` | `number` (readonly) | 40 | Phong specular exponent |

### Modified Properties in Renderer3D

| Property | Old Default | New Default | Reason |
|---|---|---|---|
| `gridResolution` | 1 | 3 | Reduce vertex count 9x, natural noise suppression |
| `smoothingRadius` | 2 | 4 | Wider kernel for more effective smoothing |
