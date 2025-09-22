(function(){
  const DATA_DIR = window.RICOBET_DATA_DIR || './data';
  const MONTH    = window.RICOBET_MONTH || '2025-09';           // "YYYY-MM"
  const START_YMD= window.EVENT_START_YMD || `${MONTH}-01`;     // "YYYY-MM-DD"
  const END_YMD  = window.EVENT_END_YMD   || `${MONTH}-31`;     // "YYYY-MM-DD"

  const TZ  = window.RICOBET_TIMEZONE   || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const CUR = window.RICOBET_CURRENCY   || { symbol: '$', code: 'USD' };

  const rowsEl       = document.getElementById('rows');
  const updatedEl    = document.getElementById('lastUpdated');
  const boardDateEl  = document.getElementById('boardDate');
  const refreshBtn   = document.getElementById('refresh');
  const datePicker   = document.getElementById('datePicker');
  const quickToday   = document.getElementById('quickToday');
  const quickYesterday = document.getElementById('quickYesterday');

  const searchInput  = document.getElementById('searchInput');
  const searchBtn    = document.getElementById('searchBtn');
  const searchResult = document.getElementById('searchResult');

  /* ---------- Utilities ---------- */
  const fmtMoney = n => `${CUR.symbol} ${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const pad2 = n => String(n).padStart(2,'0');

  function nowInTZ(){
    const now = new Date();
    const partsFor = (z) => new Intl.DateTimeFormat('en-CA', {
      timeZone:z, hourCycle:'h23', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    }).formatToParts(now).reduce((a,p)=>{a[p.type]=p.value;return a;}, {});
    const utc = partsFor('UTC'); const tz = partsFor(TZ);
    const utcEpoch = Date.parse(`${utc.year}-${utc.month}-${utc.day}T${utc.hour}:${utc.minute}:${utc.second}Z`);
    const tzEpoch  = Date.parse(`${tz.year}-${tz.month}-${tz.day}T${tz.hour}:${tz.minute}:${tz.second}Z`);
    return new Date(now.getTime() + (tzEpoch - utcEpoch));
  }
  const ymdInTZ = (date) => new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(date);

  function ymdCmp(a,b){ return a.localeCompare(b); }
  function clampYmd(ymd){
    if(ymdCmp(ymd, START_YMD) < 0) return START_YMD;
    if(ymdCmp(ymd, END_YMD)   > 0) return END_YMD;
    return ymd;
  }

  function midnightYmdToDate(ymd){
    const [Y,M,D] = ymd.split('-').map(Number);
    return new Date(Date.UTC(Y, M-1, D, 0, 0, 0));
  }

  /* ---------- Countdown targets ---------- */
  function nextMidnightInWindow(){
    const n = nowInTZ();
    const todayYmd = ymdInTZ(n);
    if(ymdCmp(todayYmd, START_YMD) < 0){
      return midnightYmdToDate(START_YMD);
    }
    if(ymdCmp(todayYmd, END_YMD) > 0){
      return null; // ended
    }
    const [Y,M,D] = todayYmd.split('-').map(Number);
    return new Date(Date.UTC(Y, M-1, D+1, 0, 0, 0));
  }

  function splitHMS(ms){
    if(ms < 0) ms = 0;
    const h = Math.floor(ms/3600000);
    const m = Math.floor((ms%3600000)/60000);
    const s = Math.floor((ms%60000)/1000);
    return {h, m, s};
  }

  /* ---------- Neon ring countdown ---------- */
  const RADIUS = 30, CIRC = 2*Math.PI*RADIUS;
  function ensureGradient(svg){
    if (document.getElementById('ring-grad')) return;
    const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg','linearGradient');
    grad.setAttribute('id','ring-grad'); grad.setAttribute('x1','0%'); grad.setAttribute('y1','0%');
    grad.setAttribute('x2','100%'); grad.setAttribute('y2','0%');
    const s1 = document.createElementNS('http://www.w3.org/2000/svg','stop'); s1.setAttribute('offset','0%');
    s1.setAttribute('stop-color', getComputedStyle(document.documentElement).getPropertyValue('--g1') || '#ff6ec4');
    const s2 = document.createElementNS('http://www.w3.org/2000/svg','stop'); s2.setAttribute('offset','100%');
    s2.setAttribute('stop-color', getComputedStyle(document.documentElement).getPropertyValue('--g2') || '#7873f5');
    grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); svg.prepend(defs);
  }
  function setStroke(el, pct){
    el.style.strokeDasharray = `${CIRC}`;
    el.style.strokeDashoffset = `${CIRC * (1 - Math.max(0,Math.min(1,pct)))}`;
  }
  function updateRing($ring, value, max){
    if(!$ring) return;
    const svg = $ring.querySelector('svg');
    const fg  = $ring.querySelector('.fg');
    const val = $ring.querySelector('.value');
    ensureGradient(svg);
    fg.setAttribute('stroke','url(#ring-grad)');
    val.textContent = pad2(value);
    setStroke(fg, value/max);
  }
  function showEndedOnRings(){
    document.querySelectorAll('.ring').forEach(r=>{
      const v = r.querySelector('.value');
      const l = r.querySelector('.label');
      if (v) v.textContent = '—';
      if (l) l.textContent = 'ENDED';
      const fg = r.querySelector('.fg');
      if (fg){ fg.style.strokeDasharray = `${CIRC}`; fg.style.strokeDashoffset = `${CIRC}`; }
    });
  }
  function startRingCountdown(){
    const ringH = document.querySelector('.ring[data-unit="h"]');
    const ringM = document.querySelector('.ring[data-unit="m"]');
    const ringS = document.querySelector('.ring[data-unit="s"]');
    if (!ringH || !ringM || !ringS) return;

    (function tick(){
      const target = nextMidnightInWindow();
      if (!target){ showEndedOnRings(); return; } // after END

      const now = nowInTZ();
      let diff = target - now; if (diff < 0) diff = 0;
      const {h, m, s} = splitHMS(diff);
      updateRing(ringH, h, 24);
      updateRing(ringM, m, 60);
      updateRing(ringS, s, 60);

      requestAnimationFrame(()=>setTimeout(tick, 250));
    })();
  }

  /* ---------- Data (October-only) ---------- */
  const monthCache = new Map();
  async function fetchMonth(month){ // "YYYY-MM"
    if (monthCache.has(month)) return monthCache.get(month);
    const url = `${DATA_DIR}/winners-${month}.json?v=${Date.now()}`;
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error(`Unable to load ${url}`);
    const json = await res.json();
    monthCache.set(month, json);
    return json;
  }
  function findBestDay(data, targetYmd){
    if (!data?.days?.length) return null;
    const sorted = data.days.slice().sort((a,b)=> b.date.localeCompare(a.date));
    return sorted.find(d=>d.date===targetYmd) || sorted.find(d=>d.date<=targetYmd) || sorted[0];
  }
  function maskUsername(name){
    if(!name) return 'Player';
    const str = String(name);
    if (str.length <= 6){
      const keep = Math.max(1, Math.floor(str.length/3));
      return `${str.slice(0, keep)}****${str.slice(-keep)}`;
    }
    const left = Math.floor((str.length - 4)/2);
    return str.slice(0,left) + '****' + str.slice(left+4);
  }

  /* ---------- Render one day ---------- */
  function renderRows(day){
    rowsEl.innerHTML = '';
    const itemsSorted = (day.rows || [])
      .slice()
      .sort((a,b)=>(b.amount||0)-(a.amount||0))
      .map((r,i)=>({ rank:r.rank ?? (i+1), ...r }));

    // Render top-20
    const top20 = itemsSorted.slice(0,20);
    for(const r of top20){
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.nameOriginal = r.name;
      row.innerHTML = `
        <div><span class="rank ${r.rank===1?'top1':r.rank===2?'top2':r.rank===3?'top3':''}">${r.rank}</span></div>
        <div class="player"><span class="avatar" aria-hidden="true"></span><span class="mask">${maskUsername(r.name)}</span></div>
        <div class="payout">${fmtMoney(r.amount)}</div>
      `;
      rowsEl.appendChild(row);
    }

    updatedEl && (updatedEl.textContent = day.last_updated ? new Date(day.last_updated).toLocaleString() : 'now');
  }

  async function renderForDate(ymd){
    const clamped = clampYmd(ymd);
    if (datePicker && datePicker.value !== clamped) datePicker.value = clamped;

    rowsEl.innerHTML = '';
    boardDateEl && (boardDateEl.textContent = clamped);

    try{
      const month = await fetchMonth(MONTH);
      const day = findBestDay(month, clamped);
      if(!day){
        rowsEl.innerHTML = `<div class="row"><div></div><div>No results for ${clamped}.</div><div></div></div>`;
        updatedEl && (updatedEl.textContent = '—');
        return;
      }
      renderRows(day);
    }catch(err){
      console.error(err);
      rowsEl.innerHTML = `<div class="row"><div></div><div>Could not load leaderboard.</div><div></div></div>`;
      updatedEl && (updatedEl.textContent = '—');
    }
  }

  /* ---------- Search (by full username on selected day) ---------- */
  async function doSearch(){
    if (!searchInput || !searchResult) return;
    const q = (searchInput.value || '').trim();
    searchResult.textContent = '';
    if (!q){ return; }

    // Load data for the currently selected day
    const ymd = (datePicker && datePicker.value) ? datePicker.value : ymdInTZ(nowInTZ());
    try{
      const month = await fetchMonth(MONTH);
      const day = findBestDay(month, clampYmd(ymd));
      if (!day || !day.rows || !day.rows.length){
        searchResult.textContent = 'No data for selected date.';
        return;
      }

      // Sort to compute true rank (not just Top-20)
      const itemsSorted = day.rows.slice().sort((a,b)=>(b.amount||0)-(a.amount||0));
      const idx = itemsSorted.findIndex(r => String(r.name).toLowerCase() === q.toLowerCase());

      if (idx === -1){
        searchResult.textContent = `No exact match for "${q}" on ${day.date}.`;
        return;
      }

      const rank = idx + 1;
      const isTop20 = rank <= 20;
      searchResult.textContent = isTop20
        ? `✅ ${q} is #${rank} today.`
        : `ℹ️ ${q} is #${rank} today — not in Top 20.`;

      // If Top-20, scroll and highlight their row
      if (isTop20){
        // find the rendered row with that original name
        const row = Array.from(rowsEl.children).find(el => (el.dataset && el.dataset.nameOriginal && el.dataset.nameOriginal.toLowerCase() === q.toLowerCase()));
        if (row){
          rowsEl.querySelectorAll('.hit').forEach(e=>e.classList.remove('hit'));
          row.classList.add('hit');
          row.scrollIntoView({behavior:'smooth', block:'center'});
          setTimeout(()=>row.classList.remove('hit'), 2500);
        }
      }
    }catch(err){
      console.error(err);
      searchResult.textContent = 'Search error. Try again.';
    }
  }

  /* ---------- Init ---------- */
  (function init(){
    // Lock picker to Oct 1–31
    if (datePicker){
      datePicker.min = START_YMD;
      datePicker.max = END_YMD;
    }
    const todayClamped = clampYmd(ymdInTZ(nowInTZ()));
    if (datePicker) datePicker.value = todayClamped;

    renderForDate(todayClamped);
    startRingCountdown();

    if (refreshBtn) refreshBtn.addEventListener('click', e => { e.preventDefault(); renderForDate(datePicker.value); });
    if (datePicker)   datePicker.addEventListener('change', () => renderForDate(datePicker.value));
    if (quickToday)   quickToday.addEventListener('click', ()=>{ const ymd = clampYmd(ymdInTZ(nowInTZ())); datePicker.value = ymd; renderForDate(ymd); });
    if (quickYesterday) quickYesterday.addEventListener('click', ()=>{
      const n = nowInTZ(); n.setUTCDate(n.getUTCDate()-1);
      const ymd = clampYmd(ymdInTZ(n));
      datePicker.value = ymd; renderForDate(ymd);
    });

    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (searchInput) searchInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
  })();
})();

