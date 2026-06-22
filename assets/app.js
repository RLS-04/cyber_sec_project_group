/* ========================================
   SECURE TASK MANAGER - MAIN APPLICATION
   ======================================== */

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
    // Google Apps Script Web App URL (replace with your deployed script URL)
    // See setup instructions in docs/SETUP.md
    API_URL: 'https://script.google.com/macros/s/AKfycbwqtMembGr0N-BJpEprQ6PKu7dNqNSsVyy87yQ3VWivzXr8r9nbRdf-JnVL9syGHnwP/exec',

    // LocalStorage keys
    STORAGE_KEY: 'taskhub_session',
    USERS_KEY: 'taskhub_users',
    TASKS_KEY: 'taskhub_tasks',

    // Validation
    MIN_PASSWORD_LENGTH: 8,
    MAX_TASK_LENGTH: 500,
    MAX_FILE_SIZE_MB: 5,
    ALLOWED_FILE_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],

    // Retry config
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Hash a password using SHA-256 (client-side hashing for basic security)
 * In production, use bcrypt or Argon2 on the server side.
 */
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'taskhub_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Show toast notification
 */
function showToast(type, title, message, duration = 4000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Show/hide loading overlay
 */
function setLoading(show) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

/**
 * Retry wrapper for async operations
 */
async function withRetry(fn, maxRetries = CONFIG.MAX_RETRIES, delay = CONFIG.RETRY_DELAY_MS) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (i < maxRetries - 1) {
                await new Promise(r => setTimeout(r, delay * (i + 1)));
            }
        }
    }
    throw lastError;
}

// ========================================
// LOCAL STORAGE DATA LAYER
// ========================================

const DataStore = {
    // Users
    getUsers() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.USERS_KEY)) || {};
        } catch {
            return {};
        }
    },

    saveUsers(users) {
        localStorage.setItem(CONFIG.USERS_KEY, JSON.stringify(users));
    },

    getUser(username) {
        const users = this.getUsers();
        return users[username.toLowerCase()];
    },

    async addUser(username, password) {
        const users = this.getUsers();
        const key = username.toLowerCase();
        if (users[key]) return false;
        users[key] = {
            username: username,
            passwordHash: await hashPassword(password),
            createdAt: new Date().toISOString()
        };
        this.saveUsers(users);
        return true;
    },

    async validateUser(username, password) {
        const user = this.getUser(username);
        if (!user) return false;
        const hash = await hashPassword(password);
        return user.passwordHash === hash;
    },

    // Tasks
    getTasks() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.TASKS_KEY)) || [];
        } catch {
            return [];
        }
    },

    saveTasks(tasks) {
        localStorage.setItem(CONFIG.TASKS_KEY, JSON.stringify(tasks));
    },

    addTask(task) {
        const tasks = this.getTasks();
        tasks.unshift(task);
        this.saveTasks(tasks);
        return tasks;
    },

    // Session
    getSession() {
        try {
            const session = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY));
            if (session && session.expiresAt && new Date(session.expiresAt) > new Date()) {
                return session;
            }
            return null;
        } catch {
            return null;
        }
    },

    setSession(username) {
        const session = {
            username: username,
            loginAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
        };
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(session));
    },

    clearSession() {
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
    },

    // Get all unique usernames
    getAllUsernames() {
        const users = this.getUsers();
        return Object.keys(users);
    }
};

// ========================================
// GOOGLE SHEETS API INTEGRATION
// ========================================

const SheetsAPI = {
    isConfigured() {
        return CONFIG.API_URL && CONFIG.API_URL !== 'https://script.google.com/macros/s/AKfycbwqtMembGr0N-BJpEprQ6PKu7dNqNSsVyy87yQ3VWivzXr8r9nbRdf-JnVL9syGHnwP/exec';
    },

    async submitTask(task) {
        if (!this.isConfigured()) {
            // Fallback: store locally only
            console.log('Google Sheets API not configured. Storing locally only.');
            return { success: true, local: true };
        }

        return await withRetry(async () => {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'submitTask',
                    data: task
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        });
    },

    async fetchTasks() {
        if (!this.isConfigured()) return null;

        return await withRetry(async () => {
            const response = await fetch(`${CONFIG.API_URL}?action=getTasks`, {
                method: 'GET'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        });
    },

    async uploadImage(base64Image, filename) {
        if (!this.isConfigured()) return null;

        return await withRetry(async () => {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'uploadImage',
                    image: base64Image,
                    filename: filename
                })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        });
    }
};

