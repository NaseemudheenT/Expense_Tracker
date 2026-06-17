// script.js — Expence Tracker v2.0
// Complete Firebase v10 modular app

import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────────
let currentUser   = null;
let allExpenses   = [];      // All expenses for this user (sorted newest first)
let calYear       = new Date().getFullYear();
let calMonth      = new Date().getMonth();
let isDarkMode    = localStorage.getItem("et_dark") === "true";
let currentPage   = "home";
let modalCallback = null;

// ─────────────────────────────────────────────
// INIT — Wait for Firebase Auth state
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Apply saved dark mode immediately
  applyDarkMode(isDarkMode, false);

  // Sync dark mode toggle in settings
  const darkChk = document.getElementById("darkModeToggle");
  if (darkChk) darkChk.checked = isDarkMode;

  // Set summary date
  setSummaryDate();

  // Auth state listener
  onAuthStateChanged(auth, (user) => {
    const splash = document.getElementById("splash");

    if (user) {
      currentUser = user;
      splash.classList.add("splash--hidden");
      showScreen("app");
      initApp();
    } else {
      currentUser = null;
      allExpenses = [];
      setTimeout(() => {
        splash.classList.add("splash--hidden");
        showScreen("auth");
      }, 1200);
    }
  });
});

// ─────────────────────────────────────────────
// SCREEN MANAGEMENT
// ─────────────────────────────────────────────
function showScreen(screen) {
  const authScreen = document.getElementById("authScreen");
  const appScreen  = document.getElementById("appScreen");

  if (screen === "auth") {
    authScreen.classList.remove("d-none");
    appScreen.classList.add("d-none");
  } else {
    authScreen.classList.add("d-none");
    appScreen.classList.remove("d-none");
  }
}

// ─────────────────────────────────────────────
// INIT APP (after login)
// ─────────────────────────────────────────────
async function initApp() {
  if (!currentUser) return;

  const displayName = currentUser.displayName || currentUser.email.split("@")[0];
  const email       = currentUser.email;

  // Set user info across UI
  setEl("sbUserName",       displayName);
  setEl("sbUserEmail",      email);
  setEl("settingsUserName", displayName);
  setEl("settingsUserEmail",email);

  // Apply saved default currency
  const defCur = localStorage.getItem("et_currency") || "₹";
  const curSel = document.getElementById("expCurrency");
  if (curSel) curSel.value = defCur;
  updateCurrencyBadge();

  const setCurSel = document.getElementById("defaultCurrencySelect");
  if (setCurSel) setCurSel.value = defCur;

  // Load expenses from Firestore
  await loadExpenses();

  // Navigate to home
  navigateTo("home");
}

// ─────────────────────────────────────────────
// AUTH — Tab switcher
// ─────────────────────────────────────────────
window.showAuthTab = function(tab) {
  document.getElementById("loginForm").classList.toggle("d-none", tab !== "login");
  document.getElementById("signupForm").classList.toggle("d-none", tab !== "signup");
  document.getElementById("tabLoginBtn").classList.toggle("auth-tab--active", tab === "login");
  document.getElementById("tabSignupBtn").classList.toggle("auth-tab--active", tab !== "login");
  setEl("loginError", "");
  setEl("signupError", "");
};

// ─────────────────────────────────────────────
// AUTH — Login
// ─────────────────────────────────────────────
window.handleLogin = async function() {
  const email    = val("loginEmail").trim();
  const password = val("loginPassword");

  setEl("loginError", "");
  if (!email || !password) { setEl("loginError", "Please fill in all fields."); return; }

  setBtnLoading("loginBtn", "loginBtnText", "loginBtnSpinner", true);

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    setEl("loginError", getAuthError(err.code));
    setBtnLoading("loginBtn", "loginBtnText", "loginBtnSpinner", false);
  }
};

