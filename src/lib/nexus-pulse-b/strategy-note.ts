/**
 * NexusPulse strategy note vault — admin-only, password-gated note storage.
 * File-backed under `.data/` so it survives restarts (ready to sync to DB later).
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { ensureAppDataDir, getAppDataDir } from '@/lib/app-data-dir';

function dataPaths() {
  const dir = getAppDataDir();
  return {
    dir,
    vault: path.join(dir, 'nexus-pulse-b-strategy-vault.json'),
    note: path.join(dir, 'nexus-pulse-b-strategy-note.json'),
    otpDebug: path.join(dir, 'nexus-pulse-b-note-otp-last.json'),
  };
}

export type NexusStrategyVault = {
  passwordHash: string | null;
  recoveryEmail: string | null;
  unlockTokenHash: string | null;
  unlockExpiresAt: string | null;
  resetOtpHash: string | null;
  resetOtpExpiresAt: string | null;
  updatedAt: string;
};

export type NexusStrategyNoteDoc = {
  title: string;
  updatedAt: string;
  bodyMarkdown: string;
  /** Bump when default note content changes — auto-refresh on load. */
  schemaVersion?: number;
};

/** Increment when `defaultStrategyNoteMarkdown()` changes materially. */
export const NEXUS_STRATEGY_NOTE_SCHEMA = 1;

function hashSecret(value: string, salt = 'nexus-b-note'): string {
  return createHash('sha256').update(`${salt}:${value}:trademind-nexus`).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return a === b;
  }
}

export function defaultStrategyNoteMarkdown(): string {
  return `# NexusPulse Sector 7 B — Sensex Strategy Note (Admin)

## 1. What this strategy is
**Sector 7 B** is the **Sensex twin** of NexusPulse Sector 7 A (same UT math and exits).
It is a **separate** Sensex options **paper** desk (isolated from Sector 7 A / Pinax / Blink).

| Item | Rule |
|------|------|
| **Instrument** | Sensex index options — **buy premium only** (CE or PE) |
| **Signal name in UI** | **Sector 7 B** (UT Bot math; internal codes \`UT_3M\` / \`UT_5M\`) |
| **Lot** | **1 lot** (Sensex lot size **20**) |
| **Strike step** | **100** |
| **Net cost model** | **₹70** deducted per **closed** trade (full round trip, 1 lot) |
| **Gross P&amp;L** | \`(exit premium − entry premium) × 20\` |
| **Net P&amp;L** | Gross − **₹70** |

**Real-option study** replays UT signals + **real Upstox Sensex ATM option 1m closes** (study = strict ATM, no ₹50 shift).

**Live paper** uses the **same signals and exits**, plus the **₹50 premium strike rule** (below).

---

## 2. When we enter (must all be true)
1. Session **Start** is running and Upstox is connected.
2. **Only the lane(s) you selected** before start can open new trades.
3. Time is inside that lane’s **entry window**.
4. A **new 3m Sector 7 B edge** on the **last closed 3m bar**.
5. **5m Sector 7 B agrees:** 3m Buy + 5m long → **CE**; 3m Sell + 5m short → **PE**.
6. Optional **daily loss guard**.
7. **Front-week** Sensex option resolves with a valid live premium.

---

## 3. Strike & premium (live paper only)
1. Start from **ATM** (nearest **100** strike to Sensex).
2. If **ATM premium < ₹50**, step **CE lower** / **PE higher** until premium **≥ ₹50**.
3. While **no open trade** on that side, if LTP < ₹50, re-select ₹50+.
4. While a trade is **open**, that side’s strike stays **locked**.

---

## 4. Sector 7 B (indicator)
Same UT as Sector 7 A / TradingView UT Bot (Heikin Ashi off):

| TF | Key | ATR | Use |
|----|-----|-----|-----|
| **3m** | 1 | 10 | Entry |
| **5m** | 1 | 14 | Direction + exit filter |

Sensex **1m candles from Upstox** are resampled to 3m and 5m in-app.

---

## 5. Two lanes
### Lane A — \`current_bans\`
No new 09:15–09:30; no new 14:00–14:45; SQ **15:14**.

### Lane B — \`morning_open_stop_15\` (default)
Entries from 09:15; from **15:00** no new + force flat; SQ **15:14**.

---

## 6. Exits (no premium SL)
1. **Trail:** MFE ≥ **12** pts → exit if open profit < **50% of MFE**.
2. Opposite **3m Sector 7 B** on a new closed 3m bar.
3. **5m against**.
4. Lane B force flat from **15:00**.
5. Square-off **15:14**.

---

## 7. Running
1. Connect **Upstox**.
2. Open **/app/nexus-pulse-b**, pick lane(s), **Start Sector 7 B**.
3. Keep the tab open while polling.
4. Use **Real option study**, **Trade Archive**, and **Daily Reports** on this desk (Sensex-only storage).

*Schema ${NEXUS_STRATEGY_NOTE_SCHEMA} — Sector 7 B Sensex + live ₹50 strike rule + ₹70 net cost.*
`;
}
async function ensureDataDir() {
  await ensureAppDataDir();
}

