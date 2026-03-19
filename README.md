# Med2AI Nexus — Web Clinician Portal

A browser-based telehealth portal that lets clinicians join Med2AI video consultations from **any device** without installing the app.

## Features
- 🔐 HIPAA-compliant, end-to-end encrypted via Agora RTC
- 📹 Full video/audio calling with mic and camera controls
- 🔗 Room code auto-fill from URL params (`?code=ABC123`)
- 🩺 Premium dark medical UI with glassmorphism
- 📱 Responsive design (desktop + mobile browsers)

## Architecture
```
Patient (Mobile App)  ←→  Agora Cloud  ←→  Provider (Web Browser)
         ↓                                        ↓
    Token Server (https://med2ai-agora-token.onrender.com)
```

## Quick Start
```bash
# Serve locally
python -m http.server 9090
# Open http://localhost:9090
```

## Deploy to Render
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Static Site
3. Connect your GitHub repo
4. Set **Publish Directory** to `.` (root)
5. Deploy → your portal is live at `https://med2ai-portal.onrender.com`

## Configuration
Edit `app.js` line 8-9 to update:
- `appId` — Your Agora App ID
- `tokenServerUrl` — Your Agora token server URL
