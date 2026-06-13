// =============================================================================
// Investment Management System - Backend API Server
// Deployed on Render.com
// =============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// =============================================================================
// Config
// =============================================================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'investment-system-secret-key-2026';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// =============================================================================
// Database Setup
// =============================================================================
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_name TEXT NOT NULL,
    investment_date TEXT NOT NULL,
    maturity_date TEXT NOT NULL,
    amount REAL NOT NULL,
    rate REAL NOT NULL DEFAULT 12,
    reinvest_type TEXT DEFAULT 'none',
    commission REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    redeemed_date TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS returns_tbl (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invest_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('interest_earned', 'commission')),
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (invest_id) REFERENCES investments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    action TEXT,
    detail TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// =============================================================================
// Helper: ensure admin user exists
// =============================================================================
function ensureAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
  if (!existing) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(ADMIN_USERNAME, hash, 'admin');
    console.log(`✓ Admin user created: ${ADMIN_USERNAME}`);
  }
}
ensureAdmin();

// =============================================================================
// Auth Middleware
// =============================================================================
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: '未登录' });
  }
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Token 无效或已过期' });
  }
}

// =============================================================================
// API Routes
// =============================================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---- Auth ----

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ ok: false, error: '请输入用户名和密码' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.json({ ok: false, error: '用户名或密码错误' });
  }
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({
    ok: true,
    token,
    user: { id: user.id, name: user.username, role: user.role }
  });
});

