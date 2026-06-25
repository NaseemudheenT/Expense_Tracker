// ===== FIREBASE CONFIG =====
import{initializeApp}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import{getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,updateProfile,GoogleAuthProvider,signInWithRedirect,getRedirectResult}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import{getFirestore,collection,addDoc,deleteDoc,doc,onSnapshot,query,orderBy,writeBatch,getDocs}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app=initializeApp({
  apiKey:'AIzaSyD6eUkcF1DR5Tj_oMNmJGHDm06XzKLGBg4',
  authDomain:'expense-tracker-5c250.firebaseapp.com',
  projectId:'expense-tracker-5c250',
  storageBucket:'expense-tracker-5c250.firebasestorage.app',
  messagingSenderId:'770528221263',
  appId:'1:770528221263:web:d85908f947ff233a07f23a'
});
const auth=getAuth(app);
const db=getFirestore(app);

// ===== STATE =====
let uid=null,expenses=[],unsub=null;
let cur=localStorage.getItem('et_cur')||'INR';
let dark=localStorage.getItem('et_dark')==='1';
let deferredPrompt=null;
let calY=new Date().getFullYear(),calM=new Date().getMonth();

// ===== CURRENCIES =====
const CURR={
  INR:{s:'₹',n:'Indian Rupee'},USD:{s:'$',n:'US Dollar'},EUR:{s:'€',n:'Euro'},
  GBP:{s:'£',n:'British Pound'},JPY:{s:'¥',n:'Japanese Yen'},AED:{s:'د.إ',n:'UAE Dirham'},
  SGD:{s:'S$',n:'Singapore Dollar'},AUD:{s:'A$',n:'Australian Dollar'},
  CAD:{s:'C$',n:'Canadian Dollar'},CHF:{s:'Fr',n:'Swiss Franc'},
  CNY:{s:'¥',n:'Chinese Yuan'},HKD:{s:'HK$',n:'Hong Kong Dollar'},
  MYR:{s:'RM',n:'Malaysian Ringgit'},THB:{s:'฿',n:'Thai Baht'},
  SAR:{s:'﷼',n:'Saudi Riyal'},QAR:{s:'﷼',n:'Qatari Riyal'},
  KWD:{s:'د.ك',n:'Kuwaiti Dinar'},BHD:{s:'BD',n:'Bahraini Dinar'},
  OMR:{s:'﷼',n:'Omani Rial'},NZD:{s:'NZ$',n:'New Zealand Dollar'},
  ZAR:{s:'R',n:'South African Rand'},BRL:{s:'R$',n:'Brazilian Real'},
  MXN:{s:'$',n:'Mexican Peso'},IDR:{s:'Rp',n:'Indonesian Rupiah'},
  PHP:{s:'₱',n:'Philippine Peso'},PKR:{s:'₨',n:'Pakistani Rupee'},
  BDT:{s:'৳',n:'Bangladeshi Taka'},LKR:{s:'Rs',n:'Sri Lankan Rupee'},
  NPR:{s:'Rs',n:'Nepalese Rupee'},KRW:{s:'₩',n:'South Korean Won'},
  TRY:{s:'₺',n:'Turkish Lira'},RUB:{s:'₽',n:'Russian Ruble'},
  SEK:{s:'kr',n:'Swedish Krona'},NOK:{s:'kr',n:'Norwegian Krone'},
  DKK:{s:'kr',n:'Danish Krone'},PLN:{s:'zł',n:'Polish Zloty'}
};

// ===== CACHE =====
function saveCache(u,d){try{localStorage.setItem('et_'+u,JSON.stringify(d));}catch(e){}}
function loadCache(u){try{const d=localStorage.getItem('et_'+u);return d?JSON.parse(d):[];}catch(e){return[];}}
function clearCache(u){try{localStorage.removeItem('et_'+u);}catch(e){}}

// ===== THEME =====
function applyTheme(){
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  const ti=document.getElementById('theme-icon');
  if(ti)ti.className=dark?'fas fa-sun':'fas fa-moon';
  const dt=document.getElementById('dark-toggle');
  if(dt)dt.className='toggle-sw'+(dark?' on':'');
}
applyTheme();

