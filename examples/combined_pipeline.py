r"""LangGraph + Pydantic AI together: a common split of work.

    START -> classify -> (urgent?) -> escalate -> END
                              \-> draft_reply (may call get_order_status) -> END

- LangGraph runs the flow: nodes, edges, shared state.
- Pydantic AI does the LLM calls inside the nodes: typed output, no LangChain model wrapper.
  Tool calls stay inside the agent, so the graph does not need a tool loop.

Memory: the LangGraph checkpointer saves the state under a `thread_id`. The agent's
message history lives in that state as JSON, so it is saved and restored with it.
"""

from typing import Literal, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessagesTypeAdapter

MODEL = "openrouter:anthropic/claude-haiku-5.5"

ORDERS = {"123": "shipped, arrives on Friday", "456": "waiting for payment"}


def get_order_status(order_id: str) -> str:
    """Return the status of an order by its id."""
    return ORDERS.get(order_id, "order not found")


class Ticket(BaseModel):
    category: Literal["bug", "billing", "question"]
    urgent: bool


classifier = Agent(MODEL, output_type=Ticket, instructions="Classify the support ticket.")
writer = Agent(
    MODEL,
    tools=[get_order_status],
    instructions="Write a short, friendly reply to the support ticket. Use tools to look up facts.",
)


class State(TypedDict, total=False):
    text: str
    ticket: Ticket
    answer: str
    history: bytes  # the writer's messages as JSON, so the checkpointer can save them


def classify(state: State) -> State:
    return {"ticket": classifier.run_sync(state["text"]).output}


def route(state: State) -> Literal["escalate", "draft_reply"]:
    return "escalate" if state["ticket"].urgent else "draft_reply"


def escalate(state: State) -> State:
    return {"answer": f"Sent to on-call engineer ({state['ticket'].category})."}


def draft_reply(state: State) -> State:
    history = ModelMessagesTypeAdapter.validate_json(state.get("history", b"[]"))
    result = writer.run_sync(state["text"], message_history=history)
    return {"answer": result.output, "history": result.all_messages_json()}


builder = StateGraph(State)
builder.add_node(classify)
builder.add_node(escalate)
builder.add_node(draft_reply)
builder.add_edge(START, "classify")
builder.add_conditional_edges("classify", route)
builder.add_edge("escalate", END)
builder.add_edge("draft_reply", END)
# The checkpointer only restores types it knows; our own models must be allowed explicitly.
checkpointer = InMemorySaver(serde=JsonPlusSerializer(allowed_msgpack_modules=[Ticket]))
graph = builder.compile(checkpointer=checkpointer)


if __name__ == "__main__":
    config = {"configurable": {"thread_id": "customer-1"}}
    for text in ["Where is my order 123?", "And what about 456?", "Production is down, nobody can log in!"]:
        result = graph.invoke({"text": text}, config)
        print(f"\n> {text}\n{result['ticket']}\n{result['answer']}")
