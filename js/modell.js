// Muskelmodell von MuscleAtlas 3D.
// Reine Rechenlogik ohne DOM – läuft im Browser und unter Node (Tests).
//
// Zustand je Muskel und Körperseite:
//   a     Anpassung gegenüber dem untrainierten Start (0 = Start, Volumen = Startvolumen · (1 + a))
//   peak  höchstes je erreichtes a (Muskelgedächtnis)
//   ewma  exponentiell geglätteter Trainingsreiz pro Tag (steuert den Abbau)
//   pump  vorübergehende Volumenzunahme direkt nach dem Training
//
// Alle Zahlen hier sind Modellannahmen (Spielregeln), keine Messwerte – siehe Tab „Modell".

export const MUSKELN = [
  // masse: grobe Annahme in kg je Körperseite beim Durchschnittsmann; oben: Oberkörper (für den Frauenfaktor)
  { id: 'brust_o', name: 'Brust oben', latein: 'M. pectoralis major, Pars clavicularis', gruppe: 'Brust', sichtbar: true, masse: 0.10, oben: true },
  { id: 'brust_u', name: 'Brust unten', latein: 'M. pectoralis major, Pars sternocostalis', gruppe: 'Brust', sichtbar: true, masse: 0.22, oben: true },
  { id: 'serratus', name: 'Sägemuskel', latein: 'M. serratus anterior', gruppe: 'Brust', sichtbar: true, masse: 0.15, oben: true },
  { id: 'delt_v', name: 'Vordere Schulter', latein: 'M. deltoideus, Pars clavicularis', gruppe: 'Schulter', sichtbar: true, masse: 0.13, oben: true },
  { id: 'delt_s', name: 'Seitliche Schulter', latein: 'M. deltoideus, Pars acromialis', gruppe: 'Schulter', sichtbar: true, masse: 0.15, oben: true },
  { id: 'delt_h', name: 'Hintere Schulter', latein: 'M. deltoideus, Pars spinalis', gruppe: 'Schulter', sichtbar: true, masse: 0.12, oben: true },
  { id: 'rotatoren', name: 'Rotatorenmanschette', latein: 'Mm. supraspinatus, infraspinatus, teres minor, subscapularis', gruppe: 'Schulter', sichtbar: false, masse: 0.12, oben: true, amax: 0.8 },
  { id: 'bizeps', name: 'Bizeps', latein: 'M. biceps brachii', gruppe: 'Arme', sichtbar: true, masse: 0.15, oben: true },
  { id: 'brachialis', name: 'Oberarmmuskel', latein: 'M. brachialis', gruppe: 'Arme', sichtbar: true, masse: 0.12, oben: true },
  { id: 'trizeps', name: 'Trizeps', latein: 'M. triceps brachii', gruppe: 'Arme', sichtbar: true, masse: 0.35, oben: true },
  { id: 'brachiorad', name: 'Oberarmspeichenmuskel', latein: 'M. brachioradialis', gruppe: 'Arme', sichtbar: true, masse: 0.06, oben: true, amax: 0.8 },
  { id: 'ua_beuger', name: 'Unterarmbeuger', latein: 'Mm. flexores antebrachii', gruppe: 'Arme', sichtbar: true, masse: 0.20, oben: true, amax: 0.8 },
  { id: 'ua_strecker', name: 'Unterarmstrecker', latein: 'Mm. extensores antebrachii', gruppe: 'Arme', sichtbar: true, masse: 0.15, oben: true, amax: 0.8 },
  { id: 'lat', name: 'Latissimus', latein: 'M. latissimus dorsi', gruppe: 'Rücken', sichtbar: true, masse: 0.35, oben: true },
  { id: 'trapez_o', name: 'Trapez oben', latein: 'M. trapezius, Pars descendens', gruppe: 'Rücken', sichtbar: true, masse: 0.12, oben: true },
  { id: 'trapez_m', name: 'Trapez Mitte & Rautenmuskeln', latein: 'M. trapezius, Pars transversa et ascendens; Mm. rhomboidei', gruppe: 'Rücken', sichtbar: true, masse: 0.20, oben: true },
  { id: 'strecker', name: 'Rückenstrecker', latein: 'M. erector spinae', gruppe: 'Rücken', sichtbar: true, masse: 0.40, oben: true },
  { id: 'bauch_g', name: 'Gerader Bauchmuskel', latein: 'M. rectus abdominis', gruppe: 'Bauch & Hüfte', sichtbar: true, masse: 0.12, oben: true },
  { id: 'bauch_s', name: 'Schräge Bauchmuskeln', latein: 'Mm. obliqui externus et internus abdominis', gruppe: 'Bauch & Hüfte', sichtbar: true, masse: 0.30, oben: true },
  { id: 'bauch_q', name: 'Querer Bauchmuskel', latein: 'M. transversus abdominis', gruppe: 'Bauch & Hüfte', sichtbar: false, masse: 0.08, oben: true, amax: 0.8 },
  { id: 'iliopsoas', name: 'Hüftbeuger', latein: 'M. iliopsoas', gruppe: 'Bauch & Hüfte', sichtbar: false, masse: 0.30, oben: false, amax: 0.8 },
  { id: 'glut_max', name: 'Großer Gesäßmuskel', latein: 'M. gluteus maximus', gruppe: 'Gesäß', sichtbar: true, masse: 0.80, oben: false },
  { id: 'glut_med', name: 'Mittlerer Gesäßmuskel', latein: 'M. gluteus medius', gruppe: 'Gesäß', sichtbar: true, masse: 0.25, oben: false },
  { id: 'glut_min', name: 'Kleiner Gesäßmuskel', latein: 'M. gluteus minimus', gruppe: 'Gesäß', sichtbar: false, masse: 0.08, oben: false, amax: 0.8 },
  { id: 'vast_lat', name: 'Quadrizeps außen', latein: 'M. vastus lateralis', gruppe: 'Beine', sichtbar: true, masse: 0.75, oben: false },
  { id: 'vast_med', name: 'Quadrizeps innen', latein: 'M. vastus medialis', gruppe: 'Beine', sichtbar: true, masse: 0.55, oben: false },
  { id: 'rect_fem', name: 'Quadrizeps Mitte', latein: 'M. rectus femoris', gruppe: 'Beine', sichtbar: true, masse: 0.30, oben: false },
  { id: 'vast_int', name: 'Quadrizeps tief', latein: 'M. vastus intermedius', gruppe: 'Beine', sichtbar: false, masse: 0.40, oben: false },
  { id: 'hamstrings', name: 'Beinbeuger', latein: 'Mm. biceps femoris, semitendinosus, semimembranosus', gruppe: 'Beine', sichtbar: true, masse: 0.90, oben: false },
  { id: 'adduktoren', name: 'Adduktoren', latein: 'Mm. adductores', gruppe: 'Beine', sichtbar: true, masse: 1.00, oben: false },
  { id: 'gastro', name: 'Zwillingswadenmuskel', latein: 'M. gastrocnemius', gruppe: 'Waden', sichtbar: true, masse: 0.35, oben: false, amax: 0.7 },
  { id: 'soleus', name: 'Schollenmuskel', latein: 'M. soleus', gruppe: 'Waden', sichtbar: true, masse: 0.40, oben: false, amax: 0.7 },
  { id: 'tibialis', name: 'Schienbeinmuskel', latein: 'M. tibialis anterior', gruppe: 'Waden', sichtbar: true, masse: 0.10, oben: false, amax: 0.6 },
];

