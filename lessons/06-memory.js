LESSONS.push({
  part: 'Beyond one run',
  id: 'memory',
  title: 'Memory: continue the conversation',
  summary: 'A checkpointer and a thread_id on the left, a history list you carry yourself on the right.',
  intro: `
    <p>"And what about 456?" only makes sense if the model remembers the question before it. Lesson 4 showed that
    the state disappears after each <code>invoke</code>. To keep it, something has to save it between runs.</p>
    <ul>
      <li><b>LangGraph</b> does it for you: a <b>checkpointer</b> saves the state after every step under a
      <code>thread_id</code>. The next <code>invoke</code> with the same <code>thread_id</code> starts from it.</li>
      <li><b>Pydantic AI</b> saves nothing. You keep the message history and pass it to the next run with
      <code>message_history=</code>.</li>
    </ul>`,
  examples: [
    {
      title: 'Three questions, one conversation',
      lg: code`
        # The checkpointer only restores types it knows; our own models must be allowed explicitly.
        checkpointer = InMemorySaver(serde=JsonPlusSerializer(allowed_msgpack_modules=[Ticket]))
        graph = builder.compile(checkpointer=checkpointer)
        ...
            config = {"configurable": {"thread_id": "customer-1"}}
            for text in ["Where is my order 123?", "And what about 456?", "Production is down, nobody can log in!"]:
                result = graph.invoke({"messages": [HumanMessage(text)]}, config)
      `,
      pa: code`
        def handle(text: str, history: list[ModelMessage]) -> tuple[Ticket, str, list[ModelMessage]]:
            ticket = classifier.run_sync(text).output
            if ticket.urgent:
                return ticket, f"Sent to on-call engineer ({ticket.category}).", history
            result = writer.run_sync(text, message_history=history)
            return ticket, result.output, result.all_messages()
        ...
            history: list[ModelMessage] = []
            for text in ["Where is my order 123?", "And what about 456?", "Production is down, nobody can log in!"]:
                ticket, answer, history = handle(text, history)
      `,
      files: ['langgraph_pipeline.py', 'pydantic_ai_pipeline.py'],
      links: [
        [1, null, 'The checkpointer serializes the state. It knows LangChain messages, but our own <code>Ticket</code> must be allowed, or LangGraph warns (and will soon refuse) when loading it back.'],
        [2, null, '<code>InMemorySaver</code> keeps checkpoints in a dict in this process. For real use there are SQLite and Postgres checkpointers with the same interface.'],
        [3, null, 'The only change to the graph itself: compile it with a checkpointer.'],
        [5, 8, 'Left: name the conversation; LangGraph stores it for you. Right: start with an empty history; you store it.'],
        [7, 10, 'Left: pass only the <b>new</b> message. The saved <code>messages</code> are loaded, and the reducer appends the new one. Right: pass the history in, get the longer history back.'],
        [null, 5, '<code>message_history=</code> puts the earlier messages in front of the new question.'],
        [null, 6, '<code>all_messages()</code> is the old history plus everything from this run: the question, tool calls, tool results and the answer.'],
      ],
    },
  ],
  differ: `
    <p><b>Who stores the history.</b> Left: the framework, keyed by <code>thread_id</code>. Right: you, wherever you
    like (a variable, a database row, a web session). Pydantic AI can turn it into JSON with
    <code>result.all_messages_json()</code> and back with <code>ModelMessagesTypeAdapter.validate_json(...)</code>.</p>
    <p><b>What gets remembered.</b> The LangGraph thread ends with 10 messages, because the escalation is a node that
    adds a message. The Pydantic AI history has 8: the escalation never goes through the agent, so it is not in the
    history. If the model should know about it, add it yourself.</p>
    <p><b>Old values stay.</b> At the start of the second run the state still has the <code>ticket</code> from the
    first question, until <code>classify</code> overwrites it. Keys without a reducer are not reset between runs.</p>
    <p><b>The same mechanism powers human-in-the-loop.</b> Because the state is saved after every step, a graph can
    stop in the middle (<code>interrupt()</code>), wait for a person, and continue later from the checkpoint.</p>`,
  stepper: {
    trace: 'langgraph',
    title: 'Watch the thread grow',
    text: `<p>Pick question 2 or 3 and look at the first step: the state is loaded from the checkpoint, so it already
    has the earlier messages, and the old <code>ticket</code>.</p>`,
  },
  quiz: [
    {
      q: 'Run 2 uses the same <code>thread_id</code>. You pass <code>{"messages": [HumanMessage("And what about 456?")]}</code>. What is in <code>messages</code> before classify runs?',
      options: ['Only the new question', 'The 4 messages of run 1 plus the new question', 'Nothing, input is ignored with a checkpointer', 'The new question twice'],
      answer: 1,
      why: 'The checkpointer loads the saved state, and the <code>add_messages</code> reducer appends your input to it: 4 + 1 = 5.',
    },
    {
      q: 'In the Pydantic AI version, what happens if you forget to assign the returned history?',
      code: code`
        handle(text, history)  # result ignored
      `,
      options: ['Nothing, the agent remembers anyway', 'Every question starts without earlier messages', 'It raises an error', 'Only tool results are lost'],
      answer: 1,
      why: 'The agent stores nothing between runs. The history only grows if you keep what <code>handle</code> returns.',
    },
  ],
  cheat: [
    ['<code>builder.compile(checkpointer=InMemorySaver())</code>', 'Keep <code>result.all_messages()</code> yourself'],
    ['<code>{"configurable": {"thread_id": "customer-1"}}</code>', '<code>run_sync(text, message_history=history)</code>'],
    ['Pass only the new message; the rest is loaded', 'Pass the whole history every time'],
    ['SQLite / Postgres checkpointers for real use', '<code>all_messages_json()</code> / <code>ModelMessagesTypeAdapter</code>'],
  ],
});
