// ============================================================
// script.js
// Full application logic for Expence Tracker.
//
// Architecture follows this exact pipeline for every expense:
//
//   INPUT  ->  VALIDATION  ->  CREATE TRANSACTION  ->  SAVE
//          ->  VERIFY SAVE ->  RECALCULATE TOTALS   ->  INTEGRITY CHECK
//          ->  UPDATE DASHBOARD -> BACKUP
//
// Transactions (expense documents) are the ONLY permanent data.
// Every number shown on screen (today's total, today's count,
// section totals) is recalculated live from the transaction list,
// never stored as a separate "total" field. This guarantees the
// dashboard can never drift out of sync with the real data.
// ============================================================

import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============================================================
   GLOBAL STATE
   ============================================================ */
let currentUser = null;          // Firebase user object
let expensesCache = [];          // Local in-memory mirror of Firestore data (source of truth for rendering)
let unsubscribeExpenses = null;  // Firestore real-time listener detach function
let pendingDeleteAction = null;  // Function to run if the confirm modal is accepted

/* ============================================================
   DOM REFERENCES
   ============================================================ */
const $ = (id) => document.getElementById(id);

const authScreen = $("authScreen");
const appScreen = $("appScreen");

const tabLogin = $("tabLogin");
const tabSignup = $("tabSignup");
const loginForm = $("loginForm");
const signupForm = $("signupForm");
const authError = $("authError");
const goToSignup = $("goToSignup");
const goToLogin = $("goToLogin");

const menuBtn = $("menuBtn");
const sidebar = $("sidebar");
const sidebarOverlay = $("sidebarOverlay");
const sidebarClose = $("sidebarClose");
const sidebarName = $("sidebarName");
const sidebarEmail = $("sidebarEmail");
const sidebarAvatar = $("sidebarAvatar");
const logoutBtn = $("logoutBtn");
const sidebarTheme = $("sidebarTheme");
const sidebarExport = $("sidebarExport");

const themeBtn = $("themeBtn");

const todayAmount = $("todayAmount");
const todayCount = $("todayCount");
const todayDateLine1 = $("todayDateLine1");
const todayDateLine2 = $("todayDateLine2");

const addExpenseForm = $("addExpenseForm");
const expenseName = $("expenseName");
const expenseAmount = $("expenseAmount");
const expenseCurrency = $("expenseCurrency");
const expenseError = $("expenseError");
const addExpenseBtn = $("addExpenseBtn");

const historyList = $("historyList");
const emptyState = $("emptyState");
const clearAllBtn = $("clearAllBtn");

const confirmModal = $("confirmModal");
const confirmTitle = $("confirmTitle");
const confirmText = $("confirmText");
const confirmCancel = $("confirmCancel");
const confirmOk = $("confirmOk");

const toastContainer = $("toastContainer");

const navHome = $("navHome");
const navAdd = $("navAdd");
const navCalendar = $("navCalendar");
const navStats = $("navStats");
const navSettings = $("navSettings");

const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

/* ============================================================
   UTILITIES
   ============================================================ */

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function setButtonLoading(button, isLoading) {
  const label = button.querySelector(".btn-label");
  const spinner = button.querySelector(".btn-spinner");
  button.disabled = isLoading;
  if (spinner) spinner.classList.toggle("hidden", !isLoading);
  if (label) label.style.opacity = isLoading ? "0.55" : "1";
}

function formatCurrency(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || currency + " ";
  return `${symbol} ${Number(amount).toFixed(2)}`;
}

function friendlyAuthError(error) {
  const code = error && error.code ? error.code : "";
  const map = {
    "auth/email-already-in-use": "That email is already registered. Try logging in instead.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your internet connection."
  };
  return map[code] || error.message || "Something went wrong. Please try again.";
}

function isSameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ============================================================
   AUTH SCREEN — TAB SWITCHING
   ============================================================ */
function showLoginTab() {
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  authError.classList.add("hidden");
}
function showSignupTab() {
  tabSignup.classList.add("active");
  tabLogin.classList.remove("active");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  authError.classList.add("hidden");
}
tabLogin.addEventListener("click", showLoginTab);
tabSignup.addEventListener("click", showSignupTab);
goToSignup.addEventListener("click", (e) => { e.preventDefault(); showSignupTab(); });
goToLogin.addEventListener("click", (e) => { e.preventDefault(); showLoginTab(); });

function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove("hidden");
}

