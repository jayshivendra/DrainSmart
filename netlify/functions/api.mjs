/*
 * DrainSmart backend (one Netlify Function, routed on /api/*).
 *
 *   GET  /api/health                   which channels are configured
 *   GET  /api/room?room=ABCDE          task snapshot published by the control room
 *   PUT  /api/room?room=ABCDE          control room publishes its snapshot
 *   GET  /api/actions?room=&since=N    crew actions after sequence N
 *   POST /api/actions?room=            crew phone submits an action (optional photo)
 *   GET  /api/photo?room=&id=          a crew photo
 *   POST /api/notify                   send WhatsApp / SMS alert (needs DEMO_PIN)
 *
 * Environment variables (set in Netlify → Site configuration → Environment variables):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM   e.g. whatsapp:+14155238886 (sandbox number)
 *   TWILIO_SMS_FROM        your Twilio phone number, e.g. +1XXXXXXXXXX (optional)
 *   ALERT_TO               comma list, e.g. whatsapp:+9198XXXXXXXX,+9198XXXXXXXX
 *   DEMO_PIN               PIN the control-room operator types to enable live alerts
 *   TWILIO_MOCK=1          pretend to send (for testing without an account)
 */
import { getStore } from '@netlify/blobs';

const ROOM_RE = /^[A-Z0-9]{4,8}$/;
const MAX_PHOTO = 400 * 1024;
const MAX_ACTIONS = 300;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const env = (k) => (typeof Netlify !== 'undefined' ? Netlify.env.get(k) : process.env[k]) || '';
const store = () => getStore({ name: 'drainsmart', consistency: 'strong' });

function roomOf(url) {
  const r = (url.searchParams.get('room') || '').toUpperCase();
  return ROOM_RE.test(r) ? r : null;
}

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  try {
    if (route === 'health') return health();
    if (route === 'notify' && req.method === 'POST') return notify(req);
    const room = roomOf(url);
    if (!room) return json({ error: 'Missing or invalid room code' }, 400);
    if (route === 'room') return req.method === 'PUT' ? putRoom(req, room) : getRoom(room);
    if (route === 'actions') return req.method === 'POST' ? postAction(req, room) : getActions(url, room);
    if (route === 'photo') return getPhoto(url, room);
    return json({ error: 'Not found' }, 404);
  } catch (err) {
    return json({ error: String(err && err.message || err) }, 500);
  }
};

export const config = { path: '/api/*' };

function health() {
  const twilio = !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN')) || env('TWILIO_MOCK') === '1';
  return json({
    ok: true,
    whatsapp: twilio && !!env('TWILIO_WHATSAPP_FROM'),
    sms: twilio && !!env('TWILIO_SMS_FROM'),
    pinRequired: !!env('DEMO_PIN'),
    recipients: env('ALERT_TO').split(',').filter(Boolean).length,
    mock: env('TWILIO_MOCK') === '1',
  });
}

/* ---------- room snapshot ---------- */
async function getRoom(room) {
  const snap = await store().get(`room/${room}/state`, { type: 'json' });
  return json(snap || { tasks: [], updated: 0 });
}
async function putRoom(req, room) {
  const body = await req.text();
  if (body.length > 200 * 1024) return json({ error: 'Snapshot too large' }, 413);
  const snap = JSON.parse(body);
  snap.updated = Date.now();
  await store().setJSON(`room/${room}/state`, snap);
  return json({ ok: true });
}

/* ---------- crew actions ---------- */
async function getActions(url, room) {
  const since = Number(url.searchParams.get('since') || 0);
  const list = (await store().get(`room/${room}/actions`, { type: 'json' })) || [];
  return json({ actions: list.filter((a) => a.seq > since) });
}
async function postAction(req, room) {
  const a = await req.json();
  const allowed = ['accept', 'arrive', 'confirm', 'false', 'manual', 'rake_go', 'estop', 'done', 'serviced', 'ping'];
  if (!allowed.includes(a.act)) return json({ error: 'Unknown action' }, 400);
  const s = store();
  let photoId = null;
  if (a.photo) {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(a.photo);
    if (!m) return json({ error: 'Photo must be a JPEG, PNG or WebP data URL' }, 400);
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_PHOTO) return json({ error: 'Photo too large (max 400 KB after resizing)' }, 413);
    photoId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await s.set(`room/${room}/photo/${photoId}`, bytes, { metadata: { type: `image/${m[1]}` } });
  }
  const list = (await s.get(`room/${room}/actions`, { type: 'json' })) || [];
  const seq = (list.length ? list[list.length - 1].seq : 0) + 1;
  const entry = {
    seq, at: Date.now(), act: a.act,
    task: Number(a.task) || null,
    crew: String(a.crew || '').slice(0, 60),
    note: String(a.note || '').slice(0, 280),
    photo: photoId,
  };
  list.push(entry);
  await s.setJSON(`room/${room}/actions`, list.slice(-MAX_ACTIONS));
  return json({ ok: true, seq, photo: photoId });
}
async function getPhoto(url, room) {
  const id = (url.searchParams.get('id') || '').replace(/[^a-z0-9]/g, '');
  const res = await store().getWithMetadata(`room/${room}/photo/${id}`, { type: 'arrayBuffer' });
  if (!res) return json({ error: 'Photo not found' }, 404);
  return new Response(res.data, { headers: { 'content-type': res.metadata.type || 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
}

/* ---------- WhatsApp / SMS via Twilio ---------- */
async function notify(req) {
  const b = await req.json();
  const pin = env('DEMO_PIN');
  // Application errors return 200 + ok:false: Netlify can treat a 4xx from a function as "not found" and fall through to static files.
  if (!pin) return json({ ok: false, error: 'Live alerts are disabled: DEMO_PIN is not set on the server' });
  if (String(b.pin || '') !== pin) return json({ ok: false, error: 'Wrong PIN' });

  const extra = Array.isArray(b.to) ? b.to : [];
  const list = [...env('ALERT_TO').split(','), ...extra]
    .map((s) => String(s).trim()).filter(Boolean)
    .filter((s) => /^(whatsapp:)?\+\d{8,15}$/.test(s));
  const recipients = [...new Set(list)].slice(0, 6);
  if (!recipients.length) return json({ ok: false, error: 'No valid recipients (set ALERT_TO or add numbers in the control room)' });

  const full = String(b.text || '').slice(0, 1200);
  const short = String(b.short || full).slice(0, 150);
  const results = [];
  for (const to of recipients) {
    const wa = to.startsWith('whatsapp:');
    const from = wa ? env('TWILIO_WHATSAPP_FROM') : env('TWILIO_SMS_FROM');
    if (!from) { results.push({ to: mask(to), ok: false, error: wa ? 'TWILIO_WHATSAPP_FROM not set' : 'TWILIO_SMS_FROM not set' }); continue; }
    results.push(await sendTwilio(to, from, wa ? full : short));
  }
  return json({ ok: results.some((r) => r.ok), results });
}

async function sendTwilio(to, from, body) {
  if (env('TWILIO_MOCK') === '1') return { to: mask(to), ok: true, sid: 'SM_mock_' + Date.now(), mock: true };
  const sid = env('TWILIO_ACCOUNT_SID'), token = env('TWILIO_AUTH_TOKEN');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { to: mask(to), ok: false, error: `${data.code || res.status}: ${data.message || 'Twilio error'}` };
  return { to: mask(to), ok: true, sid: data.sid };
}

function mask(n) { return n.replace(/\d(?=\d{3})/g, '•'); }
