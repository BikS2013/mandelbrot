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
    private rotationX = 80;
    private rotationY = 0;
    private rotationZ = 180;
    private heightScale = 50;
    private iterationData: number[][] = [];

    private isDragging = false;
    private dragStart: { x: number, y: number } | null = null;
    private dragEnd: { x: number, y: number } | null = null;

    // Rectangle selection for 3D heightmap
    private isRectangleSelectionMode = false;
    private selectedRectangle: {
        startX: number, startY: number,
        endX: number, endY: number,
        viewport: ViewPort
    } | null = null;

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
        this.setupControlsToggle();
        this.setup3DKeyboardControls();
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
            // Disable rectangle selection when entering 3D mode
            if (this.is3DMode) {
                this.isRectangleSelectionMode = false;
                (document.getElementById('rectangleSelection') as HTMLInputElement).checked = false;
            }
            this.render();
        });

        // Rectangle selection controls
        const rectangleSelectionCheckbox = document.getElementById('rectangleSelection') as HTMLInputElement;
        rectangleSelectionCheckbox.addEventListener('change', (e) => {
            this.isRectangleSelectionMode = (e.target as HTMLInputElement).checked;
            // Disable 3D mode when entering rectangle selection mode
            if (this.isRectangleSelectionMode) {
                this.is3DMode = false;
                render3DCheckbox.checked = false;
                controls3D.style.display = 'none';
            }
            this.selectedRectangle = null; // Clear any existing selection
            this.render();
        });

        const render3DFromRectangleButton = document.getElementById('render3DFromRectangle') as HTMLButtonElement;
        render3DFromRectangleButton.addEventListener('click', () => {
            if (this.selectedRectangle) {
                this.render3DFromSelectedRectangle();
            }
        });

        const rotationXSlider = document.getElementById('rotationX') as HTMLInputElement;
        const rotationXValue = document.getElementById('rotationXValue') as HTMLSpanElement;

        rotationXSlider.addEventListener('input', (e) => {
            this.rotationX = parseInt((e.target as HTMLInputElement).value);
            rotationXValue.textContent = this.rotationX.toString();
            if (this.is3DMode) this.render();
        });

        const rotationYSlider = document.getElementById('rotationY') as HTMLInputElement;
        const rotationYValue = document.getElementById('rotationYValue') as HTMLSpanElement;

        rotationYSlider.addEventListener('input', (e) => {
            this.rotationY = parseInt((e.target as HTMLInputElement).value);
            rotationYValue.textContent = this.rotationY.toString();
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

    private setupControlsToggle(): void {
        const toggleButton = document.getElementById('toggleControls') as HTMLButtonElement;
        const controlsContent = document.getElementById('controlsContent') as HTMLDivElement;

        if (!toggleButton || !controlsContent) {
            console.error('Toggle button or controls content not found');
            return;
        }

        let isHidden = false;

        toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            isHidden = !isHidden;
            console.log('Toggle clicked, isHidden:', isHidden);

            if (isHidden) {
                controlsContent.style.display = 'none';
                toggleButton.textContent = '+';
                toggleButton.title = 'Show Controls';
            } else {
                controlsContent.style.display = 'block';
                toggleButton.textContent = '−';
                toggleButton.title = 'Hide Controls';
            }
        });

        // Also allow keyboard shortcut (H key) to toggle
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // Only trigger if not focused on an input element
                const activeElement = document.activeElement;
                if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'SELECT') {
                    toggleButton.click();
                }
            }
        });
    }

    private setup3DKeyboardControls(): void {
        document.addEventListener('keydown', (e) => {
            console.log('Key pressed:', e.key, 'is3DMode:', this.is3DMode);

            // Only work in 3D mode and when no input/slider is focused
            if (!this.is3DMode) {
                console.log('Not in 3D mode, ignoring');
                return;
            }

            const activeElement = document.activeElement;
            console.log('Active element:', activeElement?.tagName, activeElement?.id);

            if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'SELECT') {
                console.log('Input focused, ignoring arrow keys');
                return;
            }

            let rotationChanged = false;
            const rotationStep = 5; // degrees per key press

            switch (e.key) {
                case 'ArrowUp':
                    console.log('Arrow Up pressed');
                    e.preventDefault();
                    this.rotationX = Math.min(90, this.rotationX + rotationStep);
                    rotationChanged = true;
                    break;
                case 'ArrowDown':
                    console.log('Arrow Down pressed');
                    e.preventDefault();
                    this.rotationX = Math.max(0, this.rotationX - rotationStep);
                    rotationChanged = true;
                    break;
                case 'ArrowLeft':
                    console.log('Arrow Left pressed');
                    e.preventDefault();
                    this.rotationZ = (this.rotationZ - rotationStep + 360) % 360;
                    rotationChanged = true;
                    break;
                case 'ArrowRight':
                    console.log('Arrow Right pressed');
                    e.preventDefault();
                    this.rotationZ = (this.rotationZ + rotationStep) % 360;
                    rotationChanged = true;
                    break;
            }

            if (rotationChanged) {
                console.log('Rotation changed - X:', this.rotationX, 'Z:', this.rotationZ);

                // Update the slider values and displays
                const rotationXSlider = document.getElementById('rotationX') as HTMLInputElement;
                const rotationXValue = document.getElementById('rotationXValue') as HTMLSpanElement;
                const rotationZSlider = document.getElementById('rotationZ') as HTMLInputElement;
                const rotationZValue = document.getElementById('rotationZValue') as HTMLSpanElement;

                if (rotationXSlider) rotationXSlider.value = this.rotationX.toString();
                if (rotationXValue) rotationXValue.textContent = this.rotationX.toString();
                if (rotationZSlider) rotationZSlider.value = this.rotationZ.toString();
                if (rotationZValue) rotationZValue.textContent = this.rotationZ.toString();

                // Re-render the 3D view
                this.render();
            }
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
            const startX = Math.min(this.dragStart.x, this.dragEnd.x);
            const endX = Math.max(this.dragStart.x, this.dragEnd.x);
            const startY = Math.min(this.dragStart.y, this.dragEnd.y);
            const endY = Math.max(this.dragStart.y, this.dragEnd.y);

            if (this.isRectangleSelectionMode) {
                // Store the selected rectangle for 3D rendering
                this.selectedRectangle = {
                    startX,
                    startY,
                    endX,
                    endY,
                    viewport: { ...this.viewport } // Store current viewport
                };

                // Enable the render 3D button
                (document.getElementById('render3DFromRectangle') as HTMLButtonElement).disabled = false;

                // Show selection with different color
                this.drawRectangleSelection();
            } else {
                // Normal zoom behavior
                const scale = 4 / (this.viewport.zoom * Math.min(this.canvas.width, this.canvas.height));

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
            // Different colors for different modes
            this.ctx.strokeStyle = this.isRectangleSelectionMode ? 'cyan' : 'white';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);

            const width = this.dragEnd.x - this.dragStart.x;
            const height = this.dragEnd.y - this.dragStart.y;

            this.ctx.strokeRect(this.dragStart.x, this.dragStart.y, width, height);
            this.ctx.setLineDash([]);

            // Add text label for rectangle selection mode
            if (this.isRectangleSelectionMode) {
                this.ctx.fillStyle = 'cyan';
                this.ctx.font = '14px Arial';
                this.ctx.fillText('3D Selection', this.dragStart.x, this.dragStart.y - 5);
            }
        }
    }

    private drawRectangleSelection(): void {
        this.render();

        if (this.selectedRectangle) {
            this.ctx.strokeStyle = 'lime';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([]);

            const width = this.selectedRectangle.endX - this.selectedRectangle.startX;
            const height = this.selectedRectangle.endY - this.selectedRectangle.startY;

            this.ctx.strokeRect(this.selectedRectangle.startX, this.selectedRectangle.startY, width, height);

            // Add text label
            this.ctx.fillStyle = 'lime';
            this.ctx.font = '16px Arial';
            this.ctx.fillText('Selected for 3D', this.selectedRectangle.startX, this.selectedRectangle.startY - 5);
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
                    this.rotationY,
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

    private render3DFromSelectedRectangle(): void {
        if (!this.selectedRectangle) return;

        const loading = document.getElementById('loading') as HTMLDivElement;
        loading.style.display = 'block';

        setTimeout(() => {
            // Calculate the heightmap from the selected rectangle
            const heightMap = this.createHeightMapFromRectangle();

            // Switch to 3D mode
            this.is3DMode = true;
            (document.getElementById('render3D') as HTMLInputElement).checked = true;
            (document.getElementById('3dControls') as HTMLDivElement).style.display = 'block';

            // Disable rectangle selection mode
            this.isRectangleSelectionMode = false;
            (document.getElementById('rectangleSelection') as HTMLInputElement).checked = false;
            (document.getElementById('render3DFromRectangle') as HTMLButtonElement).disabled = true;

            // Render the 3D heightmap
            this.renderer3D.renderFromHeightMap(
                heightMap,
                this.colorScheme,
                this.rotationX,
                this.rotationY,
                this.rotationZ,
                this.heightScale
            );

            loading.style.display = 'none';
        }, 0);
    }

    private createHeightMapFromRectangle(): number[][] {
        if (!this.selectedRectangle) return [];

        const rect = this.selectedRectangle;
        const width = rect.endX - rect.startX;
        const height = rect.endY - rect.startY;

        // Get the image data from the selected rectangle
        const imageData = this.ctx.getImageData(rect.startX, rect.startY, width, height);
        const data = imageData.data;

        const heightMap: number[][] = [];

        for (let y = 0; y < height; y++) {
            heightMap[y] = [];
            for (let x = 0; x < width; x++) {
                const pixelIndex = (y * width + x) * 4;
                const r = data[pixelIndex];
                const g = data[pixelIndex + 1];
                const b = data[pixelIndex + 2];

                // Convert to grayscale (luminance)
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

                // Invert so black (0) becomes highest (1) and white (255) becomes lowest (0)
                const heightValue = (255 - luminance) / 255;

                heightMap[y][x] = heightValue;
            }
        }

        return heightMap;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MandelbrotExplorer();
});