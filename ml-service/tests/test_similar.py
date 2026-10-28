"""Similar-photo search: the index, the ranking, and what /predict returns when the model is not sure."""
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app as cv_app
from embeddings import SimilarIndex, similar_cases, thumbnail_data_uri

COLORS = {"red": (220, 30, 30), "green": (30, 200, 40), "blue": (30, 40, 220), "dark-red": (150, 20, 25)}
CODES = {"red": "CUT_INSULATION", "green": "FOREIGN_MATTER", "blue": "SCRATCH_INSULATION", "dark-red": "CUT_INSULATION"}


def fake_embed(images):
    """A photo -> its mean colour: enough to know who looks like whom."""
    return np.stack([np.asarray(i.convert("RGB").resize((1, 1))).reshape(-1) for i in images]).astype(np.float32)


def photo(color):
    return Image.new("RGB", (300, 200), COLORS[color])


@pytest.fixture
def index(tmp_path):
    entries = [({"id": f"case-{name}", "source": "claim" if name in ("red", "green") else "reference", "reference": f"REC-{name}",
                 "defect_code": CODES[name], "severity": "HIGH"}, photo(name)) for name in COLORS]
    return SimilarIndex.build(tmp_path / "index", entries, fake_embed, "sig-1")


def test_index_is_saved_and_loaded_with_its_photos(index):
    loaded = SimilarIndex.load(index.folder)
    assert loaded.model_signature == "sig-1" and loaded.counts() == {"items": 4, "claims": 2, "references": 2}
    assert loaded.vectors.shape == (4, 3) and loaded.photo_path(loaded.items[0]).exists()
    assert SimilarIndex.load(index.folder / "nothing") is None


def test_the_closest_photos_are_the_ones_of_the_same_colour(index):
    query = fake_embed([Image.new("RGB", (50, 50), (210, 40, 35))])[0]        # a red photo
    ranked = [index.items[row]["id"] for row, _ in index.search(query, 4)]
    assert ranked[:2] == ["case-red", "case-dark-red"] and ranked[-1] in ("case-green", "case-blue")
    scores = [s for _, s in index.search(query, 4)]
    assert scores == sorted(scores, reverse=True) and scores[0] > 0.9 > scores[-1]


def test_similar_cases_follow_the_contract(index):
    query = fake_embed([photo("green")])[0]
    cases = similar_cases(index, query, {"FOREIGN_MATTER": "Corps étranger dans l'isolant"}, k=3)
    assert len(cases) == 3
    first = cases[0]
    assert set(first) == {"id_reclamation", "photo_url", "code_defaut", "libelle_defaut", "score_similarite", "source", "reference", "severite"}
    assert first["id_reclamation"] == "case-green" and first["code_defaut"] == "FOREIGN_MATTER" and first["libelle_defaut"] == "Corps étranger dans l'isolant"
    assert first["source"] == "claim" and first["reference"] == "REC-green" and 90 <= first["score_similarite"] <= 100
    assert first["photo_url"].startswith("data:image/jpeg;base64,")
    assert all(0 <= c["score_similarite"] <= 100 for c in cases)


def test_reembedding_follows_a_new_model(index):
    before = index.vectors.copy()
    index.reembed(lambda images: fake_embed(images) * 2, "sig-2")
    assert index.model_signature == "sig-2" and np.allclose(index.vectors, before * 2, atol=2)
    assert SimilarIndex.load(index.folder).model_signature == "sig-2"


def test_the_thumbnail_is_small(index):
    uri = thumbnail_data_uri(index.photo_path(index.items[0]))
    assert len(uri) < 20_000


# ---- /predict --------------------------------------------------------------------------------------------------------------------------

class _Boxes:
    def __init__(self, found):
        self.cls = type("T", (), {"tolist": lambda s, f=found: [c for c, _ in f]})()
        self.conf = type("T", (), {"tolist": lambda s, f=found: [p for _, p in f]})()


class FakeModel:
    names = {0: "foreign", 1: "hole"}

    def __init__(self, found):
        self.found = found

    def predict(self, image, conf, verbose):
        result = type("R", (), {})()
        result.names = self.names
        result.boxes = _Boxes(self.found)
        return [result]


def _png(color="red"):
    buffer = io.BytesIO()
    photo(color).save(buffer, "PNG")
    return buffer.getvalue()


@pytest.fixture
def client(index, monkeypatch):
    holder = {"found": []}
    monkeypatch.setattr(cv_app, "_build_model", lambda path: FakeModel(holder["found"]))
    monkeypatch.setattr(cv_app, "_embed", lambda model, images: fake_embed(images))
    monkeypatch.setattr(cv_app, "INDEX_DIR", index.folder)
    with TestClient(cv_app.app) as c:
        yield c, holder


def _predict(client, color="red"):
    return client.post("/predict", files={"file": ("photo.png", _png(color), "image/png")}).json()


