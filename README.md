# Nexmin Slurry Pump Calc

A self-contained, buildless web app that reproduces the engineering logic of the
company **Slurry Pump Calculation** workbook (`Calc_Template`) and lets you:

- size slurry pumps across a whole project (multiple pumps, live results);
- understand *the guts* — every calculated row has an **ⓘ call-out** with the
  exact formula and a literature reference;
- browse the underlying **reference tables** (pipe bores, roughness, K-factors,
  water properties, vapour pressure) and **settling-velocity methods**;
- **export to Excel** — a macro-free `.xlsx` where each pump is laid out
  *row-for-row* like the original `Calc_Template`, with **live native formulas**,
  **data-validation dropdowns** and **conditional formatting** preserved.

## Run it

**Easiest — the single file.** Open **`Slurry-Pump-Calc.html`** directly
(double-click it, or drag it into Chrome/Edge). It is fully self-contained —
all code, data and the Excel library are inlined, nothing else is needed. You
can copy or email just this one file.

Other options (using the modular source):

- **Local server:** `python3 -m http.server` then open
  <http://localhost:8000>. (Opening `index.html` via `file://` also works.)
- **GitHub Pages:** enable Pages on this repo (branch → root). `.nojekyll` is
  included so the asset folders are served as-is.

### Saving & sharing a calc

- **Save .json** downloads the whole project (all pumps + inputs) as a `.json`
  file you can store or send to a colleague.
- **Open .json** loads one back in.
- Inputs also autosave to your browser between sessions; **Reset** clears them.

### Rebuilding the single file

The single file is generated from the modular source. After editing any source
file, run:

```bash
python3 build.py      # regenerates Slurry-Pump-Calc.html
```

## How it maps to the original workbook

| Workbook sheet      | In this app |
|---------------------|-------------|
| `Calc_Template`     | The **Calculator** tab (consolidated) and the per-pump sheets in the Excel export |
| `Summary` / `tblPumps` | The **Summary** tab (redesigned) + project header |
| `Material Info`     | **Reference tables** (pipe bore, roughness, K-factors) + recreated on export |
| `Reference`         | Water properties, vapour pressure, barometric — **Reference tables** tab + recreated on export |
| `Settling Velocity` | **Settling velocity** tab (Durand / Wilson / Thomas / Wasp / Sinclair) |
| `Instructions`      | **How it works** tab |

### Custom Excel functions, re-expressed

The original used VBA UDFs. These are re-implemented in plain JavaScript
(`engine.js`) and, for the export, expanded into **native Excel formulas** so the
output workbook needs no macros:

- `chen()` — Chen (1979) explicit Colebrook friction factor
- `thomas()` — Thomas (1965) suspension viscosity
- `durand()`, `sinclair()` — limiting settling velocities

## Files

```
Slurry-Pump-Calc.html   ← the bundled single file to open (generated)
build.py                bundles the source below into the single file
index.html     app shell + tab markup
styles.css     Nexmin theme (red / black / grey / white, Aptos)
data.js        reference tables, auto-extracted from the workbook
meta.js        formula documentation + bibliography (drives ⓘ call-outs)
engine.js      pure calc engine (mirrors Calc_Template)
export.js      ExcelJS workbook builder (faithful, macro-free)
app.js         UI controller / state (save/load .json, autosave)
vendor/        ExcelJS (MIT) — the only third-party dependency
```

## Notes

- Inputs autosave to your browser (`localStorage`). **Reset** clears them.
- The exported workbook sets *full recalculation on load*, so Excel populates
  every formula result the moment you open it.
- Water-property and vapour-pressure lookups interpolate in the app; the export
  uses approximate table lookups (`VLOOKUP(..,TRUE)`) — identical at the standard
  table temperatures.
