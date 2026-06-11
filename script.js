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
// STATE
// ────────────────────────────────────────
let user = null;
let expenses = [];       // { id, name, amount, currency, date, time, ts }
let calY, calM;
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
  if (u) { user = u; bootApp(); }
  else   { user = null; showAuth(); }
});

function bootApp() {
  // fill user info everywhere
  const name = user.displayName || user.email.split("@")[0];
  qs("#sbName").textContent = name;
  qs("#sbEmail").textContent = user.email;
  qs("#suName").textContent  = name;
  qs("#suEmail").textContent = user.email;

  // default currency
  const dc = localStorage.getItem("et_cur") || "₹";
  qs("#curSel").value = dc;
  qs("#curBadge").textContent = dc;
  qs("#defCurSel").value = dc;

  showApp();
  goView("home");
  loadExpenses();
}

function showAuth() {
  qs("#authScreen").classList.remove("hide");
  qs("#appScreen").classList.add("hide");
}
function showApp() {
  qs("#authScreen").classList.add("hide");
  qs("#appScreen").classList.remove("hide");
}

// ────────────────────────────────────────
// AUTH
// ────────────────────────────────────────
window.switchTab = function(tab) {
  qs("#loginForm").classList.toggle("hide", tab !== "login");
  qs("#signupForm").classList.toggle("hide", tab !== "signup");
  qs("#tabLogin").classList.toggle("active", tab === "login");
  qs("#tabSignup").classList.toggle("active", tab !== "login");
  qs("#lErr").textContent = "";
  qs("#sErr").textContent = "";
};

window.doLogin = async function() {
  const email = qs("#lEmail").value.trim();
  const pass  = qs("#lPass").value;
  const err   = qs("#lErr");
  err.textContent = "";
  if (!email || !pass) { err.textContent = "Please fill in all fields."; return; }
  setAuthLoading("l", true);
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(e) { err.textContent = authMsg(e.code); }
  setAuthLoading("l", false);
};

window.doSignup = async function() {
  const name  = qs("#sName").value.trim();
  const email = qs("#sEmail").value.trim();
  const pass  = qs("#sPass").value;
  const conf  = qs("#sConf").value;
  const err   = qs("#sErr");
  err.textContent = "";
  if (!name||!email||!pass||!conf) { err.textContent = "Please fill in all fields."; return; }
  if (pass.length < 6)             { err.textContent = "Password must be at least 6 characters."; return; }
  if (pass !== conf)               { err.textContent = "Passwords do not match."; return; }
  setAuthLoading("s", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
  } catch(e) { err.textContent = authMsg(e.code); }
  setAuthLoading("s", false);
};

window.doLogout = async function() {
  await signOut(auth);
  expenses = [];
  toast("Logged out successfully");
};

window.eyeToggle = function(id, btn) {
  const inp = qs("#"+id);
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  btn.innerHTML = `<i class="fas fa-eye${show ? "" : "-slash"}"></i>`;
};

function setAuthLoading(prefix, on) {
  qs("#"+prefix+"BtnTxt").classList.toggle("hide", on);
  qs("#"+prefix+"Spin").classList.toggle("hide", !on);
  const btn = qs("#"+prefix+"Btn");
  if (btn) btn.disabled = on;
}

function authMsg(code) {
  const m = {
    "auth/user-not-found":    "No account found with this email.",
    "auth/wrong-password":    "Incorrect password.",
    "auth/invalid-credential":"Invalid email or password.",
    "auth/email-already-in-use":"This email is already registered.",
    "auth/invalid-email":     "Please enter a valid email address.",
    "auth/weak-password":     "Password must be at least 6 characters.",
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
    expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    refresh();
  } catch(e) {
    console.error(e);
    toast("Failed to load expenses. Check Firestore index.");
  }
}

