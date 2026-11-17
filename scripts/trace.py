"""Record how the graph state changes, step by step, for the lesson stepper.

Runs the real graphs from examples/ with fake models (no API key), so the steps and the
state are what LangGraph really produces. Only the reply texts are canned.

Usage: uv run scripts/trace.py   (writes traces.js; CI checks it is up to date)
"""

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "examples"))
os.environ.setdefault("OPENROUTER_API_KEY", "fake")

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage  # noqa: E402
from langgraph.types import Command  # noqa: E402
from pydantic_ai.messages import ModelMessagesTypeAdapter, ModelResponse, TextPart, ToolCallPart, ToolReturnPart, UserPromptPart  # noqa: E402
from pydantic_ai.models.function import AgentInfo, FunctionModel  # noqa: E402

import combined_pipeline as cb  # noqa: E402
import hitl_langgraph as hl  # noqa: E402
import langgraph_pipeline as lg  # noqa: E402
from check_offline import FakeLLM  # noqa: E402

QUESTIONS = ["Where is my order 123?", "And what about 456?", "Production is down, nobody can log in!"]
REPLIES = {
    "123": "Hi! Order 123 has shipped and should arrive on Friday.",
    "456": "Hi! Order 456 is waiting for payment. Once it is paid, we will ship it.",
}


def fake_ticket(question: str) -> dict:
    urgent = "down" in question
    return {"category": "bug" if urgent else "question", "urgent": urgent}


def show(value):
    if isinstance(value, HumanMessage):
        return {"role": "human", "text": value.text}
    if isinstance(value, ToolMessage):
        return {"role": "tool", "text": value.text}
    if isinstance(value, AIMessage):
        calls = [f"{c['name']}({', '.join(f'{k}={v!r}' for k, v in c['args'].items())})" for c in value.tool_calls]
        return {"role": "ai", "text": value.text, "tool_calls": calls} if calls else {"role": "ai", "text": value.text}
    if isinstance(value, bytes):
        return f"<{len(ModelMessagesTypeAdapter.validate_json(value))} Pydantic AI messages as JSON>"
    if isinstance(value, list):
        return [show(v) for v in value]
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return value


def record(graph, make_input, questions: list[str], one_thread: bool) -> list[dict]:
    """One entry per question; each has the steps of that run with the full state after every step.

    one_thread=True asks all questions in one conversation (memory); False starts a new thread for each.
    """
    runs = []
    for i, question in enumerate(questions):
        config = {"configurable": {"thread_id": "customer-1" if one_thread else f"one-question-{i}"}}
        before_question(question)
        steps = stream_steps(graph, make_input(question), config)
        runs.append({"question": question, "continues": one_thread and i > 0, "steps": steps})
    return runs


def stream_steps(graph, graph_input, config) -> list[dict]:
    steps, node, changed, paused = [], "(input)", [], None
    for mode, chunk in graph.stream(graph_input, config, stream_mode=["updates", "values"]):
        if mode == "updates":
            [(node, update)] = chunk.items()
            if node == "__interrupt__":
                node, changed, paused = "(paused)", [], update[0].value
            else:
                changed = sorted(update)
        else:
            step = {"node": node, "changed": changed, "state": {k: show(v) for k, v in chunk.items() if k != "__interrupt__"}}
            if paused:
                step["interrupt"] = paused
            steps.append(step)
    return steps


def record_human_in_the_loop() -> list[dict]:
    """One run until interrupt() pauses the graph, then a second run that resumes it."""
    lg.llm = FakeLLM(
        ticket=lg.Ticket(category="billing", urgent=False),
        messages=iter([
            AIMessage("", tool_calls=[{"name": "issue_refund", "args": {"order_id": "123"}, "id": "call_refund"}]),
            AIMessage("Order 123 has been refunded. Sorry it arrived broken!"),
        ]),
    )
    config = {"configurable": {"thread_id": "customer-1"}}
    question = "Order 123 arrived broken. Please refund it."
    return [
        {"question": question, "continues": False, "steps": stream_steps(hl.graph, lg_input(question), config)},
        {"question": "Command(resume=True)", "continues": True, "resume": True, "steps": stream_steps(hl.graph, Command(resume=True), config)},
    ]


def lg_messages():
    for order_id, reply in REPLIES.items():
        yield AIMessage("", tool_calls=[{"name": "get_order_status", "args": {"order_id": order_id}, "id": f"call_{order_id}"}])
        yield AIMessage(reply)


def fake_agent_model(messages, info: AgentInfo) -> ModelResponse:
    question = [p.content for m in messages for p in m.parts if isinstance(p, UserPromptPart)][-1]
    if info.output_tools:
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, fake_ticket(question))])
    order_id = re.search(r"\d+", question).group()
    if not isinstance(messages[-1].parts[-1], ToolReturnPart):
        return ModelResponse(parts=[ToolCallPart("get_order_status", {"order_id": order_id})])
    return ModelResponse(parts=[TextPart(REPLIES[order_id])])


def before_question(question: str) -> None:
    lg.llm.ticket = lg.Ticket(**fake_ticket(question))


def lg_input(question: str) -> dict:
    return {"messages": [HumanMessage(question)]}


traces = {}
lg.llm = FakeLLM(ticket=lg.Ticket(category="question", urgent=False), messages=lg_messages())
traces["langgraph_single"] = record(lg.graph, lg_input, [QUESTIONS[0], QUESTIONS[2]], one_thread=False)
lg.llm = FakeLLM(ticket=lg.Ticket(category="question", urgent=False), messages=lg_messages())
traces["langgraph"] = record(lg.graph, lg_input, QUESTIONS, one_thread=True)
traces["hitl"] = record_human_in_the_loop()
with cb.classifier.override(model=FunctionModel(fake_agent_model)), cb.writer.override(model=FunctionModel(fake_agent_model)):
    traces["combined"] = record(cb.graph, lambda q: {"text": q}, QUESTIONS, one_thread=True)

out = "// Generated by scripts/trace.py. Do not edit by hand.\nwindow.TRACES = " + json.dumps(traces, indent=1, ensure_ascii=False) + ";\n"
(ROOT / "traces.js").write_text(out)
print(f"wrote traces.js: {sum(len(r['steps']) for t in traces.values() for r in t)} steps")
