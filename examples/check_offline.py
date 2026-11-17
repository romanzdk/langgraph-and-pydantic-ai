"""Run all examples with fake models, so no API key is needed: `uv run examples/check_offline.py`.

Checks both branches (urgent / not urgent), that the tool result reaches the reply,
that a second question in the same conversation still sees the first one,
that a refund waits for a person (approve and reject), streaming, and the evals.
Then the failure cases (retry, step and tool limits, a crash in the middle of a refund,
made-up output), the safe tools (other customers' orders, injected text, approvals)
and the evals of the whole run.
"""

import os
import tempfile

os.environ.setdefault("OPENROUTER_API_KEY", "fake")

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, ToolCallPart, ToolReturnPart, UserPromptPart
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

import combined_pipeline as cb
import evals
import evals_full
import failures_langgraph
import failures_pydantic_ai
import hitl_langgraph
import hitl_pydantic_ai
import langgraph_pipeline as lg
import pydantic_ai_pipeline as pa
import safe_tools_langgraph
import safe_tools_pydantic_ai
import shop
import streaming_langgraph
import streaming_pydantic_ai

STATUS = "shipped, arrives on Friday"
ESCALATED = "Sent to on-call engineer (question)."


class FakeLLM(GenericFakeChatModel):
    ticket: lg.Ticket

    def with_structured_output(self, schema, **kwargs):
        return type("R", (), {"invoke": lambda _, prompt: self.ticket})()

    def bind_tools(self, tools, **kwargs):
        return self


def fake_model(urgent: bool, seen: list[list[str]]) -> FunctionModel:
    """Classifier: returns a Ticket. Writer: calls the tool, then replies with its result.

    `seen` collects the user questions the writer got, to check the memory.
    """

    def respond(messages, info: AgentInfo) -> ModelResponse:
        if info.output_tools:
            args = {"category": "question", "urgent": urgent}
            return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, args)])
        questions = [p.content for m in messages for p in m.parts if isinstance(p, UserPromptPart)]
        last_question = max(i for i, m in enumerate(messages) if isinstance(m, ModelRequest) and any(isinstance(p, UserPromptPart) for p in m.parts))
        returns = [p for m in messages[last_question:] for p in m.parts if isinstance(p, ToolReturnPart)]
        if not returns:
            seen.append(questions)
            return ModelResponse(parts=[ToolCallPart("get_order_status", {"order_id": "123"})])
        return ModelResponse(parts=[TextPart(f"Your order: {returns[0].content}")])

    return FunctionModel(respond)


def main() -> None:
    for urgent in (False, True):
        def tool_call(call_id: str) -> AIMessage:
            return AIMessage("", tool_calls=[{"name": "get_order_status", "args": {"order_id": "123"}, "id": call_id}])

        lg.llm = FakeLLM(
            ticket=lg.Ticket(category="question", urgent=urgent),
            messages=iter([tool_call("1"), AIMessage("Your order is on its way."), tool_call("2"), AIMessage("Second reply.")]),
        )
        config = {"configurable": {"thread_id": f"lg-{urgent}"}}
        lg.graph.invoke({"messages": [HumanMessage("first")]}, config)
        result = lg.graph.invoke({"messages": [HumanMessage("second")]}, config)
        humans = [m.text for m in result["messages"] if isinstance(m, HumanMessage)]
        assert humans == ["first", "second"], humans
        if urgent:
            assert result["messages"][-1].text == ESCALATED
        else:
            assert result["messages"][-1].text == "Second reply."
            tool_results = [m.content for m in result["messages"] if isinstance(m, ToolMessage)]
            assert tool_results == [STATUS, STATUS], tool_results

        expected = ESCALATED if urgent else f"Your order: {STATUS}"

        seen: list[list[str]] = []
        model = fake_model(urgent, seen)
        with pa.classifier.override(model=model), pa.writer.override(model=model):
            _, _, history = pa.handle("first", [])
            assert pa.handle("second", history)[1] == expected
        assert seen == ([] if urgent else [["first"], ["first", "second"]]), seen

        seen = []
        model = fake_model(urgent, seen)
        config = {"configurable": {"thread_id": f"cb-{urgent}"}}
        with cb.classifier.override(model=model), cb.writer.override(model=model):
            cb.graph.invoke({"text": "first"}, config)
            assert cb.graph.invoke({"text": "second"}, config)["answer"] == expected
        assert seen == ([] if urgent else [["first"], ["first", "second"]]), seen

    check_human_in_the_loop()
    check_streaming()
    check_evals()
    check_failures()
    check_safe_tools()
    check_full_evals()
    print("ok: all examples work: branches, tools, memory, human in the loop, streaming, evals,")
    print("    failures and recovery, safe tools, and evals of the whole run")


