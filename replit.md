# Hadley AI website

## Run and edit
- Click **Run** to start the `Website preview` workflow.
- The workflow runs `node scripts/preview.mjs` on `0.0.0.0:5000`.
- No dependencies or secrets are needed for the website preview.
- Edit `index.html` for the homepage and `careers.html` for the careers page. Styles and page scripts are embedded in those files.
- Images are PNG files in the repository root.
- Save your edits and refresh the Preview to see them. The server reads files on every request and disables caching; HTML/image edits do not need a restart.
- The preview server serves only root HTML and PNG files, not repository configuration or backend source.

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