// ─────────────────────────────────────────────
// AUTH — Signup
// ─────────────────────────────────────────────
window.handleSignup = async function() {
  const name     = val("signupName").trim();
  const email    = val("signupEmail").trim();
  const password = val("signupPassword");
  const confirm  = val("signupConfirm");

  setEl("signupError", "");

  if (!name || !email || !password || !confirm) {
    setEl("signupError", "Please fill in all fields."); return;
  }
  if (password.length < 6) {
    setEl("signupError", "Password must be at least 6 characters."); return;
  }
  if (password !== confirm) {
    setEl("signupError", "Passwords do not match."); return;
  }

  setBtnLoading("signupBtn", "signupBtnText", "signupBtnSpinner", true);

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
  } catch (err) {
    setEl("signupError", getAuthError(err.code));
    setBtnLoading("signupBtn", "signupBtnText", "signupBtnSpinner", false);
  }
};

// ─────────────────────────────────────────────
// AUTH — Logout
// ─────────────────────────────────────────────
window.handleLogout = async function() {
  try {
    await signOut(auth);
    allExpenses = [];
    showToast("Logged out successfully");
    closeSidebar();
  } catch (err) {
    showToast("Logout failed. Try again.");
  }
};

// ─────────────────────────────────────────────
// FIRESTORE — Load all expenses for current user
// ─────────────────────────────────────────────
async function loadExpenses() {
  if (!currentUser) return;

  try {
    // Path: expenses collection, filtered by uid, ordered by timestamp desc
    const q = query(
      collection(db, "expenses"),
      where("uid", "==", currentUser.uid),
      orderBy("timestamp", "desc")
    );
    const snapshot = await getDocs(q);
    allExpenses = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  } catch (err) {
    console.error("Load expenses error:", err);
    // If index error, try without orderBy
    try {
      const q2 = query(
        collection(db, "expenses"),
        where("uid", "==", currentUser.uid)
      );
      const snap2 = await getDocs(q2);
      allExpenses = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort client-side
      allExpenses.sort((a, b) => {
        const ta = a.timestamp?.seconds || 0;
        const tb = b.timestamp?.seconds || 0;
        return tb - ta;
      });
    } catch (err2) {
      console.error("Load expenses fallback error:", err2);
      showToast("Could not load expenses.");
    }
  }

  renderAll();
}

// ─────────────────────────────────────────────
// EXPENSE — Add
// ─────────────────────────────────────────────
window.handleAddExpense = async function() {
  const name     = val("expName").trim();
  const amountRaw= val("expAmount");
  const currency = val("expCurrency");
  const amount   = parseFloat(amountRaw);

  setEl("addExpenseError", "");

  if (!name)               { setEl("addExpenseError", "Please enter an expense name."); return; }
  if (isNaN(amount) || amount < 0) { setEl("addExpenseError", "Please enter a valid amount."); return; }

  setBtnLoading("addExpenseBtn", "addBtnText", "addBtnSpinner", true);

  try {
    const now     = new Date();
    const dateStr = formatDate(now);
    const timeStr = formatTime(now);
    const ts      = Timestamp.fromDate(now);

    const expenseData = {
      uid:       currentUser.uid,
      name:      name,
      amount:    amount,
      currency:  currency,
      date:      dateStr,
      time:      timeStr,
      timestamp: ts
    };

    const docRef = await addDoc(collection(db, "expenses"), expenseData);

    // Insert at front of local array (newest first)
    allExpenses.unshift({ id: docRef.id, ...expenseData });

    // Clear form
    document.getElementById("expName").value   = "";
    document.getElementById("expAmount").value = "";

    renderAll();
    showToast("Expense added successfully ✓");
  } catch (err) {
    console.error("Add expense error:", err);
    setEl("addExpenseError", "Failed to add expense. Please try again.");
  }

  setBtnLoading("addExpenseBtn", "addBtnText", "addBtnSpinner", false);
};

// ─────────────────────────────────────────────
// EXPENSE — Delete single
// ─────────────────────────────────────────────
window.handleDeleteExpense = function(expenseId, expenseName) {
  openConfirmModal(
    "Delete Expense",
    `Delete "${expenseName}"? This cannot be undone.`,
    async () => {
      try {
        await deleteDoc(doc(db, "expenses", expenseId));
        allExpenses = allExpenses.filter(e => e.id !== expenseId);
        renderAll();
        showToast("Expense deleted");
      } catch (err) {
        console.error("Delete error:", err);
        showToast("Failed to delete. Try again.");
      }
    }
  );
};