// ========================================
// IMAGE HANDLING
// ========================================

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function compressImage(base64, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;

            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width *= ratio;
                height *= ratio;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = base64;
    });
}

// ========================================
// VALIDATION
// ========================================

const Validator = {
    username(value) {
        if (!value || value.trim().length === 0) return 'Username is required';
        if (value.trim().length < 3) return 'Username must be at least 3 characters';
        if (value.trim().length > 30) return 'Username must be at most 30 characters';
        if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Username can only contain letters, numbers, and underscores';
        return null;
    },

    password(value) {
        if (!value || value.length === 0) return 'Password is required';
        if (value.length < CONFIG.MIN_PASSWORD_LENGTH) return `Password must be at least ${CONFIG.MIN_PASSWORD_LENGTH} characters`;
        return null;
    },

    taskText(value) {
        if (!value || value.trim().length === 0) return 'Task description is required';
        if (value.trim().length > CONFIG.MAX_TASK_LENGTH) return `Task must be at most ${CONFIG.MAX_TASK_LENGTH} characters`;
        return null;
    },

    file(file) {
        if (!file) return 'Screenshot is required';
        if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) return 'Only PNG, JPG, and WEBP images are allowed';
        if (file.size > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) return `File must be smaller than ${CONFIG.MAX_FILE_SIZE_MB}MB`;
        return null;
    }
};

// ========================================
// UI STATE MANAGEMENT
// ========================================

const UI = {
    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
    },

    showTab(tabId) {
        // Update sidebar
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabId);
        });

        // Update content
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === `${tabId}-tab`);
        });
    },

    setFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        const errorEl = document.getElementById(`${fieldId}-error`);
        if (field) field.classList.toggle('error', !!message);
        if (errorEl) errorEl.textContent = message || '';
    },

    clearErrors(formId) {
        const form = document.getElementById(formId);
        form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
        form.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
    }
};

// ========================================
// AUTHENTICATION
// ========================================

