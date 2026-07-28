#!/usr/bin/env python3
"""
NexusPulse — detailed mobile day report (A5 PDF).
Input:  .data/nexus-pulse/trades/paper/YYYY-MM-DD.json (+ session for market context)
Output: .data/nexus-pulse/reports/daily/NexusPulse-Day-YYYY-MM-DD.pdf
        .data/nexus-pulse/reports/daily/NexusPulse-Day-YYYY-MM-DD.meta.json
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / ".data"
ARCHIVE = DATA / "nexus-pulse" / "trades" / "paper"
OUT_DIR = DATA / "nexus-pulse" / "reports" / "daily"
BROKERAGE = 70.0
IST = timezone(timedelta(hours=5, minutes=30))
PAGE_W, PAGE_H = 148, 210


def ist_now_date() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")


def to_ist_hm(iso: str | None) -> str:
    if not iso:
        return "--"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(IST)
        return dt.strftime("%H:%M")
    except Exception:
        return iso[:5]


def dur_minutes(a: str | None, b: str | None) -> int:
    if not a or not b:
        return 0
    try:
        s = datetime.fromisoformat(a.replace("Z", "+00:00"))
        e = datetime.fromisoformat(b.replace("Z", "+00:00"))
        return max(0, int((e - s).total_seconds()) // 60)
    except Exception:
        return 0


def dur_hhmm(a: str | None, b: str | None) -> str:
    m = dur_minutes(a, b)
    return f"{m // 60:02d}:{m % 60:02d}"


def safe(s: object) -> str:
    t = str(s if s is not None else "")
    return (
        t.replace("\u20b9", "Rs")
        .replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2019", "'")
        .replace("\u2018", "'")
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


def reason_word(r: str | None) -> str:
    if r == "UT_5M":
        return "Sector 7 A"
    if r == "UT_3M":
        return "Sector 7 A (3m)"
    if r == "TRAIL":
        return "profit trail"
    if r == "SL":
        return "stop loss"
    if r == "SQ":
        return "end-of-day square-off"
    if r == "LANE_B_15":
        return "Lane B 3:00 pm rule"
    return r or "closed"


def lane_name(lid: str) -> str:
    if lid == "current_bans":
        return "Lane A"
    if lid == "morning_open_stop_15":
        return "Lane B"
    return lid or "?"


def gross_trade(t: dict) -> float:
    entry = float(t.get("entryPremium") or 0)
    exit_p = float(t.get("exitPremium") or entry)
    lot = float(t.get("lotSize") or 65)
    qty = float(t.get("qty") or 1)
    return (exit_p - entry) * qty * lot


def net_trade(t: dict) -> float:
    qty = float(t.get("qty") or 1)
    return gross_trade(t) - BROKERAGE * qty


def load_day_trades(date: str) -> list[dict]:
    by_id: dict[str, dict] = {}
    p = ARCHIVE / f"{date}.json"
    if p.exists():
        data = json.loads(p.read_text(encoding="utf-8"))
        for t in data.get("trades") or []:
            if t.get("status") == "closed" and t.get("id"):
                by_id[str(t["id"])] = t
    sess = DATA / f"nexus-pulse-session-{date}.json"
    if sess.exists():
        s = json.loads(sess.read_text(encoding="utf-8"))
        for t in s.get("closedTrades") or []:
            if t.get("status") == "closed" and t.get("id"):
                by_id[str(t["id"])] = {**t, "sessionDate": date}
        for t in s.get("openTrades") or []:
            if t.get("status") == "open" and t.get("id"):
                row = {**t, "sessionDate": date, "reportOpen": True}
                by_id[str(t["id"])] = row
    return list(by_id.values())


def load_session(date: str) -> dict | None:
    sess = DATA / f"nexus-pulse-session-{date}.json"
    if sess.exists():
        return json.loads(sess.read_text(encoding="utf-8"))
    return None


class DayPDF(FPDF):
    def __init__(self, date: str):
        super().__init__(orientation="P", unit="mm", format=(PAGE_W, PAGE_H))
        self._date = date
        self.set_auto_page_break(auto=True, margin=14)
        self.set_margins(10, 12, 10)

    def header(self):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(20, 50, 90)
        self.multi_cell(self.epw, 5, safe("NexusPulse Day Report"))
        self.set_font("Helvetica", "", 8)
        self.set_text_color(80, 100, 120)
        self.multi_cell(self.epw, 4, safe(f"{self._date}  |  detailed mobile review"))
        self.ln(1)

    def footer(self):
        self.set_y(-10)
        self.set_font("Helvetica", "I", 7)
        self.cell(self.epw, 4, f"Page {self.page_no()}", align="C")

    def section(self, text: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(25, 55, 95)
        self.multi_cell(self.epw, 5, safe(text))
        self.ln(0.8)

    def para(self, text: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 8.5)
        self.set_text_color(30, 40, 50)
        self.multi_cell(self.epw, 4.2, safe(text))
        self.ln(0.4)

    def bullet(self, text: str):
        self.para(f"- {text}")


def build_story(date: str, trades: list[dict], session: dict | None) -> dict:
    lane_a = [t for t in trades if t.get("laneId") == "current_bans"]
    lane_b = [t for t in trades if t.get("laneId") == "morning_open_stop_15"]
    nets = [net_trade(t) for t in trades]
    grosses = [gross_trade(t) for t in trades]
    total_net = sum(nets)
    total_gross = sum(grosses)
    total_brokerage = sum(float(t.get("qty") or 1) * BROKERAGE for t in trades)
    wins = sum(1 for n in nets if n >= 0)
    losses = len(nets) - wins
    win_nets = [n for n in nets if n >= 0]
    loss_nets = [n for n in nets if n < 0]
    avg_win = sum(win_nets) / len(win_nets) if win_nets else 0.0
    avg_loss = sum(loss_nets) / len(loss_nets) if loss_nets else 0.0
    win_rate = (100.0 * wins / len(nets)) if nets else 0.0

    spots = [float(t["entrySpot"]) for t in trades if t.get("entrySpot")]
    first_spot = spots[0] if spots else None
    last_spot = spots[-1] if spots else None
    session_spot = float(session["spot"]) if session and session.get("spot") else last_spot
    spot_move = None
    if first_spot is not None and session_spot is not None:
        spot_move = session_spot - first_spot

    ce_n = sum(1 for t in trades if t.get("side") == "CE")
    pe_n = sum(1 for t in trades if t.get("side") == "PE")
    reasons = Counter(t.get("exitReason") or "unknown" for t in trades)

    # Market behaviour narrative
    market: list[str] = []
    if not trades:
        market.append("No closed paper trades today — market path from desk is empty.")
        if session_spot:
            market.append(f"Last known Nifty spot on desk: {session_spot:,.2f}.")
    else:
        if first_spot is not None and session_spot is not None:
            direction = "up" if (spot_move or 0) >= 0 else "down"
            market.append(
                f"Nifty around first entry was about {first_spot:,.0f}. "
                f"Late session spot about {session_spot:,.0f} "
                f"({direction} by about {abs(spot_move or 0):.0f} points from first entry)."
            )
        market.append(
            f"Desk traded {ce_n} CE and {pe_n} PE. "
            + (
                "More CE than PE — book leaned bullish."
                if ce_n > pe_n
                else "More PE than CE — book leaned bearish."
                if pe_n > ce_n
                else "CE and PE were balanced."
            )
        )
        if session and session.get("ut5m", {}).get("last"):
            pos5 = session["ut5m"]["last"].get("pos")
            market.append(
                "End-of-day 5m UT bias: "
                + ("bullish (pos +1)." if pos5 == 1 else "bearish (pos -1)." if pos5 == -1 else "flat/unknown.")
            )
        if session and session.get("ut3m", {}).get("last"):
            pos3 = session["ut3m"]["last"].get("pos")
            market.append(
                "End-of-day 3m UT bias: "
                + ("bullish." if pos3 == 1 else "bearish." if pos3 == -1 else "flat/unknown.")
            )
        for code, cnt in reasons.most_common():
            market.append(f"Exit mix: {reason_word(code)} x{cnt}.")

    opening: list[str] = []
    if not trades:
        opening.append("No paper trades were saved for this day.")
    else:
        mood = "green day" if total_net >= 0 else "red day"
        opening.append(
            f"Today was a {mood}. Closed {len(trades)} paper trades. "
            f"Wins {wins}, losses {losses} (win rate {win_rate:.0f}%). "
            f"Gross Rs {total_gross:,.0f}, brokerage ~Rs {total_brokerage:,.0f}, "
            f"net after Rs {BROKERAGE:.0f}/lot: Rs {total_net:,.0f}."
        )

    # Detailed trade cards
    trade_blocks: list[list[str]] = []
    for i, t in enumerate(trades, 1):
        g = gross_trade(t)
        n = net_trade(t)
        mfe = t.get("maxFavorablePts")
        mae = t.get("maxAdversePts")
        hi = t.get("highPremium")
        lo = t.get("lowPremium")
        block = [
            f"Trade {i} — {lane_name(t.get('laneId'))} | {t.get('side')} {t.get('strike')}",
            f"Open {to_ist_hm(t.get('openedAt'))} -> close {to_ist_hm(t.get('closedAt'))} "
            f"(held {dur_hhmm(t.get('openedAt'), t.get('closedAt'))})",
            f"Premium in {float(t.get('entryPremium') or 0):.2f} -> out {float(t.get('exitPremium') or 0):.2f} "
            f"| Spot at entry {float(t.get('entrySpot') or 0):,.2f}",
            f"Exit: {reason_word(t.get('exitReason'))}",
            f"Gross Rs {g:,.0f} | Cost Rs {BROKERAGE * float(t.get('qty') or 1):.0f} | Net Rs {n:,.0f}",
        ]
        if mfe is not None or mae is not None:
            block.append(
                f"Path after entry: best +{float(mfe or 0):.2f} pts, worst -{float(mae or 0):.2f} pts"
                + (f" | Hi/Lo prem {hi}/{lo}" if hi is not None and lo is not None else "")
            )
        if float(mae or 0) > float(mfe or 0) * 1.5 and n < 0:
            block.append("Note: pain was larger than reward on this ticket — size/timing review.")
        trade_blocks.append(block)

    # Calculations section
    calc: list[str] = [
        f"Trades closed: {len(trades)}",
        f"Lane A: {len(lane_a)} trades, net Rs {sum(net_trade(t) for t in lane_a):,.0f}",
        f"Lane B: {len(lane_b)} trades, net Rs {sum(net_trade(t) for t in lane_b):,.0f}",
        f"Wins / Losses: {wins} / {losses} ({win_rate:.0f}% win rate)",
        f"Gross P&L: Rs {total_gross:,.0f}",
        f"Brokerage total (@ Rs {BROKERAGE:.0f}/lot): Rs {total_brokerage:,.0f}",
        f"Net P&L: Rs {total_net:,.0f}",
        f"Avg win: Rs {avg_win:,.0f}  |  Avg loss: Rs {avg_loss:,.0f}",
    ]
    if avg_loss < 0 and avg_win > 0:
        rr = abs(avg_win / avg_loss)
        calc.append(f"Avg win / |avg loss| ratio: {rr:.2f}")

    # Desk summary
    summary_lines: list[str] = []
    if not trades:
        summary_lines.append("Desk quiet — nothing to score.")
    else:
        if total_net >= 0:
            summary_lines.append(
                "Our read: positive paper day. Edge came more from exits that locked profit "
                "than from perfect entries."
            )
        else:
            summary_lines.append(
                "Our read: negative paper day. Losses need a clear cause "
                "(late entry, both lanes same ticket, or Sector 7 A after a small MFE)."
            )
        if len(lane_a) and len(lane_b):
            a_net = sum(net_trade(t) for t in lane_a)
            b_net = sum(net_trade(t) for t in lane_b)
            if abs(a_net - b_net) < 50 and len(lane_a) == len(lane_b):
                summary_lines.append(
                    "Lane A and Lane B look nearly twin books today — same signals twice. "
                    "Review as one idea, not two independent wins/losses."
                )
            else:
                better = "Lane A" if a_net >= b_net else "Lane B"
                summary_lines.append(f"{better} carried more of the day's P&L.")
        trail_n = reasons.get("TRAIL", 0)
        ut5_n = reasons.get("UT_5M", 0)
        if trail_n and ut5_n:
            summary_lines.append(
                f"Mix of trail ({trail_n}) and Sector 7 A ({ut5_n}) exits — "
                "trail protected some winners; Sector 7 A cut others when 5m UT flipped."
            )
        if spot_move is not None and abs(spot_move) < 40:
            summary_lines.append(
                "Spot range from first entry to late session was fairly tight — "
                "chop/range risk was real."
            )
        elif spot_move is not None and abs(spot_move) >= 80:
            summary_lines.append(
                "Spot moved enough to create trend days — check if UT alignment matched that move."
            )

    # Suggestions & improvements
    suggestions: list[str] = []
    if not trades:
        suggestions.append("Start NexusPulse after 9:15 IST so UT lanes can fire.")
        suggestions.append("Confirm Upstox quotes are live before waiting for signals.")
    else:
        if reasons.get("UT_5M", 0) >= max(2, len(trades) // 2):
            suggestions.append(
                "Many Sector 7 A exits — after entry, watch 5m UT closely; "
                "if MFE is tiny, tighten or skip next twin-lane copy."
            )
        if reasons.get("TRAIL", 0) >= 1 and total_net >= 0:
            suggestions.append("Trail exits helped — keep trail rules; do not loosen them after one good day.")
        if wins and losses and abs(avg_loss) > avg_win * 1.4:
            suggestions.append(
                "Avg loss bigger than avg win — cut losers faster or wait for cleaner 3m+5m align."
            )
        if ce_n and pe_n and abs(ce_n - pe_n) <= 1 and total_net < 0:
            suggestions.append(
                "Flip-flop CE/PE day — avoid stacking both lanes on the first flip after a loss."
            )
        if len(lane_a) and len(lane_b) and abs(sum(net_trade(t) for t in lane_a) - sum(net_trade(t) for t in lane_b)) < 100:
            suggestions.append(
                "Improvement: treat twin-lane same-strike entries as one risk unit in review "
                "(do not double-count skill)."
            )
        suggestions.append("Keep Lane A and Lane B books separate when you journal.")
        suggestions.append("Paper only until live is turned on — same report format applies later.")
        if total_net < 0:
            suggestions.append(
                "Tomorrow focus: one clean UT align, one lane first; add second lane only if MFE confirms."
            )
        else:
            suggestions.append(
                "Tomorrow focus: repeat what worked (trail on strength) and skip late/thin MFE setups."
            )

    return {
        "date": date,
        "tradeCount": len(trades),
        "wins": wins,
        "losses": losses,
        "winRate": round(win_rate, 1),
        "gross": round(total_gross, 2),
        "brokerage": round(total_brokerage, 2),
        "netAfter70": round(total_net, 2),
        "avgWin": round(avg_win, 2),
        "avgLoss": round(avg_loss, 2),
        "laneA": len(lane_a),
        "laneB": len(lane_b),
        "laneANet": round(sum(net_trade(t) for t in lane_a), 2),
        "laneBNet": round(sum(net_trade(t) for t in lane_b), 2),
        "firstSpot": first_spot,
        "lastSpot": session_spot,
        "spotMove": round(spot_move, 2) if spot_move is not None else None,
        "ceCount": ce_n,
        "peCount": pe_n,
        "opening": opening,
        "market": market,
        "calc": calc,
        "tradeBlocks": trade_blocks,
        "tradeLines": [" | ".join(b[:3]) for b in trade_blocks],
        "deskSummary": summary_lines,
        "suggestions": suggestions,
    }


def build_pdf(date: str, story: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf = DayPDF(date)
    pdf.add_page()

    pdf.section(f"1. What happened on {date}?")
    for line in story["opening"]:
        pdf.para(line)

    pdf.section("2. Market behaviour")
    for line in story["market"]:
        pdf.bullet(line)

    pdf.section("3. Overall calculation")
    for line in story["calc"]:
        pdf.bullet(line)

    pdf.section("4. Each trade (detail)")
    if not story["tradeBlocks"]:
        pdf.para("Nothing to list.")
    else:
        for block in story["tradeBlocks"]:
            pdf.set_font("Helvetica", "B", 8.5)
            pdf.set_x(pdf.l_margin)
            pdf.set_text_color(25, 55, 95)
            pdf.multi_cell(pdf.epw, 4, safe(block[0]))
            for line in block[1:]:
                pdf.bullet(line)
            pdf.ln(1)

    pdf.section("5. Our summary (market + trades)")
    for line in story["deskSummary"]:
        pdf.bullet(line)

    pdf.section("6. Suggestions & improvements")
    for line in story["suggestions"]:
        pdf.bullet(line)

    out = OUT_DIR / f"NexusPulse-Day-{date}.pdf"
    try:
        pdf.output(str(out))
    except PermissionError:
        alt = OUT_DIR / f"NexusPulse-Day-{date}-updated.pdf"
        pdf.output(str(alt))
        return alt
    return out


def main():
    date = sys.argv[1] if len(sys.argv) > 1 else ist_now_date()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        print(json.dumps({"ok": False, "error": "bad date"}))
        sys.exit(1)

    trades = sorted(load_day_trades(date), key=lambda t: t.get("openedAt") or "")
    session = load_session(date)
    story = build_story(date, trades, session)
    pdf_path = build_pdf(date, story)

    meta = {
        "ok": True,
        "agent": "NexusPulse",
        "date": date,
        "title": f"NexusPulse Day Report — {date}",
        "pdfFile": pdf_path.name,
        "pdfPath": str(pdf_path.relative_to(ROOT)).replace("\\", "/"),
        "generatedAt": datetime.now(IST).isoformat(),
        "summary": {
            "tradeCount": story["tradeCount"],
            "wins": story["wins"],
            "losses": story["losses"],
            "winRate": story["winRate"],
            "gross": story["gross"],
            "brokerage": story["brokerage"],
            "netAfter70": story["netAfter70"],
            "avgWin": story["avgWin"],
            "avgLoss": story["avgLoss"],
            "laneA": story["laneA"],
            "laneB": story["laneB"],
            "laneANet": story["laneANet"],
            "laneBNet": story["laneBNet"],
            "firstSpot": story["firstSpot"],
            "lastSpot": story["lastSpot"],
            "spotMove": story["spotMove"],
            "ceCount": story["ceCount"],
            "peCount": story["peCount"],
        },
        "sections": {
            "opening": story["opening"],
            "market": story["market"],
            "calc": story["calc"],
            "tradeBlocks": story["tradeBlocks"],
            "deskSummary": story["deskSummary"],
            "suggestions": story["suggestions"],
        },
        "simpleStory": story["opening"]
        + story["market"]
        + story["deskSummary"]
        + story["suggestions"],
    }
    meta_path = OUT_DIR / f"NexusPulse-Day-{date}.meta.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    index_path = OUT_DIR / "index.json"
    index: dict = {"updatedAt": meta["generatedAt"], "reports": []}
    if index_path.exists():
        try:
            index = json.loads(index_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    reports = [r for r in index.get("reports", []) if r.get("date") != date]
    reports.append(
        {
            "agent": meta["agent"],
            "date": meta["date"],
            "title": meta["title"],
            "pdfFile": meta["pdfFile"],
            "pdfPath": meta["pdfPath"],
            "generatedAt": meta["generatedAt"],
            "summary": meta["summary"],
            "simpleStory": meta.get("simpleStory"),
            "sections": meta.get("sections"),
        }
    )
    reports.sort(key=lambda r: r.get("date", ""), reverse=True)
    index_path.write_text(
        json.dumps({"updatedAt": meta["generatedAt"], "reports": reports}, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(meta))
    sys.exit(0)


if __name__ == "__main__":
    main()
