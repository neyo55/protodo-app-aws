// script.js - ProTodo v2.2 (S3 & Placeholder Fixes)
const API_BASE = '/api'; 
let todos = [];
let editModeId = null;
let currentFilter = 'all';
let tempSubtasks = []; 

// Notification Sound
const NOTIFY_SOUND = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"); 

const categoryColors = {
    'work': '#4F46E5', 'personal': '#10B981', 
    'urgent': '#EF4444', 'medical': '#D946EF', 'other': '#F59E0B'
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    // 1. Toast Container
    if (!document.getElementById('toast-container')) {
        const div = document.createElement('div');
        div.id = 'toast-container';
        document.body.appendChild(div);
    }

    // 2. Permissions
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
    setInterval(checkBrowserReminders, 30000); 
    // Auto-refresh data every 60s
    setInterval(() => { if(localStorage.getItem('token')) loadTodos(); }, 60000);

    // 3. Calendar
    if (document.getElementById('todo-due') && typeof flatpickr !== 'undefined') {
        flatpickr("#todo-due", {
            enableTime: true, dateFormat: "Y-m-d H:i", time_24hr: false, 
            plugins: [new confirmDatePlugin({ confirmIcon: "<i class='fa fa-check'></i>", confirmText: "OK ", showAlways: true, theme: "light" })],
            disableMobile: "true"
        });
    }
    
    // 4. Bind Events
    const bind = (id, func) => { const el = document.getElementById(id); if (el) el.addEventListener('click', func); };
    
    bind('theme-toggle', toggleTheme);
    bind('logout-btn', logout);
    bind('login-btn', handleLogin);
    bind('signup-btn', handleSignup);
    bind('send-code-btn', handleForgot);
    bind('reset-btn', handleReset);
    bind('add-todo-btn', handleAddOrUpdate);
    
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', () => { switchView('profile'); loadProfileData(); });

    // 5. Load Data
    if (document.getElementById('todo-list')) {
        if (localStorage.getItem('token')) {
            loadTodos();      
            loadHeaderInfo(); 
        } else { 
            if(!document.getElementById('login-email')) window.location.href = 'login.html'; 
        }
    }
});

// === GLOBAL HELPERS ===
window.deleteTodo = async function(id) {
    if(!confirm("Delete this task?")) return;
    await authenticatedFetch(`${API_BASE}/todos/${id}`, { method: 'DELETE' });
    loadTodos();
    showToast("Task Deleted", "info");
};

window.toggleComplete = async function(id, isChecked) {
    const t = todos.find(x => x.id === id);
    if(t) t.completed = isChecked;
    await authenticatedFetch(`${API_BASE}/todos/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ completed: isChecked }) });
    loadTodos();
    if(isChecked) showToast("Task Completed!", "success");
};

window.toggleSelectAll = function() {
    const master = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('.bulk-check');
    checkboxes.forEach(cb => cb.checked = master.checked);
    updateBulkUI();
};

window.deleteSelected = async function() {
    const checked = document.querySelectorAll('.bulk-check:checked');
    if (checked.length === 0) return;
    if(!confirm(`Delete ${checked.length} tasks?`)) return;
    
    const ids = Array.from(checked).map(cb => cb.value);
    await authenticatedFetch(`${API_BASE}/todos/bulk`, { 
        method: 'DELETE', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ ids: ids })
    });
    
    document.getElementById('select-all').checked = false;
    loadTodos();
    document.getElementById('bulk-bar').classList.add('hidden');
    showToast("Tasks Deleted", "info");
};

window.saveProfile = function() {
    const btn = document.querySelector('.profile-actions button.primary-btn');
    if(btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Saving...`; }
    
    const formData = new FormData();
    formData.append('name', document.getElementById('profile-name').value);
    formData.append('nickname', document.getElementById('profile-nickname').value);
    formData.append('phone', document.getElementById('profile-phone').value);
    formData.append('timezone', document.getElementById('profile-timezone').value);
    
    const pass = document.getElementById('profile-password').value;
    if(pass) formData.append('new_password', pass);
    
    const fileInput = document.getElementById('profile-avatar-input');
    if (fileInput.files[0]) formData.append('avatar', fileInput.files[0]);

    authenticatedFetch(`${API_BASE}/profile`, { method: 'PUT', body: formData }).then(async res => {
        if (res && res.ok) {
            const data = await res.json();
            showToast('Profile Updated!', 'success');
            const user = JSON.parse(localStorage.getItem('user')) || {};
            user.nickname = document.getElementById('profile-nickname').value;
            // Update local storage with new avatar URL from S3
            if(data.avatar) user.avatar = data.avatar;
            localStorage.setItem('user', JSON.stringify(user));
            loadHeaderInfo();
        } else {
            showToast("Update failed", "error");
        }
        if(btn) { btn.disabled = false; btn.innerHTML = `Save Changes`; }
    });
};

