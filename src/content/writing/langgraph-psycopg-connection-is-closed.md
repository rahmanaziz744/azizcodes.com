---
title: 'LangGraph and psycopg: "the connection is closed" on the second asyncio.run'
description: Why a cached AsyncPostgresSaver fails on the second asyncio.run or the second async test, and how caching the compiled graph per event loop fixes it.
pubDate: 2026-09-17
draft: true
tags: [langgraph, psycopg, asyncio, python]
---

If you use LangGraph's Postgres checkpointer and cache the compiled graph, you may see this the second time anything runs:

```text
psycopg.OperationalError: the connection is closed
```

The first request, the first test or the first `asyncio.run` works. The second fails. The database is fine, and restarting the process makes it go away until it happens again.

I hit this in the test suite of my [support agent](/projects/support-agent/), and in scripts that called `asyncio.run` more than once. This post covers the pattern that causes it, the mechanism, and the fix.

## The pattern that breaks

Compiling a graph against a checkpointer opens a database connection, so it is natural to do it once and keep the result:

```python
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

_graph = None

async def get_graph():
    global _graph
    if _graph is None:
        saver_cm = AsyncPostgresSaver.from_conn_string(DB_URL)
        saver = await saver_cm.__aenter__()
        _graph = build_graph().compile(checkpointer=saver)
    return _graph
```

In a long-running server this works indefinitely: one process, one event loop, one connection. It breaks as soon as a second event loop appears in the same process. Two common ways that happens:

- A script that calls `asyncio.run(...)` twice, for example once to seed data and once to process it.
- pytest-asyncio, whose default gives every test function its own event loop.

## Why the connection is closed

The comment I left in the code at the time said psycopg's async connection is bound to the loop that opened it. That is the right intuition, but the exact mechanism is more specific, and it explains why the error says "closed" rather than anything about loops.

`AsyncPostgresSaver.from_conn_string` is an async generator wrapped as a context manager (abridged from `langgraph-checkpoint-postgres`):

```python
@classmethod
@asynccontextmanager
async def from_conn_string(cls, conn_string, *, pipeline=False, serde=None):
    async with await AsyncConnection.connect(
        conn_string, autocommit=True, prepare_threshold=0, row_factory=dict_row
    ) as conn:
        yield cls(conn=conn, serde=serde)
```

Calling `__aenter__()` and caching the result leaves that generator suspended at `yield`, inside `async with conn`.

Now look at what `asyncio.run` does when your coroutine finishes. It does not simply close the loop. It first finalises every async generator that was started on it:

```python
# asyncio.Runner.close(), CPython 3.13
_cancel_all_tasks(loop)
loop.run_until_complete(loop.shutdown_asyncgens())
loop.run_until_complete(loop.shutdown_default_executor(constants.THREAD_JOIN_TIMEOUT))
```

`shutdown_asyncgens()` calls `aclose()` on the suspended `from_conn_string` generator. That raises `GeneratorExit` at the `yield`, which leaves the `async with conn` block, which closes the connection. It happens cleanly, on the old loop, with no warning.

The module-level `_graph` survives, because it is just a Python object. The next `asyncio.run` finds the cached graph, the graph uses its saver, the saver uses a connection that was closed on the way out of the previous run, and psycopg reports exactly that. pytest-asyncio 1.x tears down each test's loop through an `asyncio.Runner` as well, so the same thing happens between tests.

You can watch the mechanism without Postgres:

```python
import asyncio
from contextlib import asynccontextmanager


class Conn:
    closed = False

    async def execute(self):
        if self.closed:
            raise RuntimeError("the connection is closed")
        return "ok"


@asynccontextmanager
async def from_conn_string():
    conn = Conn()
    try:
        yield conn
    finally:
        conn.closed = True  # what leaving `async with conn` does


_cached = None


async def use():
    global _cached
    if _cached is None:
        _cached = await from_conn_string().__aenter__()
    return await _cached.execute()


print(asyncio.run(use()))  # ok
print(asyncio.run(use()))  # RuntimeError: the connection is closed
```

## The fix: cache per event loop

