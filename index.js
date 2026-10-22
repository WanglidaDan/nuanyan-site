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
  var seen = false, splashOff = false, rmSet = false;
  try { seen = !!localStorage.nySplashSeen; const s = JSON.parse(localStorage.getItem('ny-settings') || '{}'); splashOff = s.splash === false; rmSet = s.rm === 'on'; } catch (e) {}
  var deep = !!location.hash && location.hash !== '#/' && location.hash !== '#';
  if (seen || deep || splashOff || rmSet) { sp.remove(); try { localStorage.nySplashSeen = '1'; } catch (e) {} return; }
  try { localStorage.nySplashSeen = '1'; } catch (e) {}
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
const pc = code => code === 'PENDING_ACCEPTANCE' || code === 'ACCEPTED' ? 'p-wait'
  : code === 'WAITING_EMPLOYEE' ? 'p-back'
  : code === 'REPLIED' || code === 'CLOSED' ? 'p-done'
  : code === 'REJECTED' || code === 'WITHDRAWN' ? 'p-end' : 'p-doing';
const fGroup = code => code === 'WAITING_EMPLOYEE' ? 'supply'
  : code === 'PENDING_ACCEPTANCE' || code === 'ACCEPTED' ? 'pending'
  : code === 'WAITING_REVIEW' ? 'review'
  : code === 'REPLIED' ? 'replied'
  : code === 'CLOSED' ? 'closed'
  : code === 'REJECTED' || code === 'WITHDRAWN' ? 'ended' : 'doing';
