r"""When things fail, in Pydantic AI: fix bad output, stop a runaway tool loop, run again after a crash.

Output that fails validation goes back to the model with the error (`retries`).
`UsageLimits` stops a tool loop that does not end. There is no checkpointer: after a
crash you run the turn again from the history you saved, so every tool call of that
turn happens again, and tools with side effects must be safe to call twice.
"""

from pydantic_ai import Agent, ModelRetry, RunContext, UsageLimits
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import ModelMessage, ToolReturnPart

import pydantic_ai_pipeline as pa
import shop

GIVE_UP = "Sorry, this needs a person. We will get back to you soon."

writer = Agent(
    pa.MODEL,
    tools=[shop.get_order_status, shop.issue_refund],
    retries=2,
    instructions="Reply to the support ticket. You can look up and refund orders.",
)


@writer.output_validator
def no_made_up_refund(ctx: RunContext, reply: str) -> str:
    called = {p.tool_name for m in ctx.messages for p in m.parts if isinstance(p, ToolReturnPart)}
    if "refunded" in reply.lower() and "issue_refund" not in called:
        raise ModelRetry("You wrote that the order was refunded, but you did not call issue_refund.")
    return reply


def handle(text: str, history: list[ModelMessage]) -> tuple[str, list[ModelMessage]]:
    try:
        result = writer.run_sync(text, message_history=history, usage_limits=UsageLimits(tool_calls_limit=4))
    except UsageLimitExceeded:
        return GIVE_UP, history
    return result.output, result.all_messages()


if __name__ == "__main__":
    answer, history = handle("Order 123 arrived broken. Please refund it.", [])
    print(answer)