/* ============================================================
   SIGNUP — INPUT -> VALIDATION -> CREATE -> SAVE -> VERIFY
   ============================================================ */
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.classList.add("hidden");

  // 1. INPUT SYSTEM
  const fullName = $("signupName").value.trim();
  const email = $("signupEmail").value.trim();
  const password = $("signupPassword").value;
  const confirmPassword = $("signupConfirm").value;

  // 2. VALIDATION SYSTEM — stop immediately if invalid
  if (!fullName) return showAuthError("Please enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAuthError("Please enter a valid email address.");
  if (password.length < 6) return showAuthError("Password must be at least 6 characters.");
  if (password !== confirmPassword) return showAuthError("Passwords do not match.");

  const btn = $("signupBtn");
  setButtonLoading(btn, true); // LOADING PROTECTION SYSTEM begins

  try {
    // 3 & 4. CREATE + SAVE the user account in Firebase Auth
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: fullName });

    // 5. VERIFY — re-check that the profile name actually stuck
    if (auth.currentUser && !auth.currentUser.displayName) {
      await updateProfile(auth.currentUser, { displayName: fullName });
    }

    showToast("Account created successfully!", "success");
    signupForm.reset();
    // onAuthStateChanged will take over and load the dashboard
  } catch (error) {
    console.error("Signup error:", error);
    showAuthError(friendlyAuthError(error));
  } finally {
    // 6. LOADING PROTECTION SYSTEM — always resolves, never hangs
    setButtonLoading(btn, false);
  }
});

/* ============================================================
   LOGIN — INPUT -> VALIDATION -> AUTHENTICATE -> VERIFY
   ============================================================ */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.classList.add("hidden");

  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAuthError("Please enter a valid email address.");
  if (!password) return showAuthError("Please enter your password.");

  const btn = $("loginBtn");
  setButtonLoading(btn, true);

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (error) {
    console.error("Login error:", error);
    showAuthError(friendlyAuthError(error));
  } finally {
    setButtonLoading(btn, false);
  }
});

/* ============================================================
   LOGOUT
   ============================================================ */
logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    closeSidebar();
    showToast("Logged out successfully.", "success");
  } catch (error) {
    console.error("Logout error:", error);
    showToast("Could not log out. Try again.", "error");
  }
});

/* ============================================================
   SIDEBAR
   ============================================================ */
function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.remove("hidden");
}
function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.add("hidden");
}
menuBtn.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);
navSettings.addEventListener("click", openSidebar);

/* ============================================================
   DARK MODE
   ============================================================ */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("expenceTrackerTheme", theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "light" ? "dark" : "light");
}
(function initTheme() {
  const saved = localStorage.getItem("expenceTrackerTheme");
  if (saved) applyTheme(saved);
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) applyTheme("dark");
})();
themeBtn.addEventListener("click", toggleTheme);
sidebarTheme.addEventListener("click", toggleTheme);

/* ============================================================
   BOTTOM NAV
   ============================================================ */
navHome.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
navAdd.addEventListener("click", () => {
  expenseName.focus();
  document.querySelector(".add-card").scrollIntoView({ behavior: "smooth", block: "center" });
});
navCalendar.addEventListener("click", () => {
  document.querySelector(".history-card").scrollIntoView({ behavior: "smooth", block: "start" });
});
navStats.addEventListener("click", () => showToast("Stats view is coming soon.", "success"));

/* ============================================================
   AUTH STATE LISTENER — STARTUP VERIFICATION SYSTEM
   Runs automatically whenever the app loads or auth state changes.
   ============================================================ */
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");

    const name = user.displayName || "User";
    sidebarName.textContent = name;
    sidebarEmail.textContent = user.email || "";
    sidebarAvatar.textContent = name.charAt(0).toUpperCase();

    // Load -> Verify -> Recalculate -> Render (handled inside subscribeToExpenses)
    subscribeToExpenses(user.uid);
  } else {
    currentUser = null;
    if (unsubscribeExpenses) {
      unsubscribeExpenses();
      unsubscribeExpenses = null;
    }
    expensesCache = [];
    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
    showLoginTab();
  }
});

/* ============================================================
   ADD EXPENSE
   INPUT -> VALIDATION -> CREATE TRANSACTION -> SAVE -> VERIFY
   ============================================================ */
addExpenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  expenseError.classList.add("hidden");

  if (!currentUser) {
    showToast("Please log in again.", "error");
    return;
  }

  // 1. INPUT SYSTEM
  const name = expenseName.value.trim();
  const amountRaw = expenseAmount.value;
  const currency = expenseCurrency.value;

  // 2. VALIDATION SYSTEM — stop immediately if data is invalid
  if (!name) {
    expenseError.textContent = "Please enter an expense name.";
    expenseError.classList.remove("hidden");
    expenseName.focus();
    return;
  }
  const amount = parseFloat(amountRaw);
  if (amountRaw === "" || isNaN(amount) || amount <= 0) {
    expenseError.textContent = "Please enter a valid amount greater than 0.";
    expenseError.classList.remove("hidden");
    expenseAmount.focus();
    return;
  }
  if (amount > 100000000) {
    expenseError.textContent = "That amount looks too large. Please check it.";
    expenseError.classList.remove("hidden");
    return;
  }

  setButtonLoading(addExpenseBtn, true); // LOADING PROTECTION SYSTEM begins

  // Safety net: never allow the button to stay stuck loading forever,
  // even if a network call hangs unexpectedly.
  const safetyTimeout = setTimeout(() => {
    setButtonLoading(addExpenseBtn, false);
  }, 15000);

  try {
    // 3. TRANSACTION CREATION SYSTEM
    const newTransaction = {
      name,
      amount,
      currency,
      createdAt: serverTimestamp(),       // authoritative server time
      clientCreatedAt: new Date().toISOString() // fallback for instant local ordering
    };

    // 4. SAVE SYSTEM
    const docRef = await addDoc(
      collection(db, "users", currentUser.uid, "expenses"),
      newTransaction
    );

    // 5. SAVE VERIFICATION SYSTEM — confirm it actually exists in Firestore
    const savedSnap = await getDoc(docRef);
    if (!savedSnap.exists()) {
      throw new Error("Save verification failed: document not found after save.");
    }

    showToast(`Added "${name}" — ${formatCurrency(amount, currency)}`, "success");
    addExpenseForm.reset();
    expenseCurrency.value = currency;
    expenseName.focus();
    // Steps 7–9 (Recalculate / Integrity / Dashboard Update) happen automatically
    // through the real-time onSnapshot listener in subscribeToExpenses().
  } catch (error) {
    console.error("Add expense error:", error);
    // RECOVERY SYSTEM — keep the failed entry locally so nothing is lost,
    // and let the user know clearly what happened.
    queueFailedExpense({ name, amount, currency, failedAt: new Date().toISOString() });
    expenseError.textContent = "Could not save expense. It has been queued locally — " + (error.message || "please check your connection and try again.");
    expenseError.classList.remove("hidden");
    showToast("Failed to save expense.", "error");
  } finally {
    clearTimeout(safetyTimeout);
    setButtonLoading(addExpenseBtn, false); // LOADING PROTECTION SYSTEM — always resolves
  }
});

/* ============================================================
   RECOVERY SYSTEM — local queue for failed saves
   ============================================================ */
function queueFailedExpense(entry) {
  if (!currentUser) return;
  const key = `expenceTracker_failedQueue_${currentUser.uid}`;
  const queue = JSON.parse(localStorage.getItem(key) || "[]");
  queue.push(entry);
  localStorage.setItem(key, JSON.stringify(queue));
}

async function retryFailedQueue() {
  if (!currentUser) return;
  const key = `expenceTracker_failedQueue_${currentUser.uid}`;
  const queue = JSON.parse(localStorage.getItem(key) || "[]");
  if (queue.length === 0) return;

  const remaining = [];
  for (const entry of queue) {
    try {
      const docRef = await addDoc(collection(db, "users", currentUser.uid, "expenses"), {
        name: entry.name,
        amount: entry.amount,
        currency: entry.currency,
        createdAt: serverTimestamp(),
        clientCreatedAt: entry.failedAt
      });
      const snap = await getDoc(docRef);
      if (!snap.exists()) remaining.push(entry);
    } catch {
      remaining.push(entry);
    }
  }
  localStorage.setItem(key, JSON.stringify(remaining));
  if (queue.length !== remaining.length) {
    showToast(`Recovered ${queue.length - remaining.length} previously failed expense(s).`, "success");
  }
}

window.addEventListener("online", retryFailedQueue);

/* ============================================================
   SUBSCRIBE TO EXPENSES (REAL-TIME)
   Handles: Recalculation, Data Integrity, Dashboard Update,
   Backup, and Startup Verification — every time data changes.
   ============================================================ */
