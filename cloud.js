/* Облако учебника «UX-менеджмент и цифровой опыт»: вход студента, учёт активности,
   сдача тестов и отчётов в общую базу Supabase (та же, что у isu-trainer / kuod-trainer).
   Настройки — в cloud-config.js (window.ISU_CLOUD). Все записи помечаются data.course = 'ux'.
   Если cloud-config.js пуст или отсутствует, учебник работает локально, как раньше. */
(function () {
  'use strict';
  var COURSE = 'ux';
  var CLOUD = (window.ISU_CLOUD && ISU_CLOUD.url && ISU_CLOUD.key) ? ISU_CLOUD : null;
  var P = window.UXP;
  var SB_URLS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
                 'https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'];
  var SB = null, ME = null, SB_FAIL = false;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function qid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function sessOnce(k) { try { if (sessionStorage.getItem(k)) return false; sessionStorage.setItem(k, '1'); } catch (e) {} return true; }
  var CQ = { get: function () { return P.get('cq', []); }, set: function (q) { P.set('cq', q.slice(-2000)); } };

  window.UXCloud = { on: function () {}, enabled: !!CLOUD, user: function () { return ME; }, sendReport: null, openAuth: null };
  if (!CLOUD) return;

  /* ---------- стили окна входа ---------- */
  var st = document.createElement('style');
  st.textContent = '#auth-dlg{border:1px solid var(--line);border-radius:14px;padding:22px 24px;max-width:460px;width:92vw;background:var(--panel);color:var(--ink);box-shadow:0 12px 40px rgba(0,0,0,.25)}#auth-dlg::backdrop{background:rgba(10,18,30,.5)}#auth-dlg.wide{max-width:760px}#auth-dlg h2{margin:0 0 8px;font:600 22px "IBM Plex Sans Condensed",sans-serif}.au-x{position:absolute;right:12px;top:8px}.fld{display:block;margin:10px 0}.fld span{display:block;font-size:13px;color:var(--mut);margin-bottom:3px}.fld input{width:100%}.linkbtn{background:none;border:0;color:var(--accent);padding:4px 6px;cursor:pointer;font:inherit}.au-msg{min-height:20px;font-size:14px;margin:10px 0 0}.cl-err{color:var(--bad)}.cl-okt{color:var(--good)}.cl-ok{padding:8px 12px;border-radius:8px;background:var(--goodbg);color:var(--good);margin:8px 0}.cl-warn{padding:8px 12px;border-radius:8px;background:var(--warnbg);color:var(--warn);margin:8px 0}.acct-me{display:flex;flex-direction:column;line-height:1.2;text-align:right}.acct-me small{color:var(--mut)}.btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}';
  document.head.appendChild(st);
  var dlg = document.createElement('dialog'); dlg.id = 'auth-dlg'; document.body.appendChild(dlg);
  var slot = document.createElement('div'); slot.id = 'cloud-acct'; slot.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  var acct = $('#acct'); if (acct) acct.insertBefore(slot, acct.firstChild);

  function cloudLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    return new Promise(function (res, rej) {
      var i = 0;
      (function next() {
        if (i >= SB_URLS.length) return rej(new Error('lib'));
        var s = document.createElement('script'); s.src = SB_URLS[i++];
        s.onload = function () { window.supabase && window.supabase.createClient ? res(window.supabase) : next(); };
        s.onerror = next; document.head.appendChild(s);
      })();
    });
  }

  /* ---------- панель учётной записи ---------- */
  function shortFio(f) { var p = String(f).trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : '') + (p[2] ? p[2][0] + '.' : ''); }
  function acctRender() {
    var qn = CQ.get().filter(function (x) { return ME && x.uid === ME.id; }).length;
    var nm = $('#u-name'), gr = $('#u-group');
    if (nm) nm.style.display = ME ? 'none' : ''; if (gr) gr.style.display = ME ? 'none' : '';
    if (SB_FAIL) { slot.innerHTML = '<span style="font-size:13px;color:var(--mut)">Сервер недоступен — работа сохраняется на этом устройстве</span>'; return; }
    if (!SB) { slot.innerHTML = '<span style="font-size:13px;color:var(--mut)">Подключение…</span>'; return; }
    if (!ME) { slot.innerHTML = '<button class="pri" data-auth="login">Войти</button><button data-auth="signup">Регистрация</button>'; return; }
    var teacherUrl = CLOUD.teacher || 'https://dkanetova76-hue.github.io/isu-trainer/teacher.html';
    slot.innerHTML = '<span class="acct-me"><b>' + esc(shortFio(ME.fio)) + '</b><small>' + esc(ME.grp) + (qn ? ' · ждут отправки: ' + qn : '') + '</small></span>' +
      (ME.role === 'teacher' ? '<a class="btn" href="' + esc(teacherUrl) + '">Кабинет преподавателя</a>' : '<button data-auth="mine">Мои работы</button>') +
      '<button data-auth="logout">Выйти</button>';
  }

  /* ---------- вход, регистрация ---------- */
  var authAfter = null;
  function authOpen(mode, note, after) {
    authAfter = after || null;
    function F(id, lab, type, ac) { return '<label class="fld"><span>' + lab + '</span><input id="' + id + '" type="' + (type || 'text') + '" autocomplete="' + (ac || '') + '"></label>'; }
    var h = '';
    if (mode === 'login') h = '<h2>Вход</h2>' + (note ? '<p style="font-size:14px;color:var(--mut)">' + esc(note) + '</p>' : '') + F('au-email', 'Электронная почта', 'email', 'email') + F('au-pass', 'Пароль', 'password', 'current-password') +
      '<div class="btns"><button class="pri" data-au="do-login">Войти</button><button class="linkbtn" data-auth="signup">Регистрация</button><button class="linkbtn" data-auth="reset">Забыли пароль?</button></div>';
    if (mode === 'signup') h = '<h2>Регистрация студента</h2><p style="font-size:14px;color:var(--mut)">Код группы выдаёт преподаватель. ФИО пишите полностью — так оно попадёт в ведомость.</p>' +
      F('au-fio', 'Фамилия Имя Отчество', 'text', 'name') + F('au-code', 'Код группы', 'text', 'off') + '<p style="font-size:14px" id="au-grp"></p>' + F('au-email', 'Электронная почта', 'email', 'email') + F('au-pass', 'Пароль (не меньше 6 знаков)', 'password', 'new-password') +
      '<div class="btns"><button class="pri" data-au="do-signup">Зарегистрироваться</button><button class="linkbtn" data-auth="login">У меня уже есть вход</button></div>';
    if (mode === 'reset') h = '<h2>Восстановление пароля</h2><p style="font-size:14px;color:var(--mut)">Пришлём на почту ссылку. Откройте её на этом же устройстве и задайте новый пароль.</p>' + F('au-email', 'Электронная почта', 'email', 'email') +
      '<div class="btns"><button class="pri" data-au="do-reset">Отправить ссылку</button><button class="linkbtn" data-auth="login">Назад</button></div>';
    if (mode === 'newpass') h = '<h2>Новый пароль</h2>' + F('au-pass', 'Новый пароль (не меньше 6 знаков)', 'password', 'new-password') + '<div class="btns"><button class="pri" data-au="do-newpass">Сохранить</button></div>';
    if (mode === 'mine') h = '<h2>Мои работы</h2><div id="au-mine"><p style="font-size:14px">Загрузка…</p></div>';
    dlg.innerHTML = '<form method="dialog" class="au-x"><button class="linkbtn" aria-label="Закрыть">✕</button></form>' + h + '<p class="au-msg" id="au-msg" role="status"></p>';
    dlg.classList.toggle('wide', mode === 'mine');
    if (!dlg.open) dlg.showModal();
    var f = dlg.querySelector('input'); if (f) f.focus();
    if (mode === 'mine') loadMine();
    var code = $('#au-code');
    if (code) code.addEventListener('change', function () {
      SB.rpc('check_group_code', { p_code: code.value.trim() }).then(function (r) { $('#au-grp').innerHTML = r.data ? 'Группа: <b>' + esc(r.data) + '</b>' : '<span class="cl-err">Код не найден</span>'; });
    });
  }
  window.UXCloud.openAuth = authOpen;
  function auMsg(t, ok) { var m = $('#au-msg'); if (m) { m.className = 'au-msg ' + (ok ? 'cl-okt' : 'cl-err'); m.textContent = t; } }
  function AUERR(e) {
    var m = (e && e.message) || '';
    if (/Invalid login/i.test(m)) return 'Неверная почта или пароль.';
    if (/not confirmed/i.test(m)) return 'Почта не подтверждена: откройте ссылку из письма.';
    if (/already registered/i.test(m)) return 'Эта почта уже зарегистрирована — войдите.';
    if (/at least 6/i.test(m)) return 'Пароль слишком короткий: нужно не меньше 6 знаков.';
    if (/Database error/i.test(m)) return 'Регистрация отклонена: проверьте код группы и ФИО.';
    if (/valid email|invalid format/i.test(m)) return 'Проверьте адрес почты.';
    if (/rate limit|too many/i.test(m)) return 'Слишком много попыток. Подождите минуту.';
    return m || 'Нет связи с сервером.';
  }
  function loadMine() {
    SB.from('submissions').select('id,kind,ref,title,score,grade,teacher_grade,teacher_comment,created_at,course:data->>course').order('created_at', { ascending: false }).limit(300).then(function (r) {
      var box = $('#au-mine'); if (!box) return;
      if (r.error) { box.innerHTML = '<p class="cl-err">' + esc(AUERR(r.error)) + '</p>'; return; }
      var data = (r.data || []).filter(function (s) { return s.course === COURSE; });
      if (!data.length) { box.innerHTML = '<p style="font-size:14px">Пока ничего не сдано.</p>'; return; }
      box.innerHTML = '<div class="tw"><table><thead><tr><th>Дата</th><th>Работа</th><th>Результат</th><th>Оценка преподавателя</th></tr></thead><tbody>' + data.map(function (s) {
        return '<tr><td>' + new Date(s.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) + '</td><td>' + (s.kind === 'test' ? 'Тест: ' : 'Отчёт: ') + esc(s.title || s.ref) + '</td><td>' + (s.kind === 'test' ? s.score + ' %' : 'заполнено ' + s.score + ' %') + '</td><td>' +
          (s.teacher_grade ? '<b>' + s.teacher_grade + '</b>' : '<span style="color:var(--mut)">не проверено</span>') + (s.teacher_comment ? '<br><small>' + esc(s.teacher_comment) + '</small>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-auth]');
    if (a && (a.closest('#cloud-acct') || a.closest('#auth-dlg'))) {
      e.preventDefault(); var m = a.dataset.auth;
      if (m === 'logout') {
        timeFlush(); cloudFlush().then(function () { return syncPush(true); }).then(function () { return SB.auth.signOut(); }).then(function () { ME = null; acctRender(); });
        return;
      }
      authOpen(m); return;
    }
    var b = e.target.closest('[data-au]'); if (!b) return; e.preventDefault();
    var v = function (id) { return (($('#' + id) || {}).value) || ''; };
    b.disabled = true;
    var done = function () { b.disabled = false; };
    var act = b.dataset.au, p;
    if (act === 'do-login') {
      p = SB.auth.signInWithPassword({ email: v('au-email').trim(), password: v('au-pass') }).then(function (r) {
        if (r.error) { auMsg(AUERR(r.error)); return; }
        return loadMe(r.data.user).then(function (ok) { if (ok) { dlg.close(); var f = authAfter; authAfter = null; if (f) f(); } else auMsg('Профиль не найден. Обратитесь к преподавателю.'); });
      });
    } else if (act === 'do-signup') {
      var fio = v('au-fio').trim().replace(/\s+/g, ' '), code = v('au-code').trim();
      if (fio.split(' ').length < 2) { auMsg('Укажите фамилию и имя полностью.'); done(); return; }
      p = SB.rpc('check_group_code', { p_code: code }).then(function (g) {
        if (!g.data) { auMsg('Неверный код группы. Уточните его у преподавателя.'); return; }
        return SB.auth.signUp({ email: v('au-email').trim(), password: v('au-pass'), options: { data: { fio: fio, code: code }, emailRedirectTo: location.href.split('#')[0] } }).then(function (r) {
          if (r.error) { auMsg(AUERR(r.error)); return; }
          if (r.data.session) return loadMe(r.data.user).then(function () { dlg.close(); var f = authAfter; authAfter = null; if (f) f(); });
          auMsg('Готово! На почту отправлено письмо: откройте ссылку, чтобы подтвердить адрес, затем войдите.', true);
        });
      });
    } else if (act === 'do-reset') {
      p = SB.auth.resetPasswordForEmail(v('au-email').trim(), { redirectTo: location.href.split('#')[0] }).then(function (r) { if (r.error) auMsg(AUERR(r.error)); else auMsg('Ссылка отправлена. Проверьте почту (и папку «Спам»).', true); });
    } else if (act === 'do-newpass') {
      p = SB.auth.updateUser({ password: v('au-pass') }).then(function (r) { if (r.error) auMsg(AUERR(r.error)); else { auMsg('Пароль изменён.', true); return SB.auth.getSession().then(function (s) { if (s.data.session) return loadMe(s.data.session.user); }); } });
    }
    if (p) p.catch(function (err) { auMsg(AUERR(err)); }).then(done); else done();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.closest && e.target.closest('#auth-dlg input')) { var b = $('#auth-dlg [data-au]'); if (b) { e.preventDefault(); b.click(); } }
  });

  /* ---------- профиль, очередь событий ---------- */
  function loadMe(user) {
    return SB.from('profiles').select('id,fio,grp,role,email').eq('id', user.id).single().then(function (r) {
      if (r.error || !r.data) { ME = null; acctRender(); return false; }
      ME = r.data; P.set('name', ME.fio); P.set('group', ME.grp);
      var nm = $('#u-name'), gr = $('#u-group'); if (nm) nm.value = ME.fio; if (gr) gr.value = ME.grp;
      acctRender(); cloudFlush();
      if (sessOnce('ux-login-' + ME.id)) ev('login', null, null, { ua: navigator.userAgent.slice(0, 120), w: window.innerWidth });
      syncPull();
      return true;
    });
  }
  function ev(kind, ref, val, data) {
    if (!ME) return;
    var d = {}; for (var k in (data || {})) d[k] = data[k]; d.course = COURSE;
    var q = CQ.get(); q.push({ qid: qid(), t: 'events', uid: ME.id, row: { kind: kind, ref: ref == null ? null : String(ref), val: val, data: d, at: new Date().toISOString() } });
    CQ.set(q); flushSoon();
  }
  var cfT = null, cfBusy = false;
  function flushSoon() { clearTimeout(cfT); cfT = setTimeout(cloudFlush, 3000); }
  function cloudFlush() {
    if (!SB || !ME || cfBusy) return Promise.resolve();
    cfBusy = true;
    var chain = Promise.resolve();
    var evs = CQ.get().filter(function (x) { return x.uid === ME.id && x.t === 'events'; }).slice(0, 500);
    if (evs.length) chain = chain.then(function () {
      return SB.from('events').insert(evs.map(function (x) { return x.row; })).then(function (r) {
        if (!r.error) { var ids = {}; evs.forEach(function (x) { ids[x.qid] = 1; }); CQ.set(CQ.get().filter(function (x) { return !ids[x.qid]; })); }
      });
    });
    CQ.get().filter(function (x) { return x.uid === ME.id && x.t === 'submissions'; }).forEach(function (s) {
      chain = chain.then(function () {
        return SB.from('submissions').insert(s.row).then(function (r) { if (!r.error) CQ.set(CQ.get().filter(function (x) { return x.qid !== s.qid; })); });
      });
    });
    return chain.catch(function () {}).then(function () { cfBusy = false; acctRender(); });
  }
  /* активное время по разделам */
  var lastAct = Date.now(), tBuck = {}, curTab = 'home';
  ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(function (e) { addEventListener(e, function () { lastAct = Date.now(); }, { passive: true, capture: true }); });
  setInterval(function () { if (!ME || document.visibilityState !== 'visible' || Date.now() - lastAct > 120000) return; tBuck[curTab] = (tBuck[curTab] || 0) + 15; }, 15000);
  function timeFlush() { Object.keys(tBuck).forEach(function (g) { if (tBuck[g] > 0) { ev('time', g, tBuck[g]); tBuck[g] = 0; } }); }
  setInterval(timeFlush, 120000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { timeFlush(); cloudFlush(); } });
  addEventListener('online', cloudFlush);

  /* ---------- события учебника ---------- */
  var HOOKS = {
    tab: function (t) { curTab = t; },
    lecture: function (n) { if (ME && sessOnce('ux-lec-' + n)) ev('lecture', n); },
    lecture_done: function (n) { ev('lecture_done', n); },
    practice: function (n) { if (ME && sessOnce('ux-pr-' + n)) ev('practice', n); },
    test_start: function (ref) { ev('test_start', ref); },
    test_submit: function (r) {
      if (!ME) return false;
      var row = { kind: 'test', ref: r.ref, title: r.title, score: r.pct, grade: gradeOf(r.pct),
        data: { course: COURSE, sid: ME.id + '-' + r.seed, lv: r.lv, typed: 0, paste: 0, got: r.ok, auto: r.n,
          items: r.items, open: r.open || [] } };
      var q = CQ.get(); q.push({ qid: qid(), t: 'submissions', uid: ME.id, row: row }); CQ.set(q); cloudFlush();
      return true;
    }
  };
  function gradeOf(p) { return p >= 85 ? 5 : p >= 70 ? 4 : p >= 50 ? 3 : 2; }
  window.UXCloud.on = function (name, payload) { try { var f = HOOKS[name]; return f ? f(payload) : undefined; } catch (e) { return undefined; } };

  /* ---------- сдача отчёта (DOCX в хранилище works + запись в submissions) ---------- */
  var enc = new TextEncoder();
  var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var parts = [], cen = [], off = 0;
    function u16(v) { return [v & 255, (v >> 8) & 255]; } function u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var nm = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var lh = [0x50, 0x4b, 3, 4].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nm.length), u16(0));
      parts.push(new Uint8Array(lh), nm, data);
      cen.push({ nm: nm, crc: crc, len: data.length, off: off });
      off += lh.length + nm.length + data.length;
    });
    var cdStart = off, cdLen = 0;
    cen.forEach(function (c) {
      var h = [0x50, 0x4b, 1, 2].concat(u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c.crc), u32(c.len), u32(c.len), u16(c.nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.off));
      parts.push(new Uint8Array(h), c.nm); cdLen += h.length + c.nm.length;
    });
    parts.push(new Uint8Array([0x50, 0x4b, 5, 6].concat(u16(0), u16(0), u16(cen.length), u16(cen.length), u32(cdLen), u32(cdStart), u16(0))));
    return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  function xe(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function docx(title, lines) {
    function para(t, b, sz) { return '<w:p><w:r><w:rPr>' + (b ? '<w:b/>' : '') + (sz ? '<w:sz w:val="' + sz + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + xe(t) + '</w:t></w:r></w:p>'; }
    var body = para(title, true, 32) + lines.map(function (l) { return para(l.t, l.b); }).join('');
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/document.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>' }
    ]);
  }
  /* rep = {n, title, lines:[{t,b}], total, filled, note} из index.html */
  window.UXCloud.sendReport = function (rep, statusEl) {
    function say(h) { if (statusEl) statusEl.innerHTML = h; }
    if (!ME) { authOpen('login', 'Войдите, чтобы сдать отчёт.'); return; }
    if (!rep.filled && !rep.note) { say('<span class="cl-err">Сначала заполните бланки или заметки к занятию.</span>'); return; }
    say('Отправка…');
    var title = 'Практическое занятие № ' + rep.n + '. ' + rep.title;
    var head = [{ t: 'Магистрант: ' + ME.fio + ' · группа: ' + ME.grp, b: false }, { t: 'Дисциплина «UX-менеджмент и цифровой опыт» · ' + new Date().toLocaleDateString('ru-RU'), b: false }];
    var blob = docx(title, head.concat(rep.lines));
    var path = ME.id + '/PR' + rep.n + '_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '.docx';
    SB.storage.from('works').upload(path, blob, { contentType: blob.type, upsert: false }).then(function (up) {
      if (up.error) throw up.error;
      var chars = rep.lines.reduce(function (s, l) { return s + l.t.length; }, 0);
      return SB.from('submissions').insert({ kind: 'report', ref: 'PR' + rep.n, title: rep.title, score: rep.total ? Math.round(100 * rep.filled / rep.total) : 100, file_path: path,
        data: { course: COURSE, typed: 0, paste: 0, chars: chars, variant: 1, method: '' } });
    }).then(function (r) {
      if (r.error) throw r.error;
      say('<span class="cl-okt">✓ Работа № ' + rep.n + ' сдана ' + new Date().toLocaleString('ru-RU') + '. Оценку и замечания смотрите в «Мои работы».</span>');
      P.set('pr-sent:' + rep.n, new Date().toISOString());
    }).catch(function (e) { say('<span class="cl-err">Не удалось отправить (' + esc(e.message || 'нет связи') + '). Проверьте интернет и нажмите ещё раз.</span>'); });
  };

  /* ---------- синхронизация записей между устройствами (таблица drafts, ключ ux-all) ---------- */
  var SKIP = { cq: 1, 'sync-ts': 1, theme: 1 };
  var syncT = null, syncReady = false;
  function snapshot() { var o = {}; P.keys().forEach(function (k) { if (!SKIP[k]) o[k] = P.get(k); }); return o; }
  function syncPush(now) {
    if (!SB || !ME || !syncReady) return Promise.resolve();
    clearTimeout(syncT);
    var go = function () {
      var ts = Date.now(); P.set('sync-ts', ts);
      return SB.from('drafts').upsert({ key: 'ux-all', data: { ts: ts, v: snapshot() }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' }).then(function () {}, function () {});
    };
    return now ? go() : new Promise(function (res) { syncT = setTimeout(function () { go().then(res); }, 4000); });
  }
  function syncPull() {
    SB.from('drafts').select('data').eq('key', 'ux-all').maybeSingle().then(function (r) {
      var remote = r && r.data && r.data.data, local = P.get('sync-ts', 0);
      if (remote && remote.ts > local) {
        var keep = { name: P.get('name'), group: P.get('group') };
        P.load(remote.v); P.load(keep); P.set('sync-ts', remote.ts);
        syncReady = true; location.reload(); return;
      }
      syncReady = true; if (Object.keys(snapshot()).length) syncPush(false);
    }, function () { syncReady = true; });
  }
  window.UXCloudSync = function (key) { if (SKIP[key]) return; if (ME && syncReady) syncPush(false); };

  /* ---------- запуск ---------- */
  acctRender();
  cloudLib().then(function (lib) {
    SB = lib.createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    SB.auth.onAuthStateChange(function (ev2) {
      if (ev2 === 'PASSWORD_RECOVERY') setTimeout(function () { authOpen('newpass'); }, 50);
      if (ev2 === 'SIGNED_OUT') { ME = null; acctRender(); }
    });
    return SB.auth.getSession().then(function (r) { if (r.data && r.data.session) return loadMe(r.data.session.user); acctRender(); });
  }).catch(function () { SB_FAIL = true; acctRender(); });
})();