window.doAddExpense = async function() {
  const name   = qs("#expName").value.trim();
  const amount = parseFloat(qs("#expAmt").value);
  const cur    = qs("#curSel").value;
  const errEl  = qs("#addErr");
  errEl.textContent = "";

  if (!name)                    { errEl.textContent = "Enter an expense name."; return; }
  if (isNaN(amount)||amount < 0){ errEl.textContent = "Enter a valid amount."; return; }

  qs("#addBtnTxt").classList.add("hide");
  qs("#addSpin").classList.remove("hide");
  qs("#addBtn").disabled = true;

  try {
    const ts  = Timestamp.now();
    const d   = ts.toDate();
    const exp = {
      uid:      user.uid,
      name,
      amount,
      currency: cur,
      date:     fmtDate(d),
      time:     fmtTime(d),
      ts
    };
    const ref = await addDoc(collection(db, "expenses"), exp);
    expenses.unshift({ id: ref.id, ...exp });
    qs("#expName").value = "";
    qs("#expAmt").value  = "";
    refresh();
    toast("Expense added ✓");
  } catch(e) {
    console.error(e);
    errEl.textContent = "Failed to add. Please try again.";
  }

  qs("#addBtnTxt").classList.remove("hide");
  qs("#addSpin").classList.add("hide");
  qs("#addBtn").disabled = false;
};

window.doDeleteExpense = async function(id) {
  if (!confirm("Delete this expense?")) return;
  try {
    await deleteDoc(doc(db, "expenses", id));
    expenses = expenses.filter(e => e.id !== id);
    refresh();
    toast("Expense deleted");
  } catch(e) { toast("Failed to delete"); }
};

window.doClearAll = async function() {
  if (!expenses.length) { toast("No expenses to clear"); return; }
  if (!confirm("Clear ALL expenses? This cannot be undone.")) return;
  try {
    const batch = writeBatch(db);
    expenses.forEach(e => batch.delete(doc(db, "expenses", e.id)));
    await batch.commit();
    expenses = [];
    refresh();
    toast("All expenses cleared");
  } catch(e) { toast("Failed to clear"); }
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
  const td  = fmtDate(new Date());
  const tde = expenses.filter(e => e.date === td);
  const tot = tde.reduce((s, e) => s + (e.amount || 0), 0);
  const cur = tde[0]?.currency || qs("#curSel").value || "₹";
  qs("#todayTotal").textContent = `${cur} ${tot.toFixed(2)}`;
  qs("#todayCount").textContent = tde.length;
}

function setSummaryDate() {
  const d = new Date();
  qs("#scDate").textContent = d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
  qs("#scDay").textContent  = d.toLocaleDateString("en-IN", { weekday:"long" });
}

