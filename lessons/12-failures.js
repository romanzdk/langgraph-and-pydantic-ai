LESSONS.push({
  id: 'failures',
  part: 'When it goes wrong',
  title: 'When things fail',
  summary: 'Timeouts, bad output, a tool loop that never ends, and a crash in the middle of a refund. What each library does, and what is still your job.',
  intro: `
    <p>So far every run worked. In production, runs fail in a few typical ways, and each needs a different fix:</p>
    <ul>
      <li><b>The request fails</b> (timeout, rate limit, a 5xx error). Send the same request again.</li>
      <li><b>The output fails the schema</b>. Tell the model what was wrong and let it try again.</li>
      <li><b>The output passes the schema but is wrong</b>, for example the reply says "refunded" and no refund
      happened. Only your own check can catch this.</li>
      <li><b>The model keeps calling tools</b> and never answers. You need a budget.</li>
      <li><b>The process dies</b> in the middle of a run. You continue the run, or run the turn again. Either way, a
      tool may run a second time, so a refund must not pay out twice.</li>
    </ul>
    <p>The writer here can look up and refund orders. The files are <code>failures_langgraph.py</code> and
    <code>failures_pydantic_ai.py</code>; the refund itself lives in <code>shop.py</code>, plain Python used by both.</p>`,
  examples: [
    {
      title: 'Retry the request, or fix the output',
      text: `<p>The word "retry" means different things here. Both HTTP clients underneath (the OpenRouter client in
      LangChain, the OpenAI SDK in Pydantic AI) already retry timeouts and rate limits twice before you see an
      error. On top of that:</p>`,
      lg: code`
        builder = StateGraph(MessagesState)
        builder.add_node(draft_reply, retry_policy=RetryPolicy(max_attempts=3))
        builder.add_node("tools", ToolNode(TOOLS))
      `,
      pa: code`
        writer = Agent(
            pa.MODEL,
            tools=[shop.get_order_status, shop.issue_refund],
            retries=2,
            instructions="Reply to the support ticket. You can look up and refund orders.",
        )
      `,
      files: ['failures_langgraph.py', 'failures_pydantic_ai.py'],
      links: [
        [2, null, 'If <code>draft_reply</code> raises, LangGraph runs the whole step again, up to 3 times in total, with a growing pause. By default it retries most errors, but not programming errors like <code>ValueError</code> or <code>TypeError</code>. Pass <code>retry_on=</code> to choose.'],
        [null, 4, '<code>retries</code> is not about the network. When tool arguments or the output fail validation, or your code raises <code>ModelRetry</code>, Pydantic AI sends the error back to the model and lets it try again, here up to 2 times.'],
        [3, 3, 'The tools themselves get no retry here. A tool that pays money should not be run again blindly; see the last example.'],
      ],
    },
    {
      title: 'Valid, but wrong',
      text: `<p>A reply can be a perfectly valid <code>str</code> and still lie. Here the model claims a refund it never
      made. An output validator checks the result against what really happened in the run.</p>`,
      pa: code`
        @writer.output_validator
        def no_made_up_refund(ctx: RunContext, reply: str) -> str:
            called = {p.tool_name for m in ctx.messages for p in m.parts if isinstance(p, ToolReturnPart)}
            if "refunded" in reply.lower() and "issue_refund" not in called:
                raise ModelRetry("You wrote that the order was refunded, but you did not call issue_refund.")
            return reply
      `,
      files: ['failures_pydantic_ai.py'],
      links: [
        [1, 'Runs on every final output, after the schema check.'],
        [3, '<code>ctx.messages</code> is the whole run so far, including the tool results. The check uses facts, not the model\'s words.'],
        [5, '<code>ModelRetry</code> goes back to the model as feedback and counts against <code>retries</code>. When they run out, the run raises an error instead of returning a wrong reply.'],
      ],
    },
    {
      title: 'A budget for the tool loop',
      lg: code`
        def handle(graph, text: str | None, thread_id: str) -> str:
            """text=None continues the unfinished run of this thread instead of starting a new one."""
            config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 10}
            try:
                result = graph.invoke({"messages": [HumanMessage(text)]} if text else None, config)
            except GraphRecursionError:
                return GIVE_UP
            return result["messages"][-1].text
      `,
      pa: code`
        def handle(text: str, history: list[ModelMessage]) -> tuple[str, list[ModelMessage]]:
            try:
                result = writer.run_sync(text, message_history=history, usage_limits=UsageLimits(tool_calls_limit=4))
            except UsageLimitExceeded:
                return GIVE_UP, history
            return result.output, result.all_messages()
      `,
      files: ['failures_langgraph.py', 'failures_pydantic_ai.py'],
      links: [
        [3, 3, 'Left: at most 10 steps; every <code>draft_reply</code> and every <code>tools</code> is one, so about 4 tool rounds. Right: at most 4 tool calls. You can also limit requests, tokens, or cost (<code>cost_limit</code>).'],
        [6, 4, 'Both raise when the budget runs out. Catch it and hand the ticket to a person instead of showing an error.'],
        [5, null, 'With <code>None</code> as input, <code>invoke</code> does not start a new run: it continues the saved one. That is how you resume after a crash.'],
      ],
    },
    {
      title: 'A crash in the middle of a refund',
      text: `<p>With a SQLite checkpointer, a new process can continue a run that died. It runs the step that did not
      finish again, from its first line. If that step had already paid out, it pays again, unless the refund
      knows it was done. In Pydantic AI there is no checkpoint inside a run: you run the whole turn again from the
      history you saved, and every tool call of that turn happens again.</p>`,
      lg: code`
        with SqliteSaver.from_conn_string("support.db") as checkpointer:
            graph = builder.compile(checkpointer=checkpointer)
            config = {"configurable": {"thread_id": "customer-1"}}
            if graph.get_state(config).next:
                print("The last run did not finish. Continuing it.")
                print(handle(graph, None, "customer-1"))
      `,
      py: code`
        def issue_refund(order_id: str) -> str:
            """Refund an order."""
            # Keyed by order, not by tool call: a retried run makes a new tool call for the same refund.
            if order_id in REFUNDS:
                return f"order {order_id} was already refunded ({REFUNDS[order_id]})"
            REFUNDS[order_id] = f"refund-{len(REFUNDS) + 1}"
            return f"refund {REFUNDS[order_id]} sent for order {order_id}"
      `,
      files: ['failures_langgraph.py', 'shop.py'],
      links: [
        [1, null, 'The state is saved in a file after every step, so it outlives the process. <code>pip install langgraph-checkpoint-sqlite</code>; use Postgres when several machines share it.'],
        [4, null, '<code>.next</code> lists the steps still to run. Not empty means the last run stopped in the middle.'],
        [null, 4, 'The check that makes it safe to run twice. Here a dict; in a real shop a database table with the order id as a unique key, written in the same transaction as the payout.'],
        [null, 3, 'Why the order id and not the tool call id: when Pydantic AI runs the turn again, the model makes a new call with a new id for the same refund.'],
        [null, 5, 'The second call still returns a useful text, so the model can tell the customer what happened.'],
      ],
    },
  ],
  differ: `
    <p><b>Where a run can continue from.</b> LangGraph saves the state after every step, so after a crash it repeats
    only the unfinished step. Pydantic AI saves nothing during a run: you keep <code>all_messages()</code> after
    each turn, and after a crash you run the turn again. Both repeat work, so every tool with a side effect must be
    safe to call twice.</p>
    <p><b>Both libraries together.</b> In lesson 7 the whole <code>writer.run_sync()</code> is one LangGraph step. The
    checkpointer saves the state before and after it, not the tool calls inside it. If the process dies halfway
    through the agent's run, LangGraph runs the whole agent again.</p>
    <p><b>The default budget.</b> Pydantic AI stops a run after 50 requests by default. LangGraph 1.2 allows 10,007
    steps by default (it used to be 25), which for a tool loop means no limit: set <code>recursion_limit</code>
    yourself.</p>
    <p><b>A wrong output in LangGraph.</b> There is no output validator. Write the same check as a node after
    <code>draft_reply</code>: if the reply is wrong, add a message with the problem and go back to
    <code>draft_reply</code>, and count the attempts so it cannot loop forever.</p>
    <p><b>Invalid structured output.</b> Pydantic AI sends the validation error back to the model. LangChain's
    <code>with_structured_output</code> raises; <code>.with_retry()</code> or a <code>RetryPolicy</code> asks again
    with the same prompt, without telling the model what was wrong.</p>`,
  stepper: {
    trace: 'crash',
    title: 'Crash and resume',
    text: `<p>Run 1: the model asks for the refund, the money goes out, and the process dies before the
    <code>tools</code> step is saved. Then pick run 2: a new process resumes, the <code>tools</code> step runs again,
    and the refund says it was already done. Without that check, the customer would get the money twice.</p>`,
  },
  quiz: [
    {
      q: 'The model returns JSON that fails your Pydantic schema. What does Pydantic AI do?',
      options: ['Raises right away', 'Sends the validation error back to the model and lets it try again, up to <code>retries</code> times', 'Returns the raw text', 'Sends the same request again without changes'],
      answer: 1,
      why: 'Validation errors become feedback for the model. Only when the retries run out does the run raise.',
    },
    {
      q: 'A LangGraph run died inside the <code>tools</code> step. What does <code>invoke(None, config)</code> do?',
      options: ['Starts the whole run from the beginning', 'Runs the <code>tools</code> step again, then continues', 'Skips the <code>tools</code> step', 'Nothing, the run is lost'],
      answer: 1,
      why: 'The last checkpoint is the one after <code>draft_reply</code>. The unfinished step runs again from its first line, so its tools must be safe to run twice.',
    },
    {
      q: 'Why is the refund keyed by order id and not by tool call id?',
      options: ['Tool call ids are secret', 'A run that is repeated may make a new tool call, with a new id, for the same refund', 'Order ids are shorter', 'LangGraph has no tool call ids'],
      answer: 1,
      why: 'The key must name the thing that may only happen once: the refund of this order.',
    },
    {
      q: 'Which default stops a tool loop that never ends?',
      options: ['Both stop after 25 steps', 'Pydantic AI after 50 requests; LangGraph 1.2 only after 10,007 steps', 'Neither has a limit', 'LangGraph after 50 requests'],
      answer: 1,
      why: 'Set <code>recursion_limit</code> in LangGraph and <code>UsageLimits</code> in Pydantic AI to what one ticket should cost.',
    },
  ],
  exercises: [
    {
      name: 'tool_limit',
      title: 'stop a tool loop',
      text: `<p>A model calls <code>get_order_status</code> again and again. Make both <code>handle_*</code> functions stop
      after a few tool rounds and return <code>GIVE_UP</code>. The check uses a fake model that never stops, so no
      API key is needed.</p>`,
    },
    {
      name: 'refund_once',
      title: 'a refund that is safe to run twice',
      text: `<p><code>issue_refund</code> pays every time it is called. Change it so each order is paid at most once,
      and a second call still returns a text the model can use.</p>`,
    },
  ],
  cheat: [
    ['<code>add_node(f, retry_policy=RetryPolicy(max_attempts=3))</code>', 'HTTP retries in the client; <code>Agent(retries=2)</code> for invalid output'],
    ['A check node with an edge back to <code>draft_reply</code>', '<code>@agent.output_validator</code> + <code>raise ModelRetry(...)</code>'],
    ['<code>{"recursion_limit": 10}</code> → <code>GraphRecursionError</code>', '<code>UsageLimits(tool_calls_limit=4)</code> → <code>UsageLimitExceeded</code>'],
    ['<code>SqliteSaver</code>; <code>invoke(None, config)</code> continues', 'Save <code>all_messages()</code>; run the turn again'],
    ['Resume re-runs the unfinished step', 'A new run re-runs every tool call of the turn'],
  ],
});
