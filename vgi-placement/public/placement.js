/* ════════════════════════════════════════════════════
   placement.js — Placement Cell Entry PIN Logic
   Passcode: 2525
════════════════════════════════════════════════════ */

const PLACEMENT_PIN  = '__DASHBOARD_PIN__';
const DASHBOARD_URL  = 'placement-dashboard.html';

/* ── Auto-advance PIN cells ─────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const cells = document.querySelectorAll('.pin-cell');

  cells.forEach((cell, idx) => {
    cell.addEventListener('input', () => {
      cell.value = cell.value.replace(/[^0-9]/g, '').slice(-1);
      if(cell.value){
        cell.classList.add('filled');
        if(idx < cells.length - 1) cells[idx + 1].focus();
        else checkPin();
      } else {
        cell.classList.remove('filled');
      }
    });

    cell.addEventListener('keydown', e => {
      if(e.key === 'Backspace' && !cell.value && idx > 0){
        cells[idx - 1].focus();
        cells[idx - 1].value = '';
        cells[idx - 1].classList.remove('filled');
      }
      if(e.key === 'Enter') checkPin();
      if(!/^\d$/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight'].includes(e.key)){
        e.preventDefault();
      }
    });

    cell.addEventListener('paste', e => {
      if(idx !== 0) return;
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').slice(0,4);
      pasted.split('').forEach((ch, i) => {
        if(cells[i]){ cells[i].value = ch; cells[i].classList.add('filled'); }
      });
      const nextEmpty = [...cells].findIndex(c => !c.value);
      if(nextEmpty !== -1) cells[nextEmpty].focus();
      else { cells[cells.length - 1].focus(); checkPin(); }
    });
  });

  cells[0]?.focus();
});

/* ── PIN Check ────────────────────────────────────────── */
function checkPin(){
  const cells   = document.querySelectorAll('.pin-cell');
  const entered = [...cells].map(c => c.value).join('');
  if(entered.length < 4){ showPinError('Please enter all 4 digits.'); return; }

  if(entered === PLACEMENT_PIN){
    const btn = document.getElementById('enter-btn');
    if(btn){ btn.disabled = true; btn.textContent = 'Opening Dashboard…'; }
    clearPinError();
    try { sessionStorage.setItem('placementAdmin', '1'); } catch(e){}
    setTimeout(() => { window.location.href = DASHBOARD_URL; }, 280);
  } else {
    showPinError('Incorrect PIN. Please try again.');
    shakePinRow();
    cells.forEach(c => { c.value = ''; c.classList.remove('filled'); });
    cells[0]?.focus();
  }
}

function showPinError(msg){ const el=document.getElementById('pin-error'); if(el)el.textContent=msg; }
function clearPinError(){   const el=document.getElementById('pin-error'); if(el)el.textContent=''; }
function shakePinRow(){
  const row=document.getElementById('pin-row');
  if(!row)return;
  row.classList.remove('shake'); void row.offsetWidth;
  row.classList.add('shake'); setTimeout(()=>row.classList.remove('shake'),400);
}
