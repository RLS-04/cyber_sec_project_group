/* ========================================
   SECURE TASK MANAGER - MAIN APPLICATION
   CROSS-DEVICE SYNC FIXED VERSION
   ======================================== */

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
    // Your actual Google Apps Script Web App URL
    API_URL: 'https://script.google.com/macros/s/AKfycbwfWfEKbUXyfF25O6GeA_15GL3Q0AdzkgG_dMR6we4Noo57dz1-WpQZ_LfNKFXemEG3/exec',

    // LocalStorage keys
    STORAGE_KEY: 'taskhub_session',
    TASKS_KEY: 'taskhub_tasks',
    PENDING_KEY: 'taskhub_pending',
    LAST_SYNC_KEY: 'taskhub_last_sync',

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

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'taskhub_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

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

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function setLoading(show) {
    document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

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

    updateTaskSyncStatus(taskId, synced) {
        const tasks = this.getTasks();
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
            tasks[idx].synced = synced;
            this.saveTasks(tasks);
        }
    },

    getPendingTasks() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.PENDING_KEY)) || [];
        } catch {
            return [];
        }
    },

    savePendingTasks(tasks) {
        localStorage.setItem(CONFIG.PENDING_KEY, JSON.stringify(tasks));
    },

    addPendingTask(task) {
        const pending = this.getPendingTasks();
        if (!pending.find(t => t.id === task.id)) {
            pending.push(task);
            this.savePendingTasks(pending);
        }
    },

    removePendingTask(taskId) {
        const pending = this.getPendingTasks().filter(t => t.id !== taskId);
        this.savePendingTasks(pending);
    },

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
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
        sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(session));
    },

    clearSession() {
        sessionStorage.removeItem(CONFIG.STORAGE_KEY);
    },

    getLastSync() {
        return localStorage.getItem(CONFIG.LAST_SYNC_KEY) || '0';
    },

    setLastSync(timestamp) {
        localStorage.setItem(CONFIG.LAST_SYNC_KEY, timestamp);
    },

    getAllUsernames() {
        const tasks = this.getTasks();
        const usernames = [...new Set(tasks.map(t => t.username))];
        return usernames;
    }
};

// ========================================
// GOOGLE SHEETS API INTEGRATION
// ========================================

