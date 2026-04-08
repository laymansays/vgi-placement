/* ═══════════════════════════════════════════════════════════════════
   shared.js — Common utilities for the Campus Placement Portal
   Used by: index.html, student.html
   NOT used by: placement.html (self-contained legacy file)
═══════════════════════════════════════════════════════════════════ */

/* ── CONSTANTS ── */
const CONFIG_SHEET_ID    = '__SHEET_ID__';
const CONFIG_TAB         = 'CONFIG_TAB';
const ADMIN_DATA_TAB     = 'ADMIN_MODE';
const STUDENT_MASTER_TAB = 'STUDENT_MASTER';

/* ── TINY HELPERS ── */
function xe(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function ini(n){ return (n||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?'; }
function fmtDate(d){
  if(!d) return '—';
  try{ return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }catch{ return d; }
}

/* ── GRADIENT PALETTE (avatar fallback) ── */
const GRAD=[['#1B3055','#8A6C10'],['#1A5E3C','#1B3055'],['#8A6C10','#7A1A28'],['#1C5A72','#1A5E3C'],['#3C2060','#1B3055'],['#1A5E3C','#1C5A72'],['#7A1A28','#8A6C10'],['#1B3055','#3C2060']];
function avgr(i){ const p=GRAD[i%GRAD.length]; return `linear-gradient(135deg,${p[0]},${p[1]})`; }

/* ── FETCH WITH TIMEOUT ── */
async function fetchWithTimeout(url, ms=9000){
  const ctrl=new AbortController();
  const tid=setTimeout(()=>ctrl.abort(), ms);
  try{
    const res=await fetch(url,{signal:ctrl.signal});
    clearTimeout(tid); return res;
  }catch(e){
    clearTimeout(tid);
    if(e.name==='AbortError') throw new Error(`Request timed out — check your internet and that the sheet is public.`);
    throw e;
  }
}

/* ── FETCH CONFIG/ADMIN JSON (JSONP endpoint) ── */
async function fetchConfigJSON(sheetId, tabName){
  const url=`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
  const res=await fetchWithTimeout(url);
  if(!res.ok) throw new Error(`HTTP ${res.status} fetching ${tabName}`);
  const text=await res.text();
  if(text.trimStart().startsWith('<')) throw new Error(`Sheet not public or tab "${tabName}" not found.`);
  const jsonStr=text.replace(/^[^(]*\(/,'').replace(/\);?\s*$/,'');
  return JSON.parse(jsonStr);
}

/* ── FETCH SHEET AS CSV ── */
async function fetchSheetCSV(sheetId, tabName){
  const url=`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res=await fetchWithTimeout(url);
  if(!res.ok) throw new Error(`HTTP ${res.status} fetching CSV for ${tabName}`);
  const text=await res.text();
  if(text.trimStart().startsWith('<')) throw new Error(`Sheet not public (tab: "${tabName}")`);
  return text;
}

/* ── PARSE CSV (handles quoted fields with commas/newlines) ── */
function parseCSV(csv){
  const rows=[];
  let cur='',inQ=false,row=[];
  for(let i=0;i<csv.length;i++){
    const ch=csv[i];
    if(ch==='"'){if(inQ&&csv[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
    else if(ch===','&&!inQ){row.push(cur.trim());cur='';}
    else if((ch==='\n'||ch==='\r')&&!inQ){
      if(ch==='\r'&&csv[i+1]==='\n')i++;
      row.push(cur.trim());rows.push(row);row=[];cur='';
    }else cur+=ch;
  }
  if(cur||row.length){row.push(cur.trim());rows.push(row);}
  return rows.filter(r=>r.some(c=>c));
}

/* ── EXTRACT SHEET ID from URL or raw ID ── */
function extractSheetId(raw){
  if(!raw) return '';
  raw=String(raw).trim();
  try{ raw=decodeURIComponent(raw); }catch(e){}
  const redir=raw.match(/[?&]q=([^&]+)/);
  if(redir) return extractSheetId(decodeURIComponent(redir[1]));
  const m=raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if(m) return m[1];
  if(/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;
  return '';
}

/* ── GOOGLE DRIVE URL CONVERTERS ── */
function gdriveViewUrl(url){
  if(!url) return '';
  const m=url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if(m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
  const m2=url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m2) return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
  return url;
}
function gdriveDirect(url){
  if(!url) return '';
  const m=url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if(m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  const m2=url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m2) return `https://drive.google.com/uc?export=download&id=${m2[1]}`;
  return url;
}

/* ── LOAD CONFIG from CONFIG_TAB
   Returns: [{id, name, sheetId, tabReg, tabInt, tabSel, formUrl}]
   Includes Column F (Registration Form URL) for student portal.
═══════════════════════════════════════════════════════════════ */
async function loadConfig(){
  const json=await fetchConfigJSON(CONFIG_SHEET_ID, CONFIG_TAB);
  const table=json.table;
  if(!table||!table.rows) return [];

  const cols=(table.cols||[]).map(c=>(c.label||'').toLowerCase().trim());
  const ci=(...ks)=>{ for(const k of ks){ const i=cols.findIndex(c=>c.includes(k)); if(i!==-1)return i; } return -1; };

  const iC  = (ci('company')!==-1)     ? ci('company')                      : 0;
  const iS  = (ci('sheet')!==-1)       ? ci('sheet')                        : 1;
  const iR  = (ci('reg')!==-1)         ? ci('reg')                          : 2;
  const iI  = (ci('int','interview','shortlist')!==-1) ? ci('int','interview','shortlist') : 3;
  const iSl = (ci('sel','select')!==-1) ? ci('sel','select')                : 4;
  const iF  = (ci('form','registration')!==-1) ? ci('form','registration')  : 5;

  const companies=[];
  table.rows.forEach((row,idx)=>{
    const cells=row.c||[];
    const val=i=>(cells[i]&&cells[i].v!=null)?String(cells[i].v).trim():'';
    const fmt=i=>(cells[i]&&cells[i].f)?String(cells[i].f).trim():'';

    const name=val(iC);
    if(!name||name.toLowerCase()==='company') return;

    const sid=extractSheetId(val(iS))||extractSheetId(fmt(iS));
    if(!sid) return;

    const tabReg=val(iR)||'Registered Students';
    let tabInt=val(iI)||null;
    let tabSel=val(iSl)||null;
    if(tabInt&&tabInt.toLowerCase()===tabReg.toLowerCase()) tabInt=null;
    if(tabSel&&tabSel.toLowerCase()===tabReg.toLowerCase()) tabSel=null;
    if(tabInt&&tabSel&&tabInt.toLowerCase()===tabSel.toLowerCase()) tabSel=null;

    const formUrl=val(iF)||fmt(iF)||'';
    companies.push({id:idx+1, name, sheetId:sid, tabReg, tabInt, tabSel, formUrl});
  });
  return companies;
}
/* ── LOAD ADMIN DATA from ADMIN_MODE CSV ── */
async function loadAdminData(){
  const csv=await fetchSheetCSV(CONFIG_SHEET_ID, ADMIN_DATA_TAB);
  const rows=parseCSV(csv);
  if(rows.length<2) return {};
  const hdr=rows[0].map(h=>h.toLowerCase().replace(/[^a-z0-9]/g,''));
  const col=(...ks)=>{ for(const k of ks){ const i=hdr.findIndex(h=>h.includes(k)); if(i!==-1)return i; } return -1; };

  const iComp=col('company'), iWeb=col('website'), iMode=col('interview');
  const iRegDate=col('reg'), iDriveDate=col('drive');
  const iPocName=col('pocname')!==-1?col('pocname'):col('name');
  const iRoles=col('role'), iNotes=col('note');
  const _iJd=col('jd'), _iLn=col('link');
  const iJdUrl=_iJd!==-1?_iJd:_iLn;

  const data={};
  rows.slice(1).forEach(r=>{
    const name=(r[iComp]||'').trim(); if(!name) return;
    const roles=(r[iRoles]||'').split(',').map(s=>s.trim()).filter(Boolean);
    data[name.toLowerCase()]={
      website:r[iWeb]||'', interviewMode:r[iMode]||'',
      registrationDate:r[iRegDate]||'', driveDate:r[iDriveDate]||'',
      roles, notes:r[iNotes]||'',
      jdUrl:iJdUrl!==-1?(r[iJdUrl]||'').trim():''
    };
  });
  return data;
}

/* ── LOAD CIRCULAR DATA from CIRCULAR_DATA tab ── */
const CIRCULAR_DATA_TAB = 'CIRCULAR_DATA';

async function loadCircularData(){
  try{
    const csv=await fetchSheetCSV(CONFIG_SHEET_ID, CIRCULAR_DATA_TAB);
    const rows=parseCSV(csv);
    if(rows.length<2) return {};
    const hdr=rows[0].map(h=>h.toLowerCase().replace(/[^a-z0-9]/g,''));
    const col=(...ks)=>{ for(const k of ks){ const i=hdr.findIndex(h=>h.includes(k)); if(i!==-1)return i; } return -1; };

    const iComp      = col('company');
    const iAbout     = col('about');
    const iPosition  = col('position');
    const iEducation = col('education','edu');
    const iLocation  = col('location','loc');
    const iCtc       = col('ctc','salary');
    const iSelection = col('selection','process');
    const iBenefits  = col('benefit');
    const iDocs      = col('document','docs');
    const iCulture   = col('culture','workculture');
    const iRegLink   = col('reglink','registrationlink','formlink');
    const iLastDate  = col('lastdate','deadline');
    const iCircUrl   = col('circularurl','circular url','driveurl','url');

    const data={};
    rows.slice(1).forEach(r=>{
      const name=(r[iComp]||'').trim(); if(!name) return;
      const v=i=>(i!==-1&&r[i])?r[i].trim():'';
      data[name.toLowerCase()]={
        about:       v(iAbout),
        position:    v(iPosition),
        education:   v(iEducation),
        location:    v(iLocation),
        ctc:         v(iCtc),
        selection:   v(iSelection),
        benefits:    v(iBenefits),
        docs:        v(iDocs),
        culture:     v(iCulture),
        regLink:     v(iRegLink),
        lastDate:    v(iLastDate),
        circularUrl: v(iCircUrl),
      };
    });
    return data;
  }catch(e){
    console.warn('[loadCircularData] Could not load CIRCULAR_DATA tab:', e.message);
    return {};
  }
}

/* ── COMPANY LOGO HTML (triple-fallback: clearbit → favicon → initials) ── */
const LOGO_HINTS={
  'tcs':'tcs.com','infosys':'infosys.com','wipro':'wipro.com','accenture':'accenture.com',
  'first source':'firstsource.com','firstsource':'firstsource.com','fyers':'fyers.in',
  'rupeek':'rupeek.com','codeyoung':'codeyoung.com','interns elite':'internselite.com',
  'genz':'genzeducatewing.com','cloud unicorn':'cloudunicorn.in','idea infinity':'ideainfinity.in',
  'deloitte':'deloitte.com','ibm':'ibm.com','oracle':'oracle.com','zoho':'zoho.com',
  'freshworks':'freshworks.com','byju':'byjus.com','amazon':'amazon.com','google':'google.com'
};
function getLogoDomain(name,website){
  if(website){
    try{ return new URL(website.startsWith('http')?website:'https://'+website).hostname.replace(/^www\./,''); }catch(e){}
  }
  const n=(name||'').toLowerCase();
  for(const[k,v]of Object.entries(LOGO_HINTS)){ if(n.includes(k)) return v; }
  return n.replace(/[^a-z0-9]/g,'')+'.com';
}
function companyLogoHtml(name, size=44, website='', idx=0){
  const sz=size; const domain=getLogoDomain(name,website);
  const clearbit=`https://logo.clearbit.com/${domain}?size=${sz*2}`;
  const gfav=`https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const grad=avgr(idx); const pad=sz>52?8:5; const fsz=Math.round(sz*0.38);
  return `<div class="co-logo" style="width:${sz}px;height:${sz}px;border-radius:${Math.round(sz*0.2)}px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff;border:1.5px solid #E2E8F0;flex-shrink:0;">
    <img src="${clearbit}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"
      style="width:100%;height:100%;object-fit:contain;padding:${pad}px;display:block"/>
    <img src="${gfav}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
      style="width:100%;height:100%;object-fit:contain;padding:${pad+2}px;display:none"/>
    <span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-weight:800;font-size:${fsz}px;color:#fff;background:${grad}">${ini(name)}</span>
  </div>`;
}
