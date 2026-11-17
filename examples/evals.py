r"""Evals: how often does the classifier get it right? One dataset, both libraries.

pydantic_evals runs a task (any function) on every case and scores the output.
The task can call a LangGraph node or a Pydantic AI agent: the dataset does not care.
"""

from langchain_core.messages import HumanMessage
from pydantic_evals import Case, Dataset
from pydantic_evals.evaluators import EvaluatorContext

import langgraph_pipeline as lg
import pydantic_ai_pipeline as pa

dataset = Dataset(
    name="ticket classification",
    cases=[
        Case(name="order status", inputs="Where is my order 123?", expected_output={"category": "question", "urgent": False}),
        Case(name="outage", inputs="Production is down, nobody can log in!", expected_output={"category": "bug", "urgent": True}),
        Case(name="double charge", inputs="You charged my card twice this month.", expected_output={"category": "billing", "urgent": False}),
        Case(name="export", inputs="How do I export my data to CSV?", expected_output={"category": "question", "urgent": False}),
        Case(name="crash", inputs="The app crashes when I open settings.", expected_output={"category": "bug", "urgent": False}),
        Case(name="data loss", inputs="All our customer data is gone after the update!", expected_output={"category": "bug", "urgent": True}),
    ],
)


def same_category(ctx: EvaluatorContext) -> bool:
    return ctx.output["category"] == ctx.expected_output["category"]


def same_urgency(ctx: EvaluatorContext) -> bool:
    return ctx.output["urgent"] == ctx.expected_output["urgent"]


dataset.add_evaluator(same_category)
dataset.add_evaluator(same_urgency)


def classify_with_langgraph(text: str) -> dict:
    return lg.classify({"messages": [HumanMessage(text)]})["ticket"].model_dump()


def classify_with_pydantic_ai(text: str) -> dict:
    return pa.classifier.run_sync(text).output.model_dump()


if __name__ == "__main__":
    for task in [classify_with_langgraph, classify_with_pydantic_ai]:
        dataset.evaluate_sync(task, progress=False).print(include_input=True)
