import { useState, useMemo, useEffect, useRef, useCallback } from "react";

// ─── financial year ───────────────────────────────────────────────────────────
const FY_START         = '2026-02-09';
const FY_END           = '2027-02-07';
const RATE_CHANGE_DATE = '2026-09-01'; // new pay rates + night enhancement from here

const PAY_PERIODS = [
  { month:'April 2026',    short:'Apr', start:'2026-02-09', end:'2026-03-08' },
  { month:'May 2026',      short:'May', start:'2026-03-09', end:'2026-04-12' },
  { month:'June 2026',     short:'Jun', start:'2026-04-13', end:'2026-05-10' },
  { month:'July 2026',     short:'Jul', start:'2026-05-11', end:'2026-06-07' },
  { month:'August 2026',   short:'Aug', start:'2026-06-08', end:'2026-07-12' },
  { month:'September 2026',short:'Sep', start:'2026-07-13', end:'2026-08-09' },
  { month:'October 2026',  short:'Oct', start:'2026-08-10', end:'2026-09-06' },
  { month:'November 2026', short:'Nov', start:'2026-09-07', end:'2026-10-11' },
  { month:'December 2026', short:'Dec', start:'2026-10-12', end:'2026-11-08' },
  { month:'January 2027',  short:'Jan', start:'2026-11-09', end:'2026-12-06' },
  { month:'February 2027', short:'Feb', start:'2026-12-07', end:'2027-01-10' },
  { month:'March 2027',    short:'Mar', start:'2027-01-11', end:'2027-02-07' },
];

// ─── pay rates ────────────────────────────────────────────────────────────────
// Pre-Sept salaries are post ÷ 1.035 (3.5% pay rise from 1 Sep 2026).
// PC 1-3 pre-Sept use their own back-calculated figures (not Year 3 mapping).
const PAY_RATES = {
  Constable: {
    'PC 1': {
      salary: { pre:31159, post:32255 },
      pre:    { base:14.95, r133:19.88, r150:22.43, r200:29.89 },
      post:   { base:15.47, r133:20.58, r150:23.21, r200:30.94 },
    },
    'PC 2': {
      salary: { pre:32470, post:33609 },
      pre:    { base:15.57, r133:20.72, r150:23.36, r200:31.15 },
      post:   { base:16.12, r133:21.44, r150:24.18, r200:32.24 },
    },
    'PC 3': {
      salary: { pre:33786, post:34972 },
      pre:    { base:16.20, r133:21.55, r150:24.31, r200:32.41 },
      post:   { base:16.77, r133:22.30, r150:25.16, r200:33.54 },
    },
    'PC 4': {
      salary: { pre:35104, post:36335 },
      pre:    { base:16.86, r133:22.43, r150:25.24, r200:33.65 },
      post:   { base:17.42, r133:23.17, r150:26.13, r200:34.84 },
    },
    'PC 5': {
      salary: { pre:37737, post:39058 },
      pre:    { base:18.13, r133:24.11, r150:27.13, r200:36.17 },
      post:   { base:18.73, r133:24.91, r150:28.10, r200:37.46 },
    },
    'PC 6': {
      salary: { pre:43036, post:44544 },
      pre:    { base:20.68, r133:27.50, r150:30.94, r200:41.25 },
      post:   { base:21.36, r133:28.41, r150:32.04, r200:42.72 },
    },
    'PC 7 (top)': {
      salary: { pre:50255, post:52015 },
      pre:    { base:24.14, r133:32.11, r150:36.13, r200:48.17 },
      post:   { base:24.94, r133:33.17, r150:37.41, r200:49.88 },
    },
  },
  Sergeant: {
    'SGT 2 (on promotion)': {
      salary: { pre:53567, post:55443 },
      pre:    { base:25.73, r133:34.23, r150:38.51, r200:51.34 },
      post:   { base:26.59, r133:35.36, r150:39.89, r200:53.18 },
    },
    'SGT 3': {
      salary: { pre:54659, post:56573 },
      pre:    { base:26.26, r133:34.93, r150:39.29, r200:52.39 },
      post:   { base:27.13, r133:36.08, r150:40.70, r200:54.26 },
    },
    'SGT 4 (top)': {
      salary: { pre:56206, post:58175 },
      pre:    { base:27.01, r133:35.92, r150:40.40, r200:53.87 },
      post:   { base:27.90, r133:37.11, r150:41.85, r200:55.80 },
    },
  },
};

const PA_RATES   = { None:0, PA1:40, PA2:90, PA3:125 };
const PA_LABELS  = { None:'—', PA1:'£40', PA2:'£90', PA3:'£125' };

// ─── Met Police allowances ────────────────────────────────────────────────────
const LONDON_WEIGHTING = { pre:3150, post:3260 }; // pre/post 1 Sep 2026
const LONDON_ALLOWANCE = 6588;                     // fixed p.a.

// ─── UK income tax bands (2026/27) ────────────────────────────────────────────
// Used for the whole-year aggregate figure (Home dashboard top card), where a
// proper progressive stack across bands is correct since that total naturally
// spans from £0.
const calcUKIncomeTax = annualGross => {
  let pa = 12570;
  if (annualGross > 100000) pa = Math.max(0, 12570 - Math.floor((annualGross - 100000) / 2));
  const taxable = Math.max(0, annualGross - pa);
  let tax = 0;
  if (taxable > 0)      tax += Math.min(taxable, 37700)          * 0.20;
  if (taxable > 37700)  tax += Math.min(taxable - 37700, 74870)  * 0.40;
  if (taxable > 112570) tax += (taxable - 112570)                * 0.45;
  return tax;
};

// Named bands, used to tell the person plainly which bracket their overtime/PA
// lands in, rather than a blended "effective %" figure.
const TAX_BANDS = [
  { name:'Personal Allowance', min:0,      rate:0  },
  { name:'Basic Rate',         min:12570,  rate:20 },
  { name:'Higher Rate',        min:50270,  rate:40 },
  { name:'Additional Rate',    min:125140, rate:45 },
];
const getTaxBand = cumulativeGross => {
  let band = TAX_BANDS[0];
  for (const b of TAX_BANDS) { if (cumulativeGross >= b.min) band = b; else break; }
  return band;
};

// Calculates the actual tax due on a slice of income stacked on top of what's
// already been earned this FY — correctly split across bands exactly as the
// UK tax system works (e.g. if this slice crosses from Basic into Higher Rate,
// only the portion above the threshold is taxed at 40%, not the whole slice).
// bandName reflects the band this slice finishes in, for a clean label.
const applyBandTax = (cumulativeBefore, amount) => {
  if (amount <= 0) return { tax:0, net:0, rate:0, bandName:null };
  const taxBefore = calcUKIncomeTax(cumulativeBefore);
  const taxAfter  = calcUKIncomeTax(cumulativeBefore + amount);
  const tax  = taxAfter - taxBefore;
  const band = getTaxBand(cumulativeBefore + amount);
  return { tax, net: amount - tax, rate: (tax / amount) * 100, bandName: band.name };
};

// Splits an amount of income into the portions that fall within each tax band,
// exactly as UK progressive tax works (e.g. the first £X at 0%, next £Y at 20%,
// remainder at 40%). Used to break overtime hours down by which band they fall in.
const splitAcrossBands = (cumulativeBefore, amount) => {
  let remaining = amount, cursor = cumulativeBefore;
  const portions = [];
  for (let i=0; i<TAX_BANDS.length && remaining>0.005; i++){
    const bandMin = TAX_BANDS[i].min;
    const bandMax = i+1<TAX_BANDS.length ? TAX_BANDS[i+1].min : Infinity;
    if (cursor >= bandMax) continue;
    const capacity = bandMax - Math.max(cursor, bandMin);
    const take = Math.min(remaining, capacity);
    if (take > 0.005) {
      portions.push({ name:TAX_BANDS[i].name, rate:TAX_BANDS[i].rate, amount:take });
      cursor += take; remaining -= take;
    }
  }
  return portions;
};

const daysInclusive = (a,b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

// ─── UK tax year (6 April – 5 April) ───────────────────────────────────────────
// This is what actually governs personal allowance/tax band resets — it's
// different from the force's own pay-year (which starts 9 Feb per PAY_PERIODS
// above). For anything tax-related we anchor to the REAL tax year, not the
// pay-year.
const getUKTaxYearStart = dateStr => {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const apr6ThisYear = `${y}-04-06`;
  return dateStr >= apr6ThisYear ? apr6ThisYear : `${y-1}-04-06`;
};
const addYearMinusOneDay = dateStr => {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear()+1);
  d.setDate(d.getDate()-1);
  return d.toISOString().split('T')[0];
};

// Salary (and similar annual amounts like London Weighting/Allowance) is paid
// monthly in the real world, not smoothly by the day. This accrues a full
// month's pay for every calendar month that's fully completed within the
// given range, and pro-rates only the partially-completed edge months —
// so the YTD figure steps up once per payday rather than creeping up daily.
const monthlySteppedAmount = (annualAmount, rangeStartStr, rangeEndStr) => {
  if (!rangeStartStr || !rangeEndStr || rangeEndStr < rangeStartStr) return 0;
  const monthly = annualAmount / 12;
  const rangeStart = new Date(rangeStartStr);
  const rangeEnd   = new Date(rangeEndStr);
  let total = 0;
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor <= rangeEnd) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd   = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0);
    const daysInMonth = monthEnd.getDate();
    const clipStart = monthStart < rangeStart ? rangeStart : monthStart;
    const clipEnd   = monthEnd > rangeEnd ? rangeEnd : monthEnd;
    if (clipEnd >= clipStart) {
      const isFullMonth = clipStart.getTime()===monthStart.getTime() && clipEnd.getTime()===monthEnd.getTime();
      if (isFullMonth) {
        total += monthly;
      } else {
        const daysCounted = Math.round((clipEnd - clipStart)/86400000) + 1;
        total += monthly * (daysCounted / daysInMonth);
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  }
  return total;
};

// Same monthly-stepped accrual, but split at the 1 Sep 2026 pay rise so each
// side uses its own annual rate.
const monthlySteppedSplitBySept = (annualPre, annualPost, rangeStartStr, rangeEndStr) => {
  if (!rangeStartStr || !rangeEndStr || rangeEndStr < rangeStartStr) return 0;
  if (rangeEndStr < RATE_CHANGE_DATE)   return monthlySteppedAmount(annualPre, rangeStartStr, rangeEndStr);
  if (rangeStartStr >= RATE_CHANGE_DATE) return monthlySteppedAmount(annualPost, rangeStartStr, rangeEndStr);
  const d = new Date(RATE_CHANGE_DATE); d.setDate(d.getDate()-1);
  const dayBeforeChange = d.toISOString().split('T')[0];
  return monthlySteppedAmount(annualPre, rangeStartStr, dayBeforeChange) + monthlySteppedAmount(annualPost, RATE_CHANGE_DATE, rangeEndStr);
};

