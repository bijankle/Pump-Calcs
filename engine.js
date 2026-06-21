/* ============================================================================
 * Slurry Pump Calc Engine  —  faithful re-implementation of "Calc_Template"
 * from the Nexmin Slurry Pump Calculation workbook.
 *
 * Custom Excel UDFs re-expressed as plain JS:
 *   chen()    – Chen (1979) explicit Colebrook friction factor
 *   thomas()  – Thomas (1965) Newtonian suspension viscosity
 *   durand()  – Durand & Condolios (1952) limiting settling velocity
 *   sinclair()– Sinclair settling velocity
 * Lookups (pipe bore / roughness / K-factors / water props / vapour press.)
 * read from window.REFDATA (data.js), itself extracted from the workbook.
 * ==========================================================================*/
(function () {
  'use strict';
  const R = () => window.REFDATA;
  const g = 9.81;

  /* ---- Custom functions (1:1 with workbook VBA) ------------------------- */
  function chen(rel, re) {
    if (!(re > 0)) return NaN;
    if (re > 2100) {
      const A = (1 / 2.8257) * Math.pow(rel, 1.1098);
      const B = 5.8506 / Math.pow(re, 0.8981);
      const c = (5.0452 / re) * (Math.log(A + B) / Math.LN10);
      const G = rel / 3.7065;
      return Math.pow(1 / (-2 * (Math.log(G - c) / Math.LN10)), 2);
    }
    return 64 / re;
  }
  // thomas(solids>0?, Cv as PERCENT, liquorViscosity)
  function thomas(solid, CvPct, liquor) {
    if (!(solid > 0)) return liquor;
    const x = CvPct / 100;
    if (CvPct < 1) return liquor * (1 + 2.5 * x);
    if (CvPct < 20) return liquor * (1 + 2.5 * x + 10.05 * x * x);
    if (CvPct < 40) return liquor * (1 + 2.5 * x + 10.05 * x * x + 0.00273 * Math.exp(16.6 * x));
    return NaN; // workbook returns "?"
  }
  function durand(liquorSG, solidSG, concVfrac, d50um, pipeID_mm, FL) {
    if (!FL) FL = (1.3 * Math.pow(concVfrac, 0.125)) * (1 - Math.exp(-6.9 * (d50um / 1000)));
    return FL * Math.sqrt(2 * g * (pipeID_mm / 1000) * (solidSG - liquorSG) / liquorSG);
  }
  function sinclair(d50um, solidSG, liquorSG) {
    const Dd = d50um * 1e-6;
    return Math.sqrt(650 * ((4 / 6) * g * Dd * Math.pow(solidSG / liquorSG, 0.8)));
  }

  /* ---- Reference-table lookups ----------------------------------------- */
  function specRoughness(material, spec) {
    const list = material === 'Poly' ? R().polySpecs : R().steelSpecs;
    const row = list.find(s => s.spec === spec);
    return row ? row.roughness : NaN;
  }
  function boreID(material, spec, dn) {
    if (material === 'Poly') {
      const i = R().polySizes.indexOf(dn);
      const col = R().polyBore[spec];
      return i >= 0 && col ? col[i] : NaN;
    }
    const i = R().steelSizes.indexOf(dn);
    const col = R().steelBore[spec];
    return i >= 0 && col ? col[i] : NaN;
  }
  // approximate (largest size <= dn), mirrors the workbook VLOOKUP(..,TRUE)
  function kBend(type, dn) {
    const sizes = R().kSizes, row = R().kBends[type];
    if (!row) return 0;
    let idx = 0;
    for (let i = 0; i < sizes.length; i++) if (sizes[i] <= dn) idx = i;
    return row[idx];
  }
  function interp(table, x, kx, ky) {
    const t = table.filter(r => r[ky] != null).sort((a, b) => a[kx] - b[kx]);
    if (x <= t[0][kx]) return t[0][ky];
    if (x >= t[t.length - 1][kx]) return t[t.length - 1][ky];
    for (let i = 1; i < t.length; i++) {
      if (x <= t[i][kx]) {
        const a = t[i - 1], b = t[i];
        return a[ky] + (b[ky] - a[ky]) * (x - a[kx]) / (b[kx] - a[kx]);
      }
    }
    return t[t.length - 1][ky];
  }
  const waterViscosity = T => interp(R().water, T, 'T', 'mu');   // cP (dynamic)
  const vapourMwater = T => interp(R().vapour, T, 'T', 'm');     // m water
  const barometricKPa = h => 101.325 * Math.pow(1 - 2.25577e-5 * h, 5.25588);

  /* ---- Pipe-leg friction sub-calc -------------------------------------- */
  function legGeom(inp, side) {
    const p = inp[side];
    const ID = boreID(p.material, p.spec, p.dn);
    const IDs = ID - 2 * p.scale;
    const e = specRoughness(p.material, p.spec);
    return { ID, IDs, e, eD: e / IDs };
  }
  function legHydraulics(Q, geom, p, isDischarge, SM, mu) {
    const D = geom.IDs / 1000;
    const V = 4 * Q / (3600 * Math.PI * D * D);
    const Re = (SM * 1000) * V * D / (mu * 1e-3);
    const f = chen(geom.eD, Re);
    const Hf = f * p.length * V * V / (2 * g * D);
    // fittings loss coefficient
    const k90 = p.q90 ? kBend('90', p.dn) : 0;
    const k45 = p.q45 ? kBend('45', p.dn) : 0;
    const kRun = p.qRun ? kBend('Run', p.dn) : 0;
    const kBr = p.qBranch ? kBend('Branch', p.dn) : 0;
    let K = p.k1 + p.k2 + p.k3 + p.q90 * k90 + p.q45 * k45 + p.qRun * kRun + p.qBranch * kBr + (p.k8 || 0);
    if (isDischarge) K += 1; // workbook adds +1 (exit loss) on discharge
    const Hp = K * V * V / (2 * g);
    return { V, Re, f, Hf, K, Hp, k90, k45, kRun, kBranch: kBr };
  }

  /* ---- Main calculation (returns every Calc_Template row value) -------- */
  function compute(inp) {
    const o = {};
    const s = inp.slurry, su = inp.suction, di = inp.discharge,
      pu = inp.pump, np = inp.npsh, pw = inp.power;

    // Slurry details (col F = nominal, col G = design) — process variables solved
    const df = s.designFactor || 0;                 // G15
    const froth = (s.frothFactor != null ? s.frothFactor : 1);
    const sv = solveProcess(s.proc || legacyProc(s), froth);
    const SS = sv.v.Ss, SL = sv.v.SL;
    o.SS = SS; o.SL = SL; o.df = df; o.froth = froth;
    o.procStatus = sv.status; o.procUnknown = sv.unknown; o.procOk = sv.ok; o.proc = sv.v;
    o.solidsN = sv.v.ms; o.solidsD = (1 + df) * sv.v.ms;
    o.liquidN = sv.v.mL; o.liquidD = (1 + df) * sv.v.mL;
    o.flowN = sv.v.Q;                                                                 // F16 (incl. froth)
    o.flowD = (1 + df) * sv.v.Q;                                                      // G16
    o.SM = sv.v.Sm;                                                                   // F19
    o.Cw = sv.v.Cw;                                                                   // F20
    o.Cv = sv.v.Cv;                                                                   // F21
    o.muL = waterViscosity(np.temp);                                                 // F22
    o.muM = s.viscOverride > 0 ? s.viscOverride : thomas(o.solidsN, o.Cv * 100, o.muL); // F23
    o.viscSource = s.viscOverride > 0 ? 'User defined' : 'Est. by program';
    o.d50 = s.d50;                                                                    // F24
    o.FL = (1.3 * Math.pow(o.Cv, 0.125)) * (1 - Math.exp(-6.9 * (o.d50 / 1000)));     // F25

    // Suction leg
    const sg = legGeom(inp, 'suction');
    o.suc = { ID: sg.ID, IDs: sg.IDs, e: sg.e, eD: sg.eD };
    const sh = legHydraulics(o.flowN, sg, su, false, o.SM, o.muM);
    const shD = legHydraulics(o.flowD, sg, su, false, o.SM, o.muM);
    Object.assign(o.suc, sh);
    o.suc.VD = shD.V;
    o.suc.Hf = sh.Hf; o.suc.Hp = sh.Hp;
    o.suc.Hs = su.Hss - sh.Hp - sh.Hf + (su.Ps / (g * o.SM));                          // F55

    // Discharge leg
    const dg = legGeom(inp, 'discharge');
    o.dis = { ID: dg.ID, IDs: dg.IDs, e: dg.e, eD: dg.eD };
    const dh = legHydraulics(o.flowN, dg, di, true, o.SM, o.muM);
    Object.assign(o.dis, dh);
    o.dis.FL = o.FL;                                                                   // F80
    // Settling-velocity methods (IDs-based so 'durand' equals the limiting velocity)
    o.settle = settlingMethods(s, o, dg.IDs);
    o.dis.settleMethod = di.settleMethod || 'durand';
    o.dis.Vlim = di.VlimOverride > 0 ? di.VlimOverride
      : (isFinite(o.settle[o.dis.settleMethod]) ? o.settle[o.dis.settleMethod] : o.settle.durand); // F81
    o.dis.ratio = dh.V / o.dis.Vlim;                                                  // F82
    o.dis.Hd = di.Hsd + dh.Hp + dh.Hf + (di.Pd / (g * o.SM));                          // F88

    // Pump / duty points
    const Dimp = pu.impellerDia;                                                      // F97
    const maxd = (o.d50 / 1000 < 0.0228) ? 0.0228 : (o.d50 / 1000);
    o.HR = pu.headRatioOverride > 0 ? pu.headRatioOverride
      : (1 - ((120 / Math.pow(Dimp, 0.8)) * (1 - (1 - (0.000385 * (SS - 1) * (1 + 4 / SS)) * (o.Cw * 100) * Math.log(maxd / 0.0227))))); // F98
    o.HRsource = pu.headRatioOverride > 0 ? 'User defined' : 'Est. by program';
    o.HE = pu.effRatioOverride > 0 ? pu.effRatioOverride
      : ((1 - 0.00007 * Math.pow(100 / ((100 / (o.Cw * 100)) * (SS / (SS + 1) + 1)), 2)) * o.HR); // F99
    o.HEsource = pu.effRatioOverride > 0 ? 'User defined' : 'Est. by program';

    o.Q1 = o.flowN / pu.nParallel;                                                    // F104
    o.Hdyn = (o.dis.Hd - o.suc.Hs) / pu.nSeries;                                      // F105
    o.etaW = pu.effWater;                                                             // F111
    o.etaS = o.etaW * o.HE;                                                           // F106
    o.P1 = 1e-3 * (o.Q1 * g * o.Hdyn * o.SM * 1000) / (o.etaS * 3600);                // F107
    o.Hw = o.Hdyn / o.HR;                                                             // F110
    o.P2 = 1e-3 * (o.Q1 * g * o.Hw * 1000) / (o.etaW * 3600);                         // F112
    o.tipSpeed = (Math.PI * Dimp * 1e-3) * (pu.speed / 60);                           // F115

    // NPSH
    o.PatmM = barometricKPa(np.altitude) / g;                                         // F119 (mH2O)
    o.PvM = vapourMwater(np.temp);                                                    // F121
    o.NPSHa_slurry = o.suc.Hs + o.PatmM / o.SM - o.PvM / o.SM;                        // F122
    o.NPSHa_water = (o.suc.Hs * o.SM) + o.PatmM - o.PvM;                              // F123
    o.NPSHr = np.npshr;                                                               // F124
    o.npshOK = np.npshr > 0 ? (o.NPSHa_water > np.npshr) : null;                      // F125

    // Power
    o.driveEff = pw.driveEff; o.margin = pw.margin;
    o.motorReq = (o.P1 > o.P2 ? o.P1 : o.P2) * (1 / pw.driveEff) * (1 + pw.margin);   // F131
    o.motorSel = pw.motorSize;                                                        // F132
    o.pctFL = pw.motorSize > 0 ? o.motorReq / pw.motorSize : NaN;                     // F133
    o.Pc = o.P2 * (o.SM / SL);                                                        // F135
    o.Pcs = o.Pc * (1 + pw.margin) * (1 / pw.driveEff);                               // F136
    return o;
  }

  function settlingMethods(s, o, IDmm) {
    const SS = o.SS, SL = o.SL, d = o.d50 * 1e-6, IDm = IDmm * 1e-3;
    const mu = o.muL; // cP
    const durandV = durand(SL, SS, o.Cv, o.d50, IDmm, o.FL);
    // Wilson & Judge (K85)
    const vt = 4 * g * d * (SS - 1) / (3 * Math.pow(((SS - 1) * g * d * d) /
      (18 * mu * 1e-6 + Math.sqrt(0.75 * 1 * (SS - 1) * g) * Math.pow(d, 1.5)), 2));
    const wilson = (2 + 0.305 * (Math.log10(d / (IDm * vt))) + 1.1e-4 * Math.pow(d / (IDm * vt), -0.489)
      - 0.044 * Math.pow(1e7 * d / (IDm * vt), -1.06)) * Math.sqrt(2 * g * IDm * (SS - 1));
    // Thomas (K86)
    const thomasV = 9 * (g * mu / (1e3 * SL)) * Math.pow(1e3 * SS - 1e3 * SL, 0.37) *
      Math.pow(IDm / (mu / (SL * 1e3)), 0.11);
    // Wasp (K87)
    const wasp = 3.116 * Math.pow(o.flowN, 0.18) * Math.sqrt(2 * g * IDm * ((SS - SL) / SL)) *
      Math.pow(d / IDm, 1 / 6);
    // Sinclair (K88)
    const sinc = Math.sqrt(650 * ((4 / 6) * g * d * Math.pow(SS / SL, 0.8)));
    return { durand: durandV, wilson, thomas: thomasV, wasp, sinclair: sinc };
  }

  /* ---- Process-variable solver -----------------------------------------
   * 8 interchangeable variables, 4 governing equations. Enter any independent
   * 4, the solver finds the other 4 (Newton-Raphson, numeric Jacobian).
   *   Vb = ms/Ss + mL/SL           (base volumetric flow, no froth)
   *   Q  = froth * Vb
   *   Sm = (ms+mL)/Vb
   *   Cw = ms/(ms+mL)
   *   Cv = (ms/Ss)/Vb
   * --------------------------------------------------------------------- */
  const PROC_KEYS = ['ms', 'mL', 'Ss', 'SL', 'Sm', 'Q', 'Cw', 'Cv'];
  function legacyProc(s) {
    return { ms: numOrNull(s.solidsTPH), mL: numOrNull(s.liquidTPH), Ss: numOrNull(s.solidsSG), SL: numOrNull(s.liquorSG), Sm: null, Q: null, Cw: null, Cv: null };
  }
  function numOrNull(x) { return (x === '' || x == null || isNaN(x)) ? null : Number(x); }

  function residuals(v, froth) {
    const Vb = v.ms / v.Ss + v.mL / v.SL;
    return [
      froth * Vb - v.Q,
      (v.ms + v.mL) - v.Sm * Vb,
      v.ms - v.Cw * (v.ms + v.mL),
      (v.ms / v.Ss) - v.Cv * Vb
    ];
  }
  function solve4(A, b) { // Gaussian elimination, 4x4
    const n = b.length, M = A.map((r, i) => r.concat(b[i]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  function solveProcess(proc, froth) {
    proc = proc || {}; froth = froth || 1;
    const v = {}; PROC_KEYS.forEach(k => v[k] = numOrNull(proc[k]));
    const unknown = PROC_KEYS.filter(k => v[k] == null);
    const known = PROC_KEYS.filter(k => v[k] != null);
    if (unknown.length > 4) return { status: 'under', need: unknown.length - 4, unknown, known, ok: false, v };
    // need at least one extensive (flow/mass) quantity to fix the absolute scale
    if (!['ms', 'mL', 'Q'].some(k => v[k] != null)) return { status: 'needflow', unknown, known, ok: false, v };
    if (unknown.length < 4) { // over-specified: ignore lowest-priority extras, recompute & flag
      const drop = known.slice().reverse().slice(0, 4 - unknown.length);
      drop.forEach(k => v[k] = null);
    }
    const U = PROC_KEYS.filter(k => v[k] == null);
    const guess = { ms: 100, mL: 100, Ss: 2.65, SL: 1, Sm: 1.3, Q: 150, Cw: 0.4, Cv: 0.2 };
    U.forEach(k => v[k] = guess[k]);
    let conv = false;
    for (let it = 0; it < 200; it++) {
      const r = residuals(v, froth);
      const J = [[], [], [], []];
      U.forEach((k, j) => {
        const h = Math.max(1e-7, Math.abs(v[k]) * 1e-7);
        const v2 = Object.assign({}, v); v2[k] += h;
        const r2 = residuals(v2, froth);
        for (let i = 0; i < 4; i++) J[i][j] = (r2[i] - r[i]) / h;
      });
      const dx = solve4(J, r.map(x => -x));
      if (!dx) break;
      let mx = 0; U.forEach((k, j) => { v[k] += dx[j]; mx = Math.max(mx, Math.abs(dx[j])); });
      if (mx < 1e-10) { conv = true; break; }
    }
    const r = residuals(v, froth);
    const finite = PROC_KEYS.every(k => isFinite(v[k]));
    const physical = v.ms >= 0 && v.mL >= 0 && v.Ss > 0 && v.SL > 0 && v.Q > 0 && v.Sm > 0;
    const ok = conv && finite && physical && r.every(x => Math.abs(x) < 1e-5);
    return { status: ok ? 'solved' : 'fail', unknown: U, known, ok, v };
  }

  // Full nominal + design computation (design = flows × (1 + design factor)).
  function computeBoth(pump) {
    const n = compute(pump);
    const dp = JSON.parse(JSON.stringify(pump));
    dp.slurry.proc = { ms: n.solidsN * (1 + n.df), mL: n.liquidN * (1 + n.df), Ss: n.SS, SL: n.SL, Sm: null, Q: null, Cw: null, Cv: null };
    dp.slurry.designFactor = 0;
    const d = compute(dp);
    return { n, d };
  }

  // Standard IEC motor ratings (kW)
  const IEC_MOTORS = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000];
  function nextMotor(kw) { for (const m of IEC_MOTORS) if (m >= kw) return m; return IEC_MOTORS[IEC_MOTORS.length - 1]; }

  window.ENGINE = {
    compute, computeBoth, solveProcess, PROC_KEYS, IEC_MOTORS, nextMotor,
    chen, thomas, durand, sinclair,
    specRoughness, boreID, kBend, waterViscosity, vapourMwater, barometricKPa
  };
})();