// ─────────────────────────────────────────────
// EXPENSE — Clear All
// ─────────────────────────────────────────────
window.handleClearAll = function() {
  if (!allExpenses.length) {
    showToast("No expenses to clear.");
    return;
  }
  openConfirmModal(
    "Clear All Expenses",
    "This will permanently delete ALL your expenses. This cannot be undone.",
    async () => {
      try {
        const batch = writeBatch(db);
        allExpenses.forEach(exp => {
          batch.delete(doc(db, "expenses", exp.id));
        });
        await batch.commit();
        allExpenses = [];
        renderAll();
        showToast("All expenses cleared");
      } catch (err) {
        console.error("Clear all error:", err);
        showToast("Failed to clear. Try again.");
      }
    }
  );
};

// ─────────────────────────────────────────────
// RENDER — All views
// ─────────────────────────────────────────────
function renderAll() {
  renderSummary();
  renderHistory();
  renderStats();
  renderCalendar();
}

// ─────────────────────────────────────────────
// RENDER — Summary Card
// ─────────────────────────────────────────────
function renderSummary() {
  const todayStr  = formatDate(new Date());
  const todayExps = allExpenses.filter(e => e.date === todayStr);
  const total     = todayExps.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Use the most recent currency for display, or default
  const currency = todayExps.length ? todayExps[0].currency : (val("expCurrency") || "₹");

  setEl("todayTotal", `${currency} ${total.toFixed(2)}`);
  setEl("todayCount", todayExps.length);
}

