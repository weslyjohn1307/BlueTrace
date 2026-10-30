"""Shared test fixtures.

Every test runs against its own throwaway SQLite database and a clean BYOK
state, so tests never touch ``data/takeoff.sqlite3`` and never depend on the
order they happen to run in.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator

import pytest

from src.api.routes import reset_byok_state, set_takeoff_store
from src.store.takeoff_store import TakeoffStore


@pytest.fixture(autouse=True)
def isolated_takeoff_store(tmp_path) -> Iterator[TakeoffStore]:
    store = TakeoffStore(db_path=tmp_path / "takeoff.sqlite3")
    asyncio.run(store.initialize())
    set_takeoff_store(store)
    reset_byok_state()
    try:
        yield store
    finally:
        set_takeoff_store(None)
        reset_byok_state()
