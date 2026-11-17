LESSONS.push({
  part: 'Get started',
  id: 'setup',
  title: 'The task, the setup and the model',
  summary: 'What we build, what each library is for, and how both talk to a model through OpenRouter.',
  intro: `
    <p>Through the whole course we build one small pipeline, twice: once in <b>LangGraph</b>, once in
    <b>Pydantic AI</b>. A support ticket comes in, an LLM classifies it, urgent tickets go to the on-call engineer,
    and the rest get a reply written by the LLM.</p>
    <p>The two libraries come from different places, and that explains most of their differences:</p>
    <ul>
      <li><b>LangGraph</b> (from the LangChain team) is a runtime for <b>graphs</b>: you describe steps (nodes) and
      the paths between them (edges), and LangGraph runs them, passing a shared state from step to step. It does
      not call LLMs by itself. In these examples the LLM calls come from LangChain chat models, but LangGraph does
      not need LangChain: a node can call a provider SDK or a Pydantic AI agent just as well.</li>
      <li><b>Pydantic AI</b> (from the Pydantic team) is about the <b>LLM call</b> itself: an <code>Agent</code> sends
      a prompt, can call your Python functions as tools, and gives back a typed result. The flow between steps is
      your own Python code.</li>
    </ul>`,
  examples: [
    {
      title: 'One project for both',
      text: `<p>The examples are a normal <a href="https://docs.astral.sh/uv/">uv</a> project. The models go through
      <a href="https://openrouter.ai">OpenRouter</a>, so one API key works for Claude, GPT, DeepSeek and others.</p>`,
      sh: code`
        $ uv init --bare
        $ uv add langgraph langchain langchain-openrouter "pydantic-ai-slim[openrouter]"
        $ export OPENROUTER_API_KEY=sk-or-...
        $ uv run examples/langgraph_pipeline.py
        $ uv run examples/pydantic_ai_pipeline.py
      `,
    },
    {
      title: 'Picking the model',
      text: `<p>Both libraries take the model as one string: <code>provider:model</code>. Everything before the first
      colon picks the client; the rest is the model name as the provider knows it.</p>`,
      lg: code`
        from langchain.chat_models import init_chat_model
        ...
        llm = init_chat_model("openrouter:anthropic/claude-haiku-5.5")
      `,
      pa: code`
        from pydantic_ai import Agent
        ...
        MODEL = "openrouter:anthropic/claude-haiku-5.5"
      `,
      files: ['langgraph_pipeline.py', 'pydantic_ai_pipeline.py'],
      links: [
        [1, 1, 'LangGraph has no model class of its own. <code>init_chat_model</code> comes from LangChain and builds a chat model from a string. Pydantic AI has everything in one package.'],
        [3, 3, 'Same string on both sides. <code>openrouter:</code> picks the OpenRouter client (the <code>langchain-openrouter</code> package on the left), <code>anthropic/claude-haiku-5.5</code> is the model ID on OpenRouter. LangGraph makes the model object right away; Pydantic AI only keeps the string and gives it to each <code>Agent</code>.'],
      ],
    },
  ],
  differ: `
    <p><b>LangGraph is not an LLM library.</b> A LangGraph node can be any Python function: it may call an LLM, a
    database, or nothing at all. So you bring the model from somewhere else. Here that is LangChain, because its
    chat models plug into <code>ToolNode</code> and the message state, but it is a choice, not a requirement:
    lesson 7 swaps LangChain for Pydantic AI inside the same graph.</p>
    <p><b>Read the prefix carefully.</b> An early version of these examples used
    <code>"openai:anthropic/claude-sonnet-5.5"</code>: the OpenAI client pointed at the OpenRouter URL. It worked,
    because OpenRouter speaks the OpenAI API, but it reads like nonsense. With the
    <code>langchain-openrouter</code> package the left side is just <code>"openrouter:..."</code>, the same as Pydantic AI.</p>`,
  quiz: [
    {
      q: 'Which library decides in which order the steps run?',
      options: ['LangGraph, from the edges of the graph; in Pydantic AI it is your own Python code', 'Pydantic AI, from the agent instructions', 'Both decide it from the prompt', 'Neither, the LLM decides'],
      answer: 0,
      why: 'In LangGraph the order comes from the edges you add to the graph. Pydantic AI has no graph here: you call the agents in the order you write them.',
    },
    {
      q: 'In <code>"openrouter:anthropic/claude-haiku-5.5"</code>, what does <code>anthropic/claude-haiku-5.5</code> mean?',
      options: ['A local file with model settings', 'The model ID as OpenRouter knows it', 'The Anthropic client to use', 'A LangChain package name'],
      answer: 1,
      why: 'The part before the first colon picks the client (OpenRouter). The rest is passed to that provider as the model name.',
    },
  ],
  cheat: [
    ['<code>init_chat_model("openrouter:...")</code> (LangChain)', '<code>Agent("openrouter:...")</code>'],
    ['A runtime for graphs; LLM calls come from another library', 'An LLM call with tools and typed output; flow is your code'],
    ['<code>uv add langgraph langchain langchain-openrouter</code>', '<code>uv add "pydantic-ai-slim[openrouter]"</code>'],
  ],
});
