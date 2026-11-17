r"""Streaming with Pydantic AI: the reply token by token.

`run_stream_sync` starts the run; `stream_text(delta=True)` yields new text as it arrives.
Tool calls still happen first, inside the run, before the text starts.
"""

import pydantic_ai_pipeline as pa


def stream(text: str) -> str:
    with pa.writer.run_stream_sync(text) as result:
        for delta in result.stream_text(delta=True):
            print(delta, end="", flush=True)
        return result.get_output()


if __name__ == "__main__":
    stream("Where is my order 123?")
