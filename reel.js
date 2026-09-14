/* ImmoReel — Canvas Reel Engine
 * Rendert Objekt-Reels vollständig auf einem <canvas>. Dieselbe Zeichenroutine
 * treibt die Live-Vorschau und den echten Video-Export (MediaRecorder).
 */
(function () {
  "use strict";

  var STYLES = {
    modern:  { bg: "#0C1A2B", fg: "#F4F8FC", accent: "#4FC3FF", chipInk: "#04121F", display: "Bricolage Grotesque", body: "Figtree", scrim: 0.55 },
    luxus:   { bg: "#100E0A", fg: "#F3EADB", accent: "#D8A24A", chipInk: "#17110450", display: "Bricolage Grotesque", body: "Bricolage Grotesque", scrim: 0.6 },
    minimal: { bg: "#F3F3F1", fg: "#17181A", accent: "#17181A", chipInk: "#FFFFFF", display: "Figtree", body: "Figtree", scrim: 0.45 }
  };
  var FORMATS = { "9:16": { w: 720, h: 1280 }, "1:1": { w: 900, h: 900 }, "16:9": { w: 1280, h: 720 } };

  var DEFAULT_ROOMS = [
    { label: "Wohnzimmer", c1: "#b7a68d", c2: "#5f5140", tag: "Beispielfoto 01" },
    { label: "Küche",      c1: "#cfd6da", c2: "#6c7680", tag: "Beispielfoto 02" },
    { label: "Schlafzimmer", c1: "#9fb0c4", c2: "#46586b", tag: "Beispielfoto 03" },
    { label: "Bad",        c1: "#bcd4d2", c2: "#567573", tag: "Beispielfoto 04" }
  ];

  var state = {
    title: "Lichtdurchflutete Altbauwohnung",
    location: "Kassel-Vorderer Westen",
    price: 449000,
    rooms: "3,5",
    area: "96",
    agent: "Makler Müller Immobilien",
    phone: "0561 – 123 456",
    highlights: ["Saniert 2024", "Einbauküche", "Stellplatz"],
    photos: [],           // { img: HTMLImageElement, label: string }
    audioBuffer: null,    // optionaler Musik-AudioBuffer
    style: "luxus",
    format: "9:16"
  };

  var canvas = null, ctx = null;
  var W = 720, H = 1280, S = 1, M = 50;
  var scenes = [], starts = [], total = 0;
  var playhead = 0, playing = false, lastTs = null, rafId = null;
  var timeCb = null, exporting = false, fontsReady = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Hilfsfunktionen ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); }

  // Erscheinen-Animation: liefert {a: alpha, dy: offset}
  function appear(lt, delay, dur) {
    if (reduce) return { a: 1, dy: 0 };
    var p = easeOut((lt - delay) / dur);
    return { a: p, dy: (1 - p) * 26 * S };
  }

  function fontStr(weight, size, family) {
    return weight + " " + Math.round(size) + 'px "' + family + '", "Figtree", system-ui, sans-serif';
  }
  function monoFont(weight, size) {
    return weight + " " + Math.round(size) + 'px "JetBrains Mono", ui-monospace, monospace';
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function spacedText(text, x, y, spacing) {
    var cx = x;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + spacing;
    }
    return cx;
  }
  function spacedWidth(text, spacing) {
    var w = 0;
    for (var i = 0; i < text.length; i++) w += ctx.measureText(text[i]).width + spacing;
    return w - spacing;
  }

  function wrapLines(text, maxW) {
    var words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    var lines = [], line = words[0];
    for (var i = 1; i < words.length; i++) {
      var test = line + " " + words[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    lines.push(line);
    return lines;
  }

  function priceText() {
    var n = parseInt(String(state.price).replace(/[^\d]/g, ""), 10);
    return n > 0 ? n.toLocaleString("de-DE") + " €" : "Preis auf Anfrage";
  }

  /* ---------- Szenen ---------- */
  function buildScenes() {
    scenes = [];
    scenes.push({ type: "intro", dur: 2.6 });
    var rooms = state.photos.length ? state.photos : DEFAULT_ROOMS;
    var overlays = ["price", "specs", "tagline"];
    var n = Math.min(rooms.length, 4);
    for (var i = 0; i < n; i++) {
      scenes.push({ type: "photo", dur: 2.4, room: rooms[i], overlay: overlays[i % overlays.length], idx: i });
    }
    scenes.push({ type: "highlights", dur: 2.6 });
    scenes.push({ type: "outro", dur: 2.6 });

    starts = []; total = 0;
    for (var j = 0; j < scenes.length; j++) { starts.push(total); total += scenes[j].dur; }
  }

  function sceneAt(t) {
    for (var i = scenes.length - 1; i >= 0; i--) { if (t >= starts[i]) return i; }
    return 0;
  }

  /* ---------- Zeichnen ---------- */
  function pal() { return STYLES[state.style] || STYLES.luxus; }

  function drawBackground() {
    var p = pal();
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawRoomLayer(room, p) {
    if (room.img && room.img.complete && room.img.naturalWidth) {
      var img = room.img, iw = img.naturalWidth, ih = img.naturalHeight;
      var base = Math.max(W / iw, H / ih);
      var zoom = reduce ? 1 : 1 + 0.16 * p;
      var s = base * zoom;
      var dw = iw * s, dh = ih * s;
      var dx = (W - dw) / 2 + (reduce ? 0 : (dw - W) * 0.05 * p);
      var dy = (H - dh) / 2 - (reduce ? 0 : (dh - H) * 0.03 * p);
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      var g = ctx.createLinearGradient(0, 0, W * 0.7, H);
      g.addColorStop(0, room.c1 || "#8f7c62");
      g.addColorStop(1, room.c2 || "#40372a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // driftende Formen für Parallax-Gefühl
      var z = reduce ? 0 : p;
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = "#ffffff";
      roundRect(W * 0.12 + z * 12 * S, H * 0.30 - z * 10 * S, W * 0.36, H * 0.24, 8 * S); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1.5 * S;
      roundRect(W * 0.55 - z * 10 * S, H * 0.42, W * 0.30, H * 0.20, 8 * S); ctx.stroke();
      ctx.restore();
      // Highlight-Licht
      var rg = ctx.createRadialGradient(W * 0.7, H * 0.15, 0, W * 0.7, H * 0.15, W * 0.7);
      rg.addColorStop(0, "rgba(255,255,255,0.26)");
      rg.addColorStop(0.6, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }
    // unteres Scrim für Lesbarkeit
    var sc = pal().scrim;
    var sg = ctx.createLinearGradient(0, H * 0.45, 0, H);
    sg.addColorStop(0, "rgba(0,0,0,0)");
    sg.addColorStop(1, "rgba(0,0,0," + sc + ")");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawChip(x, y, label, opts) {
    opts = opts || {};
    var p = pal();
    var padX = 14 * S, padY = 9 * S;
    ctx.font = monoFont("700", 15 * S);
    var tw = ctx.measureText(label).width;
    var w = tw + padX * 2, h = 22 * S + padY * 2;
    if (opts.outline) {
      ctx.strokeStyle = "rgba(" + (isLight() ? "23,24,26" : "255,255,255") + ",0.4)";
      ctx.lineWidth = 1.4 * S;
      roundRect(x, y, w, h, 8 * S); ctx.stroke();
      ctx.fillStyle = p.fg;
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      roundRect(x, y, w, h, 8 * S); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1 * S;
      roundRect(x, y, w, h, 8 * S); ctx.stroke();
      ctx.fillStyle = "#fff";
    }
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(label, x + padX, y + h / 2 + 1 * S);
    return w;
  }

  function isLight() { return state.style === "minimal"; }

  function drawIntro(lt) {
    var p = pal();
    drawBackground();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    var maxW = W - M * 2;

    // vertikaler Block, mittig
    ctx.font = fontStr("800", 62 * S, p.display);
    var titleLines = wrapLines(state.title || "Ihr Objekt", maxW);
    var titleLH = 66 * S;
    var blockH = 30 * S + 18 * S + titleLines.length * titleLH + 40 * S;
    var top = (H - blockH) / 2;

    // Eyebrow
    var a1 = appear(lt, 0, 0.5);
    ctx.globalAlpha = a1.a;
    ctx.fillStyle = p.accent;
    ctx.font = monoFont("700", 15 * S);
    spacedText("ZU VERKAUFEN", M, top + a1.dy, 4 * S);
    ctx.globalAlpha = 1;

    // Titel
    ctx.fillStyle = p.fg;
    ctx.font = fontStr("800", 62 * S, p.display);
    var ty = top + 30 * S + 18 * S + titleLH * 0.8;
    for (var i = 0; i < titleLines.length; i++) {
      var a = appear(lt, 0.12 + i * 0.08, 0.55);
      ctx.globalAlpha = a.a;
      ctx.fillText(titleLines[i], M, ty + i * titleLH + a.dy);
    }
    ctx.globalAlpha = 1;

    // Tick-Linie + Specs
    var a3 = appear(lt, 0.3, 0.55);
    ctx.globalAlpha = a3.a;
    var baseY = ty + titleLines.length * titleLH + 6 * S + a3.dy;
    ctx.fillStyle = p.fg;
    ctx.font = monoFont("500", 15 * S);
    ctx.textBaseline = "middle";
    var locTxt = state.location || "Lage";
    ctx.fillText(locTxt, M, baseY);
    var lw = ctx.measureText(locTxt).width;
    var lineX = M + lw + 14 * S, lineW = 46 * S;
    ctx.strokeStyle = p.fg; ctx.globalAlpha = a3.a * 0.6; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.moveTo(lineX, baseY); ctx.lineTo(lineX + lineW, baseY); ctx.stroke();
    ctx.globalAlpha = a3.a;
    var specTxt = (state.rooms || "–") + " ZI · " + (state.area || "–") + " m²";
    ctx.fillText(specTxt, lineX + lineW + 14 * S, baseY);
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
  }

  function drawPhoto(scene, lt) {
    var p = pal(), room = scene.room, prog = lt / scene.dur;
    drawRoomLayer(room, prog);

    // Foto-Tag (nur Platzhalter)
    if (room.tag) {
      ctx.font = monoFont("500", 13 * S);
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      var tw = ctx.measureText(room.tag).width;
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      roundRect(M, M, tw + 20 * S, 26 * S, 6 * S); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(room.tag, M + 10 * S, M + 13 * S + 1 * S);
    } else if (room.label) {
      ctx.font = monoFont("500", 13 * S);
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      var lw = ctx.measureText(room.label).width;
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      roundRect(M, M, lw + 20 * S, 26 * S, 6 * S); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(room.label, M + 10 * S, M + 13 * S + 1 * S);
    }

    // Raum-Label unten rechts
    if (room.label) {
      ctx.font = monoFont("700", 14 * S);
      ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(room.label.toUpperCase(), W - M, H - M);
    }

    // Overlay unten links
    ctx.textAlign = "left";
    var oy = H - M - 42 * S;
    if (scene.overlay === "price") {
      var a = appear(lt, 0.1, 0.5);
      ctx.globalAlpha = a.a;
      ctx.font = fontStr("800", 40 * S, p.display);
      var txt = priceText();
      var small = "  Kaufpreis";
      var tW = ctx.measureText(txt).width;
      ctx.font = monoFont("600", 15 * S);
      var sW = ctx.measureText(small).width;
      var padX = 16 * S, h = 54 * S;
      var boxW = padX * 2 + tW + sW;
      ctx.fillStyle = isLight() ? p.fg : p.accent;
      roundRect(M, oy - h + a.dy, boxW, h, 10 * S); ctx.fill();
      ctx.fillStyle = isLight() ? "#fff" : p.chipInk.slice(0, 7);
      ctx.textBaseline = "middle";
      ctx.font = fontStr("800", 40 * S, p.display);
      ctx.fillText(txt, M + padX, oy - h / 2 + a.dy + 1 * S);
      ctx.font = monoFont("600", 15 * S);
      ctx.globalAlpha = a.a * 0.85;
      ctx.fillText(small.trim(), M + padX + tW + 8 * S, oy - h / 2 + a.dy + 2 * S);
      ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic";
    } else if (scene.overlay === "specs") {
      var chips = [(state.rooms || "–") + " Zimmer", (state.area || "–") + " m²", "Balkon"];
      var cx = M;
      for (var i = 0; i < chips.length; i++) {
        var ca = appear(lt, 0.1 + i * 0.1, 0.5);
        ctx.globalAlpha = ca.a;
        cx += drawChip(cx, oy - 12 * S + ca.dy, chips[i]) + 8 * S;
      }
      ctx.globalAlpha = 1;
    } else {
      var tags = [state.highlights[0] || "Top-Lage", "Ruhige Straße"];
      var tx = M;
      for (var k = 0; k < tags.length; k++) {
        var ta = appear(lt, 0.1 + k * 0.12, 0.5);
        ctx.globalAlpha = ta.a;
        tx += drawChip(tx, oy - 12 * S + ta.dy, tags[k]) + 8 * S;
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawHighlights(lt) {
    var p = pal();
    drawBackground();
    ctx.textAlign = "left";
    var items = state.highlights.filter(Boolean).slice(0, 4);
    if (!items.length) items = ["Top-Lage"];
    var rowH = 60 * S, gap = 14 * S;
    var blockH = 40 * S + items.length * rowH + (items.length - 1) * gap;
    var top = (H - blockH) / 2;

    var ae = appear(lt, 0, 0.5);
    ctx.globalAlpha = ae.a;
    ctx.fillStyle = p.accent;
    ctx.font = monoFont("700", 15 * S);
    ctx.textBaseline = "alphabetic";
    spacedText("HIGHLIGHTS", M, top + ae.dy, 4 * S);
    ctx.globalAlpha = 1;

    var y = top + 40 * S;
    for (var i = 0; i < items.length; i++) {
      var a = appear(lt, 0.15 + i * 0.12, 0.5);
      ctx.globalAlpha = a.a;
      var ry = y + i * (rowH + gap) + a.dy;
      var box = 40 * S;
      ctx.fillStyle = isLight() ? p.fg : p.accent;
      roundRect(M, ry, box, box, 9 * S); ctx.fill();
      ctx.fillStyle = isLight() ? "#fff" : p.chipInk.slice(0, 7);
      ctx.font = fontStr("800", 22 * S, p.body);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("✓", M + box / 2, ry + box / 2 + 1 * S);
      ctx.fillStyle = p.fg;
      ctx.font = fontStr("600", 26 * S, p.body);
      ctx.textAlign = "left";
      ctx.fillText(items[i], M + box + 16 * S, ry + box / 2 + 1 * S);
      ctx.textBaseline = "alphabetic";
    }
    ctx.globalAlpha = 1;
  }

  function drawOutro(lt) {
    var p = pal();
    drawBackground();
    ctx.textAlign = "center";
    var cx = W / 2, cy = H / 2;

    var a1 = appear(lt, 0, 0.5);
    ctx.globalAlpha = a1.a;
    var box = 74 * S;
    ctx.fillStyle = isLight() ? p.fg : p.accent;
    roundRect(cx - box / 2, cy - 130 * S + a1.dy, box, box, 16 * S); ctx.fill();
    ctx.fillStyle = isLight() ? "#fff" : p.chipInk.slice(0, 7);
    ctx.font = fontStr("800", 34 * S, p.display);
    ctx.textBaseline = "middle";
    var letter = (state.agent || "M").trim().charAt(0).toUpperCase() || "M";
    ctx.fillText(letter, cx, cy - 130 * S + box / 2 + a1.dy + 1 * S);

    var a2 = appear(lt, 0.14, 0.5);
    ctx.globalAlpha = a2.a;
    ctx.fillStyle = p.fg;
    ctx.font = fontStr("800", 34 * S, p.display);
    var nameLines = wrapLines(state.agent || "Ihr Maklerbüro", W - M * 2);
    ctx.textBaseline = "alphabetic";
    for (var i = 0; i < nameLines.length; i++) {
      ctx.fillText(nameLines[i], cx, cy - 20 * S + i * 40 * S + a2.dy);
    }

    var a3 = appear(lt, 0.28, 0.5);
    ctx.globalAlpha = a3.a;
    var ctaY = cy + 20 * S + (nameLines.length - 1) * 40 * S + a3.dy;
    ctx.font = monoFont("700", 15 * S);
    var cta = "JETZT BESICHTIGUNG SICHERN";
    var cw = spacedWidth(cta, 2 * S) + 32 * S, ch = 42 * S;
    ctx.strokeStyle = isLight() ? "rgba(23,24,26,0.4)" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.4 * S;
    roundRect(cx - cw / 2, ctaY, cw, ch, 999); ctx.stroke();
    ctx.fillStyle = p.fg;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    spacedText(cta, cx - cw / 2 + 16 * S, ctaY + ch / 2 + 1 * S, 2 * S);

    if (state.phone) {
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = monoFont("500", 17 * S);
      ctx.globalAlpha = a3.a * 0.85;
      ctx.fillText(state.phone, cx, ctaY + ch + 34 * S);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  function drawChrome(idx) {
    var p = pal();
    // Story-Fortschrittsbalken oben
    var pad = 10 * S, gap = 5 * S;
    var barW = (W - pad * 2 - gap * (scenes.length - 1)) / scenes.length;
    for (var i = 0; i < scenes.length; i++) {
      var x = pad + i * (barW + gap);
      ctx.fillStyle = "rgba(" + (isLight() ? "23,24,26" : "255,255,255") + ",0.22)";
      roundRect(x, pad, barW, 3 * S, 2 * S); ctx.fill();
      var fillW = playhead >= starts[i] + scenes[i].dur ? barW
        : playhead <= starts[i] ? 0 : barW * (playhead - starts[i]) / scenes[i].dur;
      if (fillW > 0) {
        ctx.fillStyle = p.fg;
        roundRect(x, pad, fillW, 3 * S, 2 * S); ctx.fill();
      }
    }
    // Wasserzeichen
    ctx.font = monoFont("500", 13 * S);
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(" + (isLight() ? "23,24,26" : "255,255,255") + ",0.5)";
    var wm = (state.agent || "").toUpperCase();
    if (wm.length > 22) wm = wm.slice(0, 22);
    ctx.fillText(wm, W - M, pad + 14 * S);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  function drawAt(t) {
    if (!ctx) return;
    playhead = clamp(t, 0, total - 0.001);
    var idx = sceneAt(playhead);
    var scene = scenes[idx];
    var lt = playhead - starts[idx];

    drawBackground();
    if (scene.type === "intro") drawIntro(lt);
    else if (scene.type === "photo") drawPhoto(scene, lt);
    else if (scene.type === "highlights") drawHighlights(lt);
    else if (scene.type === "outro") drawOutro(lt);

    // sanftes Einblenden am Szenenanfang (Dip aus BG)
    if (!reduce && lt < 0.28) {
      ctx.globalAlpha = 1 - lt / 0.28;
      ctx.fillStyle = pal().bg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    drawChrome(idx);
    if (timeCb) timeCb({ playhead: playhead, total: total, index: idx });
  }

  /* ---------- Loop ---------- */
  function loop(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = (ts - lastTs) / 1000; lastTs = ts;
    if (playing && !exporting) {
      playhead += dt;
      if (playhead >= total) playhead -= total;
      drawAt(playhead);
    }
    rafId = requestAnimationFrame(loop);
  }

  /* ---------- Fonts ---------- */
  function ensureFonts() {
    if (fontsReady || !document.fonts || !document.fonts.load) return Promise.resolve();
    var faces = [
      '800 62px "Bricolage Grotesque"', '600 26px "Bricolage Grotesque"',
      '600 26px "Figtree"', '700 15px "Figtree"',
      '700 15px "JetBrains Mono"', '500 15px "JetBrains Mono"'
    ];
    return Promise.all(faces.map(function (f) { return document.fonts.load(f).catch(function () {}); }))
      .then(function () { fontsReady = true; });
  }

  /* ---------- Format ---------- */
  function applyFormat() {
    var f = FORMATS[state.format] || FORMATS["9:16"];
    W = f.w; H = f.h;
    canvas.width = W; canvas.height = H;
    S = Math.min(W, H) / 720;
    M = Math.round(0.07 * W);
  }

  /* ---------- Export (echtes Video) ---------- */
  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    var cands = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4",
      "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"
    ];
    for (var i = 0; i < cands.length; i++) if (MediaRecorder.isTypeSupported(cands[i])) return cands[i];
    return "";
  }

  function render(onProgress) {
    return new Promise(function (resolve, reject) {
      if (!canvas.captureStream) { reject(new Error("no-capture")); return; }
      if (!window.MediaRecorder) { reject(new Error("no-recorder")); return; }
      ensureFonts().then(function () {
        var mime = pickMime();
        var vStream = canvas.captureStream(30);
        var tracks = vStream.getVideoTracks();
        var audioCtx = null;
        try {
          if (state.audioBuffer) {
            var AC = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AC();
            var src = audioCtx.createBufferSource();
            src.buffer = state.audioBuffer;
            var gain = audioCtx.createGain(); gain.gain.value = 0.9;
            var dest = audioCtx.createMediaStreamDestination();
            src.connect(gain); gain.connect(dest); gain.connect(audioCtx.destination);
            src.start();
            tracks = tracks.concat(dest.stream.getAudioTracks());
          }
        } catch (e) { audioCtx = null; }

        var outStream = new MediaStream(tracks);
        var rec;
        try {
          rec = mime ? new MediaRecorder(outStream, { mimeType: mime, videoBitsPerSecond: 8000000 })
                     : new MediaRecorder(outStream);
        } catch (e) { reject(e); return; }

        var chunks = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onerror = function (e) { reject(e.error || new Error("record-error")); };
        rec.onstop = function () {
          if (audioCtx) { try { audioCtx.close(); } catch (e) {} }
          exporting = false;
          var type = (mime || "video/webm").split(";")[0];
          var blob = new Blob(chunks, { type: type });
          resolve({ blob: blob, type: type, w: W, h: H });
        };

        exporting = true;
        var start = performance.now();
        try { rec.start(); } catch (e) { exporting = false; reject(e); return; }

        function step(now) {
          var t = (now - start) / 1000;
          var c = Math.min(t, total - 0.001);
          drawAt(c);
          if (onProgress) onProgress(Math.min(t / total, 1));
          if (t >= total) { try { rec.stop(); } catch (e) {} return; }
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    });
  }

  /* ---------- Öffentliche API ---------- */
  var Reel = {
    init: function (cnv) {
      canvas = cnv;
      ctx = canvas.getContext("2d");
      applyFormat();
      buildScenes();
      playhead = Math.min(1.2, total); // sinnvolles erstes Standbild statt schwarzem Frame
      ensureFonts().then(function () { drawAt(playhead); });
      drawAt(playhead);
      if (rafId === null) rafId = requestAnimationFrame(loop);
      if (!reduce) playing = true;
      return this;
    },
    setData: function (partial) {
      Object.assign(state, partial);
      buildScenes();
      if (!playing || exporting) drawAt(playhead);
      return this;
    },
    setStyle: function (v) { state.style = v; drawAt(playhead); },
    setFormat: function (v) { state.format = v; applyFormat(); drawAt(playhead); },
    setPhotos: function (arr) { state.photos = arr || []; buildScenes(); drawAt(playhead); },
    setAudio: function (buf) { state.audioBuffer = buf || null; },
    play: function () { playing = true; },
    pause: function () { playing = false; },
    toggle: function () { playing = !playing; return playing; },
    isPlaying: function () { return playing; },
    seek: function (ratio) { playhead = clamp(ratio, 0, 1) * total; drawAt(playhead); },
    getTotal: function () { return total; },
    onTime: function (cb) { timeCb = cb; },
    render: render,
    styles: STYLES,
    getState: function () { return state; }
  };

  window.Reel = Reel;
})();