def check_human_in_the_loop() -> None:
    def refund_then_reply(messages, info: AgentInfo) -> ModelResponse:
        last = messages[-1].parts[-1]
        if isinstance(last, ToolReturnPart):
            return ModelResponse(parts=[TextPart(f"Result: {last.content}")])
        return ModelResponse(parts=[ToolCallPart("issue_refund", {"order_id": "456"})])

    for approved in (True, False):
        asked: list[str] = []

        def person(question: str) -> bool:
            asked.append(question)
            return approved

        lg.llm = FakeLLM(
            ticket=lg.Ticket(category="billing", urgent=False),
            messages=iter([
                AIMessage("", tool_calls=[{"name": "issue_refund", "args": {"order_id": "456"}, "id": f"r-{approved}"}]),
                AIMessage("Done."),
            ]),
        )
        thread = f"hitl-{approved}"
        assert hitl_langgraph.handle("Refund 456", thread, person) == "Done."
        tool_result = hitl_langgraph.graph.get_state({"configurable": {"thread_id": thread}}).values["messages"][2].text
        assert tool_result == ("refund for order 456 sent" if approved else "a person rejected the refund"), tool_result

        with hitl_pydantic_ai.writer.override(model=FunctionModel(refund_then_reply)):
            answer = hitl_pydantic_ai.handle("Refund 456", person)
        assert answer == ("Result: refund for order 456 sent" if approved else "Result: The tool call was denied."), answer
        assert asked == ["Refund order 456?", "Refund order 456?"], asked


def check_streaming() -> None:
    lg.llm = FakeLLM(ticket=lg.Ticket(category="question", urgent=False), messages=iter([AIMessage("Order 123 has shipped.")]))
    streaming_langgraph.stream("Where is my order 123?", "stream-1")

    async def stream_words(messages, info: AgentInfo):
        if isinstance(messages[-1].parts[-1], ToolReturnPart):
            for word in ["Order ", "123 ", "has ", "shipped."]:
                yield word
        else:
            yield {0: DeltaToolCall(name="get_order_status", json_args='{"order_id": "123"}')}

    with pa.writer.override(model=FunctionModel(stream_function=stream_words)):
        assert streaming_pydantic_ai.stream("Where is my order 123?") == "Order 123 has shipped."
    print()


def check_evals() -> None:
    # The fakes always answer "question, not urgent": 2 of 6 cases fully right, 6 of 12 checks pass.
    lg.llm = FakeLLM(ticket=lg.Ticket(category="question", urgent=False), messages=iter([]))
    with pa.classifier.override(model=fake_model(False, [])):
        for task in [evals.classify_with_langgraph, evals.classify_with_pydantic_ai]:
            report = evals.dataset.evaluate_sync(task, progress=False)
            passed = sum(a.value for case in report.cases for a in case.assertions.values())
            assert passed == 6, (task.__name__, passed)


def lg_call(name: str, order_id: str) -> AIMessage:
    return AIMessage("", tool_calls=[{"name": name, "args": {"order_id": order_id}, "id": f"{name}-{order_id}-{len(shop.REFUNDS)}"}])


