export type ColorScheme = 'classic' | 'fire' | 'ocean' | 'rainbow' | 'grayscale' | 'sunset' | 'neon' | 'forest' | 'cosmic' | 'copper' | 'ice' | 'volcanic';

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
            case 'sunset':
                return this.sunsetScheme(ratio);
            case 'neon':
                return this.neonScheme(ratio);
            case 'forest':
                return this.forestScheme(ratio);
            case 'cosmic':
                return this.cosmicScheme(ratio);
            case 'copper':
                return this.copperScheme(ratio);
            case 'ice':
                return this.iceScheme(ratio);
            case 'volcanic':
                return this.volcanicScheme(ratio);
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

    private static sunsetScheme(ratio: number): RGB {
        // Beautiful sunset colors: deep purple to orange to yellow
        if (ratio < 0.3) {
            // Deep purple to magenta
            const t = ratio / 0.3;
            return {
                r: Math.floor(75 + t * 180),
                g: Math.floor(0 + t * 50),
                b: Math.floor(130 + t * 125)
            };
        } else if (ratio < 0.7) {
            // Magenta to orange
            const t = (ratio - 0.3) / 0.4;
            return {
                r: Math.floor(255),
                g: Math.floor(50 + t * 115),
                b: Math.floor(255 - t * 255)
            };
        } else {
            // Orange to bright yellow
            const t = (ratio - 0.7) / 0.3;
            return {
                r: Math.floor(255),
                g: Math.floor(165 + t * 90),
                b: Math.floor(0 + t * 50)
            };
        }
    }

    private static neonScheme(ratio: number): RGB {
        // Bright neon colors with high saturation
        const phase = ratio * Math.PI * 4;
        return {
            r: Math.floor(128 + 127 * Math.sin(phase)),
            g: Math.floor(128 + 127 * Math.sin(phase + Math.PI * 2/3)),
            b: Math.floor(128 + 127 * Math.sin(phase + Math.PI * 4/3))
        };
    }

    private static forestScheme(ratio: number): RGB {
        // Natural forest colors: dark green to bright green to yellow-green
        if (ratio < 0.4) {
            // Dark green to medium green
            const t = ratio / 0.4;
            return {
                r: Math.floor(0 + t * 34),
                g: Math.floor(50 + t * 89),
                b: Math.floor(0 + t * 34)
            };
        } else if (ratio < 0.8) {
            // Medium green to bright green
            const t = (ratio - 0.4) / 0.4;
            return {
                r: Math.floor(34 + t * 50),
                g: Math.floor(139 + t * 76),
                b: Math.floor(34 + t * 50)
            };
        } else {
            // Bright green to yellow-green
            const t = (ratio - 0.8) / 0.2;
            return {
                r: Math.floor(84 + t * 171),
                g: Math.floor(215 + t * 40),
                b: Math.floor(84 - t * 84)
            };
        }
    }

    private static cosmicScheme(ratio: number): RGB {
        // Deep space colors: black to purple to blue to white
        if (ratio < 0.25) {
            // Black to deep purple
            const t = ratio / 0.25;
            return {
                r: Math.floor(t * 75),
                g: Math.floor(t * 0),
                b: Math.floor(t * 130)
            };
        } else if (ratio < 0.5) {
            // Deep purple to bright purple
            const t = (ratio - 0.25) / 0.25;
            return {
                r: Math.floor(75 + t * 103),
                g: Math.floor(0 + t * 58),
                b: Math.floor(130 + t * 108)
            };
        } else if (ratio < 0.75) {
            // Purple to blue
            const t = (ratio - 0.5) / 0.25;
            return {
                r: Math.floor(178 - t * 178),
                g: Math.floor(58 + t * 197),
                b: Math.floor(238 + t * 17)
            };
        } else {
            // Blue to white
            const t = (ratio - 0.75) / 0.25;
            return {
                r: Math.floor(0 + t * 255),
                g: Math.floor(255),
                b: Math.floor(255)
            };
        }
    }

    private static copperScheme(ratio: number): RGB {
        // Metallic copper tones
        const base = Math.pow(ratio, 0.7); // Slightly curved for more natural look
        return {
            r: Math.floor(base * 255),
            g: Math.floor(base * 140),
            b: Math.floor(base * 90)
        };
    }

    private static iceScheme(ratio: number): RGB {
        // Cool ice colors: dark blue to cyan to white
        if (ratio < 0.3) {
            // Dark blue to medium blue
            const t = ratio / 0.3;
            return {
                r: Math.floor(0 + t * 70),
                g: Math.floor(50 + t * 130),
                b: Math.floor(100 + t * 155)
            };
        } else if (ratio < 0.7) {
            // Medium blue to cyan
            const t = (ratio - 0.3) / 0.4;
            return {
                r: Math.floor(70 + t * 115),
                g: Math.floor(180 + t * 75),
                b: Math.floor(255)
            };
        } else {
            // Cyan to white
            const t = (ratio - 0.7) / 0.3;
            return {
                r: Math.floor(185 + t * 70),
                g: Math.floor(255),
                b: Math.floor(255)
            };
        }
    }

    private static volcanicScheme(ratio: number): RGB {
        // Volcanic colors: black to red to orange to yellow to white
        if (ratio < 0.2) {
            // Black to dark red
            const t = ratio / 0.2;
            return {
                r: Math.floor(t * 139),
                g: Math.floor(t * 0),
                b: Math.floor(t * 0)
            };
        } else if (ratio < 0.4) {
            // Dark red to bright red
            const t = (ratio - 0.2) / 0.2;
            return {
                r: Math.floor(139 + t * 116),
                g: Math.floor(0 + t * 0),
                b: Math.floor(0 + t * 0)
            };
        } else if (ratio < 0.6) {
            // Red to orange
            const t = (ratio - 0.4) / 0.2;
            return {
                r: Math.floor(255),
                g: Math.floor(0 + t * 140),
                b: Math.floor(0)
            };
        } else if (ratio < 0.8) {
            // Orange to yellow
            const t = (ratio - 0.6) / 0.2;
            return {
                r: Math.floor(255),
                g: Math.floor(140 + t * 115),
                b: Math.floor(0 + t * 0)
            };
        } else {
            // Yellow to white
            const t = (ratio - 0.8) / 0.2;
            return {
                r: Math.floor(255),
                g: Math.floor(255),
                b: Math.floor(0 + t * 255)
            };
        }
    }
}