
      (function () {
        "use strict";
        var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        /* Session state is restored from the server's HttpOnly cookie below. */
        var authState = { loggedIn: false, user: "", username: "" };
        var pendingAfterLogin = null;
        var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
        /* low-end devices (few cores / little memory / data-saver): the CSS
           .low-end rules cut the aurora down to one blob and drop the grain */
        var lowEnd = false;
        try {
          lowEnd = (navigator.hardwareConcurrency || 8) <= 4 ||
            (navigator.deviceMemory || 8) <= 4 ||
            !!(navigator.connection && navigator.connection.saveData);
        } catch (err) {}
        if (lowEnd) document.body.classList.add("low-end");

        /* ---------- splash intro ---------- */
        var splash = document.getElementById("splash");
        var splashActive = false;
        var splashTimer = null;
        function finishSplash() {
          if (!splashActive) return;
          splashActive = false;
          clearTimeout(splashTimer);
          splash.classList.add("done");
          document.body.style.overflow = "";
          startHero();
          if (location.hash === "#write") openWritePage(false, true);
          setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 720);
        }
        if (splash && !reduceMotion) {
          splashActive = true;
          document.body.style.overflow = "hidden";
          splashTimer = setTimeout(finishSplash, 1250);
          splash.addEventListener("click", finishSplash);
        } else if (splash && splash.parentNode) {
          splash.parentNode.removeChild(splash);
        }

        /* ---------- toast ---------- */
        var toastEl = document.getElementById("toast");
        var toastTimer = null;
        function toast(msg) {
          toastEl.textContent = msg;
          toastEl.classList.add("show");
          clearTimeout(toastTimer);
          toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2800);
        }
        function apiRequest(path, options) {
          options = options || {};
          var headers = { "Accept": "application/json" };
          if (options.body) headers["Content-Type"] = "application/json";
          return fetch(path, {
            method: options.method || "GET",
            credentials: "same-origin",
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
          }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
              if (!response.ok) {
                var detail = data && data.detail;
                if (Array.isArray(detail)) detail = detail.map(function (item) { return item.msg; }).join("；");
                throw new Error(detail || "请求失败，请稍后重试");
              }
              return data;
            });
          });
        }
        /* gentle haptics: phones only — navigator.vibrate is a no-op on desktop */
        function buzz(ms) {
          if (window.navigator && "vibrate" in window.navigator) {
            try { navigator.vibrate(ms); } catch (err) {}
          }
        }
        document.querySelectorAll("[data-toast]").forEach(function (el) {
          el.addEventListener("click", function () { toast(el.getAttribute("data-toast")); });
        });

        /* ---------- time greeting ---------- */
        var gHour = new Date().getHours();
        var gText = gHour >= 5 && gHour < 12 ? "早上好" : gHour >= 12 && gHour < 18 ? "下午好" : "晚上好";
        applyAuthState(); /* greeting + header render the restored session, never a hardcoded name */

        /* ---------- header shrink ---------- */
        var header = document.getElementById("siteHeader");
        var progressBar = document.getElementById("scrollProgress");
        function onScroll() {
          header.classList.toggle("scrolled", window.scrollY > 24);
          var max = document.documentElement.scrollHeight - window.innerHeight;
          var p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
          progressBar.style.transform = "scaleX(" + p + ")";
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        /* ---------- mobile menu ---------- */
        var burger = document.getElementById("burgerBtn");
        var mobileMenu = document.getElementById("mobileMenu");
        burger.addEventListener("click", function () {
          var open = mobileMenu.classList.toggle("open");
          burger.setAttribute("aria-expanded", open ? "true" : "false");
        });
        mobileMenu.querySelectorAll("a").forEach(function (a) {
          a.addEventListener("click", function () { mobileMenu.classList.remove("open"); });
        });

        /* ---------- nav active indicator ---------- */
        var navMain = document.querySelector("nav.main");
        var navInd = navMain ? navMain.querySelector(".nav-ind") : null;
        var navItems = navMain ? Array.prototype.slice.call(navMain.querySelectorAll("a, button")) : [];
        function moveNavInd() {
          if (!navInd || !navMain) return;
          var cur = navMain.querySelector("a.active, button.active");
          if (!cur) return;
          navInd.style.left = cur.offsetLeft + "px";
          navInd.style.width = cur.offsetWidth + "px";
        }
        navItems.forEach(function (item) {
          item.addEventListener("click", function () {
            navItems.forEach(function (n) { n.classList.remove("active"); });
            item.classList.add("active");
            moveNavInd();
          });
        });
        requestAnimationFrame(moveNavInd);
        window.addEventListener("resize", moveNavInd);
        window.addEventListener("load", moveNavInd);

        /* ---------- hero title: split chars ---------- */
        var title = document.getElementById("heroTitle");
        var text = title.textContent;
        var highlight = { 8: 1, 9: 1, 10: 1, 11: 1, 12: 1 }; /* 愿意听的人 */
        title.textContent = "";
        var hix = 0;
        var hlWrap = null;
        Array.prototype.forEach.call(text, function (ch, i) {
          var span = document.createElement("span");
          span.className = "ch" + (highlight[i] ? " hl" : "");
          span.textContent = ch;
          span.style.setProperty("--d", (140 + i * 63) + "ms");
          if (highlight[i]) {
            span.style.setProperty("--hix", hix); hix += 1;
            if (!hlWrap) { hlWrap = document.createElement("span"); hlWrap.className = "hl-wrap"; title.appendChild(hlWrap); }
            hlWrap.appendChild(span);
          } else {
            hlWrap = null;
            title.appendChild(span);
          }
        });
        var heroStarted = false;
        function startHero() {
          if (heroStarted) return;
          heroStarted = true;
          document.querySelector(".hero").classList.add("play");
          document.body.classList.add("hero-played");
        }
        if (!splashActive) {
          requestAnimationFrame(function () { requestAnimationFrame(startHero); });
        }

        /* ---------- hero parallax ---------- */
        if (!reduceMotion && finePointer) {
          var hero = document.querySelector(".hero");
          var layers = Array.prototype.slice.call(document.querySelectorAll(".plx"));
          var tx = 0, ty = 0, cx = 0, cy = 0, rafId = null;
          function loop() {
            cx += (tx - cx) * 0.06;
            cy += (ty - cy) * 0.06;
            layers.forEach(function (layer) {
              var depth = (parseFloat(layer.getAttribute("data-depth")) || 0) * 0.7; /* desktop: livelier aurora drift */
              layer.style.transform = "translate3d(" + (cx * depth).toFixed(1) + "px," + (cy * depth).toFixed(1) + "px,0)";
            });
            if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) { rafId = requestAnimationFrame(loop); }
            else { rafId = null; }
          }
          hero.addEventListener("mousemove", function (e) {
            var r = hero.getBoundingClientRect();
            tx = (e.clientX - r.left) / r.width - 0.5;
            ty = (e.clientY - r.top) / r.height - 0.5;
            if (!rafId) rafId = requestAnimationFrame(loop);
          });
          hero.addEventListener("mouseleave", function () {
            tx = 0; ty = 0;
            if (!rafId) rafId = requestAnimationFrame(loop);
          });
        }

        /* ---------- reveal on scroll ---------- */
        var rvEls = Array.prototype.slice.call(document.querySelectorAll(".rv"));
        function revealCheck() {
          var limit = window.innerHeight * 3.2;
          rvEls.forEach(function (el) {
            if (!el.classList.contains("in") && el.getBoundingClientRect().top < limit) el.classList.add("in");
          });
        }
        var revealIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) { entry.target.classList.add("in"); revealIO.unobserve(entry.target); }
          });
        }, { threshold: 0.05, rootMargin: "0px 0px 55% 0px" });
        rvEls.forEach(function (el) { revealIO.observe(el); });
        var revealTicking = false;
        function onRevealScroll() {
          if (revealTicking) return;
          revealTicking = true;
          requestAnimationFrame(function () { revealCheck(); revealTicking = false; });
        }
        window.addEventListener("scroll", onRevealScroll, { passive: true });
        window.addEventListener("resize", onRevealScroll);
        revealCheck();
        /* failsafe: nothing may stay hidden if observers/scroll events misfire */
        setTimeout(revealCheck, 600);
        setTimeout(function () { document.body.classList.add("settled"); }, splashActive ? 3200 : 1100);
        setTimeout(function () { rvEls.forEach(function (el) { el.classList.add("in"); }); }, splashActive ? 3500 : 1800);

        /* ---------- count up ---------- */
        function countUp(el) {
          var target = parseFloat(el.getAttribute("data-target"));
          var decimals = parseInt(el.getAttribute("data-decimals"), 10) || 0;
          if (reduceMotion) { el.textContent = target.toFixed(decimals); return; }
          var dur = 1500, start = null;
          function frame(ts) {
            if (!start) start = ts;
            var p = Math.min((ts - start) / dur, 1);
            var eased = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); /* easeOutExpo: fast rise, soft landing */
            el.textContent = (target * eased).toFixed(decimals);
            if (p < 1) requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }
        var statsReady = false;
        var statsVisible = false;
        function animateStats() {
          if (!statsReady || !statsVisible) return;
          document.querySelectorAll("#statsGrid .count").forEach(countUp);
          statsIO.unobserve(document.getElementById("statsGrid"));
        }
        var statsIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) { statsVisible = true; animateStats(); }
          });
        }, { threshold: 0.35 });
        statsIO.observe(document.getElementById("statsGrid"));
        apiRequest("/api/v1/public/stats").then(function (stats) {
          var values = [stats.total, stats.reply_rate, stats.avg_days];
          document.querySelectorAll("#statsGrid .count").forEach(function (el, i) {
            el.setAttribute("data-target", String(Number(values[i]) || 0));
            el.textContent = "0";
          });
          document.getElementById("statsSource").textContent = "本月实时数据";
          statsReady = true; animateStats();
        }).catch(function () {
          document.querySelectorAll("#statsGrid .count").forEach(function (el) { el.textContent = "—"; });
          document.getElementById("statsSource").textContent = "统计暂不可用";
        });

        /* ---------- dept selection (cards <-> chips) ---------- */
        /* nothing is pre-selected: step 1 must be a real choice, and choosing
           nothing is a validated error path (red words + shake), not a default */
        var selectedDept = "";
        var cards = Array.prototype.slice.call(document.querySelectorAll(".dept-card"));
        var chips = Array.prototype.slice.call(document.querySelectorAll("#deptChips .chip"));
        function setDept(name, announce) {
          if (name !== selectedDept) buzz(15); /* a soft tick when the department changes */
          selectedDept = name;
          cards.forEach(function (c) { c.classList.toggle("selected", c.getAttribute("data-dept") === name); });
          chips.forEach(function (c) { c.classList.toggle("on", c.getAttribute("data-dept") === name); });
          var deEl = document.getElementById("deptError");
          if (deEl) deEl.classList.remove("show");
          var dcEl = document.getElementById("deptChips");
          if (dcEl) dcEl.classList.remove("err");
          updatePreview();
          if (announce) toast("已为你选中：" + name);
        }
        cards.forEach(function (card) {
          card.addEventListener("click", function () {
            setDept(card.getAttribute("data-dept"), true);
            goStep(2);
            scheduleDraftSave();
            openWritePage();
          });
        });
        chips.forEach(function (chip) {
          chip.addEventListener("click", function () { setDept(chip.getAttribute("data-dept"), false); scheduleDraftSave(); });
        });
        updatePreview();

        /* ---------- card 3D tilt ---------- */
        if (!reduceMotion && finePointer) {
          cards.forEach(function (card) {
            card.addEventListener("mousemove", function (e) {
              var r = card.getBoundingClientRect();
              var px = (e.clientX - r.left) / r.width - 0.5;
              var py = (e.clientY - r.top) / r.height - 0.5;
              card.style.transition = "transform 0.12s ease-out, box-shadow 0.3s ease, border-color 0.3s ease";
              card.style.transform = "rotateX(" + (-py * 7).toFixed(2) + "deg) rotateY(" + (px * 7).toFixed(2) + "deg) translateY(-3px)";
            });
            card.addEventListener("mouseleave", function () {
              card.style.transition = "transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease, border-color 0.3s ease";
              card.style.transform = "";
            });
          });
        }

        /* ---------- char count ---------- */
        var textarea = document.getElementById("suggestText");
        var charCount = document.getElementById("charCount");
        textarea.addEventListener("input", function () {
          charCount.textContent = textarea.value.length;
          charCount.classList.toggle("warn", textarea.value.length >= 450);
          if (textarea.value.trim()) {
            var teEl = document.getElementById("textError");
            if (teEl) teEl.classList.remove("show");
          }
          updatePreview();
          scheduleDraftSave();
        });

        /* ---------- submit success flow ---------- */
        var overlay = document.getElementById("successOverlay");
        var submitBtn = document.getElementById("submitBtn");
        var submitLabel = submitBtn.querySelector(".btn-label");
        var plane = submitBtn.querySelector(".btn-plane");
        var submitting = false;
        var submittedPublicId = null;
        var submittedCreatedAt = null;

        function openSuccess() {
          clearDraft();
          var num = submittedPublicId;
          if (!num) return;
          document.getElementById("ticketNum").textContent = num;
          document.getElementById("ticketDept").textContent = selectedDept;
          document.getElementById("ticketCreated").textContent = formatFeedbackDateTime(submittedCreatedAt);
          document.querySelector(".ic-status").textContent = "待受理";
          submittedPublicId = null;
          submittedCreatedAt = null;
          overlay.classList.add("open");
          overlay.setAttribute("aria-hidden", "false");
          syncHtmlBg();
          document.body.style.overflow = "hidden";
          setTimeout(function () { overlay.classList.add("show-content"); }, reduceMotion ? 30 : 300);
          setTimeout(function () { document.getElementById("closeSuccess").focus(); }, reduceMotion ? 60 : 900);
        }
        function closeSuccess() {
          overlay.classList.add("closing");
          overlay.classList.remove("show-content");
          setTimeout(function () {
            overlay.classList.remove("open", "closing");
            overlay.setAttribute("aria-hidden", "true");
            syncHtmlBg();
            document.body.style.overflow = "";
          }, reduceMotion ? 30 : 380);
        }
        /* ---------- send-off sequence: seal → charge → fly → success ----------
           seal 600ms + charge ~210ms + flight 800ms ≈ 1.6s added, then the
           existing success overlay takes over at its usual rhythm.
           Reduced motion skips straight to the success page. */
        var sendFx = document.getElementById("sendFx");
        var sendTrail = document.getElementById("sendTrail");
        var sendPlane = document.getElementById("sendPlane");
        var sendActive = false;
        var sendTimers = [];
        var sendRaf = null;
        function sendLater(fn, ms) { sendTimers.push(setTimeout(fn, ms)); }
        function resetSeal() {
          var card = document.querySelector(".write-page .form-card");
          if (card) { card.classList.remove("sealing"); card.style.transform = ""; }
        }
        function cleanupFx() {
          sendFx.classList.remove("on");
          var ctx = sendTrail.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, sendTrail.width, sendTrail.height);
          sendTrail.style.opacity = "";
          sendPlane.style.opacity = "0";
          sendPlane.style.transform = "";
          sendPlane.classList.remove("charging");
        }
        function restoreSubmitBtn() {
          submitBtn.classList.remove("loading");
          submitLabel.textContent = "确认提交";
          plane.style.display = "";
        }
        function finishSubmit() {
          if (!sendActive) return;
          sendActive = false;
          submitting = false;
          restoreSubmitBtn();
          resetSeal(); /* behind the success disc by now — the restore is invisible */
          openSuccess();
        }
        function cancelSend() {
          if (!sendActive) return;
          sendActive = false;
          sendTimers.forEach(clearTimeout);
          sendTimers = [];
          if (sendRaf) cancelAnimationFrame(sendRaf);
          sendRaf = null;
          submitting = false;
          restoreSubmitBtn();
          resetSeal();
          cleanupFx();
        }
        function sealAndSend() {
          var card = document.querySelector(".write-page .form-card");
          if (!card) { finishSubmit(); return; }
          var rect = card.getBoundingClientRect();
          var cx = rect.left + rect.width / 2;
          var cy = rect.top + rect.height / 2;
          card.classList.add("sealing");
          requestAnimationFrame(function () {
            card.style.transform = "scaleY(" + Math.max(3 / rect.height, 0.012).toFixed(4) + ")";
          });
          sendLater(function () { launchPlane(cx, cy); }, 540);
        }
        function launchPlane(cx, cy) {
          if (!sendActive) return;
          var dpr = Math.min(window.devicePixelRatio || 1, 2);
          sendTrail.width = Math.round(window.innerWidth * dpr);
          sendTrail.height = Math.round(window.innerHeight * dpr);
          sendFx.classList.add("on");
          sendPlane.style.transition = "opacity 0.18s cubic-bezier(0.22,1,0.36,1), transform 0.18s cubic-bezier(0.22,1,0.36,1)";
          sendPlane.style.transform = "translate(" + (cx - 29) + "px," + (cy - 22) + "px) rotate(-6deg) scale(0.55)";
          sendPlane.style.opacity = "0";
          requestAnimationFrame(function () {
            sendPlane.style.opacity = "1";
            sendPlane.style.transform = "translate(" + (cx - 29) + "px," + (cy - 22) + "px) rotate(-6deg) scale(1)";
            sendPlane.classList.add("charging");
          });
          sendLater(function () {
            sendPlane.classList.remove("charging");
            sendPlane.style.transition = "none";
            flyPlane(cx, cy);
          }, 215);
        }
        function flyPlane(sx, sy) {
          if (!sendActive) return;
          buzz(30); /* the plane leaves the desk */
          var W = window.innerWidth, H = window.innerHeight;
          var p0 = { x: sx, y: sy };
          var p1 = { x: sx + W * 0.22, y: sy - H * 0.03 };
          var p2 = { x: W * 0.72, y: sy - H * 0.40 };
          var p3 = { x: W + 90, y: sy - H * 0.52 };
          var ctx = sendTrail.getContext("2d");
          var dpr = Math.min(window.devicePixelRatio || 1, 2);
          function bez(t, a, b, c, d) { var u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }
          function point(t) { return { x: bez(t, p0.x, p1.x, p2.x, p3.x), y: bez(t, p0.y, p1.y, p2.y, p3.y) }; }
          var startTs = null;
          function frame(ts) {
            if (!sendActive) return;
            if (!startTs) startTs = ts;
            var raw = Math.min((ts - startTs) / 860, 1);
            var t = 1 - Math.pow(1 - raw, 4); /* same family as cubic-bezier(0.22,1,0.36,1): swift launch, soft landing */
            var pos = point(t);
            var ahead = point(Math.min(t + 0.012, 1));
            var ang = Math.atan2(ahead.y - pos.y, ahead.x - pos.x) * 180 / Math.PI;
            sendPlane.style.transform = "translate(" + (pos.x - 29) + "px," + (pos.y - 22) + "px) rotate(" + ang.toFixed(1) + "deg)";
            if (ctx) {
              ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
              ctx.clearRect(0, 0, W, H);
              ctx.beginPath();
              var steps = Math.max(2, Math.floor(t / 0.02));
              for (var i = 0; i <= steps; i++) {
                var sp = point((i / steps) * t || 0);
                if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
              }
              ctx.setLineDash([8, 7]);
              ctx.lineWidth = 2.5;
              ctx.lineCap = "round";
              ctx.strokeStyle = "rgba(217, 164, 65, 0.85)";
              ctx.stroke();
            }
            if (raw < 1) { sendRaf = requestAnimationFrame(frame); return; }
            sendRaf = null;
            sendTrail.style.opacity = "0"; /* the gold trail fades as the disc opens */
            sendPlane.style.opacity = "0";
            finishSubmit();
            sendLater(cleanupFx, 520);
          }
          sendRaf = requestAnimationFrame(frame);
        }
        function runSubmit() {
          if (submitting) return;
          submitting = true;
          submitBtn.classList.add("loading");
          submitLabel.textContent = "正在提交…";
          apiRequest("/api/v1/feedbacks", {
            method: "POST",
            body: { department: selectedDept, content: textarea.value.trim() }
          }).then(function (data) {
            submittedPublicId = data.public_id;
            submittedCreatedAt = data.created_at;
            if (!submittedPublicId) throw new Error("服务器未返回建议编号，请联系管理员核对提交状态");
            sendActive = true;
            buzz(20);
            plane.style.display = "none";
            if (reduceMotion) { sendLater(finishSubmit, 60); return; }
            sealAndSend();
          }).catch(function (error) {
            submitting = false;
            sendActive = false;
            restoreSubmitBtn();
            cleanupFx();
            toast(error.message || "提交失败，请稍后重试");
          });
        }
        submitBtn.addEventListener("click", function () {
          var tval = textarea.value.trim();
          if (!tval || tval.length < 10) {
            goStep(2);
            textarea.classList.remove("shake");
            void textarea.offsetWidth;
            textarea.classList.add("shake");
            var teEl = document.getElementById("textError");
            if (teEl) { teEl.textContent = tval ? "建议内容至少写 10 个字，再详细说说吧" : "写下你的建议吧"; teEl.classList.add("show"); }
            textarea.focus();
            return;
          }
          runSubmit();
        });

        /* ---------- unified ripple + gentle haptics ---------- */
        function spawnRipple(host, layer, e, light) {
          if (reduceMotion) return;
          var r = host.getBoundingClientRect();
          var size = Math.max(r.width, r.height) * 2;
          var x = e && e.clientX ? e.clientX - r.left : r.width / 2;
          var y = e && e.clientY ? e.clientY - r.top : r.height / 2;
          var rip = document.createElement("span");
          rip.className = "ripple" + (light ? "" : " ink");
          rip.style.width = rip.style.height = size + "px";
          rip.style.left = (x - size / 2) + "px";
          rip.style.top = (y - size / 2) + "px";
          (layer || host).appendChild(rip);
          setTimeout(function () { rip.remove(); }, 650);
        }
        submitBtn.addEventListener("click", function (e) { spawnRipple(submitBtn, null, e, true); });
        cards.forEach(function (card) {
          var layer = document.createElement("span");
          layer.className = "ink-layer";
          layer.setAttribute("aria-hidden", "true");
          card.appendChild(layer);
          card.addEventListener("click", function (e) { spawnRipple(card, layer, e, false); });
        });
        chips.forEach(function (chip) {
          chip.addEventListener("click", function (e) { spawnRipple(chip, null, e, chip.classList.contains("on")); });
        });
        navItems.forEach(function (item) {
          item.addEventListener("click", function (e) { spawnRipple(item, null, e, false); });
        });
        if (window.navigator && "vibrate" in window.navigator) {
          document.querySelectorAll(".btn-primary, .btn-light").forEach(function (btn) {
            btn.addEventListener("click", function () { try { navigator.vibrate(8); } catch (err) {} });
          });
        }

        /* ---------- copy ticket number ---------- */
        var copyBtn = document.getElementById("copyTicket");
        var copyLabel = copyBtn.querySelector(".cp-label");
        var copyTimer = null;
        function markCopied() {
          copyBtn.classList.add("copied");
          copyLabel.textContent = "已复制 ✓";
          toast("编号已复制：" + document.getElementById("ticketNum").textContent);
          clearTimeout(copyTimer);
          copyTimer = setTimeout(function () {
            copyBtn.classList.remove("copied");
            copyLabel.textContent = "复制编号";
          }, 2200);
        }
        copyBtn.addEventListener("click", function () {
          var num = document.getElementById("ticketNum").textContent;
          function fallbackCopy() {
            var ta = document.createElement("textarea");
            ta.value = num;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); markCopied(); }
            catch (err) { toast("编号是 " + num + "，请保存好这张凭证"); }
            ta.remove();
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(num).then(markCopied, fallbackCopy);
          } else { fallbackCopy(); }
        });
        document.getElementById("closeSuccess").addEventListener("click", function () {
          closeSuccess();
          closeWritePage();
          window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        });
        document.getElementById("againBtn").addEventListener("click", function () {
          closeSuccess();
          textarea.value = "";
          charCount.textContent = "0";
          charCount.classList.remove("warn");
          goStep(1);
          setTimeout(function () {
            var sc = document.getElementById("writeScroll");
            if (sc) sc.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
          }, reduceMotion ? 40 : 420);
        });
        overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSuccess(); });

        /* ---------- modals ---------- */
        var fbTimer = null;
        var STATUS_COPY = {
          PENDING_ACCEPTANCE: ["待受理", "recv"], ACCEPTED: ["已受理", "recv"],
          VERIFYING: ["核实中", "doing"], PROCESSING: ["办理中", "doing"],
          WAITING_EMPLOYEE: ["待补充", "doing"], WAITING_REVIEW: ["待审核", "doing"],
          REPLIED: ["已回复", "done"], CLOSED: ["已办结", "done"],
          REJECTED: ["已驳回", "done"], REOPENED: ["重新办理", "doing"]
        };
        function formatFeedbackDate(value) {
          var date = new Date(value);
          if (Number.isNaN(date.getTime())) return "时间待更新";
          return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
        }
        function formatFeedbackDateTime(value) {
          var date = new Date(value);
          if (Number.isNaN(date.getTime())) return "时间待更新";
          return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
        }
        function renderMyFeedback(items) {
          var wrap = document.getElementById("fbMineItems");
          var skel = document.getElementById("fbSkel");
          var list = document.getElementById("fbList");
          var empty = document.getElementById("fbEmpty");
          if (!wrap || !list) return;
          wrap.replaceChildren();
          items.forEach(function (feedback) {
            var item = document.createElement("div");
            item.className = "fb-item";
            var top = document.createElement("div"); top.className = "fb-top";
            var id = document.createElement("span"); id.textContent = feedback.public_id;
            var state = STATUS_COPY[feedback.status] || ["处理中", "doing"];
            var chip = document.createElement("span"); chip.className = "status-chip " + state[1];
            var dot = document.createElement("span"); dot.className = "sd"; dot.setAttribute("aria-hidden", "true");
            chip.append(dot, document.createTextNode(state[0])); top.append(id, chip);
            var title = document.createElement("div"); title.className = "fb-title"; title.textContent = feedback.title;
            var meta = document.createElement("div"); meta.className = "fb-meta";
            meta.textContent = feedback.department + " · " + formatFeedbackDate(feedback.created_at) + " 提交";
            var detail = document.createElement("div"); detail.className = "fb-detail"; detail.hidden = true;
            var body = document.createElement("p"); body.textContent = "建议内容：" + feedback.description; detail.appendChild(body);
            (feedback.messages || []).forEach(function (message) {
              var reply = document.createElement("p");
              reply.textContent = (message.sender_type === "ADMIN" ? "平台回复：" : "补充说明：") + message.content;
              detail.appendChild(reply);
            });
            item.append(top, title, meta, detail); wrap.appendChild(item);
          });
          if (skel) skel.classList.remove("show");
          list.hidden = items.length === 0;
          if (empty) empty.hidden = items.length !== 0;
        }
        function settleFeedback() {
          apiRequest("/api/v1/feedbacks/mine").then(renderMyFeedback).catch(function (error) {
            var skel = document.getElementById("fbSkel");
            if (skel) skel.classList.remove("show");
            toast(error.message || "暂时无法读取反馈记录");
          });
        }
        document.getElementById("fbList").addEventListener("click", function (e) {
          var item = e.target.closest(".fb-item");
          if (!item) return;
          var detail = item.querySelector(".fb-detail");
          if (detail) {
            var isOpen = item.classList.toggle("expanded");
            detail.hidden = !isOpen;
          }
        });
        function playFbSkeleton() {
          var skel = document.getElementById("fbSkel");
          var list = document.getElementById("fbList");
          var empty = document.getElementById("fbEmpty");
          if (!skel || !list) return;
          skel.classList.add("show");
          list.hidden = true;
          if (empty) empty.hidden = true;
          clearTimeout(fbTimer);
          fbTimer = setTimeout(settleFeedback, reduceMotion ? 60 : 300);
        }
        function resetMyFeedback() {
          var wrap = document.getElementById("fbMineItems");
          if (wrap) wrap.replaceChildren();
        }
        var fbEmptyWrite = document.getElementById("fbEmptyWrite");
        if (fbEmptyWrite) fbEmptyWrite.addEventListener("click", function () {
          closeModal(document.getElementById("mineModal"));
          openWritePage(true, true);
        });
        function openModal(id) {
          if (id === "mineModal" && !authState.loggedIn) {
            /* gated: detour to login, then open 我的反馈 */
            pendingAfterLogin = function () { openModal("mineModal"); };
            mobileMenu.classList.remove("open");
            openAuthPage("login");
            return;
          }
          var m = document.getElementById(id);
          m.classList.add("open");
          m.setAttribute("aria-hidden", "false");
          if (id === "mineModal") playFbSkeleton();
          mobileMenu.classList.remove("open");
          var focusable = m.querySelector("input, .m-close");
          if (focusable) setTimeout(function () { focusable.focus(); }, reduceMotion ? 20 : 260);
        }
        function closeModal(m) {
          m.classList.remove("open");
          m.setAttribute("aria-hidden", "true");
        }
        document.querySelectorAll("[data-open-modal]").forEach(function (el) {
          el.addEventListener("click", function () { openModal(el.getAttribute("data-open-modal")); });
        });
        document.querySelectorAll(".modal").forEach(function (m) {
          m.querySelectorAll("[data-close-modal]").forEach(function (el) {
            el.addEventListener("click", function () { closeModal(m); });
          });
        });
        document.addEventListener("keydown", function (e) {
          if (e.key !== "Escape") return;
          document.querySelectorAll(".modal.open").forEach(closeModal);
          if (overlay.classList.contains("open")) closeSuccess();
        });

        /* ---------- compose wizard (3 steps) ---------- */
        var wizardTrack = document.getElementById("wizardTrack");
        var wizardViewport = document.getElementById("wizardViewport");
        var wizardPanes = Array.prototype.slice.call(wizardTrack.children);
        var curStep = 1;
        function sizeWizard() {
          if (!wizardViewport || !wizardPanes[curStep - 1]) return;
          wizardViewport.style.height = wizardPanes[curStep - 1].offsetHeight + "px";
        }
        function updatePreview() {
          document.getElementById("pvDept").textContent = selectedDept || "—";
          document.getElementById("pvText").textContent = document.getElementById("suggestText").value;
        }
        function goStep(n) {
          if (n !== curStep) buzz(10); /* step switch tick */
          curStep = n;
          wizardTrack.style.transform = "translateX(" + (-(n - 1) * 100) + "%)";
          document.querySelectorAll("#wSteps .wstep").forEach(function (ws) {
            var s = parseInt(ws.getAttribute("data-ws"), 10);
            ws.classList.toggle("cur", s === n);
            ws.classList.toggle("done", s < n);
          });
          document.querySelectorAll("#wSteps .ws-line").forEach(function (ln, i) {
            ln.classList.toggle("fill", i < n - 1);
          });
          document.querySelectorAll("#wStepsV .wp-vstep").forEach(function (ws) {
            var s = parseInt(ws.getAttribute("data-ws"), 10);
            ws.classList.toggle("cur", s === n);
            ws.classList.toggle("done", s < n);
          });
          /* keyboard order follows the visible step: controls on the other
             panes leave the tab sequence entirely, so Tab walks 1 → 2 → 3 */
          wizardPanes.forEach(function (pane, i) {
            var active = i === n - 1;
            pane.setAttribute("aria-hidden", active ? "false" : "true");
            pane.querySelectorAll("button, textarea, input, select, a[href]").forEach(function (el) {
              if (active) el.removeAttribute("tabindex");
              else el.setAttribute("tabindex", "-1");
            });
          });
          if (n === 3) updatePreview();
          sizeWizard();
        }
        /* shared invalid-state: red words under the field + a shake on it */
        function flagInvalid(fieldEl, errEl, wrapEl) {
          if (errEl) errEl.classList.add("show");
          if (wrapEl) wrapEl.classList.add("err");
          if (fieldEl) {
            fieldEl.classList.remove("shake-x");
            void fieldEl.offsetWidth;
            fieldEl.classList.add("shake-x");
          }
        }
        document.getElementById("toStep2").addEventListener("click", function () {
          if (!selectedDept) {
            var chipsEl = document.getElementById("deptChips");
            flagInvalid(chipsEl, document.getElementById("deptError"), chipsEl);
            toast("先选一个承办部门");
            return;
          }
          goStep(2);
        });
        document.getElementById("toStep3").addEventListener("click", function () {
          if (!textarea.value.trim()) {
            textarea.classList.remove("shake");
            void textarea.offsetWidth;
            textarea.classList.add("shake");
            var teEl = document.getElementById("textError");
            if (teEl) teEl.classList.add("show");
            toast("先写一句话，再确认提交哦");
            textarea.focus();
            return;
          }
          goStep(3);
        });
        document.querySelectorAll("[data-back]").forEach(function (b) {
          b.addEventListener("click", function () { goStep(parseInt(b.getAttribute("data-back"), 10)); });
        });
        window.addEventListener("resize", sizeWizard);
        if (window.ResizeObserver) {
          var paneRO = new ResizeObserver(function () { sizeWizard(); });
          wizardPanes.forEach(function (p) { paneRO.observe(p); });
        }
        goStep(1);
        setTimeout(sizeWizard, 600);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { sizeWizard(); });

        /* ---------- write page routing (hash #write) ---------- */
        var writePage = document.getElementById("writePage");
        var writeScroll = document.getElementById("writeScroll");
        var writeOpen = false;
        if (writeScroll) {
          /* the desk top bar stays melted into the green until the letter
             scrolls under it, then a faint divider fades in */
          writeScroll.addEventListener("scroll", function () {
            writePage.classList.toggle("scrolled", writeScroll.scrollTop > 10);
          }, { passive: true });
        }
        function openWritePage(push, fromStep1) {
          if (!authState.loggedIn) {
            /* gated: detour to login, then continue to the write page */
            pendingAfterLogin = function () { openWritePage(push, fromStep1); };
            openAuthPage("login");
            return;
          }
          if (writeOpen || !writePage) return;
          /* CTA and #write deep links always land on step 1 (choose a department).
             Only a department-card click or the draft-restore button may enter at
             step 2, and both call goStep(2) themselves before opening the page. */
          if (fromStep1) goStep(1);
          writeOpen = true;
          writePage.classList.add("open");
          var db1 = document.getElementById("draftBar");
          if (db1) { db1.classList.remove("show"); db1.hidden = true; }
          syncHtmlBg();
          writePage.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
          if (writeScroll) writeScroll.scrollTop = 0;
          if (push !== false) { try { history.pushState({ page: "write" }, "", "#write"); } catch (err) {} }
          sizeWizard();
          setTimeout(sizeWizard, 80);
          setTimeout(sizeWizard, 580);
          /* keyboard users land inside the letter, on the active step's first control */
          setTimeout(function () {
            var pane = wizardPanes[curStep - 1];
            var target = pane && pane.querySelector("button, textarea");
            if (target) target.focus({ preventScroll: true });
          }, reduceMotion ? 30 : 620);
        }
        function closeWritePage(push) {
          if (!writeOpen || !writePage) return;
          cancelSend(); /* never let a mid-flight sequence fire the success page over the homepage */
          writeOpen = false;
          writePage.classList.remove("open");
          syncHtmlBg();
          writePage.setAttribute("aria-hidden", "true");
          if (!overlay.classList.contains("open")) document.body.style.overflow = "";
          if (push !== false) { try { history.pushState(null, "", location.pathname + location.search); } catch (err) {} }
          navItems.forEach(function (n, i) { n.classList.toggle("active", i === 0); });
          moveNavInd();
        }
        document.getElementById("writeClose").addEventListener("click", function () { closeWritePage(); });
        document.getElementById("writeBrand").addEventListener("click", function () { closeWritePage(); });
        document.querySelectorAll("[data-write-open]").forEach(function (el) {
          el.addEventListener("click", function (e) { e.preventDefault(); openWritePage(true, true); });
        });
        window.addEventListener("hashchange", function () {
          if (location.hash === "#write") openWritePage(false, true);
          else closeWritePage(false);
        });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && writeOpen && !overlay.classList.contains("open") && !document.querySelector(".modal.open")) closeWritePage();
        });
        if (location.hash === "#write" && !splashActive) openWritePage(false, true);

        /* ---------- auth pages: login / register / forgot + gating ---------- */
        var authPage = document.getElementById("authPage");
        var authOpen = false;
        var apPanels = {
          login: document.getElementById("loginPanel"),
          register: document.getElementById("registerPanel"),
          forgot: document.getElementById("forgotPanel")
        };
        function showPanel(name) {
          Object.keys(apPanels).forEach(function (k) { apPanels[k].classList.toggle("on", k === name); });
          authPage.setAttribute("aria-label", name === "login" ? "登录" : name === "register" ? "注册" : "忘记密码");
          if (authOpen) {
            var first = apPanels[name].querySelector("input");
            if (first) setTimeout(function () { first.focus(); }, reduceMotion ? 20 : 300);
          }
        }
        /* keep the iOS safe-area letterbox the same color as the active view */
        function syncHtmlBg() {
          var de = document.documentElement.style;
          var bg, tc;
          if (overlay.classList.contains("open")) { bg = "#22513B"; tc = "#22513B"; }
          else if (writeOpen) { bg = "#22392E"; tc = "#22392E"; }
          else if (authOpen) { bg = "#152419"; tc = "#152419"; }
          else { bg = ""; tc = null; }
          de.background = bg;
          var metas = document.querySelectorAll('meta[name="theme-color"]');
          for (var i = 0; i < metas.length; i++) {
            var mt = metas[i];
            if (!mt.hasAttribute("data-orig")) mt.setAttribute("data-orig", mt.getAttribute("content") || "");
            mt.setAttribute("content", tc || mt.getAttribute("data-orig"));
          }
        }
        function openAuthPage(panel, push) {
          if (authOpen) { showPanel(panel || "login"); return; }
          authOpen = true;
          authPage.classList.add("open");
          var db2 = document.getElementById("draftBar");
          if (db2) { db2.classList.remove("show"); db2.hidden = true; }
          syncHtmlBg();
          authPage.setAttribute("aria-hidden", "false");
          document.body.style.overflow = "hidden";
          showPanel(panel || "login");
          if (push !== false) { try { history.pushState({ page: "auth" }, "", "#" + (panel || "login")); } catch (err) {} }
        }
        function closeAuthPage(push) {
          if (!authOpen) return;
          authOpen = false;
          authPage.classList.remove("open");
          syncHtmlBg();
          authPage.setAttribute("aria-hidden", "true");
          if (!writeOpen && !overlay.classList.contains("open")) document.body.style.overflow = "";
          if (push !== false) { try { history.pushState(null, "", location.pathname + location.search); } catch (err) {} }
        }
        function goPanel(name) {
          showPanel(name);
          try { history.pushState({ page: "auth" }, "", "#" + name); } catch (err) {}
        }
        document.querySelectorAll("[data-ap-go]").forEach(function (b) {
          b.addEventListener("click", function () { goPanel(b.getAttribute("data-ap-go")); });
        });
        document.getElementById("authClose").addEventListener("click", function () { pendingAfterLogin = null; closeAuthPage(); });
        document.getElementById("authBrand").addEventListener("click", function () { pendingAfterLogin = null; closeAuthPage(); });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && authOpen) { pendingAfterLogin = null; closeAuthPage(); }
        });
        window.addEventListener("hashchange", function () {
          var h = location.hash;
          if (h === "#login" || h === "#register" || h === "#forgot") openAuthPage(h.slice(1), false);
          else if (authOpen && h !== "#write") closeAuthPage(false);
        });
        if (["#login", "#register", "#forgot"].indexOf(location.hash) >= 0 && !splashActive) openAuthPage(location.hash.slice(1), false);

        function applyAuthState() {
          document.body.classList.toggle("logged-out", !authState.loggedIn);
          document.body.classList.toggle("logged-in", authState.loggedIn);
          var gt = document.getElementById("greetingText");
          var dispName = authState.user || "";
          if (gt) gt.textContent = authState.loggedIn ? gText + "，" + dispName : "欢迎来到暖言小站";
          if (authState.loggedIn) {
            var name = authState.user;
            var un = document.querySelector(".user-chip .u-name");
            var av = document.querySelector(".user-chip .avatar");
            var ud = document.querySelector(".user-chip .u-dept");
            if (un) un.textContent = name;
            if (av) av.textContent = name.charAt(0);
            if (ud) ud.textContent = "已登录";
          }
        }
        function authSuccess(account, msg) {
          if (authState.username !== account.username) resetMyFeedback();
          authState.loggedIn = true;
          authState.username = account.username;
          authState.user = account.name || account.username;
          applyAuthState();
          var f = pendingAfterLogin;
          pendingAfterLogin = null;
          closeAuthPage();
          toast(msg || "欢迎回来");
          if (f) setTimeout(f, reduceMotion ? 30 : 120);
        }
        document.getElementById("loginEntry").addEventListener("click", function () { pendingAfterLogin = null; openAuthPage("login"); });
        document.getElementById("registerEntry").addEventListener("click", function () { pendingAfterLogin = null; openAuthPage("register"); });
        document.getElementById("menuRegister").addEventListener("click", function () {
          pendingAfterLogin = null;
          mobileMenu.classList.remove("open");
          burger.setAttribute("aria-expanded", "false");
          openAuthPage("register");
        });
        document.getElementById("chipRegister").addEventListener("click", function () {
          pendingAfterLogin = null;
          toggleUserPanel(false);
          openAuthPage("register");
        });
        /* one logout path for every entry (hamburger menu + account dropdown):
           clear the session, persist that, then re-render header + greeting */
        function doLogout() {
          if (!authState.loggedIn) return;
          if (!confirm("确定要退出登录吗？未提交的草稿会被清除。")) return;
          apiRequest("/api/v1/auth/logout", { method: "POST" }).catch(function () {});
          authState.loggedIn = false;
          authState.user = "";
          authState.username = "";
          resetMyFeedback();
          try { localStorage.removeItem(DRAFT_KEY); } catch (err) {}
          var ta = document.getElementById("suggestText");
          if (ta) ta.value = "";
          pendingAfterLogin = null;
          applyAuthState();
          mobileMenu.classList.remove("open");
          burger.setAttribute("aria-expanded", "false");
          toggleUserPanel(false);
          toast("已退出登录，草稿已清除");
        }
        document.getElementById("logoutBtn").addEventListener("click", doLogout);
        document.getElementById("chipLogout").addEventListener("click", doLogout);

        /* form helpers: red error + shake, loading button, ripple */
        function apError(form, msg, input) {
          var errEl = form.querySelector(".a-error");
          errEl.textContent = msg;
          errEl.classList.add("show");
          if (input) input.closest(".a-field").classList.add("err");
          form.classList.remove("shake");
          void form.offsetWidth;
          form.classList.add("shake");
        }
        function apClear(form) {
          form.querySelector(".a-error").classList.remove("show");
          form.querySelectorAll(".a-field.err").forEach(function (f) { f.classList.remove("err"); });
        }
        function apLoading(btn, on, label) {
          btn.classList.toggle("loading", on);
          var lb = btn.querySelector(".btn-label");
          if (lb && label) lb.textContent = label;
        }
        document.querySelectorAll(".ap-card .btn-primary").forEach(function (btn) {
          btn.addEventListener("click", function (e) { spawnRipple(btn, null, e, true); });
        });
        document.querySelectorAll(".a-eye").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var input = btn.closest(".a-field").querySelector("input");
            var show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.classList.toggle("show", show);
            btn.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
          });
        });

        /* login */
        var loginForm = document.getElementById("loginPanel");
        loginForm.addEventListener("submit", function (e) {
          e.preventDefault();
          var u = document.getElementById("loginUser").value.trim();
          var p = document.getElementById("loginPass").value;
          apClear(loginForm);
          var btn = document.getElementById("loginSubmit");
          apLoading(btn, true, "登录中…");
          apiRequest("/api/v1/auth/login", { method: "POST", body: { username: u, password: p } })
            .then(function (data) { apLoading(btn, false, "登录"); authSuccess(data.user, "登录成功"); })
            .catch(function (error) { apLoading(btn, false, "登录"); apError(loginForm, error.message, document.getElementById("loginPass")); });
        });

        /* register */
        var regForm = document.getElementById("registerPanel");
        var regPass = document.getElementById("regPass");
        var regMeter = document.getElementById("regMeter");
        var regMeterTxt = document.getElementById("regMeterTxt");
        function passLevel(p) {
          if (!p) return 0;
          var s = 0;
          if (p.length >= 6) s++;
          if (p.length >= 10) s++;
          if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
          if (/\d/.test(p)) s++;
          if (/[^A-Za-z0-9]/.test(p)) s++;
          return s <= 2 ? 1 : s <= 3 ? 2 : 3;
        }
        regPass.addEventListener("input", function () {
          var lv = passLevel(regPass.value);
          regMeter.classList.toggle("show", lv > 0);
          regMeter.setAttribute("data-level", String(lv));
          regMeterTxt.textContent = lv === 1 ? "弱" : lv === 2 ? "中" : lv === 3 ? "强" : "";
        });
        regForm.addEventListener("submit", function (e) {
          e.preventDefault();
          apClear(regForm);
          var u = document.getElementById("regUser").value.trim();
          var p1 = regPass.value;
          var p2 = document.getElementById("regPass2").value;
          var em = document.getElementById("regEmail").value.trim();
          var code = document.getElementById("regCode").value.trim();
          if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(u)) { apError(regForm, "账号需字母开头，4–32 位", document.getElementById("regUser")); return; }
          if (p1.length < 12) { apError(regForm, "密码至少 12 位", regPass); return; }
          if (p1 !== p2) { apError(regForm, "两次输入的密码不一致", document.getElementById("regPass2")); return; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { apError(regForm, "邮箱格式不正确", document.getElementById("regEmail")); return; }
          if (!/^\d{6}$/.test(code)) { apError(regForm, "请输入邮箱收到的 6 位验证码", document.getElementById("regCode")); return; }
          var btn = document.getElementById("regSubmit");
          apLoading(btn, true, "注册中…");
          apiRequest("/api/v1/auth/register", { method: "POST", body: { username: u, email: em, password: p1, verification_code: code } })
            .then(function (data) { apLoading(btn, false, "注册"); authSuccess(data.user, "注册成功，欢迎来到暖言小站"); })
            .catch(function (error) { apLoading(btn, false, "注册"); apError(regForm, error.message, document.getElementById("regCode")); });
        });
        var regSendCode = document.getElementById("regSendCode");
        var regCodeCountdown = 0;
        regSendCode.addEventListener("click", function () {
          if (regCodeCountdown > 0) return;
          var username = document.getElementById("regUser").value.trim();
          var email = document.getElementById("regEmail").value.trim();
          if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(username)) { apError(regForm, "先填写有效账号", document.getElementById("regUser")); return; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { apError(regForm, "先填写有效邮箱", document.getElementById("regEmail")); return; }
          regSendCode.disabled = true;
          apiRequest("/api/v1/auth/email-verification/request", { method: "POST", body: { username: username, email: email } })
            .then(function (data) {
              toast(data.message || "如果邮箱可用，验证码已发送");
              regCodeCountdown = 60;
              regSendCode.textContent = "重新发送（60s）";
              var tick = setInterval(function () {
                regCodeCountdown--;
                if (regCodeCountdown <= 0) {
                  clearInterval(tick);
                  regSendCode.disabled = false;
                  regSendCode.textContent = "发送验证码";
                } else regSendCode.textContent = "重新发送（" + regCodeCountdown + "s）";
              }, 1000);
            })
            .catch(function (error) { toast(error.message); regSendCode.disabled = false; });
        });
        apiRequest("/api/v1/auth/me").then(function (data) {
          authState.loggedIn = true; authState.username = data.user.username; authState.user = data.user.name || data.user.username; applyAuthState();
        }).catch(function () { authState.loggedIn = false; authState.username = ""; authState.user = ""; applyAuthState(); });

        /* forgot password */
        var fgForm = document.getElementById("forgotPanel");
        var fgSend = document.getElementById("fgSend");
        var fgStep2 = document.getElementById("fgStep2");
        var fgLeft = 0;
        fgSend.addEventListener("click", function () {
          if (fgLeft > 0) return;
          apClear(fgForm);
          var u = document.getElementById("fgUser").value.trim();
          var em = document.getElementById("fgEmail").value.trim();
          if (!u) { apError(fgForm, "先填写账号", document.getElementById("fgUser")); return; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { apError(fgForm, "邮箱格式不正确", document.getElementById("fgEmail")); return; }
          fgSend.disabled = true;
          apiRequest("/api/v1/auth/password-reset/request", { method: "POST", body: { username: u, email: em } })
            .then(function (data) {
              fgStep2.classList.add("on"); toast(data.message || "如果账号与邮箱匹配，验证码已发送");
              fgLeft = 60; fgSend.textContent = "重新发送（" + fgLeft + "s）";
              var fgTimer = setInterval(function () {
                fgLeft--;
                if (fgLeft <= 0) { clearInterval(fgTimer); fgSend.disabled = false; fgSend.textContent = "重新发送验证码"; }
                else fgSend.textContent = "重新发送（" + fgLeft + "s）";
              }, 1000);
            }).catch(function (error) { fgSend.disabled = false; apError(fgForm, error.message, document.getElementById("fgEmail")); });
        });
        fgForm.addEventListener("submit", function (e) {
          e.preventDefault();
          if (!fgStep2.classList.contains("on")) { fgSend.click(); return; }
          apClear(fgForm);
          var code = document.getElementById("fgCode").value.trim();
          var np = document.getElementById("fgPass").value;
          if (!/^\d{6}$/.test(code)) { apError(fgForm, "请输入 6 位验证码", document.getElementById("fgCode")); return; }
          if (np.length < 12) { apError(fgForm, "新密码至少 12 位", document.getElementById("fgPass")); return; }
          var btn = document.getElementById("fgSubmit");
          apLoading(btn, true, "提交中…");
          apiRequest("/api/v1/auth/password-reset/confirm", { method: "POST", body: {
            username: document.getElementById("fgUser").value.trim(), email: document.getElementById("fgEmail").value.trim(),
            code: code, password: np
          } }).then(function () {
            apLoading(btn, false, "完成重置");
            document.getElementById("loginUser").value = document.getElementById("fgUser").value.trim();
            goPanel("login"); toast("密码已更新，请重新登录");
          }).catch(function (error) { apLoading(btn, false, "完成重置"); apError(fgForm, error.message, document.getElementById("fgCode")); });
        });

        /* ---------- chat card: static-first, playback as enhancement ----------
           The finished scene is plain HTML/CSS — fully visible with no JS at
           all. Playback runs ONCE when the card scrolls into view: .playing
           hides the bubbles and pops them back in sequence, then the card
           settles back to the static scene. A 1.5s watchdog, try/catch and
           the already-played flag make a blank card impossible: reduced
           motion, a JS error or a slow network all leave the static scene. */
        var chatCard = document.querySelector(".chat-card");
        if (chatCard) {
          var seqBubbles = Array.prototype.slice.call(chatCard.querySelectorAll(".bubble[data-b]"));
          var seqByKey = {};
          seqBubbles.forEach(function (b) { seqByKey[b.getAttribute("data-b")] = b; });
          var typingBubble = document.getElementById("typingBubble");
          var chatChip = document.getElementById("chatChip");
          var chatTimers = [];
          var chatPlayed = false;   /* auto-play happens at most once */
          var chatStarted = false;  /* watchdog flag: sequence actually running */
          var chatPlaying = false;
          function chatLater(fn, ms) { chatTimers.push(setTimeout(fn, ms)); }
          function clearChatTimers() { chatTimers.forEach(clearTimeout); chatTimers = []; }
          function popBubble(b) { if (b) b.classList.add("pop"); }
          function showTyping() {
            if (!typingBubble) return;
            typingBubble.classList.add("on");
            requestAnimationFrame(function () { requestAnimationFrame(function () { typingBubble.classList.add("pop"); }); });
          }
          function hideTyping() { if (typingBubble) typingBubble.classList.remove("pop", "on"); }
          function showStaticChat() {
            /* the always-safe finished scene: no .playing, no pending timers */
            clearChatTimers();
            chatPlaying = false;
            chatCard.classList.remove("playing", "arm");
            seqBubbles.forEach(function (b) { b.classList.remove("pop"); });
            hideTyping();
            if (chatChip) chatChip.classList.remove("show");
          }
          function playChat() {
            if (reduceMotion) { showStaticChat(); return; }
            clearChatTimers();
            chatCard.classList.add("arm"); /* transitions off for one frame… */
            seqBubbles.forEach(function (b) { b.classList.remove("pop"); });
            hideTyping();
            if (chatChip) chatChip.classList.remove("show");
            chatCard.classList.add("playing"); /* …so the hidden state lands instantly */
            void chatCard.offsetWidth;
            requestAnimationFrame(function () { chatCard.classList.remove("arm"); });
            chatPlaying = true;
            chatStarted = true;
            chatLater(function () { popBubble(seqByKey["1"]); }, 350);
            chatLater(function () { popBubble(seqByKey["2"]); }, 1050); /* 700ms after the first */
            chatLater(showTyping, 1800);
            chatLater(function () { hideTyping(); popBubble(seqByKey["3"]); }, 3150); /* typing holds ~1.35s */
            chatLater(function () { popBubble(seqByKey["4"]); }, 3950);
            chatLater(function () { if (chatChip) chatChip.classList.add("show"); }, 4650);
            chatLater(showStaticChat, 5600); /* settle back to the static scene */
          }
          function safePlayChat() {
            chatStarted = false;
            setTimeout(function () { if (!chatStarted) showStaticChat(); }, 1500); /* watchdog: never stay hidden */
            try { playChat(); } catch (err) { showStaticChat(); }
          }
          if (!reduceMotion && "IntersectionObserver" in window) {
            var chatIO = new IntersectionObserver(function (entries) {
              entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                  if (!chatPlayed) { chatPlayed = true; safePlayChat(); }
                } else if (chatPlaying) { showStaticChat(); } /* scrolled away mid-play: settle static, never blank */
              });
            }, { threshold: 0.25 });
            chatIO.observe(chatCard);
          }
          var replayBtn = document.getElementById("chatReplay");
          if (replayBtn) replayBtn.addEventListener("click", function () { chatPlayed = true; safePlayChat(); });

          /* bubble hearts: burst of 6 mini hearts + a light buzz on phones */
          var HEART_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
          chatCard.querySelectorAll(".b-heart").forEach(function (btn) {
            btn.addEventListener("click", function () {
              if (window.navigator && "vibrate" in window.navigator) { try { navigator.vibrate(8); } catch (err) {} }
              if (reduceMotion) return;
              if (btn.animate) {
                btn.animate(
                  [{ transform: "scale(1)" }, { transform: "scale(1.45)" }, { transform: "scale(1)" }],
                  { duration: 320, easing: "ease-out" }
                );
              }
              var bubble = btn.closest(".bubble");
              if (!bubble) return;
              for (var i = 0; i < 6; i++) {
                var p = document.createElement("span");
                p.className = "h-particle";
                p.innerHTML = HEART_SVG;
                var sz = 8 + (i % 3) * 3;
                p.style.width = sz + "px";
                p.style.height = sz + "px";
                bubble.appendChild(p);
                var ang = (-95 + i * 19) * Math.PI / 180;
                var dist = 30 + (i % 3) * 11;
                var dx = Math.cos(ang) * dist;
                var dy = Math.sin(ang) * dist;
                (function (el, dx2, dy2, delay) {
                  if (el.animate) {
                    el.animate(
                      [
                        { transform: "translate(0, 0) scale(0.4) rotate(0deg)", opacity: 1 },
                        { transform: "translate(" + dx2.toFixed(1) + "px, " + dy2.toFixed(1) + "px) scale(1) rotate(" + (dx2 > 0 ? 24 : -24) + "deg)", opacity: 0 }
                      ],
                      { duration: 640, delay: delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
                    );
                  }
                  setTimeout(function () { if (el.parentNode) el.remove(); }, 1300);
                })(p, dx, dy, i * 25);
              }
            });
          });
        }

        /* ---------- notifications: the bell opens a quiet empty-state panel ---------- */
        var bellBtn = document.getElementById("bellBtn");
        var bellPanel = document.getElementById("bellPanel");
        function toggleBell(force) {
          var open = typeof force === "boolean" ? force : !bellPanel.classList.contains("open");
          bellPanel.classList.toggle("open", open);
          bellPanel.setAttribute("aria-hidden", open ? "false" : "true");
          bellBtn.setAttribute("aria-expanded", open ? "true" : "false");
        }
        bellBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleUserPanel(false); toggleBell(); });
        bellPanel.addEventListener("click", function (e) { e.stopPropagation(); });
        document.addEventListener("click", function () {
          if (bellPanel.classList.contains("open")) toggleBell(false);
        });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && bellPanel.classList.contains("open")) toggleBell(false);
        });

        /* ---------- account menu (chip dropdown: 注册新账号 / 退出登录) ---------- */
        var userChip = document.getElementById("userChip");
        var userPanel = document.getElementById("userPanel");
        function toggleUserPanel(force) {
          var open = typeof force === "boolean" ? force : !userPanel.classList.contains("open");
          userPanel.classList.toggle("open", open);
          userPanel.setAttribute("aria-hidden", open ? "false" : "true");
          userChip.setAttribute("aria-expanded", open ? "true" : "false");
        }
        userChip.addEventListener("click", function (e) { e.stopPropagation(); toggleBell(false); toggleUserPanel(); });
        userPanel.addEventListener("click", function (e) { e.stopPropagation(); });
        document.addEventListener("click", function () {
          if (userPanel.classList.contains("open")) toggleUserPanel(false);
        });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && userPanel.classList.contains("open")) toggleUserPanel(false);
        });

        /* ---------- draft autosave ---------- */
        var DRAFT_KEY = "nuanyan-draft-v1";
        var draftBar = document.getElementById("draftBar");
        var draftTimer = null;
        var savedDraft = null;
        function scheduleDraftSave() {
          clearTimeout(draftTimer);
          draftTimer = setTimeout(saveDraftNow, 400);
        }
        function saveDraftNow() {
          try {
            if (textarea.value.trim()) {
              localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: textarea.value, dept: selectedDept }));
            } else {
              localStorage.removeItem(DRAFT_KEY);
            }
          } catch (err) {}
        }
        function showDraftBar() {
          draftBar.hidden = false;
          requestAnimationFrame(function () {
            draftBar.classList.add("show");
            header.style.top = draftBar.offsetHeight + "px";
          });
        }
        function hideDraftBar() {
          if (draftBar.hidden) return;
          draftBar.classList.remove("show");
          header.style.top = "";
          setTimeout(function () { draftBar.hidden = true; }, 400);
        }
        function clearDraft() {
          try { localStorage.removeItem(DRAFT_KEY); } catch (err) {}
          savedDraft = null;
          hideDraftBar();
        }
        try {
          var rawDraft = localStorage.getItem(DRAFT_KEY);
          if (rawDraft) {
            var parsedDraft = JSON.parse(rawDraft);
            if (parsedDraft && parsedDraft.text && parsedDraft.text.trim()) savedDraft = parsedDraft;
          }
        } catch (err) {}
        if (savedDraft) showDraftBar();
        window.addEventListener("resize", function () {
          if (savedDraft && !draftBar.hidden && draftBar.classList.contains("show")) {
            header.style.top = draftBar.offsetHeight + "px";
          }
        });
        document.getElementById("draftRestore").addEventListener("click", function () {
          if (!savedDraft) return;
          if (savedDraft.dept) setDept(savedDraft.dept, false);
          textarea.value = savedDraft.text;
          charCount.textContent = textarea.value.length;
          charCount.classList.toggle("warn", textarea.value.length >= 450);
          savedDraft = null;
          hideDraftBar();
          goStep(2);
          openWritePage();
          toast("草稿已恢复，接着写吧");
        });
        document.getElementById("draftDiscard").addEventListener("click", function () {
          clearDraft();
          toast("草稿已丢弃");
        });

      })();
    