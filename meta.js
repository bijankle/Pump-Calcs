/* ============================================================================
 * meta.js — "the guts": formula references, explanations and citations.
 * Drives the (i) info call-outs next to calculated rows and the
 * "How it works" tab. Keep this the single source of truth for documentation.
 * ==========================================================================*/
(function () {
  'use strict';

  // Bibliography — ids referenced by individual calculations.
  const REFERENCES = {
    warman:   { tag: 'Warman', cite: 'Weir Minerals, "Warman Slurry Pumping Handbook", Weir Slurry Group.' },
    durand:   { tag: 'Durand & Condolios (1952)', cite: 'Durand, R. & Condolios, E. (1952). "Experimental study of the hydraulic transport of coal and solid material in pipes." Proc. Colloq. on the Hydraulic Transport of Coal, Nat. Coal Board, London.' },
    thomas:   { tag: 'Thomas (1965)', cite: 'Thomas, D.G. (1965). "Transport of Suspensions, Part VIII: A note on the viscosity of Newtonian suspensions of uniform spherical particles." J. Colloid Sci. 20, 267.' },
    chen:     { tag: 'Chen (1979)', cite: 'Chen, N.H. (1979). "An explicit equation for friction factor in pipe." Ind. Eng. Chem. Fundam. 18(3), 296-297.' },
    streeter: { tag: 'Streeter & Wylie (1983)', cite: 'Streeter, V.L. & Wylie, E.B. (1983). "Fluid Mechanics", First SI Metric Edition, McGraw-Hill. (Physical properties of water.)' },
    wilson:   { tag: 'Wilson et al.', cite: 'Wilson, K.C., Addie, G.R., Sellgren, A. & Clift, R., "Slurry Transport Using Centrifugal Pumps", 3rd ed., Springer.' },
    wasp:     { tag: 'Wasp et al. (1977)', cite: 'Wasp, E.J., Kenny, J.P. & Gandhi, R.L. (1977). "Solid-Liquid Flow Slurry Pipeline Transportation." Trans Tech Publications.' },
    sinclair: { tag: 'Sinclair', cite: 'Sinclair, C.G., settling-velocity correlation (per Warman handbook references).' },
    schiller: { tag: 'Schiller & Herbich (1991)', cite: 'Schiller, R.E. & Herbich, J.B. (1991). Durand factor F_L approximation.' },
    darcy:    { tag: 'Darcy-Weisbach', cite: 'Darcy-Weisbach head-loss equation; minor losses via resistance (K) coefficients.' }
  };

  // Per-calculation documentation. key -> { title, unit, formula, what, refs[] }
  const DOC = {
    flow:   { title: 'Flowrate (Q)', unit: 'm³/hr', formula: 'Q = ((m_s/S_s) + (m_L/S_L)) × FrothFactor',
      what: 'Volumetric slurry flow from the solids and liquid mass flowrates divided by their respective specific gravities, scaled by the froth volume factor. The Design column re-evaluates this with the process design factor applied to both mass flows.', refs: ['warman'] },
    SM:     { title: 'Mixture s.g. (Sm)', unit: '', formula: 'Sm = ((m_s + m_L) / Q) × FrothFactor',
      what: 'Specific gravity of the combined slurry mixture, from total mass flow over volumetric flow.', refs: ['warman'] },
    Cw:     { title: 'Concentration by weight (Cw)', unit: 'w/w', formula: 'Cw = m_s / (m_s + m_L)',
      what: 'Mass fraction of solids in the slurry.', refs: ['warman'] },
    Cv:     { title: 'Concentration by volume (Cv)', unit: 'v/v', formula: 'Cv = (Sm / S_s) × Cw',
      what: 'Volume fraction of solids, derived from the weight concentration and the mixture/solids specific gravities.', refs: ['warman'] },
    muL:    { title: 'Liquor viscosity (µl)', unit: 'cP', formula: 'µl = f(T) — table lookup',
      what: 'Dynamic viscosity of the carrier liquid (water) at the service temperature, interpolated from the physical-properties-of-water table.', refs: ['streeter'] },
    muM:    { title: 'Slurry viscosity (µm)', unit: 'cP',
      formula: 'Thomas (1965), piecewise in Cv (volume fraction):\n  Cv < 1% :   µm = µl·(1 + 2.5·Cv)\n  Cv < 20% :  µm = µl·(1 + 2.5·Cv + 10.05·Cv²)\n  Cv < 40% :  µm = µl·(1 + 2.5·Cv + 10.05·Cv² + 0.00273·exp(16.6·Cv))\n  (Cv ≥ 40% : outside correlation range)',
      what: 'Apparent Newtonian viscosity of the suspension as a function of volumetric concentration. Overridden when a value is entered by the user.', refs: ['thomas'] },
    FL:     { title: 'Durand factor (FL)', unit: '', formula: 'FL = 1.3·Cv^0.125 · (1 − e^(−6.9·d50/1000))',
      what: 'Durand-Condolios Froude-type factor approximated (Schiller & Herbich) from concentration and particle size; feeds the limiting settling velocity.', refs: ['durand', 'schiller'] },
    ID:     { title: 'Pipe inside diameter (ID)', unit: 'mm', formula: 'ID = lookup(material, spec, nominal size)',
      what: 'Internal bore from the manufacturer pipe schedule tables for the selected material (Steel / Poly), pressure/wall specification, and nominal size (DN).', refs: ['warman'] },
    IDs:    { title: 'ID with scale (IDs)', unit: 'mm', formula: 'IDs = ID − 2·t_scale',
      what: 'Effective bore after subtracting scale build-up from both walls — used to test the sensitivity of the duty to fouling over time.', refs: [] },
    eD:     { title: 'Relative roughness (e/D)', unit: '', formula: 'e/D = e / IDs',
      what: 'Pipe absolute roughness (material dependent) over the scaled inside diameter; input to the friction-factor correlation.', refs: [] },
    V:      { title: 'Velocity (V)', unit: 'm/s', formula: 'V = 4Q / (3600·π·(IDs/1000)²)',
      what: 'Bulk flow velocity in the pipe from continuity. Recommended slurry pipeline velocity is typically 1.5–2.0 m/s and at least 15% above the limiting settling velocity.', refs: ['warman'] },
    Re:     { title: 'Reynolds number (Re)', unit: '', formula: 'Re = ρ·V·D / µ  =  (Sm·1000)·V·(IDs/1000) / (µm·10⁻³)',
      what: 'Ratio of inertial to viscous forces, computed on the slurry density and slurry viscosity. Determines laminar/turbulent regime.', refs: [] },
    f:      { title: 'Friction factor (f)', unit: '',
      formula: 'Laminar (Re ≤ 2100):  f = 64 / Re\nTurbulent (Re > 2100), Chen (1979) explicit Colebrook:\n  1/√f = −2·log₁₀[ (e/D)/3.7065 − (5.0452/Re)·log₁₀(A + B) ]\n  where  A = (1/2.8257)·(e/D)^1.1098\n         B = 5.8506 / Re^0.8981',
      what: 'Darcy friction factor. Below Re 2100 the laminar relation applies; above it the Chen explicit approximation of the Colebrook equation is used, from relative roughness e/D and Reynolds number Re.', refs: ['chen', 'darcy'] },
    Hf:     { title: 'Pipe friction head loss (Hf)', unit: 'm slurry', formula: 'Hf = f·L·V² / (2·g·(IDs/1000))',
      what: 'Darcy-Weisbach straight-pipe friction loss over the leg length (excludes fittings).', refs: ['darcy'] },
    K:      { title: 'Fittings loss coefficient (ΣK)', unit: '', formula: 'ΣK = K1+K2+K3 + Σ(qty·K_bend) + K8  (+1 exit on discharge)',
      what: 'Sum of minor-loss resistance coefficients. Bend/tee K values (K4–K7) are looked up by nominal size from the K-factor table and multiplied by the quantity of each fitting.', refs: ['warman'] },
    Hp:     { title: 'Minor (fitting) losses (Hp)', unit: 'm slurry', formula: 'Hp = ΣK·V² / (2·g)',
      what: 'Velocity-head losses from valves, bends, tees and entrance/exit, via the resistance-coefficient method.', refs: ['darcy'] },
    Hs:     { title: 'Suction head (Hs)', unit: 'm slurry', formula: 'Hs = Hss − Hp − Hf + Ps/(g·Sm)',
      what: 'Net head available at the pump suction: static lift less friction and fitting losses, plus any suction surface pressure.', refs: [] },
    Vlim:   { title: 'Limiting (settling) velocity (Vlim)', unit: 'm/s', formula: 'Vlim = FL·√(2·g·(IDs/1000)·(Ss−SL)/SL)',
      what: 'Durand limiting velocity below which solids settle and transport becomes inefficient. Design velocity should exceed this (ratio > 1.15 recommended).', refs: ['durand', 'warman'] },
    ratio:  { title: 'Velocity / Limiting ratio', unit: 'xVL', formula: 'V / Vlim   (recommended > 1.15)',
      what: 'Factor of safety against settling. Below 1.0 the flow is at risk of dropping solids; refer to the Settling Velocity tab for less-conservative methods where fines are present.', refs: ['warman'] },
    Hd:     { title: 'Discharge head (Hd)', unit: 'm slurry', formula: 'Hd = Hsd + Hp + Hf + Pd/(g·Sm)',
      what: 'Total head required on the discharge leg: static lift plus friction and fitting losses plus any required delivery pressure (e.g. cyclone).', refs: [] },
    HR:     { title: 'Head ratio (HR)', unit: '', formula: 'HR = 1 − (120/Dimp^0.8)·(1 − (1 − 0.000385(Ss−1)(1+4/Ss)·Cw%·ln(d/0.0227)))',
      what: 'Solids-effect derating of pump head versus clear water, accounting for impeller diameter, particle size and weight concentration. Most pronounced on large pumps / mill duties.', refs: ['warman'] },
    HE:     { title: 'Efficiency ratio (HE)', unit: '', formula: 'HE = (1 − 0.00007·(100/((100/Cw%)(Ss/(Ss+1)+1)))²)·HR',
      what: 'Derating of pump efficiency on slurry relative to water.', refs: ['warman'] },
    Hdyn:   { title: 'Total dynamic head — slurry (Hdyn)', unit: 'm slurry', formula: 'Hdyn = (Hd − Hs) / n_series',
      what: 'System total dynamic head on slurry per pump in a series arrangement — the slurry duty point.', refs: [] },
    Hw:     { title: 'Equivalent water head (Hw)', unit: 'm H₂O', formula: 'Hw = Hdyn / HR',
      what: 'Head the pump must produce on water to deliver the slurry duty — used to read the water pump curve.', refs: ['warman'] },
    etaS:   { title: 'Slurry efficiency (ηs)', unit: '', formula: 'ηs = ηw × HE',
      what: 'Pump efficiency on slurry: the water-curve efficiency at duty point 2 multiplied by the efficiency ratio.', refs: ['warman'] },
    P1:     { title: 'Power — duty point 1 (P1)', unit: 'kW', formula: 'P1 = Q·g·Hdyn·ρ / (ηs·3600·1000)',
      what: 'Absorbed shaft power pumping the slurry at the slurry duty point.', refs: [] },
    P2:     { title: 'Power — duty point 2 (P2)', unit: 'kW', formula: 'P2 = Q·g·Hw·ρ_water / (ηw·3600·1000)',
      what: 'Absorbed power at the equivalent water duty point, for comparison.', refs: [] },
    tipSpeed:{ title: 'Impeller tip speed (Ts)', unit: 'm/s', formula: 'Ts = π·Dimp/1000 · N/60',
      what: 'Peripheral impeller speed; must stay within the material-of-construction limits.', refs: ['warman'] },
    PatmM:  { title: 'Barometric pressure (Patm)', unit: 'm H₂O', formula: 'Patm = 101.325·(1 − 2.25577e-5·h)^5.25588 / g',
      what: 'Local atmospheric pressure from the barometric formula at site altitude, expressed in metres of water.', refs: ['warman'] },
    PvM:    { title: 'Vapour pressure (Pv)', unit: 'm H₂O', formula: 'Pv = f(T) — table lookup',
      what: 'Absolute vapour pressure of water at the service temperature, from the steam-table lookup.', refs: ['warman', 'streeter'] },
    NPSHa:  { title: 'NPSH available', unit: 'm', formula: 'NPSHa = Hs + Patm/Sm − Pv/Sm   (and eq. m H₂O form)',
      what: 'Net positive suction head available. Must exceed the pump NPSHr to avoid cavitation.', refs: ['warman'] },
    motorReq:{ title: 'Motor power required', unit: 'kW', formula: 'P_motor = max(P1,P2)·(1/η_drive)·(1 + margin)',
      what: 'Installed motor power incorporating drive efficiency and the power-draw design margin, taken on the higher of the two duty points.', refs: [] },
    pctFL:  { title: '% Full load', unit: '%', formula: '% = P_motor_required / Motor_selected',
      what: 'Loading of the selected motor at duty.', refs: [] }
  };

  window.META = { REFERENCES, DOC };
})();
