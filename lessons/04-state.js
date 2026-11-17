LESSONS.push({
  id: 'state',
  title: 'State: what travels between steps',
  summary: 'The shared State in LangGraph, plain variables in Pydantic AI, and how long each one lives.',
  intro: `
    <p>Steps need to pass data on: <code>route</code> needs the <code>ticket</code> that <code>classify</code> made.
    In LangGraph the steps are separate functions that the framework calls, so it hands them a shared object: the
    <b>state</b>. In Pydantic AI you call the steps yourself, so the "state" is just your local variables.</p>`,
  examples: [
    {
      title: 'A State object vs. local variables',
      lg: code`
        class State(TypedDict, total=False):
            messages: Annotated[list[AnyMessage], add_messages]  # whole conversation, appended
            ticket: Ticket  # classification of the latest question, overwritten


        def classify(state: State) -> State:
            question = state["messages"][-1].text
            ticket = llm.with_structured_output(Ticket, method="json_schema").invoke(
                f"Classify this support ticket:\n\n{question}"
            )
            return {"ticket": ticket}
      `,
      pa: code`
        def handle(text: str, history: list[ModelMessage]) -> tuple[Ticket, str, list[ModelMessage]]:
            ticket = classifier.run_sync(text).output
            if ticket.urgent:
                return ticket, f"Sent to on-call engineer ({ticket.category}).", history
            result = writer.run_sync(text, message_history=history)
            return ticket, result.output, result.all_messages()
      `,
      files: ['langgraph_pipeline.py', 'pydantic_ai_pipeline.py'],
      links: [
        [1, 1, 'Left: the state is a typed dict that every node gets. <code>total=False</code> means a key may be missing until a node sets it. Right: the inputs are function arguments.'],
        [2, null, '<code>Annotated[..., add_messages]</code> sets a <b>reducer</b>: when a node returns <code>{"messages": [m]}</code>, LangGraph appends <code>m</code> to the list instead of replacing it.'],
        [3, 2, 'A key without a reducer is overwritten. Right: the same value is a local variable.'],
        [7, null, 'A node reads what it needs from the state...'],
        [11, 2, '...and returns only the keys it changes. LangGraph merges this into the state. Right: assign to a variable.'],
      ],
    },
  ],
  differ: `
    <p><b>How long does the state live?</b> One <code>graph.invoke(...)</code> creates the state, the nodes update
    it step by step until the graph reaches <code>END</code>, and <code>invoke</code> returns the final state. The
    graph keeps nothing: the next question starts from an empty state, unless you add a checkpointer (lesson 6).</p>
    <p>The Pydantic AI version is the same thing in plain Python: the variables live while <code>handle</code> runs.
    The agent also has state inside one <code>run_sync</code> (the list of messages for the tool loop), and you can
    get it after the run with <code>result.all_messages()</code>.</p>
    <p><b>Reducer gotcha.</b> <code>add_messages</code> appends, but a message with an <code>id</code> that is already
    in the list <b>replaces</b> the old one. A test once reused the same <code>AIMessage</code> object twice; it got
    an id on the first run, so the second run overwrote it and the conversation lost messages.</p>`,
  stepper: {
    trace: 'langgraph_single',
    runs: [0],
    title: 'Watch the state change',
    text: `<p>Go step by step. The highlighted rows are the keys the node returned. <code>ticket</code> is
    overwritten; <code>messages</code> only ever grows.</p>`,
  },
  quiz: [
    {
      q: 'The state has 3 messages. A node returns <code>{"messages": [reply]}</code>. How many messages are there now?',
      options: ['1, the list is replaced', '4, add_messages appends', '3, a node cannot change messages', 'It depends on the edge'],
      answer: 1,
      why: 'The reducer <code>add_messages</code> appends new messages (unless one has the same id as an existing message).',
    },
    {
      q: 'A node returns <code>{"ticket": new_ticket}</code>. What happens to <code>messages</code>?',
      options: ['It is cleared', 'It stays as it was; only returned keys change', 'It is set to None', 'LangGraph raises, because messages is missing'],
      answer: 1,
      why: 'A node returns a partial update. Keys it does not return stay untouched.',
    },
    {
      q: 'You call <code>graph.invoke(...)</code> twice, without a checkpointer. Does the second call see the first question?',
      options: ['Yes, the graph remembers its last state', 'No, each invoke starts with a new state', 'Only the messages key', 'Only if the thread_id is the same'],
      answer: 1,
      why: 'Without a checkpointer the state lives only during one invoke. A <code>thread_id</code> only matters with a checkpointer.',
    },
  ],
  cheat: [
    ['<code>class State(TypedDict)</code>, passed to every node', 'Local variables and function arguments'],
    ['A node returns a partial dict: <code>{"ticket": t}</code>', '<code>ticket = ...</code>'],
    ['<code>Annotated[list, add_messages]</code> appends', '<code>history = result.all_messages()</code>'],
    ['Lives during one <code>invoke</code>', 'Lives during one function call'],
  ],
});