// Salary + London Weighting + London Allowance for one pay period, pro-rated
// across the 1 Sep 2026 rate change if the period spans it.
const periodBaseAmount = (p, svcData) => {
  const totalDays = daysInclusive(p.start, p.end);
  let preDays, postDays;
  if (p.end < RATE_CHANGE_DATE) { preDays = totalDays; postDays = 0; }
  else if (p.start >= RATE_CHANGE_DATE) { preDays = 0; postDays = totalDays; }
  else {
    const d = new Date(RATE_CHANGE_DATE); d.setDate(d.getDate() - 1);
    preDays  = daysInclusive(p.start, d.toISOString().split('T')[0]);
    postDays = totalDays - preDays;
  }
  const salary = svcData ? (preDays/365)*svcData.salary.pre + (postDays/365)*svcData.salary.post : 0;
  const lw     = (preDays/365)*LONDON_WEIGHTING.pre + (postDays/365)*LONDON_WEIGHTING.post;
  const la     = (totalDays/365)*LONDON_ALLOWANCE;
  return salary + lw + la;
};

// ─── rate helper ──────────────────────────────────────────────────────────────
// Returns the correct rate set for a given pay point and entry date.
const getRates = (rank, service, date) => {
  const empty = { base:0, r133:0, r150:0, r200:0 };
  if (!rank || !service || !date) return empty;
  const grp = PAY_RATES[rank];
  if (!grp) return empty;
  const svc = grp[service];
  if (!svc) return empty;
  return date >= RATE_CHANGE_DATE ? svc.post : svc.pre;
};

// ─── storage ──────────────────────────────────────────────────────────────────
const KEYS = {
  entries:'ajs_ot_entries', settings:'ajs_ot_settings',
  savedAt:'ajs_ot_savedAt', backupCount:'ajs_ot_backupCount', backedUpAt:'ajs_ot_backedUpAt',
  lastBackupReminder:'ajs_ot_lastBackupReminder',
};
const dualWrite = (key, val) => {
  const s = JSON.stringify(val);
  try { localStorage.setItem(key,s); }   catch(_){}
  try { sessionStorage.setItem(key,s); } catch(_){}
};
const dualRead = (key, fb) => {
  try { const v=localStorage.getItem(key);   if(v) return JSON.parse(v); } catch(_){}
  try { const v=sessionStorage.getItem(key); if(v) return JSON.parse(v); } catch(_){}
  return fb;
};

// Migrate settings if they contain old rank names from a previous version
const migrateSettings = s => {
  const def = { rank:'', service:'' };
  if (!s) return def;
  const validRanks = Object.keys(PAY_RATES);
  if (!validRanks.includes(s.rank)) return def;
  const validServices = Object.keys(PAY_RATES[s.rank]||{});
  if (!validServices.includes(s.service)) return def;
  return { rank:s.rank, service:s.service };
};

