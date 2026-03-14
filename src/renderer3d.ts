import { ColorSchemes, ColorScheme } from './colorSchemes.js';

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

export class Renderer3D {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    private gridResolution: number = 3; // Higher resolution for smoother surfaces
    private smoothingRadius: number = 4; // Radius for Gaussian smoothing
    private smoothingPasses: number = 2; // Number of Gaussian smoothing passes
    private medianFilterRadius: number = 2; // Radius for median filter
    private specularStrength: number = 0.4; // Specular highlight coefficient
    private readonly shininess: number = 40; // Specular shininess exponent

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.width = canvas.width;
        this.height = canvas.height;

        // Configure canvas for smooth rendering without artifacts
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    public render(
        iterationData: number[][],
        maxIterations: number,
        colorScheme: ColorScheme,
        rotationX: number,
        rotationY: number,
        rotationZ: number,
        heightScale: number,
        smoothingLevel: number = 4
    ): void {
        // Update dimensions in case canvas was resized
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Update smoothing radius based on smoothing level
        this.smoothingRadius = Math.max(1, Math.floor(smoothingLevel));

        // Clear canvas with gradient background
        this.drawBackground();

        // Create 3D grid points with proper structure
        const gridPoints = this.createGridPoints(iterationData, maxIterations, heightScale);

        // Transform and project points
        const projectedPoints = this.transformAndProject(gridPoints, rotationX, rotationY, rotationZ);

        // Render the 3D surface
        this.renderSurface(projectedPoints, maxIterations, colorScheme);

        // Wireframe disabled for smooth surface appearance
        // this.renderWireframe(projectedPoints);
    }

    public renderFromHeightMap(
        heightMap: number[][],
        colorScheme: ColorScheme,
        rotationX: number,
        rotationY: number,
        rotationZ: number,
        heightScale: number
    ): void {
        // Update dimensions in case canvas was resized
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Clear canvas with gradient background
        this.drawBackground();

        // Create 3D grid points from heightmap
        const gridPoints = this.createGridPointsFromHeightMap(heightMap, heightScale);

        // Transform and project points
        const projectedPoints = this.transformAndProject(gridPoints, rotationX, rotationY, rotationZ);

        // Render the 3D surface with custom coloring based on height
        this.renderSurfaceFromHeightMap(projectedPoints, heightMap, colorScheme);
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

    private createGridPointsFromHeightMap(heightMap: number[][], heightScale: number): Point3D[][] {
        const mapHeight = heightMap.length;
        const mapWidth = heightMap[0]?.length || 0;

        if (mapHeight === 0 || mapWidth === 0) return [];

        const grid: Point3D[][] = [];

        // Scale the heightmap to fit the canvas while maintaining aspect ratio
        const scaleX = this.width / mapWidth;
        const scaleY = this.height / mapHeight;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = mapWidth * scale;
        const scaledHeight = mapHeight * scale;
        const offsetX = (this.width - scaledWidth) / 2;
        const offsetY = (this.height - scaledHeight) / 2;

        for (let gridY = 0; gridY < mapHeight; gridY++) {
            grid[gridY] = [];
            for (let gridX = 0; gridX < mapWidth; gridX++) {
                const x = offsetX + gridX * scale - this.width / 2;
                const y = offsetY + gridY * scale - this.height / 2;
                const z = heightMap[gridY][gridX] * heightScale;

                grid[gridY][gridX] = {
                    x: x,
                    y: y,
                    z: z,
                    iterations: Math.floor(heightMap[gridY][gridX] * 100), // Convert height to pseudo-iterations
                    gridX: gridX,
                    gridY: gridY
                };
            }
        }

        return grid;
    }

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

        // Step 2: Apply median filter to remove spike artifacts
        heightMap = this.applyMedianFilter(heightMap, this.medianFilterRadius);

        // Step 3: Apply Gaussian smoothing N times
        const sigma = this.smoothingRadius / 2;
        heightMap = this.applyGaussianSmoothing(heightMap, this.smoothingRadius, sigma, this.smoothingPasses);

        return heightMap;
    }

    private calculateSmoothHeight(iterations: number, maxIterations: number, heightScale: number): number {
        if (iterations >= maxIterations) {
            return 0;
        }
        const ratio = iterations / maxIterations;
        return heightScale * Math.pow(1 - ratio, 0.5);
    }

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

