// script.js — Expence Tracker v2.0 — FIXED
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
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let currentUser   = null;
let allExpenses   = [];
let calYear       = new Date().getFullYear();
let calMonth      = new Date().getMonth();
let isDarkMode    = localStorage.getItem("et_dark") === "true";
let currentPage   = "home";
let modalCallback = null;

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyDarkMode(isDarkMode, false);
  setSummaryDate();

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
// SCREENS
// ─────────────────────────────────────────────
function showScreen(screen) {
  document.getElementById("authScreen").classList.toggle("d-none", screen !== "auth");
  document.getElementById("appScreen").classList.toggle("d-none", screen !== "app");
}

// ─────────────────────────────────────────────
// INIT APP
// ─────────────────────────────────────────────
async function initApp() {
  if (!currentUser) return;

  const displayName = currentUser.displayName || currentUser.email.split("@")[0];
  const email = currentUser.email;

  setEl("sbUserName",        displayName);
  setEl("sbUserEmail",       email);
  setEl("settingsUserName",  displayName);
  setEl("settingsUserEmail", email);

  const defCur = localStorage.getItem("et_currency") || "₹";
  const curSel = document.getElementById("expCurrency");
  if (curSel) curSel.value = defCur;
  updateCurrencyBadge();

  const setCurSel = document.getElementById("defaultCurrencySelect");
  if (setCurSel) setCurSel.value = defCur;

  const darkChk = document.getElementById("darkModeToggle");
  if (darkChk) darkChk.checked = isDarkMode;

  await loadExpenses();
  navigateTo("home");
}

// ─────────────────────────────────────────────
// AUTH — Tab
// ─────────────────────────────────────────────
window.showAuthTab = function(tab) {
  document.getElementById("loginForm").classList.toggle("d-none",  tab !== "login");
  document.getElementById("signupForm").classList.toggle("d-none", tab !== "signup");
  document.getElementById("tabLoginBtn").classList.toggle("auth-tab--active",  tab === "login");
  document.getElementById("tabSignupBtn").classList.toggle("auth-tab--active", tab === "signup");
  setEl("loginError",  "");
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

  if (!name || !email || !password || !confirm) { setEl("signupError", "Please fill in all fields."); return; }
  if (password.length < 6)  { setEl("signupError", "Password must be at least 6 characters."); return; }
  if (password !== confirm) { setEl("signupError", "Passwords do not match."); return; }

  setBtnLoading("signupBtn", "signupBtnText", "signupBtnSpinner", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
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
    closeSidebar();
    showToast("Logged out successfully");
  } catch (err) {
    showToast("Logout failed. Try again.");
  }
};