async function handleLogin(e) {
    e.preventDefault();
    UI.clearErrors('login-form');

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    const usernameError = Validator.username(username);
    const passwordError = Validator.password(password);

    if (usernameError) UI.setFieldError('login-username', usernameError);
    if (passwordError) UI.setFieldError('login-password', passwordError);
    if (usernameError || passwordError) return;

    setLoading(true);

    try {
        const valid = await DataStore.validateUser(username, password);
        if (!valid) {
            UI.setFieldError('login-password', 'Invalid username or password');
            showToast('error', 'Login Failed', 'Invalid username or password');
            return;
        }

        DataStore.setSession(username);
        showToast('success', 'Welcome Back!', `Logged in as ${username}`);
        enterDashboard(username);

    } catch (err) {
        console.error('Login error:', err);
        showToast('error', 'Error', 'Something went wrong. Please try again.');
    } finally {
        setLoading(false);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    UI.clearErrors('register-form');

    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-password-confirm').value;

    const usernameError = Validator.username(username);
    const passwordError = Validator.password(password);
    let confirmError = null;

    if (password !== confirmPassword) {
        confirmError = 'Passwords do not match';
    }

    if (usernameError) UI.setFieldError('reg-username', usernameError);
    if (passwordError) UI.setFieldError('reg-password', passwordError);
    if (confirmError) UI.setFieldError('reg-password-confirm', confirmError);
    if (usernameError || passwordError || confirmError) return;

    setLoading(true);

    try {
        const added = await DataStore.addUser(username, password);
        if (!added) {
            UI.setFieldError('reg-username', 'Username already exists');
            showToast('warning', 'Registration Failed', 'Username already taken');
            return;
        }

        DataStore.setSession(username);
        showToast('success', 'Account Created!', `Welcome, ${username}!`);
        enterDashboard(username);

    } catch (err) {
        console.error('Registration error:', err);
        showToast('error', 'Error', 'Failed to create account. Please try again.');
    } finally {
        setLoading(false);
    }
}

function handleLogout() {
    DataStore.clearSession();
    UI.showView('login-view');
    document.getElementById('login-form').reset();
    showToast('info', 'Logged Out', 'See you next time!');
}

function enterDashboard(username) {
    document.getElementById('current-user').textContent = username;
    UI.showView('dashboard-view');
    UI.showTab('upload');
    refreshAllData();
}

// ========================================
// TASK UPLOAD
// ========================================

let currentFile = null;

function setupFileUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('task-screenshot');
    const placeholder = document.getElementById('upload-placeholder');
    const preview = document.getElementById('upload-preview');
    const previewImg = document.getElementById('preview-img');
    const fileName = document.getElementById('file-name');
    const removeBtn = document.getElementById('remove-file');

    // Click to upload
    dropZone.addEventListener('click', () => fileInput.click());

    // File selected
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'));
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'));
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    // Remove file
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentFile = null;
        fileInput.value = '';
        placeholder.classList.remove('hidden');
        preview.classList.add('hidden');
        UI.setFieldError('task-screenshot', null);
    });

    async function handleFileSelect(file) {
        const error = Validator.file(file);
        if (error) {
            UI.setFieldError('task-screenshot', error);
            return;
        }

        UI.setFieldError('task-screenshot', null);
        currentFile = file;

        try {
            const base64 = await fileToBase64(file);
            previewImg.src = base64;
            fileName.textContent = file.name;
            placeholder.classList.add('hidden');
            preview.classList.remove('hidden');
        } catch (err) {
            showToast('error', 'File Error', 'Could not read the selected file');
        }
    }
}

async function handleTaskUpload(e) {
    e.preventDefault();
    UI.clearErrors('upload-form');

    const taskText = document.getElementById('task-text').value.trim();
    const session = DataStore.getSession();

    const textError = Validator.taskText(taskText);
    const fileError = Validator.file(currentFile);

    if (textError) UI.setFieldError('task-text', textError);
    if (fileError) UI.setFieldError('task-screenshot', fileError);
    if (textError || fileError) return;

    if (!session) {
        showToast('error', 'Session Expired', 'Please log in again');
        handleLogout();
        return;
    }

    setLoading(true);

    try {
        // Compress image
        const base64Original = await fileToBase64(currentFile);
        const base64Compressed = await compressImage(base64Original);

        // Try to upload to Google Drive via API
        let screenshotUrl = base64Compressed;
        if (SheetsAPI.isConfigured()) {
            try {
                const uploadResult = await SheetsAPI.uploadImage(
                    base64Compressed,
                    `task_${session.username}_${Date.now()}.jpg`
                );
                if (uploadResult && uploadResult.url) {
                    screenshotUrl = uploadResult.url;
                }
            } catch (err) {
                console.warn('Image upload to cloud failed, using base64:', err);
            }
        }

        const task = {
            id: generateId(),
            date: new Date().toISOString(),
            username: session.username,
            task: taskText,
            screenshot: screenshotUrl,
            synced: SheetsAPI.isConfigured()
        };

        // Save locally
        DataStore.addTask(task);

        // Try to sync with Google Sheets
        if (SheetsAPI.isConfigured()) {
            try {
                await SheetsAPI.submitTask(task);
                showToast('success', 'Task Uploaded', 'Your task has been saved and synced!');
            } catch (err) {
                console.warn('Sync failed, stored locally:', err);
                showToast('warning', 'Saved Locally', 'Task saved locally. Will sync when connection is restored.');
            }
        } else {
            showToast('success', 'Task Uploaded', 'Your task has been saved successfully!');
        }

        // Reset form
        document.getElementById('upload-form').reset();
        currentFile = null;
        document.getElementById('upload-placeholder').classList.remove('hidden');
        document.getElementById('upload-preview').classList.add('hidden');
        document.getElementById('char-count').textContent = '0';

        refreshAllData();

    } catch (err) {
        console.error('Upload error:', err);
        showToast('error', 'Upload Failed', 'Could not save your task. Please try again.');
    } finally {
        setLoading(false);
    }
}