    private transformAndProject(gridPoints: Point3D[][], rotationX: number, rotationY: number, rotationZ: number): ProjectedPoint[][] {
        const radX = (rotationX * Math.PI) / 180;
        const radY = (rotationY * Math.PI) / 180;
        const radZ = (rotationZ * Math.PI) / 180;
        const projectedGrid: ProjectedPoint[][] = [];

        for (let gridY = 0; gridY < gridPoints.length; gridY++) {
            projectedGrid[gridY] = [];
            for (let gridX = 0; gridX < gridPoints[gridY].length; gridX++) {
                const point = gridPoints[gridY][gridX];
                if (!point) continue;

                // Apply 3D rotations in order: X (pitch), Y (roll), Z (yaw)
                // Rotate around X axis (pitch)
                let y = point.y * Math.cos(radX) - point.z * Math.sin(radX);
                let z = point.y * Math.sin(radX) + point.z * Math.cos(radX);
                let x = point.x;

                // Rotate around Y axis (roll)
                const newX = x * Math.cos(radY) + z * Math.sin(radY);
                z = -x * Math.sin(radY) + z * Math.cos(radY);
                x = newX;

                // Rotate around Z axis (yaw)
                const finalX = x * Math.cos(radZ) - y * Math.sin(radZ);
                y = x * Math.sin(radZ) + y * Math.cos(radZ);
                x = finalX;

                // Improved perspective projection
                const distance = 800; // Camera distance
                const perspective = distance / (distance + z);
                const projX = x * perspective + this.width / 2;
                const projY = y * perspective + this.height / 2;

                projectedGrid[gridY][gridX] = {
                    x: projX,
                    y: projY,
                    z: z,
                    iterations: point.iterations,
                    scale: perspective,
                    gridX: gridX,
                    gridY: gridY
                };
            }
        }

        return projectedGrid;
    }

    private renderSurface(projectedGrid: ProjectedPoint[][], maxIterations: number, colorScheme: ColorScheme): void {
        // Collect all triangles for depth sorting
        const triangles: Array<{
            points: ProjectedPoint[];
            avgZ: number;
            iterations: number;
        }> = [];

        for (let gridY = 0; gridY < projectedGrid.length - 1; gridY++) {
            for (let gridX = 0; gridX < projectedGrid[gridY].length - 1; gridX++) {
                const p1 = projectedGrid[gridY][gridX];
                const p2 = projectedGrid[gridY][gridX + 1];
                const p3 = projectedGrid[gridY + 1][gridX];
                const p4 = projectedGrid[gridY + 1][gridX + 1];

                if (p1 && p2 && p3 && p4) {
                    // Create two triangles for each quad
                    const triangle1 = {
                        points: [p1, p2, p3],
                        avgZ: (p1.z + p2.z + p3.z) / 3,
                        iterations: Math.max(p1.iterations, p2.iterations, p3.iterations)
                    };

                    const triangle2 = {
                        points: [p2, p3, p4],
                        avgZ: (p2.z + p3.z + p4.z) / 3,
                        iterations: Math.max(p2.iterations, p3.iterations, p4.iterations)
                    };

                    triangles.push(triangle1, triangle2);
                }
            }
        }

        // Sort triangles by depth (painter's algorithm)
        triangles.sort((a, b) => b.avgZ - a.avgZ);

        // Render triangles
        triangles.forEach(triangle => {
            this.renderTriangle(triangle.points, triangle.iterations, maxIterations, colorScheme);
        });
    }

