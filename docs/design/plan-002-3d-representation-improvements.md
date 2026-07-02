# Plan 002: 3D Representation Improvements — Cached-Scene Renderer

**Date:** 2026-07-02
**Status:** Implemented and Verified
**Affected Files:** `src/renderer3d.ts` (rewritten), `src/index.ts`, `index.html`, `test_scripts/verify-smooth-rendering.ts`

---

## 1. Problems Found (Examination)

The 3D representation was examined end-to-end (code review of `src/renderer3d.ts` /
`src/index.ts` plus runtime verification in a real browser). The following defects
and weaknesses were identified:

### P1 — Massive redundant computation (severe performance)
- `calculateIterationData()` sampled the fractal at **full canvas resolution**
  (~2M points at 1920x1080, up to 1000 iterations each), after which the renderer
  immediately downsampled by `gridResolution = 3` — discarding 8/9 of the work.
- The **entire pipeline** (fractal sampling → downsample → median filter →
  Gaussian smoothing → grid build → ~460K triangle build + sort + paint) re-ran on
  **every rotation or height-scale tick**, even though none of those stages depend
  on rotation. Interactive rotation took seconds per frame.

### P2 — Inside-out height mapping (wrong representation)
- `calculateSmoothHeight()` returned `heightScale * pow(1 - iter/max, 0.5)`:
  the set interior mapped to height **0** and the *far exterior* (lowest iteration
  counts) mapped to **maximum** height. The fractal boundary — the interesting
  structure — was flattened into a basin surrounded by high walls at the viewport
  edges.

### P3 — Incorrect lighting
- Face normals were computed from **screen-space projected** coordinates (after
  perspective division), producing faceted, perspective-distorted shading.
- The three diffuse light direction vectors were **not normalized**
  (pending-issues item 1), so their weights were silently scaled by magnitudes
  1.22 / 0.91 / 1.02.
- Gamma handling was incorrect (sRGB values treated as linear, then re-encoded).

### P4 — Rectangle-selection path defects
- `renderFromHeightMap()` skipped the median/Gaussian smoothing pipeline entirely
  (pending-issues item 2).
- Any rotation change after "Render Selected Area in 3D" called `render()`, which
  **silently rebuilt the viewport surface** and discarded the heightmap view.
- The lime selection-rectangle overlay was painted into the canvas before
  `getImageData`, leaking into the luminance heightmap.

### P5 — Interaction and hygiene
- No mouse orbit or zoom in 3D mode (sliders/arrow keys only).
- 2D drag-selection re-computed the full fractal on **every mousemove**.
- Debug `console.log` spam in the keyboard and toggle handlers.

---

## 2. Design of the Solution

### Cached-scene architecture (new `Renderer3D`)

The renderer now separates **scene building** (expensive, fractal-dependent) from
**drawing** (cheap, rotation-dependent):

```
buildSurfaceFromIterations(sampler, maxIter, scheme, heightScale)
    - computes grid dims (1 vertex / ~4 px, capped at 300 per axis)
    - samples the fractal DIRECTLY at grid resolution with 2x2 supersampling
      (~200K samples instead of ~2M)
    - normalized height field: interior plateau = 1.0, exterior = t^2.2
    - median filter (r=1) + separable Gaussian (r=2, 2 passes)
    - per-vertex colors derived from the SMOOTHED height field (inverse of the
      height curve), so color bands follow terrain contours instead of
      reproducing chaotic per-sample iteration noise
    - per-vertex normals via central differences, terrain space (+z up)
    - per-vertex ambient+diffuse lighting baked in LINEAR color space

buildSurfaceFromHeightMap(map, scheme, heightScale)
    - same pipeline (bilinear resample -> median -> Gaussian -> normals -> light)
      for the rectangle-selection path  [fixes P4 smoothing gap]

setColorScheme(scheme)   -> recolor + relight only        (no fractal resample)
setHeightScale(scale)    -> recompute normals + relight   (no fractal resample)
setViewZoom(zoom)        -> projection scale for scroll zoom (0.3x – 4x)

draw(rotX, rotY, rotZ, quality)
    - orbit-correct rotation order: yaw (Z) around the terrain up-axis first,
      then roll (Y), then pitch (X) — heights always rise toward screen-top
    - perspective projection, painter's-algorithm depth sort
    - per-triangle Phong specular from the key light (view direction transformed
      into terrain space by the inverse rotation); diffuse comes pre-baked
    - gamma-correct compositing: light in linear space, encode once at the end
    - quality 'fast' decimates the grid 2x for interactive dragging
```

