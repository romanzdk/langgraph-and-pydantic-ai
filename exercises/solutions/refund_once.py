"""Exercise (lesson 12): a refund that is safe to run twice. Solution."""

PAID: list[str] = []  # every payout, as the bank sees it
REFUNDED: set[str] = set()  # in a real app: a table with the order id as its unique key


def send_money(order_id: str) -> None:
    PAID.append(order_id)


def issue_refund(order_id: str) -> str:
    """Refund an order."""
    if order_id in REFUNDED:
        return f"order {order_id} was already refunded"
    REFUNDED.add(order_id)
    send_money(order_id)
    return f"refund sent for order {order_id}"
