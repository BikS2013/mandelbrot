import { ColorSchemes, ColorScheme } from './colorSchemes.js';

export interface Point3D {
    x: number;
    y: number;
    z: number;
    iterations: number;
}

export class Renderer3D {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number;
    private height: number;
    
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
        
        const points: Point3D[] = [];
        const gridSize = 3; // Sample every 3rd pixel for better detail
        
        // Create 3D points
        for (let y = 0; y < this.height; y += gridSize) {
            for (let x = 0; x < this.width; x += gridSize) {
                if (iterationData[y] && iterationData[y][x] !== undefined) {
                    const iterations = iterationData[y][x];
                    // Create dramatic height differences
                    let z;
                    if (iterations === maxIterations) {
                        // Points in the set are tall peaks
                        z = heightScale * 1.2;
                    } else {
                        // Use exponential decay for dramatic valleys
                        const normalizedHeight = Math.pow(1 - (iterations / maxIterations), 2);
                        z = normalizedHeight * heightScale;
                    }
                    
                    points.push({
                        x: x - this.width / 2,
                        y: y - this.height / 2,
                        z: z,
                        iterations: iterations
                    });
                }
            }
        }

        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Convert degrees to radians
        const radX = (rotationX * Math.PI) / 180;
        const radZ = (rotationZ * Math.PI) / 180;

        // Project and render points
        const projectedPoints = points.map(point => {
            // Rotate around X axis
            let y = point.y * Math.cos(radX) - point.z * Math.sin(radX);
            let z = point.y * Math.sin(radX) + point.z * Math.cos(radX);
            
            // Rotate around Z axis
            const x = point.x * Math.cos(radZ) - y * Math.sin(radZ);
            y = point.x * Math.sin(radZ) + y * Math.cos(radZ);

            // Enhanced perspective projection
            const perspective = 1000 / (1000 + z * 2);
            const projX = x * perspective + this.width / 2;
            const projY = y * perspective + this.height / 2 - z * 0.5; // Add vertical offset based on height

            return {
                x: projX,
                y: projY,
                z: z,
                iterations: point.iterations,
                scale: perspective
            };
        });

        // Sort by depth (painter's algorithm)
        projectedPoints.sort((a, b) => b.z - a.z);

        // Render points
        projectedPoints.forEach(point => {
            const color = ColorSchemes.getColor(point.iterations, maxIterations, colorScheme);
            
            // Enhanced lighting effect based on height
            const normalizedIterations = point.iterations / maxIterations;
            const heightFactor = point.iterations === maxIterations ? 1.8 : 0.2 + normalizedIterations * normalizedIterations * 1.5;
            
            // Apply depth-based shading
            const depthShading = 1 - (point.z / 400);
            const fogFactor = Math.max(0.4, Math.min(1, depthShading));
            
            const r = Math.floor(color.r * heightFactor * fogFactor);
            const g = Math.floor(color.g * heightFactor * fogFactor);
            const b = Math.floor(color.b * heightFactor * fogFactor);
            
            this.ctx.fillStyle = `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
            
            // Draw larger squares for closer points
            const size = Math.max(3, gridSize * point.scale * 1.5);
            this.ctx.fillRect(point.x - size/2, point.y - size/2, size, size);
        });

        // Draw grid lines for better 3D perception
        this.drawGrid(projectedPoints, gridSize, maxIterations, colorScheme);
    }

    private drawGrid(
        points: any[],
        gridSize: number,
        maxIterations: number,
        colorScheme: ColorScheme
    ): void {
        const cols = Math.floor(this.width / gridSize);
        const rows = Math.floor(this.height / gridSize);

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1.5;

        // Draw horizontal lines
        for (let row = 0; row < rows; row++) {
            this.ctx.beginPath();
            for (let col = 0; col < cols; col++) {
                const idx = row * cols + col;
                if (points[idx]) {
                    if (col === 0) {
                        this.ctx.moveTo(points[idx].x, points[idx].y);
                    } else {
                        this.ctx.lineTo(points[idx].x, points[idx].y);
                    }
                }
            }
            this.ctx.stroke();
        }

        // Draw vertical lines
        for (let col = 0; col < cols; col++) {
            this.ctx.beginPath();
            for (let row = 0; row < rows; row++) {
                const idx = row * cols + col;
                if (points[idx]) {
                    if (row === 0) {
                        this.ctx.moveTo(points[idx].x, points[idx].y);
                    } else {
                        this.ctx.lineTo(points[idx].x, points[idx].y);
                    }
                }
            }
            this.ctx.stroke();
        }
    }
}