// ===== AUTH STATE =====
document.getElementById('auth-screen').style.display='flex';

onAuthStateChanged(auth,user=>{
  if(user){
    uid=user.uid;
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('app-screen').style.display='block';
    document.getElementById('prof-name').textContent=user.displayName||user.email.split('@')[0];
    document.getElementById('prof-email').textContent=user.email||'';
    updateDate();
    applyCurrency(cur);
    loadExpenses();
  }else{
    uid=null;expenses=[];
    if(unsub){unsub();unsub=null;}
    document.getElementById('auth-screen').style.display='flex';
    document.getElementById('app-screen').style.display='none';
  }
});

getRedirectResult(auth).catch(()=>{});

// ===== AUTH FUNCTIONS =====
window.doEmailLogin=async()=>{
  const e=document.getElementById('login-email').value.trim();
  const p=document.getElementById('login-pw').value;
  if(!e||!p){showAuthError('Please fill all fields.');return;}
  try{await signInWithEmailAndPassword(auth,e,p);}
  catch(err){showAuthError(getErrMsg(err));}
};

window.doEmailSignup=async()=>{
  const n=document.getElementById('signup-name').value.trim();
  const e=document.getElementById('signup-email').value.trim();
  const p=document.getElementById('signup-pw').value;
  if(!n||!e||!p){showAuthError('Please fill all fields.');return;}
  if(p.length<6){showAuthError('Password must be at least 6 characters.');return;}
  try{
    const c=await createUserWithEmailAndPassword(auth,e,p);
    await updateProfile(c.user,{displayName:n});
  }catch(err){showAuthError(getErrMsg(err));}
};

window.doGoogleLogin=async()=>{
  try{
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    await signInWithRedirect(auth,provider);
  }catch(err){showAuthError(getErrMsg(err));}
};

window.doLogout=async()=>{
  if(uid)clearCache(uid);
  await signOut(auth);
};

function getErrMsg(e){
  const c=e.code||'';
  if(c.includes('user-not-found')||c.includes('wrong-password')||c.includes('invalid-credential'))return'Wrong email or password.';
  if(c.includes('email-already-in-use'))return'Email already registered. Please sign in.';
  if(c.includes('invalid-email'))return'Please enter a valid email.';
  if(c.includes('network'))return'No internet. Please try again.';
  return'Something went wrong. Please try again.';
}
function showAuthError(msg){
  const el=document.getElementById('auth-error');
  el.textContent=msg;el.style.display='block';
  setTimeout(()=>el.style.display='none',4000);
}

window.switchAuthTab=tab=>{
  document.getElementById('login-form').style.display=tab==='login'?'block':'none';
  document.getElementById('signup-form').style.display=tab==='signup'?'block':'none';
  document.getElementById('tab-login').className='auth-tab'+(tab==='login'?' active':'');
  document.getElementById('tab-signup').className='auth-tab'+(tab==='signup'?' active':'');
  document.getElementById('auth-error').style.display='none';
};
window.togglePassword=(id,el)=>{
  const inp=document.getElementById(id);
  inp.type=inp.type==='password'?'text':'password';
  el.innerHTML=inp.type==='text'?'<i class="fas fa-eye-slash"></i>':'<i class="fas fa-eye"></i>';
};

// ===== EXPENSES =====
function loadExpenses(){
  expenses=loadCache(uid);
  renderAll();
  if(unsub)unsub();
  const q=query(collection(db,'users',uid,'expenses'),orderBy('timestamp','desc'));
  unsub=onSnapshot(q,snap=>{
    expenses=snap.docs.map(d=>({id:d.id,...d.data()}));
    saveCache(uid,expenses);
    renderAll();
  },()=>{});
}

