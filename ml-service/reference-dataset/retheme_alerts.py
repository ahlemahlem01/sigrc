"""Rewrites the anomaly alerts of the application with cable defects.

The nine alerts were written for an assembly workshop (cold solder, loose connector...). Each one gets a cable defect and the line of its
process; its volume figures (z-score, counts, baseline), status, validation history, dates and everything people typed (comments, reports
they wrote, attachments they added) are kept. One alert keeps its workshop defect, as in the datasets.

    python retheme_alerts.py            # preview
    python retheme_alerts.py --apply    # backs up the touched tables in schema bak20261027b, then rewrites

../../scripts/restore-retheme-alerts-20261027.sql (written by --apply) puts the original rows back.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import retheme_live_claims as base  # noqa: E402

BACKUP = "bak20261027b"
PREFIX = "A1111111-1111-4111-8111-1111111111"

# alert -> (defect code, short label used in the texts, line, AI problem, AI probable cause, AI consequences)
# the first three keep the wording style of the alerts written by hand; the others are short sentences.
PLAN = {
    "01": ("CONDUCTOR_DIAMETER", "Diamètre du conducteur hors tolérance", "WR-04",
           "Hausse inhabituelle : {n} réclamations « {label} » sur {line} cette semaine, contre environ {b} en moyenne.",
           "Il est possible qu'une usure de filière ou une dérive du micromètre laser sur {line} génère des diamètres hors tolérance. À vérifier avant de conclure.",
           "Sans action, les écarts de diamètre peuvent entraîner des retours client, un surcoût qualité et des retards de livraison sur les lots concernés."),
    "02": ("COPPER_OXIDATION", "Oxydation du cuivre", "WR-06",
           "Hausse inhabituelle : {n} réclamations « {label} » sur {line} cette semaine, contre environ {b} en moyenne.",
           "Il est possible qu'un défaut d'atmosphère du four de recuit ou un stockage prolongé des bobines sur {line} favorise l'oxydation du cuivre. Cette piste doit être vérifiée sur le terrain.",
           "Si rien n'est fait, le risque de réclamation client augmente. Le coût de non-qualité (retravail, rebut) et d'éventuels retards de livraison peuvent s'aggraver rapidement."),
    "03": ("COPPER_OXIDATION", "Oxydation du cuivre", "WR-06",
           "Le nombre de réclamations « {label} » sur {line} est nettement au-dessus du niveau habituel cette semaine.",
           "Hypothèse à vérifier : un lot de bobines stocké trop longtemps ou une atmosphère de recuit dégradée sur {line} oxyde le cuivre. À confirmer avec les réclamations et le poste concerné.",
           "Si la hausse se confirme, le défaut peut se répéter sur les prochains lots et retarder le traitement des réclamations ouvertes."),
    "04": ("COPPER_BROKEN", "Brins de cuivre cassés", "WR-06",
           "Le nombre de réclamations « {label} » sur {line} dépasse nettement le niveau habituel cette semaine.",
           "Hypothèse à vérifier : une tension de toronnage trop élevée ou un lot de fil machine fragile touche les produits de {line}. À confirmer sur les réclamations ouvertes.",
           "Si la hausse continue, des lots supplémentaires peuvent être bloqués et le traitement des réclamations va s'accumuler."),
    "05": ("SCRATCH_INSULATION", "Rayures sur la gaine", "EXT-02",
           "Des rayures apparaissent sur la gaine des câbles de la semaine.",
           "Guide d'extrusion usé ou poulie de renvoi encrassée sur {line}.",
           "Gaine abîmée refusée au contrôle et risque de retour client."),
    "07": ("SPARK_TEST_FAILURE", "Défaut à l'essai d'étincelage", "EXT-01",
           "Les câbles claquent à l'essai d'étincelage de façon répétée cette semaine.",
           "Granulés d'isolant humides ou température d'extrusion hors fenêtre sur {line}.",
           "Longueurs rebutées et risque de défaut d'isolation chez le client."),
    "08": ("CUT_INSULATION", "Coupure de gaine", "CUT-01",
           "La gaine est entaillée sur plusieurs longueurs de la semaine.",
           "Lame de coupe émoussée ou guide de coupe mal réglé sur {line}.",
           "Conducteur exposé et risque de court-circuit."),
    "09": ("INSULATION_THICKNESS", "Épaisseur d'isolant hors tolérance", "EXT-02",
           "L'épaisseur d'isolant sort de la tolérance sur plusieurs bobines.",
           "Filière usée ou vitesse de ligne non asservie à la pression de l'extrudeuse sur {line}.",
           "Isolement insuffisant et retours client."),
}
# alert 06 (Étiquette manquante) keeps its workshop defect; only the line shown in its text is corrected ("Bureau RH" -> ASM-01)

# what people did not type but the seed wrote: comments, reports and attachments tied to the old defects
COMMENTS = {"05": ("La soudure cède au contrôle visuel.", "Des rayures sont visibles sur la gaine au contrôle visuel."),
            "07": ("Le connecteur se defait des qu on tire legerement le cable.", "Le câble claque à l'étincelage dès la sortie de la filière.")}
REPORTS = {"05": ("Les soudures se décollent au contrôle visuel sur plusieurs pièces de cette semaine.", "Les rayures apparaissent après le passage sur les poulies de renvoi de EXT-02, sur plusieurs longueurs de cette semaine."),
           "08": ("La gaine se fend au pliage sur les pièces du matin.", "La gaine est entaillée au tronçonnage sur les longueurs du matin.")}
ATTACHMENTS = {"05": ("soudure-froide.txt", "rayures-gaine.txt", "Note de controle de la gaine."),
               "07": ("connecteur-desserre.txt", "essai-etincelage.txt", "Releve de l'essai d'etincelage.")}
# how the old alerts were written in notifications and in the history ("<defect> / <line>")
OLD_NAMES = {"01": ["Dimension hors tolerance / WR-04", "Dimension hors tolérance / WR-04"],
             "02": ["Isolation endommagée / WR-06", "Isolation endommagee / WR-06"], "03": ["Isolation endommagée / WR-06", "Isolation endommagee / WR-06"],
             "04": ["Contamination surface / WR-06", "Contaminations surface / WR-06"],
             "05": ["Soudure froide / ASM-01", "Soudure froide / Bureau RH"], "06": ["Étiquette manquante / Bureau RH", "Etiquette manquante / Bureau RH"],
             "07": ["Connecteur desserré / ASM-01", "Connecteur desserré / Bureau RH"], "08": ["Gaine fissurée / ASM-01", "Gaine fissuree / Bureau RH", "Gaine fissurée / Bureau RH"],
             "09": ["Sertissage incomplet / ASM-01", "Sertissage incomplet / Bureau RH"]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    n, sql, rows = base.n, base.sql, base.rows

    alerts = {r[0][-2:]: dict(id=r[0], count=int(r[1]), base=float(r[2]), z=float(r[3]), desc=r[4], defect=r[5], line=r[6])
              for r in rows(f"SELECT Id, CurrentCount, BaselineMean, ZScore, REPLACE(Description,CHAR(10),N' '), DefectType, ProductionLine FROM actionplan.Alerts WHERE Id LIKE '{PREFIX}%'")}
    if sorted(alerts) != [f"{i:02d}" for i in range(1, 10)]:
        sys.exit(f"expected the nine seeded alerts, found {sorted(alerts)}")

    new_desc, replacements, updates = {}, [], []
    for k, a in alerts.items():
        if k == "06":
            code, label, line = a["defect"], "Étiquette manquante", a["line"]
        else:
            code, label, line, *_ = PLAN[k]
        week = a["desc"].split(" en 2026-W", 1)
        when = f"en 2026-W{week[1][:2]}" if len(week) > 1 else "cette semaine" if "cette semaine" in a["desc"] else ""
        counted = f"{a['count']} claim(s) {when}".strip()
        new_desc[k] = f"Anomalie de volume claims : {label} / {line} — {counted} (moyenne 4 sem. = {a['base']:.1f}, z = {a['z']:.2f})."
        short = f"{label} / {line}"
        for old in OLD_NAMES[k]:
            replacements.append((old, short))
        if k == "06":
            fixed = "Des pièces sortent sans étiquette d'identification."  # the seeded text ended with a stray character
            updates.append(f"UPDATE actionplan.Alerts SET Description={n(new_desc[k])}, AiProblem={n(fixed)} WHERE Id='{a['id']}';")
            updates.append(f"UPDATE actionplan.AlertTimelineEvents SET Detail={n(short_06 := f'{label} / {line}')} WHERE AlertId='{a['id']}' AND EventType='detected';")
            updates.append(f"UPDATE actionplan.AlertTimelineEvents SET Detail={n(fixed)} WHERE AlertId='{a['id']}' AND EventType='analysis_updated';")
            continue
        ai = [t.format(n=a["count"], label=label, line=line, b=f"{a['base']:g}".replace(".", ",")) for t in PLAN[k][3:6]]
        updates.append(f"UPDATE actionplan.Alerts SET DefectType={n(code)}, ProductionLine={n(line)}, Description={n(new_desc[k])}, "
                       f"AiProblem={n(ai[0])}, AiProbableCause={n(ai[1])}, AiConsequences={n(ai[2])} WHERE Id='{a['id']}';")
        updates.append(f"UPDATE actionplan.AlertTimelineEvents SET Detail={n(new_desc[k] if k in ('01', '02', '03', '04') else short)} WHERE AlertId='{a['id']}' AND EventType='detected';")
        updates.append(f"UPDATE actionplan.AlertTimelineEvents SET Detail={n(ai[0])} WHERE AlertId='{a['id']}' AND EventType='analysis_updated';")
        print(f"{k}: {a['defect']} / {a['line']}  ->  {code} / {line}\n    {new_desc[k]}")

    for k, (old, new) in COMMENTS.items():
        aid = alerts[k]["id"]
        updates += [f"UPDATE actionplan.AlertComments SET Body={n(new)} WHERE AlertId='{aid}' AND Body={n(old)};",
                    f"UPDATE actionplan.AlertTimelineEvents SET Detail={n(new)} WHERE AlertId='{aid}' AND EventType='comment_added' AND Detail={n(old)};"]
    for k, (old, new) in REPORTS.items():
        aid = alerts[k]["id"]
        updates += [f"UPDATE actionplan.AlertReports SET Content={n(new)} WHERE AlertId='{aid}' AND Content={n(old)};",
                    f"UPDATE actionplan.AlertTimelineEvents SET Detail={n(new)} WHERE AlertId='{aid}' AND Detail={n(old)};"]
    for k, (old, new, text) in ATTACHMENTS.items():
        aid = alerts[k]["id"]
        updates += [f"UPDATE actionplan.AlertAttachments SET FileName={n(new)}, Data=CAST({n(text)} AS varbinary(max)), ContentType=N'text/plain' WHERE AlertId='{aid}' AND FileName={n(old)};",
                    f"UPDATE actionplan.AlertTimelineEvents SET Detail={n(new)} WHERE AlertId='{aid}' AND EventType='attachment_added' AND Detail={n(old)};"]
    for old, new in dict.fromkeys(replacements):
        updates.append(f"UPDATE actionplan.Notifications SET Title=REPLACE(Title,{n(old)},{n(new)}), Message=REPLACE(Message,{n(old)},{n(new)}) "
                       f"WHERE Title LIKE N'%{old}%' OR Message LIKE N'%{old}%';")

    if not args.apply:
        print(f"\npreview only: {len(updates)} statements, nothing written. Run with --apply.")
        return

    tables = ["Alerts", "AlertTimelineEvents", "AlertComments", "AlertReports", "AlertAttachments", "Notifications"]
    out = ["SET NOCOUNT ON; SET XACT_ABORT ON;",
           f"IF EXISTS (SELECT 1 FROM sys.schemas WHERE name='{BACKUP}') THROW 50000, 'Backup schema {BACKUP} already exists: already applied.', 1;",
           f"EXEC('CREATE SCHEMA {BACKUP}');", "BEGIN TRANSACTION;"]
    out += [f"SELECT * INTO {BACKUP}.{t} FROM actionplan.{t};" for t in tables]
    out += updates + ["COMMIT TRANSACTION;", "SELECT 'alerts rewritten';"]
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8-sig") as f:
        f.write("\n".join(out) + "\n")
    import os
    subprocess.run(["docker", "cp", f.name, "sigrc_sqlserver:/tmp/retheme_alerts.sql"], check=True, env={**os.environ, "MSYS_NO_PATHCONV": "1"})
    print(sql(file="/tmp/retheme_alerts.sql").strip().splitlines()[-1])

    cols = {"Alerts": "DefectType,ProductionLine,Description,AiProblem,AiProbableCause,AiConsequences", "AlertTimelineEvents": "Detail",
            "AlertComments": "Body", "AlertReports": "Content", "AlertAttachments": "FileName,Data,ContentType", "Notifications": "Title,Message"}
    restore = ["-- Puts back the anomaly alerts as they were before retheme_alerts.py --apply (original rows in schema " + BACKUP + ").", "SET XACT_ABORT ON; BEGIN TRANSACTION;"]
    for t, cs in cols.items():
        restore.append(f"UPDATE t SET {', '.join(f't.{c}=b.{c}' for c in cs.split(','))} FROM actionplan.{t} t JOIN {BACKUP}.{t} b ON b.Id=t.Id;")
    restore.append("COMMIT TRANSACTION;")
    (base.ROOT / "scripts" / "restore-retheme-alerts-20261027.sql").write_text("\n".join(restore) + "\n", encoding="utf-8")
    print("restore script: scripts/restore-retheme-alerts-20261027.sql")


if __name__ == "__main__":
    main()
