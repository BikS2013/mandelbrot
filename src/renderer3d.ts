import { ColorSchemes, ColorScheme } from './colorSchemes.js';

/**
 * Samples the fractal at a canvas pixel coordinate (fractional coordinates
 * allowed) and returns the smooth iteration count for that point.
 */
export type IterationSampler = (px: number, py: number) => number;

export type DrawQuality = 'high' | 'fast';

export type ViewSide = 'above' | 'below';

interface Vec3 {
    x: number;
    y: number;
    z: number;
}

interface LightSource {
    dir: Vec3;    // normalized, terrain space, +z up, pointing toward the light
    weight: number;
}

const GAMMA = 2.2;

function normalized(x: number, y: number, z: number): Vec3 {
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    return { x: x / len, y: y / len, z: z / len };
}

/**
 * Canvas-2D heightfield renderer for the Mandelbrot set.
 *
 * The renderer keeps a cached scene (heights, normals, lit vertex colors) so
 * that rotation, height-scale and color-scheme changes never recompute the
 * fractal. Only buildSurface* methods sample the fractal; draw() just
 * rotates, projects, depth-sorts and paints the cached grid.
 */
export class Renderer3D {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;

    // Grid sizing: one vertex per ~4 canvas pixels, capped for interactivity
    private readonly pixelsPerCell = 4;
    private readonly minGridSize = 24;
    private readonly maxGridSize = 300;
    private readonly superSample = 2; // 2x2 supersampling per grid vertex

    // Height shaping: interior = plateau (1.0), exterior falls off toward 0
    private readonly heightExponent = 2.2;
    private readonly heightBoost = 2.5; // world z units per heightScale unit

    // Smoothing (tuned for the ~220-wide grid)
    private readonly medianFilterRadius = 1;
    private readonly smoothingRadius = 2;
    private readonly smoothingPasses = 2;

    // Lighting (terrain space, +z up, hillshade-style: fixed to the surface)
    private readonly ambientCoefficient = 0.22;
    private readonly specularStrength = 0.35;
    private readonly shininess = 40;
    private readonly lights: LightSource[] = [
        { dir: normalized(-0.45, -0.5, 0.74), weight: 0.62 }, // key
        { dir: normalized(0.6, 0.35, 0.72), weight: 0.25 },   // fill
        { dir: normalized(0, 0.85, 0.53), weight: 0.13 },     // back
    ];

    private readonly cameraDistance = 800;
    private viewZoom = 1;
    private viewSide: ViewSide = 'above';

    // Cached scene
    private gridW = 0;
    private gridH = 0;
    private cellW = 1;   // world units between grid columns
    private cellH = 1;   // world units between grid rows
    private originX = 0; // world x of grid column 0
    private originY = 0; // world y of grid row 0
    private heights: Float32Array | null = null;        // normalized [0, 1]
    private sourceMaxIterations = 100;
    private surfaceSource: 'iterations' | 'heightmap' = 'iterations';
    private baseLinear: Float32Array | null = null;     // linear-space rgb per vertex
    private normals: Float32Array | null = null;        // terrain-space xyz per vertex
    private litLinear: Float32Array | null = null;      // diffuse-lit linear rgb per vertex
    private colorScheme: ColorScheme = 'classic';
    private heightScale = 50;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.width = canvas.width;
        this.height = canvas.height;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    public hasSurface(): boolean {
        return this.heights !== null;
    }

    public getViewZoom(): number {
        return this.viewZoom;
    }

    public setViewZoom(zoom: number): void {
        this.viewZoom = Math.max(0.3, Math.min(4, zoom));
    }

    public getViewSide(): ViewSide {
        return this.viewSide;
    }

    /** Chooses whether the camera orbits above or below the surface. */
    public setViewSide(side: ViewSide): void {
        this.viewSide = side;
    }

