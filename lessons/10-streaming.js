LESSONS.push({
  id: 'streaming',
  title: 'Streaming: show progress while it runs',
  summary: 'Steps as they finish and the reply token by token: graph.stream modes on the left, run_stream_sync on the right.',
  intro: `
    <p>A reply can take several seconds. Instead of a spinner, you can show the text as the model writes it. With a
    graph you can also show which step is running. The files are <code>streaming_langgraph.py</code> and
    <code>streaming_pydantic_ai.py</code>; both stream the full pipelines from the earlier lessons.</p>`,
  examples: [
    {
      title: 'Steps and tokens',
      lg: code`
        def stream(text: str, thread_id: str) -> None:
            config = {"configurable": {"thread_id": thread_id}}
            for mode, data in lg.graph.stream({"messages": [HumanMessage(text)]}, config, stream_mode=["updates", "messages"]):
                if mode == "updates":
                    print(f"\n[{', '.join(data)} finished]")
                else:
                    token, metadata = data
                    if metadata["langgraph_node"] == "draft_reply":
                        print(token.text, end="", flush=True)
      `,
      pa: code`
        def stream(text: str) -> str:
            with pa.writer.run_stream_sync(text) as result:
                for delta in result.stream_text(delta=True):
                    print(delta, end="", flush=True)
                return result.get_output()
      `,
      files: ['streaming_langgraph.py', 'streaming_pydantic_ai.py'],
      links: [
        [3, 2, 'Left: <code>stream</code> instead of <code>invoke</code>, same input and config. Asking for two modes gives <code>(mode, data)</code> pairs. Right: <code>run_stream_sync</code> instead of <code>run_sync</code>; use it in a <code>with</code> block so the stream is closed.'],
        [4, null, '<code>"updates"</code>: one item per finished node, with what it returned. This is exactly what the stepper on this site is built from.'],
        [7, 3, '<code>"messages"</code>: LLM tokens as they arrive, from <b>any</b> node. Right: <code>stream_text(delta=True)</code> gives only the new piece of text each time (without <code>delta</code>, the whole text so far).'],
        [8, null, 'Filter by node. <code>classify</code> also calls the LLM, and its tokens are pieces of the Ticket JSON, not something to show a customer.'],
        [null, 5, 'After the stream ends you still get the final output, the same as <code>run_sync(...).output</code>.'],
      ],
      out: code`
        [classify finished]

        [draft_reply finished]

        [tools finished]
        Hi there,

        Thanks for reaching out! Your order 123 has shipped and is on its way. It's expected to arrive on Friday.
        ...
        [draft_reply finished]
      `,
    },
  ],
  differ: `
    <p><b>What you can watch.</b> LangGraph streams the <b>graph</b>: nodes, state updates, tokens from any node,
    and your own custom events (<code>stream_mode="custom"</code>). Pydantic AI streams one <b>agent run</b>: the
    text or the structured output as it grows (<code>stream_output()</code>), and with
    <code>run_stream_events</code> also the tool calls.</p>
    <p><b>Read the output above.</b> The first <code>draft_reply</code> finished without any text: it only asked for
    a tool call. Then <code>tools</code> ran, and the second <code>draft_reply</code> streamed the reply. On the right
    the tool round happens inside the run before the first token, so the text just starts a bit later.</p>
    <p><b>Async.</b> Both have async versions (<code>astream</code>, <code>run_stream</code>), which you want in a
    web server. <code>run_stream_sync</code> refuses to run inside an active event loop.</p>
    <p><b>Testing.</b> LangChain's fake chat model could not stream a message that is only a tool call ("No
    generations found in stream"). The offline check streams a plain reply instead. Pydantic AI's
    <code>FunctionModel(stream_function=...)</code> streams tool calls and text.</p>`,
  quiz: [
    {
      q: 'You only want to show the customer the reply text. Which tokens do you print in the LangGraph version?',
      options: ['All tokens from stream_mode="messages"', 'Only tokens whose metadata["langgraph_node"] is "draft_reply"', 'Only the "updates" items', 'Only tokens from "tools"'],
      answer: 1,
      why: '"messages" streams tokens from every LLM call in the graph, including the classifier\'s JSON. Filter by node.',
    },
    {
      q: 'What does <code>stream_text(delta=True)</code> give you on each step?',
      options: ['The whole text so far', 'Only the new piece of text', 'One whole sentence', 'The tool calls'],
      answer: 1,
      why: 'With <code>delta=True</code> you get only what is new, so printing it with <code>end=""</code> builds the text. Without it, each item is the full text so far.',
    },
  ],
  cheat: [
    ['<code>graph.stream(input, config, stream_mode="updates")</code>', '(one agent run, no steps)'],
    ['<code>stream_mode="messages"</code> → <code>(token, metadata)</code>', '<code>with agent.run_stream_sync(text) as r: r.stream_text(delta=True)</code>'],
    ['Filter tokens by <code>metadata["langgraph_node"]</code>', '<code>r.stream_output()</code> for structured output'],
    ['<code>astream(...)</code> in async code', '<code>async with agent.run_stream(...)</code> in async code'],
  ],
});