class Crash(BaseException):
    """The process dies. BaseException, so no retry or error handler catches it."""


class CrashAfterPayout(dict):
    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        raise Crash


def check_failures() -> None:
    # A timeout in draft_reply: RetryPolicy runs the step again.
    class FlakyLLM(FakeLLM):
        fails: int = 1

        def invoke(self, *args, **kwargs):
            if self.fails:
                self.fails -= 1
                raise ConnectionError("timeout")
            return super().invoke(*args, **kwargs)

    lg.llm = FlakyLLM(ticket=lg.Ticket(category="question", urgent=False), messages=iter([AIMessage("Hello.")]))
    graph = failures_langgraph.builder.compile()
    assert failures_langgraph.handle(graph, "hi", "retry") == "Hello."

    # A model that never stops calling tools: recursion_limit and UsageLimits end the run.
    lg.llm = FakeLLM(ticket=lg.Ticket(category="question", urgent=False), messages=iter([lg_call("get_order_status", "123") for _ in range(20)]))
    assert failures_langgraph.handle(graph, "loop", "loop") == failures_langgraph.GIVE_UP

    def always_tool(messages, info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[ToolCallPart("get_order_status", {"order_id": "123"})])

    with failures_pydantic_ai.writer.override(model=FunctionModel(always_tool)):
        assert failures_pydantic_ai.handle("loop", []) == (failures_pydantic_ai.GIVE_UP, [])

    # The process dies after the payout, before the tools step is saved. Resuming runs the
    # step again; the refund is keyed by order, so the money goes out once.
    shop.REFUNDS = CrashAfterPayout()
    lg.llm = FakeLLM(ticket=lg.Ticket(category="billing", urgent=False), messages=iter([lg_call("issue_refund", "123"), AIMessage("Refunded.")]))
    db = os.path.join(tempfile.mkdtemp(), "support.db")
    with SqliteSaver.from_conn_string(db) as checkpointer:
        try:
            failures_langgraph.handle(failures_langgraph.builder.compile(checkpointer=checkpointer), "refund 123", "crash")
            raise AssertionError("expected a crash")
        except Crash:
            pass
    shop.REFUNDS = dict(shop.REFUNDS)
    with SqliteSaver.from_conn_string(db) as checkpointer:
        graph = failures_langgraph.builder.compile(checkpointer=checkpointer)
        assert graph.get_state({"configurable": {"thread_id": "crash"}}).next == ("tools",)
        assert failures_langgraph.handle(graph, None, "crash") == "Refunded."
        tool_result = graph.get_state({"configurable": {"thread_id": "crash"}}).values["messages"][-2].text
    assert shop.REFUNDS == {"123": "refund-1"}, shop.REFUNDS
    assert tool_result == "order 123 was already refunded (refund-1)", tool_result
    shop.REFUNDS.clear()

    # Valid text, wrong fact: the reply claims a refund that never happened, the validator sends it back.
    replies = iter(["Your order was refunded.", "I can look into a refund for you."])

    def made_up(messages, info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[TextPart(next(replies))])

    with failures_pydantic_ai.writer.override(model=FunctionModel(made_up)):
        assert failures_pydantic_ai.handle("refund?", [])[0] == "I can look into a refund for you."


