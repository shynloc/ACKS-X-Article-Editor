export interface TextTransform {
  text: string;
  from: number;
  to: number;
}
export type LineStyle =
  | { type: "heading"; level: number }
  | { type: "quote" | "bullet" | "ordered" | "task" };

export function inlineFormat(
  text: string,
  from: number,
  to: number,
  open: string,
  close = open,
  placeholder = "文字",
): TextTransform {
  const selected = text.slice(from, to);
  if (
    selected &&
    text.slice(from - open.length, from) === open &&
    text.slice(to, to + close.length) === close
  ) {
    return {
      text:
        text.slice(0, from - open.length) +
        selected +
        text.slice(to + close.length),
      from: from - open.length,
      to: to - open.length,
    };
  }
  if (
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= open.length + close.length
  ) {
    const inner = selected.slice(open.length, selected.length - close.length);
    return {
      text: text.slice(0, from) + inner + text.slice(to),
      from,
      to: from + inner.length,
    };
  }
  const value = selected || placeholder,
    insert = open + value + close;
  return {
    text: text.slice(0, from) + insert + text.slice(to),
    from: from + open.length,
    to: from + open.length + value.length,
  };
}

function lineBounds(text: string, from: number, to: number) {
  const start = text.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const found = text.indexOf("\n", to);
  return { start, end: found < 0 ? text.length : found };
}
function removePrefix(line: string) {
  const match =
    /^(\s*)(?:(#{1,6})\s+|>\s+|(?:[-+*])\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)(.*)$/.exec(
      line,
    );
  return match
    ? { indent: match[1], content: match[3] ?? match[2] ?? "" }
    : { indent: /^\s*/.exec(line)![0], content: line.trimStart() };
}
function matches(line: string, style: LineStyle) {
  if (style.type === "heading")
    return new RegExp(`^\\s{0,3}#{${style.level}}\\s+`).test(line);
  if (style.type === "quote") return /^\s*>\s+/.test(line);
  if (style.type === "bullet") return /^\s*[-+*]\s+(?!\[[ xX]\])/.test(line);
  if (style.type === "task") return /^\s*[-+*]\s+\[[ xX]\]\s+/.test(line);
  return /^\s*\d+[.)]\s+/.test(line);
}
export function lineFormat(
  text: string,
  from: number,
  to: number,
  style: LineStyle,
): TextTransform {
  const { start, end } = lineBounds(text, from, to),
    lines = text.slice(start, end).split("\n"),
    remove =
      lines.filter(Boolean).length > 0 &&
      lines.filter(Boolean).every((line) => matches(line, style));
  let number = 1;
  const output = lines
    .map((line) => {
      if (!line.trim()) return line;
      const { indent, content } = removePrefix(line);
      if (remove) return indent + content;
      if (style.type === "heading")
        return `${indent}${"#".repeat(style.level)} ${content}`;
      if (style.type === "quote") return `${indent}> ${content}`;
      if (style.type === "bullet") return `${indent}- ${content}`;
      if (style.type === "task") return `${indent}- [ ] ${content}`;
      return `${indent}${number++}. ${content}`;
    })
    .join("\n");
  return {
    text: text.slice(0, start) + output + text.slice(end),
    from: start,
    to: start + output.length,
  };
}
export function insertBlock(
  text: string,
  from: number,
  to: number,
  before: string,
  after: string,
  placeholder = "内容",
): TextTransform {
  const selected = text.slice(from, to) || placeholder,
    prefix = from && !text.slice(0, from).endsWith("\n\n") ? "\n\n" : "",
    suffix =
      to < text.length && !text.slice(to).startsWith("\n\n") ? "\n\n" : "";
  const insert = prefix + before + selected + after + suffix,
    start = from + prefix.length + before.length;
  return {
    text: text.slice(0, from) + insert + text.slice(to),
    from: start,
    to: start + selected.length,
  };
}
export function tableBlock(rows = 3, cols = 3) {
  rows = Math.min(20, Math.max(2, Math.floor(rows)));
  cols = Math.min(10, Math.max(2, Math.floor(cols)));
  const header = `| ${Array.from({ length: cols }, (_, i) => `标题 ${i + 1}`).join(" | ")} |`,
    rule = `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`,
    body = Array.from(
      { length: rows - 1 },
      () => `| ${Array.from({ length: cols }, () => "内容").join(" | ")} |`,
    );
  return [header, rule, ...body].join("\n");
}
export interface ListEnterPlan {
  from: number;
  to: number;
  insert: string;
  anchor: number;
}
/** Flat Markdown list continuation with actual sequential numbers and one-blank-line exit. */
export function listEnterPlan(
  doc: string,
  offset: number,
): ListEnterPlan | null {
  const { start, end } = lineBounds(doc, offset, offset),
    line = doc.slice(start, end),
    local = offset - start;
  const ordered = /^(\s*)(\d+)([.)])(\s+)(.*)$/.exec(line),
    task = /^(\s*)([-+*])(\s+)\[([ xX])\](\s+)(.*)$/.exec(line),
    bullet = /^(\s*)([-+*])(\s+)(.*)$/.exec(line);
  const content = ordered?.[5] ?? task?.[6] ?? bullet?.[4];
  if (content === undefined || local < line.length - content.length)
    return null;
  if (!content.trim()) {
    const result = doc.slice(0, start) + doc.slice(end);
    return { from: 0, to: doc.length, insert: result, anchor: start };
  }
  if (!ordered) {
    const prefix = task
      ? `${task[1]}${task[2]}${task[3]}[ ]${task[5]}`
      : `${bullet![1]}${bullet![2]}${bullet![3]}`;
    const insertion = `\n${prefix}`;
    return {
      from: 0,
      to: doc.length,
      insert: doc.slice(0, offset) + insertion + doc.slice(offset),
      anchor: offset + insertion.length,
    };
  }
  const indent = ordered[1],
    punct = ordered[3],
    escapedIndent = indent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    orderedLine = new RegExp(`^${escapedIndent}(\\d+)\\${punct}\\s+`),
    previous: { start: number; number: string }[] = [];
  let scanEnd = start - 1;
  while (scanEnd >= 0) {
    const previousStart = doc.lastIndexOf("\n", Math.max(0, scanEnd - 1)) + 1,
      previousLine = doc.slice(previousStart, scanEnd),
      match = orderedLine.exec(previousLine);
    if (!match) break;
    previous.unshift({ start: previousStart, number: match[1] });
    if (previousStart === 0) break;
    scanEnd = previousStart - 1;
  }
  const listStart = previous.length
      ? Number(previous[0].number)
      : Number(ordered[2]),
    currentNumber = listStart + previous.length,
    changes: { from: number; to: number; insert: string }[] = [];
  previous.forEach((item, index) => {
    const expected = String(listStart + index);
    if (item.number !== expected)
      changes.push({
        from: item.start + indent.length,
        to: item.start + indent.length + item.number.length,
        insert: expected,
      });
  });
  if (Number(ordered[2]) !== currentNumber)
    changes.push({
      from: start + indent.length,
      to: start + indent.length + ordered[2].length,
      insert: String(currentNumber),
    });
  const nextPrefix = `${indent}${currentNumber + 1}${punct}${ordered[4]}`;
  changes.push({ from: offset, to: offset, insert: `\n${nextPrefix}` });
  let expected = currentNumber + 2,
    position = end + 1;
  while (position <= doc.length) {
    const nextEnd = doc.indexOf("\n", position),
      finish = nextEnd < 0 ? doc.length : nextEnd,
      next = doc.slice(position, finish),
      m = orderedLine.exec(next);
    if (m) {
      changes.push({
        from: position + indent.length,
        to: position + indent.length + m[1].length,
        insert: String(expected++),
      });
    } else {
      const nextIndent = /^\s*/.exec(next)![0];
      if (!next.trim() || nextIndent.length <= indent.length) break;
    }
    position = finish + 1;
    if (nextEnd < 0) break;
  }
  const sorted = [...changes].sort((a, b) => b.from - a.from);
  let result = doc;
  for (const c of sorted)
    result = result.slice(0, c.from) + c.insert + result.slice(c.to);
  const beforeDelta = changes
    .filter((c) => c.from < offset)
    .reduce((n, c) => n + c.insert.length - (c.to - c.from), 0);
  const insertion = changes.find((c) => c.from === offset && c.to === offset)!;
  return {
    from: 0,
    to: doc.length,
    insert: result,
    anchor: offset + beforeDelta + insertion.insert.length,
  };
}
