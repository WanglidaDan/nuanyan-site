/* 暖言小站管理端 —— 完整办理流：受理→确认部门→分派→部门回复→审核→办结 */
(function () {
  "use strict";
  var API = "/api/v1/admin";
  var TOKEN_KEY = "ny-admin-token";
  var token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var loginView = $("adLogin"), appView = $("adApp");
  var ME = null, DEPTS = [], USERS = [], currentId = null, currentF = null;

  var STATUS_LABELS = {
    PENDING_ACCEPTANCE: "待受理", ACCEPTED: "待分派", VERIFYING: "核实中",
    PROCESSING: "办理中", WAITING_EMPLOYEE: "退回补充", WAITING_REVIEW: "回复待审核",
    REPLIED: "已回复", CLOSED: "已办结", REJECTED: "已驳回", REOPENED: "重新办理"
  };
  /* 与后端 TRANSITIONS 保持一致：状态只能沿这些路线推进 */
  var TRANSITIONS = {
    PENDING_ACCEPTANCE: ["ACCEPTED", "REJECTED"],
    ACCEPTED: ["VERIFYING", "PROCESSING", "REJECTED"],
    VERIFYING: ["PROCESSING", "WAITING_EMPLOYEE"],
    PROCESSING: ["WAITING_EMPLOYEE"],
    WAITING_EMPLOYEE: ["PROCESSING", "VERIFYING"],
    WAITING_REVIEW: [],
    REPLIED: ["CLOSED", "REOPENED"],
    CLOSED: ["REOPENED"],
    REOPENED: ["PROCESSING"]
  };
  var PRIORITIES = { NORMAL: "普通", IMPORTANT: "重要", URGENT: "紧急", SENSITIVE: "敏感" };
  var ADMIN_ROLES = { SYSTEM_ADMIN: 1, SENSITIVE_ADMIN: 1 };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtTime(s) {
    if (!s) return "—";
    return String(s).slice(0, 16).replace("T", " ");
  }
  function toast(msg) {
    var t = $("adToast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.hidden = true; }, 2800);
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 401) { doLogout(true); throw new Error("登录已过期，请重新登录"); }
      return r.json().then(function (data) {
        if (!r.ok) throw new Error((data && data.detail) || ("请求失败(" + r.status + ")"));
        return data;
      });
    });
  }

  /* ---------- 登录 ---------- */
  function showApp(me) {
    ME = me || ME;
    loginView.hidden = true; appView.hidden = false;
    $("adMeName").textContent = (ME && ME.name) || "管理员";
    loadDashboard();
    refreshBadge();
  }
  function showLogin() { appView.hidden = true; loginView.hidden = false; }
  function doLogout(silent) {
    token = null; ME = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    showLogin();
    if (!silent) toast("已退出登录");
  }
  $("adLoginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var u = $("adUser").value.trim(), p = $("adPass").value;
    var err = $("adLoginErr"), btn = $("adLoginBtn");
    err.hidden = true; btn.disabled = true; btn.textContent = "登录中…";
    fetch(API + "/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.detail || "登录失败");
        return data;
      });
    }).then(function (data) {
      token = data.access_token;
      if (!token) throw new Error("登录返回异常，请重试");
      try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
      return api("/auth/me");
    }).then(function (me) {
      showApp(me);
      toast("登录成功");
    }).catch(function (ex) {
      err.textContent = ex.message; err.hidden = false;
    }).finally(function () {
      btn.disabled = false; btn.textContent = "登录";
    });
  });
  $("adLogout").addEventListener("click", function () {
    if (confirm("确定退出管理端吗？")) doLogout();
  });

  /* ---------- 视图切换 ---------- */
  var views = { dash: $("viewDash"), list: $("viewList"), detail: $("viewDetail"), notif: $("viewNotif") };
  function showView(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    document.querySelectorAll(".ad-nav button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-view") === name || (name === "detail" && b.getAttribute("data-view") === "list"));
    });
    if (name === "list") loadList();
    if (name === "dash") loadDashboard();
    if (name === "notif") loadNotifs();
    window.scrollTo(0, 0);
  }
  document.querySelector(".ad-nav").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-view]");
    if (b) showView(b.getAttribute("data-view"));
  });
  $("backToList").addEventListener("click", function () { showView("list"); });

  /* ---------- 数据总览 ---------- */
  function loadDashboard() {
    api("/dashboard/summary").then(function (s) {
      var stats = [
        ["all", "反馈总数", s.total, ""], ["pending", "待受理", s.pending, s.pending > 0 ? "warn" : ""],
        ["processing", "办理中", s.processing, ""], ["closed", "本月办结", s.closed_month, ""]
      ];
      $("adStats").innerHTML = stats.map(function (x) {
        return '<div class="ad-stat ' + x[3] + (dashKey === x[0] ? " on" : "") + '" data-key="' + x[0] + '"><b>' + x[2] + '</b><span>' + x[1] + '</span></div>';
      }).join("");
      var trend = s.recent_trend || [];
      var max = Math.max.apply(null, trend.map(function (t) { return t.value; }).concat([1]));
      $("adTrend").innerHTML = trend.map(function (t) {
        return '<div class="ad-bar" data-h="' + Math.max(6, Math.round(t.value / max * 110)) + '" title="' + esc(t.date) + '"><i>' + t.value + '</i></div>';
      }).join("") || '<p class="ad-empty">暂无数据</p>';
      $("adTrend").querySelectorAll(".ad-bar").forEach(function (b) { b.style.height = b.getAttribute("data-h") + "px"; });
      var cats = s.by_category || [];
      var cmax = Math.max.apply(null, cats.map(function (c) { return c.value; }).concat([1]));
      $("adCats").innerHTML = cats.map(function (c) {
        return '<div class="ad-cat"><span class="ad-cat-name">' + esc(c.name || "未分类") + '</span><div class="bar"><i data-w="' + Math.round(c.value / cmax * 100) + '"></i></div><b>' + c.value + '</b></div>';
      }).join("") || '<p class="ad-empty">暂无数据</p>';
      $("adCats").querySelectorAll(".bar i").forEach(function (b) { b.style.width = b.getAttribute("data-w") + "%"; });
      if (typeof s.unread_notifications === "number") setBadge(s.unread_notifications);
      loadDashList();
    }).catch(function (ex) { toast(ex.message); });
  }

  /* ---------- 总览反馈内容（点统计卡切换） ---------- */
  var dashKey = "all";
  var DASH_TITLES = { all: "全部反馈", pending: "待受理", processing: "办理中", closed: "本月办结" };
  function dashLoader(key) {
    if (key === "pending") return api("/feedbacks?status=PENDING_ACCEPTANCE&limit=100");
    if (key === "processing") {
      return Promise.all(["ACCEPTED", "VERIFYING", "PROCESSING", "WAITING_EMPLOYEE"].map(function (st) {
        return api("/feedbacks?status=" + st + "&limit=100");
      })).then(function (parts) {
        var all = [].concat.apply([], parts);
        return all.sort(function (x, y) { return String(y.created_at).localeCompare(String(x.created_at)); });
      });
    }
    if (key === "closed") {
      return api("/feedbacks?status=CLOSED&limit=100").then(function (items) {
        var now = new Date();
        var p = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
        return items.filter(function (f) { return String(f.closed_at || f.created_at || "").slice(0, 7) === p; });
      });
    }
    return api("/feedbacks?limit=100");
  }
  function loadDashList() {
    var box = $("adDashList");
    if (!box) return;
    $("adDashTitle").textContent = DASH_TITLES[dashKey] || "全部反馈";
    box.innerHTML = '<p class="ad-empty">加载中…</p>';
    dashLoader(dashKey).then(function (items) {
      box.innerHTML = items.length ? items.map(function (f) {
        return '<div class="ad-ditem" data-id="' + f.id + '"><span class="pid">' + esc(f.public_id) + '</span>' +
          '<span class="tt">' + esc(f.title || "(无标题)") + '</span>' +
          '<span class="st ' + esc(f.status) + '">' + esc(STATUS_LABELS[f.status] || f.status) + '</span>' +
          '<time>' + esc(fmtTime(f.created_at)) + '</time></div>';
      }).join("") : '<p class="ad-empty">这个板块暂时没有反馈</p>';
    }).catch(function (ex) { box.innerHTML = '<p class="ad-empty">' + esc(ex.message) + '</p>'; });
  }
  $("adStats").addEventListener("click", function (e) {
    var card = e.target.closest(".ad-stat[data-key]");
    if (!card) return;
    dashKey = card.getAttribute("data-key");
    document.querySelectorAll(".ad-stat").forEach(function (el) { el.classList.toggle("on", el === card); });
    loadDashList();
  });
  $("adDashList").addEventListener("click", function (e) {
    var row = e.target.closest(".ad-ditem[data-id]");
    if (row) openDetail(row.getAttribute("data-id"));
  });

  /* ---------- 通知 ---------- */
  function setBadge(n) {
    var b = $("adNotifBadge");
    b.textContent = n;
    b.hidden = !n;
  }
  function refreshBadge() {
    api("/notifications").then(function (r) { setBadge(r.unread || 0); }).catch(function () {});
  }
  function loadNotifs() {
    api("/notifications").then(function (r) {
      setBadge(r.unread || 0);
      var items = r.items || [];
      $("adNotifs").innerHTML = items.length ? items.map(function (n) {
        return '<div class="ad-notif' + (n.is_read ? "" : " unread") + '" data-nid="' + n.id + '" data-fid="' + (n.feedback_id || "") + '">' +
          '<div class="ad-notif-t">' + esc(n.title || "通知") + '<time>' + esc(fmtTime(n.created_at)) + '</time></div>' +
          '<p>' + esc(n.content || "") + '</p>' +
          (n.public_id ? '<span class="ad-notif-pid">' + esc(n.public_id) + (n.feedback_title ? " · " + esc(n.feedback_title) : "") + '</span>' : "") +
          '</div>';
      }).join("") : '<p class="ad-empty">暂无通知</p>';
    }).catch(function (ex) { toast(ex.message); });
  }
  $("adNotifs").addEventListener("click", function (e) {
    var el = e.target.closest(".ad-notif");
    if (!el) return;
    var nid = el.getAttribute("data-nid"), fid = el.getAttribute("data-fid");
    api("/notifications/" + nid + "/read", { method: "POST" }).catch(function () {}).finally(function () {
      refreshBadge();
      if (fid) openDetail(fid); else el.classList.remove("unread");
    });
  });
  $("notifReadAll").addEventListener("click", function () {
    api("/notifications/read-all", { method: "POST" }).then(function () {
      toast("已全部标为已读"); loadNotifs();
    }).catch(function (ex) { toast(ex.message); });
  });

  /* ---------- 反馈列表 ---------- */
  var statusSel = $("fStatus");
  Object.keys(STATUS_LABELS).forEach(function (k) {
    var o = document.createElement("option");
    o.value = k; o.textContent = STATUS_LABELS[k];
    statusSel.appendChild(o);
  });
  function loadList() {
    var params = new URLSearchParams({ limit: "100" });
    if (statusSel.value) params.set("status", statusSel.value);
    if ($("fQ").value.trim()) params.set("q", $("fQ").value.trim());
    api("/feedbacks?" + params.toString()).then(function (items) {
      var tb = $("adRows");
      if (!items.length) {
        tb.innerHTML = '<tr><td colspan="5" class="ad-td-empty">暂无反馈</td></tr>';
        return;
      }
      tb.innerHTML = items.map(function (f) {
        return '<tr data-id="' + f.id + '"><td class="mono">' + esc(f.public_id) +
          '</td><td>' + esc(f.title || "(无标题)") + (f.unread_count > 0 ? '<i class="dot" title="有未读留言"></i>' : '') +
          '</td><td>' + esc(f.category || "—") +
          '</td><td><span class="st ' + esc(f.status) + '">' + esc(STATUS_LABELS[f.status] || f.status) +
          '</span></td><td class="nowrap">' + esc(fmtTime(f.created_at)) + '</td></tr>';
      }).join("");
    }).catch(function (ex) { toast(ex.message); });
  }
  $("fSearch").addEventListener("click", loadList);
  $("fQ").addEventListener("keydown", function (e) { if (e.key === "Enter") loadList(); });
  $("adRows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-id]");
    if (tr) openDetail(tr.getAttribute("data-id"));
  });

  /* ---------- 详情与办理流 ---------- */
  function priOptions(cur) {
    return Object.keys(PRIORITIES).map(function (k) {
      return '<option value="' + k + '"' + (k === cur ? " selected" : "") + '>' + PRIORITIES[k] + '</option>';
    }).join("");
  }
  function ensureRefs() {
    var jobs = [];
    if (!DEPTS.length) jobs.push(api("/departments").then(function (d) { DEPTS = d || []; }).catch(function () {}));
    if (!USERS.length && ME && ME.role === "SYSTEM_ADMIN") jobs.push(api("/users").then(function (u) { USERS = u || []; }).catch(function () {}));
    return Promise.all(jobs);
  }
  function handlerOptions(deptId, cur) {
    var list = USERS.filter(function (u) {
      return u.status === "ACTIVE" && (u.role === "HANDLER" ? String(u.department_id) === String(deptId) : ADMIN_ROLES[u.role]);
    });
    return '<option value="">不指定办理人</option>' + list.map(function (u) {
      return '<option value="' + u.id + '"' + (String(u.id) === String(cur) ? " selected" : "") + '>' + esc(u.name) + '（' + (u.role === "HANDLER" ? "部门办理人" : "管理员") + '）</option>';
    }).join("");
  }

  function openDetail(id) {
    currentId = id;
    ensureRefs().then(function () {
      return api("/feedbacks/" + id);
    }).then(function (f) {
      currentF = f;
      renderDetail(f);
      showView("detail");
      refreshBadge();
    }).catch(function (ex) { toast(ex.message); });
  }

  function renderDetail(f) {
    var isAdmin = ME && ADMIN_ROLES[ME.role];
    var isSys = ME && ME.role === "SYSTEM_ADMIN";
    var closed = f.status === "CLOSED" || f.status === "REJECTED";
    var dueTxt = "";
    if (f.due_at && !closed) {
      var past = new Date(f.due_at).getTime() < Date.now();
      dueTxt = '<span class="' + (past ? "due-bad" : "") + '">截止 ' + esc(fmtTime(f.due_at)) + (past ? "（已超期）" : "") + '</span>';
    }
    var empDepts = (f.employee_departments || []).map(function (d) { return d.name; }).join("、");
    var confDepts = (f.confirmed_departments || []).map(function (d) { return d.name; }).join("、");
    $("adDetail").innerHTML =
      '<div class="ad-detail-head"><span class="st ' + esc(f.status) + '">' + esc(STATUS_LABELS[f.status] || f.status) + '</span>' +
      (f.priority && f.priority !== "NORMAL" ? '<span class="pri pri-' + esc(f.priority) + '">' + esc(PRIORITIES[f.priority] || f.priority) + '</span>' : "") +
      (f.is_sensitive ? '<span class="pri pri-SENSITIVE">敏感</span>' : "") +
      '<h3>' + esc(f.title || "(无标题)") + '</h3><p>' + esc(f.description || "") + '</p>' +
      '<div class="ad-meta"><span>编号 ' + esc(f.public_id) + '</span><span>分类 ' + esc(f.category || "—") + '</span>' +
      '<span>提交 ' + esc(fmtTime(f.created_at)) + '</span>' +
      (empDepts ? '<span>员工所选 ' + esc(empDepts) + '</span>' : "") +
      (confDepts ? '<span>承办 ' + esc(confDepts) + '</span>' : "") +
      (f.handler_name ? '<span>办理人 ' + esc(f.handler_name) + '</span>' : "") +
      dueTxt + '</div></div>';

    var H = "";

    /* —— 办理操作 —— */
    var ops = "";
    if (isAdmin && f.status === "PENDING_ACCEPTANCE") {
      ops += '<div class="op-block"><button type="button" class="ad-btn primary op-main" data-act="accept">受理这条反馈</button>' +
        '<p class="op-hint">受理后进入待分派；也可以直接在下方确认承办部门，一步进入办理中。</p></div>';
    }
    if (isSys && ["PENDING_ACCEPTANCE", "ACCEPTED", "VERIFYING", "PROCESSING", "REOPENED", "REPLIED"].indexOf(f.status) >= 0) {
      var pre = (f.confirmed_department_ids && f.confirmed_department_ids.length) ? f.confirmed_department_ids : (f.employee_department_ids || []);
      ops += '<div class="op-block"><h4>确认 / 调整承办部门</h4><div class="dept-grid">' +
        DEPTS.map(function (d) {
          return '<label class="dept-chip"><input type="checkbox" class="cf-dept" value="' + d.id + '"' + (pre.indexOf(d.id) >= 0 ? " checked" : "") + ' />' + esc(d.name) + '</label>';
        }).join("") + '</div>' +
        '<div class="ad-row"><label class="op-lab">优先级 <select id="cfPri">' + priOptions(f.priority || "NORMAL") + '</select></label>' +
        '<button type="button" class="ad-btn" data-act="confirmDepts">确认承办部门</button></div>' +
        '<p class="op-hint">确认后状态变为「办理中」，并通知所选部门。第一个勾选的部门为主责部门。</p></div>';
    }
    if (isSys && ["ACCEPTED", "VERIFYING", "PROCESSING", "REOPENED"].indexOf(f.status) >= 0) {
      var firstDept = (f.confirmed_department_ids || [])[0] || (f.employee_department_ids || [])[0] || (DEPTS[0] && DEPTS[0].id) || "";
      ops += '<div class="op-block"><h4>分派 / 转派</h4>' +
        '<div class="ad-row"><label class="op-lab">主责部门 <select id="asDept">' +
        DEPTS.map(function (d) { return '<option value="' + d.id + '"' + (String(d.id) === String(firstDept) ? " selected" : "") + '>' + esc(d.name) + '</option>'; }).join("") +
        '</select></label>' +
        '<label class="op-lab">办理人 <select id="asHandler">' + handlerOptions(firstDept, f.handler_user_id) + '</select></label>' +
        '<label class="op-lab">优先级 <select id="asPri">' + priOptions(f.priority || "NORMAL") + '</select></label>' +
        '<button type="button" class="ad-btn" data-act="assign">确认分派</button></div></div>';
    }
    if (isAdmin && !closed && String(f.handler_user_id || "") !== String(ME.id)) {
      ops += '<div class="op-block"><button type="button" class="ad-btn" data-act="takeover">由我接管办理</button>' +
        '<span class="op-hint inline">接管后由你负责跟进这条反馈。</span></div>';
    }
    if (ops) H += '<div class="ad-card"><h3>办理操作</h3>' + ops + '</div>';

    /* —— 部门回复审核 —— */
    var reps = f.department_replies || [];
    if (reps.length) {
      H += '<div class="ad-card"><h3>部门回复</h3>' + reps.map(function (r) {
        var chip = r.status === "PENDING" ? '<span class="st WAITING_REVIEW">待审核</span>'
          : r.status === "APPROVED" ? '<span class="st REPLIED">已通过 · 已发员工</span>'
          : '<span class="st REJECTED">已退回</span>';
        var s = '<div class="ad-rep"><div class="ad-rep-head"><b>' + esc(r.department_name || "") + '</b><span>' + esc(r.sender_name || "") + ' · ' + esc(fmtTime(r.submitted_at)) + '</span>' + chip + '</div>' +
          '<p>' + esc(r.content) + '</p>';
        if (r.status === "RETURNED" && r.review_note) s += '<p class="ad-rep-note">退回意见（' + esc(r.reviewer_name || "管理员") + '）：' + esc(r.review_note) + '</p>';
        if (r.status === "PENDING" && isAdmin) {
          s += '<div class="ad-row"><button type="button" class="ad-btn primary rep-btn" data-act="approve" data-rid="' + r.id + '">审核通过，发给员工</button>' +
            '<button type="button" class="ad-btn" data-act="returnToggle" data-rid="' + r.id + '">退回修改</button></div>' +
            '<div class="ret-box" id="retBox' + r.id + '" hidden><textarea id="retNote' + r.id + '" rows="2" placeholder="写明退回原因（至少 3 个字），部门会看到这条意见"></textarea>' +
            '<div class="ad-row"><button type="button" class="ad-btn" data-act="returnSend" data-rid="' + r.id + '">确认退回</button></div></div>';
        }
        return s + '</div>';
      }).join("") + '</div>';
    }

    /* —— 部门提交回复（部门办理人） —— */
    if (ME && ME.role === "HANDLER" && ["PROCESSING", "WAITING_EMPLOYEE", "WAITING_REVIEW", "REOPENED"].indexOf(f.status) >= 0) {
      H += '<div class="ad-card"><h3>提交本部门回复</h3>' +
        '<textarea id="deptReplyText" rows="4" placeholder="写下本部门的办理回复，提交后由管理员审核，审核通过才会发给员工"></textarea>' +
        '<div class="ad-row"><button type="button" class="ad-btn primary" data-act="deptReply">提交回复（送审核）</button></div></div>';
    }

    /* —— 往来记录 —— */
    var msgs = f.messages || [];
    if (msgs.length) {
      H += '<div class="ad-card"><h3>往来记录</h3><div class="ad-msgs">' + msgs.map(function (m) {
        if (m.is_internal) {
          return '<div class="ad-msg note"><div class="who">内部备注 · ' + esc(m.sender_name || "管理端") + ' · ' + esc(fmtTime(m.created_at)) + '（员工不可见）</div><p>' + esc(m.content) + '</p></div>';
        }
        var who = m.sender_type === "EMPLOYEE" ? "员工留言" : esc(m.sender_name || "管理端回复");
        return '<div class="ad-msg ' + (m.sender_type === "EMPLOYEE" ? "emp" : "adm") + '"><div class="who">' + who + ' · ' + esc(fmtTime(m.created_at)) + '</div><p>' + esc(m.content) + '</p></div>';
      }).join("") + '</div></div>';
    }

    /* —— 管理员直接回复 —— */
    if (isAdmin && !closed) {
      H += '<div class="ad-card"><h3>管理员直接回复</h3>' +
        '<textarea id="adReplyText" rows="4" placeholder="由管理员直接回复员工（发送后将由你接管办理，状态变为「已回复」）"></textarea>' +
        '<div class="ad-row"><button type="button" class="ad-btn primary" data-act="sendReply">发送回复</button></div></div>';
    }

    /* —— 内部备注 —— */
    H += '<div class="ad-card"><h3>内部备注</h3>' +
      '<textarea id="adNoteText" rows="2" placeholder="只给管理端看的办理记录，员工看不到"></textarea>' +
      '<div class="ad-row"><button type="button" class="ad-btn" data-act="addNote">添加备注</button></div></div>';

    /* —— 状态推进 —— */
    if (isAdmin) {
      var nexts = TRANSITIONS[f.status] || [];
      var body = "";
      if (nexts.length) {
        body = '<div class="ad-row"><select id="adStatusSel">' + nexts.map(function (s) {
          return '<option value="' + s + '">' + STATUS_LABELS[s] + '</option>';
        }).join("") + '</select>' +
          '<input type="text" id="adStatusNote" class="op-note" placeholder="备注（可选，会记入办理轨迹）" />' +
          '<button type="button" class="ad-btn" data-act="setStatus">更新状态</button></div>' +
          '<p class="op-hint">状态只能沿办理路线推进；办结前需所有承办部门都已回复。</p>';
      } else if (f.status === "WAITING_REVIEW") {
        body = '<p class="op-hint">当前有部门回复待审核，请在上方「部门回复」里通过或退回，状态会自动推进。</p>';
      } else {
        body = '<p class="op-hint">当前状态没有可手动推进的下一步。</p>';
      }
      H += '<div class="ad-card"><h3>办理状态（当前：' + esc(STATUS_LABELS[f.status] || f.status) + '）</h3>' + body + '</div>';
    }

    /* —— 办理轨迹 —— */
    var tl = f.timeline || [];
    if (tl.length) {
      H += '<div class="ad-card"><h3>办理轨迹</h3><div class="ad-tl">' + tl.map(function (a) {
        return '<div class="ad-tl-item"><span class="ad-tl-dot"></span><div><p>' + esc(a.content || a.action_type || "") + '</p>' +
          '<time>' + esc(a.actor_name || "") + (a.actor_name ? " · " : "") + esc(fmtTime(a.created_at)) + '</time></div></div>';
      }).join("") + '</div></div>';
    }

    /* —— 员工评价 —— */
    if (f.review) {
      H += '<div class="ad-card"><h3>员工评价</h3><p class="ad-review">' + "★".repeat(Math.max(1, Math.min(5, f.review.rating || 5))) +
        '（' + esc(f.review.rating) + ' 分）' + (f.review.comment ? '：' + esc(f.review.comment) : "") + '</p></div>';
    }

    $("adFlow").innerHTML = H;
  }

  /* 详情页动作（事件委托） */
  $("adFlow").addEventListener("change", function (e) {
    if (e.target.id === "asDept") {
      $("asHandler").innerHTML = handlerOptions(e.target.value, "");
    }
  });
  $("adFlow").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]");
    if (!b || !currentF) return;
    var act = b.getAttribute("data-act"), id = currentId;
    function done(msg) { toast(msg); openDetail(id); }
    function fail(ex) { toast(ex.message); }
    if (act === "accept") {
      if (!confirm("确认受理这条反馈吗？")) return;
      api("/feedbacks/" + id + "/accept", { method: "POST" }).then(function () { done("已受理"); }).catch(fail);
    } else if (act === "confirmDepts") {
      var ids = Array.prototype.map.call(document.querySelectorAll(".cf-dept:checked"), function (c) { return Number(c.value); });
      if (!ids.length) { toast("至少勾选一个承办部门"); return; }
      if (!confirm("确认把这条反馈交给所选部门办理吗？")) return;
      api("/feedbacks/" + id + "/confirm-departments", { method: "POST", body: { department_ids: ids, priority: $("cfPri").value } })
        .then(function () { done("承办部门已确认，已通知部门"); }).catch(fail);
    } else if (act === "assign") {
      var dept = Number($("asDept").value), handler = $("asHandler").value;
      if (!confirm("确认分派吗？")) return;
      api("/feedbacks/" + id + "/assign", { method: "POST", body: { department_id: dept, handler_user_id: handler ? Number(handler) : null, priority: $("asPri").value } })
        .then(function () { done("已分派"); }).catch(fail);
    } else if (act === "takeover") {
      if (!confirm("确定由你接管这条反馈的办理吗？")) return;
      api("/feedbacks/" + id + "/takeover", { method: "POST" }).then(function () { done("已接管"); }).catch(fail);
    } else if (act === "approve") {
      if (!confirm("审核通过后，这条部门回复会立即发送给员工，确定吗？")) return;
      api("/feedbacks/" + id + "/department-replies/" + b.getAttribute("data-rid") + "/approve", { method: "POST" })
        .then(function () { done("已通过，回复已发给员工"); }).catch(fail);
    } else if (act === "returnToggle") {
      var box = $("retBox" + b.getAttribute("data-rid"));
      box.hidden = !box.hidden;
      if (!box.hidden) $("retNote" + b.getAttribute("data-rid")).focus();
    } else if (act === "returnSend") {
      var rid = b.getAttribute("data-rid"), note = $("retNote" + rid).value.trim();
      if (note.length < 3) { toast("退回原因至少写 3 个字"); return; }
      api("/feedbacks/" + id + "/department-replies/" + rid + "/return", { method: "POST", body: { note: note } })
        .then(function () { done("已退回部门修改"); }).catch(fail);
    } else if (act === "deptReply") {
      var text = $("deptReplyText").value.trim();
      if (!text) { toast("请先写下回复内容"); return; }
      if (!confirm("提交后将由管理员审核，确定提交吗？")) return;
      api("/feedbacks/" + id + "/department-reply", { method: "POST", body: { content: text } })
        .then(function () { done("已提交，等待管理员审核"); }).catch(fail);
    } else if (act === "sendReply") {
      var text2 = $("adReplyText").value.trim();
      if (!text2) { toast("请先写下回复内容"); return; }
      if (!confirm("确定发送这条回复给员工吗？发送后将由你接管办理。")) return;
      api("/feedbacks/" + id + "/messages", { method: "POST", body: { content: text2 } })
        .then(function () { done("回复已发送"); }).catch(fail);
    } else if (act === "addNote") {
      var note2 = $("adNoteText").value.trim();
      if (!note2) { toast("请先写下备注"); return; }
      api("/feedbacks/" + id + "/internal-notes", { method: "POST", body: { content: note2 } })
        .then(function () { done("备注已添加"); }).catch(fail);
    } else if (act === "setStatus") {
      var st = $("adStatusSel").value, nt = $("adStatusNote").value.trim();
      if (!confirm("确定把状态改为「" + (STATUS_LABELS[st] || st) + "」吗？")) return;
      api("/feedbacks/" + id + "/status", { method: "POST", body: { status: st, note: nt || null } })
        .then(function () { done("状态已更新"); }).catch(fail);
    }
  });

  /* ---------- 初始化 ---------- */
  if (token) {
    api("/auth/me").then(function (me) { showApp(me); }).catch(function () { showLogin(); });
  } else {
    showLogin();
  }
})();
