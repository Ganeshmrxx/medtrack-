// State Management
let medicines = JSON.parse(localStorage.getItem('medTrack_data')) || [];
let userId = localStorage.getItem('medTrack_userId') || 'demo-user';
let isPrivate = localStorage.getItem('medTrack_isPrivate') === 'true';
let accessKey = localStorage.getItem('medTrack_accessKey') || '';

// DOM Elements
const medList = document.getElementById('med-list');
const medForm = document.getElementById('med-form');
const modal = document.getElementById('modal-overlay');
const authModal = document.getElementById('auth-modal');
const toast = document.getElementById('toast');

// Stats Elements
const totalMedsEl = document.getElementById('total-meds');
const lowStockCountEl = document.getElementById('low-stock-count');
const refillSoonEl = document.getElementById('refill-soon');

// PWA Install Logic
let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'flex';
});

installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installBtn.style.display = 'none';
        }
        deferredPrompt = null;
    }
});

// Initialize
async function init() {
    updateSyncUI(isPrivate ? 'Cloud Active' : 'Demo Mode', isPrivate ? 'var(--success)' : '#94a3b8');
    
    if (isPrivate && accessKey) {
        await loadFromCloud();
        document.getElementById('login-trigger').innerHTML = '<ion-icon name="log-out-outline"></ion-icon><span>Logout</span>';
        document.getElementById('login-trigger').onclick = handleLogout;
    }
    
    autoSyncStock();
    renderMedicines();
    updateStats();
    checkNotifications();
}

// Auth Handlers
function toggleAuthModal(show) {
    authModal.style.display = show ? 'flex' : 'none';
}

function handleAuthOverlayClick(e) {
    if (e.target === authModal) toggleAuthModal(false);
}

async function handleLogin() {
    const keyInput = document.getElementById('private-key-input');
    const key = keyInput.value.trim();
    
    if (!key) {
        showToast("Please enter a key", "var(--warning)");
        return;
    }

    const loginBtn = document.getElementById('login-btn-inner');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<ion-icon name="sync-outline" class="spin"></ion-icon> Verifying...';
    loginBtn.disabled = true;

    try {
        // We use userId as 'personal-cloud' or similar when private
        const tempUserId = 'personal-cloud';
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: tempUserId, action: 'load', accessKey: key })
        });

        if (response.ok) {
            const result = await response.json();
            isPrivate = true;
            accessKey = key;
            userId = tempUserId;
            
            localStorage.setItem('medTrack_isPrivate', 'true');
            localStorage.setItem('medTrack_accessKey', key);
            localStorage.setItem('medTrack_userId', userId);
            
            if (result.data && result.data.length > 0) {
                if (confirm('Cloud data found! Do you want to overwrite your local data with cloud data?')) {
                    medicines = result.data;
                    localStorage.setItem('medTrack_data', JSON.stringify(medicines));
                }
            }

            showToast("Private Sync Enabled!", "var(--success)");
            toggleAuthModal(false);
            init(); // Re-init UI
        } else {
            showToast("Invalid Key: Access Denied", "var(--danger)");
        }
    } catch (e) {
        showToast("Connection Error", "var(--danger)");
    } finally {
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
    }
}

function handleLogout() {
    if (confirm('Logout from Private Cloud? Your data will remain on this device but won\'t sync.')) {
        isPrivate = false;
        accessKey = '';
        userId = 'demo-user';
        localStorage.removeItem('medTrack_isPrivate');
        localStorage.removeItem('medTrack_accessKey');
        localStorage.setItem('medTrack_userId', 'demo-user');
        
        document.getElementById('login-trigger').innerHTML = '<ion-icon name="key-outline"></ion-icon><span>Login</span>';
        document.getElementById('login-trigger').onclick = () => toggleAuthModal(true);
        
        updateSyncUI('Demo Mode', '#94a3b8');
        showToast("Logged out to Demo Mode");
    }
}

async function loadFromCloud() {
    if (!isPrivate || !accessKey) return;
    
    try {
        updateSyncUI('Syncing...', 'var(--warning)');
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ userId, action: 'load', accessKey })
        });
        const result = await response.json();
        
        if (!response.ok) {
            if (response.status === 401) {
                handleLogout();
                showToast("Session Expired: Invalid Key", "var(--danger)");
            } else {
                updateSyncUI('Sync Fail', 'var(--danger)');
            }
            return;
        }

        if (result.data) {
            medicines = result.data;
            localStorage.setItem('medTrack_data', JSON.stringify(medicines));
            renderMedicines();
            updateStats();
            updateSyncUI('Cloud Active', 'var(--success)');
        }
    } catch (e) {
        updateSyncUI('Offline', 'var(--danger)');
    }
}

