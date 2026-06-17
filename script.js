// script.js — Expence Tracker — Complete & Working

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

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let USER      = null;   // Firebase auth user
let EXPENSES  = [];     // [{id, uid, name, amount, currency, date, time, timestamp}, ...]
let CAL_YEAR  = new Date().getFullYear();
let CAL_MONTH = new Date().getMonth();
let DARK      = localStorage.getItem("dark") === "1";
let PAGE      = "home";
let MODAL_CB  = null;   // callback for confirm modal

/* ═══════════════════════════════════════════
   BOOT
═══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // Apply saved dark mode
  setDark(DARK, false);

  // Set today's date on summary card
  setDateDisplay();

  // Listen for auth state
  onAuthStateChanged(auth, user => {
    const splash = document.getElementById("splash");
    if (user) {
      USER = user;
      splash.classList.add("gone");
      show("appScreen");
      bootApp();
    } else {
      USER = null;
      EXPENSES = [];
      setTimeout(() => {
        splash.classList.add("gone");
        show("authScreen");
      }, 1100);
    }
  });
});

async function bootApp() {
  // Fill user info
  const name  = USER.displayName || USER.email.split("@")[0];
  const email = USER.email;
  $("sbName").textContent  = name;
  $("sbEmail").textContent = email;
  $("setName").textContent  = name;
  $("setEmail").textContent = email;

  // Default currency
  const cur = localStorage.getItem("defCur") || "₹";
  $("addCur").value = cur;
  $("setCur").value = cur;
  syncBadge();

  // Dark toggle
  $("darkChk").checked = DARK;

  // Load data then go home
  await loadExpenses();
  goPage("home");
}

/* ═══════════════════════════════════════════
   SCREEN HELPERS
═══════════════════════════════════════════ */
function show(id) {
  ["authScreen", "appScreen"].forEach(s => $(s).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

/* ═══════════════════════════════════════════
   AUTH — TAB SWITCH
═══════════════════════════════════════════ */
window.switchTab = function(tab) {
  $("loginBox").classList.toggle("hidden",  tab !== "login");
  $("signupBox").classList.toggle("hidden", tab !== "signup");
  $("tabLogin").classList.toggle("active",  tab === "login");
  $("tabSignup").classList.toggle("active", tab === "signup");
  $("liErr").textContent = "";
  $("suErr").textContent = "";
};

/* ═══════════════════════════════════════════
   AUTH — LOGIN
═══════════════════════════════════════════ */
window.doLogin = async function() {
  const email = $("liEmail").value.trim();
  const pass  = $("liPass").value;
  $("liErr").textContent = "";

  if (!email || !pass) { $("liErr").textContent = "Please fill in all fields."; return; }

  btnLoad("liBtn", "liTxt", "liSpin", true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    $("liErr").textContent = authErr(e.code);
    btnLoad("liBtn", "liTxt", "liSpin", false);
  }
};

/* ═══════════════════════════════════════════
   AUTH — SIGNUP
═══════════════════════════════════════════ */
window.doSignup = async function() {
  const name  = $("suName").value.trim();
  const email = $("suEmail").value.trim();
  const pass  = $("suPass").value;
  const conf  = $("suConf").value;
  $("suErr").textContent = "";

  if (!name || !email || !pass || !conf) { $("suErr").textContent = "Please fill in all fields."; return; }
  if (pass.length < 6)  { $("suErr").textContent = "Password must be at least 6 characters."; return; }
  if (pass !== conf)    { $("suErr").textContent = "Passwords do not match."; return; }

  btnLoad("suBtn", "suTxt", "suSpin", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    $("suErr").textContent = authErr(e.code);
    btnLoad("suBtn", "suTxt", "suSpin", false);
  }
};

/* ═══════════════════════════════════════════
   AUTH — LOGOUT
═══════════════════════════════════════════ */
window.doLogout = async function() {
  try {
    await signOut(auth);
    EXPENSES = [];
    closeSB();
    toast("Logged out successfully");
  } catch (e) {
    toast("Logout failed. Try again.");
  }
};

/* ═══════════════════════════════════════════
   FIRESTORE — LOAD
   Uses client-side sort to avoid needing a
   composite index (works immediately on deploy)
═══════════════════════════════════════════ */
async function loadExpenses() {
  if (!USER) return;
  try {
    const q    = query(collection(db, "expenses"), where("uid", "==", USER.uid));
    const snap = await getDocs(q);
    EXPENSES   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort newest first by timestamp seconds
    EXPENSES.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
  } catch (e) {
    console.error("loadExpenses:", e);
    toast("Could not load expenses. Check connection.");
  }
  redrawAll();
}

/* ═══════════════════════════════════════════
   EXPENSE — ADD
═══════════════════════════════════════════ */
window.doAdd = async function() {
  const name     = $("addName").value.trim();
  const amtRaw   = $("addAmt").value.trim();
  const currency = $("addCur").value || "₹";
  const amount   = parseFloat(amtRaw);
  $("addErr").textContent = "";

  // Validate
  if (!name) {
    $("addErr").textContent = "Please enter an expense name.";
    return;
  }
  if (amtRaw === "" || isNaN(amount) || amount < 0) {
    $("addErr").textContent = "Please enter a valid amount.";
    return;
  }

  btnLoad("addBtn", "addTxt", "addSpin", true);

  try {
    const now = new Date();
    const data = {
      uid:       USER.uid,
      name:      name,
      amount:    amount,
      currency:  currency,
      date:      fmtDate(now),
      time:      fmtTime(now),
      timestamp: Timestamp.fromDate(now)
    };

    const ref = await addDoc(collection(db, "expenses"), data);

    // Add to local array at start (newest first)
    EXPENSES.unshift({ id: ref.id, ...data });

    // Clear form
    $("addName").value = "";
    $("addAmt").value  = "";

    redrawAll();
    toast("✓ Expense added");
  } catch (e) {
    console.error("doAdd:", e);
    $("addErr").textContent = "Save failed. Check your connection.";
  }

  btnLoad("addBtn", "addTxt", "addSpin", false);
};

/* ═══════════════════════════════════════════
   EXPENSE — DELETE SINGLE
   Called via data-id attribute on button —
   NO user data passed through onclick strings
═══════════════════════════════════════════ */
function deleteExpense(id) {
  const exp = EXPENSES.find(e => e.id === id);
  if (!exp) return;

  openModal(
    "Delete Expense",
    `Delete "${exp.name}"? This cannot be undone.`,
    async () => {
      try {
        await deleteDoc(doc(db, "expenses", id));
        EXPENSES = EXPENSES.filter(e => e.id !== id);
        redrawAll();
        toast("Expense deleted");
      } catch (e) {
        console.error("deleteExpense:", e);
        toast("Delete failed. Check your connection.");
      }
    }
  );
}

/* ═══════════════════════════════════════════
   EXPENSE — CLEAR ALL
   Batches in chunks of 500 (Firestore limit)
═══════════════════════════════════════════ */
window.doClearAll = function() {
  if (!EXPENSES.length) { toast("No expenses to clear."); return; }

  openModal(
    "Clear All Expenses",
    `Delete all ${EXPENSES.length} expense${EXPENSES.length !== 1 ? "s" : ""}? This cannot be undone.`,
    async () => {
      try {
        const ids = [...EXPENSES.map(e => e.id)];
        // Commit in chunks of 500 (Firestore batch limit)
        for (let i = 0; i < ids.length; i += 500) {
          const batch = writeBatch(db);
          ids.slice(i, i + 500).forEach(id => batch.delete(doc(db, "expenses", id)));
          await batch.commit();
        }
        EXPENSES = [];
        redrawAll();
        toast("All expenses cleared");
      } catch (e) {
        console.error("doClearAll:", e);
        toast("Clear failed. Check your connection.");
      }
    }
  );
};

/* ═══════════════════════════════════════════
   REDRAW — ALL
═══════════════════════════════════════════ */
function redrawAll() {
  drawSummary();
  drawHistory();
  if (PAGE === "stats")    drawStats();
  if (PAGE === "calendar") drawCalendar();
}

/* ═══════════════════════════════════════════
   DRAW — SUMMARY CARD
═══════════════════════════════════════════ */
function drawSummary() {
  const today  = fmtDate(new Date());
  const todExp = EXPENSES.filter(e => e.date === today);
  const total  = todExp.reduce((s, e) => s + (e.amount || 0), 0);
  const cur    = todExp.length ? todExp[0].currency : ($("addCur").value || "₹");
  $("scAmount").textContent = cur + " " + total.toFixed(2);
  $("scCount").textContent  = todExp.length;
}

/* ═══════════════════════════════════════════
   DRAW — HISTORY
   Delete buttons use data-id + addEventListener.
   No user data ever goes inside onclick="..."
═══════════════════════════════════════════ */
window.renderHistory = drawHistory;

function drawHistory() {
  const container = $("histList");
  if (!container) return;

  const q = ($("searchInp")?.value || "").toLowerCase().trim();
  const list = q
    ? EXPENSES.filter(e => e.name.toLowerCase().includes(q) || String(e.amount).includes(q))
    : EXPENSES;

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-box">
        <i class="fas fa-receipt"></i>
        <p>${q ? "No expenses match your search." : "No expenses yet.<br/>Add your first expense above!"}</p>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  list.forEach(e => {
    const d = e.date || "Unknown";
    if (!groups[d]) groups[d] = [];
    groups[d].push(e);
  });

  const TODAY     = fmtDate(new Date());
  const YESTERDAY = fmtDate(new Date(Date.now() - 86400000));
  const dates     = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  let html = "";
  dates.forEach(date => {
    const items  = groups[date];
    const total  = items.reduce((s, e) => s + (e.amount || 0), 0);
    const cur    = items[0]?.currency || "₹";
    const gid    = "g" + date.replace(/-/g, "");
    let label = date, sub = date;
    if (date === TODAY)     { label = "TODAY";     sub = "• " + date; }
    else if (date === YESTERDAY) { label = "YESTERDAY"; sub = "• " + date; }

    html += `
    <div class="day-group">
      <div class="dg-hdr" onclick="toggleGroup('${gid}')">
        <div><div class="dg-name">${label}</div><div class="dg-sub">${sub}</div></div>
        <div class="dg-right">
          <span class="dg-total">Total: ${cur} ${total.toFixed(2)}</span>
          <span class="dg-badge">${items.length} Expense${items.length !== 1 ? "s" : ""}</span>
          <i class="fas fa-chevron-up dg-arrow" id="arr_${gid}"></i>
        </div>
      </div>
      <div class="dg-items" id="body_${gid}">
        ${items.map((e, i) => `
          <div class="exp-item">
            <span class="item-dot"></span>
            <div class="item-num">${i + 1}</div>
            <div class="item-info">
              <div class="item-name">${safe(e.name)}</div>
              <div class="item-time">${e.time || ""}</div>
            </div>
            <span class="item-amt">${e.currency || cur} ${(e.amount || 0).toFixed(2)}</span>
            <button class="item-del" data-eid="${e.id}" title="Delete"><i class="fas fa-trash"></i></button>
          </div>`).join("")}
      </div>
    </div>`;
  });

  container.innerHTML = html;

  // Attach delete listeners using data-eid — safe for all characters in expense names
  container.querySelectorAll(".item-del").forEach(btn => {
    btn.addEventListener("click", function() {
      deleteExpense(this.getAttribute("data-eid"));
    });
  });
}

/* collapse / expand group */
window.toggleGroup = function(gid) {
  const body = $("body_" + gid);
  const arr  = $("arr_"  + gid);
  if (!body) return;
  const open = !body.classList.contains("hidden");
  body.classList.toggle("hidden", open);
  arr.classList.toggle("down", open);
};

/* ═══════════════════════════════════════════
   DRAW — STATS
═══════════════════════════════════════════ */
function drawStats() {
  const today   = fmtDate(new Date());
  const moKey   = today.slice(0, 7);
  const cur     = EXPENSES[0]?.currency || $("addCur").value || "₹";
  const todExp  = EXPENSES.filter(e => e.date === today);
  const moExp   = EXPENSES.filter(e => (e.date || "").startsWith(moKey));
  const todTot  = todExp.reduce((s, e) => s + (e.amount || 0), 0);
  const moTot   = moExp.reduce((s, e) => s + (e.amount || 0), 0);
  const allTot  = EXPENSES.reduce((s, e) => s + (e.amount || 0), 0);
  const days    = new Set(EXPENSES.map(e => e.date)).size || 1;

  $("statsGrid").innerHTML = [
    ["TODAY",       cur + " " + todTot.toFixed(0), todExp.length + " expense" + (todExp.length !== 1 ? "s" : "")],
    ["THIS MONTH",  cur + " " + moTot.toFixed(0),  moExp.length  + " expense" + (moExp.length  !== 1 ? "s" : "")],
    ["ALL TIME",    cur + " " + allTot.toFixed(0), EXPENSES.length + " total"],
    ["DAILY AVG",   cur + " " + (allTot / days).toFixed(0), "per active day"]
  ].map(([l, v, s]) =>
    `<div class="stat-card"><div class="stat-lbl">${l}</div><div class="stat-val">${v}</div><div class="stat-sub">${s}</div></div>`
  ).join("");

  // 7-day bar chart
  const bars = [];
  for (let i = 6; i >= 0; i--) {
    const d   = new Date(Date.now() - i * 86400000);
    const ds  = fmtDate(d);
    const sum = EXPENSES.filter(e => e.date === ds).reduce((s, e) => s + (e.amount || 0), 0);
    bars.push({ day: d.toLocaleDateString("en", { weekday: "short" }).slice(0, 2), sum, today: ds === today });
  }
  const mx = Math.max(...bars.map(b => b.sum), 1);
  $("barChart").innerHTML = bars.map(b => `
    <div class="bc">
      <div class="bc-amt">${b.sum > 0 ? b.sum.toFixed(0) : ""}</div>
      <div class="bc-fill${b.today ? " today" : ""}" style="height:${Math.max((b.sum / mx) * 88, b.sum > 0 ? 4 : 0)}px"></div>
      <div class="bc-day">${b.day}</div>
    </div>`).join("");

  // Top 5
  const top = [...EXPENSES].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 5);
  $("topList").innerHTML = top.length
    ? top.map((e, i) => `
        <div class="top-item">
          <div class="top-rank">${i + 1}</div>
          <div class="top-name">${safe(e.name)}</div>
          <div class="top-amt">${e.currency || cur} ${(e.amount || 0).toFixed(2)}</div>
        </div>`).join("")
    : `<p style="font-size:13px;color:var(--text3);padding:10px 0">No expenses yet.</p>`;
}

/* ═══════════════════════════════════════════
   DRAW — CALENDAR
═══════════════════════════════════════════ */
function drawCalendar() {
  $("calLabel").textContent = new Date(CAL_YEAR, CAL_MONTH, 1)
    .toLocaleDateString("en", { month: "long", year: "numeric" });

  const first   = new Date(CAL_YEAR, CAL_MONTH, 1).getDay();
  const days    = new Date(CAL_YEAR, CAL_MONTH + 1, 0).getDate();
  const today   = fmtDate(new Date());
  const hasDates = new Set(EXPENSES.map(e => e.date));
  const wk      = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  let html = `<div class="cal-wk">${wk.map(d => `<div class="cal-wk-cell">${d}</div>`).join("")}</div><div class="cal-days">`;
  for (let i = 0; i < first; i++) html += `<div class="cal-day blank"></div>`;
  for (let d = 1; d <= days; d++) {
    const ds  = `${CAL_YEAR}-${pad(CAL_MONTH + 1)}-${pad(d)}`;
    let   cls = "cal-day";
    if (ds === today)        cls += " today";
    if (hasDates.has(ds))   cls += " has-exp";
    html += `<div class="${cls}" onclick="calDay('${ds}')">${d}</div>`;
  }
  html += "</div>";
  $("calGrid").innerHTML = html;
}

window.calDay = function(ds) {
  const det  = $("calDetail");
  const exps = EXPENSES.filter(e => e.date === ds);
  if (!exps.length) {
    det.innerHTML = `<div class="cal-det-title">${ds} — No expenses</div>`;
  } else {
    const tot = exps.reduce((s, e) => s + (e.amount || 0), 0);
    const cur = exps[0].currency || "₹";
    det.innerHTML = `<div class="cal-det-title">${ds} — Total: ${cur} ${tot.toFixed(2)}</div>` +
      exps.map(e => `
        <div class="cal-det-row">
          <span>${safe(e.name)}</span>
          <span class="cal-det-amt">${e.currency || cur} ${(e.amount || 0).toFixed(2)}</span>
        </div>`).join("");
  }
  det.classList.remove("hidden");
};

window.calMove = function(d) {
  CAL_MONTH += d;
  if (CAL_MONTH > 11) { CAL_MONTH = 0; CAL_YEAR++; }
  if (CAL_MONTH < 0)  { CAL_MONTH = 11; CAL_YEAR--; }
  $("calDetail").classList.add("hidden");
  drawCalendar();
};

/* ═══════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════ */
window.goPage = function(page) {
  PAGE = page;
  ["home","stats","calendar","settings"].forEach(p => {
    $("pg" + cap(p))?.classList.toggle("active-page", p === page);
    $("nav" + cap(p))?.classList.toggle("active", p === page);
  });
  if (page === "stats")    drawStats();
  if (page === "calendar") drawCalendar();
};

window.fabAction = function() {
  goPage("home");
  setTimeout(() => { $("addName")?.focus(); }, 80);
};

/* ═══════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════ */
window.openSB = function() {
  $("sidebar").classList.replace("closed", "open");
  $("sbOverlay").classList.remove("hidden");
};
window.closeSB = function() {
  $("sidebar").classList.replace("open", "closed");
  $("sbOverlay").classList.add("hidden");
};

/* ═══════════════════════════════════════════
   DARK MODE
═══════════════════════════════════════════ */
window.toggleTheme = function() {
  DARK = !DARK;
  localStorage.setItem("dark", DARK ? "1" : "0");
  setDark(DARK, true);
};
window.handleDarkChk = function() {
  DARK = $("darkChk").checked;
  localStorage.setItem("dark", DARK ? "1" : "0");
  setDark(DARK, false);
};
function setDark(on, sync) {
  document.body.classList.toggle("dark", on);
  const ico = $("themeIco");
  if (ico) ico.className = on ? "fas fa-sun" : "fas fa-moon";
  if (sync) { const c = $("darkChk"); if (c) c.checked = on; }
}

/* ═══════════════════════════════════════════
   CURRENCY
═══════════════════════════════════════════ */
window.syncBadge = function() {
  const b = $("curBadge");
  if (b) b.textContent = $("addCur").value || "₹";
};
window.saveCur = function() {
  const c = $("setCur").value || "₹";
  localStorage.setItem("defCur", c);
  $("addCur").value = c;
  syncBadge();
  toast("Default currency saved");
};

/* ═══════════════════════════════════════════
   CONFIRM MODAL
═══════════════════════════════════════════ */
function openModal(title, msg, cb) {
  $("modalTitle").textContent = title;
  $("modalMsg").textContent   = msg;
  MODAL_CB = cb;
  $("modal").classList.remove("hidden");
  $("modalOk").onclick = () => { closeModal(); if (MODAL_CB) MODAL_CB(); };
}
window.closeModal = function() {
  $("modal").classList.add("hidden");
  MODAL_CB = null;
};

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
let _tt = null;
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(_tt);
  _tt = setTimeout(() => t.classList.add("hidden"), 3000);
}

