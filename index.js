(() => {
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); };
/* iOS 滚动锁定：overflow:hidden 在 iOS 锁不住，改用 position:fixed 定版（带计数，支持弹窗叠开） */
let _lockN = 0, _lockY = 0;
function lockBody(on) {
  _lockN = Math.max(0, _lockN + (on ? 1 : -1));
  const b = document.body;
  if (_lockN > 0 && !b.classList.contains('locked')) { _lockY = window.scrollY || 0; b.style.top = `-${_lockY}px`; b.classList.add('locked'); }
  else if (_lockN === 0 && b.classList.contains('locked')) { b.classList.remove('locked'); b.style.top = ''; jumpTo(_lockY); }
}
window.lockBody = lockBody;
/* 瞬时定位：临时关掉全站平滑滚动，避免还原/回顶时画面滑动 */
function jumpTo(y) {
  const root = document.documentElement, prev = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, y);
  root.style.scrollBehavior = prev;
}
window.jumpTo = jumpTo;


/* 开屏：2.05s 落幕，点击跳过；JS 异常时 CSS 兜底 4s 自行隐去 */
(() => {
  var sp = document.getElementById('splash');
  if(!sp) return;
  var seen = false; try { seen = !!sessionStorage.nySplash; } catch (e) {}
  var deep = !!location.hash && location.hash !== '#/' && location.hash !== '#';
  if (seen || deep) { sp.remove(); try { sessionStorage.nySplash = '1'; } catch (e) {} return; }
  try { sessionStorage.nySplash = '1'; } catch (e) {}
  var done = false;
  function dismiss(){
    if(done) return; done = true;
    sp.classList.add('done');
    document.body.classList.remove('booting');
    setTimeout(function(){ sp.remove(); }, 700);
  }
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){ sp.remove(); return; }
  document.body.classList.add('booting');
  sp.addEventListener('click', dismiss);
  addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });
  setTimeout(dismiss, 2600);
})();


/* ===== 我的反馈（真实接口） ===== */
const DEPT_IDS = { '综合办公室': 1, '经营管理部': 2, '运行管理部': 3, '人事部': 4, '综合服务中心': 5, '电子档案管理中心': 6 };
const escHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pc = s => s === '待受理' ? 'p-wait' : s === '已回复' || s === '已办结' ? 'p-done' : 'p-doing';
const fGroup = code => code === 'PENDING_ACCEPTANCE' ? '待受理' : (code === 'REPLIED' || code === 'CLOSED') ? '已回复' : '办理中';
const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
const fmtTime = iso => { const d = new Date(iso); return isNaN(d) ? '' : fmtDay(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
let myItems = [], filter = 'all';
async function loadMine() {
  const list = $('#flist'); if (!list) return;
  list.innerHTML = '<li class="empty">正在加载…</li>';
  try {
    const data = await apiCall('/feedbacks');
    myItems = (Array.isArray(data) ? data : []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderList();
  } catch (e) { list.innerHTML = '<li class="empty">加载失败，请刷新重试。</li>'; }
}
function renderList() {
  const el = $('#flist'); if (!el) return;
  const rows = myItems.filter(i => filter === 'all' || fGroup(i.status) === filter);
  el.innerHTML = rows.length ? rows.map(i => `
   <li><button class="fitem reveal in" data-id="${i.public_id}" aria-label="查看详情：${escHtml(i.title)}">
     <div><div class="meta"><span class="mono">${i.public_id}</span><span>${escHtml(i.responsible_department_name || '')}</span><span>${fmtDay(i.created_at)} 提交</span></div>
     <h3>${escHtml(i.title)}</h3><p class="ex">${escHtml(i.latest_progress || i.description || '')}</p></div>
     <span class="pill ${pc(i.status_label)}">${escHtml(i.status_label)}</span><svg class="ic"><use href="#chev"/></svg></button></li>`).join('')
   : '<li class="empty">这里还没有建议，去<a href="#/write">写一条</a>试试。</li>';
}
$$('.f').forEach(b => b.onclick = () => { $$('.f').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); filter = b.dataset.f; renderList(); });
$('#flist').addEventListener('click', e => { const b = e.target.closest('.fitem'); if (b) openDrawer(b.dataset.id, b); });

/* drawer */
let lastFocus;
function stageOf(status) {
  if (status === 'REPLIED' || status === 'CLOSED') return 4;
  if (status === 'PENDING_ACCEPTANCE' || status === 'ACCEPTED') return 1;
  return 2;
}
async function openDrawer(publicId, from) {
  lastFocus = from || document.activeElement;
  let i = myItems.find(x => x.public_id === publicId);
  $('#dId').textContent = publicId;
  $('#dBody').innerHTML = '<div class="d-loading"><span class="d-spin" aria-hidden="true"></span>正在加载详情…</div>';
  $('#scrim').hidden = $('#drawer').hidden = false;
  lockBody(true);
  $('#dClose').focus();
  try { i = await apiCall('/feedbacks/' + encodeURIComponent(publicId)); }
  catch (e) {
    if (!i) { toast('详情加载失败，请稍后重试'); closeDrawer(); return; }
    toast('网络不稳，先显示最近一次的内容');
  }
  if ($('#drawer').hidden) return;
  renderDrawer(i);
}
function renderDrawer(i) {
  const dept = i.responsible_department_name || (i.employee_departments || []).map(d => d.name).join('、') || '';
  const msgs = Array.isArray(i.messages) ? i.messages : [];
  const replies = msgs.filter(m => m.sender_type !== 'EMPLOYEE');
  const lastReply = replies[replies.length - 1];
  const needSupply = i.status === 'WAITING_EMPLOYEE';
  const supplyHtml = (i.status !== 'CLOSED' && i.status !== 'REJECTED') ? `<div class="d-supply${needSupply ? ' urgent' : ''}" id="dSupply"${i.status === 'REPLIED' ? ' hidden' : ''}>${needSupply ? '<p class="d-supply-t">承办部门在等你补充</p><p class="d-supply-hint">把需要的信息补上，部门会接着办理你的建议。</p>' : '<p class="d-supply-t">补充说明</p>'}<label class="sr" for="dSupplyText">补充说明</label><textarea id="dSupplyText" rows="3" maxlength="2000" placeholder="有新情况要补充？写在这里，会发送给承办部门"></textarea><button class="btn primary sm" id="dSupplySend">发送补充</button></div>` : '';
  const age = stageOf(i.status);
  const steps = ['提交', '受理', '办理', '回复'];
  const tl = steps.map((s, k) => {
    const cls = k < age ? 'done' : k === age ? 'cur' : '';
    const note = k === 0 ? `<time>${fmtTime(i.created_at)}</time><p>已匿名归档</p>`
      : k === 3 && lastReply ? `<time>${fmtTime(lastReply.created_at)}</time><p>承办部门已答复</p>`
      : k === age && age < 4 ? (needSupply ? '<p>等你补充</p>' : '<p>进行中</p>') : '<p>尚未开始</p>';
    return `<li class="${cls}"><span class="n"></span><b>${s}</b>${note}</li>`;
  }).join('');
  $('#dId').textContent = i.public_id;
  $('#dBody').innerHTML = `<span class="pill ${pc(i.status_label)}">${escHtml(i.status_label)}</span><h2 id="dTitle">${escHtml(i.title)}</h2>
   <p class="d-sub">${escHtml(dept)} · ${fmtDay(i.created_at)} 提交</p><div class="d-q">${escHtml(i.description)}</div>
   ${needSupply ? supplyHtml : ''}<p class="d-sec">处理进度</p><ol class="tl">${tl}</ol><p class="d-sec">部门答复</p>
   ${replies.length ? replies.map(m => `<div class="reply"><div class="reply-h"><span>承办部门 答复</span><span>${fmtTime(m.created_at)}</span></div><div class="reply-b"><p>${escHtml(m.content)}</p></div></div>`).join('')
   : `<div class="d-empty">承办部门答复后会显示在这里，并通过站内消息通知你。</div>`}
   ${i.status === 'REPLIED' ? `<div class="d-actions"><button class="btn primary sm" id="dOk">这个答复解决了我的问题</button><button class="btn ghost sm" id="dMore">继续反馈</button></div>` : ''}
   ${needSupply ? '' : supplyHtml}`;
  const ok = $('#dOk'), more = $('#dMore'), supply = $('#dSupply');
  if (ok) ok.onclick = async () => {
    ok.disabled = true;
    try { await apiCall('/feedbacks/' + encodeURIComponent(i.public_id) + '/review', 'POST', { rating: 5, request_reopen: false }); toast('已评价，感谢你的反馈'); closeDrawer(); loadMine(); }
    catch (e) { toast(e.message || '提交失败'); ok.disabled = false; }
  };
  if (more && supply) more.onclick = () => { supply.hidden = false; more.disabled = true; $('#dSupplyText').focus(); };
  const send = $('#dSupplySend');
  if (send) send.onclick = async () => {
    const v = $('#dSupplyText').value.trim();
    if (!v) { toast('补充内容不能为空'); $('#dSupplyText').focus(); return; }
    send.disabled = true;
    try { await apiCall('/feedbacks/' + encodeURIComponent(i.public_id) + '/messages', 'POST', { content: v }); toast('已发送，承办部门会继续办理'); closeDrawer(); loadMine(); }
    catch (e) { toast(e.message || '发送失败'); send.disabled = false; }
  };
}
function closeDrawer() {
  const d = $('#drawer'), s = $('#scrim'); if (d.hidden) return;
  d.classList.add('closing'); s.classList.add('closing');
  setTimeout(() => { d.hidden = s.hidden = true; d.classList.remove('closing'); s.classList.remove('closing'); lockBody(false); lastFocus && lastFocus.focus(); }, 280);
}
$('#dClose').onclick = closeDrawer; $('#scrim').onclick = closeDrawer;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDrawer(); closeMenu(); }
  if (e.key === 'Tab' && !$('#drawer').hidden) { const f = $$('button,a', $('#drawer')); const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
});

