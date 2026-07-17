
const _b64 = document.getElementById('raw-data').textContent;
const _binStr = atob(_b64);
const _bytes = new Uint8Array(_binStr.length);
for (let i = 0; i < _binStr.length; i++) _bytes[i] = _binStr.charCodeAt(i);
const PAYLOAD = JSON.parse(pako.inflate(_bytes, { to: 'string' }));

const WD_SHORT = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab']; // getUTCDay(): 0=Dom
function weekdayAbbrev(dateStr){ // 'YYYY-MM-DD'
  const [y,m,d] = dateStr.split('-').map(Number);
  return WD_SHORT[new Date(Date.UTC(y, m-1, d)).getUTCDay()];
}
function promiseWeekday(ddmm){ // 'dd/mm', asumiendo anio 2026
  const [d,m] = ddmm.split('/').map(Number);
  return WD_SHORT[new Date(Date.UTC(2026, m-1, d)).getUTCDay()];
}
function promiseAlertInfo(ddmm){
  if(!ddmm) return { alert:false, wd:'', reason:'' };
  const wd = promiseWeekday(ddmm);
  if(ddmm === PAYLOAD.holiday) return { alert:true, wd, reason:'Feriado 9/7' };
  if(wd === 'Sab' || wd === 'Dom') return { alert:true, wd, reason:'Fin de semana' };
  return { alert:false, wd, reason:'' };
}

// Reconstruye el array de objetos "plano" que usa el resto del dashboard,
// a partir del formato compacto (diccionarios + filas por indice).
const DATA = PAYLOAD.rows.map(r => {
  const [id, ext, brandI, ostatusI, courierI, servicioI, tracking, sstatusI, hora, dayI, promiseI] = r;
  const dia_compra = PAYLOAD.days[dayI];
  const promise_str = PAYLOAD.promises[promiseI];
  const pinfo = promiseAlertInfo(promise_str);
  return {
    id, ext,
    brand: PAYLOAD.dicts.brand[brandI],
    ostatus: PAYLOAD.dicts.ostatus[ostatusI],
    courier: PAYLOAD.dicts.courier[courierI],
    servicio: PAYLOAD.dicts.servicio[servicioI],
    tracking,
    sstatus: PAYLOAD.dicts.sstatus[sstatusI],
    hora,
    dia_compra,
    dia_wd: weekdayAbbrev(dia_compra),
    fecha_compra: dia_compra.slice(8,10) + '/' + dia_compra.slice(5,7),
    promise_str,
    promise_wd: pinfo.wd,
    promise_alert: pinfo.alert,
    promise_reason: pinfo.reason,
  };
});

const COURIER_COLORS = {
  'Meli':'#FFC53D','Moova':'#2DD4BF','Ocasa':'#FB7185','Andreani':'#60A5FA',
  'Fasttrack':'#FB923C','Inner':'#A78BFA','Cabify':'#F472B6','Pickit':'#4ADE80',
  'HOP':'#22D3EE','Elogistica':'#94A3B8','Pendiente de asignación':'#4B5A78'
};
const courierColor = c => COURIER_COLORS[c] || '#8593AD';

const STATUS_COLORS = { 'paid':'#4ADE80', 'shipped':'#60A5FA', 'cancelled':'#FF5D5D', 'delivered':'#2DD4BF' };
const statusColor = s => STATUS_COLORS[s] || '#8593AD';

// ---------- KPI split-flap ----------
function flapDigits(container, numStr, color){
  container.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'flap-row';
  [...numStr].forEach(ch => {
    const f = document.createElement('div');
    f.className = 'flap';
    f.textContent = ch;
    if(color) f.style.color = color;
    row.appendChild(f);
  });
  container.appendChild(row);
  // quick flicker-in animation
  const flaps = row.querySelectorAll('.flap');
  flaps.forEach((f,i) => {
    const finalCh = f.textContent;
    let ticks = 6 + i*2;
    f.textContent = '0';
    const iv = setInterval(() => {
      ticks--;
      f.textContent = ticks <= 0 ? finalCh : String(Math.floor(Math.random()*10));
      if(ticks <= 0) clearInterval(iv);
    }, 45);
  });
}