export const MUSKEL = Object.fromEntries(MUSKELN.map(m => [m.id, m]));
export const SEITEN = ['L', 'R'];

// Einheiten-Index für Renderer und Tabellen: 0 = kein Muskel, dann je Muskel L und R.
export const EINHEITEN = MUSKELN.flatMap(m => SEITEN.map(s => ({ id: m.id, seite: s })));
export function einheitIndex(id, seite) {
  return 1 + MUSKELN.findIndex(m => m.id === id) * 2 + (seite === 'R' ? 1 : 0);
}

// Übungen mit Modellgewichten (Anteil des Trainingsreizes je Muskel).
export const UEBUNGEN = [
  { id: 'bankdruecken', name: 'Bankdrücken', kat: 'Brust', w: { brust_u: 1, brust_o: 0.6, delt_v: 0.5, trizeps: 0.5, serratus: 0.2 } },
  { id: 'schraegbank', name: 'Schrägbankdrücken', kat: 'Brust', w: { brust_o: 1, brust_u: 0.5, delt_v: 0.6, trizeps: 0.4, serratus: 0.2 } },
  { id: 'liegestuetz', name: 'Liegestütze', kat: 'Brust', w: { brust_u: 0.8, brust_o: 0.5, delt_v: 0.45, trizeps: 0.45, serratus: 0.35, bauch_q: 0.3, bauch_g: 0.2 } },
  { id: 'dips', name: 'Dips', kat: 'Brust', w: { trizeps: 0.9, brust_u: 0.7, delt_v: 0.6, brust_o: 0.2 } },
  { id: 'butterfly', name: 'Butterfly', kat: 'Brust', w: { brust_u: 1, brust_o: 0.7, delt_v: 0.3 } },
  { id: 'schulterdruecken', name: 'Schulterdrücken', kat: 'Schulter', w: { delt_v: 1, delt_s: 0.5, trizeps: 0.5, serratus: 0.3, trapez_o: 0.3, brust_o: 0.2 } },
  { id: 'seitheben', name: 'Seitheben', kat: 'Schulter', w: { delt_s: 1, trapez_o: 0.3, rotatoren: 0.3, delt_v: 0.2 } },
  { id: 'facepull', name: 'Face Pulls', kat: 'Schulter', w: { delt_h: 1, trapez_m: 0.6, rotatoren: 0.6 } },
  { id: 'reverse_fly', name: 'Reverse Flys', kat: 'Schulter', w: { delt_h: 1, trapez_m: 0.5, rotatoren: 0.3 } },
  { id: 'klimmzug', name: 'Klimmzüge', kat: 'Rücken', w: { lat: 1, bizeps: 0.55, brachialis: 0.55, trapez_m: 0.5, brachiorad: 0.45, ua_beuger: 0.4, delt_h: 0.35, bauch_g: 0.15 } },
  { id: 'latzug', name: 'Latziehen', kat: 'Rücken', w: { lat: 1, bizeps: 0.5, brachialis: 0.5, trapez_m: 0.45, brachiorad: 0.4, ua_beuger: 0.3, delt_h: 0.3 } },
  { id: 'rudern', name: 'Langhantelrudern', kat: 'Rücken', w: { trapez_m: 1, lat: 0.8, delt_h: 0.6, strecker: 0.5, bizeps: 0.4, brachialis: 0.4, brachiorad: 0.35, ua_beuger: 0.3 } },
  { id: 'kh_rudern', name: 'Kurzhantelrudern einarmig', kat: 'Rücken', einseitig: true, w: { lat: 1, trapez_m: 0.8, delt_h: 0.5, brachialis: 0.4, bizeps: 0.35, brachiorad: 0.3 } },
  { id: 'shrugs', name: 'Shrugs', kat: 'Rücken', w: { trapez_o: 1, ua_beuger: 0.3 } },
  { id: 'kreuzheben', name: 'Rumänisches Kreuzheben', kat: 'Rücken', w: { hamstrings: 1, glut_max: 0.8, strecker: 0.7, adduktoren: 0.35, ua_beuger: 0.35, trapez_o: 0.3, lat: 0.2 } },
  { id: 'hyperext', name: 'Rückenstrecken', kat: 'Rücken', w: { strecker: 1, glut_max: 0.5, hamstrings: 0.4 } },
  { id: 'bizepscurl', name: 'Bizepscurls (Kurzhantel)', kat: 'Arme', w: { bizeps: 1, brachialis: 0.75, brachiorad: 0.55, ua_beuger: 0.25 } },
  { id: 'hammercurl', name: 'Hammer-Curls', kat: 'Arme', w: { brachialis: 1, brachiorad: 0.9, bizeps: 0.6, ua_beuger: 0.2 } },
  { id: 'konzcurl', name: 'Konzentrationscurls', kat: 'Arme', einseitig: true, w: { bizeps: 1, brachialis: 0.7, brachiorad: 0.4 } },
  { id: 'reverse_curl', name: 'Reverse Curls', kat: 'Arme', w: { brachiorad: 1, ua_strecker: 0.6, brachialis: 0.6, bizeps: 0.3 } },
  { id: 'handgelenkcurl', name: 'Handgelenkcurls', kat: 'Arme', w: { ua_beuger: 1 } },
  { id: 'trizepsdruecken', name: 'Trizepsdrücken am Kabel', kat: 'Arme', w: { trizeps: 1, ua_strecker: 0.2 } },
  { id: 'french_press', name: 'French Press', kat: 'Arme', w: { trizeps: 1 } },
  { id: 'kniebeuge', name: 'Kniebeugen', kat: 'Beine', w: { vast_lat: 1, vast_med: 1, vast_int: 1, glut_max: 0.7, rect_fem: 0.6, adduktoren: 0.6, strecker: 0.4, bauch_q: 0.3, soleus: 0.15 } },
  { id: 'beinpresse', name: 'Beinpresse', kat: 'Beine', w: { vast_lat: 1, vast_med: 1, vast_int: 1, rect_fem: 0.5, glut_max: 0.5, adduktoren: 0.4 } },
  { id: 'ausfall', name: 'Ausfallschritte', kat: 'Beine', w: { vast_lat: 0.9, vast_med: 0.9, vast_int: 0.9, glut_max: 0.8, rect_fem: 0.5, glut_med: 0.4, adduktoren: 0.4 } },
  { id: 'bulgarian', name: 'Bulgarische Split-Kniebeuge', kat: 'Beine', einseitig: true, w: { vast_lat: 1, vast_med: 1, vast_int: 1, glut_max: 0.9, glut_med: 0.5, adduktoren: 0.5, rect_fem: 0.4 } },
  { id: 'beinstrecker', name: 'Beinstrecker', kat: 'Beine', w: { rect_fem: 1, vast_lat: 1, vast_med: 1, vast_int: 1 } },
  { id: 'beinbeuger', name: 'Beinbeuger (Maschine)', kat: 'Beine', w: { hamstrings: 1, gastro: 0.3 } },
  { id: 'adduktion', name: 'Adduktion (Maschine)', kat: 'Beine', w: { adduktoren: 1 } },
  { id: 'hipthrust', name: 'Hip Thrust', kat: 'Gesäß', w: { glut_max: 1, hamstrings: 0.6, adduktoren: 0.3, glut_med: 0.3, strecker: 0.2 } },
  { id: 'abduktion', name: 'Abduktion (Maschine)', kat: 'Gesäß', w: { glut_med: 1, glut_min: 0.7, glut_max: 0.3 } },
  { id: 'wade_steh', name: 'Wadenheben stehend', kat: 'Waden', w: { gastro: 1, soleus: 0.6 } },
  { id: 'wade_sitz', name: 'Wadenheben sitzend', kat: 'Waden', w: { soleus: 1, gastro: 0.35 } },
  { id: 'tibia_raise', name: 'Tibialis Raises', kat: 'Waden', w: { tibialis: 1 } },
  { id: 'crunch', name: 'Bauchpressen', kat: 'Bauch', w: { bauch_g: 1, bauch_s: 0.4, bauch_q: 0.3 } },
  { id: 'beinheben', name: 'Beinheben hängend', kat: 'Bauch', w: { bauch_g: 1, iliopsoas: 0.8, bauch_s: 0.5, bauch_q: 0.3, ua_beuger: 0.3 } },
  { id: 'seitstuetz', name: 'Seitstütz', kat: 'Bauch', einseitig: true, w: { bauch_s: 1, bauch_q: 0.6, glut_med: 0.3 } },
  { id: 'holzhacker', name: 'Holzhacker am Kabel', kat: 'Bauch', w: { bauch_s: 1, bauch_q: 0.5, bauch_g: 0.3 } },
  { id: 'plank', name: 'Unterarmstütz', kat: 'Bauch', w: { bauch_q: 1, bauch_g: 0.5, bauch_s: 0.4 } },
];
export const UEBUNG = Object.fromEntries(UEBUNGEN.map(u => [u.id, u]));

