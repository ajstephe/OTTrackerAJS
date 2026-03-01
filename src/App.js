import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Home, PlusCircle, Settings as SettingsIcon, Edit2, Trash2, 
  ArrowLeft, Save, PoundSterling, Clock, ChevronRight, 
  Loader2, Calendar, BarChart3, UserPlus, CheckCircle2,
  Download, Upload, ShieldCheck, TrendingUp, ChevronDown, AlertTriangle
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, getDocs, query } from 'firebase/firestore';

// --- CONFIG & INITIALIZATION ---
let firebaseConfig = {};
try { if (typeof __firebase_config !== 'undefined' && __firebase_config) { firebaseConfig = JSON.parse(__firebase_config); } } catch (e) {}
const appId = typeof __app_id !== 'undefined' && __app_id ? __app_id : 'ajshieldpay-ot-tracker';

let isFirebaseValid = false;
let app, auth, db;
try {
  if (firebaseConfig && firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseValid = true;
  }
} catch (e) { console.warn("Running in local mode."); }

const FY_START = '2026-02-09';
const FY_END = '2027-02-07';

const PAY_PERIODS = [
  { month: 'April 2026', short: 'Apr', start: '2026-02-09', end: '2026-03-08' },
  { month: 'May 2026', short: 'May', start: '2026-03-09', end: '2026-04-12' },
  { month: 'June 2026', short: 'Jun', start: '2026-04-13', end: '2026-05-10' },
  { month: 'July 2026', short: 'Jul', start: '2026-05-11', end: '2026-06-07' },
  { month: 'August 2026', short: 'Aug', start: '2026-06-08', end: '2026-07-12' },
  { month: 'September 2026', short: 'Sep', start: '2026-07-13', end: '2026-08-09' },
  { month: 'October 2026', short: 'Oct', start: '2026-08-10', end: '2026-09-06' },
  { month: 'November 2026', short: 'Nov', start: '2026-09-07', end: '2026-10-11' },
  { month: 'December 2026', short: 'Dec', start: '2026-10-12', end: '2026-11-08' },
  { month: 'January 2027', short: 'Jan', start: '2026-11-09', end: '2026-12-06' },
  { month: 'February 2027', short: 'Feb', start: '2026-12-07', end: '2027-01-10' },
  { month: 'March 2027', short: 'Mar', start: '2027-01-11', end: '2027-02-07' }
];

const PAY_RATES = {
  'Constable (Joined Pre 2013)': {
    'PC - Year 4': { r133: 25.688, r150: 28.906, r200: 38.541 },
    'PC - Year 5': { r133: 26.470, r150: 29.787, r200: 39.715 },
    'PC - Year 6': { r133: 28.677, r150: 32.270, r200: 43.027 },
    'PC - Year 7+': { r133: 30.910, r150: 34.782, r200: 46.376 }
  },
  'Constable (Joined Post 2013)': {
    'PC - Year 3': { r133: 20.781, r150: 23.385, r200: 31.180 },
    'PC - Year 4': { r133: 21.591, r150: 24.296, r200: 32.394 },
    'PC - Year 5': { r133: 23.210, r150: 26.117, r200: 34.823 },
    'PC - Year 6': { r133: 26.470, r150: 29.787, r200: 39.715 },
    'PC - Year 7+': { r133: 30.910, r150: 34.782, r200: 46.376 }
  },
  'Sergeant': {
    'Sgt - Point 1': { r133: 32.946, r150: 37.073, r200: 49.431 },
    'Sgt - Point 2': { r133: 33.619, r150: 37.830, r200: 50.440 },
    'Sgt - Point 3+': { r133: 34.570, r150: 38.901, r200: 51.868 }
  }
};