    private renderSurfaceFromHeightMap(projectedGrid: ProjectedPoint[][], heightMap: number[][], colorScheme: ColorScheme): void {
        const triangles: { points: ProjectedPoint[], avgZ: number, heightValue: number }[] = [];

        // Create triangles from the grid
        for (let gridY = 0; gridY < projectedGrid.length - 1; gridY++) {
            for (let gridX = 0; gridX < projectedGrid[gridY].length - 1; gridX++) {
                const p1 = projectedGrid[gridY][gridX];
                const p2 = projectedGrid[gridY][gridX + 1];
                const p3 = projectedGrid[gridY + 1][gridX];
                const p4 = projectedGrid[gridY + 1][gridX + 1];

                if (p1 && p2 && p3 && p4) {
                    // Get height values for coloring
                    const h1 = heightMap[gridY]?.[gridX] || 0;
                    const h2 = heightMap[gridY]?.[gridX + 1] || 0;
                    const h3 = heightMap[gridY + 1]?.[gridX] || 0;
                    const h4 = heightMap[gridY + 1]?.[gridX + 1] || 0;

                    // First triangle (p1, p2, p3)
                    const avgZ1 = (p1.z + p2.z + p3.z) / 3;
                    const avgHeight1 = (h1 + h2 + h3) / 3;
                    triangles.push({ points: [p1, p2, p3], avgZ: avgZ1, heightValue: avgHeight1 });

                    // Second triangle (p2, p3, p4)
                    const avgZ2 = (p2.z + p3.z + p4.z) / 3;
                    const avgHeight2 = (h2 + h3 + h4) / 3;
                    triangles.push({ points: [p2, p3, p4], avgZ: avgZ2, heightValue: avgHeight2 });
                }
            }
        }

        // Sort triangles by depth (painter's algorithm)
        triangles.sort((a, b) => b.avgZ - a.avgZ);

        // Render triangles with height-based coloring
        triangles.forEach(triangle => {
            this.renderTriangleFromHeight(triangle.points, triangle.heightValue, colorScheme);
        });
    }

    private renderTriangle(points: ProjectedPoint[], iterations: number, maxIterations: number, colorScheme: ColorScheme): void {
        if (points.length !== 3) return;

        const [p1, p2, p3] = points;

        // Calculate surface normal for lighting
        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
        const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };

        // Cross product for normal
        const normal = {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };

        // Normalize
        const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        if (length > 0) {
            normal.x /= length;
            normal.y /= length;
            normal.z /= length;
        }

        // Enhanced lighting with multiple light sources
        const lightDir1 = { x: -0.5, y: -0.5, z: 1 }; // Main light
        const lightDir2 = { x: 0.3, y: 0.3, z: 0.8 };  // Fill light
        const lightDir3 = { x: 0, y: 1, z: 0.2 };      // Ambient light

        const intensity1 = Math.max(0, normal.x * lightDir1.x + normal.y * lightDir1.y + normal.z * lightDir1.z);
        const intensity2 = Math.max(0, normal.x * lightDir2.x + normal.y * lightDir2.y + normal.z * lightDir2.z);
        const intensity3 = Math.max(0, normal.x * lightDir3.x + normal.y * lightDir3.y + normal.z * lightDir3.z);

        // Combine lighting with different weights
        const lightIntensity = Math.max(0.15,
            intensity1 * 0.6 + intensity2 * 0.25 + intensity3 * 0.15
        );

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
        const specular = this.specularStrength * Math.pow(specDot, this.shininess);

        // Get base color with smooth interpolation between vertex colors
        const avgIterations = (p1.iterations + p2.iterations + p3.iterations) / 3;
        const baseColor = ColorSchemes.getColor(avgIterations, maxIterations, colorScheme);

        // Apply lighting with gamma correction and specular highlight
        const gamma = 2.2;
        const r = Math.floor(255 * Math.min(1.0, Math.pow((baseColor.r / 255) * lightIntensity, 1 / gamma) + specular));
        const g = Math.floor(255 * Math.min(1.0, Math.pow((baseColor.g / 255) * lightIntensity, 1 / gamma) + specular));
        const b = Math.floor(255 * Math.min(1.0, Math.pow((baseColor.b / 255) * lightIntensity, 1 / gamma) + specular));

        // Draw triangle with anti-aliasing hint and adaptive stroke to eliminate gaps
        this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.lineTo(p3.x, p3.y);
        this.ctx.closePath();
        this.ctx.fill();

