import {
  auth,
  db,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch
} from './firebase.js';

const authCard = document.getElementById('authCard');
const trackerSection = document.getElementById('trackerSection');
const authForm = document.getElementById('authForm');
const authTabs = document.querySelectorAll('.auth-tab');
const authTitle = document.getElementById('authTitle');
const authSubmit = document.getElementById('authSubmit');
const authMessage = document.getElementById('authMessage');
const authNameField = document.getElementById('authName');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authConfirmPassword = document.getElementById('authConfirmPassword');
const userPanel = document.getElementById('userPanel');
const userName = document.getElementById('userName');
const logoutButton = document.getElementById('logoutButton');
const expenseForm = document.getElementById('expenseForm');
const expenseName = document.getElementById('expenseName');
const expenseAmount = document.getElementById('expenseAmount');
const expenseCurrency = document.getElementById('expenseCurrency');
const expenseList = document.getElementById('expenseList');
const dailyTotal = document.getElementById('dailyTotal');
const dailyCount = document.getElementById('dailyCount');
const currentDate = document.getElementById('currentDate');
const clearAllButton = document.getElementById('clearAll');
const searchInput = document.getElementById('searchInput');
const historyHint = document.getElementById('historyHint');

let expenses = [];
let currentTab = 'login';
let currentUser = null;

function formatCurrency(value, symbol) {
  return `${symbol}${Number(value).toFixed(2)}`;
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTime(date) {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isSameDay(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate();
}

function isToday(date) {
  return isSameDay(date, new Date());
}

function isYesterday(date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

function renderDate() {
  currentDate.textContent = formatDate(new Date());
}

function setAuthMode(mode) {
  currentTab = mode;
  authTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.auth === mode);
  });

  if (mode === 'signup') {
    authCard.classList.add('active-signup');
    authTitle.textContent = 'Create account';
    authSubmit.textContent = 'Create account';
    authMessage.textContent = 'Sign up once and keep your expenses safe.';
  } else {
    authCard.classList.remove('active-signup');
    authTitle.textContent = 'Login to continue';
    authSubmit.textContent = 'Login';
    authMessage.textContent = 'Use your email and password to keep tracking.';
  }
}

function showAuthFeedback(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle('error', isError);
}

function clearAuthFields() {
  authNameField.value = '';
  authEmail.value = '';
  authPassword.value = '';
  authConfirmPassword.value = '';
}

async function loadExpenses() {
  if (!currentUser) {
    expenses = [];
    renderExpenses();
    return;
  }

  try {
    const expenseQuery = query(
      collection(db, 'expenses'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAtMs', 'desc')
    );
    const snapshot = await getDocs(expenseQuery);
    expenses = snapshot.docs.map((snapshotItem) => ({
      id: snapshotItem.id,
      ...snapshotItem.data()
    }));
  } catch (error) {
    console.error('Failed to load expenses:', error);
    expenses = [];
  }

  renderExpenses();
}

function buildExpenseItem(expense) {
  const row = document.createElement('div');
  row.className = 'expense-row';

  const info = document.createElement('div');
  const name = document.createElement('p');
  name.className = 'expense-name';
  name.textContent = expense.name;

  const meta = document.createElement('p');
  meta.className = 'expense-meta';
  meta.textContent = `${expense.dateString} • ${expense.timeString}`;

  info.appendChild(name);
  info.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'expense-actions';

  const amount = document.createElement('p');
  amount.className = 'expense-amount';
  amount.textContent = formatCurrency(expense.amount, expense.currency);

  const deleteButton = document.createElement('button');
  deleteButton.className = 'delete-btn';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', async () => {
    await deleteDoc(doc(db, 'expenses', expense.id));
    await loadExpenses();
  });

  actions.appendChild(amount);
  actions.appendChild(deleteButton);
  row.appendChild(info);
  row.appendChild(actions);

  return row;
}

function renderGroup(title, items) {
  if (!items.length) {
    return null;
  }

  const group = document.createElement('div');
  group.className = 'expense-group';

  const header = document.createElement('div');
  header.className = 'group-header';

  const titleElement = document.createElement('p');
  titleElement.className = 'group-title';
  titleElement.textContent = title;

  const metaElement = document.createElement('p');
  metaElement.className = 'group-meta';
  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
  const currency = items[0]?.currency || '$';
  metaElement.textContent = `${items.length} expense${items.length === 1 ? '' : 's'} • ${formatCurrency(total, currency)}`;

  header.appendChild(titleElement);
  header.appendChild(metaElement);
  group.appendChild(header);

  const list = document.createElement('div');
  list.className = 'group-list';
  items.forEach((expense) => list.appendChild(buildExpenseItem(expense)));
  group.appendChild(list);

  return group;
}