// ─────────────────────────────────────────────
// RENDER — Expense History
// ─────────────────────────────────────────────
window.renderHistory = function() {
  const container  = document.getElementById("historyContainer");
  const searchTerm = (val("searchInput") || "").toLowerCase().trim();

  // Filter by search
  let expenses = allExpenses;
  if (searchTerm) {
    expenses = expenses.filter(e =>
      e.name.toLowerCase().includes(searchTerm) ||
      String(e.amount).includes(searchTerm)
    );
  }

  if (!expenses.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-receipt"></i>
        <p>${searchTerm
          ? `No expenses found for "${searchTerm}"`
          : "No expenses yet.<br/>Add your first expense above!"
        }</p>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  expenses.forEach(e => {
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  });

  // Sort dates descending
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const todayStr     = formatDate(new Date());
  const yesterdayStr = formatDate(new Date(Date.now() - 86400000));

  let html = "";

  sortedDates.forEach(dateStr => {
    const items    = groups[dateStr];
    const total    = items.reduce((s, e) => s + (e.amount || 0), 0);
    const currency = items[0]?.currency || "₹";

    let groupName = dateStr;
    let groupSub  = dateStr;
    if (dateStr === todayStr) {
      groupName = "TODAY";
      groupSub  = `• ${dateStr}`;
    } else if (dateStr === yesterdayStr) {
      groupName = "YESTERDAY";
      groupSub  = `• ${dateStr}`;
    }

    const groupId = `group_${dateStr.replace(/-/g, "")}`;

    html += `
    <div class="day-group">
      <div class="day-group-header" onclick="toggleDayGroup('${groupId}')">
        <div class="day-group-left">
          <span class="day-group-name">${groupName}</span>
          <span class="day-group-date">${groupSub}</span>
        </div>
        <div class="day-group-right">
          <span class="day-group-total">Total: ${currency} ${total.toFixed(2)}</span>
          <span class="day-group-badge">${items.length} Expense${items.length !== 1 ? "s" : ""}</span>
          <i class="fas fa-chevron-up day-group-arrow day-group-arrow--up" id="${groupId}_arrow"></i>
        </div>
      </div>
      <div class="day-group-items" id="${groupId}_items">
        ${items.map((exp, idx) => `
          <div class="expense-item">
            <span class="item-dot"></span>
            <div class="item-num">${idx + 1}</div>
            <div class="item-info">
              <div class="item-name">${escHtml(exp.name)}</div>
              <div class="item-time">${exp.time || ""}</div>
            </div>
            <span class="item-amount">${exp.currency || "₹"} ${(exp.amount || 0).toFixed(2)}</span>
            <button
              class="item-delete-btn"
              onclick="handleDeleteExpense('${exp.id}', '${escHtml(exp.name)}')"
              title="Delete"
            >
              <i class="fas fa-trash"></i>
            </button>
          </div>
        `).join("")}
      </div>
    </div>`;
  });

  container.innerHTML = html;
};

// Toggle day group collapse
window.toggleDayGroup = function(groupId) {
  const items = document.getElementById(`${groupId}_items`);
  const arrow = document.getElementById(`${groupId}_arrow`);
  if (!items || !arrow) return;

  const isOpen = !items.classList.contains("d-none");
  if (isOpen) {
    items.classList.add("d-none");
    arrow.classList.remove("day-group-arrow--up");
    arrow.classList.add("day-group-arrow--down");
  } else {
    items.classList.remove("d-none");
    arrow.classList.add("day-group-arrow--up");
    arrow.classList.remove("day-group-arrow--down");
  }
};

// ─────────────────────────────────────────────
// RENDER — Stats Page
// ─────────────────────────────────────────────
function renderStats() {
  if (currentPage !== "stats") return;

  const todayStr   = formatDate(new Date());
  const monthStr   = todayStr.slice(0, 7); // YYYY-MM
  const currency   = allExpenses[0]?.currency || "₹";

  const todayExps  = allExpenses.filter(e => e.date === todayStr);
  const monthExps  = allExpenses.filter(e => (e.date || "").startsWith(monthStr));

  const todayTotal = todayExps.reduce((s, e) => s + (e.amount || 0), 0);
  const monthTotal = monthExps.reduce((s, e) => s + (e.amount || 0), 0);
  const allTotal   = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const uniqueDays = new Set(allExpenses.map(e => e.date)).size || 1;
  const dailyAvg   = allTotal / uniqueDays;

  document.getElementById("statsCardsGrid").innerHTML = `
    <div class="stat-card">
      <div class="stat-label">TODAY</div>
      <div class="stat-value">${currency} ${todayTotal.toFixed(0)}</div>
      <div class="stat-sub">${todayExps.length} expense${todayExps.length !== 1 ? "s" : ""}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">THIS MONTH</div>
      <div class="stat-value">${currency} ${monthTotal.toFixed(0)}</div>
      <div class="stat-sub">${monthExps.length} expense${monthExps.length !== 1 ? "s" : ""}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">ALL TIME</div>
      <div class="stat-value">${currency} ${allTotal.toFixed(0)}</div>
      <div class="stat-sub">${allExpenses.length} total expenses</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">DAILY AVG</div>
      <div class="stat-value">${currency} ${dailyAvg.toFixed(0)}</div>
      <div class="stat-sub">per active day</div>
    </div>
  `;

  // Bar chart — last 7 days
  const bars = [];
  for (let i = 6; i >= 0; i--) {
    const d     = new Date(Date.now() - i * 86400000);
    const dStr  = formatDate(d);
    const sum   = allExpenses.filter(e => e.date === dStr).reduce((s, e) => s + (e.amount || 0), 0);
    const day   = d.toLocaleDateString("en", { weekday: "short" }).slice(0, 2);
    bars.push({ day, sum, isToday: dStr === todayStr });
  }
  const maxSum = Math.max(...bars.map(b => b.sum), 1);

  document.getElementById("barChart").innerHTML = bars.map(b => `
    <div class="bar-col">
      <div class="bar-amount">${b.sum > 0 ? b.sum.toFixed(0) : ""}</div>
      <div
        class="bar-fill${b.isToday ? " bar-fill--today" : ""}"
        style="height:${Math.max((b.sum / maxSum) * 90, b.sum > 0 ? 4 : 0)}px"
      ></div>
      <div class="bar-day">${b.day}</div>
    </div>
  `).join("");

  // Top 5 expenses (by amount)
  const sorted   = [...allExpenses].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 5);
  const topEl    = document.getElementById("topExpenses");
  if (!sorted.length) {
    topEl.innerHTML = `<p style="font-size:13px;color:var(--text-muted);padding:12px 0">No expenses yet.</p>`;
  } else {
    topEl.innerHTML = sorted.map((e, i) => `
      <div class="top-expense-item">
        <div class="top-expense-rank">${i + 1}</div>
        <div class="top-expense-name">${escHtml(e.name)}</div>
        <div class="top-expense-amount">${e.currency || currency} ${(e.amount || 0).toFixed(2)}</div>
      </div>
    `).join("");
  }
}

