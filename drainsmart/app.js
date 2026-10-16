/* DrainSmart control room: simulation loop, risk engine, alerts, tasks and UI. */
(() => {
  'use strict';
  const E = window.DrainEngine;
  const NODES = E.NODES;
  const BANK_CM = E.BANK * 100;
  const LAT = 16.58, LON = 82.01;     // Amalapuram, Konaseema (Godavari delta)
  const STEP = 10;                    // sim seconds per physics step
  const READ_EVERY = 300;             // sensor reading interval, sim seconds
  const CREWS = [
    { id: 'A', name: 'Crew A · Ravi & Suresh', travel: 15 },
    { id: 'B', name: 'Crew B · Lakshmi & Imran', travel: 20 },
    { id: 'C', name: 'Panchayat contractor (JCB)', travel: 40 },
  ];
  const RAKE_MIN = 10, MANUAL_MIN = 45;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp01 = E.clamp01;

  /* ---------------- i18n for alerts ---------------- */
  const SEV = {
    en: { crit: 'CRITICAL', high: 'HIGH', watch: 'WATCH' },
    hi: { crit: 'गंभीर', high: 'उच्च', watch: 'निगरानी' },
    te: { crit: 'తీవ్రం', high: 'అధికం', watch: 'పర్యవేక్షణ' },
  };
  const MSG = {
    block: {
      en: 'DrainSmart ALERT [{sev}]: Possible blockage at drain {id} ({name}). Water {up} cm upstream, rising {slope} cm/hr. Rain next 12 h: {rain} mm. Please inspect now. Reply 1 to accept.',
      hi: 'DrainSmart चेतावनी [{sev}]: नाली {id} ({name}) पर रुकावट की आशंका। ऊपरी जल स्तर {up} सेमी, {slope} सेमी/घंटा बढ़ रहा है। अगले 12 घंटों में {rain} मिमी बारिश का अनुमान। कृपया तुरंत जाँच करें। स्वीकार करने के लिए 1 भेजें।',
      te: 'DrainSmart హెచ్చరిక [{sev}]: కాలువ {id} ({name}) వద్ద అడ్డంకి ఉండే అవకాశం ఉంది. ఎగువ నీటి మట్టం {up} సెం.మీ., గంటకు {slope} సెం.మీ. పెరుగుతోంది. రాబోయే 12 గంటల్లో {rain} మి.మీ. వర్షం అంచనా. దయచేసి వెంటనే తనిఖీ చేయండి. అంగీకరించడానికి 1 పంపండి.',
    },
    watch: {
      en: 'Watch: early sign of water backing up at {id} ({name}). Monitoring — no action needed yet.',
      hi: 'निगरानी: {id} ({name}) पर पानी रुकने के शुरुआती संकेत। निगरानी जारी — अभी कार्रवाई की आवश्यकता नहीं।',
      te: 'పర్యవేక్షణ: {id} ({name}) వద్ద నీరు నిలిచే తొలి సంకేతాలు. పర్యవేక్షిస్తున్నాం — ఇప్పుడే చర్య అవసరం లేదు.',
    },
    sensor: {
      en: 'DrainSmart: Sensor at {id} ({name}) may be fouled (readings frozen). Please clean and check.',
      hi: 'DrainSmart: {id} ({name}) का सेंसर गंदा या खराब हो सकता है (रीडिंग रुकी हुई है)। कृपया साफ़ करके जाँचें।',
      te: 'DrainSmart: {id} ({name}) వద్ద సెన్సార్ మురికిగా లేదా పాడై ఉండవచ్చు (రీడింగ్‌లు మారడం లేదు). దయచేసి శుభ్రం చేసి తనిఖీ చేయండి.',
    },
    esc: {
      en: 'DrainSmart ESCALATION: Critical blockage at {id} ({name}) unassigned for {min} min. Panchayat action needed.',
      hi: 'DrainSmart एस्केलेशन: {id} ({name}) पर गंभीर रुकावट {min} मिनट से बिना कार्रवाई के है। पंचायत की कार्रवाई आवश्यक है।',
      te: 'DrainSmart ఎస్కలేషన్: {id} ({name}) వద్ద తీవ్రమైన అడ్డంకి {min} నిమిషాలుగా ఎవరికీ కేటాయించలేదు. పంచాయతీ చర్య అవసరం.',
    },
    ok: {
      en: 'DrainSmart: Drain {id} ({name}) cleared and flow verified by sensors. Thank you.',
      hi: 'DrainSmart: नाली {id} ({name}) साफ़ हो गई है और सेंसर से प्रवाह की पुष्टि हो गई है। धन्यवाद।',
      te: 'DrainSmart: కాలువ {id} ({name}) శుభ్రం చేయబడింది, సెన్సార్ల ద్వారా ప్రవాహం నిర్ధారించబడింది. ధన్యవాదాలు.',
    },
    vfail: {
      en: 'DrainSmart: Clearing at {id} ({name}) not verified — water still backing up. Manual clearing crew needed.',
      hi: 'DrainSmart: {id} ({name}) पर सफ़ाई की पुष्टि नहीं हुई — पानी अब भी रुका हुआ है। हाथ से सफ़ाई करने वाली टीम की आवश्यकता है।',
      te: 'DrainSmart: {id} ({name}) వద్ద శుభ్రత నిర్ధారణ కాలేదు — నీరు ఇంకా నిలిచి ఉంది. చేతితో శుభ్రం చేసే బృందం అవసరం.',
    },
  };
  const VOICE = { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' };

  function alertText(a, lang) {
    const tpl = MSG[a.kind][lang] || MSG[a.kind].en;
    const vars = Object.assign({}, a.vars, { sev: a.sev ? SEV[lang][a.sev] : '' });
    return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  }

  /* ---------------- forecast ---------------- */
  const forecast = { source: 'loading', byHour: new Map() };
  async function loadForecast() {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        '&hourly=precipitation&past_days=1&forecast_days=4&timezone=GMT';
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      j.hourly.time.forEach((tm, k) => {
        forecast.byHour.set(Math.floor(Date.parse(tm + 'Z') / 3.6e6), j.hourly.precipitation[k] || 0);
      });
      forecast.source = 'live';
    } catch (err) {
      forecast.source = 'offline';
    }
    renderWxBadge();
    dirty.live = true;
  }
  function renderWxBadge() {
    const b = $('#wxBadge');
    if (forecast.source === 'live') { b.className = 'badge live'; b.textContent = 'LIVE RAIN FORECAST · Open-Meteo'; }
    else if (forecast.source === 'offline') { b.className = 'badge off'; b.textContent = 'FORECAST OFFLINE · using scenario rain only'; }
    else { b.className = 'badge'; b.textContent = 'Rain forecast: loading…'; }
  }

  /* ---------------- state ---------------- */
  let st;
  const dirty = { live: true, alerts: true, tasks: true, metrics: true };

  function freshState() {
    const model = new E.Model(NODES);
    for (let s = 0; s < 6 * 3600; s += STEP) model.step(STEP, 0); // settle to dry-weather flow
    const start = new Date(); start.setSeconds(0, 0);
    return {
      start: start.getTime(), t: 0, acc: 0,
      speed: st ? st.speed : 10, lang: st ? st.lang : 'en',
      model, twin: model.clone(), shadow: model.clone(),
      dets: NODES.map((n) => new E.Detector(n)),
      frozen: NODES.map(() => null),
      debrisAt: NODES.map(() => null),
      watchSent: NODES.map(() => false),
      snooze: NODES.map(() => 0),
      storms: [],
      risk: NODES.map(() => ({ risk: 0, level: 'ok', bi: 0 })),
      alerts: [], tasks: [], events: [], wl: [],
      selected: 2, nextId: 1, readings: 0, faultReadings: 0,
      rake: null, guided: null,
    };
  }

  const simMs = (t) => st.start + t * 1000;
  const fmtClock = (t) => new Date(simMs(t)).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtTime = (t) => new Date(simMs(t)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const mins = (s) => Math.round(s / 60);

  function forecastRain(t) {
    return forecast.byHour.get(Math.floor(simMs(t) / 3.6e6)) || 0;
  }
  function stormRain(t) {
    let r = 0;
    for (const s of st.storms) if (t >= s.start && t < s.start + s.dur) r += s.mm;
    return r;
  }
  const rainAt = (t) => forecastRain(t) + stormRain(t);
  function rainNext(t, hours) {
    let sum = 0;
    for (let k = 0; k < hours * 6; k++) sum += rainAt(t + k * 600) / 6;
    return sum;
  }

  function logEvent(text) {
    st.events.unshift({ t: st.t, text });
    dirty.metrics = true;
  }

  /* ---------------- simulation tick ---------------- */
  function tick() {
    st.t += STEP;
    const r = rainAt(st.t);
    st.model.step(STEP, r);
    st.twin.step(STEP, r);
    st.shadow.step(STEP, r);
    progressWork();
    if (st.t % READ_EVERY === 0) takeReadings();
    if (st.t % 900 === 0) {
      st.wl.push({ t: st.t, a: st.model.waterloggedAcres(), s: st.shadow.waterloggedAcres(),
        ah: st.model.wlAcreSec / 3600, sh: st.shadow.wlAcreSec / 3600 });
      if (st.wl.length > 400) st.wl.shift();
      dirty.metrics = true;
    }
    guidedTick();
  }

  function takeReadings() {
    const m = st.model;
    NODES.forEach((n, i) => {
      let up = m.level(i) * 100 + E.gauss(0.4);
      if (st.frozen[i] != null) up = st.frozen[i];
      const down = m.level(i + 1) * 100 + E.gauss(0.4);
      const debris = n.camera ? clamp01(m.b[i] + E.gauss(0.04)) : null;
      st.dets[i].push(st.t, up, down, debris, st.twin.level(i) * 100, st.twin.level(i + 1) * 100);
      st.readings++;
      if (st.dets[i].fault) st.faultReadings++;
    });
    E.explainAway(st.dets);
    computeRisk();
    evaluate();
    dirty.live = true;
  }

  function computeRisk() {
    const rain12 = rainNext(st.t, 12);
    const hazard = clamp01(rain12 / 60);
    NODES.forEach((n, i) => {
      const d = st.dets[i];
      const last = d.last();
      const up = last.up;
      const freeboard = clamp01((up - 30) / (BANK_CM - 30));
      const exposure = 0.6 + 0.4 * (n.acres / 30);
      const risk = clamp01(d.bi * (0.35 + 0.45 * hazard + 0.35 * freeboard) * exposure);
      let level = 'ok';
      if (d.fault) level = 'fault';
      else if (risk >= 0.55) level = 'crit';
      else if (risk >= 0.3) level = 'high';
      else if (d.bi >= 0.3) level = 'watch';
      let eta = null;
      if (up >= BANK_CM - 2) eta = 0;
      else if (d.slopeUp > 1) eta = (BANK_CM - up) / d.slopeUp;
      st.risk[i] = { risk, level, hazard, freeboard, exposure, rain12, eta, bi: d.bi, up, down: last.down, twinUp: last.upTwin };
    });
  }

  const activeTask = (i, kind) => st.tasks.find((t) => t.node === i && t.kind === kind && t.status !== 'closed');

  function evaluate() {
    NODES.forEach((n, i) => {
      const r = st.risk[i];
      const d = st.dets[i];
      const vars = { id: n.id, name: n.name, up: Math.round(r.up), slope: Math.max(0, d.slopeUp).toFixed(1), rain: Math.round(r.rain12) };

      if (r.level === 'high' || r.level === 'crit') {
        const task = activeTask(i, 'block');
        if (!task) {
          if (st.t < st.snooze[i] && r.level !== 'crit') return;
          const t = newTask('block', i, r.level);
          const lag = st.debrisAt[i] != null ? mins(st.t - st.debrisAt[i]) : null;
          t.detectLag = lag;
          sendAlert('block', r.level, i, vars, 'Village crew (SMS + voice)');
          logEvent(`${n.id}: blockage detected · BI ${r.bi.toFixed(2)} · risk ${r.risk.toFixed(2)}${lag != null ? ` · ${lag} min after debris arrived` : ''} → task #${t.id}`);
          toast(`${n.id} ${n.name}: ${r.level === 'crit' ? 'CRITICAL' : 'HIGH'} blockage risk. Task #${t.id} created.`, 'crit');
          if (st.guided && st.guided.phase === 'wait-detect' && i === st.guided.node) guidedDetected(t);
        } else if (r.level === 'crit' && task.sev !== 'crit') {
          task.sev = 'crit';
          sendAlert('block', 'crit', i, vars, 'Village crew (SMS + voice)');
          logEvent(`${n.id}: risk upgraded to CRITICAL (rain forecast ${Math.round(r.rain12)} mm / 12 h)`);
          dirty.tasks = true;
        }
      } else if (r.level === 'watch') {
        if (!st.watchSent[i] && !activeTask(i, 'block')) {
          st.watchSent[i] = true;
          sendAlert('watch', 'watch', i, vars, 'Dashboard only');
        }
      } else if (r.level === 'ok' && r.bi < 0.15 && !activeTask(i, 'block')) {
        st.watchSent[i] = false;
      }

      if (d.fault && !activeTask(i, 'sensor')) {
        const t = newTask('sensor', i, 'fault');
        sendAlert('sensor', null, i, vars, 'Maintenance technician (SMS)');
        logEvent(`${n.id}: upstream sensor frozen for 40 min → sensor-service task #${t.id}${n.camera ? ' (camera fallback active)' : ''}`);
      }
    });

    // Escalate critical tasks nobody has accepted within 30 minutes.
    for (const t of st.tasks) {
      if (t.kind === 'block' && t.status === 'open' && t.sev === 'crit' && !t.escalated && st.t - t.created >= 1800) {
        t.escalated = true;
        const n = NODES[t.node];
        sendAlert('esc', 'crit', t.node, { id: n.id, name: n.name, min: mins(st.t - t.created) }, 'Panchayat secretary (SMS + call)');
        logEvent(`Task #${t.id} escalated to panchayat: unassigned ${mins(st.t - t.created)} min`);
        dirty.tasks = true;
      }
    }

    // Close-the-loop verification.
    for (const t of st.tasks) {
      if (t.status !== 'verifying') continue;
      const d = st.dets[t.node];
      const recent = d.buf.slice(-3);
      const clear = recent.length === 3 && recent.every((p) => (p.bi || 0) < 0.25);
      const elapsed = st.t - t.times.cleared;
      t.verifyCount = recent.filter((p) => (p.bi || 0) < 0.25).length;
      const n = NODES[t.node];
      if (clear && elapsed >= 900) {
        t.status = 'closed'; t.outcome = 'verified'; t.times.closed = st.t;
        sendAlert('ok', null, t.node, { id: n.id, name: n.name }, 'Crew + farmers on this drain');
        logEvent(`Task #${t.id} VERIFIED: ${n.id} flow back to normal (BI < 0.25 for 3 readings)`);
        toast(`${n.id} cleared and verified by sensors. Task #${t.id} closed.`, 'good');
        if (st.guided && st.guided.phase === 'wait-verify') guidedVerified();
      } else if (elapsed >= 3600) {
        t.status = 'onsite'; t.confirmed = true; t.failedVerify = true; delete t.times.cleared;
        sendAlert('vfail', 'high', t.node, { id: n.id, name: n.name }, 'Crew + panchayat');
        logEvent(`Task #${t.id} verification FAILED: water still backing up at ${n.id} → reopened for manual clearing`);
        toast(`${n.id}: clearing not verified. Water still backing up. Task reopened.`, 'crit');
      }
      dirty.tasks = true;
    }
  }

  function newTask(kind, i, sev) {
    const t = { id: st.nextId++, kind, node: i, sev, status: 'open', created: st.t, times: { detected: st.t }, crew: null };
    st.tasks.unshift(t);
    dirty.tasks = true;
    return t;
  }

  function sendAlert(kind, sev, i, vars, to) {
    const a = { id: st.nextId++, t: st.t, kind, sev, node: i, vars, to };
    st.alerts.unshift(a);
    if (st.alerts.length > 60) st.alerts.pop();
    dirty.alerts = true;
    if (kind !== 'watch') liveNotify(a);
  }

  /* ---------------- field work in progress ---------------- */
  function progressWork() {
    for (const t of st.tasks) {
      if (t.status === 'assigned' && st.t >= t.arrive) {
        t.status = 'onsite'; t.times.onsite = st.t;
        logEvent(`Task #${t.id}: ${t.crew} on site at ${NODES[t.node].id}`);
        dirty.tasks = true;
        if (guiding()) { setSpeed(0); toast('Crew is on site (paused). Confirm the blockage, then start the supervised rake.', 'guide'); }
      }
      if (t.status === 'clearing' && t.method === 'manual' && st.t >= t.workEnd) {
        st.model.b[t.node] = 0; st.model.bT[t.node] = 0;
        finishClearing(t, 'manual crew removed all debris');
      }
    }
    if (st.rake && !st.rake.stopped) {
      const rk = st.rake;
      const t = st.tasks.find((x) => x.id === rk.task);
      if (st.t >= rk.end) {
        const keep = rk.jam ? 0.75 : 0.08;
        st.model.b[rk.node] *= keep;
        st.model.bT[rk.node] = st.model.b[rk.node];
        st.rake = null;
        finishClearing(t, rk.jam ? 'rake JAMMED: only part of the debris lifted' : 'rake lifted debris onto the bank');
      }
    }
  }

  function finishClearing(t, how) {
    t.status = 'verifying'; t.times.cleared = st.t; t.verifyCount = 0;
    if (guiding()) setSpeed(10);
    logEvent(`Task #${t.id}: clearing finished at ${NODES[t.node].id} (${how}) → watching sensors to verify`);
    dirty.tasks = true;
  }

  /* ---------------- task actions ---------------- */
  function taskAction(id, act, extra, src) {
    const t = st.tasks.find((x) => x.id === id);
    if (!t) return;
    const n = NODES[t.node];
    switch (act) {
      case 'assign': {
        const crew = CREWS.find((c) => c.id === extra) || CREWS[0];
        t.crew = crew.name; t.crewId = crew.id; t.status = 'assigned'; t.times.assigned = st.t; t.arrive = st.t + crew.travel * 60;
        logEvent(`Task #${t.id} accepted by ${crew.name} · ETA ${crew.travel} min${via(src)}`);
        break;
      }
      case 'confirm':
        t.confirmed = true; t.times.inspected = st.t;
        logEvent(`Task #${t.id}: crew confirms blockage at ${n.id}${via(src)}`);
        break;
      case 'false':
        t.status = 'closed'; t.outcome = 'false_alarm'; t.times.closed = st.t;
        st.snooze[t.node] = st.t + 2 * 3600;
        logEvent(`Task #${t.id}: crew found no blockage at ${n.id} → closed as false alarm (node snoozed 2 h unless critical)${via(src)}`);
        break;
      case 'rake':
        openSafety(t);
        return;
      case 'manual':
        t.status = 'clearing'; t.method = 'manual'; t.times.clearStart = st.t; t.workStart = st.t; t.workEnd = st.t + MANUAL_MIN * 60;
        t.failedVerify = false;
        logEvent(`Task #${t.id}: manual clearing started at ${n.id} (~${MANUAL_MIN} min)${via(src)}`);
        break;
      case 'estop':
        if (st.rake && st.rake.task === t.id) {
          st.rake = null;
          t.status = 'onsite'; t.method = null;
          logEvent(`Task #${t.id}: EMERGENCY STOP pressed. Rake halted and locked out at ${n.id}${via(src)}`);
          toast('Emergency stop: rake halted. Choose how to continue.', 'crit');
        }
        break;
      case 'serviced':
        st.frozen[t.node] = null;
        t.status = 'closed'; t.outcome = 'serviced'; t.times.closed = st.t;
        logEvent(`Task #${t.id}: sensor at ${n.id} cleaned and recalibrated${via(src)}`);
        break;
    }
    if (guiding() && (act === 'assign' || act === 'manual')) setSpeed(10);
    dirty.tasks = true; dirty.metrics = true;
    renderTasks();
  }
  const guiding = () => st.guided && st.guided.phase === 'wait-verify';
  const via = (src) => (src === 'crew' ? ' · via crew app' : '');

  let safetyTask = null;
  function openSafety(t) {
    safetyTask = t;
    $('#safetyNode').textContent = `${NODES[t.node].id} · ${NODES[t.node].name}. The rake runs about ${RAKE_MIN} minutes under supervision.`;
    document.querySelectorAll('#safetyModal .sc').forEach((c) => { c.checked = false; });
    $('#safetyGo').disabled = true;
    $('#safetyModal').hidden = false;
  }
  function startRake(src) {
    const t = safetyTask;
    $('#safetyModal').hidden = true;
    if (!t) return;
    t.status = 'clearing'; t.method = 'rake'; t.times.clearStart = st.t; t.workStart = st.t; t.workEnd = st.t + RAKE_MIN * 60;
    t.failedVerify = false;
    st.rake = { task: t.id, node: t.node, end: t.workEnd, jam: $('#scJam').checked };
    logEvent(`Task #${t.id}: safety checklist complete (4/4${src === 'crew' ? ', on crew phone' : ''}) → supervised rake started at ${NODES[t.node].id}`);
    if (guiding()) setSpeed(1);
    dirty.tasks = true;
    renderTasks();
  }

  /* ---------------- scenario controls ---------------- */
  function dropDebris(i, sev) {
    st.model.bT[i] = sev; st.shadow.bT[i] = sev;
    st.debrisAt[i] = st.t;
    logEvent(`[scenario] debris (${Math.round(sev * 100)}% choke) begins collecting at ${NODES[i].id}`);
  }
  function addStorm(mm, inH) {
    st.storms.push({ start: st.t + inH * 3600, dur: 3 * 3600, mm });
    logEvent(`[scenario] storm added to forecast: ${mm} mm/h for 3 h starting ${fmtTime(st.t + inH * 3600)}`);
    computeRisk();
    dirty.live = true;
  }
  function foulSensor(i) {
    st.frozen[i] = Math.round(st.model.level(i) * 100 * 10) / 10;
    logEvent(`[scenario] upstream sensor at ${NODES[i].id} fouled (reading stuck at ${st.frozen[i]} cm)`);
  }

  /* ---------------- guided demo ---------------- */
  function startGuided() {
    resetSim();
    setSpeed(10);
    st.guided = { phase: 'calm', node: 2, t0: st.t };
    document.querySelector('.tab[data-tab="dashboard"]').click();
    $('#scNode').value = '2';
    toast('Guided demo: a normal evening in the pilot village. All 6 drain nodes are green.', 'guide');
  }
  function guidedTick() {
    const g = st.guided;
    if (!g) return;
    if (g.phase === 'calm' && st.t - g.t0 >= 20 * 60) {
      dropDebris(g.node, 0.8);
      g.phase = 'storm';
      toast('A mat of water hyacinth and plastic is lodging at the D3 canal-road crossing. No one has noticed yet.', 'guide');
    } else if (g.phase === 'storm' && st.t - g.t0 >= 25 * 60) {
      addStorm(25, 3);
      g.phase = 'wait-detect';
      toast('The forecast now shows heavy rain (25 mm/h) arriving in about 3 hours.', 'guide');
    }
  }
  function guidedDetected(t) {
    st.guided.phase = 'wait-verify';
    setSpeed(0);
    toast(`DrainSmart flagged D3 ${t.detectLag != null ? t.detectLag + ' min' : ''} after debris started collecting, about 3 hours before the rain. Paused: open Tasks and assign a crew.`, 'guide');
  }
  function guidedVerified() {
    st.guided.phase = 'done';
    toast('Loop closed: sensors confirm flow is back. Switch to 30× and watch the storm pass, then open Impact to compare with the "no action" estimate.', 'guide');
  }

  /* ---------------- rendering ---------------- */
  const LVL_COLOR = { ok: 'var(--ok)', watch: 'var(--watch)', high: 'var(--high)', crit: 'var(--crit)', fault: 'var(--fault)' };
  const LVL_LABEL = { ok: 'Normal', watch: 'Watch', high: 'High', crit: 'Critical', fault: 'Sensor fault' };

  function renderKpis() {
    const open = st.tasks.filter((t) => t.status !== 'closed').length;
    const rain12 = rainNext(st.t, 12);
    const healthy = st.dets.filter((d) => !d.fault).length;
    const wet = st.model.waterloggedAcres();
    const worst = st.risk.map((r, i) => ({ r, i })).sort((a, b) => b.r.risk - a.r.risk)[0];
    const nowRain = rainAt(st.t);
    $('#kpis').innerHTML = `
      <div class="kpi ${open ? 'alert' : ''}"><div class="k">Open tasks</div><div class="v">${open}</div><div class="s">${st.tasks.filter((t) => t.status === 'closed').length} closed</div></div>
      <div class="kpi"><div class="k">Rain now · next 12 h</div><div class="v">${nowRain.toFixed(1)} <small style="font-size:13px">mm/h</small></div><div class="s">${Math.round(rain12)} mm expected</div></div>
      <div class="kpi ${worst.r.level === 'crit' || worst.r.level === 'high' ? 'alert' : ''}"><div class="k">Highest risk</div><div class="v lvl-${worst.r.level}">${NODES[worst.i].id} · ${Math.round(worst.r.risk * 100)}</div><div class="s">${LVL_LABEL[worst.r.level]} · ${NODES[worst.i].name}</div></div>
      <div class="kpi ${wet ? 'alert' : 'good'}"><div class="k">Fields waterlogged</div><div class="v">${wet} <small style="font-size:13px">acres</small></div><div class="s">of 131 acres monitored</div></div>
      <div class="kpi ${healthy < 6 ? 'alert' : 'good'}"><div class="k">Sensor health</div><div class="v">${healthy}/6</div><div class="s">${healthy < 6 ? 'service needed' : 'all reporting'}</div></div>`;
    const pill = $('#taskCount');
    pill.textContent = open; pill.className = 'pill' + (open ? '' : ' zero');
  }

  const NX = [150, 290, 440, 590, 730, 870];
  const NY = [150, 140, 158, 144, 160, 150];

  function waterColor(frac) {
    if (frac >= 0.97) return '#1b3f8a';
    if (frac >= 0.7) return '#2456a6';
    if (frac >= 0.45) return '#3b82c4';
    return '#7fb3e0';
  }

  function renderMap() {
    const m = st.model;
    const rainNow = rainAt(st.t);
    let s = `<svg viewBox="0 0 1000 300" role="img" aria-label="Drain network schematic">
      <defs><linearGradient id="riv" x1="0" x2="1"><stop offset="0" stop-color="#7fb3e0"/><stop offset="1" stop-color="#3b82c4"/></linearGradient></defs>
      <rect x="0" y="0" width="1000" height="300" fill="#fbfcfa"/>`;
    // fields
    for (let i = 0; i < NODES.length; i++) {
      const x0 = (i === 0 ? 30 : NX[i - 1]) + 8, x1 = NX[i] - 8;
      const depth = m.fieldDepth(i);
      const wet = clamp01(depth / 0.15);
      const fill = depth > E.WATERLOG_DEPTH ? `rgba(59,130,196,${0.25 + 0.55 * wet})` : '#e6efd9';
      const stroke = depth > E.WATERLOG_DEPTH ? '#3b82c4' : '#cfdcc0';
      s += `<rect x="${x0}" y="22" width="${x1 - x0}" height="92" rx="6" fill="${fill}" stroke="${stroke}"/>`;
      s += `<rect x="${x0}" y="190" width="${x1 - x0}" height="92" rx="6" fill="${fill}" stroke="${stroke}"/>`;
      // paddy rows
      for (let y = 34; y < 110; y += 14) s += `<line x1="${x0 + 8}" y1="${y}" x2="${x1 - 8}" y2="${y}" stroke="#b9cf9f" stroke-width="1" stroke-dasharray="3 5" opacity=".7"/>`;
      s += `<text x="${(x0 + x1) / 2}" y="40" text-anchor="middle" font-size="12" font-weight="600" fill="#3f5a3a">Block ${NODES[i].id}</text>`;
      s += `<text x="${(x0 + x1) / 2}" y="56" text-anchor="middle" font-size="11" fill="#6b7f66">${NODES[i].acres} acres</text>`;
      if (depth > E.WATERLOG_DEPTH) s += `<text x="${(x0 + x1) / 2}" y="270" text-anchor="middle" font-size="11.5" font-weight="700" fill="#173f78">⚠ ${Math.round(depth * 100)} cm flood</text>`;
    }
    // river and head
    s += `<rect x="950" y="0" width="50" height="300" fill="url(#riv)"/><text x="975" y="150" text-anchor="middle" font-size="11" fill="#fff" font-weight="700" transform="rotate(90 975 150)">RIVER OUTFALL</text>`;
    s += `<text x="30" y="178" font-size="11" fill="#4b5a51">Canal inflow →</text>`;
    // channel segments
    for (let i = 0; i < NODES.length; i++) {
      const xa = i === 0 ? 30 : NX[i - 1], ya = i === 0 ? 150 : NY[i - 1];
      const xb = NX[i], yb = NY[i];
      const lvl = m.level(i);
      const frac = lvl / E.BANK;
      const w = 6 + 16 * clamp01(frac);
      s += `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#d9e3ea" stroke-width="26" stroke-linecap="round"/>`;
      s += `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="${waterColor(frac)}" stroke-width="${w}" stroke-linecap="round"/>`;
      s += `<line class="flow" x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="6 14"/>`;
      if (frac >= 0.97) s += `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="#d23b3b" stroke-width="30" stroke-opacity=".18" stroke-linecap="round"/>`;
      s += `<text x="${(xa + xb) / 2}" y="${(ya + yb) / 2 - 20}" text-anchor="middle" font-size="11" font-weight="600" fill="${frac >= 0.97 ? '#b42323' : '#2c5d8f'}">${Math.round(lvl * 100)} cm</text>`;
    }
    s += `<line x1="${NX[5]}" y1="${NY[5]}" x2="950" y2="150" stroke="#7fb3e0" stroke-width="10" stroke-linecap="round"/>`;
    // nodes
    NODES.forEach((n, i) => {
      const r = st.risk[i];
      const col = LVL_COLOR[r.level];
      const sel = st.selected === i;
      if (r.level === 'crit') s += `<circle class="pulse" cx="${NX[i]}" cy="${NY[i]}" r="16" fill="${col}"/>`;
      s += `<g class="node-hit" data-node="${i}">
        <circle cx="${NX[i]}" cy="${NY[i]}" r="${sel ? 18 : 15}" fill="#fff" stroke="${sel ? '#17231c' : col}" stroke-width="${sel ? 3 : 2}"/>
        <circle cx="${NX[i]}" cy="${NY[i]}" r="10" fill="${col}"/>
        <text x="${NX[i]}" y="${NY[i] + 4}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff">${n.id}</text>
        <rect x="${NX[i] - 62}" y="${NY[i] + 22}" width="124" height="22" rx="6" fill="#fff" stroke="#e1e6e1"/>
        <text x="${NX[i]}" y="${NY[i] + 37}" text-anchor="middle" font-size="10.5" fill="#17231c">${n.name}${n.camera ? ' 📷' : ''}${n.rake ? ' ⚙' : ''}</text>
      </g>`;
      if (st.rake && st.rake.node === i) s += `<text x="${NX[i]}" y="${NY[i] - 24}" text-anchor="middle" font-size="11" font-weight="700" fill="#1f7a55">⚙ raking…</text>`;
    });
    if (rainNow > 0.3) {
      const op = Math.min(0.6, 0.15 + rainNow / 50);
      let lines = '';
      for (let k = 0; k < 70; k++) {
        const x = (k * 137) % 960, y = (k * 71) % 290;
        lines += `<line x1="${x}" y1="${y}" x2="${x - 6}" y2="${y + 14}"/>`;
      }
      s += `<g stroke="#3b6fa8" stroke-width="1.2" opacity="${op}">${lines}</g>`;
      s += `<text x="12" y="290" font-size="11.5" font-weight="700" fill="#2c5d8f">🌧 ${rainNow.toFixed(1)} mm/h</text>`;
    }
    s += '</svg>';
    $('#netMap').innerHTML = s;
  }

  function renderRain() {
    const W = 520, H = 170, pad = 26, n = 24;
    const hour0 = Math.floor(simMs(st.t) / 3.6e6);
    const bars = [];
    for (let k = 0; k < n; k++) {
      const tk = (hour0 + k) * 3600 - st.start / 1000;
      let f = 0, sm = 0;
      for (let q = 0; q < 6; q++) { f += forecastRain(tk + q * 600) / 6; sm += stormRain(tk + q * 600) / 6; }
      bars.push({ f, sm, h: hour0 + k });
    }
    const max = Math.max(10, ...bars.map((b) => b.f + b.sm)) * 1.1;
    const bw = (W - pad - 6) / n;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
    [0, 0.5, 1].forEach((g) => {
      const y = H - 20 - g * (H - 34);
      s += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#eef1ee"/><text x="${pad - 4}" y="${y + 4}" font-size="10" text-anchor="end" fill="#7a877f">${Math.round(g * max)}</text>`;
    });
    bars.forEach((b, k) => {
      const x = pad + 3 + k * bw;
      const hf = (b.f / max) * (H - 34), hs = (b.sm / max) * (H - 34);
      const y0 = H - 20;
      if (hf > 0) s += `<rect x="${x}" y="${y0 - hf}" width="${bw - 3}" height="${hf}" fill="#7fb3e0" rx="2"/>`;
      if (hs > 0) s += `<rect x="${x}" y="${y0 - hf - hs}" width="${bw - 3}" height="${hs}" fill="#5b4bb5" rx="2"/>`;
      if (k % 3 === 0) {
        const d = new Date(b.h * 3.6e6);
        s += `<text x="${x + bw / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#7a877f">${String(d.getHours()).padStart(2, '0')}:00</text>`;
      }
    });
    s += `<text x="${W - 4}" y="12" font-size="10" text-anchor="end" fill="#7a877f"><tspan fill="#7fb3e0">■</tspan> forecast  <tspan fill="#5b4bb5">■</tspan> scenario storm · mm/h</text></svg>`;
    $('#rainChart').innerHTML = s;
    $('#rainSum').textContent = `${Math.round(rainNext(st.t, 12))} mm in next 12 h · ${Math.round(rainNext(st.t, 24))} mm in 24 h`;
  }

  function renderNode() {
    const i = st.selected, n = NODES[i], r = st.risk[i], d = st.dets[i];
    $('#nodeTitle').textContent = `${n.id} · ${n.name}`;
    $('#nodeCaps').textContent = [n.camera ? 'camera' : null, n.rake ? 'supervised rake' : 'manual clearing', `${n.acres} ac`].filter(Boolean).join(' · ');
    const etaTxt = r.eta == null ? '—' : r.eta === 0 ? 'overflowing' : r.eta > 24 ? '> 24 h' : `${r.eta.toFixed(1)} h`;
    const buf = d.buf.slice(-72);
    const W = 520, H = 150, pad = 28;
    const sx = (k) => pad + (k / Math.max(1, buf.length - 1)) * (W - pad - 6);
    const sy = (v) => H - 16 - (Math.min(130, Math.max(0, v)) / 130) * (H - 26);
    const line = (key, color, dash) => buf.length < 2 ? '' :
      `<polyline fill="none" stroke="${color}" stroke-width="2" ${dash ? 'stroke-dasharray="4 4"' : ''} points="${buf.map((p, k) => `${sx(k).toFixed(1)},${sy(p[key]).toFixed(1)}`).join(' ')}"/>`;
    let chart = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
    [0, 40, 80, 120].forEach((v) => { chart += `<line x1="${pad}" x2="${W}" y1="${sy(v)}" y2="${sy(v)}" stroke="#eef1ee"/><text x="${pad - 4}" y="${sy(v) + 4}" font-size="10" text-anchor="end" fill="#7a877f">${v}</text>`; });
    chart += `<line x1="${pad}" x2="${W}" y1="${sy(BANK_CM)}" y2="${sy(BANK_CM)}" stroke="#d23b3b" stroke-dasharray="5 4"/><text x="${W - 4}" y="${sy(BANK_CM) - 4}" font-size="10" text-anchor="end" fill="#d23b3b">bank 120 cm</text>`;
    chart += line('upTwin', '#9aa5a0', true) + line('down', '#5fb3a5') + line('up', '#1f4f9c');
    chart += `<text x="${pad + 4}" y="12" font-size="10" fill="#7a877f"><tspan fill="#1f4f9c">━</tspan> upstream  <tspan fill="#5fb3a5">━</tspan> downstream  <tspan fill="#9aa5a0">┅</tspan> twin (clear-drain prediction) · cm · last ${Math.round(buf.length * 5 / 60)} h</text></svg>`;

    let why;
    if (d.fault) why = `<b>Sensor fault:</b> the upstream reading has not moved for 40 min (stuck at ${r.up.toFixed(1)} cm). Level data is excluded; ${n.camera ? 'the camera estimate is used instead.' : 'this node is blind until serviced.'}`;
    else if (d.echoOf) why = `<b>Explained away:</b> a mild rise here is water released from the upstream blockage at ${d.echoOf}. No separate alert.`;
    else {
      const parts = [];
      parts.push(`water is <b>${Math.max(0, r.up - r.twinUp).toFixed(0)} cm above</b> what a clear drain would show`);
      if (d.div > 3) parts.push(`upstream residual rising <b>${d.div.toFixed(1)} cm/h</b> faster than downstream`);
      if (d.parts.camera != null) parts.push(`camera sees <b>${Math.round(d.parts.camera * 100)}%</b> of the screen covered`);
      why = `<b>Why BI = ${r.bi.toFixed(2)}:</b> ${parts.join('; ')}.<br><b>Risk ${Math.round(r.risk * 100)}</b> = BI × (rain ${Math.round(r.rain12)} mm/12 h, water at ${Math.round(r.freeboard * 100)}% of bank height) × ${n.acres} acres exposed.`;
    }
    $('#nodeDetail').innerHTML = `
      <div class="nd-grid">
        <div><div class="k">Upstream</div><div class="v">${r.up.toFixed(0)} cm</div></div>
        <div><div class="k">Downstream</div><div class="v">${r.down.toFixed(0)} cm</div></div>
        <div><div class="k">Twin predicts</div><div class="v">${(r.twinUp || 0).toFixed(0)} cm</div></div>
        <div><div class="k">Blockage index</div><div class="v lvl-${r.level}">${r.bi.toFixed(2)}</div></div>
        <div><div class="k">Risk score</div><div class="v lvl-${r.level}">${Math.round(r.risk * 100)} · ${LVL_LABEL[r.level]}</div></div>
        <div><div class="k">Bank overflow in</div><div class="v">${etaTxt}</div></div>
      </div>
      ${chart}
      <div class="why">${why}</div>
      ${n.camera ? `<div class="cam"><canvas id="camCanvas" width="132" height="74"></canvas><div>Trash-screen camera · simulated still<br><span class="muted">Debris cover ${d.parts.camera != null ? Math.round(d.parts.camera * 100) : 0}% (on-device estimate)</span></div></div>` : ''}`;
    if (n.camera) drawCam(i, d.parts.camera || 0);
  }

  function drawCam(i, cover) {
    const c = document.getElementById('camCanvas');
    if (!c) return;
    const g = c.getContext('2d');
    g.fillStyle = '#5b6b5e'; g.fillRect(0, 0, 132, 74);
    g.fillStyle = '#4b7fa8'; g.fillRect(0, 30, 132, 44);
    g.strokeStyle = '#2a2f2c'; g.lineWidth = 3;
    for (let x = 8; x < 132; x += 12) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x, 74); g.stroke(); }
    let seed = 7 + i * 31;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const count = Math.round(cover * 46);
    for (let k = 0; k < count; k++) {
      const x = rnd() * 132, y = 30 + rnd() * 40;
      g.fillStyle = ['#4f7d3a', '#6f9a3c', '#8a6b3a', '#d9d4c7', '#3d6b8f'][Math.floor(rnd() * 5)];
      g.beginPath(); g.ellipse(x, y, 5 + rnd() * 7, 3 + rnd() * 4, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, 132, 14);
    g.fillStyle = '#fff'; g.font = '9px monospace';
    g.fillText(`CAM ${NODES[i].id} ${fmtTime(st.t)}`, 4, 10);
  }

  function renderPriority() {
    const order = st.risk.map((r, i) => ({ r, i })).sort((a, b) => b.r.risk - a.r.risk || b.r.bi - a.r.bi);
    $('#priority').innerHTML = order.map(({ r, i }, k) => {
      const n = NODES[i];
      const tsk = activeTask(i, 'block');
      const sub = r.level === 'fault' ? 'sensor fault: using camera' :
        tsk ? `task #${tsk.id} · ${statusLabel(tsk)}` :
        `${Math.round(r.up)} cm · BI ${r.bi.toFixed(2)}`;
      return `<div class="prio ${st.selected === i ? 'sel' : ''}" data-node="${i}">
        <div class="rank">${k + 1}</div>
        <div class="nm"><b>${n.id} · ${n.name}</b><span>${sub}</span></div>
        <div class="riskbar"><div class="bar"><i style="width:${Math.max(3, r.risk * 100)}%;background:${LVL_COLOR[r.level]}"></i></div>
        <div class="lbl lvl-${r.level}">${Math.round(r.risk * 100)} · ${LVL_LABEL[r.level]}</div></div>
      </div>`;
    }).join('');
  }

  function renderAlerts() {
    const lang = st.lang;
    $('#alertLangNote').textContent = { en: 'English', hi: 'Hindi', te: 'Telugu' }[lang];
    if (!st.alerts.length) { $('#alerts').innerHTML = '<div class="empty">No alerts yet. Drop debris or run the guided demo.</div>'; return; }
    $('#alerts').innerHTML = st.alerts.slice(0, 30).map((a) => {
      const cls = a.kind === 'esc' ? 'esc' : a.kind === 'ok' ? 'ok' : a.kind === 'sensor' ? 'fault' : (a.sev || 'watch');
      const channel = a.to === 'Dashboard only' ? '🖥' : '📱';
      return `<div class="alert ${cls}">
        <div class="meta"><span>${channel} ${esc(a.to)}</span><span>${fmtTime(a.t)} <button class="speak" data-speak="${a.id}" title="Play voice alert">🔊</button></span></div>
        <div class="msg">${esc(alertText(a, lang))}</div></div>`;
    }).join('');
  }

  function statusLabel(t) {
    switch (t.status) {
      case 'open': return 'awaiting crew';
      case 'assigned': return 'crew en route';
      case 'onsite': return t.kind === 'sensor' ? 'technician on site' : t.confirmed ? 'blockage confirmed' : 'inspecting';
      case 'clearing': return t.method === 'rake' ? 'rake running' : 'manual clearing';
      case 'verifying': return 'verifying flow';
      case 'closed': return { verified: 'verified ✓', false_alarm: 'false alarm', serviced: 'serviced ✓' }[t.outcome] || 'closed';
    }
    return t.status;
  }

  function renderTasks() {
    const cols = [
      { key: 'open', title: 'New' },
      { key: 'assigned', title: 'Crew en route' },
      { key: 'onsite', title: 'On site', also: ['clearing'] },
      { key: 'verifying', title: 'Verifying' },
      { key: 'closed', title: 'Closed' },
    ];
    $('#taskBoard').innerHTML = cols.map((c) => {
      const list = st.tasks.filter((t) => t.status === c.key || (c.also || []).includes(t.status));
      return `<div class="col"><h3>${c.title}<span>${list.length}</span></h3>${list.map(taskCard).join('') || '<div class="empty">—</div>'}</div>`;
    }).join('');
  }

  function taskCard(t) {
    const n = NODES[t.node];
    const cls = t.status === 'closed' ? 'done' : t.sev;
    const title = t.kind === 'sensor' ? 'Sensor service' : 'Drain blockage';
    let body = '', acts = '';
    if (t.status === 'open') {
      acts = `<select data-crew="${t.id}">${CREWS.map((c) => `<option value="${c.id}">${c.name} · ${c.travel} min</option>`).join('')}</select>
        <button class="btn small primary" data-act="assign" data-id="${t.id}">Assign</button>`;
      if (t.escalated) body += '<div class="warn">Escalated to panchayat</div>';
    } else if (t.status === 'assigned') {
      body = `${esc(t.crew)}<br>Arrives ${fmtTime(t.arrive)}`;
    } else if (t.status === 'onsite') {
      body = esc(t.crew || '');
      if (t.kind === 'sensor') acts = `<button class="btn small primary" data-act="serviced" data-id="${t.id}">Sensor cleaned</button>`;
      else if (!t.confirmed) acts = `<button class="btn small primary" data-act="confirm" data-id="${t.id}">Confirm blockage</button>
        <button class="btn small" data-act="false" data-id="${t.id}">No blockage found</button>`;
      else {
        if (t.failedVerify) body += '<div class="warn">Verification failed: water still backing up</div>';
        if (n.rake && !t.failedVerify) acts += `<button class="btn small primary" data-act="rake" data-id="${t.id}">Start supervised rake</button>`;
        acts += `<button class="btn small ${n.rake && !t.failedVerify ? '' : 'primary'}" data-act="manual" data-id="${t.id}">Manual clearing (${MANUAL_MIN} min)</button>`;
      }
    } else if (t.status === 'clearing') {
      body = t.method === 'rake' ? 'Supervised rake running' : `${esc(t.crew || 'Crew')} clearing by hand`;
      body += `<div class="progress"><i data-prog="${t.id}" style="width:0%"></i></div>`;
      if (t.method === 'rake') acts = `<button class="btn small danger" data-act="estop" data-id="${t.id}">■ EMERGENCY STOP</button>`;
    } else if (t.status === 'verifying') {
      body = `Watching sensors: ${t.verifyCount || 0}/3 clear readings<br><span class="muted">closes automatically when flow is normal</span>`;
    } else if (t.status === 'closed') {
      const total = t.times.closed - t.times.detected;
      body = `${statusLabel(t)} · ${mins(total)} min end-to-end`;
    }
    return `<div class="task ${cls}">
      <div class="t1"><span>#${t.id} ${title}</span><span>${n.id}</span></div>
      <div class="t2">${n.name} · ${t.kind === 'sensor' ? 'sensor fault' : (t.sev === 'crit' ? 'CRITICAL' : 'HIGH')} · ${fmtTime(t.created)}${t.detectLag != null ? ` · found ${t.detectLag} min after debris` : ''}</div>
      <div>${body}</div>
      ${t.photos && t.photos.length ? `<div class="tphotos">${t.photos.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Photo from crew at ${n.id}"></a>`).join('')}</div>` : ''}
      ${acts ? `<div class="acts">${acts}</div>` : ''}
    </div>`;
  }

  function updateProgress() {
    for (const t of st.tasks) {
      if (t.status !== 'clearing') continue;
      const el = document.querySelector(`[data-prog="${t.id}"]`);
      if (el) el.style.width = `${clamp01((st.t - t.workStart) / (t.workEnd - t.workStart)) * 100}%`;
    }
  }

  function renderMetrics() {
    const closed = st.tasks.filter((t) => t.kind === 'block' && t.status === 'closed');
    const verified = closed.filter((t) => t.outcome === 'verified');
    const falseA = closed.filter((t) => t.outcome === 'false_alarm').length;
    const ah = st.model.wlAcreSec / 3600, sh = st.shadow.wlAcreSec / 3600;
    const lags = st.tasks.filter((t) => t.detectLag != null).map((t) => t.detectLag);
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const uptime = st.readings ? (1 - st.faultReadings / st.readings) * 100 : 100;
    $('#impactKpis').innerHTML = `
      <div class="kpi good"><div class="k">Waterlogging avoided</div><div class="v">${Math.max(0, sh - ah).toFixed(0)} <small style="font-size:13px">acre-h</small></div><div class="s">${ah.toFixed(0)} with DrainSmart vs ${sh.toFixed(0)} with no action</div></div>
      <div class="kpi"><div class="k">Detection time after debris</div><div class="v">${lags.length ? Math.round(avg(lags)) + ' min' : '—'}</div><div class="s">${lags.length} blockage${lags.length === 1 ? '' : 's'} detected</div></div>
      <div class="kpi"><div class="k">Blockages verified clear</div><div class="v">${verified.length}</div><div class="s">${falseA} false alarm${falseA === 1 ? '' : 's'} reported by crews</div></div>
      <div class="kpi"><div class="k">Sensor uptime</div><div class="v">${uptime.toFixed(1)}%</div><div class="s">${st.readings} readings</div></div>`;

    // waterlogging chart (cumulative acre-hours)
    const pts = st.wl;
    const W = 560, H = 190, pad = 34;
    const maxY = Math.max(10, ...pts.map((p) => p.sh)) * 1.1;
    const tmax = Math.max(3600, pts.length ? pts[pts.length - 1].t : 1);
    const t0 = pts.length ? pts[0].t : 0;
    const sx = (t) => pad + ((t - t0) / Math.max(1, tmax - t0)) * (W - pad - 8);
    const sy = (v) => H - 22 - (v / maxY) * (H - 36);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%">`;
    [0, 0.5, 1].forEach((g) => { s += `<line x1="${pad}" x2="${W}" y1="${sy(g * maxY)}" y2="${sy(g * maxY)}" stroke="#eef1ee"/><text x="${pad - 4}" y="${sy(g * maxY) + 4}" font-size="10" text-anchor="end" fill="#7a877f">${Math.round(g * maxY)}</text>`; });
    if (pts.length > 1) {
      s += `<polyline fill="none" stroke="#d23b3b" stroke-width="2.2" stroke-dasharray="6 4" points="${pts.map((p) => `${sx(p.t).toFixed(1)},${sy(p.sh).toFixed(1)}`).join(' ')}"/>`;
      s += `<polyline fill="none" stroke="#1f7a55" stroke-width="2.6" points="${pts.map((p) => `${sx(p.t).toFixed(1)},${sy(p.ah).toFixed(1)}`).join(' ')}"/>`;
      s += `<text x="${pad}" y="${H - 6}" font-size="10" fill="#7a877f">${fmtTime(t0)}</text><text x="${W - 8}" y="${H - 6}" font-size="10" text-anchor="end" fill="#7a877f">${fmtTime(tmax)}</text>`;
    } else {
      s += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="#7a877f">Data appears after 15 sim-minutes</text>`;
    }
    s += `<text x="${pad + 4}" y="12" font-size="10.5" fill="#7a877f"><tspan fill="#1f7a55">━</tspan> with DrainSmart   <tspan fill="#d23b3b">┅</tspan> no action (shadow model) · cumulative acre-hours waterlogged</text></svg>`;
    $('#wlChart').innerHTML = s;

    const stage = (a, b) => {
      const v = closed.filter((t) => t.times[a] != null && t.times[b] != null).map((t) => (t.times[b] - t.times[a]) / 60);
      return v.length ? avg(v).toFixed(0) : '—';
    };
    $('#respTable').innerHTML = `<table class="resp">
      <tr><th>Stage</th><th style="text-align:right">Avg min</th></tr>
      <tr><td>Detected → crew accepted</td><td class="n">${stage('detected', 'assigned')}</td></tr>
      <tr><td>Accepted → on site</td><td class="n">${stage('assigned', 'onsite')}</td></tr>
      <tr><td>On site → cleared</td><td class="n">${stage('onsite', 'cleared')}</td></tr>
      <tr><td>Cleared → verified by sensors</td><td class="n">${stage('cleared', 'closed')}</td></tr>
      <tr><td><b>Detected → verified (end-to-end)</b></td><td class="n"><b>${stage('detected', 'closed')}</b></td></tr>
    </table>
    <p class="muted small">These match the problem statement's validation metrics: detection accuracy, time to inspect and clear, waterlogging duration, uptime.</p>`;

    $('#eventLog').innerHTML = st.events.slice(0, 200).map((e) => `<div><span>${fmtClock(e.t)}</span>${esc(e.text)}</div>`).join('') || '<div class="empty">No events yet.</div>';
  }

  /* ---------------- farm log ---------------- */
  const LOG_KEY = 'drainsmart.farmlog';
  function readLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } }
  function writeLog(v) { try { localStorage.setItem(LOG_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } }

  function renderFarm() {
    const rain12 = rainNext(st.t, 12), rain24 = rainNext(st.t, 24);
    $('#advisories').innerHTML = NODES.map((n, i) => {
      const r = st.risk[i];
      const depth = st.model.fieldDepth(i);
      if (depth > E.WATERLOG_DEPTH) {
        return `<div class="adv bad"><b>Block ${n.id} · ${n.crop} · waterlogged (${Math.round(depth * 100)} cm extra water)</b>
          Open the field outlets once drain ${n.id} is verified clear. Hold fertiliser for 48 h, since it will be lost to runoff. Check for lodging and stem rot.</div>`;
      }
      if (r.level === 'crit' || r.level === 'high') {
        const t = activeTask(i, 'block');
        return `<div class="adv warn"><b>Block ${n.id} · ${n.crop} · drain ${n.id} at ${LVL_LABEL[r.level].toLowerCase()} risk</b>
          ${t ? `Crew task #${t.id}: ${statusLabel(t)}.` : 'Crew alerted.'} Keep your field outlet ready to open, and don't irrigate.</div>`;
      }
      if (rain12 > 20) {
        return `<div class="adv warn"><b>Block ${n.id} · ${n.crop}</b>
          Heavy rain is expected (${Math.round(rain12)} mm in 12 h). Skip irrigation, and postpone fertiliser and pesticide spraying because rain will wash them off.</div>`;
      }
      return `<div class="adv"><b>Block ${n.id} · ${n.crop}</b>
        ${rain24 > 8 ? `About ${Math.round(rain24)} mm of rain is expected in 24 h, so you can delay irrigation.` : 'Irrigate on schedule. Keep about 5 cm of standing water.'}</div>`;
    }).join('');

    const sel = $('#lfField');
    if (!sel.options.length) sel.innerHTML = NODES.map((n) => `<option>Block ${n.id} · ${n.crop}</option>`).join('');
    const log = readLog();
    $('#logList').innerHTML = log.length ? log.slice().reverse().map((e) => `<div><b>${esc(e.op)}</b> · ${esc(e.field)}<br><span class="muted">${esc(e.when)} · ${esc(e.note || '')}</span></div>`).join('') : '<div class="empty">No entries yet. Records stay on this device.</div>';
  }

  /* ---------------- toasts & voice ---------------- */
  let quiet = false;
  function toast(text, kind) {
    if (quiet) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'guide' ? 11000 : 6000);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  }
  function speak(alert) {
    if (!('speechSynthesis' in window)) { toast('Voice playback is not supported in this browser.'); return; }
    const u = new SpeechSynthesisUtterance(alertText(alert, st.lang));
    u.lang = VOICE[st.lang];
    const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(st.lang));
    if (v) u.voice = v;
    else if (st.lang !== 'en') toast(`No ${st.lang === 'hi' ? 'Hindi' : 'Telugu'} voice is installed on this computer. Using the default voice. In the field this goes out as an IVR call.`);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  /* ---------------- controls ---------------- */
  function setSpeed(v) {
    st.speed = v;
    document.querySelectorAll('.speed button').forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === v));
  }
  function resetSim() {
    st = freshState();
    setSpeed(st.speed);
    for (let k = 0; k < 180; k++) tick(); // 30 sim-minutes so detectors have history
    Object.keys(dirty).forEach((k) => { dirty[k] = true; });
    renderTasks();
  }

  function bind() {
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + b.dataset.tab));
      if (b.dataset.tab === 'tasks') renderTasks();
      if (b.dataset.tab === 'metrics') renderMetrics();
      if (b.dataset.tab === 'farm') renderFarm();
    }));
    document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));
    $('#langSel').addEventListener('change', (e) => { st.lang = e.target.value; dirty.alerts = true; });

    const pick = (e) => {
      const el = e.target.closest('[data-node]');
      if (!el) return;
      st.selected = Number(el.dataset.node);
      $('#scNode').value = String(st.selected);
      dirty.live = true;
    };
    $('#netMap').addEventListener('pointerdown', pick);
    $('#priority').addEventListener('pointerdown', pick);

    $('#alerts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-speak]');
      if (!b) return;
      const a = st.alerts.find((x) => x.id === Number(b.dataset.speak));
      if (a) speak(a);
    });

    $('#taskBoard').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const id = Number(b.dataset.id);
      const crewSel = document.querySelector(`[data-crew="${id}"]`);
      taskAction(id, b.dataset.act, crewSel ? crewSel.value : null);
    });

    $('#scNode').innerHTML = NODES.map((n, i) => `<option value="${i}">${n.id} · ${n.name}</option>`).join('');
    $('#scNode').value = '2';
    $('#scSev').addEventListener('input', (e) => { $('#scSevVal').textContent = Math.round(e.target.value * 100) + '%'; });
    $('#btnDebris').addEventListener('click', () => {
      const i = Number($('#scNode').value);
      dropDebris(i, Number($('#scSev').value));
      toast(`Debris starts collecting at ${NODES[i].id}. Watch the upstream level climb.`);
    });
    $('#btnFoul').addEventListener('click', () => {
      const i = Number($('#scNode').value);
      foulSensor(i);
      toast(`Upstream sensor at ${NODES[i].id} is now stuck. DrainSmart should flag it within about 40 sim-minutes.`);
    });
    $('#btnStorm').addEventListener('click', () => {
      const mm = Number($('#scStorm').value);
      if (!mm) return;
      addStorm(mm, Number($('#scStormIn').value));
      toast(`Storm added: ${mm} mm/h for 3 h, starting in ${$('#scStormIn').value} h.`);
    });
    $('#btnReset').addEventListener('click', () => { resetSim(); toast('Simulation reset.'); });
    $('#btnGuided').addEventListener('click', startGuided);

    $('#safetyModal').addEventListener('change', () => {
      $('#safetyGo').disabled = ![...document.querySelectorAll('#safetyModal .sc')].every((c) => c.checked);
    });
    $('#safetyCancel').addEventListener('click', () => { $('#safetyModal').hidden = true; });
    $('#safetyGo').addEventListener('click', () => startRake());

    $('#logForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const log = readLog();
      log.push({ field: $('#lfField').value, op: $('#lfOp').value, note: $('#lfNote').value.trim(), when: fmtClock(st.t) });
      writeLog(log);
      $('#lfNote').value = '';
      renderFarm();
    });
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now(), lastRender = 0;
  function frame() {
    const now = performance.now();
    const dt = Math.min(1.5, (now - last) / 1000);
    last = now;
    if (st.speed > 0) {
      st.acc += dt * st.speed * 60;
      while (st.acc >= STEP) { tick(); st.acc -= STEP; }
    }
    $('#simClock').textContent = fmtClock(st.t);
    if (now - lastRender > 120) {
      lastRender = now;
      if (dirty.live) {
        dirty.live = false;
        renderKpis(); renderMap(); renderRain(); renderNode(); renderPriority();
        if ($('#view-farm').classList.contains('active')) renderFarm();
      }
      if (dirty.alerts) { dirty.alerts = false; renderAlerts(); }
      if (dirty.tasks) { dirty.tasks = false; pubDirty = true; renderTasks(); renderPriority(); }
      if (dirty.metrics && $('#view-metrics').classList.contains('active')) { dirty.metrics = false; renderMetrics(); }
      updateProgress();
    }
  }

  /* ---------------- crew app link + live WhatsApp/SMS alerts ---------------- */
  const Sync = window.DrainSync;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
  const ROOM = (() => {
    let r = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (r.length < 4) r = lsGet('ds.room', '');
    if (r.length < 4) r = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    lsSet('ds.room', r);
    return r;
  })();
  const crewUrl = (taskId) => new URL(`crew.html?room=${ROOM}${taskId ? '&task=' + taskId : ''}`, location.href).href;
  const live = {
    enabled: lsGet('ds.liveOn', '0') === '1',
    pin: lsGet('ds.livePin', ''),
    to: lsGet('ds.liveTo', ''),
    last: 0,
  };
  let pubDirty = true, lastPub = 0, actSeq = 0, crewReady = false;

  function snapshot() {
    const tasks = st.tasks
      .filter((t) => t.status !== 'closed' || st.t - (t.times.closed || 0) < 6 * 3600)
      .slice(0, 15)
      .map((t) => {
        const n = NODES[t.node], r = st.risk[t.node];
        return {
          id: t.id, kind: t.kind, sev: t.sev, status: t.status, crewId: t.crewId || null, crew: t.crew || null,
          confirmed: !!t.confirmed, failedVerify: !!t.failedVerify, method: t.method || null,
          progress: t.status === 'clearing' ? clamp01((st.t - t.workStart) / (t.workEnd - t.workStart)) : 0,
          arrive: t.arrive ? fmtTime(t.arrive) : null, verifyCount: t.verifyCount || 0, created: fmtTime(t.created),
          outcome: t.outcome || null, up: r.up, rain12: r.rain12,
          node: { i: t.node, id: n.id, name: n.name, acres: n.acres, crop: n.crop, rake: n.rake, lat: n.lat, lon: n.lon },
        };
      });
    return { v: 1, room: ROOM, clock: fmtClock(st.t), lang: st.lang, tasks };
  }

  async function publishLoop() {
    if (!crewReady) return;
    const now = Date.now();
    if (now - lastPub < 1200 || (!pubDirty && now - lastPub < 5000)) return;
    pubDirty = false; lastPub = now;
    try { await Sync.publish(ROOM, snapshot()); setCrewMode(true); } catch { setCrewMode(false); }
  }

  async function pollCrew() {
    if (!crewReady) return;
    try {
      const acts = await Sync.getActions(ROOM, actSeq);
      for (const a of acts) { actSeq = Math.max(actSeq, a.seq); applyCrewAction(a); }
      setCrewMode(true);
    } catch { setCrewMode(false); }
  }

  function applyCrewAction(a) {
    const t = st.tasks.find((x) => x.id === a.task);
    if (!t) return;
    const n = NODES[t.node];
    const crewId = CREWS.some((c) => c.id === a.crew) ? a.crew : 'A';
    const crewName = CREWS.find((c) => c.id === crewId).name;
    if (a.photo) {
      const url = Sync.photoUrl(ROOM, a);
      if (url) { t.photos = (t.photos || []).concat(url); logEvent(`Task #${t.id}: 📷 photo received from ${crewName}`); }
    }
    switch (a.act) {
      case 'accept':
        if (t.status === 'open') { taskAction(t.id, 'assign', crewId, 'crew'); toast(`${crewName} accepted task #${t.id} on their phone.`, 'good'); }
        break;
      case 'arrive':
        if (t.status === 'assigned') {
          t.status = 'onsite'; t.times.onsite = st.t;
          logEvent(`Task #${t.id}: ${t.crew} on site at ${n.id} · via crew app`);
          dirty.tasks = true;
        }
        break;
      case 'confirm':
        if (t.status === 'onsite' && !t.confirmed) taskAction(t.id, 'confirm', null, 'crew');
        break;
      case 'false':
        if (t.status === 'onsite') taskAction(t.id, 'false', null, 'crew');
        break;
      case 'manual':
        if (t.status === 'onsite' && t.confirmed) taskAction(t.id, 'manual', null, 'crew');
        break;
      case 'rake_go':
        if (t.status === 'onsite' && t.confirmed && n.rake && !t.failedVerify) { safetyTask = t; startRake('crew'); }
        break;
      case 'estop':
        taskAction(t.id, 'estop', null, 'crew');
        break;
      case 'done':
        if (t.status === 'clearing' && t.method === 'manual') { t.workEnd = st.t; logEvent(`Task #${t.id}: crew reports clearing finished · via crew app`); }
        break;
      case 'serviced':
        if (t.kind === 'sensor' && t.status === 'onsite') taskAction(t.id, 'serviced', null, 'crew');
        break;
    }
    dirty.tasks = true; pubDirty = true;
  }

  function setCrewMode(ok) {
    const b = $('#crewMode');
    if (!b) return;
    if (!ok) { b.className = 'badge off'; b.textContent = 'SYNC ERROR'; return; }
    b.className = 'badge ' + (Sync.mode === 'remote' ? 'live' : '');
    b.textContent = Sync.mode === 'remote' ? 'ONLINE · any phone' : 'SAME-DEVICE · rehearsal';
  }

  const SHORT = {
    block: (v, a) => `DrainSmart ${SEV.en[a.sev] || ''}: possible blockage at ${v.id} ${v.name}. Rain ${v.rain}mm/12h. Inspect now.`,
    esc: (v) => `DrainSmart ESCALATION: blockage at ${v.id} ${v.name} unassigned ${v.min} min.`,
    ok: (v) => `DrainSmart: ${v.id} ${v.name} cleared and verified by sensors.`,
    vfail: (v) => `DrainSmart: clearing at ${v.id} not verified. Manual crew needed.`,
    sensor: (v) => `DrainSmart: sensor at ${v.id} ${v.name} may be fouled. Please check.`,
  };

  async function sendLive(a, test) {
    const task = activeTask(a.node, a.kind === 'sensor' ? 'sensor' : 'block');
    const text = alertText(a, st.lang) + `\n\n${test ? 'Crew app' : 'Open task'}: ${crewUrl(task && task.id)}`;
    const short = SHORT[a.kind] ? SHORT[a.kind](a.vars, a) : text;
    const to = live.to.split(',').map((s) => s.trim()).filter(Boolean);
    setLiveStatus('Sending…');
    const res = await Sync.notify({ pin: live.pin, text: (test ? '[TEST] ' : '') + text, short: (test ? '[TEST] ' : '') + short, to });
    if (res.ok) {
      const okN = (res.results || []).filter((r) => r.ok).length;
      const bad = (res.results || []).filter((r) => !r.ok);
      setLiveStatus(`Sent to ${okN} phone${okN === 1 ? '' : 's'} at ${fmtTime(st.t)}${res.results && res.results[0] && res.results[0].mock ? ' (mock)' : ''}.${bad.length ? ' Failed: ' + bad.map((r) => `${r.to} (${r.error})`).join('; ') : ''}`);
      logEvent(`Live alert sent by WhatsApp/SMS to ${okN} phone${okN === 1 ? '' : 's'}${test ? ' (test)' : ''}`);
    } else {
      setLiveStatus('Not sent: ' + (res.error || (res.results || []).map((r) => r.error).join('; ')));
    }
  }

  function liveNotify(a) {
    if (quiet || !live.enabled || Sync.mode !== 'remote') return;
    const now = Date.now();
    if (now - live.last < 10000 && a.kind !== 'esc') return; // at fast sim speeds, don't flood phones
    live.last = now;
    sendLive(a, false);
  }

  function setLiveStatus(s) { const el = $('#liveStatus'); if (el) el.textContent = s; }

  async function initCrew() {
    $('#roomCode').textContent = ROOM;
    const link = crewUrl();
    $('#crewLink').href = link;
    $('#crewLink').title = link;
    if (window.QRCode) {
      try { new window.QRCode($('#crewQr'), { text: link, width: 112, height: 112, correctLevel: window.QRCode.CorrectLevel.M }); } catch { $('#crewQr').hidden = true; }
    } else $('#crewQr').hidden = true;
    $('#liveOn').checked = live.enabled;
    $('#livePin').value = live.pin;
    $('#liveTo').value = live.to;
    $('#liveOn').addEventListener('change', (e) => { live.enabled = e.target.checked; lsSet('ds.liveOn', live.enabled ? '1' : '0'); });
    $('#livePin').addEventListener('input', (e) => { live.pin = e.target.value; lsSet('ds.livePin', live.pin); });
    $('#liveTo').addEventListener('input', (e) => { live.to = e.target.value; lsSet('ds.liveTo', live.to); });
    $('#liveTest').addEventListener('click', () => {
      const n = NODES[2];
      sendLive({ kind: 'block', sev: 'high', node: 2, vars: { id: n.id, name: n.name, up: 45, slope: '12.0', rain: 78 } }, true);
    });

    await Sync.detect();
    if (Sync.mode === 'remote') {
      const h = Sync.health;
      setLiveStatus(h.whatsapp || h.sms
        ? `Server ready: ${[h.whatsapp ? 'WhatsApp' : '', h.sms ? 'SMS' : ''].filter(Boolean).join(' + ')} · ${h.recipients} saved recipient${h.recipients === 1 ? '' : 's'}${h.mock ? ' · MOCK mode' : ''}.`
        : 'Twilio is not configured on the server yet. See README → Live alerts.');
    } else {
      setLiveStatus('Live alerts need the hosted (Netlify) version. Here, open the crew app in another tab to rehearse.');
    }
    // Ignore actions left over from an earlier session in this room.
    try { const old = await Sync.getActions(ROOM, 0); actSeq = old.reduce((m, a) => Math.max(m, a.seq), 0); } catch { /* first use */ }
    crewReady = true;
    setCrewMode(true);
    Sync.onLocal((m) => { if (m.type === 'action' && m.room === ROOM) pollCrew(); });
    setInterval(pollCrew, 2000);
    setInterval(publishLoop, 600);
  }

  /* ---------------- jump-to scenes (?scene=…) ----------------
   * Backup for live pitches and for screenshots: fast-forwards the simulation
   * straight to a key moment of the D3 story. */
  function runUntil(cond, maxSec) {
    const end = st.t + maxSec;
    while (st.t < end && !cond()) tick();
  }
  function showTab(name) { document.querySelector(`.tab[data-tab="${name}"]`).click(); }
  function runScene(name) {
    const blk = () => activeTask(2, 'block');
    st.selected = 2;
    runUntil(() => false, 20 * 60);
    dropDebris(2, 0.8);
    runUntil(() => false, 5 * 60);
    addStorm(25, name === 'flood' ? 1 : 3);
    runUntil(() => !!blk(), 4 * 3600);
    if (name === 'alert') { setSpeed(0); return; }
    if (name === 'flood') { runUntil(() => false, 3.5 * 3600); setSpeed(0); return; }
    const t = blk();
    taskAction(t.id, 'assign', 'A');
    runUntil(() => t.status === 'onsite', 3600);
    taskAction(t.id, 'confirm');
    if (name === 'tasks') { setSpeed(0); showTab('tasks'); return; }
    safetyTask = t;
    document.querySelectorAll('#safetyModal .sc').forEach((c) => { c.checked = true; });
    startRake();
    runUntil(() => t.status === 'closed', 3 * 3600);
    runUntil(() => false, 10 * 3600);
    setSpeed(0);
    showTab(name === 'impact' ? 'metrics' : 'dashboard');
  }

  st = freshState();
  bind();
  resetSim();
  renderWxBadge();
  initCrew();
  const scene = new URLSearchParams(location.search).get('scene');
  if (scene) loadForecast().then(() => { quiet = true; runScene(scene); quiet = false; Object.keys(dirty).forEach((k) => { dirty[k] = true; }); });
  else loadForecast();
  setInterval(frame, 50); // a timer keeps the simulation running even when the tab is in the background
})();