// ─────────────────────────────────────────────
// FIRESTORE — Load expenses
// Tries with orderBy first; falls back to client-side sort
// if the Firestore composite index hasn't been created yet.
// ─────────────────────────────────────────────
async function loadExpenses() {
  if (!currentUser) return;
  try {
    const q = query(
      collection(db, "expenses"),
      where("uid", "==", currentUser.uid),
      orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    allExpenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Fallback: no orderBy (works before index is built)
    try {
      const q2   = query(collection(db, "expenses"), where("uid", "==", currentUser.uid));
      const snap2 = await getDocs(q2);
      allExpenses = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      allExpenses.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    } catch (err2) {
      console.error("loadExpenses failed:", err2);
      showToast("Could not load expenses.");
    }
  }
  renderAll();
}

// ─────────────────────────────────────────────
// EXPENSE — Add
// FIX: amount validated properly; Timestamp.fromDate used correctly
// ─────────────────────────────────────────────
window.handleAddExpense = async function() {
  const name     = val("expName").trim();
  const amountRaw = val("expAmount").trim();
  const currency  = val("expCurrency") || "₹";
  const amount    = parseFloat(amountRaw);

  setEl("addExpenseError", "");

  if (!name)                      { setEl("addExpenseError", "Please enter an expense name."); return; }
  if (amountRaw === "")           { setEl("addExpenseError", "Please enter an amount."); return; }
  if (isNaN(amount) || amount < 0){ setEl("addExpenseError", "Please enter a valid amount (0 or more)."); return; }

  setBtnLoading("addExpenseBtn", "addBtnText", "addBtnSpinner", true);

  try {
    const now     = new Date();
    const expense = {
      uid:       currentUser.uid,
      name:      name,
      amount:    amount,
      currency:  currency,
      date:      formatDate(now),
      time:      formatTime(now),
      timestamp: Timestamp.fromDate(now)
    };

    const docRef = await addDoc(collection(db, "expenses"), expense);

    // Add to local array at the front (newest first)
    allExpenses.unshift({ id: docRef.id, ...expense });

    // Clear inputs
    document.getElementById("expName").value   = "";
    document.getElementById("expAmount").value = "";

    renderAll();
    showToast("✓ Expense added");
  } catch (err) {
    console.error("Add expense error:", err);
    setEl("addExpenseError", "Failed to save. Check your connection and try again.");
  }

  setBtnLoading("addExpenseBtn", "addBtnText", "addBtnSpinner", false);
};

// ─────────────────────────────────────────────
// EXPENSE — Delete single
// FIX: use a data-id attribute approach via event delegation
// instead of passing id/name directly in onclick strings
// (special characters in names were breaking onclick="...")
// ─────────────────────────────────────────────
window.handleDeleteExpense = function(expenseId) {
  // Find the expense in local array to get the name for the modal
  const expense = allExpenses.find(e => e.id === expenseId);
  if (!expense) { showToast("Expense not found."); return; }

  openConfirmModal(
    "Delete Expense",
    `Delete "${expense.name}"? This cannot be undone.`,
    async () => {
      try {
        await deleteDoc(doc(db, "expenses", expenseId));
        allExpenses = allExpenses.filter(e => e.id !== expenseId);
        renderAll();
        showToast("Expense deleted");
      } catch (err) {
        console.error("Delete error:", err);
        showToast("Delete failed. Check your connection.");
      }
    }
  );
};

// ─────────────────────────────────────────────
// EXPENSE — Clear All
// FIX: batch.commit() in chunks of 500 (Firestore limit)
// ─────────────────────────────────────────────
window.handleClearAll = function() {
  if (!allExpenses.length) { showToast("No expenses to clear."); return; }

  openConfirmModal(
    "Clear All Expenses",
    `Permanently delete all ${allExpenses.length} expense${allExpenses.length !== 1 ? "s" : ""}? This cannot be undone.`,
    async () => {
      try {
        // Firestore batch limit = 500 writes per commit
        const CHUNK = 500;
        const ids   = allExpenses.map(e => e.id);
        for (let i = 0; i < ids.length; i += CHUNK) {
          const batch = writeBatch(db);
          ids.slice(i, i + CHUNK).forEach(id => batch.delete(doc(db, "expenses", id)));
          await batch.commit();
        }
        allExpenses = [];
        renderAll();
        showToast("All expenses cleared");
      } catch (err) {
        console.error("Clear all error:", err);
        showToast("Clear failed. Check your connection.");
      }
    }
  );
};

// ─────────────────────────────────────────────
// RENDER — All
// FIX: renderStats() now always runs for summary card;
// the guard inside only skips the stats page DOM update
// ─────────────────────────────────────────────
function renderAll() {
  renderSummary();
  renderHistory();
  if (currentPage === "stats")    renderStats();
  if (currentPage === "calendar") renderCalendar();
}

// ─────────────────────────────────────────────
// RENDER — Summary card (today total + count)
// ─────────────────────────────────────────────
function renderSummary() {
  const todayStr  = formatDate(new Date());
  const todayExps = allExpenses.filter(e => e.date === todayStr);
  const total     = todayExps.reduce((s, e) => s + (e.amount || 0), 0);
  const currency  = todayExps.length
    ? todayExps[0].currency
    : (val("expCurrency") || "₹");

  setEl("todayTotal", `${currency} ${total.toFixed(2)}`);
  setEl("todayCount", String(todayExps.length));
}

// ─────────────────────────────────────────────
// RENDER — History
// FIX: delete button uses data-id attribute; no expense
// name passed through onclick (avoids HTML injection / quoting bugs)
// ─────────────────────────────────────────────
window.renderHistory = function() {
  const container  = document.getElementById("historyContainer");
  if (!container) return;

  const searchTerm = (val("searchInput") || "").toLowerCase().trim();
  let expenses = searchTerm
    ? allExpenses.filter(e =>
        e.name.toLowerCase().includes(searchTerm) ||
        String(e.amount).includes(searchTerm)
      )
    : allExpenses;

  if (!expenses.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-receipt"></i>
        <p>${searchTerm
          ? `No expenses match "<strong>${escHtmlText(searchTerm)}</strong>"`
          : "No expenses yet.<br/>Add your first expense above!"
        }</p>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  expenses.forEach(e => {
    const d = e.date || "Unknown";
    if (!groups[d]) groups[d] = [];
    groups[d].push(e);
  });

  const sortedDates  = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const todayStr     = formatDate(new Date());
  const yesterdayStr = formatDate(new Date(Date.now() - 86400000));

  let html = "";

  sortedDates.forEach(dateStr => {
    const items    = groups[dateStr];
    const total    = items.reduce((s, e) => s + (e.amount || 0), 0);
    const currency = items[0]?.currency || "₹";
    const groupId  = "grp_" + dateStr.replace(/-/g, "");

    let groupName = dateStr;
    let groupSub  = dateStr;
    if (dateStr === todayStr)     { groupName = "TODAY";     groupSub = "• " + dateStr; }
    else if (dateStr === yesterdayStr) { groupName = "YESTERDAY"; groupSub = "• " + dateStr; }

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
              <div class="item-name">${escHtmlText(exp.name)}</div>
              <div class="item-time">${exp.time || ""}</div>
            </div>
            <span class="item-amount">${exp.currency || currency} ${(exp.amount || 0).toFixed(2)}</span>
            <button
              class="item-delete-btn"
              data-id="${exp.id}"
              title="Delete expense"
              aria-label="Delete ${escHtmlAttr(exp.name)}"
            ><i class="fas fa-trash"></i></button>
          </div>
        `).join("")}
      </div>
    </div>`;
  });

  container.innerHTML = html;

  // ── Attach delete listeners via data-id (no inline onclick with user data) ──
  container.querySelectorAll(".item-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (id) handleDeleteExpense(id);
    });
  });
};

