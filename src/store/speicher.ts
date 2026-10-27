// Lokale Speicherung: IndexedDB über Dexie; falls nicht verfügbar (privater Modus, eingeschränkte Vorschau),
// ein localStorage-Ersatz. Alle Daten bleiben auf dem Gerät.
import Dexie, { type Table } from 'dexie';
import type { PerformedSet } from '../engine/modell';
import type { Ruhetag, Session, XpEreignis } from '../engine/xp';
import type { Profil } from './profil';

export interface Daten { profil: Profil | null; sessions: Session[]; saetze: PerformedSet[]; ruhetage: Ruhetag[]; xp: XpEreignis[] }

export interface Speicher {
  art: 'IndexedDB' | 'localStorage' | 'nur Arbeitsspeicher';
  ladeAlles(): Promise<Daten>;
  profil(p: Profil): Promise<void>;
  session(s: Session): Promise<void>;
  satz(s: PerformedSet): Promise<void>;
  satzLoeschen(id: string): Promise<void>;
  ruhetag(r: Ruhetag): Promise<void>;
  xp(ev: XpEreignis[]): Promise<void>;
  ersetzeAlles(d: Daten): Promise<void>;
  loescheAlles(): Promise<void>;
}

class DB extends Dexie {
  profil!: Table<Profil, string>;
  sessions!: Table<Session, string>;
  saetze!: Table<PerformedSet, string>;
  ruhetage!: Table<Ruhetag, string>;
  xp!: Table<XpEreignis, string>;
  constructor() {
    super('muscleatlas3d');
    // xp: Primärschlüssel = Typ + Quelle → doppelte Ereignisse sind technisch ausgeschlossen
    this.version(1).stores({ profil: 'id', sessions: 'id, startedAt, status', saetze: 'id, sessionId, completedAt, exerciseId', ruhetage: 'datum', xp: 'schluessel, zeit, typ' });
  }
}

class DexieSpeicher implements Speicher {
  art = 'IndexedDB' as const;
  constructor(private db: DB) {}
  async ladeAlles(): Promise<Daten> {
    const [profil, sessions, saetze, ruhetage, xp] = await Promise.all([
      this.db.profil.get('ich'), this.db.sessions.toArray(), this.db.saetze.toArray(), this.db.ruhetage.toArray(), this.db.xp.toArray()]);
    return { profil: profil ?? null, sessions, saetze, ruhetage, xp };
  }
  async profil(p: Profil) { await this.db.profil.put(p); }
  async session(s: Session) { await this.db.sessions.put(s); }
  async satz(s: PerformedSet) { await this.db.saetze.put(s); }
  async satzLoeschen(id: string) { await this.db.saetze.delete(id); }
  async ruhetag(r: Ruhetag) { await this.db.ruhetage.put(r); }
  async xp(ev: XpEreignis[]) { await this.db.xp.bulkPut(ev); }
  async ersetzeAlles(d: Daten) {
    await this.db.transaction('rw', [this.db.profil, this.db.sessions, this.db.saetze, this.db.ruhetage, this.db.xp], async () => {
      await Promise.all([this.db.profil.clear(), this.db.sessions.clear(), this.db.saetze.clear(), this.db.ruhetage.clear(), this.db.xp.clear()]);
      if (d.profil) await this.db.profil.put(d.profil);
      await this.db.sessions.bulkPut(d.sessions); await this.db.saetze.bulkPut(d.saetze);
      await this.db.ruhetage.bulkPut(d.ruhetage); await this.db.xp.bulkPut(d.xp);
    });
  }
  async loescheAlles() { await this.ersetzeAlles({ profil: null, sessions: [], saetze: [], ruhetage: [], xp: [] }); }
}

const SCHLUESSEL = 'muscleatlas3d.daten.v1';
class LokalSpeicher implements Speicher {
  art: 'localStorage' | 'nur Arbeitsspeicher';
  private d: Daten = { profil: null, sessions: [], saetze: [], ruhetage: [], xp: [] };
  constructor() {
    let ok = true;
    try { const t = localStorage.getItem(SCHLUESSEL); if (t) this.d = JSON.parse(t); localStorage.setItem(SCHLUESSEL + '.test', '1'); }
    catch { ok = false; }
    this.art = ok ? 'localStorage' : 'nur Arbeitsspeicher';
  }
  private sichern() { try { localStorage.setItem(SCHLUESSEL, JSON.stringify(this.d)); } catch { /* nur im Arbeitsspeicher */ } }
  private ersetze<T>(liste: T[], el: T, key: (x: T) => string) { const i = liste.findIndex(x => key(x) === key(el)); if (i >= 0) liste[i] = el; else liste.push(el); }
  async ladeAlles() { return structuredClone(this.d); }
  async profil(p: Profil) { this.d.profil = p; this.sichern(); }
  async session(s: Session) { this.ersetze(this.d.sessions, s, x => x.id); this.sichern(); }
  async satz(s: PerformedSet) { this.ersetze(this.d.saetze, s, x => x.id); this.sichern(); }
  async satzLoeschen(id: string) { this.d.saetze = this.d.saetze.filter(x => x.id !== id); this.sichern(); }
  async ruhetag(r: Ruhetag) { this.ersetze(this.d.ruhetage, r, x => x.datum); this.sichern(); }
  async xp(ev: XpEreignis[]) { for (const e of ev) this.ersetze(this.d.xp, e, x => x.schluessel); this.sichern(); }
  async ersetzeAlles(d: Daten) { this.d = structuredClone(d); this.sichern(); }
  async loescheAlles() { this.d = { profil: null, sessions: [], saetze: [], ruhetage: [], xp: [] }; this.sichern(); }
}

export async function oeffneSpeicher(): Promise<Speicher> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('kein IndexedDB');
    const db = new DB();
    await db.open();
    return new DexieSpeicher(db);
  } catch {
    return new LokalSpeicher();
  }
}

// Export-Format
export interface ExportDatei { app: 'MuscleAtlas 3D'; version: 1; exportiertAm: string; daten: Daten }
export function pruefeImport(x: unknown): Daten {
  const d = (x as ExportDatei)?.daten;
  if ((x as ExportDatei)?.app !== 'MuscleAtlas 3D' || !d || !Array.isArray(d.saetze) || !Array.isArray(d.sessions)) throw new Error('Keine gültige MuscleAtlas-Exportdatei.');
  return { profil: d.profil ?? null, sessions: d.sessions, saetze: d.saetze, ruhetage: d.ruhetage ?? [], xp: d.xp ?? [] };
}
