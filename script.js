// script.js — Expence Tracker
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc,
  query, where, orderBy, getDocs, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ────────────────────────────────────────
// HELPERS - Define FIRST before any use
// ────────────────────────────────────────
function qs(sel) { 
  return document.querySelector(sel); 
}

function fmtDate(d) { 
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; 
}

function fmtTime(d) {
  let h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? "PM" : "AM"; 
  h = h % 12 || 12;
  return `${pad(h)}:${pad(m)} ${ap}`;
}

function pad(n) { 
  return String(n).padStart(2, "0"); 
}

function cap(s) { 
  return s.charAt(0).toUpperCase() + s.slice(1); 
}

function esc(s) { 
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
}

let _toastT;
function toast(msg) {
  const t = qs("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hide");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.add("hide"), 2800);
}

// ────────────────────────────────────────
// STATE
// ────────────────────────────────────────
let user = null;
let expenses = [];
let calY, calM;
let addingExpense = false;
let deletingExpense = false;
let dark = localStorage.getItem("et_dark") === "1";

const now = new Date();
calY = now.getFullYear();
calM = now.getMonth();

// ────────────────────────────────────────
// BOOT
// ────────────────────────────────────────
applyTheme();
setSummaryDate();

onAuthStateChanged(auth, u => {
  if (u) { 
    user = u; 
    bootApp(); 
  } else { 
    user = null; 
    showAuth(); 
  }
});

function bootApp() {
  try {
    const name = user.displayName || user.email.split("@")[0];
    const sbName = qs("#sbName");
    const sbEmail = qs("#sbEmail");
    const suName = qs("#suName");
    const suEmail = qs("#suEmail");
    
    if (sbName) sbName.textContent = name;
    if (sbEmail) sbEmail.textContent = user.email;
    if (suName) suName.textContent = name;
    if (suEmail) suEmail.textContent = user.email;

    const dc = localStorage.getItem("et_cur") || "₹";
    const curSel = qs("#curSel");
    const curBadge = qs("#curBadge");
    const defCurSel = qs("#defCurSel");
    
    if (curSel) curSel.value = dc;
    if (curBadge) curBadge.textContent = dc;
    if (defCurSel) defCurSel.value = dc;

    showApp();
    goView("home");
    loadExpenses();
  } catch (e) {
    console.error("bootApp error:", e);
    toast("Error loading app");
  }
}

function showAuth() {
  const authScreen = qs("#authScreen");
  const appScreen = qs("#appScreen");
  if (authScreen) authScreen.classList.remove("hide");
  if (appScreen) appScreen.classList.add("hide");
}

function showApp() {
  const authScreen = qs("#authScreen");
  const appScreen = qs("#appScreen");
  if (authScreen) authScreen.classList.add("hide");
  if (appScreen) appScreen.classList.remove("hide");
}

// ────────────────────────────────────────
// AUTH
// ────────────────────────────────────────
window.switchTab = function(tab) {
  const loginForm = qs("#loginForm");
  const signupForm = qs("#signupForm");
  const tabLogin = qs("#tabLogin");
  const tabSignup = qs("#tabSignup");
  
  if (loginForm) loginForm.classList.toggle("hide", tab !== "login");
  if (signupForm) signupForm.classList.toggle("hide", tab !== "signup");
  if (tabLogin) tabLogin.classList.toggle("active", tab === "login");
  if (tabSignup) tabSignup.classList.toggle("active", tab !== "login");
  
  const lErr = qs("#lErr");
  const sErr = qs("#sErr");
  if (lErr) lErr.textContent = "";
  if (sErr) sErr.textContent = "";
};

window.doLogin = async function() {
  const lEmail = qs("#lEmail");
  const lPass = qs("#lPass");
  const lErr = qs("#lErr");
  
  const email = lEmail?.value.trim() || "";
  const pass = lPass?.value || "";
  
  if (lErr) lErr.textContent = "";
  
  if (!email || !pass) { 
    if (lErr) lErr.textContent = "Please fill in all fields."; 
    return; 
  }
  
  setAuthLoading("l", true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) { 
    if (lErr) lErr.textContent = authMsg(e.code); 
  }
  setAuthLoading("l", false);
};

