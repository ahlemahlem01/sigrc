"""Data mining over historical (closed) quality dossiers.

Stateless: the caller sends the history, nothing is stored or modified here.
Everything is returned as structured data (no display text) so the UI can translate it.

Rules that matter for the product:
- Honest about thin data: every block states whether it had enough history, and nothing is
  inferred below the thresholds (the UI then falls back to fully manual use).
- `restricted=True` (employees): aggregates only. No dossier id, title, lot or client is
  ever returned, and no group of fewer than MIN_SUPPORT dossiers is shown.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from collections import Counter, defaultdict
from itertools import combinations
from typing import Any

from scipy.stats import fisher_exact, poisson
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

MIN_SUPPORT = 3            # smallest group ever shown to an employee; minimum support of a rule
MIN_DOSSIERS_RULES = 20    # below this many closed dossiers no association rule is mined
MIN_DOSSIERS_CAUSES = 5    # below this many dossiers with causes no cause statistics are shown
MIN_CONFIDENCE = 0.5
MIN_LIFT = 1.5
MAX_P_VALUE = 0.05         # false-discovery rate after Benjamini-Hochberg correction
SIMILARITY_FLOOR = 0.35
SEVERITY_WEIGHT = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 5}
# Words too common in cause wordings to say anything about whether two causes are the same
GENERIC_WORDS = {"avec", "dans", "pour", "sans", "entre", "cette", "cause", "defaut", "manque", "absence", "insuffisant",
                 "insuffisante", "incomplet", "incomplete", "controle", "suite", "lors", "apres", "avant", "trop", "plus"}
OTHER = "Autres"
UNKNOWN = "Non renseigné"

# attribute key -> (field in the dossier, label key used by the UI)
ATTRIBUTES = {"line": "productionLine", "shift": "shift", "client": "clientId", "severity": "severity"}


def _fold(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", text)).strip()


def _clean(value: Any) -> str:
    text = str(value).strip() if value is not None else ""
    return text if text else UNKNOWN


def _num(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


# ───────────────────────────── weighted Pareto ─────────────────────────────

def weighted_pareto(history: list[dict], field: str, restricted: bool) -> list[dict]:
    """Frequency, impact (defective quantity × severity weight) and PPM per category."""
    groups: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0, "impact": 0.0, "defective": 0.0, "produced": 0.0})
    for d in history:
        g = groups[_clean(d.get(field))]
        g["count"] += 1
        weight = SEVERITY_WEIGHT.get(str(d.get("severity", "")).upper(), 2)
        # a dossier without a recorded quantity counts as one unit (same rule as the Pareto chart)
        g["impact"] += max(1.0, _num(d.get("defective"))) * weight
        g["defective"] += _num(d.get("defective"))
        g["produced"] += _num(d.get("produced"))

    rows = [{"category": k, **v} for k, v in groups.items()]
    if restricted:
        kept = [r for r in rows if r["count"] >= MIN_SUPPORT]
        small = [r for r in rows if r["count"] < MIN_SUPPORT]
        if small:
            merged = {"category": OTHER, "count": sum(r["count"] for r in small),
                      "impact": sum(r["impact"] for r in small), "defective": sum(r["defective"] for r in small),
                      "produced": sum(r["produced"] for r in small)}
            if merged["count"] >= MIN_SUPPORT:
                kept.append(merged)
        rows = kept

    rows.sort(key=lambda r: (r["category"] == OTHER, -r["impact"], -r["count"]))
    total_impact = sum(r["impact"] for r in rows) or 1.0
    cumulative = 0.0
    out = []
    for r in rows:
        cumulative += r["impact"]
        out.append({
            "category": r["category"],
            "count": int(r["count"]),
            "impact": round(r["impact"], 1),
            "ppm": round(r["defective"] / r["produced"] * 1_000_000) if r["produced"] > 0 else None,
            "sharePct": round(r["impact"] / total_impact * 100, 1),
            "cumulativePct": round(cumulative / total_impact * 100, 1),
        })
    return out


# ───────────────────────────── association rules ─────────────────────────────

def association_rules(history: list[dict], current: dict | None) -> list[dict]:
    """Rules {line=WR-04, shift=Nuit} → defect=Soudure, kept only if frequent, strong and significant."""
    n = len(history)
    if n < MIN_DOSSIERS_RULES:
        return []

    rows = []
    for d in history:
        attrs = {k: _clean(d.get(f)) for k, f in ATTRIBUTES.items()}
        rows.append((attrs, _clean(d.get("defectType"))))

    defect_count = Counter(defect for _, defect in rows)
    keys = list(ATTRIBUTES)
    antecedents: list[tuple[tuple[str, str], ...]] = []
    seen: set[tuple] = set()
    for attrs, _ in rows:
        for size in (1, 2):
            for combo in combinations(keys, size):
                items = tuple((k, attrs[k]) for k in combo if attrs[k] != UNKNOWN)
                if len(items) == size and items not in seen:
                    seen.add(items)
                    antecedents.append(items)

    ant_count: Counter = Counter()
    both_count: Counter = Counter()
    for attrs, defect in rows:
        for items in antecedents:
            if all(attrs[k] == v for k, v in items):
                ant_count[items] += 1
                both_count[(items, defect)] += 1

    # Every (antecedent, defect) pair with enough support is a tested hypothesis: p-values are
    # corrected for the number of tests (Benjamini-Hochberg), otherwise noise produces "rules".
    tested = []
    for (items, defect), both in both_count.items():
        if both < MIN_SUPPORT or defect == UNKNOWN:
            continue
        ant = ant_count[items]
        confidence = both / ant
        lift = confidence / (defect_count[defect] / n)
        table = [[both, ant - both], [defect_count[defect] - both, n - ant - defect_count[defect] + both]]
        p_value = float(fisher_exact(table, alternative="greater")[1])
        tested.append({"items": items, "defect": defect, "support": both, "antecedentCount": ant,
                       "confidence": confidence, "lift": lift, "pValue": p_value})

    tested.sort(key=lambda r: r["pValue"])
    m = len(tested)
    cutoff = 0
    for rank, r in enumerate(tested, start=1):
        if r["pValue"] <= MAX_P_VALUE * rank / m:
            cutoff = rank
    significant = tested[:cutoff]
    found = [r for r in significant if r["confidence"] >= MIN_CONFIDENCE and r["lift"] >= MIN_LIFT]

    # a 2-attribute rule is only worth showing if it clearly beats each of its 1-attribute parts
    best_single = {(r["items"][0], r["defect"]): r["confidence"] for r in found if len(r["items"]) == 1}
    kept = []
    for r in found:
        if len(r["items"]) == 2:
            if r["support"] < MIN_SUPPORT + 1:
                continue  # a pair of attributes needs one more case than a single one
            parts = [best_single.get((i, r["defect"]), 0.0) for i in r["items"]]
            if r["confidence"] < max(parts) + 0.1:
                continue
        kept.append(r)

    def matches_current(r: dict) -> bool:
        if not current:
            return False
        same_defect = _clean(current.get("defectType")) == r["defect"]
        same_context = all(_clean(current.get(ATTRIBUTES[k])) == v for k, v in r["items"])
        return same_defect or same_context

    kept.sort(key=lambda r: (not matches_current(r), -(r["lift"] * r["confidence"])))
    return [{
        "antecedent": [{"key": k, "value": v} for k, v in r["items"]],
        "defect": r["defect"],
        "support": r["support"],
        "antecedentCount": r["antecedentCount"],
        "confidence": round(r["confidence"], 3),
        "lift": round(r["lift"], 2),
        "pValue": round(r["pValue"], 4),
        "matchesCurrent": matches_current(r),
    } for r in kept[:8]]


# ───────────────────────────── root causes ─────────────────────────────

def _cluster_texts(texts: list[str]) -> list[int]:
    """Greedy clustering of near-identical cause wordings (TF-IDF cosine)."""
    folded = [_fold(t) for t in texts]
    if len(folded) <= 1 or not any(folded):
        return list(range(len(folded)))
    matrix = TfidfVectorizer(ngram_range=(1, 2), min_df=1).fit_transform(folded)
    sim = cosine_similarity(matrix)
    labels = [-1] * len(folded)
    next_label = 0
    for i in range(len(folded)):
        if labels[i] != -1:
            continue
        labels[i] = next_label
        for j in range(i + 1, len(folded)):
            if labels[j] == -1 and sim[i, j] >= 0.6:
                labels[j] = next_label
        next_label += 1
    return labels


def root_causes(history: list[dict], current: dict | None, restricted: bool) -> dict:
    """What the root causes were on comparable past dossiers (same defect when known)."""
    defect = _clean(current.get("defectType")) if current else None
    pool = [d for d in history if d.get("causes") and (defect is None or _clean(d.get("defectType")) == defect)]
    if len(pool) < MIN_DOSSIERS_CAUSES:
        return {"sufficient": False, "dossiers": len(pool), "categories": [], "causes": []}

    entries = [(i, c) for i, d in enumerate(pool) for c in d["causes"]]
    labels = _cluster_texts([c.get("text", "") for _, c in entries])

    clusters: dict[int, list[tuple[int, dict]]] = defaultdict(list)
    for (idx, cause), label in zip(entries, labels):
        clusters[label].append((idx, cause))

    min_group = MIN_SUPPORT if restricted else 1
    causes = []
    for members in clusters.values():
        dossiers = {i for i, _ in members}
        if len(dossiers) < min_group:
            continue
        root_dossiers = {i for i, c in members if c.get("isRoot")}
        text = Counter(str(c.get("text", "")).strip() for _, c in members).most_common(1)[0][0]
        category = Counter(str(c.get("category", "")) for _, c in members).most_common(1)[0][0]
        causes.append({"category": category, "text": text, "dossiers": len(dossiers),
                       "rootDossiers": len(root_dossiers),
                       "sharePct": round(len(dossiers) / len(pool) * 100, 1)})
    causes.sort(key=lambda c: (-c["rootDossiers"], -c["dossiers"]))

    cat_dossiers: dict[str, set[int]] = defaultdict(set)
    for i, c in entries:
        if c.get("isRoot"):
            cat_dossiers[str(c.get("category", ""))].add(i)
    categories = [{"category": k, "dossiers": len(v), "sharePct": round(len(v) / len(pool) * 100, 1)}
                  for k, v in cat_dossiers.items() if len(v) >= min_group]
    categories.sort(key=lambda c: -c["dossiers"])

    return {"sufficient": True, "dossiers": len(pool), "defect": defect, "categories": categories, "causes": causes[:6]}


# ───────────────────────────── similar cases ─────────────────────────────

def similar_cases(history: list[dict], current: dict | None, restricted: bool) -> dict:
    """Closest closed dossiers (defect, line, client, wording). Employees only get a summary."""
    if not current or len(history) < MIN_SUPPORT:
        return {"available": False, "count": 0, "cases": [], "causes": []}

    def doc(d: dict) -> str:
        defect = _fold(d.get("defectType"))
        return f"{defect} {defect} {_fold(d.get('productionLine'))} {_fold(d.get('clientId'))} {_fold(d.get('title'))} {_fold(d.get('description'))}"

    docs = [doc(d) for d in history] + [doc(current)]
    matrix = TfidfVectorizer(ngram_range=(1, 2)).fit_transform(docs)
    sims = cosine_similarity(matrix[-1], matrix[:-1]).ravel()

    scored = []
    for d, s in zip(history, sims):
        bonus = 0.0
        if _fold(d.get("defectType")) == _fold(current.get("defectType")):
            bonus += 0.3
        if d.get("productionLine") and _fold(d.get("productionLine")) == _fold(current.get("productionLine")):
            bonus += 0.15
        score = min(1.0, float(s) + bonus)
        if score >= SIMILARITY_FLOOR:
            scored.append((score, d))
    scored.sort(key=lambda x: -x[0])
    top = scored[:5] if not restricted else scored[:10]

    # root causes seen on those similar dossiers (aggregated, groups of >= MIN_SUPPORT for employees)
    counter: Counter = Counter()
    for _, d in top:
        for c in d.get("causes", []):
            if c.get("isRoot"):
                counter[(str(c.get("category", "")), str(c.get("text", "")).strip())] += 1
    min_group = MIN_SUPPORT if restricted else 1
    causes = [{"category": k[0], "text": k[1], "dossiers": v} for k, v in counter.most_common(5) if v >= min_group]

    if restricted:
        enough = len(top) >= MIN_SUPPORT
        return {"available": enough, "count": len(top) if enough else 0, "cases": [], "causes": causes if enough else []}

    cases = [{
        "id": d.get("id"),
        "title": d.get("title"),
        "lot": d.get("lotNumber"),
        "client": d.get("clientId"),
        "line": d.get("productionLine"),
        "defect": d.get("defectType"),
        "detectionDate": d.get("detectionDate"),
        "similarity": round(score, 2),
        "rootCauses": [{"category": c.get("category"), "text": c.get("text")} for c in d.get("causes", []) if c.get("isRoot")],
    } for score, d in top]
    return {"available": bool(cases), "count": len(cases), "cases": cases, "causes": causes}


# ───────────────────────────── trend ─────────────────────────────

TREND_RECENT_MONTHS = 3
TREND_BASELINE_MONTHS = 9
TREND_MIN_BASELINE = 3
TREND_MIN_RECENT = 3


def _month_index(value: Any) -> int | None:
    """Months since year 0 for an ISO date/datetime string, or None."""
    try:
        d = date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None
    return d.year * 12 + d.month - 1


def _month_label(index: int) -> str:
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def _poisson_trend(recent: int, baseline: int) -> dict | None:
    """Is the recent count unusual compared with the baseline rate? One-sided Poisson tests."""
    expected = baseline * TREND_RECENT_MONTHS / TREND_BASELINE_MONTHS
    if baseline < TREND_MIN_BASELINE or expected <= 0:
        return None
    p_up = float(poisson.sf(recent - 1, expected))
    p_down = float(poisson.cdf(recent, expected))
    if p_up < MAX_P_VALUE and recent >= TREND_MIN_RECENT:
        direction, p_value = "up", p_up
    elif p_down < MAX_P_VALUE:
        direction, p_value = "down", p_down
    else:
        direction, p_value = "stable", min(p_up, p_down)
    return {"recent": recent, "baseline": baseline, "expected": round(expected, 1),
            "ratio": round(recent / expected, 2), "pValue": round(p_value, 4), "direction": direction}


def trend(history: list[dict], current: dict | None, restricted: bool = False) -> dict:
    """Recent 3 months versus the 9 months before, relative to the latest dossier in the history."""
    dated = [(m, d) for d in history if (m := _month_index(d.get("detectionDate"))) is not None]
    if len(dated) < MIN_DOSSIERS_RULES:
        return {"sufficient": False, "dossiers": len(dated), "defect": None, "monthly": [], "current": None, "rising": []}

    reference = max(m for m, _ in dated)
    recent_from = reference - TREND_RECENT_MONTHS + 1
    base_from = recent_from - TREND_BASELINE_MONTHS

    def counts(defect: str | None) -> tuple[int, int, dict[int, int]]:
        recent = baseline = 0
        monthly: dict[int, int] = defaultdict(int)
        for m, d in dated:
            if defect is not None and _clean(d.get("defectType")) != defect:
                continue
            if m >= recent_from:
                recent += 1
            elif m >= base_from:
                baseline += 1
            if m >= reference - 11:
                monthly[m] += 1
        return recent, baseline, monthly

    defect = _clean(current.get("defectType")) if current and current.get("defectType") else None
    cur = None
    monthly_rows: list[dict] = []
    if defect:
        r, b, monthly = counts(defect)
        cur = _poisson_trend(r, b)
        if not restricted:  # month-by-month counts could single out one dossier: employees get the summary only
            monthly_rows = [{"month": _month_label(i), "count": monthly.get(i, 0)} for i in range(reference - 11, reference + 1)]

    # which defects are rising, across all defects (Benjamini-Hochberg over the tested defects)
    tested = []
    for name in {_clean(d.get("defectType")) for _, d in dated}:
        if name == UNKNOWN:
            continue
        r, b, _ = counts(name)
        res = _poisson_trend(r, b)
        if res and res["direction"] == "up":
            tested.append({"defect": name, **res})
    tested.sort(key=lambda x: x["pValue"])
    cutoff = 0
    for rank, item in enumerate(tested, start=1):
        if item["pValue"] <= MAX_P_VALUE * rank / len(tested):
            cutoff = rank
    rising = sorted(tested[:cutoff], key=lambda x: -x["ratio"])[:5]

    return {"sufficient": True, "dossiers": len(dated), "defect": defect, "monthly": monthly_rows, "current": cur,
            "rising": rising, "windowMonths": {"recent": TREND_RECENT_MONTHS, "baseline": TREND_BASELINE_MONTHS},
            "reference": _month_label(reference)}


# ───────────────────────────── repeated lots ─────────────────────────────

def repeated_lots(history: list[dict], current: dict | None, restricted: bool) -> dict:
    """Lots involved in several closed dossiers. Employees only get aggregates (>= MIN_SUPPORT lots)."""
    by_lot: dict[str, list[dict]] = defaultdict(list)
    for d in history:
        lot = _fold(d.get("lotNumber"))
        if lot:
            by_lot[lot].append(d)
    repeated = {lot: ds for lot, ds in by_lot.items() if len(ds) >= 2}

    current_lot = _fold(current.get("lotNumber")) if current else ""
    on_current = len(by_lot.get(current_lot, [])) if current_lot else 0

    if restricted:
        enough = len(repeated) >= MIN_SUPPORT
        return {"count": len(repeated) if enough else 0, "lots": [],
                "currentLotDossiers": on_current if on_current >= MIN_SUPPORT else 0}

    lots = [{
        "lot": ds[0].get("lotNumber"),
        "dossiers": len(ds),
        "defects": sorted({_clean(x.get("defectType")) for x in ds}),
        "client": _clean(ds[0].get("clientId")),
    } for ds in sorted(repeated.values(), key=lambda ds: -len(ds))[:8]]
    return {"count": len(repeated), "lots": lots, "currentLotDossiers": on_current}


# ───────────────────────────── evidence for the analyst's own causes ─────────────────────────────

def cause_evidence(history: list[dict], current: dict | None, restricted: bool) -> dict:
    """For each cause the analyst listed (Ishikawa), how often a similar cause was found on comparable
    closed dossiers, and how often it was the root cause. Turns the Ishikawa list into a ranked one."""
    candidates = [c for c in ((current or {}).get("causeCandidates") or []) if str(c.get("text", "")).strip()]
    if not candidates:
        return {"sufficient": False, "pool": 0, "min": MIN_DOSSIERS_CAUSES, "items": []}

    defect = _clean(current.get("defectType")) if current and current.get("defectType") else None
    pool = [d for d in history if d.get("causes") and (defect is None or _clean(d.get("defectType")) == defect)]
    if len(pool) < MIN_DOSSIERS_CAUSES:
        return {"sufficient": False, "pool": len(pool), "min": MIN_DOSSIERS_CAUSES,
                "items": [{"id": c.get("id"), "category": c.get("category"), "text": c.get("text"),
                           "dossiers": None, "rootDossiers": None, "shareRootPct": None} for c in candidates]}

    entries = [(i, c) for i, d in enumerate(pool) for c in d["causes"]]

    def tokens(text: Any) -> set[str]:
        # meaningful words, with plural endings removed ("électrodes" ~ "électrode")
        words = (w for w in _fold(text).split() if len(w) >= 4 and w not in GENERIC_WORDS)
        return {w[:-1] if w.endswith(("s", "x")) and len(w) > 4 else w for w in words}

    cand_tokens = [tokens(c.get("text", "")) for c in candidates]
    entry_tokens = [tokens(c.get("text", "")) for _, c in entries]

    items = []
    for ci, cand in enumerate(candidates):
        seen: set[int] = set()
        roots: set[int] = set()
        for ei, (di, cause) in enumerate(entries):
            # A paraphrase counts as the same cause when most of its meaningful words are found in the recorded one
            # ("Usure électrodes" ~ "Usure des électrodes de soudure"); same family (6M) makes it a bit more lenient.
            ct = cand_tokens[ci]
            et = entry_tokens[ei]
            if not ct or not et:
                continue
            shared = len(ct & et)
            # Overlap relative to the SHORTER wording, so a long, specific cause ("Usure électrodes pince robot WR-04
            # au-delà du seuil TPM") still matches a short recorded one ("Usure des électrodes de soudure").
            # Two shared words are needed (or a one-word cause that is entirely contained).
            overlap = shared / min(len(ct), len(et))
            enough = shared >= 2 or (shared == 1 and min(len(ct), len(et)) == 1)
            same_cat = str(cause.get("category", "")) == str(cand.get("category", ""))
            if enough and (overlap >= 0.6 or (same_cat and overlap >= 0.35)):
                seen.add(di)
                if cause.get("isRoot"):
                    roots.add(di)
        hidden = restricted and len(seen) < MIN_SUPPORT
        items.append({
            "id": cand.get("id"), "category": cand.get("category"), "text": cand.get("text"),
            "dossiers": None if hidden else len(seen),
            "rootDossiers": None if (restricted and len(roots) < MIN_SUPPORT) else len(roots),
            "shareRootPct": None if (restricted and len(roots) < MIN_SUPPORT) else round(len(roots) / len(pool) * 100, 1),
            "_rank": (len(roots), len(seen)),
        })
    items.sort(key=lambda x: x["_rank"], reverse=True)
    for it in items:
        del it["_rank"]
    return {"sufficient": True, "pool": len(pool), "min": MIN_DOSSIERS_CAUSES, "items": items}


# ───────────────────────────── entry point ─────────────────────────────

def mine(history: list[dict], current: dict | None = None, restricted: bool = False) -> dict[str, Any]:
    n = len(history)
    return {
        "meta": {
            "dossiers": n,
            "withCauses": sum(1 for d in history if d.get("causes")),
            "minSupport": MIN_SUPPORT,
            "minDossiersRules": MIN_DOSSIERS_RULES,
            "rulesSufficient": n >= MIN_DOSSIERS_RULES,
            "restricted": restricted,
        },
        "weightedPareto": {
            "defectType": weighted_pareto(history, "defectType", restricted),
            "productionLine": weighted_pareto(history, "productionLine", restricted),
        },
        "rules": association_rules(history, current),
        "rootCauses": root_causes(history, current, restricted),
        "similar": similar_cases(history, current, restricted),
        "trend": trend(history, current, restricted),
        "repeatedLots": repeated_lots(history, current, restricted),
        "causeEvidence": cause_evidence(history, current, restricted),
    }
