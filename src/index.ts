import { MandelbrotCalculator, ViewPort } from './mandelbrot.js';
import { ColorSchemes, ColorScheme } from './colorSchemes.js';
import { Renderer3D } from './renderer3d.js';

class MandelbrotExplorer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private calculator: MandelbrotCalculator;
    private renderer3D: Renderer3D;
    private viewport: ViewPort;
    private colorScheme: ColorScheme = 'classic';
    private is3DMode = false;
    private rotationX = 30;
    private rotationZ = 45;
    private heightScale = 50;
    private iterationData: number[][] = [];
    
    private isDragging = false;
    private dragStart: { x: number, y: number } | null = null;
    private dragEnd: { x: number, y: number } | null = null;

    constructor() {
        this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        
        this.viewport = {
            centerX: -0.5,
            centerY: 0,
            zoom: 1
        };

        this.calculator = new MandelbrotCalculator(
            this.canvas.width,
            this.canvas.height,
            100
        );
        
        this.renderer3D = new Renderer3D(this.canvas);

        this.setupCanvas();
        this.setupEventListeners();
        this.render();
    }

    private setupCanvas(): void {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.calculator.setDimensions(this.canvas.width, this.canvas.height);

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.calculator.setDimensions(this.canvas.width, this.canvas.height);
            this.render();
        });
    }

    private setupEventListeners(): void {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));

        const iterationsSlider = document.getElementById('iterations') as HTMLInputElement;
        const iterationsValue = document.getElementById('iterationsValue') as HTMLSpanElement;
        
        iterationsSlider.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value;
            iterationsValue.textContent = value;
            this.calculator.setMaxIterations(parseInt(value));
            this.render();
        });

        const colorSchemeSelect = document.getElementById('colorScheme') as HTMLSelectElement;
        colorSchemeSelect.addEventListener('change', (e) => {
            this.colorScheme = (e.target as HTMLSelectElement).value as ColorScheme;
            this.render();
        });

        const resetButton = document.getElementById('resetView') as HTMLButtonElement;
        resetButton.addEventListener('click', () => {
            this.viewport = {
                centerX: -0.5,
                centerY: 0,
                zoom: 1
            };
            this.render();
        });

        const saveButton = document.getElementById('saveImage') as HTMLButtonElement;
        saveButton.addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = 'mandelbrot.png';
            link.href = this.canvas.toDataURL();
            link.click();
        });

        // Quick location buttons
        const location1 = document.getElementById('location1') as HTMLButtonElement;
        location1.addEventListener('click', () => {
            this.viewport = {
                centerX: -0.75,
                centerY: 0.1,
                zoom: 50
            };
            this.render();
        });

        const location2 = document.getElementById('location2') as HTMLButtonElement;
        location2.addEventListener('click', () => {
            this.viewport = {
                centerX: -0.7269,
                centerY: 0.1889,
                zoom: 5000
            };
            this.render();
        });

        const location3 = document.getElementById('location3') as HTMLButtonElement;
        location3.addEventListener('click', () => {
            this.viewport = {
                centerX: -0.8,
                centerY: 0.156,
                zoom: 1000
            };
            this.render();
        });

        // 3D mode controls
        const render3DCheckbox = document.getElementById('render3D') as HTMLInputElement;
        const controls3D = document.getElementById('3dControls') as HTMLDivElement;
        
        render3DCheckbox.addEventListener('change', (e) => {
            this.is3DMode = (e.target as HTMLInputElement).checked;
            controls3D.style.display = this.is3DMode ? 'block' : 'none';
            this.render();
        });

        const rotationXSlider = document.getElementById('rotationX') as HTMLInputElement;
        const rotationXValue = document.getElementById('rotationXValue') as HTMLSpanElement;
        
        rotationXSlider.addEventListener('input', (e) => {
            this.rotationX = parseInt((e.target as HTMLInputElement).value);
            rotationXValue.textContent = this.rotationX.toString();
            if (this.is3DMode) this.render();
        });

        const rotationZSlider = document.getElementById('rotationZ') as HTMLInputElement;
        const rotationZValue = document.getElementById('rotationZValue') as HTMLSpanElement;
        
        rotationZSlider.addEventListener('input', (e) => {
            this.rotationZ = parseInt((e.target as HTMLInputElement).value);
            rotationZValue.textContent = this.rotationZ.toString();
            if (this.is3DMode) this.render();
        });

        const heightScaleSlider = document.getElementById('heightScale') as HTMLInputElement;
        const heightScaleValue = document.getElementById('heightScaleValue') as HTMLSpanElement;
        
        heightScaleSlider.addEventListener('input', (e) => {
            this.heightScale = parseInt((e.target as HTMLInputElement).value);
            heightScaleValue.textContent = this.heightScale.toString();
            if (this.is3DMode) this.render();
        });
    }

    private handleMouseDown(e: MouseEvent): void {
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
    }

    private handleMouseMove(e: MouseEvent): void {
        const coords = document.getElementById('coordinates') as HTMLDivElement;
        const zoomLevel = document.getElementById('zoomLevel') as HTMLDivElement;
        
        // Always show zoom level
        zoomLevel.textContent = `Zoom: ${this.viewport.zoom.toExponential(2)}`;
        
        if (!this.is3DMode) {
            const scale = 4 / (this.viewport.zoom * Math.min(this.canvas.width, this.canvas.height));
            const real = this.viewport.centerX + (e.clientX - this.canvas.width / 2) * scale;
            const imag = this.viewport.centerY + (e.clientY - this.canvas.height / 2) * scale;
            coords.textContent = `Real: ${real.toFixed(6)}, Imag: ${imag.toFixed(6)}`;
        } else {
            coords.textContent = `3D Mode - Use sliders to rotate`;
        }

        if (this.isDragging && this.dragStart && !this.is3DMode) {
            this.dragEnd = { x: e.clientX, y: e.clientY };
            this.drawSelectionBox();
        }
    }

    private handleMouseUp(e: MouseEvent): void {
        if (this.isDragging && this.dragStart && this.dragEnd && !this.is3DMode) {
            const scale = 4 / (this.viewport.zoom * Math.min(this.canvas.width, this.canvas.height));
            
            const startX = Math.min(this.dragStart.x, this.dragEnd.x);
            const endX = Math.max(this.dragStart.x, this.dragEnd.x);
            const startY = Math.min(this.dragStart.y, this.dragEnd.y);
            const endY = Math.max(this.dragStart.y, this.dragEnd.y);
            
            const centerX = (startX + endX) / 2;
            const centerY = (startY + endY) / 2;
            
            this.viewport.centerX += (centerX - this.canvas.width / 2) * scale;
            this.viewport.centerY += (centerY - this.canvas.height / 2) * scale;
            
            const zoomFactor = Math.max(
                (endX - startX) / this.canvas.width,
                (endY - startY) / this.canvas.height
            );
            
            this.viewport.zoom /= zoomFactor;
            
            this.render();
        }
        
        this.isDragging = false;
        this.dragStart = null;
        this.dragEnd = null;
    }

    private handleWheel(e: WheelEvent): void {
        e.preventDefault();
        
        const scale = 4 / (this.viewport.zoom * Math.min(this.canvas.width, this.canvas.height));
        const mouseX = e.clientX - this.canvas.width / 2;
        const mouseY = e.clientY - this.canvas.height / 2;
        
        const realOffset = mouseX * scale;
        const imagOffset = mouseY * scale;
        
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.viewport.zoom *= zoomFactor;
        
        const newScale = 4 / (this.viewport.zoom * Math.min(this.canvas.width, this.canvas.height));
        const newRealOffset = mouseX * newScale;
        const newImagOffset = mouseY * newScale;
        
        this.viewport.centerX += realOffset - newRealOffset;
        this.viewport.centerY += imagOffset - newImagOffset;
        
        this.render();
    }

    private drawSelectionBox(): void {
        this.render();
        
        if (this.dragStart && this.dragEnd) {
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([5, 5]);
            
            const width = this.dragEnd.x - this.dragStart.x;
            const height = this.dragEnd.y - this.dragStart.y;
            
            this.ctx.strokeRect(this.dragStart.x, this.dragStart.y, width, height);
            this.ctx.setLineDash([]);
        }
    }

    private render(): void {
        const loading = document.getElementById('loading') as HTMLDivElement;
        loading.style.display = 'block';

        setTimeout(() => {
            if (this.is3DMode) {
                this.calculateIterationData();
                this.renderer3D.render(
                    this.iterationData,
                    parseInt((document.getElementById('iterations') as HTMLInputElement).value),
                    this.colorScheme,
                    this.rotationX,
                    this.rotationZ,
                    this.heightScale
                );
            } else {
                const imageData = this.calculateWithColorScheme();
                const img = new ImageData(imageData, this.canvas.width, this.canvas.height);
                this.ctx.putImageData(img, 0, 0);
            }
            loading.style.display = 'none';
        }, 0);
    }

    private calculateWithColorScheme(): Uint8ClampedArray {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const imageData = new Uint8ClampedArray(width * height * 4);
        const scale = 4 / (this.viewport.zoom * Math.min(width, height));
        const maxIterations = parseInt((document.getElementById('iterations') as HTMLInputElement).value);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const real = this.viewport.centerX + (x - width / 2) * scale;
                const imag = this.viewport.centerY + (y - height / 2) * scale;
                
                const iterations = this.mandelbrotIteration({ real, imag }, maxIterations);
                const pixel = (y * width + x) * 4;
                
                const color = ColorSchemes.getColor(iterations, maxIterations, this.colorScheme);
                imageData[pixel] = color.r;
                imageData[pixel + 1] = color.g;
                imageData[pixel + 2] = color.b;
                imageData[pixel + 3] = 255;
            }
        }

        return imageData;
    }

    private calculateIterationData(): void {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const scale = 4 / (this.viewport.zoom * Math.min(width, height));
        const maxIterations = parseInt((document.getElementById('iterations') as HTMLInputElement).value);

        this.iterationData = [];
        
        for (let y = 0; y < height; y++) {
            this.iterationData[y] = [];
            for (let x = 0; x < width; x++) {
                const real = this.viewport.centerX + (x - width / 2) * scale;
                const imag = this.viewport.centerY + (y - height / 2) * scale;
                
                this.iterationData[y][x] = this.mandelbrotIteration({ real, imag }, maxIterations);
            }
        }
    }

    private mandelbrotIteration(c: { real: number, imag: number }, maxIterations: number): number {
        let z = { real: 0, imag: 0 };
        let n = 0;

        while (n < maxIterations) {
            const realTemp = z.real * z.real - z.imag * z.imag + c.real;
            z.imag = 2 * z.real * z.imag + c.imag;
            z.real = realTemp;

            if (z.real * z.real + z.imag * z.imag > 4) {
                return n;
            }
            n++;
        }

        return maxIterations;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MandelbrotExplorer();
});