/* ===== 真实账户认证 ===== */
const API = '/api/v1/employee';
let currentUser = null;
let guestView = false;
const isLogged = () => !!currentUser && !guestView;
let authReady = false;
let pendingRoute = null;
const menu = $('#acctMenu'), ab = $('#acctBtn');
function closeMenu() { menu.hidden = true; ab.setAttribute('aria-expanded', false); $('#logoutConfirm').hidden = true; }
ab.onclick = e => { e.stopPropagation(); const o = menu.hidden; closeMenu(); if (o) { menu.hidden = false; ab.setAttribute('aria-expanded', true); $('.menu-item', menu).focus(); } };
document.addEventListener('click', e => { if (!e.target.closest('.acct')) closeMenu(); });
$('#logoutBtn').onclick = () => { $('#logoutConfirm').hidden = false; $('#logoutYes').focus(); };
$('#logoutNo').onclick = () => { $('#logoutConfirm').hidden = true; };

async function apiCall(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  let data = null;
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((data && data.detail) || '请求失败（' + r.status + '）');
  return data;
}

function renderAuth() {
  const logged = isLogged();
  $('#guestToggle').textContent = guestView ? '退出访客视图' : '切换访客视图';
  document.body.classList.toggle('guest', !logged);
  ab.hidden = !logged;
  $('#loginBtn').hidden = logged;
  if (logged) {
    const name = currentUser.account || '用户';
    $('#chipAvatar').textContent = name[0].toUpperCase();
    $('#chipName').textContent = name;
    $('#menuName').textContent = name;
    $('#menuSub').textContent = currentUser.email_masked ? '邮箱 ' + currentUser.email_masked : '已登录';
  }
  updateBell();
  if (logged) loadNotifs();
}

async function checkAuth() {
  try {
    const me = await apiCall('/auth/me');
    if (me.authenticated) {
      // 后端只返回邮箱，用账号名需要从别处拿；先尝试从登录时保存的拿
      currentUser = { account: sessionStorage.authAccount || '用户', email: me.email, email_masked: me.email_masked };
    }
  } catch (e) { currentUser = null; }
  authReady = true;
  renderAuth();
}

