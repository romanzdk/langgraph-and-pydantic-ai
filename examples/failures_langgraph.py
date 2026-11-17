r"""When things fail, in LangGraph: retry a step, stop a runaway tool loop, continue after a crash.

    START -> draft_reply <-> tools
                  \-> END

The checkpointer is SQLite, so a run outlives the process. If the process dies in the
middle, `invoke(None, config)` continues from the last step that finished. The step that
was running when it died runs again, so its tools must be safe to call twice.
"""

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.errors import GraphRecursionError
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.types import RetryPolicy

import langgraph_pipeline as lg
import shop

TOOLS = [shop.get_order_status, shop.issue_refund]
GIVE_UP = "Sorry, this needs a person. We will get back to you soon."


def draft_reply(state: MessagesState) -> MessagesState:
    prompt = [SystemMessage("Reply to the support ticket. You can look up and refund orders."), *state["messages"]]
    return {"messages": [lg.llm.bind_tools(TOOLS).invoke(prompt)]}


builder = StateGraph(MessagesState)
builder.add_node(draft_reply, retry_policy=RetryPolicy(max_attempts=3))
builder.add_node("tools", ToolNode(TOOLS))
builder.add_edge(START, "draft_reply")
builder.add_conditional_edges("draft_reply", tools_condition)
builder.add_edge("tools", "draft_reply")


def handle(graph, text: str | None, thread_id: str) -> str:
    """text=None continues the unfinished run of this thread instead of starting a new one."""
    config = {"configurable": {"thread_id": thread_id}, "recursion_limit": 10}
    try:
        result = graph.invoke({"messages": [HumanMessage(text)]} if text else None, config)
    except GraphRecursionError:
        return GIVE_UP
    return result["messages"][-1].text


if __name__ == "__main__":
    with SqliteSaver.from_conn_string("support.db") as checkpointer:
        graph = builder.compile(checkpointer=checkpointer)
        config = {"configurable": {"thread_id": "customer-1"}}
        if graph.get_state(config).next:
            print("The last run did not finish. Continuing it.")
            print(handle(graph, None, "customer-1"))
        else:
            print(handle(graph, "Order 123 arrived broken. Please refund it.", "customer-1"))