function renderExpenses() {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = expenses.filter((expense) => {
    if (!term) {
      return true;
    }

    const searchFields = [expense.name, expense.currency, expense.dateString, expense.timeString, expense.amount].join(' ').toLowerCase();
    return searchFields.includes(term);
  });

  const grouped = {
    today: [],
    yesterday: [],
    older: []
  };

  filtered.forEach((expense) => {
    const timestamp = new Date(expense.createdAtMs);
    if (isToday(timestamp)) {
      grouped.today.push(expense);
    } else if (isYesterday(timestamp)) {
      grouped.yesterday.push(expense);
    } else {
      grouped.older.push(expense);
    }
  });

  const todayTotal = grouped.today.reduce((sum, expense) => sum + Number(expense.amount), 0);
  dailyTotal.textContent = formatCurrency(todayTotal, expenses[0]?.currency || '$');
  dailyCount.textContent = `${grouped.today.length} expense${grouped.today.length === 1 ? '' : 's'} today`;

  expenseList.innerHTML = '';

  if (!filtered.length) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No expenses match this search or you have not added any yet.';
    expenseList.appendChild(emptyState);
  } else {
    const todaySection = renderGroup('Today', grouped.today);
    const yesterdaySection = renderGroup('Yesterday', grouped.yesterday);
    const olderSection = renderGroup('Older dates', grouped.older);

    if (todaySection) expenseList.appendChild(todaySection);
    if (yesterdaySection) expenseList.appendChild(yesterdaySection);
    if (olderSection) expenseList.appendChild(olderSection);
  }

  clearAllButton.disabled = expenses.length === 0;
}

async function handleAddExpense(event) {
  event.preventDefault();

  const name = expenseName.value.trim();
  const amountValue = Number(expenseAmount.value);
  const currency = expenseCurrency.value;

  if (!name || !amountValue || amountValue <= 0) {
    expenseAmount.focus();
    return;
  }

  const now = new Date();
  const expenseData = {
    userId: currentUser.uid,
    name,
    amount: amountValue.toFixed(2),
    currency,
    dateString: formatDate(now),
    timeString: formatTime(now),
    createdAtMs: Date.now(),
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, 'expenses'), expenseData);
    expenseForm.reset();
    expenseAmount.value = '';
    expenseName.focus();
    await loadExpenses();
  } catch (error) {
    console.error('Failed to save expense:', error);
  }
}

async function handleClearAll() {
  if (!currentUser || !expenses.length) {
    return;
  }

  const confirmed = confirm('Clear all expenses and reset history?');
  if (!confirmed) {
    return;
  }

  const batch = writeBatch(db);
  expenses.forEach((item) => {
    batch.delete(doc(db, 'expenses', item.id));
  });

  try {
    await batch.commit();
    await loadExpenses();
  } catch (error) {
    console.error('Failed to clear expenses:', error);
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  clearAuthFields && authMessage.classList.remove('error');

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    showAuthFeedback('Please enter your email and password.', true);
    return;
  }

  if (currentTab === 'signup') {
    const name = authNameField.value.trim();
    const confirmPassword = authConfirmPassword.value;

    if (!name) {
      showAuthFeedback('Enter your full name to sign up.', true);
      return;
    }

    if (password !== confirmPassword) {
      showAuthFeedback('Passwords do not match.', true);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: name });
      clearAuthFields();
    } catch (error) {
      showAuthFeedback(error.message || 'Signup failed. Please try again.', true);
    }
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    clearAuthFields();
  } catch (error) {
    showAuthFeedback(error.message || 'Login failed. Please try again.', true);
  }
}

function updateAuthState(user) {
  currentUser = user;

  if (user) {
    userPanel.classList.remove('hidden');
    trackerSection.classList.remove('hidden');
    authCard.classList.add('hidden');
    userName.textContent = user.displayName || user.email;
    historyHint.textContent = 'Newest expenses are shown first and grouped by date.';
    loadExpenses();
  } else {
    userPanel.classList.add('hidden');
    trackerSection.classList.add('hidden');
    authCard.classList.remove('hidden');
    expenses = [];
    renderExpenses();
  }
}

authTabs.forEach((tab) => {
  tab.addEventListener('click', () => setAuthMode(tab.dataset.auth));
});

authForm.addEventListener('submit', handleAuthSubmit);
logoutButton.addEventListener('click', async () => {
  await signOut(auth);
});
expenseForm.addEventListener('submit', handleAddExpense);
clearAllButton.addEventListener('click', handleClearAll);
searchInput.addEventListener('input', renderExpenses);

renderDate();
setAuthMode('login');

onAuthStateChanged(auth, (user) => {
  updateAuthState(user);
});
