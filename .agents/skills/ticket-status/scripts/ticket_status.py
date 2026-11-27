#!/usr/bin/env python3
"""Tổng hợp tiến độ ticket Nihongo Path (CHỈ ĐỌC, không sửa file nào).

Dùng: ticket_status.py [filters...] [--update] [--verify] [--strict-head] [--no-gh] [--json] [--repo DIR]
filters: P0..P11 | done|partial|done-partial|todo|blocked|off-roadmap|wontfix | NP-nnn | nnn | #issue | current
"""
import argparse, collections, glob, json, re, subprocess, sys
from pathlib import Path

STATUSES = {"done", "partial", "done-partial", "todo", "blocked", "off-roadmap", "wontfix"}
SYMS = {"[x]": "✅", "[~]": "🟡", "[ ]": "⬜", "[—]": "—", "⏸": "⏸"}


def find_repo(arg):
    if arg:
        return Path(arg).resolve()
    p = Path(__file__).resolve()
    for d in p.parents:
        if (d / "docs" / "IMPLEMENTATION_CHECKLIST.md").exists():
            return d
    sys.exit("Không tìm thấy gốc repo (docs/IMPLEMENTATION_CHECKLIST.md)")


def run(cmd, cwd, timeout=15):
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except Exception as e:  # noqa
        return 1, "", str(e)


def read(p):
    return Path(p).read_text(encoding="utf-8")


def tt_symbol(cell):
    c = cell.strip().strip("`").strip()
    for k in ("[x]", "[~]", "[ ]", "[—]", "⏸"):
        if c.startswith(k):
            return k
    return None


def parse_checklist(root):
    rows = []
    for i, l in enumerate(read(root / "docs/IMPLEMENTATION_CHECKLIST.md").splitlines(), 1):
        m = re.match(r"^\|\s*(P\d+)-([A-Z0-9]+-\d+[a-z]?)\s*\|", l)
        if not m:
            continue
        cells = [c.strip() for c in l.strip().strip("|").split("|")]
        # cột "|" thoát trong ô (\|) làm lệch; TT luôn là ô cuối
        tt = tt_symbol(cells[-1])
        rows.append({"id": f"{m.group(1)}-{m.group(2)}", "phase": m.group(1), "line": i,
                     "task": cells[1] if len(cells) > 1 else "", "tt": tt,
                     "struck": bool(re.search(r"~~.+~~", cells[1] if len(cells) > 1 else ""))})
    return rows


