LESSONS.push({
  id: 'which-one',
  part: 'Wrap up',
  title: 'Which one should I use?',
  summary: 'Plain Python and a model SDK, Pydantic AI, LangGraph, or both: what each one buys you, after building the same pipeline four ways.',
  intro: `
    <p>You have now built the same support pipeline with LangGraph, with Pydantic AI, and with both. None of them
    is "the right one". Each adds something, and each costs something: another library to learn, another layer
    between you and the model. Pick the smallest thing that covers what you need.</p>
    <h2>Plain Python and the model's SDK</h2>
    <p>Enough when there is <b>one model call, or a fixed few</b>, and you do not need tools: summarize this,
    translate that, classify a ticket. A function, an HTTP client and <code>json.loads</code> are easy to read and
    have nothing to upgrade. It stops being enough when you write your own tool loop, your own retries on invalid
    JSON, or your own test doubles for the model. That is the point where you are building a small framework.</p>
    <h2>Pydantic AI</h2>
    <p>Add it when the model should <b>use tools and return typed data</b>. You get the tool loop, validation with
    feedback to the model (lesson 12), <code>deps</code> for what your app knows (lesson 13), approvals, usage limits,
    <code>FunctionModel</code> for tests without an API key (lesson 8) and evals (lessons 11 and 14). The flow
    between calls stays plain Python: <code>if</code>, loops, functions. For most bots and assistants, this is
    enough.</p>
    <h2>LangGraph</h2>
    <p>Add it when <b>the flow itself is the hard part</b>:</p>
    <ul>
      <li>A run must <b>pause</b> for hours or days, for a person or for another system, and continue in another
      process (lesson 9).</li>
      <li>A run must <b>survive a crash</b> and continue from the last finished step, not from the start
      (lesson 12).</li>
      <li>You want to <b>see and control every step</b>: inspect the state, change it, replay from a checkpoint,
      stream which step is running (lessons 4 and 10).</li>
      <li>The steps form a real graph: branches, loops between several LLM steps, work running in parallel.</li>
    </ul>
    <p>The cost: you think in nodes, edges and state, every value in the state must be serializable (lesson 7), and
    a simple pipeline takes more code than the plain Python version.</p>
    <h2>Both</h2>
    <p>Combine them when you need LangGraph's flow and each step is a real agent with tools: the graph handles
    pausing, checkpoints and routing, and Pydantic AI handles the model calls inside the nodes (lesson 7). Remember
    the seam: the checkpointer sees the agent's run as one step, not the tool calls inside it.</p>
    <p>If you are unsure, start with Pydantic AI and plain Python. Moving the agents into LangGraph nodes later is
    easy, as lesson 7 shows. Taking a graph apart is more work.</p>`,
  differTitle: 'Questions to ask about your project',
  differ: `
    <ul>
      <li>Must a run wait for a person, or outlive a restart? → LangGraph.</li>
      <li>Does the model call tools or return structured data? → Pydantic AI, or LangChain models in LangGraph.</li>
      <li>Is it one or two model calls with no tools? → Plain Python, maybe with Pydantic AI for typed output.</li>
      <li>Is the flow a graph with loops between steps, or a straight line? A straight line does not need a graph
      library.</li>
    </ul>
    <p><b>Whatever you pick, the hard parts stay yours:</b> tools that are safe to call twice, permission checks in
    code, a budget for every run, and evals that check what really happened.</p>`,
  quiz: [
    {
      q: 'A bot answers questions with one tool (search the docs) and returns text. Which is the smallest good fit?',
      options: ['LangGraph', 'Pydantic AI', 'Both together', 'A custom framework'],
      answer: 1,
      why: 'A tool loop and typed output, with no pausing and no crash recovery: exactly what an agent covers.',
    },
    {
      q: 'An approval can take two days, and the app restarts every night. What do you need?',
      options: ['A longer timeout', 'Pydantic AI usage limits', 'A durable checkpointer, as in LangGraph with SQLite or Postgres', 'Streaming'],
      answer: 2,
      why: 'The paused run must be saved outside the process and continued later. In Pydantic AI you would store the messages and pending calls yourself.',
    },
    {
      q: 'What does neither library do for you?',
      options: ['Tool calling', 'Make a refund safe to run twice and check who may do what', 'Validate output', 'Count tokens'],
      answer: 1,
      why: 'Idempotency and permissions depend on your business rules. They are plain Python in your tools.',
    },
  ],
  cheat: [
    ['Pause for days, survive crashes, see every step', 'Tools, typed output, deps, tests and evals with little code'],
    ['Nodes, edges, serializable state', 'Plain Python flow around agents'],
    ['Both: LangGraph for the flow, Pydantic AI agents inside the nodes', 'Neither: one or two calls with the model SDK'],
  ],
});
