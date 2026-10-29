/* RefLoop core logic - no DOM, testable in Node (node test.js) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(this, function () {
  const TARGET = 500;
  // Cumulative net-valid registration target by end of day (index = day). Hypothesis, not fact.
  const CURVE = [0, 40, 120, 220, 320, 410, 470, 500];
  const ELIGIBLE_YEARS = [2027]; // final-year batch as of Oct 2026 (configurable)
  const TYPES = { ambassador: 'Campus ambassadors', community: 'Community admins', paid: 'Paid test', referral: 'Registrant referral' };
  const DISPOSABLE = ['mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'yopmail.com'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const ATTEND_RATE = 0.35; // ASSUMPTION for projected attendance, to be replaced by observed data

  function normalizeEmail(e) {
    e = String(e || '').trim().toLowerCase();
    const parts = e.split('@');
    if (parts.length !== 2) return e;
    let local = parts[0].split('+')[0], dom = parts[1];
    if (dom === 'googlemail.com') dom = 'gmail.com';
    if (dom === 'gmail.com') local = local.replace(/\./g, '');
    return local + '@' + dom;
  }
  function normalizePhone(p) {
    let s = String(p || '').replace(/[\s\-()]/g, '');
    return s.replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  }
  function validate(r) {
    const errs = [];
    if (!r.name || String(r.name).trim().length < 2) errs.push('name missing');
    const em = String(r.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(em)) errs.push('invalid email');
    else if (DISPOSABLE.includes(em.split('@')[1])) errs.push('disposable email');
    if (!/^[6-9]\d{9}$/.test(normalizePhone(r.phone))) errs.push('invalid phone');
    if (!r.college || String(r.college).trim().length < 3) errs.push('college missing');
    if (!r.branch || String(r.branch).trim().length < 2) errs.push('branch missing');
    if (!ELIGIBLE_YEARS.includes(Number(r.gradYear))) errs.push('not final-year batch (' + (r.gradYear || 'blank') + ')');
    return errs;
  }

  function newState() {
    return { day: 1, nextRegId: 1, sources: [], regs: [], simulated: false };
  }
  function findSource(state, code) {
    code = String(code || '').trim().toUpperCase();
    return state.sources.find(s => s.code === code) || null;
  }
  function makeCode(name, existing, rnd) {
    rnd = rnd || Math.random;
    const letters = String(name).replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3) || 'XX';
    for (let i = 0; i < 200; i++) {
      const code = letters + String(10 + Math.floor(rnd() * 90)) + (i > 50 ? String.fromCharCode(65 + Math.floor(rnd() * 26)) : '');
      if (!existing.some(s => s.code === code)) return code;
    }
    return letters + Date.now().toString(36).toUpperCase();
  }
  function addSource(state, o, rnd) {
    const name = String(o.name || '').trim();
    if (name.length < 2) throw new Error('Name is required (min 2 characters).');
    if (!TYPES[o.type]) throw new Error('Unknown source type.');
    const code = o.code ? String(o.code).toUpperCase() : makeCode(name, state.sources.map(s => ({ code: s.code })), rnd);
    if (findSource(state, code)) throw new Error('Code already exists: ' + code);
    const s = { code, name, type: o.type, college: o.college || '', city: o.city || '', joinedDay: state.day, clicks: [0, 0, 0, 0, 0, 0, 0], ownerRegId: o.ownerRegId || null };
    state.sources.push(s);
    return s;
  }
  function recordClick(state, code, n) {
    const s = findSource(state, code);
    if (!s) return false;
    s.clicks[state.day - 1] += (n || 1);
    return true;
  }
  /* Core attribution + dedupe. First valid registration keeps attribution (first-touch). */
  function submit(state, input) {
    const rec = {
      id: state.nextRegId++, name: String(input.name || '').trim(), email: String(input.email || '').trim(),
      phone: normalizePhone(input.phone), college: String(input.college || '').trim(), branch: String(input.branch || '').trim(),
      gradYear: Number(input.gradYear) || 0, code: String(input.code || '').trim().toUpperCase(), day: state.day,
      status: 'valid', reason: '', dupOf: null
    };
    if (rec.code && !findSource(state, rec.code)) { rec.reason = 'unknown code ' + rec.code + ' -> counted as direct'; rec.code = ''; }
    const errs = validate(rec);
    if (errs.length) { rec.status = 'invalid'; rec.reason = errs.join('; '); }
    else {
      const ne = normalizeEmail(rec.email), np = normalizePhone(rec.phone);
      const dup = state.regs.find(r => r.status === 'valid' && (normalizeEmail(r.email) === ne || normalizePhone(r.phone) === np));
      if (dup) {
        rec.status = 'duplicate'; rec.dupOf = dup.id;
        rec.reason = 'same ' + (normalizeEmail(dup.email) === ne ? 'email' : 'phone') + ' as #' + dup.id + ' (credit stays with first source)';
      }
    }
    state.regs.push(rec);
    if (rec.status === 'valid') {
      const code = 'R' + rec.id.toString(36).toUpperCase().padStart(3, '0');
      if (!findSource(state, code)) addSource(state, { name: rec.name + ' (registrant)', type: 'referral', college: rec.college, code, ownerRegId: rec.id });
      rec.refCode = code;
    }
    return rec;
  }

  function cumulativeValid(state, upto) {
    const out = [];
    for (let d = 1; d <= 7; d++) out.push(d > upto ? null : state.regs.filter(r => r.status === 'valid' && r.day <= d).length);
    return out;
  }
  function stats(state, day) {
    const regs = state.regs.filter(r => r.day <= day);
    const per = {};
    state.sources.forEach(s => { per[s.code] = { src: s, clicks: s.clicks.slice(0, day).reduce((a, b) => a + b, 0), subs: 0, valid: 0, dup: 0, invalid: 0 }; });
    const direct = { src: { code: '', name: 'Direct / unattributed', type: 'direct' }, clicks: 0, subs: 0, valid: 0, dup: 0, invalid: 0 };
    regs.forEach(r => {
      const p = per[r.code] || direct;
      p.subs++; if (r.status === 'valid') p.valid++; else if (r.status === 'duplicate') p.dup++; else p.invalid++;
    });
    const rows = Object.values(per).map(p => Object.assign(p, {
      conv: p.clicks ? p.valid / p.clicks : 0, quality: p.subs ? p.valid / p.subs : 0
    }));
    const byType = {};
    Object.keys(TYPES).forEach(t => { byType[t] = { valid: 0, subs: 0, sources: 0, active: 0 }; });
    rows.forEach(p => { const b = byType[p.src.type]; b.valid += p.valid; b.subs += p.subs; b.sources++; if (p.clicks > 0 || p.subs > 0) b.active++; });
    byType.direct = { valid: direct.valid, subs: direct.subs, sources: 0, active: 0 };
    const total = { subs: regs.length, valid: regs.filter(r => r.status === 'valid').length, dup: regs.filter(r => r.status === 'duplicate').length, invalid: regs.filter(r => r.status === 'invalid').length };
    return { rows, direct, byType, total, cum: cumulativeValid(state, day) };
  }
  function adSpend(day) { return day >= 3 ? 600 : day === 2 ? 300 : 0; }

  /* Decision engine: turns the numbers into "what do I do today" */
  function decide(state, day) {
    const st = stats(state, day);
    const target = CURVE[day];
    const ratio = target ? st.total.valid / target : 1;
    const level = ratio >= 0.9 ? 'green' : ratio >= 0.65 ? 'amber' : 'red';
    const cum = st.cum.filter(v => v !== null);
    const last2 = cum.length >= 3 ? (cum[cum.length - 1] - cum[cum.length - 3]) / 2 : (cum[cum.length - 1] || 0) / cum.length;
    const projected = Math.round(st.total.valid + last2 * (7 - day));
    const actions = [];
    const people = st.rows.filter(p => p.src.type === 'ambassador' || p.src.type === 'community');
    const dormant = people.filter(p => day >= 2 && p.clicks === 0 && p.src.joinedDay < day);
    const leaky = people.filter(p => p.clicks >= 30 && p.conv < 0.15);
    const stars = people.slice().sort((a, b) => b.valid - a.valid).filter(p => p.valid > 0).slice(0, 3);
    const dupRate = st.total.subs ? st.total.dup / st.total.subs : 0;
    const invRate = st.total.subs ? st.total.invalid / st.total.subs : 0;
    if (level !== 'green') actions.push({ level, title: 'Pace is ' + Math.round(ratio * 100) + '% of the day-' + day + ' target (' + st.total.valid + ' vs ' + target + ')', detail: level === 'red' ? 'Red zone: stop waiting. Same-day actions: re-pitch dormant people personally, ask top 3 to post in 2 more groups, and release the reserve.' : 'Amber: recoverable. Fix the biggest leak below today and re-check tomorrow.' });
    if (dormant.length) actions.push({ level: 'amber', title: dormant.length + ' ambassador/community sources have zero clicks', detail: 'Personal nudge with a ready-to-paste message (' + dormant.slice(0, 4).map(p => p.src.name).join(', ') + (dormant.length > 4 ? '...' : '') + '). If still silent by day 4, replace them with the next names on the waitlist.' });
    if (leaky.length) actions.push({ level: 'amber', title: leaky.length + ' sources get clicks but few valid registrations', detail: 'Click-to-valid under 15% (' + leaky.slice(0, 3).map(p => p.src.name + ' ' + Math.round(p.conv * 100) + '%').join(', ') + '). Likely message/audience mismatch: switch them to the "portfolio" angle and check whether their group is final-year.' });
    if (dupRate > 0.12) actions.push({ level: 'amber', title: 'Duplicate rate ' + Math.round(dupRate * 100) + '% (above 12%)', detail: 'Same students re-registering via several sources. Keep first-touch attribution, and tell ambassadors only valid unique registrations count for bonuses.' });
    if (invRate > 0.15) actions.push({ level: 'amber', title: 'Invalid rate ' + Math.round(invRate * 100) + '% (above 15%)', detail: 'Mostly wrong batch / bad phone? Put "Final-year (2027 batch) only" in the first line of every message and make phone the first field.' });
    if (stars.length) actions.push({ level: 'green', title: 'Double down on: ' + stars.map(p => p.src.name + ' (' + p.valid + ')').join(', '), detail: 'Ask them for 2 more groups each and a 24-hour reminder post. Bonuses are paid on valid unique registrations only.' });
    const paidValid = st.rows.filter(p => p.src.type === 'paid').reduce((a, p) => a + p.valid, 0);
    const spend = adSpend(day);
    if (spend && paidValid) {
      const cpl = spend / paidValid;
      actions.push({ level: cpl <= 60 ? 'green' : 'amber', title: 'Paid test: ₹' + Math.round(cpl) + ' per valid registration (₹' + spend + ' spent, ' + paidValid + ' valid)', detail: cpl <= 60 && level !== 'green' ? 'Cost is acceptable: put the ₹400 reserve into the best-converting ad variant.' : 'Not cheap enough to scale: put the ₹400 reserve into the ambassador bonus pool instead, and keep ads off.' });
    }
    if (projected < TARGET * 0.9) actions.push({ level: 'amber', title: 'Run-rate projection: ~' + projected + ' by day 7', detail: 'Naive projection from the last two days (ignores referral lag and the final reminder push). Treat as an alarm, not a forecast.' });
    if (!actions.length) actions.push({ level: 'green', title: 'On track', detail: 'No leaks above thresholds. Keep the daily routine and protect the reserve.' });
    return { st, target, ratio, level, projected, actions, dormant, leaky, stars };
  }

  /* Funnel planner. Every number is an assumption to be replaced with observed data. */
  const SCENARIOS = {
    low:  { ambRecruited: 30, ambActivation: 0.50, ambReach: 350, ambCtr: 0.09, ambReg: 0.27, admins: 12, adminReach: 260, adminCtr: 0.06, adminReg: 0.27, adSpend: 600, adCpl: 70, refSharers: 0.12, refFriends: 0.9, overlap: 0.05, invalid: 0.15 },
    base: { ambRecruited: 36, ambActivation: 0.67, ambReach: 400, ambCtr: 0.12, ambReg: 0.30, admins: 20, adminReach: 300, adminCtr: 0.08, adminReg: 0.30, adSpend: 600, adCpl: 46, refSharers: 0.20, refFriends: 1.0, overlap: 0.08, invalid: 0.10 },
    high: { ambRecruited: 40, ambActivation: 0.70, ambReach: 450, ambCtr: 0.13, ambReg: 0.33, admins: 24, adminReach: 320, adminCtr: 0.09, adminReg: 0.32, adSpend: 600, adCpl: 38, refSharers: 0.22, refFriends: 1.1, overlap: 0.10, invalid: 0.08 }
  };
  function funnel(p) {
    const active = p.ambRecruited * p.ambActivation;
    const ambReach = active * p.ambReach, ambClicks = ambReach * p.ambCtr, amb = ambClicks * p.ambReg;
    const admReach = p.admins * p.adminReach, admClicks = admReach * p.adminCtr, adm = admClicks * p.adminReg;
    const paid = p.adSpend / p.adCpl;
    const seed = amb + adm + paid;
    const ref = seed * p.refSharers * p.refFriends;
    const gross = seed + ref;
    const afterOverlap = gross * (1 - p.overlap);
    const net = afterOverlap * (1 - p.invalid);
    return { active, ambReach, ambClicks, amb, admReach, admClicks, adm, paid, seed, ref, gross, afterOverlap, net };
  }

  /* ---------- Simulated demo data (clearly labelled in the UI) ---------- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const FIRST = ['Aarav', 'Ananya', 'Rohan', 'Diya', 'Karthik', 'Sneha', 'Vikram', 'Meera', 'Arjun', 'Priya', 'Rahul', 'Kavya', 'Siddharth', 'Nisha', 'Harsha', 'Lakshmi', 'Manoj', 'Pooja', 'Yash', 'Ishita', 'Tarun', 'Divya', 'Varun', 'Swathi', 'Nikhil', 'Bhavana', 'Dev', 'Anjali', 'Mohit', 'Revathi'];
  const LAST = ['Reddy', 'Sharma', 'Nair', 'Patel', 'Iyer', 'Gupta', 'Rao', 'Singh', 'Kumar', 'Das', 'Menon', 'Joshi', 'Verma', 'Naidu', 'Pillai', 'Mishra', 'Yadav', 'Chowdary', 'Bose', 'Khan'];
  const COLLEGES = ['Greenfield Institute of Technology', 'Riverbend College of Engineering', 'Silverline Engineering College', 'Hillcrest Institute of Technology', 'Lakeview College of Engineering', 'Northgate Institute of Science', 'Eastwind Engineering College', 'Sunrise Institute of Technology', 'Crestview College of Engineering', 'Bluepeak Institute of Technology', 'Maplewood Engineering College', 'Harborline Institute of Technology'];
  const CITIES = ['Hyderabad', 'Vijayawada', 'Pune', 'Coimbatore', 'Indore', 'Nagpur', 'Bhubaneswar', 'Jaipur', 'Kochi', 'Lucknow', 'Mysuru', 'Vizag'];
  const BRANCHES = ['CSE', 'CSE', 'CSE', 'IT', 'ECE', 'EEE', 'AI&DS', 'Mechanical'];

  function demo(seed) {
    const rnd = mulberry32(seed || 7);
    const pick = a => a[Math.floor(rnd() * a.length)];
    const st = newState(); st.simulated = true; st.day = 1;
    const person = () => pick(FIRST) + ' ' + pick(LAST);
    const used = [];
    // 24 ambassadors, 16 community admins, 3 ad variants
    for (let i = 0; i < 24; i++) {
      const c = i % COLLEGES.length;
      const s = addSource(st, { name: person(), type: 'ambassador', college: COLLEGES[c], city: CITIES[c] }, rnd);
      s.joinedDay = i < 18 ? 1 : 2; s.weight = i < 5 ? 0 : Math.pow(rnd(), 2.2) * 10 + 0.3; s.conv = i % 9 === 4 ? 0.09 : 0.2 + rnd() * 0.2;
    }
    for (let i = 0; i < 16; i++) {
      const c = (i * 5) % COLLEGES.length;
      const s = addSource(st, { name: pick(['AI Club', 'Coding Club', 'Placement Cell', 'Tech Forum', 'Dev Community', 'Robotics Club']) + ' - ' + CITIES[c], type: 'community', college: COLLEGES[c], city: CITIES[c] }, rnd);
      s.joinedDay = 1; s.weight = i < 7 ? 0 : Math.pow(rnd(), 1.5) * 8 + 0.5; s.conv = 0.18 + rnd() * 0.15;
    }
    [['AD-A', 'Ad A: placement angle', 1.6], ['AD-B', 'Ad B: portfolio angle', 2.4], ['AD-C', 'Ad C: curiosity angle', 0.9]].forEach(a => {
      const s = addSource(st, { name: a[1], type: 'paid', code: a[0] }, rnd); s.joinedDay = 2; s.weight = a[2]; s.conv = 0.12;
    });
    const attempts = [40, 82, 104, 96];
    const bag = {}; const pickWeighted = list => { const tot = list.reduce((a, s) => a + s.weight, 0); let x = rnd() * tot; for (const s of list) { x -= s.weight; if (x <= 0) return s; } return list[list.length - 1]; };
    for (let day = 1; day <= 4; day++) {
      st.day = day;
      for (let n = 0; n < attempts[day - 1]; n++) {
        const roll = rnd();
        let src;
        const amb = st.sources.filter(s => s.type === 'ambassador' && s.joinedDay <= day && s.weight > 0);
        const com = st.sources.filter(s => s.type === 'community' && s.weight > 0);
        const paid = st.sources.filter(s => s.type === 'paid' && s.joinedDay <= day);
        const refs = st.sources.filter(s => s.type === 'referral');
        if (day >= 2 && roll > 0.9 && refs.length) { src = pick(refs); src.weight = 1; src.conv = 0.35; }
        else if (day >= 2 && roll > 0.85) src = pickWeighted(paid);
        else if (roll > 0.62) src = pickWeighted(com);
        else src = pickWeighted(amb);
        const first = pick(FIRST), last = pick(LAST);
        let email = (first + '.' + last + Math.floor(rnd() * 90 + 10)).toLowerCase() + '@example.com';
        let phone = String(6 + Math.floor(rnd() * 4)) + String(Math.floor(rnd() * 1e9)).padStart(9, '0');
        const inp = { name: first + ' ' + last, email, phone, college: src.college || pick(COLLEGES), branch: pick(BRANCHES), gradYear: 2027, code: src.code };
        const k = rnd();
        if (k < 0.07 && used.length) { const u = pick(used); inp.email = u.email.replace('@', '+x@'); inp.name = u.name; }
        else if (k < 0.12 && used.length) { const u = pick(used); inp.phone = u.phone; }
        else if (k < 0.16) inp.gradYear = pick([2025, 2026, 2028]);
        else if (k < 0.19) inp.phone = '98765' + Math.floor(rnd() * 9);
        else if (k < 0.21) inp.email = first.toLowerCase() + '@mailinator.com';
        const rec = submit(st, inp);
        if (rec.status === 'valid') used.push({ email: inp.email, phone: rec.phone, name: inp.name });
        bag[src.code] = bag[src.code] || [0, 0, 0, 0, 0, 0, 0]; bag[src.code][day - 1]++;
      }
    }
    st.sources.forEach(s => {
      if (s.type === 'referral') { s.clicks = [0, 0, 0, 0, 0, 0, 0]; }
      const b = bag[s.code];
      if (b) for (let d = 0; d < 7; d++) s.clicks[d] = Math.round(b[d] / (s.conv || 0.25)) + (b[d] ? Math.floor(rnd() * 3) : 0);
    });
    // dormant ones: a couple of stray clicks only on day 1 for a realistic mix
    st.day = 4; st.simulated = true;
    return st;
  }

  function csvEscape(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(regs) {
    const head = ['id', 'day', 'name', 'email', 'phone', 'college', 'branch', 'gradYear', 'source_code', 'status', 'reason'];
    return [head.join(',')].concat(regs.map(r => [r.id, r.day, r.name, r.email, r.phone, r.college, r.branch, r.gradYear, r.code, r.status, r.reason].map(csvEscape).join(','))).join('\n');
  }
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }
  function importCSV(state, text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('Need a header row and at least one data row.');
    const head = rows[0].map(h => h.trim().toLowerCase());
    const need = ['name', 'email', 'phone', 'college', 'branch', 'gradyear'];
    const miss = need.filter(n => !head.includes(n));
    if (miss.length) throw new Error('Missing columns: ' + miss.join(', ') + '. Expected: name,email,phone,college,branch,gradYear,code');
    const out = { valid: 0, duplicate: 0, invalid: 0 };
    rows.slice(1).forEach(r => {
      const o = {}; head.forEach((h, i) => o[h] = (r[i] || '').trim());
      const rec = submit(state, { name: o.name, email: o.email, phone: o.phone, college: o.college, branch: o.branch, gradYear: o.gradyear, code: o.code || o.source_code || '' });
      out[rec.status]++;
    });
    return out;
  }

  return { TARGET, CURVE, TYPES, ELIGIBLE_YEARS, ATTEND_RATE, SCENARIOS, normalizeEmail, normalizePhone, validate, newState, findSource, makeCode, addSource, recordClick, submit, stats, decide, funnel, adSpend, demo, toCSV, parseCSV, importCSV, cumulativeValid };
});
