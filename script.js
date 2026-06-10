const form = document.getElementById('expenseForm');
const nameInput = document.getElementById('expenseName');
const amountInput = document.getElementById('expenseAmount');
const currencySelect = document.getElementById('expenseCurrency');
const expenseList = document.getElementById('expenseList');
const totalAmount = document.getElementById('totalAmount');
const clearAllButton = document.getElementById('clearAll');
const STORAGE_KEY = 'expense_tracker_history_v1';

let expenses = [];

function formatCurrency(value, symbol) {
  return `${symbol}${Number(value).toFixed(2)}`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function saveExpenses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function loadExpenses() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      expenses = JSON.parse(stored);
    } catch (error) {
      expenses = [];
    }
  }
}

function updateTotal() {
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const symbol = expenses.length ? expenses[0].currency : '$';
  totalAmount.textContent = formatCurrency(total, symbol);
}

function renderExpenses() {
  expenseList.innerHTML = '';

  if (!expenses.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No expenses yet. Add one to begin tracking.';
    expenseList.appendChild(empty);
    updateTotal();
    return;
  }

  expenses.slice().reverse().forEach((expense) => {
    const item = document.createElement('div');
    item.className = 'expense-item';

    const meta = document.createElement('div');
    meta.className = 'expense-meta';

    const name = document.createElement('p');
    name.className = 'expense-name';
    name.textContent = expense.name;

    const date = document.createElement('p');
    date.className = 'expense-date';
    date.textContent = formatDate(expense.createdAt);

    const amount = document.createElement('p');
    amount.className = 'expense-amount';
    amount.textContent = formatCurrency(expense.amount, expense.currency);

    meta.appendChild(name);
    meta.appendChild(date);

    const actionGroup = document.createElement('div');
    actionGroup.appendChild(amount);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = 'Delete';
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => {
      expenses = expenses.filter((entry) => entry.id !== expense.id);
      saveExpenses();
      renderExpenses();
    });

    actionGroup.appendChild(deleteButton);

    item.appendChild(meta);
    item.appendChild(actionGroup);

    expenseList.appendChild(item);
  });

  updateTotal();
}

function clearHistory() {
  expenses = [];
  saveExpenses();
  renderExpenses();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const amount = Number(amountInput.value);
  const currency = currencySelect.value;

  if (!name || !amount || amount <= 0) {
    amountInput.focus();
    return;
  }

  expenses.push({
    id: Date.now() + Math.random(),
    name,
    amount: amount.toFixed(2),
    currency,
    createdAt: Date.now()
  });

  saveExpenses();
  renderExpenses();

  form.reset();
  amountInput.value = '';
  nameInput.focus();
});

clearAllButton.addEventListener('click', () => {
  if (confirm('Clear all expenses and reset history?')) {
    clearHistory();
  }
});

loadExpenses();
renderExpenses();
