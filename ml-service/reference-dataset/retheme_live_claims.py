"""Rewrites the live claims of the application (the ones with an analysis, plans and notifications) with cable defects.

The reference batch (generate.py / to_sql.py) holds closed claims; the live claims are the open and recently closed ones with their
5 Why, Ishikawa causes, CAPA plans and notifications. They were written for an assembly workshop (soldering, crimping...). This script
gives each of them a cable defect from defect_catalog.json and rewrites what depends on the defect (title, description, line, customer
site, causes, 5 Why answers, plan wording, and the copies of those titles in notifications, badges and the timeline).

Never changed: status, dates, deadlines, quantities, severity, assignees, progress, ids. Roughly 11 % of the claims keep their workshop
defect (on the assembly lines), like the reference batch. Claims whose plan was written by hand (a title not starting with "CAPA —")
the claims whose 5 Why answers were written by a person, and the imported history are left alone.

    python retheme_live_claims.py            # preview: nothing is written
    python retheme_live_claims.py --apply    # backs up every touched table in schema bak20261027, then rewrites

The backup tables hold the original rows; ../../scripts/restore-retheme-20261027.sql (written by --apply) puts them back.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CATALOG = json.loads((HERE.parent / "defect_catalog.json").read_text(encoding="utf-8"))
NARR = json.loads((HERE / "cable_narratives.json").read_text(encoding="utf-8"))
SITES = ["COFAT-MATEUR", "COFAT-TUNIS", "LEONI-MATEUR", "LEONI-MESSADINE", "YAZAKI-GAFSA", "APTIV-MONASTIR",
         "DRAXLMAIER-SOUSSE", "DRAXLMAIER-EL-FEJJA", "KROMBERG-BEJA"]
KEEP_SHARE = 0.11
BACKUP_SCHEMA = "bak20261027"
GENERIC_CAUSES = [("Method", "Standard de travail incomplet pour ce mode de défaut"), ("Manpower", "Formation incomplète sur la séquence concernée"),
                  ("Measurement", "Contrôle en ligne insuffisamment sensible")]
GENERIC_ACTIONS = ("Vérifier l'efficacité de l'action", "Contrôler le résultat et archiver", "Planifier l'intervention", "Mettre en œuvre l'action corrective")
LIVE = "c.IsArchived=0 AND c.CreatedBy<>'reference-dataset' AND c.CreatedBy NOT LIKE 'import:%'"

PW = next(l.split("=", 1)[1].strip() for l in open(ROOT / ".env", encoding="utf-8") if l.startswith("MSSQL_SA_PASSWORD="))


def sql(query: str | None = None, file: str | None = None) -> str:
    cmd = ["docker", "exec", "-e", "MSYS_NO_PATHCONV=1", "sigrc_sqlserver", "/opt/mssql-tools18/bin/sqlcmd", "-C", "-I", "-S", "localhost", "-U", "sa",
           "-P", PW, "-d", "coficab", "-y", "0", "-s", "\x1f", "-f", "65001", "-b"]
    cmd += ["-i", file] if file else ["-Q", "SET NOCOUNT ON; " + str(query)]
    r = subprocess.run(cmd, capture_output=True)
    out = r.stdout.decode("utf-8", "replace")
    if r.returncode != 0:
        sys.exit("SQL failed: " + out[:1500] + r.stderr.decode("utf-8", "replace")[:300])
    return out


def rows(query: str) -> list[list[str]]:
    lines = [l for l in sql(query).splitlines() if l.strip()]  # sqlcmd prints no header with -y 0
    return [[c.strip() for c in line.split("\x1f")] for line in lines]


def flat(col: str) -> str:
    return f"REPLACE(REPLACE(ISNULL({col},N''),CHAR(13),N' '),CHAR(10),N' ')"


def n(value) -> str:
    return "NULL" if value is None else "N'" + str(value).replace("'", "''") + "'"


def h(key: str, salt: str = "") -> int:
    return int(hashlib.md5((salt + key).encode()).hexdigest()[:12], 16)


def lines_of(code: str) -> list[str]:
    spec = next(d for d in CATALOG["defects"] if d["code"] == code)["lines"]
    return [line for family in sorted(spec) for line in CATALOG["lineFamilies"][family]]


def fill(template: str, **v) -> str:
    for k, val in v.items():
        template = template.replace("{" + k + "}", val)
    return template


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    cable = [d for d in CATALOG["defects"] if d["kind"] == "cable"]
    label = {d["code"]: d["fr"] for d in cable}

    claims = {r[0].upper(): dict(id=r[0].upper(), title=r[1], desc=r[2], defect=r[3], line=r[4], client=r[5], lot=r[6], notes=r[7])
              for r in rows(f"SELECT Id, {flat('Title')}, {flat('Description')}, DefectType, ISNULL(ProductionLine,N''), ClientId, LotNumber, {flat('AnalysisNotes')} "
                            f"FROM actionplan.Claims c WHERE {LIVE}")}
    plans = {r[0].upper(): dict(id=r[0].upper(), claim=r[1].upper(), title=r[2], desc=r[3])
             for r in rows(f"SELECT p.Id, p.ClaimId, {flat('p.Title')}, {flat('p.Description')} FROM actionplan.ActionPlans p JOIN actionplan.Claims c ON c.Id=p.ClaimId WHERE p.IsArchived=0 AND {LIVE}")}
    protected = {p["claim"] for p in plans.values() if not p["title"].startswith("CAPA — ")}
    # claims whose 5 Why answers were written by a person (steps 2-4 differ from the generated wording) are left as they are
    protected |= {r[0].upper() for r in rows(
        f"SELECT DISTINCT c.Id FROM actionplan.FiveWhySteps s JOIN actionplan.FiveWhyAnalyses a ON a.Id=s.AnalysisId JOIN actionplan.Claims c ON c.Id=a.ClaimId "
        f"WHERE {LIVE} AND s.StepNumber IN (2,3,4) AND s.Answer NOT LIKE N'Le paramètre ou le réglage%' AND s.Answer NOT LIKE N'Aucune dérive%' AND s.Answer NOT LIKE N'Le suivi préventif%'")}

    ids = sorted(claims)
    total = len(ids)
    keep_target = max(0, round(KEEP_SHARE * total) - len(protected))
    eligible = sorted((c for c in ids if c not in protected and claims[c]["line"] in ("ASM-01", "ASM-03")), key=lambda c: h(c, "keep"))
    keep = set(eligible[:keep_target])
    recode = [c for c in ids if c not in protected and c not in keep]

    # exact proportions of the catalogue among the recoded claims (largest remainder), then a seeded shuffle
    weights = {d["code"]: d["count"] for d in cable}
    wsum = sum(weights.values())
    quota = {k: len(recode) * w / wsum for k, w in weights.items()}
    base = {k: int(v) for k, v in quota.items()}
    for k in sorted(quota, key=lambda k: quota[k] - base[k], reverse=True)[: len(recode) - sum(base.values())]:
        base[k] += 1
    sequence = [k for k, q in base.items() for _ in range(q)]
    random.Random(7).shuffle(sequence)

    plan_by_claim: dict[str, list[dict]] = {}
    for p in plans.values():
        plan_by_claim.setdefault(p["claim"], []).append(p)

    decided: dict[str, dict] = {}
    for cid, code in zip(sorted(recode, key=lambda c: h(c, "order")), sequence):
        c = claims[cid]
        nar = NARR["defects"][code]
        line = lines_of(code)[h(cid, "line") % len(lines_of(code))]
        client = SITES[h(cid, "client") % len(SITES)]
        zone = NARR["zones"][h(cid, "zone") % len(NARR["zones"])]
        title_t, desc_t = nar["scenarios"][h(cid, "scn") % len(nar["scenarios"])]
        v = dict(line=line, zone=zone, lot=c["lot"], client=client)
        roots = [x for x in nar["causes"] if x[2]]
        root = roots[h(cid, "root") % len(roots)]
        decided[cid] = dict(code=code, line=line, client=client, title=fill(title_t, **v), desc=fill(desc_t, **v), nar=nar, root=root,
                            note=fill(nar["note"], **v))

    print(f"live claims: {total}; kept as workshop defects: {len(keep)}; protected (hand-made plan): {len(protected)}; rewritten: {len(recode)}")
    counts = Counter(d["code"] for d in decided.values())
    print("new defects:", dict(counts.most_common()))
    if not args.apply:
        for cid in list(decided)[:3]:
            d = decided[cid]
            print("\n-", claims[cid]["title"], "->", d["title"], f"[{d['code']}, {d['line']}, {d['client']}]\n ", d["desc"])
        print("\npreview only: nothing written. Run with --apply.")
        return

    # ---- read what depends on the claims ----
    five = rows(f"SELECT a.Id, a.ClaimId FROM actionplan.FiveWhyAnalyses a JOIN actionplan.Claims c ON c.Id=a.ClaimId WHERE a.IsArchived=0 AND {LIVE}")
    steps = rows(f"SELECT s.Id, a.ClaimId, s.StepNumber FROM actionplan.FiveWhySteps s JOIN actionplan.FiveWhyAnalyses a ON a.Id=s.AnalysisId JOIN actionplan.Claims c ON c.Id=a.ClaimId WHERE {LIVE}")
    ish_an = rows(f"SELECT a.Id, a.ClaimId FROM actionplan.IshikawaAnalyses a JOIN actionplan.Claims c ON c.Id=a.ClaimId WHERE {LIVE}")
    causes = rows(f"SELECT i.Id, i.ClaimId, i.IsRootCause FROM actionplan.IshikawaCauses i JOIN actionplan.Claims c ON c.Id=i.ClaimId WHERE {LIVE} ORDER BY i.ClaimId, i.CreatedAt, i.Id")
    prios = rows(f"SELECT p.Id, p.ClaimId FROM actionplan.PriorityCauses p JOIN actionplan.Claims c ON c.Id=p.ClaimId WHERE {LIVE}")
    acts = rows(f"SELECT a.Id, p.ClaimId, p.Id, {flat('a.Title')}, a.CreatedAt FROM actionplan.PlanActions a JOIN actionplan.ActionPlans p ON p.Id=a.ActionPlanId JOIN actionplan.Claims c ON c.Id=p.ClaimId WHERE {LIVE} ORDER BY p.Id, a.CreatedAt, a.Id")

    out = ["SET NOCOUNT ON; SET XACT_ABORT ON;", f"IF EXISTS (SELECT 1 FROM sys.schemas WHERE name='{BACKUP_SCHEMA}') THROW 50000, 'Backup schema {BACKUP_SCHEMA} already exists: this rewrite was already applied.', 1;",
           f"EXEC('CREATE SCHEMA {BACKUP_SCHEMA}');", "BEGIN TRANSACTION;"]
    touched = ["Claims", "FiveWhyAnalyses", "FiveWhySteps", "IshikawaAnalyses", "IshikawaCauses", "PriorityCauses", "ActionPlans", "PlanActions",
               "Notifications", "Badges", "TimelineEvents", "ActionPlanHistories"]
    out += [f"SELECT * INTO {BACKUP_SCHEMA}.{t} FROM actionplan.{t};" for t in touched]

    def stage(name: str, cols: str, data: list[tuple]):
        out.append(f"CREATE TABLE actionplan._rt_{name} ({cols});")
        for i in range(0, len(data), 300):
            out.append(f"INSERT INTO actionplan._rt_{name} VALUES\n" + ",\n".join("(" + ",".join(r) + ")" for r in data[i:i + 300]) + ";")

    # claims
    stage("claims", "Id uniqueidentifier, Title nvarchar(300), Description nvarchar(max), Defect nvarchar(100), Line nvarchar(50), Client nvarchar(100), OldTitle nvarchar(300), OldLine nvarchar(50), Note nvarchar(max)",
          [(f"'{cid}'", n(d["title"]), n(d["desc"]), n(d["code"]), n(d["line"]), n(d["client"]), n(claims[cid]["title"]), n(claims[cid]["line"]), n(d["note"])) for cid, d in decided.items()])
    out.append("""UPDATE c SET c.Title=s.Title, c.Description=s.Description, c.DefectType=s.Defect, c.ProductionLine=s.Line, c.ClientId=s.Client,
        c.AnalysisNotes = CASE WHEN c.AnalysisNotes LIKE N'%pince / électrodes%' THEN s.Note
                               WHEN s.OldLine<>N'' THEN REPLACE(c.AnalysisNotes, s.OldLine, s.Line) ELSE c.AnalysisNotes END
        FROM actionplan.Claims c JOIN actionplan._rt_claims s ON s.Id=c.Id;""")

    # 5 Why
    out_rows = [(f"'{a}'", n(decided[c.upper()]["desc"])) for a, c in five if c.upper() in decided]
    stage("five", "Id uniqueidentifier, Problem nvarchar(max)", out_rows)
    out.append("UPDATE a SET a.ProblemStatement=s.Problem FROM actionplan.FiveWhyAnalyses a JOIN actionplan._rt_five s ON s.Id=a.Id;")
    step_rows = []
    for sid, cid, num in steps:
        d = decided.get(cid.upper())
        if not d:
            continue
        if num == "1":
            step_rows.append((f"'{sid}'", n(f"« {label[d['code']]} » est apparu sur {d['line']} au poste concerné.")))
        elif num == "5":
            step_rows.append((f"'{sid}'", n(d["root"][1])))
    stage("steps", "Id uniqueidentifier, Answer nvarchar(max)", step_rows)
    out.append("UPDATE a SET a.Answer=s.Answer FROM actionplan.FiveWhySteps a JOIN actionplan._rt_steps s ON s.Id=a.Id;")
    stage("ishan", "Id uniqueidentifier, Problem nvarchar(max)", [(f"'{a}'", n(decided[c.upper()]["desc"])) for a, c in ish_an if c.upper() in decided])
    out.append("UPDATE a SET a.ProblemStatement=s.Problem FROM actionplan.IshikawaAnalyses a JOIN actionplan._rt_ishan s ON s.Id=a.Id;")

    # Ishikawa causes: the claim's rows take its causes in order, then generic ones
    by_claim: dict[str, list[list[str]]] = {}
    for r in causes:
        by_claim.setdefault(r[1].upper(), []).append(r)
    cause_rows = []
    for cid, lst in by_claim.items():
        d = decided.get(cid)
        if not d:
            continue
        pool = [(c[0], c[1]) for c in d["nar"]["causes"]] + GENERIC_CAUSES
        had_root = any(r[2] in ("1", "True") for r in lst)
        for i, r in enumerate(lst):
            cat, text = pool[i % len(pool)] if i < len(pool) else GENERIC_CAUSES[i % len(GENERIC_CAUSES)]
            cause_rows.append((f"'{r[0]}'", n(cat), n(text), "1" if had_root and text == d["root"][1] else "0"))
    stage("ish", "Id uniqueidentifier, Category nvarchar(100), Text nvarchar(max), IsRoot bit", cause_rows)
    out.append("UPDATE i SET i.Category=s.Category, i.CauseDescription=s.Text, i.IsRootCause=s.IsRoot FROM actionplan.IshikawaCauses i JOIN actionplan._rt_ish s ON s.Id=i.Id;")
    stage("prio", "Id uniqueidentifier, Category nvarchar(100), Text nvarchar(max)",
          [(f"'{p}'", n(decided[c.upper()]["root"][0]), n(decided[c.upper()]["root"][1])) for p, c in prios if c.upper() in decided])
    out.append("UPDATE p SET p.Category=s.Category, p.CauseText=s.Text FROM actionplan.PriorityCauses p JOIN actionplan._rt_prio s ON s.Id=p.Id;")

    # plans and their actions
    plan_rows, title_map = [], []
    for p in plans.values():
        d = decided.get(p["claim"])
        m = re.match(r"^CAPA — (.*) \((.*)\)$", p["title"])
        if not d or not m:
            continue
        new_title = f"CAPA — {label[d['code']]} ({d['line']})"
        new_desc = f"Actions correctives suite à la réclamation « {d['title']} ». Client {d['client']}, lot {claims[p['claim']]['lot']}."
        plan_rows.append((f"'{p['id']}'", n(new_title), n(new_desc)))
        title_map.append((f"'{p['id']}'", f"'{p['claim']}'", n(p["title"]), n(new_title), n(claims[p["claim"]]["title"]), n(d["title"])))
    stage("plans", "Id uniqueidentifier, Title nvarchar(300), Description nvarchar(max)", plan_rows)
    out.append("UPDATE p SET p.Title=s.Title, p.Description=s.Description FROM actionplan.ActionPlans p JOIN actionplan._rt_plans s ON s.Id=p.Id;")
    stage("titles", "PlanId uniqueidentifier, ClaimId uniqueidentifier, OldPlan nvarchar(300), NewPlan nvarchar(300), OldClaim nvarchar(300), NewClaim nvarchar(300)", title_map)
    act_rows = []
    rewritten_plans = {p[0].strip("'").upper() for p in plan_rows}
    for aid, cid, pid, title, _ in acts:
        d = decided.get(cid.upper())
        if not d or pid.upper() not in rewritten_plans:
            continue
        if title.startswith("Confiner les lots suspects"):
            new = f"Confiner les lots suspects et trier le stock ({d['line']})"
        elif title.startswith("Analyser la cause racine"):
            new = f"Analyser la cause racine — {label[d['code']]}"
        elif title.startswith(GENERIC_ACTIONS):
            continue
        else:
            new = f"{d['nar']['action']} — {d['line']}"
        act_rows.append((f"'{aid}'", n(new)))
    stage("acts", "Id uniqueidentifier, Title nvarchar(300)", act_rows)
    out.append("UPDATE a SET a.Title=s.Title FROM actionplan.PlanActions a JOIN actionplan._rt_acts s ON s.Id=a.Id;")

    # copies of the titles
    out += [
        "UPDATE x SET x.Title=REPLACE(REPLACE(x.Title,t.OldClaim,t.NewClaim),t.OldPlan,t.NewPlan), x.Message=REPLACE(REPLACE(x.Message,t.OldClaim,t.NewClaim),t.OldPlan,t.NewPlan) "
        "FROM actionplan.Notifications x JOIN actionplan._rt_titles t ON x.ClaimId=t.ClaimId OR x.ActionPlanId=t.PlanId;",
        "UPDATE x SET x.PlanTitle=REPLACE(x.PlanTitle,t.OldPlan,t.NewPlan) FROM actionplan.Badges x JOIN actionplan._rt_titles t ON x.PlanId=t.PlanId;",
        "UPDATE x SET x.PlanTitle=REPLACE(x.PlanTitle,t.OldPlan,t.NewPlan), x.Title=REPLACE(x.Title,t.OldPlan,t.NewPlan), x.Description=REPLACE(x.Description,t.OldPlan,t.NewPlan) "
        "FROM actionplan.TimelineEvents x JOIN actionplan._rt_titles t ON x.PlanId=t.PlanId;",
        "UPDATE x SET x.Note=REPLACE(REPLACE(x.Note,t.OldClaim,t.NewClaim),t.OldPlan,t.NewPlan) FROM actionplan.ActionPlanHistories x JOIN actionplan._rt_titles t ON x.ActionPlanId=t.PlanId WHERE x.Note IS NOT NULL;",
    ]
    out += [f"DROP TABLE actionplan._rt_{t};" for t in ("claims", "five", "steps", "ishan", "ish", "prio", "plans", "titles", "acts")]
    out += ["COMMIT TRANSACTION;", f"SELECT 'rewritten {len(decided)} claims';"]

    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8-sig") as f:
        f.write("\n".join(out) + "\n")
        local = f.name
    subprocess.run(["docker", "cp", local, "sigrc_sqlserver:/tmp/retheme.sql"], check=True, env={**__import__("os").environ, "MSYS_NO_PATHCONV": "1"})
    print(sql(file="/tmp/retheme.sql").strip().splitlines()[-1])

    cols = {"Claims": "Title,Description,DefectType,ProductionLine,ClientId,AnalysisNotes", "FiveWhyAnalyses": "ProblemStatement", "FiveWhySteps": "Answer",
            "IshikawaAnalyses": "ProblemStatement", "IshikawaCauses": "Category,CauseDescription,IsRootCause", "PriorityCauses": "Category,CauseText",
            "ActionPlans": "Title,Description", "PlanActions": "Title", "Notifications": "Title,Message", "Badges": "PlanTitle",
            "TimelineEvents": "Title,Description,PlanTitle", "ActionPlanHistories": "Note"}
    restore = ["-- Puts back the live claims as they were before retheme_live_claims.py --apply (original rows kept in schema " + BACKUP_SCHEMA + ").", "SET XACT_ABORT ON; BEGIN TRANSACTION;"]
    for t, cs in cols.items():
        sets = ", ".join(f"t.{c}=b.{c}" for c in cs.split(","))
        restore.append(f"UPDATE t SET {sets} FROM actionplan.{t} t JOIN {BACKUP_SCHEMA}.{t} b ON b.Id=t.Id;")
    restore.append("COMMIT TRANSACTION;")
    (ROOT / "scripts" / "restore-retheme-20261027.sql").write_text("\n".join(restore) + "\n", encoding="utf-8")
    print("restore script: scripts/restore-retheme-20261027.sql")


if __name__ == "__main__":
    main()
