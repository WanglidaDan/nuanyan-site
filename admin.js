/* 暖言小站管理端 */
(function () {
  "use strict";
  var API = "/api/v1/admin";

  var $ = function (id) { return document.getElementById(id); };
  var loginView = $("adLogin"), appView = $("adApp");

  var STATUS_LABELS = {
    PENDING_ACCEPTANCE: "待受理", ACCEPTED: "待分派", VERIFYING: "核实中",
    PROCESSING: "办理中", WAITING_EMPLOYEE: "退回补充", WAITING_REVIEW: "回复待审核",
    REPLIED: "已回复", CLOSED: "已办结", REJECTED: "已驳回", REOPENED: "重新办理"
  };

  function toast(msg) {
    var t = $("adToast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "Accept": "application/json" };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch(API + path, {
      method: opts.method || "GET",
      credentials: "same-origin",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 401) { doLogout(true); throw new Error("登录已过期，请重新登录"); }
      return r.json().then(function (data) {
        if (!r.ok) {
          var detail = data && data.detail;
          if (Array.isArray(detail)) detail = detail.map(function (item) { return item.msg; }).join("；");
          throw new Error(detail || ("请求失败(" + r.status + ")"));
        }
        return data;
      });
    });
  }

  function showApp(me) {
    loginView.hidden = true; appView.hidden = false;
    $("adMeName").textContent = (me && (me.name || me.username)) || "管理员";
    loadDashboard();
  }
  function showLogin() {
    appView.hidden = true; loginView.hidden = false;
  }
  function doLogout(silent) {
    fetch(API + "/auth/logout", { method: "POST", credentials: "same-origin" }).catch(function () {});
    showLogin();
    if (!silent) toast("已退出登录");
  }

  /* ---------- login ---------- */
  $("adLoginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var u = $("adUser").value.trim(), p = $("adPass").value;
    var err = $("adLoginErr"), btn = $("adLoginBtn");
    err.hidden = true; btn.disabled = true; btn.textContent = "登录中…";
    fetch(API + "/auth/login", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.detail || "登录失败");
        return data;
      });
    }).then(function () {
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

  /* ---------- nav ---------- */
  var views = { dash: $("viewDash"), list: $("viewList"), detail: $("viewDetail") };
  function showView(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    var btns = document.querySelectorAll(".ad-nav button");
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle("on", b.getAttribute("data-view") === name);
    });
    if (name === "list") loadList();
    if (name === "dash") loadDashboard();
  }
  document.querySelector(".ad-nav").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-view]");
    if (b) showView(b.getAttribute("data-view"));
  });
  $("backToList").addEventListener("click", function () { showView("list"); });

  /* ---------- dashboard ---------- */
  function loadDashboard() {
    api("/dashboard/summary").then(function (s) {
      var stats = [
        ["反馈总数", s.total, ""], ["待受理", s.pending, s.pending > 0 ? "warn" : ""],
        ["办理中", s.processing, ""], ["即将超期", s.due_soon, s.due_soon > 0 ? "warn" : ""],
        ["已超期", s.overdue, s.overdue > 0 ? "warn" : ""], ["本月办结", s.closed_month, ""]
      ];
      $("adStats").innerHTML = stats.map(function (x) {
        return '<div class="ad-stat ' + x[2] + '"><b>' + x[1] + '</b><span>' + x[0] + '</span></div>';
      }).join("");
      var trend = s.recent_trend || [];
      var max = Math.max.apply(null, trend.map(function (t) { return t.value; }).concat([1]));
      $("adTrend").innerHTML = trend.map(function (t) {
        var h = Math.max(0, Math.min(20, Math.round(t.value / max * 20)));
        return '<div class="ad-bar ad-bar-h' + h + '" title="' + esc(t.date) + '"><i>' + t.value + '</i></div>';
      }).join("") || '<p class="ad-empty">暂无数据</p>';
      var cats = s.by_category || [];
      var cmax = Math.max.apply(null, cats.map(function (c) { return c.value; }).concat([1]));
      $("adCats").innerHTML = cats.map(function (c) {
        var w = Math.max(0, Math.min(20, Math.round(c.value / cmax * 20)));
        return '<div class="ad-cat"><span class="ad-cat-label">' + esc(c.name || "未分类") + '</span><div class="bar"><i class="ad-cat-w' + w + '"></i></div><b>' + c.value + '</b></div>';
      }).join("") || '<p class="ad-empty">暂无数据</p>';
    }).catch(function (ex) { toast(ex.message); });
  }

  /* ---------- list ---------- */
  var statusSel = $("fStatus");
  Object.keys(STATUS_LABELS).forEach(function (k) {
    var o = document.createElement("option");
    o.value = k; o.textContent = STATUS_LABELS[k];
    statusSel.appendChild(o);
  });
  var statusSel2 = $("adStatusSel");
  Object.keys(STATUS_LABELS).forEach(function (k) {
    var o = document.createElement("option");
    o.value = k; o.textContent = STATUS_LABELS[k];
    statusSel2.appendChild(o);
  });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtTime(s) {
    if (!s) return "—";
    return String(s).slice(0, 16).replace("T", " ");
  }

  var currentId = null;
  function loadList() {
    var params = new URLSearchParams({ limit: "100" });
    if (statusSel.value) params.set("status", statusSel.value);
    if ($("fQ").value.trim()) params.set("q", $("fQ").value.trim());
    api("/feedbacks?" + params.toString()).then(function (items) {
      var tb = $("adRows");
      if (!items.length) {
        tb.innerHTML = '<tr><td class="ad-empty-cell" colspan="5">暂无反馈</td></tr>';
        return;
      }
      tb.innerHTML = items.map(function (f) {
        return '<tr data-id="' + f.id + '"><td class="ad-mono">' + esc(f.public_id) +
          '</td><td>' + esc(f.title || "(无标题)") + '</td><td>' + esc(f.category || "—") +
          '</td><td><span class="st ' + esc(f.status) + '">' + esc(STATUS_LABELS[f.status] || f.status) +
          '</span></td><td class="ad-nowrap">' + esc(fmtTime(f.created_at)) + '</td></tr>';
      }).join("");
    }).catch(function (ex) { toast(ex.message); });
  }
  $("fSearch").addEventListener("click", loadList);
  $("fQ").addEventListener("keydown", function (e) { if (e.key === "Enter") loadList(); });
  $("adRows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr[data-id]");
    if (tr) openDetail(tr.getAttribute("data-id"));
  });

  /* ---------- detail ---------- */
  function openDetail(id) {
    currentId = id;
    api("/feedbacks/" + id).then(function (f) {
      statusSel2.value = f.status;
      var msgs = (f.messages || []).map(function (m) {
        var who = m.sender_type === "ADMIN" ? "管理端回复" : (m.sender_type === "DEPARTMENT" ? "承办部门" : "员工");
        return '<div class="ad-msg"><div class="who">' + esc(who) + ' · ' + esc(fmtTime(m.created_at)) + '</div><p>' + esc(m.content) + '</p></div>';
      }).join("");
      $("adDetail").innerHTML =
        '<div class="ad-detail-head"><span class="st ' + esc(f.status) + '">' + esc(STATUS_LABELS[f.status] || f.status) + '</span>' +
        '<h3>' + esc(f.title || "(无标题)") + '</h3><p>' + esc(f.description || "") + '</p>' +
        '<div class="ad-meta"><span>编号 ' + esc(f.public_id) + '</span><span>分类 ' + esc(f.category || "—") + '</span>' +
        '<span>承办 ' + esc(f.responsible_department_name || "—") + '</span><span>提交 ' + esc(fmtTime(f.created_at)) + '</span></div></div>' +
        (msgs ? '<div class="ad-card"><h3>往来记录</h3><div class="ad-msgs">' + msgs + '</div></div>' : "");
      $("adReplyText").value = "";
      showView("detail");
    }).catch(function (ex) { toast(ex.message); });
  }
  $("adSendReply").addEventListener("click", function () {
    var text = $("adReplyText").value.trim();
    if (!text) { toast("请先写下回复内容"); return; }
    if (!confirm("确定发送这条回复给员工吗？")) return;
    api("/feedbacks/" + currentId + "/messages", { method: "POST", body: { content: text } })
      .then(function () { toast("回复已发送"); openDetail(currentId); })
      .catch(function (ex) { toast(ex.message); });
  });
  $("adSetStatus").addEventListener("click", function () {
    var st = statusSel2.value;
    if (!confirm("确定把状态改为「" + (STATUS_LABELS[st] || st) + "」吗？")) return;
    api("/feedbacks/" + currentId + "/status", { method: "POST", body: { status: st } })
      .then(function () { toast("状态已更新"); openDetail(currentId); })
      .catch(function (ex) { toast(ex.message); });
  });

  /* ---------- init ---------- */
  api("/auth/me").then(function (me) { showApp(me); }).catch(function () { showLogin(); });
})();
