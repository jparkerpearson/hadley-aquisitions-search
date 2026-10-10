# Hadley AI website

## Run and edit
- Click **Run** to start the `Website preview` workflow.
- The workflow runs `node scripts/preview.mjs` on `0.0.0.0:5000`.
- Run `npm install` on a fresh copy to install the App Storage SDK. No user-supplied secrets are needed for the website preview.
- Edit `index.html` for homepage content and `careers.html` for careers content.
- Shared branding, layout, and motion are in `assets/site.css`; entrance/scroll motion and the voicemail source setting are in `assets/site.js`. Careers form-specific styles and submission behavior remain in `careers.html`.
- Optimized versions of the supplied blue/white logos and flyer imagery are in `assets/`. The original attachments remain unchanged.
- Typography uses `"Helvetica Neue", Helvetica, Arial, sans-serif` with the supplied guide's weights. Helvetica Neue is used where installed; no proprietary webfont files were supplied.
- Save your edits and refresh the Preview to see them. The server reads files on every request and disables caching; HTML/image edits do not need a restart.
- The preview server serves root HTML/PNG files and supported files directly in `assets/`, not repository configuration, original attachments, or backend source. Audio byte ranges support seeking.

## Add a voicemail recording
1. Add an approved MP3, WAV, OGG, or M4A recording directly under `assets/`, for example `assets/hadley-voicemail.mp3`. Use a simple filename with letters, numbers, hyphens, or underscores.
2. Set `HADLEY_VOICEMAIL_SOURCE` near the top of `assets/site.js` to `"assets/hadley-voicemail.mp3"`.
3. Save and refresh Preview. Native audio controls appear when configured; a failed source shows an error instead of a pretend recording. Leave the setting empty to retain the honest unavailable state.
- Do not use a real person's recording without appropriate permission. No audio sample is included or generated.
- Large durable recordings belong in App Storage rather than Git; use an authorized public asset URL for the source when appropriate.
- Flyer images are labeled illustrative; counts and names in them are not presented as verified client or performance claims.

## Checks
- `node --check assets/site.js`
- `node --check scripts/preview.mjs`
- `node --experimental-websocket scripts/check-site.mjs` runs HTTP and Chromium browser checks when the preview is running. It uses temporary audio fixtures and intercepts every careers-service request so no live applications are sent.

## Mountain video
- The hero uses an original generated 1080p silent mountain flyover, optimized to about seven seconds with noticeable forward travel over the ridge. `assets/mountain-poster.webp` is its real still-image fallback.
- `assets/site.js` loads the video only when motion is allowed and the hero is visible. It supports pause/play, reduced motion, data saving, page visibility, and playback failure.
- `/media/mountain-hero.mp4` and its WebM alternative expose only the two corresponding `hadley/mountain-hero` objects from App Storage, with byte-range support. WebM is used when MP4 decoding is unavailable. No general bucket browsing or upload endpoint is exposed.
- **Storage setup is required before publishing:** create a bucket via **All tools → App Storage → Create new bucket**, then run `npm run upload:mountain`. The command uploads and verifies the optimized file. Restart Preview afterward.
- Preview may use the local generated file while no bucket is configured. That path prints a warning and is only for development; `/generated-artifacts/` is excluded from Git and deployment.
- On a new hosting environment outside Replit, provide the video through that host's media storage and update the hero's `data-video-src`; Replit App Storage authentication is Replit-specific.

## Existing careers service
- `careers-intake/` is the separate Node.js / Google Firestore application-intake service.
- The careers form still uses its existing Google Cloud endpoint. Previewing the site does not run or reconfigure that backend.
- That backend's default allowed origins cover the production website, not the Replit preview. Submitting from the preview may be blocked by its cross-origin policy. Do not submit test applications to the live service without approval.
- Running the intake service locally would require Google Cloud authentication and access to the existing Firestore database. Do not replace the database or invent credentials.

## Git and publishing
- This workspace is an editable copy of the imported GitHub repository, not automatic live synchronization with GitHub.
- Use Git to pull updates and commit/push your changes when ready.
- Preview edits do not change the public website. Publishing or updating the existing hosting is a separate action.
- Keep the existing static HTML structure and separate intake service; no framework migration is needed to edit this site.
