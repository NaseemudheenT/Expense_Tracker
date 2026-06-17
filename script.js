import {
    auth,
    db,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    deleteDoc,
    doc,
    setDoc,
    getDoc,
    writeBatch
} from './firebase.js';

let currentUser = null;
let currentCurrency = 'INR';
let currentCurrencySymbol = '₹';
let deleteTargetId = null;

const currencySymbols = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
    'AUD': 'A$',
    'CAD': 'C$'
};

const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');

const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const switchToSignup = document.getElementById('switchToSignup');
const switchToLogin = document.getElementById('switchToLogin');

const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const loginLoading = document.getElementById('loginLoading');

const signupName = document.getElementById('signupName');
const signupEmail = document.getElementById('signupEmail');
const signupPassword = document.getElementById('signupPassword');
const signupConfirm = document.getElementById('signupConfirm');
const signupBtn = document.getElementById('signupBtn');
const signupError = document.getElementById('signupError');
const signupLoading = document.getElementById('signupLoading');

const userName = document.getElementById('userName');
const logoutBtn = document.getElementById('logoutBtn');
const themeToggle = document.getElementById('themeToggle');

const currencySelect = document.getElementById('currencySelect');
const currencySymbol = document.getElementById('currencySymbol');
const currencyDisplay = document.getElementById('currencyDisplay');

const expenseName = document.getElementById('expenseName');
const expenseAmount = document.getElementById('expenseAmount');
const addExpenseBtn = document.getElementById('addExpenseBtn');
const addExpenseMessage = document.getElementById('addExpenseMessage');

const todayTotal = document.getElementById('todayTotal');
const todayCount = document.getElementById('todayCount');

const todayGroup = document.getElementById('todayGroup');
const yesterdayGroup = document.getElementById('yesterdayGroup');
const olderGroup = document.getElementById('olderGroup');
const emptyState = document.getElementById('emptyState');

const todayList = document.getElementById('todayList');
const yesterdayList = document.getElementById('yesterdayList');
const olderList = document.getElementById('olderList');

const clearAllBtn = document.getElementById('clearAllBtn');

const deleteModal = document.getElementById('deleteModal');
const deleteMessage = document.getElementById('deleteMessage');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

const clearAllModal = document.getElementById('clearAllModal');
const cancelClearBtn = document.getElementById('cancelClearBtn');
const confirmClearBtn = document.getElementById('confirmClearBtn');

const toast = document.getElementById('toast');

const currentDate = document.getElementById('currentDate');
const currentDay = document.getElementById('currentDay');

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function updateCurrentDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const dayName = days[now.getDay()];

    currentDate.textContent = `${day} ${month} ${year}`;
    currentDay.textContent = dayName;
}

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    return `${day} ${month}`;
}

function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
}

function isYesterday(date) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear();
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
    });
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateSignup() {
    clearErrors();
    let isValid = true;

    if (signupName.value.trim().length < 2) {
        document.getElementById('signupNameError').textContent = 'Name must be at least 2 characters';
        isValid = false;
    }

    if (!validateEmail(signupEmail.value)) {
        document.getElementById('signupEmailError').textContent = 'Please enter a valid email';
        isValid = false;
    }

    if (signupPassword.value.length < 6) {
        document.getElementById('signupPasswordError').textContent = 'Password must be at least 6 characters';
        isValid = false;
    }

    if (signupPassword.value !== signupConfirm.value) {
        document.getElementById('signupConfirmError').textContent = 'Passwords do not match';
        isValid = false;
    }

    return isValid;
}

function validateLogin() {
    clearErrors();
    let isValid = true;

    if (!validateEmail(loginEmail.value)) {
        document.getElementById('loginEmailError').textContent = 'Please enter a valid email';
        isValid = false;
    }

    if (loginPassword.value.length < 6) {
        document.getElementById('loginPasswordError').textContent = 'Password must be at least 6 characters';
        isValid = false;
    }

    return isValid;
}

switchToSignup.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.remove('active');
    signupForm.classList.add('active');
    clearErrors();
    loginError.classList.remove('show');
    signupError.classList.remove('show');
});

switchToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    signupForm.classList.remove('active');
    loginForm.classList.add('active');
    clearErrors();
    loginError.classList.remove('show');
    signupError.classList.remove('show');
});

signupBtn.addEventListener('click', async () => {
    if (!validateSignup()) return;

    signupLoading.style.display = 'flex';
    signupError.classList.remove('show');

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, signupEmail.value, signupPassword.value);
        const user = userCredential.user;

        await setDoc(doc(db, 'users', user.uid), {
            name: signupName.value,
            email: signupEmail.value,
            createdAt: new Date(),
            preferences: {
                currency: 'INR'
            }
        });

        signupName.value = '';
        signupEmail.value = '';
        signupPassword.value = '';
        signupConfirm.value = '';
        showToast('Account created successfully!', 'success');
    } catch (error) {
        let errorMessage = 'An error occurred';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already in use';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        }
        signupError.textContent = errorMessage;
        signupError.classList.add('show');
    } finally {
        signupLoading.style.display = 'none';
    }
});

