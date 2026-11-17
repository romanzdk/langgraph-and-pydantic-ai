r"""Pydantic AI: the same support-ticket pipeline, written as plain Python.

    classify -> (urgent?) -> escalate
                    \-> draft_reply (may call get_order_status)

Agents are the LLM steps. The "graph" is just normal `if` code.
The tool loop (model -> tool -> model) is handled inside `run_sync`.

Memory: nothing is saved for you. You keep the message history yourself
and pass it back with `message_history=`.
"""

from typing import Literal

from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage

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


def handle(text: str, history: list[ModelMessage]) -> tuple[Ticket, str, list[ModelMessage]]:
    ticket = classifier.run_sync(text).output
    if ticket.urgent:
        return ticket, f"Sent to on-call engineer ({ticket.category}).", history
    result = writer.run_sync(text, message_history=history)
    return ticket, result.output, result.all_messages()


if __name__ == "__main__":
    history: list[ModelMessage] = []
    for text in ["Where is my order 123?", "And what about 456?", "Production is down, nobody can log in!"]:
        ticket, answer, history = handle(text, history)
        print(f"\n> {text}\n{ticket}\n{answer}")
    print(f"\nMessages in history: {len(history)}")