function subscribeToExpenses(uid) {
  if (unsubscribeExpenses) unsubscribeExpenses();

  const expensesQuery = query(
    collection(db, "users", uid, "expenses"),
    orderBy("createdAt", "desc")
  );

  unsubscribeExpenses = onSnapshot(
    expensesQuery,
    (snapshot) => {
      // 6. DATA INTEGRITY SYSTEM — dedupe, drop corrupted records
      const seenIds = new Set();
      const cleanList = [];

      snapshot.forEach((docSnap) => {
        if (seenIds.has(docSnap.id)) return; // no duplicates
        seenIds.add(docSnap.id);

        const data = docSnap.data();
        const amount = Number(data.amount);
        const name = typeof data.name === "string" ? data.name.trim() : "";

        // Skip corrupted records instead of crashing the whole dashboard
        if (!name || isNaN(amount) || amount <= 0) return;

        let date;
        if (data.createdAt && typeof data.createdAt.toDate === "function") {
          date = data.createdAt.toDate();
        } else if (data.clientCreatedAt) {
          date = new Date(data.clientCreatedAt);
        } else {
          date = new Date();
        }

        cleanList.push({
          id: docSnap.id,
          name,
          amount,
          currency: data.currency || "INR",
          date
        });
      });

      // Ensure newest-first even when server timestamps are still resolving
      cleanList.sort((a, b) => b.date - a.date);

      expensesCache = cleanList;

      // BACKUP SYSTEM — keep a local copy in case Firestore is unreachable later
      try {
        localStorage.setItem(
          `expenceTracker_backup_${uid}`,
          JSON.stringify(cleanList.map((e) => ({ ...e, date: e.date.toISOString() })))
        );
      } catch (err) {
        console.warn("Backup write skipped:", err);
      }

      retryFailedQueue();
      renderDashboard(); // 7, 8, 9: Recalculate -> Integrity check -> Render
    },
    (error) => {
      console.error("Realtime listener error:", error);
      // RECOVERY SYSTEM — fall back to the last known-good local backup
      try {
        const backupRaw = localStorage.getItem(`expenceTracker_backup_${uid}`);
        if (backupRaw) {
          expensesCache = JSON.parse(backupRaw).map((e) => ({ ...e, date: new Date(e.date) }));
          renderDashboard();
          showToast("You're offline — showing your last saved data.", "error");
        } else {
          showToast("Could not load your expenses. Check your connection.", "error");
        }
      } catch (e) {
        console.error("Backup restore failed:", e);
      }
    }
  );
}

/* ============================================================
   RECALCULATION + DASHBOARD UPDATE SYSTEM
   Everything visible is derived fresh from expensesCache —
   nothing is ever read from a pre-stored "total" field.
   ============================================================ */
function renderDashboard() {
  const now = new Date();

  // ---- 7. RECALCULATE: today's total & count ----
  const todays = expensesCache.filter((e) => isSameDay(e.date, now));
  const todayTotal = todays.reduce((sum, e) => sum + e.amount, 0);

  // 8. INTEGRITY CHECK — totals must always equal the sum of their transactions.
  // Because we never store totals separately, this is true by construction;
  // we still guard against NaN propagation just in case of bad data.
  const safeTodayTotal = isNaN(todayTotal) ? 0 : todayTotal;

  todayAmount.textContent = formatCurrency(safeTodayTotal, "INR");
  $("todayCountText").textContent = `${todays.length} Expense${todays.length === 1 ? "" : "s"} Today`;

  todayDateLine1.textContent = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  todayDateLine2.textContent = now.toLocaleDateString("en-US", { weekday: "long" });

  // ---- Group into Today / Yesterday / Older (REPORTING SYSTEM) ----
  const groups = new Map(); // key: "Today" | "Yesterday" | "DD Mon YYYY" -> { label, total, items: [] }
  const todayStart = startOfDay(now).getTime();
  const yesterdayStart = todayStart - 86400000;

  for (const exp of expensesCache) {
    const expStart = startOfDay(exp.date).getTime();
    let key, label;
    if (expStart === todayStart) {
      key = "today";
      label = `TODAY • ${exp.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
    } else if (expStart === yesterdayStart) {
      key = "yesterday";
      label = `YESTERDAY • ${exp.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
    } else {
      key = expStart.toString();
      label = exp.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }
    if (!groups.has(key)) groups.set(key, { label, total: 0, items: [] });
    const group = groups.get(key);
    group.total += exp.amount;
    group.items.push(exp);
  }

  // ---- 9. DASHBOARD UPDATE: render history list ----
  historyList.innerHTML = "";

  if (expensesCache.length === 0) {
    historyList.appendChild(emptyState);
    emptyState.classList.remove("hidden");
    return;
  }

  // Sort group keys so "today" and "yesterday" come first, then by recency
  const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
    const rank = (k) => (k === "today" ? 0 : k === "yesterday" ? 1 : 2);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return Number(b) - Number(a);
  });

  for (const key of orderedKeys) {
    const group = groups.get(key);
    const section = document.createElement("div");
    section.className = "day-group";

    const header = document.createElement("div");
    header.className = "day-header";
    header.innerHTML = `
      <span class="day-label">${group.label}</span>
      <span class="day-meta">
        <span class="day-total">Total: ${formatCurrency(group.total, "INR")}</span>
        <span class="day-pill">${group.items.length} Expense${group.items.length === 1 ? "" : "s"}</span>
      </span>
    `;
    section.appendChild(header);

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "day-items";

    group.items.forEach((exp, index) => {
      const row = document.createElement("div");
      row.className = "expense-row";
      row.innerHTML = `
        <span class="expense-index">${index + 1}</span>
        <span class="expense-info">
          <span class="expense-name">${escapeHtml(exp.name)}</span>
          <span class="expense-time">${exp.date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        </span>
        <span class="expense-amount">${formatCurrency(exp.amount, exp.currency)}</span>
        <button class="delete-btn" data-id="${exp.id}" data-name="${escapeHtml(exp.name)}" aria-label="Delete expense">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      `;
      itemsWrap.appendChild(row);
    });

    section.appendChild(itemsWrap);
    historyList.appendChild(section);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ============================================================
   DELETE — SINGLE EXPENSE (with confirmation + audit log)
   ============================================================ */
historyList.addEventListener("click", (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  const id = btn.dataset.id;
  const name = btn.dataset.name;
  openConfirm(
    "Delete this expense?",
    `"${name}" will be permanently removed. This cannot be undone.`,
    () => deleteSingleExpense(id, name)
  );
});

async function deleteSingleExpense(id, name) {
  if (!currentUser) return;
  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "expenses", id));
    auditLog(currentUser.uid, "delete", { id, name });
    showToast("Expense deleted.", "success");
  } catch (error) {
    console.error("Delete error:", error);
    showToast("Could not delete expense. Try again.", "error");
  }
}

