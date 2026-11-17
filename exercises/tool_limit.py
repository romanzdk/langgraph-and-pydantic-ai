"""Exercise (lesson 12): stop a tool loop that never ends.

The model may call get_order_status again and again. Change both `handle_*` functions so
that a run stops after a few tool rounds and returns GIVE_UP instead of raising an error.

Check your solution: uv run exercises/check.py tool_limit
"""

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from pydantic_ai import Agent

MODEL = "openrouter:anthropic/claude-haiku-5.5"
GIVE_UP = "Sorry, this needs a person. We will get back to you soon."
llm = init_chat_model(MODEL)


def get_order_status(order_id: str) -> str:
    """Return the status of an order by its id."""
    return "shipped"


def draft_reply(state: MessagesState) -> MessagesState:
    return {"messages": [llm.bind_tools([get_order_status]).invoke(state["messages"])]}


builder = StateGraph(MessagesState)
builder.add_node(draft_reply)
builder.add_node("tools", ToolNode([get_order_status]))
builder.add_edge(START, "draft_reply")
builder.add_conditional_edges("draft_reply", tools_condition)
builder.add_edge("tools", "draft_reply")
graph = builder.compile()

agent = Agent(MODEL, tools=[get_order_status])


def handle_langgraph(text: str) -> str:
    result = graph.invoke({"messages": [HumanMessage(text)]})
    return result["messages"][-1].text


def handle_pydantic_ai(text: str) -> str:
    return agent.run_sync(text).output