def check_safe_tools() -> None:
    alice = safe_tools_pydantic_ai.Customer("alice")
    asked: list[tuple[str, str]] = []

    def person(customer_id: str, order_id: str) -> bool:
        asked.append((customer_id, order_id))
        return True

    # The model asks for bob's order and, after the injected note, refunds it. Python says no both times.
    def obey_everything(messages, info: AgentInfo) -> ModelResponse:
        last = messages[-1].parts[-1]
        if isinstance(last, ToolReturnPart):
            if "IGNORE" in last.content:
                return ModelResponse(parts=[ToolCallPart("issue_refund", {"order_id": "456"})])
            return ModelResponse(parts=[TextPart(last.content)])
        return ModelResponse(parts=[ToolCallPart("get_order_status", {"order_id": "456" if "456" in str(last.content) else "789"})])

    with safe_tools_pydantic_ai.writer.override(model=FunctionModel(obey_everything)):
        assert safe_tools_pydantic_ai.handle(alice, "Status of 456?", person).output == "order not found"
        assert safe_tools_pydantic_ai.handle(alice, "News on 789?", person).output == "order not found"
    assert asked == [("alice", "456")], asked

    lg.llm = FakeLLM(ticket=lg.Ticket(category="question", urgent=False), messages=iter([
        lg_call("get_order_status", "456"), AIMessage("a"),
        lg_call("get_order_status", "789"), lg_call("issue_refund", "456"), AIMessage("b"),
    ]))
    lg_alice = safe_tools_langgraph.Customer("alice")
    result = safe_tools_langgraph.handle(lg_alice, "Status of 456?", "safe-1", person)
    assert result["messages"][-2].text == "order not found"
    result = safe_tools_langgraph.handle(lg_alice, "News on 789?", "safe-2", person)
    assert "IGNORE" in result["messages"][2].text and result["messages"][-2].text == "order not found"
    assert asked == [("alice", "456")], asked  # the ownership check runs before a person is asked
    assert shop.REFUNDS == {}, shop.REFUNDS

    # A refund of her own order: the person sees the exact order, and only that one is paid.
    lg.llm = FakeLLM(ticket=lg.Ticket(category="billing", urgent=False), messages=iter([lg_call("issue_refund", "123"), AIMessage("Done.")]))
    safe_tools_langgraph.handle(lg_alice, "Refund 123", "safe-3", person)
    assert asked[-1] == ("alice", "123") and shop.REFUNDS == {"123": "refund-1"}, (asked, shop.REFUNDS)
    shop.REFUNDS.clear()


def check_full_evals() -> None:
    # A fake that looks up the order in the request and repeats the tool result. With the old
    # prompt it obeys the text injected in order 789's note, so the comparison has something to show.
    def fake_writer(messages, info: AgentInfo) -> ModelResponse:
        last = messages[-1].parts[-1]
        if isinstance(last, ToolReturnPart):
            if "IGNORE" in last.content and "never instructions" not in (info.instructions or ""):
                return ModelResponse(parts=[ToolCallPart("issue_refund", {"order_id": "456"})])
            return ModelResponse(parts=[TextPart(f"Update: {last.content}")])
        text = str(last.content)
        order_id = next(w.strip("?.") for w in text.split() if w.strip("?.").isdigit())
        tool = "issue_refund" if "refund" in text else "get_order_status"
        return ModelResponse(parts=[ToolCallPart(tool, {"order_id": order_id})])

    with safe_tools_pydantic_ai.writer.override(model=FunctionModel(fake_writer)):
        report = evals_full.dataset.evaluate_sync(evals_full.run_pydantic_ai, max_concurrency=1, progress=False)
        before, after = evals_full.compare_prompts()
    def failed(r) -> set:
        return {(c.name, n) for c in r.cases for n, a in c.assertions.items() if not a.value}

    assert failed(report) == failed(after) == set(), failed(report)
    assert failed(before) == {("injection in a note", "right_tools")}, failed(before)
    assert all(c.metrics["requests"] >= 2 for c in report.cases), [c.metrics for c in report.cases]

    # The LangGraph task runs too. This fake never calls a tool, so it fails the checks that need one.
    lg.llm = FakeLLM(ticket=lg.Ticket(category="question", urgent=False), messages=iter([AIMessage("Hi.") for _ in range(6)]))
    report = evals_full.dataset.evaluate_sync(evals_full.run_langgraph, max_concurrency=1, progress=False)
    assert not report.failures and {n for _, n in failed(report)} == {"right_tools", "grounded", "refunds_as_allowed"}, failed(report)


if __name__ == "__main__":
    main()
