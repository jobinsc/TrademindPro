#!/usr/bin/env python3
"""
Generate SEPARATE mobile-friendly PDF reports (do not merge):
  1. NexusPulse-Mobile-Report-{date}.pdf
  2. PinaxForge-Mobile-Report-{date}.pdf
  3. ATM-Lab-Mobile-Report-{date}.pdf
  4. Pro-Trader-Improvement-Report-{date}.pdf

Brokerage assumption for net calc in these PDFs: ₹70 per 1-lot round trip
(user-requested report cost — may differ from live agent cost model).
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / ".data"
OUT = DATA / "reports"
BROKERAGE_PER_LOT = 70.0  # ₹70 / one-lot round trip (report assumption)
IST = timezone(timedelta(hours=5, minutes=30))

# Readable on phone (portrait A5-ish), not ultra-narrow
PAGE_W, PAGE_H = 148, 210  # mm — A5


def ist_now_date() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")


def to_ist(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(IST)
        return dt.strftime("%d %b %H:%M")
    except Exception:
        return iso[:16]


def dur_hhmm(opened_iso: str | None, closed_iso: str | None) -> str:
    if not opened_iso or not closed_iso:
        return "—"


def exit_reason_label(reason: object | None) -> str:
    if reason == 'UT_5M':
        return 'Sector 7 A'
    if reason is None:
        return '—'
    return str(reason)
    try:
        start = datetime.fromisoformat(opened_iso.replace("Z", "+00:00")).astimezone(IST)
        end = datetime.fromisoformat(closed_iso.replace("Z", "+00:00")).astimezone(IST)
        if end < start:
            return "—"
        total_seconds = int((end - start).total_seconds())
        total_min = total_seconds // 60
        hh = total_min // 60
        mm = total_min % 60
        return f"{hh:02d}:{mm:02d}"
    except Exception:
        return "—"


def money(n: float | None) -> str:
    if n is None:
        return "-"
    sign = "+" if n > 0 else ""
    return f"{sign}Rs{n:,.0f}"


def pts(n: float | None) -> str:
    if n is None:
        return "-"
    return f"{n:+.2f}"


def safe(s: object) -> str:
    text = str(s if s is not None else "-")
    text = (
        text.replace("\u20b9", "Rs")
        .replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2192", "->")
        .replace("\u00b7", "|")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )
    return text.encode("latin-1", "replace").decode("latin-1")


class MobilePDF(FPDF):
    def __init__(self, title: str, subtitle: str):
        super().__init__(orientation="P", unit="mm", format=(PAGE_W, PAGE_H))
        self._title = title
        self._subtitle = subtitle
        self.set_auto_page_break(auto=True, margin=14)
        self.set_margins(10, 12, 10)

    def header(self):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(15, 40, 70)
        self.multi_cell(self.epw, 6, safe(self._title))
        self.set_font("Helvetica", "", 8)
        self.set_text_color(90, 110, 130)
        self.multi_cell(self.epw, 4, safe(self._subtitle))
        self.set_draw_color(200, 220, 235)
        y = self.get_y() + 1
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(140, 150, 160)
        self.cell(
            self.epw,
            4,
            f"Page {self.page_no()} | Separate report | Brokerage Rs {BROKERAGE_PER_LOT:.0f}/lot",
            align="C",
        )

    def section(self, text: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(20, 55, 95)
        self.multi_cell(self.epw, 5, safe(text))
        self.ln(1)

    def para(self, text: str, bold: bool = False):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B" if bold else "", 8)
        self.set_text_color(30, 40, 50)
        self.multi_cell(self.epw, 4.2, safe(text))
        self.ln(0.5)

    def bullet(self, text: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(30, 40, 50)
        self.multi_cell(self.epw, 4.2, safe(f"- {text}"))

    def kv(self, label: str, value: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(30, 40, 50)
        self.multi_cell(self.epw, 4.5, safe(f"{label}:  {value}"))

    def card_trade(self, lines: list[str], win: bool | None = None):
        if win is True:
            self.set_fill_color(232, 248, 239)
        elif win is False:
            self.set_fill_color(252, 236, 236)
        else:
            self.set_fill_color(245, 248, 252)
        self.set_x(self.l_margin)
        x = self.l_margin
        y = self.get_y()
        box_h = 3 + len(lines) * 4.0
        if y + box_h > self.h - 16:
            self.add_page()
            y = self.get_y()
        self.rect(x, y, self.epw, box_h, style="F")
        cy = y + 1.5
        for i, line in enumerate(lines):
            self.set_xy(x + 2, cy)
            self.set_font("Helvetica", "B" if i == 0 else "", 7.5 if i else 7)
            self.set_text_color(20, 40, 60)
            self.cell(self.epw - 4, 3.8, safe(line)[:110])
            cy += 3.8
        self.set_y(y + box_h + 2)
        self.set_x(self.l_margin)

def output_pdf_safe(pdf: FPDF, out: Path) -> Path:
    """
    Write PDF, but if the file is locked (opened in viewer), fall back to a new name.
    """
    try:
        pdf.output(str(out))
        return out
    except PermissionError:
        out2 = out.with_name(out.stem + "-updated" + out.suffix)
        pdf.output(str(out2))
        return out2


def net_after_brokerage(gross: float, lots: float = 1.0) -> float:
    return gross - BROKERAGE_PER_LOT * lots


def load_json(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def nexus_trades() -> list[dict]:
    rows = []
    for p in sorted(DATA.glob("nexus-pulse-session-*.json")):
        s = load_json(p)
        if not s:
            continue
        date = s.get("sessionDate") or p.stem[-10:]
        for t in s.get("closedTrades") or []:
            rows.append({**t, "_date": date, "_status": "closed"})
        for t in s.get("openTrades") or []:
            rows.append({**t, "_date": date, "_status": "open"})
    return rows


def pinax_trades() -> list[dict]:
    rows = []
    for p in sorted(DATA.glob("pinax-forge-session-*.json")):
        s = load_json(p)
        if not s:
            continue
        date = s.get("sessionDate") or p.stem[-10:]
        for t in s.get("closedTrades") or []:
            rows.append({**t, "_date": date, "_status": "closed"})
        for t in s.get("openTrades") or []:
            rows.append({**t, "_date": date, "_status": "open"})
    return rows


def atm_days() -> list[dict]:
    cached = DATA / "_report_atm_extract.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    return []


def build_nexus(date: str) -> Path:
    trades = nexus_trades()
    closed = [t for t in trades if t.get("_status") == "closed"]
    open_t = [t for t in trades if t.get("_status") == "open"]

    pdf = MobilePDF(
        "NexusPulse Report",
        f"UT dual-lane paper  |  Mobile  |  {date}",
    )
    pdf.add_page()
    pdf.section("1. What this agent is")
    pdf.para(
        "NexusPulse is a SEPARATE Nifty options paper agent. "
        "It uses Sector 7 A on 3m for entries and 5m as direction filter, "
        "with two lanes (current_bans + morning_open_stop_15)."
    )
    pdf.para(
        f"Report cost model: Rs {BROKERAGE_PER_LOT:.0f} brokerage/charges per 1-lot round trip "
        "(replaces agent internal cost for THIS PDF only)."
    )

    pdf.section("2. Summary")
    laneA_id = "current_bans"
    laneB_id = "morning_open_stop_15"
    laneA_closed = [t for t in closed if t.get("laneId") == laneA_id]
    laneB_closed = [t for t in closed if t.get("laneId") == laneB_id]

    def lane_totals(rows: list[dict]) -> tuple[float, float, int, int]:
        g_sum = 0.0
        n_sum = 0.0
        wins_ = 0
        losses_ = 0
        for t in rows:
            entry = float(t.get("entryPremium") or 0)
            exit_p = float(t.get("exitPremium") or entry)
            lot = float(t.get("lotSize") or 65)
            qty = float(t.get("qty") or 1)
            gross = (exit_p - entry) * qty * lot
            net70 = net_after_brokerage(gross, qty)
            g_sum += gross
            n_sum += net70
            if net70 >= 0:
                wins_ += 1
            else:
                losses_ += 1
        return g_sum, n_sum, wins_, losses_

    gA, nA, wA, lA = lane_totals(laneA_closed)
    gB, nB, wB, lB = lane_totals(laneB_closed)

    pdf.kv("Lane A closed", str(len(laneA_closed)))
    pdf.kv(f"Lane A Wins/Loss (Rs{BROKERAGE_PER_LOT:.0f})", f"{wA} / {lA}")
    pdf.kv("Lane A Gross P&L", money(gA))
    pdf.kv("Lane A Net after Rs70/lot", money(nA))

    pdf.kv("Lane B closed", str(len(laneB_closed)))
    pdf.kv(f"Lane B Wins/Loss (Rs{BROKERAGE_PER_LOT:.0f})", f"{wB} / {lB}")
    pdf.kv("Lane B Gross P&L", money(gB))
    pdf.kv("Lane B Net after Rs70/lot", money(nB))

    pdf.kv("Open positions (both lanes)", str(len(open_t)))

    pdf.section("3. Lane A trades (current_bans)")
    if not laneA_closed:
        pdf.para("No closed Lane A trades in saved sessions.")
    for i, t in enumerate(laneA_closed, 1):
        entry = float(t.get("entryPremium") or 0)
        exit_p = float(t.get("exitPremium") or entry)
        lot = float(t.get("lotSize") or 65)
        qty = float(t.get("qty") or 1)
        gross = (exit_p - entry) * qty * lot
        net70 = net_after_brokerage(gross, qty)
        high = t.get("highPremium")
        if high is None:
            high = entry + float(t.get("maxFavorablePts") or 0)
        low = t.get("lowPremium")
        if low is None:
            low = entry - float(t.get("maxAdversePts") or 0)
        pdf.card_trade(
            [
                f"#{i} {t.get('_date')}  {t.get('side')} {t.get('strike')}  [{t.get('laneId')}]",
                f"{safe(t.get('tradingSymbol'))}",
                f"In {to_ist(t.get('openedAt'))}  Out {to_ist(t.get('closedAt'))}  {exit_reason_label(t.get('exitReason'))}",
                f"Taken {dur_hhmm(t.get('openedAt'), t.get('closedAt'))}",
                f"Entry Rs{entry:.2f}  Exit Rs{exit_p:.2f}  High Rs{float(high):.2f}  Low Rs{float(low):.2f}",
                f"Up {pts(float(t.get('maxFavorablePts') or 0))} pts  Down {pts(-float(t.get('maxAdversePts') or 0))} pts",
                f"Gross {money(gross)}  Brokerage -Rs{BROKERAGE_PER_LOT*qty:.0f}  Net {money(net70)}",
            ],
            win=net70 >= 0,
        )

    pdf.section("4. Lane B trades (morning_open_stop_15)")
    if not laneB_closed:
        pdf.para("No closed Lane B trades in saved sessions.")
    for i, t in enumerate(laneB_closed, 1):
        entry = float(t.get("entryPremium") or 0)
        exit_p = float(t.get("exitPremium") or entry)
        lot = float(t.get("lotSize") or 65)
        qty = float(t.get("qty") or 1)
        gross = (exit_p - entry) * qty * lot
        net70 = net_after_brokerage(gross, qty)
        high = t.get("highPremium")
        if high is None:
            high = entry + float(t.get("maxFavorablePts") or 0)
        low = t.get("lowPremium")
        if low is None:
            low = entry - float(t.get("maxAdversePts") or 0)
        pdf.card_trade(
            [
                f"#{i} {t.get('_date')}  {t.get('side')} {t.get('strike')}  [{t.get('laneId')}]",
                f"{safe(t.get('tradingSymbol'))}",
                f"In {to_ist(t.get('openedAt'))}  Out {to_ist(t.get('closedAt'))}  {exit_reason_label(t.get('exitReason'))}",
                f"Taken {dur_hhmm(t.get('openedAt'), t.get('closedAt'))}",
                f"Entry Rs{entry:.2f}  Exit Rs{exit_p:.2f}  High Rs{float(high):.2f}  Low Rs{float(low):.2f}",
                f"Up {pts(float(t.get('maxFavorablePts') or 0))} pts  Down {pts(-float(t.get('maxAdversePts') or 0))} pts",
                f"Gross {money(gross)}  Brokerage -Rs{BROKERAGE_PER_LOT*qty:.0f}  Net {money(net70)}",
            ],
            win=net70 >= 0,
        )

    if open_t:
        pdf.section("5. Open positions (separate lanes)")
        laneA_open = [t for t in open_t if t.get("laneId") == laneA_id]
        laneB_open = [t for t in open_t if t.get("laneId") == laneB_id]
        if laneA_open:
            pdf.para("Lane A open:", bold=True)
            for t in laneA_open:
                mark = float(t.get("markPremium") or t.get("entryPremium") or 0)
                entry = float(t.get("entryPremium") or 0)
                lot = float(t.get("lotSize") or 65)
                qty = float(t.get("qty") or 1)
                gross = (mark - entry) * qty * lot
                pdf.card_trade(
                    [
                        f"OPEN {t.get('side')} {t.get('strike')} [{t.get('laneId')}]",
                            f"Opened {to_ist(t.get('openedAt'))}",
                        f"Entry Rs{entry:.2f} Mark Rs{mark:.2f}  Unrealized gross {money(gross)}",
                    ],
                    win=None,
                )
        if laneB_open:
            pdf.para("Lane B open:", bold=True)
            for t in laneB_open:
                mark = float(t.get("markPremium") or t.get("entryPremium") or 0)
                entry = float(t.get("entryPremium") or 0)
                lot = float(t.get("lotSize") or 65)
                qty = float(t.get("qty") or 1)
                gross = (mark - entry) * qty * lot
                pdf.card_trade(
                    [
                        f"OPEN {t.get('side')} {t.get('strike')} [{t.get('laneId')}]",
                            f"Opened {to_ist(t.get('openedAt'))}",
                        f"Entry Rs{entry:.2f} Mark Rs{mark:.2f}  Unrealized gross {money(gross)}",
                    ],
                    win=None,
                )

    pdf.add_page()
    pdf.section("6. Suggestions (NexusPulse only)")
    pdf.bullet("Dual lanes often take the SAME signal twice — treat one lane as live and one as study, or size half each, so you do not double-lose on the same bad UT edge.")
    pdf.bullet("First CE pair today gave tiny MFE (+3.65) then large MAE (−16.9) and Sector 7 A exit — wait for 5m confirmation to hold, or tighten early invalidation when MFE stays under ~5 pts.")
    pdf.bullet("Trail exits that stayed green (TRAIL) worked better than late Sector 7 A on losers — keep trail; do not disable it to 'let it run' without structure.")
    pdf.bullet("Big winner CE (+49 MFE) proves UT catch of a real impulse — protect those with trail keep fraction; do not exit early on noise.")
    pdf.bullet(f"With Rs{BROKERAGE_PER_LOT:.0f}/lot, need roughly >Rs{BROKERAGE_PER_LOT/65:.1f} premium pts per lot just to break even — skip micro scalp UT flips.")
    pdf.bullet("429 / REST pressure: run NexusPulse alone when trading live tape; stop ATM Lab polling while Nexus is in a position.")
    pdf.bullet("Next upgrade: option LTP via WebSocket (like Pinax) so High/Low path is tick-true, not poll-sampled.")

    pdf.section("7. Bottom line")
    pdf.para(
        f"NexusPulse (separate lanes). Lane A closed {len(laneA_closed)} papers -> Net@Rs{BROKERAGE_PER_LOT:.0f}/lot {money(nA)}. "
        f"Lane B closed {len(laneB_closed)} papers -> Net@Rs{BROKERAGE_PER_LOT:.0f}/lot {money(nB)}. "
        "Keep this agent separate — its edge is UT timing, not Pinax setup scanning."
    )

    out = OUT / f"NexusPulse-Mobile-Report-{date}.pdf"
    return output_pdf_safe(pdf, out)


def build_pinax(date: str) -> Path:
    trades = pinax_trades()
    closed = [t for t in trades if t.get("_status") == "closed"]
    open_t = [t for t in trades if t.get("_status") == "open"]

    pdf = MobilePDF(
        "PinaxForge Report",
        f"Setup desk paper  |  Mobile  |  {date}",
    )
    pdf.add_page()
    pdf.section("1. What this agent is")
    pdf.para(
        "PinaxForge is a SEPARATE selective paper desk: study S/R + bias, take high-quality "
        "option setups, mandatory SL, RR targets, adverse/time exits. Not Sector 7 A."
    )
    pdf.para(
        f"Report cost model: Rs {BROKERAGE_PER_LOT:.0f} per 1-lot round trip for THIS PDF."
    )

    # by day
    by_day: dict[str, list] = {}
    for t in closed:
        by_day.setdefault(t.get("_date") or "?", []).append(t)

    pdf.section("2. Multi-day summary")
    gross_sum = net70_sum = 0.0
    wins = losses = 0
    for t in closed:
        entry = float(t.get("entryPremium") or 0)
        exit_p = float(t.get("exitPremium") or entry)
        lot = float(t.get("lotSize") or 65)
        qty = float(t.get("qty") or 1)
        gross = float(t["grossPnl"]) if t.get("grossPnl") is not None else (exit_p - entry) * qty * lot
        net70 = net_after_brokerage(gross, qty)
        gross_sum += gross
        net70_sum += net70
        if net70 >= 0:
            wins += 1
        else:
            losses += 1

    pdf.kv("Days with sessions", str(len(by_day)))
    pdf.kv("Closed trades", str(len(closed)))
    pdf.kv("Open now", str(len(open_t)))
    pdf.kv("Wins / Losses (after Rs70)", f"{wins} / {losses}")
    pdf.kv("Gross P&L", money(gross_sum))
    pdf.kv(f"Net after Rs{BROKERAGE_PER_LOT:.0f}/lot", money(net70_sum))

    pdf.section("3. Day-wise net (@ Rs70)")
    for d in sorted(by_day):
        g = n = 0.0
        for t in by_day[d]:
            entry = float(t.get("entryPremium") or 0)
            exit_p = float(t.get("exitPremium") or entry)
            lot = float(t.get("lotSize") or 65)
            qty = float(t.get("qty") or 1)
            gross = float(t["grossPnl"]) if t.get("grossPnl") is not None else (exit_p - entry) * qty * lot
            g += gross
            n += net_after_brokerage(gross, qty)
        pdf.para(f"{d}: {len(by_day[d])} trades | Gross {money(g)} | Net@70 {money(n)}", bold=True)

    pdf.section("4. Every closed trade")
    for i, t in enumerate(closed, 1):
        entry = float(t.get("entryPremium") or 0)
        exit_p = float(t.get("exitPremium") or entry)
        lot = float(t.get("lotSize") or 65)
        qty = float(t.get("qty") or 1)
        gross = float(t["grossPnl"]) if t.get("grossPnl") is not None else (exit_p - entry) * qty * lot
        net70 = net_after_brokerage(gross, qty)
        high = t.get("highPremium")
        if high is None and t.get("maxFavorablePts") is not None:
            high = entry + float(t.get("maxFavorablePts") or 0)
        low = t.get("lowPremium")
        if low is None and t.get("maxAdversePts") is not None:
            low = entry - float(t.get("maxAdversePts") or 0)
        hi_s = f"Rs{float(high):.2f}" if high is not None else "n/a"
        lo_s = f"Rs{float(low):.2f}" if low is not None else "n/a"
        mfe = t.get("maxFavorablePts")
        mae = t.get("maxAdversePts")
        pdf.card_trade(
            [
                f"#{i} {t.get('_date')}  {t.get('side')} {t.get('strike')}  {t.get('exitReason')}",
                f"{safe(t.get('tradingSymbol') or '')}",
                f"In {to_ist(t.get('openedAt'))}  Out {to_ist(t.get('closedAt'))}",
                f"Taken {dur_hhmm(t.get('openedAt'), t.get('closedAt'))}",
                f"Entry Rs{entry:.2f}  Exit Rs{exit_p:.2f}  High {hi_s}  Low {lo_s}",
                f"Up {pts(float(mfe)) if mfe is not None else 'n/a'}  Down {pts(-float(mae)) if mae is not None else 'n/a'}",
                f"Gross {money(gross)}  Brk -Rs{BROKERAGE_PER_LOT*qty:.0f}  Net {money(net70)}",
            ],
            win=net70 >= 0,
        )

    if open_t:
        pdf.section("5. Open")
        for t in open_t:
            entry = float(t.get("entryPremium") or 0)
            mark = float(t.get("markPremium") or entry)
            lot = float(t.get("lotSize") or 65)
            qty = float(t.get("qty") or 1)
            gross = (mark - entry) * qty * lot
            pdf.card_trade(
                [
                    f"OPEN {t.get('_date')} {t.get('side')} {t.get('strike')}",
                        f"Opened {to_ist(t.get('openedAt'))}",
                    f"Entry Rs{entry:.2f} Mark Rs{mark:.2f} unrealized {money(gross)}",
                ]
            )

    pdf.add_page()
    pdf.section("6. Suggestions (PinaxForge only)")
    pdf.bullet("Jul 23–24 had many SL/ADVERSE/TIME losers — quality filter must stay strict; do not revenge-enter after SL.")
    pdf.bullet("TARGET hits (e.g. PE Jul 23, CE Jul 24/27) show the desk CAN bank RR when setup + follow-through align — protect that process.")
    pdf.bullet("TIME exit with 0 MFE (ghost / flat mark) wastes a slot — keep 9:15 gate + today-only setups; never carry yesterday bars.")
    pdf.bullet("ADVERSE exits with tiny MFE mean entry timing was late or bias wrong — wait for Nifty move confirmation before option fill.")
    pdf.bullet(f"Rs{BROKERAGE_PER_LOT:.0f}/lot means a +10 pt option move is only ~Rs{10*65 - BROKERAGE_PER_LOT:.0f} net — aim for real RR, not micro scalp.")
    pdf.bullet("Keep one position at a time; after exit use cooldown — churning through cost is the enemy.")
    pdf.bullet("Use High/Low path on every close to judge if SL was fair or if you gave back a winner.")

    pdf.section("7. Bottom line")
    pdf.para(
        f"PinaxForge closed {len(closed)} papers across days. Gross {money(gross_sum)}. "
        f"Net @ Rs{BROKERAGE_PER_LOT:.0f}/lot {money(net70_sum)}. "
        "Keep this agent separate — it is analysis + selective setup, not UT auto-flip."
    )

    out = OUT / f"PinaxForge-Mobile-Report-{date}.pdf"
    return output_pdf_safe(pdf, out)


def build_atm(date: str) -> Path:
    days = atm_days()
    pdf = MobilePDF(
        "ATM Lab Report",
        f"Observation tape (no paper fills)  |  Mobile  |  {date}",
    )
    pdf.add_page()
    pdf.section("1. What this agent is")
    pdf.para(
        "ATM Lab (Blink ATM movement) is OBSERVATION ONLY. It locks Nifty + ATM CE/PE "
        "and samples live premiums. It does not place paper buys/sells. This report is "
        "therefore a market-watch / opportunity report — not a P&L trade blotter."
    )
    pdf.para(
        f"If you HAD traded 1 lot on the best CE or PE excursion of a day, "
        f"illustrative brokerage in this PDF is Rs {BROKERAGE_PER_LOT:.0f}/round trip."
    )

    pdf.section("2. Days covered")
    pdf.kv("Session days", str(len(days)))
    pdf.kv("Total samples", str(sum(d.get("samples", 0) for d in days)))

    pdf.section("3. Day-by-day tape summary")
    for d in days:
        rng = float(d.get("range") or 0)
        ce_up = float(d.get("maxCe") or 0) - float(d.get("openCe") or 0)
        pe_up = float(d.get("maxPe") or 0) - float(d.get("openPe") or 0)
        # illustrative capture if bought open and sold max (naive)
        ce_gross = ce_up * 65
        pe_gross = pe_up * 65
        ce_net = net_after_brokerage(ce_gross, 1)
        pe_net = net_after_brokerage(pe_gross, 1)
        pdf.card_trade(
            [
                f"{d.get('date')}  ATM strike ~{d.get('strike')}  samples {d.get('samples')}",
                f"Nifty {d.get('openN'):.1f} -> {d.get('closeN'):.1f}  range {rng:.1f} pts  (low {d.get('minN'):.1f} / high {d.get('maxN'):.1f})",
                f"CE open {d.get('openCe')} high {d.get('maxCe')} low {d.get('minCe')} close {d.get('closeCe')}",
                f"PE open {d.get('openPe')} high {d.get('maxPe')} low {d.get('minPe')} close {d.get('closePe')}",
                f"Naive open->max CE pts {ce_up:.1f}  gross {money(ce_gross)} net@70 {money(ce_net)}",
                f"Naive open->max PE pts {pe_up:.1f}  gross {money(pe_gross)} net@70 {money(pe_net)}",
            ],
            win=max(ce_net, pe_net) >= 0,
        )

    pdf.add_page()
    pdf.section("4. What the tape taught (ATM Lab only)")
    pdf.bullet("Every saved day showed a real Nifty range (roughly 60–220 pts). Options always moved enough for a selective trade AFTER cost.")
    pdf.bullet("Jul 27: CE open->high ~+64 pts while PE bled — classic bullish session; CE was the money side.")
    pdf.bullet("Jul 24: large Nifty range (~216) with both sides swinging — chop risk; need bias filter before ATM buy.")
    pdf.bullet("Jul 23: CE decayed from open while PE had upside — sell-side day; PE opportunities existed.")
    pdf.bullet("Locked ATM strike at init can drift from true ATM as spot moves — watch strike relevance mid-session.")
    pdf.bullet("High sample count proves the feed works; do NOT run ATM Lab polling while Nexus/Pinax need Upstox quota.")

    pdf.section("5. Suggestions (ATM Lab only)")
    pdf.bullet("Use ATM Lab as a TEACHER / recorder, not as auto-trader.")
    pdf.bullet("For live money later: pick ONE side after first 15–30 min structure, not both CE and PE.")
    pdf.bullet(f"With Rs{BROKERAGE_PER_LOT:.0f}/lot, ignore <~3–4 premium pts noise; hunt 10+ pt captures with SL.")
    pdf.bullet("Mark session High/Low of CE and PE from open — same discipline we added to paper agents.")
    pdf.bullet("Stop Lab when another agent is live-trading to avoid Upstox 429.")

    pdf.section("6. Bottom line")
    pdf.para(
        "ATM Lab proves daily opportunity exists in Nifty ATM options. "
        "It should stay a separate observation lab — do not merge it into Pinax or Nexus execution."
    )

    out = OUT / f"ATM-Lab-Mobile-Report-{date}.pdf"
    return output_pdf_safe(pdf, out)


def build_improvement(date: str) -> Path:
    pdf = MobilePDF(
        "Pro Trader Improvement",
        f"How to improve (SEPARATE brief)  |  {date}",
    )
    pdf.add_page()
    pdf.section("Verdict first")
    pdf.para(
        "KEEP THE THREE AGENTS SEPARATE. Do NOT merge NexusPulse + PinaxForge + ATM Lab "
        "into one auto-bot. Merge the DISCIPLINE and the CHECKLIST in YOUR head (and a thin "
        "shared risk layer), not the signal engines.",
        bold=True,
    )

    pdf.section("Why not merge engines")
    pdf.bullet("ATM Lab = watch / record ATM tape (no fills).")
    pdf.bullet("PinaxForge = human-style analysis desk: S/R, bias, selective setup, SL + RR.")
    pdf.bullet("NexusPulse = systematic Sector 7 A dual-lane timing.")
    pdf.bullet("Merging signals causes overtrading, conflicting exits, and Upstox 429 storms.")
    pdf.bullet("Pros run multiple playbooks on one book — they do not mash indicators into one noisy trigger.")

    pdf.section("What a pro does (from these days)")
    pdf.bullet("Only trade after 9:15 IST live bars — never yesterday setups.")
    pdf.bullet("Decide bias first (from Nifty structure), THEN pick CE or PE — never both blindly.")
    pdf.bullet("One clear reason to enter; mandatory SL; know High/Low while in trade.")
    pdf.bullet("Respect cost: at Rs70/lot you still need real points; at Rs160 even more.")
    pdf.bullet("After exit: pause, re-analyse — no revenge flip every candle.")
    pdf.bullet("When rate-limited: one live agent only.")

    pdf.section("How to combine techniques WITHOUT merging agents")
    pdf.para("Use a morning checklist that borrows from all three:")
    pdf.bullet("ATM Lab mindset: know today's ATM CE/PE open and live range.")
    pdf.bullet("Pinax mindset: mark bias, PDH/PDL / S/R, only take A+ setups.")
    pdf.bullet("Nexus mindset: if you use UT, require 3m entry + 5m agreement; trail winners.")
    pdf.para(
        "Practical rule: pick ONE execution agent per session (Pinax OR Nexus). "
        "Keep ATM Lab off or on snapshot-only. Review all three reports after close."
    )

    pdf.add_page()
    pdf.section("Suggested daily workflow")
    pdf.bullet("08:50–09:10 — read levels, plan bias (Pinax study).")
    pdf.bullet("09:15–09:45 — watch open structure (ATM Lab style); no forced trade.")
    pdf.bullet("09:45–14:30 — execute with ONE agent; journal High/Low on every close.")
    pdf.bullet("15:00–15:20 — flatten / square rules; no new experiments.")
    pdf.bullet("After close — read THREE separate PDFs; write 3 bullets for tomorrow.")

    pdf.section("Risk & cost")
    pdf.bullet(f"This pack uses Rs{BROKERAGE_PER_LOT:.0f}/lot for net math.")
    pdf.bullet("Live agents may still book Rs160 internally — align them later if you want.")
    pdf.bullet("Never size up until High/Low review shows you exit winners better than losers.")

    pdf.section("What to improve next (priority)")
    pdf.bullet("1) Run only one live agent during market to kill 429.")
    pdf.bullet("2) Nexus: WS LTP + avoid double-lane same loss (study vs live).")
    pdf.bullet("3) Pinax: stricter entry after adverse streak; keep TARGET discipline.")
    pdf.bullet("4) ATM Lab: weekly opportunity PDF only — not continuous poll with traders.")
    pdf.bullet("5) Personal rulebook: bias → side → trigger → SL → trail → review.")

    pdf.section("Final answer")
    pdf.para(
        "Do NOT merge the agents into one. Keep NexusPulse, PinaxForge, and ATM Lab "
        "separate reports and separate code paths. Merge only your pro habits: "
        "patience, one bias, cost-aware entries, High/Low honesty, and single-agent live focus.",
        bold=True,
    )

    out = OUT / f"Pro-Trader-Improvement-Report-{date}.pdf"
    return output_pdf_safe(pdf, out)


def main():
    date = sys.argv[1] if len(sys.argv) > 1 else ist_now_date()
    OUT.mkdir(parents=True, exist_ok=True)
    paths = [
        build_nexus(date),
        build_pinax(date),
        build_atm(date),
        build_improvement(date),
    ]
    for p in paths:
        print(f"OK {p}")
    print(f"DONE {len(paths)} separate PDFs (not merged)")


if __name__ == "__main__":
    main()