// Vorlagen: [Übung, Sätze, Seite]
export const VORLAGEN = [
  { id: 'ganzkoerper', name: 'Ganzkörper (Einsteiger)', items: [['kniebeuge', 3], ['bankdruecken', 3], ['rudern', 3], ['schulterdruecken', 3], ['bizepscurl', 3], ['trizepsdruecken', 3]] },
  { id: 'push', name: 'Push', items: [['bankdruecken', 4], ['schraegbank', 3], ['schulterdruecken', 3], ['seitheben', 3], ['trizepsdruecken', 3]] },
  { id: 'pull', name: 'Pull', items: [['klimmzug', 4], ['rudern', 3], ['facepull', 3], ['bizepscurl', 3], ['hammercurl', 3]] },
  { id: 'beine', name: 'Leg Day', items: [['kniebeuge', 4], ['kreuzheben', 3], ['beinpresse', 3], ['beinbeuger', 3], ['wade_steh', 4]] },
  { id: 'unterkoerper', name: 'Unterkörper & Core', items: [['kniebeuge', 3], ['hipthrust', 3], ['ausfall', 3], ['hyperext', 3], ['crunch', 3], ['beinbeuger', 3]] },
  { id: 'bauch', name: 'Bauch', items: [['crunch', 3], ['beinheben', 3], ['holzhacker', 3]] },
  { id: 'nur_rechts', name: 'Nur rechter Bizeps', items: [['konzcurl', 4, 'R']] },
];

