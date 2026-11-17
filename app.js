const PANES = {
  lg: 'LangGraph',
  pa: 'Pydantic AI',
  cb: 'LangGraph + Pydantic AI',
  py: 'Python',
  sh: 'Terminal',
};
const STORE = 'lgpa-progress';
const $main = document.getElementById('main');
const $nav = document.getElementById('nav');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
}
function saveProgress(p) {
  try {
    localStorage.setItem(STORE, JSON.stringify(p));
  } catch {}
}

// A small Python highlighter: enough for short snippets, no dependency.
const PY_KEYWORDS = new Set(
  'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '),
);
const PY_TOKEN = /(#.*)|([rbfRBF]{0,2}("""|'''|"|')(?:\\.|(?!\3).)*\3)|(@[\w.]+)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;
function highlightPython(line) {
  let out = '';
  let last = 0;
  let prevWord = '';
  for (const m of line.matchAll(PY_TOKEN)) {
    out += esc(line.slice(last, m.index));
    const [t, comment, str, , deco, num, word] = m;
    if (comment) out += `<span class="t-com">${esc(t)}</span>`;
    else if (str) out += `<span class="t-str">${esc(t)}</span>`;
    else if (deco) out += `<span class="t-deco">${esc(t)}</span>`;
    else if (num) out += `<span class="t-num">${esc(t)}</span>`;
    else if (PY_KEYWORDS.has(word)) out += `<span class="t-kw">${esc(t)}</span>`;
    else if (['True', 'False', 'None'].includes(word)) out += `<span class="t-num">${esc(t)}</span>`;
    else if (prevWord === 'def' || prevWord === 'class') out += `<span class="t-def">${esc(t)}</span>`;
    else out += esc(t);
    if (word) prevWord = word;
    last = m.index + t.length;
  }
  return out + esc(line.slice(last));
}
function highlightShell(line) {
  if (line.startsWith('#')) return `<span class="t-com">${esc(line)}</span>`;
  return line.startsWith('$ ') ? `<span class="t-prompt">$</span> ${esc(line.slice(2))}` : `<span class="t-out">${esc(line)}</span>`;
}

function codeBlock(src, kind, marks = {}) {
  const hl = kind === 'sh' ? highlightShell : highlightPython;
  const lines = src.split('\n').map((line, i) => {
    const n = i + 1;
    const mark = marks[n];
    const attrs = mark !== undefined ? ` class="line marked" data-link="${mark}" tabindex="0"` : ' class="line"';
    return `<span${attrs}><span class="ln">${n}</span>${hl(line) || ' '}</span>`;
  });
  return `<pre class="code"><code>${lines.join('')}</code></pre>`;
}

function renderExample(ex, ei) {
  const kinds = Object.keys(PANES).filter((k) => ex[k] !== undefined);
  const links = ex.links || [];
  const marks = kinds.map(() => ({}));
  links.forEach((link, li) => {
    kinds.forEach((_, pi) => {
      if (link[pi]) marks[pi][link[pi]] = li;
    });
  });
  const panes = kinds
    .map(
      (k, pi) => `
      <div class="pane pane-${k}">
        <div class="pane-label">${PANES[k]}${ex.files?.[pi] ? ` <span class="file">${esc(ex.files[pi])}</span>` : ''}</div>
        ${codeBlock(ex[k], k, marks[pi])}
      </div>`,
    )
    .join('');
  return `
    <section class="example" data-example="${ei}">
      <h3>${ex.title}</h3>
      ${ex.text || ''}
      <div class="panes panes-${kinds.length}">${panes}</div>
      ${links.length ? `<div class="note" aria-live="polite"><span class="note-hint">Hover or tap a marked line to see how it reads${kinds.length > 1 ? ' and what it matches on the other side' : ''}.</span></div>` : ''}
      ${ex.out ? `<div class="out"><div class="pane-label">Output</div>${codeBlock(ex.out, 'sh')}</div>` : ''}
    </section>`;
}

function wireLinks(root, lesson) {
  root.querySelectorAll('.example').forEach((sec) => {
    const ex = lesson.examples[+sec.dataset.example];
    const note = sec.querySelector('.note');
    const activate = (li) => {
      sec.querySelectorAll('.line.active').forEach((el) => el.classList.remove('active'));
      sec.querySelectorAll(`.line[data-link="${li}"]`).forEach((el) => el.classList.add('active'));
      note.innerHTML = ex.links[li].at(-1);
    };
    sec.querySelectorAll('.line.marked').forEach((el) => {
      const li = +el.dataset.link;
      el.addEventListener('mouseenter', () => activate(li));
      el.addEventListener('focus', () => activate(li));
      el.addEventListener('click', () => activate(li));
    });
  });
}

// ---- State stepper: replays a recorded run of the real graph (traces.js) ----

const GRAPH_NODES = {
  langgraph: ['(input)', 'classify', 'escalate', 'draft_reply', 'tools'],
  langgraph_single: ['(input)', 'classify', 'escalate', 'draft_reply', 'tools'],
  combined: ['(input)', 'classify', 'escalate', 'draft_reply'],
  hitl: ['(input)', 'draft_reply', 'tools', '(paused)'],
  crash: ['(input)', 'draft_reply', 'tools', '(crashed)'],
};

function renderValue(key, value) {
  if (key === 'messages') {
    return `<ol class="msgs">${value
      .map(
        (m) =>
          `<li class="msg msg-${m.role}"><span class="role">${m.role}</span>${m.tool_calls ? `<span class="call">calls ${esc(m.tool_calls.join(', '))}</span>` : ''}${m.text ? `<span class="text">${esc(m.text)}</span>` : ''}</li>`,
      )
      .join('')}</ol>`;
  }
  if (value && typeof value === 'object') {
    return `<code>Ticket(${Object.entries(value)
      .map(([k, v]) => `${k}=${esc(JSON.stringify(v).replace(/^true$/, 'True').replace(/^false$/, 'False'))}`)
      .join(', ')})</code>`;
  }
  return `<code>${esc(JSON.stringify(value))}</code>`;
}

function renderStepper(cfg, idx) {
  return `
    <section class="stepper" data-stepper="${idx}">
      <h3>${cfg.title || 'Step through the state'}</h3>
      ${cfg.text || ''}
      <div class="stepper-controls">
        <label>Question <select class="run"></select></label>
        <div class="buttons">
          <button class="prev" aria-label="Previous step">← Back</button>
          <span class="count"></span>
          <button class="next" aria-label="Next step">Next →</button>
        </div>
      </div>
      <div class="graph-strip"></div>
      <div class="state" aria-live="polite"></div>
    </section>`;
}

function wireStepper(root, lesson) {
  root.querySelectorAll('.stepper').forEach((el) => {
    const cfg = lesson.stepper;
    const runs = window.TRACES[cfg.trace];
    const shown = cfg.runs || runs.map((_, i) => i);
    const select = el.querySelector('.run');
    select.innerHTML = shown.map((ri) => `<option value="${ri}">${ri + 1}. ${esc(runs[ri].question)}</option>`).join('');
    let run = shown[0];
    let step = 0;
    const draw = () => {
      const steps = runs[run].steps;
      const s = steps[step];
      el.querySelector('.count').textContent = `step ${step + 1} of ${steps.length}`;
      el.querySelector('.prev').disabled = step === 0;
      el.querySelector('.next').disabled = step === steps.length - 1;
      el.querySelector('.graph-strip').innerHTML = GRAPH_NODES[cfg.trace]
        .map((n) => `<span class="gnode${n === s.node ? ' on' : ''}">${n.replace(/[()]/g, '')}</span>`)
        .join('');
      const what =
        s.node === '(paused)'
          ? `<b>Paused.</b> <code>interrupt()</code> inside the tool asked <b>${esc(s.interrupt)}</b>. <code>invoke</code> returns here and the checkpointer keeps the state. The tool did not finish, so nothing changed.`
          : s.node === '(crashed)'
          ? `<b>The process died</b> inside the <code>tools</code> step, right after the money went out (refunds: <code>${esc(JSON.stringify(s.paid))}</code>). The step never finished, so the checkpoint below still ends after <code>draft_reply</code>.`
          : s.node === '(input)' && runs[run].restart
          ? 'A new process opens the same SQLite file. <code>invoke(None, config)</code> adds no input: it loads the last checkpoint and runs the step that did not finish, <code>tools</code>, again.'
          : s.node === '(input)' && runs[run].resume
          ? 'Start of the resumed run: the checkpointer loaded the saved state. <code>Command(resume=True)</code> becomes the return value of <code>interrupt()</code>, and the paused node runs again from its start.'
          : s.node === '(input)'
          ? runs[run].continues
            ? 'Start of this run: the checkpointer loaded the saved state of the thread, and the new input was added.'
            : 'Start of this run: the input you passed to <code>invoke</code>.'
          : `Node <b>${s.node}</b> ran and returned <code>{${s.changed.map((k) => `"${k}": ...`).join(', ')}}</code>.`;
      el.querySelector('.state').innerHTML = `
        <p class="what">${what}</p>
        <div class="state-rows">${Object.entries(s.state)
          .map(
            ([k, v]) =>
              `<div class="row${s.changed.includes(k) ? ' changed' : ''}"><div class="key">${k}${s.changed.includes(k) ? '<span class="badge">changed</span>' : ''}</div><div class="val">${renderValue(k, v)}</div></div>`,
          )
          .join('')}</div>`;
    };
    select.addEventListener('change', () => {
      run = +select.value;
      step = 0;
      draw();
    });
    el.querySelector('.prev').addEventListener('click', () => {
      step = Math.max(0, step - 1);
      draw();
    });
    el.querySelector('.next').addEventListener('click', () => {
      step = Math.min(runs[run].steps.length - 1, step + 1);
      draw();
    });
    draw();
  });
}

// ---- Quiz ----

function renderQuiz(quiz, lessonId) {
  const done = loadProgress()[lessonId] || {};
  return `
    <section class="quiz">
      <h2>Check yourself</h2>
      ${quiz
        .map(
          (q, qi) => `
        <div class="question${done[qi] ? ' solved' : ''}" data-q="${qi}">
          <p class="q">${qi + 1}. ${q.q}</p>
          ${q.code ? codeBlock(q.code, q.kind || 'py') : ''}
          <div class="options">${q.options.map((o, oi) => `<button class="option" data-o="${oi}">${o}</button>`).join('')}</div>
          <div class="why" hidden></div>
        </div>`,
        )
        .join('')}
    </section>`;
}

function wireQuiz(root, lesson) {
  root.querySelectorAll('.question').forEach((el) => {
    const qi = +el.dataset.q;
    const q = lesson.quiz[qi];
    el.querySelectorAll('.option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const oi = +btn.dataset.o;
        const right = oi === q.answer;
        btn.classList.add(right ? 'right' : 'wrong');
        const why = el.querySelector('.why');
        why.hidden = false;
        why.innerHTML = right ? `<b>Right.</b> ${q.why}` : '<b>Not quite.</b> Try another answer.';
        if (right) {
          el.classList.add('solved');
          el.querySelectorAll('.option').forEach((b) => (b.disabled = true));
          const p = loadProgress();
          p[lesson.id] = { ...(p[lesson.id] || {}), [qi]: true };
          saveProgress(p);
          renderNav();
        }
      });
    });
  });
}