window.addExpense=async()=>{
  const name=document.getElementById('exp-name').value.trim();
  const raw=document.getElementById('exp-amount').value.replace(/,/g,'');
  const amount=parseFloat(raw);
  if(!name){showToast('Enter expense name','err');return;}
  if(!raw||isNaN(amount)||amount<=0){showToast('Enter valid amount','err');return;}
  const cat=document.querySelector('.cat-chip.active')?.dataset.cat||'Other';
  const now=new Date();
  try{
    await addDoc(collection(db,'users',uid,'expenses'),{
      name,amount,currency:cur,category:cat,
      timestamp:now.getTime(),
      dateStr:makeDateKey(now),
      timeStr:makeTimeStr(now)
    });
    document.getElementById('exp-name').value='';
    document.getElementById('exp-amount').value='';
    document.getElementById('amount-words').textContent='';
    showToast('Expense added!','ok');
  }catch(e){showToast('Failed to save. Check connection.','err');}
};

window.deleteExpense=async id=>{
  try{await deleteDoc(doc(db,'users',uid,'expenses',id));showToast('Deleted','ok');}
  catch(e){showToast('Failed to delete','err');}
};

window.clearAllExpenses=async()=>{
  closeModal();
  try{
    const snap=await getDocs(collection(db,'users',uid,'expenses'));
    const batch=writeBatch(db);
    snap.docs.forEach(d=>batch.delete(d.ref));
    await batch.commit();
    showToast('All cleared','ok');
  }catch(e){showToast('Failed to clear','err');}
};

// ===== RENDER =====
function renderAll(){
  renderSummary();
  renderHistory();
  if(document.getElementById('tab-cal').style.display==='block')renderCalendar();
}

function renderSummary(){
  const tk=makeDateKey(new Date());
  const te=expenses.filter(e=>e.dateStr===tk);
  const tot=te.reduce((s,e)=>s+e.amount,0);
  const sym=(CURR[cur]||CURR.INR).s;
  document.getElementById('today-total').textContent=sym+formatNum(tot);
  document.getElementById('today-count').textContent=te.length+' expense'+(te.length!==1?'s':'')+' today';
}

function renderHistory(){
  const el=document.getElementById('history-list');
  if(!expenses.length){
    el.innerHTML='<div class="empty-state"><i class="fas fa-receipt"></i><p>No expenses yet. Add your first one!</p></div>';
    return;
  }
  const groups={};
  expenses.forEach(e=>{if(!groups[e.dateStr])groups[e.dateStr]=[];groups[e.dateStr].push(e);});
  const dates=Object.keys(groups).sort((a,b)=>b.localeCompare(a));
  el.innerHTML=dates.map((ds,di)=>{
    const items=groups[ds];
    const tot=items.reduce((s,e)=>s+e.amount,0);
    const sym=(CURR[items[0]?.currency]||CURR.INR).s;
    const rows=items.map((e,i)=>{
      const es=(CURR[e.currency]||CURR.INR).s;
      const diff=e.currency!==cur;
      return`<div class="exp-item">
        <div class="exp-num">${i+1}</div>
        <div class="exp-info">
          <div class="exp-name">${escHtml(e.name)}</div>
          <div class="exp-meta">${e.timeStr} · ${e.dateStr}<span class="exp-cat">${e.category}</span></div>
        </div>
        <div>
          <div class="exp-amount">${es}${formatNum(e.amount)}</div>
          ${diff?`<div class="exp-cur-note">${e.currency}</div>`:''}
        </div>
        <button class="btn-del" onclick="deleteExpense('${e.id}')"><i class="fas fa-trash"></i></button>
      </div>`;
    }).join('');
    return`<div class="day-group">
      <div class="day-hdr" onclick="toggleDay('dg${di}','dc${di}')">
        <span class="day-label">${getDayLabel(ds)}</span>
        <div class="day-meta">
          <span class="day-total">${sym}${formatNum(tot)}</span>
          <span class="day-count">${items.length}</span>
          <i class="fas fa-chevron-down" id="dc${di}" style="color:var(--muted);font-size:12px;transition:transform 0.2s"></i>
        </div>
      </div>
      <div class="day-items" id="dg${di}">${rows}</div>
    </div>`;
  }).join('');
}