/* 登录/注册弹窗 */
const authModal = $('#authModal');
function openAuth(tab = 'login') {
  switchAuthTab(tab);
  authModal.hidden = false;
  lockBody(true);
}
function closeAuth() { authModal.hidden = true; lockBody(false); }
function switchAuthTab(tab) {
  $$('.am-tab').forEach(t => { const on = t.dataset.atab === tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
  $('#loginForm').hidden = tab !== 'login';
  $('#registerForm').hidden = tab !== 'register';
  $('#loginErr').hidden = true; $('#registerErr').hidden = true;
}
$$('.am-tab').forEach(t => t.onclick = () => switchAuthTab(t.dataset.atab));
$$('#authModal [data-goto]').forEach(b => b.onclick = () => switchAuthTab(b.dataset.goto));
$('#authModal').addEventListener('click', e => { if (e.target.closest('[data-aclose]')) { pendingRoute = null; closeAuth(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !authModal.hidden) { pendingRoute = null; closeAuth(); } });

function showErr(id, msg) { const el = $(id); el.textContent = msg; el.hidden = false; }

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const account = $('#liAccount').value.trim(), password = $('#liPassword').value;
  if (!account || !password) return showErr('#loginErr', '请输入账号和密码');
  try {
    await apiCall('/auth/login', 'POST', { account, password });
    sessionStorage.authAccount = account;
    currentUser = { account }; guestView = false;
    await checkAuth();
    closeAuth();
    if (pendingRoute) { const p = pendingRoute; pendingRoute = null; location.hash = p; }
    toast('欢迎回来，' + account);
  } catch (err) { showErr('#loginErr', err.message); }
};

$('#registerForm').onsubmit = async e => {
  e.preventDefault();
  const account = $('#rgAccount').value.trim(), password = $('#rgPassword').value, password2 = $('#rgPassword2').value;
  if (!account) return showErr('#registerErr', '请输入账号');
  if (password.length < 8) return showErr('#registerErr', '密码至少 8 位');
  if (password !== password2) return showErr('#registerErr', '两次输入的密码不一致');
  try {
    await apiCall('/auth/register', 'POST', { account, password, password_confirmation: password2 });
    sessionStorage.authAccount = account;
    currentUser = { account }; guestView = false;
    await checkAuth();
    closeAuth();
    if (pendingRoute) { const p = pendingRoute; pendingRoute = null; location.hash = p; }
    toast('注册成功，欢迎 ' + account);
  } catch (err) { showErr('#registerErr', err.message); }
};

$('#loginBtn').onclick = e => { e.preventDefault(); openAuth('login'); };
$('#logoutYes').onclick = async () => {
  closeMenu();
  try { await apiCall('/auth/logout', 'POST'); } catch (e) {}
  currentUser = null; guestView = false; sessionStorage.removeItem('authAccount');
  renderAuth(); location.hash = '#/'; toast('已退出登录');
};
$('#guestToggle').onclick = () => {
  guestView = !guestView;
  closeMenu();
  renderAuth();
  toast(guestView ? '已进入访客视图：顶部为未登录状态，写建议和我的反馈需登录' : '已回到账户视图');
};
$('#settingsBtn').onclick = () => { closeMenu(); toast('个人设置暂未开放'); };

// 页面加载时检查登录状态
checkAuth();

/* ===== 站内通知 ===== */
let notifItems = [], notifUnread = 0, notifLoadedAt = 0;
function closeBell() { const m = $('#bellMenu'); if (m) m.hidden = true; const b = $('#bellBtn'); if (b) b.setAttribute('aria-expanded', false); }
function updateBell() {
  const btn = $('#bellBtn'); if (!btn) return;
  const logged = isLogged();
  btn.hidden = !logged;
  const bd = $('#bellBadge');
  bd.hidden = !(logged && notifUnread > 0);
  bd.textContent = notifUnread > 99 ? '99+' : String(notifUnread);
}
async function loadNotifs(force) {
  if (!isLogged()) return;
  if (!force && Date.now() - notifLoadedAt < 30000) return;
  notifLoadedAt = Date.now();
  try {
    const d = await apiCall('/notifications');
    notifItems = Array.isArray(d.items) ? d.items : [];
    notifUnread = d.unread || 0;
    updateBell(); renderNotifs();
  } catch (e) { notifLoadedAt = 0; }
}
function renderNotifs() {
  const el = $('#bellList'); if (!el) return;
  el.innerHTML = notifItems.length ? notifItems.map(n => `<button type="button" class="bell-item${n.is_read ? '' : ' unread'}" data-pub="${escHtml(n.public_id || '')}" data-nid="${n.id}"><span class="bell-dot" aria-hidden="true"></span><span class="bell-main"><b>${escHtml(n.title || '反馈有新进展')}</b><span>${escHtml(n.content || '')}</span><time>${escHtml(n.public_id || '')} · ${fmtTime(n.created_at)}</time></span></button>`).join('')
    : '<p class="bell-empty">暂时没有通知，反馈有新进展会第一时间告诉你。</p>';
}
$('#bellBtn').onclick = e => { e.stopPropagation(); const m = $('#bellMenu'); const o = m.hidden; closeBell(); closeMenu(); if (o) { m.hidden = false; $('#bellBtn').setAttribute('aria-expanded', true); loadNotifs(true); pushRefresh(); } };
document.addEventListener('click', e => { if (!e.target.closest('.bell-wrap')) closeBell(); });
$('#bellAll').onclick = async () => {
  try { await apiCall('/notifications/read-all', 'POST'); } catch (e) {}
  notifItems.forEach(n => { n.is_read = 1; }); notifUnread = 0; updateBell(); renderNotifs();
};
$('#bellList').addEventListener('click', async e => {
  const b = e.target.closest('.bell-item'); if (!b) return;
  const pub = b.dataset.pub, nid = b.dataset.nid;
  const item = notifItems.find(n => String(n.id) === String(nid));
  if (item && !item.is_read) {
    item.is_read = 1; notifUnread = Math.max(0, notifUnread - 1); updateBell();
    try { await apiCall('/notifications/' + nid + '/read', 'POST'); } catch (e) {}
  }
  closeBell();
  if (!pub) return;
  const cur = location.hash.replace(/^#/, '').split('?')[0];
  if (cur === '/mine') { loadMine().then(() => openDrawer(pub)); }
  else location.hash = '#/mine?open=' + encodeURIComponent(pub);
});

/* ===== 手机推送（Web Push） ===== */
const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function b64ToU8(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); const a = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return a; }
async function pushRefresh() {
  const btn = $('#pushBtn'), hint = $('#pushHint');
  if (!btn) return;
  if (!PUSH_OK) { btn.hidden = true; if (hint) hint.textContent = '当前浏览器不支持推送'; return; }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()) { btn.disabled = true; btn.textContent = '开启'; if (hint) hint.textContent = '请先把本站添加到主屏幕，再从桌面图标打开来开启'; return; }
  if (Notification.permission === 'denied') { btn.disabled = true; btn.textContent = '开启'; if (hint) hint.textContent = '通知已被系统拒绝，请在浏览器设置中允许'; return; }
  btn.disabled = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    btn.textContent = sub ? '已开启' : '开启';
    btn.classList.toggle('on', !!sub);
    if (hint) hint.textContent = sub ? '反馈有进展会推送到这台手机' : '开启后，反馈有进展第一时间推送';
  } catch (e) { btn.textContent = '开启'; }
}
const pushBtnEl = $('#pushBtn');
if (pushBtnEl) pushBtnEl.onclick = async () => {
  if (!PUSH_OK) return;
  pushBtnEl.disabled = true;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try { await apiCall('/push/unsubscribe', 'POST', { endpoint: existing.endpoint }); } catch (e) {}
      await existing.unsubscribe();
      toast('手机推送已关闭');
    } else {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('没有拿到通知权限，可在系统设置里允许'); pushRefresh(); return; }
      const keyRes = await apiCall('/push/public-key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(keyRes.public_key) });
      const sj = sub.toJSON();
      await apiCall('/push/subscribe', 'POST', { endpoint: sj.endpoint, keys: { p256dh: sj.keys.p256dh, auth: sj.keys.auth } });
      toast('手机推送已开启');
    }
  } catch (e) { toast('开启失败，请稍后再试'); }
  pushRefresh();
};

/* write flow */
let step = 1; const draft = { topic: null, dept: null };
$$('.topic').forEach(t => t.onclick = () => {
    const on = t.getAttribute('aria-checked') === 'true';
    const cur = $$('.topic[aria-checked="true"]');
    if (on) { t.setAttribute('aria-checked', 'false'); }
    else if (cur.length < 2) { t.setAttribute('aria-checked', 'true'); }
    else { toast('最多选择 2 个部门'); }
    const sel = $$('.topic[aria-checked="true"]').map(x => x.dataset.d);
    draft.dept = sel.join('、'); draft.topic = sel.join('、');
    update(); saveDraft();
  });