loginBtn.addEventListener('click', async () => {
    if (!validateLogin()) return;

    loginLoading.style.display = 'flex';
    loginError.classList.remove('show');

    try {
        await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
        loginEmail.value = '';
        loginPassword.value = '';
    } catch (error) {
        let errorMessage = 'An error occurred';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid email or password';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Too many login attempts. Try again later';
        }
        loginError.textContent = errorMessage;
        loginError.classList.add('show');
    } finally {
        loginLoading.style.display = 'none';
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        showToast('Error logging out', 'error');
    }
});

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
});

currencySelect.addEventListener('change', () => {
    currentCurrency = currencySelect.value;
    currentCurrencySymbol = currencySymbols[currentCurrency];
    currencySymbol.textContent = currentCurrencySymbol;
    currencyDisplay.textContent = currentCurrencySymbol;
    localStorage.setItem('selectedCurrency', currentCurrency);
});

function validateExpenseForm() {
    clearErrors();
    let isValid = true;

    if (expenseName.value.trim().length === 0) {
        document.getElementById('expenseNameError').textContent = 'Expense name is required';
        isValid = false;
    }

    if (expenseAmount.value === '' || parseFloat(expenseAmount.value) <= 0) {
        document.getElementById('expenseAmountError').textContent = 'Please enter a valid amount';
        isValid = false;
    }

    return isValid;
}

addExpenseBtn.addEventListener('click', async () => {
    if (!currentUser) {
        showToast('Please login first', 'error');
        return;
    }

    if (!validateExpenseForm()) return;

    addExpenseBtn.disabled = true;
    addExpenseMessage.textContent = 'Adding expense...';
    addExpenseMessage.className = 'form-message';

    try {
        const now = new Date();
        const expenseData = {
            name: expenseName.value.trim(),
            amount: parseFloat(expenseAmount.value),
            currency: currentCurrency,
            date: now,
            timestamp: now.getTime(),
            time: formatTime(now)
        };

        await addDoc(collection(db, 'users', currentUser.uid, 'expenses'), expenseData);

        expenseName.value = '';
        expenseAmount.value = '';
        addExpenseMessage.textContent = 'Expense added successfully!';
        addExpenseMessage.className = 'form-message success';
        showToast('Expense added successfully!', 'success');

        setTimeout(() => {
            addExpenseMessage.textContent = '';
            addExpenseMessage.className = 'form-message';
        }, 2000);

        loadExpenses();
    } catch (error) {
        addExpenseMessage.textContent = 'Error adding expense';
        addExpenseMessage.className = 'form-message error';
    } finally {
        addExpenseBtn.disabled = false;
    }
});

async function loadExpenses() {
    if (!currentUser) return;

    try {
        const q = query(collection(db, 'users', currentUser.uid, 'expenses'));
        const querySnapshot = await getDocs(q);

        const expenses = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            expenses.push({
                id: doc.id,
                ...data,
                date: data.date ? new Date(data.date.seconds * 1000) : new Date()
            });
        });

        expenses.sort((a, b) => b.date - a.date);

        displayExpenses(expenses);
    } catch (error) {
        console.error('Error loading expenses:', error);
    }
}

function displayExpenses(expenses) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayExpenses = [];
    const yesterdayExpenses = [];
    const olderExpenses = [];

    let todayTotal = 0;
    let todayExpenseCount = 0;

    expenses.forEach(expense => {
        const expenseDate = new Date(expense.date);
        expenseDate.setHours(0, 0, 0, 0);

        if (expenseDate.getTime() === today.getTime()) {
            todayExpenses.push(expense);
            todayTotal += expense.amount;
            todayExpenseCount++;
        } else if (expenseDate.getTime() === yesterday.getTime()) {
            yesterdayExpenses.push(expense);
        } else {
            olderExpenses.push(expense);
        }
    });

    document.getElementById('todayTotal').textContent = todayTotal.toFixed(2);
    document.getElementById('todayCount').textContent = todayExpenseCount;

    renderExpenseGroup(todayExpenses, todayGroup, todayList, 'todayDate', 'todayGroupTotal', 'todayGroupCount');
    renderExpenseGroup(yesterdayExpenses, yesterdayGroup, yesterdayList, 'yesterdayDate', 'yesterdayGroupTotal', 'yesterdayGroupCount');
    renderExpenseGroup(olderExpenses, olderGroup, olderList, null, 'olderGroupTotal', 'olderGroupCount');

    if (expenses.length === 0) {
        emptyState.style.display = 'flex';
        todayGroup.style.display = 'none';
        yesterdayGroup.style.display = 'none';
        olderGroup.style.display = 'none';
    } else {
        emptyState.style.display = 'none';
    }
}

