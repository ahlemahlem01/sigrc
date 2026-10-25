"""Evaluation of the "on time" model with features that only use what was known at assignment time.

Reads a CSV of closed claims (columns of generate.py: defect_type, severity, assigned_to_id, assigned_at, deadline,
completed_at, is_on_time) and writes a Markdown report. The same script can evaluate real history exported in the
same columns.

Features (never computed with the claim's own outcome or with anything that happened after its assignment):
  user_rate    smoothed share of on-time claims among the employee's claims already completed at assignment time
  user_n       number of such claims
  workload_at  claims of the employee still open at assignment time
  alloc_days   days between assignment and deadline
  severity, defect_type

Usage: python evaluate.py --claims reference_claims.csv [--truth truth.csv] --report REPORT.md
"""
from __future__ import annotations

import argparse
import warnings
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

warnings.filterwarnings("ignore")
SMOOTHING = 6  # an employee with few closed claims is pulled towards the team average (see smoothing_sweep.py)
MIN_PRIOR_N = 30      # rows assigned before this many outcomes are known have no usable team average: not used
OPEN_WINDOW_DAYS = 90  # a claim open for longer than this is stale, not current workload


def build_features(df: pd.DataFrame, smoothing: float = SMOOTHING) -> pd.DataFrame:
    d = df.copy()
    for c in ("assigned_at", "deadline", "completed_at"):
        d[c] = pd.to_datetime(d[c])
    d = d[d["is_on_time"].notna() & d["assigned_to_id"].notna()].sort_values("assigned_at").reset_index(drop=True)
    d["y"] = d["is_on_time"].astype(str).str.lower().isin(["true", "1", "1.0"]).astype(int)
    # team average as it was at each assignment: only claims already completed (same rule as the application)
    done = d.sort_values("completed_at")
    done_t, done_cum = done["completed_at"].to_numpy(), done["y"].cumsum().to_numpy()
    user_rate, user_n, workload = [], [], []
    by_user = {u: g for u, g in d.groupby("assigned_to_id")}
    for _, r in d.iterrows():
        g = by_user[r["assigned_to_id"]]
        past = g[g["completed_at"] < r["assigned_at"]]
        n, k = len(past), int(past["y"].sum())
        m = int(np.searchsorted(done_t, np.datetime64(r["assigned_at"]), side="left"))
        prior = np.nan if m < MIN_PRIOR_N else done_cum[m - 1] / m
        user_rate.append((k + prior * smoothing) / (n + smoothing) if n + smoothing > 0 else prior)
        user_n.append(n)
        workload.append(int(((g["assigned_at"] <= r["assigned_at"])
                             & (g["assigned_at"] > r["assigned_at"] - pd.Timedelta(days=OPEN_WINDOW_DAYS))
                             & (g["completed_at"] > r["assigned_at"])).sum()) - 1)
    d["user_rate"], d["user_n"], d["workload_at"] = user_rate, user_n, np.maximum(workload, 0)
    d["alloc_days"] = ((d["deadline"] - d["assigned_at"]).dt.total_seconds() / 86400).clip(lower=0)
    return d[d["user_rate"].notna()].reset_index(drop=True)  # early rows without a team average are not used


def pipeline(cat: list[str], num: list[str], model) -> Pipeline:
    parts = []
    if num:
        parts.append(("n", Pipeline([("i", SimpleImputer(strategy="median")), ("s", StandardScaler())]), num))
    if cat:
        parts.append(("c", Pipeline([("i", SimpleImputer(strategy="most_frequent")),
                                     ("o", OneHotEncoder(handle_unknown="ignore"))]), cat))
    return Pipeline([("p", ColumnTransformer(parts)), ("m", model)])


def cross_validate(d: pd.DataFrame, cat, num, make_model, seed=1):
    y = d["y"].to_numpy()
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=4, random_state=seed)
    auc, brier, acc = [], [], []
    oof = np.zeros(len(d))
    counts = np.zeros(len(d))
    for tr, te in cv.split(d, y):
        pipe = pipeline(cat, num, make_model()).fit(d.iloc[tr][cat + num], y[tr])
        p = pipe.predict_proba(d.iloc[te][cat + num])[:, 1]
        auc.append(roc_auc_score(y[te], p))
        brier.append(brier_score_loss(y[te], p))
        acc.append(accuracy_score(y[te], p >= 0.5))
        oof[te] += p
        counts[te] += 1
    return dict(auc=float(np.mean(auc)), auc_sd=float(np.std(auc)), brier=float(np.mean(brier)), acc=float(np.mean(acc))), oof / counts


def time_split(d: pd.DataFrame, cat, num, make_model):
    cut = int(len(d) * 0.7)
    tr, te = d.iloc[:cut], d.iloc[cut:]
    pipe = pipeline(cat, num, make_model()).fit(tr[cat + num], tr["y"])
    p = pipe.predict_proba(te[cat + num])[:, 1]
    return dict(auc=float(roc_auc_score(te["y"], p)), brier=float(brier_score_loss(te["y"], p)),
                acc=float(accuracy_score(te["y"], p >= 0.5)), base_acc=float(max(te["y"].mean(), 1 - te["y"].mean())))