export async function loadVault(): Promise<NexusStrategyVault> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(dataPaths().vault, 'utf8');
    return JSON.parse(raw) as NexusStrategyVault;
  } catch {
    const empty: NexusStrategyVault = {
      passwordHash: null,
      recoveryEmail: null,
      unlockTokenHash: null,
      unlockExpiresAt: null,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      updatedAt: new Date().toISOString(),
    };
    await saveVault(empty);
    return empty;
  }
}

export async function saveVault(vault: NexusStrategyVault): Promise<void> {
  await ensureDataDir();
  const next = { ...vault, updatedAt: new Date().toISOString() };
  await fs.writeFile(dataPaths().vault, JSON.stringify(next, null, 2), 'utf8');
  void import('@/lib/nexus-pulse-b/nexus-cloud-store').then((m) => m.syncNexusBStrategyPackToCloud());
}

export async function loadNoteDoc(): Promise<NexusStrategyNoteDoc> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(dataPaths().note, 'utf8');
    const doc = JSON.parse(raw) as NexusStrategyNoteDoc;
    if ((doc.schemaVersion ?? 0) < NEXUS_STRATEGY_NOTE_SCHEMA) {
      const refreshed: NexusStrategyNoteDoc = {
        title: doc.title || 'NexusPulse Sector 7 B Strategy Note',
        updatedAt: new Date().toISOString(),
        bodyMarkdown: defaultStrategyNoteMarkdown(),
        schemaVersion: NEXUS_STRATEGY_NOTE_SCHEMA,
      };
      await saveNoteDoc(refreshed);
      return refreshed;
    }
    return doc;
  } catch {
    const doc: NexusStrategyNoteDoc = {
      title: 'NexusPulse Sector 7 B Strategy Note',
      updatedAt: new Date().toISOString(),
      bodyMarkdown: defaultStrategyNoteMarkdown(),
      schemaVersion: NEXUS_STRATEGY_NOTE_SCHEMA,
    };
    await saveNoteDoc(doc);
    return doc;
  }
}

export async function saveNoteDoc(doc: NexusStrategyNoteDoc): Promise<void> {
  await ensureDataDir();
  const next = { ...doc, updatedAt: new Date().toISOString() };
  await fs.writeFile(dataPaths().note, JSON.stringify(next, null, 2), 'utf8');
  void import('@/lib/nexus-pulse-b/nexus-cloud-store').then((m) => m.syncNexusBStrategyPackToCloud());
}

export function hashNotePassword(password: string): string {
  return hashSecret(password.trim(), 'nexus-note-pw');
}

export async function setNotePassword(password: string, recoveryEmail: string): Promise<void> {
  const vault = await loadVault();
  vault.passwordHash = hashNotePassword(password);
  vault.recoveryEmail = recoveryEmail.trim().toLowerCase();
  vault.resetOtpHash = null;
  vault.resetOtpExpiresAt = null;
  await saveVault(vault);
}

export async function verifyNotePassword(password: string): Promise<boolean> {
  const vault = await loadVault();
  if (!vault.passwordHash) return false;
  return safeEqualHex(vault.passwordHash, hashNotePassword(password));
}

export async function issueUnlockToken(): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4h
  const vault = await loadVault();
  vault.unlockTokenHash = hashSecret(token, 'nexus-unlock');
  vault.unlockExpiresAt = expiresAt;
  await saveVault(vault);
  return { token, expiresAt };
}

export async function verifyUnlockToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const vault = await loadVault();
  if (!vault.unlockTokenHash || !vault.unlockExpiresAt) return false;
  if (new Date(vault.unlockExpiresAt).getTime() < Date.now()) return false;
  return safeEqualHex(vault.unlockTokenHash, hashSecret(token, 'nexus-unlock'));
}

export async function clearUnlock(): Promise<void> {
  const vault = await loadVault();
  vault.unlockTokenHash = null;
  vault.unlockExpiresAt = null;
  await saveVault(vault);
}

export async function issueResetOtp(): Promise<{ otp: string; expiresAt: string }> {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const vault = await loadVault();
  vault.resetOtpHash = hashSecret(otp, 'nexus-otp');
  vault.resetOtpExpiresAt = expiresAt;
  await saveVault(vault);
  await fs.writeFile(
    dataPaths().otpDebug,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        expiresAt,
        note: 'OTP is emailed to admin Gmail. This local file is only a last-resort backup when SMTP is not configured.',
        otp,
      },
      null,
      2
    ),
    'utf8'
  );
  return { otp, expiresAt };
}

export async function verifyResetOtp(otp: string): Promise<boolean> {
  const vault = await loadVault();
  if (!vault.resetOtpHash || !vault.resetOtpExpiresAt) return false;
  if (new Date(vault.resetOtpExpiresAt).getTime() < Date.now()) return false;
  return safeEqualHex(vault.resetOtpHash, hashSecret(otp.trim(), 'nexus-otp'));
}

export async function consumeResetOtp(): Promise<void> {
  const vault = await loadVault();
  vault.resetOtpHash = null;
  vault.resetOtpExpiresAt = null;
  await saveVault(vault);
  try {
    await fs.unlink(dataPaths().otpDebug);
  } catch {
    // ignore
  }
}
