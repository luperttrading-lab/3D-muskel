// App-Logik von MuscleAtlas 3D: Zustand, Oberfläche, Neuberechnung des Körpers.
import * as M from './modell.js';
import { Buehne } from './render.js';
import { koerperBauen, vernetzen } from './koerper.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (x, n = 1) => x.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });
const proz = (x, n = 1) => (x < -1e-9 ? '−' : '+') + fmt(Math.abs(x) * 100, n) + ' %';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const app = $('#app');
const breit = window.matchMedia('(min-width: 960px)');
const SEITE_NAME = { L: 'links', R: 'rechts', B: 'beidseitig' };

// ---------- Zustand ----------
const SPEICHER = 'muskelatlas.zustand.v1';
const frisch = () => ({
  profil: 'm',
  z: { m: M.neuerZustand('m'), w: M.neuerZustand('w') },
  entwurf: { m: { name: '', eintraege: [] }, w: { name: '', eintraege: [] } },
  ansicht: { modus: 0, vergleich: 0, tab: 'koerper', verlaufMuskel: 'bizeps' },
});
function laden() {
  try {
    const t = localStorage.getItem(SPEICHER);
    if (t) {
      const d = JSON.parse(t);
      if (d?.z?.m && d?.z?.w) {
        const f = frisch();
        const r = { ...f, ...d, entwurf: { ...f.entwurf, ...d.entwurf }, ansicht: { ...f.ansicht, ...d.ansicht } };
        for (const g of ['m', 'w']) ergaenzen(r.z[g]);
        return r;
      }
    }
  } catch (_) {}
  return frisch();
}
// Ältere Spielstände um später hinzugekommene Muskeln ergänzen
function ergaenzen(zz) {
  for (const m of M.MUSKELN) zz.muskeln[m.id] ??= { L: { a: 0, peak: 0, ewma: 0, pump: 0 }, R: { a: 0, peak: 0, ewma: 0, pump: 0 } };
}
let daten = laden();
let speicherTimer = null;
function speichern() { clearTimeout(speicherTimer); try { localStorage.setItem(SPEICHER, JSON.stringify(daten)); } catch (_) {} }
function spaeterSpeichern() { clearTimeout(speicherTimer); speicherTimer = setTimeout(speichern, 400); }
window.muskelatlas = { speichern };
const z = () => daten.z[daten.profil];
const entwurf = () => daten.entwurf[daten.profil];

// ---------- 3D ----------
const GROESSE = { m: 1, w: 1.66 / 1.79 };
const AKZENT = { m: [0.18, 0.55, 1.0], w: [1.0, 0.25, 0.64] };
const HAUT = { m: [0.78, 0.58, 0.47], w: [0.82, 0.62, 0.53] };
const H_NETZ = 0.008;
let buehne = null;
try { buehne = new Buehne($('#leinwand'), hit => waehle(hit && hit.mid > 0 ? M.EINHEITEN[hit.mid - 1] : null)); }
catch (e) {
  $('#lade').hidden = false;
  $('#lade').textContent = '3D-Darstellung nicht verfügbar: ' + e.message;
}

