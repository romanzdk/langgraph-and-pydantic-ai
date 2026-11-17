# Design

## Why

LangGraph and Pydantic AI are two popular ways to build LLM pipelines in Python, and people often have to pick one,
or use both. Their docs explain each library on its own. This course puts them **next to each other**, on the same
small pipeline, so you see the same idea written two ways and where they really differ.

It started as the author's own notes while learning both, the same way as
[Rust for Pythonistas](https://github.com/romanzdk/rust-for-pythonistas): learn by analogy.

## Goals / non-goals

- Goal: after the course, a Python developer can read and write a small LangGraph graph and a Pydantic AI agent,
  knows what each one is good at, and can combine them.
- Goal: everything shown is correct and runs. Every snippet comes from `examples/`, and CI runs the examples.
- Non-goal: a full API reference. Each lesson shows one idea on the shared pipeline and links out for the rest.
- Non-goal: running LLM calls in the browser. That would need an API key in the page.

## Approaches considered

| Approach | Pros | Cons |
|---|---|---|
| **Static site + recorded runs** (chosen) | No install, no API key, free hosting on GitHub Pages, the stepper shows real graph behaviour | You can't edit and run code on the page |
| Pyodide (Python in the browser) | Runnable code | LangGraph's dependencies don't all run in the browser, and LLM calls still need a key |
| Notebooks | Runnable | Needs an install and a key; no side-by-side view or stepper |

## How it works

- Plain HTML/CSS/JS with no build step and no external libraries. `lib.js` sets up `LESSONS` and the `code` tag,
  each file in `lessons/` pushes one lesson, and `app.js` renders a hash-routed page per lesson (`#/tools`).
- `examples/` is the source of truth. `scripts/check.mjs` fails if a snippet in a lesson is not found word for word
  in a file there.
- The stepper data (`traces.js`) is produced by `scripts/trace.py`: it runs the real graphs with fake models and
  records `graph.stream(..., stream_mode=["updates", "values"])`. Only the reply texts are canned; the steps, the
  reducers, the checkpointer and the interrupts are real. CI fails if `traces.js` is out of date.
- Quiz progress and the light/dark choice are kept in `localStorage`. The site works without them.

## Checks (CI)

1. `examples/check_offline.py`: every example with fake models (branches, tools, memory, approve and reject, streaming, evals).
2. `scripts/trace.py` + `git diff --exit-code traces.js`: the stepper matches the current graphs.
3. `scripts/check.mjs`: snippets, line links (each link reachable), quiz answers, stepper references.

The site is deployed to GitHub Pages only when all checks pass on `main`.