const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
const fmtTime = iso => { const d = new Date(iso); return isNaN(d) ? '' : fmtDay(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
let myItems = [], filter = 'all', mineQuery = '', mineScrollY = 0;
const mainGroup = code => code === 'WAITING_EMPLOYEE' ? 'mine'
  : code === 'REPLIED' ? 'replied'
  : code === 'CLOSED' || code === 'WITHDRAWN' || code === 'REJECTED' ? 'ended' : 'doing';
function itemMatches(i) {
  if (mineQuery) {
    const q = mineQuery.toLowerCase();
    if (!(i.title || '').toLowerCase().includes(q) && !(i.public_id || '').toLowerCase().includes(q)) return false;
  }
  if (filter === 'all') return true;
  if (filter.startsWith('fine:')) return i.status === filter.slice(5);
  return mainGroup(i.status) === filter;
}
async function loadMine() {
  const list = $('#flist'); if (!list) return;
  list.innerHTML = '<li class="empty">正在加载…</li>';
  try {
    const data = await apiCall('/feedbacks');
    myItems = (Array.isArray(data) ? data : []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderList();
  } catch (e) { list.innerHTML = '<li class="empty">加载失败，请检查网络后重试。<button type="button" class="link" id="fRetry">重新加载</button></li>'; const rb = $('#fRetry'); if (rb) rb.onclick = () => loadMine(); }
}
function updateFilterCounts() {
  const b = $('#fSupplyN'); if (!b) return;
  const n = myItems.filter(i => i.status === 'WAITING_EMPLOYEE').length;
  b.hidden = !n; b.textContent = n;
}
function syncFilterChips() {
  $$('.filters .f[data-f]').forEach(x => { const on = filter === x.dataset.f; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
  const fb = $('#fineBtn'); if (fb) fb.classList.toggle('on', filter.startsWith('fine:'));
}
function renderList() {
  const el = $('#flist'); if (!el) return;
  updateFilterCounts(); syncFilterChips();
  const rows = myItems.filter(itemMatches);
  if (!rows.length) {
    if (!myItems.length) el.innerHTML = '<li class="empty">你还没有提交过建议，去<a href="#/write">写一条</a>试试。</li>';
    else if (mineQuery) el.innerHTML = `<li class="empty">没有找到与「${escHtml(mineQuery)}」相关的建议。<button type="button" class="link" id="fClearQ">清除搜索</button></li>`;
    else el.innerHTML = '<li class="empty">暂无该状态的建议。<button type="button" class="link" id="fShowAll">查看全部</button></li>';
    const b = $('#fShowAll'); if (b) b.onclick = () => { filter = 'all'; renderList(); };
    const cq = $('#fClearQ'); if (cq) cq.onclick = () => { mineQuery = ''; const s = $('#mineSearch'); if (s) s.value = ''; renderList(); };
    return;
  }
  el.innerHTML = rows.map(i => {
    const empIds = i.employee_department_ids || [];
    let dept = i.responsible_department_name || '';
    if (dept && (!empIds.length || (i.responsible_department_id && !empIds.includes(i.responsible_department_id)))) dept += '（平台分派）';
    if (!dept && !empIds.length) dept = '由平台分派';
    const act = i.status === 'WAITING_EMPLOYEE' ? '<button type="button" class="f-act">去补充</button>' : '';
    return `
   <li class="frow"><article class="fitem" data-id="${i.public_id}" tabindex="0" role="button" aria-label="查看详情：${escHtml(i.title)}">
     <div class="f-top"><h3>${escHtml(i.title)}</h3><span class="pill ${pc(i.status)}">${escHtml(i.status_label)}</span></div>
     <p class="f-dept">承办部门：${escHtml(dept)}</p>
     <p class="ex">${escHtml(i.latest_progress || i.description || '')}</p>
     <div class="f-meta"><span class="mono">${i.public_id}</span><span>${fmtDay(i.created_at)} 提交</span><span class="f-due">预计答复：${i.due_at ? fmtDay(i.due_at) : '暂未确定'}</span>${act}</div>
   </article></li>`;
  }).join('');
}
$$('.filters .f[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; renderList(); });
const fineBtn = $('#fineBtn'), fineMenu = $('#fineMenu');
if (fineBtn && fineMenu) {
  fineBtn.onclick = e => { e.stopPropagation(); const o = fineMenu.hidden; fineMenu.hidden = !o; fineBtn.setAttribute('aria-expanded', String(o)); };
  fineMenu.addEventListener('click', e => { const b = e.target.closest('[data-fine]'); if (!b) return; filter = 'fine:' + b.dataset.fine; fineMenu.hidden = true; fineBtn.setAttribute('aria-expanded', 'false'); renderList(); });
  document.addEventListener('click', e => { if (!e.target.closest('.fine-wrap')) { fineMenu.hidden = true; fineBtn.setAttribute('aria-expanded', 'false'); } });
}
const mineSearchEl = $('#mineSearch');
if (mineSearchEl) mineSearchEl.addEventListener('input', () => { mineQuery = mineSearchEl.value.trim(); renderList(); });
$('#flist').addEventListener('click', e => { const b = e.target.closest('.fitem'); if (b) openDrawer(b.dataset.id, b); });
$('#flist').addEventListener('keydown', e => { const b = e.target.closest('.fitem'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDrawer(b.dataset.id, b); } });

/* drawer */
let lastFocus;
function drawerStages(i) {
  const st = i.status;
  const acts = Array.isArray(i.timeline) ? i.timeline : [];
  const msgs = Array.isArray(i.messages) ? i.messages : [];
  const replies = msgs.filter(m => m.sender_type !== 'EMPLOYEE');
  const lastReply = replies[replies.length - 1];
  const firstActTo = codes => acts.find(x => codes.includes(x.to_status)) || null;
  const lastActTo = codes => { const a = acts.filter(x => codes.includes(x.to_status)); return a.length ? a[a.length - 1] : null; };
  const accAct = firstActTo(['ACCEPTED', 'PROCESSING', 'VERIFYING']);
  const accTime = i.accepted_at || (accAct && accAct.created_at) || null;
  const procAct = lastActTo(['PROCESSING', 'VERIFYING', 'REOPENED']);
  const repAct = lastActTo(['REPLIED']);
  const reachedAccept = st !== 'PENDING_ACCEPTANCE';
  const reachedProcess = !['PENDING_ACCEPTANCE', 'ACCEPTED'].includes(st);
  const reachedReply = ['REPLIED', 'CLOSED'].includes(st);
  const stages = [
    { name: '提交', state: 'done', time: i.created_at, note: '已匿名归档' },
    { name: '受理', state: reachedAccept ? 'done' : 'cur', time: accTime, note: reachedAccept ? '' : '等待平台受理' },
    { name: '办理', state: 'todo', time: procAct ? procAct.created_at : null, note: '' },
    { name: '回复', state: 'todo', time: lastReply ? lastReply.created_at : (repAct ? repAct.created_at : (st === 'CLOSED' ? i.closed_at : null)), note: '' },
  ];
  if (st === 'WAITING_EMPLOYEE') { stages[2].state = 'cur'; stages[2].note = '等你补充'; }
  else if (st === 'WAITING_REVIEW') { stages[2].state = 'done'; stages[3].state = 'cur'; stages[3].note = '回复待审核'; }
  else if (st === 'REOPENED') { stages[2].state = 'cur'; stages[2].note = '重新办理中'; }
  else if (reachedReply) { stages[2].state = 'done'; stages[3].state = 'done'; stages[3].note = '承办部门已答复'; }
  else if (reachedProcess) { stages[2].state = 'cur'; stages[2].note = '进行中'; }
  if (st === 'REJECTED') { stages[1].state = 'done'; stages[1].note = '未通过受理'; stages[2].state = 'todo'; stages[2].time = null; stages[2].note = ''; stages[3].state = 'todo'; stages[3].time = null; stages[3].note = ''; }
  if (st === 'WITHDRAWN') { stages[1].state = 'todo'; stages[1].note = '已撤回'; stages[2].state = 'todo'; stages[2].time = null; stages[2].note = '已终止'; stages[3].state = 'todo'; stages[3].time = null; stages[3].note = ''; }
  return stages;
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
  const st = i.status;
  const empIds = i.employee_department_ids || [];
  const respName = i.responsible_department_name || '';
  let deptTxt = respName || (i.employee_departments || []).map(d => d.name).join('、') || '待分派';
  if (respName && (!empIds.length || (i.responsible_department_id && !empIds.includes(i.responsible_department_id)))) deptTxt = respName + '（平台分派）';
  if (!respName && !empIds.length) deptTxt = '由平台分派';
  const msgs = Array.isArray(i.messages) ? i.messages : [];
  const acts = Array.isArray(i.timeline) ? i.timeline : [];
  const replies = msgs.filter(m => m.sender_type !== 'EMPLOYEE');
  const sups = msgs.filter(m => m.sender_type === 'EMPLOYEE');
  const needSupply = st === 'WAITING_EMPLOYEE';
  const canSupply = !['CLOSED', 'REJECTED', 'WITHDRAWN'].includes(st);
  let returnHtml = '';
  if (needSupply) {
    const ra = [...acts].reverse().find(x => x.to_status === 'WAITING_EMPLOYEE');
    const hasReason = ra && (ra.content || '').trim() && !/^状态由/.test(ra.content);
    returnHtml = `<div class="d-return"><p class="d-return-t">部门退回补充${ra ? ' · ' + fmtTime(ra.created_at) : ''}</p><p class="d-return-b">${hasReason ? escHtml(ra.content) : '部门未填写具体原因。请根据你的建议内容补充相关信息；拿不准要补什么，也可以在补充框里一并说明。'}</p></div>`;
  }
  let expectHtml = '';
  if (!['CLOSED', 'REJECTED', 'WITHDRAWN'].includes(st)) {
    const dueT = i.due_at ? new Date(i.due_at).getTime() : NaN;
    if (!isNaN(dueT)) {
      const overdue = Date.now() > dueT && st !== 'REPLIED' && st !== 'WAITING_REVIEW';
      expectHtml = `<div class="d-expect"><p>预计答复：<b>${fmtDay(i.due_at)}前</b>${overdue ? ' · <span class="d-over">已超过预计日期，部门延期会在进度中说明原因与新日期</span>' : ''}</p><p class="d-expect-s">受理 2 个工作日内 · 办理一般 10 个工作日，复杂事项会先回复阶段计划。</p></div>`;
    } else {
      expectHtml = '<div class="d-expect"><p>受理 2 个工作日内，办理一般 10 个工作日内答复；有进展会第一时间通知你。</p></div>';
    }
  }
  const stages = drawerStages(i);
  const tl = stages.map(s => `<li class="${s.state === 'done' ? 'done' : s.state === 'cur' ? 'cur' : ''}"><span class="n"></span><b>${s.name}</b>${s.time ? `<time>${fmtTime(s.time)}</time>` : ''}<p>${s.note ? escHtml(s.note) : s.state === 'done' ? '已完成' : s.state === 'todo' ? '尚未开始' : '进行中'}</p></li>`).join('');
  const supTag = m => {
    const re = acts.find(x => x.action_type === 'EMPLOYEE_REPLIED' && new Date(x.created_at) >= new Date(m.created_at));
    if (re) return '<span class="sup-tag">已重新进入办理</span>';
    return m.read_at ? '<span class="sup-tag">承办部门已查看</span>' : '<span class="sup-tag">已送达</span>';
  };
  const supHtml = sups.length ? `<p class="d-sec">我的补充（${sups.length}）</p>` + sups.map(m => `<div class="sup"><div class="sup-h"><span>${fmtTime(m.created_at)}</span>${supTag(m)}</div><p>${escHtml(m.content)}</p></div>`).join('') : '';
  const supplyBox = canSupply ? `<div class="d-supply${needSupply ? ' urgent' : ''}" id="dSupply"${st === 'REPLIED' ? ' hidden' : ''}>${needSupply ? '<p class="d-supply-t">承办部门在等你补充</p><p class="d-supply-hint">按上方退回原因把信息补上，发送后会重新进入办理。</p>' : '<p class="d-supply-t">补充说明</p>'}<label class="sr" for="dSupplyText">补充说明</label><textarea id="dSupplyText" rows="3" maxlength="2000" placeholder="有新情况要补充？写在这里，会发送给承办部门"></textarea><button class="btn primary sm" id="dSupplySend">发送补充</button></div>` : '';
  let actionsHtml = '';
  if (st === 'REPLIED' && !i.review) actionsHtml += `<div class="d-actions"><button class="btn primary sm" id="dOk">这个答复解决了我的问题</button><button class="btn ghost sm" id="dMore">继续反馈</button></div>`;
  if (i.review) actionsHtml += `<div class="d-reviewed">已评价 ${'★'.repeat(i.review.rating)}${'☆'.repeat(5 - i.review.rating)} · ${fmtTime(i.review.created_at)}</div>`;
  if (st === 'CLOSED') {
    const closedT = i.closed_at ? new Date(i.closed_at).getTime() : NaN;
    if (!isNaN(closedT) && Date.now() - closedT <= 30 * 864e5) actionsHtml += `<div class="d-actions"><button class="btn ghost sm" id="dReopenBtn">继续反馈</button></div><div class="d-supply" id="dReopenBox" hidden><p class="d-supply-t">继续反馈</p><p class="d-supply-hint">办结后 30 天内可继续反馈，提交后建议会重新进入办理。</p><label class="sr" for="dReopenText">继续反馈内容</label><textarea id="dReopenText" rows="3" maxlength="2000" placeholder="还有什么新情况或没解决的问题？"></textarea><button class="btn primary sm" id="dReopenSend">提交并重新办理</button></div>`;
    else actionsHtml += '<p class="d-hint">办结已超过 30 天，如仍有问题请新建一条建议。</p>';
  }
  if (['PENDING_ACCEPTANCE', 'ACCEPTED', 'WAITING_EMPLOYEE'].includes(st)) actionsHtml += `<div class="d-actions"><button class="btn ghost sm" id="dWithdraw">撤回建议</button></div>`;
  if (['VERIFYING', 'PROCESSING', 'WAITING_REVIEW', 'REOPENED'].includes(st)) {
    const lc = [...acts].reverse().find(x => x.action_type === 'EMPLOYEE_CLOSE_REQUEST');
    const pendingClose = lc && !acts.some(x => x.action_type === 'STATUS_CHANGED' && x.id > lc.id);
    actionsHtml += pendingClose ? '<p class="d-hint">已申请关闭，等待管理员处理。</p>' : `<div class="d-actions"><button class="btn ghost sm" id="dCloseReq">申请关闭</button></div>`;
  }
  $('#dId').textContent = i.public_id;
  $('#dBody').innerHTML = `<span class="pill ${pc(st)}">${escHtml(i.status_label)}</span><h2 id="dTitle">${escHtml(i.title)}</h2>
   <p class="d-sub">${escHtml(deptTxt)} · ${fmtDay(i.created_at)} 提交</p><div class="d-q">${escHtml(i.description)}</div>
   ${expectHtml}${needSupply ? returnHtml + supplyBox : ''}
   <p class="d-sec">处理进度</p><ol class="tl">${tl}</ol>
   <p class="d-sec">部门答复</p>
   ${replies.length ? replies.map(m => `<div class="reply"><div class="reply-h"><span>承办部门 答复</span><span>${fmtTime(m.created_at)}</span></div><div class="reply-b"><p>${escHtml(m.content)}</p></div></div>`).join('') : `<div class="d-empty">承办部门答复后会显示在这里，并通过站内消息通知你。</div>`}
   ${supHtml}${actionsHtml}${needSupply ? '' : supplyBox}`;
  const ok = $('#dOk'), more = $('#dMore'), supply = $('#dSupply');
  if (ok) ok.onclick = async () => {
    ok.disabled = true;
    try { await apiCall('/feedbacks/' + encodeURIComponent(i.public_id) + '/review', 'POST', { rating: 5, request_reopen: false }); toast('已评价，感谢你的反馈'); closeDrawer(); loadMine(); }
    catch (e) { toast(e.message || '提交失败'); ok.disabled = false; }
  };
  if (more && supply) more.onclick = () => { supply.hidden = false; more.disabled = true; $('#dSupplyText').focus(); };
  const send = $('#dSupplySend');
  if (send) {
    let token = null;
    send.onclick = async () => {
      const v = $('#dSupplyText').value.trim();
      if (!v) { toast('补充内容不能为空'); $('#dSupplyText').focus(); return; }
      if (!token) token = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      send.disabled = true;
      try {
        const r = await apiCall('/feedbacks/' + encodeURIComponent(i.public_id) + '/messages', 'POST', { content: v, client_token: token });
        token = null;
        toast(needSupply && r.status === 'PROCESSING' ? '已补充，重新进入办理' : '已发送，承办部门会继续办理');
        const fresh = await apiCall('/feedbacks/' + encodeURIComponent(i.public_id));
        if (!$('#drawer').hidden) renderDrawer(fresh);
        loadMine();
      } catch (e) { toast(e.message || '发送失败，内容已保留，可重试'); send.disabled = false; }
    };
  }
  const wd = $('#dWithdraw');
  if (wd) {
    let armed = false, armT = null;
    wd.onclick = async () => {
      if (!armed) { armed = true; wd.textContent = '确认撤回？撤回后不可恢复'; wd.classList.add('danger'); armT = setTimeout(() => { armed = false; if (document.body.contains(wd)) { wd.textContent = '撤回建议'; wd.classList.remove('danger'); } }, 4000); return; }
      clearTimeout(armT); wd.disabled = true;
      try { await apiCall('/feedbacks/' + encodeURIComponent(i.public_id) + '/withdraw', 'POST'); toast('已撤回'); closeDrawer(); loadMine(); }
      catch (e) { toast(e.message || '撤回失败'); wd.disabled = false; }
    };
  }
  const cr = $('#dCloseReq');
  if (cr) cr.onclick = async () => {
    cr.disabled = true;
    try { await apiCall('/feedbacks/' + encodeURIComponent(i.public_id) + '/close-request', 'POST', {}); toast('已申请关闭，等待管理员处理'); const fresh = await apiCall('/feedbacks/' + encodeURIComponent(i.public_id)); if (!$('#drawer').hidden) renderDrawer(fresh); loadMine(); }
    catch (e) { toast(e.message || '申请失败'); cr.disabled = false; }
  };
  const rb = $('#dReopenBtn'), rbox = $('#dReopenBox');
  if (rb && rbox) rb.onclick = () => { rbox.hidden = false; rb.disabled = true; $('#dReopenText').focus(); };
  const rs = $('#dReopenSend');
  if (rs) rs.onclick = async () => {
    const v = $('#dReopenText').value.trim();
    if (!v) { toast('请先写下要继续反馈的内容'); $('#dReopenText').focus(); return; }
    rs.disabled = true;
    try { await apiCall('/feedbacks/' + encodeURIComponent(i.public_id) + '/reopen', 'POST', { content: v }); toast('已提交，重新进入办理'); const fresh = await apiCall('/feedbacks/' + encodeURIComponent(i.public_id)); if (!$('#drawer').hidden) renderDrawer(fresh); loadMine(); }
    catch (e) { toast(e.message || '提交失败，内容已保留，可重试'); rs.disabled = false; }
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
$('#settingsBtn').onclick = () => { closeMenu(); location.hash = '#/settings'; };
$('#helpBtn').onclick = () => { closeMenu(); location.hash = '#/help'; };

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
function notifTitle(n) {
  const t = n.title || '反馈有新进展';
  if (t.includes('《') || !n.feedback_title) return t;
  const ft = n.feedback_title.length > 18 ? n.feedback_title.slice(0, 18) + '…' : n.feedback_title;
  return `《${ft}》${t}`;
}
function notifItemHTML(n) {
  return `<button type="button" class="bell-item${n.is_read ? '' : ' unread'}" data-pub="${escHtml(n.public_id || '')}" data-nid="${n.id}"><span class="bell-dot" aria-hidden="true"></span><span class="bell-main"><span class="bell-top"><b>${escHtml(notifTitle(n))}</b><time>${fmtTime(n.created_at)}</time></span><span class="bell-body">${escHtml(n.content || '')}</span><span class="bell-meta">${escHtml(n.public_id || '')}</span></span></button>`;
}
function renderNotifs() {
  const el = $('#bellList'); if (!el) return;
  el.innerHTML = notifItems.length ? notifItems.slice(0, 12).map(notifItemHTML).join('')
    : '<p class="bell-empty">暂时没有通知，反馈有新进展会第一时间告诉你。</p>';
}
function renderNotifPage() {
  const el = $('#notifFull'); if (!el) return;
  el.innerHTML = notifItems.length ? notifItems.map(n => `<li>${notifItemHTML(n)}</li>`).join('')
    : '<li class="empty">暂时没有通知。</li>';
}
async function openNotif(pub, nid) {
  const item = notifItems.find(n => String(n.id) === String(nid));
  if (item && !item.is_read) {
    item.is_read = 1; notifUnread = Math.max(0, notifUnread - 1); updateBell(); renderNotifs(); renderNotifPage();
    try { await apiCall('/notifications/' + nid + '/read', 'POST'); } catch (e) {}
  }
  if (!pub) return;
  const cur = location.hash.replace(/^#/, '').split('?')[0];
  if (cur === '/mine') { loadMine().then(() => openDrawer(pub)); }
  else location.hash = '#/mine?open=' + encodeURIComponent(pub);
}
$('#bellBtn').onclick = e => { e.stopPropagation(); const m = $('#bellMenu'); const o = m.hidden; closeBell(); closeMenu(); if (o) { m.hidden = false; $('#bellBtn').setAttribute('aria-expanded', true); loadNotifs(true); pushRefresh(); } };
document.addEventListener('click', e => { if (!e.target.closest('.bell-wrap, .bell-menu')) closeBell(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeBell(); const fm = $('#fineMenu'); if (fm) fm.hidden = true; } });
async function markAllRead() {
  try { await apiCall('/notifications/read-all', 'POST'); } catch (e) {}
  notifItems.forEach(n => { n.is_read = 1; }); notifUnread = 0; updateBell(); renderNotifs(); renderNotifPage();
}
$('#bellAll').onclick = markAllRead;
const notifAllReadBtn = $('#notifAllRead'); if (notifAllReadBtn) notifAllReadBtn.onclick = markAllRead;
const bellViewAllBtn = $('#bellViewAll'); if (bellViewAllBtn) bellViewAllBtn.onclick = () => { closeBell(); location.hash = '#/notifications'; };
$('#bellList').addEventListener('click', e => {
  const b = e.target.closest('.bell-item'); if (!b) return;
  closeBell(); openNotif(b.dataset.pub, b.dataset.nid);
});
const notifFullEl = $('#notifFull');
if (notifFullEl) notifFullEl.addEventListener('click', e => {
  const b = e.target.closest('.bell-item'); if (!b) return;
  openNotif(b.dataset.pub, b.dataset.nid);
});

/* ===== 浏览器推送（Web Push） ===== */
const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function b64ToU8(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); const a = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return a; }
async function pushRefresh() {
  const btn = $('#pushBtn'), hint = $('#pushHint'), help = $('#pushHelp');
  const sBtn = $('#setPushBtn'), sHelp = $('#setPushHelp'), sState = $('#setPushState');
  const bell = (h, label, showHelp, dis) => { if (hint) hint.textContent = h || ''; if (btn) { btn.hidden = !label; btn.textContent = label || ''; btn.disabled = !!dis; } if (help) help.hidden = !showHelp; };
  const sett = (txt, label, showHelp, dis) => { if (sState) sState.textContent = txt || ''; if (sBtn) { sBtn.hidden = !label; sBtn.textContent = label || ''; sBtn.disabled = !!dis; } if (sHelp) sHelp.hidden = !showHelp; };
  if (!PUSH_OK) { bell('当前浏览器不支持推送', '', false); sett('这台设备的浏览器不支持推送通知。', '', false); return; }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()) { bell('请先把本站添加到主屏幕，再从桌面图标打开来开启', '开启', false, true); sett('在 iPhone 上，请先把本站添加到主屏幕，再从桌面图标打开来开启推送。', '开启', false, true); return; }
  if (Notification.permission === 'denied') { bell('通知权限已被拒绝', '', true); sett('通知权限已被浏览器拒绝，需要先在浏览器设置中允许，才能开启。', '', true); return; }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) { bell('反馈有进展会推送到这台设备', '已开启', false); sett('已开启：反馈有进展会推送到这台设备。', '已开启', false); }
    else { bell('开启后，反馈有进展第一时间推送', '开启', false); sett('尚未开启。开启后，反馈有进展会第一时间推送到这台设备。', '开启', false); }
    if (btn) btn.classList.toggle('on', !!sub);
    if (sBtn) sBtn.classList.toggle('on', !!sub);
  } catch (e) { bell('开启后，反馈有进展第一时间推送', '开启', false); sett('尚未开启。', '开启', false); }
}
async function togglePush() {
  if (!PUSH_OK || Notification.permission === 'denied') return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      try { await apiCall('/push/unsubscribe', 'POST', { endpoint: existing.endpoint }); } catch (e) {}
      await existing.unsubscribe();
      toast('浏览器推送已关闭');
    } else {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('没有拿到通知权限，可在浏览器设置里允许'); pushRefresh(); return; }
      const keyRes = await apiCall('/push/public-key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(keyRes.public_key) });
      const sj = sub.toJSON();
      await apiCall('/push/subscribe', 'POST', { endpoint: sj.endpoint, keys: { p256dh: sj.keys.p256dh, auth: sj.keys.auth } });
      toast('浏览器推送已开启');
    }
  } catch (e) { toast('开启失败，请稍后再试'); }
  pushRefresh();
}
const pushBtnEl = $('#pushBtn');
if (pushBtnEl) pushBtnEl.onclick = togglePush;
const setPushBtnEl = $('#setPushBtn');
if (setPushBtnEl) setPushBtnEl.onclick = togglePush;
function showPushHelp() {
  toast('在浏览器地址栏左侧的站点设置里，把通知改为允许，然后回到这里点开启');
  const sState = $('#setPushState');
  if (sState) sState.textContent = '开启方法：打开浏览器地址栏左侧的站点设置（或浏览器设置 → 网站设置 → 通知），找到 lidawang.work 并改为允许；然后回到这里点「开启」。';
}
const pushHelpEl = $('#pushHelp');
if (pushHelpEl) pushHelpEl.onclick = () => { location.hash = '#/settings'; setTimeout(showPushHelp, 350); };
const setPushHelpEl = $('#setPushHelp');
if (setPushHelpEl) setPushHelpEl.onclick = showPushHelp;

/* ===== 个人设置 ===== */
const NYSET_KEY = 'ny-settings';
let nyset = { font: 'std', rm: 'auto', splash: true };
try { const s = JSON.parse(localStorage.getItem(NYSET_KEY) || '{}'); if (s && typeof s === 'object') nyset = Object.assign(nyset, s); } catch (e) {}
function saveNyset() { try { localStorage.setItem(NYSET_KEY, JSON.stringify(nyset)); } catch (e) {} const el = $('#setSaved'); if (el) el.textContent = '已自动保存 · 阅读与动效为本机设置，只影响这台设备。'; }
function effRM() { return nyset.rm === 'on' || (nyset.rm === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function applyNyset() {
  document.documentElement.classList.toggle('fs-large', nyset.font === 'large');
  document.documentElement.classList.toggle('rm-on', nyset.rm === 'on');
  const seg = (id, on) => { const b = $(id); if (b) b.classList.toggle('on', !!on); };
  seg('#setFontStd', nyset.font === 'std'); seg('#setFontLarge', nyset.font === 'large');
  seg('#setRmAuto', nyset.rm === 'auto'); seg('#setRmOn', nyset.rm === 'on'); seg('#setRmOff', nyset.rm === 'off');
  seg('#setSplashOn', nyset.splash !== false); seg('#setSplashOff', nyset.splash === false);
}
function bindSeg(id, fn) { const b = $(id); if (b) b.onclick = () => { fn(); saveNyset(); applyNyset(); toast('已保存'); }; }
bindSeg('#setFontStd', () => { nyset.font = 'std'; });
bindSeg('#setFontLarge', () => { nyset.font = 'large'; });
bindSeg('#setRmAuto', () => { nyset.rm = 'auto'; });
bindSeg('#setRmOn', () => { nyset.rm = 'on'; });
bindSeg('#setRmOff', () => { nyset.rm = 'off'; });
bindSeg('#setSplashOn', () => { nyset.splash = true; });
bindSeg('#setSplashOff', () => { nyset.splash = false; });
applyNyset();
function draftKeys() { const ks = []; try { for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); if (key && key.startsWith('ny-draft-')) ks.push(key); } } catch (e) {} return ks; }
function renderDraftState() { const el = $('#setDraftState'); if (!el) return; const n = draftKeys().length; el.textContent = n ? `当前有 ${n} 份未提交的草稿保存在这台设备上，换设备或换浏览器看不到。` : '当前没有保存在本机的草稿。草稿只保存在这台设备上，换设备看不到。'; }
let draftArm = false, draftArmT = null;
const clearDraftBtn = $('#setClearDraft');
if (clearDraftBtn) clearDraftBtn.onclick = () => {
  if (!draftKeys().length) { toast('本机没有可清除的草稿'); return; }
  if (!draftArm) { draftArm = true; clearDraftBtn.textContent = '再点一次确认清除'; draftArmT = setTimeout(() => { draftArm = false; clearDraftBtn.textContent = '清除本机草稿'; }, 4000); return; }
  clearTimeout(draftArmT); draftArm = false; clearDraftBtn.textContent = '清除本机草稿';
  draftKeys().forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  renderDraftState(); toast('本机草稿已清除');
};
const pwForm = $('#pwForm');
if (pwForm) pwForm.onsubmit = async e => {
  e.preventDefault();
  const cur = $('#pwCur').value, nw = $('#pwNew').value, nw2 = $('#pwNew2').value;
  const err = $('#pwErr'); const showE = m => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  if (!cur) return showE('请输入当前密码');
  if (nw.length < 8) return showE('新密码至少 8 位');
  if (nw !== nw2) return showE('两次输入的新密码不一致');
  if (nw === cur) return showE('新密码不能与当前密码相同');
  const btn = $('#pwBtn'); btn.disabled = true; btn.textContent = '保存中…';
  try {
    await apiCall('/auth/change-password', 'POST', { current_password: cur, new_password: nw });
    $('#pwCur').value = ''; $('#pwNew').value = ''; $('#pwNew2').value = '';
    toast('密码已修改');
  } catch (e2) { showE(e2.message || '修改失败，请稍后重试'); }
  btn.disabled = false; btn.textContent = '保存新密码';
};
function renderSettings() {
  const acc = $('#setAccount'); if (acc) acc.textContent = (currentUser && currentUser.account) || '—';
  const em = $('#setEmail'); if (em) em.textContent = (currentUser && currentUser.email) || '未绑定';
  renderDraftState(); applyNyset(); pushRefresh();
}
/* 首页待办提示（真实数据） */
async function loadTodoBanner() {
  const b = $('#todoBanner'); if (!b) return;
  if (!isLogged()) { b.hidden = true; return; }
  try {
    const data = await apiCall('/feedbacks');
    const n = (Array.isArray(data) ? data : []).filter(i => i.status === 'WAITING_EMPLOYEE').length;
    if (n > 0) { $('#todoBannerTxt').textContent = `你有 ${n} 条建议需要补充材料`; b.hidden = false; } else b.hidden = true;
  } catch (e) { b.hidden = true; }
}
const tbBtn = $('#todoBannerBtn');
if (tbBtn) tbBtn.onclick = () => { filter = 'mine'; };

/* write flow */
let step = 1; const draft = { topic: null, dept: null };
$$('.topic').forEach(t => t.onclick = () => {
    const on = t.getAttribute('aria-checked') === 'true';
    const cur = $$('.topic[aria-checked="true"]');
    if (on) { t.setAttribute('aria-checked', 'false'); }
    else if (cur.length < 2) { t.setAttribute('aria-checked', 'true'); }
    else { toast('最多选择 2 个部门'); return; }
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
  if (s === 1) return draft.topic ? '' : '请先选择承办部门（1–2 个）';
  if (s === 2) {
    if (ttl.value.trim().length < 4) return '标题至少填写 4 个字';
    if (body.value.trim().length < 10) return '建议内容还差 ' + (10 - body.value.trim().length) + ' 个字（至少 10 个字）';
  }
  return '';
}
function valid(s) { return !validReason(s); }
let lastSubmission = null;
function update() {
  const dc = $('#deptCount'); if (dc) dc.textContent = '已选择 ' + $$('.topic[aria-checked="true"]').length + '/2 个部门';
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
  if (s === 3) { $('#sDept').textContent = draft.dept; $('#sTitle').textContent = ttl.value.trim(); $('#sBody').textContent = body.value.trim(); renderAttach(); }
  if (s === 4 && lastSubmission) { const okMsg = $('#sOkMsg'); if (okMsg) okMsg.textContent = '建议已送达承办部门，进度会实时更新在「我的反馈」里。'; $('#sid').textContent = lastSubmission.public_id; document.querySelector('.success .btn.primary').href = '#/mine?open=' + lastSubmission.public_id; }
  update();
  const h = $(`.stage[data-step="${s}"] h1`); h.tabIndex = -1; h.focus({ preventScroll: true });
}
$('#nextBtn').onclick = async () => {
  const r = validReason(step);
  if (r) {
    $('#footMsg').textContent = r;
    if (step === 2) {
      const te = $('#ttlErr');
      if (ttl.value.trim().length < 4) { if (te) { te.textContent = '标题至少填写 4 个字'; te.hidden = false; } ttl.focus(); }
      else { if (te) te.hidden = true; body.focus(); }
    }
    toast(r); return;
  }
  if (step < 3) { go(step + 1); return; }
  const btn = $('#nextBtn');
  btn.disabled = true; btn.textContent = '提交中…';
  try {
    const deptIds = $$('.topic[aria-checked="true"]').map(x => DEPT_IDS[x.dataset.d]).filter(Boolean);
    lastSubmission = await apiCall('/feedbacks', 'POST', { title: ttl.value.trim(), description: body.value.trim(), department_ids: deptIds, need_reply: true, attachments: attachFiles.map(f => ({ name: f.name, mime_type: f.mime_type, content_base64: f.content_base64 })) });
    lastSubmission.department_ids = deptIds;
    attachFiles = []; renderAttach();
    clearDraft();
    go(4);
  } catch (e) { toast((e.message || '提交失败，请稍后重试') + '，内容已保留，可重试'); }
  btn.disabled = false; btn.textContent = '确认提交';
};
ttl.addEventListener('input', () => { const te = $('#ttlErr'); if (te && ttl.value.trim().length >= 4) te.hidden = true; });
$('#prevBtn').onclick = () => go(step - 1, true);
$$('[data-go]').forEach(b => b.onclick = () => go(+b.dataset.go, true));
/* 附件：真实上传（后端校验格式与大小）；图片先在本机压缩并重编码，顺带清除位置信息 */
let attachFiles = [];
const ATT_MAX = 5, ATT_TOTAL = 5 * 1024 * 1024;
function attTotalSize() { return attachFiles.reduce((s, f) => s + f.size, 0); }
function renderAttach() {
  const ul = $('#attachList');
  if (ul) ul.innerHTML = attachFiles.map((f, k) => `<li><span class="att-name">${escHtml(f.name)}</span><span class="att-size">${Math.max(1, Math.round(f.size / 1024))}KB</span><button type="button" class="att-x" data-k="${k}" aria-label="移除附件 ${escHtml(f.name)}">×</button></li>`).join('');
  const sa = $('#sAttach'); if (sa) sa.textContent = attachFiles.length ? attachFiles.map(f => f.name).join('、') : '无';
}
const attachListEl = $('#attachList');
if (attachListEl) attachListEl.addEventListener('click', e => { const x = e.target.closest('.att-x'); if (x) { attachFiles.splice(+x.dataset.k, 1); renderAttach(); } });
function blobToAtt(blob, name) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res({ name, mime_type: blob.type || 'application/octet-stream', content_base64: String(r.result).split(',')[1], size: blob.size });
    r.onerror = () => res(null);
    r.readAsDataURL(blob);
  });
}
function compressImage(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1600;
      let w = img.naturalWidth, h = img.naturalHeight;
      const sc = Math.min(1, max / Math.max(w, h));
      w = Math.max(1, Math.round(w * sc)); h = Math.max(1, Math.round(h * sc));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      cv.toBlob(b => res(b), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}
async function handleFiles(files) {
  for (const file of files) {
    if (attachFiles.length >= ATT_MAX) { toast('最多添加 5 个附件'); break; }
    let blob = file, name = file.name;
    if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size > 350 * 1024) {
      const c = await compressImage(file);
      if (c && c.size < file.size) { blob = c; name = file.name.replace(/\.[^.]+$/, '') + '.jpg'; }
    }
    if (blob.size > ATT_TOTAL) { toast(`「${file.name}」超过 5MB，未添加`); continue; }
    if (attTotalSize() + blob.size > ATT_TOTAL) { toast('附件总计不能超过 5MB'); break; }
    const att = await blobToAtt(blob, name);
    if (att) attachFiles.push(att);
  }
  renderAttach();
}
const attachBtnEl = $('#attachBtn'); if (attachBtnEl) attachBtnEl.onclick = () => $('#attachInput').click();
const photoBtnEl = $('#photoBtn'); if (photoBtnEl) photoBtnEl.onclick = () => $('#photoInput').click();
const attachInputEl = $('#attachInput'); if (attachInputEl) attachInputEl.addEventListener('change', e => { handleFiles([...e.target.files]); e.target.value = ''; });
const photoInputEl = $('#photoInput'); if (photoInputEl) photoInputEl.addEventListener('change', e => { handleFiles([...e.target.files]); e.target.value = ''; });
[ttl, body].forEach(el => el.addEventListener('focus', () => setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }, 350)));
window.__nyFill = (t, b, topic) => { $$('.topic').find(x => x.dataset.t === topic).click(); ttl.value = t; body.value = b; touched = true; update(); };
window.__nyGo = go;