def count_phases(rows):
    c = collections.OrderedDict()
    for r in sorted(rows, key=lambda r: int(r["phase"][1:])):
        c.setdefault(r["phase"], collections.Counter())[r["tt"]] += 1
    out = []
    for ph, v in c.items():
        t = sum(v.values())
        out.append({"phase": ph, "total": t, "done": v["[x]"], "partial": v["[~]"], "todo": v["[ ]"],
                    "wait": v["⏸"], "na": v["[—]"], "pct": 100 * v["[x]"] // t})
    return out


def parse_issue_files(root):
    res = {}
    for p in sorted(glob.glob(str(root / "docs/issues/NP-*.md"))):
        txt = read(p)
        fm = {}
        m = re.match(r"^---\n(.*?)\n---", txt, re.S)
        for l in (m.group(1).splitlines() if m else []):
            if ":" in l:
                k, v = l.split(":", 1)
                fm[k.strip()] = v.strip()
        sec = {}
        for h, body in re.findall(r"^## (.+?)\n(.*?)(?=^## |^---\s*$|\Z)", txt, re.M | re.S):
            sec[h.strip()] = body.strip()
        tid = fm.get("id") or Path(p).stem
        res[tid] = {"id": tid, "title": fm.get("title", ""), "status": fm.get("status", "?"),
                    "phase": fm.get("phase", "-"), "labels": fm.get("labels", ""), "sections": sec,
                    "path": str(Path(p).relative_to(root))}
    return res


def parse_readme(root):
    txt = read(root / "docs/issues/README.md")
    idx = {}
    for m in re.finditer(r"^\|\s*\[(NP-\d+)\]\(\./\1\.md\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|", txt, re.M):
        idx[m.group(1)] = {"status": m.group(2), "phase": m.group(3), "title": m.group(4)}
    gh = {}
    for m in re.finditer(r"^\|\s*#(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|", txt, re.M):
        gh[int(m.group(1))] = {"title": m.group(2), "files": list(dict.fromkeys(re.findall(r"NP-\d+", m.group(3)))), "tasks": m.group(4)}
    return idx, gh


def expand_ids(cell):
    """'NP-501, 502' -> [NP-501, NP-502]; '~~NP-408~~' -> [NP-408]"""
    out = []
    for tok in re.findall(r"(NP-)?(\d{3,4})", cell):
        out.append("NP-" + tok[1])
    return out


def parse_tickets_md(root):
    txt = read(root / "docs/TICKETS.md")
    head = txt[:1500]
    d = re.search(r"\*\*Cập nhật:\*\*\s*(\d{1,2}/\d{1,2}/\d{4})", head)
    s = re.search(r"`git log` đến `([0-9a-f]{6,40})`", head)
    secs = {}
    for m in re.finditer(r"^## (\d+)\. .*?\n(.*?)(?=^## \d+\. |\Z)", txt, re.M | re.S):
        secs[int(m.group(1))] = m.group(2)

    def first_col_ids(sec_no, struck=False):
        ids = []
        for l in secs.get(sec_no, "").splitlines():
            m = re.match(r"^\|\s*(~~)?\s*((?:NP-\d+)(?:\s*(?:,|và)\s*(?:NP-)?\d+)*)", l)
            if m and (struck or not m.group(1)):
                ids += expand_ids(m.group(2))
        return ids

    done, partial = first_col_ids(2), first_col_ids(3)
    backlog_struck = []
    for l in secs.get(5, "").splitlines():
        m = re.match(r"^\|\s*~~\s*(NP-\d+)\s*~~", l)
        if m:
            backlog_struck.append(m.group(1))
    totals = {}
    for l in secs.get(1, "").splitlines():
        m = re.match(r"^\|\s*(\*\*Tổng\*\*|P\d+)\s*\|[^|]*\|\s*\**(\d+)\**\s*\|\s*\**(\d+)\**\s*\|\s*\**(\d+)\**\s*\|\s*\**(\d+)\**\s*\|", l)
        if m:
            k = "Tổng" if "Tổng" in m.group(1) else m.group(1)
            totals[k] = tuple(int(m.group(i)) for i in (2, 3, 4, 5))
    return {"date": d.group(1) if d else None, "sha": s.group(1) if s else None, "done": done,
            "partial": partial, "struck": backlog_struck, "totals": totals}


def handoff_sections(root, n=5):
    p = root / "docs/HANDOFF.md"
    if not p.exists():
        return []
    parts = re.split(r"^## ", read(p), flags=re.M)[1:n + 1]
    out = []
    for part in parts:
        title, _, body = part.partition("\n")
        keep = [l.strip() for l in body.splitlines()
                if re.match(r"^\s*-?\s*\**(Chưa kiểm|Cần làm|Việc tiếp|Chưa làm)", l.strip())]
        out.append({"title": title.strip(), "tickets": sorted(set(re.findall(r"NP-\d+", part))), "todo": keep})
    return out


def git_context(root, rec_sha):
    c = {}
    c["branch"] = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], root)[1]
    c["head"] = run(["git", "log", "-n", "1", "--format=%h|%cs|%s"], root)[1]
    c["head_sha"] = run(["git", "rev-parse", "--short", "HEAD"], root)[1]
    c["status"] = run(["git", "status", "--short"], root)[1].splitlines()
    note = None
    if rec_sha and run(["git", "cat-file", "-e", rec_sha + "^{commit}"], root)[0] == 0:
        log = run(["git", "log", f"{rec_sha}..HEAD", "--oneline"], root)[1].splitlines()
    else:
        log = run(["git", "log", "-n", "15", "--oneline"], root)[1].splitlines()
        note = f"mốc {rec_sha} không có trong lịch sử hiện tại" if rec_sha else "TICKETS.md không ghi mốc commit"
    c["log_since"], c["log_note"] = log, note
    return c


