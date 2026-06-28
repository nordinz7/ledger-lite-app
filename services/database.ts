import { endOfDay, format, startOfDay } from 'date-fns';
import * as SQLite from 'expo-sqlite';
import { compact } from 'lodash';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Account {
  id: number;
  name: string;
  // Legacy free-text "household pocket" label. Superseded by account_groups + links;
  // kept only so older backups round-trip. Not used for new functionality.
  group_name: string | null;
  balance: number;
  is_active: number;
}

// Reusable tag-like grouping for accounts, e.g. "Cash", "Bank".
export interface AccountGroup {
  id: number;
  name: string;
}

export interface AccountWithGroups extends Account {
  groups: AccountGroup[];
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
  // Which of the account's groups this transaction is filed under (optional).
  group_id: number | null;
}

export interface Transfer {
  id: number;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  transaction_date: string;
  note: string;
}

export type LedgerType = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export interface TransactionWithDetails extends Transaction {
  account_name: string;
  category_name: string;
  category_type: LedgerType;
  category_icon: string;
  group_name: string | null;
  // 'TXN' for real income/expense rows, 'TRANSFER' for synthetic transfer rows
  kind: 'TXN' | 'TRANSFER';
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

  // Migration: add group_name to accounts (for grouping pockets by person, e.g. "Child", "Mum")
  const accountCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(accounts)');
  if (!accountCols.some(c => c.name === 'group_name')) {
    await db.execAsync('ALTER TABLE accounts ADD COLUMN group_name TEXT');
  }

  // Reusable account groups (tags) + many-to-many link to accounts.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS account_groups (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT    NOT NULL
    );
  `);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS account_group_links (
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      group_id   INTEGER NOT NULL REFERENCES account_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (account_id, group_id)
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

  // Fresh installs get group_id NOT NULL up front; existing DBs are migrated below.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id       INTEGER NOT NULL REFERENCES accounts(id),
      category_id      INTEGER NOT NULL REFERENCES categories(id),
      amount           INTEGER NOT NULL,
      transaction_date TEXT    NOT NULL,
      note             TEXT    NOT NULL DEFAULT '',
      group_id         INTEGER NOT NULL REFERENCES account_groups(id)
    );
  `);

  // Migration: add group_id to transactions (which of the account's groups a txn is filed under).
  // This runs exactly once per database, so we piggyback the one-time legacy import on it: fold
  // any old per-account group_name labels into account_groups + links. Tying it here (rather than
  // to "account_groups is empty") means deleting all groups later won't resurrect the legacy ones.
  const txnCols = await db.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
  if (!txnCols.some(c => c.name === 'group_id')) {
    // Existing DB upgrading from the pre-group schema: the column starts nullable here and is
    // backfilled + tightened to NOT NULL near the end of init (once the Cash group exists).
    await db.execAsync('ALTER TABLE transactions ADD COLUMN group_id INTEGER REFERENCES account_groups(id)');

    const legacy = await db.getAllAsync<{ id: number; group_name: string }>(
      "SELECT id, group_name FROM accounts WHERE group_name IS NOT NULL AND TRIM(group_name) != ''"
    );
    const idByName = new Map<string, number>();
    for (const row of legacy) {
      const name = row.group_name.trim();
      let gid = idByName.get(name.toLowerCase());
      if (gid === undefined) {
        const res = await db.runAsync('INSERT INTO account_groups (name) VALUES (?)', name);
        gid = res.lastInsertRowId;
        idByName.set(name.toLowerCase(), gid);
      }
      await db.runAsync('INSERT OR IGNORE INTO account_group_links (account_id, group_id) VALUES (?, ?)', row.id, gid);
    }
  }

  // Transfers move money between accounts. They are excluded from income/expense
  // totals but still adjust each account's balance.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transfers (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      from_account_id  INTEGER NOT NULL REFERENCES accounts(id),
      to_account_id    INTEGER NOT NULL REFERENCES accounts(id),
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

  // Groups are mandatory: ensure the default "Cash" group exists and every account is linked to at
  // least one group. Idempotent, so it also self-heals any account that ends up with no group.
  const cashId = await ensureDefaultGroups(db);

  // Enforce group_id NOT NULL on transactions. Fresh installs already have it (notnull === 1);
  // a DB upgraded above has a nullable column we backfill to Cash and then rebuild to NOT NULL.
  const txnColsNow = await db.getAllAsync<{ name: string; notnull: number }>('PRAGMA table_info(transactions)');
  const groupCol = txnColsNow.find(c => c.name === 'group_id');
  if (groupCol && groupCol.notnull === 0) {
    await db.runAsync('UPDATE transactions SET group_id = ? WHERE group_id IS NULL', cashId);
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    await db.execAsync('DROP TABLE IF EXISTS transactions_new;');
    await db.execAsync(`
      CREATE TABLE transactions_new (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id       INTEGER NOT NULL REFERENCES accounts(id),
        category_id      INTEGER NOT NULL REFERENCES categories(id),
        amount           INTEGER NOT NULL,
        transaction_date TEXT    NOT NULL,
        note             TEXT    NOT NULL DEFAULT '',
        group_id         INTEGER NOT NULL REFERENCES account_groups(id)
      );
    `);
    await db.execAsync(`
      INSERT INTO transactions_new (id, account_id, category_id, amount, transaction_date, note, group_id)
      SELECT id, account_id, category_id, amount, transaction_date, note, group_id FROM transactions;
    `);
    await db.execAsync('DROP TABLE transactions;');
    await db.execAsync('ALTER TABLE transactions_new RENAME TO transactions;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

// Ensure the default "Cash" group exists and every account is linked to at least one group.
// Returns the Cash group id. Idempotent — safe to call on every launch and after a restore.
export async function ensureDefaultGroups(db: SQLite.SQLiteDatabase): Promise<number> {
  const cashId = await getDefaultGroupId(db);
  await db.runAsync(
    `INSERT OR IGNORE INTO account_group_links (account_id, group_id)
     SELECT a.id, ? FROM accounts a
     WHERE NOT EXISTS (SELECT 1 FROM account_group_links l WHERE l.account_id = a.id)`,
    cashId
  );
  return cashId;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function getAccounts(db: SQLite.SQLiteDatabase): Promise<Account[]> {
  return db.getAllAsync<Account>('SELECT * FROM accounts WHERE is_active = 1 ORDER BY id');
}

export async function getAllAccounts(db: SQLite.SQLiteDatabase): Promise<Account[]> {
  return db.getAllAsync<Account>('SELECT * FROM accounts ORDER BY id');
}

// Accounts with their attached groups. activeOnly=true mirrors getAccounts (used when picking
// an account for a transaction); pass false on management screens to include inactive accounts.
export async function getAccountsWithGroups(
  db: SQLite.SQLiteDatabase,
  activeOnly: boolean = true,
): Promise<AccountWithGroups[]> {
  const accounts = await db.getAllAsync<Account>(
    `SELECT * FROM accounts ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY id`
  );
  const links = await db.getAllAsync<{ account_id: number; id: number; name: string }>(
    `SELECT l.account_id, g.id, g.name
     FROM account_group_links l
     JOIN account_groups g ON g.id = l.group_id
     ORDER BY g.name`
  );
  const byAccount = new Map<number, AccountGroup[]>();
  for (const l of links) {
    const arr = byAccount.get(l.account_id) ?? [];
    arr.push({ id: l.id, name: l.name });
    byAccount.set(l.account_id, arr);
  }
  return accounts.map(a => ({ ...a, groups: byAccount.get(a.id) ?? [] }));
}

export async function addAccount(db: SQLite.SQLiteDatabase, name: string, groupIds: number[] = []): Promise<number> {
  const result = await db.runAsync('INSERT INTO accounts (name) VALUES (?)', name);
  const id = result.lastInsertRowId;
  await setAccountGroups(db, id, groupIds);
  return id;
}

export async function updateAccount(db: SQLite.SQLiteDatabase, id: number, name: string, groupIds: number[] = []): Promise<void> {
  await db.runAsync('UPDATE accounts SET name = ? WHERE id = ?', name, id);
  await setAccountGroups(db, id, groupIds);
}

// Replace the full set of groups linked to an account.
export async function setAccountGroups(db: SQLite.SQLiteDatabase, accountId: number, groupIds: number[]): Promise<void> {
  await db.runAsync('DELETE FROM account_group_links WHERE account_id = ?', accountId);
  for (const gid of groupIds) {
    await db.runAsync('INSERT OR IGNORE INTO account_group_links (account_id, group_id) VALUES (?, ?)', accountId, gid);
  }
}

// ─── Account Groups ─────────────────────────────────────────────────────────

export async function getAccountGroups(db: SQLite.SQLiteDatabase): Promise<AccountGroup[]> {
  return db.getAllAsync<AccountGroup>('SELECT * FROM account_groups ORDER BY name');
}

// The default group every account/transaction falls back to. Created on demand if missing.
export async function getDefaultGroupId(db: SQLite.SQLiteDatabase): Promise<number> {
  const existing = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM account_groups WHERE LOWER(name) = 'cash' LIMIT 1"
  );
  if (existing) return existing.id;
  const res = await db.runAsync('INSERT INTO account_groups (name) VALUES (?)', 'Cash');
  return res.lastInsertRowId;
}

// Per-account, per-group net of categorised transactions (income − expense). Transfers carry no
// group, so these portions show how an account's tagged activity splits across its groups; they
// may not sum exactly to the account balance when transfers are involved.
export interface AccountGroupPortion {
  account_id: number;
  group_id: number;
  group_name: string;
  total: number;
}

export async function getAccountGroupBalances(db: SQLite.SQLiteDatabase): Promise<AccountGroupPortion[]> {
  return db.getAllAsync<AccountGroupPortion>(`
    SELECT t.account_id, t.group_id, g.name as group_name,
      COALESCE(SUM(CASE WHEN c.type = 'INCOME' THEN t.amount ELSE -t.amount END), 0) as total
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    JOIN account_groups g ON g.id = t.group_id
    WHERE t.group_id IS NOT NULL
    GROUP BY t.account_id, t.group_id
    ORDER BY g.name
  `);
}

export async function accountGroupExists(db: SQLite.SQLiteDatabase, name: string, excludeId?: number): Promise<boolean> {
  if (excludeId) {
    const res = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM account_groups WHERE LOWER(name) = LOWER(?) AND id != ?',
      name, excludeId
    );
    return (res?.cnt || 0) > 0;
  }
  const res = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM account_groups WHERE LOWER(name) = LOWER(?)',
    name
  );
  return (res?.cnt || 0) > 0;
}

