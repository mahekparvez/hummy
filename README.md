# hummy

A tiny library for collecting interface moments. The Hummy page is intentionally quiet: press **F9** to record the current browser tab, crop the useful part, add the app name and domain, and save the clip to the local gallery.

## Run locally

Because the recorder uses `getDisplayMedia()`, open it from `localhost` or HTTPS. A file opened directly from Finder may not be allowed to request screen capture.

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Deploy with GitHub Pages

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the default branch and the `/ (root)` folder.
5. Save and open the generated Pages URL.

GitHub Pages serves this project as static files; no build step is required.

## Global F9 capture

The `extension/` folder contains a Chrome MV3 companion. It registers F9 as a global command, records the current tab while the user scrolls, and hands the WebM clip to Hummy for cropping. Load the `extension/` folder from `chrome://extensions` with Developer mode enabled.

The page-only fallback still responds to F9 when Hummy is the focused tab. A plain GitHub Page cannot receive a global keyboard shortcut by itself.

- A regular screen recording is opaque. The crop mask can have transparent outside pixels in supported WebM implementations, but it cannot recover a source website's original transparency.
- The gallery uses IndexedDB, so saved clips are currently available only in the browser/device where they were saved. A shared community gallery requires storage and a submission backend, which can be added later.

## Files

- `index.html` — application markup
- `styles.css` — visual design
- `app.js` — recording, crop, export, local gallery, and downloads
