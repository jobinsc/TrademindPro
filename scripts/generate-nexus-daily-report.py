#!/usr/bin/env python3
"""
NexusPulse — ONE day, simple-words mobile PDF.
Input:  .data/nexus-pulse/trades/paper/YYYY-MM-DD.json (fallback: session file)
Output: .data/nexus-pulse/reports/daily/NexusPulse-Day-YYYY-MM-DD.pdf
        .data/nexus-pulse/reports/daily/NexusPulse-Day-YYYY-MM-DD.meta.json
"""

from __future__ import annotations

import json
import sys
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


def dur_hhmm(a: str | None, b: str | None) -> str:
    if not a or not b:
        return "--"
    try:
        s = datetime.fromisoformat(a.replace("Z", "+00:00"))
        e = datetime.fromisoformat(b.replace("Z", "+00:00"))
        m = max(0, int((e - s).total_seconds()) // 60)
        return f"{m // 60:02d}:{m % 60:02d}"
    except Exception:
        return "--"


def safe(s: object) -> str:
    t = str(s if s is not None else "")
    return (
        t.replace("\u20b9", "Rs")
        .replace("\u2014", "-")
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


def reason_word(r: str | None) -> str:
    if r == "UT_5M":
        return "Sector 7 A (5m UT turned against us)"
    if r == "UT_3M":
        return "3m UT flipped the other way"
    if r == "TRAIL":
        return "profit trail (locked part of the move)"
    if r == "SL":
        return "stop loss hit"
    if r == "SQ":
        return "square-off at end of day"
    if r == "LANE_B_15":
        return "Lane B rule at 3:00 pm"
    return r or "closed"


def net_trade(t: dict) -> float:
    entry = float(t.get("entryPremium") or 0)
    exit_p = float(t.get("exitPremium") or entry)
    lot = float(t.get("lotSize") or 65)
    qty = float(t.get("qty") or 1)
    gross = (exit_p - entry) * qty * lot
    return gross - BROKERAGE * qty


def load_day_trades(date: str) -> list[dict]:
    p = ARCHIVE / f"{date}.json"
    if p.exists():
        data = json.loads(p.read_text(encoding="utf-8"))
        return data.get("trades") or []
    sess = DATA / f"nexus-pulse-session-{date}.json"
    if sess.exists():
        s = json.loads(sess.read_text(encoding="utf-8"))
        closed = s.get("closedTrades") or []
        return [{**t, "sessionDate": date} for t in closed if t.get("status") == "closed"]
    return []


class DayPDF(FPDF):
    def __init__(self, date: str):
        super().__init__(orientation="P", unit="mm", format=(PAGE_W, PAGE_H))
        self._date = date
        self.set_auto_page_break(auto=True, margin=14)
        self.set_margins(10, 12, 10)

    def header(self):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(20, 50, 90)
        self.multi_cell(self.epw, 6, safe(f"NexusPulse Day Report"))
        self.set_font("Helvetica", "", 9)
        self.set_text_color(80, 100, 120)
        self.multi_cell(self.epw, 4, safe(f"{self._date}  |  simple summary"))
        self.ln(2)

    def footer(self):
        self.set_y(-10)
        self.set_font("Helvetica", "I", 7)
        self.cell(self.epw, 4, f"Page {self.page_no()}", align="C")

    def section(self, text: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(25, 55, 95)
        self.multi_cell(self.epw, 5, safe(text))
        self.ln(1)

    def para(self, text: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(30, 40, 50)
        self.multi_cell(self.epw, 4.5, safe(text))
        self.ln(0.5)

    def bullet(self, text: str):
        self.para(f"- {text}")


def lane_name(lid: str) -> str:
    if lid == "current_bans":
        return "Lane A (current bans)"
    if lid == "morning_open_stop_15":
        return "Lane B (morning open / stop 3pm)"
    return lid


def build_story(date: str, trades: list[dict]) -> dict:
    lane_a = [t for t in trades if t.get("laneId") == "current_bans"]
    lane_b = [t for t in trades if t.get("laneId") == "morning_open_stop_15"]
    nets = [net_trade(t) for t in trades]
    total_net = sum(nets)
    wins = sum(1 for n in nets if n >= 0)
    losses = len(nets) - wins

    lines: list[str] = []
    if not trades:
        lines.append("No paper trades were saved for this day.")
        lines.append("Either the desk did not run, or no trade closed yet.")
    else:
        mood = "green day" if total_net >= 0 else "red day"
        lines.append(
            f"Today was a {mood}. We closed {len(trades)} paper trades. "
            f"Wins {wins}, losses {losses}. After about Rs {BROKERAGE:.0f} cost per trade, "
            f"net is about Rs {total_net:,.0f}."
        )

    def trade_line(t: dict, i: int) -> str:
        side = t.get("side", "?")
        strike = t.get("strike", "?")
        n = net_trade(t)
        win = "profit" if n >= 0 else "loss"
        return (
            f"Trade {i}: At {to_ist_hm(t.get('openedAt'))} bought {side} {strike} "
            f"(held {dur_hhmm(t.get('openedAt'), t.get('closedAt'))}). "
            f"Exit {to_ist_hm(t.get('closedAt'))} — {reason_word(t.get('exitReason'))}. "
            f"Small {win} about Rs {abs(n):,.0f} after cost."
        )

    story_trades = [trade_line(t, i + 1) for i, t in enumerate(trades)]

    return {
        "date": date,
        "tradeCount": len(trades),
        "wins": wins,
        "losses": losses,
        "netAfter70": round(total_net, 2),
        "laneA": len(lane_a),
        "laneB": len(lane_b),
        "opening": lines,
        "tradeLines": story_trades,
        "laneANet": round(sum(net_trade(t) for t in lane_a), 2),
        "laneBNet": round(sum(net_trade(t) for t in lane_b), 2),
    }


def build_pdf(date: str, story: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf = DayPDF(date)
    pdf.add_page()

    pdf.section(f"What happened on {date}?")
    for line in story["opening"]:
        pdf.para(line)

    pdf.section("Quick numbers")
    pdf.bullet(f"Total closed trades: {story['tradeCount']}")
    pdf.bullet(f"Lane A trades: {story['laneA']}  |  Lane B trades: {story['laneB']}")
    pdf.bullet(f"Wins / Losses: {story['wins']} / {story['losses']}")
    pdf.bullet(f"Net after Rs {BROKERAGE:.0f} per trade: Rs {story['netAfter70']:,.0f}")
    pdf.bullet(f"Lane A net: Rs {story['laneANet']:,.0f}  |  Lane B net: Rs {story['laneBNet']:,.0f}")

    pdf.section("Each trade in simple words")
    if not story["tradeLines"]:
        pdf.para("Nothing to list.")
    else:
        for line in story["tradeLines"]:
            pdf.bullet(line)

    pdf.section("What to remember")
    if story["tradeCount"] == 0:
        pdf.bullet("Run NexusPulse after 9:15 IST if you want the UT desk to work.")
    elif story["netAfter70"] >= 0:
        pdf.bullet("Good day on paper — note which exit reason worked (trail vs Sector 7 A).")
    else:
        pdf.bullet("Loss day — check if both lanes took the same bad signal twice.")
    pdf.bullet("Lanes A and B are separate books — review them separately.")
    pdf.bullet("This is paper only until live is turned on.")

    out = OUT_DIR / f"NexusPulse-Day-{date}.pdf"
    pdf.output(str(out))
    return out


def main():
    date = sys.argv[1] if len(sys.argv) > 1 else ist_now_date()
    if not __import__("re").match(r"^\d{4}-\d{2}-\d{2}$", date):
        print(json.dumps({"ok": False, "error": "bad date"}))
        sys.exit(1)

    trades = sorted(load_day_trades(date), key=lambda t: t.get("openedAt") or "")
    story = build_story(date, trades)
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
            "netAfter70": story["netAfter70"],
            "laneA": story["laneA"],
            "laneB": story["laneB"],
            "laneANet": story["laneANet"],
            "laneBNet": story["laneBNet"],
        },
        "simpleStory": story["opening"] + story["tradeLines"],
    }
    meta_path = OUT_DIR / f"NexusPulse-Day-{date}.meta.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # Date-wise catalog under NexusPulse (local index)
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
