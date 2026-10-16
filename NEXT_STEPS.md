# DrainSmart: where we stopped (14 Oct 2026)

## Done
- **Prototype** (`drainsmart/`): control room with a simulated drain, digital-twin detection, risk ranking, alerts in 3 languages, tasks, verification, impact tab, guided demo, `?scene=` backup links. Tested.
- **Crew phone app** (`drainsmart/crew.html`): Telugu, Hindi and English; accept, navigate, arrive, photo, confirm, rake with safety checklist, manual clearing, emergency stop. Tested.
- **Backend** (`netlify/functions/api.mjs`): room sync, crew actions, photos, WhatsApp/SMS through Twilio, PIN-protected. Tested locally in mock mode.
- **Pitch deck** (14 slides): https://claude.ai/artifact/QLHSuMs4P2vbGM2v6yyt2j
- **Report**: https://claude.ai/artifact/Gxbn3QJR22ohZHTbG5ALjo
- Screenshots used in the deck and report are in `shots/`.

## Still to do
1. **Netlify:** create an account → run `npx netlify login` in this folder → ask Claude to deploy (`npx netlify deploy --prod --create-site drainsmart-<team>`).
2. **Twilio:** sign up → WhatsApp sandbox → each phone sends `join …` → add the env vars in Netlify (see README.md) → redeploy → "Send test alert" from the control room.
3. Put the live link into the deck's closing slide and the report.
4. Fill in placeholders: team name, institution, contact, subscription price `[₹__]`.
5. Add a local case (a farmer or panchayat interview, or district data) to the problem slide and report section 2.
6. Check hardware prices with a local supplier.
7. Rehearse the guided demo with a phone twice.
8. Share the deck and report from each page's Share menu before sending the links.

## How to run
- Rehearsal (offline): `python -m http.server 8765 --directory drainsmart` → http://localhost:8765
- Full local backend (mock alerts): `npx netlify dev --port 8888 --offline` → http://localhost:8888
- If `node_modules` is missing, run `npm install` first.