window.filterByStatus = function(status) {
    currentFilter = status;
    const labelEl = document.getElementById('current-filter-label');
    const labels = { 'all': 'All', 'completed': 'Completed', 'pending': 'Pending' };
    if(labelEl) labelEl.innerText = `Showing: ${labels[status]}`;
    switchView('todos');
    renderTodos();
};

window.openDetails = function(id) {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    document.getElementById('dm-title').innerText = t.title;
    const notesEl = document.getElementById('dm-notes');
    notesEl.innerText = t.notes || '';
    t.notes ? notesEl.classList.remove('hidden') : notesEl.classList.add('hidden');
    renderModalSubtasks(t);
    document.getElementById('details-modal').classList.remove('hidden');
};

window.closeDetails = function() {
    document.getElementById('details-modal').classList.add('hidden');
};

window.previewImage = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) { document.getElementById('profile-preview').src = e.target.result; }
        reader.readAsDataURL(input.files[0]);
    }
};

window.addSubtaskFromInput = function() {
    const input = document.getElementById('subtask-input');
    const val = input.value.trim();
    if (!val) return;
    tempSubtasks.push({ text: val, completed: false });
    input.value = '';
    renderPendingSubtasks();
};

window.removeSubtask = function(index) {
    tempSubtasks.splice(index, 1);
    renderPendingSubtasks();
};

window.toggleSubtask = async function(todoId, subtaskIndex, isChecked) {
    const t = todos.find(x => x.id === todoId);
    if(!t) return;
    if(!t.subtasks) t.subtasks = [];
    t.subtasks[subtaskIndex].completed = isChecked;
    
    await authenticatedFetch(`${API_BASE}/todos/${todoId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ subtasks: t.subtasks }) });
    renderTodos();
    if(!document.getElementById('details-modal').classList.contains('hidden')) {
        renderModalSubtasks(t);
    }
};

window.resetApp = function() {
    document.getElementById('todo-title').value = '';
    document.getElementById('todo-notes').value = '';
    document.getElementById('subtask-input').value = '';
    document.getElementById('todo-due').value = '';
    document.getElementById('todo-recurrence').value = 'never';
    editModeId = null;
    tempSubtasks = [];
    renderPendingSubtasks();
    document.getElementById('add-todo-btn').innerHTML = '<i class="fas fa-plus"></i> Add Task';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
    switchView('todos');
    loadTodos();
};

// === TOASTS ===
function showToast(message, type = 'info', onClickCallback = null) {
    const container = document.getElementById('toast-container');
    if(!container) return alert(message); 

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? '<i class="fas fa-check-circle"></i>' : (type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-info-circle"></i>');
    toast.innerHTML = `${icon} <span>${message}</span>`;
    
    if (onClickCallback) {
        toast.style.cursor = 'pointer';
        toast.onclick = () => { onClickCallback(); toast.remove(); };
    } else {
        toast.onclick = () => toast.remove();
    }
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// === NOTIFICATIONS ===
function checkBrowserReminders() {
    if (!todos || todos.length === 0) return;
    const now = new Date();
    todos.forEach(t => {
        if (t.due_date && !t.completed) {
            const due = new Date(t.due_date);
            const diffMinutes = (due - now) / 1000 / 60;
            if (diffMinutes > 0 && diffMinutes <= 1) {
                triggerNotification(t.title, t.id);
            }
        }
    });
}

function triggerNotification(title, todoId) {
    try { NOTIFY_SOUND.play(); } catch(e) {}
    const openTask = () => { window.focus(); switchView('todos'); if(todoId) openDetails(todoId); };
    if (Notification.permission === "granted") {
        const n = new Notification("ProTodo Reminder 🔔", {
            body: `It's time for: ${title}`,
        });
        n.onclick = openTask;
    } else {
        showToast(`🔔 Reminder: ${title}`, 'info', openTask);
    }
}

