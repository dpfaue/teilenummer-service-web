/* Teilenummer.Service – Einwilligung für Google Ads Conversion-Tracking.
   Ohne "Erlauben" wird nichts von Google geladen. Auswahl wird im Browser gespeichert
   und kann jederzeit über den Link "Cookie-Einstellungen" geändert werden. */
(function () {
  var AW_ID = 'AW-18531544617';
  var KAUF = AW_ID + '/zzpPCMHSmqYdEKncw4RF';
  var KEY = 'tns_ads_consent';
  var loaded = false;

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  // Google-Klick-ID merken, falls der Besucher über eine Unterseite kommt
  try {
    var g = new URLSearchParams(location.search).get('gclid');
    if (g) sessionStorage.setItem('tns_gclid', g.slice(0, 200));
  } catch (e) {}

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  function loadAds() {
    if (loaded) return;
    loaded = true;
    gtag('consent', 'default', {
      ad_storage: 'granted', ad_user_data: 'granted',
      ad_personalization: 'denied', analytics_storage: 'denied'
    });
    gtag('js', new Date());
    var cfg = { allow_ad_personalization_signals: false };
    try {
      var saved = sessionStorage.getItem('tns_gclid');
      if (saved && !/[?&]gclid=/.test(location.search)) {
        cfg.page_location = location.origin + location.pathname + '?gclid=' + encodeURIComponent(saved);
      }
    } catch (e) {}
    gtag('config', AW_ID, cfg);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + AW_ID;
    document.head.appendChild(s);
  }

  // Wird nach erfolgreicher PayPal-Zahlung aufgerufen
  window.tnsConversion = function (value, orderId) {
    if (get() !== 'ja') return;
    loadAds();
    gtag('event', 'conversion', {
      send_to: KAUF,
      value: Number(value) || 0,
      currency: 'EUR',
      transaction_id: String(orderId || '')
    });
  };

  var css = '#tnsConsent{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;' +
    'background:#1b1f2b;color:#eef0f4;border:1px solid #2a2f3d;border-radius:14px;padding:16px 18px;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.45);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}' +
    '#tnsConsent p{margin:0 0 12px;color:#c7cbd6;}#tnsConsent strong{color:#eef0f4;}#tnsConsent a{color:#ff6a1a;}' +
    '#tnsConsent .b{display:flex;gap:10px;flex-wrap:wrap;}' +
    '#tnsConsent button{flex:1 1 140px;padding:11px 14px;border-radius:999px;font-weight:700;font-size:14px;cursor:pointer;' +
    'border:1px solid #ff6a1a;background:transparent;color:#eef0f4;}' +
    '#tnsConsent button:hover{background:rgba(255,106,26,.15);}';

  function showBanner() {
    if (document.getElementById('tnsConsent')) return;
    if (!document.getElementById('tnsConsentCss')) {
      var st = document.createElement('style');
      st.id = 'tnsConsentCss';
      st.textContent = css;
      document.head.appendChild(st);
    }
    var d = document.createElement('div');
    d.id = 'tnsConsent';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Cookie-Einstellungen');
    d.innerHTML = '<p><strong>Darf ich messen, ob meine Google-Werbung funktioniert?</strong><br>' +
      'Wenn du zustimmst, setzt Google ein Cookie, damit ich sehe, ob eine Anfrage über eine Anzeige kam (Google Ads Conversion-Tracking). ' +
      'Keine personalisierte Werbung. Ohne Zustimmung funktioniert alles genauso. ' +
      '<a href="datenschutz.html#google-ads">Mehr dazu</a></p>' +
      '<div class="b"><button type="button" data-v="nein">Ablehnen</button><button type="button" data-v="ja">Erlauben</button></div>';
    d.addEventListener('click', function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute('data-v');
      if (!v) return;
      var vorher = get();
      set(v);
      d.remove();
      if (v === 'ja') loadAds();
      else {
        // Widerruf/Ablehnung: Google-Cookies dieser Seite entfernen
        document.cookie.split(';').forEach(function (c) {
          var n = c.split('=')[0].trim();
          if (/^_gcl_|^_gac_/.test(n)) {
            document.cookie = n + '=; Max-Age=0; path=/';
            document.cookie = n + '=; Max-Age=0; path=/; domain=.' + location.hostname.replace(/^www\./, '');
          }
        });
        if (vorher === 'ja') location.reload(); // Google nicht weiter geladen lassen
      }
    });
    document.body.appendChild(d);
  }
  window.tnsConsentSettings = function (e) { if (e) e.preventDefault(); showBanner(); };

  function init() {
    var c = get();
    if (c === 'ja') loadAds();
    else if (c !== 'nein') showBanner();
    document.querySelectorAll('[data-consent-settings]').forEach(function (a) {
      a.addEventListener('click', window.tnsConsentSettings);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