$('.topics').addEventListener('keydown', e => { const ts = $$('.topic'), i = ts.indexOf(document.activeElement);
  if (['ArrowRight','ArrowDown'].includes(e.key)) { e.preventDefault(); ts[(i + 1) % ts.length].focus(); }
  if (['ArrowLeft','ArrowUp'].includes(e.key)) { e.preventDefault(); ts[(i - 1 + ts.length) % ts.length].focus(); } });
const body = $('#body'), ttl = $('#ttl'), hint = $('#bodyHint');
const DRAFT_KEY = () => 'ny-draft-' + ((currentUser && currentUser.account) || 'anon');
function saveDraft() { try { const d = { t: ttl.value, b: body.value, depts: $$('.topic[aria-checked="true"]').map(x => x.dataset.d) }; if (!d.t && !d.b && !d.depts.length) localStorage.removeItem(DRAFT_KEY()); else localStorage.setItem(DRAFT_KEY(), JSON.stringify(d)); } catch (e) {} }
function loadDraft() { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY()) || 'null'); return d && (d.t || d.b || (d.depts && d.depts.length)) ? d : null; } catch (e) { return null; } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY()); } catch (e) {} }
let touched = false;
body.addEventListener('input', () => { touched = true; update(); saveDraft(); });
body.addEventListener('blur', () => { touched = true; update(); });
ttl.addEventListener('input', () => { update(); saveDraft(); });
function validReason(s) {
  if (s === 1) return draft.topic ? '' : '请先选择承办部门（至少 1 个，最多 2 个）';
  if (s === 2) {
    if (ttl.value.trim().length < 4) return '标题至少填写 4 个字';
    if (body.value.trim().length < 10) return '建议内容还差 ' + (10 - body.value.trim().length) + ' 个字（至少 10 个字）';
  }
  return '';
}
function valid(s) { return !validReason(s); }
let lastSubmission = null;
function update() {
  const n = body.value.trim().length;
  $('#count').textContent = `${body.value.length}/500`;
  hint.className = 'hint' + (n >= 10 ? ' ok' : touched && n > 0 ? ' warn' : '');
  hint.textContent = n >= 10 ? '描述清楚了，谢谢' : touched && n > 0 ? `再写 ${10 - n} 个字就可以了` : '至少 10 个字';
  $('#footMsg').textContent = step === 1 && !draft.topic ? '请选择部门（可单选或多选）' : step === 2 && !valid(2) ? (ttl.value.trim() ? '' : '还差一个标题') : '';
}
function go(s, back) {
  step = s;
  $$('.stage').forEach(x => { const on = +x.dataset.step === s; x.hidden = !on; if (on) { x.classList.toggle('back-anim', !!back); x.style.animation = 'none'; x.offsetHeight; x.style.animation = ''; } });
  $$('.steps li[data-s]').forEach(li => { const k = +li.dataset.s; li.classList.toggle('cur', k === s); li.classList.toggle('done', k < s); li.toggleAttribute('aria-current', k === s); });
  $$('.steps .bar').forEach((b, k) => b.classList.toggle('done', k + 1 < s));
  $('#pfoot').hidden = s === 4; $('.save-note').style.visibility = s === 4 ? 'hidden' : ''; $('.write-top .steps').style.visibility = s === 4 ? 'hidden' : '';
  $('#prevBtn').style.visibility = s === 1 ? 'hidden' : '';
  $('#nextBtn').textContent = s === 3 ? '确认提交' : '下一步';
  if (s === 3) { $('#sDept').textContent = draft.dept; $('#sTitle').textContent = ttl.value.trim(); $('#sBody').textContent = body.value.trim(); }
  if (s === 4 && lastSubmission) { $('#sid').textContent = lastSubmission.public_id; document.querySelector('.success .btn.primary').href = '#/mine?open=' + lastSubmission.public_id; }
  update();
  const h = $(`.stage[data-step="${s}"] h1`); h.tabIndex = -1; h.focus({ preventScroll: true });
}
$('#nextBtn').onclick = async () => {
  const r = validReason(step);
  if (r) { $('#footMsg').textContent = r; toast(r); return; }
  if (step < 3) { go(step + 1); return; }
  const btn = $('#nextBtn');
  btn.disabled = true; btn.textContent = '提交中…';
  try {
    const deptIds = $$('.topic[aria-checked="true"]').map(x => DEPT_IDS[x.dataset.d]).filter(Boolean);
    lastSubmission = await apiCall('/feedbacks', 'POST', { title: ttl.value.trim(), description: body.value.trim(), department_ids: deptIds, need_reply: true });
    clearDraft();
    go(4);
  } catch (e) { toast(e.message || '提交失败，请稍后重试'); }
  btn.disabled = false; btn.textContent = '确认提交';
};
$('#prevBtn').onclick = () => go(step - 1, true);
$$('[data-go]').forEach(b => b.onclick = () => go(+b.dataset.go, true));
$('.attach').onclick = () => toast('附件上传为原型占位');
window.__nyFill = (t, b, topic) => { $$('.topic').find(x => x.dataset.t === topic).click(); ttl.value = t; body.value = b; touched = true; update(); };
window.__nyGo = go;

/* router */
const views = $$('.view');
function route() {
  const [path, q] = location.hash.replace(/^#/, '').split('?');
  const name = { '/': 'home', '': 'home', '/write': 'write', '/mine': 'mine', '/help': 'help', '/pool': 'pool' }[path] || 'home';
  closeDrawer(); closeMenu();
  views.forEach(v => v.hidden = v.dataset.view !== name);
  $$('[data-nav]').forEach(a => { const on = a.dataset.nav === name; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  $('.foot').hidden = name === 'write';
  window.jumpTo(0);
  if (name === 'write' && !isLogged()) {
    if (!authReady) { setTimeout(route, 400); return; }
    pendingRoute = location.hash; openAuth('login'); location.hash = '#/'; return;
  }
  if (name === 'write') { draft.topic = null; draft.dept = null; $$('.topic').forEach(x => x.setAttribute('aria-checked', 'false')); ttl.value = body.value = ''; touched = false;
    const saved = loadDraft();
    if (saved) {
      (saved.depts || []).slice(0, 2).forEach(n => { const el = $$('.topic').find(x => x.dataset.d === n); if (el) el.setAttribute('aria-checked', 'true'); });
      const sel2 = $$('.topic[aria-checked="true"]').map(x => x.dataset.d);
      draft.dept = sel2.join('、'); draft.topic = sel2.join('、');
      ttl.value = saved.t || ''; body.value = saved.b || ''; touched = !!(saved.b && saved.b.trim());
      toast('已恢复上次未写完的草稿');
    }
    go(1); }
  const rmEl = $('#rulesModal');
  if (name !== 'pool' && rmEl && !rmEl.hidden) { rmEl.hidden = true; lockBody(false); }
  if (name === 'pool' && !sessionStorage.rulesSeen) { $('#rulesModal').hidden = false; lockBody(true); }
  if (name === 'mine') {
    if (!isLogged()) { if (!authReady) { setTimeout(route, 400); return; } pendingRoute = location.hash; openAuth('login'); location.hash = '#/'; return; }
    loadMine().then(() => { const m = /open=([\w-]+)/.exec(q || ''); if (m) setTimeout(() => openDrawer(m[1]), 250); });
  }
  if (name === 'help' && sessionStorage.scrollTo) { const el = $('#' + sessionStorage.scrollTo); sessionStorage.removeItem('scrollTo'); setTimeout(() => { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700); }, 60); }
  if (isLogged()) loadNotifs();
  observe();
}
$$('[data-scroll]').forEach(a => a.addEventListener('click', () => sessionStorage.scrollTo = a.dataset.scroll));
window.addEventListener('hashchange', route);

/* reveal */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px 15% 0px' }) : null;
function observe() { $$('.reveal:not(.in)').forEach((el, k) => { const sib = [...el.parentElement.children].filter(c => c.classList.contains('reveal')).indexOf(el); el.style.transitionDelay = (sib * 80) + 'ms'; io ? io.observe(el) : el.classList.add('in'); }); }
window.addEventListener('scroll', () => $('#nav').classList.toggle('scrolled', scrollY > 8), { passive: true });
route();
})();