// Collapse / expand a day group
window.toggleDayGroup = function(groupId) {
  const items = document.getElementById(groupId + "_items");
  const arrow = document.getElementById(groupId + "_arrow");
  if (!items || !arrow) return;
  const open = !items.classList.contains("d-none");
  items.classList.toggle("d-none", open);
  arrow.classList.toggle("day-group-arrow--up",   !open);
  arrow.classList.toggle("day-group-arrow--down",  open);
};

// ─────────────────────────────────────────────
// RENDER — Stats page
// ─────────────────────────────────────────────
function renderStats() {
  const statsGrid = document.getElementById("statsCardsGrid");
  if (!statsGrid) return;

  const todayStr  = formatDate(new Date());
  const monthStr  = todayStr.slice(0, 7);
  const currency  = allExpenses[0]?.currency || val("expCurrency") || "₹";

  const todayExps = allExpenses.filter(e => e.date === todayStr);
  const monthExps = allExpenses.filter(e => (e.date || "").startsWith(monthStr));

  const todayTotal  = todayExps.reduce((s, e) => s + (e.amount || 0), 0);
  const monthTotal  = monthExps.reduce((s, e) => s + (e.amount || 0), 0);
  const allTotal    = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const uniqueDays  = new Set(allExpenses.map(e => e.date)).size || 1;
  const dailyAvg    = allTotal / uniqueDays;

  statsGrid.innerHTML = `
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
    </div>`;

  // Bar chart — last 7 days
  const bars = [];
  for (let i = 6; i >= 0; i--) {
    const d    = new Date(Date.now() - i * 86400000);
    const dStr = formatDate(d);
    const sum  = allExpenses.filter(e => e.date === dStr).reduce((s, e) => s + (e.amount || 0), 0);
    bars.push({ day: d.toLocaleDateString("en", { weekday: "short" }).slice(0, 2), sum, isToday: dStr === todayStr });
  }
  const maxSum = Math.max(...bars.map(b => b.sum), 1);
  document.getElementById("barChart").innerHTML = bars.map(b => `
    <div class="bar-col">
      <div class="bar-amount">${b.sum > 0 ? b.sum.toFixed(0) : ""}</div>
      <div class="bar-fill${b.isToday ? " bar-fill--today" : ""}"
           style="height:${Math.max((b.sum / maxSum) * 90, b.sum > 0 ? 4 : 0)}px"></div>
      <div class="bar-day">${b.day}</div>
    </div>`).join("");

  // Top 5 expenses
  const top   = [...allExpenses].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 5);
  const topEl = document.getElementById("topExpenses");
  topEl.innerHTML = top.length
    ? top.map((e, i) => `
        <div class="top-expense-item">
          <div class="top-expense-rank">${i + 1}</div>
          <div class="top-expense-name">${escHtmlText(e.name)}</div>
          <div class="top-expense-amount">${e.currency || currency} ${(e.amount || 0).toFixed(2)}</div>
        </div>`).join("")
    : `<p style="font-size:13px;color:var(--text-muted);padding:12px 0">No expenses yet.</p>`;
}