window.doSignup = async function() {
  const sName = qs("#sName");
  const sEmail = qs("#sEmail");
  const sPass = qs("#sPass");
  const sConf = qs("#sConf");
  const sErr = qs("#sErr");
  
  const name = sName?.value.trim() || "";
  const email = sEmail?.value.trim() || "";
  const pass = sPass?.value || "";
  const conf = sConf?.value || "";
  
  if (sErr) sErr.textContent = "";
  
  if (!name || !email || !pass || !conf) { 
    if (sErr) sErr.textContent = "Please fill in all fields."; 
    return; 
  }
  
  if (pass.length < 6) { 
    if (sErr) sErr.textContent = "Password must be at least 6 characters."; 
    return; 
  }
  
  if (pass !== conf) { 
    if (sErr) sErr.textContent = "Passwords do not match."; 
    return; 
  }
  
  setAuthLoading("s", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) { 
    if (sErr) sErr.textContent = authMsg(e.code); 
  }
  setAuthLoading("s", false);
};

window.doLogout = async function() {
  await signOut(auth);
  expenses = [];
  toast("Logged out successfully");
};

window.eyeToggle = function(id, btn) {
  const inp = qs("#" + id);
  if (!inp) return;
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  btn.innerHTML = `<i class="fas fa-eye${show ? "" : "-slash"}"></i>`;
};

function setAuthLoading(prefix, on) {
  const btnTxt = qs("#" + prefix + "BtnTxt");
  const spin = qs("#" + prefix + "Spin");
  const btn = qs("#" + prefix + "Btn");
  
  if (btnTxt) btnTxt.classList.toggle("hide", on);
  if (spin) spin.classList.toggle("hide", !on);
  if (btn) btn.disabled = on;
}

function authMsg(code) {
  const m = {
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Try again later."
  };
  return m[code] || "Something went wrong. Please try again.";
}

// ────────────────────────────────────────
// EXPENSES — FIRESTORE
// ────────────────────────────────────────
async function loadExpenses() {
  if (!user) return;
  try {
    const q = query(
      collection(db, "expenses"),
      where("uid", "==", user.uid),
      orderBy("ts", "desc")
    );
    const snap = await getDocs(q);
    expenses = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        uid: data.uid || "",
        name: data.name || "",
        amount: parseFloat(data.amount) || 0,
        currency: data.currency || "₹",
        date: data.date || "",
        time: data.time || "",
        ts: data.ts || Timestamp.now()
      };
    });
    refresh();
  } catch (e) {
    console.error("loadExpenses error:", e);
    toast("Failed to load expenses");
  }
}

window.doAddExpense = async function(event) {
  if (event?.preventDefault) event.preventDefault();
  if (addingExpense) return;
  if (!user) {
    toast("Please sign in first");
    return;
  }

  const expName = qs("#expName");
  const expAmt = qs("#expAmt");
  const curSel = qs("#curSel");
  const addErr = qs("#addErr");
  
  const name = expName?.value.trim() || "";
  const amtStr = expAmt?.value || "";
  const amount = parseFloat(amtStr);
  const cur = curSel?.value || "₹";

  if (addErr) addErr.textContent = "";

  if (!name) {
    if (addErr) addErr.textContent = "Enter an expense name.";
    return;
  }
  
  if (!amtStr || isNaN(amount) || amount <= 0) {
    if (addErr) addErr.textContent = "Enter a valid amount greater than 0.";
    return;
  }

  addingExpense = true;
  const addBtnTxt = qs("#addBtnTxt");
  const addSpin = qs("#addSpin");
  const addBtn = qs("#addBtn");
  
  if (addBtnTxt) addBtnTxt.classList.add("hide");
  if (addSpin) addSpin.classList.remove("hide");
  if (addBtn) addBtn.disabled = true;

  try {
    const ts = Timestamp.now();
    const d = ts.toDate();
    const exp = {
      uid: user.uid,
      name,
      amount,
      currency: cur,
      date: fmtDate(d),
      time: fmtTime(d),
      ts
    };
    
    const ref = await addDoc(collection(db, "expenses"), exp);
    expenses.unshift({ id: ref.id, ...exp });
    
    if (expName) expName.value = "";
    if (expAmt) expAmt.value = "";
    
    refresh();
    toast("Expense added ✓");
  } catch (e) {
    console.error("doAddExpense error:", e);
    if (addErr) addErr.textContent = "Failed to add. Please try again.";
  } finally {
    addingExpense = false;
    if (addBtnTxt) addBtnTxt.classList.remove("hide");
    if (addSpin) addSpin.classList.add("hide");
    if (addBtn) addBtn.disabled = false;
  }
};