def test_an_unsure_proposal_comes_with_the_similar_cases(client):
    c, holder = client
    holder["found"][:] = [(1, 0.5)]                       # "hole" at 50 %
    answer = _predict(c)
    assert answer["available"] and answer["defectType"] == "CUT_INSULATION" and answer["confidence"] == 0.5
    assert 1 <= len(answer["similar_cases"]) <= 4 and answer["similar_cases"][0]["id_reclamation"] == "case-red"


def test_a_confident_proposal_has_no_similar_cases(client):
    c, holder = client
    holder["found"][:] = [(1, 0.9)]
    assert "similar_cases" not in _predict(c)


def test_nothing_recognised_still_shows_similar_cases(client):
    c, _ = client
    answer = _predict(c, "green")
    assert answer["available"] is False and answer["similar_cases"][0]["code_defaut"] == "FOREIGN_MATTER"


def test_without_an_index_the_answer_is_the_same_as_before(monkeypatch, tmp_path):
    monkeypatch.setattr(cv_app, "_build_model", lambda path: FakeModel([(1, 0.5)]))
    monkeypatch.setattr(cv_app, "INDEX_DIR", tmp_path / "empty")
    with TestClient(cv_app.app) as c:
        answer = _predict(c)
        assert answer["available"] and "similar_cases" not in answer and c.get("/health").json()["similarIndex"] is None


def test_the_health_reports_the_index_and_a_new_model_embeds_it_again(client, index, monkeypatch):
    c, _ = client
    assert c.get("/health").json()["similarIndex"] == {"items": 4, "claims": 2, "references": 2}
    assert SimilarIndex.load(index.folder).model_signature != "sig-1"         # loaded with other weights: embedded again at start-up
    seen = []
    monkeypatch.setattr(cv_app, "_embed", lambda model, images: seen.append(len(images)) or fake_embed(images))
    monkeypatch.setattr(cv_app, "weights_signature", lambda path: "another-model")
    assert c.post("/reload").json()["similarIndex"]["items"] == 4 and seen == [4]


def test_embedding_does_not_break_the_next_prediction_of_the_real_model():
    """YOLO.embed() leaves the predictor in feature mode: a prediction after an embedding used to fail (found with the demo photos)."""
    from pathlib import Path
    weights = Path(__file__).resolve().parent.parent / "best.pt"
    sample = next((Path(__file__).resolve().parent.parent / "dataset" / "test" / "images").glob("*.jpg"), None) if weights.exists() else None
    if sample is None:
        pytest.skip("best.pt or the test photos are not here")
    from ultralytics import YOLO
    from embeddings import yolo_embedder
    model = YOLO(str(weights))
    image = Image.open(sample).convert("RGB")
    model.predict(image, conf=0.1, verbose=False)
    yolo_embedder(model)([image])
    assert hasattr(model.predict(image, conf=0.1, verbose=False)[0], "boxes")


# ---- refresh with the photos of the claims ----------------------------------------------------------------------------------------------

def test_refreshing_the_claims_keeps_the_reference_examples_and_drops_stale_claims(index):
    new_claim = ({"id": "case-new", "source": "claim", "reference": "REC-new", "defect_code": "CUT_INSULATION", "severity": "LOW"}, photo("blue"))
    index.refresh_claims([new_claim], fake_embed, "sig-1")
    assert index.counts() == {"items": 3, "claims": 1, "references": 2}
    loaded = SimilarIndex.load(index.folder)
    assert [i["id"] for i in loaded.items if i["source"] == "claim"] == ["case-new"] and loaded.vectors.shape == (3, 3)
    assert len(list((index.folder / "photos").glob("*.jpg"))) == 3                 # the photos of the two removed claims are gone
    assert all(loaded.photo_path(i).exists() for i in loaded.items)


def test_the_refresh_endpoint_reads_the_claims_through_the_api(client, monkeypatch):
    c, _ = client
    import index_reclamations
    monkeypatch.setattr(index_reclamations, "claim_entries",
                        lambda api, key: [({"id": "c1", "source": "claim", "reference": "REC-1", "defect_code": "FOREIGN_MATTER", "severity": "HIGH"}, photo("green"))])
    assert c.post("/index/refresh").status_code == 502                              # no API address or key configured
    monkeypatch.setenv("COFICAB_API_URL", "http://api.test/api")
    monkeypatch.setenv("COFICAB_DATASET_KEY", "k")
    monkeypatch.setenv("CV_RELOAD_TOKEN", "secret")
    assert c.post("/index/refresh").status_code == 403
    answer = c.post("/index/refresh", headers={"X-Reload-Token": "secret"}).json()
    assert answer["similarIndex"] == {"items": 3, "claims": 1, "references": 2}
    assert c.get("/health").json()["similarIndex"]["claims"] == 1
