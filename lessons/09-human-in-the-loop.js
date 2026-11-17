LESSONS.push({
  id: 'human-in-the-loop',
  title: 'Human in the loop: wait for a person',
  summary: 'A refund needs a person\'s OK. interrupt() and Command(resume=...) on the left, requires_approval and DeferredToolResults on the right.',
  intro: `
    <p>Some actions should not happen just because a model asked for them. Here the writer gets a new tool,
    <code>issue_refund</code>, and a person must approve every refund. Both libraries can pause the run on that
    tool, give control back to your code, and continue later with the person's answer.</p>
    <p>The example is a smaller pipeline on purpose: only the writer and the refund tool, no classifier. The files
    are <code>hitl_langgraph.py</code> and <code>hitl_pydantic_ai.py</code>.</p>`,
  examples: [
    {
      title: 'Marking the tool as "needs a person"',
      lg: code`
        def issue_refund(order_id: str) -> str:
            """Refund an order."""
            approved = interrupt(f"Refund order {order_id}?")
            return f"refund for order {order_id} sent" if approved else "a person rejected the refund"
        ...
        graph = builder.compile(checkpointer=InMemorySaver())  # resuming after interrupt() needs one
      `,
      pa: code`
        def issue_refund(order_id: str) -> str:
            """Refund an order."""
            return f"refund for order {order_id} sent"


        writer = Agent(
            pa.MODEL,
            tools=[Tool(issue_refund, requires_approval=True)],
            output_type=[str, DeferredToolRequests],
            instructions="Reply to the support ticket. You can refund orders.",
        )
      `,
      files: ['hitl_langgraph.py', 'hitl_pydantic_ai.py'],
      links: [
        [2, 2, 'The docstring does not mention approval. An earlier version said "A person must approve it first", and the model got confused: even after a person approved, it told the customer the refund was "not approved yet". Approval is your code\'s job, not the model\'s.'],
        [3, 8, 'Left: the tool itself asks. <code>interrupt(...)</code> stops the whole graph right here and returns the value it was given to the caller of <code>invoke</code>. Right: the tool is only marked; Pydantic AI does not run it at all until a person decided.'],
        [4, 3, 'Left: when the run continues, <code>interrupt</code> returns the person\'s answer, and the tool carries on. Right: this body runs only for approved calls.'],
        [6, null, 'The paused graph must be saved somewhere to be continued later. Without a checkpointer the graph still stops, but <code>Command(resume=...)</code> fails with <code>Cannot use Command(resume=...) without checkpointer</code>.'],
        [null, 9, 'The run can now end in two ways: with the reply text (<code>str</code>), or early, with a <code>DeferredToolRequests</code> listing the calls that wait for a person.'],
      ],
    },
    {
      title: 'Asking the person and continuing',
      lg: code`
        def handle(text: str, thread_id: str, ask_person) -> str:
            config = {"configurable": {"thread_id": thread_id}}
            result = graph.invoke({"messages": [HumanMessage(text)]}, config)
            while "__interrupt__" in result:
                question = result["__interrupt__"][0].value
                result = graph.invoke(Command(resume=ask_person(question)), config)
            return result["messages"][-1].text
      `,
      pa: code`
        def handle(text: str, ask_person) -> str:
            result = writer.run_sync(text)
            while isinstance(result.output, DeferredToolRequests):
                approvals = {
                    call.tool_call_id: ask_person(f"Refund order {call.args_as_dict()['order_id']}?")
                    for call in result.output.approvals
                }
                result = writer.run_sync(
                    message_history=result.all_messages(),
                    deferred_tool_results=DeferredToolResults(approvals=approvals),
                )
            return result.output
      `,
      files: ['hitl_langgraph.py', 'hitl_pydantic_ai.py'],
      links: [
        [3, 2, 'Start the run as usual.'],
        [4, 3, 'Did it stop for a person? Left: the result has an <code>__interrupt__</code> key. Right: the output is a <code>DeferredToolRequests</code> instead of text. A <code>while</code>, because a model may ask for another refund after the first one.'],
        [5, 5, 'Left: the question is whatever the tool passed to <code>interrupt()</code>. Right: you build the question yourself from the tool call\'s arguments.'],
        [6, 8, 'Left: <code>Command(resume=...)</code> with the same <code>thread_id</code> continues the saved run. Right: a <b>new</b> run with the old messages and the decisions, keyed by tool call id.'],
        [null, 10, '<code>True</code> approves. <code>False</code> denies, and the model is told "The tool call was denied." Use <code>ToolDenied("your message")</code> to tell it more.'],
      ],
    },
  ],
  differ: `
    <p><b>Pause anywhere vs. pause on a tool.</b> <code>interrupt()</code> works in any node or tool, at any point:
    "check this draft before sending", "pick one of these options", "fill in a missing field". Pydantic AI pauses
    only on tool calls (approval, or a tool that runs somewhere else). For "approve this action" both fit well.</p>
    <p><b>The node runs again.</b> When a LangGraph run resumes, the paused node starts again from its first line,
    and this time <code>interrupt()</code> returns the answer instead of stopping. So never do something with a side
    effect <i>before</i> <code>interrupt()</code>: it would happen twice.</p>
    <p><b>Where the paused run lives.</b> Left: in the checkpointer, so a web app can stop now, and continue in
    another request (even another process, with a database checkpointer) when the person clicks. Right: in the
    messages you got back; store <code>result.all_messages()</code> and the pending calls yourself.</p>`,
  stepper: {
    trace: 'hitl',
    title: 'Pause and resume',
    text: `<p>Run 1 stops at <code>paused</code>: the model asked for the refund, but the tool has not finished.
    Then pick run 2: <code>Command(resume=True)</code> loads the saved state, the <code>tools</code> step runs
    again and adds the result, and the model writes the reply.</p>`,
  },
  quiz: [
    {
      q: 'What does LangGraph do with the code in a tool <i>before</i> <code>interrupt()</code> when the run resumes?',
      options: ['Skips it', 'Runs it again, because the node starts from the beginning', 'Runs it only if resume=True', 'Raises an error'],
      answer: 1,
      why: 'Resuming re-runs the paused node from its first line. <code>interrupt()</code> then returns the answer. Keep side effects after it.',
    },
    {
      q: 'In Pydantic AI, the person says no. What does the model see?',
      options: ['Nothing, the run just stops', 'A tool result saying the call was denied, and then it writes a reply', 'An exception', 'The refund is sent anyway'],
      answer: 1,
      why: 'A denied call becomes a tool return with a denial message ("The tool call was denied." by default), so the model can explain it to the customer.',
    },
    {
      q: 'Why does continuing after <code>interrupt()</code> need a checkpointer?',
      options: ['To count interrupts', 'The paused state must be saved, so a later invoke can continue from it', 'For streaming', 'It does not need one'],
      answer: 1,
      why: '<code>invoke</code> returns when the graph pauses. The next <code>invoke</code> with <code>Command(resume=...)</code> loads that saved state by <code>thread_id</code>.',
    },
  ],
  cheat: [
    ['<code>interrupt("question")</code> inside a node or tool', '<code>Tool(f, requires_approval=True)</code>'],
    ['<code>"__interrupt__" in result</code>', '<code>isinstance(result.output, DeferredToolRequests)</code>'],
    ['<code>graph.invoke(Command(resume=answer), config)</code>', '<code>run_sync(message_history=..., deferred_tool_results=DeferredToolResults(approvals={id: True}))</code>'],
    ['Needs a checkpointer; the node re-runs on resume', 'New run with the old messages; only approved tools run'],
  ],
});