window.doDeleteExpense = async function(expenseId) {
  if (deletingExpense) return;
  
  if (!confirm("Delete this expense?")) return;
  
  deletingExpense = true;
  try {
    await deleteDoc(doc(db, "expenses", expenseId));
    expenses = expenses.filter(e => e.id !== expenseId);
    refresh();
    toast("Expense deleted ✓");
  } catch (e) { 
    console.error("doDeleteExpense error:", e);
    toast("Failed to delete expense"); 
  } finally {
    deletingExpense = false;
  }
};

window.doClearAll = async function() {
  if (!expenses.length) { 
    toast("No expenses to clear"); 
    return; 
  }
  
  if (!confirm("Clear ALL expenses? This cannot be undone.")) return;
  
  try {
    const batch = writeBatch(db);
    expenses.forEach(e => batch.delete(doc(db, "expenses", e.id)));
    await batch.commit();
    expenses = [];
    refresh();
    toast("All expenses cleared ✓");
  } catch (e) { 
    console.error("doClearAll error:", e);
    toast("Failed to clear expenses"); 
  }
};

// ────────────────────────────────────────
// REFRESH — call after any data change
// ────────────────────────────────────────
function refresh() {
  renderSummary();
  renderHistory();
  renderStats();
  renderCalendar();
}

// ────────────────────────────────────────
// SUMMARY
// ────────────────────────────────────────
function renderSummary() {
  const td = fmtDate(new Date());
  const tde = expenses.filter(e => e.date === td);
  const tot = tde.reduce((s, e) => s + (e.amount || 0), 0);
  const cur = tde[0]?.currency || qs("#curSel")?.value || "₹";
  
  const todayTotal = qs("#todayTotal");
  const todayCount = qs("#todayCount");
  
  if (todayTotal) todayTotal.textContent = `${cur} ${tot.toFixed(2)}`;
  if (todayCount) todayCount.textContent = tde.length;
}

function setSummaryDate() {
  const d = new Date();
  const scDate = qs("#scDate");
  const scDay = qs("#scDay");
  
  if (scDate) scDate.textContent = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (scDay) scDay.textContent = d.toLocaleDateString("en-IN", { weekday: "long" });
}

// ────────────────────────────────────────
// HISTORY
// ────────────────────────────────────────
window.renderHistory = function() {
  const searchInp = qs("#searchInp");
  const historyList = qs("#historyList");
  
  if (!historyList) return;

  const search = (searchInp?.value || "").toLowerCase().trim();

  let filtered = expenses.filter(e =>
    !search ||
    e.name.toLowerCase().includes(search) ||
    String(e.amount).includes(search) ||
    (e.date || "").includes(search)
  );

  if (!filtered.length) {
    historyList.innerHTML = `<div class="empty-msg">
      <i class="fas fa-receipt"></i>
      <p>${search ? "No matching expenses found." : "No expenses yet.<br/>Add your first expense above!"}</p>
    </div>`;
    return;
  }

  const groups = {};
  filtered.forEach(e => { 
    if (!groups[e.date]) groups[e.date] = [];
    groups[e.date].push(e);
  });

  const today = fmtDate(new Date());
  const yesterday = fmtDate(new Date(Date.now() - 86400000));

  historyList.innerHTML = Object.entries(groups).map(([date, items]) => {
    const total = items.reduce((s, e) => s + (e.amount || 0), 0);
    const cur = items[0]?.currency || "₹";
    let lbl = date, sub = "";
    
    if (date === today) { 
      lbl = "TODAY"; 
      sub = `• ${date}`; 
    } else if (date === yesterday) { 
      lbl = "YESTERDAY"; 
      sub = `• ${date}`; 
    }

    return `
    <div class="exp-group">
      <div class="grp-head" onclick="toggleGroup(this)">
        <span class="grp-date">${lbl}<small>${sub}</small></span>
        <div class="grp-right">
          <span class="grp-total">Total: ${cur} ${total.toFixed(2)}</span>
          <span class="grp-cnt">${items.length} Expense${items.length > 1 ? "s" : ""}</span>
          <i class="fas fa-chevron-up grp-arrow open"></i>
        </div>
      </div>
      <div class="grp-body">
        ${items.map((e, i) => `
        <div class="exp-row">
          <span class="exp-dot"></span>
          <div class="exp-num">${i + 1}</div>
          <div class="exp-info">
            <div class="exp-name">${esc(e.name)}</div>
            <div class="exp-time">${e.time || ""}</div>
          </div>
          <span class="exp-amount">${e.currency || "₹"} ${(e.amount || 0).toFixed(2)}</span>
          <button class="del-btn" type="button" onclick="doDeleteExpense('${e.id}')"><i class="fas fa-trash"></i></button>
        </div>`).join("")}
      </div>
    </div>`;
  }).join("");
};

