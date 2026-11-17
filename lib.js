window.LESSONS = [];

// Lesson files write code indented to match the surrounding JS; this strips that indent.
function code(strings, ...values) {
  const text = String.raw(strings, ...values).replace(/\\`/g, '`').replace(/^\n/, '').replace(/\s+$/, '');
  const lines = text.split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}
