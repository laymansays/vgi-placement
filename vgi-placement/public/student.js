/* ═══════════════════════════════════════════════════════════════════
   student.js — Student Portal Logic
   Requires: shared.js loaded first
═══════════════════════════════════════════════════════════════════ */

/* ── STATE ── */
let STUDENT   = null;   // current student object
let S_CONFIG  = [];     // [{id, name, sheetId, tabReg, tabInt, tabSel, formUrl}]
let S_ADMIN   = {};     // {companyNameLower: adminData}
let S_STATUS  = {};     // {companyId: {registered, interviewed, selected}}
let EL        = {};     // cached DOM elements

/* ══════════════════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  EL = {
    loginView:    document.getElementById('login-view'),
    portalView:   document.getElementById('portal-view'),
    emailInput:   document.getElementById('email-input'),
    emailError:   document.getElementById('email-error'),
    loginBtn:     document.getElementById('login-btn'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingMsg:   document.getElementById('loading-msg'),
    loadingDetail:document.getElementById('loading-detail'),
    navName:      document.getElementById('nav-name'),
    profileWrap:  document.getElementById('profile-wrap'),
    statusWrap:   document.getElementById('status-wrap'),
    availableWrap:document.getElementById('available-wrap'),
    modalOverlay: document.getElementById('sp-modal-overlay'),
    modalBox:     document.getElementById('sp-modal-box'),
  };

  // Event bindings
  EL.loginBtn.addEventListener('click', handleLogin);
  EL.emailInput.addEventListener('keypress', e => { if(e.key==='Enter') handleLogin(); });
  EL.modalOverlay.addEventListener('click', e => { if(e.target===EL.modalOverlay) closeCompanyModal(); });
  document.getElementById('sp-modal-close').addEventListener('click', closeCompanyModal);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.addEventListener('keydown', e => { if(e.key==='Escape') closeCompanyModal(); });

  // Auto-login from session
  const saved = sessionStorage.getItem('sp_email');
  if(saved) doLogin(saved);
});

/* ══════════════════════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════════════════════ */
function handleLogin(){
  const email = (EL.emailInput.value || '').trim();
  EL.emailError.textContent = '';
  if(!email){ EL.emailError.textContent = 'Please enter your college email address.'; return; }
  if(!email.includes('@')){ EL.emailError.textContent = 'Enter a valid email address.'; return; }
  doLogin(email);
}

async function doLogin(email){
  showLoading('Verifying student ID…');
  try{
    const csv = await fetchSheetCSV(CONFIG_SHEET_ID, STUDENT_MASTER_TAB);
    const rows = parseCSV(csv);
    if(!rows.length) throw new Error('STUDENT_MASTER tab is empty or not accessible.');

    // Skip header row if row[3] looks like "email"
    const dataRows = (rows[0][3]||'').toLowerCase().includes('email') ? rows.slice(1) : rows;

    const row = dataRows.find(r => (r[3]||'').toLowerCase().trim() === email.toLowerCase().trim());
    if(!row){
      hideLoading();
      EL.emailError.textContent = 'Student not found. Check your registered email ID.';
      return;
    }

    STUDENT = {
      timestamp: row[0] || '',
      photo:     row[1] || '',
      name:      row[2] || '',
      email:     row[3] || '',
      phone:     row[4] || '',
      course:    row[5] || '',
      semester:  row[6] || '',
      section:   row[7] || '',
      backlogs:  row[8] || '',
      tenth:     parseFloat(row[9])  || 0,
      twelfth:   parseFloat(row[10]) || 0,
      resume:    row[11] || ''
    };

    sessionStorage.setItem('sp_email', email);
    await loadPortalData();

  }catch(e){
    hideLoading();
    EL.emailError.textContent = 'Error: ' + e.message;
    console.error('[Student Login]', e);
  }
}

/* ══════════════════════════════════════════════════════════════════
   LOAD ALL PORTAL DATA
══════════════════════════════════════════════════════════════════ */
async function loadPortalData(){
  try{
    showLoading('Loading company data…', 'Fetching placement configuration');
    [S_CONFIG, S_ADMIN] = await Promise.all([loadConfig(), loadAdminData()]);

    showLoading('Checking your applications…', `Checking ${S_CONFIG.length} companies`);
    await checkAllCompanies();

    hideLoading();
    renderPortal();
  }catch(e){
    hideLoading();
    EL.emailError.textContent = 'Failed to load placement data: ' + e.message;
    EL.loginView.hidden = false;
    EL.portalView.hidden = true;
    console.error('[loadPortalData]', e);
  }
}

