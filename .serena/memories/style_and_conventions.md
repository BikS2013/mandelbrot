# Code Style & Conventions

## TypeScript
- Strict mode enabled
- ES2020 target and module system
- Interfaces used for data types (Complex, ViewPort, Point3D, ProjectedPoint, RGB)
- Classes for main components (no functional patterns)
- No external runtime dependencies - pure TypeScript/DOM APIs
- Only devDependencies: typescript, @types/node

## Naming
- PascalCase for classes and interfaces
- camelCase for methods and properties
- DOM element IDs in camelCase

## Architecture
- Single-page app, no framework
- Module-based (ES2020 modules)
- Canvas-based rendering (2D context)
- No bundler - TypeScript compiler outputs directly to dist/
- index.html loads dist/index.js as ES module

## Task Completion
- Run `npm run build` to verify TypeScript compiles
- Open browser at http://localhost:8000 to verify visually
