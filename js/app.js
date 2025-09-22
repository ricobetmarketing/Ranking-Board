(function(){
  const DATA_URL = window.RICOBET_DATA_URL || './data/winners.json';
  const TZ = window.RICOBET_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const CUR = window.RICOBET_CURRENCY || { symbol: '$', code: 'USD' };

  const rowsEl = document.getElementById('rows');
  const updatedEl = document.getElementById('lastUpdated');
  const boardDateEl = document.getElementById('boardDate');
  const refreshBtn = document.getElementById('refresh');
  const datePicker = document.getElementById('datePicker');
  const countdownEl = document.getElementById('countdown');
  const quickToday = document.getElementById('quickToday');
  const quickYesterday = document.getElementById('quickYesterday');

  /* ---------- Utils ---------- */
  function fmtMoney(n){
    return `${CUR.symbol} ${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  }
  function yyyyMMddFromDate(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }
  function nowInTZ(){
    // Build a Date from time zone parts (avoids external libs)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
    }).formatToParts(new Date()).reduce((acc,p)=>{acc[p.type]=p.value; return acc;},{});
    // YYYY-MM-DDTHH:mm:ss in the target TZ, treat as local then convert to UTC Date by appending 'Z' trick:
    // We create a Date from ISO without 'Z' (interpreted as local), but to be safe we compute epoch via Date.UTC
    const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    // Create a UTC epoch for these "TZ local" fields by reinterpreting as UTC then offset back:
    const epoch = Date.parse(iso + 'Z'); // epoch of that timestamp assuming it's UTC
    // But we need the real epoch for TZ, so we get the actual offset between TZ and UTC right now:
    // Compute UTC parts of current time:
    const now = new Date();
    const utcParts = new Intl.DateTimeFormat('en-CA', {timeZone:'UTC', hourCycle:'h23',
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'
    }).formatToParts(now).reduce((a,p)=>{a[p.type]=p.value;return a;},{});
    const tzParts = new Intl.DateTimeFormat('en-CA', {timeZone:TZ, hourCycle:'h23',
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'
    }).formatToParts(now).reduce((a,p)=>{a[p.type]=p.value;return a;},{});
    const utcEpoch = Date.parse(`${utcParts.year}-${utcParts.month}-${utcParts.day}T${utcParts.hour}:${utcParts.minute}:${utcParts.second}Z`);
    const tzEpoch  = Date.parse(`${tzParts.year}-${tzParts.month}-${tzParts.day}T${tzParts.hour}:${tzParts.minute}:${tzParts.second}Z`);
    const offsetMs = tzEpoch - utcEpoch; // positive if TZ ahead of UTC
    return new Date(epoch - offsetMs);
  }
  function nextMidnightTZ(){
    const n = nowInTZ();
    const y = n.getUTCFullYear(), m = n.getUTCMonth(), d = n.getUTCDate();
    // "Midnight" in TZ = today 00:00 TZ -> tomorrow 00:00 TZ
    // Build today 00:00 TZ in UTC:
    const todayTZ = new Date(Date.UTC(y, m, d, 0, 0, 0));
    const tomorrowTZ = new Date(todayTZ.getTime() + 24*3600*1000);
    // But 'todayTZ' we constructed in UTC for the same UTC date parts of tz-UTC date,
    // We only need the "tomorrow midnight in TZ" relative to nowInTZ(), so:
    return tomorrowTZ;
  }
  function startCountdown(){
    function tick(){
      const now = nowInTZ();
      const targ = nextMidnightTZ();
      let diff = targ - now;
      if (diff < 0) diff = 0;
      const h = Math.floor(diff/3600000);
      const m = Math.floor((diff%3600000)/60000);
      const s = Math.floor((diff%60000)/1000);
      countdownEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      if (diff === 0) { /* optional: auto reload board for new day */ }
      requestAnimationFrame(()=>setTimeout(tick, 250));
    }
    tick();
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
      const middle = '****';
      return `${start}${middle}${end}`;
    }
    const left = Math.floor((str.length - 4)/2);
    return str.slice(0,left) + '****' + str.slice(left+4);
  }
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

  /* ---------- Init ---------- */
  // Default to "today" in the configured time zone
  (function initDatePicker(){
    const n = nowInTZ();
    const ymd = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(n);
    datePicker.value = ymd;
    load(ymd);
  })();

  refreshBtn.addEventListener('click', e => { e.preventDefault(); load(datePicker.value); });
  datePicker.addEventListener('change', () => load(datePicker.value));

  quickToday.addEventListener('click', ()=>{
    const n = nowInTZ();
    const ymd = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(n);
    datePicker.value = ymd;
    load(ymd);
  });
  quickYesterday.addEventListener('click', ()=>{
    const n = nowInTZ();
    n.setUTCDate(n.getUTCDate()-1); // subtract one "TZ day" approximation
    const ymd = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(n);
    datePicker.value = ymd;
    load(ymd);
  });

  startCountdown();
})();