// ========================================
// DASHBOARD & TABLES
// ========================================

function refreshAllData() {
    renderTasksTable();
    renderMyTasksTable();
    updateUserFilter();
    updateTaskCount();
}

function updateTaskCount() {
    const tasks = DataStore.getTasks();
    document.getElementById('task-count').textContent = tasks.length;
}

function updateUserFilter() {
    const select = document.getElementById('filter-user');
    const currentVal = select.value;
    const usernames = DataStore.getAllUsernames();

    select.innerHTML = '<option value="">All Members</option>';
    usernames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });

    select.value = currentVal;
}

function renderTasksTable() {
    const tasks = DataStore.getTasks();
    const filterDate = document.getElementById('filter-date').value;
    const filterUser = document.getElementById('filter-user').value;

    const tbody = document.getElementById('tasks-tbody');
    const noTasks = document.getElementById('no-tasks');

    let filtered = [...tasks];

    if (filterDate) {
        const filterDateStr = new Date(filterDate).toDateString();
        filtered = filtered.filter(t => new Date(t.date).toDateString() === filterDateStr);
    }

    if (filterUser) {
        filtered = filtered.filter(t => t.username.toLowerCase() === filterUser.toLowerCase());
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        noTasks.classList.remove('hidden');
        return;
    }

    noTasks.classList.add('hidden');

    tbody.innerHTML = filtered.map(task => `
        <tr>
            <td>${formatDate(task.date)}</td>
            <td>${formatTime(task.date)}</td>
            <td><span class="user-badge">${escapeHtml(task.username)}</span></td>
            <td class="task-text-cell">${escapeHtml(task.task)}</td>
            <td>
                ${task.screenshot ? `
                    <img src="${task.screenshot}" 
                         class="screenshot-thumb" 
                         alt="Screenshot"
                         data-full="${task.screenshot}"
                         data-caption="${escapeHtml(task.task.substring(0, 50))}${task.task.length > 50 ? '...' : ''}"
                         onclick="openLightbox(this)">
                ` : '<span class="no-screenshot">No image</span>'}
            </td>
        </tr>
    `).join('');
}

function renderMyTasksTable() {
    const tasks = DataStore.getTasks();
    const session = DataStore.getSession();

    if (!session) return;

    const myTasks = tasks.filter(t => t.username.toLowerCase() === session.username.toLowerCase());
    const tbody = document.getElementById('my-tasks-tbody');
    const noTasks = document.getElementById('no-my-tasks');

    if (myTasks.length === 0) {
        tbody.innerHTML = '';
        noTasks.classList.remove('hidden');
        return;
    }

    noTasks.classList.add('hidden');

    tbody.innerHTML = myTasks.map(task => `
        <tr>
            <td>${formatDate(task.date)}</td>
            <td>${formatTime(task.date)}</td>
            <td class="task-text-cell">${escapeHtml(task.task)}</td>
            <td>
                ${task.screenshot ? `
                    <img src="${task.screenshot}" 
                         class="screenshot-thumb" 
                         alt="Screenshot"
                         data-full="${task.screenshot}"
                         data-caption="${escapeHtml(task.task.substring(0, 50))}${task.task.length > 50 ? '...' : ''}"
                         onclick="openLightbox(this)">
                ` : '<span class="no-screenshot">No image</span>'}
            </td>
        </tr>
    `).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// LIGHTBOX
// ========================================

function openLightbox(img) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');

    lightboxImg.src = img.dataset.full || img.src;
    lightboxCaption.textContent = img.dataset.caption || '';
    lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.add('hidden');
    document.body.style.overflow = '';
}

