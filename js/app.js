(function(){
  const DATA_URL = window.RICOBET_DATA_URL || './data/winners.json';
  const TZ = window.RICOBET_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const CUR = window.RICOBET_CURRENCY || { symbol: '$', code: 'USD' };

  const rowsEl = document.getElementById('rows');
  const updatedEl = document.getElementById('lastUpdated');
  const boardDateEl = document.getElementById('boardDate');
  const refreshBtn = document.getElementById('refresh');
  const datePicker = document.getElementById('datePicker');
  const quickToday = document.getElementById('quickToday');
  const quickYesterday = document.getElementById('quickYesterday');

  /* ---------- Utils ---------- */
  function fmtMoney(n){
    return `${CUR.symbol} ${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  }

  function nowInTZ(){
    // Build target-TZ "now" by comparing against UTC (no external libs)
    const now = new Date();
    const toParts = (z) => new Intl.DateTimeFormat('en-CA', {
      timeZone: z, hourCycle:'h23',
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    }).formatToParts(now).reduce((a,p)=>{a[p.type]=p.value;return a;},{});
    const utc = toParts('UTC');
    const tz  = toParts(TZ);
    const utcEpoch = Date.parse(`${utc.year}-${utc.month}-${utc.day}T${utc.hour}:${utc.minute}:${utc.second}Z`);
    const tzEpoch  = Date.parse(`${tz.year}-${tz.month}-${tz.day}T${tz.hour}:${tz.minute}:${tz.second}Z`);
    const offsetMs = tzEpoch - utcEpoch;
    return new Date(now.getTime() + offsetMs);
  }

  function nextMidnightTZ(){
    // Compute midnight for the next day in the configured TZ
    const n = nowInTZ();
    const y = n.getUTCFullYear(), m = n.getUTCMonth(), d = n.getUTCDate();
    const todayMid = new Date(Date.UTC(y, m, d, 0, 0, 0));
    const tomorrowMid = new Date(todayMid.getTime() + 24*3600*1000);
    return tomorrowMid;
  }

  function ymdInTZ(date){
    return new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
  }

  function fetchJSON(url){
    return fetch(url + `?v=${Date.now()}`, {cache:'no-store'}).then(res=>{
      if(!res.ok) throw new Error('Unable to load data');
      return res.json();
    });
  }

  function maskUsername(name){
    if(!name) return 'Player';
    const str = String(name);
    if (str.length <= 6){
      const keep = Math.max(1, Math.floor(str.length/3));
      const start = str.slice(0, keep);
      const end = str.slice(-keep);
      return `${start}****${end}`;
    }
    const left = Math.floor((str.length - 4)/2);
    return str.slice(0,left) + '****' + str.slice(left+4);
  }

  /* ---------- Countdown (flip) ---------- */
  function splitHMS(ms){
    if(ms < 0) ms = 0;
    const h = Math.floor(ms/3600000);
    const m = Math.floor((ms%3600000)/60000);
    const s = Math.floor((ms%60000)/1000);
    return {h, m, s};
  }

  function setFlip($flip, val){
    if(!$flip) return;
    const top = $flip.querySelector('.top');
    const bottom = $flip.querySelector('.bottom');
    const leaf = $flip.querySelector('.leaf');
    const next = String(val).padStart(2,'0');
    const curr = top.textContent.trim();
    if(curr === next) return;

    $flip.classList.add('anim');
    // After the animation completes, unify both faces
    leaf.addEventListener('animationend', ()=>{
      $flip.classList.remove('anim');
      top.textContent = next;
      bottom.textContent = next;
    }, {once:true});

    // During flip, bottom shows the next value already
    bottom.textContent = next;
  }

  function startCountdown(){
    const fh = document.querySelector('.flip[data-unit="h"]');
    const fm = document.querySelector('.flip[data-unit="m"]');
    const fs = document.querySelector('.flip[data-unit="s"]');

    function tick(){
      const now = nowInTZ();
      const target = nextMidnightTZ();
      const diff = target - now;
      const {h, m, s} = splitHMS(diff);

      setFlip(fh, h);
      setFlip(fm, m);
      setFlip(fs, s);

      requestAnimationFrame(()=>setTimeout(tick, 250)); // ~4fps updates
    }
    tick();
  }

  /* ---------- Board rendering ---------- */
  function renderForDate(data, ymd){
    const day = data.days?.find(d => d.date === ymd);
    rowsEl.innerHTML = '';
    if(!day){
      rowsEl.innerHTML = `<div class="row"><div></div><div>No results for ${ymd}.</div><div class="col-hide-sm"></div><div></div></div>`;
      updatedEl.textContent = '—';
      boardDateEl.textContent = ymd;
      return;
    }

    // Sort by amount desc, take Top 20
    let items = (day.rows || []).slice(0);
    items.sort((a,b) => (b.amount||0) - (a.amount||0));
    items = items.slice(0,20).map((r,i)=>({ rank:r.rank ?? (i+1), ...r }));

    for(const r of items){
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div><span class="rank ${r.rank===1?'top1':r.rank===2?'top2':r.rank===3?'top3':''}">${r.rank}</span></div>
        <div class="player"><span class="avatar" aria-hidden="true"></span><span class="mask">${maskUsername(r.name)}</span></div>
        <div class="game col-hide-sm">${r.game || '—'}</div>
        <div class="payout">${fmtMoney(r.amount)}</div>
      `;
      rowsEl.appendChild(row);
    }

    updatedEl.textContent = day.last_updated ? new Date(day.last_updated).toLocaleString() : 'now';
    boardDateEl.textContent = ymd;
  }

  function load(ymd){
    fetchJSON(DATA_URL).then(data=>renderForDate(data, ymd)).catch(err=>{
      console.error(err);
      rowsEl.innerHTML = `<div class="row"><div></div><div>Could not load leaderboard.</div><div class="col-hide-sm"></div><div></div></div>`;
    });
  }

  /* ---------- Neon Ring Countdown ---------- */
function ensureGradient(svg){
  // Add linearGradient once per document
  if (document.getElementById('ring-grad')) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg','linearGradient');
  grad.setAttribute('id','ring-grad');
  grad.setAttribute('x1','0%'); grad.setAttribute('y1','0%');
  grad.setAttribute('x2','100%'); grad.setAttribute('y2','0%');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg','stop');
  s1.setAttribute('offset','0%');  s1.setAttribute('stop-color', getComputedStyle(document.documentElement).getPropertyValue('--g1') || '#ff6ec4');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg','stop');
  s2.setAttribute('offset','100%');s2.setAttribute('stop-color', getComputedStyle(document.documentElement).getPropertyValue('--g2') || '#7873f5');
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad);
  svg.prepend(defs);
}
function setStroke(el, pct){
  // pct: 0..1 (how much of the circle to show)
  const r = 30; // matches CSS
  const C = 2 * Math.PI * r;
  el.style.strokeDasharray = `${C}`;
  el.style.strokeDashoffset = `${C * (1 - pct)}`;
}
function updateRing($ring, value, max){
  const svg = $ring.querySelector('svg');
  const fg  = $ring.querySelector('.fg');
  const val = $ring.querySelector('.value');
  ensureGradient(svg);
  // hook gradient
  fg.setAttribute('stroke','url(#ring-grad)');

  // Show remaining value and progress (remaining / max)
  val.textContent = String(value).padStart(2,'0');
  const pct = Math.max(0, Math.min(1, value / max));
  setStroke(fg, pct);
}
function startRingCountdown(){
  const ringH = document.querySelector('.ring[data-unit="h"]');
  const ringM = document.querySelector('.ring[data-unit="m"]');
  const ringS = document.querySelector('.ring[data-unit="s"]');

  function tick(){
    const now = nowInTZ();
    const target = nextMidnightTZ();
    let diff = target - now;
    if (diff < 0) diff = 0;

    const {h, m, s} = splitHMS(diff);
    // Hours remaining to midnight (0..23)
    updateRing(ringH, h, 24);
    updateRing(ringM, m, 60);
    updateRing(ringS, s, 60);

    requestAnimationFrame(()=>setTimeout(tick, 250)); // smooth-ish
  }
  tick();
}

  
  /* ---------- Init ---------- */
  (function init(){
    // Default to "today" in the configured time zone
    const n = nowInTZ();
    const ymd = ymdInTZ(n);
    datePicker.value = ymd;
    load(ymd);
    startCountdown();

    refreshBtn.addEventListener('click', e => { e.preventDefault(); load(datePicker.value); });
    datePicker.addEventListener('change', () => load(datePicker.value));
    quickToday.addEventListener('click', ()=>{
      const n = nowInTZ();
      const ymd = ymdInTZ(n);
      datePicker.value = ymd;
      load(ymd);
    });
    quickYesterday.addEventListener('click', ()=>{
      const n = nowInTZ();
      n.setUTCDate(n.getUTCDate()-1);
      const ymd = ymdInTZ(n);
      datePicker.value = ymd;
      load(ymd);
    });
  })();
})();
