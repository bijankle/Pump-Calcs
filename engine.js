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

    // Slurry details (col F = nominal, col G = design)
    const df = s.designFactor;                 // G15
    o.solidsN = s.solidsTPH; o.solidsD = (1 + df) * s.solidsTPH;
    o.liquidN = s.liquidTPH; o.liquidD = (1 + df) * s.liquidTPH;
    o.froth = s.frothFactor;
    o.flowN = ((o.solidsN / s.solidsSG) + (o.liquidN / s.liquorSG)) * o.froth;       // F16
    o.flowD = ((o.solidsD / s.solidsSG) + (o.liquidD / s.liquorSG)) * o.froth;       // G16
    o.SM = (s.solidsSG !== 0 ? (o.solidsN + o.liquidN) / o.flowN : s.liquorSG) * o.froth; // F19
    o.Cw = o.solidsN / (o.solidsN + o.liquidN);                                       // F20
    o.Cv = o.SM / s.solidsSG * o.Cw;                                                  // F21
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
    o.dis.Vlim = di.VlimOverride > 0 ? di.VlimOverride
      : o.FL * Math.sqrt(2 * g * (dg.IDs / 1000) * (s.solidsSG - s.liquorSG) / s.liquorSG); // F81
    o.dis.ratio = dh.V / o.dis.Vlim;                                                  // F82
    o.dis.Hd = di.Hsd + dh.Hp + dh.Hf + (di.Pd / (g * o.SM));                          // F88

    // Settling-velocity comparison methods (J/K block)
    o.settle = settlingMethods(s, o, dg.ID);

    // Pump / duty points
    const Dimp = pu.impellerDia;                                                      // F97
    const maxd = (o.d50 / 1000 < 0.0228) ? 0.0228 : (o.d50 / 1000);
    o.HR = pu.headRatioOverride > 0 ? pu.headRatioOverride
      : (1 - ((120 / Math.pow(Dimp, 0.8)) * (1 - (1 - (0.000385 * (s.solidsSG - 1) * (1 + 4 / s.solidsSG)) * (o.Cw * 100) * Math.log(maxd / 0.0227))))); // F98
    o.HRsource = pu.headRatioOverride > 0 ? 'User defined' : 'Est. by program';
    o.HE = pu.effRatioOverride > 0 ? pu.effRatioOverride
      : ((1 - 0.00007 * Math.pow(100 / ((100 / (o.Cw * 100)) * (s.solidsSG / (s.solidsSG + 1) + 1)), 2)) * o.HR); // F99
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
    o.Pc = o.P2 * (o.SM / s.liquorSG);                                                // F135
    o.Pcs = o.Pc * (1 + pw.margin) * (1 / pw.driveEff);                               // F136
    return o;
  }

  function settlingMethods(s, o, ID) {
    const SS = s.solidsSG, SL = s.liquorSG, d = o.d50 * 1e-6, IDm = o.dis.ID * 1e-3;
    const mu = o.muL; // cP
    const durandV = durand(SL, SS, o.Cv, o.d50, o.dis.ID, o.FL);
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

  window.ENGINE = {
    compute, chen, thomas, durand, sinclair,
    specRoughness, boreID, kBend, waterViscosity, vapourMwater, barometricKPa
  };
})();