function renderCalendar(){
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month').textContent=months[calM]+' '+calY;
  const expDates=new Set(expenses.map(e=>e.dateStr));
  const today=makeDateKey(new Date());
  const firstDay=new Date(calY,calM,1).getDay();
  const daysInMonth=new Date(calY,calM+1,0).getDate();
  let h='<div class="cal-day-name">Su</div><div class="cal-day-name">Mo</div><div class="cal-day-name">Tu</div><div class="cal-day-name">We</div><div class="cal-day-name">Th</div><div class="cal-day-name">Fr</div><div class="cal-day-name">Sa</div>';
  for(let i=0;i<firstDay;i++)h+='<div></div>';
  for(let d=1;d<=daysInMonth;d++){
    const k=`${calY}-${String(calM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const iT=k===today,hasE=expDates.has(k);
    h+=`<div class="cal-day${iT?' today':hasE?' has-exp':''}" onclick="showCalDay('${k}')">${d}</div>`;
  }
  document.getElementById('cal-grid').innerHTML=h;
}

window.calNavigate=d=>{
  calM+=d;
  if(calM<0){calM=11;calY--;}
  if(calM>11){calM=0;calY++;}
  renderCalendar();
  document.getElementById('cal-detail').innerHTML='';
};

window.showCalDay=k=>{
  const sym=(CURR[cur]||CURR.INR).s;
  const de=expenses.filter(e=>e.dateStr===k);
  const el=document.getElementById('cal-detail');
  if(!de.length){el.innerHTML=`<div class="stat-card"><p style="color:var(--muted);font-size:14px;text-align:center">No expenses on ${k}</p></div>`;return;}
  const tot=de.reduce((s,e)=>s+e.amount,0);
  el.innerHTML=`<div class="stat-card">
    <div class="sec-title" style="margin-bottom:12px"><i class="fas fa-calendar-day"></i>${k}</div>
    ${de.map(e=>{const es=(CURR[e.currency]||CURR.INR).s;return`<div class="stat-row"><span>${escHtml(e.name)} <span class="exp-cat">${e.category}</span></span><strong>${es}${formatNum(e.amount)}</strong></div>`;}).join('')}
    <div class="stat-row"><span style="font-weight:700">Total</span><strong class="gold">${sym}${formatNum(tot)}</strong></div>
  </div>`;
};

// ===== CURRENCY =====
window.changeCurrency=c=>{
  cur=c;localStorage.setItem('et_cur',c);
  applyCurrency(c);renderAll();
  showToast('Currency: '+c,'ok');
};
function applyCurrency(c){
  const info=CURR[c]||CURR.INR;
  document.getElementById('cur-display').textContent=`${info.n} (${info.s})`;
  document.getElementById('amt-symbol').textContent=info.s;
  document.getElementById('amt-sym-label').textContent=info.s;
  document.getElementById('set-currency').textContent=`${c} — ${info.n}`;
  const p=document.getElementById('cur-picker');if(p)p.value=c;
}

// ===== UTILS =====
function formatNum(n){
  const p=parseFloat(n||0).toFixed(2).split('.');
  p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return p.join('.');
}
function makeDateKey(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function makeTimeStr(d){let h=d.getHours(),m=d.getMinutes(),a=h>=12?'PM':'AM';h=h%12||12;return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} ${a}`;}
function getDayLabel(ds){
  const t=makeDateKey(new Date()),y=makeDateKey(new Date(Date.now()-86400000));
  if(ds===t)return'TODAY · '+ds;if(ds===y)return'YESTERDAY · '+ds;return ds;
}
function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function updateDate(){
  const d=new Date();
  const ms=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const ds=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  document.getElementById('header-date').textContent=`${String(d.getDate()).padStart(2,'0')} ${ms[d.getMonth()]} ${d.getFullYear()}`;
  document.getElementById('header-day').textContent=ds[d.getDay()];
}
setInterval(updateDate,60000);

// ===== AMOUNT WORDS =====
window.onAmountInput=el=>{
  let r=el.value.replace(/[^0-9.]/g,'');
  const pt=r.split('.');
  if(pt.length>2)r=pt[0]+'.'+pt.slice(1).join('');
  const ip=pt[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');
  el.value=pt.length>1?ip+'.'+pt[1]:ip;
  const n=parseFloat(r);
  document.getElementById('amount-words').textContent=(!isNaN(n)&&n>0)?numToWords(n):'';
};
function numToWords(n){
  if(!n||n<=0)return'';
  const a=['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const b=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  function hw(n){if(n<20)return a[n];if(n<100)return b[Math.floor(n/10)]+(n%10?' '+a[n%10]:'');return a[Math.floor(n/100)]+' hundred'+(n%100?' '+hw(n%100):'');}
  const int=Math.floor(n);let s='';
  if(int>=10000000)s+=hw(Math.floor(int/10000000))+' crore ';
  if(int>=100000)s+=hw(Math.floor((int%10000000)/100000))+' lakh ';
  if(int>=1000)s+=hw(Math.floor((int%100000)/1000))+' thousand ';
  if(int%1000)s+=hw(int%1000);
  s=s.trim();
  const dec=Math.round((n-int)*100);
  if(dec>0)s+=' and '+hw(dec)+' paise';
  return s.charAt(0).toUpperCase()+s.slice(1);
}

// ===== UI =====
window.selectCat=el=>{
  document.querySelectorAll('.cat-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
};
window.toggleDay=(id,arrow)=>{
  const el=document.getElementById(id);
  const ar=document.getElementById(arrow);
  if(!el)return;
  const hidden=el.style.display==='none';
  el.style.display=hidden?'block':'none';
  if(ar)ar.style.transform=hidden?'':'rotate(-90deg)';
};
window.toggleTheme=()=>{
  dark=!dark;localStorage.setItem('et_dark',dark?'1':'0');applyTheme();
};
window.switchTab=tab=>{
  ['home','calc','cal','set'].forEach(t=>{
    document.getElementById('tab-'+t).style.display=t===tab?'block':'none';
    const nb=document.getElementById('nav-'+t);
    if(nb)nb.className='nav-btn'+(t===tab?' active':'');
  });
  if(tab==='cal')renderCalendar();
  if(tab==='set')detectInstall();
};
window.goHome=()=>{
  switchTab('home');
  setTimeout(()=>document.getElementById('exp-name').focus(),150);
};
window.openModal=()=>document.getElementById('modal').classList.add('show');
window.closeModal=()=>document.getElementById('modal').classList.remove('show');
document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal'))closeModal();});

let toastTimer;
function showToast(msg,type){
  const el=document.getElementById('toast');
  el.textContent=msg;el.className='toast '+(type||'');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}

// ===== CALCULATOR =====
let cCur='0',cExpr='',cOpr='',cPrev='',cNew=true,cHist=[];
function cDisp(){
  document.getElementById('calc-result').textContent=cCur==='Error'?'Error':cFormat(cCur);
  document.getElementById('calc-expr').textContent=cExpr;
}
function cFormat(s){
  if(!s||s==='0'||s==='-')return s;
  const neg=s.startsWith('-');const abs=neg?s.slice(1):s;
  const pts=abs.split('.');
  pts[0]=pts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return(neg?'-':'')+pts.join('.');
}
window.calcNum=n=>{
  if(cCur==='Error'){cCur='0';cNew=true;}
  if(n==='.'&&cCur.includes('.'))return;
  if(cNew){cCur=(n==='.'?'0.':n);cNew=false;}
  else{cCur=cCur==='0'&&n!=='.'?n:cCur+n;}
  cDisp();
};
window.calcOp=op=>{
  if(cCur==='Error')cCur='0';
  if(cOpr&&!cNew)calcEq(true);
  cPrev=cCur;cOpr=op;cExpr=cFormat(cCur)+' '+op;cNew=true;cDisp();
};
window.calcEq=(chain)=>{
  if(!cOpr||cPrev==='')return;
  const a=parseFloat(cPrev),b=parseFloat(cCur);
  let res;
  if(cOpr==='÷')res=b===0?'Error':a/b;
  else if(cOpr==='×')res=a*b;
  else if(cOpr==='−')res=a-b;
  else res=a+b;
  const ex=cExpr+' '+cFormat(cCur)+' =';
  const an=res==='Error'?'Error':String(parseFloat(res.toFixed(10)));
  if(!chain){
    cHist.unshift({ex,an});if(cHist.length>20)cHist.pop();
    renderCalcHist();cExpr='';cOpr='';cPrev='';
  }
  cCur=an;cNew=true;cDisp();
};
window.calcFn=fn=>{
  if(fn==='AC'){cCur='0';cExpr='';cOpr='';cPrev='';cNew=true;}
  else if(fn==='+/-'&&cCur!=='0'&&cCur!=='Error')cCur=cCur.startsWith('-')?cCur.slice(1):'-'+cCur;
  else if(fn==='%'){const v=parseFloat(cCur);if(!isNaN(v))cCur=String(v/100);}
  cDisp();
};
function renderCalcHist(){
  const el=document.getElementById('calc-hist');
  if(!cHist.length){el.innerHTML='<p style="color:var(--muted);font-size:13px">No calculations yet.</p>';return;}
  el.innerHTML=cHist.map(h=>`<div class="calc-hist-item"><span class="calc-hist-expr">${h.ex}</span><span class="calc-hist-ans">${cFormat(h.an)}</span></div>`).join('');
}
window.clearCalcHist=()=>{cHist=[];renderCalcHist();};
document.addEventListener('keydown',e=>{
  if(document.getElementById('tab-calc').style.display!=='block')return;
  if(e.key>='0'&&e.key<='9')calcNum(e.key);
  else if(e.key==='.')calcNum('.');
  else if(e.key==='+')calcOp('+');
  else if(e.key==='-')calcOp('−');
  else if(e.key==='*')calcOp('×');
  else if(e.key==='/')calcOp('÷');
  else if(e.key==='Enter'||e.key==='=')calcEq();
  else if(e.key==='Escape')calcFn('AC');
  else if(e.key==='Backspace'){if(!cNew&&cCur.length>1)cCur=cCur.slice(0,-1);else{cCur='0';cNew=true;}cDisp();}
});

// ===== PWA =====
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredPrompt=e;
  if(!localStorage.getItem('et_inst_dis')){
    setTimeout(()=>{
      if(document.getElementById('app-screen').style.display==='block')
        document.getElementById('install-banner').style.display='flex';
    },3000);
  }
  detectInstall();
});
function detectInstall(){
  const isInst=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
  const isSaf=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const ic=document.getElementById('install-card');
  const ioc=document.getElementById('ios-card');
  const iac=document.getElementById('installed-card');
  if(!ic)return;
  if(isInst){ic.style.display='none';if(ioc)ioc.style.display='none';iac.style.display='block';document.getElementById('install-banner').style.display='none';}
  else if(isIOS&&isSaf){ic.style.display='none';if(ioc)ioc.style.display='block';}
  else{ic.style.display='block';}
}
window.doInstall=async()=>{
  if(deferredPrompt){
    deferredPrompt.prompt();
    const{outcome}=await deferredPrompt.userChoice;
    if(outcome==='accepted'){
      showToast('App installed! 🎉','ok');
      document.getElementById('install-card').style.display='none';
      document.getElementById('installed-card').style.display='block';
    }
    deferredPrompt=null;
  }else{
    showToast('Look for ⊕ icon in browser address bar','ok');
  }
  document.getElementById('install-banner').style.display='none';
};
window.dismissBanner=()=>{
  document.getElementById('install-banner').style.display='none';
  localStorage.setItem('et_inst_dis','1');
};
window.addEventListener('appinstalled',()=>{
  document.getElementById('install-banner').style.display='none';
  document.getElementById('install-card').style.display='none';
  document.getElementById('installed-card').style.display='block';
  showToast('App installed! 🎉','ok');
});
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').then(()=>setTimeout(detectInstall,800)).catch(()=>{});
}
setTimeout(detectInstall,1000);
