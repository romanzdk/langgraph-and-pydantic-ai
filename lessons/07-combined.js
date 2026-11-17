LESSONS.push({
  id: 'combined',
  title: 'Both together: a graph of agents',
  summary: 'A common split: LangGraph runs the flow, Pydantic AI agents do the LLM calls inside the nodes.',
  intro: `
    <p>The two libraries do not compete as much as it looks: LangGraph is about the <b>flow</b>, Pydantic AI is about
    the <b>LLM call</b>. A popular setup uses both: a LangGraph graph (for edges, checkpoints, pausing for a human)
    whose nodes call Pydantic AI agents (for typed output and tools). No LangChain chat model is needed at all.</p>`,
  examples: [
    {
      title: 'The same node, two ways to call the LLM',
      lg: code`
        def classify(state: State) -> State:
            question = state["messages"][-1].text
            ticket = llm.with_structured_output(Ticket, method="json_schema").invoke(
                f"Classify this support ticket:\n\n{question}"
            )
            return {"ticket": ticket}
      `,
      cb: code`
        classifier = Agent(MODEL, output_type=Ticket, instructions="Classify the support ticket.")
        ...
        def classify(state: State) -> State:
            return {"ticket": classifier.run_sync(state["text"]).output}
      `,
      files: ['langgraph_pipeline.py', 'combined_pipeline.py'],
      links: [
        [1, 3, 'Still a LangGraph node: it gets the state and returns a partial update.'],
        [3, 1, 'Left: a LangChain model asked for structured output. Right: a Pydantic AI agent with <code>output_type</code>.'],
        [6, 4, 'Both return <code>{"ticket": Ticket(...)}</code>. The graph does not care which library made it.'],
      ],
    },
    {
      title: 'Tools and memory move into the agent',
      text: `<p>The writer agent has the tool, so the graph needs no <code>ToolNode</code> and no loop. Its message
      history is stored in the graph state as JSON, so the checkpointer saves it with everything else.</p>`,
      cb: code`
        class State(TypedDict, total=False):
            text: str
            ticket: Ticket
            answer: str
            history: bytes  # the writer's messages as JSON, so the checkpointer can save them
        ...
        def draft_reply(state: State) -> State:
            history = ModelMessagesTypeAdapter.validate_json(state.get("history", b"[]"))
            result = writer.run_sync(state["text"], message_history=history)
            return {"answer": result.output, "history": result.all_messages_json()}
        ...
        builder.add_edge(START, "classify")
        builder.add_conditional_edges("classify", route)
        builder.add_edge("escalate", END)
        builder.add_edge("draft_reply", END)
      `,
      files: ['combined_pipeline.py'],
      links: [
        [5, '<code>bytes</code>, not a list of message objects. The checkpointer can save any bytes, but it warns about (and will soon refuse) unknown classes like Pydantic AI messages.'],
        [8, 'Load the history saved by the previous run. On the first run there is none, so start from <code>[]</code>.'],
        [9, 'The tool loop runs inside <code>run_sync</code>. The graph sees one step.'],
        [10, '<code>all_messages_json()</code> is the whole history as JSON, ready for the checkpointer.'],
        [15, 'A plain edge to <code>END</code>: no <code>tools_condition</code>, no edge back. The graph is simpler than in the LangGraph-only version.'],
      ],
    },
  ],
  differ: `
    <p><b>Where the loop lives.</b> In the LangGraph-only version you can see every tool round in the state. Here the
    graph only sees "draft_reply ran". Needing a check between the model and the tool is not by itself a reason
    for the graph: Pydantic AI can ask a person to approve a tool call too (lesson 9). Keep the loop in the graph
    when you want to control the flow yourself (your own nodes and edges around each tool round) and want a
    checkpoint after every round, so a crash or a pause resumes from there. If not, the agent version is
    shorter.</p>
    <p><b>Two kinds of messages.</b> LangChain messages and Pydantic AI messages are different classes. Pick one
    library for the LLM calls, and keep its messages in the state.</p>`,
  stepper: {
    trace: 'combined',
    title: 'Step through the combined graph',
    text: `<p>Fewer steps than before: no <code>tools</code> node. Watch <code>history</code> grow from 4 to 8
    messages, and see that question 3 (escalated) does not change it.</p>`,
  },
  quiz: [
    {
      q: 'Why is <code>history</code> stored as <code>bytes</code> and not as a list of Pydantic AI messages?',
      options: ['Bytes are faster for the LLM', 'The checkpointer must be able to save and load it; JSON bytes are safe, unknown classes are not', 'Pydantic AI requires bytes', 'TypedDict cannot hold lists'],
      answer: 1,
      why: 'LangGraph serializes the state at every step. Plain bytes always work; arbitrary classes trigger a warning now and will be blocked later.',
    },
    {
      q: 'How many nodes does the combined graph have (not counting START and END)?',
      options: ['3: classify, escalate, draft_reply', '4: plus tools', '5: plus route', '2'],
      answer: 0,
      why: 'The tool loop is inside the agent, so there is no tools node, and <code>route</code> is a conditional edge, not a node.',
    },
  ],
  cheat: [
    ['Node calls <code>llm.with_structured_output(...)</code>', 'Node calls <code>classifier.run_sync(...).output</code>'],
    ['Tool loop as nodes + edges', 'Tool loop inside the agent: one node'],
    ['<code>messages</code> with <code>add_messages</code> in the state', '<code>history: bytes</code> via <code>all_messages_json()</code>'],
  ],
});
