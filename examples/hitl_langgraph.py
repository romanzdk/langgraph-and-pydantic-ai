r"""Human in the loop with LangGraph: a refund waits for a person's OK.

    START -> draft_reply <-> tools -> (issue_refund pauses here) -> ... -> END

`interrupt()` stops the graph and saves the state with the checkpointer.
`graph.invoke(Command(resume=...))` continues from the same place with the person's answer.
"""

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import Command, interrupt

import langgraph_pipeline as lg


def issue_refund(order_id: str) -> str:
    """Refund an order."""
    approved = interrupt(f"Refund order {order_id}?")
    return f"refund for order {order_id} sent" if approved else "a person rejected the refund"


TOOLS = [issue_refund]


def draft_reply(state: lg.State) -> lg.State:
    prompt = [
        SystemMessage("Reply to the support ticket. You can refund orders."),
        *state["messages"],
    ]
    return {"messages": [lg.llm.bind_tools(TOOLS).invoke(prompt)]}


builder = StateGraph(lg.State)
builder.add_node(draft_reply)
builder.add_node("tools", ToolNode(TOOLS))
builder.add_edge(START, "draft_reply")
builder.add_conditional_edges("draft_reply", tools_condition)
builder.add_edge("tools", "draft_reply")
graph = builder.compile(checkpointer=InMemorySaver())  # resuming after interrupt() needs one


def handle(text: str, thread_id: str, ask_person) -> str:
    config = {"configurable": {"thread_id": thread_id}}
    result = graph.invoke({"messages": [HumanMessage(text)]}, config)
    while "__interrupt__" in result:
        question = result["__interrupt__"][0].value
        result = graph.invoke(Command(resume=ask_person(question)), config)
    return result["messages"][-1].text


if __name__ == "__main__":
    answer = handle("Order 123 arrived broken. Please refund it.", "customer-1", lambda q: input(f"{q} [y/N] ") == "y")
    print(answer)
