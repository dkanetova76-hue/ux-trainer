/* Локальное хранилище прогресса учебника (браузер студента).
   Хук для общего кабинета: если на странице определён window.UX_CLOUD с методами
   save(key, value) и load(), прогресс дополнительно отправляется туда. */
(function () {
  var NS = 'ux-trainer:';
  function safeGet(k) { try { return localStorage.getItem(NS + k); } catch (e) { return mem[k] || null; } }
  function safeSet(k, v) { try { localStorage.setItem(NS + k, v); } catch (e) { mem[k] = v; } }
  function safeDel(k) { try { localStorage.removeItem(NS + k); } catch (e) { delete mem[k]; } }
  var mem = {};
  var UXP = {
    get: function (k, d) {
      var v = safeGet(k);
      if (v === null || v === undefined) return d;
      try { return JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      safeSet(k, JSON.stringify(v));
      try { if (window.UX_CLOUD && UX_CLOUD.save) UX_CLOUD.save(k, v); } catch (e) {}
    },
    del: function (k) { safeDel(k); },
    keys: function () {
      var r = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(NS) === 0) r.push(k.slice(NS.length));
        }
      } catch (e) { r = Object.keys(mem); }
      return r;
    },
    dump: function () {
      var o = {};
      UXP.keys().forEach(function (k) { o[k] = UXP.get(k); });
      return o;
    },
    load: function (o) {
      Object.keys(o || {}).forEach(function (k) { safeSet(k, JSON.stringify(o[k])); });
    }
  };
  window.UXP = UXP;
})();
