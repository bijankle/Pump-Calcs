/* ============================================================================
 * export.js — builds a macro-free .xlsx that mirrors the workbook:
 *   • one sheet per pump, laid out row-for-row like "Calc_Template"
 *   • recreated "Reference" and "Material Info" sheets so every native
 *     formula / named range resolves and recalculates in Excel
 *   • data-validation dropdowns + conditional formatting preserved
 *   • a clean custom "Summary" sheet (our improved version)
 * Requires ExcelJS (vendor/exceljs.min.js).
 * ==========================================================================*/
(function () {
  'use strict';

  // ---- shared styles -------------------------------------------------------
  const RED = 'FFC8102E', BLACK = 'FF1A1A1A', GREY = 'FF4D4D4D',
        LGREY = 'FFEDEDED', YELLOW = 'FFFFF6CC', WHITE = 'FFFFFFFF';
  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const FONT = 'Aptos';
  const baseFont = { name: FONT, size: 10, color: { argb: BLACK } };

  function titleStyle(cell, text) {
    cell.value = text;
    cell.font = { name: FONT, size: 14, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  }
  function sectionStyle(cell, text) {
    cell.value = text;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
  }
  function label(cell, text, bold) {
    cell.value = text;
    cell.font = { name: FONT, size: 10, bold: !!bold, color: { argb: BLACK } };
  }
  const numFmt = { 0: '0', 1: '0.0', 2: '0.00', 3: '0.000', 4: '0.0000' };

  // ---- reference sheets ----------------------------------------------------
  function buildReference(wb) {
    const ws = wb.addWorksheet('Reference', { properties: { tabColor: { argb: GREY } } });
    ws.getColumn(4).width = 12; ws.getColumn(7).width = 14;
    ws.getColumn(13).width = 14; ws.getColumn(16).width = 12;
    label(ws.getCell('D81'), 'Physical Properties of Water (SI)  — Streeter & Wylie (1983)', true);
    label(ws.getCell('D85'), 'Temp °C', true); label(ws.getCell('G85'), 'Density kg/m³', true);
    label(ws.getCell('J85'), 'Viscosity cP', true); label(ws.getCell('M85'), 'Viscosity (col 10)', true);
    label(ws.getCell('P85'), 'Vapour kPa', true);
    REFDATA.water.forEach((w, i) => {
      const r = 88 + i;
      ws.getCell('D' + r).value = w.T; ws.getCell('G' + r).value = w.rho;
      ws.getCell('J' + r).value = w.mu; ws.getCell('M' + r).value = w.mu;
      ws.getCell('P' + r).value = w.pv;
    });
    // barometric reference cell (kept for compatibility; pump sheets compute live)
    label(ws.getCell('A137'), 'P at 100m (kPa)');
    ws.getCell('C138').value = 100.12943857533644;
    // vapour pressure table A146:D208
    label(ws.getCell('A146'), 'Temperature', true); label(ws.getCell('B146'), 'Vapour Pressure', true);
    label(ws.getCell('C146'), 'kPa', true); label(ws.getCell('D146'), 'm water', true);
    REFDATA.vapour.forEach((v, i) => {
      const r = 147 + i;
      ws.getCell('A' + r).value = v.T; ws.getCell('C' + r).value = v.kPa; ws.getCell('D' + r).value = v.m;
    });
    return ws;
  }

  function colLetter(n) { // 1->A
    let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s;
  }

  function buildMaterialInfo(wb) {
    const ws = wb.addWorksheet('Material Info', { properties: { tabColor: { argb: GREY } } });
    ws.getColumn(1).width = 12; ws.getColumn(2).width = 18; ws.getColumn(3).width = 16; ws.getColumn(4).width = 10;
    // Material types
    label(ws.getCell('A3'), 'Material Types', true);
    ws.getCell('B4').value = 'Poly'; ws.getCell('B5').value = 'Steel';
    // Roughness reference
    label(ws.getCell('A7'), 'Roughness (mm)', true);
    REFDATA.roughnessNamed.forEach((p, i) => { ws.getCell('B' + (8 + i)).value = p[0]; ws.getCell('C' + (8 + i)).value = p[1]; });
    // Rough lookup table B14:D42 (spec, desc, roughness) — steel then poly
    label(ws.getCell('A14'), 'Steel', true);
    REFDATA.steelSpecs.forEach((s, i) => { const r = 15 + i; ws.getCell('B' + r).value = s.spec; ws.getCell('C' + r).value = s.desc; ws.getCell('D' + r).value = s.roughness; });
    label(ws.getCell('A21'), 'Poly Types', true);
    REFDATA.polySpecs.forEach((s, i) => { const r = 22 + i; ws.getCell('B' + r).value = s.spec; ws.getCell('C' + r).value = s.desc; ws.getCell('D' + r).value = s.roughness; });
    // Poly bore A45:W72
    ws.getCell('A45').value = 'Nom Size';
    REFDATA.polyHeader.forEach((h, i) => { ws.getCell(colLetter(2 + i) + '45').value = h; });
    REFDATA.polySizes.forEach((sz, ri) => {
      const r = 46 + ri; ws.getCell('A' + r).value = sz;
      REFDATA.polyHeader.forEach((h, ci) => {
        const col = REFDATA.polyBore[h] ? REFDATA.polyBore[h] : null;
        // value comes from the spec's own column array; map by header spec name
      });
      // fill each header column with that spec's bore for this size
      REFDATA.polyHeader.forEach((h, ci) => {
        let v = null;
        // find a polyBore series whose spec equals header (first match)
        if (REFDATA.polyBore[h]) v = REFDATA.polyBore[h][ri];
        ws.getCell(colLetter(2 + ci) + r).value = v;
      });
    });
    // Steel bore A108:F136
    ws.getCell('A108').value = 'Nom Size';
    REFDATA.steelHeader.forEach((h, i) => { ws.getCell(colLetter(2 + i) + '108').value = h; });
    REFDATA.steelSizes.forEach((sz, ri) => {
      const r = 109 + ri; ws.getCell('A' + r).value = sz;
      REFDATA.steelHeader.forEach((h, ci) => { ws.getCell(colLetter(2 + ci) + r).value = REFDATA.steelBore[h][ri]; });
    });
    // K-factor bend table  B177(header sizes C..) / rows 178-181
    label(ws.getCell('A177'), 'K-factors', true);
    REFDATA.kSizes.forEach((sz, i) => { ws.getCell(colLetter(3 + i) + '177').value = sz; });
    [['Branch', 178], ['Run', 179], ['45', 180], ['90', 181]].forEach(([nm, r]) => {
      ws.getCell('B' + r).value = nm;
      REFDATA.kBends[nm].forEach((v, i) => { ws.getCell(colLetter(3 + i) + r).value = v; });
    });
    return ws;
  }

  function addNames(wb) {
    const N = (ref, name) => { try { wb.definedNames.add(ref, name); } catch (e) { /* noop */ } };
    N("'Material Info'!$B$4:$B$5", 'Material');
    N("'Material Info'!$B$15:$B$19", 'Steel');
    N("'Material Info'!$B$22:$B$42", 'Poly');
    N("'Material Info'!$A$46:$A$72", 'PolySize');
    N("'Material Info'!$A$109:$A$136", 'SteelSize');
    N("'Material Info'!$A$45:$W$45", 'PolySpec');
    N("'Material Info'!$A$108:$F$108", 'SteelSpec');
    N("'Material Info'!$A$45:$W$72", 'PolyBore');
    N("'Material Info'!$A$108:$F$136", 'SteelBore');
    N("'Material Info'!$B$14:$D$42", 'Rough');
    N("Reference!$D$88:$Q$108", 'WaterVisc');
  }

  // ---- inline UDF expansions (native Excel) --------------------------------
  function chenF(rel, re) {
    return `IF(${re}>2100,(1/(-2*(LOG10((${rel}/3.7065)-(5.0452/${re})*LOG10((1/2.8257)*${rel}^1.1098+5.8506/${re}^0.8981)))))^2,64/${re})`;
  }
  // thomas with overrideCell (E..), solids F13, Cv F21, liquor F22
  function thomasF(eCell) {
    const c = 'F21', v = 'F22';
    const t = `IF(F13>0,IF(${c}*100<1,${v}*(1+2.5*${c}),IF(${c}*100<20,${v}*(1+2.5*${c}+10.05*${c}^2),IF(${c}*100<40,${v}*(1+2.5*${c}+10.05*${c}^2+0.00273*EXP(16.6*${c})),"?"))),${v})`;
    return `IFERROR(IF(${eCell}=0,${t},${eCell}),"")`;
  }

  // ---- one pump calc sheet (mirrors Calc_Template) -------------------------
  function buildPumpSheet(wb, pump) {
    const name = sanitize(pump.tag || pump.name || 'PUMP');
    const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: RED } } });
    [8.71, 38, 11, 11, 6, 19.29, 19.29, 6, 9, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.eachRow && null;
    const F = (c, formula) => { ws.getCell(c).value = { formula }; };
    const V = (c, val) => { ws.getCell(c).value = (val === undefined || val === null || val === '') ? null : val; };
    const yel = (c) => { ws.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } }; ws.getCell(c).border = border; };
    const s = pump.slurry, su = pump.suction, di = pump.discharge, pu = pump.pump, np = pump.npsh, pw = pump.power;
    const o = ENGINE.compute(pump); // engine results -> cached into formula cells so values show instantly

    // Header
    ws.mergeCells('A1:D1'); titleStyle(ws.getCell('A1'), 'SLURRY PUMP CALCULATION');
    label(ws.getCell('A2'), 'Project:'); V('B2', pump.project || '');
    label(ws.getCell('A3'), 'Client:'); V('B3', pump.client || '');
    label(ws.getCell('A4'), 'Revision:'); V('B4', pump.rev || 'A');
    label(ws.getCell('A5'), 'Prepared:'); label(ws.getCell('C5'), 'Date:');
    label(ws.getCell('A6'), 'Checked:'); label(ws.getCell('C6'), 'Date:');
    label(ws.getCell('B7'), 'DESCRIPTION', true); label(ws.getCell('C7'), 'Pump Name:');
    V('E7', pump.name || ''); label(ws.getCell('C8'), 'Pump Tag:'); V('E8', pump.tag || '');
    label(ws.getCell('C9'), 'Stream No:'); V('E9', pump.stream || '');
    label(ws.getCell('C10'), 'SYMBOL', true); label(ws.getCell('D10'), 'UNIT', true);
    label(ws.getCell('E10'), 'No.', true); label(ws.getCell('F10'), 'Nominal', true); label(ws.getCell('G10'), 'Design', true); label(ws.getCell('H10'), 'Rev', true);

    // helper for a labelled row
    const row = (r, b, c, d) => { if (b) label(ws.getCell('B' + r), b); if (c) label(ws.getCell('C' + r), c); if (d) label(ws.getCell('D' + r), d); };

    sectionStyle(ws.getCell('B11'), 'SLURRY DETAILS');
    row(13, 'Solids', "m's", 'tph'); V('F13', s.solidsTPH); F('G13', '(1+$G$15)*F13');
    row(14, 'Liquid', "m'L", 'tph'); V('F14', s.liquidTPH); F('G14', '(1+$G$15)*F14');
    row(15, 'Design Factor %', 'S'); V('G15', s.designFactor);
    row(16, 'Flowrate', 'Q', 'm3/hr'); F('F16', '((F13/F18)+(F14/F17))*F26'); F('G16', '((G13/F18)+(G14/F17))*F26');
    row(17, 'Liquor s.g.', 'SL'); V('F17', s.liquorSG);
    row(18, 'Solids s.g.', 'SS'); V('F18', s.solidsSG);
    row(19, 'Mixture s.g.', 'SM'); F('F19', 'IFERROR(IF(F18<>0,(F13+F14)/F16,F17)*F26,"")');
    row(20, 'Concentration', 'Cw', 'w/w'); F('F20', 'F13/(F13+F14)');
    row(21, 'Concentration', 'Cv', 'v/v'); F('F21', 'IFERROR(F19/F18*F20,"")');
    row(22, 'Liquor Viscosity (dynamic)', 'µl', 'cP'); F('F22', 'VLOOKUP(F120,WaterVisc,10,TRUE)');
    row(23, 'Slurry Viscosity', 'µm', 'cP'); V('E23', s.viscOverride || 0); F('F23', thomasF('$E$23')); F('G23', 'IF(E23=0,"Est. by program","User defined")');
    row(24, 'Particle Size', 'd50', 'm v 10^-6'); V('F24', s.d50);
    row(25, 'Durand Factor', 'FL'); F('F25', '(1.3*(F21^0.125))*(1-EXP(-6.9*(F24/1000)))');
    row(26, 'Froth Volume Factor'); V('F26', s.frothFactor);
    ['F13', 'F14', 'G15', 'F17', 'F18', 'E23', 'F24', 'F26'].forEach(yel);

    sectionStyle(ws.getCell('B27'), 'SUCTION PIPE DATA');
    buildLeg(ws, F, V, yel, row, 'suction', su, 28);

    sectionStyle(ws.getCell('B48'), 'SUCTION PIPE OUTPUT DATA');
    row(49, 'Velocity', 'V', 'm/s'); F('F49', '4*F16/(3600*PI()*(F33/1000)^2)'); F('G49', 'IFERROR(4*G16/(3600*PI()*(F33/1000)^2),"")');
    row(50, 'Reynolds Number', 'Re'); F('F50', '(F19*1000)*F49*(F33/1000)/(F23*10^-3)'); F('G50', '(F19*1000)*G49*(F33/1000)/(F23*10^-3)');
    row(51, 'Friction Factor', 'f'); F('F51', chenF('F35', 'F50')); F('G51', chenF('F35', 'G50'));
    row(52, 'Pipe Friction Head Loss (excl fittings)', 'Hf', 'mSlurry'); F('F52', 'F51*(F36)*(F49^2)/(2*9.81*(F33/1000))'); F('G52', 'G51*(F36)*(G49^2)/(2*9.81*(F33/1000))');
    row(53, 'Fittings Loss Coefficient', 'K'); F('F53', 'SUM(F37:F39)+$E$40*F40+$E$41*F41+$E$42*F42+$E$43*F43+F44'); F('G53', 'SUM(F37:F39)+$E$40*F40+$E$41*F41+$E$42*F42+$E$43*F43+F44');
    row(54, 'Minor (Fitting) Pressure Losses', 'Hp', 'mSlurry'); F('F54', 'F53*(F49^2/(2*9.81))'); F('G54', 'G53*(G49^2/(2*9.81))');
    row(55, 'Suction Head', 'Hs', 'mSlurry'); F('F55', 'F45-F54-F52+(F46/(9.81*F19))'); F('G55', 'F45-G54-G52+(F46/(9.81*F19))');

    sectionStyle(ws.getCell('B57'), 'DISCHARGE PIPE DATA');
    buildLeg(ws, F, V, yel, row, 'discharge', di, 58);

    sectionStyle(ws.getCell('B78'), 'DISCHARGE PIPE OUTPUT DATA');
    row(79, 'Velocity', 'V', 'm/s'); F('F79', '4*F16/(3600*PI()*(F63/1000)^2)'); F('G79', 'IFERROR(4*G16/(3600*PI()*(F63/1000)^2),"")');
    row(80, 'Durand Factor', 'FL'); F('F80', 'F25');
    row(81, 'Limiting Velocity (Durand)', 'Vlim', 'm/s'); V('E81', di.VlimOverride || 0); F('F81', 'IF($E$81>0,$E$81,F80*SQRT(2*9.81*(F63/1000)*(F18-F17)/F17))');
    row(82, 'Velocity / Limiting Velocity Ratio (Recommended >1.15)', '', 'xVL'); F('F82', 'F79/F81'); F('G82', 'G79/F81');
    row(83, 'Reynolds Number', 'Re'); F('F83', '(F19*1000)*F79*(F63/1000)/(F23*10^-3)'); F('G83', '(F19*1000)*G79*(F63/1000)/(F23*10^-3)');
    row(84, 'Friction Factor (Darcy)', 'f'); F('F84', chenF('F65', 'F83')); F('G84', chenF('F65', 'G83'));
    row(85, 'Pipe Friction Head Loss (excl fittings)', 'Hf', 'mSlurry'); F('F85', 'F84*(F66)*(F79^2)/(2*9.81*(F63/1000))'); F('G85', 'G84*(F66)*(G79^2)/(2*9.81*(F63/1000))');
    row(86, 'Fittings Loss Coefficient', 'K'); F('F86', 'SUM(F67:F69)+1+$E$70*F70+$E$71*F71+$E$72*F72+$E$73*F73+F74'); F('G86', 'F86');
    row(87, 'Minor (Fitting) Pressure Losses', 'Hp', 'mSlurry'); F('F87', '(F86)*F79^2/(2*9.81)'); F('G87', '(F86)*G79^2/(2*9.81)');
    row(88, 'Discharge Head', 'Hd', 'mSlurry'); F('F88', 'F76+F87+F85+(F75/(9.81*F19))'); F('G88', 'F76+G87+G85+(F75/(9.81*F19))');

    // Settling velocity comparison block (J/K)
    sectionStyle(ws.getCell('J82'), 'SETTLING VELOCITY CHECKS');
    label(ws.getCell('J83'), 'Calculation Method', true); label(ws.getCell('K83'), 'Velocity', true);
    label(ws.getCell('J84'), 'Durand'); F('K84', 'F80*SQRT(2*9.81*(F61/1000)*(F18-F17)/F17)');
    label(ws.getCell('J85'), 'Wilson & Judge'); F('K85', wilsonF());
    label(ws.getCell('J86'), 'Thomas'); F('K86', '9*(9.81*F22/(10^3*F17))*(10^3*F18-10^3*F17)^0.37*(F61*10^-3/(F22/(F17*10^3)))^0.11');
    label(ws.getCell('J87'), 'Wasp'); F('K87', '3.116*F16^0.18*(2*9.81*F61*10^-3*((F18-F17)/F17))^0.5*(F24*10^-6/(F61*10^-3))^(1/6)');
    label(ws.getCell('J88'), 'Sinclair'); F('K88', 'SQRT(650*((4/6)*9.81*F24*10^-6*(F18/F17)^0.8))');

    sectionStyle(ws.getCell('B90'), 'PUMP INFORMATION / DUTY POINTS');
    row(91, 'Make'); V('F91', pu.make || '');
    row(92, 'Model'); V('F92', pu.model || '');
    row(93, 'Frame'); V('F93', pu.frame || '');
    row(94, 'Drive type'); V('F94', pu.drive || '');
    row(95, 'Shaft Seal type'); V('F95', pu.seal || '');
    row(96, 'Impeller type'); V('F96', pu.impellerType || '');
    row(97, 'Impeller Diameter (for tip speed)', 'Dimp', 'mm'); V('F97', pu.impellerDia);
    row(98, 'Head Ratio', 'HR'); V('E98', pu.headRatioOverride || 0); F('F98', 'IF($E$98=0,(1-((120/F97^0.8)*(1-(1-(0.000385*(F18-1)*(1+4/F18))*(F20*100)*LN(IF(F24/1000<0.0228,0.0228,(F24/1000))/0.0227))))),$E$98)'); F('G98', 'IF(E98=0,"Est. by program","User defined")');
    row(99, 'Efficiency Ratio', 'HE'); V('E99', pu.effRatioOverride || 0); F('F99', 'IF($E$99=0,(((1-0.00007*(100/((100/(F20*100))*(F18/(F18+1)+1)))^2)*F98)),$E$99)'); F('G99', 'IF(E99=0,"Est. by program","User defined")');
    row(100, 'Number of Pumps (Series)'); V('F100', pu.nSeries);
    row(101, 'Number of Pumps (Parallel)'); V('F101', pu.nParallel);
    label(ws.getCell('B103'), 'Duty Point 1 (slurry)', true);
    row(104, 'Flowrate (slurry)', 'Q', 'm3/hr'); F('F104', 'F16/$F$101'); F('G104', 'G16/$F$101');
    row(105, 'Total Dynamic Head (slurry)', 'Hdyn', 'mSlurry'); F('F105', '(F88-F55)/$F$100'); F('G105', 'IFERROR((G88-G55)/$F$100,"")');
    row(106, 'Pump Efficiency', 'ηs'); F('F106', 'F111*F99'); F('G106', 'G111*F99');
    row(107, 'Power Point 1', 'P1', 'kW'); F('F107', '10^-3*(F104*9.81*F105*F19*1000)/(F106*3600)'); F('G107', '10^-3*(G104*9.81*G105*F19*1000)/(G106*3600)');
    label(ws.getCell('B108'), 'Duty Point 2', true);
    row(109, 'Flowrate (slurry)', 'Q', 'm3/hr'); F('F109', 'F104'); F('G109', 'G104');
    row(110, 'Total Dynamic Head (water)', 'Hw', 'Equiv mH2O'); F('F110', '(F105)/F98'); F('G110', '(G105)/F98');
    row(111, 'Pump Efficiency', 'ηw'); V('F111', pu.effWater);
    row(112, 'Power Point 2', 'P2', 'kW'); F('F112', '10^-3*(F109*9.81*F110*10^3)/(F111*3600)'); F('G112', '10^-3*(G109*9.81*G110*10^3)/(F111*3600)');
    row(113, 'Pump Speed', 'N', 'rpm'); V('F113', pu.speed);
    row(115, 'Impeller tip speed (Duty Point 2)', 'Ts', 'm/s'); F('F115', '(PI()*F97*10^-3)*(F113/60)'); F('G115', '(PI()*F97*10^-3)*(F113/60)');
    ['F97', 'E98', 'E99', 'F100', 'F101', 'F111', 'F113'].forEach(yel);

    sectionStyle(ws.getCell('B117'), 'NPSH DATA');
    row(118, 'Height above sea level', 'H', 'm'); V('F118', np.altitude);
    row(119, 'Barometric Pressure', 'Patm', 'mH2O'); F('F119', '101.325*(1-2.25577E-05*F118)^5.25588/9.81');
    row(120, 'Fluid service temperature', 'T', 'Celsius'); V('F120', np.temp);
    row(121, 'Vapour Pressure', 'Pv', 'mH2O'); F('F121', 'VLOOKUP(F120,Reference!$A$147:$D$208,4,TRUE)');
    row(122, 'NPSHa', 'NPSHa', 'mSlurry'); F('F122', 'F55+F119/F19-F121/F19'); F('G122', 'F122');
    row(123, 'NPSHa', 'NPSHa', 'eq mH20'); F('F123', '(F55*F19)+F119-F121'); F('G123', 'F123');
    row(124, 'NPSHr', 'NPSHr', 'm'); V('F124', np.npshr);
    row(125, 'NPSHa > NPSHr'); F('F125', 'IF(F124>0,IF(F123>F124,"true","false"),"Enter NPSHr above")');
    ['F118', 'F120', 'F124'].forEach(yel);

    sectionStyle(ws.getCell('B127'), 'POWER REQUIREMENTS');
    row(128, 'Pump Duty Point Power 1', 'P1', 'kW'); F('F128', 'F107'); F('G128', 'G107');
    row(129, 'Pump Duty Point Power 2', 'P2', 'kW'); F('F129', 'F112'); F('G129', 'G112');
    row(130, 'Drive Efficiency'); V('F130', pw.driveEff); V('G130', pw.driveEff);
    row(131, 'Incorporate Margin and Drive Efficiency (Higher of Duty Point 1 or Duty Point 2)', '', 'kW'); V('E131', pw.margin); F('F131', 'IF(F128>F129,F128*(1/F130)*(1+$E$131),F129*(1/F130)*(1+$E$131))'); F('G131', 'IFERROR(IF(G128>G129,G128*(1/G130)*(1+E131),G129*(1/G130)*(1+E131)),"")');
    row(132, 'Motor Selection', 'Ps', 'kW'); V('F132', pw.motorSize);
    row(133, '% Full Load'); F('F133', 'IFERROR(F131/F132,"")'); F('G133', 'IFERROR(G131/F132,"")');
    row(135, 'Conservative Power Check', 'Pc'); F('F135', 'F129*(F19/F17)'); F('G135', 'G129*(F19/F17)');
    row(136, 'Motor Power for Conservative Power (check above)', 'Pcs'); F('F136', 'F135*(1+$E$131)*(1/F130)'); F('G136', 'G135*(1+E131)*(1/G130)');
    ['F130', 'G130', 'E131', 'F132'].forEach(yel);

    applyResults(ws, o, pump); // cache computed values onto the live formulas

    // number formats for the F/G data columns
    for (let r = 11; r <= 136; r++) {
      ['F', 'G', 'K'].forEach(cl => { const c = ws.getCell(cl + r); if (c.type === ExcelJS.ValueType.Formula || typeof c.value === 'number') c.numFmt = '0.00'; });
    }
    ['F30', 'F60', 'F13', 'F14', 'F24'].forEach(c => ws.getCell(c).numFmt = '0.0');

    addValidationsAndCF(ws);
    // light styling: borders on label columns
    ws.views = [{ showGridLines: false }];
    return ws;
  }

  // Attach engine-computed values as the *cached result* of each live formula.
  // The cell stays a real, editable formula; Excel recalculates on edit/open,
  // but the value is visible immediately even in non-recalculating viewers.
  function applyResults(ws, o, pump) {
    const npshr = pump.npsh.npshr;
    const res = {
      G13: o.solidsD, G14: o.liquidD, F16: o.flowN, G16: o.flowD,
      F19: o.SM, F20: o.Cw, F21: o.Cv, F22: o.muL, F23: o.muM, G23: o.viscSource, F25: o.FL,
      F31: o.suc.ID, F33: o.suc.IDs, F34: o.suc.e, F35: o.suc.eD,
      F40: o.suc.k90, F41: o.suc.k45, F42: o.suc.kRun, F43: o.suc.kBranch,
      F49: o.suc.V, G49: o.suc.VD, F50: o.suc.Re, F51: o.suc.f, F52: o.suc.Hf,
      F53: o.suc.K, G53: o.suc.K, F54: o.suc.Hp, F55: o.suc.Hs,
      F61: o.dis.ID, F63: o.dis.IDs, F64: o.dis.e, F65: o.dis.eD,
      F70: o.dis.k90, F71: o.dis.k45, F72: o.dis.kRun, F73: o.dis.kBranch,
      F79: o.dis.V, F80: o.dis.FL, F81: o.dis.Vlim, F82: o.dis.ratio,
      F83: o.dis.Re, F84: o.dis.f, F85: o.dis.Hf, F86: o.dis.K, F87: o.dis.Hp, F88: o.dis.Hd,
      K84: o.settle.durand, K85: o.settle.wilson, K86: o.settle.thomas, K87: o.settle.wasp, K88: o.settle.sinclair,
      F98: o.HR, G98: o.HRsource, F99: o.HE, G99: o.HEsource,
      F104: o.Q1, F105: o.Hdyn, F106: o.etaS, F107: o.P1,
      F109: o.Q1, F110: o.Hw, F112: o.P2, F115: o.tipSpeed,
      F119: o.PatmM, F121: o.PvM, F122: o.NPSHa_slurry, G122: o.NPSHa_slurry,
      F123: o.NPSHa_water, G123: o.NPSHa_water,
      F125: (npshr > 0 ? (o.npshOK ? 'true' : 'false') : 'Enter NPSHr above'),
      F128: o.P1, F129: o.P2, F131: o.motorReq, F133: o.pctFL, F135: o.Pc, F136: o.Pcs
    };
    Object.keys(res).forEach(c => {
      const cur = ws.getCell(c).value;
      const v = res[c];
      if (cur && cur.formula && v != null && (typeof v === 'string' || isFinite(v))) {
        ws.getCell(c).value = { formula: cur.formula, result: v };
      }
    });
  }

  function buildLeg(ws, F, V, yel, row, side, p, base) {
    // base = 28 (suction) or 58 (discharge); offsets identical
    const suction = side === 'suction';
    const o = base; // material row
    row(o, 'Pipe Material'); V('F' + o, p.material);
    row(o + 1, 'Pipe Spec'); V('F' + (o + 1), p.spec);
    row(o + 2, 'Pipe Nominal Size', 'DN', 'mm'); V('F' + (o + 2), p.dn);
    const idR = o + 3, idsR = o + 5, eR = o + 6, eDR = o + 7;
    row(idR, 'Pipe size  ID', 'ID', 'mm');
    F('F' + idR, `IF(F${o}="Poly",VLOOKUP(F${o + 2},PolyBore,MATCH(F${o + 1},PolySpec,0),FALSE),VLOOKUP(F${o + 2},SteelBore,MATCH(F${o + 1},SteelSpec,0),FALSE))`);
    row(o + 4, 'Scale Thickness (decrease ID)', 'ts', 'mm'); V('F' + (o + 4), p.scale);
    row(idsR, 'Pipe size  ID (with scale)', 'IDs', 'mm'); F('F' + idsR, `F${idR}-2*F${o + 4}`);
    row(eR, 'Pipe roughness', 'e', 'mm'); F('F' + eR, `VLOOKUP(F${o + 1},Rough,3,FALSE)`);
    row(eDR, 'Relative Roughness', 'e/D'); F('F' + eDR, `F${eR}/F${idsR}`);
    row(o + 8, 'Pipe Length', 'L', 'm'); V('F' + (o + 8), p.length);
    const k1 = o + 9;
    row(k1, suction ? 'Inlet Coeff' : 'Discharge Coeff', 'K1'); V('F' + k1, p.k1);
    row(k1 + 1, suction ? 'Valve' : 'Outlet Valves', 'K2'); V('F' + (k1 + 1), p.k2);
    row(k1 + 2, 'Reducer', 'K3'); V('F' + (k1 + 2), p.k3);
    const bend = k1 + 3; // 90 bend row
    const sizeRef = 'F' + (o + 2);
    row(bend, '90 Bend', 'K4'); V('E' + bend, p.q90); F('F' + bend, `IF($E$${bend}=0,0,VLOOKUP(90,'Material Info'!$B$178:$AQ$181,MATCH(${sizeRef},'Material Info'!$B$177:$AQ$177),TRUE))`);
    row(bend + 1, '45 Bend', 'K5'); V('E' + (bend + 1), p.q45); F('F' + (bend + 1), `IF($E$${bend + 1}=0,0,VLOOKUP(45,'Material Info'!$B$178:$AQ$181,MATCH(${sizeRef},'Material Info'!$B$177:$AQ$177),TRUE))`);
    row(bend + 2, 'Run Tee', 'K6'); V('E' + (bend + 2), p.qRun); F('F' + (bend + 2), `IF($E$${bend + 2}=0,0,VLOOKUP("Run",'Material Info'!$B$178:$AQ$181,MATCH(${sizeRef},'Material Info'!$B$177:$AQ$177),TRUE))`);
    row(bend + 3, 'Branch Tee', 'K7'); V('E' + (bend + 3), p.qBranch); F('F' + (bend + 3), `IF($E$${bend + 3}=0,0,VLOOKUP("Branch",'Material Info'!$B$178:$AQ$181,MATCH(${sizeRef},'Material Info'!$B$177:$AQ$177),TRUE))`);
    row(bend + 4, 'Other', 'K8'); V('F' + (bend + 4), p.k8 || 0);
    if (suction) {
      row(bend + 5, 'Suction Static Head', 'Hss', 'mSlurry'); V('F' + (bend + 5), p.Hss);
      row(bend + 6, 'Suction Surface Pressure', 'Ps', 'kPa'); V('F' + (bend + 6), p.Ps);
    } else {
      row(bend + 5, 'Delivery Pressure Required (e.g. cyclone)', 'Pd', 'kPa'); V('F' + (bend + 5), p.Pd);
      row(bend + 6, 'Static Discharge Head', 'Hsd', 'mSlurry'); V('F' + (bend + 6), p.Hsd);
    }
    // yellow input cells
    [`F${o}`, `F${o + 1}`, `F${o + 2}`, `F${o + 4}`, `F${o + 8}`, `F${k1}`, `F${k1 + 1}`, `F${k1 + 2}`,
     `E${bend}`, `E${bend + 1}`, `E${bend + 2}`, `E${bend + 3}`, `F${bend + 4}`, `F${bend + 5}`, `F${bend + 6}`].forEach(yel);
  }

  function wilsonF() {
    // Wilson & Judge (verbatim structure from workbook, references F24,F61,F18,F22)
    return '(2+0.305*LOG10((F24*10^-6)/((F61*10^-3)*(4*9.81*(F24*10^-6)*(F18-1)/(3*(((F18-1)*9.81*(F24*10^-6)^2)/((18*F22*10^-6)+SQRT(0.75*1*(F18-1)*9.81)*(F24*10^-6)^(3/2)))^2))))+1.1*10^-4*((F24*10^-6)/((F61*10^-3)*(4*9.81*(F24*10^-6)*(F18-1)/(3*(((F18-1)*9.81*(F24*10^-6)^2)/((18*F22*10^-6)+SQRT(0.75*1*(F18-1)*9.81)*(F24*10^-6)^(3/2)))^2))))^-0.489-0.044*(1*10^7*(F24*10^-6)/((F61*10^-3)*(4*9.81*(F24*10^-6)*(F18-1)/(3*(((F18-1)*9.81*(F24*10^-6)^2)/((18*F22*10^-6)+SQRT(0.75*1*(F18-1)*9.81)*(F24*10^-6)^(3/2)))^2))))^-1.06)*(2*9.81*F61*10^-3*(F18-1))^0.5';
  }

  function addValidationsAndCF(ws) {
    const pink = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } };
    const dv = (cell, formulae) => { ws.getCell(cell).dataValidation = { type: 'list', allowBlank: false, formulae, showErrorMessage: true }; };
    dv('F28', ['Material']); dv('F58', ['Material']);
    dv('F29', ['INDIRECT(F28)']); dv('F59', ['INDIRECT(F58)']);
    dv('F30', ['IF(F28="POLY",PolySize,SteelSize)']); dv('F60', ['IF(F58="POLY",PolySize,SteelSize)']);
    ['E40', 'E41', 'E42', 'E43', 'E70', 'E71', 'E72', 'E73'].forEach(c =>
      ws.getCell(c).dataValidation = { type: 'list', allowBlank: true, formulae: ['"0,1,2,3,4,5,6,7,8,9,10"'] });
    // conditional formatting — invalid size/spec highlight
    const cf = (ref, formula) => ws.addConditionalFormatting({ ref, rules: [{ type: 'expression', formulae: [formula], style: { fill: pink } }] });
    cf('F29', 'ISERROR(MATCH(F29,INDIRECT(F28),0))=TRUE');
    cf('F59', 'ISERROR(MATCH(F59,INDIRECT(F58),0))=TRUE');
    cf('F30', 'ISERROR(MATCH(F30,IF(F28="POLY",PolySize,SteelSize),0))=TRUE');
    cf('F60', 'ISERROR(MATCH(F60,IF(F58="POLY",PolySize,SteelSize),0))=TRUE');
    // settling-velocity warning: method velocity below design velocity F79
    ws.addConditionalFormatting({ ref: 'K84:K88', rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['$F$79'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFEB9C' } } } }] });
    // low discharge velocity flag (ratio < 1.15)
    ws.addConditionalFormatting({ ref: 'F82', rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['1.15'], style: { fill: pink } }] });
  }

  // ---- improved Summary sheet ----------------------------------------------
  function buildSummary(wb, project) {
    const ws = wb.addWorksheet('Summary', { properties: { tabColor: { argb: RED } } });
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 7 }];
    ws.mergeCells('A1:M1'); titleStyle(ws.getCell('A1'), 'SLURRY PUMP SIZING — SUMMARY');
    label(ws.getCell('A2'), 'Project:'); ws.getCell('B2').value = project.name || '';
    label(ws.getCell('A4'), 'Client:'); ws.getCell('B4').value = project.client || '';
    label(ws.getCell('A3'), 'Document No:'); ws.getCell('B3').value = project.docNo || '';
    label(ws.getCell('A5'), 'Revision:'); ws.getCell('B5').value = project.rev || 'A';
    const cols = ['Pump Tag', 'Pump Name', 'Stream', 'Solids tph', 'Liquid tph', 'Slurry SG', 'Cv %v/v',
      'Flow m³/h', 'Suction DN', 'Suct V m/s', 'Disch DN', 'Disch V m/s', 'TDH m', 'Model',
      'Drawn kW', 'Motor kW', '% Load', 'NPSHa m'];
    const hr = 7;
    cols.forEach((h, i) => { const c = ws.getCell(hr, i + 1); sectionStyle(c, h); c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; c.border = border; });
    ws.getRow(hr).height = 30;
    project.pumps.forEach((p, i) => {
      const r = hr + 1 + i; const sh = `'${sanitize(p.tag || p.name)}'`;
      const o = ENGINE.compute(p);
      const set = (col, val) => { const c = ws.getCell(r, col); c.value = val; c.border = border; c.font = baseFont; };
      const fr = (col, formula, result) => set(col, (result != null && isFinite(result)) ? { formula, result } : { formula });
      set(1, p.tag || ''); set(2, p.name || ''); set(3, p.stream || '');
      set(4, p.slurry.solidsTPH); set(5, p.slurry.liquidTPH);
      fr(6, `${sh}!F19`, o.SM); fr(7, `${sh}!F21*100`, o.Cv * 100);
      fr(8, `${sh}!F16`, o.flowN); fr(9, `${sh}!F30`, p.suction.dn); fr(10, `${sh}!F49`, o.suc.V);
      fr(11, `${sh}!F60`, p.discharge.dn); fr(12, `${sh}!F79`, o.dis.V); fr(13, `${sh}!F105`, o.Hdyn);
      set(14, p.pump.model || ''); fr(15, `${sh}!F131`, o.motorReq); set(16, p.power.motorSize);
      fr(17, `${sh}!F133*100`, o.pctFL * 100); fr(18, `${sh}!F122`, o.NPSHa_slurry);
      [6, 7, 8, 10, 12, 13, 17, 18].forEach(cc => ws.getCell(r, cc).numFmt = '0.00');
    });
    [12, 22, 9, 11, 11, 9, 9, 10, 10, 10, 10, 10, 10, 14, 10, 10, 9, 10].forEach((w, i) => ws.getColumn(i + 1).width = w);
    return ws;
  }

  function sanitize(name) {
    let n = String(name || 'PUMP').replace(/[:\\/?*\[\]]/g, '-').slice(0, 31).trim();
    return n || 'PUMP';
  }

  async function exportWorkbook(project) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nexmin Pump Calc'; wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;
    buildSummary(wb, project);
    project.pumps.forEach(p => buildPumpSheet(wb, Object.assign({
      project: project.name, client: project.client, rev: project.rev
    }, p)));
    buildReference(wb);
    buildMaterialInfo(wb);
    addNames(wb);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (project.docNo || 'Slurry_Pump_Calculations') + '.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.EXPORTER = { exportWorkbook };
})();