function renderKPIs(){
  const total = DATA.length;
  const couriers = new Set(DATA.map(d=>d.courier)).size;
  const brands = new Set(DATA.map(d=>d.brand)).size;
  document.getElementById('headMeta').textContent = `${brands} marcas · ${couriers} couriers activos`;
  const sinTracking = DATA.filter(d=>!d.tracking).length;
  const alertCount = DATA.filter(d=>d.promise_alert).length;
  const topCourier = Object.entries(
    DATA.reduce((acc,d)=>{acc[d.courier]=(acc[d.courier]||0)+1;return acc;},{})
  ).sort((a,b)=>b[1]-a[1])[0];

  const kpiRow = document.getElementById('kpiRow');
  const items = [
    {label:'Compras totales', val:String(total), color:'var(--teal)', sub:'órdenes generadas hoy'},
    {label:'Courier líder', val:String(topCourier[1]), color:courierColor(topCourier[0]), sub:topCourier[0]+' · '+((topCourier[1]/total)*100).toFixed(0)+'% del volumen'},
    {label:'Sin tracking', val:String(sinTracking).padStart(2,'0'), color:'var(--danger)', sub:((sinTracking/total)*100).toFixed(1)+'% del total'},
    {label:'Promesas en riesgo', val:String(alertCount).padStart(2,'0'), color:'#FF5D5D', sub:'caen sáb, dom o 9/7 feriado'},
  ];
  kpiRow.innerHTML = '';
  items.forEach(it => {
    const kpi = document.createElement('div');
    kpi.className = 'kpi';
    kpi.style.setProperty('--kcolor', it.color);
    kpi.innerHTML = `<div class="kpi-label">${it.label}</div><div class="flaps"></div><div class="kpi-sub">${it.sub}</div>`;
    kpiRow.appendChild(kpi);
    flapDigits(kpi.querySelector('.flaps'), it.val, it.color);
  });

  // alert panel
  const alertPanel = document.getElementById('alertPanel');
  if(alertCount > 0){
    alertPanel.style.display = 'block';
    const byCourier = DATA.filter(d=>d.promise_alert).reduce((acc,d)=>{acc[d.courier]=(acc[d.courier]||0)+1;return acc;},{});
    const entries = Object.entries(byCourier).sort((a,b)=>b[1]-a[1]);
    const max = entries[0][1];
    const box = document.getElementById('alertBars');
    box.innerHTML = entries.map(([c,n]) => `
      <div class="abar-row">
        <div class="abar-label">${c}</div>
        <div class="abar-track"><div class="abar-fill" style="width:${(n/max*100).toFixed(1)}%"></div></div>
        <div class="abar-val">${n}</div>
      </div>
    `).join('');
  } else {
    alertPanel.style.display = 'none';
  }
}

// ---------- Courier bars ----------
let activeCourier = null;

function renderCourierBars(){
  const counts = DATA.reduce((acc,d)=>{acc[d.courier]=(acc[d.courier]||0)+1;return acc;},{});
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max = entries[0][1];
  const box = document.getElementById('courierBars');
  box.innerHTML = '';
  entries.forEach(([courier,count]) => {
    const row = document.createElement('div');
    row.className = 'cbar-row' + (activeCourier && activeCourier!==courier ? ' dim':'');
    const pct = (count/max*100).toFixed(1);
    row.innerHTML = `
      <div class="cbar-dot" style="background:${courierColor(courier)}"></div>
      <div class="cbar-label">${courier}</div>
      <div class="cbar-track"><div class="cbar-fill" style="width:${pct}%;background:${courierColor(courier)}"></div></div>
      <div class="cbar-val">${count}</div>
    `;
    row.addEventListener('click', () => {
      activeCourier = activeCourier === courier ? null : courier;
      renderCourierBars();
      renderChips();
      currentPage = 1;
      renderTable();
    });
    box.appendChild(row);
  });
}

// ---------- Brand donut ----------
let brandChart;
function renderBrandDonut(){
  const counts = DATA.reduce((acc,d)=>{acc[d.brand]=(acc[d.brand]||0)+1;return acc;},{});
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const palette = ['#FFC53D','#2DD4BF','#FB7185','#60A5FA','#FB923C','#A78BFA','#F472B6','#4ADE80','#22D3EE','#94A3B8','#F5A3FF','#7DD3FC','#FCA5A5'];
  const ctx = document.getElementById('brandDonut');
  if(brandChart) brandChart.destroy();
  brandChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(e=>e[0]),
      datasets: [{ data: entries.map(e=>e[1]), backgroundColor: palette, borderColor:'#121A29', borderWidth:2 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ position:'right', labels:{ color:'#8593AD', font:{family:'IBM Plex Mono', size:10.5}, boxWidth:10, padding:8 } },
        tooltip:{ callbacks:{ label: c => `${c.label}: ${c.raw} (${(c.raw/DATA.length*100).toFixed(1)}%)` } }
      },
      cutout:'62%'
    }
  });
}

// ---------- Dia de compra: nombres completos para filtros ----------
const WD_FULL = {'Lun':'Lunes','Mar':'Martes','Mie':'Miércoles','Jue':'Jueves','Vie':'Viernes','Sab':'Sábado','Dom':'Domingo'};

