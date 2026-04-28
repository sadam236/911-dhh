# 911-DHH

911-DHH is an emergency support web app for Deaf and Hard-of-Hearing users. It gives a caller a fast, camera-first interface to send an emergency alert and begin visual communication, while an emergency officer and a backup viewer can monitor the caller video from separate pages.

## What It Does

- Shows the caller camera first for fast emergency use
- Lets the caller send one emergency alert with a single button
- Shares location and medical profile details with emergency services
- Supports a main officer video connection
- Supports a secondary backup viewer for monitoring critical situations

## Pages

- `/` - caller emergency interface
- `/admin` - main emergency officer page
- `/backup` - backup viewer page

## Quick Start

### Requirements

- Node.js 20 or newer

### Run Locally

1. Open a terminal in this project folder.
2. Start the server:

```bash
npm start
```

3. Open these URLs in your browser:

- Caller: [http://127.0.0.1:3000/](http://127.0.0.1:3000/)
- Main officer: [http://127.0.0.1:3000/admin](http://127.0.0.1:3000/admin)
- Backup viewer: [http://127.0.0.1:3000/backup](http://127.0.0.1:3000/backup)

### Syntax Check

```bash
npm run check
```

## Demo Flow

1. Open the caller page.
2. Allow camera access.
3. Click `Send Emergency Alert`.
4. Open the officer page and answer the call.
5. Open the backup page to monitor the same caller video.

## Project Structure

- [index.html](/Users/sadam.mohamed/911-dhh/index.html) - caller interface
- [app.js](/Users/sadam.mohamed/911-dhh/app.js) - caller logic and WebRTC signaling
- [admin.html](/Users/sadam.mohamed/911-dhh/admin.html) - emergency officer UI
- [admin.js](/Users/sadam.mohamed/911-dhh/admin.js) - emergency officer logic
- [backup.html](/Users/sadam.mohamed/911-dhh/backup.html) - backup viewer UI
- [backup.js](/Users/sadam.mohamed/911-dhh/backup.js) - backup viewer logic
- [styles.css](/Users/sadam.mohamed/911-dhh/styles.css) - shared styles
- [server.js](/Users/sadam.mohamed/911-dhh/server.js) - Node server and in-memory signaling backend

## Technical Notes

- The backend uses Node's built-in `http` module
- No database is required for the current demo
- Calls and signaling state are stored in memory only
- If the server restarts, active call data is cleared

## Accessibility Goal

This interface is intentionally simple for emergency use:

- camera first
- one main emergency action
- minimal choices on the caller page
- clear request progress

The design is meant to reduce confusion and support facial expression and sign-language communication.

## Known Limitations

- In-memory data only, so calls are not persistent
- No authentication yet
- Demo-grade WebRTC signaling
- Best used on localhost or a deployment with HTTPS for camera access

## Deployment Notes

For public deployment, use a Node-friendly host such as Render or Railway.

Recommended production checklist:

- deploy `server.js` as the web service entry point
- expose port `3000` or use the platform `PORT` variable
- serve over HTTPS so camera access works
- test `/`, `/admin`, and `/backup`

### Render Deployment

1. Push this project to GitHub.
2. Create a new Web Service in Render.
3. Connect the GitHub repository.
4. Use these settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. After deployment, open:
   - `/`
   - `/admin`
   - `/backup`

This project also includes a [render.yaml](/Users/sadam.mohamed/911-dhh/render.yaml) file for simple setup.

## GitHub Quick Steps

From the project folder:

```bash
git init
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## Submission Summary

This project focuses on emergency accessibility for Deaf and Hard-of-Hearing users. The core idea is to let the user act quickly, show the camera first, and start emergency communication with minimal friction.