The cache has to remember which loop it was built on and rebuild when that changes. This is [`get_compiled_graph`](https://github.com/rahmanaziz744/AI-Customer-Support-Assistant/blob/2a145b9b8bad4a804b3fdf0ed9ffd4ac7f312471/app/agents/graph.py#L161-L204) from the project, lightly abridged:

```python
_compiled = None
_compiled_loop: asyncio.AbstractEventLoop | None = None
_saver_cm = None


async def get_compiled_graph():
    global _compiled, _compiled_loop, _saver_cm

    loop = asyncio.get_running_loop()
    if _compiled is not None and _compiled_loop is loop:
        return _compiled

    if _saver_cm is not None:
        # Abandon the previous loop's connection rather than leaking it.
        await _close_saver()

    _saver_cm = AsyncPostgresSaver.from_conn_string(settings.sync_database_url)
    saver = await _saver_cm.__aenter__()

    _compiled = build_graph().compile(checkpointer=saver)
    _compiled_loop = loop
    return _compiled


async def _close_saver() -> None:
    global _saver_cm
    with contextlib.suppress(Exception):
        await _saver_cm.__aexit__(None, None, None)
    _saver_cm = None
```

In the server this still compiles once: there is one loop, so every call after the first is a cache hit. Tests and scripts get a fresh graph and a fresh connection per loop. The old connection belonged to a loop that no longer exists, so any error while releasing it is suppressed. Dropping the reference is what matters.

One more trap from the same function, while you are here: do not call the checkpointer's `setup()` lazily inside a request. It issues `CREATE INDEX CONCURRENTLY`, which waits for every open transaction to finish, including the one the request is holding. On a fresh database that is a permanent hang, and it hides until the first deploy, because on an already-migrated database `setup()` does nothing. Run it once at startup instead.

## Alternatives

- **Do not cache.** Enter the checkpointer with `async with` for each run. This is correct and fine at low traffic, but it pays for a new connection every time.
- **Open it in the application's lifespan.** In FastAPI, entering the checkpointer in the lifespan handler ties it to the server's loop explicitly and closes it on shutdown. That is clean for the server, but scripts and tests still need their own path.
- **Share one loop across tests.** pytest-asyncio can run tests on a session-scoped loop. That hides the problem in the test suite without fixing it for scripts.

The per-loop cache gives the server, the tests and the scripts one code path.

## The same rule for locks and semaphores

The graph was not the only module-level async object in the project. An `asyncio.Lock` or `asyncio.Semaphore` created once and reused has a related problem, with a louder error. Since Python 3.10 these primitives bind to an event loop, and using one from another loop raises:

```python
# asyncio.mixins._LoopBoundMixin._get_loop(), CPython 3.13
if loop is not self._loop:
    raise RuntimeError(f'{self!r} is bound to a different event loop')
```

The catch is when binding happens. An uncontended `acquire()` takes a fast path that never touches the loop. The primitive binds only the first time a task actually has to wait. A cached lock can therefore pass every test where nothing contends for it, and fail in the first one where two tasks do.

The project's concurrency limit uses the same per-loop pattern as the graph:

```python
def run_slots() -> asyncio.Semaphore:
    global _run_slots, _run_slots_loop

    loop = asyncio.get_running_loop()
    if _run_slots is None or _run_slots_loop is not loop:
        _run_slots = asyncio.Semaphore(get_settings().max_concurrent_runs)
        _run_slots_loop = loop
    return _run_slots
```

## A related trap on Windows

One more event-loop problem from the same project, in case a search brought you here from Windows. psycopg's async mode cannot run on Windows' default `ProactorEventLoop`, and says so:

```text
psycopg.InterfaceError: Psycopg cannot use the 'ProactorEventLoop' to run in async mode. ...
```

The usual advice is to set `WindowsSelectorEventLoopPolicy` before anything creates a loop. That still works for scripts and tests, which create their loop through `asyncio.run()`. It does not work for the server any more. Since uvicorn 0.36, uvicorn passes its own `loop_factory` to `asyncio.run()`, and on Windows its asyncio loop factory returns `ProactorEventLoop` explicitly. An explicit factory ignores the policy.

The fix is to start uvicorn yourself and choose the loop:

```python
import asyncio
import selectors
import sys

import uvicorn


def main() -> None:
    config = uvicorn.Config("app.main:app", host="0.0.0.0", port=8000)
    server = uvicorn.Server(config)

    if sys.platform == "win32":
        asyncio.run(
            server.serve(),
            loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()),
        )
    else:
        asyncio.run(server.serve())
```

Start the server through that entry point (in my project, `python -m app`) instead of the `uvicorn` command. `asyncio.run(loop_factory=...)` needs Python 3.12 or later. On Linux, including the Docker image the demo runs in, both ways of starting the server behave the same. The project's versions are [`app/core/runtime.py`](https://github.com/rahmanaziz744/AI-Customer-Support-Assistant/blob/2a145b9b8bad4a804b3fdf0ed9ffd4ac7f312471/app/core/runtime.py) and [`app/__main__.py`](https://github.com/rahmanaziz744/AI-Customer-Support-Assistant/blob/2a145b9b8bad4a804b3fdf0ed9ffd4ac7f312471/app/__main__.py).

## Checklist

If you cache anything async at module level:

- Assume more than one event loop will exist in the process. Tests and scripts make sure of it.
- Key the cache on `asyncio.get_running_loop()`, compared with `is`.
- Remember that `asyncio.run` finalises suspended async generators on exit, and that includes any `@asynccontextmanager` you entered and never exited.
- Remember that a lock or semaphore binds on first contention, not on creation.
- On Windows, choose the event loop at the entry point, because uvicorn will not honour the policy.

Versions checked: Python 3.13, langgraph-checkpoint-postgres 3.1.2, psycopg 3.3.4, uvicorn 0.52.1, pytest-asyncio 1.4.0.
