/* ImmoReel — Musik-Engine
 * Erzeugt lizenzfreie Instrumental-Tracks komplett im Browser (Web Audio,
 * OfflineAudioContext -> AudioBuffer). Keine Dateien, kein Upload, offline nutzbar.
 */
(function () {
  "use strict";

  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var TRACKS = {
    house: {
      name: "Deep House", bpm: 122,
      prog: [[57, 60, 64, 67], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 65]],
      kick: "1000100010001000", hat: "0010001000100010", clap: "0000000000000000",
      bass: "1011101010111010", bassStyle: "tri",
      lead: "................", leadOct: 0, leadStyle: "pluck",
      pad: "sawtooth", padGain: 0.085, noise: false
    },
    lofi: {
      name: "Lo-Fi Chill", bpm: 82,
      prog: [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]],
      kick: "1000000010000000", hat: "0010001000100010", clap: "0000100000001000",
      bass: "1000000010000000", bassStyle: "tri",
      lead: "..4...2...7...4..", leadOct: 12, leadStyle: "bell",
      pad: "triangle", padGain: 0.10, noise: true
    },
    cinematic: {
      name: "Cinematic", bpm: 72,
      prog: [[60, 64, 67, 74], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]],
      kick: "0000000000000000", hat: "0000000000000000", clap: "0000000000000000",
      bass: "1000000000000000", bassStyle: "sub",
      lead: "0246135702461357", leadOct: 12, leadStyle: "bell",
      pad: "sawtooth", padGain: 0.11, sub: true, boom: true
    },
    corporate: {
      name: "Corporate", bpm: 120,
      prog: [[60, 64, 67, 72], [59, 62, 67, 71], [57, 60, 64, 69], [53, 57, 60, 65]],
      kick: "1000100010001000", hat: "1010101010101010", clap: "0000100000001000",
      bass: "1000100010001000", bassStyle: "tri",
      lead: "0123120301231203", leadOct: 0, leadStyle: "pluck",
      pad: "triangle", padGain: 0.06
    }
  };

  function render(trackId, duration) {
    return new Promise(function (resolve, reject) {
      var spec = TRACKS[trackId];
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!spec || !OAC) { reject(new Error("no-track")); return; }

      var sr = 44100;
      var beat = 60 / spec.bpm, barDur = beat * 4, stepDur = barDur / 16;
      var dur = Math.max(4, duration || 18);
      var len = Math.ceil(sr * (dur + 0.8));
      var ctx;
      try { ctx = new OAC(2, len, sr); } catch (e) { reject(e); return; }

      // Master-Kette: Kompressor -> Gain
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 24; comp.ratio.value = 12;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      var master = ctx.createGain(); master.gain.value = 0.82;
      comp.connect(master); master.connect(ctx.destination);

      // Rauschpuffer (für Hats/Clap/Vinyl)
      var noiseBuf = ctx.createBuffer(1, sr, sr);
      var nd = noiseBuf.getChannelData(0);
      for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

      function gainEnv(node, t, peak, a, dTime, floor) {
        var g = node.gain;
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
        g.exponentialRampToValueAtTime(Math.max(floor || 0.0001, 0.0001), t + a + dTime);
      }

      function kick(t) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
        gainEnv(g, t, 0.9, 0.004, 0.19);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.24);
      }
      function noiseHit(t, dTime, peak, filterType, freq, q) {
        var s = ctx.createBufferSource(); s.buffer = noiseBuf;
        var f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; if (q) f.Q.value = q;
        var g = ctx.createGain();
        gainEnv(g, t, peak, 0.002, dTime);
        s.connect(f); f.connect(g); g.connect(master);
        s.start(t); s.stop(t + dTime + 0.05);
      }
      function hat(t) { noiseHit(t, 0.05, 0.16, "highpass", 8000); }
      function clap(t) { noiseHit(t, 0.13, 0.30, "bandpass", 1600, 1.2); }
      function bassNote(t, freq, dTime, style) {
        var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = style === "sub" ? 200 : 480;
        o.type = style === "sub" ? "sine" : "triangle";
        o.frequency.value = freq;
        if (style === "sub") { gainEnv(g, t, 0.42, 0.06, dTime); }
        else { gainEnv(g, t, 0.28, 0.008, dTime); }
        o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + dTime + 0.1);
      }
      function padChord(freqs, t, dTime, type, peak) {
        var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1600;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.3);
        g.gain.setValueAtTime(peak, t + dTime - 0.4 > t + 0.3 ? t + dTime - 0.4 : t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dTime + 0.3);
        f.connect(g); g.connect(master);
        for (var k = 0; k < freqs.length; k++) {
          for (var d = -1; d <= 1; d += 2) {
            var o = ctx.createOscillator();
            o.type = type; o.frequency.value = freqs[k];
            o.detune.value = d * 6;
            o.connect(f); o.start(t); o.stop(t + dTime + 0.35);
          }
        }
      }
      function leadNote(t, freq, style) {
        var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = style === "bell" ? 3200 : 2000;
        o.type = style === "bell" ? "triangle" : "square";
        o.frequency.value = freq;
        gainEnv(g, t, style === "bell" ? 0.17 : 0.14, 0.004, style === "bell" ? 0.45 : 0.22);
        o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.6);
      }
      function subBoom(t) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 60;
        gainEnv(g, t, 0.5, 0.01, 1.3);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.5);
      }
      function vinyl(t, dTime) {
        var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        var f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2500; f.Q.value = 0.6;
        var g = ctx.createGain(); g.gain.value = 0.015;
        s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dTime);
      }

      if (spec.noise) vinyl(0, dur);

      var bar = 0, barStart = 0;
      while (barStart < dur) {
        var chord = spec.prog[bar % spec.prog.length];
        var root = midi(chord[0] - 12);
        var padF = chord.map(function (n) { return midi(n); });
        // Pad pro Takt
        padChord(padF, barStart, barDur, spec.pad, spec.padGain);
        if (spec.boom) subBoom(barStart);

        // Lead-Tonvorrat (Akkordtöne + Oktave)
        var tones = chord.slice().concat(chord.map(function (n) { return n + 12; }));

        for (var st = 0; st < 16; st++) {
          var t = barStart + st * stepDur;
          if (t >= dur) break;
          if (spec.kick[st] === "1") kick(t);
          if (spec.hat[st] === "1") hat(t);
          if (spec.clap[st] === "1") clap(t);
          if (spec.bass[st] === "1") bassNote(t, root, spec.bassStyle === "sub" ? barDur : stepDur * 2, spec.bassStyle);
          var lc = spec.lead[st];
          if (lc && lc !== ".") {
            var idx = parseInt(lc, 10);
            if (!isNaN(idx)) leadNote(t, midi(tones[idx % tones.length] + (spec.leadOct || 0)), spec.leadStyle);
          }
        }
        barStart += barDur; bar++;
      }

      ctx.startRendering().then(resolve).catch(reject);
    });
  }

  window.Music = {
    render: render,
    list: Object.keys(TRACKS).map(function (id) { return { id: id, name: TRACKS[id].name }; })
  };
})();
