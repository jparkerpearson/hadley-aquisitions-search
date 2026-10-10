# Hadley AI website

## Run and edit
- Click **Run** to start the `Website preview` workflow.
- The workflow runs `node scripts/preview.mjs` on `0.0.0.0:5000`.
- Run `npm install` on a fresh copy to install the App Storage SDK. No user-supplied secrets are needed for the website preview.
- Edit `index.html` for homepage content and `careers.html` for careers content.
- Shared branding, layout, and motion for all three pages are in `assets/site.css`; entrance/scroll motion and background video behavior are in `assets/site.js`. Careers application behavior remains in `careers.html`; contact behavior is in `assets/contact.js`.
- Optimized versions of the supplied blue/white logos and flyer imagery are in `assets/`. The original attachments remain unchanged.
- Flyer images are labeled illustrative; counts and names in them are not presented as verified client or performance claims.
- Typography uses `"Helvetica Neue", Helvetica, Arial, sans-serif` with the supplied guide's weights. Helvetica Neue is used where installed; no proprietary webfont files were supplied.
- Save your edits and refresh the Preview to see them. The server reads files on every request and disables caching; HTML/image edits do not need a restart.
- The preview server serves root HTML/PNG files and supported files directly in `assets/`, not repository configuration, original attachments, or backend source. Audio byte ranges support seeking.

## Checks
- `node scripts/check-contact.mjs` verifies contact validation, optional phone, storage-failure handling, and request/spam limits using an isolated test server.
- `node --check assets/site.js`
- `node --check scripts/preview.mjs`
- `node --experimental-websocket scripts/check-site.mjs` runs HTTP and Chromium browser checks when the preview is running. It uses temporary audio fixtures and intercepts every careers-service request so no live applications are sent.

## Contact inquiries
- Contact links open `contact.html`. Name, email, firm, and conversation notes are required; phone is optional.
- `POST /api/contact` validates requests and saves each inquiry privately in App Storage under `hadley/contact-inquiries/`. Success is returned only after a successful save.
- Inquiries are not exposed by a public read endpoint and are not written to source files or logs. Automatic email notifications are not configured.
- This form requires the Node server (`npm start`), not static-only hosting. JavaScript is required to submit; the no-JS page says so and does not expose an active form.
- Browser tests intercept contact submissions; no real inquiries are created by `npm test`.

## Mountain video
- The hero uses the four user-uploaded videos, replacing generated footage. Uploaded clip 4 leads at 2× speed, then clips 1, 2, and 3 play at normal speed. Twelve-second excerpts cut directly to the next, including at the loop back to clip 4, forming a silent 1080p loop of 48 seconds. Do not add fades.
- `npm run build:mountain` rebuilds the rotation from the source uploads. The first uploaded clip has a short black opening; its first 0.6 seconds are skipped before taking a full twelve-second excerpt. With normalized scene files present, `npm run build:mountain -- --reuse-scenes` reuses untrimmed scenes and rebuilds any trimmed scenes. Inputs and large outputs are excluded from Git and deployment. `assets/mountain-poster.webp` is a real frame from the sped-up fourth clip, used for reduced motion and playback failure.
- `assets/site.js` loads the video only when motion is allowed and the hero is visible. It supports pause/play, reduced motion, data saving, page visibility, and playback failure.
- `/media/mountain-hero.mp4` and its WebM alternative expose only the two corresponding `hadley/mountain-rotation` objects from App Storage, with byte-range support. WebM is used when MP4 decoding is unavailable. No general bucket browsing or upload endpoint is exposed.
- Both optimized video formats are uploaded and verified in this project's App Storage bucket. For a fresh project or replacement clip, create/select its bucket via **All tools → App Storage**, then run `npm run upload:mountain` and restart Preview.
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
