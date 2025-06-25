export interface Complex {
    real: number;
    imag: number;
}

export interface ViewPort {
    centerX: number;
    centerY: number;
    zoom: number;
}

export class MandelbrotCalculator {
    private width: number;
    private height: number;
    private maxIterations: number;

    constructor(width: number, height: number, maxIterations: number = 100) {
        this.width = width;
        this.height = height;
        this.maxIterations = maxIterations;
    }

    public setDimensions(width: number, height: number): void {
        this.width = width;
        this.height = height;
    }

    public setMaxIterations(iterations: number): void {
        this.maxIterations = iterations;
    }

    private mandelbrotIteration(c: Complex): number {
        let z: Complex = { real: 0, imag: 0 };
        let n = 0;

        while (n < this.maxIterations) {
            const realTemp = z.real * z.real - z.imag * z.imag + c.real;
            z.imag = 2 * z.real * z.imag + c.imag;
            z.real = realTemp;

            if (z.real * z.real + z.imag * z.imag > 4) {
                return n;
            }
            n++;
        }

        return this.maxIterations;
    }

    public calculate(viewport: ViewPort): Uint8ClampedArray {
        const imageData = new Uint8ClampedArray(this.width * this.height * 4);
        const scale = 4 / (viewport.zoom * Math.min(this.width, this.height));

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const real = viewport.centerX + (x - this.width / 2) * scale;
                const imag = viewport.centerY + (y - this.height / 2) * scale;
                
                const iterations = this.mandelbrotIteration({ real, imag });
                const pixel = (y * this.width + x) * 4;
                
                const color = this.getColor(iterations);
                imageData[pixel] = color.r;
                imageData[pixel + 1] = color.g;
                imageData[pixel + 2] = color.b;
                imageData[pixel + 3] = 255;
            }
        }

        return imageData;
    }

    private getColor(iterations: number): { r: number, g: number, b: number } {
        if (iterations === this.maxIterations) {
            return { r: 0, g: 0, b: 0 };
        }

        const hue = (iterations / this.maxIterations) * 360;
        return this.hslToRgb(hue, 100, 50);
    }

    private hslToRgb(h: number, s: number, l: number): { r: number, g: number, b: number } {
        h /= 360;
        s /= 100;
        l /= 100;

        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
}