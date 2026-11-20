/* Zentrale – Antwort-Assistent für Heizungs-Anfragen (20.11.2026)
   Fenster mit Auswahl-Optionen statt Lückentext: Art der Antwort wählen, Ursachen / Prüfpunkte antippen,
   Vorschau sehen, übernehmen (oder direkt senden). Inhalte = dieselben Aussagen wie auf den Code-Seiten
   von heizung-stoerung.de (Prüfliste!) – nur Einschätzung + was geprüft werden sollte, KEINE Anleitung.
   Nutzt Globals aus app.js (rows, detailId, curParts, HEIZ, …). */
'use strict';
(function () {
  const T = {
    zuendung: { name: '🔥 Keine Flamme / Zündung',
      u: ['Gaszufuhr unterbrochen (Gashahn zu, Gasmangel oder Luft in der Leitung nach einem Zählerwechsel)',
        'Zünd- oder Überwachungselektrode verschmutzt bzw. verschlissen',
        'Kondensatablauf/Siphon verstopft (bei Brennwertgeräten)',
        'Abgas- oder Zuluftweg behindert',
        'Störung an Gasarmatur oder Elektronik (Feuerungsautomat)'],
      p: ['Ist der Gashahn am Gerät geöffnet?',
        'Funktionieren andere Gasgeräte im Haus (z. B. Gasherd)? Wenn nicht, liegt die Ursache eher bei der Gasversorgung – zuständig ist dann der Netzbetreiber bzw. Versorger.',
        'Wurde kürzlich der Gaszähler getauscht oder an der Gasleitung gearbeitet? Dann kann Luft in der Leitung sein – das gehört in die Hand eines Fachbetriebs.',
        'Ist die Stromversorgung in Ordnung (Sicherung, Notschalter vor dem Heizraum)?',
        'Kommt der Fehler nach einer Entstörung (wie in der Bedienungsanleitung vorgesehen) wieder?',
        'Zünd-/Überwachungselektrode und Kondensatablauf sollten vom Fachbetrieb geprüft werden.'] },
    flammeaus: { name: '💨 Flamme geht aus',
      u: ['Gaszufuhr kurzzeitig unterbrochen oder Gasdruck zu niedrig',
        'Überwachungselektrode verschmutzt bzw. verschlissen',
        'Abgas wird angesaugt (Abgasweg/Zuluft)',
        'Kondensatablauf verstopft',
        'Gasarmatur oder Elektronik'],
      p: ['Ist der Gashahn am Gerät geöffnet?',
        'Funktionieren andere Gasgeräte im Haus (z. B. Gasherd)?',
        'Kommt der Fehler nach einer Entstörung (wie in der Bedienungsanleitung vorgesehen) wieder?',
        'Abgasweg und Zuluft sollten vom Fachbetrieb geprüft werden.',
        'Überwachungselektrode und Gasdruck sollten vom Fachbetrieb geprüft werden.'] },
    druck: { name: '💧 Wassermangel / Druck',
      u: ['Druckverlust durch Entlüften von Heizkörpern',
        'kleines Leck an Heizkörper, Ventil oder Verschraubung',
        'Ausdehnungsgefäß hat zu wenig Vordruck oder ist defekt',
        'Sicherheitsventil tropft',
        'automatischer Entlüfter undicht'],
      p: ['Wie hoch ist der Anlagendruck am Manometer?',
        'Liegt er unter dem Bereich laut Bedienungsanleitung (bei vielen Einfamilienhäusern grob 1,0–2,0 bar – maßgeblich ist die Anleitung)?',
        'Bleibt der Druck über mehrere Tage stabil oder fällt er immer wieder ab?',
        'Gibt es feuchte Stellen, Kalkspuren oder Rost an Heizkörpern, Ventilen und Verschraubungen?',
        'Ist der Ablauf am Sicherheitsventil feucht?',
        'Der Vordruck des Ausdehnungsgefäßes sollte vom Fachbetrieb gemessen werden.'] },
    pumpe: { name: '🔄 Pumpe / Luft',
      u: ['zu wenig Wasser bzw. Druck in der Anlage',
        'Luft im Gerät oder in der Anlage',
        'Pumpe festsitzend oder defekt',
        'Drucksensor defekt'],
      p: ['Liegt der Anlagendruck im Bereich laut Bedienungsanleitung?',
        'Ist Luft in der Anlage (Heizkörper gluckern oder werden oben nicht warm)?',
        'Kommt der Fehler nach einer Entstörung (wie in der Bedienungsanleitung vorgesehen) wieder?',
        'Pumpe und Drucksensor sollten vom Fachbetrieb geprüft werden.'] },
    allgemein: { name: '❔ Allgemein / kein Code',
      u: ['Stromversorgung unterbrochen (Sicherung, Notschalter)',
        'Gaszufuhr unterbrochen',
        'Anlagendruck zu niedrig',
        'Einstellung (Sommerbetrieb, Zeitprogramm, Raumthermostat)',
        'Thermostatventil fest oder Luft im Heizkörper'],
      p: ['Sind Sicherung, Notschalter vor dem Heizraum und Netzschalter am Gerät eingeschaltet?',
        'Ist der Gashahn geöffnet? Funktionieren andere Gasgeräte?',
        'Liegt der Anlagendruck im Bereich laut Bedienungsanleitung?',
        'Stimmen Sommer-/Winterbetrieb, Zeitprogramm und Raumthermostat? Sind die Batterien im Funkthermostat in Ordnung?',
        'Ist das Thermostatventil gängig? Ist Luft im Heizkörper (gluckert, oben kalt)?'] }
  };
  /* Bekannte Codes (wie auf den Code-Seiten) → Bedeutung + Thema */
  const CODES = {
    vaillant: { F28: ['Die Therme hat beim Startversuch keine Flamme erkannt und sich aus Sicherheitsgründen verriegelt.', 'zuendung'],
      F29: ['Die Therme hat gezündet, die Flamme ist aber während des Betriebs ausgegangen und ließ sich nicht wieder zünden.', 'flammeaus'],
      F22: ['Wassermangel – der Anlagendruck ist zu niedrig, die Therme schützt sich vor Überhitzung und schaltet ab.', 'druck'],
      F75: ['Beim Start der Pumpe wurde kein Drucksprung erkannt, deshalb schaltet die Therme ab.', 'pumpe'] },
    buderus: { '6A': ['Beim Brennerstart wurde keine Flamme erkannt.', 'zuendung'] },
    junkers: { EA: ['Beim Start wurde keine Flamme erkannt.', 'zuendung'] },
    bosch: { EA: ['Beim Start wurde keine Flamme erkannt.', 'zuendung'] },
    viessmann: { F4: ['Beim Brennerstart wurde kein Flammensignal erkannt.', 'zuendung'] }
  };
  const FRAGEN = ['ein Foto vom Display mit dem Fehlercode', 'ein Foto vom Typenschild des Geräts',
    'den Anlagendruck (Anzeige am Gerät, in bar)', 'seit wann der Fehler auftritt und ob er nach dem Entstören wiederkommt',
    'ob andere Gasgeräte im Haus funktionieren', 'ob kürzlich am Gaszähler oder an der Gasleitung gearbeitet wurde',
    'ein kurzes Video vom Startvorgang (10–15 Sekunden)', 'wie alt das Gerät ungefähr ist und wann die letzte Wartung war'];
  const FACH = ['Die wahrscheinliche Ursache liegt an Bauteilen im Gasweg oder an der Abgasführung.',
    'Die Ursache liegt vermutlich an der Elektronik (Platine/Feuerungsautomat).',
    'Der Fehler kommt nach dem Entstören immer wieder – das muss vor Ort gemessen werden.',
    'Es tritt Wasser aus bzw. der Druck fällt ständig ab.'];
  const ERST = ['Gerät oder Fehlercode sind auf den Fotos nicht eindeutig erkennbar.',
    'Die Ursache lässt sich nur mit Messungen vor Ort eingrenzen.',
    'Zu diesem Gerät liegen mir keine verlässlichen Herstellerangaben vor.'];
  const ARTEN = { ein: '🔥 Einschätzung', teil: '🔩 Ersatzteil', frage: '❓ Rückfrage', fach: '🧰 Fachbetrieb nötig', erst: '💸 Erstattung' };

  const codeNorm = c => String(c || '').toUpperCase().replace(/[\s.\-]/g, '');
  function codeInfo(r) {
    const m = String(r.modell || '').toLowerCase(), c = codeNorm(r.fin);
    for (const b of Object.keys(CODES)) if (m.includes(b) && CODES[b][c]) return CODES[b][c];
    return null;
  }
  const defState = r => {
    const ci = codeInfo(r);
    return { art: anliegen(r) === 'Ersatzteil bestimmen' ? 'teil' : 'ein', thema: ci ? ci[1] : 'allgemein', bed: ci ? ci[0] : '',
      u: [], p: [], eigenU: '', eigenP: '', notiz: '', fachblock: true, fragen: [], eigenFrage: '', fach: [], vermutung: '', erst: [], eigenErst: '' };
  };
  let S = null, R = null;
  const save = () => { if (R) setDraft(R.orderId, { wiz: JSON.stringify(S) }); };
  const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

  function buildText() {
    const r = R, ger = r.modell || 'Gerät', code = r.fin || '';
    const out = [];
    if (S.art === 'ein') {
      if (S.bed.trim()) out.push((code ? `Der Fehlercode ${code} bedeutet bei deinem ${ger}: ` : `Zu deiner Störung am ${ger}: `) + S.bed.trim());
      const u = S.u.concat(lines(S.eigenU)), p = S.p.concat(lines(S.eigenP));
      if (u.length) out.push('Wahrscheinliche Ursachen (die wahrscheinlichste zuerst):\n' + u.map((x, i) => (i + 1) + ') ' + x).join('\n'));
      if (p.length) out.push('Was geprüft werden sollte:\n' + p.map(x => '• ' + x).join('\n'));
      if (S.notiz.trim()) out.push(S.notiz.trim());
      if (S.fachblock) out.push('Für deinen Fachbetrieb – damit er gleich weiß, wo er ansetzen muss:\n• Gerät: ' + ger + (code ? '\n• Fehlercode: ' + code : '') + (r.motor ? '\n• Anlagendruck: ' + r.motor : '') + (u[0] ? '\n• Vermutete Ursache: ' + u[0] : ''));
      out.push(HINWEIS_HZ);
    } else if (S.art === 'teil') {
      const t = partsForMail(curParts);
      out.push('Für deinen ' + ger + ' passt nach deinen Angaben und dem Typenschild folgendes Ersatzteil:\n\n' + (t || '• (Teil unten eintragen)'));
      if (S.notiz.trim()) out.push(S.notiz.trim());
      out.push('Bitte die Nummer vor dem Kauf noch einmal mit dem Typenschild bzw. der Ersatzteilliste des Herstellers abgleichen. Der Einbau sollte durch einen Fachbetrieb erfolgen.');
      out.push(HINWEIS_HZ);
    } else if (S.art === 'frage') {
      const f = S.fragen.concat(lines(S.eigenFrage));
      out.push('Damit ich die Ursache sicher eingrenzen kann, brauche ich noch kurz:\n' + (f.length ? f.map(x => '• ' + x).join('\n') : '• '));
      out.push('Antworte einfach auf diese E-Mail – sobald ich die Infos habe, melde ich mich mit meiner Einschätzung.');
    } else if (S.art === 'fach') {
      out.push((code ? `Zum Fehlercode ${code} an deinem ${ger}: ` : `Zu deiner Störung am ${ger}: `) + 'Hier ist ein eingetragener Fachbetrieb nötig. Bitte selbst nichts am Gerät öffnen.');
      if (S.fach.length) out.push(S.fach.join(' '));
      if (S.notiz.trim()) out.push(S.notiz.trim());
      out.push('Was du dem Fachbetrieb sagen kannst, damit es schnell geht:\n• Gerät: ' + ger + (code ? '\n• Fehlercode: ' + code : '') + (r.motor ? '\n• Anlagendruck: ' + r.motor : '') + (S.vermutung.trim() ? '\n• Vermutete Ursache: ' + S.vermutung.trim() : ''));
      out.push('So vermeidest du unnötige Suchzeit auf der Rechnung.');
    } else if (S.art === 'erst') {
      const g = S.erst.concat(lines(S.eigenErst));
      out.push('Leider kann ich die Ursache an deinem ' + ger + ' aus der Ferne nicht sicher einschätzen.' + (g.length ? ' Grund: ' + g.join(' ') : ''));
      out.push('Deshalb bekommst du den vollen Betrag über PayPal erstattet – das Geld ist in den nächsten Tagen wieder auf deinem Konto.');
    }
    return out.join('\n\n');
  }

  const chip = (txt, on, attr) => `<button type="button" class="ha-chip${on ? ' on' : ''}" ${attr}>${on && attr.startsWith('data-u=') ? '<i>' + (S.u.indexOf(txt) + 1) + '</i>' : on ? '✓ ' : ''}${esc(txt)}</button>`;
  function body() {
    const r = R;
    let h = `<div class="ha-arten">${Object.entries(ARTEN).map(([k, v]) => `<button type="button" class="ha-art${S.art === k ? ' on' : ''}" data-art="${k}">${v}</button>`).join('')}</div>`;
    if (S.art === 'ein') {
      h += `<label class="ha-l">Was bedeutet ${r.fin ? 'der Code <b>' + esc(r.fin) + '</b>' : 'die Störung'}?${codeInfo(r) ? ' <span class="ha-ok">aus Code-Liste vorbelegt</span>' : ''}</label>
        <textarea class="ha-in" data-k="bed" rows="2" placeholder="z. B. Beim Start wurde keine Flamme erkannt.">${esc(S.bed)}</textarea>
        <label class="ha-l">Thema <span class="dim">(blendet passende Ursachen + Prüfpunkte ein)</span></label>
        <div class="ha-chips">${Object.entries(T).map(([k, v]) => `<button type="button" class="ha-chip small${S.thema === k ? ' on' : ''}" data-thema="${k}">${v.name}</button>`).join('')}</div>
        <label class="ha-l">Wahrscheinliche Ursachen <span class="dim">(Reihenfolge = Antippen)</span></label>
        <div class="ha-chips">${T[S.thema].u.concat(S.u.filter(x => !T[S.thema].u.includes(x))).map(x => chip(x, S.u.includes(x), 'data-u="' + esc(x) + '"')).join('')}</div>
        <textarea class="ha-in" data-k="eigenU" rows="1" placeholder="+ eigene Ursache (eine pro Zeile)">${esc(S.eigenU)}</textarea>
        <label class="ha-l">Was geprüft werden sollte</label>
        <div class="ha-chips">${T[S.thema].p.concat(S.p.filter(x => !T[S.thema].p.includes(x))).map(x => chip(x, S.p.includes(x), 'data-p="' + esc(x) + '"')).join('')}</div>
        <textarea class="ha-in" data-k="eigenP" rows="1" placeholder="+ eigener Prüfpunkt (eine pro Zeile)">${esc(S.eigenP)}</textarea>
        <label class="ha-l">Persönliche Anmerkung <span class="dim">(optional)</span></label>
        <textarea class="ha-in" data-k="notiz" rows="2" placeholder="z. B. Auf deinem Foto sieht man …">${esc(S.notiz)}</textarea>
        <label class="check"><input type="checkbox" data-k="fachblock" ${S.fachblock ? 'checked' : ''}> Angaben „Für deinen Fachbetrieb“ anhängen</label>`;
    } else if (S.art === 'teil') {
      h += `<label class="ha-l">Ersatzteil(e) <span class="dim">(erscheinen auch auf der Rechnung)</span></label>
        <div class="ha-parts">${curParts.map((p, i) => `<div class="ha-prow"><input data-pi="${i}" data-pf="b" list="dlTeile" placeholder="Bezeichnung, z. B. Zündelektrode" value="${esc(p.b)}"><input data-pi="${i}" data-pf="n" class="mono" placeholder="Teilenummer" value="${esc(p.n)}"><input data-pi="${i}" data-pf="h" placeholder="Hinweis (optional)" value="${esc(p.h)}"><button type="button" data-pdel="${i}" title="Löschen">✕</button></div>`).join('')}</div>
        <button type="button" class="btn ghost small" data-padd="1">+ weiteres Teil</button>
        <label class="ha-l">Anmerkung <span class="dim">(optional, z. B. warum genau dieses Teil)</span></label>
        <textarea class="ha-in" data-k="notiz" rows="2">${esc(S.notiz)}</textarea>`;
    } else if (S.art === 'frage') {
      h += `<label class="ha-l">Was brauchst du noch vom Kunden?</label>
        <div class="ha-chips">${FRAGEN.map(x => chip(x, S.fragen.includes(x), 'data-f="' + esc(x) + '"')).join('')}</div>
        <textarea class="ha-in" data-k="eigenFrage" rows="1" placeholder="+ eigene Frage (eine pro Zeile)">${esc(S.eigenFrage)}</textarea>
        <p class="dim small">Rückfrage geht ohne Rechnung raus.</p>`;
    } else if (S.art === 'fach') {
      h += `<label class="ha-l">Warum Fachbetrieb?</label>
        <div class="ha-chips">${FACH.map(x => chip(x, S.fach.includes(x), 'data-fa="' + esc(x) + '"')).join('')}</div>
        <label class="ha-l">Vermutete Ursache <span class="dim">(für den Fachbetrieb)</span></label>
        <textarea class="ha-in" data-k="vermutung" rows="1" placeholder="z. B. Überwachungselektrode">${esc(S.vermutung)}</textarea>
        <label class="ha-l">Anmerkung <span class="dim">(optional)</span></label>
        <textarea class="ha-in" data-k="notiz" rows="2">${esc(S.notiz)}</textarea>`;
    } else if (S.art === 'erst') {
      h += `<label class="ha-l">Grund</label>
        <div class="ha-chips">${ERST.map(x => chip(x, S.erst.includes(x), 'data-e="' + esc(x) + '"')).join('')}</div>
        <textarea class="ha-in" data-k="eigenErst" rows="1" placeholder="+ eigener Grund">${esc(S.eigenErst)}</textarea>
        <p class="dim small">Geht ohne Rechnung raus. Die Erstattung selbst löst du danach in PayPal aus.</p>`;
    }
    return h;
  }
  function preview() { const p = document.getElementById('haPrev'); if (p) p.textContent = mailPreview(R, buildText()); }
  function draw(keepScroll) {
    const b = document.getElementById('haBody'); if (!b) return;
    const y = b.scrollTop; b.innerHTML = body(); if (keepScroll) b.scrollTop = y; preview();
  }
  function toggle(arr, v) { const i = arr.indexOf(v); i < 0 ? arr.push(v) : arr.splice(i, 1); }

  function open() {
    R = rows.find(x => String(x.orderId) === String(detailId)); if (!R || !HEIZ(R)) return;
    if (curPartsId !== R.orderId) loadParts(R);
    let st = null; try { st = JSON.parse(getDraft(R.orderId).wiz || 'null'); } catch (e) {}
    S = Object.assign(defState(R), st || {});
    const ov = document.createElement('div'); ov.id = 'haOverlay'; ov.className = 'ha-ov';
    ov.innerHTML = `<div class="ha-sheet" role="dialog" aria-label="Antwort zusammenstellen">
      <div class="ha-head"><b>✍️ Antwort zusammenstellen</b><span class="dim small">${esc(R.name || '')} · ${esc(R.modell || '')}${R.fin ? ' · ' + esc(R.fin) : ''}</span><button type="button" class="ha-x" data-close="1" aria-label="Schließen">✕</button></div>
      <div class="ha-body" id="haBody"></div>
      <details class="ha-prevbox" ${window.innerWidth >= 800 ? 'open' : ''}><summary>👁 Vorschau – so bekommt es der Kunde</summary><div class="ha-prev" id="haPrev"></div></details>
      <div class="ha-foot"><button type="button" class="btn ghost small ha-reset" data-reset="1" title="Auswahl zurücksetzen">↺</button><button type="button" class="btn ghost small" data-take="1">Übernehmen</button><button type="button" class="btn small" data-take="send">✉️ Übernehmen &amp; senden</button></div>
    </div>`;
    document.body.appendChild(ov); document.body.classList.add('ha-lock');
    draw();
    ov.addEventListener('click', onClick); ov.addEventListener('input', onInput); ov.addEventListener('change', onInput);
  }
  function close() { const ov = document.getElementById('haOverlay'); if (ov) ov.remove(); document.body.classList.remove('ha-lock'); }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.k) { S[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value; save(); preview(); return; }
    if (t.dataset.pi != null) { curParts[+t.dataset.pi][t.dataset.pf] = t.value; savePartsDraft(R); preview(); }
  }
  function onClick(e) {
    const t = e.target.closest('button') || e.target; const d = t.dataset || {};
    if (t.id === 'haOverlay' || d.close) return close();
    if (d.art) { S.art = d.art; save(); return draw(); }
    if (d.thema) { S.thema = d.thema; save(); return draw(true); }
    if (d.u != null) { toggle(S.u, d.u); save(); return draw(true); }
    if (d.p != null) { toggle(S.p, d.p); save(); return draw(true); }
    if (d.f != null) { toggle(S.fragen, d.f); save(); return draw(true); }
    if (d.fa != null) { toggle(S.fach, d.fa); save(); return draw(true); }
    if (d.e != null) { toggle(S.erst, d.e); save(); return draw(true); }
    if (d.padd) { curParts.push({ b: '', n: '', h: '' }); savePartsDraft(R); return draw(true); }
    if (d.pdel != null) { curParts.splice(+d.pdel, 1); if (!curParts.length) curParts = [{ b: '', n: '', h: '' }]; savePartsDraft(R); return draw(true); }
    if (d.reset) { if (!confirm('Auswahl zurücksetzen?')) return; S = defState(R); save(); return draw(); }
    if (d.take) {
      const text = buildText(), ta = document.getElementById('replyText');
      if (!ta) return close();
      if (ta.value.trim() && ta.value.trim() !== text && !confirm('Im Antwortfeld steht schon Text. Ersetzen?')) return;
      ta.value = text; ta.dispatchEvent(new Event('input'));
      const noBill = S.art === 'frage' || S.art === 'erst', cb = document.getElementById('attachPdf');
      if (cb) { cb.checked = !noBill; setDraft(R.orderId, { attach: noBill ? '0' : '1' }); }
      const r = R; close(); renderParts(r);
      if (d.take === 'send') { const b = document.getElementById('sendReply'); if (b) b.click(); }
      else { toast('Antwort übernommen – du kannst sie noch ändern', 'good'); ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#hzAssistBtn')) open(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('haOverlay')) close(); });
})();