### Height mapping (fixes P2)

`h = (iter/max)^2.2` for the exterior, `h = 1` for the interior. The set now reads
as the classic **mesa/mountain**: black plateau on top, steep colorful slopes at the
boundary filaments, flat far field. World height = `h * heightScale * 2.5`.

### Lighting (fixes P3)

- Normals: smooth per-vertex central differences of the smoothed height field —
  no more screen-space facet normals (also resolves pending-issues item 4).
- Three **normalized** hillshade lights fixed in terrain space
  (key 0.62 / fill 0.25 / back 0.13), named constants `ambientCoefficient`,
  `specularStrength`, `shininess` (resolves pending-issues items 1 and 5).
- Diffuse is rotation-independent, so it is baked per vertex at build time;
  only specular is evaluated per triangle per frame.

### Application wiring (`src/index.ts`)

- `surfaceDirty` flag: viewport/iteration/resize changes mark the surface dirty;
  `render()` rebuilds only when needed.
- Rotation sliders, arrow keys, mouse orbit, and scroll zoom go through
  `requestDraw(quality)` — a `requestAnimationFrame`-coalesced redraw of the
  cached scene (latest quality wins).
- **Mouse orbit** in 3D mode: drag rotates yaw (0.4°/px) and pitch (0.25°/px,
  clamped 0–90°); fast-quality during drag, high-quality on release.
- **Scroll zoom** in 3D mode: multiplicative view zoom with a 150 ms idle timer
  that triggers a final high-quality redraw.
- `surfaceMode: 'viewport' | 'heightmap'` — rotations/recolors/height changes
  preserve a heightmap surface (fixes P4 rebuild bug).
- 2D renders cache their `ImageData`; selection overlays blit the cache instead
  of recomputing the fractal per mousemove (fixes P5), and the rectangle
  heightmap is extracted from the cache so overlay strokes cannot leak in.
- Default view changed from pitch 80° to 60° (80° was nearly edge-on).
- Console debug logging removed; live readout shows `Pitch • Yaw • 3D zoom`.

---

## 3. Performance Comparison (1920x1080, 100 iterations)

| Operation | Before | After |
|---|---|---|
| Fractal samples per surface build | ~2,070,000 | ~203,000 (300x169 grid, 2x2 supersample) |
| Rotation change | full pipeline re-run (seconds) | cached redraw: **~90 ms** high quality, ~25 ms fast (measured) |
| Height-scale change | full pipeline re-run | normals + relight + redraw |
| Color-scheme change (3D) | full pipeline re-run | recolor + relight + redraw |
| Triangles painted per frame | ~460,000 | ~101,000 high / ~25,000 fast |

---

## 4. Verification

1. `npm run build` — clean TypeScript strict-mode compile.
2. `test_scripts/verify-smooth-rendering.ts` — updated for the new height
   function and extended with a vertex-normal section: **46/46 tests pass**.
3. Browser verification (agent-browser, screenshots in session scratchpad):
   - 3D mode renders the set as a mesa with contour-following color bands.
   - Mouse orbit updates yaw/pitch and syncs sliders; keyboard arrows work and
     are correctly suppressed while an input is focused.
   - Scroll zoom reaches 1.33x after three ticks (readout confirms).
   - Color-scheme switch (Classic → Ice) recolors instantly via the cached path.
   - Height scale 50 → 120 rescales with correct relighting.
   - Rectangle selection → 3D heightmap renders smoothed terrain and **survives
     orbiting** (yaw 180→220, pitch 60→53) without being replaced.
   - No JavaScript console errors in any flow.
