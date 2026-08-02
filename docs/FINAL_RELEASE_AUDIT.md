# Final release audit — ALBAZ MoonCalc Pro v0.10.8

## Scope

This release corrects only the Allawi scientific/image path and Windows packaging robustness. Yallop, Odeh, and SAAO scientific modules remain byte-identical to the previous base.

## Allawi completion

- Source-locked computation and classification are active.
- The standalone Allawi basemap, projection, plot limits, palette, cell opacity, grid gap, and site marker are integrated.
- Allawi selection enforces the validated 10,800-cell grid.
- The black X boundary is a natural antialiased frontier generated from the discrete X mask.
- Direct image export preserves the 2048×950 geometry.

## Packaging

No commercial font binary is bundled. The builder publishes to unique timestamped folders and avoids copying over a running executable tree.

## Validation boundary

Static compilation, pure scientific tests, JSON parsing, JavaScript syntax, file hashes, and ZIP integrity are validated in the delivery environment. Native Windows GUI launch and PyEphem/PySide6 integration tests are executed by the included Windows builder because those native dependencies are unavailable in the delivery container.
