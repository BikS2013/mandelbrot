export type ColorScheme = 'classic' | 'fire' | 'ocean' | 'rainbow' | 'grayscale';

export interface RGB {
    r: number;
    g: number;
    b: number;
}

export class ColorSchemes {
    public static getColor(iterations: number, maxIterations: number, scheme: ColorScheme): RGB {
        if (iterations === maxIterations) {
            return { r: 0, g: 0, b: 0 };
        }

        const ratio = iterations / maxIterations;

        switch (scheme) {
            case 'classic':
                return this.classicScheme(ratio);
            case 'fire':
                return this.fireScheme(ratio);
            case 'ocean':
                return this.oceanScheme(ratio);
            case 'rainbow':
                return this.rainbowScheme(ratio);
            case 'grayscale':
                return this.grayscaleScheme(ratio);
            default:
                return this.classicScheme(ratio);
        }
    }

    private static classicScheme(ratio: number): RGB {
        const hue = ratio * 360;
        return this.hslToRgb(hue, 100, 50);
    }

    private static fireScheme(ratio: number): RGB {
        if (ratio < 0.5) {
            return {
                r: Math.floor(ratio * 2 * 255),
                g: 0,
                b: 0
            };
        } else {
            return {
                r: 255,
                g: Math.floor((ratio - 0.5) * 2 * 255),
                b: 0
            };
        }
    }

    private static oceanScheme(ratio: number): RGB {
        return {
            r: Math.floor(ratio * 50),
            g: Math.floor(ratio * 100 + 50),
            b: Math.floor(ratio * 200 + 55)
        };
    }

    private static rainbowScheme(ratio: number): RGB {
        const segment = Math.floor(ratio * 6);
        const t = (ratio * 6) % 1;

        switch (segment) {
            case 0:
                return { r: 255, g: Math.floor(t * 255), b: 0 };
            case 1:
                return { r: Math.floor((1 - t) * 255), g: 255, b: 0 };
            case 2:
                return { r: 0, g: 255, b: Math.floor(t * 255) };
            case 3:
                return { r: 0, g: Math.floor((1 - t) * 255), b: 255 };
            case 4:
                return { r: Math.floor(t * 255), g: 0, b: 255 };
            case 5:
                return { r: 255, g: 0, b: Math.floor((1 - t) * 255) };
            default:
                return { r: 255, g: 0, b: 0 };
        }
    }

    private static grayscaleScheme(ratio: number): RGB {
        const value = Math.floor(ratio * 255);
        return { r: value, g: value, b: value };
    }

    private static hslToRgb(h: number, s: number, l: number): RGB {
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