// Startkörper: Mikrozensus 2025 (Größe, Gewicht), Körperfett nach NHANES-DXA-Größenordnung.
export const START = {
  m: { groesse: 1.79, gewicht: 86.5, kfa: 0.27, kfaMin: 0.08, kfaSchlank: 0.12, oben: 1, unten: 1 },
  w: { groesse: 1.66, gewicht: 69.7, kfa: 0.38, kfaMin: 0.15, kfaSchlank: 0.20, oben: 0.6, unten: 0.67 },
};

export const MODI = {
  realismus: {
    name: 'Realismus',
    r: 0.006,            // Anpassung je optimaler Einheit am Start
    d0: 4,               // Sättigung der Einheit: S = 1 − exp(−Dosis / d0)
    tau: 14,             // Tage, Zeitkonstante des geglätteten Reizes
    erhalt: 0.07,        // Reiz pro Tag, ab dem nichts abgebaut wird (≈ 3 harte Sätze pro Woche)
    lambda: Math.LN2 / 84, // Abbaurate pro Tag bei vollem Abbau (Halbwertszeit 12 Wochen)
    kappa: 2,            // Muskelgedächtnis: Wiederaufbau bis (1 + kappa)-fach schneller
    pump: 0.04,          // maximale Pump-Zunahme
  },
  arcade: {
    name: 'Arcade',
    r: 0.02, d0: 4, tau: 7, erhalt: 0.06, lambda: Math.LN2 / 28, kappa: 3, pump: 0.06,
  },
};