/* router */
const views = $$('.view');
let curView = '';
function route() {
  const [path, q] = location.hash.replace(/^#/, '').split('?');
  const name = { '/': 'home', '': 'home', '/write': 'write', '/mine': 'mine', '/help': 'help', '/pool': 'pool', '/settings': 'settings', '/notifications': 'notifications' }[path] || 'home';
  if (curView === 'mine' && name !== 'mine') mineScrollY = window.scrollY || 0;
  curView = name;
  closeDrawer(); closeMenu();
  views.forEach(v => v.hidden = v.dataset.view !== name);
  $$('[data-nav]').forEach(a => { const on = a.dataset.nav === name; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  $('.foot').hidden = name === 'write';
  window.jumpTo(0);
  if (name === 'write' && !isLogged()) {
    if (!authReady) { setTimeout(route, 400); return; }
    pendingRoute = location.hash; openAuth('login'); location.hash = '#/'; return;
  }
  if (name === 'write') { draft.topic = null; draft.dept = null; $$('.topic').forEach(x => x.setAttribute('aria-checked', 'false')); ttl.value = body.value = ''; touched = false; attachFiles = []; renderAttach(); const te = $('#ttlErr'); if (te) te.hidden = true;
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
    loadMine().then(() => { const m = /open=([\w-]+)/.exec(q || ''); if (m) setTimeout(() => openDrawer(m[1]), 250); else if (mineScrollY) jumpTo(mineScrollY); });
  }
  if (name === 'settings') {
    if (!isLogged()) { if (!authReady) { setTimeout(route, 400); return; } pendingRoute = location.hash; openAuth('login'); location.hash = '#/'; return; }
    renderSettings();
  }
  if (name === 'notifications') {
    if (!isLogged()) { if (!authReady) { setTimeout(route, 400); return; } pendingRoute = location.hash; openAuth('login'); location.hash = '#/'; return; }
    renderNotifPage(); loadNotifs(true).then(renderNotifPage);
  }
  if (name === 'home') loadTodoBanner();
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
 {id:'NY-20261008-012',dept:'电子档案管理中心',t:'查阅室开放时间<br>希望延长到周六',s:'done',date:'10月8日',q:'工作日来查档案总要请假，查阅室周末不开门很不方便。希望周六上午也能开放。',m:'查阅室周六开放已纳入服务优化安排，正在结合利用量测算开放时段，方案确定后在馆内公告。',lim:'开放方案论证中',rd:'10月16日',x:22,y:78,r:-8},
 {id:'NY-20261011-004',dept:'电子档案管理中心',t:'老照片数字化<br>进度希望加快',s:'doing',date:'10月11日',q:'馆藏 80 年代的老照片很多还没数字化，查的时候只能看原件，担心损坏。希望加快扫描进度。',x:158,y:58,r:-1},
 {id:'NY-20260929-021',dept:'运行管理部',t:'库房温湿度<br>希望定期公示',s:'done',date:'9月29日',q:'档案库房的温湿度情况我们看不到，心里没底。希望能像其他馆一样定期公示。',m:'正在推进库房温湿度公示，拟在馆内公告栏和内网定期发布监测情况，超标预警功能同步完善中。',lim:'公示方式推进中',rd:'10月12日',x:296,y:82,r:7},
 {id:'NY-20261002-007',dept:'电子档案管理中心',t:'电子档案检索<br>速度慢结果不准',s:'done',date:'10月2日',q:'在系统里搜档案，关键词稍微模糊一点就搜不出来，只能一页页翻，效率太低。',m:'检索系统已启动优化，模糊匹配和全文检索分批升级中，历史数据索引重建按计划推进。',lim:'分批升级中',rd:'10月14日',x:54,y:158,r:4},
 {id:'NY-20261013-015',dept:'综合办公室',t:'档案借阅审批<br>流程希望简化',s:'doing',date:'10月13日',q:'借一份档案要跑三个部门签字，等一周才拿到。希望能线上审批、压缩环节。',x:184,y:148,r:-3},
 {id:'NY-20260921-005',dept:'人事部',t:'档案专业培训<br>名额太少',s:'done',date:'9月21日',q:'每年档案专业培训就两三个名额，年轻同志想学没机会。希望增加名额或搞线上培训。',m:'已向上级档案部门争取培训资源，同时计划增加馆内业务交流频次，具体安排另行通知。',lim:'资源对接中',rd:'9月30日',x:302,y:162,r:6}
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
  box.addEventListener('focusin', () => { mbHover = true; });
  box.addEventListener('focusout', () => { mbHover = false; });
  setInterval(() => {
    if (!mbVisible || mbHover || document.hidden || !stage.hidden || document.documentElement.classList.contains('rm-on')) return;
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

/* ===== v1.1 树洞（服务端持久化） ===== */
(() => {
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hues = ['#DCE7D9','#F6DCC4','#E9E1CF','#D9E3E6','#EBD9D2'];
let P = [], sort = 'new', loggedIn = false;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function poolApi(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api/v1/employee' + path, opts);
  let d = null; try { d = await r.json(); } catch (e) {}
  if (!r.ok) { const err = new Error((d && d.detail) || '请求失败（' + r.status + '）'); err.status = r.status; throw err; }
  return d;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }
async function ensureLogin() {
  try { const me = await poolApi('/auth/me'); loggedIn = !!me.authenticated; } catch (e) { loggedIn = false; }
  if (!loggedIn) { toast('先登录一下，就能发言啦'); const lb = $('#loginBtn'); if (lb && !lb.hidden) lb.click(); return false; }
  return true;
}
function poolErr(err, fallback) {
  if (err && err.status === 401) { loggedIn = false; toast('登录已过期，请重新登录一下'); const lb = $('#loginBtn'); if (lb && !lb.hidden) lb.click(); return; }
  toast((err && err.message) || fallback);
}
const agoOf = iso => { const t = new Date(iso).getTime(); if (isNaN(t)) return ''; const s = Math.max(0, (Date.now() - t) / 1000); if (s < 60) return '刚刚'; if (s < 3600) return Math.floor(s / 60) + ' 分钟前'; if (s < 86400) return Math.floor(s / 3600) + ' 小时前'; if (s < 172800) return '昨天'; if (s < 30 * 86400) return Math.floor(s / 86400) + ' 天前'; const d = new Date(iso); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
const mapPost = j => ({ id: j.id, a: j.author, t: j.topic, ago: agoOf(j.created_at), m: j.content, l: j.like_count, liked: !!j.liked, h: j.hue || hues[0], r: (j.replies || []).map(x => [x.author, x.content]) });
const pavFix = r => r.querySelectorAll('.pav[data-h]').forEach(e => e.style.setProperty('--h', e.dataset.h));
const av = p => `<span class="pav" data-h="${p.h}" aria-hidden="true"></span>`;
const card = (p, teaser) => `<article class="pcard${teaser ? ' teaser' : ''}" data-id="${p.id}">
  <header class="pc-h">${av(p)}<span class="pc-a">${p.a}</span><span class="pc-time">${p.ago}</span></header>
  <button class="pc-open" aria-haspopup="dialog" aria-label="查看讨论：${esc(p.m.slice(0, 20))}">${esc(p.m)}</button>
  <footer class="pc-f">
   ${teaser ? `<span class="pc-stat">♥ ${p.l}</span><span class="pc-stat">💬 ${p.r.length}</span>` :
   `<button class="like${p.liked ? ' on' : ''}" aria-pressed="${p.liked}" aria-label="有同感，${p.l} 人"><span class="hrt">♥</span><span class="lc">${p.l}</span><span class="lt">有同感</span></button>
   <button type="button" class="pc-reply pc-open" aria-label="查看回复，共 ${p.r.length} 条">💬 回复 ${p.r.length}</button>
   <span class="more"><button class="more-b" aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">…</button><span class="more-m" role="menu" hidden><button role="menuitem" class="rep">举报</button></span></span>`}
  </footer></article>`;
/* 首页树洞预告：与树洞同源，按新旧分组轮换播出 */
const tz = $('#poolTeaser');
let groups = [], gi = 0, hold = false, holdT = null, visible = false;
function setLive() { const lt = $('#ptLiveTxt'); if (lt && P[0]) lt.textContent = '最新留言 · ' + P[0].ago; }
function showGroup(n, anim = true) {
  if (!tz || !groups.length) return;
  gi = ((n % groups.length) + groups.length) % groups.length;
  tz.innerHTML = groups[gi].map(p => card(p, true)).join('');
  pavFix(tz);
  if (anim && !RM) tz.querySelectorAll('.pcard').forEach((el, k) => { el.style.animationDelay = (k * 95) + 'ms'; el.classList.add('tenter'); });
  $$('.pt-dot').forEach((d, k) => d.classList.toggle('on', k === gi));
}
function buildTeaser() { if (!tz) return; const a = P.slice(0, 9); groups = [a.slice(0, 3), a.slice(3, 6), a.slice(6, 9)].filter(g => g.length); setLive(); showGroup(0, false); }
if (tz) {
  tz.addEventListener('click', e => {
    if (!e.target.closest('.pc-open')) return;
    const art = e.target.closest('.pcard'); if (!art) return;
    const p = P.find(x => x.id == art.dataset.id); if (p) openThread(art, p);
  });
  if (!RM) {
    setInterval(() => { if (visible && !hold && !document.hidden && !effRM()) showGroup(gi + 1); }, 9000);
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: .15 }).observe(tz);
    const holdOn = () => { hold = true; clearTimeout(holdT); holdT = setTimeout(() => { hold = false; }, 12000); };
    tz.addEventListener('pointerdown', holdOn);
    tz.addEventListener('pointerenter', () => { hold = true; });
    tz.addEventListener('pointerleave', () => { hold = false; });
    tz.addEventListener('focusin', () => { hold = true; });
    tz.addEventListener('focusout', () => { hold = false; });
    $$('.pt-dot').forEach((d, k) => d.addEventListener('click', () => { showGroup(k); holdOn(); }));
  }
}
const list = $('#poolList');
function render(newId) {
  if (!list) return;
  list.innerHTML = P.length ? P.map(p => card(p)).join('') : '<p class="empty">树洞还很安静，来说第一句吧。</p>';
  pavFix(list);
  if (newId != null) { const el = list.querySelector(`[data-id="${newId}"]`); el && el.classList.add('enter'); }
}
async function loadPool() {
  if (list) list.innerHTML = '<p class="empty">正在加载…</p>';
  try {
    const data = await poolApi('/pool/posts?sort=' + sort);
    P = (Array.isArray(data) ? data : []).map(mapPost);
  } catch (e) { if (list) list.innerHTML = '<p class="empty">树洞加载失败，请刷新重试。</p>'; return; }
  render(); buildTeaser();
}
$$('.sort button').forEach(b => b.onclick = () => { $$('.sort button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); sort = b.dataset.s; loadPool(); });
/* composer */
const tx = $('#pcText');
tx.oninput = () => { const n = tx.value.trim().length; $('#pcCount').textContent = `${tx.value.length}/200`; $('#pcSend').disabled = n < 2; };
$('#composer').onsubmit = async e => {
  e.preventDefault();
  const m = tx.value.trim(); if (m.length < 2) return;
  if (!await ensureLogin()) return;
  const btn = $('#pcSend'); btn.disabled = true;
  try {
    const j = await poolApi('/pool/posts', 'POST', { content: m });
    const p = mapPost(j); P.unshift(p);
    sort = 'new'; $$('.sort button').forEach((x, k) => { x.classList.toggle('on', !k); x.setAttribute('aria-pressed', String(!k)); });
    tx.value = ''; render(p.id); buildTeaser(); toast('已发布');
  } catch (err) { poolErr(err, '发布失败，内容已保留，可重试'); }
  tx.oninput();
};
/* card interactions */
function syncLike(lk, p) { lk.classList.toggle('on', p.liked); lk.setAttribute('aria-pressed', String(p.liked)); lk.setAttribute('aria-label', '有同感，' + p.l + ' 人'); lk.querySelector('.lc').textContent = p.l; }
list.addEventListener('click', async e => {
  const art = e.target.closest('.pcard'); if (!art) return; const p = P.find(x => x.id == art.dataset.id); if (!p) return;
  const lk = e.target.closest('.like');
  if (lk) {
    if (!await ensureLogin()) return;
    const was = p.liked;
    p.liked = !was; p.l += p.liked ? 1 : -1; syncLike(lk, p);
    lk.classList.remove('pop'); void lk.offsetWidth; p.liked && lk.classList.add('pop');
    try { const r = await poolApi('/pool/posts/' + p.id + '/like', 'POST'); p.liked = !!r.liked; p.l = r.like_count; syncLike(lk, p); }
    catch (err) { p.liked = was; p.l += was ? 1 : -1; syncLike(lk, p); poolErr(err, '操作失败，请重试'); }
    return;
  }
  const mb = e.target.closest('.more-b');
  if (mb) { const m = mb.nextElementSibling; const o = m.hidden; $$('.more-m').forEach(x => x.hidden = true); m.hidden = !o; mb.setAttribute('aria-expanded', String(o)); o && m.querySelector('button').focus(); return; }
  if (e.target.closest('.rep')) {
    e.target.closest('.more-m').hidden = true;
    if (!await ensureLogin()) return;
    try { await poolApi('/pool/posts/' + p.id + '/report', 'POST'); toast('已举报，管理员会尽快审核'); }
    catch (err) { poolErr(err, '举报失败，请重试'); }
    return;
  }
  if (e.target.closest('.pc-open')) openThread(art, p);
});
document.addEventListener('click', e => { if (!e.target.closest('.more')) $$('.more-m').forEach(x => x.hidden = true); });
function thread(body, p) {
  body.innerHTML = `<div class="mx-meta"><span>树洞 · 同事可见</span></div>
   <div class="th-post"><header class="pc-h">${av(p)}<span class="pc-a">${p.a}</span><span class="pc-time">${p.ago}</span></header><h2 id="mxTitle" class="th-text">${esc(p.m)}</h2>
   <p class="th-stat">♥ ${p.l} 人有同感 · 💬 ${p.r.length} 条回复</p></div>
   <ul class="th-replies">${p.r.map(r => `<li><span class="pav sm" data-h="${hues[r[0].length % 5]}"></span><div><b>${r[0]}</b><p>${esc(r[1])}</p></div></li>`).join('') || '<li class="th-empty">还没有回复，来说第一句吧。</li>'}</ul>
   <form class="th-form"><label class="sr" for="thIn">回复</label><textarea id="thIn" rows="2" maxlength="200" placeholder="友善回复，将以匿名身份发布"></textarea><button class="btn primary sm" type="submit">回复</button></form>
   `;
  pavFix(body);
  body.querySelector('.th-form').onsubmit = async e => {
    e.preventDefault();
    const inp = body.querySelector('#thIn');
    const v = inp.value.trim(); if (!v) { toast('回复内容不能为空'); inp.focus(); return; }
    if (!await ensureLogin()) return;
    const btn = body.querySelector('.th-form button[type="submit"]'); btn.disabled = true;
    try {
      const rj = await poolApi('/pool/posts/' + p.id + '/replies', 'POST', { content: v });
      p.r.push([rj.author, rj.content]);
      const ul = body.querySelector('.th-replies'); ul.querySelector('.th-empty')?.remove();
      ul.insertAdjacentHTML('beforeend', `<li class="enter"><span class="pav sm" data-h="${hues[2]}"></span><div><b>${esc(rj.author)}</b><p>${esc(rj.content)}</p></div></li>`);
      pavFix(ul);
      inp.value = ''; body.querySelector('.th-stat').textContent = `♥ ${p.l} 人有同感 · 💬 ${p.r.length} 条回复`; render();
    } catch (err) { poolErr(err, '回复失败，内容已保留，可重试'); }
    btn.disabled = false;
  };
}
function openThread(art, p) { $('#mxCard').classList.add('thread'); window.__mx.open(art, b => thread(b, p)); }
(async () => { try { const me = await poolApi('/auth/me'); loggedIn = !!me.authenticated; } catch (e) {} loadPool(); })();
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
