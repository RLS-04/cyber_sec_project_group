# 🔐 Secure Task Manager

A secure, modern web application for group task management — built with vanilla HTML/CSS/JS and hosted on **GitHub Pages** with a **Google Sheets** backend.

![TaskHub](https://img.shields.io/badge/TaskHub-v1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **Secure Auth** | Username/password login with SHA-256 hashing |
| 📝 **Task Upload** | Text description + screenshot with drag & drop |
| 📊 **Dashboard** | Filterable table of all team tasks |
| 👤 **My Tasks** | Personal task history view |
| 🖼️ **Lightbox** | Click screenshots to view full size |
| 📱 **Responsive** | Works on desktop, tablet, and mobile |
| ☁️ **Cloud Sync** | Google Sheets + Google Drive integration |
| 💾 **Offline Ready** | LocalStorage fallback when offline |

## 🚀 Quick Start

### Try the Demo

The app comes with pre-loaded demo data. Log in with:
- **Username**: `alice`
- **Password**: `password123`

### Deploy Your Own

See the full setup guide: [`docs/SETUP.md`](docs/SETUP.md)

**Quick steps:**
1. Fork this repository
2. Enable GitHub Pages in Settings
3. Deploy the Google Apps Script backend
4. Update the API URL in `assets/app.js`
5. Done!

## 🏗️ Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (no frameworks!)
- **Backend**: Google Apps Script (free)
- **Database**: Google Sheets (free)
- **Storage**: Google Drive (free)
- **Hosting**: GitHub Pages (free)

## 📸 Screenshots

### Login Screen
Clean, modern authentication with password visibility toggle.

### Upload Task
Drag & drop file upload with live preview and validation.

### Task Dashboard
Filterable table showing all team tasks with clickable screenshots.

## 🔒 Security

- Passwords hashed with SHA-256 + salt
- Session tokens with 24-hour expiry
- All user input is HTML-escaped (XSS protection)
- File type and size validation
- CORS headers on API endpoints

## 📁 Project Structure

```
├── index.html              # Single-page app
├── assets/
│   ├── style.css           # Complete UI styles
│   ├── app.js              # All application logic
│   └── google-apps-script.gs  # Backend (deploy to GAS)
└── docs/
    └── SETUP.md            # Deployment guide
```

## 🛠️ Development

No build tools required! Just open `index.html` in a browser.

For local development with the API, you may need to disable CORS in your browser for testing, or use a local proxy.

## 📄 License

MIT License — feel free to use, modify, and distribute.

---

Built with ❤️ for teams who need a simple, secure task tracking solution.
