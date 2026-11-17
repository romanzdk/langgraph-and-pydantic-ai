"""Exercise (lesson 12): a refund that is safe to run twice.

After a crash, LangGraph runs the unfinished step again, and in Pydantic AI you run the
whole turn again. Either way issue_refund can be called a second time for the same order.
Change it so each order is paid out at most once. A second call should still return a
useful text for the model.

Check your solution: uv run exercises/check.py refund_once
"""

PAID: list[str] = []  # every payout, as the bank sees it


def send_money(order_id: str) -> None:
    PAID.append(order_id)


def issue_refund(order_id: str) -> str:
    """Refund an order."""
    send_money(order_id)
    return f"refund sent for order {order_id}"