def github(root):
    rc, out, err = run(["gh", "issue", "list", "--state", "all", "--limit", "100", "--json",
                        "number,title,state,labels,url"], root, timeout=10)
    if rc != 0:
        return None, (err or out).splitlines()[0] if (err or out) else "lỗi không rõ"
    try:
        return json.loads(out), None
    except Exception as e:  # noqa
        return None, str(e)


def find_drifts(root, rows, phases, issues, idx, tk):
    d = []
    # 1) checklist vs TICKETS §1
    for p in phases:
        t = tk["totals"].get(p["phase"])
        if t and t != (p["done"], p["partial"], p["todo"], p["wait"]):
            d.append(f"Checklist {p['phase']} = ✅{p['done']} 🟡{p['partial']} ⬜{p['todo']} ⏸{p['wait']} "
                     f"nhưng TICKETS.md §1 ghi ✅{t[0]} 🟡{t[1]} ⬜{t[2]} ⏸{t[3]}")
    tot = tk["totals"].get("Tổng")
    if tot:
        s = (sum(p["done"] for p in phases), sum(p["partial"] for p in phases),
             sum(p["todo"] for p in phases), sum(p["wait"] for p in phases))
        if tot != s:
            d.append(f"Checklist tổng = ✅{s[0]} 🟡{s[1]} ⬜{s[2]} ⏸{s[3]} nhưng TICKETS.md §1 ghi "
                     f"✅{tot[0]} 🟡{tot[1]} ⬜{tot[2]} ⏸{tot[3]}")
    for r in rows:
        if r["struck"] and r["tt"] != "[—]":
            d.append(f"Checklist {r['id']} (dòng {r['line']}) đã gạch bỏ nhưng TT = {r['tt']} (nên là [—])")
    # 2) file vs README index
    for tid, it in issues.items():
        if tid not in idx:
            d.append(f"{tid}: có file nhưng thiếu trong docs/issues/README.md")
        else:
            r = idx[tid]
            if r["status"] != it["status"] or r["phase"] != it["phase"]:
                d.append(f"{tid}: file (status={it['status']}, phase={it['phase']}) ≠ README "
                         f"(status={r['status']}, phase={r['phase']})")
    for tid in idx:
        if tid not in issues:
            d.append(f"{tid}: có trong README.md nhưng không có file")
    # 3) file vs TICKETS sections
    for tid, it in issues.items():
        st = it["status"]
        if st == "done" and tid not in tk["done"]:
            d.append(f"{tid}: status done nhưng không ở TICKETS.md §2" + (" (còn ở §3)" if tid in tk["partial"] else ""))
        if st in ("partial", "done-partial") and tid not in tk["partial"] and tid not in tk["done"]:
            d.append(f"{tid}: status {st} nhưng không có ở TICKETS.md §3")
        if st == "done" and tid in tk["partial"]:
            d.append(f"{tid}: status done nhưng vẫn ở TICKETS.md §3")
    for tid in tk["struck"]:
        if tid in issues and issues[tid]["status"] not in ("wontfix", "off-roadmap", "done"):
            d.append(f"{tid}: TICKETS.md §5 gạch bỏ (không làm) nhưng file vẫn status: {issues[tid]['status']} (nên wontfix)")
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("filters", nargs="*")
    ap.add_argument("--update", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--strict-head", action="store_true")
    ap.add_argument("--no-gh", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--repo")
    a = ap.parse_args()
    root = find_repo(a.repo)

    rows = parse_checklist(root)
    phases = count_phases(rows)
    issues = parse_issue_files(root)
    idx, gh_map = parse_readme(root)
    tk = parse_tickets_md(root)
    ctx = git_context(root, tk["sha"])
    hand = handoff_sections(root)
    drifts = find_drifts(root, rows, phases, issues, idx, tk)

    if a.strict_head and tk["sha"] and ctx["head_sha"] and not (
            ctx["head_sha"].startswith(tk["sha"]) or tk["sha"].startswith(ctx["head_sha"])):
        drifts.append(f"TICKETS.md ghi `git log` đến {tk['sha']} nhưng HEAD = {ctx['head_sha']}")

    if a.verify:
        print("\n".join(f"- {x}" for x in drifts) if drifts else "OK: các nguồn đồng bộ")
        sys.exit(1 if drifts else 0)

    # bộ lọc
    f_phase, f_status, f_ids, f_gh, current = set(), set(), set(), set(), False
    for f in a.filters:
        fl = f.strip()
        if re.fullmatch(r"[Pp]\d+", fl): f_phase.add(fl.upper())
        elif fl.lower() in STATUSES: f_status.add(fl.lower())
        elif re.fullmatch(r"#\d+", fl): f_gh.add(int(fl[1:]))
        elif re.fullmatch(r"(?i)(NP-)?\d+", fl): f_ids.add("NP-" + re.sub(r"(?i)NP-", "", fl))
        elif fl.lower() == "current": current = True
    for n in f_gh:
        f_ids |= set(gh_map.get(n, {}).get("files", []))

    active = sorted({t for h in hand[:1] for t in h["tickets"]} |
                    {t for l in ctx["log_since"] for t in re.findall(r"NP-\d+", l)})

    sel = []
    for tid, it in issues.items():
        if f_ids and tid not in f_ids: continue
        if f_phase and it["phase"] not in f_phase: continue
        if f_status and it["status"] not in f_status: continue
        if current and tid not in active: continue
        if not (f_ids or f_status or f_phase or current) and it["status"] in ("done", "off-roadmap"): continue
        sel.append(it)
    sel.sort(key=lambda i: (i["status"], int(i["id"][3:])))

    ghd, gherr = (None, "bỏ qua (--no-gh)") if a.no_gh else github(root)

    if a.json:
        print(json.dumps({"context": ctx, "active": active, "handoff": hand, "phases": phases,
                          "tickets": [{k: v for k, v in i.items() if k != "sections"} for i in sel],
                          "drifts": drifts, "github": ghd, "github_error": gherr}, ensure_ascii=False, indent=2))
        return

    P = print
    P("# Trạng thái ticket — Nihongo Path\n")
    P("## 1. Tiến trình hiện tại")
    P(f"- Nhánh `{ctx['branch']}`, HEAD: {ctx['head']}")
    P(f"- TICKETS.md cập nhật {tk['date']} đến commit `{tk['sha']}`" + (f" ({ctx['log_note']})" if ctx["log_note"] else ""))
    P(f"- Ticket liên quan (HANDOFF mới nhất + commit sau mốc): {', '.join(active) or 'không rõ'}")
    P(f"- Working tree: {len(ctx['status'])} thay đổi chưa commit" + (":" if ctx["status"] else ""))
    for l in ctx["status"][:15]: P(f"    {l}")
    if len(ctx["status"]) > 15: P(f"    … (+{len(ctx['status']) - 15})")
    lim = 30 if a.update else 8
    P(f"- Commit sau mốc ({len(ctx['log_since'])}):")
    for l in ctx["log_since"][:lim]: P(f"    {l}")
    P("- HANDOFF (mục đầu):")
    for h in hand[:(5 if a.update else 2)]:
        P(f"    · {h['title']} [{', '.join(h['tickets'][:6])}]")
        for t in h["todo"][:3]: P(f"        {t[:220]}")

    P("\n## 2. Tổng quan theo phase (từ IMPLEMENTATION_CHECKLIST.md)")
    P("| Phase | Tổng | ✅ | 🟡 | ⬜ | ⏸ | — | % |\n|---|---:|---:|---:|---:|---:|---:|---:|")
    for p in phases:
        P(f"| {p['phase']} | {p['total']} | {p['done']} | {p['partial']} | {p['todo']} | {p['wait']} | {p['na']} | {p['pct']}% |")
    T = lambda k: sum(p[k] for p in phases)
    P(f"| **Tổng** | **{T('total')}** | **{T('done')}** | **{T('partial')}** | **{T('todo')}** | **{T('wait')}** | **{T('na')}** | **{100 * T('done') // T('total')}%** |")

    P("\n## 3. Issue GitHub")
    if ghd is None:
        P(f"gh không dùng được: {gherr}. Dùng bảng ghép trong docs/issues/README.md:")
        for n, g in sorted(gh_map.items()):
            if f_gh and n not in f_gh: continue
            P(f"- #{n} {g['title']} → " + ", ".join(f"[{x}](docs/issues/{x}.md)" for x in g["files"]))
    else:
        P("| # | Tiêu đề | Trạng thái | Nhãn | File chi tiết | Link |\n|---|---|---|---|---|---|")
        for g in ghd:
            if f_gh and g["number"] not in f_gh: continue
            files = gh_map.get(g["number"], {}).get("files", [])
            P(f"| #{g['number']} | {g['title']} | {g['state'].lower()} | {', '.join(l['name'] for l in g['labels'])} | "
              + ", ".join(f"[{x}](docs/issues/{x}.md)" for x in files) + f" | {g['url']} |")

    P("\n## 4. Ticket theo file" + (" (đã lọc)" if (f_ids or f_status or f_phase or current) else " (ẩn done/off-roadmap)"))
    cur = None
    for i in sel:
        if i["status"] != cur:
            cur = i["status"]; P(f"\n### {cur}")
        P(f"- [{i['id']}]({i['path']}) · {i['phase']} · {i['title']}")
    if f_ids and len(sel) <= 3:
        for i in sel:
            P(f"\n#### Chi tiết {i['id']}")
            for h in ("Cụm task", "Chặn bởi", "Còn lại", "Tiêu chí đóng", "Kết quả"):
                if h in i["sections"]: P(f"**{h}:** {i['sections'][h]}")
            for r in rows:
                pass
            P("Checklist liên quan: " + (", ".join(sorted(set(re.findall(r"P\d+-[A-Z0-9]+-\d+[a-z]?", " ".join(i["sections"].values()) + i["title"])))) or "—"))
            P("Commit: " + (run(["git", "log", "--grep=" + i["id"], "--oneline", "-n", "10"], root)[1].replace("\n", " | ") or "—"))

    P("\n## 5. Lệch dữ liệu giữa các nguồn")
    P("\n".join(f"- {x}" for x in drifts) if drifts else "Không có.")
    if a.update:
        P("\n## 6. Việc cập nhật")
        P("- Dòng checklist đã gạch bỏ: " + (", ".join(r["id"] for r in rows if r["struck"]) or "không"))
        P(f"- Mốc cần ghi vào TICKETS.md: `{ctx['head_sha']}`")

    P("\n## 6. Gợi ý tiếp theo" if not a.update else "\n## 7. Gợi ý tiếp theo")
    cand = [i for i in issues.values() if i["status"] in ("partial", "todo")
            and not re.search(r"⏸|Q-\d+", i["sections"].get("Chặn bởi", ""))]
    cand.sort(key=lambda i: (i["id"] not in active, i["status"] != "partial", int(i["id"][3:])))
    for i in cand[:3]:
        P(f"- [{i['id']}]({i['path']}) ({i['status']}): {i['title']}")


if __name__ == "__main__":
    main()