// ─────────────────────────────────────────────
// RENDER — Calendar
// ─────────────────────────────────────────────
function renderCalendar() {
  if (currentPage !== "calendar") return;

  const labelEl = document.getElementById("calMonthLabel");
  if (labelEl) {
    labelEl.textContent = new Date(calYear, calMonth, 1)
      .toLocaleDateString("en", { month: "long", year: "numeric" });
  }

  const gridEl = document.getElementById("calendarGrid");
  if (!gridEl) return;

  const firstDay     = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr     = formatDate(new Date());
  const expDates     = new Set(allExpenses.map(e => e.date));

  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  let html = `<div class="cal-weekdays-row">`;
  weekdays.forEach(d => {
    html += `<div class="cal-weekday-cell">${d}</div>`;
  });
  html += `</div><div class="cal-days-grid">`;

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-day-cell cal-day-cell--empty"></div>`;
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr  = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    const isToday  = dateStr === todayStr;
    const hasExp   = expDates.has(dateStr);

    let cls = "cal-day-cell";
    if (isToday) cls += " cal-day-cell--today";
    if (hasExp)  cls += " cal-day-cell--has-expense";

    html += `<div class="${cls}" onclick="showCalendarDay('${dateStr}')">${d}</div>`;
  }

  html += `</div>`;
  gridEl.innerHTML = html;
}

// Calendar — show day detail
window.showCalendarDay = function(dateStr) {
  const detailEl = document.getElementById("calDayDetail");
  if (!detailEl) return;

  const dayExps = allExpenses.filter(e => e.date === dateStr);

  if (!dayExps.length) {
    detailEl.innerHTML = `<div class="cal-day-detail-title">${dateStr} — No expenses</div>`;
    detailEl.classList.remove("d-none");
    return;
  }

  const total    = dayExps.reduce((s, e) => s + (e.amount || 0), 0);
  const currency = dayExps[0]?.currency || "₹";

  let html = `<div class="cal-day-detail-title">${dateStr} — Total: ${currency} ${total.toFixed(2)}</div>`;
  dayExps.forEach(e => {
    html += `
      <div class="cal-detail-item">
        <span class="cal-detail-name">${escHtml(e.name)}</span>
        <span class="cal-detail-amount">${e.currency || currency} ${(e.amount || 0).toFixed(2)}</span>
      </div>`;
  });

  detailEl.innerHTML = html;
  detailEl.classList.remove("d-none");
};

// Calendar — change month
window.calendarChangeMonth = function(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }

  // Hide day detail when navigating months
  const detailEl = document.getElementById("calDayDetail");
  if (detailEl) detailEl.classList.add("d-none");

  renderCalendar();
};

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
window.navigateTo = function(page) {
  currentPage = page;

  // Pages
  const pages = ["home", "stats", "calendar", "settings"];
  pages.forEach(p => {
    const el = document.getElementById(`${p}Page`);
    if (el) el.classList.toggle("page--active", p === page);
  });

  // Nav buttons
  pages.forEach(p => {
    const btn = document.getElementById(`nav${capitalize(p)}`);
    if (btn) btn.classList.toggle("nav-btn--active", p === page);
  });

  // Sidebar active state
  document.querySelectorAll(".sb-nav-item").forEach((btn, i) => {
    btn.classList.toggle("sb-nav-item--active", i === pages.indexOf(page));
  });

  // Render page-specific content
  if (page === "stats")    renderStats();
  if (page === "calendar") renderCalendar();
};

window.scrollToAddExpense = function() {
  navigateTo("home");
  setTimeout(() => {
    const card = document.querySelector(".section-card");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = document.getElementById("expName");
    if (input) input.focus();
  }, 100);
};

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────
window.openSidebar = function() {
  document.getElementById("sidebar").classList.remove("sidebar--closed");
  document.getElementById("sidebar").classList.add("sidebar--open");
  document.getElementById("sidebarOverlay").classList.remove("d-none");
};

window.closeSidebar = function() {
  document.getElementById("sidebar").classList.add("sidebar--closed");
  document.getElementById("sidebar").classList.remove("sidebar--open");
  document.getElementById("sidebarOverlay").classList.add("d-none");
};

