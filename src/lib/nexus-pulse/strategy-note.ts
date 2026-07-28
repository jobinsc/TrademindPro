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
    vault: path.join(dir, 'nexus-pulse-strategy-vault.json'),
    note: path.join(dir, 'nexus-pulse-strategy-note.json'),
    otpDebug: path.join(dir, 'nexus-pulse-note-otp-last.json'),
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
export const NEXUS_STRATEGY_NOTE_SCHEMA = 3;

function hashSecret(value: string, salt = 'nexus-note'): string {
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
  return `# NexusPulse — Full Strategy Note (Admin)

## 1. What this strategy is
NexusPulse matches the **D:\\BOTS\\NexusPulse** desk (the engine behind the real-option PDF study).
It is a **separate** Nifty 50 options **paper** desk (live orders off until you approve them).
It does **not** share entries/exits with PinaxForge, Blink, or ATM Lab.

| Item | Rule |
|------|------|
| **Instrument** | Nifty index options — **buy premium only** (CE or PE) |
| **Signal name in UI** | **Sector 7 A** (UT Bot math; internal codes \`UT_3M\` / \`UT_5M\`) |
| **Lot** | **1 lot** (Nifty lot size **65**) |
| **Net cost model** | **₹70** deducted per **closed** trade (full round trip, 1 lot) |
| **Gross P&amp;L** | \`(exit premium − entry premium) × 65\` |
| **Net P&amp;L** | Gross − **₹70** |

**Real-option study** (NexusPulse page) replays the PDF method: UT signals + **real Upstox ATM option 1m closes** (historical study uses **strict ATM**, no ₹50 shift).

**Live paper** uses the **same signals and exits** as the bot, plus your **₹50 premium strike rule** (below).

---

## 2. When we enter (must all be true)
1. Session **Start** is running and Upstox is connected.
2. **Only the lane(s) you selected** before start can open new trades (\`current_bans\`, \`morning_open_stop_15\`, or both).
3. Time is inside that lane’s **entry window** (see §4).
4. A **new 3m Sector 7 A edge** on the **last closed 3m bar** (not a repeat on the same bar).
5. **5m Sector 7 A agrees:**
   - 3m **Buy** + 5m **long** → **CE**
   - 3m **Sell** + 5m **short** → **PE**
6. Optional **daily loss guard**: if enabled, no new entries after day net hits your limit.
7. **Front-week** Nifty option contract resolves with a valid live premium.

If 3m fires but 5m does not agree → **no trade**.

---

## 3. Strike & premium (live paper only)
Study/PDF uses **ATM** strike only. **Live paper** adds:

1. Start from **ATM** (nearest 50 strike to Nifty).
2. If **ATM premium < ₹50**, step **CE to lower strikes** / **PE to higher strikes** until premium **≥ ₹50** (when chain quotes allow).
3. **Selected CE/PE board:** while **no open trade** on that side, if shown **LTP < ₹50**, re-select a **₹50+** contract.
4. **While a trade is open** on CE or PE, that side’s **strike is locked** until exit; then selection can move again.

What you trade is what the **Selected CE/PE** cards show at entry time.

---

## 4. Sector 7 A (indicator)
Same as TradingView UT Bot (Heikin Ashi off):

| TF | Key | ATR | Use |
|----|-----|-----|-----|
| **3m** | 1 | 10 | Entry (Buy/Sell on closed bar) |
| **5m** | 1 | 14 | Direction filter + exit filter |

Nifty **1m candles from Upstox** are resampled to 3m and 5m in-app.

---

## 5. Two lanes (separate paper trades — do not merge P&amp;L)

### Lane A — \`current_bans\`
- No new entries **09:15–09:30**
- No new entries **14:00–14:45**
- Square-off **15:14 IST**

### Lane B — \`morning_open_stop_15\` (default)
- New entries from **09:15**
- From **15:00**: no new entries + **force flat** open Lane B trades
- Square-off **15:14 IST**

The same signal may open **one trade per active lane** (two rows if both lanes are selected).

---

## 6. Exits & management (same as BOTS / PDF — **no premium stop loss**)
There is **no** mandatory 20% premium SL on this desk (matches \`backtest_session_real_options.py\`).

Exit reasons, in practice:
1. **Trail:** after option MFE ≥ **12** premium points, exit if open profit < **50% of MFE**.
2. **Opposite 3m Sector 7 A** on a **new closed 3m bar** (CE on 3m Sell, PE on 3m Buy).
3. **5m against:** CE if 5m turns short; PE if 5m turns long.
4. **Lane B:** force flat from **15:00** (Lane B only).
5. **Square-off 15:14** all lanes.

Track high/low premium and open/close times in the trade archive.

---

## 7. Running the desk tomorrow onward
1. \`npm run live\` — keep terminal open.
2. Connect **Upstox** in Settings.
3. NexusPulse: choose **lane(s)** and loss guard **before** **Start**.
4. **Start** polling (~15s flat, ~8s in trade). Paper entries fire automatically on signals.
5. **Clear paper trades** resets today’s session + archive if you need a clean day.
6. **Real option study** checks history with Upstox (up to ~31 days); not the same as today’s paper archive.

---

## 8. Paper vs live vault
- Paper: \`.data/nexus-pulse/trades/paper/YYYY-MM-DD.json\`
- Live vault path exists for when \`liveOrdersAllowed\` is enabled — **currently off**.

---

## 9. Admin note vault
This note is password-gated for admin. Reset via Gmail OTP if needed.

---

*Schema ${NEXUS_STRATEGY_NOTE_SCHEMA} — aligned with BOTS NexusPulse V2 + live ₹50 strike rule + ₹70 net cost.*
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
  void import('@/lib/nexus-pulse/nexus-cloud-store').then((m) => m.syncStrategyPackToCloud());
}

export async function loadNoteDoc(): Promise<NexusStrategyNoteDoc> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(dataPaths().note, 'utf8');
    const doc = JSON.parse(raw) as NexusStrategyNoteDoc;
    if ((doc.schemaVersion ?? 0) < NEXUS_STRATEGY_NOTE_SCHEMA) {
      const refreshed: NexusStrategyNoteDoc = {
        title: doc.title || 'NexusPulse Strategy Note',
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
      title: 'NexusPulse Strategy Note',
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
  void import('@/lib/nexus-pulse/nexus-cloud-store').then((m) => m.syncStrategyPackToCloud());
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