    /**
     * Builds the cached surface by sampling the fractal at grid resolution
     * (with supersampling for anti-aliasing) instead of full canvas
     * resolution, then smoothing the resulting heightfield.
     */
    public buildSurfaceFromIterations(
        sample: IterationSampler,
        maxIterations: number,
        colorScheme: ColorScheme,
        heightScale: number
    ): void {
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.computeGridDims(this.width, this.height);

        const n = this.gridW * this.gridH;
        const iterations = new Float32Array(n);
        const ss = this.superSample;
        const cellPxX = this.width / this.gridW;
        const cellPxY = this.height / this.gridH;

        for (let gy = 0; gy < this.gridH; gy++) {
            for (let gx = 0; gx < this.gridW; gx++) {
                let sum = 0;
                for (let sy = 0; sy < ss; sy++) {
                    for (let sx = 0; sx < ss; sx++) {
                        const px = (gx + (sx + 0.5) / ss) * cellPxX;
                        const py = (gy + (sy + 0.5) / ss) * cellPxY;
                        sum += sample(px, py);
                    }
                }
                iterations[gy * this.gridW + gx] = sum / (ss * ss);
            }
        }

        this.sourceMaxIterations = maxIterations;
        this.surfaceSource = 'iterations';
        this.colorScheme = colorScheme;
        this.heightScale = heightScale;

        let heights = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            heights[i] = this.computeNormalizedHeight(iterations[i], maxIterations);
        }
        heights = this.applyMedianFilter(heights, this.medianFilterRadius);
        heights = this.applyGaussianSmoothing(
            heights, this.smoothingRadius, this.smoothingRadius / 2, this.smoothingPasses
        );
        this.heights = heights;

