r"""Human in the loop with Pydantic AI: a refund waits for a person's OK.

A tool with `requires_approval=True` is not run. The run ends early with a
`DeferredToolRequests` output listing the calls to approve. You ask a person, then
start a new run with the history and the decisions (`DeferredToolResults`).
"""

from pydantic_ai import Agent, DeferredToolRequests, DeferredToolResults, Tool

import pydantic_ai_pipeline as pa


def issue_refund(order_id: str) -> str:
    """Refund an order."""
    return f"refund for order {order_id} sent"


writer = Agent(
    pa.MODEL,
    tools=[Tool(issue_refund, requires_approval=True)],
    output_type=[str, DeferredToolRequests],
    instructions="Reply to the support ticket. You can refund orders.",
)


def handle(text: str, ask_person) -> str:
    result = writer.run_sync(text)
    while isinstance(result.output, DeferredToolRequests):
        approvals = {
            call.tool_call_id: ask_person(f"Refund order {call.args_as_dict()['order_id']}?")
            for call in result.output.approvals
        }
        result = writer.run_sync(
            message_history=result.all_messages(),
            deferred_tool_results=DeferredToolResults(approvals=approvals),
        )
    return result.output


if __name__ == "__main__":
    answer = handle("Order 123 arrived broken. Please refund it.", lambda q: input(f"{q} [y/N] ") == "y")
    print(answer)
