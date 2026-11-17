r"""Streaming with LangGraph: see each step as it finishes, and the reply token by token.

stream_mode="updates" gives one item per finished node (what the node returned).
stream_mode="messages" gives LLM tokens as they arrive, tagged with the node that asked for them.
"""

from langchain_core.messages import HumanMessage

import langgraph_pipeline as lg


def stream(text: str, thread_id: str) -> None:
    config = {"configurable": {"thread_id": thread_id}}
    for mode, data in lg.graph.stream({"messages": [HumanMessage(text)]}, config, stream_mode=["updates", "messages"]):
        if mode == "updates":
            print(f"\n[{', '.join(data)} finished]")
        else:
            token, metadata = data
            if metadata["langgraph_node"] == "draft_reply":
                print(token.text, end="", flush=True)


if __name__ == "__main__":
    stream("Where is my order 123?", "customer-1")
