# Med2AI Telehealth Portal (Provider Connectivity) 🏥📹

Welcome to the **Telehealth Portal**, the secure video connectivity bridge for the Med2AI Nexus Suite.

---

## 📑 What is this?
This is a sleek, lightweight **HTML5/JavaScript** portal designed for quick, secure provider-patient video encounters. It is optimized for:
- **Zero-Install Video**: Runs directly in any modern browser.
- **Secure Encounters**: Encrypted peer-to-peer or TURN-based video streaming.
- **Integration**: Designed to be popped out from the RPM or DCT portals.

---

## 🏗️ Architecture (Nexus Context)
The Telehealth Portal is a **Static Web App** with minimal build overhead:
- **Stack**: Vanilla HTML, CSS, and Modern JavaScript.
- **Hosting**: AWS S3 + CloudFront.
- **Backend**: Coordinates session signaling via the [Provider API](../med2ai-provider-api).

---

## 🚀 Getting Started

### 1. Local Development
Since this is a static site, you can just open `index.html` or use any simple static server (like `live-server`).
```bash
npx live-server
```

### 2. Manual Deployment (OIDC)
1.  Go to the **Actions** tab in GitHub.
2.  Select **"Deploy Telehealth Portal to S3"**.
3.  Click **Run workflow** and choose your **Target Group** (`live` or `dev`).

---

## 💎 Beginner Tips
- **No Build Step?** Exactly! This repo stays light for maximum compatibility. GHA just syncs the files directly.
- **Video Logic**: Look for `main.js` or `video.js` to see how the WebRTC/Signaling works.
- **Styling**: All CSS is in `styles.css`. We keep it clean and premium.

---
*Part of the Med2AI Clinical Suite. Managed by Med2AI Terraform.*