/* ============================================================
   DELETE — CLEAR ALL (batched, with confirmation + audit log)
   ============================================================ */
clearAllBtn.addEventListener("click", () => {
  if (expensesCache.length === 0) {
    showToast("There's nothing to clear.", "success");
    return;
  }
  openConfirm(
    "Clear all expenses?",
    `All ${expensesCache.length} expense record(s) will be permanently deleted. This cannot be undone.`,
    clearAllExpenses
  );
});

async function clearAllExpenses() {
  if (!currentUser) return;
  try {
    const batch = writeBatch(db);
    expensesCache.forEach((exp) => {
      batch.delete(doc(db, "users", currentUser.uid, "expenses", exp.id));
    });
    await batch.commit();
    auditLog(currentUser.uid, "clear_all", { count: expensesCache.length });
    showToast("All expenses cleared.", "success");
  } catch (error) {
    console.error("Clear all error:", error);
    showToast("Could not clear expenses. Try again.", "error");
  }
}

/* ============================================================
   HISTORY / AUDIT SYSTEM
   ============================================================ */
function auditLog(uid, action, details) {
  try {
    const key = `expenceTracker_audit_${uid}`;
    const log = JSON.parse(localStorage.getItem(key) || "[]");
    log.push({ action, details, at: new Date().toISOString() });
    // Keep the audit log from growing forever
    localStorage.setItem(key, JSON.stringify(log.slice(-200)));
  } catch (err) {
    console.warn("Audit log write skipped:", err);
  }
}

/* ============================================================
   CONFIRM MODAL (shared by single-delete and clear-all)
   ============================================================ */
function openConfirm(title, text, onConfirm) {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  pendingDeleteAction = onConfirm;
  confirmModal.classList.remove("hidden");
}
function closeConfirm() {
  confirmModal.classList.add("hidden");
  pendingDeleteAction = null;
}
confirmCancel.addEventListener("click", closeConfirm);
confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirm();
});
confirmOk.addEventListener("click", async () => {
  if (pendingDeleteAction) {
    const action = pendingDeleteAction;
    closeConfirm();
    await action();
  }
});

/* ============================================================
   BACKUP / EXPORT (manual, user-triggered)
   ============================================================ */
sidebarExport.addEventListener("click", () => {
  if (expensesCache.length === 0) {
    showToast("No expenses to export yet.", "error");
    return;
  }
  const exportData = expensesCache.map((e) => ({
    name: e.name,
    amount: e.amount,
    currency: e.currency,
    date: e.date.toISOString()
  }));
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `expence-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Backup downloaded.", "success");
  closeSidebar();
});
