/**
 * Renders rows of a CSV / XLSX file as a picture of a grid, so a table file
 * can be compared side by side with what was read, like a PDF page image.
 */
const FONT = '"Noto Sans CJK JP", "WenQuanYi Zen Hei", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';
const PAD = 8;
const ROW_H = 36;
const MAX_COL_W = 180;
const SCALE = 2;

export async function renderTableImage(
  _title: string,
  columns: string[],
  rows: Record<string, string>[],
): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const probe = createCanvas(10, 10).getContext("2d");
  const widths = columns.map((c) => {
    probe.font = `bold 14px ${FONT}`;
    let w = probe.measureText(c).width;
    probe.font = `14px ${FONT}`;
    for (const r of rows) w = Math.max(w, probe.measureText(r[c] ?? "").width);
    return Math.min(MAX_COL_W, Math.ceil(w) + PAD * 2);
  });
  // Fill the panel it is shown in: spread spare width over the columns.
  const MIN_W = 330;
  const used = widths.reduce((a, b) => a + b, 0);
  if (used < MIN_W) {
    const k = MIN_W / used;
    widths.forEach((w, i) => (widths[i] = Math.round(w * k)));
  }
  const width = widths.reduce((a, b) => a + b, 0);
  const height = ROW_H * (rows.length + 1);
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";

  const fit = (text: string, max: number) => {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
  };

  let y = 0; // the header is the first row, like the table next to it
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(0, y, width, ROW_H);
  let x = 0;
  ctx.fillStyle = "#111";
  columns.forEach((c, i) => {
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(fit(c, widths[i] - PAD * 2), x + PAD, y + ROW_H / 2);
    x += widths[i];
  });
  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 0.7;
  rows.forEach((r, ri) => {
    y += ROW_H;
    if (ri % 2 === 1) {
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, y, width, ROW_H);
    }
    ctx.fillStyle = "#111";
    ctx.font = `14px ${FONT}`;
    let cx = 0;
    columns.forEach((c, i) => {
      ctx.fillText(fit(r[c] ?? "", widths[i] - PAD * 2), cx + PAD, y + ROW_H / 2);
      cx += widths[i];
    });
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  });
  // column separators
  let sx = 0;
  for (const w of widths) {
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, y + ROW_H);
    ctx.stroke();
    sx += w;
  }
  return canvas.toBuffer("image/png");
}