window.toggleGroup = function(head) {
  const body = head.nextElementSibling;
  const arrow = head.querySelector(".grp-arrow");
  
  if (!body || !arrow) return;
  
  const open = arrow.classList.contains("open");
  body.style.display = open ? "none" : "flex";
  arrow.classList.toggle("open", !open);
};

// ────────────────────────────────────────
// STATS
// ────────────────────────────────────────
function renderStats() {
  const today = fmtDate(new Date());
  const moStart = today.slice(0, 7);
  const cur = expenses[0]?.currency || "₹";

  const todayExp = expenses.filter(e => e.date === today);
  const monthExp = expenses.filter(e => (e.date || "").startsWith(moStart));
  const totalAll = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalToday = todayExp.reduce((s, e) => s + (e.amount || 0), 0);
  const totalMonth = monthExp.reduce((s, e) => s + (e.amount || 0), 0);
  const uniqDays = new Set(expenses.map(e => e.date)).size || 1;
  const avgDay = totalAll / uniqDays;

  const statsCards = qs("#statsCards");
  if (statsCards) {
    statsCards.innerHTML = `
      <div class="stat-card"><div class="stc-label">TODAY</div><div class="stc-val">${cur} ${totalToday.toFixed(0)}</div><div class="stc-sub">${todayExp.length} expense${todayExp.length !== 1 ? "s" : ""}</div></div>
      <div class="stat-card"><div class="stc-label">THIS MONTH</div><div class="stc-val">${cur} ${totalMonth.toFixed(0)}</div><div class="stc-sub">${monthExp.length} expense${monthExp.length !== 1 ? "s" : ""}</div></div>
      <div class="stat-card"><div class="stc-label">ALL TIME</div><div class="stc-val">${cur} ${totalAll.toFixed(0)}</div><div class="stc-sub">${expenses.length} total</div></div>
      <div class="stat-card"><div class="stc-label">DAILY AVG</div><div class="stc-val">${cur} ${avgDay.toFixed(0)}</div><div class="stc-sub">per active day</div></div>
    `;
  }

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const ds = fmtDate(d);
    const sum = expenses.filter(e => e.date === ds).reduce((s, e) => s + (e.amount || 0), 0);
    days.push({ lbl: d.toLocaleDateString("en", { weekday: "short" }).slice(0, 2), sum });
  }
  
  const mx = Math.max(...days.map(d => d.sum), 1);
  
  const barChart = qs("#barChart");
  if (barChart) {
    barChart.innerHTML = days.map(d => `
      <div class="bc-col">
        <div class="bc-val">${d.sum > 0 ? d.sum.toFixed(0) : ""}</div>
        <div class="bc-bar" style="height:${Math.max((d.sum / mx) * 80, d.sum > 0 ? 4 : 0)}px"></div>
        <div class="bc-day">${d.lbl}</div>
      </div>`).join("");
  }

  const top5 = [...expenses].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 5);
  const topList = qs("#topList");
  
  if (topList) {
    topList.innerHTML = top5.length
      ? top5.map(e => `<div class="top-item"><span class="top-name">${esc(e.name)}</span><span class="top-amt">${e.currency || "₹"} ${(e.amount || 0).toFixed(2)}</span></div>`).join("")
      : `<p style="font-size:12px;color:var(--txt3)">No expenses yet.</p>`;
  }
}

// ────────────────────────────────────────
// CALENDAR
// ────────────────────────────────────────
window.calShift = function(d) {
  calM += d;
  if (calM > 11) { calM = 0; calY++; }
  if (calM < 0) { calM = 11; calY--; }
  renderCalendar();
};

