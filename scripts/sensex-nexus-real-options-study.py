"""
One-off Sensex study: same Sector 7 A rules as NexusPulse Nifty real-option study.
Does NOT modify the app. Spot + ATM Sensex options via Upstox.
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, time as dtime
from pathlib import Path

import pandas as pd

BOT_SRC = Path(r"D:\BOTS\NexusPulse\bot\src")
sys.path.insert(0, str(BOT_SRC))

from nexus_bot.upstox_client import UpstoxClient  # noqa: E402
from nexus_bot.ut_bot import ut_bot  # noqa: E402

UNDERLYING = "BSE_INDEX|SENSEX"
STRIKE_STEP = 100
LOT = 20
ROUND_TRIP_COST = 70  # same cost model as Nifty study (1 lot)


@dataclass
class Trade:
    day: str
    option: str
    strike: float
    instrument_key: str
    side: int
    entry_time: str
    entry_spot: float
    exit_time: str
    exit_spot: float
    entry_prem: float
    exit_prem: float
    reason: str
    max_up: float
    pnl: float
    variant: str


def session_slice(df: pd.DataFrame) -> pd.DataFrame:
    x = df.copy()
    x["ts"] = pd.to_datetime(x["ts"])
    t = x["ts"].dt.time
    return x[(t >= dtime(9, 15)) & (t <= dtime(15, 29))].sort_values("ts").reset_index(drop=True)


def resample(df_1m: pd.DataFrame, minutes: int) -> pd.DataFrame:
    x = df_1m.set_index("ts").sort_index()
    o = x.resample(f"{minutes}min", label="left", closed="left").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    )
    return o.dropna(subset=["open"]).reset_index()


def entry_ok(tt: dtime, variant: str) -> bool:
    if tt >= dtime(15, 14):
        return False
    if variant == "current_bans":
        if tt < dtime(9, 30):
            return False
        if dtime(14, 0) <= tt < dtime(14, 45):
            return False
        return True
    if variant == "morning_open_stop_15":
        if tt >= dtime(15, 0):
            return False
        return True
    return False


def atm_strike(spot: float) -> float:
    return round(spot / STRIKE_STEP) * STRIKE_STEP


class OptionTape:
    def __init__(self, client: UpstoxClient) -> None:
        self.client = client
        self._expiries: list[date] | None = None
        self._contracts: dict[str, list[dict]] = {}
        self._live_by_expiry: dict[str, list[dict]] = {}
        self._closes: dict[tuple[str, str], pd.Series] = {}
        self.misses = 0
        self.fetches = 0

    def _all_expiries(self) -> list[date]:
        if self._expiries is None:
            expired = [date.fromisoformat(x) for x in self.client.expired_expiries(UNDERLYING)]
            live = self.client.option_contract_list(UNDERLYING)
            live_ex = sorted(
                {date.fromisoformat(str(c["expiry"])[:10]) for c in live if c.get("expiry")}
            )
            self._expiries = sorted(set(expired) | set(live_ex))
            time.sleep(0.15)
        return self._expiries

    def nearest_expiry(self, day: date) -> date | None:
        for e in self._all_expiries():
            if e >= day:
                return e
        return None

    def _contracts_for(self, expiry: date) -> list[dict]:
        key = expiry.isoformat()
        if key in self._contracts:
            return self._contracts[key]
        today = date.today()
        if expiry < today:
            rows = self.client.expired_option_contracts(UNDERLYING, key)
        else:
            if not self._live_by_expiry:
                live = self.client.option_contract_list(UNDERLYING)
                for c in live:
                    ek = str(c.get("expiry") or "")[:10]
                    self._live_by_expiry.setdefault(ek, []).append(c)
            rows = list(self._live_by_expiry.get(key) or [])
        self._contracts[key] = rows
        time.sleep(0.15)
        return rows

    def pick(self, day: date, spot: float, option: str) -> tuple[float, str] | None:
        expiry = self.nearest_expiry(day)
        if expiry is None:
            return None
        strike = atm_strike(spot)
        want = option.upper()
        best = None
        best_dist = 1e18
        for c in self._contracts_for(expiry):
            if str(c.get("instrument_type") or "").upper() != want:
                continue
            s = float(c.get("strike_price") or 0)
            dist = abs(s - strike)
            if dist < best_dist:
                best_dist = dist
                best = c
        if not best or best_dist > STRIKE_STEP:
            return None
        return float(best["strike_price"]), str(best["instrument_key"])

    def _load_closes(self, ik: str, day: date) -> pd.Series:
        cache_key = (ik, day.isoformat())
        if cache_key in self._closes:
            return self._closes[cache_key]
        self.fetches += 1
        try:
            if "|" in ik and ik.count("|") >= 2:
                df = self.client.expired_day_candles(ik, day)
            else:
                df = self.client.day_candles(ik, day, 1)
        except Exception:
            df = pd.DataFrame()
        time.sleep(0.2)
        if df.empty:
            s = pd.Series(dtype=float)
        else:
            x = df.copy()
            x["ts"] = pd.to_datetime(x["ts"])
            s = x.set_index("ts")["close"].sort_index().astype(float)
        self._closes[cache_key] = s
        return s

    def premium_at(self, ik: str, day: date, ts: pd.Timestamp) -> float | None:
        s = self._load_closes(ik, day)
        if s.empty:
            self.misses += 1
            return None
        ts = pd.Timestamp(ts)
        if ts.tzinfo is not None and s.index.tz is None:
            ts = ts.tz_localize(None)
        elif ts.tzinfo is None and s.index.tz is not None:
            ts = ts.tz_localize(s.index.tz)
        prior = s.loc[:ts]
        if prior.empty:
            self.misses += 1
            return None
        return float(prior.iloc[-1])


def backtest_day(
    df_1m: pd.DataFrame,
    variant: str,
    tape: OptionTape,
    lot: int = LOT,
) -> list[Trade]:
    if len(df_1m) < 80:
        return []
    df3 = ut_bot(resample(df_1m, 3), key_value=1.0, atr_period=10)
    df5 = ut_bot(resample(df_1m, 5), key_value=1.0, atr_period=14)
    df3 = df3.set_index(pd.to_datetime(df3["ts"]))
    df5 = df5.set_index(pd.to_datetime(df5["ts"]))

    trades: list[Trade] = []
    day_d = pd.Timestamp(df_1m.iloc[0]["ts"]).date()
    day = day_d.isoformat()
    open_side = 0
    open_opt = ""
    open_ik = ""
    open_strike = 0.0
    entry_spot = 0.0
    entry_prem = 0.0
    entry_ts = ""
    max_up = 0.0
    last_3m_ts = None

    for i in range(40, len(df_1m)):
        bar = df_1m.iloc[i]
        ts = pd.Timestamp(bar["ts"])
        spot = float(bar["close"])
        tt = ts.time()
        after = tt >= dtime(15, 14)

        i3 = df3.index[df3.index <= ts]
        i5 = df5.index[df5.index <= ts]
        if len(i3) < 2 or len(i5) < 2:
            continue
        r3 = df3.loc[i3[-1]]
        r5 = df5.loc[i5[-1]]
        t3 = i3[-1]
        buy3, sell3 = bool(r3["buy"]), bool(r3["sell"])
        pos5 = int(r5["pos"])

        def _close(reason: str, p: float) -> None:
            nonlocal open_side, open_opt, open_ik, open_strike, entry_spot, entry_prem, entry_ts, max_up
            trades.append(
                Trade(
                    day=day,
                    option=open_opt,
                    strike=open_strike,
                    instrument_key=open_ik,
                    side=open_side,
                    entry_time=entry_ts,
                    entry_spot=entry_spot,
                    exit_time=str(ts),
                    exit_spot=spot,
                    entry_prem=round(entry_prem, 2),
                    exit_prem=round(p, 2),
                    reason=reason,
                    max_up=round(max_up, 2),
                    pnl=round((p - entry_prem) * lot, 1),
                    variant=variant,
                )
            )
            open_side = 0
            open_opt = ""
            open_ik = ""
            open_strike = 0.0
            max_up = 0.0

        if open_side != 0:
            p = tape.premium_at(open_ik, day_d, ts)
            if p is None:
                p = entry_prem
            up = max(0.0, p - entry_prem)
            max_up = max(max_up, up)
            if max_up >= 12.0 and up < 0.5 * max_up:
                _close("trail_giveback", p)
                continue
            if after:
                _close("square_off_1514", p)
                continue
            if variant == "morning_open_stop_15" and tt >= dtime(15, 0):
                _close("stop_new_and_flat_from_15", p)
                continue
            if t3 != last_3m_ts:
                if open_side == 1 and sell3:
                    _close("UT_sell_3m", p)
                    last_3m_ts = t3
                elif open_side == -1 and buy3:
                    _close("UT_buy_3m", p)
                    last_3m_ts = t3
                elif open_side == 1 and pos5 == -1:
                    _close("5m_against", p)
                elif open_side == -1 and pos5 == 1:
                    _close("5m_against", p)

        if after or open_side != 0:
            continue
        if not entry_ok(tt, variant):
            continue
        if t3 == last_3m_ts:
            continue

        want = None
        side = 0
        if buy3 and pos5 == 1:
            want, side = "CE", 1
        elif sell3 and pos5 == -1:
            want, side = "PE", -1
        if not want:
            continue

        picked = tape.pick(day_d, spot, want)
        if not picked:
            continue
        strike, ik = picked
        prem = tape.premium_at(ik, day_d, ts)
        if prem is None or prem <= 0:
            continue

        open_side, open_opt = side, want
        open_ik, open_strike = ik, strike
        entry_spot, entry_prem = spot, float(prem)
        entry_ts, max_up = str(ts), 0.0
        last_3m_ts = t3

    if open_side != 0:
        bar = df_1m.iloc[-1]
        ts = pd.Timestamp(bar["ts"])
        spot = float(bar["close"])
        p = tape.premium_at(open_ik, day_d, ts) or entry_prem
        trades.append(
            Trade(
                day=day,
                option=open_opt,
                strike=open_strike,
                instrument_key=open_ik,
                side=open_side,
                entry_time=entry_ts,
                entry_spot=entry_spot,
                exit_time=str(ts),
                exit_spot=spot,
                entry_prem=round(entry_prem, 2),
                exit_prem=round(p, 2),
                reason="eod",
                max_up=round(max_up, 2),
                pnl=round((p - entry_prem) * lot, 1),
                variant=variant,
            )
        )
    return trades


def summarize(trades: list[Trade]) -> dict:
    if not trades:
        return {
            "n": 0,
            "wins": 0,
            "losses": 0,
            "win_rate": 0.0,
            "gross_pnl": 0.0,
            "net_pnl": 0.0,
            "max_dd": 0.0,
            "avg_entry_prem": 0.0,
            "green_days": 0,
            "red_days": 0,
        }
    pnls = [t.pnl for t in trades]
    wins = sum(1 for p in pnls if p > 0)
    losses = sum(1 for p in pnls if p <= 0)
    gross = float(sum(pnls))
    net = gross - ROUND_TRIP_COST * len(trades)
    eq = 0.0
    peak = 0.0
    max_dd = 0.0
    for p in pnls:
        eq += p
        peak = max(peak, eq)
        max_dd = min(max_dd, eq - peak)
    by_day: dict[str, float] = {}
    for t in trades:
        by_day[t.day] = by_day.get(t.day, 0.0) + t.pnl
    return {
        "n": len(trades),
        "wins": wins,
        "losses": losses,
        "win_rate": round(100.0 * wins / len(trades), 1),
        "gross_pnl": round(gross, 1),
        "net_pnl": round(net, 1),
        "max_dd": round(max_dd, 1),
        "avg_entry_prem": round(sum(t.entry_prem for t in trades) / len(trades), 1),
        "green_days": sum(1 for v in by_day.values() if v > 0),
        "red_days": sum(1 for v in by_day.values() if v <= 0),
    }


def weekdays(a: date, b: date) -> list[date]:
    out = []
    d = a
    while d <= b:
        if d.weekday() < 5:
            out.append(d)
        d += timedelta(days=1)
    return out


def main() -> None:
    token = os.getenv("UPSTOX_ACCESS_TOKEN", "").strip()
    if not token:
        raise SystemExit("UPSTOX_ACCESS_TOKEN missing")

    end = date(2026, 7, 28)
    start = end - timedelta(days=30)
    variants = ["current_bans", "morning_open_stop_15"]

    client = UpstoxClient(token, sandbox=False)
    tape = OptionTape(client)
    days = weekdays(start, end)

    print(f"SENSEX Sector7A real-options | {start} -> {end} | lot={LOT} | strike_step={STRIKE_STEP}")
    print(f"underlying={UNDERLYING} | sessions_planned={len(days)}")

    by_day: dict[str, pd.DataFrame] = {}
    for d in days:
        try:
            df = session_slice(client.day_candles(UNDERLYING, d, 1))
            if len(df) >= 80:
                by_day[d.isoformat()] = df
                print(f"  OK sensex {d} bars={len(df)}")
            else:
                print(f"  -- sensex {d} bars={len(df)}")
        except Exception as e:
            print(f"  !! sensex {d} {e}")
        time.sleep(0.12)

    report = {
        "generated_at": datetime.now().isoformat(),
        "underlying": UNDERLYING,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "lot_size": LOT,
        "strike_step": STRIKE_STEP,
        "round_trip_cost": ROUND_TRIP_COST,
        "premium_model": "REAL Upstox ATM Sensex option 1m close (expired + live FO)",
        "rules": "Same Sector 7 A as NexusPulse: UT 3m KV=1 ATR=10 + 5m agree ATR=14; trail MFE>=12 keep 50%; no premium SL",
        "sessions_with_data": len(by_day),
        "results": {},
        "option_fetches": 0,
        "option_misses": 0,
    }

    print("=" * 78)
    for v in variants:
        trades: list[Trade] = []
        for day, df in sorted(by_day.items()):
            trades.extend(backtest_day(df, v, tape, lot=LOT))
            print(f"  {v} {day} trades_so_far={len(trades)} fetches={tape.fetches} misses={tape.misses}")
        s = summarize(trades)
        report["results"][v] = {"summary": s, "trades": [asdict(t) for t in trades]}
        print(
            f"{v:28s}  n={s['n']:3d}  {s['wins']}W/{s['losses']}L  "
            f"win%={s['win_rate']:5.1f}  gross={s['gross_pnl']:9.1f}  "
            f"net={s['net_pnl']:9.1f}  DD={s['max_dd']:8.1f}  "
            f"avgPrem={s['avg_entry_prem']:6.1f}  {s['green_days']}G/{s['red_days']}R"
        )

    report["option_fetches"] = tape.fetches
    report["option_misses"] = tape.misses
    a = report["results"]["current_bans"]["summary"]["net_pnl"]
    b = report["results"]["morning_open_stop_15"]["summary"]["net_pnl"]
    report["winner_by_net_pnl"] = (
        "morning_open_stop_15" if b > a else "current_bans" if a > b else "tie"
    )

    out_dir = Path(r"D:\JOBIN\TrademindPro\.data")
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"sensex-nexus-real-options-{start}_{end}.json"
    out.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print("=" * 78)
    print("WINNER:", report["winner_by_net_pnl"])
    print("Saved:", out)


if __name__ == "__main__":
    main()
