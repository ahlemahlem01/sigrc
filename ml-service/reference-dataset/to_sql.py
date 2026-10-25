"""Turns reference_claims.csv into a SQL script that loads the claims into the application database as ONE import batch.

The batch is named "REFERENCE-DATASET ..." so the data can always be told apart, and, being an import batch, it can be
archived and restored as a whole from the application (nothing is ever deleted). The script refuses to run twice.

Usage:
  python to_sql.py --claims reference_claims.csv --out load_reference_dataset.sql [--batch-name "REFERENCE-DATASET (seed 7)"]
  sqlcmd -f 65001 -d <database> -i load_reference_dataset.sql
"""
from __future__ import annotations

import argparse
import uuid

import pandas as pd

ROWS_PER_INSERT = 400

# display wording of the defect codes (claims store the code; titles and descriptions use the label)
LABELS = {
    "CUT_INSULATION": "Coupure / Entaille sur gaine", "COPPER_BLOOMING": "Brins de cuivre cassés / désaffleurants",
    "MARKING_DEFECT": "Défaut de marquage (illisible / absent)", "SPOOL_DAMAGE": "Touret / Emballage endommagé",
    "COLOR_MISMATCH": "Couleur d'isolant non conforme",
}


def q(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)) or value is pd.NaT:
        return "NULL"
    return "N'" + str(value).replace("'", "''") + "'"


def ts(value) -> str:
    if value is None or pd.isna(value):
        return "NULL"
    return "'" + pd.Timestamp(value).strftime("%Y-%m-%dT%H:%M:%S") + "'"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--claims", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--batch-name", default="REFERENCE-DATASET - jeu de donnees de reference, defauts cable (seed 7)")
    a = ap.parse_args()

    df = pd.read_csv(a.claims, dtype=str, keep_default_na=False)
    batch_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "sigrc-reference-dataset/" + a.batch_name)).upper()
    out = [
        "SET NOCOUNT ON; SET XACT_ABORT ON;",
        f"IF EXISTS (SELECT 1 FROM actionplan.ImportBatches WHERE FileName = {q(a.batch_name)}) "
        "THROW 50000, 'This reference dataset batch is already loaded.', 1;",
        "BEGIN TRANSACTION;",
    ]
    columns = ("Id,Title,ClientId,DefectType,Severity,LotNumber,Description,StatusCode,AssignedToId,AssignedToName,"
               "AssignedAt,Deadline,CompletedAt,IsOnTime,DetectionDate,CreatedAt,CreatedBy,IsArchived,"
               "ProductionLine,Shift,ProducedQuantity,DefectiveQuantity")
    claim_ids = []
    for start in range(0, len(df), ROWS_PER_INSERT):
        values = []
        for _, r in df.iloc[start:start + ROWS_PER_INSERT].iterrows():
            # ids are derived from the batch, so two batches built from the same seed never collide
            cid = str(uuid.uuid5(uuid.UUID(batch_id), r["claim_id"])).upper()
            claim_ids.append(cid)
            lot = f"LOT-{pd.Timestamp(r['created_at']):%y%V}-{int(uuid.UUID(cid).int % 900) + 100}"
            on_time = "NULL" if r["is_on_time"] == "" else ("1" if r["is_on_time"].lower() == "true" else "0")
            values.append(
                "(" + ",".join([
                    f"'{cid}'", q(f"{LABELS.get(r['defect_type'], r['defect_type'])} - {r['production_line']}"), q(r["client_id"]), q(r["defect_type"]),
                    q(r["severity"]), q(lot),
                    q(f"Defaut {LABELS.get(r['defect_type'], r['defect_type']).lower()} detecte sur la ligne {r['production_line']} (donnees de reference)."),
                    "N'CLOTUREE'", q(r["assigned_to_id"]), q(r["assigned_to_name"]), ts(r["assigned_at"]),
                    ts(r["deadline"] or None), ts(r["completed_at"]), on_time, ts(r["detection_date"]), ts(r["created_at"]),
                    "N'reference-dataset'", "0", q(r["production_line"]), q(r["shift"]), r["produced_quantity"], r["defective_quantity"],
                ]) + ")")
        out.append(f"INSERT INTO actionplan.Claims ({columns}) VALUES\n" + ",\n".join(values) + ";")

    out.append(
        "INSERT INTO actionplan.ImportBatches (Id,Kind,FileName,CreatedAt,CreatedBy,ClaimCount,CauseCount,IsArchived) VALUES "
        f"('{batch_id}', N'claims-history', {q(a.batch_name)}, SYSUTCDATETIME(), N'reference-dataset', {len(df)}, 0, 0);")
    for start in range(0, len(claim_ids), 1000):
        chunk = claim_ids[start:start + 1000]
        out.append("INSERT INTO actionplan.ImportBatchClaims (BatchId,ClaimId) VALUES\n"
                   + ",\n".join(f"('{batch_id}','{c}')" for c in chunk) + ";")
    out += ["COMMIT TRANSACTION;", f"SELECT 'loaded {len(df)} reference claims in batch {batch_id}';"]
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"{len(df)} claims -> {a.out} (batch {batch_id})")


if __name__ == "__main__":
    main()