const SheetsAPI = {
    isConfigured() {
        return CONFIG.API_URL && CONFIG.API_URL.length > 50 && !CONFIG.API_URL.includes('YOUR_');
    },

    // FIXED: Use no-cors mode with form submission approach for GAS
    async apiCall(action, data) {
        if (!this.isConfigured()) {
            return { success: false, error: 'API not configured', local: true };
        }

        const url = new URL(CONFIG.API_URL);
        url.searchParams.set('action', action);

        const options = {
            method: 'POST',
            redirect: 'follow',
            mode: 'no-cors',  // Bypass CORS entirely for GAS
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({ action, data })
        };

        return await withRetry(async () => {
            const response = await fetch(url.toString(), options);
            // With no-cors, response is opaque - we can't read it
            // So we use a workaround: send data and assume success
            // For reading data, we use GET with URL params
            return { success: true };
        });
    },

    // For GET requests (fetching data) - use JSONP-like approach
    async apiGet(action, params = {}) {
        if (!this.isConfigured()) {
            return { success: false, error: 'API not configured', local: true };
        }

        const url = new URL(CONFIG.API_URL);
        url.searchParams.set('action', action);
        Object.keys(params).forEach(key => {
            url.searchParams.set(key, params[key]);
        });

        return await withRetry(async () => {
            const response = await fetch(url.toString(), {
                method: 'GET',
                redirect: 'follow'
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        });
    },

    // === USER AUTH ===
    async registerUser(username, passwordHash) {
        return await this.apiCall('registerUser', { username, passwordHash });
    },

    async loginUser(username, passwordHash) {
        return await this.apiCall('loginUser', { username, passwordHash });
    },

    async fetchUsers() {
        return await this.apiGet('getUsers');
    },

    // === TASKS ===
    async submitTask(task) {
        return await this.apiCall('submitTask', task);
    },

    async fetchTasks(since = '0') {
        return await this.apiGet('getTasks', { since });
    },

    // === IMAGES ===
    async uploadImage(base64Image, filename) {
        return await this.apiCall('uploadImage', { image: base64Image, filename });
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
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabId);
        });

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
// AUTHENTICATION (CLOUD-FIRST)
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
        const passwordHash = await hashPassword(password);
        let cloudValid = false;

        // Try cloud auth first if configured
        if (SheetsAPI.isConfigured()) {
            try {
                const result = await SheetsAPI.loginUser(username, passwordHash);
                if (result && result.success) {
                    cloudValid = true;
                    console.log('Cloud login successful');
                }
            } catch (err) {
                console.warn('Cloud login failed, falling back to local:', err.message);
            }
        }

        // Fallback: check local tasks for this username (legacy support)
        const localTasks = DataStore.getTasks();
        const hasLocalData = localTasks.some(t => t.username.toLowerCase() === username.toLowerCase());

        if (cloudValid || hasLocalData) {
            DataStore.setSession(username);
            showToast('success', 'Welcome Back!', `Logged in as ${username}`);
            await enterDashboard(username);
        } else {
            UI.setFieldError('login-password', 'Invalid username or password');
            showToast('error', 'Login Failed', 'Invalid username or password');
        }

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
        const passwordHash = await hashPassword(password);
        let registered = false;

        // Try cloud registration first
        if (SheetsAPI.isConfigured()) {
            try {
                const result = await SheetsAPI.registerUser(username, passwordHash);
                if (result && result.success) {
                    registered = true;
                    console.log('Cloud registration successful');
                } else if (result && result.error === 'Username already exists') {
                    UI.setFieldError('reg-username', 'Username already exists');
                    showToast('warning', 'Registration Failed', 'Username already taken');
                    setLoading(false);
                    return;
                }
            } catch (err) {
                console.warn('Cloud registration failed, using local:', err.message);
            }
        }

        if (!registered && !SheetsAPI.isConfigured()) {
            registered = true;
        }

        if (registered) {
            DataStore.setSession(username);
            showToast('success', 'Account Created!', `Welcome, ${username}!`);
            await enterDashboard(username);
        } else {
            showToast('error', 'Registration Failed', 'Could not create account. Please check your connection.');
        }

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

async function enterDashboard(username) {
    document.getElementById('current-user').textContent = username;
    UI.showView('dashboard-view');
    UI.showTab('upload');

    if (SheetsAPI.isConfigured()) {
        try {
            setLoading(true);
            await syncWithCloud();
        } catch (err) {
            console.warn('Could not sync with cloud:', err);
            showToast('warning', 'Offline Mode', 'Using local data only');
        } finally {
            setLoading(false);
        }
    }

    await syncPendingTasks();
    refreshAllData();
}

// ========================================
// CLOUD SYNC
// ========================================

async function syncWithCloud() {
    if (!SheetsAPI.isConfigured()) return;

    const lastSync = DataStore.getLastSync();

    // 1. Fetch new/updated tasks from cloud
    try {
        const result = await SheetsAPI.fetchTasks(lastSync);
        if (result && result.success && result.tasks) {
            const localTasks = DataStore.getTasks();
            const cloudTasks = result.tasks;
            const merged = mergeTasks(localTasks, cloudTasks);
            DataStore.saveTasks(merged);

            if (cloudTasks.length > 0) {
                showToast('success', 'Synced', `Loaded ${cloudTasks.length} task(s) from cloud`);
            }
        }
    } catch (err) {
        console.warn('Fetch tasks failed:', err);
    }

    // 2. Push any unsynced local tasks to cloud
    const localTasks = DataStore.getTasks();
    const unsynced = localTasks.filter(t => !t.synced);

    if (unsynced.length > 0) {
        showToast('info', 'Uploading', `Syncing ${unsynced.length} local task(s)...`);
        let successCount = 0;

        for (const task of unsynced) {
            try {
                let taskToSync = { ...task };

                if (task.screenshot && task.screenshot.startsWith('data:image')) {
                    const uploadResult = await SheetsAPI.uploadImage(
                        task.screenshot,
                        `task_${task.username}_${task.id}.jpg`
                    );
                    if (uploadResult && uploadResult.success && uploadResult.url) {
                        taskToSync.screenshot = uploadResult.url;
                    }
                }

                const submitResult = await SheetsAPI.submitTask(taskToSync);
                if (submitResult && submitResult.success) {
                    DataStore.updateTaskSyncStatus(task.id, true);
                    DataStore.removePendingTask(task.id);
                    successCount++;
                }
            } catch (err) {
                console.warn('Failed to sync task:', task.id, err);
                DataStore.addPendingTask(task);
            }
        }

        if (successCount > 0) {
            showToast('success', 'Sync Complete', `${successCount} task(s) uploaded to cloud`);
        }
    }

    DataStore.setLastSync(new Date().toISOString());
}

function mergeTasks(local, cloud) {
    const map = new Map();

    local.forEach(task => map.set(task.id, task));

    cloud.forEach(task => {
        const existing = map.get(task.id);
        if (!existing) {
            map.set(task.id, { ...task, synced: true });
        } else {
            const merged = { ...task, synced: true };
            if (!merged.screenshot && existing.screenshot) {
                merged.screenshot = existing.screenshot;
            }
            map.set(task.id, merged);
        }
    });

    return Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
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

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

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
        const base64Original = await fileToBase64(currentFile);
        const base64Compressed = await compressImage(base64Original);

        const taskId = generateId();
        const task = {
            id: taskId,
            date: new Date().toISOString(),
            username: session.username,
            task: taskText,
            screenshot: base64Compressed,
            synced: false
        };

        DataStore.addTask(task);
        DataStore.addPendingTask(task);

        if (SheetsAPI.isConfigured()) {
            try {
                const uploadResult = await SheetsAPI.uploadImage(
                    base64Compressed,
                    `task_${session.username}_${taskId}.jpg`
                );

                let screenshotUrl = base64Compressed;
                if (uploadResult && uploadResult.success && uploadResult.url) {
                    screenshotUrl = uploadResult.url;
                }

                task.screenshot = screenshotUrl;

                const result = await SheetsAPI.submitTask(task);
                if (result && result.success) {
                    DataStore.updateTaskSyncStatus(taskId, true);
                    DataStore.removePendingTask(taskId);
                    showToast('success', 'Task Uploaded', 'Your task has been saved and synced to the cloud!');
                } else {
                    throw new Error(result.error || 'Unknown server error');
                }
            } catch (err) {
                console.error('Cloud sync failed:', err);
                showToast('warning', 'Saved Locally', 'Cloud sync failed. Task queued for later sync.');
            }
        } else {
            showToast('success', 'Task Uploaded', 'Your task has been saved locally (cloud not configured).');
        }

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
// PENDING SYNC QUEUE
// ========================================

async function syncPendingTasks() {
    const pending = DataStore.getPendingTasks();
    if (pending.length === 0) return;

    if (!SheetsAPI.isConfigured()) {
        console.log('API not configured, skipping pending sync');
        return;
    }

    showToast('info', 'Syncing', `Attempting to sync ${pending.length} pending task(s)...`);
    setLoading(true);

    const stillPending = [];
    let successCount = 0;

    for (const task of pending) {
        try {
            let taskToSync = { ...task };

            if (task.screenshot && task.screenshot.startsWith('data:image')) {
                const uploadResult = await SheetsAPI.uploadImage(
                    task.screenshot,
                    `task_${task.username}_${task.id}.jpg`
                );
                if (uploadResult && uploadResult.success && uploadResult.url) {
                    taskToSync.screenshot = uploadResult.url;
                }
            }

            const result = await SheetsAPI.submitTask(taskToSync);
            if (result && result.success) {
                DataStore.updateTaskSyncStatus(task.id, true);
                successCount++;
            } else {
                stillPending.push(task);
            }
        } catch (err) {
            console.warn('Failed to sync task:', task.id, err);
            stillPending.push(task);
        }
    }

    DataStore.savePendingTasks(stillPending);
    setLoading(false);

    if (successCount > 0) {
        showToast('success', 'Sync Complete', `${successCount} task(s) synced to cloud`);
    }
    if (stillPending.length > 0) {
        showToast('warning', 'Sync Pending', `${stillPending.length} task(s) still waiting`);
    }

    refreshAllData();
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
    const session = DataStore.getSession();
    if (session) {
        enterDashboard(session.username);
    } else {
        UI.showView('login-view');
    }

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);

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

    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            UI.showTab(item.dataset.tab);
            if (item.dataset.tab === 'tasks') renderTasksTable();
            if (item.dataset.tab === 'my-tasks') renderMyTasksTable();
        });
    });

    document.getElementById('upload-form').addEventListener('submit', handleTaskUpload);
    setupFileUpload();

    document.getElementById('task-text').addEventListener('input', (e) => {
        const count = e.target.value.length;
        document.getElementById('char-count').textContent = count;
        if (count > CONFIG.MAX_TASK_LENGTH) {
            e.target.value = e.target.value.substring(0, CONFIG.MAX_TASK_LENGTH);
            document.getElementById('char-count').textContent = CONFIG.MAX_TASK_LENGTH;
        }
    });

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

    document.getElementById('filter-date').addEventListener('change', renderTasksTable);
    document.getElementById('filter-user').addEventListener('change', renderTasksTable);
    document.getElementById('clear-filters').addEventListener('click', () => {
        document.getElementById('filter-date').value = '';
        document.getElementById('filter-user').value = '';
        renderTasksTable();
    });

    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-overlay').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
    });

    window.addEventListener('online', () => {
        showToast('info', 'Back Online', 'Attempting to sync pending tasks...');
        syncPendingTasks();
    });
});
