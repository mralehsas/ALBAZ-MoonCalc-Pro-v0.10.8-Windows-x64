# ALBAZ MoonCalc Pro v0.10.8

A standalone desktop lunar-crescent visibility application with four isolated criteria: Yallop, Odeh, SAAO, and Allawi.

## Source-locked Allawi image parity

Selecting **Allawi** activates a dedicated source-locked image pipeline rather than the generic dark MoonCalc map style. It preserves the audited Allawi presentation:

- the same pale-blue ocean, cream land, borders, and graticule;
- equirectangular projection over ±180° longitude and ±80° latitude;
- scientific coloring clipped to ±60° latitude;
- original 2048 × 950 source geometry and plot bounds 88/1960/59/891;
- official A/B/C/D/X palette and transparent unknown state;
- 82% cell opacity and the source relative cell gap;
- source-style red site marker and label;
- a narrow antialiased X frontier derived from the same discrete impossibility mask, without changing classifications;
- direct source-composite PNG/PDF export without a scene-render round trip.

## Locked Allawi computation

Observation time is sunset plus four ninths of lunar lag. Topocentric centre ARCV and ARCL are evaluated at that instant, with crescent width `w = rho(1-cos ARCL)` and `qA = w + ARCV/6 - 1.25`.

Classes are A ≥ 1, B ≥ 0, C ≥ −0.25, otherwise D; ARCL below 4.5° is D. X denotes central conjunction after sunset or non-positive lag, and ? denotes an unavailable solution.

Selecting Allawi automatically chooses the 10,800-cell validated grid to preserve reference-image fidelity.

## Windows build

Close any running copy, then run:

```text
BUILD_FULL_WINDOWS_ONE_CLICK.cmd
```

The builder uses unique timestamped work/output folders and avoids locked PySide6 runtime files such as `icudtl.dat`.
