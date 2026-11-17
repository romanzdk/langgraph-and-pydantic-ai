LESSONS.push({
  id: 'branching',
  title: 'Branching: edges or an if',
  summary: 'Urgent tickets go one way, the rest another. A conditional edge on the left, a plain if on the right.',
  intro: `
    <p>After classifying, the pipeline splits: urgent tickets are escalated, the rest get a reply. This is the
    clearest difference between the two libraries. LangGraph <b>declares</b> the flow as a graph first and runs it
    later. Pydantic AI has no graph here: the flow is ordinary Python that runs line by line.</p>`,
  examples: [
    {
      title: 'The same decision',
      text: `<p>On the right, ignore <code>history</code> for now; it is for memory in lesson 6.</p>`,
      lg: code`
        def route(state: State) -> Literal["escalate", "draft_reply"]:
            return "escalate" if state["ticket"].urgent else "draft_reply"


        def escalate(state: State) -> State:
            return {"messages": [AIMessage(f"Sent to on-call engineer ({state['ticket'].category}).")]}
        ...
        builder = StateGraph(State)
        builder.add_node(classify)
        builder.add_node(escalate)
        builder.add_node(draft_reply)
        ...
        builder.add_edge(START, "classify")
        builder.add_conditional_edges("classify", route)
        builder.add_edge("escalate", END)
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
        [2, 3, 'The decision itself is the same one line. Left: it returns the <b>name of the next node</b>. Right: it is just an <code>if</code>.'],
        [6, 4, 'Escalation. Left: a node that adds a message to the state. Right: return early from the function.'],
        [9, null, 'Each function becomes a node. The node name is the function name.'],
        [13, 2, 'Left: an edge says "after START, run classify". Right: the first line of the function simply runs first.'],
        [14, 3, 'A conditional edge: after <code>classify</code>, call <code>route</code> and go to the node it names. <code>route</code> is not a node itself; it only picks the path.'],
        [15, 4, 'After escalating, the run ends.'],
      ],
    },
  ],
  differ: `
    <p><b>Declared vs. executed.</b> <code>builder</code> only describes the graph; nothing runs until
    <code>graph.invoke(...)</code>. Because the graph exists as data, LangGraph can draw it
    (<code>graph.get_graph().draw_mermaid()</code>), save the state after each step (lesson 6), and pause in the
    middle and continue later. On the right you get none of that for free, but you can read the flow top to bottom
    and step through it in any debugger.</p>
    <p><b>The router is not a step.</b> In the stepper below, watch the highlighted node: there is no
    <code>route</code> step. A conditional edge runs right after its node and only picks where to go.</p>`,
  stepper: {
    trace: 'langgraph_single',
    title: 'Step through both branches',
    text: `<p>A recorded run of the real graph. Question 1 takes the reply branch (with a tool call, see lesson 5),
    question 2 is urgent and takes the escalate branch. Each question starts with a fresh state.</p>`,
  },
  quiz: [
    {
      q: 'What must <code>route</code> return?',
      options: ['True or False', 'The name of the next node', 'The updated state', 'Nothing, it changes the state in place'],
      answer: 1,
      why: '<code>add_conditional_edges("classify", route)</code> runs <code>route</code> and goes to the node whose name it returns. The <code>Literal[...]</code> return type also tells LangGraph which edges exist, so it can draw them.',
    },
    {
      q: 'When does the code in <code>builder.add_conditional_edges("classify", route)</code> call the LLM?',
      options: ['Right away, while building the graph', 'Never; it only adds an edge. Nodes run later, on graph.invoke', 'Once per edge', 'When the module is imported'],
      answer: 1,
      why: 'Building the graph runs nothing. <code>compile()</code> checks it; <code>invoke()</code> runs it.',
    },
  ],
  cheat: [
    ['<code>builder.add_conditional_edges("classify", route)</code>', '<code>if ticket.urgent: ...</code>'],
    ['<code>route</code> returns a node name', 'Branch with normal control flow'],
    ['<code>builder.add_edge(START, "classify")</code>', 'The first line of the function runs first'],
    ['<code>graph.get_graph().draw_mermaid()</code> draws the flow', 'No picture; read the code'],
  ],
});