async function saveToCloud() {
    if (!isPrivate || !accessKey) return;
    
    try {
        updateSyncUI('Saving...', 'var(--warning)');
        const response = await fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ userId, action: 'save', data: medicines, accessKey })
        });
        
        if (!response.ok) {
            updateSyncUI('Sync Fail', 'var(--danger)');
            return;
        }
        
        updateSyncUI('Cloud Active', 'var(--success)');
    } catch (e) {
        updateSyncUI('Offline', 'var(--danger)');
    }
}

function updateSyncUI(text, color) {
    const el = document.getElementById('sync-text');
    const dot = document.getElementById('sync-dot');
    if (el && dot) {
        el.textContent = text;
        dot.style.background = color;
    }
}

// Auto-sync stock based on days passed
function autoSyncStock() {
    const lastSync = localStorage.getItem('medTrack_lastSync');
    const now = new Date();
    
    if (lastSync) {
        const lastSyncDate = new Date(lastSync);
        // Reset to midnight for day-based calculation
        lastSyncDate.setHours(0,0,0,0);
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const diffTime = Math.abs(today - lastSyncDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 0) {
            medicines.forEach(med => {
                const daily = med.shifts.length;
                med.currentPills = Math.max(0, med.currentPills - (daily * diffDays));
            });
            saveData();
            showToast(`Auto-updated: Subtracted stock for ${diffDays} days.`);
        }
    }
    
    // Update lastSync to today
    localStorage.setItem('medTrack_lastSync', new Date().toISOString());
}

function toggleShiftVisibility() {
    const isSos = document.getElementById('is-sos').checked;
    const shiftGroup = document.getElementById('shift-selection-group');
    shiftGroup.style.opacity = isSos ? '0.3' : '1';
    shiftGroup.style.pointerEvents = isSos ? 'none' : 'auto';
    
    // Uncheck shifts if SOS is selected
    if (isSos) {
        document.querySelectorAll('input[name="shift"]').forEach(cb => cb.checked = false);
    }
}

