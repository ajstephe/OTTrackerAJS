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
// Each pay point holds pre/post rate sets (switching on RATE_CHANGE_DATE).
// `base` is the plain hourly rate used for the 10% night enhancement.
// Pre-Sept rates for PC 1-3 map to the old Year 3 figures (lowest available).
// Pre-Sept Sergeant points map to the old Point 1/2/3+ figures.
const PAY_RATES = {
  Constable: {
    'PC 1': {
      pre:  { base:14.95, r133:19.88, r150:22.43, r200:29.89 },
      post: { base:15.47, r133:20.58, r150:23.21, r200:30.94 },
    },
    'PC 2': {
      pre:  { base:15.57, r133:20.72, r150:23.36, r200:31.15 },
      post: { base:16.12, r133:21.44, r150:24.18, r200:32.24 },
    },
    'PC 3': {
      pre:  { base:16.20, r133:21.55, r150:24.31, r200:32.41 },
      post: { base:16.77, r133:22.30, r150:25.16, r200:33.54 },
    },
    'PC 4': {
      pre:  { base:16.86, r133:22.43, r150:25.24, r200:33.65 },
      post: { base:17.42, r133:23.17, r150:26.13, r200:34.84 },
    },
    'PC 5': {
      pre:  { base:18.13, r133:24.11, r150:27.13, r200:36.17 },
      post: { base:18.73, r133:24.91, r150:28.10, r200:37.46 },
    },
    'PC 6': {
      pre:  { base:20.68, r133:27.50, r150:30.94, r200:41.25 },
      post: { base:21.36, r133:28.41, r150:32.04, r200:42.72 },
    },
    'PC 7 (top)': {
      pre:  { base:24.14, r133:32.11, r150:36.13, r200:48.17 },
      post: { base:24.94, r133:33.17, r150:37.41, r200:49.88 },
    },
  },
  Sergeant: {
    'SGT 2 (on promotion)': {
      pre:  { base:25.73, r133:34.23, r150:38.51, r200:51.34 },
      post: { base:26.59, r133:35.36, r150:39.89, r200:53.18 },
    },
    'SGT 3': {
      pre:  { base:26.26, r133:34.93, r150:39.29, r200:52.39 },
      post: { base:27.13, r133:36.08, r150:40.70, r200:54.26 },
    },
    'SGT 4 (top)': {
      pre:  { base:27.01, r133:35.92, r150:40.40, r200:53.87 },
      post: { base:27.90, r133:37.11, r150:41.85, r200:55.80 },
    },
  },
};