export async function addAccountGroup(db: SQLite.SQLiteDatabase, name: string): Promise<number> {
  const result = await db.runAsync('INSERT INTO account_groups (name) VALUES (?)', name.trim());
  return result.lastInsertRowId;
}

export async function updateAccountGroup(db: SQLite.SQLiteDatabase, id: number, name: string): Promise<void> {
  await db.runAsync('UPDATE account_groups SET name = ? WHERE id = ?', name.trim(), id);
}

export type DeleteGroupResult = { ok: true } | { ok: false; reason: 'cash' | 'in_use' };

// Deleting a group is allowed only when it is not the default Cash group and no transactions use
// it. On success the group's account links cascade away, and we re-ensure every account keeps at
// least one group (Cash) so the mandatory-group invariant holds.
export async function deleteAccountGroup(db: SQLite.SQLiteDatabase, id: number): Promise<DeleteGroupResult> {
  const g = await db.getFirstAsync<{ name: string }>('SELECT name FROM account_groups WHERE id = ?', id);
  if (g && g.name.toLowerCase() === 'cash') return { ok: false, reason: 'cash' };

  const used = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM transactions WHERE group_id = ?', id
  );
  if (used && used.cnt > 0) return { ok: false, reason: 'in_use' };

  await db.runAsync('DELETE FROM account_groups WHERE id = ?', id); // links cascade
  await ensureDefaultGroups(db);
  return { ok: true };
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
    ) + (
      SELECT COALESCE(SUM(amount), 0) FROM transfers WHERE to_account_id = ?
    ) - (
      SELECT COALESCE(SUM(amount), 0) FROM transfers WHERE from_account_id = ?
    ) WHERE id = ?`,
    accountId, accountId, accountId, accountId
  ).then(() => {});
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(db: SQLite.SQLiteDatabase): Promise<Category[]> {
  return db.getAllAsync<Category>('SELECT * FROM categories ORDER BY type, name');
}

export async function getCategoriesByType(db: SQLite.SQLiteDatabase, type: 'INCOME' | 'EXPENSE'): Promise<Category[]> {
  return db.getAllAsync<Category>('SELECT * FROM categories WHERE type = ? ORDER BY name', type);
}

export async function categoryExists(db: SQLite.SQLiteDatabase, name: string, excludeId?: number): Promise<boolean> {
  if (excludeId) {
    const res = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?',
      name, excludeId
    );
    return (res?.cnt || 0) > 0;
  } else {
    const res = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM categories WHERE LOWER(name) = LOWER(?)',
      name
    );
    return (res?.cnt || 0) > 0;
  }
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
    `SELECT t.*, a.name as account_name, c.name as category_name, c.type as category_type, c.icon_name as category_icon, g.name as group_name
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     JOIN categories c ON c.id = t.category_id
     LEFT JOIN account_groups g ON g.id = t.group_id
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
    `SELECT t.*, a.name as account_name, c.name as category_name, c.type as category_type, c.icon_name as category_icon, g.name as group_name
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     JOIN categories c ON c.id = t.category_id
     LEFT JOIN account_groups g ON g.id = t.group_id
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
  groupId: number,
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO transactions (account_id, category_id, amount, transaction_date, note, group_id) VALUES (?, ?, ?, ?, ?, ?)',
    accountId, categoryId, amount, transactionDate, note, groupId
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
  groupId: number,
): Promise<void> {
  // Get old account to recalc its balance too
  const old = await db.getFirstAsync<{ account_id: number }>('SELECT account_id FROM transactions WHERE id = ?', id);
  await db.runAsync(
    'UPDATE transactions SET account_id = ?, category_id = ?, amount = ?, transaction_date = ?, note = ?, group_id = ? WHERE id = ?',
    accountId, categoryId, amount, transactionDate, note, groupId, id
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

// ─── Transfers ─────────────────────────────────────────────────────────────────

interface TransferRow extends Transfer {
  from_name: string;
  to_name: string;
}

// Shape a transfer into a TransactionWithDetails so it can sit in the same ledger list.
function toTransferLedgerRow(t: TransferRow): TransactionWithDetails {
  return {
    id: t.id,
    account_id: t.from_account_id,
    category_id: 0,
    amount: t.amount,
    transaction_date: t.transaction_date,
    note: t.note,
    group_id: null,
    account_name: `${t.from_name} → ${t.to_name}`,
    category_name: 'Transfer',
    category_type: 'TRANSFER',
    category_icon: 'swap-horiz',
    group_name: null,
    kind: 'TRANSFER',
  };
}

// Most recent first; date strings are 'yyyy-MM-dd' so lexical compare is chronological.
function byDateDesc(a: TransactionWithDetails, b: TransactionWithDetails): number {
  if (a.transaction_date !== b.transaction_date) {
    return a.transaction_date < b.transaction_date ? 1 : -1;
  }
  return b.id - a.id;
}

export async function addTransfer(
  db: SQLite.SQLiteDatabase,
  fromAccountId: number,
  toAccountId: number,
  amount: number,
  transactionDate: string,
  note: string,
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO transfers (from_account_id, to_account_id, amount, transaction_date, note) VALUES (?, ?, ?, ?, ?)',
    fromAccountId, toAccountId, amount, transactionDate, note
  );
  await recalcAccountBalance(db, fromAccountId);
  await recalcAccountBalance(db, toAccountId);
  return result.lastInsertRowId;
}

export async function deleteTransfer(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  const old = await db.getFirstAsync<{ from_account_id: number; to_account_id: number }>(
    'SELECT from_account_id, to_account_id FROM transfers WHERE id = ?', id
  );
  await db.runAsync('DELETE FROM transfers WHERE id = ?', id);
  if (old) {
    await recalcAccountBalance(db, old.from_account_id);
    await recalcAccountBalance(db, old.to_account_id);
  }
}

// ─── Dashboard Queries ───────────────────────────────────────────────────────

export interface DashboardSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
}

export async function getDashboardSummary(
  db: SQLite.SQLiteDatabase,
  date?: string | Date | null,
): Promise<DashboardSummary> {
  let query = `
    SELECT
      COALESCE(SUM(CASE WHEN c.type = 'INCOME' THEN t.amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN c.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) as expense
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
  `;

  const params: string[] = [];

  if (date) {
    const from = startOfDay(new Date(date)).toISOString();
    const to = endOfDay(new Date(date)).toISOString();

    query += ` WHERE t.transaction_date >= ? AND t.transaction_date <= ?`;
    params.push(from, to);
  }

  const result = await db.getFirstAsync<{ income: number; expense: number }>(
    query,
    ...params
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
  date?: string | Date | null,
  type?: 'INCOME' | 'EXPENSE',
): Promise<CategorySummary[]> {
  let query = `
    SELECT
      c.id as category_id,
      c.name as category_name,
      c.type as category_type,
      c.icon_name as icon_name,
      SUM(t.amount) as total
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
  `;

  const conditions: string[] = [];
  const params: string[] = [];

  if (date) {
    const from = startOfDay(new Date(date)).toISOString();
    const to = endOfDay(new Date(date)).toISOString();
    conditions.push(`t.transaction_date >= ? AND t.transaction_date <= ?`);
    params.push(from, to);
  }

  if (type) {
    conditions.push(`c.type = ?`);
    params.push(type);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }

  query += `
    GROUP BY c.id
    ORDER BY total DESC
  `;

  return db.getAllAsync<CategorySummary>(query, ...params);
}

export async function getRecentTransactions(
  db: SQLite.SQLiteDatabase,
  limit: number = 5,
): Promise<TransactionWithDetails[]> {
  const txns = await db.getAllAsync<TransactionWithDetails>(
    `SELECT t.*, a.name as account_name, c.name as category_name, c.type as category_type, c.icon_name as category_icon, g.name as group_name
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     JOIN categories c ON c.id = t.category_id
     LEFT JOIN account_groups g ON g.id = t.group_id
     ORDER BY t.transaction_date DESC, t.id DESC
     LIMIT ?`,
    limit
  );
  const transfers = await db.getAllAsync<TransferRow>(
    `SELECT tr.*, af.name as from_name, at2.name as to_name
     FROM transfers tr
     JOIN accounts af ON af.id = tr.from_account_id
     JOIN accounts at2 ON at2.id = tr.to_account_id
     ORDER BY tr.transaction_date DESC, tr.id DESC
     LIMIT ?`,
    limit
  );
  const merged = [
    ...txns.map(t => ({ ...t, kind: 'TXN' as const })),
    ...transfers.map(toTransferLedgerRow),
  ];
  merged.sort(byDateDesc);
  return merged.slice(0, limit);
}

// ─── Backup / Restore ─────────────────────────────────────────────────────────

export async function getAllDataForBackup(db: SQLite.SQLiteDatabase) {
  const [accounts, categories, transactions, transfers, account_groups, account_group_links] = await Promise.all([
    db.getAllAsync('SELECT * FROM accounts'),
    db.getAllAsync('SELECT * FROM categories'),
    db.getAllAsync('SELECT * FROM transactions'),
    db.getAllAsync('SELECT * FROM transfers'),
    db.getAllAsync('SELECT * FROM account_groups'),
    db.getAllAsync('SELECT * FROM account_group_links'),
  ]);
  return { accounts, categories, transactions, transfers, account_groups, account_group_links };
}

export function isValidBackup(data: any): boolean {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.accounts) &&
    Array.isArray(data.categories) &&
    Array.isArray(data.transactions)
    // `transfers` is optional so backups from older versions still restore
  );
}

export async function restoreFromBackupData(
  db: SQLite.SQLiteDatabase,
  data: any,
): Promise<{ accounts: number; categories: number; transactions: number; transfers: number }> {
  // Clear existing data (children first to satisfy foreign keys)
  await db.execAsync('DELETE FROM transfers');
  await db.execAsync('DELETE FROM transactions');
  await db.execAsync('DELETE FROM account_group_links');
  await db.execAsync('DELETE FROM account_groups');
  await db.execAsync('DELETE FROM categories');
  await db.execAsync('DELETE FROM accounts');

  // Restore accounts
  for (const a of data.accounts) {
    await db.runAsync(
      'INSERT INTO accounts (id, name, group_name, balance, is_active) VALUES (?, ?, ?, ?, ?)',
      a.id, a.name, a.group_name ?? null, a.balance ?? 0, a.is_active ?? 1
    );
  }

  // Restore account groups + links (optional — older backups may not include them)
  const accountGroups = Array.isArray(data.account_groups) ? data.account_groups : [];
  for (const g of accountGroups) {
    await db.runAsync('INSERT INTO account_groups (id, name) VALUES (?, ?)', g.id, g.name);
  }
  const groupLinks = Array.isArray(data.account_group_links) ? data.account_group_links : [];
  for (const l of groupLinks) {
    await db.runAsync(
      'INSERT OR IGNORE INTO account_group_links (account_id, group_id) VALUES (?, ?)',
      l.account_id, l.group_id
    );
  }

  // Groups are mandatory; older backups carry neither groups nor per-transaction group_ids.
  // Guarantee the Cash group exists (and every account is linked) and use it as the fallback
  // for any transaction that has no group of its own.
  const cashId = await ensureDefaultGroups(db);

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
      'INSERT INTO transactions (id, account_id, category_id, amount, transaction_date, note, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      t.id, t.account_id, t.category_id, t.amount, t.transaction_date, t.note ?? '', t.group_id ?? cashId
    );
  }

  // Restore transfers (optional — older backups may not include them)
  const transfers = Array.isArray(data.transfers) ? data.transfers : [];
  for (const t of transfers) {
    await db.runAsync(
      'INSERT INTO transfers (id, from_account_id, to_account_id, amount, transaction_date, note) VALUES (?, ?, ?, ?, ?, ?)',
      t.id, t.from_account_id, t.to_account_id, t.amount, t.transaction_date, t.note ?? ''
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
    transfers: transfers.length,
  };
}

// Add this interface along with other types
export interface TransactionFilters {
  date: string | Date | null;
  type?: 'INCOME' | 'EXPENSE' | null;
  accountId?: number | null;
  categoryId?: number | null;
  groupId?: number | null;
}

export async function getFilteredTransactions(
  db: SQLite.SQLiteDatabase,
  filters: TransactionFilters
): Promise<TransactionWithDetails[]> {
  let query = `
    SELECT t.*, a.name as account_name, c.name as category_name, c.type as category_type, c.icon_name as category_icon, g.name as group_name
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN account_groups g ON g.id = t.group_id
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.date) {
    const dateStr = typeof filters.date === 'string' ? filters.date : format(filters.date, 'yyyy-MM-dd');

    // Note: If your DB stores `transaction_date` as exactly 'yyyy-MM-dd',
    // it's safer to just do: conditions.push(`t.transaction_date = ?`) with params.push(dateStr)
    // But keeping your range logic here:
    conditions.push(`t.transaction_date >= ? AND t.transaction_date <= ?`);
    params.push(startOfDay(new Date(dateStr)).toISOString(), endOfDay(new Date(dateStr)).toISOString());
  }

  if (filters.type) {
    conditions.push(`c.type = ?`);
    params.push(filters.type);
  }

  if (filters.accountId) {
    conditions.push(`t.account_id = ?`);
    params.push(filters.accountId);
  }

  if (filters.categoryId) {
    conditions.push(`t.category_id = ?`);
    params.push(filters.categoryId);
  }

  if (filters.groupId) {
    conditions.push(`t.group_id = ?`);
    params.push(filters.groupId);
  }

  // If we have any conditions, append WHERE and join them with AND
  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(` AND `);
  }

  query += ` ORDER BY t.transaction_date DESC, t.id DESC`;

  const txns = (await db.getAllAsync<TransactionWithDetails>(query, ...params))
    .map(t => ({ ...t, kind: 'TXN' as const }));

  // Transfers have no category, income/expense type, or group, so they only belong in the
  // list when those filters are not narrowing the view.
  if (filters.type || filters.categoryId || filters.groupId) {
    return txns;
  }

  const trConditions: string[] = [];
  const trParams: any[] = [];

  if (filters.date) {
    const dateStr = typeof filters.date === 'string' ? filters.date : format(filters.date, 'yyyy-MM-dd');
    trConditions.push(`tr.transaction_date >= ? AND tr.transaction_date <= ?`);
    trParams.push(startOfDay(new Date(dateStr)).toISOString(), endOfDay(new Date(dateStr)).toISOString());
  }

  if (filters.accountId) {
    trConditions.push(`(tr.from_account_id = ? OR tr.to_account_id = ?)`);
    trParams.push(filters.accountId, filters.accountId);
  }

  let trQuery = `
    SELECT tr.*, af.name as from_name, at2.name as to_name
    FROM transfers tr
    JOIN accounts af ON af.id = tr.from_account_id
    JOIN accounts at2 ON at2.id = tr.to_account_id
  `;
  if (trConditions.length > 0) {
    trQuery += ` WHERE ` + trConditions.join(` AND `);
  }

  const transfers = (await db.getAllAsync<TransferRow>(trQuery, ...trParams)).map(toTransferLedgerRow);

  const merged = [...txns, ...transfers];
  merged.sort(byDateDesc);
  return merged;
}