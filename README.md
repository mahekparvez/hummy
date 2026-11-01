# hummy

A tiny, browser-only library for collecting interface moments. Press **F9** to record a selected browser tab or window, crop the useful part, add the app name and domain, and save the clip to the local gallery.

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

## Important browser behavior

- The browser must show its own screen-sharing permission dialog. A web page cannot bypass it.
- F9 works while the Hummy page is focused. Some laptops require `Fn + F9`.
- A regular screen recording is opaque. The crop mask can have transparent outside pixels in supported WebM implementations, but it cannot recover a source website's original transparency.
- The gallery uses IndexedDB, so saved clips are currently available only in the browser/device where they were saved. A shared community gallery requires storage and a submission backend, which can be added later.

## Files

- `index.html` — application markup
- `styles.css` — visual design
- `app.js` — recording, crop, export, local gallery, and downloads