export const ERNAEHRUNG = {
  defizit: { name: 'Defizit', fettProWoche: -0.45, wachstum: 0.75 },
  erhaltung: { name: 'Erhaltung', fettProWoche: 0, wachstum: 1 },
  ueberschuss: { name: 'Überschuss', fettProWoche: 0.2, wachstum: 1.15 },
};

const runde = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

export function amax(id) { return MUSKEL[id].amax ?? 1; }

export function muskelMasse(id, geschlecht) {
  const m = MUSKEL[id], s = START[geschlecht];
  return m.masse * (m.oben ? s.oben : s.unten);
}

export function neuerZustand(geschlecht = 'm') {
  const s = START[geschlecht];
  const muskeln = {};
  for (const m of MUSKELN) muskeln[m.id] = { L: neueEinheit(), R: neueEinheit() };
  return {
    geschlecht, tag: 0, modus: 'realismus', ernaehrung: 'erhaltung',
    fettKg: s.gewicht * s.kfa,
    magerStart: s.gewicht * (1 - s.kfa),
    muskeln, protokoll: [], verlauf: [],
  };
}
function neueEinheit() { return { a: 0, peak: 0, ewma: 0, pump: 0 }; }

// Qualität eines Satzes: Nähe zum Muskelversagen (RIR) und Wiederholungsbereich.
// Das Gewicht in kg geht bewusst nicht ein – für Hypertrophie zählt die Zahl harter Sätze, nicht die Tonnage.
export function satzQualitaet({ wdh = 10, rir = 2 } = {}) {
  const qRir = rir <= 1 ? 1 : Math.max(0.3, 1 - 0.15 * (rir - 1));
  const qWdh = wdh < 3 ? 0.5 : wdh < 5 ? 0.75 : wdh <= 30 ? 1 : 0.8;
  return qRir * qWdh;
}

