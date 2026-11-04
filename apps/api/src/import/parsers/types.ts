/**
 * Tabular result every import parser normalizes to (P3-IMPORT-01). A `Table`
 * is column-oriented: the first non-empty row is the header, the rest are
 * records. Downstream mapping + preview work on `Table` only — they never see
 * a CSV/XLSX detail.
 */
export interface Table {
  /** Header column names, in file order (trimmed). */
  columns: string[];
  /** Data records, each a map of column name → string value. */
  rows: Record<string, string>[];
  /** Which parser produced this (`csv` | `xlsx`). */
  format: "csv" | "xlsx";
}

/** A file the import surface cannot parse — mapped to a clean 415/422. */
export class UnsupportedFormatError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "UnsupportedFormatError";
  }
}

/**
 * Header cells become the object keys of every downstream `Table` row. A
 * column literally named `__proto__` / `constructor` / `prototype` would
 * pollute or shadow the row's prototype chain (CSV/XLSX are untrusted input);
 * empty cells are renamed too, so the mapping step always has a stable key.
 * Both parsers funnel through this one rule.
 */
const RESERVED_HEADER_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function sanitizeHeaderCell(cell: string, index: number): string {
  const name = cell.trim();
  if (name === "" || RESERVED_HEADER_KEYS.has(name)) {
    return `Column ${index + 1}`;
  }
  return name;
}

/** The file parsed but was empty / had no usable rows — a 422. */
export class EmptyTableError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "EmptyTableError";
  }
}