function renderCalendar() {
  const lbl = new Date(calY, calM, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
  const calLabel = qs("#calLabel");
  if (calLabel) calLabel.textContent = lbl;

  const calGrid = qs("#calGrid");
  if (!calGrid) return;
  
  const calWeeks = qs("#calWeeks");
  if (calWeeks) calWeeks.innerHTML = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => `<div class="cal-wday">${d}</div>`).join("");

  const first = new Date(calY, calM, 1).getDay();
  const days = new Date(calY, calM + 1, 0).getDate();
  const today = fmtDate(new Date());
  const expDates = new Set(expenses.map(e => e.date));

  let html = "";
  for (let i = 0; i < first; i++) html += `<div class="cal-cell blank"></div>`;
  for (let d = 1; d <= days; d++) {
    const ds = `${calY}-${pad(calM + 1)}-${pad(d)}`;
    const isT = ds === today;
    const hasE = expDates.has(ds);
    html += `<div class="cal-cell${isT ? " today" : ""}${hasE ? " has-exp" : ""}" onclick="showCalDay('${ds}')">${d}</div>`;
  }
  calGrid.innerHTML = html;
}

window.showCalDay = function(date) {
  const calDetail = qs("#calDetail");
  if (!calDetail) return;
  
  const items = expenses.filter(e => e.date === date);
  
  if (!items.length) {
    calDetail.innerHTML = `<p class="cal-det-title">${date} — No expenses</p>`;
  } else {
    const tot = items.reduce((s, e) => s + (e.amount || 0), 0);
    const cur = items[0]?.currency || "₹";
    calDetail.innerHTML = `
      <p class="cal-det-title">${date} — Total: ${cur} ${tot.toFixed(2)}</p>
      ${items.map(e => `<div class="cal-det-row"><span>${esc(e.name)}</span><span class="cal-det-amt">${e.currency || cur} ${(e.amount || 0).toFixed(2)}</span></div>`).join("")}
    `;
  }
  calDetail.classList.remove("hide");
};

// ────────────────────────────────────────
// VIEW / NAV
// ────────────────────────────────────────
window.goView = function(v) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active-view"));
  document.querySelectorAll(".bn-btn").forEach(b => b.classList.remove("active"));
  
  const view = qs("#view" + cap(v));
  const btn = qs("#bn" + cap(v));
  
  if (view) view.classList.add("active-view");
  if (btn) btn.classList.add("active");
  
  if (v === "stats") renderStats();
  if (v === "calendar") renderCalendar();
};

window.fabAction = function() {
  goView("home");
  setTimeout(() => {
    qs("#expName")?.focus();
    qs(".card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 80);
};

// ────────────────────────────────────────
// SIDEBAR
// ────────────────────────────────────────
window.openSidebar = function() {
  const sidebar = qs("#sidebar");
  const sbOverlay = qs("#sbOverlay");
  if (sidebar) sidebar.classList.remove("hide");
  if (sbOverlay) sbOverlay.classList.remove("hide");
};

window.closeSidebar = function() {
  const sidebar = qs("#sidebar");
  const sbOverlay = qs("#sbOverlay");
  if (sidebar) sidebar.classList.add("hide");
  if (sbOverlay) sbOverlay.classList.add("hide");
};

// ────────────────────────────────────────
// THEME
// ────────────────────────────────────────
window.toggleTheme = function() {
  dark = !dark;
  localStorage.setItem("et_dark", dark ? "1" : "0");
  applyTheme();
  const darkChk = qs("#darkChk");
  if (darkChk) darkChk.checked = dark;
};

function applyTheme() {
  document.body.toggleAttribute("data-dark", dark);
  const themeBtn = qs("#themeBtn");
  if (themeBtn) themeBtn.innerHTML = dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  const darkChk = qs("#darkChk");
  if (darkChk) darkChk.checked = dark;
}

// ────────────────────────────────────────
// CURRENCY
// ────────────────────────────────────────
window.saveDefCur = function() {
  const defCurSel = qs("#defCurSel");
  const v = defCurSel?.value;
  if (!v) return;
  
  localStorage.setItem("et_cur", v);
  
  const curSel = qs("#curSel");
  const curBadge = qs("#curBadge");
  
  if (curSel) curSel.value = v;
  if (curBadge) curBadge.textContent = v;
  
  toast("Default currency saved");
};
