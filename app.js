(function () {
  const C = window.Core;
  const KEY = 'refloop_v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let state, tab = 'dashboard', ui = { sel: '', angle: 'placement', studentCode: '', result: null, errors: {}, importMsg: null, filter: '', status: 'all' };

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.sources && s.regs) return s; } } catch (e) { /* storage unavailable: fall through */ }
    return C.demo(7);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  state = load();

  const baseUrl = () => location.href.split('#')[0].split('?')[0];
  const link = code => baseUrl() + '?ref=' + code;
  const pct = x => Math.round(x * 100) + '%';
  const TABS = [['dashboard', 'Dashboard'], ['sources', 'Ambassadors & share kit'], ['student', 'Student view'], ['regs', 'Registrations & quality'], ['planner', 'Funnel planner'], ['about', 'About & test checklist']];

  function renderNav() {
    document.getElementById('nav').innerHTML = TABS.map(t => `<button class="${tab === t[0] ? 'on' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('');
    document.getElementById('nav').querySelectorAll('button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
    const sel = document.getElementById('daySel');
    sel.innerHTML = [1, 2, 3, 4, 5, 6, 7].map(d => `<option value="${d}" ${d === state.day ? 'selected' : ''}>Day ${d}</option>`).join('');
    sel.onchange = () => { state.day = +sel.value; save(); render(); };
    document.getElementById('simBadge').style.display = state.simulated ? '' : 'none';
  }

  /* ---------- Dashboard ---------- */
  function chart(st) {
    const W = 560, H = 190, pad = 30, bw = 34;
    const max = 520, x = i => pad + 20 + i * ((W - pad * 2 - 20) / 7), y = v => H - 24 - (v / max) * (H - 44);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cumulative valid registrations versus target curve">`;
    [0, 250, 500].forEach(v => s += `<line x1="${pad}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" stroke="#2a3550"/><text x="2" y="${y(v) + 4}" fill="#93a0ba" font-size="10">${v}</text>`);
    st.cum.forEach((v, i) => {
      if (v !== null) s += `<rect x="${x(i)}" y="${y(v)}" width="${bw}" height="${H - 24 - y(v)}" fill="#5b8cff" rx="3"/><text x="${x(i) + bw / 2}" y="${y(v) - 4}" fill="#e8edf7" font-size="10" text-anchor="middle">${v}</text>`;
      s += `<text x="${x(i) + bw / 2}" y="${H - 8}" fill="#93a0ba" font-size="10" text-anchor="middle">D${i + 1}</text>`;
    });
    s += `<polyline fill="none" stroke="#f5b942" stroke-width="2" stroke-dasharray="5 4" points="${C.CURVE.slice(1).map((v, i) => (x(i) + bw / 2) + ',' + y(v)).join(' ')}"/>`;
    return s + `</svg><div class="note">Bars: cumulative <b>valid unique</b> registrations. Dashed line: planned curve to 500 (hypothesis).</div>`;
  }
  function dashboard() {
    const d = C.decide(state, state.day), st = d.st, t = st.total;
    const spend = C.adSpend(state.day);
    const people = st.rows.filter(p => p.src.type === 'ambassador' || p.src.type === 'community').sort((a, b) => b.valid - a.valid || b.conv - a.conv);
    const tags = p => {
      if (state.day >= 2 && p.clicks === 0 && p.src.joinedDay < state.day) return '<span class="tag red">dormant</span>';
      if (p.clicks >= 30 && p.conv < .15) return '<span class="tag amber">leaky</span>';
      if (p.subs >= 5 && p.quality < .7) return '<span class="tag amber">low quality</span>';
      if (d.stars.includes(p)) return '<span class="tag green">star</span>';
      return '<span class="tag gray">ok</span>';
    };
    return `
    <div class="grid g4">
      <div class="card kpi"><h3>Valid unique registrations</h3><div class="v">${t.valid}<span style="font-size:15px;color:var(--mute)"> / ${C.TARGET}</span></div><div class="bar"><i style="width:${Math.min(100, t.valid / C.TARGET * 100)}%"></i></div></div>
      <div class="card kpi"><h3>Pace vs day-${state.day} target</h3><div class="v">${pct(d.ratio)} <span class="tag ${d.level}">${d.level}</span></div><div class="s">${t.valid} actual vs ${d.target} planned</div></div>
      <div class="card kpi"><h3>Quality (valid / submitted)</h3><div class="v">${t.subs ? pct(t.valid / t.subs) : '-'}</div><div class="s">${t.subs} submitted: ${t.dup} duplicate, ${t.invalid} invalid</div></div>
      <div class="card kpi"><h3>Projected attendance</h3><div class="v">~${Math.round(t.valid * C.ATTEND_RATE)}</div><div class="s">assumes ${pct(C.ATTEND_RATE)} show-up (unverified assumption)</div></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>Registrations vs plan</h3>${chart(st)}<div class="note">Paid spend so far: ₹${spend} of ₹600 test budget${t.valid ? ' · blended cost per valid registration: ₹' + (spend / t.valid).toFixed(1) : ''}. Run-rate projection: ~${d.projected} by day 7 (naive).</div></div>
      <div class="card"><h3>What to do today (decision engine)</h3>${d.actions.map(a => `<div class="act ${a.level}"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:14px"><h3>Leaderboard: ambassadors &amp; community admins (ranked by valid unique registrations)</h3>
      <div class="scroll"><table><tr><th>#</th><th>Name</th><th>Code</th><th>Type</th><th class="n">Clicks</th><th class="n">Submitted</th><th class="n">Valid</th><th class="n">Dup</th><th class="n">Invalid</th><th class="n">Click→valid</th><th class="n">Quality</th><th>Signal</th></tr>
      ${people.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.src.name)}<div class="note">${esc(p.src.college)}</div></td><td class="mono">${esc(p.src.code)}</td><td>${p.src.type === 'ambassador' ? 'Ambassador' : 'Community'}</td><td class="n">${p.clicks}</td><td class="n">${p.subs}</td><td class="n"><b>${p.valid}</b></td><td class="n">${p.dup}</td><td class="n">${p.invalid}</td><td class="n">${p.clicks ? pct(p.conv) : '-'}</td><td class="n">${p.subs ? pct(p.quality) : '-'}</td><td>${tags(p)}</td></tr>`).join('') || '<tr><td colspan="12" class="note">No sources yet. Add ambassadors in the next tab.</td></tr>'}
      </table></div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>Channel mix (valid unique)</h3><table><tr><th>Channel</th><th class="n">Sources</th><th class="n">Active</th><th class="n">Valid</th><th class="n">Share</th></tr>
      ${Object.keys(C.TYPES).map(k => { const b = st.byType[k]; return `<tr><td>${C.TYPES[k]}</td><td class="n">${b.sources}</td><td class="n">${b.active}</td><td class="n">${b.valid}</td><td class="n">${t.valid ? pct(b.valid / t.valid) : '-'}</td></tr>`; }).join('')}
      <tr><td>Direct / unattributed</td><td class="n">-</td><td class="n">-</td><td class="n">${st.byType.direct.valid}</td><td class="n">${t.valid ? pct(st.byType.direct.valid / t.valid) : '-'}</td></tr></table></div>
      <div class="card"><h3>Paid test variants</h3><table><tr><th>Variant</th><th class="n">Clicks</th><th class="n">Valid</th><th class="n">Click→valid</th></tr>
      ${st.rows.filter(p => p.src.type === 'paid').map(p => `<tr><td>${esc(p.src.name)}</td><td class="n">${p.clicks}</td><td class="n">${p.valid}</td><td class="n">${p.clicks ? pct(p.conv) : '-'}</td></tr>`).join('') || '<tr><td colspan="4" class="note">No paid sources.</td></tr>'}</table>
      <div class="note" style="margin-top:6px">Purpose of the ₹600: learn which message angle converts, not to buy the 500.</div></div>
    </div>`;
  }

  /* ---------- Sources & share kit ---------- */
  function shareText(src, angle) {
    const L = link(src.code);
    const who = src.type === 'community' ? 'our group' : 'my college';
    const T = {
      placement: `Final-year folks, quick one 👇\nEveryone asks "do you have an AI project?" in interviews. Free live workshop: Build Your First AI Project in 60 Minutes. No prior AI experience needed, you leave with something running + shareable.\nSeats are free, final-year (2027 batch) only. Register here: ${L}`,
      portfolio: `Want one real AI project on your resume before placements start? 🛠️\nNxtWave is running a free 60-minute live session where you build your first AI project from scratch.\nNo theory dump. You code along and finish with a demo you can put on GitHub/LinkedIn.\nFinal-year students, register free: ${L}`,
      curiosity: `Everyone in ${who} is talking about AI but nobody has actually built anything 😅\nFree 60-min live workshop: build your first AI project, start to finish. Beginners welcome.\nTell me if you register and we can go together. Link: ${L}`
    };
    return T[angle];
  }
  function sources() {
    const list = state.sources.filter(s => s.type === 'ambassador' || s.type === 'community' || s.type === 'paid');
    const cur = state.sources.find(s => s.code === ui.sel) || list[0];
    if (cur) ui.sel = cur.code;
    return `<div class="grid g2">
      <div class="card"><h3>1 · Add an ambassador / community admin</h3>
        <div class="row"><div><label>Name</label><input id="aName" placeholder="e.g. Asha Rao"></div><div><label>Type</label><select id="aType"><option value="ambassador">Campus ambassador</option><option value="community">Community admin</option></select></div></div>
        <div class="row"><div><label>College / community</label><input id="aCol"></div><div><label>City</label><input id="aCity"></div></div>
        <div style="margin-top:10px"><button class="btn" id="addSrc">Generate unique code &amp; link</button></div>
        <div id="addErr" class="err"></div>
        <div class="note" style="margin-top:8px">Codes are unique per person, so every registration can be attributed to exactly one source.</div></div>
      <div class="card"><h3>2 · Personalised share kit</h3>
        ${cur ? `<div class="row"><div><label>Source</label><select id="selSrc">${list.map(s => `<option value="${s.code}" ${s.code === cur.code ? 'selected' : ''}>${esc(s.name)} (${s.code})</option>`).join('')}</select></div>
        <div><label>Message angle</label><select id="selAngle"><option value="placement" ${ui.angle === 'placement' ? 'selected' : ''}>Placement / interview</option><option value="portfolio" ${ui.angle === 'portfolio' ? 'selected' : ''}>Portfolio project</option><option value="curiosity" ${ui.angle === 'curiosity' ? 'selected' : ''}>Curiosity / peer</option></select></div></div>
        <label>Trackable link</label><div class="mono card" style="padding:8px">${esc(link(cur.code))}</div>
        <label>Ready-to-paste WhatsApp message</label><div class="msg" id="msgBox">${esc(shareText(cur, ui.angle))}</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="copyMsg">Copy message</button><button class="btn sec" id="openStudent">Simulate a student clicking this link</button></div><div id="copyOk" class="note"></div>`
        : '<div class="note">Add a source first.</div>'}</div></div>
      <div class="card" style="margin-top:14px"><h3>All sources</h3><div class="scroll"><table><tr><th>Name</th><th>Type</th><th>Code</th><th>College</th><th>Joined</th></tr>
      ${list.map(s => `<tr><td>${esc(s.name)}</td><td>${C.TYPES[s.type]}</td><td class="mono">${s.code}</td><td>${esc(s.college)}</td><td>Day ${s.joinedDay}</td></tr>`).join('')}</table></div></div>`;
  }
  function bindSources() {
    const add = document.getElementById('addSrc');
    if (add) add.onclick = () => {
      try {
        const s = C.addSource(state, { name: val('aName'), type: val('aType'), college: val('aCol'), city: val('aCity') });
        ui.sel = s.code; save(); render();
      } catch (e) { document.getElementById('addErr').textContent = e.message; }
    };
    const sel = document.getElementById('selSrc'); if (sel) sel.onchange = () => { ui.sel = sel.value; render(); };
    const ang = document.getElementById('selAngle'); if (ang) ang.onchange = () => { ui.angle = ang.value; render(); };
    const cp = document.getElementById('copyMsg');
    if (cp) cp.onclick = () => {
      const txt = document.getElementById('msgBox').textContent, ok = document.getElementById('copyOk');
      const done = () => ok.textContent = 'Copied.';
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => { fallbackCopy(txt); done(); });
      else { fallbackCopy(txt); done(); }
    };
    const os = document.getElementById('openStudent');
    if (os) os.onclick = () => { ui.studentCode = ui.sel; ui.result = null; ui.errors = {}; C.recordClick(state, ui.sel); save(); tab = 'student'; render(); };
  }
  function fallbackCopy(t) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } a.remove(); }
  const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };

  /* ---------- Student view ---------- */
  function student() {
    const src = C.findSource(state, ui.studentCode);
    const e = ui.errors || {};
    const f = ui.form || {};
    const fld = (id, label, ph, type) => `<div><label>${label}</label><input id="${id}" type="${type || 'text'}" placeholder="${ph || ''}" value="${esc(f[id] || '')}">${e[id] ? `<div class="err">${esc(e[id])}</div>` : ''}</div>`;
    const r = ui.result;
    return `<div class="grid g2"><div class="card"><h3>Student registration page (simulation)</h3>
      <div class="note" style="margin-bottom:8px">${src ? `Arrived via <b>${esc(src.name)}</b> <span class="mono">(${src.code})</span>. Attribution is locked to this code.` : 'Arrived directly (no referral code). Registration will count as direct.'}</div>
      <h2 style="margin:6px 0">Build Your First AI Project in 60 Minutes</h2><div class="note">Free live workshop · final-year engineering students (2027 batch) · no prior AI experience needed</div>
      <div class="row">${fld('f_name', 'Full name')}${fld('f_email', 'Email', 'you@college.edu', 'email')}</div>
      <div class="row">${fld('f_phone', 'WhatsApp number', '10-digit mobile', 'tel')}${fld('f_college', 'College')}</div>
      <div class="row">${fld('f_branch', 'Branch', 'CSE / ECE / ...')}<div><label>Graduation year</label><select id="f_gradYear"><option value="2027" ${f.f_gradYear === '2027' || !f.f_gradYear ? 'selected' : ''}>2027</option><option value="2026" ${f.f_gradYear === '2026' ? 'selected' : ''}>2026</option><option value="2028" ${f.f_gradYear === '2028' ? 'selected' : ''}>2028</option><option value="2025" ${f.f_gradYear === '2025' ? 'selected' : ''}>2025 or earlier</option></select></div></div>
      <div class="row"><div><label>Referral code (optional)</label><input id="f_code" value="${esc(ui.studentCode)}" placeholder="e.g. AR42"></div></div>
      <div style="margin-top:12px"><button class="btn" id="submitReg">Register</button> <button class="btn sec" id="fillSample">Fill valid sample</button> <button class="btn sec" id="fillDup">Fill duplicate sample</button></div>
      <div class="note" style="margin-top:8px">Simulated form inside this prototype. It does not send data anywhere.</div></div>
      <div class="card"><h3>Result &amp; growth loop</h3>${r ? resultCard(r) : '<div class="note">Submit the form to see how attribution, validation and de-duplication behave. A valid registration instantly gets a personal referral link, which is the loop: registrant → friend → attributed registration.</div>'}</div></div>`;
  }
  function resultCard(r) {
    if (r.status === 'valid') return `<div class="ok"><b>Registered ✅ (valid, unique)</b><div class="note">Credited to: ${r.code ? esc((C.findSource(state, r.code) || {}).name) + ' (' + r.code + ')' : 'direct'}</div></div>
      <label>Give them this personal link to share with 3 friends (unlocks the AI project starter kit):</label><div class="mono card" style="padding:8px">${esc(link(r.refCode))}</div>
      <div class="msg" style="margin-top:8px">${esc('I just registered for the free "Build Your First AI Project in 60 Minutes" workshop. Join me (final-year only): ' + link(r.refCode))}</div>`;
    return `<div class="bad"><b>${r.status === 'duplicate' ? 'Duplicate - not counted again' : 'Invalid - not counted'}</b><div class="note">${esc(r.reason)}</div></div>`;
  }
  function bindStudent() {
    const get = () => ({ f_name: val('f_name'), f_email: val('f_email'), f_phone: val('f_phone'), f_college: val('f_college'), f_branch: val('f_branch'), f_gradYear: val('f_gradYear') });
    document.getElementById('submitReg').onclick = () => {
      ui.form = get(); const f = ui.form, code = val('f_code'); ui.studentCode = code.trim().toUpperCase();
      const errs = C.validate({ name: f.f_name, email: f.f_email, phone: f.f_phone, college: f.f_college, branch: f.f_branch, gradYear: f.f_gradYear });
      ui.errors = {};
      errs.forEach(m => { const k = m.startsWith('name') ? 'f_name' : /email/.test(m) ? 'f_email' : /phone/.test(m) ? 'f_phone' : /college/.test(m) ? 'f_college' : /branch/.test(m) ? 'f_branch' : 'f_gradYear'; ui.errors[k] = m; });
      if (Object.keys(ui.errors).length) { ui.result = null; render(); return; } // client-side validation blocks obviously bad input
      ui.result = C.submit(state, { name: f.f_name, email: f.f_email, phone: f.f_phone, college: f.f_college, branch: f.f_branch, gradYear: f.f_gradYear, code: ui.studentCode });
      ui.form = {}; save(); render();
    };
    document.getElementById('fillSample').onclick = () => { ui.form = { f_name: 'Demo Student', f_email: 'demo.student' + Math.floor(Math.random() * 900 + 100) + '@example.com', f_phone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'), f_college: 'Greenfield Institute of Technology', f_branch: 'CSE', f_gradYear: '2027' }; ui.studentCode = val('f_code'); ui.errors = {}; render(); };
    document.getElementById('fillDup').onclick = () => {
      const first = state.regs.find(r => r.status === 'valid');
      if (!first) { alert('No valid registration exists yet. Register one first.'); return; }
      ui.form = { f_name: first.name, f_email: first.email.replace('@', '+again@'), f_phone: '9000000099', f_college: first.college, f_branch: first.branch, f_gradYear: '2027' }; ui.studentCode = val('f_code'); ui.errors = {}; render();
    };
  }

  /* ---------- Registrations & quality ---------- */
  function regs() {
    const q = ui.filter.toLowerCase();
    const rows = state.regs.filter(r => r.day <= state.day && (ui.status === 'all' || r.status === ui.status) && (!q || (r.name + r.email + r.college + r.code).toLowerCase().includes(q))).slice().reverse();
    const t = C.stats(state, state.day).total;
    const mask = p => p.length === 10 ? p.slice(0, 2) + '••••••' + p.slice(-2) : p;
    return `<div class="grid g4"><div class="card kpi"><h3>Submitted</h3><div class="v">${t.subs}</div></div><div class="card kpi"><h3>Valid unique</h3><div class="v" style="color:var(--green)">${t.valid}</div></div><div class="card kpi"><h3>Duplicates</h3><div class="v" style="color:var(--amber)">${t.dup}</div></div><div class="card kpi"><h3>Invalid</h3><div class="v" style="color:var(--red)">${t.invalid}</div></div></div>
    <div class="card" style="margin-top:14px"><h3>Import a Google Form / Sheet export (CSV) to test de-duplication</h3>
      <textarea id="csvIn" rows="4" placeholder="name,email,phone,college,branch,gradYear,code&#10;Riya Sen,riya@example.com,9333333333,Demo College,IT,2027,AR42"></textarea>
      <div style="margin-top:8px"><button class="btn" id="doImport">Process CSV</button> <button class="btn sec" id="doExport">Export all as CSV</button></div>
      ${ui.importMsg ? `<div class="${ui.importMsg.ok ? 'ok' : 'bad'}">${esc(ui.importMsg.text)}</div>` : ''}</div>
    <div class="card" style="margin-top:14px"><div class="row"><div><label>Search</label><input id="qIn" value="${esc(ui.filter)}" placeholder="name, email, college, code"></div><div><label>Status</label><select id="stIn">${['all', 'valid', 'duplicate', 'invalid'].map(s => `<option ${ui.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
      <div class="scroll" style="margin-top:10px"><table><tr><th>#</th><th>Day</th><th>Name</th><th>Email</th><th>Phone</th><th>College</th><th>Source</th><th>Status</th><th>Reason</th></tr>
      ${rows.slice(0, 150).map(r => `<tr><td>${r.id}</td><td>${r.day}</td><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td class="mono">${esc(mask(r.phone))}</td><td>${esc(r.college)}</td><td class="mono">${esc(r.code || 'direct')}</td><td><span class="tag ${r.status === 'valid' ? 'green' : r.status === 'duplicate' ? 'amber' : 'red'}">${r.status}</span></td><td class="note">${esc(r.reason)}</td></tr>`).join('') || '<tr><td colspan="9" class="note">No matching records.</td></tr>'}</table></div>
      <div class="note">Showing up to 150 of ${rows.length}. Phones are masked in the table (full values are in the CSV export).</div></div>`;
  }
  function bindRegs() {
    document.getElementById('qIn').oninput = e => { ui.filter = e.target.value; render(true); };
    document.getElementById('stIn').onchange = e => { ui.status = e.target.value; render(); };
    document.getElementById('doImport').onclick = () => {
      try { const o = C.importCSV(state, val('csvIn')); save(); ui.importMsg = { ok: true, text: `Processed: ${o.valid} valid, ${o.duplicate} duplicate, ${o.invalid} invalid.` }; }
      catch (e) { ui.importMsg = { ok: false, text: e.message }; }
      render();
    };
    document.getElementById('doExport').onclick = () => {
      const blob = new Blob([C.toCSV(state.regs)], { type: 'text/csv' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'registrations_export.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500);
    };
  }

  /* ---------- Planner ---------- */
  const FIELDS = [
    ['ambRecruited', 'Ambassadors recruited', 1], ['ambActivation', 'Activation rate', 0.01], ['ambReach', 'Reach per active ambassador', 10], ['ambCtr', 'Click rate on reach', 0.005], ['ambReg', 'Click → registration', 0.01],
    ['admins', 'Community admins who post', 1], ['adminReach', 'Group members per post', 10], ['adminCtr', 'Click rate', 0.005], ['adminReg', 'Click → registration', 0.01],
    ['adSpend', 'Paid test spend (₹)', 50], ['adCpl', 'Cost per registration (₹)', 1], ['refSharers', 'Registrants who share', 0.01], ['refFriends', 'Registrations per sharer', 0.1], ['overlap', 'Overlap haircut', 0.01], ['invalid', 'Duplicate + invalid rate', 0.01]
  ];
  if (!window.__sc) window.__sc = JSON.parse(JSON.stringify(C.SCENARIOS));
  function planner() {
    const res = {}; ['low', 'base', 'high'].forEach(k => res[k] = C.funnel(window.__sc[k]));
    const r0 = n => Math.round(n);
    const line = (label, f) => `<tr><td>${label}</td>${['low', 'base', 'high'].map(k => `<td class="n">${f(res[k])}</td>`).join('')}</tr>`;
    return `<div class="card"><h3>Funnel with explicit assumptions (edit any input; everything recalculates)</h3>
      <div class="note" style="margin-bottom:8px">Every rate below is a <b>hypothesis to be replaced by observed numbers by day 2</b>. Net = (ambassador + community + paid + referral) × (1 − overlap) × (1 − duplicate/invalid).</div>
      <div class="scroll"><table><tr><th>Input</th><th class="n">Low</th><th class="n">Base</th><th class="n">High</th></tr>
      ${FIELDS.map(f => `<tr><td>${f[1]}</td>${['low', 'base', 'high'].map(k => `<td class="n"><input type="number" step="${f[2]}" min="0" data-k="${k}" data-f="${f[0]}" value="${window.__sc[k][f[0]]}" style="width:90px;text-align:right"></td>`).join('')}</tr>`).join('')}
      </table></div></div>
    <div class="card" style="margin-top:14px"><h3>Output</h3><table><tr><th></th><th class="n">Low</th><th class="n">Base</th><th class="n">High</th></tr>
      ${line('Active ambassadors = recruited × activation', r => r0(r.active))}
      ${line('Ambassador registrations = active × reach × CTR × reg', r => r0(r.amb))}
      ${line('Community registrations = admins × members × CTR × reg', r => r0(r.adm))}
      ${line('Paid registrations = spend ÷ cost', r => r0(r.paid))}
      ${line('Referral-loop registrations = seed × sharers × per-sharer', r => r0(r.ref))}
      ${line('Gross submissions', r => r0(r.gross))}
      ${line('After overlap (double-count removal)', r => r0(r.afterOverlap))}
      <tr><td><b>Net valid unique registrations</b></td>${['low', 'base', 'high'].map(k => `<td class="n"><b>${r0(res[k].net)}</b> <span class="tag ${res[k].net >= 500 ? 'green' : res[k].net >= 350 ? 'amber' : 'red'}">${pct(res[k].net / 500)}</span></td>`).join('')}</tr></table>
      <div class="note" style="margin-top:8px">Only the base case reaches ~500, and only if the assumptions hold. The low case misses by a wide margin: that is why the plan has day-2 and day-4 checkpoints and a ₹400 reserve instead of a guarantee.</div></div>`;
  }
  function bindPlanner() {
    document.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => {
      const v = parseFloat(i.value);
      if (isNaN(v) || v < 0) { i.value = window.__sc[i.dataset.k][i.dataset.f]; return; }
      window.__sc[i.dataset.k][i.dataset.f] = v; render();
    });
  }

  /* ---------- About ---------- */
  function about() {
    return `<div class="grid g2"><div class="card"><h3>What is real vs simulated</h3><ul>
      <li><b>Real and working:</b> unique code generation, trackable link format, share-message generator, validation, first-touch attribution, duplicate detection (email aliasing + phone), CSV import/export, leaderboard, pace-vs-plan engine, funnel calculator. Logic is covered by <span class="mono">node test.js</span>.</li>
      <li><b>Simulated:</b> all demo students, ambassadors, clicks and registrations (fake names, <span class="mono">example.com</span> emails). The student form is a simulation inside this page.</li>
      <li><b>Not implemented (honest boundary):</b> real Google Form or WhatsApp integration; a shared online database. Data lives in this browser (localStorage), so clicks from other people's devices are not captured. Production path: host the page + write submissions to a shared Google Sheet / Apps Script or Supabase, then reuse the same <span class="mono">core.js</span>.</li></ul></div>
      <div class="card"><h3>Manual test checklist</h3><ol>
      <li>Dashboard loads with the "SIMULATED" badge and pace is amber on day 4.</li>
      <li>Add an ambassador with name "A" → rejected; with "Asha Rao" → unique code created.</li>
      <li>Copy a share message; link ends with <span class="mono">?ref=CODE</span>.</li>
      <li>Click "Simulate a student clicking this link" → form shows the owner's name.</li>
      <li>Submit a valid sample → valid + personal referral link appears.</li>
      <li>Submit "Fill duplicate sample" → marked duplicate, credit stays with first source.</li>
      <li>Submit a bad phone / 2025 graduation year → blocked with field errors.</li>
      <li>Registrations tab: filter by "duplicate"; paste the CSV example; export CSV.</li>
      <li>Change day to 2 and back: pace, leaderboard and actions change.</li>
      <li>Planner: change base "Click → registration" to 0.2 → net drops; Reset demo restores.</li></ol></div></div>`;
  }

  function render(keepFocus) {
    renderNav();
    const v = document.getElementById('view');
    const fn = { dashboard, sources, student, regs, planner, about }[tab];
    v.innerHTML = fn();
    ({ sources: bindSources, student: bindStudent, regs: bindRegs, planner: bindPlanner }[tab] || (() => {}))();
    if (keepFocus && tab === 'regs') { const q = document.getElementById('qIn'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }
  document.getElementById('btnReset').onclick = () => { tab = 'dashboard'; state = C.demo(7); window.__sc = JSON.parse(JSON.stringify(C.SCENARIOS)); ui = { sel: '', angle: 'placement', studentCode: '', result: null, errors: {}, importMsg: null, filter: '', status: 'all' }; save(); render(); };
  document.getElementById('btnClear').onclick = () => { if (confirm('Clear all demo data and start empty?')) { state = C.newState(); save(); render(); } };

  // Real ?ref=CODE support: opening a tracked link records a click and shows the student page.
  const m = /[?&]ref=([A-Za-z0-9-]+)/.exec(location.search);
  if (m && C.findSource(state, m[1])) { ui.studentCode = m[1].toUpperCase(); tab = 'student'; C.recordClick(state, ui.studentCode); save(); }
  render();
})();
