import { parse } from "csv-parse/sync";
import type { Table } from "./types.js";
import { EmptyTableError, sanitizeHeaderCell } from "./types.js";

/**
 * CSV parser (P3-IMPORT-01).
 *
 * Handles the common real-world warts: UTF-8 BOM, quoted fields containing
 * commas/newlines, and ragged rows (a short row leaves the trailing cells as
 * `""` rather than crashing the parse — the preview will surface them as
 * per-row errors, P3-IMPORT-02).
 *
 * Column 0 of the first non-empty row is the header; empty header cells are
 * renamed to `Column N` so the mapping step has a stable key for every column.
 */
export function parseCsv(input: Uint8Array): Table {
  // No `columns` option → records are plain `string[]` arrays, so no
  // `__proto__`/`constructor` key can leak through the parse itself. The
  // object-key danger lives downstream, where the header row becomes the
  // keys of each `Table` row — `sanitizeHeaderCell` handles it.
  const records = parse(input, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as unknown as string[][];

  if (records.length === 0) {
    throw new EmptyTableError("CSV file contains no data");
  }

  const header = records[0].map((cell, i) =>
    sanitizeHeaderCell(cell, i),
  );
  const rows = records.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      row[header[i]] = cells[i] ?? "";
    }
    return row;
  });

  return { columns: header, rows, format: "csv" };
}