function renderExpenseGroup(expenses, groupElement, listElement, dateElementId, totalElementId, countElementId) {
    if (expenses.length === 0) {
        groupElement.style.display = 'none';
        return;
    }

    listElement.innerHTML = '';
    let groupTotal = 0;

    expenses.forEach(expense => {
        groupTotal += expense.amount;

        const expenseItem = document.createElement('div');
        expenseItem.className = 'expense-item';

        const categoryEmoji = getCategoryEmoji(expense.name);

        expenseItem.innerHTML = `
            <div class="expense-item-left">
                <div class="expense-icon">${categoryEmoji}</div>
                <div class="expense-details">
                    <div class="expense-name">${escapeHtml(expense.name)}</div>
                    <div class="expense-time">${formatTime(expense.date)}</div>
                </div>
            </div>
            <div class="expense-item-right">
                <div class="expense-amount">${currentCurrencySymbol} ${expense.amount.toFixed(2)}</div>
                <button class="delete-expense-btn" data-id="${expense.id}">🗑️</button>
            </div>
        `;

        listElement.appendChild(expenseItem);
    });

    if (dateElementId) {
        const dateSpan = document.getElementById(dateElementId);
        if (dateSpan && expenses.length > 0) {
            dateSpan.textContent = formatDate(expenses[0].date);
        }
    }

    document.getElementById(totalElementId).textContent = `${currentCurrencySymbol} ${groupTotal.toFixed(2)}`;
    document.getElementById(countElementId).textContent = expenses.length;

    groupElement.style.display = 'block';

    listElement.querySelectorAll('.delete-expense-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            deleteTargetId = e.target.closest('.delete-expense-btn').dataset.id;
            deleteMessage.textContent = 'Are you sure you want to delete this expense?';
            deleteModal.style.display = 'flex';
        });
    });
}

function getCategoryEmoji(name) {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('food') || nameLower.includes('meal') || nameLower.includes('lunch') || nameLower.includes('dinner') || nameLower.includes('breakfast') || nameLower.includes('eat')) return '🍽️';
    if (nameLower.includes('taxi') || nameLower.includes('car') || nameLower.includes('bus') || nameLower.includes('travel') || nameLower.includes('transport')) return '🚕';
    if (nameLower.includes('movie') || nameLower.includes('entertainment') || nameLower.includes('book') || nameLower.includes('game')) return '🎬';
    if (nameLower.includes('shop') || nameLower.includes('buy') || nameLower.includes('cloth') || nameLower.includes('dress')) return '🛍️';
    if (nameLower.includes('health') || nameLower.includes('medicine') || nameLower.includes('doctor')) return '⚕️';
    if (nameLower.includes('coffee') || nameLower.includes('drink') || nameLower.includes('tea')) return '☕';
    if (nameLower.includes('snack') || nameLower.includes('chips') || nameLower.includes('candy')) return '🍿';
    if (nameLower.includes('grocery') || nameLower.includes('shop')) return '🛒';
    return '💰';
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal.querySelector('.modal-overlay')) {
        deleteModal.style.display = 'none';
    }
});

cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.style.display = 'none';
    deleteTargetId = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!currentUser || !deleteTargetId) return;

    try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'expenses', deleteTargetId));
        showToast('Expense deleted successfully', 'success');
        deleteModal.style.display = 'none';
        deleteTargetId = null;
        loadExpenses();
    } catch (error) {
        showToast('Error deleting expense', 'error');
    }
});

clearAllBtn.addEventListener('click', () => {
    clearAllModal.style.display = 'flex';
});

clearAllModal.addEventListener('click', (e) => {
    if (e.target === clearAllModal.querySelector('.modal-overlay')) {
        clearAllModal.style.display = 'none';
    }
});

cancelClearBtn.addEventListener('click', () => {
    clearAllModal.style.display = 'none';
});

confirmClearBtn.addEventListener('click', async () => {
    if (!currentUser) return;

    confirmClearBtn.disabled = true;

    try {
        const q = query(collection(db, 'users', currentUser.uid, 'expenses'));
        const querySnapshot = await getDocs(q);

        const batch = writeBatch(db);
        querySnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        showToast('All expenses cleared', 'success');
        clearAllModal.style.display = 'none';
        loadExpenses();
    } catch (error) {
        showToast('Error clearing expenses', 'error');
    } finally {
        confirmClearBtn.disabled = false;
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                userName.textContent = userData.name || user.email;
                if (userData.preferences && userData.preferences.currency) {
                    currentCurrency = userData.preferences.currency;
                    currencySelect.value = currentCurrency;
                }
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        }

        const savedCurrency = localStorage.getItem('selectedCurrency') || 'INR';
        currentCurrency = savedCurrency;
        currencySelect.value = currentCurrency;
        currentCurrencySymbol = currencySymbols[currentCurrency];
        currencySymbol.textContent = currentCurrencySymbol;
        currencyDisplay.textContent = currentCurrencySymbol;

        updateCurrentDate();
        loadExpenses();
    } else {
        currentUser = null;
        authContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    }
});

const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
}
