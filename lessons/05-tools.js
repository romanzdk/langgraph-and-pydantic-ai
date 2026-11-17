LESSONS.push({
  id: 'tools',
  title: 'Tools: let the LLM look things up',
  summary: 'The writer can call get_order_status. The tool loop is part of the graph on the left, hidden inside run_sync on the right.',
  intro: `
    <p>To answer "Where is my order 123?" the LLM needs data it does not have. A <b>tool</b> is a normal Python
    function the model may ask you to call. The loop always looks the same: the model asks for a call, your code
    runs the function, the result goes back to the model, and the model either asks for another call or writes the
    answer.</p>
    <p>The tool itself is identical on both sides: its name, type hints and docstring become the description the
    model sees.</p>`,
  examples: [
    {
      title: 'The tool',
      lg: code`
        ORDERS = {"123": "shipped, arrives on Friday", "456": "waiting for payment"}


        def get_order_status(order_id: str) -> str:
            """Return the status of an order by its id."""
            return ORDERS.get(order_id, "order not found")
      `,
      pa: code`
        ORDERS = {"123": "shipped, arrives on Friday", "456": "waiting for payment"}


        def get_order_status(order_id: str) -> str:
            """Return the status of an order by its id."""
            return ORDERS.get(order_id, "order not found")
      `,
      files: ['langgraph_pipeline.py', 'pydantic_ai_pipeline.py'],
      links: [
        [4, 4, 'The name and the type hints become the tool schema: a tool <code>get_order_status</code> with one string argument <code>order_id</code>.'],
        [5, 5, 'The docstring becomes the tool description. The model reads it to decide when to call the tool, so write it for the model.'],
      ],
    },
    {
      title: 'Giving the tool to the model',
      lg: code`
        def draft_reply(state: State) -> State:
            prompt = [
                SystemMessage("Write a short, friendly reply to the support ticket. Use tools to look up facts."),
                *state["messages"],
            ]
            return {"messages": [llm.bind_tools([get_order_status]).invoke(prompt)]}
        ...
        builder.add_node("tools", ToolNode([get_order_status]))
        ...
        builder.add_conditional_edges("draft_reply", tools_condition)  # tool call? -> "tools", else END
        builder.add_edge("tools", "draft_reply")
      `,
      pa: code`
        writer = Agent(
            MODEL,
            tools=[get_order_status],
            instructions="Write a short, friendly reply to the support ticket. Use tools to look up facts.",
        )
      `,
      files: ['langgraph_pipeline.py', 'pydantic_ai_pipeline.py'],
      links: [
        [6, 3, 'Left: <code>bind_tools</code> only <b>tells</b> the model about the tool; the reply may contain a tool call, but nothing runs it yet. Right: <code>tools=[...]</code> both describes and runs the tool.'],
        [4, null, 'The model gets the whole conversation from the state, including earlier tool calls and their results. That is how it sees the result in the second round.'],
        [8, null, '<code>ToolNode</code> is a ready-made node: it reads the tool calls from the last message, runs the functions, and adds their results to <code>messages</code>.'],
        [10, null, '<code>tools_condition</code> is a ready-made router: if the last message has tool calls, go to <code>"tools"</code>, otherwise to <code>END</code>.'],
        [11, null, 'After the tools ran, go back to <code>draft_reply</code>. This edge closes the loop: draft_reply → tools → draft_reply → ... → END.'],
      ],
    },
  ],
  differ: `
    <p><b>Visible loop vs. hidden loop.</b> In LangGraph the tool loop is part of your graph: two nodes and two edges.
    You see every round in the state, and you could add a node in between (log, check, ask a human). In Pydantic AI
    the loop runs inside <code>writer.run_sync(...)</code>: you get the final answer, and the rounds are in
    <code>result.all_messages()</code> if you want them.</p>
    <p><b>Tools can need things.</b> A real tool needs a database client or an API key. Pydantic AI has
    <code>deps_type</code> and <code>RunContext</code> for that (typed dependencies passed into
    <code>run_sync</code>). In LangGraph you usually pass them through the config or close over them.</p>`,
  stepper: {
    trace: 'langgraph_single',
    runs: [0],
    title: 'Watch one tool round',
    text: `<p>Look at steps 3 to 5: <code>draft_reply</code> returns a message that only <b>calls</b> the tool,
    <code>tools</code> adds the result, and <code>draft_reply</code> runs again and writes the answer.</p>`,
  },
  quiz: [
    {
      q: 'In the LangGraph version, who actually runs <code>get_order_status</code>?',
      options: ['The LLM provider', 'bind_tools', 'The ToolNode, in the "tools" step', 'tools_condition'],
      answer: 2,
      why: '<code>bind_tools</code> only describes the tool to the model, and <code>tools_condition</code> only routes. <code>ToolNode</code> runs the function and adds a tool message with the result.',
    },
    {
      q: 'You remove <code>builder.add_edge("tools", "draft_reply")</code>. What happens on "Where is my order 123?"',
      options: ['Nothing changes', 'The tool runs, but no node writes the answer from its result', 'The tool never runs', 'The model answers without the tool'],
      answer: 1,
      why: 'The graph still compiles. A node with no outgoing edge simply ends the run, so the last message is the tool result and nobody writes the answer. LangGraph does not warn you: the stepper (or a test) is how you notice.',
    },
    {
      q: 'Where does the model get the text "Return the status of an order by its id."?',
      options: ['From the system message', 'From the function docstring', 'From the ToolNode name', 'From OpenRouter'],
      answer: 1,
      why: 'Both libraries turn the docstring into the tool description and the type hints into the argument schema.',
    },
  ],
  cheat: [
    ['<code>llm.bind_tools([f])</code> + <code>ToolNode([f])</code>', '<code>Agent(..., tools=[f])</code>'],
    ['<code>add_conditional_edges("draft_reply", tools_condition)</code>', 'Loop runs inside <code>run_sync</code>'],
    ['<code>add_edge("tools", "draft_reply")</code> closes the loop', '<code>result.all_messages()</code> shows the rounds'],
    ['Docstring + type hints = tool schema', 'Docstring + type hints = tool schema'],
  ],
});
