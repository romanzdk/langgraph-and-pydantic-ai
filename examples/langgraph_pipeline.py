r"""LangGraph: a support ticket goes through a small graph.

    START -> classify -> (urgent?) -> escalate -> END
                              \-> draft_reply <-> tools
                                       \-> END

Every node gets the shared state and returns only the keys it changes.
The tool loop is part of the graph: draft_reply -> tools -> draft_reply until no more tool calls.

Memory: the checkpointer saves the state after every step under a `thread_id`.
The next `invoke` with the same `thread_id` continues from it, so `messages`
holds the whole conversation, not just one question.
"""

from typing import Annotated, Literal, TypedDict

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from pydantic import BaseModel

llm = init_chat_model("openrouter:anthropic/claude-haiku-5.5")

ORDERS = {"123": "shipped, arrives on Friday", "456": "waiting for payment"}


def get_order_status(order_id: str) -> str:
    """Return the status of an order by its id."""
    return ORDERS.get(order_id, "order not found")


class Ticket(BaseModel):
    category: Literal["bug", "billing", "question"]
    urgent: bool


class State(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]  # whole conversation, appended
    ticket: Ticket  # classification of the latest question, overwritten


def classify(state: State) -> State:
    question = state["messages"][-1].text
    ticket = llm.with_structured_output(Ticket, method="json_schema").invoke(
        f"Classify this support ticket:\n\n{question}"
    )
    return {"ticket": ticket}


def route(state: State) -> Literal["escalate", "draft_reply"]:
    return "escalate" if state["ticket"].urgent else "draft_reply"


def escalate(state: State) -> State:
    return {"messages": [AIMessage(f"Sent to on-call engineer ({state['ticket'].category}).")]}


def draft_reply(state: State) -> State:
    prompt = [
        SystemMessage("Write a short, friendly reply to the support ticket. Use tools to look up facts."),
        *state["messages"],
    ]
    return {"messages": [llm.bind_tools([get_order_status]).invoke(prompt)]}


builder = StateGraph(State)
builder.add_node(classify)
builder.add_node(escalate)
builder.add_node(draft_reply)
builder.add_node("tools", ToolNode([get_order_status]))
builder.add_edge(START, "classify")
builder.add_conditional_edges("classify", route)
builder.add_edge("escalate", END)
builder.add_conditional_edges("draft_reply", tools_condition)  # tool call? -> "tools", else END
builder.add_edge("tools", "draft_reply")
# The checkpointer only restores types it knows; our own models must be allowed explicitly.
checkpointer = InMemorySaver(serde=JsonPlusSerializer(allowed_msgpack_modules=[Ticket]))
graph = builder.compile(checkpointer=checkpointer)


if __name__ == "__main__":
    print(graph.get_graph().draw_mermaid())
    config = {"configurable": {"thread_id": "customer-1"}}
    for text in ["Where is my order 123?", "And what about 456?", "Production is down, nobody can log in!"]:
        result = graph.invoke({"messages": [HumanMessage(text)]}, config)
        print(f"\n> {text}\n{result['ticket']}\n{result['messages'][-1].text}")
    print(f"\nMessages saved in thread 'customer-1': {len(result['messages'])}")