// ---------- Filters + table ----------
let currentPage = 1;
const PAGE_SIZE = 25;
let alertOnly = false;

function populateSelectOptions(){
  const brandSel = document.getElementById('brandFilter');
  [...new Set(DATA.map(d=>d.brand))].sort().forEach(b => {
    const o = document.createElement('option'); o.value=b; o.textContent=b; brandSel.appendChild(o);
  });
  const daySel = document.getElementById('dayFilter');
  [...new Set(DATA.map(d=>d.dia_compra))].sort().forEach(dc => {
    const rec = DATA.find(r=>r.dia_compra===dc);
    const o = document.createElement('option'); o.value=dc; o.textContent = `${WD_FULL[rec.dia_wd]||rec.dia_wd} ${rec.fecha_compra}`; daySel.appendChild(o);
  });
  const promiseSel = document.getElementById('promiseFilter');
  const promiseCounts = DATA.reduce((acc,d)=>{ if(d.promise_str) acc[d.promise_str]=(acc[d.promise_str]||0)+1; return acc; },{});
  const promiseDates = Object.keys(promiseCounts).sort((a,b) => {
    const [da,ma] = a.split('/').map(Number), [db,mb] = b.split('/').map(Number);
    return (ma*100+da) - (mb*100+db);
  });
  promiseDates.forEach(p => {
    const rec = DATA.find(r=>r.promise_str===p);
    const flag = rec && rec.promise_alert ? '⚠ ' : '';
    const o = document.createElement('option');
    o.value = p;
    o.textContent = `${flag}${p} (${WD_FULL[rec.promise_wd]||rec.promise_wd}) — ${promiseCounts[p]} pedidos`;
    promiseSel.appendChild(o);
  });
  const svcSel = document.getElementById('serviceFilter');
  [...new Set(DATA.map(d=>d.servicio))].sort().forEach(s => {
    const o = document.createElement('option'); o.value=s; o.textContent=s; svcSel.appendChild(o);
  });
  const statusSel = document.getElementById('statusFilter');
  [...new Set(DATA.map(d=>d.ostatus))].sort().forEach(s => {
    const o = document.createElement('option'); o.value=s; o.textContent=s; statusSel.appendChild(o);
  });
}

function renderChips(){
  const wrap = document.getElementById('courierChips');
  const couriers = [...new Set(DATA.map(d=>d.courier))].sort();
  wrap.innerHTML = '';
  couriers.forEach(c => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (activeCourier===c ? ' active':'');
    chip.textContent = c;
    if(activeCourier===c){ chip.style.background = courierColor(c); chip.style.borderColor = courierColor(c); chip.style.color='#081018'; }
    chip.addEventListener('click', () => {
      activeCourier = activeCourier === c ? null : c;
      renderChips(); renderCourierBars(); currentPage=1; renderTable();
    });
    wrap.appendChild(chip);
  });
}

