/* DrainSmart crew app: a phone view of the tasks the control room assigns. */
(() => {
  'use strict';
  const Sync = window.DrainSync;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const T = {
    en: {
      title: 'DrainSmart Crew', yours: 'Your tasks', newA: 'New alerts', done: 'Completed', none: 'Nothing here right now.',
      blockage: 'Drain blockage', sensorTask: 'Sensor service', crit: 'Critical', high: 'High', fault: 'Sensor fault', verified: 'Verified',
      water: 'Water upstream', rain: 'Rain next 12 h', crop: 'Field', created: 'Raised at',
      accept: 'Accept task', arrive: "I've arrived", confirm: 'Blockage confirmed', nobl: 'No blockage found', photo: 'Add photo (optional)',
      manual: 'Start manual clearing', rake: 'Run supervised rake', finish: 'Clearing finished', serviced: 'Sensor cleaned', estop: 'EMERGENCY STOP',
      navigate: 'Navigate to drain', enroute: 'On the way. Arrive by', clearing: 'Clearing in progress', raking: 'Rake running',
      waiting: 'Waiting for sensors to confirm the water is flowing…', verifiedMsg: 'Verified clear by sensors. Thank you!',
      failed: 'Sensors still show water backing up. Please clear by hand.', closedFalse: 'Closed: no blockage found',
      safety: 'Safety check before raking', s1: 'No person or animal in the channel within 10 m', s2: 'Supervisor on site and watching the rake',
      s3: 'Emergency stop tested', s4: 'Power isolated, no exposed wiring in water', start: 'Start rake', cancel: 'Cancel',
      sending: 'Sending…', sent: 'Sent to control room', connected: 'Live', local: 'Same-device mode', offline: 'Not connected',
      join: 'Enter the room code shown on the control room screen', joinBtn: 'Join', clock: 'Control room time',
    },
    hi: {
      title: 'DrainSmart टीम', yours: 'आपके काम', newA: 'नई चेतावनियाँ', done: 'पूरे हुए', none: 'अभी कुछ नहीं है।',
      blockage: 'नाली में रुकावट', sensorTask: 'सेंसर सर्विस', crit: 'गंभीर', high: 'उच्च', fault: 'सेंसर खराबी', verified: 'पुष्टि हुई',
      water: 'ऊपरी जल स्तर', rain: 'अगले 12 घंटे बारिश', crop: 'खेत', created: 'समय',
      accept: 'काम स्वीकार करें', arrive: 'मैं पहुँच गया', confirm: 'रुकावट की पुष्टि', nobl: 'कोई रुकावट नहीं मिली', photo: 'फ़ोटो जोड़ें (वैकल्पिक)',
      manual: 'हाथ से सफ़ाई शुरू करें', rake: 'निगरानी में रेक चलाएँ', finish: 'सफ़ाई पूरी हुई', serviced: 'सेंसर साफ़ किया', estop: 'आपातकालीन स्टॉप',
      navigate: 'नाली तक रास्ता', enroute: 'रास्ते में। पहुँचने का समय', clearing: 'सफ़ाई जारी है', raking: 'रेक चल रहा है',
      waiting: 'सेंसर द्वारा प्रवाह की पुष्टि की प्रतीक्षा…', verifiedMsg: 'सेंसर से साफ़ होने की पुष्टि हुई। धन्यवाद!',
      failed: 'सेंसर अब भी पानी रुका दिखा रहे हैं। कृपया हाथ से साफ़ करें।', closedFalse: 'बंद: कोई रुकावट नहीं मिली',
      safety: 'रेक चलाने से पहले सुरक्षा जाँच', s1: '10 मीटर के भीतर नाली में कोई व्यक्ति या पशु नहीं', s2: 'पर्यवेक्षक मौके पर है और रेक देख रहा है',
      s3: 'आपातकालीन स्टॉप जाँचा गया', s4: 'बिजली अलग की गई, पानी में कोई खुला तार नहीं', start: 'रेक शुरू करें', cancel: 'रद्द करें',
      sending: 'भेजा जा रहा है…', sent: 'कंट्रोल रूम को भेजा गया', connected: 'लाइव', local: 'एक ही डिवाइस मोड', offline: 'कनेक्शन नहीं',
      join: 'कंट्रोल रूम स्क्रीन पर दिखा रूम कोड डालें', joinBtn: 'जुड़ें', clock: 'कंट्रोल रूम समय',
    },
    te: {
      title: 'DrainSmart బృందం', yours: 'మీ పనులు', newA: 'కొత్త హెచ్చరికలు', done: 'పూర్తయినవి', none: 'ప్రస్తుతం ఏమీ లేదు.',
      blockage: 'కాలువలో అడ్డంకి', sensorTask: 'సెన్సార్ సర్వీస్', crit: 'తీవ్రం', high: 'అధికం', fault: 'సెన్సార్ లోపం', verified: 'నిర్ధారించబడింది',
      water: 'ఎగువ నీటి మట్టం', rain: 'రాబోయే 12 గంటల వర్షం', crop: 'పొలం', created: 'సమయం',
      accept: 'పనిని అంగీకరించండి', arrive: 'నేను చేరుకున్నాను', confirm: 'అడ్డంకి నిర్ధారించబడింది', nobl: 'అడ్డంకి కనిపించలేదు', photo: 'ఫోటో జోడించండి (ఐచ్ఛికం)',
      manual: 'చేతితో శుభ్రపరచడం ప్రారంభించండి', rake: 'పర్యవేక్షణలో రేక్ నడపండి', finish: 'శుభ్రపరచడం పూర్తయింది', serviced: 'సెన్సార్ శుభ్రం చేశాను', estop: 'అత్యవసర స్టాప్',
      navigate: 'కాలువకు దారి', enroute: 'దారిలో ఉన్నారు. చేరుకోవాల్సిన సమయం', clearing: 'శుభ్రపరచడం జరుగుతోంది', raking: 'రేక్ నడుస్తోంది',
      waiting: 'నీరు ప్రవహిస్తోందని సెన్సార్లు నిర్ధారించే వరకు వేచి ఉండండి…', verifiedMsg: 'సెన్సార్ల ద్వారా శుభ్రంగా నిర్ధారించబడింది. ధన్యవాదాలు!',
      failed: 'సెన్సార్లు ఇంకా నీరు నిలిచినట్లు చూపుతున్నాయి. దయచేసి చేతితో శుభ్రం చేయండి.', closedFalse: 'మూసివేయబడింది: అడ్డంకి కనిపించలేదు',
      safety: 'రేక్ నడిపే ముందు భద్రతా తనిఖీ', s1: '10 మీటర్ల లోపు కాలువలో మనుషులు లేదా జంతువులు లేవు', s2: 'పర్యవేక్షకుడు అక్కడే ఉండి రేక్‌ను గమనిస్తున్నారు',
      s3: 'అత్యవసర స్టాప్ పరీక్షించబడింది', s4: 'విద్యుత్ వేరు చేయబడింది, నీటిలో బయటపడిన తీగలు లేవు', start: 'రేక్ ప్రారంభించండి', cancel: 'రద్దు చేయండి',
      sending: 'పంపుతోంది…', sent: 'కంట్రోల్ రూమ్‌కు పంపబడింది', connected: 'లైవ్', local: 'ఒకే పరికరం మోడ్', offline: 'కనెక్షన్ లేదు',
      join: 'కంట్రోల్ రూమ్ స్క్రీన్‌పై కనిపించే రూమ్ కోడ్ నమోదు చేయండి', joinBtn: 'చేరండి', clock: 'కంట్రోల్ రూమ్ సమయం',
    },
  };
  const CREWS = { A: 'Crew A · Ravi & Suresh', B: 'Crew B · Lakshmi & Imran', C: 'Panchayat contractor (JCB)' };

  const ls = {
    get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  };
  const params = new URLSearchParams(location.search);
  const state = {
    room: (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    focusTask: Number(params.get('task')) || null,
    crew: ls.get('ds.crew', 'A'),
    lang: params.get('lang') || ls.get('ds.crewLang', 'te'),
    snap: null, snapKey: '', pending: {}, photos: {}, choosing: false, safetyTask: null,
  };
  const t = (k) => (T[state.lang] && T[state.lang][k]) || T.en[k];

  /* ---------- rendering ---------- */
  function render() {
    document.documentElement.lang = state.lang;
    $('#tTitle').textContent = t('title');
    if (!state.room) { renderJoin(); return; }
    const snap = state.snap;
    if (!snap) { $('#main').innerHTML = `<div class="empty">${esc(t('offline'))}</div>`; return; }
    const tasks = snap.tasks || [];
    const mine = tasks.filter((x) => x.status !== 'closed' && x.crewId === state.crew);
    const open = tasks.filter((x) => x.status === 'open');
    const done = tasks.filter((x) => x.status === 'closed' && x.crewId === state.crew).slice(0, 5);
    const sec = (title, list) => `<section><h2><span>${esc(title)}</span><span>${list.length}</span></h2>${list.length ? list.map(card).join('') : `<div class="empty">${esc(t('none'))}</div>`}</section>`;
    $('#main').innerHTML = sec(t('yours'), mine) + sec(t('newA'), open) + (done.length ? sec(t('done'), done) : '') +
      `<p class="foot">${esc(t('clock'))}: ${esc(snap.clock || '—')} · Room ${esc(state.room)}</p>`;
    if (state.focusTask) {
      const el = document.getElementById('task-' + state.focusTask);
      if (el) el.scrollIntoView({ block: 'start' });
      state.focusTask = null;
    }
  }

  function renderJoin() {
    $('#main').innerHTML = `<div class="joinbox"><label for="roomIn">${esc(t('join'))}</label>
      <input id="roomIn" maxlength="8" autocomplete="off" inputmode="latin" placeholder="ABCDE">
      <button class="btn primary" id="joinBtn">${esc(t('joinBtn'))}</button></div>`;
    $('#joinBtn').onclick = () => {
      const v = $('#roomIn').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (v.length < 4) return;
      state.room = v;
      history.replaceState(null, '', `?room=${v}`);
      poll();
    };
  }

  function miniMap(task) {
    const xs = [30, 90, 150, 210, 270, 330];
    const idx = task.node.i;
    let s = '<svg viewBox="0 0 360 54" aria-hidden="true"><line x1="10" y1="27" x2="350" y2="27" stroke="#9cc8ec" stroke-width="8" stroke-linecap="round"/>';
    xs.forEach((x, k) => {
      const on = k === idx;
      s += `<circle cx="${x}" cy="27" r="${on ? 12 : 8}" fill="${on ? (task.sev === 'crit' ? '#c42f2f' : task.sev === 'fault' ? '#6f7680' : '#d4661a') : '#2f9e66'}" stroke="#fff" stroke-width="2"/>`;
      s += `<text x="${x}" y="${on ? 31 : 30}" text-anchor="middle" font-size="${on ? 9 : 7}" font-weight="700" fill="#fff">D${k + 1}</text>`;
    });
    return s + '<text x="352" y="50" text-anchor="end" font-size="8" fill="#7a877f">→ river</text></svg>';
  }

  function card(x) {
    const n = x.node;
    const sevCls = x.status === 'closed' ? 'done' : x.sev;
    const sevLbl = x.status === 'closed' ? t('verified') : t(x.sev);
    const pend = state.pending[x.id];
    const dis = pend ? 'disabled' : '';
    const btn = (act, label, cls = '') => `<button class="btn ${cls}" data-act="${act}" data-id="${x.id}" ${dis}>${esc(pend === act ? t('sending') : label)}</button>`;
    const nav = n.lat ? `<a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${n.lat},${n.lon}" target="_blank" rel="noopener">📍 ${esc(t('navigate'))}</a>` : '';
    let body = '';
    let acts = '';
    const mine = x.crewId === state.crew;

    if (x.status === 'open') {
      acts = btn('accept', t('accept'), 'primary');
    } else if (x.status === 'assigned' && mine) {
      body = `<div class="status">${esc(t('enroute'))} ${esc(x.arrive || '')}</div>`;
      acts = nav + btn('arrive', t('arrive'), 'primary');
    } else if (x.status === 'onsite' && mine) {
      if (x.kind === 'sensor') acts = btn('serviced', t('serviced'), 'primary');
      else if (!x.confirmed) {
        const ph = state.photos[x.id];
        body = `<div class="photo-in"><label class="btn" for="ph-${x.id}">📷 ${esc(t('photo'))}</label>${ph ? `<img src="${ph}" alt="">` : ''}
          <input type="file" id="ph-${x.id}" data-photo="${x.id}" accept="image/*" capture="environment" hidden></div>`;
        acts = `<div class="row2">${btn('confirm', t('confirm'), 'primary')}${btn('false', t('nobl'))}</div>`;
      } else {
        if (x.failedVerify) body = `<div class="warn">${esc(t('failed'))}</div>`;
        if (n.rake && !x.failedVerify) acts += btn('rake', t('rake'), 'primary');
        acts += btn('manual', t('manual'), n.rake && !x.failedVerify ? '' : 'primary');
      }
    } else if (x.status === 'clearing' && mine) {
      body = `<div class="status">${esc(x.method === 'rake' ? t('raking') : t('clearing'))}</div><div class="progress"><i style="width:${Math.round((x.progress || 0) * 100)}%"></i></div>`;
      acts = x.method === 'rake' ? btn('estop', '■ ' + t('estop'), 'danger') : btn('done', t('finish'), 'primary');
    } else if (x.status === 'verifying' && mine) {
      body = `<div class="status">⏳ ${esc(t('waiting'))} (${x.verifyCount || 0}/3)</div>`;
    } else if (x.status === 'closed') {
      body = `<div class="status">${esc(x.outcome === 'false_alarm' ? t('closedFalse') : '✓ ' + t('verifiedMsg'))}</div>`;
    }

    return `<article class="task ${sevCls}" id="task-${x.id}"><div class="band"></div><div class="tbody">
      <div class="t1"><b>${esc(n.id)} · ${esc(n.name)}</b><span class="sev ${sevCls}">${esc(sevLbl)}</span></div>
      <div class="sub">#${x.id} ${esc(x.kind === 'sensor' ? t('sensorTask') : t('blockage'))} · ${esc(t('created'))} ${esc(x.created || '')}</div>
      ${x.status !== 'closed' ? `<div class="facts">
        <div><span>${esc(t('water'))}</span><strong>${x.up != null ? Math.round(x.up) + ' / 120 cm' : '—'}</strong></div>
        <div><span>${esc(t('rain'))}</span><strong>${x.rain12 != null ? Math.round(x.rain12) + ' mm' : '—'}</strong></div>
      </div>
      <div class="mini">${miniMap(x)}</div>
      <div class="sub">${esc(t('crop'))}: ${esc(n.acres)} ac · ${esc(n.crop || '')}</div>` : ''}
      ${body}
      ${acts ? `<div class="acts">${acts}</div>` : ''}
    </div></article>`;
  }

  /* ---------- actions ---------- */
  async function send(act, id, extra = {}) {
    state.pending[id] = act;
    render();
    try {
      await Sync.postAction(state.room, Object.assign({ act, task: id, crew: state.crew }, extra));
      toast(t('sent'));
    } catch (err) {
      delete state.pending[id];
      toast(String(err.message || err));
      render();
      return;
    }
    // Keep the button disabled until the control room's next snapshot reflects it.
    setTimeout(() => { if (state.pending[id] === act) { delete state.pending[id]; render(); } }, 9000);
    poll();
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const id = Number(b.dataset.id);
    const act = b.dataset.act;
    if (act === 'rake') { openSafety(id); return; }
    if (act === 'confirm') { send('confirm', id, state.photos[id] ? { photo: state.photos[id] } : {}); return; }
    send(act, id);
  }

  async function onPhoto(e) {
    const input = e.target.closest('[data-photo]');
    if (!input || !input.files || !input.files[0]) return;
    state.choosing = false;
    const id = Number(input.dataset.photo);
    try {
      state.photos[id] = await shrink(input.files[0]);
    } catch {
      toast('Could not read that photo. Try another one.');
    }
    render();
  }

  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  function openSafety(id) {
    state.safetyTask = id;
    $('#sTitle').textContent = t('safety');
    $('#sList').innerHTML = ['s1', 's2', 's3', 's4'].map((k) => `<label class="chk"><input type="checkbox" class="sc"> <span>${esc(t(k))}</span></label>`).join('');
    $('#sCancel').textContent = t('cancel');
    $('#sGo').textContent = t('start');
    $('#sGo').disabled = true;
    $('#safety').hidden = false;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function setConn(kind) {
    const c = $('#conn');
    c.className = 'conn ' + (kind === 'err' ? 'err' : 'on');
    $('#connText').textContent = kind === 'err' ? t('offline') : Sync.mode === 'local' ? t('local') : t('connected');
  }

  /* ---------- polling ---------- */
  async function poll() {
    if (!state.room) return;
    try {
      const snap = await Sync.getSnap(state.room);
      setConn('ok');
      const key = JSON.stringify(snap.tasks || []) + (snap.clock || '');
      // Clear pending flags whose task has moved on.
      if (state.snap) {
        for (const id of Object.keys(state.pending)) {
          const before = (state.snap.tasks || []).find((x) => x.id === Number(id));
          const after = (snap.tasks || []).find((x) => x.id === Number(id));
          if (!after || !before || after.status !== before.status || after.confirmed !== before.confirmed) delete state.pending[id];
        }
      }
      state.snap = snap;
      if (key !== state.snapKey && !state.choosing && $('#safety').hidden) { state.snapKey = key; render(); }
    } catch {
      setConn('err');
    }
  }

  function bind() {
    $('#crewSel').value = state.crew;
    $('#langSel').value = state.lang;
    $('#crewSel').onchange = (e) => { state.crew = e.target.value; ls.set('ds.crew', state.crew); render(); };
    $('#langSel').onchange = (e) => { state.lang = e.target.value; ls.set('ds.crewLang', state.lang); render(); setConn('ok'); };
    $('#main').addEventListener('click', (e) => {
      if (e.target.closest('label[for^="ph-"]')) { state.choosing = true; setTimeout(() => { state.choosing = false; }, 30000); }
      onClick(e);
    });
    $('#main').addEventListener('change', onPhoto);
    $('#safety').addEventListener('change', () => { $('#sGo').disabled = ![...document.querySelectorAll('#safety .sc')].every((c) => c.checked); });
    $('#sCancel').onclick = () => { $('#safety').hidden = true; render(); };
    $('#sGo').onclick = () => {
      $('#safety').hidden = true;
      send('rake_go', state.safetyTask, { note: 'Safety checklist 4/4 completed on crew phone' });
    };
    Sync.onLocal((m) => { if (m.type === 'snap' && m.room === state.room) poll(); });
  }

  (async () => {
    bind();
    await Sync.detect();
    render();
    poll();
    setInterval(() => { if (!document.hidden) poll(); }, 2000);
  })();
})();
