(function(){
  const DATA_URL = window.RICOBET_DATA_URL || './data/winners.json';

  const rowsEl = document.getElementById('rows');
  const updatedEl = document.getElementById('lastUpdated');
  const boardDateEl = document.getElementById('boardDate');
  const refreshBtn = document.getElementById('refresh');
  const datePicker = document.getElementById('datePicker');

  function fmtMoney(n){ return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }

  function yyyyMMdd(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  async function fetchJSON(url){
    const res = await fetch(url + `?v=${Date.now()}`, {cache:'no-store'});
    if(!res.ok) throw new Error('Unable to load data');
    return res.json();
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

    // Top 10 by amount (desc), auto-assign rank if missing
    let items = (day.rows || []).slice(0);
    items.sort((a,b) => (b.amount||0) - (a.amount||0));
    items = items.slice(0,10).map((r,i)=>({ rank:r.rank ?? (i+1), ...r }));

    for(const r of items){
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div><span class="rank ${r.rank===1?'top1':r.rank===2?'top2':r.rank===3?'top3':''}">${r.rank}</span></div>
        <div class="player"><span class="avatar" aria-hidden="true"></span><span>${r.name || 'Player'}</span></div>
        <div class="game col-hide-sm">${r.game || '—'}</div>
        <div class="payout">R$ ${fmtMoney(r.amount)}</div>
      `;
      rowsEl.appendChild(row);
    }

    updatedEl.textContent = day.last_updated ? new Date(day.last_updated).toLocaleString() : 'now';
    boardDateEl.textContent = ymd;
  }

  async function load(ymd){
    try{
      const data = await fetchJSON(DATA_URL);
      renderForDate(data, ymd);
    }catch(err){
      console.error(err);
      rowsEl.innerHTML = `<div class="row"><div></div><div>Could not load leaderboard.</div><div class="col-hide-sm"></div><div></div></div>`;
    }
  }

  // Init with today (UTC or your server timezone as needed)
  const today = new Date();
  const todayStr = yyyyMMdd(today);
  datePicker.value = todayStr;
  load(todayStr);

  refreshBtn.addEventListener('click', e => { e.preventDefault(); load(datePicker.value || todayStr); });
  datePicker.addEventListener('change', () => load(datePicker.value));
})();
