/* ============================================================================
 * app.js — UI controller for the Nexmin Slurry Pump Calc.
 * Tabs: Calculator · Summary · How it works · Reference tables · Settling velocity
 * ==========================================================================*/
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, html) => {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  };
  const fmt = (v, d = 2) => (v == null || !isFinite(v)) ? '—' :
    (Math.abs(v) >= 1e5 ? v.toExponential(2) : Number(v).toFixed(d));

  // -------- default pump ----------------------------------------------------
  let pumpSeq = 1;
  function defaultPump(tag) {
    return {
      tag: tag || ('PP' + String(pumpSeq).padStart(3, '0')), name: 'Slurry Pump', stream: '0100',
      slurry: { solidsTPH: 285, liquidTPH: 153, designFactor: 0.20, solidsSG: 2.81, liquorSG: 1, viscOverride: 30, d50: 55.2, frothFactor: 1 },
      suction: { material: 'Steel', spec: 'Std_Wt_6mm_RL', dn: 250, scale: 0, length: 2, k1: 1.5, k2: 0.3, k3: 0.1, q90: 1, q45: 0, qRun: 0, qBranch: 0, k8: 0, Hss: 0.5, Ps: 0 },
      discharge: { material: 'Poly', spec: 'PE100_PN10', dn: 280, scale: 0, length: 120, k1: 0.5, k2: 1, k3: 0.3, q90: 2, q45: 0, qRun: 0, qBranch: 0, k8: 0, Pd: 0, Hsd: 25 },
      pump: { make: '', model: '', frame: '', drive: '', seal: '', impellerType: '', impellerDia: 365, headRatioOverride: 0, effRatioOverride: 0, nSeries: 1, nParallel: 1, effWater: 0.70, speed: 1450 },
      npsh: { altitude: 100, temp: 20, npshr: 0 },
      power: { driveEff: 0.95, margin: 0.20, motorSize: 200 }
    };
  }

  // -------- state -----------------------------------------------------------
  let STATE = load() || { name: 'New Project', client: '', docNo: 'Slurry_Pump_Calcs', rev: 'A', pumps: [defaultPump()], active: 0 };
  if (STATE.pumps.length) pumpSeq = STATE.pumps.length + 1;
  function save() { try { localStorage.setItem('nexmin_pumpcalc', JSON.stringify(STATE)); } catch (e) {} }
  function load() { try { const s = localStorage.getItem('nexmin_pumpcalc'); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  const activePump = () => STATE.pumps[STATE.active];
  function getPath(o, p) { return p.split('.').reduce((a, k) => a && a[k], o); }
  function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); let t = o; ks.forEach(k => t = t[k]); t[last] = v; }

  // -------- calculator schema ----------------------------------------------
  const INPUTS = [
    { title: 'Identification', fields: [
      { p: 'tag', l: 'Pump Tag', t: 'text' }, { p: 'name', l: 'Pump Name', t: 'text' }, { p: 'stream', l: 'Stream No', t: 'text' } ] },
    { title: 'Slurry Details', fields: [
      { p: 'slurry.solidsTPH', l: 'Solids mass flow', u: 'tph' },
      { p: 'slurry.liquidTPH', l: 'Liquid mass flow', u: 'tph' },
      { p: 'slurry.designFactor', l: 'Design factor', u: 'frac', step: 0.05 },
      { p: 'slurry.solidsSG', l: 'Solids s.g.', u: '' },
      { p: 'slurry.liquorSG', l: 'Liquor s.g.', u: '' },
      { p: 'slurry.viscOverride', l: 'Slurry viscosity override (0=auto)', u: 'cP' },
      { p: 'slurry.d50', l: 'Particle size d50', u: 'µm' },
      { p: 'slurry.frothFactor', l: 'Froth volume factor', u: '' } ] },
    { title: 'Suction Pipe', leg: 'suction', fields: legFields('suction') },
    { title: 'Discharge Pipe', leg: 'discharge', fields: legFields('discharge') },
    { title: 'Pump / Duty Points', fields: [
      { p: 'pump.make', l: 'Make', t: 'text' }, { p: 'pump.model', l: 'Model', t: 'text' },
      { p: 'pump.impellerDia', l: 'Impeller diameter', u: 'mm' },
      { p: 'pump.headRatioOverride', l: 'Head ratio override (0=auto)', u: '' },
      { p: 'pump.effRatioOverride', l: 'Efficiency ratio override (0=auto)', u: '' },
      { p: 'pump.nSeries', l: 'Pumps in series', u: '' },
      { p: 'pump.nParallel', l: 'Pumps in parallel', u: '' },
      { p: 'pump.effWater', l: 'Water efficiency ηw (duty pt 2)', u: 'frac' },
      { p: 'pump.speed', l: 'Pump speed N', u: 'rpm' } ] },
    { title: 'NPSH', fields: [
      { p: 'npsh.altitude', l: 'Height above sea level', u: 'm' },
      { p: 'npsh.temp', l: 'Service temperature', u: '°C' },
      { p: 'npsh.npshr', l: 'NPSHr (from pump curve)', u: 'm' } ] },
    { title: 'Power', fields: [
      { p: 'power.driveEff', l: 'Drive efficiency', u: 'frac' },
      { p: 'power.margin', l: 'Power draw margin', u: 'frac', step: 0.05 },
      { p: 'power.motorSize', l: 'Selected motor size', u: 'kW' } ] }
  ];
  function legFields(leg) {
    return [
      { p: leg + '.material', l: 'Pipe material', t: 'mat', leg },
      { p: leg + '.spec', l: 'Pipe spec', t: 'spec', leg },
      { p: leg + '.dn', l: 'Nominal size DN', t: 'dn', leg },
      { p: leg + '.scale', l: 'Scale thickness', u: 'mm' },
      { p: leg + '.length', l: 'Pipe length', u: 'm' },
      { p: leg + '.k1', l: leg === 'suction' ? 'Inlet coeff K1' : 'Discharge coeff K1', u: '' },
      { p: leg + '.k2', l: leg === 'suction' ? 'Valve K2' : 'Outlet valves K2', u: '' },
      { p: leg + '.k3', l: 'Reducer K3', u: '' },
      { p: leg + '.q90', l: '90° bends (qty)', u: '#' },
      { p: leg + '.q45', l: '45° bends (qty)', u: '#' },
      { p: leg + '.qRun', l: 'Run tees (qty)', u: '#' },
      { p: leg + '.qBranch', l: 'Branch tees (qty)', u: '#' },
      { p: leg + '.k8', l: 'Other K8', u: '' },
      leg === 'suction'
        ? { p: 'suction.Hss', l: 'Suction static head', u: 'm' }
        : { p: 'discharge.Hsd', l: 'Static discharge head', u: 'm' },
      leg === 'suction'
        ? { p: 'suction.Ps', l: 'Suction surface pressure', u: 'kPa' }
        : { p: 'discharge.Pd', l: 'Delivery pressure (e.g. cyclone)', u: 'kPa' }
    ];
  }

  // -------- output schema ---------------------------------------------------
  const OUTPUTS = [
    { title: 'Slurry', rows: [
      ['flow', 'Flowrate Q', o => o.flowN, 'm³/hr', 'Q'],
      ['SM', 'Mixture s.g.', o => o.SM, '', 'Sm'],
      ['Cw', 'Conc. by weight', o => o.Cw * 100, '%', 'Cw'],
      ['Cv', 'Conc. by volume', o => o.Cv * 100, '%', 'Cv'],
      ['muL', 'Liquor viscosity', o => o.muL, 'cP', 'µl'],
      ['muM', 'Slurry viscosity', o => o.muM, 'cP', 'µm'],
      ['FL', 'Durand factor', o => o.FL, '', 'FL'] ] },
    { title: 'Suction Pipe Output', rows: [
      ['ID', 'Pipe ID', o => o.suc.ID, 'mm', 'ID'],
      ['IDs', 'ID with scale', o => o.suc.IDs, 'mm', 'IDs'],
      ['eD', 'Relative roughness', o => o.suc.eD, '', 'e/D'],
      ['V', 'Velocity', o => o.suc.V, 'm/s', 'V'],
      ['Re', 'Reynolds number', o => o.suc.Re, '', 'Re'],
      ['f', 'Friction factor', o => o.suc.f, '', 'f'],
      ['Hf', 'Friction head loss', o => o.suc.Hf, 'm', 'Hf'],
      ['Hp', 'Fitting losses', o => o.suc.Hp, 'm', 'Hp'],
      ['Hs', 'Suction head', o => o.suc.Hs, 'm', 'Hs'] ] },
    { title: 'Discharge Pipe Output', rows: [
      ['ID', 'Pipe ID', o => o.dis.ID, 'mm', 'ID'],
      ['V', 'Velocity', o => o.dis.V, 'm/s', 'V'],
      ['Vlim', 'Limiting velocity', o => o.dis.Vlim, 'm/s', 'Vlim'],
      ['ratio', 'V / Vlim', o => o.dis.ratio, 'xVL', '', o => pillRatio(o.dis.ratio)],
      ['Hf', 'Friction head loss', o => o.dis.Hf, 'm', 'Hf'],
      ['Hp', 'Fitting losses', o => o.dis.Hp, 'm', 'Hp'],
      ['Hd', 'Discharge head', o => o.dis.Hd, 'm', 'Hd'] ] },
    { title: 'Duty Points & Power', rows: [
      ['HR', 'Head ratio', o => o.HR, '', 'HR'],
      ['HE', 'Efficiency ratio', o => o.HE, '', 'HE'],
      ['Hdyn', 'Total dynamic head (slurry)', o => o.Hdyn, 'm', 'Hdyn'],
      ['Hw', 'Equivalent water head', o => o.Hw, 'm', 'Hw'],
      ['etaS', 'Slurry efficiency', o => o.etaS * 100, '%', 'ηs'],
      ['P1', 'Power duty point 1', o => o.P1, 'kW', 'P1'],
      ['P2', 'Power duty point 2', o => o.P2, 'kW', 'P2'],
      ['tipSpeed', 'Impeller tip speed', o => o.tipSpeed, 'm/s', 'Ts'],
      ['motorReq', 'Motor power required', o => o.motorReq, 'kW', ''],
      ['pctFL', '% full load', o => o.pctFL * 100, '%', '', o => pillFL(o.pctFL)] ] },
    { title: 'NPSH', rows: [
      ['PatmM', 'Barometric pressure', o => o.PatmM, 'mH₂O', 'Patm'],
      ['PvM', 'Vapour pressure', o => o.PvM, 'mH₂O', 'Pv'],
      ['NPSHa', 'NPSHa (slurry)', o => o.NPSHa_slurry, 'm', ''],
      ['NPSHa', 'NPSHa (eq. water)', o => o.NPSHa_water, 'm', '', o => pillNPSH(o)] ] }
  ];
  function pillRatio(r) { if (!isFinite(r)) return null; return r >= 1.15 ? { cls: 'ok', t: 'OK' } : r >= 1 ? { cls: 'warn', t: 'low' } : { cls: 'bad', t: 'settling' }; }
  function pillFL(f) { if (!isFinite(f)) return null; const p = f * 100; return p <= 100 ? { cls: 'ok', t: 'OK' } : { cls: 'bad', t: 'over' }; }
  function pillNPSH(o) { if (o.npshOK == null) return { cls: 'warn', t: 'enter NPSHr' }; return o.npshOK ? { cls: 'ok', t: 'OK' } : { cls: 'bad', t: 'cavitation' }; }

  // -------- render: calculator ---------------------------------------------
  function renderCalc() {
    const root = $('#view'); root.innerHTML = '';
    const p = activePump();
    root.appendChild(pumpBar());

    const o = ENGINE.compute(p);
    root.appendChild(kpis(o));

    const grid = el('div', { class: 'grid' });
    // inputs card
    const inCard = el('div', { class: 'card' });
    inCard.appendChild(el('h2', {}, '<span class="accent"></span> Inputs'));
    const inBody = el('div', { class: 'body' });
    INPUTS.forEach(sec => {
      inBody.appendChild(el('div', { class: 'section-title' }, sec.title));
      sec.fields.forEach(f => inBody.appendChild(inputRow(f, p)));
    });
    inCard.appendChild(inBody);

    // outputs card
    const outCard = el('div', { class: 'card' });
    outCard.appendChild(el('h2', {}, '<span class="accent"></span> Calculated Results'));
    const outBody = el('div', { class: 'body' });
    OUTPUTS.forEach(sec => {
      outBody.appendChild(el('div', { class: 'section-title' }, sec.title));
      sec.rows.forEach(r => outBody.appendChild(outputRow(r, o)));
    });
    outCard.appendChild(outBody);

    grid.appendChild(inCard); grid.appendChild(outCard);
    root.appendChild(grid);
  }

  function inputRow(f, p) {
    const r = el('div', { class: 'row' });
    r.appendChild(el('label', {}, f.l));
    let inp;
    if (f.t === 'text') {
      inp = el('input', { type: 'text', value: getPath(p, f.p) ?? '' });
      inp.addEventListener('input', () => { setPath(p, f.p, inp.value); commit(false); });
    } else if (f.t === 'mat') {
      inp = el('select');
      REFDATA.materials.forEach(m => inp.appendChild(el('option', { value: m, selected: getPath(p, f.p) === m ? '' : null }, m)));
      inp.addEventListener('change', () => {
        setPath(p, f.p, inp.value);
        // reset spec & dn to first valid for the material
        const specs = specsFor(inp.value); setPath(p, f.leg + '.spec', specs[0]);
        const sizes = sizesFor(inp.value); if (!sizes.includes(getPath(p, f.leg + '.dn'))) setPath(p, f.leg + '.dn', sizes[Math.min(8, sizes.length - 1)]);
        commit(true);
      });
    } else if (f.t === 'spec') {
      inp = el('select');
      specsFor(getPath(p, f.leg + '.material')).forEach(sp => inp.appendChild(el('option', { value: sp, selected: getPath(p, f.p) === sp ? '' : null }, sp)));
      inp.addEventListener('change', () => { setPath(p, f.p, inp.value); commit(false); });
    } else if (f.t === 'dn') {
      inp = el('select');
      sizesFor(getPath(p, f.leg + '.material')).forEach(sz => inp.appendChild(el('option', { value: sz, selected: getPath(p, f.p) === sz ? '' : null }, sz)));
      inp.addEventListener('change', () => { setPath(p, f.p, Number(inp.value)); commit(false); });
    } else {
      inp = el('input', { type: 'number', step: f.step || 'any', value: getPath(p, f.p) });
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); setPath(p, f.p, isNaN(v) ? 0 : v); commit(false); });
    }
    r.appendChild(inp);
    r.appendChild(el('span', { class: 'unit' }, unitLabel(f.u)));
    return r;
  }
  function unitLabel(u) { return u === 'frac' ? 'frac' : (u || ''); }
  function specsFor(mat) { return (mat === 'Poly' ? REFDATA.polySpecs : REFDATA.steelSpecs).map(s => s.spec); }
  function sizesFor(mat) { return mat === 'Poly' ? REFDATA.polySizes.slice() : REFDATA.steelSizes.slice(); }

  function outputRow(r, o) {
    const [key, label, getter, unit, sym, pillFn] = r;
    const row = el('div', { class: 'orow' });
    row.appendChild(el('div', { class: 'olabel' }, label + (sym ? ` <span class="sym">${sym}</span>` : '')));
    let val = '—'; try { val = fmt(getter(o), unit === '' && key === 'ratio' ? 2 : decimals(key, unit)); } catch (e) {}
    const valCell = el('div', { class: 'oval' }, val);
    if (pillFn) { const pl = pillFn(o); if (pl) valCell.innerHTML = val + ` <span class="pill ${pl.cls}">${pl.t}</span>`; }
    row.appendChild(valCell);
    row.appendChild(el('div', { class: 'ounit' }, unit));
    const info = el('button', { class: 'info', title: 'How this is calculated' }, 'i');
    info.addEventListener('click', () => openDoc(key));
    row.appendChild(info);
    return row;
  }
  function decimals(key, unit) {
    if (['Re'].includes(key)) return 0;
    if (['ID', 'IDs', 'flow'].includes(key)) return 1;
    if (['f', 'eD'].includes(key)) return 4;
    if (unit === '%' || unit === 'kW') return 1;
    return 2;
  }

  function kpis(o) {
    const wrap = el('div', { class: 'kpi' });
    const box = (k, v, s) => { const b = el('div', { class: 'box' }); b.appendChild(el('div', { class: 'k' }, k)); b.appendChild(el('div', { class: 'v' }, v + (s ? ` <small>${s}</small>` : ''))); return b; };
    wrap.appendChild(box('Flowrate', fmt(o.flowN, 1), 'm³/h'));
    wrap.appendChild(box('Total Dyn. Head', fmt(o.Hdyn, 1), 'm'));
    wrap.appendChild(box('Disch. velocity', fmt(o.dis.V, 2), 'm/s'));
    wrap.appendChild(box('Motor required', fmt(o.motorReq, 1), 'kW'));
    wrap.appendChild(box('NPSHa', fmt(o.NPSHa_water, 2), 'm'));
    return wrap;
  }

  function pumpBar() {
    const bar = el('div', { class: 'pumpbar' });
    STATE.pumps.forEach((p, i) => {
      const chip = el('div', { class: 'pumpchip' + (i === STATE.active ? ' active' : '') });
      chip.addEventListener('click', () => { STATE.active = i; commit(true); });
      chip.appendChild(el('span', { class: 'tag' }, p.tag));
      chip.appendChild(el('span', { class: 'nm' }, p.name || ''));
      if (STATE.pumps.length > 1) {
        const x = el('button', { class: 'x', title: 'Remove pump' }, '×');
        x.addEventListener('click', (e) => { e.stopPropagation(); STATE.pumps.splice(i, 1); STATE.active = Math.max(0, STATE.active - (i <= STATE.active ? 1 : 0)); commit(true); });
        chip.appendChild(x);
      }
      bar.appendChild(chip);
    });
    const add = el('button', { class: 'btn btn-grey' }, '+ Add pump');
    add.addEventListener('click', addPump);
    bar.appendChild(add);
    return bar;
  }
  function addPump() {
    const tag = prompt('New pump tag:', 'PP' + String(pumpSeq).padStart(3, '0'));
    if (tag == null) return;
    if (STATE.pumps.some(p => p.tag === tag)) { alert('A pump with that tag already exists.'); return; }
    pumpSeq++;
    const np = defaultPump(tag); np.name = 'Slurry Pump';
    STATE.pumps.push(np); STATE.active = STATE.pumps.length - 1; commit(true);
  }

  // -------- doc popover -----------------------------------------------------
  function openDoc(key) {
    const d = META.DOC[key]; if (!d) return;
    const back = el('div', { class: 'pop-backdrop' });
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    const pop = el('div', { class: 'pop' });
    const head = el('header', {}); head.appendChild(el('h3', {}, d.title));
    const cl = el('button', { class: 'pclose' }, '×'); cl.addEventListener('click', () => back.remove()); head.appendChild(cl);
    pop.appendChild(head);
    const body = el('div', { class: 'pbody' });
    body.appendChild(el('p', {}, d.what));
    body.appendChild(el('div', { class: 'formula' }, d.formula));
    if (d.refs && d.refs.length) {
      const refs = el('div', { class: 'refs' });
      refs.appendChild(el('div', { class: 'olabel', style: 'font-weight:700;margin-bottom:4px' }, 'References'));
      d.refs.forEach(id => { const R = META.REFERENCES[id]; if (R) refs.appendChild(el('div', { class: 'ref' }, `<span class="reftag">${R.tag}</span>${R.cite}`)); });
      body.appendChild(refs);
    }
    pop.appendChild(body); back.appendChild(pop); document.body.appendChild(back);
  }

  // -------- render: summary -------------------------------------------------
  function renderSummary() {
    const root = $('#view'); root.innerHTML = '';
    root.appendChild(el('h1', { class: 'page' }, 'Project Summary'));
    root.appendChild(el('p', { class: 'sub' }, 'Live roll-up across all pumps in this project. Export to Excel reproduces every pump as a Calc_Template-style sheet.'));
    const cols = ['Tag', 'Name', 'Stream', 'Solids tph', 'Liquid tph', 'Slurry SG', 'Cv %', 'Flow m³/h', 'Suct DN', 'Suct V', 'Disch DN', 'Disch V', 'TDH m', 'Model', 'Drawn kW', 'Motor kW', '% Load', 'NPSHa m'];
    const wrap = el('div', { class: 'tablewrap' });
    const t = el('table', { class: 'ref zebra' });
    const thead = el('thead'); const htr = el('tr'); cols.forEach(c => htr.appendChild(el('th', {}, c))); thead.appendChild(htr); t.appendChild(thead);
    const tb = el('tbody');
    STATE.pumps.forEach((p, i) => {
      const o = ENGINE.compute(p);
      const tr = el('tr', { style: 'cursor:pointer' });
      tr.addEventListener('click', () => { STATE.active = i; switchTab('calc'); });
      const cells = [p.tag, p.name, p.stream, fmt(p.slurry.solidsTPH, 0), fmt(p.slurry.liquidTPH, 0),
        fmt(o.SM, 2), fmt(o.Cv * 100, 1), fmt(o.flowN, 1), o.suc.IDs ? p.suction.dn : '—', fmt(o.suc.V, 2),
        p.discharge.dn, fmt(o.dis.V, 2), fmt(o.Hdyn, 1), p.pump.model || '—',
        fmt(o.motorReq, 1), fmt(p.power.motorSize, 0), fmt(o.pctFL * 100, 0), fmt(o.NPSHa_water, 2)];
      cells.forEach(c => tr.appendChild(el('td', {}, String(c))));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); root.appendChild(wrap);
    root.appendChild(el('p', { class: 'hint' }, 'Tip: click any row to open that pump in the Calculator.'));
  }

  // -------- render: how it works -------------------------------------------
  function renderDocs() {
    const root = $('#view'); root.innerHTML = '';
    root.appendChild(el('h1', { class: 'page' }, 'How it works — the guts'));
    root.appendChild(el('p', { class: 'sub' }, 'Every calculated row in this tool, the exact formula behind it, and where it comes from. This mirrors the engine in the original Calc_Template sheet (custom Excel functions re-expressed in plain maths).'));
    root.appendChild(el('div', { class: 'note' }, 'Velocity guidance: slurry pipelines are typically run at 1.5–2.0 m/s and at least 15% above the limiting (settling) velocity. The Durand method built into the discharge calc is conservative; see the Settling Velocity tab for alternatives when fines dominate.'));
    Object.keys(META.DOC).forEach(key => {
      const d = META.DOC[key];
      const c = el('div', { class: 'doc-card' });
      c.appendChild(el('h3', {}, d.title));
      c.appendChild(el('div', { class: 'meta' }, d.unit ? ('Units: ' + d.unit) : ''));
      c.appendChild(el('p', {}, d.what));
      c.appendChild(el('div', { class: 'formula' }, d.formula));
      if (d.refs && d.refs.length) {
        const refs = el('div', { class: 'refs' });
        d.refs.forEach(id => { const R = META.REFERENCES[id]; if (R) refs.appendChild(el('div', { class: 'ref' }, `<span class="reftag">${R.tag}</span>${R.cite}`)); });
        c.appendChild(refs);
      }
      root.appendChild(c);
    });
    const bib = el('div', { class: 'doc-card' });
    bib.appendChild(el('h3', {}, 'Bibliography'));
    const ul = el('ul', { class: 'bib' });
    Object.values(META.REFERENCES).forEach(R => ul.appendChild(el('li', {}, `<span class="reftag">${R.tag}</span>${R.cite}`)));
    bib.appendChild(ul); root.appendChild(bib);
  }

  // -------- render: reference tables ---------------------------------------
  function renderRef() {
    const root = $('#view'); root.innerHTML = '';
    root.appendChild(el('h1', { class: 'page' }, 'Reference Tables'));
    root.appendChild(el('p', { class: 'sub' }, 'The validation lists and lookup tables used throughout the calc — exactly as embedded in the workbook.'));

    section('Pipe Roughness (mm)', () => {
      const t = tbl(['Material / lining', 'Absolute roughness e (mm)']);
      REFDATA.roughnessNamed.forEach(p => addRow(t, [p[0], p[1]]));
      return t;
    });
    section('Steel Pipe Bore — internal diameter (mm)', () => {
      const t = tbl(['Nom DN'].concat(REFDATA.steelHeader));
      REFDATA.steelSizes.forEach((sz, i) => addRow(t, [sz].concat(REFDATA.steelHeader.map(h => REFDATA.steelBore[h][i] || '—'))));
      return t;
    });
    section('Poly (HDPE) Pipe Bore — internal diameter (mm)', () => {
      const specs = REFDATA.polySpecs.map(s => s.spec);
      const t = tbl(['Nom DN'].concat(specs));
      REFDATA.polySizes.forEach((sz, i) => addRow(t, [sz].concat(specs.map(sp => (REFDATA.polyBore[sp] && REFDATA.polyBore[sp][i]) || '—'))));
      return t;
    });
    section('Fitting K-factors (by nominal size)', () => {
      const t = tbl(['Fitting'].concat(REFDATA.kSizes));
      ['90', '45', 'Run', 'Branch'].forEach(nm => addRow(t, [nm + (nm === 'Run' || nm === 'Branch' ? ' tee' : '° bend')].concat(REFDATA.kBends[nm])));
      return t;
    });
    section('Physical Properties of Water — Streeter & Wylie (1983)', () => {
      const t = tbl(['Temp °C', 'Density kg/m³', 'Dynamic visc. cP', 'Vapour pressure kPa']);
      REFDATA.water.forEach(w => addRow(t, [w.T, w.rho, w.mu, w.pv]));
      return t;
    });
    section('Absolute Vapour Pressure of Water', () => {
      const t = tbl(['Temp °C', 'Vapour press. kPa', 'm water']);
      REFDATA.vapour.forEach(v => addRow(t, [v.T, fmt(v.kPa, 3), fmt(v.m, 4)]));
      return t;
    });

    function section(title, build) {
      root.appendChild(el('div', { class: 'section-title', style: 'margin-top:22px' }, title));
      const wrap = el('div', { class: 'tablewrap' }); wrap.appendChild(build()); root.appendChild(wrap);
    }
    function tbl(headers) { const t = el('table', { class: 'ref' }); const tr = el('tr'); headers.forEach(h => tr.appendChild(el('th', {}, String(h)))); const th = el('thead'); th.appendChild(tr); t.appendChild(th); t.appendChild(el('tbody')); return t; }
    function addRow(t, cells) { const tr = el('tr'); cells.forEach(c => tr.appendChild(el('td', {}, c == null ? '—' : String(c)))); t.querySelector('tbody').appendChild(tr); }
  }

  // -------- render: settling velocity --------------------------------------
  function renderSettle() {
    const root = $('#view'); root.innerHTML = '';
    const p = activePump(); const o = ENGINE.compute(p); const s = o.settle;
    root.appendChild(el('h1', { class: 'page' }, 'Settling Velocity Comparison'));
    root.appendChild(el('p', { class: 'sub' }, `For the active pump <b>${p.tag}</b> (discharge DN ${p.discharge.dn}, d50 ${p.slurry.d50} µm, Cv ${fmt(o.Cv * 100, 1)} %). The Durand method is built into the duty calc; the others are provided for comparison where it is too conservative (e.g. fines present).`));
    const designV = o.dis.V;
    root.appendChild(el('div', { class: 'kpi' }, ''));
    const methods = [
      ['Durand & Condolios (1952)', s.durand, 'durand', 'Standard method (Warman). Closely-graded particles, 2% < Cv < 15%. Conservative for mixed sizes.'],
      ['Wilson', s.wilson, 'wilson', 'Large pipes/particles near "Murphian" size. Gives the maximum limiting velocity (worst case). Conservative.'],
      ['Thomas', s.thomas, 'thomas', 'For particles < 0.15 mm. Turbulent flow, minimum settling velocity — indicates behaviour of fines.'],
      ['Wasp', s.wasp, 'wasp', 'Improved Durand for dilute concentrations; accounts for fines flowing over a moving bed of coarse solids.'],
      ['Sinclair', s.sinclair, 'sinclair', 'For d85/ID < 0.001 or particle diameter 30–2000 µm.']
    ];
    const wrap = el('div', { class: 'tablewrap' });
    const t = el('table', { class: 'ref zebra' });
    const th = el('thead'); const htr = el('tr'); ['Method', 'Settling velocity (m/s)', 'Design V (m/s)', 'Status', ''].forEach(h => htr.appendChild(el('th', {}, h))); th.appendChild(htr); t.appendChild(th);
    const tb = el('tbody');
    methods.forEach(m => {
      const tr = el('tr');
      tr.appendChild(el('td', {}, m[0]));
      tr.appendChild(el('td', {}, fmt(m[1], 2)));
      tr.appendChild(el('td', {}, fmt(designV, 2)));
      const ok = designV >= m[1];
      const td = el('td', {}); td.innerHTML = `<span class="pill ${ok ? 'ok' : 'bad'}">${ok ? 'above settling' : 'below settling'}</span>`; tr.appendChild(td);
      const info = el('td', { style: 'text-align:left;white-space:normal;max-width:380px;color:#555' }, m[3]); tr.appendChild(info);
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); root.appendChild(wrap);
    root.appendChild(el('div', { class: 'note' }, 'Why Durand is conservative: its correlation was developed on a narrow band of particle sizes. Real slurries contain a range — fines are incorporated into the carrier fluid, raising its viscosity and buoyancy so coarse particles are transported more readily. Thomas, Wasp and Sinclair account for this and give lower settling velocities.'));
  }

  // -------- tabs ------------------------------------------------------------
  const TABS = { calc: renderCalc, summary: renderSummary, docs: renderDocs, ref: renderRef, settle: renderSettle };
  let current = 'calc';
  function switchTab(t) { current = t; document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === t)); TABS[t](); }
  function commit(rerender) { save(); if (rerender) TABS[current](); else { /* live recalc without losing focus: only refresh outputs+kpi */ refreshOutputs(); } }
  function refreshOutputs() {
    if (current !== 'calc') { TABS[current](); return; }
    const o = ENGINE.compute(activePump());
    // re-render kpi + outputs in place
    const view = $('#view');
    const kpi = view.querySelector('.kpi'); if (kpi) kpi.replaceWith(kpis(o));
    const cards = view.querySelectorAll('.card');
    if (cards[1]) {
      const outBody = cards[1].querySelector('.body'); outBody.innerHTML = '';
      OUTPUTS.forEach(sec => { outBody.appendChild(el('div', { class: 'section-title' }, sec.title)); sec.rows.forEach(r => outBody.appendChild(outputRow(r, o))); });
    }
  }

  // -------- header wiring ---------------------------------------------------
  function initHeader() {
    $('#projName').value = STATE.name; $('#projClient').value = STATE.client; $('#projDoc').value = STATE.docNo; $('#projRev').value = STATE.rev;
    $('#projName').addEventListener('input', e => { STATE.name = e.target.value; save(); });
    $('#projClient').addEventListener('input', e => { STATE.client = e.target.value; save(); });
    $('#projDoc').addEventListener('input', e => { STATE.docNo = e.target.value; save(); });
    $('#projRev').addEventListener('input', e => { STATE.rev = e.target.value; save(); });
    document.querySelectorAll('.tab').forEach(tb => tb.addEventListener('click', () => switchTab(tb.dataset.tab)));
    $('#exportBtn').addEventListener('click', async () => {
      const btn = $('#exportBtn'); const old = btn.textContent; btn.textContent = 'Building…'; btn.disabled = true;
      try { await EXPORTER.exportWorkbook(STATE); } catch (e) { console.error(e); alert('Export failed: ' + e.message); }
      btn.textContent = old; btn.disabled = false;
    });
    $('#resetBtn').addEventListener('click', () => { if (confirm('Reset to a fresh project? This clears saved data.')) { localStorage.removeItem('nexmin_pumpcalc'); location.reload(); } });
  }

  document.addEventListener('DOMContentLoaded', () => { initHeader(); switchTab('calc'); });
})();
