# DrainSmart: hosting, crew app and live alerts

```
drainsmart/              the web app (control room index.html + crew app crew.html)
netlify/functions/api.mjs  backend: room sync, crew actions, photos, WhatsApp/SMS
netlify.toml, package.json Netlify config
.env                     LOCAL mock settings only (never put real keys here)
```

## Two ways to run

| | Command | Crew app | Live alerts |
|---|---|---|---|
| Rehearsal (offline) | `python -m http.server 8765 --directory drainsmart` | Another tab in the same browser | No |
| Full local backend | `npx netlify dev --port 8888 --offline` | Another tab (mock alerts) | Mock only |
| **Hosted** | Netlify (below) | **Any phone, anywhere** | **Yes** |

## 1 · Put it online (Netlify, free)

1. Create a free account at netlify.com.
2. In this folder, run `npx netlify login`. It opens your browser for you to approve.
3. Then deploy:
   ```
   npx netlify deploy --prod --create-site drainsmart-<yourteam>
   ```
   You get a link like `https://drainsmart-<yourteam>.netlify.app`. That's your prototype link for the deck.
4. Redeploy after any change with `npx netlify deploy --prod`.

## 2 · Crew app on phones

- The control room shows a **room code** and a **QR code** in the "Crew app" card. Scan it with any phone to open the crew app for that room.
- The crew picks their crew name and language (Telugu, Hindi, English). They can then accept tasks, mark arrival, add a photo, confirm the blockage, run the supervised rake (after the safety checklist on the phone) or clear by hand, and press the emergency stop.
- Every phone action appears in the control room's event log marked "via crew app". Photos show on the task card.

## 3 · Live WhatsApp / SMS alerts (Twilio)

WhatsApp is the main channel: it carries the full Telugu or Hindi message plus a link to the crew app, and delivers reliably in India. SMS is a short English backup.

**Twilio setup (about 15 minutes, free trial):**
1. Sign up at twilio.com. Copy the **Account SID** and **Auth Token** from the Console home page.
2. **WhatsApp sandbox:** Console → Messaging → Try it out → Send a WhatsApp message. On each phone that should receive alerts, send the shown `join <two-words>` message to the sandbox number. Each phone must rejoin every 3 days.
3. *(Optional SMS)* Get a trial phone number, verify each recipient under Verified Caller IDs, and enable India under Messaging → Geo permissions. On trial accounts, carriers may filter SMS to Indian numbers and long messages are rejected, which is why SMS is kept short.

**Netlify environment variables** (Site configuration → Environment variables), then redeploy:

| Variable | Example |
|---|---|
| `TWILIO_ACCOUNT_SID` | `AC…` |
| `TWILIO_AUTH_TOKEN` | (secret) |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` (the sandbox number shown in Twilio) |
| `TWILIO_SMS_FROM` | `+1…` your Twilio number (optional) |
| `ALERT_TO` | `whatsapp:+9198XXXXXXXX,whatsapp:+9197XXXXXXXX` |
| `DEMO_PIN` | any PIN, for example `4821` |

**In the control room:** open "Live WhatsApp / SMS alerts", tick **Send real alerts**, enter the PIN, then press **Send test alert**. Alerts then go out automatically when a task is raised, escalated, fails verification or is verified. To avoid flooding phones at high sim speeds, at most one alert goes out per 10 seconds.

The PIN stops strangers who find your public link from sending messages. Twilio trial accounts can only send to numbers that have joined the sandbox or been verified.
