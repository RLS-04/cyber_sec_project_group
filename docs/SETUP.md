# Secure Task Manager - Setup Guide

## Overview

This guide walks you through deploying the **Secure Task Manager** web application to **GitHub Pages** with a **Google Sheets** backend for data storage.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GitHub Pages   │────▶│ Google Apps Script │────▶│  Google Sheets  │
│  (Frontend)     │     │    (Backend)       │     │  (Database)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                        │
         │                        ▼
         │               ┌──────────────────┐
         │               │  Google Drive    │
         │               │ (Image Storage)  │
         │               └──────────────────┘
         ▼
┌─────────────────┐
│  LocalStorage   │
│ (Auth & Cache)  │
└─────────────────┘
```

---

## Step 1: Prepare Your GitHub Repository

### 1.1 Create a New Repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `secure-task-manager` (or any name you prefer)
3. Make it **Public** (required for GitHub Pages free hosting)
4. Click **Create repository**

### 1.2 Upload the Files

Upload these files to your repository:

```
secure-task-manager/
├── index.html          # Main application
├── assets/
│   ├── style.css       # All styles
│   └── app.js          # All JavaScript logic
└── README.md           # Project description
```

**Method A: Git CLI**
```bash
git clone https://github.com/YOUR_USERNAME/secure-task-manager.git
cd secure-task-manager
# Copy the files from this project into the folder
git add .
git commit -m "Initial commit"
git push origin main
```

**Method B: GitHub Web Interface**
1. Click **"Add file" → "Upload files"**
2. Drag and drop all files
3. Commit with message "Initial commit"

---

## Step 2: Enable GitHub Pages

1. In your repository, go to **Settings** (top right)
2. Scroll down to **Pages** in the left sidebar
3. Under **Source**, select **Deploy from a branch**
4. Select **main** branch and **/ (root)** folder
5. Click **Save**
6. Wait 1-2 minutes, then visit the URL shown (e.g., `https://yourusername.github.io/secure-task-manager`)

---

## Step 3: Set Up Google Sheets Backend

### 3.1 Create the Google Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **New project** (blank project)
3. Delete the default `myFunction()` code
4. Copy the entire contents of `assets/google-apps-script.gs` from this project
5. Paste it into the Apps Script editor
6. Click **Save** (disk icon) and name it "TaskHub Backend"

### 3.2 Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ next to "Type" and select **Web app**
3. Configure:
   - **Description**: `TaskHub API v1`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` (this allows your GitHub Pages site to call the API)
4. Click **Deploy**
5. Review permissions (click through Google's authorization screens)
6. **Copy the Web App URL** (looks like: `https://script.google.com/macros/s/AKfycb.../exec`)

### 3.3 Connect Frontend to Backend

1. Open `assets/app.js` in your GitHub repository
2. Find this line:
   ```javascript
   API_URL: 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE',
   ```
3. Replace with your actual Web App URL:
   ```javascript
   API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
   ```
4. Commit the change:
   ```bash
   git add assets/app.js
   git commit -m "Connect to Google Sheets API"
   git push origin main
   ```
5. Wait 1-2 minutes for GitHub Pages to rebuild

---

## Step 4: Verify Everything Works

### 4.1 Test the App

1. Visit your GitHub Pages URL
2. You should see the login screen
3. Try the **demo account**: `alice` / `password123`
4. Navigate to "All Tasks" to see demo data
5. Try uploading a new task with a screenshot

### 4.2 Check Google Sheets

1. Go to [sheets.google.com](https://sheets.google.com)
2. Look for a spreadsheet named **"TaskHub Database"**
3. Open it — you should see your submitted tasks!
4. Check Google Drive for a folder named **"TaskHub Screenshots"** with uploaded images

---

## Security Notes

| Feature | Implementation |
|---------|---------------|
| **Password Hashing** | SHA-256 with salt (client-side) |
| **Session Management** | SessionStorage with 24h expiry |
| **Input Validation** | Client-side + server-side validation |
| **XSS Protection** | HTML escaping for all user content |
| **CORS** | Configured in Google Apps Script |
| **Image Storage** | Google Drive with controlled permissions |

> ⚠️ **Important**: For production use, consider adding server-side password validation and rate limiting in the Google Apps Script.

---

## Troubleshooting

### "API not configured" warning
- You haven't set the `API_URL` in `app.js` yet. Follow Step 3.3.

### Images not uploading to Google Drive
- Check that the Google Apps Script has permission to access Drive
- Verify the Web App deployment settings

### CORS errors in browser console
- Make sure the Web App is deployed with "Execute as: Me" and "Access: Anyone"
- Try redeploying the Web App

### Tasks not appearing in the table
- Check browser console for errors
- Verify the Google Sheet exists and has the correct headers

---

## File Structure

```
secure-task-manager/
├── index.html                    # Single-page application
├── assets/
│   ├── style.css                 # Complete stylesheet
│   ├── app.js                    # Application logic
│   └── google-apps-script.gs     # Backend code (deploy to GAS)
├── docs/
│   └── SETUP.md                  # This guide
└── README.md                     # Project overview
```

---

## Features Summary

- ✅ Username/password authentication with hashed passwords
- ✅ Task upload with text + screenshot
- ✅ Drag & drop file upload with preview
- ✅ Client-side validation (file type, size, text length)
- ✅ All tasks table with date/user filters
- ✅ Personal "My Tasks" view
- ✅ Clickable screenshot thumbnails with lightbox
- ✅ Responsive design (mobile-friendly)
- ✅ Toast notifications for all actions
- ✅ Error handling with retry logic
- ✅ Demo data pre-loaded for testing
- ✅ Works offline (localStorage fallback)
- ✅ Syncs with Google Sheets when online
