"""Run all pipelines with fake models, so no API key is needed: `uv run examples/check_offline.py`.

Checks both branches (urgent / not urgent), that the tool result reaches the reply,
and that a second question in the same conversation still sees the first one.
"""

import os

os.environ.setdefault("OPENROUTER_API_KEY", "fake")

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, ToolCallPart, ToolReturnPart, UserPromptPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

import combined_pipeline as cb
import langgraph_pipeline as lg
import pydantic_ai_pipeline as pa

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

    print("ok: all three pipelines take both branches, use the tool and remember the conversation")


if __name__ == "__main__":
    main()
