"""Shared test fixtures.

Every test starts from clean global state (no injected store, no BYOK keys),
and database-backed tests additionally get their own throwaway SQLite file —
so tests never touch ``data/takeoff.sqlite3`` and never depend on run order.
"""

from __future__ import annotations

import asyncio
import sys
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest

from src.api.routes import reset_byok_state, set_takeoff_store
from src.store.takeoff_store import TakeoffStore

if sys.platform == "win32":
    # The default proactor loop needs socketpair() at startup, which locked-down
    # environments forbid. The test suite only needs threads, so prefer the
    # selector loop for portability.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@pytest.fixture(autouse=True)
def clean_global_state(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    set_takeoff_store(None)
    reset_byok_state()
    monkeypatch.setenv("MODEL_API_KEY", "")
    monkeypatch.setenv("META_API_KEY", "")
    yield
    set_takeoff_store(None)
    reset_byok_state()


@pytest.fixture()
async def isolated_takeoff_store(tmp_path: Path) -> AsyncIterator[TakeoffStore]:
    """Throwaway database, injected as the app's store for one test."""
    store = TakeoffStore(db_path=tmp_path / "takeoff.sqlite3")
    await store.initialize()
    set_takeoff_store(store)
    try:
        yield store
    finally:
        set_takeoff_store(None)
