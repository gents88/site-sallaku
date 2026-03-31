;(function () {
  const STORAGE_KEY = 'cookie_consent_v1';
  const BACKEND_ENDPOINT = '/api/v1/consent'; // matches backend global prefix
  const AUTH_TOKEN_KEY = 'portfolio_token';
  const USER_KEY = 'portfolio_user';
  const GTM_ID = window.__GTM_ID__ || null; // set in index.html as window.__GTM_ID__ = 'GTM-XXXX'

  const EU_COUNTRIES = new Set([
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'
  ]);

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e){return null}
  }

  function writeLocal(obj) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch(e){} }

  function updateGtagConsent(consent) {
    const granted = (consent.analytics || consent.marketing) ? 'granted' : 'denied';
    const adGranted = consent.marketing ? 'granted' : 'denied';
    const analyticsGranted = consent.analytics ? 'granted' : 'denied';

    if (window.gtag) {
      try {
        window.gtag('consent', 'update', {
          ad_storage: adGranted,
          analytics_storage: analyticsGranted,
          ad_user_data: adGranted,
          ad_personalization: adGranted,
        });
      } catch (e) {
        console.warn('gtag consent update failed', e);
      }
    }
  }

  function postConsent(consent) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}
      // Attach userId if available from localStorage
      try {
        const raw = localStorage.getItem(USER_KEY);
        if (raw) {
          const u = JSON.parse(raw);
          if (u && u._id) consent.userId = u._id;
        }
      } catch (e) {}

      fetch(BACKEND_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(consent),
      }).catch(()=>{});
    } catch (e) {}
  }

  function loadGTM() {
    if (!GTM_ID) return;
    if (document.getElementById('gtm-script')) return;
    const script = document.createElement('script');
    script.id = 'gtm-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
    document.head.appendChild(script);
  }

  function createBanner(i18n) {
    const existing = document.getElementById('cookie-banner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'cookie-banner';
    banner.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#0b1220;color:#fff;padding:18px;display:flex;gap:12px;align-items:center;z-index:99999;flex-wrap:wrap;';

    const text = document.createElement('div');
    text.style.flex = '1 1 400px';
    text.innerText = i18n.desc || 'We use cookies.';

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.gap = '8px';

    const accept = document.createElement('button');
    accept.innerText = i18n.accept_all || 'Accept all';
    accept.style.padding = '8px 12px';
    accept.onclick = () => saveAndApply({ analytics: true, marketing: true, preferences: true });

    const reject = document.createElement('button');
    reject.innerText = i18n.reject_all || 'Reject all';
    reject.style.padding = '8px 12px';
    reject.onclick = () => saveAndApply({ analytics: false, marketing: false, preferences: false });

    const manage = document.createElement('button');
    manage.innerText = i18n.manage_preferences || 'Manage preferences';
    manage.style.padding = '8px 12px';
    manage.onclick = () => openPreferencesModal(i18n);

    btns.appendChild(manage);
    btns.appendChild(reject);
    btns.appendChild(accept);

    banner.appendChild(text);
    banner.appendChild(btns);
    document.body.appendChild(banner);
  }

  function openPreferencesModal(i18n) {
    if (document.getElementById('cookie-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'cookie-modal';
    modal.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#111;padding:20px;border-radius:8px;max-width:640px;width:100%';

    const title = document.createElement('h3');
    title.innerText = i18n.settings_title || 'Cookie settings';
    box.appendChild(title);

    const desc = document.createElement('p');
    desc.innerText = i18n.settings_desc || 'Enable or disable categories.';
    box.appendChild(desc);

    const form = document.createElement('div');
    ['necessary','analytics','marketing','preferences'].forEach((cat)=>{
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee';
      const label = document.createElement('div');
      label.innerText = i18n[cat] || cat;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = (cat==='necessary') ? true : false;
      if(cat==='necessary') input.disabled = true;
      input.id = `cookie-${cat}`;
      row.appendChild(label);
      row.appendChild(input);
      form.appendChild(row);
    });
    box.appendChild(form);

    const saveBtn = document.createElement('button');
    saveBtn.innerText = i18n.save || 'Save preferences';
    saveBtn.style.marginTop = '12px';
    saveBtn.onclick = () => {
      const consent = {
        analytics: !!document.getElementById('cookie-analytics').checked,
        marketing: !!document.getElementById('cookie-marketing').checked,
        preferences: !!document.getElementById('cookie-preferences').checked,
      };
      saveAndApply(consent);
      document.body.removeChild(modal);
      const banner = document.getElementById('cookie-banner'); if (banner) banner.remove();
    };
    box.appendChild(saveBtn);

    const close = document.createElement('button');
    close.innerText = 'Close';
    close.style.marginLeft = '8px';
    close.onclick = () => { document.body.removeChild(modal); };
    box.appendChild(close);

    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  function saveAndApply(consentPartial) {
    const country = window.__USER_COUNTRY__ || null;
    const payload = Object.assign({ userId: null, country }, consentPartial);
    writeLocal(payload);
    updateGtagConsent(payload);
    postConsent(payload);
    // If analytics or marketing allowed, load GTM
    if (payload.analytics || payload.marketing) loadGTM();
    const banner = document.getElementById('cookie-banner'); if (banner) banner.remove();
  }

  async function detectCountry() {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) throw new Error('ipapi failed');
      const j = await res.json();
      return (j && j.country) ? j.country : null;
    } catch (e) {
      try {
        const lang = (navigator.language || '').split('-')[1];
        return lang ? lang.toUpperCase() : null;
      } catch (_) { return null; }
    }
  }

  (async function init(){
    const i18nLang = (document.documentElement.lang || 'it').substr(0,2);
    // try to load simple i18n from window.__I18N__ if app provides translations; fallback to data-* or defaults
    const defaultTexts = window.__CONSENT_I18N__ || {
      desc: 'We use cookies for necessary site functionality and optional analytics and marketing. Manage your preferences.',
      accept_all: 'Accept all', reject_all: 'Reject all', manage_preferences: 'Manage preferences',
      necessary: 'Necessary', analytics: 'Analytics', marketing: 'Marketing', preferences: 'Preferences', save: 'Save preferences', settings_title: 'Cookie settings', settings_desc: 'Enable or disable categories. Necessary cookies are always active.'
    };

    let stored = readLocal();
    if (stored) {
      // apply immediately
      updateGtagConsent(stored);
      if (stored.analytics || stored.marketing) loadGTM();
      return;
    }

    const country = await detectCountry();
    window.__USER_COUNTRY__ = country;
    const isEU = country ? EU_COUNTRIES.has(country.toUpperCase()) : false;

    // If EU, strict: show banner and block analytics until consent.
    // If non-EU, show banner but default can be more permissive — here we still require consent for analytics/marketing
    createBanner(defaultTexts);
  })();
})();
