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
    private gridResolution: number = 1; // Higher resolution for smoother surfaces
    private smoothingRadius: number = 2; // Radius for Gaussian smoothing

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
        smoothingLevel: number = 2
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
        // Create a subtle gradient background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#0a0a0a');
        gradient.addColorStop(1, '#1a1a2e');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    private createGridPoints(iterationData: number[][], maxIterations: number, heightScale: number): Point3D[][] {
        const gridWidth = Math.floor(this.width / this.gridResolution);
        const gridHeight = Math.floor(this.height / this.gridResolution);

        // First, create a smooth height map using interpolation and smoothing
        const smoothHeightMap = this.createSmoothHeightMap(iterationData, maxIterations, heightScale);

        const grid: Point3D[][] = [];

        for (let gridY = 0; gridY < gridHeight; gridY++) {
            grid[gridY] = [];
            for (let gridX = 0; gridX < gridWidth; gridX++) {
                const x = gridX * this.gridResolution;
                const y = gridY * this.gridResolution;

                if (y < smoothHeightMap.length && x < smoothHeightMap[0].length) {
                    const smoothedHeight = smoothHeightMap[y][x];
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
        const heightMap: number[][] = [];

        // First pass: create initial height map with smooth height function
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

        // Second pass: apply Gaussian smoothing
        return this.applyGaussianSmoothing(heightMap);
    }

    private calculateSmoothHeight(iterations: number, maxIterations: number, heightScale: number): number {
        if (iterations === maxIterations) {
            return 0; // Points in the set are at sea level
        }

        const normalizedIterations = iterations / maxIterations;

        // Use smoother functions that reduce dramatic height differences
        // Apply a smoothing factor that increases with max iterations to prevent gaps
        const smoothingFactor = Math.min(1.0, maxIterations / 100); // More smoothing for higher iterations

        const exponential = Math.pow(1 - normalizedIterations, 0.3 + smoothingFactor * 0.2);
        const logarithmic = Math.log(1 + (1 - normalizedIterations) * 4) / Math.log(5); // Reduced steepness
        const sinusoidal = Math.sin((1 - normalizedIterations) * Math.PI / 2);

        // Blend the functions with more emphasis on smoother curves
        const blended = (exponential * 0.5 + logarithmic * 0.3 + sinusoidal * 0.2);

        // Apply additional smoothing for high iteration counts
        const finalHeight = heightScale * blended;
        return finalHeight * (1 - smoothingFactor * 0.3); // Reduce overall height variation
    }

    private applyGaussianSmoothing(heightMap: number[][]): number[][] {
        const height = heightMap.length;
        const width = heightMap[0]?.length || 0;
        const smoothed: number[][] = [];
        const radius = this.smoothingRadius;

        // Create Gaussian kernel
        const kernel: number[][] = [];
        const sigma = radius / 3;
        let kernelSum = 0;

        for (let ky = -radius; ky <= radius; ky++) {
            kernel[ky + radius] = [];
            for (let kx = -radius; kx <= radius; kx++) {
                const distance = Math.sqrt(kx * kx + ky * ky);
                const value = Math.exp(-(distance * distance) / (2 * sigma * sigma));
                kernel[ky + radius][kx + radius] = value;
                kernelSum += value;
            }
        }

        // Normalize kernel
        for (let ky = 0; ky < kernel.length; ky++) {
            for (let kx = 0; kx < kernel[ky].length; kx++) {
                kernel[ky][kx] /= kernelSum;
            }
        }

        // Apply smoothing
        for (let y = 0; y < height; y++) {
            smoothed[y] = [];
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let weightSum = 0;

                for (let ky = -radius; ky <= radius; ky++) {
                    for (let kx = -radius; kx <= radius; kx++) {
                        const ny = y + ky;
                        const nx = x + kx;

                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            const weight = kernel[ky + radius][kx + radius];
                            sum += heightMap[ny][nx] * weight;
                            weightSum += weight;
                        }
                    }
                }

                smoothed[y][x] = weightSum > 0 ? sum / weightSum : heightMap[y][x];
            }
        }

        return smoothed;
    }

    private getInterpolatedIterations(iterationData: number[][], x: number, y: number): number {
        const height = iterationData.length;
        const width = iterationData[0]?.length || 0;

        // Clamp coordinates
        const clampedY = Math.max(0, Math.min(height - 1, Math.floor(y)));
        const clampedX = Math.max(0, Math.min(width - 1, Math.floor(x)));

        if (iterationData[clampedY] && iterationData[clampedY][clampedX] !== undefined) {
            return iterationData[clampedY][clampedX];
        }

        return 0;
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

        // Get base color with smooth interpolation between vertex colors
        const avgIterations = (p1.iterations + p2.iterations + p3.iterations) / 3;
        const baseColor = ColorSchemes.getColor(avgIterations, maxIterations, colorScheme);

        // Apply lighting with gamma correction for more realistic shading
        const gamma = 2.2;
        const r = Math.floor(255 * Math.pow((baseColor.r / 255) * lightIntensity, 1 / gamma));
        const g = Math.floor(255 * Math.pow((baseColor.g / 255) * lightIntensity, 1 / gamma));
        const b = Math.floor(255 * Math.pow((baseColor.b / 255) * lightIntensity, 1 / gamma));

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

        // Edge smoothing disabled for clean surface appearance
        // if (lightIntensity > 0.3) {
        //     this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
        //     this.ctx.lineWidth = 0.5;
        //     this.ctx.stroke();
        // }
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

        // Get base color from height value (treat as pseudo-iterations)
        const pseudoIterations = Math.floor(heightValue * 100);
        const baseColor = ColorSchemes.getColor(pseudoIterations, 100, colorScheme);

        // Apply lighting with gamma correction for more realistic shading
        const gamma = 2.2;
        const r = Math.floor(255 * Math.pow((baseColor.r / 255) * lightIntensity, 1 / gamma));
        const g = Math.floor(255 * Math.pow((baseColor.g / 255) * lightIntensity, 1 / gamma));
        const b = Math.floor(255 * Math.pow((baseColor.b / 255) * lightIntensity, 1 / gamma));

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