/* 移动端点击震动反馈（轻点 8ms；iOS 不支持该 API，自动无感跳过） */
(() => {
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('button, a, input, textarea, select')) return;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) {}
  }, { passive: true });
})();

/* 移动端浮动导航：滑动即藏，画面静止 1.5 秒后出现（弹窗打开时不出现） */
(() => {
  const bar = document.querySelector('.mnav'); if (!bar) return;
  const mq = matchMedia('(max-width: 768px)');
  let lastY = window.scrollY || 0, idleT = null;
  const hide = () => bar.classList.remove('show');
  const tryShow = () => {
    if (document.body.classList.contains('locked')) { idleT = setTimeout(tryShow, 600); return; }
    bar.classList.add('show');
  };
  const arm = () => { clearTimeout(idleT); idleT = setTimeout(tryShow, 1500); };
  bar.classList.add('show'); arm();
  addEventListener('scroll', () => {
    if (!mq.matches) return;
    const y = window.scrollY || 0;
    if (Math.abs(y - lastY) > 2) { hide(); arm(); }
    lastY = y;
  }, { passive: true });
})();

/* ===== v1.1 mailbox ===== */
(() => {
const $ = s => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = [
 {id:'NY-20261008-012',dept:'电子档案管理中心',t:'查阅室开放时间<br>希望延长到周六',s:'done',date:'10月8日',q:'工作日来查档案总要请假，查阅室周末不开门很不方便。希望周六上午也能开放。',m:'自 11 月起，查阅室每周六上午 9:00–12:00 开放试行三个月；到期根据利用量决定是否延续。',lim:'11 月 1 日起试行',rd:'10月16日',x:22,y:78,r:-8},
 {id:'NY-20261011-004',dept:'电子档案管理中心',t:'老照片数字化<br>进度希望加快',s:'doing',date:'10月11日',q:'馆藏 80 年代的老照片很多还没数字化，查的时候只能看原件，担心损坏。希望加快扫描进度。',x:158,y:58,r:-1},
 {id:'NY-20260929-021',dept:'运行管理部',t:'库房温湿度<br>希望定期公示',s:'done',date:'9月29日',q:'档案库房的温湿度情况我们看不到，心里没底。希望能像其他馆一样定期公示。',m:'库房温湿度监测屏已安装完成，每日在馆内公告栏和内网同步公示；超标自动预警。',lim:'10 月 15 日起执行',rd:'10月12日',x:296,y:82,r:7},
 {id:'NY-20261002-007',dept:'电子档案管理中心',t:'电子档案检索<br>速度慢结果不准',s:'done',date:'10月2日',q:'在系统里搜档案，关键词稍微模糊一点就搜不出来，只能一页页翻，效率太低。',m:'检索系统已升级模糊匹配和全文检索；10 月底前完成历史数据索引重建。',lim:'10 月 31 日前',rd:'10月14日',x:54,y:158,r:4},
 {id:'NY-20261013-015',dept:'综合办公室',t:'档案借阅审批<br>流程希望简化',s:'doing',date:'10月13日',q:'借一份档案要跑三个部门签字，等一周才拿到。希望能线上审批、压缩环节。',x:184,y:148,r:-3},
 {id:'NY-20260921-005',dept:'人事部',t:'档案专业培训<br>名额太少',s:'done',date:'9月21日',q:'每年档案专业培训就两三个名额，年轻同志想学没机会。希望增加名额或搞线上培训。',m:'已与上级档案部门对接，新增 10 个线上培训名额；11 月起每月组织一次馆内业务交流。',lim:'11 月起执行',rd:'9月30日',x:302,y:162,r:6}
];
const box = $('#mbCards'); if (!box) return;
const GEO = C.map(c => ({ x: c.x, y: c.y, r: c.r }));
const PRI = [4, 3, 5, 1, 0, 2]; /* 槽位优先级：正中前排 → 前排两侧 → 后排正中 → 后排两侧 */
const byNew = [...C.keys()].sort((a, b) => +C[b].id.slice(3, 11) - +C[a].id.slice(3, 11));
let assign = []; PRI.forEach((slot, k) => { assign[slot] = byNew[k]; });
const cardHTML = c => `<span class="mc-top"><span class="mc-dept">${c.dept}</span><span class="mpill ${c.s}">${c.s === 'done' ? '已回复' : '办理中'}</span></span><span class="mc-title">${c.t}</span><span class="mc-id">${c.id}</span>`;
const bindBtn = (btn, ci) => { const c = C[ci]; btn.dataset.i = ci; btn.setAttribute('aria-label', `${c.t.replace('<br>', '')}，${c.dept}，${c.s === 'done' ? '已回复' : '办理中'}`); btn.innerHTML = cardHTML(c); };
box.innerHTML = C.map(() => '<div class="mb-slotwrap"><button class="mcard" aria-haspopup="dialog"></button></div>').join('');
[...box.children].forEach((w, i) => { const g = GEO[i], s = w.style;
 s.left = g.x + 'px'; s.top = g.y + 'px'; s.transform = 'rotate(' + g.r + 'deg)';
 s.zIndex = i < 3 ? 1 : 2; s.animationDelay = (-i * 1.3) + 's'; s.animationDuration = (6 + i % 3) + 's';
 bindBtn(w.firstElementChild, assign[i]); });
const ov = $('#mxOverlay'), stage = $('#mxStage'), card = $('#mxCard'), body = $('#mxBody');
/* 实时更新：最新一封常驻正中前排，其余卡片每 9 秒交叉淡化轮换一次位置 */
if (!RM) {
  let mbVisible = false, mbHover = false;
  new IntersectionObserver(es => { mbVisible = es[0].isIntersecting; }, { threshold: .25 }).observe(box);
  box.addEventListener('pointerenter', () => { mbHover = true; });
  box.addEventListener('pointerleave', () => { mbHover = false; });
  setInterval(() => {
    if (!mbVisible || mbHover || document.hidden || !stage.hidden) return;
    const rest = PRI.slice(1).map(s => assign[s]);
    rest.push(rest.shift());
    PRI.slice(1).forEach((s, k) => { assign[s] = rest[k]; });
    [...box.children].forEach((w, i) => {
      if (i === PRI[0]) return;
      const btn = w.firstElementChild;
      btn.style.pointerEvents = 'none';
      btn.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 340, easing: 'ease', fill: 'forwards' }).onfinish = e => {
        e.target.cancel();
        if (!stage.hidden) { btn.style.pointerEvents = ''; return; } /* 淡化期间详情被打开：放弃换绑，内容原样 */
        bindBtn(btn, assign[i]);
        btn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 460, easing: 'ease', fill: 'forwards' }).onfinish = ev => { ev.target.cancel(); btn.style.pointerEvents = ''; };
      };
    });
  }, 9000);
}
let src = null, busy = false;
const E = 'cubic-bezier(.2,.8,.2,1)';
function render(c) {
  const steps = ['提交', '受理', '办理', '回复'], n = c.s === 'done' ? 4 : 3;
  body.innerHTML = `<div class="mx-meta"><span class="mono">${c.id}</span><span>${c.dept}</span><span>${c.date} 提交</span></div>
   <h2 id="mxTitle">${c.t.replace('<br>', '')}</h2>
   <span class="mx-anon"><svg class="ic sm"><use href="#lock"/></svg>员工身份已隐去</span>
   <p class="mx-q">${c.q}</p>
   <ol class="mx-steps">${steps.map((s, k) => `<li class="${k < n - (c.s === 'done' ? 0 : 1) ? 'd' : k === n - 1 ? 'c' : ''}">${s}${k === 2 && c.s !== 'done' ? '<small>进行中</small>' : ''}</li>`).join('')}</ol>
   ${c.s === 'done' ? `<div class="mx-reply"><div class="mx-reply-h"><span>${c.dept} 答复</span><span>${c.rd}</span></div><dl class="mx-reply-b"><dt>措施</dt><dd>${c.m}</dd><dt>时限</dt><dd>${c.lim}</dd></dl></div>`
   : `<p class="mx-wait">承办部门正在办理，答复后会写明具体措施与时限。</p>`}
   `;
}
function fromTransform(el) {
  const a = el.getBoundingClientRect(), b = card.getBoundingClientRect();
  const mb = el.closest('.mailbox'), k = mb ? mb.getBoundingClientRect().width / mb.offsetWidth : 1;
  const sx = el.offsetWidth * k / b.width, sy = el.offsetHeight * k / b.height;
  const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const r = mb ? parseFloat(el.parentElement.style.rotate) || 0 : 0;
  return { dx, dy, sx, sy, r };
}
function open(el, fill) {
  if (busy) return; busy = true; src = el;
  box.querySelectorAll('.mcard').forEach(b => { b.getAnimations().forEach(an => an.cancel()); b.style.pointerEvents = ''; }); /* 掐掉轮换淡化：半透明卡被点开、回调换绑都会让卡片不落原位 */
  setTimeout(() => { if (busy && !stage.hidden) busy = false; }, 1500); /* 动画被中断时的兜底：避免关闭被永久锁死 */
  if (fill) fill(body); else render(C[+el.dataset.i]);
  ov.hidden = stage.hidden = false; lockBody(true);
  requestAnimationFrame(() => ov.classList.add('on'));
  if (RM) { card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); el.style.visibility = 'hidden'; busy = false; $('#mxClose').focus(); return; }
  const f = fromTransform(el);
  el.style.visibility = 'hidden';
  body.style.opacity = 0;
  const an = card.animate([
    { transform: `translate(${f.dx}px,${f.dy}px) rotate(${f.r}deg) scale(${f.sx},${f.sy})`, borderRadius: '60px' },
    { transform: `translate(${f.dx}px,${f.dy - 70}px) rotate(${f.r * .4}deg) scale(${f.sx * 1.06},${f.sy * 1.06})`, offset: .28 },
    { transform: 'none', borderRadius: '28px' }], { duration: 720, easing: E });
  setTimeout(() => body.style.opacity = 1, 380);
  const settle = () => { busy = false; try { $('#mxClose').focus(); } catch (e) {} };
  an.onfinish = settle;
  if ('oncancel' in an) an.oncancel = settle;
}
function close() {
  if (stage.hidden) return;
  try { card.getAnimations().forEach(a => a.cancel()); } catch (e) {}
  busy = true;
  ov.classList.add('bare'); ov.classList.remove('on');
  body.style.opacity = 0;
  const done = () => {
    if (stage.hidden) return;
    try { card.getAnimations().forEach(a => a.cancel()); } catch (e) {}
    card.classList.remove('thread'); ov.classList.remove('bare');
    stage.hidden = ov.hidden = true; lockBody(false);
    body.style.opacity = 1;
    if (src) { src.style.visibility = ''; try { src.focus({ preventScroll: true }); } catch (e) {} src = null; }
    busy = false;
  };
  setTimeout(() => { if (!stage.hidden) done(); }, 800);
  if (RM) { card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = done; return; }
  card.animate([
    { transform: 'none', opacity: 1 },
    { transform: 'translateY(16px) scale(.94)', opacity: 0 }
  ], { duration: 330, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).onfinish = done;
}
box.addEventListener('click', e => { const b = e.target.closest('.mcard'); if (b) open(b); });
window.__mx = { open, close }; $('#mxClose').onclick = close; ov.onclick = close;
stage.addEventListener('click', e => { if (e.target === stage) close(); });
stage.style.pointerEvents = 'none';
document.addEventListener('keydown', e => {
  if (stage.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); }
  if (e.key === 'Tab') { const f = [...card.querySelectorAll('button,a,textarea,input,[tabindex]:not([tabindex="-1"])')]; const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } else if (!card.contains(document.activeElement)) { e.preventDefault(); a.focus(); } }
});
})();

