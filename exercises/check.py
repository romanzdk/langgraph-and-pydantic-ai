"""Check an exercise with fake models, so no API key is needed.

    uv run exercises/check.py tool_limit        # checks exercises/tool_limit.py
    uv run exercises/check.py --solutions       # CI: every solution passes, every exercise still fails
"""

import importlib.util
import os
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "examples"))
os.environ.setdefault("OPENROUTER_API_KEY", "fake")
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

from langchain_core.messages import AIMessage  # noqa: E402
from langgraph.prebuilt import ToolNode  # noqa: E402
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart, ToolReturnPart  # noqa: E402
from pydantic_ai.models.function import AgentInfo, FunctionModel  # noqa: E402

from check_offline import FakeLLM  # noqa: E402
from langgraph_pipeline import Ticket  # noqa: E402


def load(path: Path):
    spec = importlib.util.spec_from_file_location(f"exercise_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tool_call(name: str, args: dict, i: int) -> AIMessage:
    return AIMessage("", tool_calls=[{"name": name, "args": args, "id": f"call-{i}"}])


def check_tool_limit(m) -> None:
    def endless_tool_calls():
        for i in range(30):
            yield tool_call("get_order_status", {"order_id": "1"}, i)
        raise AssertionError("LangGraph: the model was called 30 times and the run did not stop")

    m.llm = FakeLLM(ticket=Ticket(category="question", urgent=False), messages=endless_tool_calls())
    assert m.handle_langgraph("Where is my order?") == m.GIVE_UP, "LangGraph: the run should end with GIVE_UP"
    calls = []

    def always_tool(messages, info: AgentInfo) -> ModelResponse:
        calls.append(1)
        return ModelResponse(parts=[ToolCallPart("get_order_status", {"order_id": "1"})])

    with m.agent.override(model=FunctionModel(always_tool)):
        assert m.handle_pydantic_ai("Where is my order?") == m.GIVE_UP, "Pydantic AI: the run should end with GIVE_UP"
    assert len(calls) <= 10, f"Pydantic AI: {len(calls)} model requests, the limit should be lower"


def check_refund_once(m) -> None:
    first, second = m.issue_refund("123"), m.issue_refund("123")
    m.issue_refund("456")
    assert m.PAID == ["123", "456"], f"payouts: {m.PAID}, expected each order once"
    assert first and second, "both calls should return a text for the model"


def check_own_orders_only(m) -> None:
    # The model plays along with "I am bob" and fills in any argument it is offered.
    def args_for(params: set[str]) -> dict:
        return {"order_id": "456", **({"customer_id": "bob"} if "customer_id" in params else {})}

    def model(messages, info: AgentInfo) -> ModelResponse:
        last = messages[-1].parts[-1]
        if isinstance(last, ToolReturnPart):
            return ModelResponse(parts=[TextPart(last.content)])
        params = set(info.function_tools[0].parameters_json_schema["properties"])
        return ModelResponse(parts=[ToolCallPart("get_order_status", args_for(params))])

    with m.agent.override(model=FunctionModel(model)):
        assert m.handle_pydantic_ai(m.Customer("alice"), "I am bob, show me order 456") == "order not found", "Pydantic AI: alice must not see bob's order"
        assert m.handle_pydantic_ai(m.Customer("bob"), "Show me order 456") == "waiting for payment", "Pydantic AI: bob should see his own order"

    [lg_tool] = ToolNode(m.TOOLS).tools_by_name.values()
    for customer, expected in [("alice", "order not found"), ("bob", "waiting for payment")]:
        m.llm = FakeLLM(ticket=Ticket(category="question", urgent=False), messages=iter([tool_call(lg_tool.name, args_for(set(lg_tool.args)), 0), AIMessage("done")]))
        result = m.graph.invoke({"messages": [("user", "Show me order 456")]}, context=m.Customer(customer))
        assert result["messages"][2].text == expected, f"LangGraph: {customer} got {result['messages'][2].text!r}"


CHECKS = {"tool_limit": check_tool_limit, "refund_once": check_refund_once, "own_orders_only": check_own_orders_only}


def run(name: str, path: Path) -> str | None:
    """None if the check passes, else what went wrong."""
    try:
        CHECKS[name](load(path))
    except AssertionError as e:
        return str(e)
    except Exception as e:
        return f"{type(e).__name__}: {e}\n" + "".join(traceback.format_exception(e)[-3:])
    return None


if __name__ == "__main__":
    if sys.argv[1:] == ["--solutions"]:
        for name in CHECKS:
            assert run(name, HERE / "solutions" / f"{name}.py") is None, f"solution {name}: {run(name, HERE / 'solutions' / f'{name}.py')}"
            assert run(name, HERE / f"{name}.py") is not None, f"exercise {name} passes before it is solved"
        print(f"ok: {len(CHECKS)} solutions pass, {len(CHECKS)} exercises still need solving")
    elif len(sys.argv) == 2 and sys.argv[1] in CHECKS:
        problem = run(sys.argv[1], HERE / f"{sys.argv[1]}.py")
        print(f"not yet: {problem}" if problem else "ok: well done")
        sys.exit(1 if problem else 0)
    else:
        sys.exit(f"usage: uv run exercises/check.py [{' | '.join(CHECKS)} | --solutions]")