        // Calculate triangle area to determine appropriate stroke width
        const area = Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y)) / 2;
        const strokeWidth = Math.max(0.5, Math.min(2.0, area / 1000)); // Adaptive stroke width

        // Draw stroke with the same color to eliminate white gaps
        this.ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
        this.ctx.lineWidth = strokeWidth;
        this.ctx.stroke();
    }

    private renderTriangleFromHeight(points: ProjectedPoint[], heightValue: number, colorScheme: ColorScheme): void {
        if (points.length !== 3) return;

        const [p1, p2, p3] = points;

        // Calculate surface normal for lighting
        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
        const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };

        // Cross product for normal
        const normal = {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };

        // Normalize
        const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        if (length > 0) {
            normal.x /= length;
            normal.y /= length;
            normal.z /= length;
        }

        // Enhanced lighting with multiple light sources
        const lightDir1 = { x: -0.5, y: -0.5, z: 1 }; // Main light
        const lightDir2 = { x: 0.3, y: 0.3, z: 0.8 };  // Fill light
        const lightDir3 = { x: 0, y: 1, z: 0.2 };      // Ambient light

        const intensity1 = Math.max(0, normal.x * lightDir1.x + normal.y * lightDir1.y + normal.z * lightDir1.z);
        const intensity2 = Math.max(0, normal.x * lightDir2.x + normal.y * lightDir2.y + normal.z * lightDir2.z);
        const intensity3 = Math.max(0, normal.x * lightDir3.x + normal.y * lightDir3.y + normal.z * lightDir3.z);

        // Combine lighting with different weights
        const lightIntensity = Math.max(0.15,
            intensity1 * 0.6 + intensity2 * 0.25 + intensity3 * 0.15
        );

        // Specular highlight (Phong model, primary light only)
        const lightLen1 = Math.sqrt(
            lightDir1.x * lightDir1.x + lightDir1.y * lightDir1.y + lightDir1.z * lightDir1.z
        );
        const normLight1 = {
            x: lightDir1.x / lightLen1,
            y: lightDir1.y / lightLen1,
            z: lightDir1.z / lightLen1
        };

        const viewDir = { x: 0, y: 0, z: 1 };

        const nDotL = Math.max(0,
            normal.x * normLight1.x + normal.y * normLight1.y + normal.z * normLight1.z
        );
        const reflectDir = {
            x: 2 * nDotL * normal.x - normLight1.x,
            y: 2 * nDotL * normal.y - normLight1.y,
            z: 2 * nDotL * normal.z - normLight1.z
        };

        const specDot = Math.max(0,
            reflectDir.x * viewDir.x + reflectDir.y * viewDir.y + reflectDir.z * viewDir.z
        );
        const specular = this.specularStrength * Math.pow(specDot, this.shininess);

        // Get base color from height value (treat as pseudo-iterations)
        const pseudoIterations = Math.floor(heightValue * 100);
        const baseColor = ColorSchemes.getColor(pseudoIterations, 100, colorScheme);

        // Apply lighting with gamma correction and specular highlight
        const gamma = 2.2;
        const r = Math.floor(255 * Math.min(1.0, Math.pow((baseColor.r / 255) * lightIntensity, 1 / gamma) + specular));
        const g = Math.floor(255 * Math.min(1.0, Math.pow((baseColor.g / 255) * lightIntensity, 1 / gamma) + specular));
        const b = Math.floor(255 * Math.min(1.0, Math.pow((baseColor.b / 255) * lightIntensity, 1 / gamma) + specular));

        // Draw triangle with anti-aliasing hint and adaptive stroke to eliminate gaps
        this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.lineTo(p3.x, p3.y);
        this.ctx.closePath();
        this.ctx.fill();

        // Calculate triangle area to determine appropriate stroke width
        const area = Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y)) / 2;
        const strokeWidth = Math.max(0.5, Math.min(2.0, area / 1000)); // Adaptive stroke width

        // Draw stroke with the same color to eliminate white gaps
        this.ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
        this.ctx.lineWidth = strokeWidth;
        this.ctx.stroke();
    }

    private renderWireframe(projectedGrid: ProjectedPoint[][]): void {
        // Make wireframe much more subtle since we have smooth surfaces
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 0.3;

        // Draw horizontal grid lines
        for (let gridY = 0; gridY < projectedGrid.length; gridY++) {
            this.ctx.beginPath();
            let firstPoint = true;
            for (let gridX = 0; gridX < projectedGrid[gridY].length; gridX++) {
                const point = projectedGrid[gridY][gridX];
                if (point) {
                    if (firstPoint) {
                        this.ctx.moveTo(point.x, point.y);
                        firstPoint = false;
                    } else {
                        this.ctx.lineTo(point.x, point.y);
                    }
                }
            }
            this.ctx.stroke();
        }

        // Draw vertical grid lines
        for (let gridX = 0; gridX < projectedGrid[0]?.length || 0; gridX++) {
            this.ctx.beginPath();
            let firstPoint = true;
            for (let gridY = 0; gridY < projectedGrid.length; gridY++) {
                const point = projectedGrid[gridY][gridX];
                if (point) {
                    if (firstPoint) {
                        this.ctx.moveTo(point.x, point.y);
                        firstPoint = false;
                    } else {
                        this.ctx.lineTo(point.x, point.y);
                    }
                }
            }
            this.ctx.stroke();
        }
    }
}