// ========================================
// EVENT LISTENERS
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Check existing session
    const session = DataStore.getSession();
    if (session) {
        enterDashboard(session.username);
    } else {
        UI.showView('login-view');
    }

    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Register form
    document.getElementById('register-form').addEventListener('submit', handleRegister);

    // Toggle views
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        UI.showView('register-view');
        document.getElementById('register-form').reset();
        UI.clearErrors('register-form');
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        UI.showView('login-view');
        document.getElementById('login-form').reset();
        UI.clearErrors('login-form');
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            UI.showTab(item.dataset.tab);
            if (item.dataset.tab === 'tasks') renderTasksTable();
            if (item.dataset.tab === 'my-tasks') renderMyTasksTable();
        });
    });

    // Upload form
    document.getElementById('upload-form').addEventListener('submit', handleTaskUpload);

    // File upload setup
    setupFileUpload();

    // Character counter
    document.getElementById('task-text').addEventListener('input', (e) => {
        const count = e.target.value.length;
        document.getElementById('char-count').textContent = count;
        if (count > CONFIG.MAX_TASK_LENGTH) {
            e.target.value = e.target.value.substring(0, CONFIG.MAX_TASK_LENGTH);
            document.getElementById('char-count').textContent = CONFIG.MAX_TASK_LENGTH;
        }
    });

    // Password visibility toggle
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            const isPassword = target.type === 'password';
            target.type = isPassword ? 'text' : 'password';
            btn.innerHTML = isPassword 
                ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
                : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        });
    });

    // Filters
    document.getElementById('filter-date').addEventListener('change', renderTasksTable);
    document.getElementById('filter-user').addEventListener('change', renderTasksTable);
    document.getElementById('clear-filters').addEventListener('click', () => {
        document.getElementById('filter-date').value = '';
        document.getElementById('filter-user').value = '';
        renderTasksTable();
    });

    // Lightbox
    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-overlay').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
    });

    // Demo data (for first-time users)
    seedDemoData();
});

// ========================================
// DEMO DATA
// ========================================

function seedDemoData() {
    const users = DataStore.getUsers();
    if (Object.keys(users).length === 0) {
        // Create demo accounts
        DataStore.addUser('alice', 'password123');
        DataStore.addUser('bob', 'password123');
        DataStore.addUser('charlie', 'password123');

        // Create demo tasks
        const demoTasks = [
            {
                id: generateId(),
                date: new Date(Date.now() - 86400000).toISOString(),
                username: 'alice',
                task: 'Completed the user authentication module with JWT tokens and session management. Implemented password hashing using bcrypt.',
                screenshot: 'https://via.placeholder.com/400x300/4f46e5/ffffff?text=Auth+Module+Screenshot',
                synced: false
            },
            {
                id: generateId(),
                date: new Date(Date.now() - 172800000).toISOString(),
                username: 'bob',
                task: 'Designed the database schema for the project management system. Created ER diagrams and normalized tables.',
                screenshot: 'https://via.placeholder.com/400x300/10b981/ffffff?text=DB+Schema+Design',
                synced: false
            },
            {
                id: generateId(),
                date: new Date(Date.now() - 259200000).toISOString(),
                username: 'charlie',
                task: 'Set up CI/CD pipeline with GitHub Actions. Automated testing and deployment workflows configured.',
                screenshot: 'https://via.placeholder.com/400x300/f59e0b/ffffff?text=CI+CD+Pipeline',
                synced: false
            },
            {
                id: generateId(),
                date: new Date(Date.now() - 43200000).toISOString(),
                username: 'alice',
                task: 'Fixed responsive layout issues on mobile devices. Adjusted breakpoints and flexbox containers.',
                screenshot: 'https://via.placeholder.com/400x300/ef4444/ffffff?text=Mobile+Fixes',
                synced: false
            }
        ];

        localStorage.setItem(CONFIG.TASKS_KEY, JSON.stringify(demoTasks));

        console.log('✅ Demo data seeded! Try logging in with: alice / password123');
    }
}