// Render Medicines
function renderMedicines() {
    medList.innerHTML = '';
    
    medicines.forEach((med, index) => {
        const dailyDosage = med.isSos ? 0 : med.shifts.length;
        const daysRemaining = dailyDosage > 0 ? Math.floor(med.currentPills / dailyDosage) : Infinity;
        
        let statusClass = 'status-ok';
        let statusText = med.isSos ? 'As Needed' : 'Good Stock';
        let cardClass = '';

        if (!med.isSos) {
            if (daysRemaining <= 2) {
                statusClass = 'status-critical';
                statusText = 'CRITICAL (2d)';
                cardClass = 'critical-stock';
            } else if (daysRemaining <= 4) {
                statusClass = 'status-low';
                statusText = 'Low Stock';
                cardClass = 'low-stock';
            }
        } else {
            // SOS Alert: if less than 5 pills
            if (med.currentPills <= 5) {
                statusClass = 'status-critical';
                statusText = 'Low SOS Stock';
                cardClass = 'critical-stock';
            }
        }
        
        const shiftsHtml = med.isSos ? '<span class="badge active" style="width: 100%; text-align: center;">SOS / As Needed</span>' : 
            ['Morning', 'Afternoon', 'Evening', 'Night'].map(s => 
            `<span class="badge ${med.shifts.includes(s) ? 'active' : ''}">${s.charAt(0)}</span>`
        ).join('');

        const progress = Math.min(100, (med.currentPills / (med.pillsPerStrip * 2)) * 100);

        const card = document.createElement('div');
        card.className = `med-card ${cardClass}`;
        card.innerHTML = `
            <div class="med-header">
                <div>
                    <div class="med-name">${med.name}</div>
                    ${med.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500; margin-top: 4px;">${med.notes}</div>` : ''}
                </div>
                <span class="med-status ${statusClass}">
                    ${statusText}
                </span>
            </div>
            <div class="med-info">
                <div class="info-item">
                    <span class="info-label">${med.isSos ? 'Usage Type' : 'Daily Dosage'}</span>
                    <span>${med.isSos ? 'SOS' : dailyDosage + ' tabs/day'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Current Tablets</span>
                    <span>${med.currentPills} tabs</span>
                </div>
                <div class="info-item" style="margin-top: 10px; font-weight: 600;">
                    <span class="info-label">${med.isSos ? 'Condition' : 'Finishes in'}</span>
                    <span style="color: ${cardClass === 'critical-stock' ? 'var(--danger)' : 'var(--success)'}">${med.isSos ? (med.currentPills <= 5 ? 'Refill Soon' : 'Available') : (daysRemaining === Infinity ? 'N/A' : daysRemaining + ' days')}</span>
                </div>
            </div>
            <div class="dosage-badges">
                ${shiftsHtml}
            </div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${progress}%; background: ${cardClass === 'critical-stock' ? 'var(--danger)' : 'var(--primary)'}"></div>
            </div>
            <div class="med-footer">
                ${med.isSos ? `
                    <button class="add-btn" onclick="syncSOSStock(${index})" style="flex: 2; background: var(--accent);">
                        <ion-icon name="sync-outline"></ion-icon>
                        Sync Stock
                    </button>
                ` : ''}
                <button class="btn-secondary" onclick="quickAdd(${index})" style="flex: 1.5; padding: 0.6rem; font-size: 0.8rem;">
                    + Stock
                </button>
                <button class="btn-secondary" onclick="editMed(${index})" style="padding: 0.6rem;">
                    <ion-icon name="create-outline"></ion-icon>
                </button>
                <button class="btn-danger" onclick="deleteMedicine(${index})" style="padding: 0.6rem;">
                    <ion-icon name="trash-outline"></ion-icon>
                </button>
            </div>
        `;
        medList.appendChild(card);
    });
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered'))
            .catch(err => console.log('SW Reg Failed', err));
    });
}

let currentStockEditIndex = null;

// New Stock Modal Logic
function quickAdd(index) {
    currentStockEditIndex = index;
    const med = medicines[index];
    
    document.getElementById('stock-med-name').textContent = med.name;
    document.getElementById('stock-strips').value = 1;
    document.getElementById('stock-pills-per-strip').value = med.pillsPerStrip;
    
    calculateTotalStock();
    toggleStockModal(true);
}

function calculateTotalStock() {
    const strips = parseInt(document.getElementById('stock-strips').value) || 0;
    const pps = parseInt(document.getElementById('stock-pills-per-strip').value) || 0;
    document.getElementById('total-preview').textContent = strips * pps;
}

function confirmAddStock() {
    const strips = parseInt(document.getElementById('stock-strips').value);
    const pps = parseInt(document.getElementById('stock-pills-per-strip').value);
    
    if (isNaN(strips) || isNaN(pps)) {
        showToast("Invalid numbers", "var(--danger)");
        return;
    }

    const totalToAdd = strips * pps;
    const med = medicines[currentStockEditIndex];
    
    med.currentPills += totalToAdd;
    // Update default strip size if it changed
    med.pillsPerStrip = pps;
    
    saveData();
    toggleStockModal(false);
    showToast(`Added ${totalToAdd} tablets successfully!`);
}

function toggleStockModal(show) {
    document.getElementById('stock-modal').style.display = show ? 'flex' : 'none';
}

function handleStockOverlayClick(e) {
    if (e.target.id === 'stock-modal') toggleStockModal(false);
}

// Edit Medicine
function editMed(index) {
    const med = medicines[index];
    document.getElementById('med-name').value = med.name;
    document.getElementById('med-notes').value = med.notes || '';
    document.getElementById('current-pills').value = med.currentPills;
    document.getElementById('pills-per-strip').value = med.pillsPerStrip;
    document.getElementById('is-sos').checked = med.isSos || false;
    
    // Reset checkboxes
    document.querySelectorAll('input[name="shift"]').forEach(cb => {
        cb.checked = med.shifts.includes(cb.value);
    });

    toggleShiftVisibility();

    // Change form behavior to update instead of add
    medForm.onsubmit = (e) => {
        e.preventDefault();
        updateMedicine(index);
    };
    
    toggleModal(true);
    document.querySelector('.modal-header h2').textContent = "Edit Medicine";
}

function updateMedicine(index) {
    medicines[index].name = document.getElementById('med-name').value;
    medicines[index].notes = document.getElementById('med-notes').value;
    medicines[index].currentPills = parseInt(document.getElementById('current-pills').value);
    medicines[index].pillsPerStrip = parseInt(document.getElementById('pills-per-strip').value);
    medicines[index].isSos = document.getElementById('is-sos').checked;
    medicines[index].shifts = medicines[index].isSos ? [] : Array.from(document.querySelectorAll('input[name="shift"]:checked')).map(cb => cb.value);

    saveData();
    toggleModal(false);
    resetForm();
    showToast("Medicine updated!");
}

function resetForm() {
    medForm.reset();
    document.querySelector('.modal-header h2').textContent = "Add New Medicine";
    medForm.onsubmit = addNewMedicine;
    toggleShiftVisibility();
}

function syncSOSStock(index) {
    const med = medicines[index];
    const newCount = prompt(`SYNC STOCK for ${med.name}\n\nHow many tablets are left in your hand right now?`, med.currentPills);
    
    if (newCount !== null) {
        const count = parseInt(newCount);
        if (!isNaN(count)) {
            medicines[index].currentPills = count;
            saveData();
            showToast(`Stock synced to ${count} tabs.`);
        }
    }
}

// Update addNewMedicine for SOS
function addNewMedicine(e) {
    e.preventDefault();
    const name = document.getElementById('med-name').value.trim();
    const notes = document.getElementById('med-notes').value.trim();
    const currentPills = parseInt(document.getElementById('current-pills').value);
    const pillsPerStrip = parseInt(document.getElementById('pills-per-strip').value);
    const isSos = document.getElementById('is-sos').checked;
    const shifts = Array.from(document.querySelectorAll('input[name="shift"]:checked')).map(cb => cb.value);

    // Duplicate Check
    const exists = medicines.some(m => m.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        showToast("Medicine already exists!", "var(--danger)");
        return;
    }

    if (!isSos && shifts.length === 0) {
        showToast("Select at least one shift!", "var(--danger)");
        return;
    }

    medicines.push({ 
        name, 
        notes,
        currentPills, 
        pillsPerStrip, 
        isSos, 
        shifts, 
        dateAdded: new Date().toISOString() 
    });
    saveData();
    toggleModal(false);
    resetForm();
    showToast("Added successfully!");
}

// Re-assign initial submit
medForm.onsubmit = addNewMedicine;

function deleteMedicine(index) {
    if(confirm('Are you sure you want to remove this medicine?')) {
        medicines.splice(index, 1);
        saveData();
    }
}

function saveData() {
    localStorage.setItem('medTrack_data', JSON.stringify(medicines));
    renderMedicines();
    updateStats();
    saveToCloud();
}

// Stats Update
function updateStats() {
    totalMedsEl.textContent = medicines.length;
    
    const lowStock = medicines.filter(m => {
        if (m.isSos) return m.currentPills <= 5;
        const daily = m.shifts.length;
        return daily > 0 && (m.currentPills / daily) <= 4;
    }).length;
    
    const refillSoon = medicines.filter(m => {
        if (m.isSos) return m.currentPills <= 10;
        const daily = m.shifts.length;
        return daily > 0 && (m.currentPills / daily) <= 7;
    }).length;

    lowStockCountEl.textContent = lowStock;
    refillSoonEl.textContent = refillSoon;
}

// UI Helpers
function toggleModal(show) {
    modal.style.display = show ? 'flex' : 'none';
}

function handleOverlayClick(e) {
    if (e.target === modal) toggleModal(false);
}

function showToast(msg, color = 'var(--primary)') {
    toast.textContent = msg;
    toast.style.background = color;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Notifications logic
function requestNotificationPermission() {
    if (!("Notification" in window)) {
        showToast("Browser doesn't support notifications", "var(--danger)");
        return;
    }

    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            showToast("Notifications Enabled!");
            document.getElementById('notif-btn').style.color = 'var(--success)';
            new Notification("MedTrack", { body: "You will now receive low stock alerts." });
        }
    });
}

function checkNotifications() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    medicines.forEach(med => {
        if (med.isSos) {
            if (med.currentPills <= 5) {
                new Notification(`Critical SOS Stock: ${med.name}`, { body: `Only ${med.currentPills} tabs left.` });
            }
            return;
        }
        
        const daily = med.shifts.length;
        const days = Math.floor(med.currentPills / daily);
        
        if (daily > 0) {
            if (days === 2) {
                new Notification(`Critical Stock: ${med.name}`, {
                    body: `Only 2 days of medicine left. Please refill immediately!`,
                    icon: 'https://cdn-icons-png.flaticon.com/512/822/822143.png'
                });
            } else if (days === 4) {
                new Notification(`Low Stock: ${med.name}`, {
                    body: `You have 4 days left. Time to buy a new strip.`,
                });
            }
        }
    });
}

// Run init
init();

// Update shopping list for SOS
function showShoppingList() {
    const listEl = document.getElementById('shopping-items-list');
    listEl.innerHTML = '';
    
    medicines.forEach((med, index) => {
        let shortage = 0;
        let recommendationText = "";
        let currentStatus = "";

        if (med.isSos) {
            // For SOS, if less than 10 tablets, suggest buying 1 strip
            if (med.currentPills < 10) {
                shortage = med.pillsPerStrip;
                recommendationText = `Stock is low for SOS use`;
                currentStatus = `${med.currentPills} tabs left`;
            }
        } else {
            const daily = med.shifts.length;
            const requiredFor30Days = daily * 30;
            shortage = Math.max(0, requiredFor30Days - med.currentPills);
            const daysLeft = daily > 0 ? Math.floor(med.currentPills / daily) : 0;
            currentStatus = `${daysLeft} days left`;
            recommendationText = `Needs 30-day stock`;
        }

        if (shortage > 0) { 
            const stripsToBuy = Math.ceil(shortage / med.pillsPerStrip);
            
            // Only add to list if actually needs something
            if (stripsToBuy > 0) {
                const item = document.createElement('div');
                item.className = 'shopping-item';
                item.style.background = 'rgba(255, 255, 255, 0.02)';
                item.style.borderRadius = '16px';
                item.style.marginBottom = '0.8rem';
                item.style.border = '1px solid var(--glass-border)';
                item.style.overflow = 'hidden';
                
                item.innerHTML = `
                    <div class="shop-header" onclick="toggleShopItem(${index})" style="padding: 1rem 1.2rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 600; font-size: 1.1rem;">${med.name} ${med.isSos ? '(SOS)' : ''}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${currentStatus}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="font-weight: 700; color: var(--warning); background: rgba(245, 158, 11, 0.1); padding: 0.3rem 0.6rem; border-radius: 8px;">+ ${stripsToBuy} Strips</div>
                            <ion-icon name="chevron-down-outline" id="chevron-${index}"></ion-icon>
                        </div>
                    </div>
                    
                    <div id="shop-content-${index}" style="display: none; padding: 0 1.2rem 1.2rem 1.2rem; border-top: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.01);">
                        <div style="padding-top: 0.5rem; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">${recommendationText}</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: flex-end;">
                            <div>
                                <label style="font-size: 0.7rem; color: var(--text-muted);">Confirm Strips</label>
                                <input type="number" id="shop-strips-${index}" value="${stripsToBuy}" min="0" style="padding: 0.6rem; width: 100%; font-weight: 600;">
                            </div>
                            <div>
                                <label style="font-size: 0.7rem; color: var(--text-muted);">Tabs per Strip</label>
                                <input type="number" id="shop-pps-${index}" value="${med.pillsPerStrip}" min="1" style="padding: 0.6rem; width: 100%;">
                            </div>
                        </div>
                        
                        <button class="add-btn" onclick="updateStockFromShop(${index})" style="width: 100%; margin-top: 1.2rem; background: var(--success); font-size: 0.9rem; padding: 0.8rem;">
                            <ion-icon name="bag-check-outline" style="margin-right: 5px;"></ion-icon>
                            Add to Inventory
                        </button>
                    </div>
                `;
                listEl.appendChild(item);
            }
        }
    });

    if (listEl.innerHTML === '') {
        listEl.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">All stocks are good! 🎉</div>';
    }

    toggleShoppingModal(true);
}

function toggleShopItem(index) {
    const content = document.getElementById(`shop-content-${index}`);
    const chevron = document.getElementById(`chevron-${index}`);
    const isVisible = content.style.display === 'block';
    
    content.style.display = isVisible ? 'none' : 'block';
    chevron.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
    chevron.style.transition = 'transform 0.3s';
}

function updateStockFromShop(index) {
    const strips = parseInt(document.getElementById(`shop-strips-${index}`).value) || 0;
    const pps = parseInt(document.getElementById(`shop-pps-${index}`).value) || 1;
    
    if (strips > 0) {
        const med = medicines[index];
        med.currentPills += (strips * pps);
        med.pillsPerStrip = pps;
        saveData();
        showToast(`Added ${strips * pps} tabs to ${med.name}!`);
        showShoppingList(); 
    } else {
        showToast("Please enter number of strips bought", "var(--warning)");
    }
}

function toggleShoppingModal(show) {
    document.getElementById('shopping-modal').style.display = show ? 'flex' : 'none';
}

function handleShoppingOverlayClick(e) {
    if (e.target.id === 'shopping-modal') toggleShoppingModal(false);
}