/* ── Check student email against all company tabs ── */
async function checkAllCompanies(){
  const email = STUDENT.email.toLowerCase().trim();

  await Promise.all(S_CONFIG.map(async company => {
    const s = { registered:false, interviewed:false, selected:false };

    const checkTab = async (sheetId, tabName) => {
      if(!tabName) return false;
      try{
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
        const res = await fetchWithTimeout(url);
        if(!res.ok) return false;
        const text = await res.text();
        if(text.trimStart().startsWith('<')) return false;
        const json = JSON.parse(text.replace(/^[^(]*\(/,'').replace(/\);?\s*$/,''));
        if(json.status==='error') return false;
        const rows = json.table ? (json.table.rows||[]) : [];
        // Try to detect email column by label, fall back to col 2
        const cols = json.table ? (json.table.cols||[]).map(c=>(c.label||'').toLowerCase()) : [];
        let emailIdx = cols.findIndex(c=>c.includes('email')||c.includes('mail'));
        if(emailIdx===-1) emailIdx=2;
        return rows.some(row=>{
          const cells=row.c||[];
          const cell=cells[emailIdx];
          if(!cell) return false;
          const val=String(cell.v!=null?cell.v:(cell.f||'')).toLowerCase().trim();
          return val===email;
        });
      }catch{ return false; }
    };

    const [reg, intvw, sel] = await Promise.all([
      checkTab(company.sheetId, company.tabReg),
      checkTab(company.sheetId, company.tabInt),
      checkTab(company.sheetId, company.tabSel)
    ]);
    s.registered  = reg;
    s.interviewed = intvw;
    s.selected    = sel;
    S_STATUS[company.id] = s;
  }));
}

/* ══════════════════════════════════════════════════════════════════
   RENDER PORTAL
══════════════════════════════════════════════════════════════════ */
function renderPortal(){
  EL.loginView.hidden = true;
  EL.portalView.hidden = false;
  EL.navName.textContent = STUDENT.name;

  const eligible = isEligible();
  renderProfile(eligible);
  renderStatusSections();
  if(eligible) renderAvailableCompanies();
  else renderIneligibleNotice();
}

function isEligible(){
  return STUDENT.tenth >= 60 && STUDENT.twelfth >= 60 &&
         (STUDENT.backlogs||'').toLowerCase().trim() === 'no';
}

/* ── PROFILE ── */
function renderProfile(eligible){
  const photoUrl = STUDENT.photo ? gdriveViewUrl(STUDENT.photo) : '';
  const photoHtml = photoUrl
    ? `<img src="${photoUrl}" class="profile-photo" alt="Profile" onerror="this.style.display='none';document.getElementById('profile-initial').style.display='flex'">`
    : '';
  const initials = (STUDENT.name||'').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';

  const eligBadge = eligible
    ? `<span class="elig-badge elig-yes">✓ Eligible for Placement</span>`
    : `<span class="elig-badge elig-no">✗ Not Eligible</span>`;

  const resumeBtn = STUDENT.resume
    ? `<a href="${xe(STUDENT.resume)}" target="_blank" rel="noopener" class="btn-resume">📄 View Resume</a>`
    : `<span class="btn-resume disabled">No resume on file</span>`;

  const pct = p => p ? p + '%' : '—';

  EL.profileWrap.innerHTML = `
  <div class="profile-card">
    <div class="profile-photo-area">
      ${photoHtml}
      <div class="profile-initial" id="profile-initial" style="${photoUrl?'display:none':'display:flex'}">${initials}</div>
    </div>
    <div class="profile-info">
      <div class="profile-name">${xe(STUDENT.name)}</div>
      <div class="profile-course">${xe(STUDENT.course||'—')} · Sem ${xe(STUDENT.semester||'—')} · Section ${xe(STUDENT.section||'—')}</div>
      <div class="profile-contact">
        <span>✉️ ${xe(STUDENT.email)}</span>
        ${STUDENT.phone ? `<span>📱 ${xe(STUDENT.phone)}</span>` : ''}
      </div>
      <div class="profile-scores">
        <div class="score-chip ${STUDENT.tenth>=60?'pass':'fail'}">
          <span class="score-lbl">10th</span>
          <span class="score-val">${pct(STUDENT.tenth)}</span>
        </div>
        <div class="score-chip ${STUDENT.twelfth>=60?'pass':'fail'}">
          <span class="score-lbl">12th</span>
          <span class="score-val">${pct(STUDENT.twelfth)}</span>
        </div>
        <div class="score-chip ${(STUDENT.backlogs||'').toLowerCase()==='no'?'pass':'fail'}">
          <span class="score-lbl">Backlogs</span>
          <span class="score-val">${xe(STUDENT.backlogs||'—')}</span>
        </div>
      </div>
      <div class="profile-actions">
        ${eligBadge}
        ${resumeBtn}
      </div>
    </div>
  </div>`;
}

/* ── PLACEMENT STATUS ── */
function renderStatusSections(){
  const selected    = S_CONFIG.filter(c => S_STATUS[c.id]?.selected);
  const shortlisted = S_CONFIG.filter(c => S_STATUS[c.id]?.interviewed && !S_STATUS[c.id]?.selected);
  const applied     = S_CONFIG.filter(c => S_STATUS[c.id]?.registered && !S_STATUS[c.id]?.interviewed && !S_STATUS[c.id]?.selected);

  let html = '';
  if(selected.length)    html += buildStatusGroup('🎉 Selected',    'selected',    selected);
  if(shortlisted.length) html += buildStatusGroup('⭐ Shortlisted',  'shortlisted', shortlisted);
  if(applied.length)     html += buildStatusGroup('📋 Applied',      'applied',     applied);

  if(!html){
    html = `<div class="empty-status">
      <div class="empty-icon">📬</div>
      <div class="empty-text">You haven't applied to any drives yet.</div>
      <div class="empty-sub">Scroll down to see available opportunities.</div>
    </div>`;
  }

  EL.statusWrap.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">My Applications</h2>
    </div>
    ${html}`;
}

function buildStatusGroup(title, statusKey, companies){
  const cards = companies.map(c => {
    const ad = S_ADMIN[c.name.toLowerCase()]||{};
    const colorMap = {selected:'var(--green)',shortlisted:'var(--amber)',applied:'var(--blue)'};
    return `<div class="status-company-card" data-id="${c.id}">
      ${companyLogoHtml(c.name, 44, ad.website||'', c.id)}
      <div class="scc-info">
        <div class="scc-name">${xe(c.name)}</div>
        ${ad.roles&&ad.roles.length ? `<div class="scc-roles">${xe(ad.roles.slice(0,2).join(', '))}</div>` : ''}
        ${ad.driveDate ? `<div class="scc-date">📅 ${fmtDate(ad.driveDate)}</div>` : ''}
      </div>
      <span class="scc-badge scc-${statusKey}">${title.replace(/[^\w ]/g,'').trim()}</span>
    </div>`;
  }).join('');

  return `<div class="status-group">
    <div class="status-group-header">
      <span class="status-group-title">${title}</span>
      <span class="count-pill">${companies.length}</span>
    </div>
    <div class="status-cards-row">${cards}</div>
  </div>`;
}

/* ── AVAILABLE COMPANIES ── */
function renderAvailableCompanies(){
  const available = S_CONFIG.filter(c => {
    const s = S_STATUS[c.id];
    return !s || (!s.registered && !s.interviewed && !s.selected);
  });

  if(!available.length){
    EL.availableWrap.innerHTML = `<div class="section-header"><h2 class="section-title">Available Opportunities</h2></div>
      <div class="empty-status"><div class="empty-icon">✅</div><div class="empty-text">You've applied to all available drives!</div></div>`;
    return;
  }

  const cards = available.map(c => {
    const ad = S_ADMIN[c.name.toLowerCase()]||{};
    const roleChips = (ad.roles||[]).slice(0,3).map(r=>`<span class="role-chip">${xe(r)}</span>`).join('');

    return `<div class="avail-card" data-id="${c.id}" onclick="openCompanyModal(${c.id})">
      <div class="avail-card-top">
        ${companyLogoHtml(c.name, 48, ad.website||'', c.id)}
        ${ad.interviewMode ? `<span class="mode-chip">${xe(ad.interviewMode)}</span>` : ''}
      </div>
      <div class="avail-card-name">${xe(c.name)}</div>
      ${roleChips ? `<div class="avail-roles">${roleChips}</div>` : ''}
      <div class="avail-meta">
        ${ad.driveDate ? `<div class="avail-meta-item"><span class="meta-k">DRIVE DATE</span><span class="meta-v">${fmtDate(ad.driveDate)}</span></div>` : ''}
        <div class="avail-meta-item"><span class="meta-k">ELIGIBILITY</span><span class="meta-v">10th ≥ 60% · 12th ≥ 60% · No Backlogs</span></div>
      </div>
      <div class="avail-card-footer">
        ${ad.jdUrl ? `<button class="btn-jd" onclick="event.stopPropagation();window.open('${xe(gdriveDirect(ad.jdUrl))}','_blank')">📄 View JD</button>` : ''}
        ${c.formUrl ? `<button class="btn-apply" onclick="event.stopPropagation();applyToCompany('${c.formUrl}')">Apply →</button>`
          : `<span class="no-form">Applications opening soon</span>`}
      </div>
    </div>`;
  }).join('');

  EL.availableWrap.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Available Opportunities</h2>
      <span class="count-pill">${available.length}</span>
    </div>
    <div class="avail-cards-grid">${cards}</div>`;
}

function renderIneligibleNotice(){
  EL.availableWrap.innerHTML = `
    <div class="section-header"><h2 class="section-title">Available Opportunities</h2></div>
    <div class="ineligible-notice">
      <div class="ineligible-icon">⚠️</div>
      <div>
        <div class="ineligible-title">Placement Applications Restricted</div>
        <div class="ineligible-body">
          To apply for campus placements you must meet all three criteria:
          <ul>
            <li>10th Percentage ≥ 60% &nbsp;(yours: ${STUDENT.tenth}%)</li>
            <li>12th Percentage ≥ 60% &nbsp;(yours: ${STUDENT.twelfth}%)</li>
            <li>Active Backlogs = No &nbsp;(yours: ${xe(STUDENT.backlogs)||'—'})</li>
          </ul>
          Please contact the Placement Cell for queries.
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   COMPANY DETAIL MODAL
══════════════════════════════════════════════════════════════════ */
function openCompanyModal(companyId){
  const c = S_CONFIG.find(x => x.id === companyId);
  if(!c) return;
  const ad = S_ADMIN[c.name.toLowerCase()]||{};
  const eligible = isEligible();

  const rows = [
    ad.roles&&ad.roles.length  ? ['Roles', ad.roles.join(', ')] : null,
    ad.driveDate               ? ['Drive Date', fmtDate(ad.driveDate)] : null,
    ad.registrationDate        ? ['Reg. Deadline', fmtDate(ad.registrationDate)] : null,
    ad.interviewMode           ? ['Interview Mode', ad.interviewMode] : null,
    ad.website                 ? ['Website', `<a href="${xe(ad.website)}" target="_blank">${xe(ad.website)}</a>`] : null,
  ].filter(Boolean).map(([k,v])=>`
    <div class="modal-detail-row">
      <span class="mdl-k">${k}</span>
      <span class="mdl-v">${typeof v === 'string' && !v.startsWith('<') ? xe(v) : v}</span>
    </div>`).join('');

  const eligNote = `<div class="modal-elig">
    <strong>Eligibility Criteria:</strong> 10th ≥ 60% · 12th ≥ 60% · No Active Backlogs
  </div>`;

  const applyBtn = eligible && c.formUrl
    ? `<button class="btn-apply-modal" onclick="applyToCompany('${xe(c.formUrl)}')">Apply Now →</button>`
    : !eligible
    ? `<div class="modal-not-elig">You do not meet the eligibility criteria for this drive.</div>`
    : `<div class="modal-not-elig">Application form not yet available.</div>`;

  const jdBtn = ad.jdUrl
    ? `<button class="btn-jd-modal" onclick="window.open('${xe(gdriveDirect(ad.jdUrl))}','_blank')">📄 Download JD</button>`
    : '';

  document.getElementById('sp-modal-box').innerHTML = `
    <div class="sp-modal-head">
      <div class="sp-modal-co">
        ${companyLogoHtml(c.name, 56, ad.website||'', c.id)}
        <div>
          <div class="sp-modal-name">${xe(c.name)}</div>
          ${ad.interviewMode ? `<span class="mode-chip">${xe(ad.interviewMode)}</span>` : ''}
        </div>
      </div>
      <button id="sp-modal-close" class="sp-modal-close-btn" onclick="closeCompanyModal()">×</button>
    </div>
    <div class="sp-modal-body">
      ${rows ? `<div class="modal-detail-grid">${rows}</div>` : ''}
      ${eligNote}
      ${ad.notes ? `<div class="modal-notes"><strong>About the Role:</strong><br>${xe(ad.notes)}</div>` : ''}
    </div>
    <div class="sp-modal-footer">
      ${jdBtn}
      ${applyBtn}
    </div>`;

  EL.modalOverlay.classList.add('open');
}

function closeCompanyModal(){
  EL.modalOverlay.classList.remove('open');
}

function applyToCompany(formUrl){
  window.open(formUrl, '_blank');
}

/* ══════════════════════════════════════════════════════════════════
   LOADING / LOGOUT
══════════════════════════════════════════════════════════════════ */
function showLoading(msg, detail){
  if(EL.loadingMsg) EL.loadingMsg.textContent = msg||'Loading…';
  if(EL.loadingDetail) EL.loadingDetail.textContent = detail||'';
  if(EL.loadingOverlay) EL.loadingOverlay.hidden = false;
}
function hideLoading(){
  if(EL.loadingOverlay) EL.loadingOverlay.hidden = true;
}
function logout(){
  sessionStorage.removeItem('sp_email');
  STUDENT=null; S_CONFIG=[]; S_ADMIN={}; S_STATUS={};
  EL.loginView.hidden=false;
  EL.portalView.hidden=true;
  if(EL.emailInput) EL.emailInput.value='';
  if(EL.emailError) EL.emailError.textContent='';
}
