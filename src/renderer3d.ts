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
    private gridResolution: number = 2; // Higher resolution for better quality

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.width = canvas.width;
        this.height = canvas.height;
    }

    public render(
        iterationData: number[][],
        maxIterations: number,
        colorScheme: ColorScheme,
        rotationX: number,
        rotationZ: number,
        heightScale: number
    ): void {
        // Update dimensions in case canvas was resized
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Clear canvas with gradient background
        this.drawBackground();

        // Create 3D grid points with proper structure
        const gridPoints = this.createGridPoints(iterationData, maxIterations, heightScale);

        // Transform and project points
        const projectedPoints = this.transformAndProject(gridPoints, rotationX, rotationZ);

        // Render the 3D surface
        this.renderSurface(projectedPoints, maxIterations, colorScheme);

        // Add wireframe for better depth perception
        this.renderWireframe(projectedPoints);
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
        const grid: Point3D[][] = [];

        for (let gridY = 0; gridY < gridHeight; gridY++) {
            grid[gridY] = [];
            for (let gridX = 0; gridX < gridWidth; gridX++) {
                const x = gridX * this.gridResolution;
                const y = gridY * this.gridResolution;

                if (iterationData[y] && iterationData[y][x] !== undefined) {
                    const iterations = iterationData[y][x];

                    // Improved height calculation for better 3D effect
                    let z: number;
                    if (iterations === maxIterations) {
                        // Points in the set are at sea level (0)
                        z = 0;
                    } else {
                        // Points outside the set create mountains
                        const normalizedIterations = iterations / maxIterations;
                        // Use smooth exponential curve for natural-looking terrain
                        z = heightScale * Math.pow(1 - normalizedIterations, 0.7);
                    }

                    grid[gridY][gridX] = {
                        x: x - this.width / 2,
                        y: y - this.height / 2,
                        z: z,
                        iterations: iterations,
                        gridX: gridX,
                        gridY: gridY
                    };
                }
            }
        }

        return grid;
    }

    private transformAndProject(gridPoints: Point3D[][], rotationX: number, rotationZ: number): ProjectedPoint[][] {
        const radX = (rotationX * Math.PI) / 180;
        const radZ = (rotationZ * Math.PI) / 180;
        const projectedGrid: ProjectedPoint[][] = [];

        for (let gridY = 0; gridY < gridPoints.length; gridY++) {
            projectedGrid[gridY] = [];
            for (let gridX = 0; gridX < gridPoints[gridY].length; gridX++) {
                const point = gridPoints[gridY][gridX];
                if (!point) continue;

                // Apply 3D rotations
                // Rotate around X axis (pitch)
                let y = point.y * Math.cos(radX) - point.z * Math.sin(radX);
                let z = point.y * Math.sin(radX) + point.z * Math.cos(radX);

                // Rotate around Z axis (yaw)
                const x = point.x * Math.cos(radZ) - y * Math.sin(radZ);
                y = point.x * Math.sin(radZ) + y * Math.cos(radZ);

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

        // Light direction (from top-left-front)
        const lightDir = { x: -0.5, y: -0.5, z: 1 };
        const lightIntensity = Math.max(0.2, Math.abs(
            normal.x * lightDir.x + normal.y * lightDir.y + normal.z * lightDir.z
        ));

        // Get base color
        const baseColor = ColorSchemes.getColor(iterations, maxIterations, colorScheme);

        // Apply lighting
        const r = Math.floor(baseColor.r * lightIntensity);
        const g = Math.floor(baseColor.g * lightIntensity);
        const b = Math.floor(baseColor.b * lightIntensity);

        // Draw triangle
        this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.lineTo(p3.x, p3.y);
        this.ctx.closePath();
        this.ctx.fill();
    }

    private renderWireframe(projectedGrid: ProjectedPoint[][]): void {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.lineWidth = 0.5;

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