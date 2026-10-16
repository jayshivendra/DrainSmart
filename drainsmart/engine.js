/*
 * DrainSmart engine: drain-network hydraulics simulator + blockage detector.
 *
 * The simulator stands in for field hardware during the prototype. It models a
 * village drain as a chain of channel segments separated by monitored nodes
 * (culverts / crossings / trash screens). Each node has an upstream and a
 * downstream water-level sensor. A blockage at a node chokes the flow through
 * it, so water rises upstream while the downstream level stays flat or drops —
 * the signature the detector looks for.
 *
 * Works in the browser (window.DrainEngine) and in Node (module.exports).
 */
(function (global) {
  'use strict';

  const SEG_AREA = 2000;   // m² water surface per segment (≈400 m × 5 m)
  const BANK = 1.2;        // m, bank height before spilling into fields
  const RIVER = 0.10;      // m, outfall level
  const BASEFLOW = 0.3;    // m³/s dry-weather inflow at the head
  const RUNOFF = 0.6;      // runoff coefficient for wet paddy land
  const CATCH = 1.5;       // catchment = field area × this
  const ACRE = 4047;       // m²
  const WATERLOG_DEPTH = 0.03; // m extra ponding (above normal paddy water) that counts as waterlogged

  const NODES = [
    // lat/lon are illustrative points near Amalapuram for the crew app's "Navigate" link.
    { id: 'D1', name: 'Head sluice',          acres: 22, camera: false, rake: false, crop: 'Paddy · tillering',          lat: 16.5862, lon: 81.9968 },
    { id: 'D2', name: 'Temple culvert',       acres: 18, camera: true,  rake: false, crop: 'Paddy · tillering',          lat: 16.5848, lon: 82.0011 },
    { id: 'D3', name: 'Canal-road crossing',  acres: 30, camera: true,  rake: true,  crop: 'Paddy · panicle initiation', lat: 16.5831, lon: 82.0057 },
    { id: 'D4', name: 'School outfall',       acres: 15, camera: false, rake: false, crop: 'Vegetables',                 lat: 16.5817, lon: 82.0102 },
    { id: 'D5', name: 'Block-B inlet',        acres: 26, camera: true,  rake: false, crop: 'Paddy · panicle initiation', lat: 16.5799, lon: 82.0146 },
    { id: 'D6', name: 'River outfall',        acres: 20, camera: false, rake: true,  crop: 'Paddy · tillering',          lat: 16.5786, lon: 82.0190 },
  ];

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const conductance = (i) => 1.45 * (1 + 0.35 * i); // channel widens downstream

  class Model {
    constructor(nodes) {
      this.nodes = nodes;
      this.n = nodes.length;
      this.S = nodes.map(() => 0.3 * SEG_AREA); // storage per segment, m³
      this.b = nodes.map(() => 0);              // blockage fraction at node
      this.bT = nodes.map(() => 0);             // blockage the debris is building toward
      this.field = nodes.map(() => 0);          // ponded volume in adjacent field, m³
      this.wlAcreSec = 0;                       // cumulative waterlogged acre-seconds
      this.spilled = 0;                         // cumulative m³ spilled to fields
    }

    clone() {
      const m = new Model(this.nodes);
      m.S = this.S.slice(); m.b = this.b.slice(); m.bT = this.bT.slice();
      m.field = this.field.slice(); m.wlAcreSec = this.wlAcreSec; m.spilled = this.spilled;
      return m;
    }

    level(i) { return i >= this.n ? RIVER : this.S[i] / SEG_AREA; }

    fieldDepth(i) { return this.field[i] / (this.nodes[i].acres * ACRE); }

    isWaterlogged(i) { return this.fieldDepth(i) > WATERLOG_DEPTH; }

    flowThrough(i) {
      const h = this.level(i);
      return conductance(i) * (1 - 0.95 * this.b[i]) * Math.pow(Math.max(h, 0), 1.5);
    }

    /** Advance by dt seconds with rainfall intensity rain (mm/hr). */
    step(dt, rain) {
      const q = [];
      for (let i = 0; i < this.n; i++) q.push(this.flowThrough(i));
      for (let i = 0; i < this.n; i++) {
        const runoff = rain / 1000 / 3600 * this.nodes[i].acres * ACRE * CATCH * RUNOFF;
        const inflow = (i === 0 ? BASEFLOW : q[i - 1]) + runoff;
        this.S[i] += (inflow - q[i]) * dt;
        if (this.S[i] < 0) this.S[i] = 0;
        const cap = BANK * SEG_AREA;
        if (this.S[i] > cap) {
          const spill = this.S[i] - cap;
          this.field[i] += spill; this.spilled += spill;
          this.S[i] = cap;
        }
        // Ponded water drains back once the channel has headroom, and soaks in slowly.
        if (this.field[i] > 0) {
          if (this.level(i) < BANK - 0.15) {
            const ret = this.field[i] * Math.min(1, 1.4e-4 * dt);
            this.field[i] -= ret; this.S[i] += ret;
          }
          this.field[i] *= (1 - 2e-5 * dt);
          if (this.field[i] < 1) this.field[i] = 0;
        }
        // Debris accumulates toward its target over ~15 minutes.
        this.b[i] += (this.bT[i] - this.b[i]) * Math.min(1, dt / 900);
        if (this.isWaterlogged(i)) this.wlAcreSec += this.nodes[i].acres * dt;
      }
    }

    waterloggedAcres() {
      let a = 0;
      for (let i = 0; i < this.n; i++) if (this.isWaterlogged(i)) a += this.nodes[i].acres;
      return a;
    }
  }

  /** Box–Muller gaussian noise. */
  function gauss(sd) {
    const u = 1 - Math.random(), v = Math.random();
    return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Least-squares slope of y over t (t in seconds), returned per hour. */
  function slopePerHour(pts, key) {
    const n = pts.length;
    if (n < 3) return 0;
    let st = 0, sy = 0, stt = 0, sty = 0;
    for (const p of pts) { st += p.t; sy += p[key]; stt += p.t * p.t; sty += p.t * p[key]; }
    const d = n * stt - st * st;
    if (d === 0) return 0;
    return ((n * sty - st * sy) / d) * 3600;
  }

  /**
   * Per-node blockage detector. Fed one reading every 5 minutes.
   *
   * Each reading comes with the digital twin's prediction: the level a clear
   * drain would show given the rain that actually fell. Working on residuals
   * (observed − twin) means a storm raising every level is not mistaken for a
   * blockage — only water that is higher upstream than physics expects is.
   *
   * Blockage Index (BI, 0–1) fuses three signals:
   *  - excess head: upstream residual above downstream residual, beyond this
   *    node's learned normal offset (absorbs twin calibration error)
   *  - divergence: upstream residual rising faster than downstream (30 min)
   *  - camera debris estimate, when the node has a camera
   * Sensor fouling is flagged when the upstream reading stops moving entirely.
   */
  class Detector {
    constructor(node) {
      this.node = node;
      this.buf = [];        // {t, up, down, debris, ru, rd}
      this.base = null;     // learned normal residual offset, cm
      this.bi = 0;
      this.excess = 0;
      this.div = 0;
      this.slopeUp = 0;
      this.fault = false;
      this.parts = { excess: 0, div: 0, camera: null };
    }

    push(t, up, down, debris, upTwin, downTwin) {
      const ru = up - upTwin, rd = down - downTwin;
      this.buf.push({ t, up, down, debris, ru, rd, upTwin });
      if (this.buf.length > 96) this.buf.shift(); // 8 h history

      const recent = this.buf.slice(-8);
      const range = Math.max(...recent.map((p) => p.up)) - Math.min(...recent.map((p) => p.up));
      this.fault = recent.length >= 8 && range < 0.1;

      const delta = ru - rd;
      if (this.base === null) this.base = delta;
      const win = this.buf.slice(-6);
      this.slopeUp = slopePerHour(win, 'up');
      const sRu = slopePerHour(win, 'ru');
      const sRd = slopePerHour(win, 'rd');
      this.excess = delta - this.base;
      this.div = sRu > 2 ? sRu - sRd : 0; // only counts while upstream is backing up

      const ex = clamp01((this.excess - 4) / 30);
      const dv = clamp01((this.div - 3) / 25);
      let bi;
      if (this.fault) {
        bi = debris == null ? 0 : debris; // level sensors untrusted: camera only
      } else {
        bi = clamp01(0.75 * ex + 0.35 * dv);
        if (debris != null) bi = clamp01(0.7 * bi + 0.3 * debris);
      }
      this.parts = { excess: ex, div: dv, camera: debris };
      this.bi = bi;
      this.echoOf = null;
      this.buf[this.buf.length - 1].bi = bi;
      if (!this.fault && bi < 0.2) this.base += 0.03 * (delta - this.base);
      return bi;
    }

    /** Highest raw BI over the last `hours`. */
    recentMax(hours) {
      const n = Math.round(hours * 12);
      return Math.max(0, ...this.buf.slice(-n).map((p) => p.bi || 0));
    }

    last() { return this.buf[this.buf.length - 1]; }
  }

  /**
   * Explain-away pass across the network. When a node upstream has had a strong
   * blockage in the last 3 h, the stored water it releases later shows up
   * downstream as a mild "blockage-like" bump. Unless a downstream camera
   * confirms debris, damp that node's BI and record which node explains it.
   */
  function explainAway(dets) {
    for (let i = 1; i < dets.length; i++) {
      const d = dets[i];
      if (d.bi < 0.2) continue;
      const cam = d.parts.camera;
      if (cam != null && cam >= 0.3) continue;
      for (let j = 0; j < i; j++) {
        if (dets[j].recentMax(3) > 0.5) {
          d.bi *= 0.3;
          d.echoOf = dets[j].node.id;
          break;
        }
      }
    }
  }

  const api = {
    SEG_AREA, BANK, RIVER, ACRE, WATERLOG_DEPTH, NODES,
    Model, Detector, explainAway, gauss, clamp01, slopePerHour,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.DrainEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