let worker = null;
const offen = new Map();
let auftragNr = 0;
const lokal = param => vernetzen(koerperBauen(param), { h: H_NETZ });
try {
  worker = new Worker(new URL('./netz-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => {
    const o = offen.get(e.data.auftrag);
    if (!o) return;
    offen.delete(e.data.auftrag);
    if (e.data.fehler) o.fehl(new Error(e.data.fehler)); else o.ok(e.data.netz);
  };
  worker.onerror = () => {
    // Modul-Worker nicht unterstützt: im Hauptthread weiterrechnen
    worker = null;
    for (const [id, o] of offen) { offen.delete(id); try { o.ok(lokal(o.param)); } catch (err) { o.fehl(err); } }
  };
} catch (_) { worker = null; }
function netz(param) {
  return new Promise((ok, fehl) => {
    if (worker) { const id = ++auftragNr; offen.set(id, { ok, fehl, param }); worker.postMessage({ auftrag: id, param, h: H_NETZ }); }
    else setTimeout(() => { try { ok(lokal(param)); } catch (e) { fehl(e); } }, 0);
  });
}
function koerperParam(zz, start = false) {
  const faktoren = {};
  if (!start) for (const m of M.MUSKELN) for (const s of M.SEITEN) faktoren[m.id + ':' + s] = M.volumenFaktor(zz.muskeln[m.id][s]);
  return { geschlecht: zz.geschlecht, faktoren, ff: start ? 1 : M.fettFaktor(zz) };
}
const startNetze = {};
let rechnet = null, nochmal = false, ladeTimer = null;
function koerperNeu() {
  if (!buehne) return Promise.resolve();
  if (rechnet) { nochmal = true; return rechnet; }
  clearTimeout(ladeTimer);
  ladeTimer = setTimeout(() => { $('#lade').hidden = false; }, 250);
  rechnet = (async () => {
    const profil = daten.profil;
    try {
      const n = await netz(koerperParam(z()));
      if (profil !== daten.profil) return;
      const v = daten.ansicht.vergleich;
      buehne.setzeNetz('jetzt', n, [v ? 0.42 * GROESSE[profil] : 0, 0, 0]);
      if (v) {
        startNetze[profil] ??= await netz(koerperParam(z(), true));
        if (profil === daten.profil) buehne.setzeNetz('start', startNetze[profil], [-0.42 * GROESSE[profil], 0, 0]);
      } else buehne.setzeNetz('start', null);
    } catch (e) {
      $('#lade').textContent = 'Fehler bei der Berechnung: ' + e.message;
      $('#lade').hidden = false;
      return;
    } finally {
      clearTimeout(ladeTimer);
      rechnet = null;
    }
    $('#lade').hidden = true;
    if (nochmal) { nochmal = false; await koerperNeu(); }
  })();
  return rechnet;
}
function muskelFarben() {
  if (!buehne) return;
  const d = new Float32Array(67 * 4);
  M.EINHEITEN.forEach((e, i) => { d[(i + 1) * 4] = 1 - Math.exp(-z().muskeln[e.id][e.seite].a / 0.12); });
  buehne.setzeMuskeln(d);
}
function kamera(drehen = true) {
  if (!buehne) return;
  // Abstand so wählen, dass Breite (mit Armen) und Höhe ins Bild passen – auch auf schmalen Telefonen.
  // Die Füße sitzen bei 15 % der Bildhöhe, damit die Bedienleiste unten sie nicht verdeckt.
  const c = $('#leinwand'), asp = (c.clientWidth || 400) / (c.clientHeight || 700), t = Math.tan(14 * Math.PI / 180);
  const h = GROESSE[daten.profil], breite = (daten.ansicht.vergleich ? 1.8 : 0.95) * h;
  const sicht = Math.max(2.34 * h, breite / asp);          // sichtbare Höhe in Metern
  buehne.ansicht(sicht / (2 * t), sicht * 0.35);
  if (drehen) { buehne.kam.yaw = daten.ansicht.vergleich ? 0 : 0.35; buehne.kam.pitch = 0.06; }
  buehne.standard = { ...buehne.kam, ziel: [...buehne.kam.ziel] };
}

// ---------- Kennzahlen, Legende, Muskelblatt ----------
function kennzahlen(extra = '') {
  const zz = z(), k = M.koerperwerte(zz);
  $('#kennzahlen').innerHTML = `
    <span class="tag">Tag ${zz.tag} · Woche ${Math.floor(zz.tag / 7) + 1}</span>
    <div>Gewicht <b class="zahl">${fmt(k.gewicht)} kg</b></div>
    <div>Körperfett <b class="zahl">${fmt(k.kfa * 100)} %</b></div>
    <div>Muskel seit Start <b class="zahl">${k.muskelZuwachsKg >= 0 ? '+' : '−'}${fmt(Math.abs(k.muskelZuwachsKg), 2)} kg</b></div>
    <div>Modus <b>${M.MODI[zz.modus].name}</b></div>${extra}`;
}
function legende() {
  const l = $('#legende'), m = daten.ansicht.modus;
  l.hidden = m === 0;
  const pos = a => (100 * (1 - Math.exp(-a / 0.12))).toFixed(1) + '%';
  if (m === 1) l.innerHTML = `Volumen ggü. Start<div class="balken"></div>
    <span style="position:relative;height:14px;display:block">${[[0, '0'], [0.1, '+10'], [0.3, '+30 %']].map(([a, t]) =>
      `<em style="position:absolute;left:${pos(a)};transform:translateX(-${a === 0 ? 0 : a === 0.3 ? 80 : 50}%);font-style:normal;white-space:nowrap">${t}</em>`).join('')}</span>`;
  if (m === 2) l.innerHTML = `Rot: Muskel, heller = weiter entwickelt<div class="balken anat"></div>Beige: Fett, Sehnen, Knochen`;
}
let gewaehlt = null;
function waehle(e) {
  gewaehlt = e ? { id: e.id, seite: e.seite } : null;
  blatt();
}
function status(u, p) {
  if (u.a < 1e-4 && u.ewma < 1e-4) return '<span class="status ruhe">untrainiert</span>';
  if (u.ewma >= p.erhalt) return '<span class="status haelt">Reiz reicht zum Erhalt</span>';
  return '<span class="status ab">unter Erhaltungsreiz – baut ab</span>';
}
function blatt() {
  if (buehne) buehne.setzeWahl(gewaehlt && M.MUSKEL[gewaehlt.id].sichtbar ? M.einheitIndex(gewaehlt.id, gewaehlt.seite) : -1);
  const b = $('#blatt');
  if (!gewaehlt) { b.hidden = true; $('#unten').hidden = false; return; }
  const m = M.MUSKEL[gewaehlt.id], zz = z(), p = M.MODI[zz.modus];
  const seite = s => {
    const u = zz.muskeln[m.id][s];
    return `<div class="seite ${s === gewaehlt.seite ? 'aktiv' : ''}">
      <h3>${s === 'L' ? 'Links' : 'Rechts'}</h3>
      <div class="gross zahl">${proz(u.a)}</div>
      <small>Volumen ggü. Start${u.pump > 0.001 ? ` · Pump ${proz(u.pump)}` : ''}</small>
      <small>Potenzial ausgeschöpft: ${fmt(100 * M.entwicklung(m.id, u), 0)} %</small>
      <small>Höchststand: ${proz(u.peak)}</small>
      ${status(u, p)}
    </div>`;
  };
  const ueb = M.UEBUNGEN.filter(u => u.w[m.id]).sort((a, c) => c.w[m.id] - a.w[m.id]).slice(0, 6);
  b.innerHTML = `
    <header><div><h2>${esc(m.name)}</h2><div class="latein">${esc(m.latein)}</div></div>
      <button class="zu" id="blatt-zu" aria-label="Schließen">×</button></header>
    ${m.sichtbar ? '' : '<p class="unterzeile" style="margin-top:8px">Tiefer Muskel: wird einzeln berechnet und zählt zur Magermasse, verändert aber keine eigene Oberfläche.</p>'}
    <div class="seiten">${seite('L')}${seite('R')}</div>
    <span class="etikett">Übungen für diesen Muskel</span>
    <div class="uebliste">${ueb.map(u => `<button data-uebung="${u.id}"><span>${esc(u.name)}</span><span class="w">${fmt(u.w[m.id] * 100, 0)} %</span></button>`).join('')}</div>`;
  b.hidden = false;
  $('#unten').hidden = true;
  $('#blatt-zu').onclick = () => waehle(null);
  $$('[data-uebung]', b).forEach(k => k.onclick = () => {
    formular.uebung = k.dataset.uebung;
    formular.seite = 'B';
    tab('training');
    trainingZeichnen();
    $('#uebung').scrollIntoView({ block: 'center' });
  });
}

// ---------- Training ----------
const formular = { uebung: 'bizepscurl', seite: 'B', saetze: [{ kg: 12, wdh: 10, rir: 2 }, { kg: 12, wdh: 10, rir: 2 }, { kg: 12, wdh: 10, rir: 2 }] };
function uebungsAuswahl(sel, mitLeer = false) {
  const kats = [...new Set(M.UEBUNGEN.map(u => u.kat))];
  sel.innerHTML = (mitLeer ? '<option value="">–</option>' : '') + kats.map(k =>
    `<optgroup label="${k}">${M.UEBUNGEN.filter(u => u.kat === k).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</optgroup>`).join('');
}
function satzText(saetze) {
  const kg = saetze.filter(s => s.kg).map(s => s.kg);
  return `${saetze.length} × ${saetze.map(s => s.wdh).join('/')} Wdh.${kg.length ? ` · ${kg.join('/')} kg` : ''} · RIR ${saetze.map(s => s.rir).join('/')}`;
}
function trainingZeichnen() {
  const zz = z(), e = entwurf();
  $('#einheit-titel').innerHTML = `Einheit für Tag ${zz.tag}${e.name ? ` <small>${esc(e.name)}</small>` : ''}`;
  $('#eintraege').innerHTML = e.eintraege.length ? e.eintraege.map((x, i) => `
    <div class="eintrag"><div><b>${esc(M.UEBUNG[x.uebung].name)}${x.seite !== 'B' ? ` · ${SEITE_NAME[x.seite]}` : ''}</b>
      <small class="zahl">${satzText(x.saetze)}</small></div>
      <button data-weg="${i}" aria-label="Entfernen">×</button></div>`).join('')
    : '<div class="leer">Noch keine Übung. Wähle eine Vorlage oder füge unten Übungen hinzu.</div>';
  $$('[data-weg]').forEach(k => k.onclick = () => { e.eintraege.splice(+k.dataset.weg, 1); spaeterSpeichern(); trainingZeichnen(); });
  $('#abschliessen').disabled = !e.eintraege.length;

  $('#uebung').value = formular.uebung;
  $$('#seite button').forEach(k => k.setAttribute('aria-pressed', String(k.dataset.seite === formular.seite)));
  $('#saetze').innerHTML = formular.saetze.map((s, i) => `<tr>
    <td>${i + 1}</td>
    <td><input type="number" inputmode="decimal" min="0" step="0.5" value="${s.kg ?? ''}" data-i="${i}" data-f="kg" aria-label="Gewicht Satz ${i + 1}" id="satz-${i}-kg"></td>
    <td><input type="number" inputmode="numeric" min="1" max="60" value="${s.wdh}" data-i="${i}" data-f="wdh" aria-label="Wiederholungen Satz ${i + 1}" id="satz-${i}-wdh"></td>
    <td><input type="number" inputmode="numeric" min="0" max="6" value="${s.rir}" data-i="${i}" data-f="rir" aria-label="RIR Satz ${i + 1}" id="satz-${i}-rir"></td>
    <td><button class="weg" data-satzweg="${i}" aria-label="Satz entfernen">×</button></td></tr>`).join('');
  $$('#saetze input').forEach(inp => inp.oninput = () => {
    const v = inp.value === '' ? null : Number(inp.value);
    formular.saetze[+inp.dataset.i][inp.dataset.f] = inp.dataset.f === 'kg' ? v : Math.max(0, Math.round(v ?? 0));
  });
  $$('[data-satzweg]').forEach(k => k.onclick = () => { if (formular.saetze.length > 1) { formular.saetze.splice(+k.dataset.satzweg, 1); trainingZeichnen(); } });

  const u = M.UEBUNG[formular.uebung];
  $('#beansprucht').innerHTML = Object.entries(u.w).sort((a, b) => b[1] - a[1]).map(([id, w]) => `
    <div class="b"><span>${esc(M.MUSKEL[id].name)}${M.MUSKEL[id].sichtbar ? '' : '<span class="tief">tief</span>'}</span>
      <span class="spur"><i style="width:${w * 100}%"></i></span><span class="p zahl">${fmt(w * 100, 0)} %</span></div>`).join('');

  const prot = zz.protokoll.slice(-8).reverse();
  $('#protokoll').innerHTML = prot.length ? prot.map(p => {
    const saetze = p.eintraege.reduce((s, x) => s + x.saetze.length, 0);
    return `<div class="eintrag"><div><b>Tag ${p.tag} · ${esc(p.name)}</b><small>${p.eintraege.length} Übungen · ${saetze} Sätze</small></div></div>`;
  }).join('') : '<div class="leer">Noch keine Einheit eingetragen.</div>';
}
function ergebnisZeigen(delta) {
  const liste = [];
  for (const [id, s] of Object.entries(delta)) for (const seite of M.SEITEN) if (s[seite] > 1e-6) liste.push({ id, seite, d: s[seite] });
  liste.sort((a, b) => b.d - a.d);
  const zz = z();
  const e = $('#ergebnis');
  e.innerHTML = `<h2>Einheit eingetragen <small>Tag ${zz.tag}</small></h2>
    <div class="balkenliste">${liste.slice(0, 8).map(x => `<div class="b"><span>${esc(M.MUSKEL[x.id].name)} ${SEITE_NAME[x.seite]}</span>
      <span class="spur"><i style="width:${Math.min(100, x.d / liste[0].d * 100)}%;background:var(--gut)"></i></span><span class="p plus zahl">${proz(x.d, 2)}</span></div>`).join('')}</div>
    <p class="unterzeile">Dauerhafter Zuwachs an Muskelvolumen. Der Pump ist zusätzlich sichtbar und verschwindet am nächsten Tag.</p>
    <div class="zeile"><button class="knopf haupt" id="ergebnis-sehen">Avatar ansehen</button><button class="knopf" id="ergebnis-tag">Nächster Tag</button></div>`;
  e.hidden = false;
  $('#ergebnis-sehen').onclick = () => { e.hidden = true; tab('koerper'); };
  $('#ergebnis-tag').onclick = () => { e.hidden = true; vorspulen(1); };
}

// ---------- Werte ----------
function werteZeichnen() {
  const zz = z(), k = M.koerperwerte(zz), s = M.START[zz.geschlecht];
  const dKfa = (k.kfa - s.kfa) * 100;
  $('#kacheln').innerHTML = `
    <div class="kachel"><span class="etikett">Gewicht</span><b class="zahl">${fmt(k.gewicht)} kg</b><br><small>Start ${fmt(s.gewicht)} kg</small></div>
    <div class="kachel"><span class="etikett">Körperfett</span><b class="zahl">${fmt(k.kfa * 100)} %</b><br><small>${dKfa < 0 ? '−' : '+'}${fmt(Math.abs(dKfa))} Prozentpunkte</small></div>
    <div class="kachel"><span class="etikett">Magermasse</span><b class="zahl">${fmt(k.mager)} kg</b><br><small>Start ${fmt(zz.magerStart)} kg</small></div>
    <div class="kachel"><span class="etikett">Muskel seit Start</span><b class="zahl">${k.muskelZuwachsKg >= 0 ? '+' : '−'}${fmt(Math.abs(k.muskelZuwachsKg), 2)} kg</b><br><small>${M.MUSKELN.length * 2} Einheiten</small></div>`;
  let max = { d: 0 };
  for (const m of M.MUSKELN) {
    const d = zz.muskeln[m.id].R.a - zz.muskeln[m.id].L.a;
    if (Math.abs(d) > Math.abs(max.d)) max = { d, m };
  }
  $('#asymmetrie').textContent = Math.abs(max.d) < 0.005 ? 'Links und rechts sind ausgeglichen.'
    : `Größte Seitendifferenz: ${max.m.name} – rechts ${proz(zz.muskeln[max.m.id].R.a)}, links ${proz(zz.muskeln[max.m.id].L.a)}.`;
  const gruppen = [...new Set(M.MUSKELN.map(m => m.gruppe))];
  const zelle = (m, s) => {
    const u = zz.muskeln[m.id][s];
    return `<td class="wert"><div class="mini"><span class="zahl">${proz(u.a)}</span><span class="spur"><i style="width:${Math.min(100, 100 * M.entwicklung(m.id, u))}%"></i></span></div></td>`;
  };
  $('#werte').innerHTML = `<thead><tr><th>Muskel</th><th>Links</th><th>Rechts</th></tr></thead><tbody>` + gruppen.map(g =>
    `<tr class="gruppe"><td colspan="3">${g}</td></tr>` + M.MUSKELN.filter(m => m.gruppe === g).map(m => {
      const d = zz.muskeln[m.id].R.a - zz.muskeln[m.id].L.a;
      return `<tr class="m" data-muskel="${m.id}"><td>${esc(m.name)}${m.sichtbar ? '' : '<span class="tief">tief</span>'}${Math.abs(d) >= 0.02 ? `<span class="differenz">${d > 0 ? 'R' : 'L'} +${fmt(Math.abs(d) * 100, 0)}</span>` : ''}</td>${zelle(m, 'L')}${zelle(m, 'R')}</tr>`;
    }).join('')).join('') + '</tbody>';
  $$('#werte tr.m').forEach(r => r.onclick = () => {
    const u = zz.muskeln[r.dataset.muskel];
    waehle({ id: r.dataset.muskel, seite: u.R.a > u.L.a ? 'R' : 'L' });
    tab('koerper');
  });
}

// ---------- Zeit ----------
const MODUS_TEXT = {
  realismus: 'Aufbau mit Sättigung: Einsteiger wachsen schneller als Fortgeschrittene. Ohne Training hält der geglättete Reiz den Muskel gut zwei Wochen, danach baut er langsam Richtung Startkörper ab (Halbwertszeit des Zuwachses 12 Wochen). Nie unter den Start.',
  arcade: 'Rund 3,3-mal schnellerer Aufbau. Nach etwa einer Woche Pause beginnt der Rückgang, Halbwertszeit des Zuwachses 4 Wochen. Muskelgedächtnis bis 4-fach schnellerer Wiederaufbau. Nie unter den Start.',
};
function zeitZeichnen() {
  const zz = z(), s = M.START[zz.geschlecht], k = M.koerperwerte(zz);
  $$('#modus button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modus === zz.modus)));
  $$('#ernaehrung button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ern === zz.ernaehrung)));
  $('#modus-text').textContent = MODUS_TEXT[zz.modus];
  const r = $('#kfa');
  r.min = String(s.kfaMin * 100);
  r.value = String(Math.round(k.kfa * 200) / 2);
  $('#kfa-wert').textContent = `${fmt(k.kfa * 100)} % (Start ${fmt(s.kfa * 100, 0)} %)`;
  diagramm();
}
function vorspulen(tage) {
  M.tageVergehen(z(), tage);
  allesNeu();
}
let simuliert = null;
async function planStarten() {
  if (simuliert) { simuliert.abbrechen = true; return; }
  const vorlage = $('#plan-vorlage').value, f = +$('#plan-frequenz').value, wochen = +$('#plan-wochen').value;
  const eintraege = M.vorlageEintraege(vorlage), name = M.VORLAGEN.find(v => v.id === vorlage).name;
  simuliert = { abbrechen: false };
  const knopf = $('#plan-start'), balken = $('#plan-fortschritt');
  knopf.textContent = 'Abbrechen'; balken.hidden = false;
  if (!breit.matches) tab('koerper');
  const schritt = Math.max(1, Math.round(wochen / 16));
  for (let w = 1; w <= wochen && !simuliert.abbrechen; w++) {
    M.planSimulieren(z(), eintraege, f, 1, name);
    balken.firstElementChild.style.width = `${100 * w / wochen}%`;
    if (w % schritt === 0 || w === wochen) {
      kennzahlen(`<div>Simulation <b class="zahl">Woche ${w} / ${wochen}</b></div>`);
      muskelFarben();
      await koerperNeu();
    }
  }
  simuliert = null;
  knopf.textContent = 'Simulieren'; balken.hidden = true; balken.firstElementChild.style.width = '0';
  allesNeu();
}

// Verlauf als Liniendiagramm: Volumen ggü. Start links/rechts, gestrichelt der Höchststand
let diagrammDaten = null;
function diagramm() {
  const c = $('#verlauf'), zz = z(), id = daten.ansicht.verlaufMuskel;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = c.clientWidth, H = c.clientHeight;
  if (!W) return;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.clearRect(0, 0, W, H);
  const v = zz.verlauf.length ? zz.verlauf : [{ tag: 0, units: {} }];
  const css = getComputedStyle(document.documentElement);
  const farbe = n => css.getPropertyValue(n).trim();
  const wert = (e, i) => (e.units[id] ?? [0, 0, 0, 0])[i];
  let ymax = 0.05;
  for (const e of v) for (let i = 0; i < 4; i++) ymax = Math.max(ymax, wert(e, i));
  const schritte = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5];
  const st = schritte.find(s => ymax / s <= 5) ?? 0.5;
  ymax = Math.ceil(ymax / st) * st;
  const t0 = v[0].tag, t1 = Math.max(v[v.length - 1].tag, t0 + 7);
  const L = 44, R = 26, O = 10, U = 24;
  const x = t => L + (W - L - R) * (t - t0) / (t1 - t0);
  const y = a => O + (H - O - U) * (1 - a / ymax);
  g.font = '12px Barlow, system-ui, sans-serif';
  g.fillStyle = farbe('--text-3'); g.strokeStyle = 'rgba(163,176,204,0.12)'; g.lineWidth = 1;
  for (let a = 0; a <= ymax + 1e-9; a += st) {
    g.beginPath(); g.moveTo(L, y(a)); g.lineTo(W - R, y(a)); g.stroke();
    g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText((a === 0 ? '' : '+') + fmt(a * 100, 0) + ' %', L - 6, y(a));
  }
  const tst = [1, 7, 14, 28, 56, 84, 182, 364].find(s => (t1 - t0) / s <= 6) ?? 364;
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let t = Math.ceil(t0 / tst) * tst; t <= t1; t += tst) g.fillText(tst >= 7 ? `Wo. ${t / 7}` : `Tag ${t}`, x(t), H - U + 6);
  const linie = (i, col, strich) => {
    g.beginPath();
    v.forEach((e, k) => { const px = x(e.tag), py = y(wert(e, i)); k ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.strokeStyle = col; g.lineWidth = strich ? 1.5 : 2; g.setLineDash(strich ? [4, 4] : []); g.globalAlpha = strich ? 0.6 : 1;
    g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  };
  linie(2, farbe('--serie-l'), true); linie(3, farbe('--serie-r'), true);
  linie(0, farbe('--serie-l'), false); linie(1, farbe('--serie-r'), false);
  const letzter = v[v.length - 1];
  for (const [i, col] of [[0, '--serie-l'], [1, '--serie-r']]) {
    g.beginPath(); g.arc(x(letzter.tag), y(wert(letzter, i)), 4, 0, 7); g.fillStyle = farbe(col); g.fill();
    g.lineWidth = 2; g.strokeStyle = farbe('--flaeche'); g.stroke();
  }
  diagrammDaten = { v, x, y, wert, L, R, W, H, O, U, t0, t1 };
}
function diagrammTipp(ev) {
  const d = diagrammDaten, tipp = $('#tipp');
  if (!d) return;
  const r = $('#verlauf').getBoundingClientRect();
  const px = ev.clientX - r.left;
  if (px < d.L || px > d.W - d.R) { tipp.hidden = true; return; }
  const t = d.t0 + (px - d.L) / (d.W - d.L - d.R) * (d.t1 - d.t0);
  let best = d.v[0];
  for (const e of d.v) if (Math.abs(e.tag - t) < Math.abs(best.tag - t)) best = e;
  tipp.innerHTML = `Tag ${best.tag}<br>Links <b>${proz(d.wert(best, 0))}</b> · Rechts <b>${proz(d.wert(best, 1))}</b>`;
  tipp.hidden = false;
  const tx = d.x(best.tag);
  tipp.style.left = `${Math.min(Math.max(tx - 70, 0), d.W - 150)}px`;
  tipp.style.top = '4px';
}

// ---------- Modell-Seite ----------
function modellZeichnen() {
  const R = M.MODI.realismus, A = M.MODI.arcade;
  const sim = modus => {
    const zz = M.neuerZustand('m'); zz.modus = modus;
    M.planSimulieren(zz, M.vorlageEintraege('ganzkoerper'), 2, 12);
    const a12 = zz.muskeln.bizeps.L.a, rest = [];
    let t = 0;
    for (const w of [1, 2, 4, 8, 12, 24]) { M.tageVergehen(zz, w * 7 - t); t = w * 7; rest.push(zz.muskeln.bizeps.L.a / a12); }
    const auf = [4, 12, 26, 52, 104].map(w => { const z2 = M.neuerZustand('m'); z2.modus = modus; M.planSimulieren(z2, M.vorlageEintraege('ganzkoerper'), 2, w); return z2.muskeln.bizeps.L.a; });
    return { rest, auf };
  };
  const sr = sim('realismus'), sa = sim('arcade');
  const ids = M.MUSKELN.map(m => m.id);
  $('#modell').innerHTML = `
  <div class="karte">
    <h2>Wie dein Körper entsteht</h2>
    <p class="prosa">Jeder Muskel wird <b>links und rechts getrennt</b> geführt: ${M.MUSKELN.length} Muskeln bzw. Muskelteile, also ${M.MUSKELN.length * 2} Einheiten. ${M.MUSKELN.filter(m => !m.sichtbar).length} davon sind tief liegend: Sie werden berechnet und zählen zur Magermasse, formen aber keine eigene Oberfläche.</p>
    <p class="prosa">Der Start ist der <b>untrainierte Durchschnitt</b>: Mann 1,79 m und 86,5 kg, Frau 1,66 m und 69,7 kg (Mikrozensus 2025). Körperfett 27 % bzw. 38 %, die Größenordnung aus US-Messdaten (NHANES, DXA). Kein Sixpack, weiche Arme, Bauch. Definition entsteht erst, wenn Muskeln wachsen <b>und</b> das Körperfett sinkt.</p>
  </div>
  <div class="karte">
    <h2>Die Rechenregeln</h2>
    <div class="formel">Satzqualität <var>q</var> = <var>q</var><sub>RIR</sub> · <var>q</var><sub>Wdh</sub> &nbsp; (RIR ≤ 1: 1,0 · je weitere Reserve −0,15 · Untergrenze 0,3)</div>
    <div class="formel">Dosis <var>D<sub>m</sub></var> = Σ<sub>Sätze</sub> <var>w<sub>Übung,m</sub></var> · <var>q</var> &nbsp;&nbsp; Reiz <var>S</var> = 1 − e<sup>−<var>D</var>/${R.d0}</sup></div>
    <div class="formel">Zuwachs Δ<var>a</var> = <var>r</var> · <var>S</var> · (1 − <var>a</var>/<var>A</var><sub>max</sub>)² · (1 + κ · (<var>a</var><sub>max,bisher</sub> − <var>a</var>) / <var>a</var><sub>max,bisher</sub>) · <var>E</var><sub>Ernährung</sub></div>
    <div class="formel">Erhalt: <var>x<sub>t</sub></var> = (1 − α) <var>x</var><sub>t−1</sub> + α <var>S<sub>t</sub></var>, &nbsp;α = 1 − e<sup>−1/τ</sup> &nbsp;&nbsp; Abbau pro Tag: <var>a</var> ← <var>a</var> · e<sup>−λ · max(0, 1 − <var>x</var>/<var>x</var><sub>Erhalt</sub>)</sup></div>
    <div class="formel">Volumen <var>V</var> = (1 + <var>a</var>)(1 + Pump) &nbsp;&nbsp; Gewicht = Magermasse + Fett &nbsp;&nbsp; Magermasse = Start + Σ Muskelmasse · <var>a</var></div>
    <p class="prosa">Der Abbau läuft exponentiell Richtung Start und unterschreitet ihn nie: Der untrainierte Körper ist das Gleichgewicht, das Alltagsaktivität hält. Unter den Start fällt nur das Körperfett nicht – das kann steigen und sinken.</p>
    <p class="prosa">In der Geometrie wächst jeder Muskel quer zur Faser mit √<var>V</var>. An Armen, Beinen und Schultern wächst die Dicke nach außen mit <var>V</var><sup>0,75</sup> – bewusst überzeichnet, weil Fettschicht und Glättung kleine Zuwächse sonst verschlucken. Definition ist der <b>Glättungsradius</b>, mit dem Muskeln und Grundkörper verschmelzen: Er wächst mit dem Körperfett. Viel Fett füllt die Rillen, wenig Fett lässt sie stehen.</p>
  </div>
  <div class="karte">
    <h2>Parameter</h2>
    <div class="scroll"><table class="tabelle zahl">
      <tr><th>Parameter</th><th>Realismus</th><th>Arcade</th></tr>
      <tr><td>Zuwachsrate <var>r</var> je optimaler Einheit</td><td>${fmt(R.r, 3)}</td><td>${fmt(A.r, 3)}</td></tr>
      <tr><td>Glättung des Reizes τ</td><td>${R.tau} Tage</td><td>${A.tau} Tage</td></tr>
      <tr><td>Erhaltungsreiz <var>x</var><sub>Erhalt</sub> pro Tag</td><td>${fmt(R.erhalt, 2)}</td><td>${fmt(A.erhalt, 2)}</td></tr>
      <tr><td>Halbwertszeit des Zuwachses</td><td>${fmt(Math.LN2 / R.lambda / 7, 0)} Wochen</td><td>${fmt(Math.LN2 / A.lambda / 7, 0)} Wochen</td></tr>
      <tr><td>Muskelgedächtnis κ</td><td>${R.kappa}</td><td>${A.kappa}</td></tr>
      <tr><td>Pump maximal</td><td>${proz(R.pump, 0)}</td><td>${proz(A.pump, 0)}</td></tr>
    </table></div>
  </div>
  <div class="karte">
    <h2>Was die Regeln ergeben <small>Bizeps, Ganzkörper 2× pro Woche</small></h2>
    <span class="etikett">Rest des Zuwachses nach 12 Wochen Training und anschließender Pause</span>
    <div class="scroll"><table class="tabelle zahl">
      <tr><th>Pause</th>${['1 Wo.', '2 Wo.', '4 Wo.', '8 Wo.', '12 Wo.', '24 Wo.'].map(t => `<th>${t}</th>`).join('')}</tr>
      <tr><td>Realismus</td>${sr.rest.map(r => `<td>${fmt(r * 100, 0)} %</td>`).join('')}</tr>
      <tr><td>Arcade</td>${sa.rest.map(r => `<td>${fmt(r * 100, 0)} %</td>`).join('')}</tr>
    </table></div>
    <span class="etikett">Volumen ggü. Start nach durchgehendem Training</span>
    <div class="scroll"><table class="tabelle zahl">
      <tr><th>Training</th>${['4 Wo.', '12 Wo.', '26 Wo.', '1 Jahr', '2 Jahre'].map(t => `<th>${t}</th>`).join('')}</tr>
      <tr><td>Realismus</td>${sr.auf.map(a => `<td>${proz(a, 0)}</td>`).join('')}</tr>
      <tr><td>Arcade</td>${sa.auf.map(a => `<td>${proz(a, 0)}</td>`).join('')}</tr>
    </table></div>
  </div>
  <div class="karte">
    <h2>Übungsgewichte <small>konfigurierbare Modellannahmen</small></h2>
    <div class="scroll"><table class="tabelle matrix zahl">
      <tr><th>Übung</th>${ids.map(id => `<th title="${esc(M.MUSKEL[id].name)}">${esc(M.MUSKEL[id].name)}</th>`).join('')}</tr>
      ${M.UEBUNGEN.map(u => `<tr><td>${esc(u.name)}</td>${ids.map(id => u.w[id] ? `<td class="v">${fmt(u.w[id] * 100, 0)}</td>` : '<td>·</td>').join('')}</tr>`).join('')}
    </table></div>
  </div>
  <div class="karte">
    <h2>Belege und Annahmen</h2>
    <ul class="quellen">
      <li><span class="markierung beleg">Beleg</span>Durchschnittsgröße und -gewicht: Mikrozensus 2025 (Mann 1,79 m / 86,5 kg, Frau 1,66 m / 69,7 kg).</li>
      <li><span class="markierung beleg">Beleg</span>Körperfett US-Erwachsener per DXA: Männer etwa 23–31 %, Frauen etwa 32–42 % je nach Alter – <a href="https://www.cdc.gov/mmwr/preview/mmwrhtml/mm5751a4.htm" target="_blank" rel="noopener">CDC MMWR, NHANES 1999–2004</a>.</li>
      <li><span class="markierung beleg">Beleg</span>Skelettmuskulatur Mann 33 kg, Frau 21 kg; Unterschied im Oberkörper größer (40 %) als im Unterkörper (33 %) – Janssen et al. 2000, J Appl Physiol.</li>
      <li><span class="markierung beleg">Beleg</span>Relativer Muskelzuwachs bei Frauen und Männern ähnlich – <a href="https://peerj.com/articles/19042" target="_blank" rel="noopener">Refalo et al. 2025, PeerJ</a>.</li>
      <li><span class="markierung beleg">Beleg</span>3 Wochen Pause: Muskelquerschnitt sinkt leicht, Kraft bleibt; Zyklen aus 6 Wochen Training und 3 Wochen Pause ergaben nach 24 Wochen ähnliche Hypertrophie wie durchgehendes Training – Ogasawara et al. 2013, Eur J Appl Physiol.</li>
      <li><span class="markierung beleg">Beleg</span>Muskelgedächtnis beim Menschen ist umstritten: Psilander et al. 2019 fanden keinen schnelleren Wiederaufbau im vortrainierten Bein.</li>
      <li><span class="markierung annahme">Annahme</span>Übungsgewichte, Zuwachs- und Abbauraten, Muskelmassen je Muskel, Wirkung der Ernährung: Spielregeln, an Größenordnungen aus der Literatur angelehnt, nicht gemessen.</li>
    </ul>
  </div>`;
}

// ---------- Navigation und Ereignisse ----------
function tab(name) {
  if (breit.matches && name === 'koerper') name = daten.ansicht.tab === 'koerper' ? 'training' : daten.ansicht.tab;
  daten.ansicht.tab = name;
  app.dataset.tab = name;
  $$('#leiste button').forEach(b => b.toggleAttribute('aria-current', b.dataset.ziel === name));
  $$('.tab-seite').forEach(s => s.classList.toggle('an', s.dataset.seite === name));
  if (name === 'koerper' || breit.matches) buehne?.anfordern();
  if (name === 'zeit') requestAnimationFrame(diagramm);
  $('#inhalt').scrollTop = 0;
  spaeterSpeichern();
}
function profilSetzen(p) {
  daten.profil = p;
  app.dataset.profil = p;
  $$('.profil button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.profil === p)));
  if (buehne) {
    buehne.setzeAkzent(AKZENT[p]); buehne.setzeHaut(HAUT[p]); buehne.setzeKoerper(p === 'w', GROESSE[p]);
    buehne.setzeNetz('jetzt', null); buehne.setzeNetz('start', null);
  }
  gewaehlt = null;
  kamera();
  allesNeu();
}
function allesNeu() {
  kennzahlen(); legende(); blatt(); muskelFarben();
  trainingZeichnen(); werteZeichnen(); zeitZeichnen();
  koerperNeu();
  spaeterSpeichern();
}

uebungsAuswahl($('#uebung'));
$('#vorlagen').innerHTML = M.VORLAGEN.map(v => `<button class="chip" data-vorlage="${v.id}">${esc(v.name)}</button>`).join('');
$('#plan-vorlage').innerHTML = M.VORLAGEN.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
$('#plan-frequenz').innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n}×</option>`).join('');
$('#plan-wochen').innerHTML = [1, 2, 4, 8, 12, 16, 24, 52].map(n => `<option value="${n}" ${n === 12 ? 'selected' : ''}>${n}</option>`).join('');
$('#verlauf-muskel').innerHTML = M.MUSKELN.map(m => `<option value="${m.id}">${esc(m.name)}${m.sichtbar ? '' : ' (tief)'}</option>`).join('');
$('#verlauf-muskel').value = daten.ansicht.verlaufMuskel;

$$('#leiste button').forEach(b => b.onclick = () => tab(b.dataset.ziel));
$$('.profil button').forEach(b => b.onclick = () => profilSetzen(b.dataset.profil));
$$('#modi button').forEach(b => b.onclick = () => {
  daten.ansicht.modus = +b.dataset.modus;
  $$('#modi button').forEach(k => k.setAttribute('aria-pressed', String(k === b)));
  buehne?.setzeModus(daten.ansicht.modus); legende(); spaeterSpeichern();
});
$$('#vergleich button').forEach(b => b.onclick = () => {
  daten.ansicht.vergleich = +b.dataset.vergleich;
  $$('#vergleich button').forEach(k => k.setAttribute('aria-pressed', String(k === b)));
  $('#unterschrift').hidden = !daten.ansicht.vergleich;
  kamera(); koerperNeu(); spaeterSpeichern();
});
$('#uebung').onchange = e => { formular.uebung = e.target.value; trainingZeichnen(); };
$$('#seite button').forEach(b => b.onclick = () => { formular.seite = b.dataset.seite; trainingZeichnen(); });
$('#satz-plus').onclick = () => { const l = formular.saetze[formular.saetze.length - 1]; formular.saetze.push({ ...l }); trainingZeichnen(); };
$('#uebung-plus').onclick = e => {
  entwurf().eintraege.push({ uebung: formular.uebung, seite: formular.seite, saetze: formular.saetze.map(s => ({ ...s })) });
  spaeterSpeichern(); trainingZeichnen();
  showInfo(`${M.UEBUNG[formular.uebung].name} hinzugefügt`, 2, e.currentTarget);
};
$('#vorlagen').onclick = e => {
  const k = e.target.closest('[data-vorlage]');
  if (!k) return;
  const v = M.VORLAGEN.find(x => x.id === k.dataset.vorlage);
  daten.entwurf[daten.profil] = { name: v.name, eintraege: M.vorlageEintraege(v.id) };
  spaeterSpeichern(); trainingZeichnen();
};
$('#abschliessen').onclick = () => {
  const e = entwurf();
  if (!e.eintraege.length) return;
  const delta = M.einheitEintragen(z(), e.eintraege, e.name || 'Einheit');
  daten.entwurf[daten.profil] = { name: '', eintraege: [] };
  allesNeu();
  ergebnisZeigen(delta);
  $('#ergebnis').scrollIntoView({ block: 'start', behavior: 'smooth' });
};
$$('#modus button').forEach(b => b.onclick = () => { z().modus = b.dataset.modus; allesNeu(); });
$$('#ernaehrung button').forEach(b => b.onclick = () => { z().ernaehrung = b.dataset.ern; zeitZeichnen(); spaeterSpeichern(); });
$('#kfa').oninput = e => {
  M.kfaSetzen(z(), Number(e.target.value) / 100);
  $('#kfa-wert').textContent = `${fmt(Number(e.target.value))} % (Start ${fmt(M.START[z().geschlecht].kfa * 100, 0)} %)`;
  kennzahlen();
  clearTimeout(window.__kfaT); window.__kfaT = setTimeout(() => { koerperNeu(); werteZeichnen(); diagramm(); spaeterSpeichern(); }, 120);
};
$$('[data-tage]').forEach(b => b.onclick = () => vorspulen(+b.dataset.tage));
$('#plan-start').onclick = planStarten;
$('#verlauf-muskel').onchange = e => { daten.ansicht.verlaufMuskel = e.target.value; diagramm(); spaeterSpeichern(); };
$('#verlauf').addEventListener('pointermove', diagrammTipp);
$('#verlauf').addEventListener('pointerleave', () => { $('#tipp').hidden = true; });
function resetKnopf() {
  const box = $('#reset-box');
  box.innerHTML = '<button class="knopf" id="reset">Profil zurücksetzen</button>';
  $('#reset').onclick = () => {
    box.innerHTML = `<span class="unterzeile">Wirklich alles für dieses Profil löschen?</span>
      <button class="knopf" id="reset-ja" style="border-color:var(--warn)">Ja, zurücksetzen</button>
      <button class="knopf still" id="reset-nein">Abbrechen</button>`;
    $('#reset-ja').onclick = () => {
      const p = daten.profil;
      daten.z[p] = M.neuerZustand(p);
      daten.entwurf[p] = { name: '', eintraege: [] };
      $('#ergebnis').hidden = true;
      resetKnopf();
      speichern();
      allesNeu();
      showInfo('Profil zurückgesetzt', 2, box);
    };
    $('#reset-nein').onclick = resetKnopf;
  };
}
resetKnopf();
window.addEventListener('resize', () => { if (daten.ansicht.tab === 'zeit') diagramm(); });
new ResizeObserver(() => { if ($('#leinwand').clientWidth && buehne && Math.abs(buehne.kam.dist - buehne.standard.dist) < 1e-6) kamera(false); }).observe($('#leinwand'));
breit.addEventListener('change', () => tab(daten.ansicht.tab));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') speichern(); });

// Start
$$('#modi button').forEach(k => k.setAttribute('aria-pressed', String(+k.dataset.modus === daten.ansicht.modus)));
$$('#vergleich button').forEach(k => k.setAttribute('aria-pressed', String(+k.dataset.vergleich === daten.ansicht.vergleich)));
$('#unterschrift').hidden = !daten.ansicht.vergleich;
buehne?.setzeModus(daten.ansicht.modus);
modellZeichnen();
profilSetzen(daten.profil);
tab(daten.ansicht.tab);
window.muskelatlas.buehne = buehne;
window.fertig = true;