// === PASSWORD SECURITY ===
function isStrongPassword(password) {
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const hasLen = password.length >= 8;
    return hasUpper && hasNumber && hasSpecial && hasLen;
}

// === DATA API ===
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) { 
        if(!document.getElementById('login-email')) window.location.href = 'login.html'; 
        return null; 
    }
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = `Bearer ${token}`;
    try {
        const response = await fetch(url, options);
        if (response.status === 401) { 
            showToast("Session expired", "error"); 
            logout(); 
            return null; 
        }
        return response;
    } catch (e) {
        showToast("Network Error", "error");
        return null;
    }
}

async function loadTodos() {
    const res = await authenticatedFetch(`${API_BASE}/todos`);
    if (res && res.ok) { 
        const data = await res.json();
        todos = Array.isArray(data) ? data : [];
        renderTodos(); 
        updateDashboard(); 
    }
}

// === RENDERING ===
function renderTodos() {
    const list = document.getElementById('todo-list');
    if (!list) return;
    list.innerHTML = ''; 
    
    const searchInput = document.getElementById('search-input');
    const search = searchInput ? searchInput.value.toLowerCase() : '';
    
    const filtered = todos.filter(t => {
        const matchTitle = t.title ? t.title.toLowerCase().includes(search) : false;
        const matchCat = t.category ? t.category.toLowerCase().includes(search) : false;
        const matchStatus = currentFilter === 'all' ? true : (currentFilter === 'completed' ? t.completed : !t.completed);
        return (matchTitle || matchCat) && matchStatus;
    });

    const emptyState = document.getElementById('empty-state');
    if (filtered.length === 0) { 
        if(emptyState) emptyState.classList.remove('hidden'); 
    } else { 
        if(emptyState) emptyState.classList.add('hidden'); 
    }

    filtered.forEach(todo => {
        const li = document.createElement('li');
        li.className = 'todo-item';
        
        let progressHtml = '';
        const subtasks = Array.isArray(todo.subtasks) ? todo.subtasks : [];
        if (subtasks.length > 0) {
            const total = subtasks.length;
            const done = todo.completed ? total : subtasks.filter(s => s.completed).length;
            const percent = Math.round((done / total) * 100);
            progressHtml = `
                <div style="margin-top:8px; display:flex; align-items:center; gap:10px;">
                    <div class="progress-container" style="flex:1; height:6px;"><div class="progress-fill" style="width:${percent}%"></div></div>
                    <span style="font-size:0.75rem;">${done}/${total}</span>
                </div>`;
        }

        let dateHtml = '';
        let reminderHtml = '';
        if (todo.due_date) {
            const dateObj = new Date(todo.due_date);
            const dateStr = dateObj.toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
            const isOverdue = !todo.completed && dateObj < new Date();
            const dateColor = isOverdue ? '#EF4444' : 'var(--text-muted)';
            dateHtml = `<span style="color:${dateColor}; display:flex; align-items:center; gap:5px;"><i class="far fa-calendar-alt"></i> ${dateStr}</span>`;
            
            if (todo.reminder_minutes) {
                const rText = todo.reminder_minutes >= 60 ? `${todo.reminder_minutes/60}h` : `${todo.reminder_minutes}m`;
                reminderHtml = `<span style="color:var(--primary); display:flex; align-items:center; gap:5px; margin-left:15px;"><i class="fas fa-bell"></i> ${rText}</span>`;
            }
        }

        const catColor = categoryColors[todo.category] || '#999';
        const recurIcon = (todo.recurrence && todo.recurrence !== 'never') ? `<span style="color:var(--primary); margin-left:10px;"><i class="fas fa-sync-alt"></i> ${todo.recurrence}</span>` : '';
        const notesPreview = todo.notes ? (todo.notes.length > 50 ? todo.notes.substring(0,50)+'...' : todo.notes) : '';

        li.innerHTML = `
            <div class="todo-check-wrapper">
                <input type="checkbox" class="todo-check bulk-check" value="${todo.id}" ${todo.completed ? 'checked' : ''} onchange="toggleComplete(${todo.id}, this.checked)">
            </div>
            <div class="todo-content">
                <div class="todo-header">
                    <span class="todo-title" onclick="openDetails(${todo.id})">${todo.title}</span>
                    <span class="badge ${todo.priority}">${todo.priority}</span>
                </div>
                ${notesPreview ? `<div class="todo-notes" onclick="openDetails(${todo.id})" style="cursor:pointer;">${notesPreview}</div>` : ''}
                ${progressHtml}
                <div class="todo-meta">
                    <span class="badge" style="background:${catColor}20; color:${catColor}; border:1px solid ${catColor}">${todo.category || 'other'}</span>
                    <div class="todo-meta-details" style="display:flex; flex-wrap:wrap; font-size:0.85rem;">
                        ${dateHtml} ${reminderHtml} ${recurIcon}
                    </div>
                </div>
            </div>
            <div class="todo-actions">
                <button class="action-btn" onclick="openDetails(${todo.id})" title="View"><i class="far fa-eye"></i></button>
                <button class="action-btn" onclick="startEdit(${todo.id})" title="Edit"><i class="fas fa-pen"></i></button>
                <button class="action-btn delete-btn" onclick="deleteTodo(${todo.id})" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(li);
    });
    updateBulkUI();
}

// === TASK ACTIONS ===
async function handleAddOrUpdate() {
    const title = document.getElementById('todo-title').value;
    if (!title) return showToast('Title is required', 'error');
    setLoading('add-todo-btn', true);

    const subInput = document.getElementById('subtask-input');
    if(subInput && subInput.value.trim()) {
        tempSubtasks.push({ text: subInput.value.trim(), completed: false });
    }

    const payload = {
        title,
        notes: document.getElementById('todo-notes').value,
        due_date: document.getElementById('todo-due').value || null,
        reminder_minutes: document.getElementById('todo-reminder').value,
        category: document.getElementById('todo-category').value,
        priority: document.getElementById('todo-priority').value,
        recurrence: document.getElementById('todo-recurrence').value,
        subtasks: tempSubtasks
    };

    const url = editModeId ? `${API_BASE}/todos/${editModeId}` : `${API_BASE}/todos`;
    const method = editModeId ? 'PUT' : 'POST';

    const res = await authenticatedFetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    
    if (res && res.ok) {
        showToast(editModeId ? "Task Updated" : "Task Created", "success");
        resetApp();
    } else {
        showToast("Error saving", "error");
    }
    setLoading('add-todo-btn', false, editModeId ? 'Update Task' : 'Add Task');
}

function startEdit(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    document.getElementById('todo-title').value = todo.title;
    document.getElementById('todo-notes').value = todo.notes || '';
    document.getElementById('todo-priority').value = todo.priority || 'medium';
    document.getElementById('todo-category').value = todo.category || 'other';
    document.getElementById('todo-recurrence').value = todo.recurrence || 'never';
    if(todo.due_date) {
        const fp = document.querySelector("#todo-due")._flatpickr;
        if(fp) fp.setDate(todo.due_date);
    }
    const subtasks = Array.isArray(todo.subtasks) ? todo.subtasks : [];
    tempSubtasks = JSON.parse(JSON.stringify(subtasks));
    renderPendingSubtasks();
    editModeId = id;
    document.getElementById('add-todo-btn').innerHTML = '<i class="fas fa-save"></i> Update Task';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    window.scrollTo(0,0);
}

function renderPendingSubtasks() {
    const list = document.getElementById('pending-subtasks-list');
    if (!list) return;
    list.innerHTML = '';
    tempSubtasks.forEach((st, index) => {
        const li = document.createElement('li');
        li.style.display = 'flex'; li.style.justifyContent = 'space-between'; li.style.padding = '5px 0'; li.style.borderBottom = '1px solid #eee';
        li.innerHTML = `<span>• ${st.text}</span><button onclick="removeSubtask(${index})" style="background:none; border:none; color:var(--danger); cursor:pointer;">&times;</button>`;
        list.appendChild(li);
    });
}

function renderModalSubtasks(todo) {
    const progressDiv = document.getElementById('dm-progress-section');
    const listDiv = document.getElementById('dm-subtasks-list');
    const subtasks = Array.isArray(todo.subtasks) ? todo.subtasks : [];
    
    if (subtasks.length === 0) {
        progressDiv.innerHTML = '<p style="color:var(--text-muted);">No subtasks.</p>';
        listDiv.innerHTML = '';
        return;
    }
    
    const total = subtasks.length;
    const done = subtasks.filter(s => s.completed).length;
    const percent = Math.round((done / total) * 100);
    
    progressDiv.innerHTML = `
        <div class="progress-container"><div class="progress-fill" style="width:${percent}%"></div></div>
        <p style="text-align:right; font-size:0.8rem; margin-top:5px;">${done}/${total} Completed</p>
    `;
    
    let html = '';
    subtasks.forEach((st, idx) => {
        html += `
            <div class="checklist-item">
                <input type="checkbox" ${st.completed ? 'checked' : ''} onchange="toggleSubtask(${todo.id}, ${idx}, this.checked)">
                <span style="${st.completed ? 'text-decoration:line-through' : ''}">${st.text}</span>
            </div>`;
    });
    listDiv.innerHTML = html;
}

// === AUTH ===
async function handleLogin() {
    setLoading('login-btn', true);
    const e = document.getElementById('login-email').value;
    const p = document.getElementById('login-password').value;
    const res = await fetch(`${API_BASE}/login`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email:e, password:p})});
    const data = await res.json();
    if(res.ok) { localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); window.location.href = 'app.html'; }
    else { showToast(data.message, 'error'); setLoading('login-btn', false, 'Login'); }
}

async function handleSignup() {
    setLoading('signup-btn', true);
    const pass = document.getElementById('signup-password').value;
    if (pass !== document.getElementById('signup-confirm-password').value) { showToast("Passwords do not match!", "error"); setLoading('signup-btn', false, "Sign Up"); return; }
    if(!isStrongPassword(pass)) { showToast("Password too weak.", "error"); setLoading('signup-btn', false, "Sign Up"); return; }
    try {
        const res = await fetch(`${API_BASE}/signup`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name: document.getElementById('signup-name').value, email: document.getElementById('signup-email').value, phone: document.getElementById('signup-phone').value, password: pass })
        });
        if (res.ok) { showToast('Account created!', 'success'); setTimeout(() => window.location.href = 'login.html', 1500); } 
        else { const data = await res.json(); showToast(data.message, "error"); setLoading('signup-btn', false, "Sign Up"); }
    } catch(e) { showToast("Connection Error", "error"); setLoading('signup-btn', false, "Sign Up"); }
}

async function handleForgot() {
    const email = document.getElementById('forgot-email').value;
    if(!email) return showToast("Enter email", "error");
    setLoading('send-code-btn', true, "Sending...");
    const res = await fetch(`${API_BASE}/forgot-password`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email})});
    if(res.ok) { localStorage.setItem('reset_email', email); window.location.href = 'reset-password.html'; }
    else showToast("Error sending code", "error");
    setLoading('send-code-btn', false, "Send Code");
}

async function handleReset() {
    const code = document.getElementById('reset-code').value;
    const pass = document.getElementById('reset-new-pass').value;
    const conf = document.getElementById('reset-confirm-pass').value;
    if(pass !== conf) return showToast("Passwords mismatch", "error");
    if(!isStrongPassword(pass)) return showToast("Password weak", "error");
    setLoading('reset-btn', true, "Updating...");
    const res = await fetch(`${API_BASE}/reset-password`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:localStorage.getItem('reset_email'), code, new_password:pass})});
    if(res.ok) { showToast("Success!", "success"); window.location.href = 'login.html'; }
    else showToast("Failed", "error");
    setLoading('reset-btn', false, "Set New Password");
}

// === UTILS ===
function logout() { localStorage.clear(); window.location.href = 'login.html'; }
function setLoading(btnId, isLoading, defaultText) { const btn = document.getElementById(btnId); if (!btn) return; if (isLoading) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>...`; } else { btn.disabled = false; btn.innerHTML = defaultText; } }
function updateBulkUI() { const c = document.querySelectorAll('.bulk-check:checked').length; document.getElementById('selected-count').innerText = c; document.getElementById('bulk-bar').classList.toggle('hidden', c===0); }
function initTheme() { if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode'); }
function toggleTheme() { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); }
function switchView(view) { ['todos', 'dashboard', 'profile'].forEach(v => document.getElementById(`${v}-view`).classList.add('hidden')); document.getElementById(`${view}-view`).classList.remove('hidden'); document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active')); if(view === 'todos' || view === 'dashboard') { const btn = document.querySelector(`.tabs button[data-view="${view}"]`); if(btn) btn.classList.add('active'); } if (view === 'dashboard') updateDashboard(); }

// [FIXED] - Replaced placeholder with UI Avatars
function loadHeaderInfo() { 
    const u = JSON.parse(localStorage.getItem('user')) || {}; 
    if(u.nickname) document.getElementById('header-nickname').innerText = u.nickname; 
    const img = document.getElementById('header-avatar'); 
    
    // Fallback if avatar is missing
    const avatarSrc = u.avatar ? u.avatar : `https://ui-avatars.com/api/?name=${u.name || 'User'}&background=random`;
    img.src = avatarSrc; 
    
    document.getElementById('user-header').classList.remove('hidden'); 
}

// [FIXED] - Replaced placeholder with UI Avatars
function loadProfileData() { 
    const u = JSON.parse(localStorage.getItem('user')) || {}; 
    document.getElementById('profile-name').value = u.name || ''; 
    document.getElementById('profile-nickname').value = u.nickname || ''; 
    document.getElementById('profile-phone').value = u.phone || ''; 
    
    // Fallback if avatar is missing
    const avatarSrc = u.avatar ? u.avatar : `https://ui-avatars.com/api/?name=${u.name || 'User'}&background=random`;
    document.getElementById('profile-preview').src = avatarSrc; 
}

function importTodos(input) { const file = input.files[0]; const reader = new FileReader(); reader.onload = async (e) => { try { const data = JSON.parse(e.target.result); for (const t of data) { await authenticatedFetch(`${API_BASE}/todos`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(t) }); } loadTodos(); showToast('Import Successful!', 'success'); } catch(e) { showToast("Invalid JSON", "error"); } }; reader.readAsText(file); }
function exportTodos() { let csv = 'Title,Due,Notes,Category,Priority\n'; todos.forEach(t => csv += `"${t.title}","${t.due_date}","${t.notes}","${t.category}","${t.priority}"\n`); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'protodo.csv'; a.click(); }
function togglePass(id) { const i = document.getElementById(id); const ic = i.nextElementSibling.querySelector('i'); if (i.type === "password") { i.type = "text"; ic.classList.replace('fa-eye', 'fa-eye-slash'); } else { i.type = "password"; ic.classList.replace('fa-eye-slash', 'fa-eye'); } }

// === DASHBOARD & CHART (Restored from your working version) ===
function updateDashboard() {
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;
    const pending = total - completed;

    const elTotal = document.getElementById('stat-total');
    if(elTotal) {
        document.getElementById('stat-total').innerText = total;
        document.getElementById('stat-completed').innerText = completed;
        document.getElementById('stat-pending').innerText = pending;
    }
    drawChart();
}

function drawChart() {
    const canvas = document.getElementById('category-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const counts = { 'work': 0, 'personal': 0, 'urgent': 0, 'medical': 0, 'other': 0 };
    todos.forEach(t => {
        const cat = t.category ? t.category.toLowerCase() : 'other';
        if (counts[cat] !== undefined) counts[cat]++; else counts['other']++;
    });
    
    const total = todos.length;
    if (total === 0) {
        ctx.fillStyle = "#E5E7EB";
        ctx.beginPath(); ctx.arc(150, 150, 100, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = "#6B7280";
        ctx.font = "14px Inter";
        ctx.textAlign = "center";
        ctx.fillText("No Data", 150, 155);
        return;
    }

    let startAngle = 0;
    const legendEl = document.getElementById('chart-legend');
    if(legendEl) legendEl.innerHTML = ''; 

    for (const [cat, count] of Object.entries(counts)) {
        if (count === 0) continue;
        const sliceAngle = (count / total) * 2 * Math.PI;
        ctx.fillStyle = categoryColors[cat];
        ctx.beginPath(); ctx.moveTo(150, 150);
        ctx.arc(150, 150, 100, startAngle, startAngle + sliceAngle);
        ctx.fill();
        startAngle += sliceAngle;

        if(legendEl) {
            legendEl.innerHTML += `
                <div class="legend-item">
                    <div class="legend-color" style="background:${categoryColors[cat]}"></div>
                    <span>${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                </div>`;
        }
    }
}