const PA_RATES   = { None:0, PA1:40, PA2:90, PA3:125 };
const PA_LABELS  = { None:'—', PA1:'£40', PA2:'£90', PA3:'£125' };
const TAX_LABELS = { 20:'Basic Rate', 40:'Higher Rate', 45:'Additional' };

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
  const def = { rank:'', service:'', taxRate:40 };
  if (!s) return def;
  const validRanks = Object.keys(PAY_RATES);
  if (!validRanks.includes(s.rank)) return { ...def, taxRate: s.taxRate||40 };
  const validServices = Object.keys(PAY_RATES[s.rank]||{});
  if (!validServices.includes(s.service)) return { ...def, taxRate: s.taxRate||40 };
  return { rank:s.rank, service:s.service, taxRate:s.taxRate||40 };
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

  // ── toasts ─────────────────────────────────────────────────────────────────
  const addToast = useCallback((msg,type='success',action=null,dur=3500)=>{
    const id=Date.now()+Math.random();
    setToasts(t=>[...t,{id,message:msg,type,action}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),dur);
  },[]);

  const saveSett = s=>{ setSettings(s); setSavedBadge(true); setTimeout(()=>setSavedBadge(false),2200); };

  // ── entry calculator ───────────────────────────────────────────────────────
  // Returns all components of pay for a single entry using the date-correct rates.
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
    const net   = gross * (1 - settings.taxRate/100);
    return { h1, h2, h3, nh, ot, night, pa, gross, net, r };
  },[settings]);

  // ── derived totals ─────────────────────────────────────────────────────────
  const fyEntries = useMemo(()=>entries.filter(e=>e.date>=FY_START&&e.date<=FY_END),[entries]);

  const totals = useMemo(()=>{
    let totalGross=0, totalNet=0, totalHrs=0;
    fyEntries.forEach(e=>{
      const c=calcEntry(e);
      totalGross+=c.gross; totalNet+=c.net; totalHrs+=c.h1+c.h2+c.h3;
    });

    const getP=i=>{
      if(i<0||i>=PAY_PERIODS.length) return null;
      const p=PAY_PERIODS[i], pE=fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
      let gr=0; pE.forEach(e=>{ gr+=calcEntry(e).gross; });
      return{month:p.month,start:p.start,end:p.end,gross:gr,net:gr*(1-settings.taxRate/100)};
    };

    let cum=0;
    const cumData=PAY_PERIODS.map(p=>{
      const pE=fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
      let g=0; pE.forEach(e=>{ g+=calcEntry(e).gross; }); cum+=g;
      return{short:p.short,cumulative:cum};
    });

    return{totalGross,totalNet,totalHrs,cumData,prev:getP(currPeriodIdx-1),curr:getP(currPeriodIdx),next:getP(currPeriodIdx+1)};
  },[fyEntries,calcEntry,settings.taxRate,currPeriodIdx]);

  // ── live form preview ──────────────────────────────────────────────────────
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
    return { gross, net:gross*(1-settings.taxRate/100), night, has:gross>0 };
  },[form, settings, todayStr]);

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

  function handleExport(){
    const now=Date.now();
    const s="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify({entries,settings,exportedAt:new Date().toISOString()}));
    Object.assign(document.createElement('a'),{href:s,download:`AJS_OT_Backup_${new Date().toISOString().split('T')[0]}.json`}).click();
    dualWrite(KEYS.backupCount,0); dualWrite(KEYS.backedUpAt,now); setLastBackedUp(now);
    addToast('Backup downloaded ✓');
  }

  const handleImport=ev=>{
    const fr=new FileReader();
    fr.onload=e=>{ const d=JSON.parse(e.target.result); setEntries(d.entries); setSettings(migrateSettings(d.settings)); setTab('dashboard'); addToast('Backup restored'); };
    fr.readAsText(ev.target.files[0]);
  };

  const handleWipe=()=>{ setEntries([]); saveSett({rank:'',service:'',taxRate:40}); setWipeConf(false); setTab('dashboard'); };

  const jumpTo=month=>{ setExpanded(month); setTimeout(()=>monthRefs.current[month]?.scrollIntoView({behavior:'smooth',block:'start'}),80); };

  // ── display helpers ────────────────────────────────────────────────────────
  const fmt =n=>`£${n.toFixed(2)}`;
  const fmtD=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const fmtBackedUp=ts=>{
    if(!ts) return null;
    const diff=Math.floor((Date.now()-ts)/1000);
    const date=new Date(ts), today=new Date();
    if(diff<60) return 'Just now';
    if(date.toDateString()===today.toDateString()) return date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    if(date.toDateString()===new Date(today-86400000).toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  };

  // Today's effective rates for the settings display
  const todayRates = getRates(settings.rank, settings.service, todayStr);

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
    inp:  {width:'100%',background:'#f8fafc',border:'none',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'14px',outline:'none',fontFamily:'inherit',boxSizing:'border-box',color:'#0f172a'},
    ta:   {width:'100%',background:'#f8fafc',border:'none',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'14px',outline:'none',fontFamily:'inherit',resize:'none',boxSizing:'border-box',color:'#0f172a'},
    sel:  {width:'100%',background:'#f8fafc',border:'1px solid #e2e8f0',padding:'12px 15px',borderRadius:'13px',fontWeight:700,fontSize:'14px',outline:'none',fontFamily:'inherit',boxSizing:'border-box',color:'#0f172a',appearance:'none'},
  };

  return (
    <div style={S.wrap}>
      <style>{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{display:none}
        @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes su{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes gentlePulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(217,119,6,0)}30%{opacity:0.82;box-shadow:0 0 0 7px rgba(217,119,6,0.28)}50%{opacity:1;box-shadow:0 0 0 0 rgba(217,119,6,0)}70%{opacity:0.82;box-shadow:0 0 0 7px rgba(217,119,6,0.28)}90%,100%{opacity:1;box-shadow:0 0 0 0 rgba(217,119,6,0)}}
        .fi{animation:fi 0.22s ease}
        .setup-pulse{animation:gentlePulse 2.4s ease-in-out infinite}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input:focus,select:focus,textarea:focus{outline:2px solid #2563eb;outline-offset:-2px}
        button:active{opacity:0.8;transform:scale(0.96)}
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

      <main ref={mainRef} style={S.main}>

        {/* ══════════════════════════════════════════ DASHBOARD */}
        {tab==='dashboard'&&(
          <div className="fi" style={{padding:'14px',paddingBottom:'96px'}}>
            {!settings.rank&&(
              <div className="setup-pulse" style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'14px',padding:'13px 14px',marginBottom:'12px',display:'flex',gap:'11px',alignItems:'flex-start'}}>
                <Ico n="uPlus" s={19} c="#d97706"/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:900,color:'#92400e',fontSize:'13px',marginBottom:'3px'}}>Setup Required</div>
                  <div style={{color:'#b45309',fontSize:'12px',marginBottom:'8px'}}>Configure your rank and pay in Settings.</div>
                  <button onClick={()=>setTab('settings')} style={{background:'#fde68a',border:'none',borderRadius:'8px',padding:'5px 11px',fontWeight:900,fontSize:'11px',color:'#92400e',cursor:'pointer',fontFamily:'inherit'}}>Go to Settings →</button>
                </div>
              </div>
            )}

            <div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'8px',padding:'0 2px'}}>Monthly Summary</div>
            {[totals.curr,totals.next,totals.prev].map((item,i)=>item&&(
              <div key={i} style={{...S.card,background:i===0?'#eff6ff':'#fff',border:i===0?'1px solid #bfdbfe':'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'15px 17px'}}>
                <div>
                  <div style={{fontSize:'9px',fontWeight:900,color:i===0?'#2563eb':'#94a3b8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>{i===0?'Current':i===1?'Next':'Previous'} Pay Month</div>
                  <div style={{fontWeight:900,fontSize:'17px',color:'#0f172a',marginBottom:'3px'}}>{item.month}</div>
                  <div style={{fontSize:'10px',fontWeight:700,color:'#3b82f6'}}>{fmtD(item.start)} – {fmtD(item.end)}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontWeight:900,fontSize:'14px',color:'#1e3a5f',marginBottom:'3px'}}>{fmt(item.gross)} <span style={{fontSize:'9px',fontWeight:400,color:'#94a3b8'}}>gross</span></div>
                  <div style={{fontWeight:900,fontSize:'14px',color:'#059669'}}>{fmt(item.net)} <span style={{fontSize:'9px',fontWeight:400,color:'#94a3b8'}}>net</span></div>
                </div>
              </div>
            ))}

            <div style={S.dark}>
              <div style={{position:'absolute',right:'-14px',top:'-14px',width:'72px',height:'72px',background:'rgba(255,255,255,0.04)',borderRadius:'50%'}}/>
              <div style={{fontSize:'9px',fontWeight:900,color:'#60a5fa',textTransform:'uppercase',letterSpacing:'1.5px',marginBottom:'3px'}}>Gross Total 26/27</div>
              <div style={{fontSize:'40px',fontWeight:900,color:'#fff',letterSpacing:'-2px',marginBottom:'16px'}}>{fmt(totals.totalGross)}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',borderTop:'1px solid rgba(255,255,255,0.1)',paddingTop:'13px'}}>
                <div><div style={{fontSize:'9px',fontWeight:900,color:'#60a5fa',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'2px'}}>Est. Net</div><div style={{fontSize:'19px',fontWeight:900,color:'#34d399'}}>{fmt(totals.totalNet)}</div></div>
                <div><div style={{fontSize:'9px',fontWeight:900,color:'#60a5fa',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'2px'}}>Hours</div><div style={{fontSize:'19px',fontWeight:900,color:'#fff',display:'flex',alignItems:'center',gap:'6px'}}><Ico n="clock" s={15} c="rgba(255,255,255,0.35)"/>{totals.totalHrs.toFixed(1)}</div></div>
              </div>
            </div>

            <div style={S.card}>
              <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'11px'}}><Ico n="trend" s={14} c="#2563eb"/><div style={{fontSize:'9px',fontWeight:900,color:'#64748b',textTransform:'uppercase',letterSpacing:'1.5px'}}>Current Hourly Rates</div></div>
              <div style={{fontSize:'13px',fontWeight:900,color:'#0f172a',marginBottom:'10px',borderBottom:'1px solid #f1f5f9',paddingBottom:'9px'}}>{settings.service||<span style={{color:'#94a3b8'}}>Not Configured</span>}</div>
              {/* show which rate set is active */}
              {settings.rank&&<div style={{fontSize:'9px',fontWeight:700,color:todayStr>=RATE_CHANGE_DATE?'#059669':'#d97706',marginBottom:'10px'}}>{todayStr>=RATE_CHANGE_DATE?'▲ Sept 2026 rates active':'Pre-Sept 2026 rates (new rates from 1 Sep)'}</div>}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'6px'}}>
                {['Base','1.33x','1.5x','2.0x'].map((lbl,i)=>(
                  <div key={lbl} style={{background:'#f8fafc',padding:'8px 4px',borderRadius:'10px',textAlign:'center'}}>
                    <div style={{fontSize:'8px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',marginBottom:'2px'}}>{lbl}</div>
                    <div style={{fontSize:'11px',fontWeight:900,color:'#1e3a5f'}}>£{(todayRates[['base','r133','r150','r200'][i]]||0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
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

            {/* date + duty */}
            <div style={S.card}>
              <div style={{marginBottom:'13px'}}><label style={S.lbl}>Date</label><input type="date" style={S.inp} value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
              <div><label style={S.lbl}>Duty / Reason</label><input type="text" placeholder="e.g. MPL7XX, PXX" style={S.inp} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></div>
            </div>

            {/* overtime hours */}
            {(()=>{
              const formRates = getRates(settings.rank, settings.service, form.date||todayStr);
              return (
                <div style={{...S.card,background:'#eff6ff',border:'1px solid #dbeafe'}}>
                  <div style={{fontSize:'10px',fontWeight:900,color:'#1e40af',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',marginBottom:'13px'}}>Overtime Hours</div>
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
              <div style={{fontSize:'10px',fontWeight:900,color:'#92400e',textTransform:'uppercase',letterSpacing:'1px',textAlign:'center',marginBottom:'13px'}}>PA Allowance</div>
              <div style={{display:'flex',gap:'6px'}}>
                {['None','PA1','PA2','PA3'].map(pa=>(
                  <button key={pa} onClick={()=>setForm({...form,paRate:pa})} style={{flex:1,paddingTop:'9px',paddingBottom:'9px',borderRadius:'11px',border:'none',fontFamily:'inherit',cursor:'pointer',transition:'all 0.14s',background:form.paRate===pa?'#f59e0b':'#fff',color:form.paRate===pa?'#fff':'#b45309',boxShadow:form.paRate===pa?'0 4px 11px rgba(245,158,11,0.38)':'none',display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                    <span style={{fontSize:'12px',fontWeight:900}}>{pa}</span>
                    <span style={{fontSize:'9px',fontWeight:700,opacity:form.paRate===pa?0.85:0.55}}>{PA_LABELS[pa]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* night hours — two-step: total hours in window, then enhanced subset */}
            {(()=>{
              const formRates  = getRates(settings.rank, settings.service, form.date||todayStr);
              const nightRate  = formRates.base * 0.10;
              const workHrs    = parseFloat(form.nightWorkHours)||0;
              const enhHrs     = parseFloat(form.nightHours)||0;
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

                  {/* Step 1: total hours in window */}
                  <div style={{marginBottom: workHrs>0 ? '12px' : 0}}>
                    <label style={{...S.lbl,color:'#818cf8',marginBottom:'6px'}}>Step 1 — Total hours worked between 2000–0600</label>
                    <input
                      type="number" step="1" min="0" placeholder="0"
                      style={{...S.inp,textAlign:'center',fontWeight:900,background:'#1e293b',fontSize:'22px',padding:'13px 8px',color:'#e0e7ff',borderRadius:'12px'}}
                      value={form.nightWorkHours}
                      onChange={e=>{
                        const v=e.target.value;
                        // auto-populate enhanced hours to match, capped at new total
                        const newEnh = form.nightHours===''||parseFloat(form.nightHours)>=parseFloat(v||0) ? v : form.nightHours;
                        setForm({...form, nightWorkHours:v, nightHours:newEnh});
                      }}
                    />
                    <div style={{fontSize:'9px',fontWeight:700,color:'#4f46e5',marginTop:'5px',textAlign:'center'}}>Enter the total hours your shift covered this window</div>
                  </div>

                  {/* Step 2: enhanced subset — only appears once Step 1 is filled */}
                  {workHrs>0&&(
                    <div style={{borderTop:'1px solid rgba(99,102,241,0.2)',paddingTop:'12px'}}>
                      <label style={{...S.lbl,color:'#818cf8',marginBottom:'6px'}}>Step 2 — How many of those hours are enhanced at 10%?</label>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',alignItems:'center'}}>
                        <div>
                          <input
                            type="number" step="1" min="0" max={workHrs} placeholder="0"
                            style={{...S.inp,textAlign:'center',fontWeight:900,background:'#1e293b',fontSize:'22px',padding:'13px 8px',color:'#a5b4fc',borderRadius:'12px',border: enhHrs>workHrs ? '1.5px solid #f87171' : 'none'}}
                            value={form.nightHours}
                            onChange={e=>setForm({...form,nightHours:e.target.value})}
                          />
                          {enhHrs>workHrs&&<div style={{fontSize:'9px',color:'#f87171',fontWeight:700,marginTop:'4px',textAlign:'center'}}>Cannot exceed {workHrs} hrs above</div>}
                          <div style={{fontSize:'9px',fontWeight:700,color:'#4f46e5',marginTop:'4px',textAlign:'center'}}>Max: {workHrs} hrs</div>
                        </div>
                        <div style={{background:'rgba(99,102,241,0.12)',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:'#818cf8',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>Enhancement rate</div>
                          <div style={{fontSize:'20px',fontWeight:900,color:'#e0e7ff'}}>£{nightRate.toFixed(2)}</div>
                          <div style={{fontSize:'9px',color:'#6366f1',fontWeight:700,marginTop:'2px'}}>per hour</div>
                        </div>
                      </div>

                      {/* running calculation */}
                      {enhHrs>0&&enhHrs<=workHrs&&(
                        <div style={{marginTop:'10px',background:'rgba(99,102,241,0.12)',borderRadius:'10px',padding:'10px 13px'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
                            <span style={{fontSize:'11px',fontWeight:700,color:'#a5b4fc'}}>{enhHrs} enhanced hrs × £{nightRate.toFixed(2)}</span>
                            <span style={{fontSize:'14px',fontWeight:900,color:'#c7d2fe'}}>£{(enhHrs*nightRate).toFixed(2)}</span>
                          </div>
                          {enhHrs<workHrs&&(
                            <div style={{fontSize:'10px',fontWeight:600,color:'#6366f1',borderTop:'1px solid rgba(99,102,241,0.2)',paddingTop:'5px',marginTop:'5px'}}>
                              {workHrs-enhHrs} hr{workHrs-enhHrs!==1?'s':''} in this window not enhanced
                            </div>
                          )}
                        </div>
                      )}
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
                    <div style={{textAlign:'right'}}><div style={{fontSize:'9px',fontWeight:900,color:'#6ee7b7',textTransform:'uppercase',letterSpacing:'0.5px'}}>Net</div><div style={{fontSize:'18px',fontWeight:900,color:'#34d399'}}>{fmt(preview.net)}</div></div>
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
              // aggregate using calcEntry so rates are date-correct per entry
              let gOT=0,gNight=0,gPA=0,h133=0,h150=0,h200=0,totalNight=0,pa1=0,pa2=0,pa3=0;
              pE.forEach(e=>{
                const c=calcEntry(e);
                h133+=c.h1; h150+=c.h2; h200+=c.h3; totalNight+=c.nh;
                gOT+=c.ot; gNight+=c.night; gPA+=c.pa;
                if(e.paRate==='PA1')pa1++; else if(e.paRate==='PA2')pa2++; else if(e.paRate==='PA3')pa3++;
              });
              const tx=(settings.taxRate||40)/100;
              const totG=gOT+gNight+gPA, totN=totG*(1-tx);
              const isExp=expanded===p.month, isCurr=idx===currPeriodIdx;

              return(
                <div key={p.month} ref={el=>monthRefs.current[p.month]=el} style={{background:'#fff',borderRadius:'17px',border:isCurr?'2px solid #bfdbfe':'1px solid #f1f5f9',boxShadow:isCurr?'0 2px 14px rgba(37,99,235,0.09)':'0 1px 5px rgba(0,0,0,0.04)',marginBottom:'9px',overflow:'hidden'}}>
                  <button onClick={()=>setExpanded(isExp?null:p.month)} style={{width:'100%',textAlign:'left',padding:'16px',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'11px'}}>
                      <div>
                        {isCurr&&<div style={{display:'inline-block',background:'#2563eb',color:'#fff',fontSize:'8px',fontWeight:900,padding:'2px 7px',borderRadius:'8px',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>Current Period</div>}
                        <div style={{fontWeight:900,fontSize:'17px',color:'#0f172a',letterSpacing:'-0.3px'}}>{p.month}</div>
                        <div style={{fontSize:'9px',fontWeight:700,color:'#3b82f6',marginTop:'2px'}}>{fmtD(p.start)} – {fmtD(p.end)}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'4px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'4px',background:'#eff6ff',border:'1px solid #bfdbfe',padding:'5px 9px',borderRadius:'9px'}}>
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
                      {/* month summary cards */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'9px',marginBottom:'9px'}}>
                        <div style={{background:'#fff',borderRadius:'13px',padding:'13px',border:'1px solid #dbeafe'}}>
                          <div style={{fontSize:'9px',fontWeight:900,color:'#1e40af',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'7px'}}>OT Pay</div>
                          <div style={{fontSize:'12px',fontWeight:700,color:'#1e3a5f',marginBottom:'1px'}}>Gross: {fmt(gOT)}</div>
                          <div style={{fontSize:'11px',fontWeight:700,color:'#3b82f6',marginBottom:'7px'}}>Net: {fmt(gOT*(1-tx))}</div>
                          <div style={{borderTop:'1px solid #eff6ff',paddingTop:'5px'}}>
                            {h133>0&&<div style={{fontSize:'10px',fontWeight:700,color:'#64748b',marginBottom:'2px'}}>{h133}h@1.33x</div>}
                            {h150>0&&<div style={{fontSize:'10px',fontWeight:700,color:'#64748b',marginBottom:'2px'}}>{h150}h@1.5x</div>}
                            {h200>0&&<div style={{fontSize:'10px',fontWeight:700,color:'#64748b'}}>{h200}h@2.0x</div>}
                          </div>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'9px'}}>
                          {gNight>0&&(
                            <div style={{background:'#0f172a',borderRadius:'13px',padding:'11px',border:'1px solid #1e293b'}}>
                              <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'5px'}}><Ico n="moon" s={11} c="#818cf8"/><div style={{fontSize:'9px',fontWeight:900,color:'#c7d2fe',textTransform:'uppercase',letterSpacing:'0.5px'}}>Night (2000–0600)</div></div>
                              <div style={{fontSize:'12px',fontWeight:700,color:'#e0e7ff',marginBottom:'1px'}}>Gross: {fmt(gNight)}</div>
                              <div style={{fontSize:'11px',fontWeight:700,color:'#818cf8'}}>Net: {fmt(gNight*(1-tx))}</div>
                              <div style={{fontSize:'10px',fontWeight:700,color:'#6366f1',marginTop:'4px'}}>{totalNight}h @ +10%</div>
                            </div>
                          )}
                          <div style={{background:'#fff',borderRadius:'13px',padding:'11px',border:'1px solid #fde68a',flex:1}}>
                            <div style={{fontSize:'9px',fontWeight:900,color:'#92400e',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:'5px'}}>PA</div>
                            <div style={{fontSize:'12px',fontWeight:700,color:'#92400e',marginBottom:'1px'}}>Gross: {fmt(gPA)}</div>
                            <div style={{fontSize:'11px',fontWeight:700,color:'#d97706',marginBottom:'4px'}}>Net: {fmt(gPA*(1-tx))}</div>
                            <div style={{fontSize:'10px',fontWeight:700,color:'#78716c'}}>PA1:{pa1} · PA2:{pa2} · PA3:{pa3}</div>
                          </div>
                        </div>
                      </div>

                      <div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1.5px',textAlign:'center',marginBottom:'9px'}}>Individual Records</div>

                      {pE.length===0
                        ?<div style={{textAlign:'center',padding:'14px',color:'#94a3b8',fontSize:'13px',fontWeight:700}}>No records yet</div>
                        :[...pE].sort((a,b)=>new Date(a.date)-new Date(b.date)).map(e=>{
                          const c=calcEntry(e);
                          const isFut=e.date>todayStr;
                          return(
                            <div key={e.id} style={{background:'#fff',borderRadius:'13px',border:isFut?'1px solid #bfdbfe':'1px solid #f1f5f9',padding:'13px',marginBottom:'7px',position:'relative'}}>
                              {isFut&&<div style={{position:'absolute',top:'-6px',right:'9px',background:'#2563eb',color:'#fff',fontSize:'8px',fontWeight:900,padding:'2px 7px',borderRadius:'7px',textTransform:'uppercase',letterSpacing:'1px'}}>Planned</div>}
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'7px'}}>
                                <div>
                                  <div style={{fontWeight:900,fontSize:'13px',color:'#0f172a'}}>{new Date(e.date+'T12:00:00').toLocaleDateString('en-GB')}</div>
                                  <div style={{fontSize:'10px',fontWeight:700,color:'#3b82f6',marginTop:'2px',textTransform:'uppercase'}}>{e.reason||'Shift'}</div>
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

                              <div style={{background:'#f8fafc',borderRadius:'9px',padding:'9px'}}>
                                {c.h1>0&&<div style={{fontSize:'11px',fontWeight:700,color:'#475569',marginBottom:'2px'}}>1.33x@{c.h1}h=<strong style={{color:'#1e3a5f'}}>£{(c.h1*c.r.r133).toFixed(2)}</strong></div>}
                                {c.h2>0&&<div style={{fontSize:'11px',fontWeight:700,color:'#475569',marginBottom:'2px'}}>1.5x@{c.h2}h=<strong style={{color:'#1e3a5f'}}>£{(c.h2*c.r.r150).toFixed(2)}</strong></div>}
                                {c.h3>0&&<div style={{fontSize:'11px',fontWeight:700,color:'#475569',marginBottom:'2px'}}>2.0x@{c.h3}h=<strong style={{color:'#1e3a5f'}}>£{(c.h3*c.r.r200).toFixed(2)}</strong></div>}
                                {c.nh>0&&<div style={{fontSize:'11px',fontWeight:700,color:'#6366f1',marginBottom:'2px',display:'flex',alignItems:'center',gap:'4px'}}><Ico n="moon" s={10} c="#818cf8"/>{parseFloat(e.nightWorkHours)>0?`Night (${e.nightWorkHours}h worked, ${c.nh}h enhanced)`:`Night ${c.nh}h enhanced`} = <strong style={{color:'#4f46e5'}}>£{c.night.toFixed(2)}</strong></div>}
                                {e.paRate!=='None'&&<div style={{fontSize:'11px',fontWeight:700,color:'#b45309',marginBottom:'2px'}}>{e.paRate}=<strong>£{c.pa.toFixed(2)}</strong></div>}
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px',borderTop:'1px solid #e2e8f0',paddingTop:'7px',marginTop:'4px'}}>
                                  <div><div style={{fontSize:'9px',fontWeight:900,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'1px'}}>Gross</div><div style={{fontWeight:900,fontSize:'13px',color:'#1e3a5f'}}>{fmt(c.gross)}</div></div>
                                  <div style={{textAlign:'right'}}><div style={{fontSize:'9px',fontWeight:900,color:'#059669',textTransform:'uppercase',letterSpacing:'1px'}}>Net</div><div style={{fontWeight:900,fontSize:'13px',color:'#059669'}}>{fmt(c.net)}</div></div>
                                </div>
                              </div>
                              {e.comments&&<div style={{fontSize:'11px',fontStyle:'italic',color:'#93c5fd',borderLeft:'2px solid #bfdbfe',paddingLeft:'8px',marginTop:'7px'}}>"{e.comments}"</div>}
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
                const data=PAY_PERIODS.map(p=>{
                  const pE=fyEntries.filter(e=>e.date>=p.start&&e.date<=p.end);
                  let g=0; pE.forEach(e=>{g+=calcEntry(e).gross;});
                  return{short:p.short,gross:g,net:g*(1-(settings.taxRate||40)/100)};
                });
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
                <label style={S.lbl}>Rank</label>
                <select style={S.sel} value={settings.rank} onChange={e=>{
                  const r=e.target.value;
                  if(!r) return saveSett({...settings,rank:'',service:''});
                  saveSett({...settings,rank:r,service:''});
                }}>
                  <option value="">Select Rank...</option>
                  {Object.keys(PAY_RATES).map(k=><option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              {settings.rank&&(
                <div style={{marginBottom:'13px'}}>
                  <label style={S.lbl}>Pay Point</label>
                  <select style={S.sel} value={settings.service} onChange={e=>saveSett({...settings,service:e.target.value})}>
                    <option value="">Select pay point...</option>
                    {Object.keys(PAY_RATES[settings.rank]).map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}
              <div style={{borderTop:'1px solid #f1f5f9',paddingTop:'14px'}}>
                <label style={S.lbl}>Tax Rate</label>
                <div style={{display:'flex',gap:'5px',background:'#f8fafc',padding:'5px',borderRadius:'13px',border:'1px solid #f1f5f9'}}>
                  {[20,40,45].map(rate=>(
                    <button key={rate} onClick={()=>saveSett({...settings,taxRate:rate})} style={{flex:1,padding:'9px 4px',borderRadius:'9px',border:'none',fontFamily:'inherit',cursor:'pointer',transition:'all 0.18s',background:settings.taxRate===rate?'#2563eb':'transparent',color:settings.taxRate===rate?'#fff':'#64748b',boxShadow:settings.taxRate===rate?'0 3px 9px rgba(37,99,235,0.32)':'none',display:'flex',flexDirection:'column',alignItems:'center',gap:'2px'}}>
                      <span style={{fontSize:'14px',fontWeight:900}}>{rate}%</span>
                      <span style={{fontSize:'8px',fontWeight:700,opacity:settings.taxRate===rate?0.8:0.5,textTransform:'uppercase',letterSpacing:'0.3px'}}>{TAX_LABELS[rate]}</span>
                    </button>
                  ))}
                </div>
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
                    <span style={{fontSize:'10px',fontWeight:700,color:'#4f46e5'}}>Night enhancement (from 1 Sep 2026): £{(svcData.post.base*0.10).toFixed(2)}/hr</span>
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
                  <button onClick={handleExport} style={{flex:1,padding:'10px',background:'#2563eb',border:'none',borderRadius:'10px',color:'#fff',fontWeight:900,fontSize:'10px',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px',textTransform:'uppercase',letterSpacing:'1px'}}><Ico n="dl" s={12} c="#fff"/> Backup</button>
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
          </div>
        )}
      </main>

      {/* floating save button (Log Shift only) */}
      {tab==='add'&&(
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
          <button key={t.id} onClick={()=>{ setEditing(null); if(t.id==='add') setForm({...blankForm,date:todayStr}); setTab(t.id); }} style={S.nBtn(tab===t.id,t.id==='add')}>
            <Ico n={t.n} s={t.id==='add'?21:18} c={t.id==='add'?'#fff':tab===t.id?'#2563eb':'#94a3b8'} w={tab===t.id||t.id==='add'?2.5:2}/>
            <span style={S.nLbl}>{t.lbl}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
