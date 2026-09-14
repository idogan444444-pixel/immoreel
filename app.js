/* ImmoReel — App-Logik: UI, Uploads, Export, PWA */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("reel");
  if (!canvas || !window.Reel) { return; }

  Reel.init(canvas);

  /* ---------- Zeit / Scrubber ---------- */
  var scrubFill = $("scrubFill"), tCur = $("tCur"), tTot = $("tTot"), scrub = $("scrub");
  function fmt(sec) {
    sec = Math.max(0, sec || 0);
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  tTot.textContent = fmt(Reel.getTotal());
  Reel.onTime(function (t) {
    var total = t.total || 1;
    var pct = (t.playhead / total) * 100;
    scrubFill.style.width = pct.toFixed(1) + "%";
    scrub.setAttribute("aria-valuenow", Math.round(pct));
    tCur.textContent = fmt(t.playhead);
  });

  /* ---------- Play / Pause ---------- */
  var playBtn = $("playBtn"), playIcon = $("playIcon");
  function syncPlayIcon() {
    playIcon.innerHTML = Reel.isPlaying()
      ? '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>'
      : '<path d="M4 2.5v11l9-5.5z"/>';
  }
  syncPlayIcon();
  playBtn.addEventListener("click", function () { Reel.toggle(); syncPlayIcon(); });

  /* ---------- Scrubber (Maus + Touch + Tastatur) ---------- */
  var dragging = false;
  function seekFromEvent(e) {
    var r = scrub.getBoundingClientRect();
    var clientX = e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    var ratio = r.width ? (clientX - r.left) / r.width : 0;
    Reel.seek(Math.max(0, Math.min(1, ratio)));
  }
  scrub.addEventListener("pointerdown", function (e) {
    dragging = true; Reel.pause(); syncPlayIcon();
    try { scrub.setPointerCapture(e.pointerId); } catch (err) {}
    seekFromEvent(e);
  });
  scrub.addEventListener("pointermove", function (e) { if (dragging) seekFromEvent(e); });
  scrub.addEventListener("pointerup", function () { dragging = false; });
  scrub.addEventListener("pointercancel", function () { dragging = false; });
  scrub.addEventListener("keydown", function (e) {
    var total = Reel.getTotal();
    var cur = parseFloat(scrub.getAttribute("aria-valuenow")) / 100 * total || 0;
    if (e.key === "ArrowRight") { Reel.seek(Math.min(1, (cur + 0.5) / total)); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { Reel.seek(Math.max(0, (cur - 0.5) / total)); e.preventDefault(); }
  });

  /* ---------- Formular-Bindung ---------- */
  function parseHighlights(v) {
    return String(v || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4);
  }
  var binds = [
    ["fTitle", function (v) { return { title: v }; }],
    ["fLocation", function (v) { return { location: v }; }],
    ["fPrice", function (v) { return { price: v }; }],
    ["fRooms", function (v) { return { rooms: v }; }],
    ["fArea", function (v) { return { area: v }; }],
    ["fHighlights", function (v) { return { highlights: parseHighlights(v) }; }],
    ["fAgent", function (v) { return { agent: v }; }],
    ["fPhone", function (v) { return { phone: v }; }]
  ];
  binds.forEach(function (b) {
    var el = $(b[0]);
    if (!el) return;
    el.addEventListener("input", function () { Reel.setData(b[1](el.value)); });
  });

  /* ---------- Stil / Format ---------- */
  function wirePills(wrapId, attr, apply) {
    var wrap = $(wrapId);
    if (!wrap) return;
    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest(".pill");
      if (!btn) return;
      var pills = wrap.querySelectorAll(".pill");
      for (var i = 0; i < pills.length; i++) pills[i].setAttribute("aria-pressed", pills[i] === btn ? "true" : "false");
      apply(btn.getAttribute(attr));
    });
  }
  wirePills("stylePills", "data-style", function (v) { Reel.setStyle(v); });
  wirePills("formatPills", "data-format", function (v) { Reel.setFormat(v); });

  /* ---------- Foto-Upload ---------- */
  var photoInput = $("photoInput"), thumbs = $("thumbs");
  var appPhotos = []; // { img, url, label }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url, label: null }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("img")); };
      img.src = url;
    });
  }
  function renderThumbs() {
    thumbs.innerHTML = "";
    appPhotos.forEach(function (p, i) {
      var d = document.createElement("div"); d.className = "thumb";
      var im = document.createElement("img"); im.src = p.url; im.alt = "Foto " + (i + 1);
      var rm = document.createElement("button"); rm.type = "button"; rm.textContent = "×";
      rm.setAttribute("aria-label", "Foto entfernen");
      rm.addEventListener("click", function () {
        URL.revokeObjectURL(p.url);
        appPhotos.splice(i, 1);
        pushPhotos();
      });
      d.appendChild(im); d.appendChild(rm); thumbs.appendChild(d);
    });
  }
  function pushPhotos() {
    renderThumbs();
    Reel.setPhotos(appPhotos.map(function (p) { return { img: p.img, label: p.label }; }));
  }
  if (photoInput) {
    photoInput.addEventListener("change", function () {
      var files = Array.prototype.slice.call(photoInput.files || []);
      if (!files.length) return;
      var room = 4 - appPhotos.length;
      if (room <= 0) { toast("Maximal 4 Fotos."); photoInput.value = ""; return; }
      var toLoad = files.slice(0, room);
      Promise.all(toLoad.map(function (f) { return loadImage(f).catch(function () { return null; }); }))
        .then(function (loaded) {
          loaded.filter(Boolean).forEach(function (p) { appPhotos.push(p); });
          pushPhotos();
          photoInput.value = "";
        });
    });
  }

  /* ---------- Musik (eingebaute Tracks + eigene Datei) ---------- */
  var audioInput = $("audioInput"), audioHint = $("audioHint"), musicPills = $("musicPills");
  var previewCtx = null, previewSrc = null, trackCache = {}, currentTrack = "";
  var TRACK_LABELS = { house: "Deep House", lofi: "Lo-Fi", cinematic: "Cinematic", corporate: "Corporate" };

  function stopPreview() {
    if (previewSrc) {
      try { previewSrc.stop(); } catch (e) {}
      try { previewSrc.disconnect(); } catch (e) {}
      previewSrc = null;
    }
  }
  function playPreviewOnce(buffer) {
    stopPreview();
    if (!buffer) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!previewCtx) previewCtx = new AC();
      if (previewCtx.state === "suspended") previewCtx.resume();
      var src = previewCtx.createBufferSource();
      src.buffer = buffer; src.loop = false;
      src.connect(previewCtx.destination);
      src.onended = function () { if (previewSrc === src) previewSrc = null; };
      src.start(0, 0, 7); // kurze 7-Sekunden-Hörprobe
      previewSrc = src;
    } catch (e) {}
  }
  function setMusicPressed(track) {
    if (!musicPills) return;
    var pills = musicPills.querySelectorAll(".pill");
    for (var i = 0; i < pills.length; i++) {
      pills[i].setAttribute("aria-pressed", pills[i].getAttribute("data-track") === track ? "true" : "false");
    }
  }
  function selectMsg(track) {
    return "„" + (TRACK_LABELS[track] || track) + "“ ausgewählt · Probe läuft · landet im Video.";
  }

  if (musicPills && window.Music) {
    musicPills.addEventListener("click", function (e) {
      var btn = e.target.closest(".pill");
      if (!btn) return;
      var track = btn.getAttribute("data-track") || "";
      currentTrack = track;
      setMusicPressed(track);
      stopPreview();
      if (audioInput) audioInput.value = "";
      if (!track) { Reel.setAudio(null); audioHint.textContent = "Ohne Musik — Video wird ohne Ton exportiert."; return; }
      if (trackCache[track]) {
        Reel.setAudio(trackCache[track]); playPreviewOnce(trackCache[track]);
        audioHint.textContent = selectMsg(track); return;
      }
      audioHint.textContent = "Track wird erzeugt …";
      Music.render(track, Reel.getTotal()).then(function (buf) {
        trackCache[track] = buf;
        if (currentTrack !== track) return; // Nutzer hat inzwischen gewechselt
        Reel.setAudio(buf); playPreviewOnce(buf);
        audioHint.textContent = selectMsg(track);
      }).catch(function () {
        if (currentTrack === track) audioHint.textContent = "Track konnte nicht erzeugt werden.";
      });
    });
  }

  /* eigene Musik-Datei (optional) */
  if (audioInput) {
    audioInput.addEventListener("change", function () {
      var file = audioInput.files && audioInput.files[0];
      if (!file) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { toast("Audio wird in diesem Browser nicht unterstützt."); return; }
      currentTrack = ""; setMusicPressed("__none__"); stopPreview();
      audioHint.textContent = "wird geladen …";
      var reader = new FileReader();
      reader.onload = function () {
        var ctx = new AC();
        ctx.decodeAudioData(reader.result)
          .then(function (buf) {
            Reel.setAudio(buf);
            audioHint.textContent = file.name + " · wird ins Video gelegt";
            try { ctx.close(); } catch (e) {}
          })
          .catch(function () {
            audioHint.textContent = "Format nicht lesbar — ohne Ton";
            Reel.setAudio(null);
            try { ctx.close(); } catch (e) {}
          });
      };
      reader.onerror = function () { audioHint.textContent = "Datei nicht lesbar — ohne Ton"; };
      reader.readAsArrayBuffer(file);
    });
  }

  /* ---------- Video-Export ---------- */
  var renderBtn = $("renderBtn"), renderStatus = $("renderStatus");
  var progWrap = $("progWrap"), progFill = $("progFill"), dlLink = $("dlLink");
  var lastUrl = null;

  function slug(s) {
    return String(s || "immoreel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "immoreel";
  }
  function statusMsg(html, isErr) {
    renderStatus.innerHTML = html;
    renderStatus.classList.toggle("err", !!isErr);
  }

  renderBtn.addEventListener("click", function () {
    if (!canvas.captureStream || !window.MediaRecorder) {
      statusMsg('<b>Export hier nicht möglich.</b> Bitte in Chrome, Edge oder Safari (aktuell) öffnen.', true);
      return;
    }
    renderBtn.disabled = true;
    dlLink.hidden = true;
    if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
    progWrap.hidden = false; progFill.style.width = "0%";
    statusMsg("Video wird gerendert … (läuft in Echtzeit ab, ~" + fmt(Reel.getTotal()) + ")");
    Reel.pause(); syncPlayIcon(); stopPreview();

    Reel.render(function (p) { progFill.style.width = (p * 100).toFixed(1) + "%"; })
      .then(function (res) {
        var ext = res.type.indexOf("mp4") !== -1 ? "mp4" : "webm";
        var st = Reel.getState();
        var name = "immoreel-" + slug(st.title) + "." + ext;
        lastUrl = URL.createObjectURL(res.blob);
        dlLink.href = lastUrl;
        dlLink.download = name;
        dlLink.hidden = false;
        var mb = (res.blob.size / 1048576).toFixed(1);
        statusMsg('<b>✓ Reel fertig</b> · <span class="mono">' + res.w + '×' + res.h + ' · ' + ext.toUpperCase() + ' · ' + mb + ' MB</span> — jetzt herunterladen.');
        progWrap.hidden = true;
        renderBtn.disabled = false;
        toast("Video fertig — auf „Herunterladen“ tippen.");
      })
      .catch(function (err) {
        progWrap.hidden = true;
        renderBtn.disabled = false;
        var msg = err && err.message === "no-capture" ? "Canvas-Aufnahme wird nicht unterstützt."
          : "Beim Rendern ist etwas schiefgelaufen. Bitte erneut versuchen.";
        statusMsg('<b>Fehler:</b> ' + msg, true);
      });
  });

  /* ---------- Toast ---------- */
  var toastEl = $("toast"), toastT = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  /* ---------- Theme-Umschalter ---------- */
  var themeBtn = $("themeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var root = document.documentElement;
      var cur = root.getAttribute("data-theme");
      var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var next = cur === "dark" ? "light" : cur === "light" ? "dark" : (prefersDark ? "light" : "dark");
      root.setAttribute("data-theme", next);
    });
  }

  /* ---------- PWA: Service Worker + Installation ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
  var installBtn = $("installBtn"), deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });
  if (installBtn) {
    installBtn.addEventListener("click", function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        installBtn.hidden = true;
      });
    });
  }
  window.addEventListener("appinstalled", function () {
    if (installBtn) installBtn.hidden = true;
    toast("ImmoReel wurde installiert.");
  });
})();
