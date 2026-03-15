import * as SQLite from 'expo-sqlite';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Account {
  id: number;
  name: string;
  balance: number;
  is_active: number;
}

export interface Category {
  id: number;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  icon_name: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  category_id: number;
  amount: number;
  transaction_date: string;
  note: string;
}

export interface TransactionWithDetails extends Transaction {
  account_name: string;
  category_name: string;
  category_type: 'INCOME' | 'EXPENSE';
  category_icon: string;
}

// ─── DB Initialisation ───────────────────────────────────────────────────────

export async function initDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      balance    INTEGER NOT NULL DEFAULT 0,
      is_active  INTEGER NOT NULL DEFAULT 1
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT    NOT NULL,
      type      TEXT    NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
      icon_name TEXT    NOT NULL DEFAULT 'attach-money'
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id       INTEGER NOT NULL REFERENCES accounts(id),
      category_id      INTEGER NOT NULL REFERENCES categories(id),
      amount           INTEGER NOT NULL,
      transaction_date TEXT    NOT NULL,
      note             TEXT    NOT NULL DEFAULT ''
    );
  `);

  // Seed default account if none exists
  const accountCount = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM accounts');
  if (accountCount && accountCount.cnt === 0) {
    await db.runAsync(
      'INSERT INTO accounts (name, balance) VALUES (?, ?)',
      'Cash', 0
    );
  }

  // Seed default categories if none exist
  const catCount = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM categories');
  if (catCount && catCount.cnt === 0) {
    const defaults: [string, string, string][] = [
      ['Salary', 'INCOME', 'account-balance-wallet'],
      ['Sales', 'INCOME', 'storefront'],
      ['Freelance', 'INCOME', 'work'],
      ['Other Income', 'INCOME', 'add-circle'],
      ['Food', 'EXPENSE', 'restaurant'],
      ['Transport', 'EXPENSE', 'directions-car'],
      ['Rent', 'EXPENSE', 'home'],
      ['Utilities', 'EXPENSE', 'bolt'],
      ['Shopping', 'EXPENSE', 'shopping-cart'],
      ['Entertainment', 'EXPENSE', 'movie'],
      ['Health', 'EXPENSE', 'local-hospital'],
      ['Other Expense', 'EXPENSE', 'more-horiz'],
    ];
    for (const [name, type, icon] of defaults) {
      await db.runAsync(
        'INSERT INTO categories (name, type, icon_name) VALUES (?, ?, ?)',
        name, type, icon
      );
    }
  }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function getAccounts(db: SQLite.SQLiteDatabase): Promise<Account[]> {
  return db.getAllAsync<Account>('SELECT * FROM accounts WHERE is_active = 1 ORDER BY id');
}

export async function getAllAccounts(db: SQLite.SQLiteDatabase): Promise<Account[]> {
  return db.getAllAsync<Account>('SELECT * FROM accounts ORDER BY id');
}

export async function addAccount(db: SQLite.SQLiteDatabase, name: string): Promise<number> {
  const result = await db.runAsync('INSERT INTO accounts (name) VALUES (?)', name);
  return result.lastInsertRowId;
}

export async function updateAccount(db: SQLite.SQLiteDatabase, id: number, name: string): Promise<void> {
  await db.runAsync('UPDATE accounts SET name = ? WHERE id = ?', name, id);
}

export async function toggleAccountActive(db: SQLite.SQLiteDatabase, id: number, isActive: boolean): Promise<void> {
  await db.runAsync('UPDATE accounts SET is_active = ? WHERE id = ?', isActive ? 1 : 0, id);
}

function recalcAccountBalance(db: SQLite.SQLiteDatabase, accountId: number): Promise<void> {
  return db.runAsync(
    `UPDATE accounts SET balance = (
      SELECT COALESCE(SUM(
        CASE WHEN c.type = 'INCOME' THEN t.amount ELSE -t.amount END
      ), 0)
      FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.account_id = ?
    ) WHERE id = ?`,
    accountId, accountId
  ).then(() => {});
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(db: SQLite.SQLiteDatabase): Promise<Category[]> {
  return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY type, name');
}

export async function getCategoriesByType(db: SQLite.SQLiteDatabase, type: 'INCOME' | 'EXPENSE'): Promise<Category[]> {
  return db.getAllAsync<Category>('SELECT * FROM categories WHERE type = ? ORDER BY name', type);
}

export async function addCategory(db: SQLite.SQLiteDatabase, name: string, type: 'INCOME' | 'EXPENSE', iconName: string): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO categories (name, type, icon_name) VALUES (?, ?, ?)',
    name, type, iconName
  );
  return result.lastInsertRowId;
}

export async function updateCategory(db: SQLite.SQLiteDatabase, id: number, name: string, type: 'INCOME' | 'EXPENSE', iconName: string): Promise<void> {
  await db.runAsync(
    'UPDATE categories SET name = ?, type = ?, icon_name = ? WHERE id = ?',
    name, type, iconName, id
  );
}

export async function deleteCategory(db: SQLite.SQLiteDatabase, id: number): Promise<boolean> {
  const used = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM transactions WHERE category_id = ?', id
  );
  if (used && used.cnt > 0) return false;
  await db.runAsync('DELETE FROM categories WHERE id = ?', id);
  return true;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(
  db: SQLite.SQLiteDatabase,
  limit: number = 50,
  offset: number = 0,
): Promise<TransactionWithDetails[]> {
  return db.getAllAsync<TransactionWithDetails>(
    `SELECT t.*, a.name as account_name, c.name as category_name, c.type as category_type, c.icon_name as category_icon
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     JOIN categories c ON c.id = t.category_id
     ORDER BY t.transaction_date DESC, t.id DESC
     LIMIT ? OFFSET ?`,
    limit, offset
  );
}

export async function getTransactionsByDateRange(
  db: SQLite.SQLiteDatabase,
  from: string,
  to: string,
): Promise<TransactionWithDetails[]> {
  return db.getAllAsync<TransactionWithDetails>(
    `SELECT t.*, a.name as account_name, c.name as category_name, c.type as category_type, c.icon_name as category_icon
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     JOIN categories c ON c.id = t.category_id
     WHERE t.transaction_date >= ? AND t.transaction_date <= ?
     ORDER BY t.transaction_date DESC, t.id DESC`,
    from, to
  );
}

export async function addTransaction(
  db: SQLite.SQLiteDatabase,
  accountId: number,
  categoryId: number,
  amount: number,
  transactionDate: string,
  note: string,
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO transactions (account_id, category_id, amount, transaction_date, note) VALUES (?, ?, ?, ?, ?)',
    accountId, categoryId, amount, transactionDate, note
  );
  await recalcAccountBalance(db, accountId);
  return result.lastInsertRowId;
}

export async function updateTransaction(
  db: SQLite.SQLiteDatabase,
  id: number,
  accountId: number,
  categoryId: number,
  amount: number,
  transactionDate: string,
  note: string,
): Promise<void> {
  // Get old account to recalc its balance too
  const old = await db.getFirstAsync<{ account_id: number }>('SELECT account_id FROM transactions WHERE id = ?', id);
  await db.runAsync(
    'UPDATE transactions SET account_id = ?, category_id = ?, amount = ?, transaction_date = ?, note = ? WHERE id = ?',
    accountId, categoryId, amount, transactionDate, note, id
  );
  await recalcAccountBalance(db, accountId);
  if (old && old.account_id !== accountId) {
    await recalcAccountBalance(db, old.account_id);
  }
}

export async function deleteTransaction(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  const old = await db.getFirstAsync<{ account_id: number }>('SELECT account_id FROM transactions WHERE id = ?', id);
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
  if (old) await recalcAccountBalance(db, old.account_id);
}

// ─── Dashboard Queries ───────────────────────────────────────────────────────

export interface DashboardSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
}

export async function getDashboardSummary(
  db: SQLite.SQLiteDatabase,
  from: string,
  to: string,
): Promise<DashboardSummary> {
  const result = await db.getFirstAsync<{ income: number; expense: number }>(
    `SELECT
      COALESCE(SUM(CASE WHEN c.type = 'INCOME' THEN t.amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN c.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) as expense
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.transaction_date >= ? AND t.transaction_date <= ?`,
    from, to
  );
  return {
    totalIncome: result?.income ?? 0,
    totalExpense: result?.expense ?? 0,
    netBalance: (result?.income ?? 0) - (result?.expense ?? 0),
  };
}

export interface CategorySummary {
  category_id: number;
  category_name: string;
  category_type: 'INCOME' | 'EXPENSE';
  icon_name: string;
  total: number;
}

export async function getCategorySummary(
  db: SQLite.SQLiteDatabase,
  from: string,
  to: string,
  type?: 'INCOME' | 'EXPENSE',
): Promise<CategorySummary[]> {
  const typeFilter = type ? ' AND c.type = ?' : '';
  const params: (string)[] = [from, to];
  if (type) params.push(type);

  return db.getAllAsync<CategorySummary>(
    `SELECT c.id as category_id, c.name as category_name, c.type as category_type, c.icon_name as icon_name,
      SUM(t.amount) as total
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.transaction_date >= ? AND t.transaction_date <= ?${typeFilter}
     GROUP BY c.id
     ORDER BY total DESC`,
    ...params
  );
}

export async function getRecentTransactions(
  db: SQLite.SQLiteDatabase,
  limit: number = 5,
): Promise<TransactionWithDetails[]> {
  return db.getAllAsync<TransactionWithDetails>(
    `SELECT t.*, a.name as account_name, c.name as category_name, c.type as category_type, c.icon_name as category_icon
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     JOIN categories c ON c.id = t.category_id
     ORDER BY t.transaction_date DESC, t.id DESC
     LIMIT ?`,
    limit
  );
}

// ─── Backup / Restore ─────────────────────────────────────────────────────────

export async function getAllDataForBackup(db: SQLite.SQLiteDatabase) {
  const [accounts, categories, transactions] = await Promise.all([
    db.getAllAsync('SELECT * FROM accounts'),
    db.getAllAsync('SELECT * FROM categories'),
    db.getAllAsync('SELECT * FROM transactions'),
  ]);
  return { accounts, categories, transactions };
}

export function isValidBackup(data: any): boolean {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.accounts) &&
    Array.isArray(data.categories) &&
    Array.isArray(data.transactions)
  );
}

export async function restoreFromBackupData(
  db: SQLite.SQLiteDatabase,
  data: any,
): Promise<{ accounts: number; categories: number; transactions: number }> {
  // Clear existing data
  await db.execAsync('DELETE FROM transactions');
  await db.execAsync('DELETE FROM categories');
  await db.execAsync('DELETE FROM accounts');

  // Restore accounts
  for (const a of data.accounts) {
    await db.runAsync(
      'INSERT INTO accounts (id, name, balance, is_active) VALUES (?, ?, ?, ?)',
      a.id, a.name, a.balance ?? 0, a.is_active ?? 1
    );
  }

  // Restore categories
  for (const c of data.categories) {
    await db.runAsync(
      'INSERT INTO categories (id, name, type, icon_name) VALUES (?, ?, ?, ?)',
      c.id, c.name, c.type, c.icon_name ?? 'attach-money'
    );
  }

  // Restore transactions
  for (const t of data.transactions) {
    await db.runAsync(
      'INSERT INTO transactions (id, account_id, category_id, amount, transaction_date, note) VALUES (?, ?, ?, ?, ?, ?)',
      t.id, t.account_id, t.category_id, t.amount, t.transaction_date, t.note ?? ''
    );
  }

  // Recalc all account balances
  const accounts = await db.getAllAsync<{ id: number }>('SELECT id FROM accounts');
  for (const a of accounts) {
    await recalcAccountBalance(db, a.id);
  }

  return {
    accounts: data.accounts.length,
    categories: data.categories.length,
    transactions: data.transactions.length,
  };
}
