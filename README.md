# hummy

A tiny library for collecting interface moments. The Hummy page is intentionally quiet: press **F9** while Hummy is focused to record, crop the useful part, categorize it as an app, website, or Chrome extension, and save it to the local gallery.

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

## Capture behavior

- F9 is handled by the Hummy page while that page is focused. A plain GitHub Page cannot receive a global keyboard shortcut from another tab.
- The app/website/Chrome extension dropdown is a design category saved with each clip; it is not a browser extension.
- A regular screen recording is opaque. The crop mask can have transparent outside pixels in supported WebM implementations, but it cannot recover a source website's original transparency.
- The gallery uses IndexedDB, so saved clips are currently available only in the browser/device where they were saved. A shared community gallery requires storage and a submission backend.

## Files

- `index.html` — application markup
- `styles.css` — visual design
- `app.js` — recording, crop, export, local gallery, and downloads
