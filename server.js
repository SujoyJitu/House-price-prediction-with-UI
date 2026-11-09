const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
const csvPath = path.join(ROOT, 'House Price Prediction Dataset.csv');
const accountPath = path.join(ROOT, 'accounts.json');
const sessions = new Map();
const accounts = fs.existsSync(accountPath) ? JSON.parse(fs.readFileSync(accountPath, 'utf8')) : [];
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') });
function readBody(req, res, callback) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; if (body.length > 10000) { send(res, 413, { error: 'Request is too large.' }); req.destroy(); } });
  req.on('end', () => { try { callback(JSON.parse(body)); } catch { send(res, 400, { error: 'Request body must be valid JSON.' }); } });
}
function currentUser(req) {
  const token = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('hearth_session='))?.slice('hearth_session='.length);
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; }
  return accounts.find(({ id }) => id === session.userId) || null;
}
function publicUser(user) { return user && { id: user.id, name: user.name, email: user.email }; }
function createSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_MS });
  res.setHeader('Set-Cookie', `hearth_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const fields = header.split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(fields.map((field, i) => [field, values[i]]));
  });
}

const dataset = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const numeric = (row, key) => Number(row[key]) || 0;
const mean = (rows, key) => rows.length ? rows.reduce((sum, row) => sum + numeric(row, key), 0) / rows.length : 0;

function estimate(input) {
  const location = String(input.location || '').trim();
  const area = Number(input.area);
  const bedrooms = Number(input.bedrooms);
  const bathrooms = Number(input.bathrooms);
  if (location.length < 2 || !Number.isFinite(area) || area < 100 || area > 25000 || !Number.isFinite(bedrooms) || bedrooms < 1 || bedrooms > 10 || !Number.isFinite(bathrooms) || bathrooms < 1 || bathrooms > 10) {
    return { error: 'Enter a location, area (100–25,000), and valid bedroom and bathroom counts.' };
  }

  const normalized = location.toLowerCase();
  const matches = dataset.filter((row) => String(row.Location).toLowerCase() === normalized);
  const locationRows = matches.length ? matches : dataset;
  const areaPrice = mean(locationRows, 'Price') / mean(locationRows, 'Area');
  const typicalBedrooms = mean(locationRows, 'Bedrooms') || 1;
  const typicalBathrooms = mean(locationRows, 'Bathrooms') || 1;
  const estimateValue = Math.max(1, (area * areaPrice) + ((bedrooms - typicalBedrooms) * areaPrice * 90) + ((bathrooms - typicalBathrooms) * areaPrice * 120));
  const midpoint = Math.round(estimateValue / 500) * 500;
  return { midpoint, low: Math.round(midpoint * 0.87 / 5000) * 5000, high: Math.round(midpoint * 1.13 / 5000) * 5000, matchedLocation: matches.length > 0, comparableCount: locationRows.length };
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'POST' && url.pathname === '/api/auth/signup') return readBody(req, res, (input) => {
    const name = String(input.name || '').trim(); const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || '');
    if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 256) return send(res, 400, { error: 'Enter a valid name and email, and a password between 8 and 256 characters.' });
    if (accounts.some((user) => user.email === email)) return send(res, 409, { error: 'An account with that email already exists. Try logging in.' });
    const credentials = hashPassword(password); const user = { id: crypto.randomUUID(), name, email, ...credentials, createdAt: new Date().toISOString() };
    accounts.push(user); fs.writeFileSync(accountPath, JSON.stringify(accounts, null, 2), { mode: 0o600 }); createSession(res, user); return send(res, 201, { user: publicUser(user) });
  });
  if (req.method === 'POST' && url.pathname === '/api/auth/login') return readBody(req, res, (input) => {
    const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || '');
    const user = accounts.find((entry) => entry.email === email);
    if (!user || password.length > 256 || !crypto.timingSafeEqual(Buffer.from(hashPassword(password, user.salt).hash, 'hex'), Buffer.from(user.hash, 'hex'))) return send(res, 401, { error: 'Email or password is incorrect.' });
    createSession(res, user); return send(res, 200, { user: publicUser(user) });
  });
  if (req.method === 'GET' && url.pathname === '/api/auth/me') { const user = currentUser(req); return send(res, user ? 200 : 401, user ? { user: publicUser(user) } : { error: 'Not logged in.' }); }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('hearth_session='))?.slice('hearth_session='.length);
    if (token) sessions.delete(token); res.setHeader('Set-Cookie', 'hearth_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { status: 'ok', records: dataset.length });
  if (req.method === 'GET' && url.pathname === '/api/dataset/summary') return send(res, 200, { records: dataset.length, fields: Object.keys(dataset[0] || {}), locations: [...new Set(dataset.map((row) => row.Location))].sort() });
  if (req.method === 'POST' && url.pathname === '/api/estimate') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', () => { try { const result = estimate(JSON.parse(body)); send(res, result.error ? 400 : 200, result); } catch { send(res, 400, { error: 'Request body must be valid JSON.' }); } });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'Not found.' });
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`House price estimator listening at http://localhost:${PORT} (${dataset.length} dataset rows loaded)`));
