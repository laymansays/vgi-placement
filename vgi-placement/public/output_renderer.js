/* ═══════════════════════════════════════════════════
   output_renderer.js
   1. buildResumeHTML(data)  → HTML string for preview
   2. downloadFormattedPDF(data) → jsPDF download
      with logo watermark + dark footer
═══════════════════════════════════════════════════ */

// ── Safe HTML escape (uses xe() from student.html if available) ──
function _esc(str) {
  if (typeof xe === 'function') return xe(str);
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Build HTML preview from parsed JSON ──────────────
function buildResumeHTML(data) {
  let h = '';

  // Header
  h += `<h1 class="rw-name">${_esc(data.name || 'Your Name')}</h1>`;
  const contacts = [data.phone, data.email, data.linkedin].filter(Boolean);
  if (contacts.length) {
    h += `<p class="rw-contact-line">${contacts.map(_esc).join('  ·  ')}</p>`;
  }
  h += `<hr class="rw-header-rule">`;

  // About Me
  if (data.summary) {
    h += `<h2 class="rw-section">ABOUT ME</h2>`;
    h += `<p class="rw-about">${_esc(data.summary)}</p>`;
    h += `<hr class="rw-rule">`;
  }

  // Education
  if (data.education && data.education.length) {
    h += `<h2 class="rw-section">EDUCATION</h2>`;
    data.education.forEach(edu => {
      if (edu.institution) h += `<p class="rw-edu-inst">${_esc(edu.institution)}</p>`;
      const cy = [edu.course, edu.year].filter(Boolean).join(', ');
      if (cy) h += `<h3 class="rw-entry-role">${_esc(cy)}</h3>`;
      if (edu.grade) h += `<p class="rw-edu-grade">${_esc(edu.grade)}</p>`;
      h += `<div class="rw-edu-gap"></div>`;
    });
    h += `<hr class="rw-rule">`;
  }

  // Projects
  if (data.projects && data.projects.length) {
    h += `<h2 class="rw-section">PROJECTS</h2><ul class="rw-list">`;
    data.projects.forEach(p => {
      h += `<li><strong>${_esc(p.title || '')}</strong>`;
      if (p.bullets && p.bullets.length) {
        h += `<ul>${p.bullets.map(b => `<li>${_esc(b)}</li>`).join('')}</ul>`;
      }
      h += `</li>`;
    });
    h += `</ul><hr class="rw-rule">`;
  }

  // Work Experience
  if (data.experience && data.experience.length) {
    h += `<h2 class="rw-section">WORK EXPERIENCE</h2>`;
    data.experience.forEach(exp => {
      const co = [exp.company, exp.duration].filter(Boolean).join(' | ');
      if (co)       h += `<p class="rw-entry-company">${_esc(co)}</p>`;
      if (exp.role) h += `<h3 class="rw-entry-role">${_esc(exp.role)}</h3>`;
      if (exp.bullets && exp.bullets.length) {
        h += `<ul class="rw-list">${exp.bullets.map(b => `<li>${_esc(b)}</li>`).join('')}</ul>`;
      }
    });
    h += `<hr class="rw-rule">`;
  }

  // Skills (3-column grid)
  if (data.skills && data.skills.length) {
    h += `<h2 class="rw-section">SKILLS</h2><div class="rw-skills">`;
    data.skills.forEach(s => {
      h += `<div class="rw-skill-item">• ${_esc(s)}</div>`;
    });
    h += `</div>`;
  }

  // Awards & Certifications
  if (data.awards && data.awards.length) {
    h += `<hr class="rw-rule"><h2 class="rw-section">AWARDS &amp; CERTIFICATIONS</h2>`;
    h += `<ul class="rw-list">`;
    data.awards.forEach(a => { h += `<li>${_esc(a)}</li>`; });
    h += `</ul>`;
  }

  return h;
}

// ── Get logo as base64 from nav img ──────────────────
async function getLogoBase64() {
  try {
    const navImg = document.querySelector('.sp-nav-logo img');
    if (navImg && navImg.complete && navImg.naturalWidth > 0) {
      const cvs = document.createElement('canvas');
      cvs.width  = navImg.naturalWidth;
      cvs.height = navImg.naturalHeight;
      cvs.getContext('2d').drawImage(navImg, 0, 0);
      return cvs.toDataURL('image/jpeg', 0.85);
    }
  } catch(e) {}
  // Fallback: fetch from repo root
  try {
    const base = window.location.href.replace(/\/[^\/]*$/, '/');
    const r    = await fetch(base + 'logo.jpg');
    const blob = await r.blob();
    return await new Promise(res => {
      const rd = new FileReader();
      rd.onload = () => res(rd.result);
      rd.readAsDataURL(blob);
    });
  } catch(e) { return null; }
}

// ── Generate and download PDF ─────────────────────────
async function downloadFormattedPDF(data) {
  const { jsPDF } = window.jspdf;
  const logoB64   = await getLogoBase64();

  const PW=210, PH=297, ML=18, MR=18, MT=22, MB=22, TW=174;
  const LIMIT = PH - MB - 12;

  // Try progressively smaller scales to fit on 1 page
  const scales = [1.0, 0.87, 0.75, 0.65];
  let finalDoc  = null;

  for (const scale of scales) {
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    let y = MT, overflow = false;

    // ── Watermark ──
    if (logoB64) {
      try {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.07 }));
        doc.addImage(logoB64, 'JPEG', PW/2, PH/2 - 45, 80, 80);
        doc.restoreGraphicsState();
      } catch(e) {}
    }

    // ── Helpers ──
    const checkY = need => { if (y + need > LIMIT) overflow = true; };

    const txt = (t, opts = {}) => {
      const fs    = (opts.fs || 10) * scale;
      const bold  = opts.bold || false;
      const col   = opts.col  || [30, 30, 30];
      const ind   = opts.ind  || 0;
      const after = opts.after !== undefined ? opts.after * scale : 2 * scale;
      doc.setFontSize(fs);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(col[0], col[1], col[2]);
      const ls = doc.splitTextToSize(t, TW - ind), lh = fs * 0.42;
      checkY(ls.length * lh + 2);
      if (!overflow) doc.text(ls, opts.cx ? PW/2 : ML + ind, y, opts.cx ? {align:'center'} : {});
      y += ls.length * lh + after;
    };

    const rule = () => {
      y += 1;
      if (!overflow) {
        doc.setDrawColor(180,180,180); doc.setLineWidth(0.3);
        doc.line(ML, y, PW-MR, y);
      }
      y += 4 * scale;
    };

    const section = title => {
      checkY(10 * scale);
      if (!overflow) {
        doc.setFontSize(11 * scale); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
        doc.text(title, ML, y); y += 1;
        doc.setDrawColor(30,30,30); doc.setLineWidth(0.5); doc.line(ML, y, PW-MR, y);
      }
      y += 5 * scale;
    };

    const bulletLines = (str, indent=3) => {
      const ls = doc.splitTextToSize('• ' + str, TW - indent - 2);
      const lh = 10 * scale * 0.42;
      checkY(ls.length * lh + 1.5);
      if (!overflow) {
        doc.setFontSize(10*scale); doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50);
        doc.text(ls, ML + indent, y);
      }
      y += ls.length * lh + 1.5 * scale;
    };

    // ── Name ──
    const nfs = 26 * scale;
    doc.setFontSize(nfs); doc.setFont('helvetica','bold'); doc.setTextColor(20,20,20);
    doc.text(data.name || 'Your Name', PW/2, y, {align:'center'});
    y += nfs * 0.42 + 4 * scale;

    // ── Contact line ──
    const contacts = [data.phone, data.email, data.linkedin].filter(Boolean).join('  ·  ');
    if (contacts) {
      const cfs = 9 * scale;
      doc.setFontSize(cfs); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
      const cl = doc.splitTextToSize(contacts, TW);
      doc.text(cl, PW/2, y, {align:'center'});
      y += cl.length * (cfs * 0.42) + 2 * scale;
    }
    doc.setDrawColor(180,180,180); doc.setLineWidth(0.4); doc.line(ML, y, PW-MR, y);
    y += 6 * scale;

    // ── About Me ──
    if (data.summary) {
      section('ABOUT ME');
      txt(data.summary, {fs:10, col:[60,60,60], after:3});
      rule();
    }

    // ── Education ──
    if (data.education && data.education.length) {
      section('EDUCATION');
      data.education.forEach(edu => {
        if (edu.institution) txt(edu.institution, {fs:9.5, col:[100,100,100], after:0.5});
        const cy = [edu.course, edu.year].filter(Boolean).join(', ');
        if (cy)        txt(cy, {fs:10.5, bold:true, col:[20,20,20], after:0.5});
        if (edu.grade) txt(edu.grade, {fs:9.5, col:[80,80,80], after:3});
      });
      rule();
    }

    // ── Projects ──
    if (data.projects && data.projects.length) {
      section('PROJECTS');
      data.projects.forEach(p => {
        txt('• ' + (p.title||''), {fs:10, bold:true, col:[20,20,20], after:1, ind:2});
        (p.bullets||[]).forEach(b => bulletLines(b, 6));
      });
      rule();
    }

    // ── Work Experience ──
    if (data.experience && data.experience.length) {
      section('WORK EXPERIENCE');
      data.experience.forEach(exp => {
        const co = [exp.company, exp.duration].filter(Boolean).join(' | ');
        if (co)       txt(co,       {fs:9.5, col:[100,100,100], after:1});
        if (exp.role) txt(exp.role, {fs:10.5, bold:true, col:[20,20,20], after:1});
        (exp.bullets||[]).forEach(b => bulletLines(b));
      });
      y += 1 * scale;
      rule();
    }

    // ── Skills (3-column) ──
    if (data.skills && data.skills.length) {
      section('SKILLS');
      const cols = 3, cw = TW / cols;
      for (let r = 0; r < Math.ceil(data.skills.length / cols); r++) {
        checkY(6 * scale);
        if (!overflow) {
          for (let c = 0; c < cols; c++) {
            const skill = data.skills[r * cols + c]; if (!skill) continue;
            doc.setFontSize(10*scale); doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50);
            doc.text('• ' + skill, ML + c * cw, y);
          }
        }
        y += 5.5 * scale;
      }
      y += 2 * scale;
    }

    // ── Awards & Certifications ──
    if (data.awards && data.awards.length) {
      rule();
      section('AWARDS & CERTIFICATIONS');
      data.awards.forEach(a => bulletLines(a));
    }

    if (!overflow) { finalDoc = doc; break; }
  }

  // Fallback: use last attempted doc even if overflow
  if (!finalDoc) finalDoc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

  // ── Dark footer ──
  finalDoc.setFillColor(40, 40, 40);
  finalDoc.rect(0, PH-12, 210, 12, 'F');
  finalDoc.setFontSize(7); finalDoc.setFont('helvetica','normal'); finalDoc.setTextColor(200,200,200);
  finalDoc.text(RESUME_TEMPLATE.footerText, ML, PH-4.5);
  finalDoc.text('Page 1 of 1', 210-MR, PH-4.5, {align:'right'});

  const fname = (data.name || 'Student').replace(/\s+/g, '_') + '_Formatted_Resume.pdf';
  finalDoc.save(fname);
}
