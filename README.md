# ImmoReel Studio

Vollautomatischer Reel-Generator für Immobilienmakler — **Objektdaten + Fotos rein → fertiges Video raus.**
Reine Progressive Web App (PWA), kein Backend, kein Upload: das Video wird **lokal im Browser** per
Canvas + MediaRecorder gerendert.

## Starten (lokal)

```bash
cd ~/Claude/immoreel
python3 -m http.server 8123
```

Dann im Browser öffnen: <http://localhost:8123>

> Ein lokaler Server ist nötig (nicht `file://` öffnen), weil Service Worker & PWA-Installation
> einen echten HTTP-Ursprung brauchen. `localhost` gilt als sicherer Kontext.

## Was funktioniert

- **Live-Vorschau** auf Canvas — baut sich sofort aus den Formulardaten neu.
- **3 Stile** (Modern / Luxus / Minimal) und **3 Formate** (9:16 Reel, 1:1 Feed, 16:9 YouTube).
- **Fotos** hochladen (bis 4) — sonst Beispiel-Flächen. **Musik** optional (wird in den Export gemischt).
- **Echter Video-Export** → MP4 (oder WebM je nach Browser), Download-Button.
- **Installierbar** als App (Manifest + Icons), **offline** nutzbar (Service Worker cached App-Shell).

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | App-Shell, Formular, Vorschau, Steuerung |
| `styles.css` | Oberfläche (Theme-fähig, responsiv) |
| `reel.js` | Canvas-Video-Engine (zeichnet Szenen, treibt Vorschau + Export) |
| `app.js` | UI-Logik, Uploads, Export, PWA |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA-Installation & Offline |

## Nächste Schritte (optional)

- **Deployment** (z. B. GitHub Pages), damit die App auf dem Handy installierbar ist.
- Mehr Stile / Musik-Bibliothek / KI-Voiceover (ElevenLabs).
- Server-Render (Remotion Lambda) für höhere Qualität & Batch-Export.