/* 最近办结卡：点开看全过程（复用信箱详情弹窗） */
(() => {
  if (!window.__mx) return;
  document.querySelectorAll('.rcard[data-i]').forEach(cd => {
    cd.addEventListener('click', () => window.__mx.open(cd));
    cd.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.__mx.open(cd); } });
  });
})();

/* ===== v1.1 树洞 ===== */
(() => {
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const animals = ['小松鼠','小刺猬','小水獭','小海豹','小麋鹿','小企鹅','小柴犬','小橘猫','小熊猫','小鲸鱼'];
const hues = ['#DCE7D9','#F6DCC4','#E9E1CF','#D9E3E6','#EBD9D2'];
let P = [
 {a:'匿名·小水獭',t:'业务交流',ago:'12 分钟前',m:'分享一个小技巧：整理照片档案时，先按年代粗分再按主题细分，比直接一件件看快很多。',l:24,r:[['匿名·小企鹅','已抄作业，这批老照片用上了。'],['匿名·小麋鹿','再加一栏「备注存疑」会更好。']]},
 {a:'匿名·小橘猫',t:'业务交流',ago:'35 分钟前',m:'查 90 年代的基建档案，发现当时的手绘图纸比现在的 CAD 图还清楚，线条是真的稳。',l:41,r:[['匿名·小柴犬','老一辈的功底确实扎实。'],['匿名·小松鼠','求问这批图数字化了没？'],['匿名·小鲸鱼','部分扫了，在系统里能查到。']]},
 {a:'匿名·小麋鹿',t:'活动组织',ago:'1 小时前',m:'下周三下午档案修复体验活动，有想一起去的吗？老师傅现场演示修补虫蛀档案。',l:18,r:[['匿名·小刺猬','算我一个，一直想看。']]},
 {a:'匿名·小熊猫',t:'闲聊',ago:'2 小时前',m:'今天在库房看到一卷 1985 年的胶片，画面里的老办公楼居然还在，时光感拉满。',l:57,r:[]},
 {a:'匿名·小企鹅',t:'业务交流',ago:'3 小时前',m:'编目时发现：同一事件的档案分散在三个全宗里，写利用指南时记得做互见索引，查的人会感谢你。',l:33,r:[['匿名·小水獭','这个真的救命。']]},
 {a:'匿名·小海豹',t:'通知提醒',ago:'今天 09:20',m:'提醒一下：查阅室新增了一台高拍仪，拍 A3 图纸不用再跑复印室了。',l:29,r:[['匿名·小熊猫','原来如此，昨天还以为是坏的。']]},
 {a:'匿名·小柴犬',t:'活动组织',ago:'昨天',m:'馆里想搞个「档案里的城市记忆」小展览，大家有推荐的老照片吗？我先推一张 92 年的老街。',l:22,r:[['匿名·小橘猫','我有一张 88 年的！'],['匿名·小海豹','可以搞个线上投票选展品。']]},
 {a:'匿名·小刺猬',t:'闲聊',ago:'昨天',m:'整理库房翻到一本 70 年代的工作手册，字迹工整得像印刷体，肃然起敬。',l:46,r:[]},
 {a:'匿名·小鲸鱼',t:'业务交流',ago:'2 天前',m:'数字化扫描时，老照片背后手写的时间地点别漏扫，那往往是最有价值的信息。',l:38,r:[['匿名·小麋鹿','好提醒，已经补扫了。']]}
].map((p, i) => ({ ...p, id: i, liked: false, ex: true, h: hues[i % hues.length] }));
let topic = '全部', sort = 'new', nid = 100;
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pavFix = r => r.querySelectorAll('.pav[data-h]').forEach(e => e.style.setProperty('--h', e.dataset.h));
const av = p => `<span class="pav" data-h="${p.h}" aria-hidden="true"></span>`;
const card = (p, teaser) => `<article class="pcard${teaser ? ' teaser' : ''}" data-id="${p.id}">
  <header class="pc-h">${av(p)}<span class="pc-a">${p.a}</span><span class="pc-time">${p.ago}</span></header>
  <button class="pc-open" aria-haspopup="dialog" aria-label="查看讨论：${esc(p.m.slice(0, 20))}">${esc(p.m)}</button>
  <footer class="pc-f">
   ${teaser ? `<span class="pc-stat">♥ ${p.l}</span><span class="pc-stat">💬 ${p.r.length}</span>` :
   `<button class="like${p.liked ? ' on' : ''}" aria-pressed="${p.liked}" aria-label="有同感，${p.l} 人"><span class="hrt">♥</span><span class="lc">${p.l}</span><span class="lt">有同感</span></button>
   <span class="pc-stat" aria-label="${p.r.length} 条回复">💬 ${p.r.length}</span>
   <span class="more"><button class="more-b" aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">…</button><span class="more-m" role="menu" hidden><button role="menuitem" class="rep">举报</button></span></span>`}
  </footer></article>`;
/* 首页树洞预告：与树洞同源，按新旧分组轮换播出，做"正在发生"的活人感 */
const tz = $('#poolTeaser');
let teaserShow = null;
if (tz) {
  const dots = $$('.pt-dot');
  let groups = [], gi = 0, hold = false, holdT = null, visible = false;
  const setLive = () => { const lt = $('#ptLiveTxt'); if (lt && P[0]) lt.textContent = '最新留言 · ' + P[0].ago; };
  const buildGroups = () => { const a = P.slice(0, 9); groups = [a.slice(0, 3), a.slice(3, 6), a.slice(6, 9)].filter(g => g.length); };
  const show = (n, anim = true) => {
    if (!groups.length) return;
    gi = ((n % groups.length) + groups.length) % groups.length;
    tz.innerHTML = groups[gi].map(p => card(p, true)).join('');
    pavFix(tz);
    if (anim && !RM) tz.querySelectorAll('.pcard').forEach((el, i) => { el.style.animationDelay = (i * 95) + 'ms'; el.classList.add('tenter'); });
    dots.forEach((d, i) => d.classList.toggle('on', i === gi));
  };
  buildGroups(); setLive(); show(0, false);
  teaserShow = () => { buildGroups(); setLive(); show(0, false); };
  if (!RM) {
    setInterval(() => { if (visible && !hold && !document.hidden) show(gi + 1); }, 5200);
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: .15 }).observe(tz);
    const holdOn = () => { hold = true; clearTimeout(holdT); holdT = setTimeout(() => { hold = false; }, 12000); };
    tz.addEventListener('pointerdown', holdOn);
    tz.addEventListener('pointerenter', () => { hold = true; });
    tz.addEventListener('pointerleave', () => { hold = false; });
    dots.forEach((d, i) => d.addEventListener('click', () => { show(i); holdOn(); }));
  }
}
/* 点首页预告卡 → 原地弹出详情（原帖 + 全部回复 + 回复框），不跳页 */
if (tz) {
  tz.addEventListener('click', e => {
    if (!e.target.closest('.pc-open')) return;
    const art = e.target.closest('.pcard'); if (!art) return;
    const p = P.find(x => x.id == art.dataset.id); if (p) openThread(art, p);
  });
}
const list = $('#poolList');
function render(newId) {
  let a = P.filter(p => topic === '全部' || p.t === topic);
  if (sort === 'hot') a = [...a].sort((x, y) => (y.l + y.r.length * 3) - (x.l + x.r.length * 3));
  list.innerHTML = a.length ? a.map(p => card(p)).join('') : '<p class="empty">这个话题还没有留言，来说第一句吧。</p>';
  pavFix(list);
  if (newId != null) { const el = list.querySelector(`[data-id="${newId}"]`); el && el.classList.add('enter'); }
}
render();
$$('.sort button').forEach(b => b.onclick = () => { $$('.sort button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); sort = b.dataset.s; render(); });
/* composer */
const tx = $('#pcText');
const usedAnimals = new Set(P.map(p => p.a.replace('匿名·', '')));
const freeAnimals = animals.filter(a => !usedAnimals.has(a));
let alias = '匿名·' + (freeAnimals.length ? freeAnimals[Math.floor(Math.random() * freeAnimals.length)] : animals[0]);
tx.oninput = () => { const n = tx.value.trim().length; $('#pcCount').textContent = `${tx.value.length}/200`; $('#pcSend').disabled = n < 2; };
$('#composer').onsubmit = e => { e.preventDefault(); const m = tx.value.trim(); if (m.length < 2) return;
  const p = { id: nid++, a: alias, t: '业务交流', ago: '刚刚', m, l: 0, r: [], liked: false, ex: false, h: hues[nid % hues.length] };
  P.unshift(p); if (teaserShow) teaserShow(); tx.value = ''; tx.oninput();
  sort = 'new'; $$('.sort button').forEach((x, i) => x.classList.toggle('on', !i)); render(p.id);
};
/* card interactions */
list.addEventListener('click', e => {
  const art = e.target.closest('.pcard'); if (!art) return; const p = P.find(x => x.id == art.dataset.id);
  const lk = e.target.closest('.like');
  if (lk) { p.liked = !p.liked; p.l += p.liked ? 1 : -1; lk.classList.toggle('on', p.liked); lk.setAttribute('aria-pressed', p.liked); lk.querySelector('.lc').textContent = p.l;
    lk.classList.remove('pop'); void lk.offsetWidth; p.liked && lk.classList.add('pop'); return; }
  const mb = e.target.closest('.more-b');
  if (mb) { const m = mb.nextElementSibling; const o = m.hidden; $$('.more-m').forEach(x => x.hidden = true); m.hidden = !o; mb.setAttribute('aria-expanded', o); o && m.querySelector('button').focus(); return; }
  if (e.target.closest('.rep')) { e.target.closest('.more-m').hidden = true; toast('已举报，管理员会尽快审核'); return; }
  if (e.target.closest('.pc-open')) openThread(art, p);
});
document.addEventListener('click', e => { if (!e.target.closest('.more')) $$('.more-m').forEach(x => x.hidden = true); });
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }
function thread(body, p) {
  body.innerHTML = `<div class="mx-meta"><span>树洞 · 同事可见</span></div>
   <div class="th-post"><header class="pc-h">${av(p)}<span class="pc-a">${p.a}</span><span class="pc-time">${p.ago}</span></header><h2 id="mxTitle" class="th-text">${esc(p.m)}</h2>
   <p class="th-stat">♥ ${p.l} 人有同感 · 💬 ${p.r.length} 条回复</p></div>
   <ul class="th-replies">${p.r.map(r => `<li><span class="pav sm" data-h="${hues[r[0].length % 5]}"></span><div><b>${r[0]}</b><p>${esc(r[1])}</p></div></li>`).join('') || '<li class="th-empty">还没有回复，来说第一句吧。</li>'}</ul>
   <form class="th-form"><label class="sr" for="thIn">回复</label><textarea id="thIn" rows="2" maxlength="200" placeholder="友善回复，以「${alias}」身份发布"></textarea><button class="btn primary sm" type="submit">回复</button></form>
   `;
  pavFix(body);
  body.querySelector('.th-form').onsubmit = e => { e.preventDefault(); const v = body.querySelector('#thIn').value.trim(); if (!v) { toast('回复内容不能为空'); body.querySelector('#thIn').focus(); return; }
    p.r.push([alias, v]); const ul = body.querySelector('.th-replies'); ul.querySelector('.th-empty')?.remove();
    ul.insertAdjacentHTML('beforeend', `<li class="enter"><span class="pav sm" data-h="${hues[2]}"></span><div><b>${alias}</b><p>${esc(v)}</p></div></li>`);
    pavFix(ul);
    body.querySelector('#thIn').value = ''; body.querySelector('.th-stat').textContent = `♥ ${p.l} 人有同感 · 💬 ${p.r.length} 条回复`; render(); };
}
function openThread(art, p) { $('#mxCard').classList.add('thread'); window.__mx.open(art, b => thread(b, p)); }
})();

const JD=[
 {n:'01',t:'提交',time:'即时',d:'写下建议，点提交就好，剩下的交给平台。',p:['身份信息自动隐去，承办部门看不到你是谁','提交后立即生成编号，可在「我的反馈」查进度','内容仅用于办理，不会用作其他用途']},
 {n:'02',t:'受理',time:'2 个工作日内',d:'平台运营先看一遍，确认内容清楚、归属明确，再分派给对口的承办部门。',p:['核对建议是否完整，主题归属是否准确','分派给对应的承办部门并设定办理时限','分派完成后，你会收到一条受理通知']},
 {n:'03',t:'办理',time:'一般 10 个工作日',d:'承办部门真正干活的阶段：调研、讨论、定措施。',p:['部门内部调研核实，必要时多方讨论','制定具体措施和完成时限','复杂事项可申请延长，会告诉你原因']},
 {n:'04',t:'回复',time:'办结即通知',d:'事情有了结果，部门给出书面答复，你第一时间收到。',p:['答复说清：做什么、谁来做、何时完成','回复同步推送到「我的反馈」','对答复不满意，可以继续追问']}
];
function initJourney(){
 const j=document.querySelector('#journey');if(!j)return;
 const d=document.querySelector('#jdetail');
 function show(i){
  j.querySelectorAll('li').forEach((li,k)=>li.classList.toggle('on',k===i));
  const x=JD[i];
  document.querySelector('#jdNum').textContent=x.n;
  document.querySelector('#jdTitle').textContent=x.t;
  document.querySelector('#jdTime').textContent=x.time;
  document.querySelector('#jdDesc').textContent=x.d;
  document.querySelector('#jdPoints').innerHTML=x.p.map(p=>'<li>'+p+'</li>').join('');
  d.hidden=false;
  d.classList.remove('show');void d.offsetWidth;d.classList.add('show');
 }
 j.addEventListener('mouseover',e=>{const li=e.target.closest('li[data-j]');if(li)show(+li.dataset.j)});
 j.addEventListener('click',e=>{const li=e.target.closest('li[data-j]');if(li)show(+li.dataset.j)});
 j.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const li=e.target.closest('li[data-j]');if(li){e.preventDefault();show(+li.dataset.j)}}});
 // 默认显示第一步
 show(0);
}
initJourney();

/* 发言公约弹窗关闭（按钮/遮罩/Esc 均可关） */
function closeRules() {
  const rm = document.querySelector('#rulesModal');
  if (!rm || rm.hidden) return;
  sessionStorage.rulesSeen = '1';
  rm.hidden = true;
  lockBody(false);
}
document.addEventListener('click', e => {
  if (e.target.closest('#rulesModal [data-close]')) closeRules();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeRules();
});

/* 最近办结：移动端横滑圆点指示 */
(() => {
  const track = document.querySelector('.cards3');
  const dots = document.querySelectorAll('.rdots span');
  if (!track || !dots.length) return;
  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const w = track.scrollWidth - track.clientWidth;
      const idx = w > 0 ? Math.round((track.scrollLeft / w) * (dots.length - 1)) : 0;
      dots.forEach((d, k) => d.classList.toggle('on', k === idx));
      ticking = false;
    });
  }, { passive: true });
})();