function getFiltered(){
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const brand = document.getElementById('brandFilter').value;
  const service = document.getElementById('serviceFilter').value;
  const status = document.getElementById('statusFilter').value;
  const day = document.getElementById('dayFilter').value;
  const promise = document.getElementById('promiseFilter').value;
  return DATA.filter(d => {
    if(activeCourier && d.courier !== activeCourier) return false;
    if(brand && d.brand !== brand) return false;
    if(service && d.servicio !== service) return false;
    if(status && d.ostatus !== status) return false;
    if(day && d.dia_compra !== day) return false;
    if(promise && d.promise_str !== promise) return false;
    if(alertOnly && !d.promise_alert) return false;
    if(q){
      const hay = (String(d.id)+' '+d.ext+' '+d.tracking).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderTable(){
  const filtered = getFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const startIdx = (currentPage-1)*PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx+PAGE_SIZE);

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = pageItems.map((d, i) => `
    <tr class="${d.promise_alert ? 'row-alert':''}">
      <td style="text-align:right;color:var(--muted);">${startIdx + i + 1}</td>
      <td>${d.id}</td>
      <td>${d.ext||'—'}</td>
      <td>${d.brand}</td>
      <td><span class="tag"><span class="d" style="background:${statusColor(d.ostatus)}"></span>${d.ostatus||'—'}</span></td>
      <td><span class="tag"><span class="d" style="background:${courierColor(d.courier)}"></span>${d.courier}</span></td>
      <td>${d.servicio}</td>
      <td>${d.fecha_compra} (${d.dia_wd})</td>
      <td>${d.hora}</td>
      <td>${d.promise_alert
            ? `<span class="promise-cell promise-alert">${d.promise_str} (${d.promise_wd}) <span class="pill">${d.promise_reason}</span></span>`
            : `<span class="promise-cell">${d.promise_str} (${d.promise_wd})</span>`}</td>
      <td>${d.tracking ? d.tracking : '<span class="tracking-empty">sin tracking</span>'}</td>
      <td>${d.sstatus || '—'}</td>
    </tr>
  `).join('');

  document.getElementById('pagerInfo').textContent =
    `Mostrando ${filtered.length ? startIdx+1 : 0}–${Math.min(startIdx+PAGE_SIZE, filtered.length)} de ${filtered.length} órdenes`;
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

document.getElementById('searchInput').addEventListener('input', () => { currentPage=1; renderTable(); });
document.getElementById('brandFilter').addEventListener('change', () => { currentPage=1; renderTable(); });
document.getElementById('dayFilter').addEventListener('change', () => { currentPage=1; renderTable(); });
document.getElementById('promiseFilter').addEventListener('change', () => { currentPage=1; renderTable(); });
document.getElementById('statusFilter').addEventListener('change', () => { currentPage=1; renderTable(); });
document.getElementById('serviceFilter').addEventListener('change', () => { currentPage=1; renderTable(); });
document.getElementById('prevPage').addEventListener('click', () => { currentPage--; renderTable(); });
document.getElementById('nextPage').addEventListener('click', () => { currentPage++; renderTable(); });
document.getElementById('alertToggle').addEventListener('click', () => {
  alertOnly = !alertOnly;
  document.getElementById('alertToggle').classList.toggle('active', alertOnly);
  currentPage = 1;
  renderTable();
});
document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('searchInput').value='';
  document.getElementById('brandFilter').value='';
  document.getElementById('dayFilter').value='';
  document.getElementById('promiseFilter').value='';
  document.getElementById('statusFilter').value='';
  document.getElementById('serviceFilter').value='';
  activeCourier = null;
  alertOnly = false;
  document.getElementById('alertToggle').classList.remove('active');
  currentPage = 1;
  renderChips(); renderCourierBars(); renderTable();
});

// ---------- Export ----------
const EXPORT_COLUMNS = [
  {key:'id', label:'Order ID'},
  {key:'ext', label:'Order Ext ID'},
  {key:'brand', label:'Marca'},
  {key:'ostatus', label:'Estado'},
  {key:'courier', label:'Courier'},
  {key:'servicio', label:'Servicio'},
  {key:'fecha', label:'Fecha compra'},
  {key:'hora', label:'Hora compra'},
  {key:'promise_label', label:'Promesa'},
  {key:'promise_reason', label:'Motivo alerta'},
  {key:'tracking', label:'Tracking'},
  {key:'sstatus', label:'Estado envío'},
];

function buildExportRows(){
  const filtered = getFiltered();
  return filtered.map(d => ({
    id: d.id,
    ext: d.ext,
    brand: d.brand,
    ostatus: d.ostatus,
    courier: d.courier,
    servicio: d.servicio,
    fecha: `${d.fecha_compra} (${d.dia_wd})`,
    hora: d.hora,
    promise_label: d.promise_str ? `${d.promise_str} (${d.promise_wd})` : '',
    promise_reason: d.promise_reason,
    tracking: d.tracking,
    sstatus: d.sstatus,
  }));
}

function csvEscape(val){
  const s = String(val ?? '');
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function flashExportNote(text){
  const note = document.getElementById('exportNote');
  note.textContent = text;
  setTimeout(() => { if(note.textContent === text) note.textContent = ''; }, 3500);
}

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.getElementById('exportCsv').addEventListener('click', () => {
  const rows = buildExportRows();
  const header = EXPORT_COLUMNS.map(c => csvEscape(c.label)).join(';');
  const lines = rows.map(r => EXPORT_COLUMNS.map(c => csvEscape(r[c.key])).join(';'));
  const csv = '\uFEFF' + [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `ordenes_semana_29-06_al_02-07-2026_filtrado.csv`);
  flashExportNote(`Exportadas ${rows.length} órdenes a CSV.`);
});

document.getElementById('exportXlsx').addEventListener('click', () => {
  const rows = buildExportRows();
  const aoa = [EXPORT_COLUMNS.map(c => c.label), ...rows.map(r => EXPORT_COLUMNS.map(c => r[c.key]))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = EXPORT_COLUMNS.map(c => ({ wch: Math.max(c.label.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ordenes');
  XLSX.writeFile(wb, `ordenes_semana_29-06_al_02-07-2026_filtrado.xlsx`);
  flashExportNote(`Exportadas ${rows.length} órdenes a XLSX.`);
});

// ---------- init ----------
renderKPIs();
renderCourierBars();
renderBrandDonut();
populateSelectOptions();
renderChips();
renderTable();

