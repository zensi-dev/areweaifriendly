/**
 * Line diff of two snapshot texts as compact hunks ("-" removed, "+" added, " " context),
 * for showing the classifier and reviewers what changed since the last review.
 */
export function lineDiff(before: string, after: string, { context = 2, maxChars = 12_000 } = {}): string {
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops = middleOps(a.slice(start, endA), b.slice(start, endB));
  // Whole-text ops: unchanged prefix, the middle, unchanged suffix.
  const all: Op[] = [
    ...a.slice(0, start).map((line): Op => [' ', line]),
    ...ops,
    ...a.slice(endA).map((line): Op => [' ', line]),
  ];
  if (!ops.length) return '';
  const show = new Array<boolean>(all.length).fill(false);
  all.forEach(([kind], i) => {
    if (kind === ' ') return;
    for (let j = Math.max(0, i - context); j <= Math.min(all.length - 1, i + context); j++) show[j] = true;
  });
  const out: string[] = [];
  let size = 0;
  for (let i = 0; i < all.length; i++) {
    if (!show[i]) {
      if (out.at(-1) !== '…') out.push('…');
      continue;
    }
    const line = `${all[i]![0]} ${all[i]![1]}`;
    size += line.length + 1;
    if (size > maxChars) {
      out.push('… (diff cut off; read the full source)');
      break;
    }
    out.push(line);
  }
  return out.join('\n');
}

type Op = [' ' | '-' | '+', string];

/** Longest-common-subsequence diff; very large changed regions are shown as removed then added. */
function middleOps(a: string[], b: string[]): Op[] {
  if (!a.length || !b.length || a.length * b.length > 4_000_000) {
    return [...a.map((l): Op => ['-', l]), ...b.map((l): Op => ['+', l])];
  }
  const w = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1]! + 1 : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push([' ', a[i]!]);
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) ops.push(['-', a[i++]!]);
    else ops.push(['+', b[j++]!]);
  }
  while (i < a.length) ops.push(['-', a[i++]!]);
  while (j < b.length) ops.push(['+', b[j++]!]);
  return ops;
}