def top3_comparison(d: pd.DataFrame, k: int = 3) -> dict:
    """Were claims handled by an employee the model ranks in the top k of the team delivered on time more often?

    Train on the oldest 70 % of claims. For every later claim, score every employee of the team as it was at assignment
    time (same claim, each employee's own history then), rank them, and see where the employee who actually got the
    claim stands. This is observational: assignments were not made by the model, so it shows how well the ranking
    agrees with outcomes, not what would happen if the model chose.
    """
    cat, num = ["severity", "defect_type"], ["alloc_days", "user_rate", "user_n", "workload_at"]
    cut = int(len(d) * 0.7)
    train, test = d.iloc[:cut], d.iloc[cut:]
    pipe = pipeline(cat, num, LogisticRegression(max_iter=2000, C=0.5)).fit(train[cat + num], train["y"])

    done = d.sort_values("completed_at")
    done_t, done_cum = done["completed_at"].to_numpy(), done["y"].cumsum().to_numpy()
    team = {u: (g["assigned_at"].to_numpy(), g["completed_at"].to_numpy(), g["y"].to_numpy()) for u, g in d.groupby("assigned_to_id")}
    window = np.timedelta64(OPEN_WINDOW_DAYS, "D")

    in_top, outcome, ranks = [], [], []
    for _, r in test.iterrows():
        t = np.datetime64(r["assigned_at"])
        m = int(np.searchsorted(done_t, t, side="left"))
        if m < MIN_PRIOR_N:
            continue
        prior = done_cum[m - 1] / m
        cand = []
        for u, (a, c, y) in team.items():
            past = c < t
            n, ok = int(past.sum()), int(y[past].sum())
            opened = int(((a <= t) & (a > t - window) & (c > t)).sum())
            if u == r["assigned_to_id"]:
                opened = max(opened - 1, 0)  # the claim itself
            cand.append({"u": u, "severity": r["severity"], "defect_type": r["defect_type"], "alloc_days": r["alloc_days"],
                         "user_rate": (ok + prior * SMOOTHING) / (n + SMOOTHING), "user_n": n, "workload_at": opened})
        frame = pd.DataFrame(cand)
        frame["p"] = pipe.predict_proba(frame[cat + num])[:, 1]
        order = frame.sort_values("p", ascending=False)["u"].tolist()
        rank = order.index(r["assigned_to_id"]) + 1
        ranks.append(rank)
        in_top.append(rank <= k)
        outcome.append(int(r["y"]))

    top, y = np.array(in_top), np.array(outcome)
    a, b = y[top], y[~top]
    pa, pb = a.mean(), b.mean()
    se = float(np.sqrt(pa * (1 - pa) / len(a) + pb * (1 - pb) / len(b)))
    return dict(n=len(y), team=len(team), k=k, n_top=int(top.sum()), n_rest=int((~top).sum()), rate_top=float(pa),
                rate_rest=float(pb), diff=float(pa - pb), lo=float(pa - pb - 1.96 * se), hi=float(pa - pb + 1.96 * se),
                share_top=float(top.mean()), expected_share=min(1.0, k / len(team)), median_rank=float(np.median(ranks)))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--claims", required=True)
    ap.add_argument("--truth")
    ap.add_argument("--report", required=True)
    ap.add_argument("--source-label", default="données simulées (generate.py)")
    a = ap.parse_args()

    d = build_features(pd.read_csv(a.claims, dtype={"assigned_to_id": str}))
    base = max(d["y"].mean(), 1 - d["y"].mean())
    claim_cat, claim_num = ["severity", "defect_type"], ["alloc_days"]
    emp_num = ["user_rate", "user_n", "workload_at"]
    configs = {
        "Réclamation seule (gravité, défaut, délai alloué), régression logistique":
            (claim_cat, claim_num, lambda: LogisticRegression(max_iter=2000, C=0.5)),
        "Réclamation + employé, régression logistique":
            (claim_cat, claim_num + emp_num, lambda: LogisticRegression(max_iter=2000, C=0.5)),
        "Réclamation + employé, gradient boosting":
            (claim_cat, claim_num + emp_num, lambda: GradientBoostingClassifier(
                n_estimators=120, max_depth=2, learning_rate=0.05, subsample=0.8, random_state=0)),
    }
    results, oof_main = {}, None
    for name, (cat, num, mk) in configs.items():
        cvres, oof = cross_validate(d, cat, num, mk)
        results[name] = (cvres, time_split(d, cat, num, mk))
        if name.startswith("Réclamation + employé, régression"):
            oof_main = oof

    lines = [
        "# Évaluation du modèle « livré à l'heure »", "",
        f"Source : **{a.source_label}**. {len(d)} réclamations clôturées avec échéance connue, "
        f"taux de livraison à l'heure {d['y'].mean():.1%}. Modèle trivial (toujours la classe majoritaire) : exactitude {base:.1%}.", "",
        "> Ces chiffres concernent des données **simulées** : ils montrent que la chaîne de traitement retrouve des relations "
        "connues, pas la performance sur l'historique réel de Coficab. Sur l'historique réel, ré-entraîner puis relire ce rapport.", "",
        "## Validation croisée (5 plis, 4 répétitions)", "",
        "| Modèle | AUC | Brier | Exactitude |", "|---|---|---|---|",
    ]
    for name, (cv, _) in results.items():
        lines.append(f"| {name} | {cv['auc']:.3f} ± {cv['auc_sd']:.3f} | {cv['brier']:.3f} | {cv['acc']:.3f} |")
    lines += ["", "L'AUC vaut 0,5 pour le hasard. Le Brier mesure la qualité des probabilités (plus bas = mieux).", "",
              "## Découpage dans le temps (70 % les plus anciens pour apprendre, 30 % les plus récents pour tester)", "",
              "| Modèle | AUC | Brier | Exactitude | Modèle trivial |", "|---|---|---|---|---|"]
    for name, (_, ts) in results.items():
        lines.append(f"| {name} | {ts['auc']:.3f} | {ts['brier']:.3f} | {ts['acc']:.3f} | {ts['base_acc']:.3f} |")

    d["p_oof"] = oof_main
    d["bin"] = pd.qcut(d["p_oof"], 5, duplicates="drop")
    cal = d.groupby("bin", observed=True).agg(n=("y", "size"), predit=("p_oof", "mean"), observe=("y", "mean"))
    lines += ["", "## Calibration (probabilité prédite en 5 groupes égaux, modèle réclamation + employé)", "",
              "| Groupe | Réclamations | Probabilité prédite | Taux observé |", "|---|---|---|---|"]
    for i, (_, r) in enumerate(cal.iterrows(), 1):
        lines.append(f"| {i} | {int(r['n'])} | {r['predit']:.2f} | {r['observe']:.2f} |")

    q = d.copy()
    q["quartile"] = pd.qcut(q["user_rate"], 4, labels=["Q1 (plus bas)", "Q2", "Q3", "Q4 (plus haut)"], duplicates="drop")
    qt = q.groupby("quartile", observed=True)["y"].agg(["size", "mean"])
    lines += ["", "## L'historique de l'employé ordonne-t-il ses résultats ?", "",
              "Réclamations regroupées par taux de ponctualité passé de l'employé au moment de l'assignation.", "",
              "| Groupe | Réclamations | Taux à l'heure observé |", "|---|---|---|"]
    for k, r in qt.iterrows():
        lines.append(f"| {k} | {int(r['size'])} | {r['mean']:.2f} |")

    t3 = top3_comparison(d)
    lines += ["", f"## Le top {t3['k']} du modèle contre le reste (claims du dernier 30 %, équipe de {t3['team']})", "",
              f"Pour chaque réclamation, tous les employés sont classés par probabilité prédite telle qu'elle était à l'assignation. "
              f"On regarde si l'employé qui a réellement traité la réclamation était dans le top {t3['k']}.", "",
              "| Employé assigné | Réclamations | Livrées à l'heure |", "|---|---|---|",
              f"| Dans le top {t3['k']} du modèle | {t3['n_top']} | {t3['rate_top']:.1%} |",
              f"| Hors du top {t3['k']} | {t3['n_rest']} | {t3['rate_rest']:.1%} |", "",
              f"Écart : **{t3['diff'] * 100:+.1f} points** (intervalle de confiance à 95 % : {t3['lo'] * 100:+.1f} à {t3['hi'] * 100:+.1f}). "
              f"Rang médian de l'employé assigné : {t3['median_rank']:.0f} sur {t3['team']}. "
              f"Part des cas dans le top {t3['k']} : {t3['share_top']:.0%} (hasard : {t3['expected_share']:.0%}).", "",
              "*Observation, pas expérience : les assignations n'ont pas été faites par le modèle. Ce tableau montre que le classement "
              "est cohérent avec les résultats, pas ce qui arriverait si le modèle choisissait.*"]

    if a.truth:
        truth = pd.read_csv(a.truth, dtype={"user_id": str})
        last = d.sort_values("assigned_at").groupby("assigned_to_id").tail(1).set_index("assigned_to_id")
        j = last.join(truth.set_index("user_id"), how="inner")
        corr = float(np.corrcoef(j["user_rate"], j["hidden_ability"])[0, 1])
        lines += ["", "## Test de récupération (uniquement possible sur données simulées)", "",
                  f"Corrélation entre le taux de ponctualité estimé de chaque employé et sa capacité cachée dans le jeu de référence : **{corr:.2f}** "
                  f"({len(j)} employés). Une valeur nettement positive montre que la chaîne retrouve l'effet qui a été introduit."]

    lines += ["", "## Limites", "",
              "- Les effets sont modestes : le délai respecté dépend surtout de facteurs que ces données ne contiennent pas.",
              "- Un modèle utile au classement des employés doit améliorer l'AUC grâce aux variables **de l'employé** "
              "(ligne « réclamation seule » comparée à « réclamation + employé »).",
              "- Les données réelles de Coficab devront être importées avec l'employé assigné, la date d'assignation et l'échéance.",
              f"- Rapport généré le {datetime.now():%Y-%m-%d}."]
    with open(a.report, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
