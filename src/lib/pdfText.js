/**
 * Rebuild visual lines from pdf.js text items: group fragments that share a baseline
 * (within 3pt), order lines top to bottom and fragments left to right.
 */
export function textItemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [x, y] = [it.transform[4], it.transform[5]];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x, s: it.str });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((q) => q.s)
        .join(" ")
    );
}