// Dosis je Muskel und Seite aus einer Liste von Einträgen {uebung, seite: 'B'|'L'|'R', saetze: [{kg, wdh, rir}]}
export function dosis(eintraege) {
  const d = {};
  for (const e of eintraege) {
    const u = UEBUNG[e.uebung];
    if (!u) continue;
    const seiten = e.seite === 'L' ? ['L'] : e.seite === 'R' ? ['R'] : SEITEN;
    const q = e.saetze.reduce((s, satz) => s + satzQualitaet(satz), 0);
    for (const [id, w] of Object.entries(u.w)) {
      d[id] ??= { L: 0, R: 0 };
      for (const s of seiten) d[id][s] += w * q;
    }
  }
  return d;
}

export function reiz(dosisWert, p) { return 1 - Math.exp(-dosisWert / p.d0); }

// Wachstum einer Einheit für einen Reiz S. Gibt Δa zurück, ohne den Zustand zu ändern.
export function wachstum(e, id, S, p, faktorErnaehrung = 1) {
  const A = amax(id);
  const sat = Math.max(0, 1 - e.a / A) ** 2;
  const gedaechtnis = e.peak > e.a ? 1 + p.kappa * (e.peak - e.a) / e.peak : 1;
  return p.r * S * sat * gedaechtnis * faktorErnaehrung;
}

// Trägt eine Trainingseinheit am aktuellen Tag ein. Gibt {id: {L: Δa, R: Δa}} zurück.
export function einheitEintragen(z, eintraege, name = 'Einheit') {
  const p = MODI[z.modus], ern = ERNAEHRUNG[z.ernaehrung].wachstum;
  const alpha = 1 - Math.exp(-1 / p.tau);
  const d = dosis(eintraege);
  const delta = {};
  for (const [id, seiten] of Object.entries(d)) {
    delta[id] = { L: 0, R: 0 };
    for (const s of SEITEN) {
      if (seiten[s] <= 0) continue;
      const e = z.muskeln[id][s];
      const S = reiz(seiten[s], p);
      const da = wachstum(e, id, S, p, ern);
      e.a += da;
      e.peak = Math.max(e.peak, e.a);
      e.ewma += alpha * S;
      e.pump = Math.max(e.pump, p.pump * S);
      delta[id][s] = da;
    }
  }
  z.protokoll.push({
    tag: z.tag, name,
    eintraege: eintraege.map(e => ({ uebung: e.uebung, seite: e.seite, saetze: e.saetze.map(s => ({ ...s })) })),
  });
  if (z.protokoll.length > 400) z.protokoll.splice(0, z.protokoll.length - 400);
  schnappschuss(z);
  return delta;
}

