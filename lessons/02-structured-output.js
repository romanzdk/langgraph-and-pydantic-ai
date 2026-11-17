LESSONS.push({
  part: 'Build the pipeline',
  id: 'structured-output',
  title: 'Structured output: get a Ticket, not text',
  summary: 'Ask the LLM for a Pydantic model instead of free text, and why one default broke with Claude.',
  intro: `
    <p>The first step classifies the ticket. We don't want a sentence like "this looks like an urgent bug". We want
    data that code can use: a category from a fixed list and a yes/no flag. Both libraries can ask the LLM to fill
    in a <b>Pydantic model</b> and give it back as a real Python object.</p>`,
  examples: [
    {
      title: 'The same Ticket, two ways to fill it',
      text: `<p>The model class is the same on both sides. Hover the marked lines.</p>`,
      lg: code`
        class Ticket(BaseModel):
            category: Literal["bug", "billing", "question"]
            urgent: bool
        ...
        def classify(state: State) -> State:
            question = state["messages"][-1].text
            ticket = llm.with_structured_output(Ticket, method="json_schema").invoke(
                f"Classify this support ticket:\n\n{question}"
            )
            return {"ticket": ticket}
      `,
      pa: code`
        class Ticket(BaseModel):
            category: Literal["bug", "billing", "question"]
            urgent: bool
        ...
        classifier = Agent(MODEL, output_type=Ticket, instructions="Classify the support ticket.")
        ...
            ticket = classifier.run_sync(text).output
      `,
      files: ['langgraph_pipeline.py', 'pydantic_ai_pipeline.py'],
      links: [
        [2, 2, '<code>Literal[...]</code> limits the LLM to these three values. The JSON schema sent to the model lists them, and Pydantic rejects anything else.'],
        [7, 5, 'Left: a new runnable that returns <code>Ticket</code> instead of a chat message. Right: the output type is part of the agent, set once when it is created.'],
        [8, 7, 'Left: <code>invoke</code> sends the prompt and returns a <code>Ticket</code>. Right: <code>run_sync</code> returns a result object; <code>.output</code> is the <code>Ticket</code>.'],
        [10, null, 'A LangGraph node returns only the keys of the state it changes. More about this in lesson 4.'],
      ],
    },
  ],
  differ: `
    <p><b>How the model is forced to answer in that shape.</b> There are two common ways: give the model a "tool"
    whose arguments are the schema and <i>force</i> it to call it (<code>tool_choice</code>), or ask for a JSON
    answer that follows the schema (<code>json_schema</code>).</p>
    <p>LangChain's <code>with_structured_output</code> uses the forced tool call by default. Claude Sonnet 5.5 and
    Haiku 5.5 refuse a forced <code>tool_choice</code>, so the first version failed with
    <code>400 - Provider returned error</code>. The fix is <code>method="json_schema"</code>.</p>
    <p>Pydantic AI worked without changes: it gives the model an output tool but does not force it, so the model is
    free to call it, and it does.</p>
    <p><b>Lesson:</b> when a provider says "Provider returned error", read the raw error in the response body. Here it
    said exactly: <code>tool_choice: type "tool" and "any" are not supported for this model</code>.</p>`,
  quiz: [
    {
      q: 'The LLM answers <code>{"category": "refund", "urgent": false}</code>. What happens?',
      options: ['The Ticket is created with category "refund"', 'Validation fails, because "refund" is not one of the Literal values', 'category becomes None', 'The LLM is asked again automatically in LangGraph'],
      answer: 1,
      why: 'Pydantic checks the value against <code>Literal["bug", "billing", "question"]</code> and rejects it. (Pydantic AI can send the error back to the model and let it retry; LangChain raises.)',
    },
    {
      q: 'What type is <code>classifier.run_sync(text)</code>?',
      code: code`
        ticket = classifier.run_sync(text).output
      `,
      options: ['Ticket', 'str', 'A result object; its .output is the Ticket', 'dict'],
      answer: 2,
      why: 'It is a run result. Besides <code>.output</code> it carries the messages of the run (<code>all_messages()</code>) and token usage.',
    },
  ],
  cheat: [
    ['<code>llm.with_structured_output(Ticket, method="json_schema")</code>', '<code>Agent(MODEL, output_type=Ticket)</code>'],
    ['<code>.invoke(prompt)</code> returns <code>Ticket</code>', '<code>.run_sync(prompt).output</code> is <code>Ticket</code>'],
    ['Default: forced tool call (Claude 5.5 rejects it)', 'Output tool, not forced: works out of the box'],
  ],
});
