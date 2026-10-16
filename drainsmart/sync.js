/*
 * DrainSync: how the control room and crew phones talk.
 *
 * Hosted (Netlify): the /api function relays snapshots, crew actions, photos
 * and WhatsApp/SMS alerts, so phones anywhere can join with the room code.
 * Local (python http.server, file://): falls back to localStorage plus a
 * BroadcastChannel, so the crew app works in another tab of the same browser
 * for rehearsing without internet.
 */
(function (global) {
  'use strict';
  const bc = 'BroadcastChannel' in global ? new BroadcastChannel('drainsmart') : null;
  const listeners = [];
  if (bc) bc.onmessage = (e) => listeners.forEach((fn) => fn(e.data));

  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

  const S = {
    mode: null,
    health: null,

    async detect() {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (j && j.ok) { S.mode = 'remote'; S.health = j; return S.mode; }
        }
      } catch { /* not hosted */ }
      S.mode = 'local';
      return S.mode;
    },

    onLocal(fn) { listeners.push(fn); },

    async publish(room, snap) {
      if (S.mode === 'remote') {
        await fetch(`/api/room?room=${room}`, { method: 'PUT', body: JSON.stringify(snap) });
      } else {
        lsSet(`ds.snap.${room}`, Object.assign({}, snap, { updated: Date.now() }));
        if (bc) bc.postMessage({ type: 'snap', room });
      }
    },

    async getSnap(room) {
      if (S.mode === 'remote') {
        const r = await fetch(`/api/room?room=${room}`, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }
      return lsGet(`ds.snap.${room}`, { tasks: [], updated: 0 });
    },

    async postAction(room, a) {
      if (S.mode === 'remote') {
        const r = await fetch(`/api/actions?room=${room}`, { method: 'POST', body: JSON.stringify(a) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
        return j;
      }
      const list = lsGet(`ds.actions.${room}`, []);
      const seq = (list.length ? list[list.length - 1].seq : 0) + 1;
      const entry = { seq, at: Date.now(), act: a.act, task: a.task, crew: a.crew, note: a.note || '', photo: a.photo ? 'local' + seq : null, photoData: a.photo || null };
      list.push(entry);
      if (!lsSet(`ds.actions.${room}`, list.slice(-60))) {
        entry.photoData = null; // storage full: keep the action, drop the photo
        lsSet(`ds.actions.${room}`, list.slice(-60));
      }
      if (bc) bc.postMessage({ type: 'action', room });
      return { ok: true, seq };
    },

    async getActions(room, since) {
      if (S.mode === 'remote') {
        const r = await fetch(`/api/actions?room=${room}&since=${since}`, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return (await r.json()).actions;
      }
      return lsGet(`ds.actions.${room}`, []).filter((x) => x.seq > since);
    },

    photoUrl(room, action) {
      if (!action.photo) return null;
      if (S.mode === 'remote') return `/api/photo?room=${room}&id=${action.photo}`;
      return action.photoData || null;
    },

    async notify(payload) {
      if (S.mode !== 'remote') return { ok: false, error: 'Live WhatsApp/SMS alerts work only on the hosted (Netlify) version.' };
      const r = await fetch('/api/notify', { method: 'POST', body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j.error || 'HTTP ' + r.status };
      return j;
    },
  };

  global.DrainSync = S;
})(window);
