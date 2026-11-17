LESSONS.push({
  part: 'Ship it',
  id: 'testing',
  title: 'Testing without an API key',
  summary: 'Run every pipeline with fake models: a fake LangChain chat model on the left, FunctionModel and override on the right.',
  intro: `
    <p>Real LLM calls are slow, cost money and give a different answer every time. For tests you want a fake model
    that answers what you tell it to, so you can check the <b>flow</b>: the branches, the tool round, the memory.
    Everything on this site is checked this way in CI, with no API key.</p>`,
  examples: [
    {
      title: 'A fake model',
      lg: code`
        class FakeLLM(GenericFakeChatModel):
            ticket: lg.Ticket

            def with_structured_output(self, schema, **kwargs):
                return type("R", (), {"invoke": lambda _, prompt: self.ticket})()

            def bind_tools(self, tools, **kwargs):
                return self
      `,
      pa: code`
            def respond(messages, info: AgentInfo) -> ModelResponse:
                if info.output_tools:
                    args = {"category": "question", "urgent": urgent}
                    return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, args)])
        ...
            return FunctionModel(respond)
      `,
      files: ['check_offline.py', 'check_offline.py'],
      links: [
        [1, 6, 'Left: LangChain\'s <code>GenericFakeChatModel</code> returns the messages you give it, one per call. Right: <code>FunctionModel</code> calls your function, which builds the model\'s answer.'],
        [4, 2, 'Left: the fake has to imitate every LangChain method the code uses, so <code>with_structured_output</code> is replaced by hand. Right: the function sees the agent info, for example whether an output type is expected.'],
        [7, null, '<code>bind_tools</code> too. If the pipeline starts using another method, the fake must learn it.'],
        [null, 4, 'Answering with a call to the output tool is how a model returns structured output in Pydantic AI. Here: a fixed <code>Ticket</code>.'],
      ],
    },
    {
      title: 'Putting the fake in',
      lg: code`
                lg.llm = FakeLLM(
                    ticket=lg.Ticket(category="question", urgent=urgent),
                    messages=iter([tool_call("1"), AIMessage("Your order is on its way."), tool_call("2"), AIMessage("Second reply.")]),
                )
      `,
      pa: code`
                with pa.classifier.override(model=model), pa.writer.override(model=model):
                    _, _, history = pa.handle("first", [])
                    assert pa.handle("second", history)[1] == expected
      `,
      files: ['check_offline.py', 'check_offline.py'],
      links: [
        [1, 1, 'Left: replace the module global <code>llm</code> (monkeypatching). Right: <code>Agent.override</code> swaps the model only inside the <code>with</code> block, and puts the real one back after.'],
        [3, null, 'The answers in order: a tool call, a reply, a tool call, a reply. Each must be a new message object; reusing one makes <code>add_messages</code> replace it (see lesson 4).'],
        [null, 3, 'Then check the result like any other function.'],
      ],
    },
  ],
  differ: `
    <p><b>Built in vs. by hand.</b> Pydantic AI was designed for this: <code>Agent.override</code>,
    <code>FunctionModel</code> and <code>TestModel</code> (which fills the output type with valid fake data on its
    own). With LangGraph + LangChain you replace the model object yourself and fake each method your code uses.</p>
    <p><b>The graph is the real thing.</b> Only the model is fake. The graph, the reducers, the checkpointer and the
    tool node are the real code. The stepper on this site is recorded the same way
    (<a href="https://github.com/romanzdk/langgraph-and-pydantic-ai/blob/main/scripts/trace.py">scripts/trace.py</a>):
    a real run of the real graph, with canned answers.</p>
    <p><b>Still try it for real.</b> Fakes check the flow, not the model. The 400 error from lesson 2 only showed up
    against the real API.</p>`,
  quiz: [
    {
      q: 'What does <code>Agent.override(model=...)</code> do after the <code>with</code> block ends?',
      options: ['Keeps the fake model forever', 'Puts the original model back', 'Deletes the agent', 'Raises if a real call happens'],
      answer: 1,
      why: 'It is a context manager: the fake is used only inside the block.',
    },
    {
      q: 'The graph code starts calling <code>llm.stream(...)</code>. What breaks first?',
      options: ['Nothing', 'The Pydantic AI test', 'Possibly the LangGraph fake, which only imitates what the code used before', 'The checkpointer'],
      answer: 2,
      why: 'A hand-made fake only covers the methods it was written for. That is the price of monkeypatching.',
    },
  ],
  cheat: [
    ['<code>GenericFakeChatModel(messages=iter([...]))</code>', '<code>FunctionModel(fn)</code> or <code>TestModel()</code>'],
    ['Replace the global: <code>module.llm = Fake(...)</code>', '<code>with agent.override(model=fake): ...</code>'],
    ['Fake each LangChain method you use', 'One function sees messages and agent info'],
  ],
});
