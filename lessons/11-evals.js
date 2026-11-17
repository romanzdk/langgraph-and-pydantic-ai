LESSONS.push({
  id: 'evals',
  title: 'Evals: is it still right?',
  summary: 'One dataset of tickets, scored for both classifiers with pydantic_evals. Tests check the flow, evals check the answers.',
  intro: `
    <p>Lesson 8 tested the <b>flow</b> with fake models. That cannot tell you whether the real model classifies
    tickets well, or whether it still does after you change the prompt or the model. For that you need
    <b>evals</b>: a set of example inputs with the answers you expect, run against the real model, and scored.</p>
    <p>Evals do not belong to either library. <code>pydantic_evals</code> (from the Pydantic team) runs any
    function, so the same dataset scores both classifiers. The LangChain world usually uses LangSmith for this,
    which is a hosted service; <code>pydantic_evals</code> runs locally.</p>`,
  examples: [
    {
      title: 'A dataset and two checks',
      py: code`
        dataset = Dataset(
            name="ticket classification",
            cases=[
                Case(name="order status", inputs="Where is my order 123?", expected_output={"category": "question", "urgent": False}),
                Case(name="outage", inputs="Production is down, nobody can log in!", expected_output={"category": "bug", "urgent": True}),
        ...
            ],
        )


        def same_category(ctx: EvaluatorContext) -> bool:
            return ctx.output["category"] == ctx.expected_output["category"]


        def same_urgency(ctx: EvaluatorContext) -> bool:
            return ctx.output["urgent"] == ctx.expected_output["urgent"]


        dataset.add_evaluator(same_category)
        dataset.add_evaluator(same_urgency)
      `,
      files: ['evals.py'],
      links: [
        [4, 'A case: the input, and what we expect. The file has six: a question, an outage, a double charge, a how-to, a crash that is not urgent, and data loss.'],
        [11, 'An evaluator is any function that gets the context (input, output, expected output) and returns a score. A <code>bool</code> shows as ✔ or ✗.'],
        [15, 'Two separate checks instead of one "equal" check, so the report shows <i>what</i> is wrong: the category, the urgency, or both.'],
        [19, 'Run on every case. There are ready-made evaluators too, such as <code>EqualsExpected</code> and <code>LLMJudge</code> (another model grades the answer).'],
      ],
    },
    {
      title: 'The task: one function per library',
      lg: code`
        def classify_with_langgraph(text: str) -> dict:
            return lg.classify({"messages": [HumanMessage(text)]})["ticket"].model_dump()
        ...
                dataset.evaluate_sync(task, progress=False).print(include_input=True)
      `,
      pa: code`
        def classify_with_pydantic_ai(text: str) -> dict:
            return pa.classifier.run_sync(text).output.model_dump()
      `,
      files: ['evals.py', 'evals.py'],
      links: [
        [1, 1, 'Both return a <code>dict</code>, not a <code>Ticket</code>: the two files define their own <code>Ticket</code> classes, and dicts compare the same no matter which class made them.'],
        [2, 2, 'Left: a LangGraph node is a plain function, so you can call <code>classify</code> alone, with a hand-made state, without running the graph. Right: call the agent.'],
        [4, null, 'Run every case through the task, score it, and print a table.'],
      ],
      out: code`
        Evaluation Summary: classify_with_langgraph
        Case ID        Inputs                                   Assertions   Duration
        order status   Where is my order 123?                   ✔✔           1.5s
        outage         Production is down, nobody can log in!   ✔✔           1.5s
        double charge  You charged my card twice this month.    ✔✔           1.5s
        ...
        Averages                                                100.0% ✔     1.6s
      `,
    },
  ],
  differ: `
    <p><b>Tests vs. evals.</b> The offline check (lesson 8) runs in CI on every push, is fast and free, and must
    always pass. Evals call the real model, cost money, and give a score, not a pass/fail. Run them when you change
    the prompt, the model or the schema, and compare the score with the last run.</p>
    <p><b>Read the score honestly.</b> Both classifiers (Claude Haiku 5.5) got 12 of 12 checks right. That says
    these six tickets are easy, not that the classifier is perfect. A useful dataset grows from real tickets the
    model got wrong. With the fake models from lesson 8, which always answer "question, not urgent", the same
    dataset scores 50%: the offline check uses that to prove the evals code works.</p>
    <p><b>Test a node alone.</b> Calling <code>lg.classify(...)</code> directly is a nice side effect of LangGraph
    nodes being plain functions over the state. You can eval one step of a big graph without running the rest.</p>`,
  quiz: [
    {
      q: 'Your eval scores 100% on six tickets. What does it tell you?',
      options: ['The classifier is perfect', 'It handles these six cases; add harder, real cases to learn more', 'The model is overfitting', 'Nothing, evals need 1000 cases'],
      answer: 1,
      why: 'An eval is only as good as its cases. Grow it from real mistakes.',
    },
    {
      q: 'Why do the task functions return <code>model_dump()</code> instead of the <code>Ticket</code>?',
      options: ['Dicts are faster', 'The two files have different Ticket classes; dicts compare the same', 'pydantic_evals cannot handle Pydantic models', 'To save tokens'],
      answer: 1,
      why: 'Each example file defines its own <code>Ticket</code>. Comparing plain dicts keeps one dataset and one set of evaluators for both.',
    },
  ],
  cheat: [
    ['LangSmith (hosted) for evals', '<code>pydantic_evals</code>: <code>Dataset</code>, <code>Case</code>, evaluators (local)'],
    ['Eval one node: call it with a hand-made state', 'Eval one agent: <code>agent.run_sync(...).output</code>'],
    ['<code>dataset.evaluate_sync(task)</code> works with any function', '<code>dataset.evaluate_sync(task)</code> works with any function'],
  ],
});
