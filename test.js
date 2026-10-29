// Run: node test.js   (no dependencies)
const C = require('./core.js');
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } };

// normalisation
t('gmail dots+alias normalised', C.normalizeEmail('A.b+x@Gmail.com') === 'ab@gmail.com');
t('phone +91 stripped', C.normalizePhone('+91 98765 43210') === '9876543210');

// validation
const ok = { name: 'Test Student', email: 't@example.com', phone: '9876543210', college: 'Demo College', branch: 'CSE', gradYear: 2027 };
t('valid record passes', C.validate(ok).length === 0);
t('bad phone caught', C.validate({ ...ok, phone: '12345' }).includes('invalid phone'));
t('wrong batch caught', C.validate({ ...ok, gradYear: 2025 }).some(e => e.startsWith('not final-year')));
t('disposable email caught', C.validate({ ...ok, email: 'a@mailinator.com' }).includes('disposable email'));

// attribution + dedupe
const s = C.newState();
const a = C.addSource(s, { name: 'Asha Rao', type: 'ambassador' });
const b = C.addSource(s, { name: 'Bala Menon', type: 'ambassador' });
t('unique codes', a.code !== b.code);
const r1 = C.submit(s, { ...ok, code: a.code });
t('first registration valid & attributed', r1.status === 'valid' && r1.code === a.code);
t('referral code created for registrant', !!C.findSource(s, r1.refCode));
const r2 = C.submit(s, { ...ok, email: 't+again@example.com', phone: '9111111111', code: b.code });
t('duplicate via email alias detected', r2.status === 'duplicate' && r2.dupOf === r1.id);
const r3 = C.submit(s, { ...ok, email: 'new@example.com', code: b.code });
t('duplicate via phone detected', r3.status === 'duplicate');
const r4 = C.submit(s, { ...ok, email: 'x@example.com', phone: '9000000001', code: 'NOPE' });
t('unknown code -> direct, still counted', r4.status === 'valid' && r4.code === '');
const st = C.stats(s, 1);
t('credit stays with first-touch source', st.rows.find(r => r.src.code === a.code).valid === 1 && st.rows.find(r => r.src.code === b.code).valid === 0);
t('totals add up', st.total.subs === 4 && st.total.valid === 2 && st.total.dup === 2);
try { C.addSource(s, { name: 'X', type: 'ambassador' }); t('short name rejected', false); } catch (e) { t('short name rejected', true); }

// csv import
const csv = 'name,email,phone,college,branch,gradYear,code\nRiya Sen,riya@example.com,9333333333,Demo College,IT,2027,' + a.code + '\n"Sen, Riya",riya@example.com,9333333333,Demo College,IT,2027,' + b.code + '\nBad Row,bad,123,X,Y,2020,';
const res = C.importCSV(s, csv);
t('csv import counts', res.valid === 1 && res.duplicate === 1 && res.invalid === 1);
try { C.importCSV(s, 'a,b\n1,2'); t('csv missing columns rejected', false); } catch (e) { t('csv missing columns rejected', true); }

// funnel
const out = {};
['low', 'base', 'high'].forEach(k => out[k] = C.funnel(C.SCENARIOS[k]));
console.log('Scenarios (net valid):', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v.net)])));
t('base scenario ~500 net', Math.abs(out.base.net - 500) < 25);
t('low < base < high', out.low.net < out.base.net && out.base.net < out.high.net);

// demo + decisions
const d = C.demo(7);
const dc = C.decide(d, 4);
console.log('Demo day-4 valid:', dc.st.total.valid, 'target', dc.target, 'ratio', dc.ratio.toFixed(2), dc.level, 'subs', dc.st.total.subs, 'dup', dc.st.total.dup, 'inv', dc.st.total.invalid, 'projected', dc.projected);
console.log(dc.actions.map(x => x.level + ': ' + x.title).join('\n'));
t('demo has data', dc.st.total.subs > 250);
t('demo is clearly flagged simulated', d.simulated === true);
t('every valid reg has a unique id', new Set(d.regs.map(r => r.id)).size === d.regs.length);
t('decision engine returns actions', dc.actions.length >= 2);
t('csv export roundtrip rows', C.toCSV(d.regs).split('\n').length === d.regs.length + 1);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