// ─── icon component ───────────────────────────────────────────────────────────
const Ico = ({ n, s=20, c, w=2 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c||'currentColor'}
       strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
    {n==='home'  &&<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}
    {n==='plus'  &&<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
    {n==='cog'   &&<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>}
    {n==='edit'  &&<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>}
    {n==='trash' &&<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>}
    {n==='save'  &&<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>}
    {n==='clock' &&<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}
    {n==='cR'    &&<polyline points="9 18 15 12 9 6"/>}
    {n==='cD'    &&<polyline points="6 9 12 15 18 9"/>}
    {n==='cal'   &&<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
    {n==='bar'   &&<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>}
    {n==='uPlus' &&<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>}
    {n==='check' &&<polyline points="20 6 9 17 4 12"/>}
    {n==='shield'&&<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>}
    {n==='trend' &&<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>}
    {n==='tUp'   &&<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>}
    {n==='pound' &&<><line x1="8" y1="12" x2="16" y2="12"/><path d="M7 19h10M6 5C6 3.3 7.3 2 9 2h6a3 3 0 0 1 3 3 4 4 0 0 1-4 4H6"/><line x1="6" y1="9" x2="6" y2="19"/></>}
    {n==='back'  &&<><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>}
    {n==='undo'  &&<><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.31"/></>}
    {n==='x'     &&<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
    {n==='dl'    &&<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>}
    {n==='ul'    &&<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>}
    {n==='moon'  &&<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>}
    {n==='mail'  &&<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></>}
    {n==='table' &&<><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></>}
    {n==='bell'  &&<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}
  </svg>
);

// ─── toast stack ──────────────────────────────────────────────────────────────
function ToastStack({ toasts }) {
  return (
    <div style={{position:'absolute',bottom:'80px',left:'50%',transform:'translateX(-50%)',zIndex:999,display:'flex',flexDirection:'column',gap:'7px',width:'calc(100% - 24px)',maxWidth:'390px',pointerEvents:'none'}}>
      {toasts.map(t=>(
        <div key={t.id} style={{background:t.type==='undo'?'#1e3a5f':t.type==='warn'?'#78350f':'#065f46',color:'#fff',borderRadius:'14px',padding:'11px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',boxShadow:'0 4px 20px rgba(0,0,0,0.22)',animation:'su 0.22s ease',pointerEvents:'all'}}>
          <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
            <Ico n={t.type==='undo'?'undo':t.type==='warn'?'bell':'check'} s={15} c="#fff"/>
            <span style={{fontSize:'13px',fontWeight:700}}>{t.message}</span>
          </div>
          {t.action&&<button onClick={t.action.fn} style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:'8px',padding:'4px 10px',color:'#fff',fontWeight:900,fontSize:'11px',cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase',letterSpacing:'0.5px',whiteSpace:'nowrap'}}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

// ─── app ──────────────────────────────────────────────────────────────────────
export default function App() {
  const todayStr      = new Date().toISOString().split('T')[0];
  const currPeriodIdx = PAY_PERIODS.findIndex(p=>todayStr>=p.start&&todayStr<=p.end);

  const [tab,          setTab]          = useState('dashboard');
  const [entries,      setEntries]      = useState(()=>dualRead(KEYS.entries,[]));
  const [settings,     setSettings]     = useState(()=>migrateSettings(dualRead(KEYS.settings,null)));
  const [expanded,     setExpanded]     = useState(null);
  const [editing,      setEditing]      = useState(null);
  const [wipeConf,     setWipeConf]     = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(null);
  const [toasts,       setToasts]       = useState([]);
  const [savedBadge,   setSavedBadge]   = useState(false);
  const [lastSaved,    setLastSaved]    = useState(()=>dualRead(KEYS.savedAt,null));
  const [lastBackedUp, setLastBackedUp] = useState(()=>dualRead(KEYS.backedUpAt,null));
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [pulseBackupBtn, setPulseBackupBtn] = useState(false);

  const mainRef   = useRef(null);
  const fileRef   = useRef(null);
  const monthRefs = useRef({});

  const blankForm = { date:todayStr, reason:'', hours133:'', hours150:'', hours200:'', nightWorkHours:'', nightHours:'', paRate:'None', comments:'' };
  const [form, setForm] = useState(blankForm);

  // ── persist ────────────────────────────────────────────────────────────────
  useEffect(()=>{
    dualWrite(KEYS.entries,entries);
    const now=Date.now(); dualWrite(KEYS.savedAt,now); setLastSaved(now);
  },[entries]);
  useEffect(()=>{ dualWrite(KEYS.settings,settings); },[settings]);
  useEffect(()=>{ if(mainRef.current) mainRef.current.scrollTop=0; },[tab]);

  // ── snap zoom back to default when switching tabs ───────────────────────────
  // Pinch-zoom is allowed while browsing a tab. When the person switches tabs,
  // this forces the browser to reprocess the viewport at scale=1. Simply
  // mutating the meta tag's content attribute in place is often ignored by
  // mobile browsers if they judge nothing "changed" — removing the tag from
  // the DOM and reinserting it forces a genuine reprocess, which is the more
  // reliable version of this technique. Held briefly before restoring the
  // zoomable viewport so pinch still works next time.
  useEffect(()=>{
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport || !viewport.parentNode) return;
    const parent = viewport.parentNode;
    const zoomable = 'width=device-width,initial-scale=1.0,maximum-scale=5.0,user-scalable=yes';
    const locked   = 'width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no';

    const forceReprocess = content => {
      parent.removeChild(viewport);
      viewport.setAttribute('content', content);
      parent.appendChild(viewport);
    };

    forceReprocess(locked);
    window.scrollTo(0,0);
    const t = setTimeout(()=>{ forceReprocess(zoomable); }, 450);
    return ()=>clearTimeout(t);
  },[tab]);

  // ── 14-day backup reminder ───────────────────────────────────────────────────
  // Optional and dismissible — never blocks the app. Fires roughly every 14
  // days, measured from whichever happened more recently: an actual backup,
  // or the last time this reminder was shown/dismissed. First-ever use just
  // sets a baseline rather than nagging immediately.
  useEffect(()=>{
    if (entries.length === 0) return;
    const REMINDER_INTERVAL = 14*24*60*60*1000;
    const lastReminder = dualRead(KEYS.lastBackupReminder, null);
    const lastBackup   = dualRead(KEYS.backedUpAt, null);
    const baseline = Math.max(lastReminder||0, lastBackup||0);
    if (baseline === 0) { dualWrite(KEYS.lastBackupReminder, Date.now()); return; }
    if (Date.now() - baseline >= REMINDER_INTERVAL) setShowBackupReminder(true);
  },[]);

  const dismissBackupReminder = () => {
    dualWrite(KEYS.lastBackupReminder, Date.now());
    setShowBackupReminder(false);
  };

  const goBackupNow = () => {
    dualWrite(KEYS.lastBackupReminder, Date.now());
    setShowBackupReminder(false);
    setTab('settings');
    setPulseBackupBtn(true);
    setTimeout(()=>setPulseBackupBtn(false), 6000);
  };

  // ── toasts ─────────────────────────────────────────────────────────────────
  const addToast = useCallback((msg,type='success',action=null,dur=3500)=>{
    const id=Date.now()+Math.random();
    setToasts(t=>[...t,{id,message:msg,type,action}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),dur);
  },[]);

  const saveSett = s=>{ setSettings(s); setSavedBadge(true); setTimeout(()=>setSavedBadge(false),2200); };

  // ── entry calculator ───────────────────────────────────────────────────────
  // Returns the gross pay components for a single entry using date-correct rates.
  // Net is NOT calculated here — tax is applied per pay period on a cumulative
  // marginal basis (see periodBreakdown in totals below), since a flat personal
  // tax rate can't correctly reflect where each pound sits in the tax bands.
  const calcEntry = useCallback((e)=>{
    const r  = getRates(settings.rank, settings.service, e.date);
    const h1 = parseFloat(e.hours133)||0;
    const h2 = parseFloat(e.hours150)||0;
    const h3 = parseFloat(e.hours200)||0;
    const nh = parseFloat(e.nightHours)||0;
    const ot    = h1*r.r133 + h2*r.r150 + h3*r.r200;
    const night = nh * r.base * 0.10;          // 10% of base rate per night hour
    const pa    = PA_RATES[e.paRate]||0;
    const gross = ot + night + pa;
    return { h1, h2, h3, nh, ot, night, pa, gross, r };
  },[settings]);

  // ── derived totals ─────────────────────────────────────────────────────────
  const fyEntries = useMemo(()=>entries.filter(e=>e.date>=FY_START&&e.date<=FY_END),[entries]);

  const totals = useMemo(()=>{
    const svcData = settings.rank && settings.service ? PAY_RATES[settings.rank]?.[settings.service] : null;

    // ── build the period-by-period cumulative marginal cascade ────────────────
    // For each period, in chronological order: add salary+LW+LA, then layer this
    // period's overtime, then night enhancement, then PA on top of the running
    // cumulative total. Each layer's tax is the difference in cumulative tax
    // before/after it — i.e. the true marginal rate for that slice of income.
    let cum = 0;
    let totalGross=0, totalHrs=0;
    const periodBreakdown = PAY_PERIODS.map(p=>{
      const pE = fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
      let ot=0, night=0, pa=0, hrs=0;
      pE.forEach(e=>{
        const c=calcEntry(e);
        ot+=c.ot; night+=c.night; pa+=c.pa; hrs+=c.h1+c.h2+c.h3;
      });

      const baseAmt = periodBaseAmount(p, svcData);
      cum += baseAmt;
      const otResult = applyBandTax(cum, ot);       cum += ot;
      const nightResult = applyBandTax(cum, night); cum += night;
      const paResult = applyBandTax(cum, pa);       cum += pa;

      totalGross += ot+night+pa; totalHrs += hrs;

      return {
        month:p.month, start:p.start, end:p.end,
        baseAmt, ot, night, pa,
        otResult, nightResult, paResult,
        combinedGross: ot+night+pa,
        combinedNet: otResult.net+nightResult.net+paResult.net,
        cumAfter: cum,
      };
    });

    const totalNet = periodBreakdown.reduce((s,pb)=>s+pb.combinedNet,0);

    const getP=i=>{
      if(i<0||i>=periodBreakdown.length) return null;
      const pb=periodBreakdown[i];
      return{month:pb.month,start:pb.start,end:pb.end,gross:pb.combinedGross,net:pb.combinedNet};
    };

    const cumData = periodBreakdown.map(pb=>({short:PAY_PERIODS.find(p=>p.month===pb.month).short,cumulative:pb.cumAfter}));

    // ── salary + allowances YTD (for the top Home summary card) ───────────────
    // Anchored to the REAL UK tax year (6 Apr – 5 Apr), not the force's pay
    // year (which starts 9 Feb) — HMRC resets personal allowance/bands on
    // 6 April regardless of when the police pay calendar happens to start.
    // Salary/allowances accrue in proper monthly instalments (stepping up
    // once per completed month) rather than a smooth daily creep.
    const todayD      = new Date(todayStr);
    const fyStartD    = new Date(FY_START);
    const fyEndD      = new Date(FY_END);
    const effectiveEnd = todayD <= fyEndD ? todayD : fyEndD;
    const daysElapsed  = Math.max(0, (effectiveEnd - fyStartD) / 86400000); // still used for "days into FY" label (police pay-year)

    const taxYearStart = getUKTaxYearStart(todayStr);
    const taxYearEnd    = addYearMinusOneDay(taxYearStart);
    const ytdRangeEnd   = todayStr <= taxYearEnd ? todayStr : taxYearEnd;
    const taxYearDaysElapsed = Math.max(0, (new Date(ytdRangeEnd) - new Date(taxYearStart)) / 86400000);

    const salaryYTD = svcData ? monthlySteppedSplitBySept(svcData.salary.pre, svcData.salary.post, taxYearStart, ytdRangeEnd) : 0;
    const lwYTD     = monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, taxYearStart, ytdRangeEnd);
    const laYTD     = monthlySteppedAmount(LONDON_ALLOWANCE, taxYearStart, ytdRangeEnd);

    // Overtime/PA actually earned so far THIS TAX YEAR — excludes future-dated
    // "Planned" entries, and excludes anything dated before the tax year
    // started (which belongs to the previous tax year's allowance/bands).
    let otPaidToDate = 0, otNightPaidToDate = 0, hrsToDate = 0;
    fyEntries.forEach(e=>{
      if (e.date >= taxYearStart && e.date <= todayStr) {
        const c = calcEntry(e);
        otPaidToDate += c.gross;
        otNightPaidToDate += c.ot + c.night; // hourly-earned only, excludes flat PA
        hrsToDate += c.h1 + c.h2 + c.h3;
      }
    });

    // Break the to-date overtime/night money down by which tax band it falls
    // in (stacked on top of salary+allowances), then convert each band's
    // portion back to hours using the blended average £/hr for that money.
    const avgHourlyRate = hrsToDate > 0 ? otNightPaidToDate / hrsToDate : 0;
    const hoursByBand = splitAcrossBands(salaryYTD+lwYTD+laYTD, otNightPaidToDate)
      .map(b => ({ ...b, hours: avgHourlyRate > 0 ? b.amount / avgHourlyRate : 0 }));

    // Full UK tax year totals (for showing "earned so far / full year" progress),
    // matching the same tax-year window and monthly-stepped method as above.
    const lwAnnualTotal = monthlySteppedSplitBySept(LONDON_WEIGHTING.pre, LONDON_WEIGHTING.post, taxYearStart, taxYearEnd);
    const laAnnualTotal = monthlySteppedAmount(LONDON_ALLOWANCE, taxYearStart, taxYearEnd);

    const combinedGrossYTD = salaryYTD + lwYTD + laYTD + otPaidToDate;

    // Tax on what's actually been earned so far this FY — no projection or
    // extrapolation. This is deliberate: projecting a single early/large
    // shift out to "if this continued for 365 days" wildly overstates the
    // tax band. Using real cumulative money against the real annual
    // thresholds means the band only moves once you've genuinely earned
    // past that threshold — exactly like a payslip.
    const ytdTax         = calcUKIncomeTax(combinedGrossYTD);
    const combinedNetYTD = combinedGrossYTD - ytdTax;

    const currentBand   = getTaxBand(combinedGrossYTD);
    const taxBand        = currentBand.name;
    const taxBandRate    = currentBand.rate;

    return{
      totalGross, totalNet, totalHrs, cumData, periodBreakdown,
      prev:getP(currPeriodIdx-1), curr:getP(currPeriodIdx), next:getP(currPeriodIdx+1),
      salaryYTD, lwYTD, laYTD, lwAnnualTotal, laAnnualTotal, combinedGrossYTD, combinedNetYTD,
      ytdTax, taxBand, taxBandRate, daysElapsed, taxYearDaysElapsed, taxYearStart, hoursByBand,
    };
  },[fyEntries,calcEntry,settings,currPeriodIdx,todayStr]);

  // ── live form preview ──────────────────────────────────────────────────────
  // Shows the net for this shift as if logged right now — using the tax band
  // that applies once this shift's total is added to everything already
  // earned this FY (salary, allowances, other OT/PA).
  const preview = useMemo(()=>{
    const r  = getRates(settings.rank, settings.service, form.date||todayStr);
    const h1 = parseFloat(form.hours133)||0;
    const h2 = parseFloat(form.hours150)||0;
    const h3 = parseFloat(form.hours200)||0;
    const nh = parseFloat(form.nightHours)||0;
    const ot    = h1*r.r133 + h2*r.r150 + h3*r.r200;
    const night = nh * r.base * 0.10;
    const pa    = PA_RATES[form.paRate]||0;
    const gross = ot + night + pa;
    const result = applyBandTax(totals.combinedGrossYTD, gross);
    return { gross, net:result.net, rate:result.rate, bandName:result.bandName, night, has:gross>0 };
  },[form, settings, todayStr, totals.combinedGrossYTD]);

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleSave=()=>{
    if(!form.date) return;
    if(editing){
      setEntries(entries.map(e=>e.id===editing.id?{...form,id:e.id}:e));
      setTab('months'); addToast('Record updated');
    } else {
      setEntries(prev=>[...prev,{...form,id:Date.now().toString()}]);
      addToast('Shift logged ✓');
      // nudge backup every 5 entries
      const count=(dualRead(KEYS.backupCount,0)||0)+1;
      dualWrite(KEYS.backupCount,count);
      if(count%5===0) setTimeout(()=>addToast(`${count} records logged — download a backup?`,'warn',{label:'Backup now',fn:handleExport},8000),800);
      if(mainRef.current) mainRef.current.scrollTop=0;
    }
    setForm({...blankForm,date:todayStr}); setEditing(null);
  };

  const startEdit=e=>{ setForm(e); setEditing(e); setTab('add'); };
  const delEntry=id=>{
    const d=entries.find(e=>e.id===id);
    setEntries(prev=>prev.filter(x=>x.id!==id));
    setConfirmDel(null);
    addToast('Record deleted','undo',{label:'Undo',fn:()=>setEntries(prev=>[...prev,d])},5000);
  };

  // Standard backup filename convention: OTbackup + day + 3-letter month + 2-digit year
  // e.g. 18 July 2026 -> "OTbackup18Jul26"
  const backupFileStamp = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2,'0');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const year = String(d.getFullYear()).slice(-2);
    return `${day}${months[d.getMonth()]}${year}`;
  };

  function handleExport(){
    const now=Date.now();
    const s="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify({entries,settings,exportedAt:new Date().toISOString()}));
    Object.assign(document.createElement('a'),{href:s,download:`OTbackup${backupFileStamp()}.json`}).click();
    dualWrite(KEYS.backupCount,0); dualWrite(KEYS.backedUpAt,now); setLastBackedUp(now);
    dualWrite(KEYS.lastBackupReminder,now); setPulseBackupBtn(false);
    addToast('Backup downloaded ✓');
  }

  // Exports all logged shifts as a CSV — opens directly in Excel/Google Sheets/Numbers.
  function handleExportCSV(){
    const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
    const headers = [
      'Date','Duty/Reason','1.33x Hours','1.5x Hours','2.0x Hours',
      'Night Hours (Enhanced)','PA Rate','Gross (£)','Net (£)','Rate Applied','Notes'
    ];
    const sorted = [...entries].sort((a,b)=>new Date(a.date)-new Date(b.date));
    const rows = sorted.map(e=>{
      const c = calcEntry(e);
      // Approximate the applicable band for this single entry using cumulative
      // earnings up to (and including) it, consistent with the rest of the app.
      const prior = entries.filter(x=>x.date<e.date || (x.date===e.date && x.id<e.id))
        .reduce((sum,x)=>sum+calcEntry(x).gross,0);
      const result = applyBandTax(prior, c.gross);
      return [
        e.date, e.reason||'', c.h1||'', c.h2||'', c.h3||'',
        c.nh||'', e.paRate!=='None'?e.paRate:'',
        c.gross.toFixed(2), result.net.toFixed(2),
        result.bandName ? `${result.bandName} (${result.rate.toFixed(1)}%)` : '',
        e.comments||''
      ].map(esc).join(',');
    });
    const csv = [headers.map(esc).join(','), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'),{href:url,download:`AJS_OT_Records_${new Date().toISOString().split('T')[0]}.csv`}).click();
    URL.revokeObjectURL(url);
    addToast('CSV exported ✓');
  }

  const handleImport=ev=>{
    const fr=new FileReader();
    fr.onload=e=>{ const d=JSON.parse(e.target.result); setEntries(d.entries); setSettings(migrateSettings(d.settings)); setTab('dashboard'); addToast('Backup restored'); };
    fr.readAsText(ev.target.files[0]);
  };

  const handleWipe=()=>{ setEntries([]); saveSett({rank:'',service:''}); setWipeConf(false); setTab('dashboard'); };

  const jumpTo=month=>{ setExpanded(month); setTimeout(()=>monthRefs.current[month]?.scrollIntoView({behavior:'smooth',block:'start'}),80); };

  // ── display helpers ────────────────────────────────────────────────────────
  const fmt    = n=>`£${n.toFixed(2)}`;
  const fmtGBP = n=>`£${n.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtD   = d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const fmtBackedUp=ts=>{
    if(!ts) return null;
    const diff=Math.floor((Date.now()-ts)/1000);
    const date=new Date(ts), today=new Date();
    if(diff<60) return 'Just now';
    if(date.toDateString()===today.toDateString()) return date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    if(date.toDateString()===new Date(today-86400000).toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  };

  // Today's effective rates were shown on Home; now only surfaced in Settings.

  // ── styles ─────────────────────────────────────────────────────────────────
  const S={
    wrap: {display:'flex',flexDirection:'column',height:'100dvh',maxWidth:'430px',margin:'0 auto',background:'#f8fafc',fontFamily:"'DM Sans',system-ui,sans-serif",color:'#0f172a',position:'relative',boxShadow:'0 0 60px rgba(0,0,0,0.14)',overflow:'hidden'},
    hdr:  {background:'#fff',padding:'13px 18px',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,zIndex:10},
    main: {flex:1,overflowY:'auto',scrollbarWidth:'none',msOverflowStyle:'none'},
    nav:  {background:'rgba(255,255,255,0.96)',backdropFilter:'blur(14px)',borderTop:'1px solid #e2e8f0',position:'absolute',bottom:0,width:'100%',padding:'7px 4px 12px',display:'flex',justifyContent:'space-between',alignItems:'center',zIndex:20},
    nBtn: (a,add)=>({display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',padding:add?'9px 11px':'6px 8px',background:add?'#10b981':'transparent',color:add?'#fff':a?'#2563eb':'#94a3b8',borderRadius:add?'13px':'8px',border:'none',cursor:'pointer',transition:'all 0.18s',fontFamily:'inherit',boxShadow:add?'0 4px 14px rgba(16,185,129,0.4)':'none'}),
    nLbl: {fontSize:'8px',fontWeight:900,textTransform:'uppercase',letterSpacing:'0.5px'},
    card: {background:'#fff',borderRadius:'18px',padding:'18px',boxShadow:'0 1px 6px rgba(0,0,0,0.05)',border:'1px solid #f1f5f9',marginBottom:'10px'},
    dark: {background:'#0f2744',borderRadius:'18px',padding:'22px',boxShadow:'0 8px 28px rgba(15,39,68,0.28)',marginBottom:'10px',position:'relative',overflow:'hidden'},
    lbl:  {display:'block',fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'7px'},
    inp:  {width:'100%',background:'#f8fafc',border:'none',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'16px',outline:'none',fontFamily:'inherit',boxSizing:'border-box',color:'#0f172a'},
    ta:   {width:'100%',background:'#f8fafc',border:'none',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'16px',outline:'none',fontFamily:'inherit',resize:'none',boxSizing:'border-box',color:'#0f172a'},
    sel:  {width:'100%',background:'#f8fafc',border:'1px solid #e2e8f0',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'16px',outline:'none',fontFamily:'inherit',boxSizing:'border-box',color:'#0f172a',appearance:'none'},
  };

  return (
    <div style={S.wrap}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{display:none}
        @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes su{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes urgentPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(220,38,38,0);transform:scale(1)}25%{opacity:0.78;box-shadow:0 0 0 9px rgba(220,38,38,0.38);transform:scale(1.012)}50%{opacity:1;box-shadow:0 0 0 0 rgba(220,38,38,0);transform:scale(1)}75%{opacity:0.78;box-shadow:0 0 0 9px rgba(220,38,38,0.38);transform:scale(1.012)}}
        @keyframes backupPulse{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}30%{box-shadow:0 0 0 8px rgba(37,99,235,0.35)}50%{box-shadow:0 0 0 0 rgba(37,99,235,0)}70%{box-shadow:0 0 0 8px rgba(37,99,235,0.35)}}
        .backup-pulse{animation:backupPulse 1.4s ease-in-out infinite}
        .fi{animation:fi 0.22s ease}
        .setup-pulse-urgent{animation:urgentPulse 1.5s ease-in-out infinite}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input:focus,select:focus,textarea:focus{outline:2px solid #2563eb;outline-offset:-2px}
        input,select,textarea{font-size:16px}
        button:active{opacity:0.8;transform:scale(0.96)}
        input[type=date]{-webkit-appearance:none;appearance:none;color-scheme:light;line-height:1.2}
        input[type=date]::-webkit-date-and-time-value{text-align:left}
        input[type=date]::-webkit-datetime-edit{padding:0}
        input[type=date]::-webkit-calendar-picker-indicator{background:transparent;cursor:pointer;opacity:0.55;padding:0;margin:0}
      `}</style>

      <ToastStack toasts={toasts}/>

      {/* ── header ── */}
      <header style={S.hdr}>
        <div style={{fontSize:'19px',fontWeight:900,background:'linear-gradient(135deg,#1e3a5f,#2563eb)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',display:'flex',alignItems:'center',gap:'8px',letterSpacing:'-0.5px'}}>
          <Ico n="pound" s={19} c="#2563eb" w={2.5}/>
          Overtime Tracker by AJS
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
          <div style={{width:'6px',height:'6px',borderRadius:'50%',background:lastBackedUp?'#10b981':'#f59e0b',flexShrink:0}}/>
          <span style={{fontSize:'9px',fontWeight:700,color:'#94a3b8',whiteSpace:'nowrap'}}>
            {lastBackedUp?`Backed up ${fmtBackedUp(lastBackedUp)}`:'Not backed up'}
          </span>
        </div>
      </header>

      {/* ── 14-day backup reminder — optional, dismissible, never blocks the app ── */}
      {showBackupReminder&&(
        <div className="fi" style={{background:'#eff6ff',borderBottom:'1px solid #bfdbfe',padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:'10px',flexShrink:0,zIndex:15}}>
          <div style={{background:'#dbeafe',borderRadius:'10px',padding:'7px',flexShrink:0}}><Ico n="shield" s={15} c="#2563eb"/></div>
          <div style={{flex:1}}>
            <div style={{fontWeight:900,fontSize:'12px',color:'#1e3a5f',marginBottom:'2px'}}>Time for a backup</div>
            <div style={{fontSize:'11px',color:'#3b82f6',lineHeight:1.4,marginBottom:'8px'}}>It's been a couple of weeks — worth downloading a fresh backup of your records.</div>
            <div style={{display:'flex',gap:'7px'}}>
              <button onClick={goBackupNow} style={{background:'#2563eb',border:'none',borderRadius:'8px',padding:'6px 13px',fontWeight:900,fontSize:'10px',color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Back Up Now</button>
              <button onClick={dismissBackupReminder} style={{background:'none',border:'none',padding:'6px 4px',fontWeight:700,fontSize:'10px',color:'#64748b',cursor:'pointer',fontFamily:'inherit'}}>Not now</button>
            </div>
          </div>
          <button onClick={dismissBackupReminder} style={{background:'none',border:'none',cursor:'pointer',padding:'2px',flexShrink:0}}><Ico n="x" s={15} c="#94a3b8"/></button>
        </div>
      )}

      <main ref={mainRef} style={S.main}>

        {/* ══════════════════════════════════════════ DASHBOARD */}
        {tab==='dashboard'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            {!settings.rank&&(
              <div className="setup-pulse-urgent" style={{background:'#fef2f2',border:'1.5px solid #fca5a5',borderRadius:'14px',padding:'13px 14px',marginBottom:'12px',display:'flex',gap:'11px',alignItems:'flex-start'}}>
                <Ico n="uPlus" s={19} c="#dc2626"/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:900,color:'#991b1b',fontSize:'13px',marginBottom:'3px'}}>Setup Required</div>
                  <div style={{color:'#b91c1c',fontSize:'12px',marginBottom:'8px'}}>Configure your rank and pay in Settings.</div>
                  <button onClick={()=>setTab('settings')} style={{background:'#fca5a5',border:'none',borderRadius:'8px',padding:'5px 11px',fontWeight:900,fontSize:'11px',color:'#7f1d1d',cursor:'pointer',fontFamily:'inherit'}}>Go to Settings →</button>
                </div>
              </div>
            )}

            {/* ── Total combined earnings card — the main/first card ── */}
            <div style={S.dark}>
              <div style={{position:'absolute',right:'-14px',top:'-14px',width:'72px',height:'72px',background:'rgba(255,255,255,0.04)',borderRadius:'50%'}}/>

              {/* header */}
              <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'3px'}}>
                Total Gross YTD (inc. base salary)
              </div>
              <div style={{fontSize:'38px',fontWeight:900,color:'#fff',letterSpacing:'-2px',marginBottom:'4px',lineHeight:1}}>
                {settings.rank&&settings.service ? fmtGBP(totals.combinedGrossYTD) : '—'}
              </div>
              <div style={{fontSize:'9px',fontWeight:700,color:'#94a3b8',marginBottom:'16px'}}>
                {settings.rank&&settings.service
                  ? `${Math.round(totals.taxYearDaysElapsed)} days into ${totals.taxYearStart.split('-')[0]}/${(parseInt(totals.taxYearStart.split('-')[0])+1).toString().slice(-2)} tax year`
                  : 'Set your rank & pay point in Settings'}
              </div>

              {/* breakdown rows — London Weighting/Allowance shown as YTD / full year */}
              <div style={{borderTop:'1px solid rgba(255,255,255,0.08)',paddingTop:'12px',marginBottom:'14px',display:'flex',flexDirection:'column',gap:'7px'}}>
                {[
                  ['Base Salary',      totals.salaryYTD, null],
                  ['London Weighting', settings.rank&&settings.service ? totals.lwYTD : null, totals.lwAnnualTotal],
                  ['London Allowance', settings.rank&&settings.service ? totals.laYTD : null, totals.laAnnualTotal],
                  ['Overtime & PA',    totals.totalGross, null],
                ].map(([label,val,fullYear])=>(
                  <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'11px',fontWeight:700,color:'#94a3b8'}}>{label}</span>
                    <span style={{fontSize:'11px',fontWeight:900,color:val==null?'#475569':'#cbd5e1'}}>
                      {val==null
                        ? 'Set rank & pay point'
                        : fullYear!=null
                          ? <>{fmtGBP(val)}<span style={{color:'#64748b',fontWeight:700}}> / {fmtGBP(fullYear)}</span></>
                          : fmtGBP(val)}
                    </span>
                  </div>
                ))}
              </div>

              {/* tax band indicator — net/tax figures are deliberately not shown here, since
                  this calculator doesn't account for pension, student loan or other deductions */}
              <div style={{background:'rgba(0,0,0,0.25)',borderRadius:'14px',padding:'12px 14px'}}>
                {settings.rank&&settings.service ? (
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'9px',fontWeight:700,color:'#64748b'}}>Current tax band:</span>
                    <span style={{fontSize:'9px',fontWeight:900,color:'#cbd5e1'}}>{totals.taxBand} · {totals.taxBandRate}%</span>
                  </div>
                ) : (
                  <div style={{textAlign:'center',padding:'6px 4px'}}>
                    <div style={{fontSize:'11px',fontWeight:700,color:'#64748b',lineHeight:1.5}}>Set your rank & pay point in Settings to see your current tax band.</div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Overtime-only summary card — sits directly under Total Gross YTD, lighter blue to distinguish ── */}
            <div style={{...S.card,background:'#2563eb',border:'none',marginBottom:'10px',boxShadow:'0 6px 20px rgba(37,99,235,0.28)'}}>
              <div style={{fontSize:'9px',fontWeight:900,color:'#dbeafe',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'10px'}}>Overtime & PA — FY 26/27</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
                <div>
                  <div style={{fontSize:'9px',fontWeight:900,color:'#bfdbfe',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'3px'}}>Gross OT</div>
                  <div style={{fontSize:'16px',fontWeight:900,color:'#fff'}}>{fmt(totals.totalGross)}</div>
                </div>
                <div>
                  <div style={{fontSize:'9px',fontWeight:900,color:'#bbf7d0',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'3px'}}>Net OT</div>
                  <div style={{fontSize:'16px',fontWeight:900,color:'#dcfce7'}}>{fmt(totals.totalNet)}</div>
                </div>
                <div>
                  <div style={{fontSize:'9px',fontWeight:900,color:'#bfdbfe',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'3px'}}>Hours</div>
                  <div style={{fontSize:'16px',fontWeight:900,color:'#fff',display:'flex',alignItems:'center',gap:'5px'}}><Ico n="clock" s={13} c="rgba(255,255,255,0.6)"/>{totals.totalHrs.toFixed(1)}</div>
                </div>
              </div>
            </div>

            {/* ── Pay period dates — simple date reference, full breakdowns live in the Breakdown tab ── */}
            <div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'8px',padding:'0 2px'}}>Pay Periods</div>
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {[totals.curr,totals.next,totals.prev].map((item,i)=>item&&(
                <div key={i} style={{...S.card,background:i===0?'#eff6ff':'#fff',border:i===0?'1px solid #bfdbfe':'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 17px',marginBottom:0}}>
                  <span style={{fontSize:'9px',fontWeight:900,color:i===0?'#2563eb':'#94a3b8',textTransform:'uppercase',letterSpacing:'1px'}}>{i===0?'Current':i===1?'Next':'Previous'} Pay Month</span>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:900,fontSize:'14px',color:'#0f172a'}}>{item.month}</div>
                    <div style={{fontSize:'10px',fontWeight:700,color:'#3b82f6'}}>{fmtD(item.start)} – {fmtD(item.end)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════ LOG SHIFT */}
        {tab==='add'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'160px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'18px'}}>
              {editing&&<button onClick={()=>{setEditing(null);setTab('months');}} style={{background:'#f1f5f9',border:'none',borderRadius:'10px',padding:'8px',cursor:'pointer',display:'flex'}}><Ico n="back" s={16}/></button>}
              <h2 style={{fontSize:'19px',fontWeight:900,color:'#0f172a',margin:0,letterSpacing:'-0.5px'}}>{editing?'Edit Record':'Log Shift'}</h2>
            </div>

            {!settings.rank||!settings.service ? (
              /* ── blocked until rank & pay point are configured — no figures can be entered until then ── */
              <div style={{background:'#fef2f2',border:'1.5px solid #fca5a5',borderRadius:'18px',padding:'26px 20px',textAlign:'center'}}>
                <div style={{width:'52px',height:'52px',borderRadius:'50%',background:'#fee2e2',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                  <Ico n="uPlus" s={24} c="#dc2626"/>
                </div>
                <div style={{fontWeight:900,fontSize:'15px',color:'#991b1b',marginBottom:'6px'}}>Setup Required</div>
                <div style={{fontSize:'12px',color:'#b91c1c',lineHeight:1.6,marginBottom:'16px'}}>You need to select your rank and pay point in Settings before you can log a shift. This ensures your pay is calculated correctly from the start.</div>
                <button onClick={()=>setTab('settings')} style={{background:'#dc2626',border:'none',borderRadius:'11px',padding:'12px 22px',fontWeight:900,fontSize:'12px',color:'#fff',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 14px rgba(220,38,38,0.3)'}}>Go to Settings →</button>
              </div>
            ) : (
            <>
            {/* date + duty */}
            <div style={S.card}>
              <div style={{marginBottom:'13px'}}><label style={S.lbl}>Date</label><input type="date" style={{...S.inp,display:'block',boxSizing:'border-box',height:'46px'}} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
              <div><label style={S.lbl}>Duty / Reason</label><input type="text" placeholder="e.g. MPL7XX, PXX" style={S.inp} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></div>
            </div>

            {/* overtime hours */}
            {(()=>{
              const formRates = getRates(settings.rank, settings.service, form.date||todayStr);
              return (
                <div style={{...S.card,background:'#eff6ff',border:'1px solid #dbeafe'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'#1e40af',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',marginBottom:'4px'}}>Overtime Hours</div>
                  <div style={{fontSize:'9px',fontWeight:600,color:'#64748b',textAlign:'center',marginBottom:'13px'}}>Record only the hours worked on overtime — not your whole shift</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'9px'}}>
                    {['hours133','hours150','hours200'].map((h,i)=>(
                      <div key={h} style={{textAlign:'center'}}>
                        <label style={{...S.lbl,color:'#3b82f6',textAlign:'center',display:'block'}}>{[1.33,1.5,2.0][i]}x</label>
                        <input type="number" step="0.25" placeholder="0" style={{...S.inp,textAlign:'center',fontWeight:900,background:'#fff',fontSize:'17px',padding:'11px 6px'}} value={form[h]} onChange={e=>setForm({...form,[h]:e.target.value})}/>
                        <div style={{fontSize:'9px',color:'#93c5fd',fontWeight:700,marginTop:'4px'}}>£{(formRates[['r133','r150','r200'][i]]||0).toFixed(2)}/hr</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* PA allowance */}
            <div style={{...S.card,background:'#fffbeb',border:'1px solid #fde68a'}}>
              <div style={{fontSize:'10px',fontWeight:900,color:'#92400e',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',marginBottom:'13px'}}>Protection Allowance</div>
              <div style={{display:'flex',gap:'6px'}}>
                {['None','PA1','PA2','PA3'].map(pa=>(
                  <button key={pa} onClick={()=>setForm({...form,paRate:pa})} style={{flex:1,paddingTop:'9px',paddingBottom:'9px',borderRadius:'11px',border:'none',fontFamily:'inherit',cursor:'pointer',transition:'all 0.14s',background:form.paRate===pa?'#f59e0b':'#fff',color:form.paRate===pa?'#fff':'#b45309',boxShadow:form.paRate===pa?'0 4px 11px rgba(245,158,11,0.38)':'none',display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                    <span style={{fontSize:'12px',fontWeight:900}}>{pa}</span>
                    <span style={{fontSize:'9px',fontWeight:700,opacity:form.paRate===pa?0.85:0.55}}>{PA_LABELS[pa]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* night hours — single input; every hour entered here is automatically
                subject to the 10% enhancement, no separate confirmation step */}
            {(()=>{
              const formRates = getRates(settings.rank, settings.service, form.date||todayStr);
              const nightRate = formRates.base * 0.10;
              const nightHrs  = parseFloat(form.nightHours)||0;
              return (
                <div style={{background:'#0f172a',borderRadius:'16px',padding:'16px',marginBottom:'10px',border:'1px solid #1e293b'}}>
                  {/* header */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                      <Ico n="moon" s={14} c="#818cf8"/>
                      <div style={{fontSize:'10px',fontWeight:900,color:'#c7d2fe',textTransform:'uppercase',letterSpacing:'1px'}}>Night Work (2000–0600)</div>
                    </div>
                    <div style={{fontSize:'9px',fontWeight:700,color:'#6366f1',background:'rgba(99,102,241,0.15)',padding:'3px 8px',borderRadius:'8px'}}>+10% / hr</div>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                    <div style={{background:'rgba(99,102,241,0.12)',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                      <div style={{fontSize:'9px',fontWeight:900,color:'#818cf8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'8px'}}>Hours worked</div>
                      <input
                        type="number" step="1" min="0" placeholder="0"
                        style={{width:'100%',boxSizing:'border-box',textAlign:'center',fontWeight:900,background:'#1e293b',fontSize:'20px',padding:'8px',color:'#e0e7ff',borderRadius:'10px',border:'none',outline:'none',fontFamily:'inherit'}}
                        value={form.nightHours}
                        onChange={e=>{ const v=e.target.value; setForm({...form, nightWorkHours:v, nightHours:v}); }}
                      />
                    </div>
                    <div style={{background:'rgba(99,102,241,0.12)',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                      <div style={{fontSize:'9px',fontWeight:900,color:'#818cf8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'8px'}}>Enhancement rate</div>
                      <div style={{background:'#1e293b',borderRadius:'10px',padding:'8px',fontSize:'20px',fontWeight:900,color:'#e0e7ff'}}>£{nightRate.toFixed(2)}<span style={{fontSize:'11px',fontWeight:700,color:'#6366f1'}}>/hr</span></div>
                    </div>
                  </div>
                  <div style={{fontSize:'9px',fontWeight:700,color:'#4f46e5',marginTop:'10px',textAlign:'center'}}>All hours entered here are automatically enhanced at +10%</div>

                  {nightHrs>0&&(
                    <div style={{marginTop:'10px',background:'rgba(99,102,241,0.12)',borderRadius:'10px',padding:'10px 13px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:'11px',fontWeight:700,color:'#a5b4fc'}}>{nightHrs} hrs × £{nightRate.toFixed(2)}</span>
                      <span style={{fontSize:'14px',fontWeight:900,color:'#c7d2fe'}}>£{(nightHrs*nightRate).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* notes */}
            <div style={S.card}>
              <label style={S.lbl}>Notes</label>
              <textarea rows="2" placeholder="Shift notes or incident details..." style={S.ta} value={form.comments} onChange={e=>setForm({...form,comments:e.target.value})}/>
            </div>

            {/* live preview */}
            {preview.has&&(
              <div style={{background:'linear-gradient(135deg,#1e3a5f,#1d4ed8)',borderRadius:'15px',padding:'14px 18px',marginBottom:'11px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: preview.night>0?'10px':0}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'1px'}}>This Shift</div>
                  <div style={{display:'flex',gap:'18px',alignItems:'center'}}>
                    <div style={{textAlign:'right'}}><div style={{fontSize:'9px',fontWeight:900,color:'#93c5fd',textTransform:'uppercase',letterSpacing:'0.5px'}}>Gross</div><div style={{fontSize:'18px',fontWeight:900,color:'#fff'}}>{fmt(preview.gross)}</div></div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:'9px',fontWeight:900,color:'#6ee7b7',textTransform:'uppercase',letterSpacing:'0.5px'}}>Net</div>
                      <div style={{fontSize:'18px',fontWeight:900,color:'#34d399'}}>{fmt(preview.net)}</div>
                      {preview.bandName&&<div style={{fontSize:'8px',fontWeight:700,color:'#6ee7b7',marginTop:'1px'}}>{preview.bandName} · {preview.rate.toFixed(1)}%</div>}
                    </div>
                  </div>
                </div>
                {preview.night>0&&(
                  <div style={{borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:'8px',display:'flex',alignItems:'center',gap:'6px'}}>
                    <Ico n="moon" s={11} c="#818cf8"/>
                    <span style={{fontSize:'10px',fontWeight:700,color:'#a5b4fc'}}>inc. £{preview.night.toFixed(2)} night enhancement</span>
                  </div>
                )}
              </div>
            )}
            </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════ BREAKDOWN */}
        {tab==='months'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            <h2 style={{fontSize:'19px',fontWeight:900,color:'#0f172a',marginBottom:'12px',letterSpacing:'-0.5px'}}>Breakdown</h2>

            {/* month jump pills */}
            <div style={{display:'flex',gap:'5px',overflowX:'auto',paddingBottom:'9px',marginBottom:'5px',scrollbarWidth:'none',msOverflowStyle:'none'}}>
              {PAY_PERIODS.map((p,idx)=>{
                const isCurr=idx===currPeriodIdx, isOpen=expanded===p.month;
                return(
                  <button key={p.short} onClick={()=>jumpTo(p.month)} style={{flexShrink:0,padding:'4px 10px',borderRadius:'18px',border:isCurr?'1.5px solid #2563eb':'1px solid #e2e8f0',background:isOpen?'#2563eb':isCurr?'#eff6ff':'#fff',color:isOpen?'#fff':isCurr?'#2563eb':'#64748b',fontSize:'11px',fontWeight:900,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',transition:'all 0.14s',display:'flex',alignItems:'center',gap:'4px'}}>
                    {p.short}{isCurr&&!isOpen&&<span style={{display:'inline-block',width:'4px',height:'4px',borderRadius:'50%',background:'#2563eb'}}/>}
                  </button>
                );
              })}
            </div>

            {PAY_PERIODS.map((p,idx)=>{
              const pE=fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
              const pb=totals.periodBreakdown[idx];
              let h133=0,h150=0,h200=0,totalNight=0,pa1=0,pa2=0,pa3=0;
              pE.forEach(e=>{
                const c=calcEntry(e);
                h133+=c.h1; h150+=c.h2; h200+=c.h3; totalNight+=c.nh;
                if(e.paRate==='PA1')pa1++; else if(e.paRate==='PA2')pa2++; else if(e.paRate==='PA3')pa3++;
              });
              const gOT=pb.ot, gNight=pb.night, gPA=pb.pa;
              const totG=pb.combinedGross, totN=pb.combinedNet;
              const isExp=expanded===p.month, isCurr=idx===currPeriodIdx;

              return(
                <div key={p.month} ref={el=>monthRefs.current[p.month]=el} style={{background:isCurr?'#eff6ff':'#fff',borderRadius:'17px',border:isCurr?'2px solid #2563eb':'1px solid #f1f5f9',borderLeft:isCurr?'5px solid #2563eb':'1px solid #f1f5f9',boxShadow:isCurr?'0 4px 20px rgba(37,99,235,0.18)':'0 1px 5px rgba(0,0,0,0.04)',marginBottom:'9px',overflow:'hidden'}}>
                  <button onClick={()=>setExpanded(isExp?null:p.month)} style={{width:'100%',textAlign:'left',padding:'16px',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'11px'}}>
                      <div>
                        {isCurr&&<div style={{display:'inline-flex',alignItems:'center',gap:'4px',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',color:'#fff',fontSize:'8px',fontWeight:900,padding:'3px 9px',borderRadius:'8px',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'5px',boxShadow:'0 2px 6px rgba(37,99,235,0.35)'}}><span style={{width:'5px',height:'5px',borderRadius:'50%',background:'#fff'}}/>Active Month</div>}
                        <div style={{fontWeight:900,fontSize:'17px',color:'#0f172a',letterSpacing:'-0.3px'}}>{p.month}</div>
                        <div style={{fontSize:'9px',fontWeight:700,color:'#3b82f6',marginTop:'2px'}}>{fmtD(p.start)} – {fmtD(p.end)}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'4px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'4px',background:isCurr?'#dbeafe':'#eff6ff',border:isCurr?'1px solid #93c5fd':'1px solid #bfdbfe',padding:'5px 9px',borderRadius:'9px'}}>
                          <div style={{fontSize:'11px',fontWeight:900,color:'#1d4ed8'}}>{(h133+h150+h200).toFixed(1)} hrs</div>
                          <Ico n={isExp?'cD':'cR'} s={12} c="#3b82f6"/>
                        </div>
                        <div style={{fontSize:'9px',fontWeight:700,color:'#94a3b8'}}>{pE.length} record{pE.length!==1?'s':''}</div>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px'}}>
                      <div><div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'2px'}}>Gross</div><div style={{fontWeight:900,fontSize:'17px',color:'#1e3a5f'}}>{fmt(totG)}</div></div>
                      <div style={{textAlign:'right'}}><div style={{fontSize:'9px',fontWeight:900,color:'#059669',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'2px'}}>Net</div><div style={{fontWeight:900,fontSize:'17px',color:'#059669'}}>{fmt(totN)}</div></div>
                    </div>
                  </button>

                  {isExp&&(
                    <div style={{background:'#f8fafc',borderTop:'1px solid #f1f5f9',padding:'13px'}}>
                      {/* month summary cards — net figures now use cumulative marginal tax, rate shown */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px',marginBottom:'9px'}}>
                        <div style={{background:'#fff',borderRadius:'13px',padding:'13px',border:'1px solid #dbeafe'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:'#1e40af',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'7px'}}>OT Pay</div>
                          <div style={{fontSize:'12px',fontWeight:700,color:'#1e3a5f',marginBottom:'1px'}}>Gross: {fmt(gOT)}</div>
                          <div style={{fontSize:'11px',fontWeight:700,color:'#3b82f6',marginBottom:'2px'}}>Net: {fmt(pb.otResult.net)}</div>
                          {gOT>0&&<div style={{fontSize:'9px',fontWeight:900,color:'#1d4ed8',background:'#eff6ff',display:'inline-block',padding:'2px 6px',borderRadius:'6px',marginBottom:'7px'}}>{pb.otResult.bandName} · {pb.otResult.rate.toFixed(1)}%</div>}
                          <div style={{borderTop:'1px solid #eff6ff',paddingTop:'5px'}}>
                            {h133>0&&<div style={{fontSize:'10px',fontWeight:700,color:'#64748b',marginBottom:'2px'}}>{h133}h@1.33x</div>}
                            {h150>0&&<div style={{fontSize:'10px',fontWeight:700,color:'#64748b',marginBottom:'2px'}}>{h150}h@1.5x</div>}
                            {h200>0&&<div style={{fontSize:'10px',fontWeight:700,color:'#64748b'}}>{h200}h@2.0x</div>}
                          </div>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'9px'}}>
                          <div style={{background:'#fff',borderRadius:'13px',padding:'11px',border:'1px solid #fde68a'}}>
                            <div style={{fontSize:'9px',fontWeight:900,color:'#92400e',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'5px'}}>PA</div>
                            <div style={{fontSize:'12px',fontWeight:700,color:'#92400e',marginBottom:'1px'}}>Gross: {fmt(gPA)}</div>
                            <div style={{fontSize:'11px',fontWeight:700,color:'#d97706',marginBottom:'7px'}}>Net: {fmt(pb.paResult.net)}</div>
                            <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid #fef3c7',paddingTop:'6px'}}>
                              <span style={{fontSize:'10px',fontWeight:700,color:'#78716c'}}>PA1 × {pa1}</span>
                              <span style={{fontSize:'10px',fontWeight:700,color:'#78716c'}}>PA2 × {pa2}</span>
                              <span style={{fontSize:'10px',fontWeight:700,color:'#78716c'}}>PA3 × {pa3}</span>
                            </div>
                          </div>
                          {gNight>0&&(
                            <div style={{background:'#0f172a',borderRadius:'13px',padding:'11px',border:'1px solid #1e293b'}}>
                              <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'5px'}}><Ico n="moon" s={11} c="#818cf8"/><div style={{fontSize:'9px',fontWeight:900,color:'#c7d2fe',textTransform:'uppercase',letterSpacing:'0.5px'}}>Night (2000–0600)</div></div>
                              <div style={{fontSize:'12px',fontWeight:700,color:'#e0e7ff',marginBottom:'1px'}}>Gross: {fmt(gNight)}</div>
                              <div style={{fontSize:'11px',fontWeight:700,color:'#818cf8',marginBottom:'6px'}}>Net: {fmt(pb.nightResult.net)}</div>
                              <div style={{fontSize:'10px',fontWeight:700,color:'#6366f1'}}>{totalNight}h @ +10%</div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',textAlign:'center',marginBottom:'9px'}}>Individual Records</div>

                      {pE.length===0
                        ?<div style={{textAlign:'center',padding:'14px',color:'#94a3b8',fontSize:'13px',fontWeight:700}}>No records yet</div>
                        :[...pE].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(e=>{
                          const c=calcEntry(e);
                          const isFut=e.date>todayStr;
                          // individual records use the period-blended rate for each component
                          const eOTNet    = c.ot>0    ? c.ot*(1-pb.otResult.rate/100)       : 0;
                          const eNightNet = c.nh>0    ? c.night*(1-pb.nightResult.rate/100) : 0;
                          const ePANet    = c.pa>0    ? c.pa*(1-pb.paResult.rate/100)       : 0;
                          const eNet = eOTNet+eNightNet+ePANet;
                          return(
                            <div key={e.id} style={{background:'#fff',borderRadius:'13px',border:isFut?'1px solid #bfdbfe':'1px solid #f1f5f9',padding:'13px',marginBottom:'7px',position:'relative'}}>
                              {isFut&&<div style={{position:'absolute',top:'-6px',right:'9px',background:'#2563eb',color:'#fff',fontSize:'8px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',textTransform:'uppercase',letterSpacing:'1px'}}>Planned</div>}
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'7px'}}>
                                <div>
                                  <div style={{fontWeight:900,fontSize:'13px',color:'#0f172a'}}>{new Date(e.date+'T12:00:00').toLocaleDateString('en-GB')}</div>
                                  <div style={{fontSize:'10px',fontWeight:700,color:'#3b82f6',marginTop:'2px',textTransform:'uppercase'}}>Duty / Reason: {e.reason||'Shift'}</div>
                                </div>
                                <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                                  <button onClick={()=>{setConfirmDel(null);startEdit(e);}} style={{background:'#f1f5f9',border:'none',borderRadius:'8px',padding:'8px',cursor:'pointer',display:'flex'}}><Ico n="edit" s={14} c="#64748b"/></button>
                                  <button onClick={()=>setConfirmDel(confirmDel===e.id?null:e.id)} style={{background:confirmDel===e.id?'#fee2e2':'#fef2f2',border:confirmDel===e.id?'1.5px solid #fca5a5':'1.5px solid transparent',borderRadius:'8px',padding:'8px',cursor:'pointer',display:'flex',transition:'all 0.15s'}}><Ico n="trash" s={14} c="#ef4444"/></button>
                                </div>
                              </div>

                              {/* delete confirmation */}
                              {confirmDel===e.id&&(
                                <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'10px',padding:'11px 12px',marginBottom:'9px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
                                  <span style={{fontSize:'12px',fontWeight:700,color:'#991b1b'}}>Delete this record?</span>
                                  <div style={{display:'flex',gap:'7px',flexShrink:0}}>
                                    <button onClick={()=>setConfirmDel(null)} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'5px 12px',fontSize:'11px',fontWeight:900,color:'#64748b',cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                                    <button onClick={()=>delEntry(e.id)} style={{background:'#dc2626',border:'none',borderRadius:'8px',padding:'5px 12px',fontSize:'11px',fontWeight:900,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>Delete</button>
                                  </div>
                                </div>
                              )}

                              <div style={{background:'#f8fafc',borderRadius:'11px',padding:'12px'}}>
                                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                                  {c.h1>0&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'11px',fontWeight:700,color:'#475569'}}>{c.h1}h @ 1.33x <span style={{color:'#94a3b8'}}>(£{c.r.r133.toFixed(2)}/hr)</span></span>
                                      <span style={{fontSize:'12px',fontWeight:900,color:'#1e3a5f'}}>£{(c.h1*c.r.r133).toFixed(2)}</span>
                                    </div>
                                  )}
                                  {c.h2>0&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'11px',fontWeight:700,color:'#475569'}}>{c.h2}h @ 1.5x <span style={{color:'#94a3b8'}}>(£{c.r.r150.toFixed(2)}/hr)</span></span>
                                      <span style={{fontSize:'12px',fontWeight:900,color:'#1e3a5f'}}>£{(c.h2*c.r.r150).toFixed(2)}</span>
                                    </div>
                                  )}
                                  {c.h3>0&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'11px',fontWeight:700,color:'#475569'}}>{c.h3}h @ 2.0x <span style={{color:'#94a3b8'}}>(£{c.r.r200.toFixed(2)}/hr)</span></span>
                                      <span style={{fontSize:'12px',fontWeight:900,color:'#1e3a5f'}}>£{(c.h3*c.r.r200).toFixed(2)}</span>
                                    </div>
                                  )}
                                  {c.nh>0&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'11px',fontWeight:700,color:'#6366f1'}}>{c.nh}h @ +10% <span style={{color:'#94a3b8'}}>(£{(c.r.base*0.10).toFixed(2)}/hr)</span></span>
                                      <span style={{fontSize:'12px',fontWeight:900,color:'#4f46e5'}}>£{c.night.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {e.paRate!=='None'&&(
                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                      <span style={{fontSize:'11px',fontWeight:700,color:'#b45309'}}>{e.paRate} allowance</span>
                                      <span style={{fontSize:'12px',fontWeight:900,color:'#92400e'}}>£{c.pa.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px',borderTop:'1px solid #e2e8f0',paddingTop:'8px',marginTop:'8px'}}>
                                  <div><div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</div><div style={{fontWeight:900,fontSize:'13px',color:'#1e3a5f'}}>{fmt(c.gross)}</div></div>
                                  <div style={{textAlign:'right'}}><div style={{fontSize:'9px',fontWeight:900,color:'#059669',textTransform:'uppercase',letterSpacing:'1px'}}>Net</div><div style={{fontWeight:900,fontSize:'13px',color:'#059669'}}>{fmt(eNet)}</div></div>
                                </div>
                              </div>
                              {e.comments&&<div style={{fontSize:'11px',fontStyle:'italic',color:'#0f172a',borderLeft:'2px solid #bfdbfe',paddingLeft:'8px',marginTop:'7px'}}>"{e.comments}"</div>}
                            </div>
                          );
                        })
                      }
                      <button onClick={()=>setExpanded(null)} style={{width:'100%',marginTop:'4px',padding:'9px',background:'#fff',border:'1px solid #e2e8f0',borderRadius:'11px',fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:'4px'}}>
                        Close <Ico n="cD" s={12} c="#94a3b8"/>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════ TRENDS */}
        {tab==='graph'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            <h2 style={{fontSize:'19px',fontWeight:900,color:'#0f172a',marginBottom:'2px',letterSpacing:'-0.5px'}}>Earnings Trends</h2>
            <div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'14px'}}>FY 2026/27</div>

            <div style={S.card}>
              <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'12px'}}><Ico n="tUp" s={14} c="#2563eb"/><div style={{fontSize:'9px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1.5px'}}>Cumulative Gross Earnings</div></div>
              {(()=>{
                const data=totals.cumData, max=Math.max(...data.map(d=>d.cumulative),200);
                const W=330,H=150,pX=34,pY=12,eW=W-pX*2,eH=H-pY*2;
                const pts=data.map((d,i)=>({x:pX+i*(eW/(data.length-1)),y:H-pY-(d.cumulative/max)*eH,val:d.cumulative,lbl:d.short}));
                const path=pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
                const fill=`${path} L ${pts[pts.length-1].x} ${H-pY} L ${pts[0].x} ${H-pY} Z`;
                const last=[...pts].reverse().find(p=>p.val>0);
                return(
                  <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',overflow:'visible'}} preserveAspectRatio="none">
                    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
                    {[0,0.5,1].map(v=>(<g key={v}><line x1={pX} y1={H-pY-v*eH} x2={W-pX} y2={H-pY-v*eH} stroke="#f1f5f9" strokeWidth="1" strokeDasharray={v===0?'0':'3 4'}/><text x={pX-4} y={H-pY-v*eH} textAnchor="end" dominantBaseline="middle" style={{fontSize:'7px',fill:'#cbd5e1',fontWeight:700}}>£{Math.round(max*v)}</text></g>))}
                    {pts.map((p,i)=><text key={i} x={p.x} y={H-pY+11} textAnchor="middle" style={{fontSize:'7px',fill:'#94a3b8',fontWeight:900}}>{p.lbl}</text>)}
                    <path d={fill} fill="url(#cg)" opacity="0.22"/>
                    <path d={path} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    {last&&<circle cx={last.x} cy={last.y} r="4" fill="#2563eb" stroke="white" strokeWidth="2"/>}
                  </svg>
                );
              })()}
              <div style={{textAlign:'center',marginTop:'5px',fontSize:'11px',fontWeight:700,color:'#64748b'}}>Running total: <strong style={{color:'#1e3a5f'}}>£{totals.totalGross.toFixed(2)}</strong></div>
            </div>

            <div style={S.card}>
              <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'12px'}}><Ico n="bar" s={14} c="#2563eb"/><div style={{fontSize:'9px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1.5px'}}>Monthly Gross vs Net</div></div>
              {(()=>{
                const data=totals.periodBreakdown.map(pb=>({short:PAY_PERIODS.find(p=>p.month===pb.month).short,gross:pb.combinedGross,net:pb.combinedNet}));
                const max=Math.max(...data.map(d=>d.gross),200);
                const W=330,H=170,pX=34,pY=12,eW=W-pX*2,eH=H-pY*2;
                const pts=data.map((d,i)=>({x:pX+i*(eW/(data.length-1)),yG:H-pY-(d.gross/max)*eH,yN:H-pY-(d.net/max)*eH,lbl:d.short}));
                const gp=pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.yG}`).join(' ');
                const np=pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.yN}`).join(' ');
                return(
                  <div>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',overflow:'visible'}} preserveAspectRatio="none">
                      {[0,0.5,1].map(v=>(<g key={v}><line x1={pX} y1={H-pY-v*eH} x2={W-pX} y2={H-pY-v*eH} stroke="#f1f5f9" strokeWidth="1" strokeDasharray={v===0?'0':'3 4'}/><text x={pX-4} y={H-pY-v*eH} textAnchor="end" dominantBaseline="middle" style={{fontSize:'7px',fill:'#cbd5e1',fontWeight:700}}>£{Math.round(max*v)}</text></g>))}
                      {pts.map((p,i)=><text key={i} x={p.x} y={H-pY+11} textAnchor="middle" style={{fontSize:'7px',fill:'#94a3b8',fontWeight:900}}>{p.lbl}</text>)}
                      <path d={np} fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d={gp} fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      {pts.map((p,i)=><g key={i}><circle cx={p.x} cy={p.yG} r="3" fill="#34d399" stroke="white" strokeWidth="1.5"/><circle cx={p.x} cy={p.yN} r="3" fill="#f87171" stroke="white" strokeWidth="1.5"/></g>)}
                    </svg>
                    <div style={{display:'flex',justifyContent:'center',gap:'18px',marginTop:'9px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'13px',height:'2.5px',background:'#34d399',borderRadius:'2px'}}/><span style={{fontSize:'9px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</span></div>
                      <div style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'13px',height:'2.5px',background:'#f87171',borderRadius:'2px'}}/><span style={{fontSize:'9px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1px'}}>Net</span></div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── Published pay scale reference table ── */}
            <div style={S.card}>
              <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'12px'}}><Ico n="cal" s={14} c="#2563eb"/><div style={{fontSize:'9px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1.5px'}}>Published Pay Scales — Annual Salary</div></div>
              {['Constable','Sergeant'].map(rank=>(
                <div key={rank} style={{marginBottom: rank==='Constable' ? '16px' : 0}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'#1e3a5f',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'7px'}}>{rank}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 1fr',gap:'2px 8px',alignItems:'center'}}>
                    <div style={{fontSize:'8px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',paddingBottom:'5px',borderBottom:'1px solid #f1f5f9'}}>Pay Point</div>
                    <div style={{fontSize:'8px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',textAlign:'right',paddingBottom:'5px',borderBottom:'1px solid #f1f5f9'}}>Pre-Sept</div>
                    <div style={{fontSize:'8px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',textAlign:'right',paddingBottom:'5px',borderBottom:'1px solid #f1f5f9'}}>Post-Sept</div>
                    {Object.entries(PAY_RATES[rank]).map(([point,data])=>(
                      <div key={point} style={{display:'contents'}}>
                        <div style={{fontSize:'11px',fontWeight:700,color:'#0f172a',padding:'5px 0'}}>{point}</div>
                        <div style={{fontSize:'11px',fontWeight:700,color:'#64748b',textAlign:'right',padding:'5px 0'}}>£{data.salary.pre.toLocaleString('en-GB')}</div>
                        <div style={{fontSize:'11px',fontWeight:900,color:'#1e3a5f',textAlign:'right',padding:'5px 0'}}>£{data.salary.post.toLocaleString('en-GB')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{marginTop:'12px',fontSize:'9px',fontWeight:600,color:'#94a3b8',lineHeight:1.5}}>Excludes London Weighting (£3,150 pre-Sept / £3,260 post-Sept) and London Allowance (£6,588), which are added separately.</div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════ SETTINGS */}
        {tab==='settings'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
              <h2 style={{fontSize:'19px',fontWeight:900,color:'#0f172a',margin:0,letterSpacing:'-0.5px'}}>Settings</h2>
              {savedBadge&&<div style={{display:'flex',alignItems:'center',gap:'5px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'9px',padding:'4px 9px'}}><Ico n="check" s={12} c="#059669"/><span style={{fontSize:'11px',fontWeight:900,color:'#065f46'}}>Saved</span></div>}
            </div>

            <div style={S.card}>
              <div style={{marginBottom:'13px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'7px'}}>
                  <label style={{...S.lbl,marginBottom:0}}>Rank</label>
                  {!settings.rank&&<span style={{fontSize:'9px',fontWeight:900,color:'#dc2626',background:'#fee2e2',padding:'2px 7px',borderRadius:'6px',textTransform:'uppercase',letterSpacing:'0.5px'}}>Start here</span>}
                </div>
                <div className={!settings.rank?'setup-pulse-urgent':''} style={{borderRadius:'13px'}}>
                  <select style={{...S.sel,border: !settings.rank ? '2px solid #dc2626' : '1px solid #e2e8f0',fontWeight: !settings.rank ? 900 : 700}} value={settings.rank} onChange={e=>{
                    const r=e.target.value;
                    if(!r) return saveSett({...settings,rank:'',service:''});
                    saveSett({...settings,rank:r,service:''});
                  }}>
                    <option value="">Select Rank...</option>
                    {Object.keys(PAY_RATES).map(k=><option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
              {settings.rank&&(
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'7px'}}>
                    <label style={{...S.lbl,marginBottom:0}}>Pay Point</label>
                    {!settings.service&&<span style={{fontSize:'9px',fontWeight:900,color:'#dc2626',background:'#fee2e2',padding:'2px 7px',borderRadius:'6px',textTransform:'uppercase',letterSpacing:'0.5px'}}>Now this</span>}
                  </div>
                  <div className={!settings.service?'setup-pulse-urgent':''} style={{borderRadius:'13px'}}>
                    <select style={{...S.sel,border: !settings.service ? '2px solid #dc2626' : '1px solid #e2e8f0',fontWeight: !settings.service ? 900 : 700}} value={settings.service} onChange={e=>saveSett({...settings,service:e.target.value})}>
                      <option value="">Select pay point...</option>
                      {Object.keys(PAY_RATES[settings.rank]).map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div style={{borderTop:'1px solid #f1f5f9',marginTop:'14px',paddingTop:'12px',display:'flex',alignItems:'flex-start',gap:'8px'}}>
                <Ico n="shield" s={13} c="#94a3b8"/>
                <span style={{fontSize:'11px',fontWeight:600,color:'#64748b',lineHeight:1.5}}>Tax is calculated automatically using real UK income tax bands, applied cumulatively across your salary, allowances and overtime — no manual rate needed.</span>
              </div>
            </div>

            {/* rate table — shows both pre and post rates side by side */}
            {settings.rank&&settings.service&&(()=>{
              const svcData = PAY_RATES[settings.rank][settings.service];
              return(
                <div style={{...S.card,background:'#eff6ff',border:'1px solid #bfdbfe'}}>
                  <div style={{fontSize:'9px',fontWeight:900,color:'#2563eb',textTransform:'uppercase',letterSpacing:'1.5px',textAlign:'center',marginBottom:'12px'}}>Hourly Rates — {settings.service}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                    {[['Pre 1 Sep 2026','pre','#64748b','#f8fafc'],['From 1 Sep 2026','post','#2563eb','#fff']].map(([label,key,col,bg])=>(
                      <div key={key} style={{background:bg,borderRadius:'12px',padding:'12px',border:key==='post'?'1.5px solid #bfdbfe':'none'}}>
                        <div style={{fontSize:'9px',fontWeight:900,color:col,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'8px'}}>{label}</div>
                        {['Base','1.33x','1.5x','2.0x'].map((lbl,i)=>(
                          <div key={lbl} style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                            <span style={{fontSize:'10px',fontWeight:700,color:'#64748b'}}>{lbl}</span>
                            <span style={{fontSize:'10px',fontWeight:900,color:key==='post'?'#1e3a5f':'#475569'}}>£{(svcData[key][['base','r133','r150','r200'][i]]||0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:'10px',background:'rgba(37,99,235,0.06)',borderRadius:'10px',padding:'8px 10px',display:'flex',alignItems:'center',gap:'6px'}}>
                    <Ico n="moon" s={12} c="#6366f1"/>
                    <span style={{fontSize:'10px',fontWeight:700,color:'#4f46e5'}}>Night enhancement is 10% of the hourly rates: £{(svcData.post.base*0.10).toFixed(2)}/hr</span>
                  </div>
                </div>
              );
            })()}

            {/* data management */}
            <div style={{...S.dark,background:'#0f2744'}}>
              <div style={{display:'flex',alignItems:'center',gap:'11px',marginBottom:'13px'}}>
                <div style={{background:'rgba(255,255,255,0.1)',padding:'11px',borderRadius:'13px'}}><Ico n="shield" s={21} c="#93c5fd"/></div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:900,fontSize:'14px',color:'#fff',textTransform:'uppercase'}}>Data Management</div>
                  <div style={{fontSize:'11px',color:'#93c5fd',marginTop:'1px'}}>Stored locally on your device.</div>
                </div>
              </div>
              <div style={{background:'rgba(255,255,255,0.07)',borderRadius:'12px',padding:'10px 13px',marginBottom:'12px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                  <div style={{width:'7px',height:'7px',borderRadius:'50%',background:lastBackedUp?'#34d399':'#f59e0b',boxShadow:lastBackedUp?'0 0 6px #34d399':'0 0 6px #f59e0b'}}/>
                  <div>
                    <div style={{fontSize:'10px',fontWeight:900,color:'#fff',textTransform:'uppercase',letterSpacing:'0.5px'}}>{lastBackedUp?'Last backed up':'Not yet backed up'}</div>
                    <div style={{fontSize:'9px',color:'#93c5fd',marginTop:'1px'}}>
                      {lastBackedUp
                        ?new Date(lastBackedUp).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+' at '+new Date(lastBackedUp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})
                        :'Download a backup to protect your data'}
                    </div>
                  </div>
                </div>
                <div style={{fontSize:'9px',fontWeight:700,color:'rgba(147,197,253,0.6)'}}>{entries.length} record{entries.length!==1?'s':''}</div>
              </div>
              <div style={{background:'rgba(0,0,0,0.2)',borderRadius:'13px',padding:'13px'}}>
                <div style={{fontSize:'11px',color:'rgba(147,197,253,0.65)',fontStyle:'italic',marginBottom:'11px',lineHeight:1.5}}>Autosave protects against refreshes. Download a backup to protect against browser data being cleared.</div>
                <div style={{display:'flex',gap:'6px',marginBottom:'11px'}}>
                  <button onClick={handleExport} className={pulseBackupBtn?'backup-pulse':''} style={{flex:1,padding:'10px',background:'#2563eb',border:'none',borderRadius:'10px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'1px'}}><Ico n="dl" s={12} c="#fff"/> Backup</button>
                  <button onClick={()=>fileRef.current.click()} style={{flex:1,padding:'10px',background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'10px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'1px'}}><Ico n="ul" s={12} c="#fff"/> Restore</button>
                  <input type="file" ref={fileRef} style={{display:'none'}} accept=".json" onChange={handleImport}/>
                </div>
                <div style={{borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:'11px'}}>
                  {!wipeConf
                    ?<button onClick={()=>setWipeConf(true)} style={{width:'100%',padding:'10px',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'10px',color:'#fca5a5',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'1px'}}><Ico n="trash" s={12} c="#fca5a5"/> Wipe All Data</button>
                    :<div style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',borderRadius:'12px',padding:'12px'}}>
                        <div style={{textAlign:'center',color:'#fca5a5',fontWeight:700,fontSize:'12px',marginBottom:'9px',lineHeight:1.4}}>Are you absolutely sure?<br/><span style={{fontSize:'10px',fontWeight:400,color:'rgba(252,165,165,0.7)'}}>This cannot be undone.</span></div>
                        <div style={{display:'flex',gap:'6px'}}>
                          <button onClick={handleWipe} style={{flex:1,padding:'9px',background:'#dc2626',border:'none',borderRadius:'8px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'1px'}}>Yes, Delete</button>
                          <button onClick={()=>setWipeConf(false)} style={{flex:1,padding:'9px',background:'rgba(255,255,255,0.1)',border:'none',borderRadius:'8px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',textTransform:'uppercase',letterSpacing:'1px'}}>Cancel</button>
                        </div>
                      </div>
                  }
                </div>
              </div>
            </div>

            {/* ── Export to spreadsheet — separate from backup ── */}
            <div style={S.card}>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'11px'}}>
                <div style={{background:'#f0fdf4',padding:'9px',borderRadius:'11px'}}><Ico n="table" s={17} c="#059669"/></div>
                <div style={{fontWeight:900,fontSize:'13px',color:'#0f172a'}}>Export to Spreadsheet</div>
              </div>
              <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'11px',padding:'10px 12px',marginBottom:'12px',display:'flex',gap:'8px',alignItems:'flex-start'}}>
                <Ico n="uPlus" s={14} c="#d97706"/>
                <div style={{fontSize:'10px',fontWeight:700,color:'#92400e',lineHeight:1.5}}>This is <strong>not a backup</strong>. It's a read-only CSV for viewing your records in Excel, Google Sheets or Numbers — use the Backup button above to protect your data.</div>
              </div>
              <button onClick={handleExportCSV} disabled={entries.length===0} style={{width:'100%',padding:'12px',background: entries.length===0 ? '#f1f5f9' : '#10b981',border:'none',borderRadius:'11px',color: entries.length===0 ? '#94a3b8' : '#fff',fontWeight:900,fontSize:'11px',fontFamily:'inherit',cursor: entries.length===0 ? 'default' : 'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',textTransform:'uppercase',letterSpacing:'1px',boxShadow: entries.length===0 ? 'none' : '0 4px 14px rgba(16,185,129,0.3)'}}><Ico n="table" s={13} c={entries.length===0?'#94a3b8':'#fff'}/> Export to CSV</button>
              {entries.length===0&&<div style={{fontSize:'10px',color:'#94a3b8',textAlign:'center',marginTop:'8px',fontWeight:600}}>Log a shift first to enable export</div>}
            </div>

            {/* ── Help & suggestions ── */}
            <a href="mailto:ajstephe@me.com?subject=Overtime%20Tracker%20—%20Feedback" style={{...S.card,display:'flex',alignItems:'center',gap:'12px',textDecoration:'none',cursor:'pointer'}}>
              <div style={{background:'#eff6ff',padding:'11px',borderRadius:'13px',flexShrink:0}}><Ico n="mail" s={19} c="#2563eb"/></div>
              <div style={{flex:1}}>
                <div style={{fontWeight:900,fontSize:'13px',color:'#0f172a'}}>Help & Suggestions</div>
                <div style={{fontSize:'11px',color:'#3b82f6',fontWeight:700,marginTop:'2px'}}>ajstephe@me.com</div>
              </div>
              <Ico n="cR" s={16} c="#94a3b8"/>
            </a>
          </div>
        )}
      </main>

      {/* floating save button (Log Shift only, and only once rank/pay point are set) */}
      {tab==='add'&&settings.rank&&settings.service&&(
        <div style={{position:'absolute',bottom:'72px',left:'14px',right:'14px',zIndex:25}}>
          <button onClick={handleSave} style={{width:'100%',background:'#dc2626',color:'#fff',boxShadow:'0 4px 20px rgba(220,38,38,0.5)',padding:'17px',borderRadius:'16px',border:'none',fontWeight:900,fontSize:'15px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'9px',letterSpacing:'-0.2px'}}>
            <Ico n="save" s={18} c="#fff"/>
            {editing?'Update Record':'Save Record'}
          </button>
        </div>
      )}

      <nav style={S.nav}>
        {[
          {id:'dashboard',n:'home', lbl:'Home'},
          {id:'months',   n:'cal',  lbl:'Breakdown'},
          {id:'add',      n:'plus', lbl:'Log Shift'},
          {id:'graph',    n:'bar',  lbl:'Trends'},
          {id:'settings', n:'cog',  lbl:'Settings'},
        ].map(t=>(
          <button key={t.id} onClick={()=>{ setEditing(null); if(t.id==='add') { setForm({...blankForm,date:todayStr}); } setTab(t.id); }} style={S.nBtn(tab===t.id,t.id==='add')}>
            <Ico n={t.n} s={t.id==='add'?21:18} c={t.id==='add'?'#fff':tab===t.id?'#2563eb':'#94a3b8'} w={tab===t.id||t.id==='add'?2.5:2}/>
            <span style={S.nLbl}>{t.lbl}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