// Lässt `tage` Tage ohne weiteres Training vergehen: Pump verschwindet, geglätteter Reiz sinkt,
// unterhalb der Erhaltungsschwelle baut der Muskel exponentiell Richtung Start ab (nie darunter).
export function tageVergehen(z, tage = 1) {
  const p = MODI[z.modus], ern = ERNAEHRUNG[z.ernaehrung];
  const zerfall = Math.exp(-1 / p.tau);
  for (let t = 0; t < tage; t++) {
    for (const id in z.muskeln) for (const s of SEITEN) {
      const e = z.muskeln[id][s];
      e.ewma *= zerfall;
      const g = Math.min(1, Math.max(0, 1 - e.ewma / p.erhalt));
      e.a *= Math.exp(-p.lambda * g);
      e.pump *= 0.15;
      if (e.pump < 1e-4) e.pump = 0;
    }
    if (ern.fettProWoche) {
      const mager = magerMasse(z), min = START[z.geschlecht].kfaMin;
      const fettMin = min * mager / (1 - min);
      z.fettKg = Math.max(fettMin, z.fettKg + ern.fettProWoche / 7);
    }
    z.tag += 1;
    schnappschuss(z);
  }
}

export function magerMasse(z) {
  let zuwachs = 0;
  for (const m of MUSKELN) for (const s of SEITEN) zuwachs += muskelMasse(m.id, z.geschlecht) * z.muskeln[m.id][s].a;
  return z.magerStart + zuwachs;
}

export function koerperwerte(z) {
  const mager = magerMasse(z), gewicht = mager + z.fettKg;
  return { gewicht, mager, fettKg: z.fettKg, kfa: z.fettKg / gewicht, muskelZuwachsKg: mager - z.magerStart };
}

export function kfaSetzen(z, kfa) {
  const mager = magerMasse(z), s = START[z.geschlecht];
  const k = Math.min(0.5, Math.max(s.kfaMin, kfa));
  z.fettKg = k * mager / (1 - k);
  schnappschuss(z);
}

// Fettfaktor für die Geometrie: 0 = schlank (Definition sichtbar), 1 = Durchschnitt beim Start, >1 = mehr Fett
export function fettFaktor(z) {
  const s = START[z.geschlecht], kfa = koerperwerte(z).kfa;
  return Math.max(0, (kfa - s.kfaSchlank) / (s.kfa - s.kfaSchlank));
}

export function volumenFaktor(e) { return (1 + e.a) * (1 + e.pump); }
export function entwicklung(id, e) { return e.a / amax(id); }

function schnappschuss(z) {
  const units = {};
  for (const id in z.muskeln) units[id] = [runde(z.muskeln[id].L.a), runde(z.muskeln[id].R.a), runde(z.muskeln[id].L.peak), runde(z.muskeln[id].R.peak)];
  const k = koerperwerte(z);
  const eintrag = { tag: z.tag, gewicht: runde(k.gewicht, 2), kfa: runde(k.kfa, 4), units };
  const letzter = z.verlauf[z.verlauf.length - 1];
  if (letzter && letzter.tag === z.tag) z.verlauf[z.verlauf.length - 1] = eintrag;
  else z.verlauf.push(eintrag);
  if (z.verlauf.length > 1200) z.verlauf.splice(0, z.verlauf.length - 1200);
}

// Vorlage → Einträge mit Standardsätzen (10 Wdh., RIR 2)
export function vorlageEintraege(vorlageId) {
  const v = VORLAGEN.find(x => x.id === vorlageId);
  return v.items.map(([uebung, n, seite = 'B']) => ({
    uebung, seite, saetze: Array.from({ length: n }, () => ({ kg: null, wdh: 10, rir: 2 })),
  }));
}

// Simuliert einen Plan: `proWoche` Einheiten pro Woche über `wochen` Wochen, gleichmäßig verteilt.
export function planSimulieren(z, eintraege, proWoche, wochen, name = 'Plan') {
  const tage = Array.from({ length: proWoche }, (_, i) => Math.floor(i * 7 / proWoche));
  for (let w = 0; w < wochen; w++) {
    for (let d = 0; d < 7; d++) {
      if (tage.includes(d)) einheitEintragen(z, eintraege, name);
      tageVergehen(z, 1);
    }
  }
}
