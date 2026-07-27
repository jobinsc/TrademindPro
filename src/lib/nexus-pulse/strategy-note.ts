/**
 * NexusPulse strategy note vault — admin-only, password-gated note storage.
 * File-backed under `.data/` so it survives restarts (ready to sync to DB later).
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');
const VAULT_PATH = path.join(DATA_DIR, 'nexus-pulse-strategy-vault.json');
const NOTE_PATH = path.join(DATA_DIR, 'nexus-pulse-strategy-note.json');
const OTP_DEBUG_PATH = path.join(DATA_DIR, 'nexus-pulse-note-otp-last.json');

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
};

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
NexusPulse is a **separate** Nifty 50 options paper (and future live) desk.
It does **not** share logic with PinaxForge, Blink, ATM Lab, Nejoic, or Jimbo.

**Instrument:** Nifty options only (buy premium — CE or PE).
**Style:** Systematic UT Bot timing + dual session lanes.
**Lot:** 1 lot (Nifty lot size 65).
**Cost awareness:** round-trip cost is real (desk model ~₹160; reports may use ₹70 for study).

Display name for the 5m UT exit: **Sector 7 A** (internal code still \`UT_5M\`).

---

## 2. Ground / foundation for taking a trade
A trade is allowed only when **all** of the following are true:

1. **Market is open for entries** after **09:15 IST**.
2. A **new 3-minute UT Bot edge** appears (fresh Buy or Sell on the closed 3m bar — not a stale signal).
3. **5-minute UT direction agrees:**
   - 3m Buy + 5m pos = long → **buy ATM CE**
   - 3m Sell + 5m pos = short → **buy ATM PE**
4. The **lane window** allows new entries (see Lane A / Lane B below).
5. We buy **liquid front-week** ATM-ish CE/PE (premium long only — never short premium in this desk).

If 3m fires but 5m does not agree → **no trade**.
If the edge is not new (same bar already used) → **no trade**.

---

## 3. Indicator setup (UT Bot — your Pine)
Port of TradingView **UT Bot Alerts**:

| Timeframe | Key Value | ATR Period | Role |
|-----------|-----------|------------|------|
| **3m** | 1 | 10 | Entry trigger (Buy / Sell labels) |
| **5m** | 1 | 14 | Direction filter (pos long / short) |

Logic summary:
- ATR trailing stop with key × ATR.
- Buy when price is above trail and EMA(1) crosses above trail.
- Sell when price is below trail and trail crosses above EMA(1).
- Position state (\`pos\`) stays long or short until opposite cross.

We resample **1m Upstox candles** into 3m and 5m locally.

---

## 4. Two lanes (kept separate — never merge P&L as one trade)
Both lanes can take the **same signal** as **separate paper trades**.

### Lane A — Current bans (\`current_bans\`)
- Entries from 09:15 IST, but **no new entries 09:15–09:30**.
- **No new entries 14:00–14:45**.
- Square-off all remaining at **15:14 IST**.

### Lane B — Morning open / stop 15:00 (\`morning_open_stop_15\`)
- Entries from **09:15 IST**.
- From **15:00 IST**: no new entries + **force flat**.
- Square-off residual at **15:14 IST**.

Review each lane separately (wins, losses, High/Low, time taken).

---

## 5. Risk & management rules
- **Mandatory stop loss** at entry: ~20% of entry premium (min ~₹8 premium pts).
- **Trail:** after MFE ≥ **12** premium pts, exit if open profit falls below **50% of MFE**.
- **Exit on opposite 3m UT** (CE exits on 3m Sell; PE exits on 3m Buy).
- **Exit on Sector 7 A (5m flip against you):** CE exits if 5m pos turns short; PE if 5m turns long.
- Track **High / Low** of option premium after entry until close (any exit reason).
- Record **Opened / Closed / Time taken (HH:MM)** for every trade.

---

## 6. How a pro uses this desk (discipline)
1. Bias from Nifty structure first (study) — UT is the **trigger**, not a license to overtrade.
2. Run **one live agent** at a time to avoid Upstox 429 rate limits.
3. After any exit: pause, re-check 3m/5m alignment — no revenge flip every candle.
4. Respect cost: small noise moves often lose after brokerage.
5. Keep paper archive by **date** and keep lanes separate in review.

---

## 7. Paper vs Live
- **Paper vault:** every closed paper trade is archived under \`.data/nexus-pulse/trades/paper/YYYY-MM-DD.json\`.
- **Live vault:** same shape under \`.data/nexus-pulse/trades/live/\` — ready when live orders are enabled.
- Live orders stay **off** until explicitly approved (\`liveOrdersAllowed\` flag).

---

## 8. What this note is for
This document is the **single source of truth** for why NexusPulse enters, manages, and exits.
Only **admin** can open it, and only after the **extra note password**.
If the password is forgotten, admin can reset via **OTP to Gmail**.

---

*Last scaffolded for NexusPulse UT dual-lane desk. Update this note whenever rules change.*
`;
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadVault(): Promise<NexusStrategyVault> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(VAULT_PATH, 'utf8');
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
  await fs.writeFile(VAULT_PATH, JSON.stringify(next, null, 2), 'utf8');
  void import('@/lib/nexus-pulse/nexus-cloud-store').then((m) => m.syncStrategyPackToCloud());
}

export async function loadNoteDoc(): Promise<NexusStrategyNoteDoc> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(NOTE_PATH, 'utf8');
    return JSON.parse(raw) as NexusStrategyNoteDoc;
  } catch {
    const doc: NexusStrategyNoteDoc = {
      title: 'NexusPulse Strategy Note',
      updatedAt: new Date().toISOString(),
      bodyMarkdown: defaultStrategyNoteMarkdown(),
    };
    await saveNoteDoc(doc);
    return doc;
  }
}

export async function saveNoteDoc(doc: NexusStrategyNoteDoc): Promise<void> {
  await ensureDataDir();
  const next = { ...doc, updatedAt: new Date().toISOString() };
  await fs.writeFile(NOTE_PATH, JSON.stringify(next, null, 2), 'utf8');
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
    OTP_DEBUG_PATH,
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
    await fs.unlink(OTP_DEBUG_PATH);
  } catch {
    // ignore
  }
}