const PA_RATES = { 'None': 0, 'PA1': 40, 'PA2': 90, 'PA3': 125 };

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState({ rank: '', service: '', rates: { r133: 0, r150: 0, r200: 0 }, taxRate: 40 });
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const mainRef = useRef(null);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0], reason: '', hours133: '', hours150: '', hours200: '', paRate: 'None', comments: ''
  });

  // --- SCROLL TO TOP ON TAB CHANGE ---
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  // Init Auth
  useEffect(() => {
    if (!isFirebaseValid) {
      const savedEntries = localStorage.getItem('ajs_ot_v5');
      const savedSett = localStorage.getItem('ajs_sett_v5');
      if (savedEntries) setEntries(JSON.parse(savedEntries));
      if (savedSett) setSettings(JSON.parse(savedSett));
      setAuthLoading(false); setDataLoading(false); return;
    }
    const init = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) { await signInWithCustomToken(auth, __initial_auth_token); }
        else { await signInAnonymously(auth); }
      } catch (err) { console.error(err); }
    };
    init();
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
  }, []);

  // Sync Listener
  useEffect(() => {
    if (!isFirebaseValid) {
      localStorage.setItem('ajs_ot_v5', JSON.stringify(entries));
      localStorage.setItem('ajs_sett_v5', JSON.stringify(settings));
      return;
    }
    if (!user) return;
    const entriesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'entries');
    const settRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config');
    const unsubE = onSnapshot(entriesRef, (snap) => { setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setDataLoading(false); }, (err) => setDataLoading(false));
    const unsubS = onSnapshot(settRef, (snap) => { if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() })); });
    return () => { unsubE(); unsubS(); };
  }, [user, entries, settings]);

  const fyEntries = useMemo(() => entries.filter(e => e.date >= FY_START && e.date <= FY_END), [entries]);

  const totals = useMemo(() => {
    let gOT = 0, gPA = 0, tH = 0;
    const r = settings.rates || { r133: 0, r150: 0, r200: 0 };
    fyEntries.forEach(e => {
      const h = { r1: parseFloat(e.hours133)||0, r2: parseFloat(e.hours150)||0, r3: parseFloat(e.hours200)||0 };
      tH += (h.r1 + h.r2 + h.r3);
      gOT += (h.r1 * r.r133) + (h.r2 * r.r150) + (h.r3 * r.r200);
      gPA += PA_RATES[e.paRate] || 0;
    });
    const totalGross = gOT + gPA, totalNet = totalGross * (1 - (settings.taxRate / 100));
    const todayStr = new Date().toISOString().split('T')[0];
    const cIdx = PAY_PERIODS.findIndex(p => todayStr >= p.start && todayStr <= p.end);
    const getP = (i) => {
      if (i < 0 || i >= PAY_PERIODS.length) return null;
      const p = PAY_PERIODS[i];
      const pE = fyEntries.filter(e => e.date >= p.start && e.date <= p.end);
      let gr = 0; pE.forEach(e => { 
        gr += (parseFloat(e.hours133)||0)*r.r133 + (parseFloat(e.hours150)||0)*r.r150 + (parseFloat(e.hours200)||0)*r.r200 + (PA_RATES[e.paRate] || 0); 
      });
      return { month: p.month, start: p.start, end: p.end, gross: gr, net: gr * (1 - settings.taxRate / 100) };
    };
    return { totalGross, totalNet, totalHrs: tH, prev: getP(cIdx-1), curr: getP(cIdx), next: getP(cIdx+1) };
  }, [fyEntries, settings]);

  const handleSave = async () => {
    if (!formData.date) return;
    if (editingEntry) {
      if (!isFirebaseValid || !user) {
        setEntries(entries.map(e => e.id === editingEntry.id ? {...formData, id: e.id} : e));
      } else {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'entries', editingEntry.id), formData);
      }
      setActiveTab('months');
    } else {
      if (!isFirebaseValid || !user) {
        setEntries([...entries, {...formData, id: Date.now().toString()}]);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'entries'), formData);
      }
      setShowSaveSuccess(true); setTimeout(() => setShowSaveSuccess(false), 3000);
      mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setFormData({ date: new Date().toISOString().split('T')[0], reason: '', hours133: '', hours150: '', hours200: '', paRate: 'None', comments: '' });
    setEditingEntry(null);
  };

  const editEntry = (e) => { setFormData(e); setEditingEntry(e); setActiveTab('add'); mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); };
  
  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ entries, settings }));
    const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", "AJS_OT_Backup.json"); dl.click();
  };

  const handleImport = (ev) => {
    const reader = new FileReader(); 
    reader.onload = (e) => { 
        const i = JSON.parse(e.target.result); 
        setEntries(i.entries); 
        setSettings(i.settings); 
        setActiveTab('dashboard'); 
    };
    reader.readAsText(ev.target.files[0]);
  };

  const deleteEntry = async (id) => {
    if (isFirebaseValid && user) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'entries', id));
    } else {
        setEntries(prev => prev.filter(x => x.id !== id));
    }
  };

  const handleWipeAllData = async () => {
    setEntries([]);
    setSettings({ rank: '', service: '', rates: { r133: 0, r150: 0, r200: 0 }, taxRate: 40 });
    localStorage.removeItem('ajs_ot_v5');
    localStorage.removeItem('ajs_sett_v5');

    if (isFirebaseValid && user) {
      try {
        const batch = writeBatch(db);
        const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'entries'));
        const snapshot = await getDocs(q);
        snapshot.forEach((d) => batch.delete(d.ref));
        const settingsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config');
        batch.delete(settingsRef);
        await batch.commit();
      } catch (err) {
        console.error("Cloud wipe failed:", err);
      }
    }
    setShowDeleteConfirm(false);
    setActiveTab('dashboard');
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto relative bg-slate-50 border-x border-gray-200 shadow-2xl overflow-hidden font-sans text-gray-900">
      <header className="bg-white p-5 border-b flex items-center justify-center shrink-0 z-10 shadow-sm">
        <h1 className="text-lg font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-950 to-blue-600 flex items-center gap-2">
          <PoundSterling className="text-blue-700 w-5 h-5" /> Overtime Tracker by AJS
        </h1>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
        {activeTab === 'dashboard' && (
          <div className="p-4 space-y-6 pb-24 fade-in">
            {!settings.rank && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4 animate-pulse"><UserPlus className="w-6 h-6 text-amber-600 shrink-0" /><div><h3 className="font-bold text-amber-900 text-sm">Action Required</h3><p className="text-amber-800 text-xs mt-1">Configure your rank and pay in Settings.</p><button onClick={() => setActiveTab('settings')} className="mt-2 text-xs font-bold text-amber-900 bg-amber-200 px-3 py-1.5 rounded-lg">Go to Settings</button></div></div>}
            
            <div className="space-y-3">
                <h3 className="font-black text-gray-800 text-sm uppercase px-1 tracking-wider leading-none">Monthly Overtime Summary</h3>
                {[totals.curr, totals.next, totals.prev].map((item, i) => item && (
                    <div key={i} className={`rounded-2xl p-5 border flex justify-between items-center transition-all ${i === 0 ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-100'}`}>
                        <div className="flex-1">
                          <p className={`text-[9px] font-black uppercase mb-1 ${i === 0 ? 'text-blue-600' : 'text-gray-600'}`}>
                            {i === 0 ? 'Current' : i === 1 ? 'Next' : 'Previous'} Pay Month
                          </p>
                          <h4 className="font-bold text-gray-800 leading-none">{item.month}</h4>
                          <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest mt-2 leading-none">
                            {new Date(item.start).toLocaleDateString('en-GB', {day:'numeric', month:'short'})} - {new Date(item.end).toLocaleDateString('en-GB', {day:'numeric', month:'short'})}
                          </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-black text-blue-900 mb-1 leading-none">£{item.gross.toFixed(2)} <span className="text-[9px] font-normal uppercase opacity-60 tracking-tight">Gross</span></p>
                            <p className="text-xs font-black text-emerald-600 leading-none">£{item.net.toFixed(2)} <span className="text-[9px] font-normal uppercase opacity-60 tracking-tight">Net</span></p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-blue-950 rounded-3xl p-7 text-white shadow-xl relative overflow-hidden">
                <div className="absolute -right-4 -top-4 bg-white/5 w-24 h-24 rounded-full blur-2xl"></div>
                <p className="text-blue-300 text-[10px] font-black uppercase tracking-widest mb-1 leading-none">Gross Total 26/27</p>
                <h2 className="text-5xl font-black mb-6 tracking-tight">£{totals.totalGross.toFixed(2)}</h2>
                <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
                    <div><p className="text-blue-400 text-[10px] uppercase font-bold tracking-wider">Est. Net</p><p className="text-2xl font-bold text-emerald-400">£{totals.totalNet.toFixed(2)}</p></div>
                    <div><p className="text-blue-400 text-[10px] uppercase font-bold tracking-wider">Hours</p><p className="text-2xl font-bold flex items-center gap-2"><Clock className="w-5 h-5 opacity-50" /> {totals.totalHrs.toFixed(1)}</p></div>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2 text-xs uppercase tracking-widest leading-none"><TrendingUp className="w-4 h-4 text-blue-600" /> Hourly Rate</h3>
                <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm font-black text-gray-800 truncate"><span className="text-gray-400 font-bold uppercase text-[10px]">Rank</span>{settings.service || 'Not Selected'}</div>
                    <div className="grid grid-cols-3 gap-3 pt-1">
                        {['1.33x', '1.5x', '2.0x'].map((label, i) => (
                            <div key={label} className="bg-slate-50 p-2 rounded-xl text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase mb-1">{label}</p>
                                <p className="text-xs font-black text-blue-900">£{(settings.rates?.[['r133', 'r150', 'r200'][i]] || 0).toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'add' && (
          <div className="p-4 pb-24 fade-in">
            <h2 className="text-2xl font-black text-gray-800 mb-8 px-1 tracking-tight leading-tight">{editingEntry ? 'Edit Record' : 'Log Overtime and Protection Allowance'}</h2>
            {showSaveSuccess && <div className="mb-6 bg-emerald-50 text-emerald-800 p-4 rounded-xl flex items-center gap-4 border border-emerald-100 animate-in fade-in"><CheckCircle2 className="text-emerald-500 w-6 h-6" /><p className="font-black text-sm">Shift Logged Successfully</p></div>}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Date</label>
                        <input type="date" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Duty / Reason</label>
                        <input type="text" placeholder="e.g. MPL7XX, PXX" className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} />
                    </div>
                </div>

                <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 space-y-4">
                    <p className="text-[11px] font-black text-blue-900 uppercase tracking-widest text-center leading-none">Overtime Hours</p>
                    <div className="grid grid-cols-3 gap-4">
                        {['hours133', 'hours150', 'hours200'].map((h, i) => (
                            <div key={h} className="text-center"><label className="block text-[10px] font-black text-blue-600 mb-2 leading-none">{[1.33, '1.5', 2.0][i]}x</label><input type="number" step="0.25" placeholder="0" className="w-full border-none rounded-2xl p-3 text-center text-sm font-black shadow-inner focus:ring-2 focus:ring-blue-500 outline-none" value={formData[h]} onChange={e => setFormData({...formData, [h]: e.target.value})} /></div>
                        ))}
                    </div>
                </div>

                <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100 space-y-4">
                    <p className="text-[11px] font-black text-amber-900 uppercase tracking-widest text-center leading-none">PA Allowance</p>
                    <div className="flex gap-2">
                        {['None', 'PA1', 'PA2', 'PA3'].map(pa => (
                            <button key={pa} onClick={() => setFormData({...formData, paRate: pa})} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${formData.paRate === pa ? 'bg-teal-500 text-white shadow-lg' : 'bg-white text-amber-900/50 hover:bg-amber-100'}`}>{pa}</button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1 leading-none">Notes</label>
                    <textarea rows="3" placeholder="Add shift notes or incident details..." className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-inner resize-none transition-all" value={formData.comments} onChange={e => setFormData({...formData, comments: e.target.value})} />
                </div>

                <button onClick={handleSave} className="w-full bg-blue-600 text-white font-black p-5 rounded-2xl shadow-xl active:scale-95 transition-all flex justify-center items-center gap-3"><Save className="w-6 h-6" /> {editingEntry ? 'Update Record' : 'Save Record'}</button>
            </div>
          </div>
        )}

        {activeTab === 'months' && (
          <div className="p-4 space-y-4 pb-24 fade-in">
            <h2 className="text-2xl font-black text-gray-800 px-1 tracking-tight">Breakdown</h2>
            {PAY_PERIODS.map(p => {
              const pE = fyEntries.filter(e => e.date >= p.start && e.date <= p.end);
              let gOT = 0, gPA = 0, h133=0, h150=0, h200=0, pa1=0, pa2=0, pa3=0;
              pE.forEach(e => {
                const hr = { r1: parseFloat(e.hours133)||0, r2: parseFloat(e.hours150)||0, r3: parseFloat(e.hours200)||0 };
                h133 += hr.r1; h150 += hr.r2; h200 += hr.r3;
                gOT += (hr.r1 * (settings.rates?.r133 || 0)) + (hr.r2 * (settings.rates?.r150 || 0)) + (hr.r3 * (settings.rates?.r200 || 0));
                gPA += (PA_RATES[e.paRate] || 0);
                if (e.paRate === 'PA1') pa1++; else if (e.paRate === 'PA2') pa2++; else if (e.paRate === 'PA3') pa3++;
              });
              const taxRate = (settings.taxRate || 40) / 100, nOT = gOT * (1 - taxRate), nPA = gPA * (1 - taxRate), totG = gOT + gPA, totN = totG * (1 - taxRate);
              const isExp = expandedMonth === p.month;
              return (
                <div key={p.month} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <button onClick={() => setExpandedMonth(isExp ? null : p.month)} className="w-full text-left p-5 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-gray-800 text-xl tracking-tight leading-none">{p.month}</h3>
                                <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest mt-2 leading-none">
                                    {new Date(p.start).toLocaleDateString('en-GB', {day:'numeric', month:'short'})} - {new Date(p.end).toLocaleDateString('en-GB', {day:'numeric', month:'short'})}
                                </p>
                            </div>
                            <div className="flex flex-col items-center">
                              <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-xl text-blue-700 font-black text-xs uppercase">
                                  {(h133+h150+h200).toFixed(1)} Hours 
                                  <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${isExp ? 'rotate-90' : 'rotate-0'}`} />
                              </div>
                              {!isExp && <span className="text-[7px] font-black text-blue-400 uppercase mt-1 tracking-tighter">Expand</span>}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/50 space-y-1">
                                <p className="text-[9px] font-black text-blue-800 uppercase tracking-wider mb-1">Overtime Pay</p>
                                <div className="flex justify-between text-[10px] font-bold text-blue-900"><span>Gross:</span><span>£{gOT.toFixed(2)}</span></div>
                                <div className="flex justify-between text-[10px] font-bold text-blue-700"><span>Net:</span><span>£{nOT.toFixed(2)}</span></div>
                                <div className="pt-1 mt-1 border-t border-blue-200/50 text-[8px] font-black text-blue-600 uppercase tracking-tighter">1.33x:{h133}Hrs • 1.5x:{h150}Hrs • 2.0x:{h200}Hrs</div>
                            </div>
                            <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-100/50 space-y-1">
                                <p className="text-[9px] font-black text-amber-800 uppercase tracking-wider mb-1">PA Allowance</p>
                                <div className="flex justify-between text-[10px] font-bold text-amber-900"><span>Gross:</span><span>£{gPA.toFixed(2)}</span></div>
                                <div className="flex justify-between text-[10px] font-bold text-amber-700"><span>Net:</span><span>£{nPA.toFixed(2)}</span></div>
                                <div className="pt-1 mt-1 border-t border-amber-200/50 text-[8px] font-black text-amber-600 uppercase tracking-tighter">PA1:{pa1} • PA2:{pa2} • PA3:{pa3}</div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-4 mt-2">
                            <div><p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Monthly Gross</p><p className="font-black text-blue-950 text-xl leading-none">£{totG.toFixed(2)}</p></div>
                            <div className="text-right"><p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1 leading-none">Monthly Net</p><p className="font-black text-emerald-600 text-xl leading-none">£{totN.toFixed(2)}</p></div>
                        </div>
                    </button>
                    {isExp && (
                        <div className="bg-slate-50/50 p-4 space-y-3 border-t border-gray-100 animate-in fade-in duration-300">
                            {pE.length === 0 ? <p className="text-center text-xs py-8 text-gray-400 font-bold uppercase tracking-widest leading-none">No individual records yet.</p> : 
                                [...pE].sort((a,b) => new Date(a.date) - new Date(b.date)).map(e => {
                                    const hrs133 = parseFloat(e.hours133)||0, hrs150 = parseFloat(e.hours150)||0, hrs200 = parseFloat(e.hours200)||0;
                                    const val133 = hrs133 * (settings.rates?.r133||0), val150 = hrs150 * (settings.rates?.r150||0), val200 = hrs200 * (settings.rates?.r200||0);
                                    const ePA = PA_RATES[e.paRate] || 0, eG = val133 + val150 + val200 + ePA, eN = eG * (1 - taxRate);
                                    const isFuture = e.date > todayStr;
                                    return (
                                        <div key={e.id} className={`bg-white p-4 rounded-xl border shadow-sm space-y-3 relative ${isFuture ? 'border-blue-200 ring-1 ring-blue-50' : 'border-gray-100'}`}>
                                            {isFuture && <div className="absolute -top-2 -right-1 bg-blue-600 text-white text-[7px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">Planned</div>}
                                            <div className="flex justify-between items-start">
                                                <div><p className="text-sm font-black text-gray-800 leading-none">{new Date(e.date).toLocaleDateString('en-GB')}</p><p className="text-[10px] text-blue-600 font-bold mt-1.5 leading-none uppercase">{e.reason || 'Shift'}</p></div>
                                                <div className="flex gap-1.5">
                                                    <button onClick={() => editEntry(e)} className="p-2 text-gray-400 hover:text-blue-600 bg-slate-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                                                    <button onClick={() => deleteEntry(e.id)} className="p-2 text-gray-400 hover:text-red-600 bg-slate-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                            <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
                                                <div className="space-y-1">
                                                    {hrs133 > 0 && <p className="text-[10px] font-bold text-gray-600">1.33x @ {hrs133}Hrs = <span className="text-blue-900 font-black">£{val133.toFixed(2)}</span></p>}
                                                    {hrs150 > 0 && <p className="text-[10px] font-bold text-gray-600">1.5x @ {hrs150}Hrs = <span className="text-blue-900 font-black">£{val150.toFixed(2)}</span></p>}
                                                    {hrs200 > 0 && <p className="text-[10px] font-bold text-gray-600">2.0x @ {hrs200}Hrs = <span className="text-blue-900 font-black">£{val200.toFixed(2)}</span></p>}
                                                    {e.paRate !== 'None' && <p className="text-[10px] font-bold text-amber-700">Allowance: 1x {e.paRate} = <span className="font-black">£{ePA.toFixed(2)}</span></p>}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold border-t border-slate-200 pt-2 mt-1">
                                                    <div className="flex justify-between"><span>Entry Total Gross:</span> <span className="text-blue-950 font-black">£{eG.toFixed(2)}</span></div>
                                                    <div className="flex justify-between"><span>Entry Total Net:</span> <span className="text-emerald-700 font-black">£{eN.toFixed(2)}</span></div>
                                                </div>
                                            </div>
                                            {e.comments && <p className="text-[10px] italic text-blue-400 border-l-2 border-blue-100 pl-2 mt-1">"{e.comments}"</p>}
                                        </div>
                                    );
                                })
                            }
                        </div>
                    )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'graph' && (
          <div className="p-4 pb-24 fade-in">
            <h2 className="text-2xl font-black text-gray-800 mb-2 px-1 tracking-tight">Earnings Trends</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-8 px-1 leading-none">Gross vs Net (Monthly)</p>
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                {(() => {
                    const data = PAY_PERIODS.map(p => {
                        const pE = fyEntries.filter(e => e.date >= p.start && e.date <= p.end);
                        let g = 0; const r = settings.rates || { r133: 0, r150: 0, r200: 0 }; 
                        pE.forEach(e => { g += (parseFloat(e.hours133)||0)*r.r133 + (parseFloat(e.hours150)||0)*r.r150 + (parseFloat(e.hours200)||0)*r.r200 + (PA_RATES[e.paRate] || 0); });
                        return { short: p.short, gross: g, net: g * (1 - (settings.taxRate || 40)/100) };
                    });
                    const max = Math.max(...data.map(d => d.gross), 200);
                    const pX = 40, pY = 20, w = 400, h = 240, effW = w - (pX * 2), effH = h - (pY * 2);
                    const pts = data.map((d, i) => ({ x: pX + (i * (effW / (data.length - 1))), yG: h - pY - ((d.gross / max) * effH), yN: h - pY - ((d.net / max) * effH), label: d.short }));
                    const gPath = `M ${pts.map(p => `${p.x} ${p.yG}`).join(' L ')}`, nPath = `M ${pts.map(p => `${p.x} ${p.yN}`).join(' L ')}`;
                    return (
                        <div className="w-full">
                            <div className="relative w-full aspect-[4/3]">
                                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                    {[0, 0.5, 1].map(v => (
                                      <g key={v}><line x1={pX} y1={h-pY-(v*effH)} x2={w-pX} y2={h-pY-(v*effH)} stroke="#f1f5f9" strokeWidth="1" strokeDasharray={v === 0 ? "0" : "4 4"} /><text x={pX - 8} y={h-pY-(v*effH)} textAnchor="end" alignmentBaseline="middle" className="text-[10px] font-black fill-slate-300">£{Math.round(max * v)}</text></g>
                                    ))}
                                    {pts.map((p, i) => (<text key={i} x={p.x} y={h - pY + 16} textAnchor="middle" className="text-[10px] font-black fill-slate-400 uppercase">{p.label}</text>))}
                                    <path d={nPath} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d={gPath} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    {pts.map((p, i) => (<g key={i}><circle cx={p.x} cy={p.yG} r="3" fill="#22c55e" stroke="white" strokeWidth="1" /><circle cx={p.x} cy={p.yN} r="3" fill="#ef4444" stroke="white" strokeWidth="1" /></g>))}
                                </svg>
                            </div>
                            <div className="mt-4 flex justify-center gap-8"><div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-green-500"></div><span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Gross</span></div><div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-red-500"></div><span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Net</span></div></div>
                        </div>
                    );
                })()}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-4 pb-24 space-y-6 fade-in">
            <h2 className="text-xl font-black text-gray-800 px-1 tracking-tight">Settings</h2>
            <div className="bg-white rounded-3xl p-7 shadow-sm border border-gray-100 space-y-8">
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1 leading-none">Rank & Era</label>
                        <select className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 mb-4 transition-all" value={settings.rank} onChange={e => {
                            const r = e.target.value; if (!r) return setSettings({...settings, rank: '', service: ''});
                            const s = Object.keys(PAY_RATES[r])[0];
                            setSettings({...settings, rank: r, service: s, rates: PAY_RATES[r][s]});
                        }}><option value="">Select Rank...</option>{Object.keys(PAY_RATES).map(k => <option key={k} value={k}>{k}</option>)}</select>
                        {settings.rank && (
                            <>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1 animate-in fade-in">Pay Point</label>
                                <select className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all animate-in fade-in" value={settings.service} onChange={(e) => setSettings({...settings, service: e.target.value, rates: PAY_RATES[settings.rank][e.target.value]})}>{Object.keys(PAY_RATES[settings.rank]).map(p => <option key={p} value={p}>{p}</option>)}</select>
                            </>
                        )}
                    </div>
                </div>
                <div className="border-t border-slate-50 pt-8 text-center">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 leading-none">Tax Calculation (%)</label>
                    <div className="flex gap-2 p-1.5 bg-slate-50 rounded-2xl border border-slate-100">
                        {[20, 40, 45].map(rate => (<button key={rate} onClick={()=>setSettings({...settings, taxRate: rate})} className={`flex-1 py-4 rounded-xl text-sm font-black transition-all ${settings.taxRate===rate ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-slate-400 hover:bg-slate-200'}`}>{rate}%</button>))}
                    </div>
                </div>
            </div>
            
            <div className="bg-blue-900 rounded-3xl p-6 text-white shadow-xl space-y-8">
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-white/10 rounded-2xl shadow-inner"><ShieldCheck className="w-8 h-8 text-blue-100" /></div>
                    <div><h3 className="font-bold text-lg leading-none mb-1 tracking-tight uppercase">Data Management</h3><p className="text-blue-200 text-xs">Records stored locally.</p></div>
                </div>
                
                <div className="bg-blue-950/50 rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 flex items-center gap-2"><Download className="w-3 h-3" /> External Backup</p>
                    <p className="text-[11px] text-blue-100/70 leading-relaxed italic">Create a backup or restore from a backup if you ever need to clear your web browser.</p>
                    <div className="flex gap-2">
                        <button onClick={handleExport} className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-xl text-[10px] font-black flex justify-center items-center gap-2 transition-all active:scale-95"><Download className="w-3 h-3" /> Backup</button>
                        <button onClick={() => fileInputRef.current.click()} className="flex-1 bg-white/10 hover:bg-white/20 py-3 rounded-xl text-[10px] font-black flex justify-center items-center gap-2 transition-all active:scale-95"><Upload className="w-3 h-3" /> Restore</button>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImport} />
                    </div>
                </div>

                <div className="pt-8 border-t border-white/5 space-y-3">
                    <button onClick={() => setShowDeleteConfirm(true)} className="w-full bg-red-600/20 hover:bg-red-600 hover:text-white text-red-500 py-4 rounded-xl text-[10px] font-black flex justify-center items-center gap-2 transition-all active:scale-95 border border-red-600/30 group">
                        <Trash2 className="w-3.5 h-3.5 transition-transform group-hover:rotate-12" /> Delete All Data
                    </button>
                    <p className="text-[9px] text-center text-white/30 font-bold uppercase tracking-tighter">This action will erase everything from this device.</p>
                </div>
            </div>
          </div>
        )}
      </main>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-blue-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowDeleteConfirm(false)}></div>
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm relative z-10 shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-center mb-6"><div className="bg-red-50 p-4 rounded-full border border-red-100"><AlertTriangle className="w-10 h-10 text-red-500" /></div></div>
            <h3 className="text-xl font-black text-gray-900 text-center mb-2 tracking-tight uppercase">Erase all records?</h3>
            <p className="text-center text-sm text-gray-500 mb-8 leading-relaxed">This will permanently delete every shift logged and reset your rank settings. <br/><span className="font-bold text-red-600 underline">This cannot be undone.</span></p>
            <div className="grid grid-cols-2 gap-3"><button onClick={() => setShowDeleteConfirm(false)} className="bg-slate-50 hover:bg-slate-100 text-slate-600 font-black py-4 rounded-2xl transition-all active:scale-95">No, Keep</button><button onClick={handleWipeAllData} className="bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-red-600/20 transition-all active:scale-95">Yes, Delete</button></div>
          </div>
        </div>
      )}

      <nav className="bg-white/80 backdrop-blur-md border-t border-gray-100 absolute bottom-0 w-full px-4 h-20 pb-safe shrink-0 z-20 flex justify-between items-center shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.05)]">
        {[
          { id: 'dashboard', icon: Home, label: 'Home', color: 'text-slate-600' },
          { id: 'add', icon: PlusCircle, label: 'Log OT & PA', color: 'bg-teal-500 text-white shadow-lg shadow-teal-500/20' },
          { id: 'months', icon: Calendar, label: 'Breakdown', color: 'text-slate-600' },
          { id: 'graph', icon: BarChart3, label: 'Trends', color: 'text-slate-600' },
          { id: 'settings', icon: SettingsIcon, label: 'Settings', color: 'text-slate-600' }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const isSpecial = tab.id === 'add';
          
          if (isSpecial) {
            return (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)} 
                className={`flex flex-col items-center gap-1 transition-all py-2.5 px-4 rounded-2xl active:scale-90 ${isActive ? 'bg-teal-600 shadow-teal-600/30' : tab.color}`}
              >
                <tab.icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                <span className="text-[8px] font-black uppercase tracking-tight">{tab.label}</span>
              </button>
            );
          }

          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-1.5 transition-all px-2 ${isActive ? 'text-blue-600 scale-110' : `${tab.color} hover:text-slate-900`}`}>
              <tab.icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
              <span className="text-[9px] font-black uppercase tracking-tighter">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