// ─────────────────────────────────────────────
// RENDER — Calendar
// ─────────────────────────────────────────────
function renderCalendar() {
  const labelEl = document.getElementById("calMonthLabel");
  const gridEl  = document.getElementById("calendarGrid");
  if (!labelEl || !gridEl) return;

  labelEl.textContent = new Date(calYear, calMonth, 1)
    .toLocaleDateString("en", { month: "long", year: "numeric" });

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr    = formatDate(new Date());
  const expDates    = new Set(allExpenses.map(e => e.date));

  const weekdays = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  let html = `<div class="cal-weekdays-row">` +
    weekdays.map(d => `<div class="cal-weekday-cell">${d}</div>`).join("") +
    `</div><div class="cal-days-grid">`;

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day-cell cal-day-cell--empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    let cls = "cal-day-cell";
    if (dateStr === todayStr)  cls += " cal-day-cell--today";
    if (expDates.has(dateStr)) cls += " cal-day-cell--has-expense";
    html += `<div class="${cls}" onclick="showCalendarDay('${dateStr}')">${d}</div>`;
  }
  html += `</div>`;
  gridEl.innerHTML = html;
}

window.showCalendarDay = function(dateStr) {
  const detailEl = document.getElementById("calDayDetail");
  if (!detailEl) return;

  const dayExps  = allExpenses.filter(e => e.date === dateStr);
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
        <span class="cal-detail-name">${escHtmlText(e.name)}</span>
        <span class="cal-detail-amount">${e.currency || currency} ${(e.amount || 0).toFixed(2)}</span>
      </div>`;
  });
  detailEl.innerHTML = html;
  detailEl.classList.remove("d-none");
};

window.calendarChangeMonth = function(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  const d = document.getElementById("calDayDetail");
  if (d) d.classList.add("d-none");
  renderCalendar();
};

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
window.navigateTo = function(page) {
  currentPage = page;
  ["home","stats","calendar","settings"].forEach(p => {
    const pageEl = document.getElementById(p + "Page");
    const navEl  = document.getElementById("nav" + capitalize(p));
    if (pageEl) pageEl.classList.toggle("page--active", p === page);
    if (navEl)  navEl.classList.toggle("nav-btn--active", p === page);
  });
  document.querySelectorAll(".sb-nav-item").forEach((btn, i) => {
    btn.classList.toggle("sb-nav-item--active",
      i === ["home","stats","calendar","settings"].indexOf(page));
  });
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
  document.getElementById("sidebar").classList.replace("sidebar--closed","sidebar--open");
  document.getElementById("sidebarOverlay").classList.remove("d-none");
};
window.closeSidebar = function() {
  document.getElementById("sidebar").classList.replace("sidebar--open","sidebar--closed");
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
  isDarkMode = document.getElementById("darkModeToggle").checked;
  localStorage.setItem("et_dark", isDarkMode);
  applyDarkMode(isDarkMode, false);
};
function applyDarkMode(dark, syncToggle) {
  document.body.classList.toggle("dark-mode", dark);
  const icon = document.getElementById("themeIcon");
  if (icon) icon.className = dark ? "fas fa-sun" : "fas fa-moon";
  if (syncToggle) {
    const chk = document.getElementById("darkModeToggle");
    if (chk) chk.checked = dark;
  }
}

// ─────────────────────────────────────────────
// CURRENCY
// ─────────────────────────────────────────────
window.updateCurrencyBadge = function() {
  const badge = document.getElementById("currencyBadge");
  if (badge) badge.textContent = val("expCurrency") || "₹";
};
window.saveDefaultCurrency = function() {
  const cur = val("defaultCurrencySelect") || "₹";
  localStorage.setItem("et_currency", cur);
  const sel = document.getElementById("expCurrency");
  if (sel) { sel.value = cur; updateCurrencyBadge(); }
  showToast("Default currency saved");
};

// ─────────────────────────────────────────────
// MODAL (confirmation dialog)
// ─────────────────────────────────────────────
function openConfirmModal(title, message, onConfirm) {
  setEl("modalTitle",   title);
  setEl("modalMessage", message);
  modalCallback = onConfirm;
  document.getElementById("confirmModal").classList.remove("d-none");
  document.getElementById("modalConfirmBtn").onclick = () => {
    closeConfirmModal();
    if (typeof modalCallback === "function") modalCallback();
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
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("d-none");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("d-none"), 3000);
}

// ─────────────────────────────────────────────
// PASSWORD TOGGLE
// ─────────────────────────────────────────────
window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isText  = input.type === "text";
  input.type    = isText ? "password" : "text";
  const icon    = btn.querySelector("i");
  if (icon) icon.className = isText ? "fas fa-eye-slash" : "fas fa-eye";
};

// ─────────────────────────────────────────────
// DATE / TIME HELPERS
// ─────────────────────────────────────────────
function setSummaryDate() {
  const d = new Date();
  const dateEl = document.getElementById("summaryDate");
  const dayEl  = document.getElementById("summaryWeekday");
  if (dateEl) dateEl.textContent = d.toLocaleDateString("en-IN",
    { day: "2-digit", month: "short", year: "numeric" });
  if (dayEl)  dayEl.textContent  = d.toLocaleDateString("en-IN", { weekday: "long" });
}
function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatTime(d) {
  let h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${pad(h)}:${pad(m)} ${ampm}`;
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
// Safe for innerHTML text content (never put in attributes)
function escHtmlText(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}
// Safe for HTML attribute values (used in aria-label etc.)
function escHtmlAttr(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/"/g,"&quot;")
    .replace(/'/g,"&#x27;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function setBtnLoading(btnId, textId, spinnerId, loading) {
  const btn     = document.getElementById(btnId);
  const text    = document.getElementById(textId);
  const spinner = document.getElementById(spinnerId);
  if (btn)     btn.disabled = loading;
  if (text)    text.classList.toggle("d-none",  loading);
  if (spinner) spinner.classList.toggle("d-none", !loading);
}

// ─────────────────────────────────────────────
// AUTH ERROR MAP
// ─────────────────────────────────────────────
function getAuthError(code) {
  const map = {
    "auth/user-not-found":         "No account found with this email.",
    "auth/wrong-password":         "Incorrect password. Please try again.",
    "auth/invalid-credential":     "Invalid email or password.",
    "auth/invalid-email":          "Please enter a valid email address.",
    "auth/email-already-in-use":   "An account with this email already exists.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/too-many-requests":      "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/user-disabled":          "This account has been disabled."
  };
  return map[code] || "Something went wrong. Please try again.";
}
