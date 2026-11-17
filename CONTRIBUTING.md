# Contributing

Thanks for helping! Small fixes are very welcome: a confusing sentence, a wrong note, an outdated API, a better
example.

## Report a problem

[Open an issue](https://github.com/romanzdk/langgraph-and-pydantic-ai/issues/new/choose) and say which lesson and
which example, stepper step or question. If you have it, include what you expected instead.

## How the repo fits together

| Path | What it is |
|---|---|
| `examples/` | The runnable Python examples. **This is the source of truth**: every code snippet on the site is copied from here. |
| `examples/shop.py` | The shop's own code (orders, refunds), plain Python used by the tools of both libraries. |
| `examples/check_offline.py` | Runs every example with fake models, so no API key is needed. |
| `exercises/` | Exercises to solve, their solutions, and `check.py`, which checks them with fake models. |
| `scripts/trace.py` | Runs the real graphs with fake models and records the state after every step into `traces.js` (the stepper). |
| `lessons/*.js` | One lesson per file, listed in `index.html` in the order they appear. |
| `scripts/check.mjs` | Checks the lessons: snippets match `examples/`, line links, quiz answers, stepper traces. |
| `app.js`, `style.css`, `index.html` | The site. Plain HTML/CSS/JS, no build step. |

## Change or add a lesson

1. If the code changes, change it in `examples/` first and make it work:

   ```sh
   uv sync
   cd examples && uv run check_offline.py     # fake models, no API key
   export OPENROUTER_API_KEY=...              # optional: try it with a real model too
   uv run examples/langgraph_pipeline.py
   ```

2. If a graph changed, record the stepper again: `uv run scripts/trace.py`. If an exercise changed, run
   `uv run exercises/check.py --solutions`.
3. Edit the lesson in `lessons/`, then look at it in a browser: `python3 -m http.server 8000`.
4. Run the lesson checks: `node scripts/check.mjs`.

CI runs all of this on every push, and only deploys the site when everything passes.

### Writing style

- Plain, simple English. Short sentences. Talk to the reader as "you".
- Always show both sides, and say honestly where one library is simpler.
- Only use ideas from earlier lessons. If you must show something from a later lesson, add a one-line note and name
  the lesson.
- Every claim about an API must be true for the versions in `uv.lock`. Try it before you write it.

### Lesson format

```js
LESSONS.push({
  part: 'Build the pipeline',        // optional: starts a new group in the menu and on the home page
  id: 'tools',                       // URL: #/tools
  title: 'Tools: let the LLM look things up',
  summary: 'One line for the home page.',
  intro: `<p>HTML</p>`,
  examples: [{
    title: '...',
    text: `<p>optional HTML</p>`,
    lg: code`...`,                   // LangGraph code. Panes: lg, pa (Pydantic AI), cb (combined), py, sh (terminal)
    pa: code`...`,
    files: ['langgraph_pipeline.py', 'pydantic_ai_pipeline.py'],  // shown next to each pane label
    links: [[lgLine, paLine, 'note HTML']],  // 1-based line per pane (null = none), then the note
    out: code`...`,                  // optional output, shown under the code
  }],
  differ: `<p>HTML: where the two libraries really differ</p>`,
  differTitle: '...',                // optional heading instead of "Where they differ"; examples are optional if differ is set
  stepper: { trace: 'langgraph_single', runs: [0], title: '...', text: '<p>HTML</p>' },  // optional, see traces.js
  quiz: [{ q: 'HTML', code: code`...`, options: ['...'], answer: 1, why: 'HTML' }],
  exercises: [{ name: 'tool_limit', title: '...', text: '<p>HTML</p>' }],  // exercises/<name>.py and solutions/<name>.py
  cheat: [['LangGraph', 'Pydantic AI'], ...],
});
```

`code` is a template tag that keeps backslashes as written and removes the common indentation. Snippets in `lg`,
`pa`, `cb` and `py` must be copied word for word from a file in `examples/`; a line with only `...` skips code in
between. `sh` panes are not checked.

## Pull requests

Keep them small and focused. Say what you changed and why, and paste the last line of `node scripts/check.mjs`.
By contributing you agree that your work is released under the [MIT License](LICENSE) and that you follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