const REPO = 'https://github.com/romanzdk/langgraph-and-pydantic-ai/blob/main';

function renderExercise(ex) {
  return `
    <section class="exercise">
      <h2>Exercise: ${ex.title}</h2>
      ${ex.text}
      <div class="out"><div class="pane-label">Clone the repo, edit <span class="file">exercises/${ex.name}.py</span>, then run</div>${codeBlock(`$ uv run exercises/check.py ${ex.name}`, 'sh')}</div>
      <p class="exercise-links"><a href="${REPO}/exercises/${ex.name}.py" target="_blank" rel="noopener">The exercise</a> ·
      <a href="${REPO}/exercises/solutions/${ex.name}.py" target="_blank" rel="noopener">A solution</a> (try first)</p>
    </section>`;
}

function cheatTable(rows) {
  return `<table class="cheat"><thead><tr><th>LangGraph</th><th>Pydantic AI</th></tr></thead><tbody>${rows
    .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`)
    .join('')}</tbody></table>`;
}

// ---- Pages ----

function lessonDone(lesson) {
  const done = loadProgress()[lesson.id] || {};
  return lesson.quiz?.length && lesson.quiz.every((_, i) => done[i]);
}

// A lesson with a `part` starts a new group; the lessons after it belong to it until the next part.
function byPart(item, list, heading) {
  const groups = [];
  LESSONS.forEach((l, i) => {
    if (l.part || !groups.length) groups.push({ part: l.part, items: [] });
    groups.at(-1).items.push(item(l, i));
  });
  const tag = list.split(' ')[0];
  return groups
    .map((g) => `${g.part ? `<p class="${heading}">${g.part}</p>` : ''}<${list}>${g.items.join('')}</${tag}>`)
    .join('');
}

function renderNav() {
  const current = location.hash.replace(/^#\//, '');
  $nav.innerHTML = `
    <a href="#/" class="${current === '' ? 'on' : ''}">Start here</a>
    ${byPart((l, i) =>
      `<li><a href="#/${l.id}" class="${current === l.id ? 'on' : ''}"><span class="num">${i + 1}</span>${l.title}${lessonDone(l) ? ' <span class="tick" title="All questions answered">✓</span>' : ''}</a></li>`,
    'ol', 'part')}
    <a href="#/cheatsheet" class="${current === 'cheatsheet' ? 'on' : ''}">Cheat sheet</a>`;
}

function renderHome() {
  document.title = 'LangGraph & Pydantic AI, side by side';
  $main.innerHTML = `
    <div class="home">
      <h1>LangGraph &amp; Pydantic AI, side by side</h1>
      <p class="lead">Learn both by building one small LLM pipeline in each, next to each other. You see the same idea
      written two ways, and you see where they really differ.</p>
      <div class="task">
        <b>The pipeline:</b> a support ticket comes in → an LLM classifies it (<code>category</code>, <code>urgent</code>)
        → urgent tickets go to the on-call engineer, the rest get a reply written by the LLM, which can look up an order
        with a tool. Later, it also remembers the conversation, and then things go wrong on purpose: timeouts, a crash
        in the middle of a refund, and a customer who tries to see someone else's order.
      </div>
      <h2>How a lesson works</h2>
      <ul class="how">
        <li><b>Side by side.</b> LangGraph on the left, Pydantic AI on the right. Hover or tap a marked line to see the
        matching line on the other side and a short note.</li>
        <li><b>Where they differ.</b> The places where the two libraries really think differently.</li>
        <li><b>Step through the state.</b> Replay a real run of the graph, node by node, and see what each node changed.</li>
        <li><b>Check yourself.</b> A few short questions, and in some lessons a small exercise to solve in the code.
        <b>Cheat card</b> at the end, all of them on the <a href="#/cheatsheet">cheat sheet</a>.</li>
      </ul>
      <p>Every code snippet is copied from the runnable examples in the
      <a href="https://github.com/romanzdk/langgraph-and-pydantic-ai/tree/main/examples">examples folder</a>, and CI checks that they still match and still run.</p>
      <h2>Lessons</h2>
      ${byPart(
        (l, i) => `<li><a href="#/${l.id}"><span class="num">${i + 1}</span><span><b>${l.title}</b><br><span class="sum">${l.summary}</span></span></a></li>`,
        'ol class="cards"',
        'cards-part',
      )}
    </div>`;
}

function renderCheatsheet() {
  document.title = 'Cheat sheet · LangGraph & Pydantic AI';
  $main.innerHTML = `
    <h1>Cheat sheet</h1>
    <p>Every cheat card from the lessons on one page.</p>
    <input type="search" class="filter" placeholder="Filter, e.g. tool, state, memory" aria-label="Filter the cheat sheet">
    ${LESSONS.filter((l) => l.cheat)
      .map((l) => `<section class="cheat-group"><h2><a href="#/${l.id}">${l.title}</a></h2>${cheatTable(l.cheat)}</section>`)
      .join('')}`;
  $main.querySelector('.filter').addEventListener('input', (e) => {
    const f = e.target.value.toLowerCase();
    $main.querySelectorAll('.cheat-group').forEach((g) => {
      let any = false;
      g.querySelectorAll('tbody tr').forEach((tr) => {
        const hit = tr.textContent.toLowerCase().includes(f);
        tr.hidden = !hit;
        any ||= hit;
      });
      g.hidden = !any;
    });
  });
}

function renderLesson(lesson) {
  const i = LESSONS.indexOf(lesson);
  const prev = LESSONS[i - 1];
  const next = LESSONS[i + 1];
  document.title = `${lesson.title} · LangGraph & Pydantic AI`;
  $main.innerHTML = `
    <article class="lesson">
      <p class="kicker">Lesson ${i + 1} of ${LESSONS.length}</p>
      <h1>${lesson.title}</h1>
      <div class="intro">${lesson.intro}</div>
      ${(lesson.examples || []).map(renderExample).join('')}
      ${lesson.differ ? `<aside class="differ"><h2>${lesson.differTitle || 'Where they differ'}</h2>${lesson.differ}</aside>` : ''}
      ${lesson.stepper ? renderStepper(lesson.stepper, 0) : ''}
      ${lesson.quiz ? renderQuiz(lesson.quiz, lesson.id) : ''}
      ${(lesson.exercises || []).map(renderExercise).join('')}
      ${lesson.cheat ? `<section><h2>Cheat card</h2>${cheatTable(lesson.cheat)}</section>` : ''}
      <nav class="pager">
        ${prev ? `<a href="#/${prev.id}">← ${prev.title}</a>` : '<span></span>'}
        ${next ? `<a href="#/${next.id}">${next.title} →</a>` : '<a href="#/cheatsheet">Cheat sheet →</a>'}
      </nav>
    </article>`;
  wireLinks($main, lesson);
  if (lesson.stepper) wireStepper($main, lesson);
  if (lesson.quiz) wireQuiz($main, lesson);
}

function route() {
  const id = location.hash.replace(/^#\//, '');
  const lesson = LESSONS.find((l) => l.id === id);
  if (lesson) renderLesson(lesson);
  else if (id === 'cheatsheet') renderCheatsheet();
  else renderHome();
  renderNav();
  document.body.classList.remove('nav-open');
  window.scrollTo(0, 0);
}

document.getElementById('menu').addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.getElementById('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try {
    localStorage.setItem('lgpa-theme', document.documentElement.dataset.theme);
  } catch {}
});
window.addEventListener('hashchange', route);
route();
