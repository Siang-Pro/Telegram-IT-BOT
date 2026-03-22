const TOKEN_KEY = 'telegram_it_bot_admin_jwt';

{
  const y = document.getElementById('footer-year');
  if (y) y.textContent = String(new Date().getFullYear());
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function showLogin() {
  document.getElementById('login-panel').hidden = false;
  document.getElementById('main-panel').hidden = true;
}

function showMain() {
  document.getElementById('login-panel').hidden = true;
  document.getElementById('main-panel').hidden = false;
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const errEl = document.getElementById('login-error');
  errEl.hidden = true;
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: fd.get('username'),
        password: fd.get('password'),
      }),
    });
    setToken(data.token);
    showMain();
    await loadSettings();
    await loadWhitelist();
    await loadLogs(1);
  } catch (err) {
    errEl.textContent = err.message || '登入失敗';
    errEl.hidden = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  setToken(null);
  showLogin();
});

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.dataset.tab;
    document.querySelectorAll('.tab-pane').forEach((p) => {
      p.hidden = p.id !== `tab-${id}`;
    });
  });
});

async function loadSettings() {
  const data = await api('/api/settings');
  const f = document.getElementById('settings-form');
  f.non_whitelist_reply.value = data.non_whitelist_reply || '';
  f.google_safe_browsing_key.value = data.google_safe_browsing_key || '';
  f.telegram_bot_token.value = '';
  document.getElementById('settings-msg').textContent = '';
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    non_whitelist_reply: f.non_whitelist_reply.value,
    google_safe_browsing_key: f.google_safe_browsing_key.value,
  };
  const tok = f.telegram_bot_token.value.trim();
  if (tok) body.telegram_bot_token = tok;
  const msg = document.getElementById('settings-msg');
  msg.textContent = '';
  msg.style.color = '';
  try {
    const res = await api('/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
    msg.textContent = res.restartHint || '已儲存';
    f.telegram_bot_token.value = '';
    await loadSettings();
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = 'var(--danger, red)';
  }
});

async function loadWhitelist() {
  const { items } = await api('/api/whitelist');
  const tbody = document.getElementById('wl-body');
  tbody.innerHTML = '';
  for (const row of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.telegram_user_id}</td>
      <td>${row.username || '—'}</td>
      <td>${row.created_at || '—'}</td>
      <td>${row.disabled ? '已停權' : '有效'}</td>
      <td></td>`;
    const td = tr.lastElementChild;
    if (row.disabled) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '復權';
      b.addEventListener('click', async () => {
        await api(`/api/whitelist/${row.telegram_user_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ disabled: false }),
        });
        await loadWhitelist();
      });
      td.appendChild(b);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'secondary';
      b.textContent = '停權';
      b.addEventListener('click', async () => {
        await api(`/api/whitelist/${row.telegram_user_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ disabled: true }),
        });
        await loadWhitelist();
      });
      td.appendChild(b);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'danger';
      del.textContent = '刪除';
      del.style.marginLeft = '0.35rem';
      del.addEventListener('click', async () => {
        if (!confirm('確定刪除此筆白名單？')) return;
        await api(`/api/whitelist/${row.telegram_user_id}`, { method: 'DELETE' });
        await loadWhitelist();
      });
      td.appendChild(del);
    }
    tbody.appendChild(tr);
  }
}

document.getElementById('wl-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const msg = document.getElementById('wl-msg');
  msg.textContent = '';
  msg.style.color = '';
  try {
    await api('/api/whitelist', {
      method: 'POST',
      body: JSON.stringify({
        telegram_user_id: Number(fd.get('telegram_user_id')),
        username: fd.get('username') || null,
      }),
    });
    e.target.reset();
    await loadWhitelist();
    msg.textContent = '已新增';
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = 'var(--danger, red)';
  }
});

let logsPage = 1;
let logsUserId = '';

async function loadLogs(page) {
  logsPage = page;
  const q = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (logsUserId) q.set('user_id', logsUserId);
  const data = await api(`/api/logs?${q}`);
  const tbody = document.getElementById('logs-body');
  tbody.innerHTML = '';
  for (const row of data.items) {
    const tr = document.createElement('tr');
    const short = (row.message_text || '').slice(0, 120);
    tr.innerHTML = `
      <td>${row.created_at || '—'}</td>
      <td>${row.telegram_user_id}</td>
      <td>${row.is_whitelisted ? '是' : '否'}</td>
      <td><code>${escapeHtml(short)}</code></td>
      <td></td>`;
    const td = tr.lastElementChild;
    if (!row.is_whitelisted) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '加入白名單';
      b.addEventListener('click', async () => {
        try {
          await api(`/api/logs/${row.id}/add-to-whitelist`, { method: 'POST' });
          await loadLogs(logsPage);
          await loadWhitelist();
        } catch (err) {
          alert(err.message);
        }
      });
      td.appendChild(b);
    }
    tbody.appendChild(tr);
  }
  document.getElementById('logs-page-info').textContent = `第 ${data.page} 頁／共 ${data.total} 筆`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.getElementById('logs-filter').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  logsUserId = fd.get('user_id') ? String(fd.get('user_id')) : '';
  const lm = document.getElementById('logs-msg');
  lm.textContent = '';
  lm.style.color = '';
  await loadLogs(1);
});

document.getElementById('logs-reset').addEventListener('click', async () => {
  document.getElementById('logs-filter').reset();
  logsUserId = '';
  const lm = document.getElementById('logs-msg');
  lm.textContent = '';
  lm.style.color = '';
  await loadLogs(1);
});

document.getElementById('logs-delete-all').addEventListener('click', async () => {
  if (!confirm('確定要刪除「全部」對話日誌？此動作無法復原。')) return;
  const msg = document.getElementById('logs-msg');
  msg.textContent = '';
  msg.style.color = '';
  try {
    const res = await api('/api/logs', { method: 'DELETE' });
    msg.textContent = `已清除 ${res.deleted ?? 0} 筆日誌`;
    msg.style.color = 'var(--ok, green)';
    logsPage = 1;
    await loadLogs(1);
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = 'var(--danger, red)';
  }
});

document.getElementById('logs-prev').addEventListener('click', async () => {
  if (logsPage > 1) await loadLogs(logsPage - 1);
});

document.getElementById('logs-next').addEventListener('click', async () => {
  await loadLogs(logsPage + 1);
});

if (getToken()) {
  showMain();
  Promise.all([loadSettings(), loadWhitelist(), loadLogs(1)]).catch(() => {
    setToken(null);
    showLogin();
  });
}
