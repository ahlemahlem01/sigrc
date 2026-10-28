"""POST /reload: the service loads best.pt again without stopping, and a model that cannot be loaded never replaces the one in use."""
import pytest
from fastapi.testclient import TestClient

import app as cv_app


class FakeModel:
    def __init__(self, path, names):
        self.path, self.names = path, names


@pytest.fixture
def service(monkeypatch):
    built = []

    def fake_build(path):
        names = {0: "foreign", 1: "hole"} if not built else {0: "foreign", 1: "hole", 2: "scratch"}
        built.append(FakeModel(path, names))
        return built[-1]

    monkeypatch.setattr(cv_app, "_build_model", fake_build)
    monkeypatch.delenv("CV_RELOAD_TOKEN", raising=False)
    with TestClient(cv_app.app) as client:
        yield client, built


def test_reload_swaps_in_the_new_model_and_its_classes(service):
    client, built = service
    assert client.get("/health").json()["defectClasses"] == ["foreign", "hole"]
    reply = client.post("/reload")
    assert reply.status_code == 200 and reply.json()["status"] == "reloaded"
    assert len(built) == 2 and cv_app.state["model"] is built[1]
    health = client.get("/health").json()
    assert health["defectClasses"] == ["foreign", "hole", "scratch"] and health["loadedAt"]


def test_a_model_that_fails_to_load_leaves_the_current_one_in_place(service, monkeypatch):
    client, built = service

    def broken(path):
        raise RuntimeError("corrupt weights")

    monkeypatch.setattr(cv_app, "_build_model", broken)
    reply = client.post("/reload")
    assert reply.status_code == 500 and "previous one is still in use" in reply.json()["detail"]
    assert cv_app.state["model"] is built[0]
    assert client.get("/health").json()["defectClasses"] == ["foreign", "hole"]


def test_reload_asks_for_the_token_when_one_is_configured(service, monkeypatch):
    client, _ = service
    monkeypatch.setenv("CV_RELOAD_TOKEN", "s3cret")
    assert client.post("/reload").status_code == 403
    assert client.post("/reload", headers={"X-Reload-Token": "wrong"}).status_code == 403
    assert client.post("/reload", headers={"X-Reload-Token": "s3cret"}).status_code == 200