app.post('/api/auth/verify', authenticate, (req, res) => {
  res.json({
    ok: true,
    user: { id: req.user.id, name: req.user.username, role: req.user.role }
  });
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/change-password', authenticate, (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  if (!username || !oldPassword || !newPassword) {
    return res.json({ ok: false, error: '请填写完整信息' });
  }
  // Only admin can change any password; users can change their own
  if (req.user.role !== 'admin' && req.user.username !== username) {
    return res.json({ ok: false, error: '无权修改其他用户的密码' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.json({ ok: false, error: '原密码错误' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, username.toLowerCase().trim());
  db.prepare('INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)').run(
    req.user.username, 'change_password', `User ${username} changed password`
  );
  res.json({ ok: true });
});

// ---- Investments ----

// GET all investments + returns
app.get('/api/investments', authenticate, (req, res) => {
  try {
    const investments = db.prepare('SELECT * FROM investments ORDER BY id DESC').all();
    const returns = db.prepare('SELECT * FROM returns_tbl ORDER BY id DESC').all();
    
    // Map snake_case to camelCase for frontend
    const camelInvestments = investments.map(i => ({
      id: i.id,
      investorName: i.investor_name,
      investmentDate: i.investment_date,
      maturityDate: i.maturity_date,
      amount: i.amount,
      rate: i.rate,
      reinvestType: i.reinvest_type,
      commission: i.commission,
      status: i.status,
      redeemedDate: i.redeemed_date,
      notes: i.notes,
      createdAt: i.created_at
    }));
    
    const camelReturns = returns.map(r => ({
      id: r.id,
      investId: r.invest_id,
      date: r.date,
      type: r.type,
      amount: r.amount,
      note: r.note,
      createdAt: r.created_at
    }));
    
    res.json({ ok: true, investments: camelInvestments, returns: camelReturns });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// POST create investment
app.post('/api/investments', authenticate, (req, res) => {
  try {
    const { investorName, investmentDate, maturityDate, amount, rate, reinvestType, commission, notes, status } = req.body;
    if (!investorName || !investmentDate || !maturityDate || !amount || amount <= 0) {
      return res.json({ ok: false, error: '请填写完整的投资信息（投资人、日期、金额）' });
    }
    const result = db.prepare(`
      INSERT INTO investments (investor_name, investment_date, maturity_date, amount, rate, reinvest_type, commission, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      investorName.trim(),
      investmentDate,
      maturityDate,
      parseFloat(amount),
      parseFloat(rate) || 12,
      reinvestType || 'none',
      parseFloat(commission) || 0,
      status || 'active',
      notes || ''
    );
    
    const inv = db.prepare('SELECT * FROM investments WHERE id = ?').get(result.lastInsertRowid);
    res.json({
      ok: true,
      investment: {
        id: inv.id,
        investorName: inv.investor_name,
        investmentDate: inv.investment_date,
        maturityDate: inv.maturity_date,
        amount: inv.amount,
        rate: inv.rate,
        reinvestType: inv.reinvest_type,
        commission: inv.commission,
        status: inv.status,
        redeemedDate: inv.redeemed_date,
        notes: inv.notes,
        createdAt: inv.created_at
      }
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// PUT update investment
app.put('/api/investments/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { investorName, investmentDate, maturityDate, amount, rate, reinvestType, commission, notes } = req.body;
    
    const existing = db.prepare('SELECT * FROM investments WHERE id = ?').get(id);
    if (!existing) {
      return res.json({ ok: false, error: '投资记录不存在' });
    }
    
    db.prepare(`
      UPDATE investments SET
        investor_name = ?, investment_date = ?, maturity_date = ?,
        amount = ?, rate = ?, reinvest_type = ?, commission = ?, notes = ?
      WHERE id = ?
    `).run(
      investorName || existing.investor_name,
      investmentDate || existing.investment_date,
      maturityDate || existing.maturity_date,
      amount ? parseFloat(amount) : existing.amount,
      rate ? parseFloat(rate) : existing.rate,
      reinvestType !== undefined ? reinvestType : existing.reinvest_type,
      commission !== undefined ? parseFloat(commission) : existing.commission,
      notes !== undefined ? notes : existing.notes,
      id
    );
    
    const updated = db.prepare('SELECT * FROM investments WHERE id = ?').get(id);
    res.json({
      ok: true,
      investment: {
        id: updated.id,
        investorName: updated.investor_name,
        investmentDate: updated.investment_date,
        maturityDate: updated.maturity_date,
        amount: updated.amount,
        rate: updated.rate,
        reinvestType: updated.reinvest_type,
        commission: updated.commission,
        status: updated.status,
        redeemedDate: updated.redeemed_date,
        notes: updated.notes,
        createdAt: updated.created_at
      }
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// DELETE investment
app.delete('/api/investments/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM investments WHERE id = ?').get(id);
    if (!existing) {
      return res.json({ ok: false, error: '投资记录不存在' });
    }
    // Delete associated returns first (cascade should handle this, but be explicit)
    db.prepare('DELETE FROM returns_tbl WHERE invest_id = ?').run(id);
    db.prepare('DELETE FROM investments WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// PATCH redeem investment
app.patch('/api/investments/:id/redeem', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { status, redeemedDate } = req.body;
    
    const existing = db.prepare('SELECT * FROM investments WHERE id = ?').get(id);
    if (!existing) {
      return res.json({ ok: false, error: '投资记录不存在' });
    }
    
    db.prepare('UPDATE investments SET status = ?, redeemed_date = ? WHERE id = ?').run(
      status || 'redeemed',
      redeemedDate || new Date().toISOString().split('T')[0],
      id
    );
    
    const updated = db.prepare('SELECT * FROM investments WHERE id = ?').get(id);
    res.json({
      ok: true,
      investment: {
        id: updated.id,
        investorName: updated.investor_name,
        investmentDate: updated.investment_date,
        maturityDate: updated.maturity_date,
        amount: updated.amount,
        rate: updated.rate,
        reinvestType: updated.reinvest_type,
        commission: updated.commission,
        status: updated.status,
        redeemedDate: updated.redeemed_date,
        notes: updated.notes,
        createdAt: updated.created_at
      }
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---- Returns ----

// GET all returns
app.get('/api/investments/returns/list', authenticate, (req, res) => {
  try {
    const returns = db.prepare('SELECT * FROM returns_tbl ORDER BY date DESC, id DESC').all();
    const camelReturns = returns.map(r => ({
      id: r.id,
      investId: r.invest_id,
      date: r.date,
      type: r.type,
      amount: r.amount,
      note: r.note,
      createdAt: r.created_at
    }));
    res.json({ ok: true, returns: camelReturns });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// POST add return
app.post('/api/investments/returns/add', authenticate, (req, res) => {
  try {
    const { investId, date, type, amount, note } = req.body;
    if (!investId || !date || !type || amount === undefined) {
      return res.json({ ok: false, error: '请填写完整的收益信息' });
    }
    
    // Verify investment exists
    const inv = db.prepare('SELECT id FROM investments WHERE id = ?').get(investId);
    if (!inv) {
      return res.json({ ok: false, error: '投资记录不存在' });
    }
    
    const result = db.prepare(`
      INSERT INTO returns_tbl (invest_id, date, type, amount, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(investId, date, type, parseFloat(amount), note || '');
    
    const ret = db.prepare('SELECT * FROM returns_tbl WHERE id = ?').get(result.lastInsertRowid);
    res.json({
      ok: true,
      return: {
        id: ret.id,
        investId: ret.invest_id,
        date: ret.date,
        type: ret.type,
        amount: ret.amount,
        note: ret.note,
        createdAt: ret.created_at
      }
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// =============================================================================
// Start Server
// =============================================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Investment System API running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
});