        this.computeBaseColors();
        this.computeNormals();
        this.relight();
    }

    /**
     * Builds the cached surface from an arbitrary heightmap (values in [0,1]),
     * e.g. the rectangle-selection luminance map. Applies the same median +
     * Gaussian smoothing pipeline as the iteration path.
     */
    public buildSurfaceFromHeightMap(
        heightMap: number[][],
        colorScheme: ColorScheme,
        heightScale: number
    ): void {
        const mapH = heightMap.length;
        const mapW = heightMap[0]?.length || 0;
        if (mapH < 2 || mapW < 2) return;

        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Fit the heightmap into the canvas preserving its aspect ratio
        const fit = Math.min(this.width / mapW, this.height / mapH);
        const worldW = mapW * fit;
        const worldH = mapH * fit;
        this.computeGridDims(worldW, worldH);
        this.originX = -worldW / 2 + this.cellW / 2;
        this.originY = -worldH / 2 + this.cellH / 2;

        const n = this.gridW * this.gridH;
        let heights = new Float32Array(n);
        for (let gy = 0; gy < this.gridH; gy++) {
            for (let gx = 0; gx < this.gridW; gx++) {
                const mx = ((gx + 0.5) / this.gridW) * mapW - 0.5;
                const my = ((gy + 0.5) / this.gridH) * mapH - 0.5;
                heights[gy * this.gridW + gx] = this.bilinearSample(heightMap, mapW, mapH, mx, my);
            }
        }
        heights = this.applyMedianFilter(heights, this.medianFilterRadius);
        heights = this.applyGaussianSmoothing(
            heights, this.smoothingRadius, this.smoothingRadius / 2, this.smoothingPasses
        );
        this.heights = heights;

        this.surfaceSource = 'heightmap';
        this.colorScheme = colorScheme;
        this.heightScale = heightScale;

        this.computeBaseColors();
        this.computeNormals();
        this.relight();
    }

    /** Recolors the cached surface without resampling the fractal. */
    public setColorScheme(colorScheme: ColorScheme): void {
        if (!this.heights) return;
        this.colorScheme = colorScheme;
        this.computeBaseColors();
        this.relight();
    }

    /** Rescales heights: only normals and lighting are recomputed. */
    public setHeightScale(heightScale: number): void {
        if (!this.heights) return;
        this.heightScale = heightScale;
        this.computeNormals();
        this.relight();
    }

    /**
     * Rotates, projects, depth-sorts and paints the cached surface.
     * 'fast' quality decimates the grid 2x for interactive dragging.
     */
    public draw(rotationX: number, rotationY: number, rotationZ: number, quality: DrawQuality = 'high'): void {
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.drawBackground();

        const heights = this.heights;
        const normals = this.normals;
        const litLinear = this.litLinear;
        if (!heights || !normals || !litLinear) return;

        const step = quality === 'fast' ? 2 : 1;
        const cols = Math.ceil(this.gridW / step);
        const rows = Math.ceil(this.gridH / step);
        const count = cols * rows;

        const radX = (rotationX * Math.PI) / 180;
        const radY = (rotationY * Math.PI) / 180;
        const radZ = (rotationZ * Math.PI) / 180;
        const cosX = Math.cos(radX), sinX = Math.sin(radX);
        const cosY = Math.cos(radY), sinY = Math.sin(radY);
        const cosZ = Math.cos(radZ), sinZ = Math.sin(radZ);

        const zScale = this.heightScale * this.heightBoost;
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        // -1 puts the camera above the surface (higher terrain is nearer);
        // +1 mirrors the depth so the surface is seen from underneath.
        const depthSign = this.viewSide === 'above' ? -1 : 1;

        const sx = new Float32Array(count);
        const sy = new Float32Array(count);
        const sz = new Float32Array(count);
        const gridIndex = new Int32Array(count);

        for (let r = 0; r < rows; r++) {
            const gy = Math.min(this.gridH - 1, r * step);
            for (let c = 0; c < cols; c++) {
                const gx = Math.min(this.gridW - 1, c * step);
                const gi = gy * this.gridW + gx;
                const wx = this.originX + gx * this.cellW;
                const wy = this.originY + gy * this.cellH;
                const wz = heights[gi] * zScale;

                // Orbit rotation: yaw (Z) spins the terrain around its
                // up-axis, roll (Y) tilts sideways, pitch (X) is applied
                // last so heights always rise toward the top of the screen.
                const x1 = wx * cosZ - wy * sinZ;
                const y1 = wx * sinZ + wy * cosZ;
                const x3 = x1 * cosY + wz * sinY;
                const z1 = -x1 * sinY + wz * cosY;
                const y3 = y1 * cosX - z1 * sinX;
                // In 'above' mode the depth is negated so the camera sits
                // above the surface: higher terrain is nearer, the ground row
                // at the bottom of the screen is nearest, and occlusion is
                // seen from above. 'below' mode mirrors the depth.
                const z2 = depthSign * (y1 * sinX + z1 * cosX);

                const denom = Math.max(50, this.cameraDistance + z2);
                const perspective = (this.cameraDistance / denom) * this.viewZoom;

                const vi = r * cols + c;
                sx[vi] = x3 * perspective + halfW;
                sy[vi] = y3 * perspective + halfH;
                sz[vi] = z2;
                gridIndex[vi] = gi;
            }
        }

        // View direction (surface -> camera) transformed into terrain space.
        // The full transform is depth-sign * Rx * Ry * Rz, so the inverse
        // applied to the view-space camera direction (0, 0, -1) reduces to
        // (Rx^-1, Ry^-1, Rz^-1) applied to (0, 0, -depthSign).
        let vwx = 0, vwy = 0, vwz = -depthSign;
        {
            // Rx^-1
            let ty = vwy * cosX + vwz * sinX;
            let tz = -vwy * sinX + vwz * cosX;
            vwy = ty; vwz = tz;
            // Ry^-1
            const tx = vwx * cosY - vwz * sinY;
            tz = vwx * sinY + vwz * cosY;
            vwx = tx; vwz = tz;
            // Rz^-1
            const tx2 = vwx * cosZ + vwy * sinZ;
            ty = -vwx * sinZ + vwy * cosZ;
            vwx = tx2; vwy = ty;
        }

        // Assemble triangles (two per grid quad) for painter's algorithm
        const triangles: Array<{ a: number; b: number; c: number; depth: number }> = [];
        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                const i00 = r * cols + c;
                const i10 = i00 + 1;
                const i01 = i00 + cols;
                const i11 = i01 + 1;
                triangles.push(
                    { a: i00, b: i10, c: i01, depth: (sz[i00] + sz[i10] + sz[i01]) / 3 },
                    { a: i10, b: i01, c: i11, depth: (sz[i10] + sz[i01] + sz[i11]) / 3 }
                );
            }
        }
        triangles.sort((t1, t2) => t2.depth - t1.depth);

        const ctx = this.ctx;
        const keyLight = this.lights[0].dir;
        const invGamma = 1 / GAMMA;
        ctx.lineWidth = 1;

        for (const tri of triangles) {
            const ga = gridIndex[tri.a] * 3;
            const gb = gridIndex[tri.b] * 3;
            const gc = gridIndex[tri.c] * 3;

            // Averaged (smooth) terrain-space normal of the triangle
            let nx = normals[ga] + normals[gb] + normals[gc];
            let ny = normals[ga + 1] + normals[gb + 1] + normals[gc + 1];
            let nz = normals[ga + 2] + normals[gb + 2] + normals[gc + 2];
            const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= nLen; ny /= nLen; nz /= nLen;

            // Double-sided: face the camera for the specular term
            if (nx * vwx + ny * vwy + nz * vwz < 0) {
                nx = -nx; ny = -ny; nz = -nz;
            }

            // Phong specular from the key light (diffuse is baked per vertex)
            const nDotL = nx * keyLight.x + ny * keyLight.y + nz * keyLight.z;
            let specular = 0;
            if (nDotL > 0) {
                const rx = 2 * nDotL * nx - keyLight.x;
                const ry = 2 * nDotL * ny - keyLight.y;
                const rz = 2 * nDotL * nz - keyLight.z;
                const rDotV = rx * vwx + ry * vwy + rz * vwz;
                if (rDotV > 0) {
                    specular = this.specularStrength * Math.pow(rDotV, this.shininess);
                }
            }

            const lr = (litLinear[ga] + litLinear[gb] + litLinear[gc]) / 3 + specular;
            const lg = (litLinear[ga + 1] + litLinear[gb + 1] + litLinear[gc + 1]) / 3 + specular;
            const lb = (litLinear[ga + 2] + litLinear[gb + 2] + litLinear[gc + 2]) / 3 + specular;

            const r255 = Math.round(255 * Math.pow(Math.min(1, lr), invGamma));
            const g255 = Math.round(255 * Math.pow(Math.min(1, lg), invGamma));
            const b255 = Math.round(255 * Math.pow(Math.min(1, lb), invGamma));
            const style = `rgb(${r255},${g255},${b255})`;

            ctx.fillStyle = style;
            ctx.strokeStyle = style;
            ctx.beginPath();
            ctx.moveTo(sx[tri.a], sy[tri.a]);
            ctx.lineTo(sx[tri.b], sy[tri.b]);
            ctx.lineTo(sx[tri.c], sy[tri.c]);
            ctx.closePath();
            ctx.fill();
            // Same-color stroke fills anti-aliasing seams between triangles
            ctx.stroke();
        }
    }

    private computeGridDims(worldW: number, worldH: number): void {
        const aspect = worldH / worldW;
        let gw = Math.min(this.maxGridSize, Math.max(this.minGridSize, Math.floor(worldW / this.pixelsPerCell)));
        let gh = Math.round(gw * aspect);
        if (gh > this.maxGridSize) {
            gh = this.maxGridSize;
            gw = Math.max(this.minGridSize, Math.round(gh / aspect));
        }
        this.gridW = Math.max(2, gw);
        this.gridH = Math.max(2, gh);
        this.cellW = worldW / this.gridW;
        this.cellH = worldH / this.gridH;
        this.originX = -worldW / 2 + this.cellW / 2;
        this.originY = -worldH / 2 + this.cellH / 2;
    }

    /**
     * Height mapping: the set interior forms a plateau at 1.0 and the
     * exterior falls off toward 0, rising steeply near the boundary so the
     * fractal filaments read as mountain ridges.
     */
    private computeNormalizedHeight(iterations: number, maxIterations: number): number {
        const t = iterations / maxIterations;
        if (t >= 1) return 1;
        return Math.pow(Math.max(0, t), this.heightExponent);
    }

    private computeBaseColors(): void {
        const heights = this.heights!;
        const n = this.gridW * this.gridH;
        const base = new Float32Array(n * 3);

        for (let i = 0; i < n; i++) {
            let color;
            if (this.surfaceSource === 'iterations') {
                // Color from the smoothed height field (inverse of the height
                // curve) so color bands follow the terrain contours instead of
                // reproducing the chaotic per-sample iteration noise.
                const h = heights[i];
                if (h >= 0.9995) {
                    color = ColorSchemes.getColor(this.sourceMaxIterations, this.sourceMaxIterations, this.colorScheme);
                } else {
                    const t = Math.pow(h, 1 / this.heightExponent);
                    color = ColorSchemes.getColor(t * this.sourceMaxIterations, this.sourceMaxIterations, this.colorScheme);
                }
            } else {
                color = ColorSchemes.getColor(heights[i] * 100, 100, this.colorScheme);
            }
            base[i * 3] = Math.pow(color.r / 255, GAMMA);
            base[i * 3 + 1] = Math.pow(color.g / 255, GAMMA);
            base[i * 3 + 2] = Math.pow(color.b / 255, GAMMA);
        }

        this.baseLinear = base;
    }

    /**
     * Smooth per-vertex normals from the height map via central differences,
     * in terrain space (+z up). Recomputed when heightScale changes.
     */
    private computeNormals(): void {
        const heights = this.heights!;
        const w = this.gridW;
        const h = this.gridH;
        const zScale = this.heightScale * this.heightBoost;
        const normals = new Float32Array(w * h * 3);

        for (let gy = 0; gy < h; gy++) {
            const yPrev = Math.max(0, gy - 1);
            const yNext = Math.min(h - 1, gy + 1);
            for (let gx = 0; gx < w; gx++) {
                const xPrev = Math.max(0, gx - 1);
                const xNext = Math.min(w - 1, gx + 1);

                const dzdx = (heights[gy * w + xNext] - heights[gy * w + xPrev]) * zScale
                    / ((xNext - xPrev) * this.cellW);
                const dzdy = (heights[yNext * w + gx] - heights[yPrev * w + gx]) * zScale
                    / ((yNext - yPrev) * this.cellH);

                const nLen = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
                const i = (gy * w + gx) * 3;
                normals[i] = -dzdx / nLen;
                normals[i + 1] = -dzdy / nLen;
                normals[i + 2] = 1 / nLen;
            }
        }

        this.normals = normals;
    }

    /**
     * Bakes ambient + diffuse lighting into per-vertex linear colors.
     * Lights are fixed in terrain space, so this is rotation-independent.
     */
    private relight(): void {
        const base = this.baseLinear!;
        const normals = this.normals!;
        const n = this.gridW * this.gridH;
        const lit = new Float32Array(n * 3);

        for (let i = 0; i < n; i++) {
            const nx = normals[i * 3];
            const ny = normals[i * 3 + 1];
            const nz = normals[i * 3 + 2];

            let diffuse = 0;
            for (const light of this.lights) {
                const d = nx * light.dir.x + ny * light.dir.y + nz * light.dir.z;
                if (d > 0) diffuse += light.weight * d;
            }
            const intensity = Math.min(1, this.ambientCoefficient + (1 - this.ambientCoefficient) * diffuse);

            lit[i * 3] = base[i * 3] * intensity;
            lit[i * 3 + 1] = base[i * 3 + 1] * intensity;
            lit[i * 3 + 2] = base[i * 3 + 2] * intensity;
        }

        this.litLinear = lit;
    }

    private bilinearSample(map: number[][], mapW: number, mapH: number, x: number, y: number): number {
        const x0 = Math.max(0, Math.min(mapW - 1, Math.floor(x)));
        const y0 = Math.max(0, Math.min(mapH - 1, Math.floor(y)));
        const x1 = Math.min(mapW - 1, x0 + 1);
        const y1 = Math.min(mapH - 1, y0 + 1);
        const fx = Math.max(0, Math.min(1, x - x0));
        const fy = Math.max(0, Math.min(1, y - y0));

        const top = map[y0][x0] * (1 - fx) + map[y0][x1] * fx;
        const bottom = map[y1][x0] * (1 - fx) + map[y1][x1] * fx;
        return top * (1 - fy) + bottom * fy;
    }

    private applyMedianFilter(data: Float32Array, radius: number): Float32Array {
        const w = this.gridW;
        const h = this.gridH;
        const result = new Float32Array(w * h);
        const windowValues: number[] = [];

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                windowValues.length = 0;
                for (let ky = -radius; ky <= radius; ky++) {
                    const ny = Math.max(0, Math.min(h - 1, y + ky));
                    for (let kx = -radius; kx <= radius; kx++) {
                        const nx = Math.max(0, Math.min(w - 1, x + kx));
                        windowValues.push(data[ny * w + nx]);
                    }
                }
                windowValues.sort((a, b) => a - b);
                result[y * w + x] = windowValues[Math.floor(windowValues.length / 2)];
            }
        }

        return result;
    }

    private applyGaussianSmoothing(data: Float32Array, radius: number, sigma: number, passes: number): Float32Array {
        const kernel: number[] = [];
        let kernelSum = 0;
        for (let i = -radius; i <= radius; i++) {
            const value = Math.exp(-(i * i) / (2 * sigma * sigma));
            kernel[i + radius] = value;
            kernelSum += value;
        }
        for (let i = 0; i < kernel.length; i++) {
            kernel[i] /= kernelSum;
        }

        let result = data;
        for (let pass = 0; pass < passes; pass++) {
            result = this.convolve1D(result, kernel, radius, true);
            result = this.convolve1D(result, kernel, radius, false);
        }
        return result;
    }

    private convolve1D(data: Float32Array, kernel: number[], radius: number, horizontal: boolean): Float32Array {
        const w = this.gridW;
        const h = this.gridH;
        const result = new Float32Array(w * h);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    let sxi = x, syi = y;
                    if (horizontal) {
                        sxi = Math.max(0, Math.min(w - 1, x + k));
                    } else {
                        syi = Math.max(0, Math.min(h - 1, y + k));
                    }
                    sum += data[syi * w + sxi] * kernel[k + radius];
                }
                result[y * w + x] = sum;
            }
        }

        return result;
    }

    private drawBackground(): void {
        // Warm sunset gradient background: dark at top, warm amber at bottom
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#1a0f0a');      // Dark brown/black at top
        gradient.addColorStop(0.3, '#2d1810');    // Deep brown
        gradient.addColorStop(0.5, '#4a2818');    // Brown
        gradient.addColorStop(0.7, '#8a4520');    // Orange-brown
        gradient.addColorStop(0.85, '#c9692a');   // Warm orange
        gradient.addColorStop(1.0, '#e89a5a');    // Light amber at bottom
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
}
