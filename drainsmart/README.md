# DrainSmart: prototype

A closed-loop service for blocked field drains: **detect → prioritise → alert → clear → verify**.
Agriculture Innovation Challenge, Problem Statement 4.

## Run it

You need no build step and no install. Serve the folder and open it in a browser:

```
python -m http.server 8765 --directory drainsmart
```

Then open http://localhost:8765. Opening `index.html` directly also works, but the live rain forecast needs internet either way.

## Demo script (about 3 minutes)

1. Click **▶ Run guided demo**. Debris starts collecting at D3, and the forecast shows a heavy storm in 3 hours.
2. About 20 sim-minutes after the debris arrives, D3 turns High, then Critical. A task and an SMS alert are created, and the sim **pauses**.
3. Open **Tasks** → **Assign** Crew A. When the crew is on site the sim pauses again → **Confirm blockage** → **Start supervised rake**. Tick the 4-point safety checklist; an emergency stop is available while the rake runs.
4. The task closes itself only once the sensors confirm water is flowing normally again.
5. Switch to **30×** and let the storm pass. Then open **Impact** to compare *with DrainSmart* against *no action*: roughly 200 acre-hours of waterlogging avoided.
6. Switch the language to Hindi or Telugu to show the regional alerts. 🔊 plays a voice alert.

**With phones (hosted version):** before step 1, have a judge scan the QR code in the "Crew app" card, and have their phone join your WhatsApp sandbox. In step 2 their phone receives the Telugu WhatsApp alert. In step 3 they accept, take a photo and run the rake from the phone instead of the Tasks tab. Setup steps are in the project's top-level README.

**Failure cases to show:** **Foul sensor** (the stuck reading is flagged and the node falls back to its camera). Tick **Rake jams** before raking: verification fails and the task reopens for a manual crew.

**Backup links** (each jumps straight to one moment, in case the live demo misbehaves):
`?scene=alert`, `?scene=flood` (no action taken), `?scene=tasks`, `?scene=verified`, `?scene=impact`

## What is real and what is simulated

| Real | Simulated |
|---|---|
| Live rainfall forecast (Open-Meteo, Amalapuram) | Water-level and camera readings (hydraulic model of a 6-node drain) |
| Digital-twin blockage detection, risk ranking | Crew travel and clearing times |
| Alerts in 3 languages, escalation, tasks, verification, audit log | |

## Files

- `engine.js`: drain hydraulics model, digital twin, blockage detector, explain-away logic (also runs in Node)
- `app.js`: simulation loop, risk engine, alerts, task workflow, UI
- `index.html`, `styles.css`: the dashboard
- `crew.html`, `crew.js`: the crew phone app (Telugu / Hindi / English)
- `sync.js`: connects the control room and phones (Netlify backend, or same-browser tabs for offline rehearsal)

## Field hardware (pilot plan, ~₹3,500 per node)

ESP32 + 2× waterproof ultrasonic sensors (JSN-SR04T), optional ESP32-CAM, 6 V solar + 18650 battery, IP65 box, and a GSM module (SIM800L) where Wi-Fi is unavailable.
