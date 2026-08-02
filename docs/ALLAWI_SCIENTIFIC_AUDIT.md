# Allawi scientific and image-parity audit — v0.10.8

## Locked reference

The implementation was audited against `Allawi_Hilal_Map_v9_6_3_AUDITED_SOURCE_LOCKED.html` without bundling its embedded commercial font.

- Reference SHA-256: `7a142e2d2f6657b13a862985129d0ea4ab45bbdfd675bac24c26524614fee0b3`
- Extracted basemap SHA-256: `e6c26ad08072b8ed173959157278dd2954781d6d3854b5feb4f747d3bb4bd17d`
- Basemap dimensions: `2048 × 950`

## Calculation contract

1. Solve local sunset and local moonset for each geographic node.
2. Compute lunar lag.
3. Assign X when the central conjunction is after local sunset or lag is non-positive.
4. Evaluate at sunset + `4/9 × lag`.
5. Compute airless topocentric centre ARCV and centre-to-centre ARCL.
6. Compute `w = rho × (1 − cos ARCL)` in arcminutes.
7. Compute `qA = w + ARCV/6 − 1.25`.
8. Apply the 4.5° elongation floor and qA limits 1, 0, and −0.25.

No −4° solar-altitude solver, bright-limb geometry, 5.5°/7° guard, or manual geographic shift is used.

## Image contract

- Equirectangular projection and exact source plot rectangle.
- Color cells clipped to ±60° latitude.
- Exact official colors and 82% opacity.
- Source-style cell gap and marker.
- The X outline is visual antialiasing derived from the same binary X mask; it does not modify the mask.
- Screen display, PNG export, and report image use the same source composite.