// ────────────────────────────────────────
// HISTORY
// ────────────────────────────────────────
window.renderHistory = function() {
  const search = (qs("#searchInp")?.value || "").toLowerCase().trim();
  const list   = qs("#historyList");

  let filtered = expenses.filter(e =>
    !search ||
    e.name.toLowerCase().includes(search) ||
    String(e.amount).includes(search) ||
    (e.date || "").includes(search)
  );

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-msg">
      <i class="fas fa-receipt"></i>
      <p>${search ? "No matching expenses found." : "No expenses yet.<br/>Add your first expense above!"}</p>
    </div>`;
    return;
  }

  // group by date
  const groups = {};
  filtered.forEach(e => { (groups[e.date] = groups[e.date] || []).push(e); });

  const today     = fmtDate(new Date());
  const yesterday = fmtDate(new Date(Date.now() - 86400000));

  list.innerHTML = Object.entries(groups).map(([date, items]) => {
    const total = items.reduce((s, e) => s + (e.amount || 0), 0);
    const cur   = items[0]?.currency || "₹";
    let lbl = date, sub = "";
    if (date === today)     { lbl = "TODAY";     sub = `• ${date}`; }
    else if (date === yesterday) { lbl = "YESTERDAY"; sub = `• ${date}`; }

    return `
    <div class="exp-group">
      <div class="grp-head" onclick="toggleGroup(this)">
        <span class="grp-date">${lbl}<small>${sub}</small></span>
        <div class="grp-right">
          <span class="grp-total">Total: ${cur} ${total.toFixed(2)}</span>
          <span class="grp-cnt">${items.length} Expense${items.length>1?"s":""}</span>
          <i class="fas fa-chevron-up grp-arrow open"></i>
        </div>
      </div>
      <div class="grp-body">
        ${items.map((e, i) => `
        <div class="exp-row">
          <span class="exp-dot"></span>
          <div class="exp-num">${i+1}</div>
          <div class="exp-info">
            <div class="exp-name">${esc(e.name)}</div>
            <div class="exp-time">${e.time || ""}</div>
          </div>
          <span class="exp-amount">${e.currency||"₹"} ${(e.amount||0).toFixed(2)}</span>
          <button class="del-btn" onclick="doDeleteExpense('${e.id}')"><i class="fas fa-trash"></i></button>
        </div>`).join("")}
      </div>
    </div>`;
  }).join("");
};

window.toggleGroup = function(head) {
  const body  = head.nextElementSibling;
  const arrow = head.querySelector(".grp-arrow");
  const open  = arrow.classList.contains("open");
  body.style.display  = open ? "none" : "flex";
  arrow.classList.toggle("open", !open);
};

// ────────────────────────────────────────
// STATS
// ────────────────────────────────────────
function renderStats() {
  const today   = fmtDate(new Date());
  const moStart = today.slice(0, 7);
  const cur     = expenses[0]?.currency || "₹";

  const todayExp  = expenses.filter(e => e.date === today);
  const monthExp  = expenses.filter(e => (e.date||"").startsWith(moStart));
  const totalAll  = expenses.reduce((s, e) => s + (e.amount||0), 0);
  const totalToday = todayExp.reduce((s, e) => s + (e.amount||0), 0);
  const totalMonth = monthExp.reduce((s, e) => s + (e.amount||0), 0);
  const uniqDays  = new Set(expenses.map(e => e.date)).size || 1;
  const avgDay    = totalAll / uniqDays;

  qs("#statsCards").innerHTML = `
    <div class="stat-card"><div class="stc-label">TODAY</div><div class="stc-val">${cur} ${totalToday.toFixed(0)}</div><div class="stc-sub">${todayExp.length} expense${todayExp.length!==1?"s":""}</div></div>
    <div class="stat-card"><div class="stc-label">THIS MONTH</div><div class="stc-val">${cur} ${totalMonth.toFixed(0)}</div><div class="stc-sub">${monthExp.length} expense${monthExp.length!==1?"s":""}</div></div>
    <div class="stat-card"><div class="stc-label">ALL TIME</div><div class="stc-val">${cur} ${totalAll.toFixed(0)}</div><div class="stc-sub">${expenses.length} total</div></div>
    <div class="stat-card"><div class="stc-label">DAILY AVG</div><div class="stc-val">${cur} ${avgDay.toFixed(0)}</div><div class="stc-sub">per active day</div></div>
  `;

  // 7-day bar
  const days = [];
  for (let i=6;i>=0;i--) {
    const d = new Date(Date.now() - i*86400000);
    const ds = fmtDate(d);
    const sum = expenses.filter(e=>e.date===ds).reduce((s,e)=>s+(e.amount||0),0);
    days.push({ lbl: d.toLocaleDateString("en",{weekday:"short"}).slice(0,2), sum });
  }
  const mx = Math.max(...days.map(d=>d.sum), 1);
  qs("#barChart").innerHTML = days.map(d => `
    <div class="bc-col">
      <div class="bc-val">${d.sum>0?d.sum.toFixed(0):""}</div>
      <div class="bc-bar" style="height:${Math.max((d.sum/mx)*80, d.sum>0?4:0)}px"></div>
      <div class="bc-day">${d.lbl}</div>
    </div>`).join("");

  // top 5 expenses
  const top5 = [...expenses].sort((a,b)=>(b.amount||0)-(a.amount||0)).slice(0,5);
  qs("#topList").innerHTML = top5.length
    ? top5.map(e=>`<div class="top-item"><span class="top-name">${esc(e.name)}</span><span class="top-amt">${e.currency||"₹"} ${(e.amount||0).toFixed(2)}</span></div>`).join("")
    : `<p style="font-size:12px;color:var(--txt3)">No expenses yet.</p>`;
}

// ────────────────────────────────────────
// CALENDAR
// ────────────────────────────────────────
window.calShift = function(d) {
  calM += d;
  if (calM > 11) { calM = 0; calY++; }
  if (calM < 0)  { calM = 11; calY--; }
  renderCalendar();
};

function renderCalendar() {
  const lbl = new Date(calY, calM, 1).toLocaleDateString("en", {month:"long", year:"numeric"});
  const el = qs("#calLabel"); if (el) el.textContent = lbl;

  const grid = qs("#calGrid"); if (!grid) return;
  const wk   = qs("#calWeeks");
  if (wk) wk.innerHTML = ["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=>`<div class="cal-wday">${d}</div>`).join("");

  const first   = new Date(calY, calM, 1).getDay();
  const days    = new Date(calY, calM+1, 0).getDate();
  const today   = fmtDate(new Date());
  const expDates = new Set(expenses.map(e=>e.date));

  let html = "";
  for (let i=0;i<first;i++) html += `<div class="cal-cell blank"></div>`;
  for (let d=1;d<=days;d++) {
    const ds = `${calY}-${pad(calM+1)}-${pad(d)}`;
    const isT = ds===today;
    const hasE = expDates.has(ds);
    html += `<div class="cal-cell${isT?" today":""}${hasE?" has-exp":""}" onclick="showCalDay('${ds}')">${d}</div>`;
  }
  grid.innerHTML = html;
}

window.showCalDay = function(date) {
  const det   = qs("#calDetail");
  const items = expenses.filter(e=>e.date===date);
  if (!items.length) {
    det.innerHTML = `<p class="cal-det-title">${date} — No expenses</p>`;
  } else {
    const tot = items.reduce((s,e)=>s+(e.amount||0),0);
    const cur = items[0]?.currency||"₹";
    det.innerHTML = `
      <p class="cal-det-title">${date} — Total: ${cur} ${tot.toFixed(2)}</p>
      ${items.map(e=>`<div class="cal-det-row"><span>${esc(e.name)}</span><span class="cal-det-amt">${e.currency||cur} ${(e.amount||0).toFixed(2)}</span></div>`).join("")}
    `;
  }
  det.classList.remove("hide");
};

// ────────────────────────────────────────
// VIEW / NAV
// ────────────────────────────────────────
window.goView = function(v) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active-view"));
  document.querySelectorAll(".bn-btn").forEach(b => b.classList.remove("active"));
  const view = qs("#view"+cap(v));
  const btn  = qs("#bn"+cap(v));
  if (view) view.classList.add("active-view");
  if (btn)  btn.classList.add("active");
  if (v==="stats")    renderStats();
  if (v==="calendar") renderCalendar();
};

window.fabAction = function() {
  goView("home");
  setTimeout(() => {
    qs("#expName")?.focus();
    qs(".card")?.scrollIntoView({ behavior:"smooth", block:"center" });
  }, 80);
};

// ────────────────────────────────────────
// SIDEBAR
// ────────────────────────────────────────
window.openSidebar = function() {
  qs("#sidebar").classList.remove("hide");
  qs("#sbOverlay").classList.remove("hide");
};
window.closeSidebar = function() {
  qs("#sidebar").classList.add("hide");
  qs("#sbOverlay").classList.add("hide");
};

// ────────────────────────────────────────
// THEME
// ────────────────────────────────────────
window.toggleTheme = function() {
  dark = !dark;
  localStorage.setItem("et_dark", dark?"1":"0");
  applyTheme();
  const chk = qs("#darkChk"); if (chk) chk.checked = dark;
};

function applyTheme() {
  document.body.toggleAttribute("data-dark", dark);
  const btn = qs("#themeBtn");
  if (btn) btn.innerHTML = dark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  const chk = qs("#darkChk"); if (chk) chk.checked = dark;
}

// ────────────────────────────────────────
// CURRENCY
// ────────────────────────────────────────
window.saveDefCur = function() {
  const v = qs("#defCurSel").value;
  localStorage.setItem("et_cur", v);
  qs("#curSel").value = v;
  qs("#curBadge").textContent = v;
  toast("Default currency saved");
};

// ────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fmtTime(d) {
  let h=d.getHours(), m=d.getMinutes();
  const ap=h>=12?"PM":"AM"; h=h%12||12;
  return `${pad(h)}:${pad(m)} ${ap}`;
}
function pad(n) { return String(n).padStart(2,"0"); }
function cap(s) { return s.charAt(0).toUpperCase()+s.slice(1); }
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function qs(sel) { return document.querySelector(sel); }

let _toastT;
function toast(msg) {
  const t = qs("#toast");
  t.textContent = msg;
  t.classList.remove("hide");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.add("hide"), 2800);
}