// ─────────────────────────────────────────────
// DARK MODE
// ─────────────────────────────────────────────
window.toggleDarkMode = function() {
  isDarkMode = !isDarkMode;
  localStorage.setItem("et_dark", isDarkMode);
  applyDarkMode(isDarkMode, true);
};

window.handleDarkToggle = function() {
  const chk  = document.getElementById("darkModeToggle");
  isDarkMode = chk.checked;
  localStorage.setItem("et_dark", isDarkMode);
  applyDarkMode(isDarkMode, true);
};

function applyDarkMode(dark, syncToggle) {
  document.body.classList.toggle("dark-mode", dark);

  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.className = dark ? "fas fa-sun" : "fas fa-moon";
  }

  if (syncToggle) {
    const chk = document.getElementById("darkModeToggle");
    if (chk) chk.checked = dark;
  }
}

// ─────────────────────────────────────────────
// CURRENCY
// ─────────────────────────────────────────────
window.updateCurrencyBadge = function() {
  const cur = val("expCurrency") || "₹";
  const badge = document.getElementById("currencyBadge");
  if (badge) badge.textContent = cur;
};

window.saveDefaultCurrency = function() {
  const cur = val("defaultCurrencySelect") || "₹";
  localStorage.setItem("et_currency", cur);
  const curSel = document.getElementById("expCurrency");
  if (curSel) { curSel.value = cur; updateCurrencyBadge(); }
  showToast("Default currency saved");
};

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────
function openConfirmModal(title, message, onConfirm) {
  setEl("modalTitle",   title);
  setEl("modalMessage", message);
  modalCallback = onConfirm;
  document.getElementById("confirmModal").classList.remove("d-none");

  const confirmBtn = document.getElementById("modalConfirmBtn");
  confirmBtn.onclick = () => {
    closeConfirmModal();
    if (modalCallback) modalCallback();
  };
}

window.closeConfirmModal = function() {
  document.getElementById("confirmModal").classList.add("d-none");
  modalCallback = null;
};

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("d-none");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("d-none");
  }, 3000);
}

// ─────────────────────────────────────────────
// PASSWORD TOGGLE
// ─────────────────────────────────────────────
window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isText = input.type === "text";
  input.type   = isText ? "password" : "text";
  const icon   = btn.querySelector("i");
  if (icon) icon.className = isText ? "fas fa-eye-slash" : "fas fa-eye";
};

// ─────────────────────────────────────────────
// DATE / TIME HELPERS
// ─────────────────────────────────────────────
function setSummaryDate() {
  const d = new Date();
  const dateEl = document.getElementById("summaryDate");
  const dayEl  = document.getElementById("summaryWeekday");
  if (dateEl) dateEl.textContent = d.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });
  if (dayEl) dayEl.textContent = d.toLocaleDateString("en-IN", { weekday: "long" });
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d) {
  let h    = d.getHours();
  let m    = d.getMinutes();
  const am = h >= 12 ? "PM" : "AM";
  h        = h % 12 || 12;
  return `${pad(h)}:${pad(m)} ${am}`;
}

function pad(n) { return String(n).padStart(2, "0"); }

// ─────────────────────────────────────────────
// DOM HELPERS
// ─────────────────────────────────────────────
function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function setBtnLoading(btnId, textId, spinnerId, loading) {
  const btn     = document.getElementById(btnId);
  const text    = document.getElementById(textId);
  const spinner = document.getElementById(spinnerId);
  if (btn)     btn.disabled = loading;
  if (text)    text.classList.toggle("d-none", loading);
  if (spinner) spinner.classList.toggle("d-none", !loading);
}

// ─────────────────────────────────────────────
// AUTH ERROR MESSAGES
// ─────────────────────────────────────────────
function getAuthError(code) {
  const errors = {
    "auth/user-not-found":       "No account found with this email.",
    "auth/wrong-password":       "Incorrect password. Please try again.",
    "auth/invalid-credential":   "Invalid email or password.",
    "auth/invalid-email":        "Please enter a valid email address.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password":        "Password must be at least 6 characters.",
    "auth/too-many-requests":    "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/user-disabled":        "This account has been disabled."
  };
  return errors[code] || "Something went wrong. Please try again.";
}