/* ═══════════════════════════════════════════
   PASSWORD TOGGLE
═══════════════════════════════════════════ */
window.toggleEye = function(id, btn) {
  const inp = $(id);
  if (!inp) return;
  const txt = inp.type === "text";
  inp.type  = txt ? "password" : "text";
  btn.querySelector("i").className = txt ? "fas fa-eye-slash" : "fas fa-eye";
};

/* ═══════════════════════════════════════════
   DATE / TIME HELPERS
═══════════════════════════════════════════ */
function setDateDisplay() {
  const d = new Date();
  const dateEl = $("scDate"), dayEl = $("scDay");
  if (dateEl) dateEl.textContent = d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
  if (dayEl)  dayEl.textContent  = d.toLocaleDateString("en-IN", { weekday:"long" });
}
function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function fmtTime(d) {
  let h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${pad(h)}:${pad(m)} ${ap}`;
}
function pad(n) { return String(n).padStart(2, "0"); }

/* ═══════════════════════════════════════════
   DOM / STRING HELPERS
═══════════════════════════════════════════ */
function $(id) { return document.getElementById(id); }

// Safely encode text for innerHTML — uses browser's own encoder
function safe(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function btnLoad(btnId, txtId, spinId, on) {
  const b = $(btnId), t = $(txtId), s = $(spinId);
  if (b) b.disabled = on;
  if (t) t.classList.toggle("hidden",  on);
  if (s) s.classList.toggle("hidden", !on);
}

/* ═══════════════════════════════════════════
   AUTH ERROR MAP
═══════════════════════════════════════════ */
function authErr(code) {
  return {
    "auth/user-not-found":         "No account found with this email.",
    "auth/wrong-password":         "Incorrect password.",
    "auth/invalid-credential":     "Invalid email or password.",
    "auth/invalid-email":          "Please enter a valid email address.",
    "auth/email-already-in-use":   "This email is already registered.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/too-many-requests":      "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/user-disabled":          "This account has been disabled."
  }[code] || "Something went wrong. Please try again.";
}
