import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { Table } from "./types.js";
import {
  EmptyTableError,
  UnsupportedFormatError,
  sanitizeHeaderCell,
} from "./types.js";

/**
 * Minimal XLSX reader (P3-IMPORT-01).
 *
 * An `.xlsx` is a ZIP of Office-Open-XML. Only the parts a tabular import
 * needs are read: the target worksheet, the shared-strings pool, and the
 * relationships that map a sheet name to its part. No styles, formulas,
 * charts or the other ~40 parts are touched — the dependency surface stays
 * small (zip: `fflate`, XML: `fast-xml-parser`).
 *
 * Cells are read as the raw value strings the writer stored (numbers stay
 * `"3.14"`, booleans `"true"`/`"false"`), which is what the preview / mapping
 * step wants to display.
 */

// Tags that repeat under a parent → parse as arrays (fast-xml-parser treats a
// tag as a single node unless its `isArray` callback says otherwise). `is`
// (inline-string container) is intentionally NOT arrayized: a cell holds at
// most one `is`, and `text()` expects it as a plain object.
const ARRAY_TAGS = new Set([
  "si",
  "r",
  "row",
  "c",
  "sheet",
  "Relationship",
  "v",
]);

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tagName: string) => ARRAY_TAGS.has(tagName),
});

function parseXml(input: Uint8Array): unknown {
  return xml.parse(strFromU8(input), true);
}

/** Wrap a node (possibly already an array / undefined) in a stable array. */
function toArray<T>(node: unknown): T[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? (node as T[]) : [node as T];
}

/** Concatenate an element's text `t` children (rich-text runs aware). */
function text(node: unknown): string {
  const obj = (node ?? {}) as { r?: unknown; t?: unknown };
  const runs = toArray<{ t?: unknown }>(obj.r);
  if (runs.length > 0) return runs.map((run) => text(run)).filter(Boolean).join("");
  const t = obj.t;
  // `<t xml:space="preserve">…</t>` parses to an object carrying the text under "#text".
  const str = (x: unknown): string =>
    typeof x === "string" ? x : typeof x === "number" ? String(x) : typeof (x as { "#text"?: unknown } | null)?.["#text"] !== "undefined" ? String((x as { "#text": unknown })["#text"]) : "";
  return Array.isArray(t) ? str(t[0]) : str(t);
}

/** `"B12"` → `{ col: 2, row: 1 }` (1-based). */
function cellRef(ref: string): { col: number; row: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  let col = 0;
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(match[2]) };
}

interface CellNode {
  "@_r"?: string;
  "@_t"?: string;
  v?: unknown;
  is?: unknown;
}

/** Display value of one cell, resolving shared/inline strings. */
function cellValue(cell: CellNode, shared: string[]): string {
  switch (cell["@_t"]) {
    case "s": {
      const idx = Number(asString(toArray<unknown>(cell.v)[0], "0"));
      return shared[idx] ?? "";
    }
    case "inlineStr":
      return text(cell.is);
    case "b":
      return asString(toArray<unknown>(cell.v)[0], "false");
    case "str":
    case "n":
    case undefined:
      return asString(toArray<unknown>(cell.v)[0], "");
    default:
      return "";
  }
}

/** Coerce an unknown raw cell value to its string form without `String(unknown)`. */
function asString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

/** Lowercase-keyed part container, looked up case-insensitively. */
class Parts {
  private readonly byKey = new Map<string, Uint8Array>();

  constructor(entries: Iterable<[string, Uint8Array]>) {
    for (const [name, data] of entries) this.byKey.set(name.toLowerCase(), data);
  }

  get(part: string): Uint8Array | undefined {
    return this.byKey.get(part.toLowerCase());
  }
}

function requirePart(parts: Parts, part: string): Uint8Array {
  const buf = parts.get(part);
  if (!buf) {
    throw new UnsupportedFormatError(
      `XLSX is missing required part "${part}" (corrupt or partial file)`,
    );
  }
  return buf;
}

/**
 * fast-xml-parser nests content under the *root element's* tag name — a
 * `<worksheet>` document parses to `{ worksheet: { sheetData: … } }`. Each
 * part reader below unwraps that root by its known tag.
 */

/** Read the shared-strings pool (`xl/sharedStrings.xml`), if present. */
function readSharedStrings(parts: Parts): string[] {
  const raw = parts.get("xl/sharedStrings.xml");
  if (!raw) return [];
  const sst = parseXml(raw) as { sst?: { si?: unknown } };
  return toArray<unknown>(sst.sst?.si).map((si) => text(si));
}

/** Resolve a worksheet (by display name, or index 0) to its part target. */
function resolveSheetTarget(parts: Parts, sheetName?: string): string {
  const workbook = parseXml(
    requirePart(parts, "xl/workbook.xml"),
  ) as { workbook?: { sheets?: { sheet?: unknown } } };
  const sheets = toArray<{ "@_name"?: string; "@_r:id"?: string }>(
    workbook.workbook?.sheets?.sheet,
  );
  if (sheets.length === 0) {
    throw new UnsupportedFormatError("XLSX workbook lists no worksheets");
  }

  const chosen =
    sheetName !== undefined
      ? sheets.find((s) => s["@_name"] === sheetName)
      : sheets[0];
  if (!chosen) {
    throw new UnsupportedFormatError(
      `Unknown worksheet "${sheetName}" ` +
        `(available: ${sheets.map((s) => s["@_name"]).join(", ")})`,
    );
  }

  const rels = parseXml(
    requirePart(parts, "xl/_rels/workbook.xml.rels"),
  ) as { Relationships?: { Relationship?: unknown } };
  const rel = toArray<{ "@_Id"?: string; "@_Target"?: string }>(
    rels.Relationships?.Relationship,
  ).find((r) => r["@_Id"] === chosen["@_r:id"]);
  if (!rel?.["@_Target"]) {
    throw new UnsupportedFormatError(
      `XLSX rels have no target for sheet "${chosen["@_name"]}"`,
    );
  }

  const target = rel["@_Target"];
  return target.startsWith("xl/")
    ? target
    : `xl/${target.replace(/^\.\//, "")}`;
}

interface RowNode {
  "@_r"?: string;
  c?: unknown;
}

/** Parse one worksheet part into a 2-D string grid, indexed by row/col. */
function parseSheet(parts: Parts, target: string, shared: string[]): string[][] {
  const raw = parts.get(target);
  if (!raw) {
    throw new UnsupportedFormatError(
      `XLSX is missing worksheet part "${target}" (corrupt or partial file)`,
    );
  }

  const worksheet = parseXml(raw) as {
    worksheet?: { sheetData?: { row?: unknown } };
  };
  const rows = toArray<RowNode>(worksheet.worksheet?.sheetData?.row);

  // `@_r` carries the 1-based row number; a cell's own `@_r` (e.g. "B12")
  // carries the column. Excel omits empty leading cells, so the column comes
  // from the cell ref, not its array position.
  const grid: string[][] = [];
  rows.forEach((rowNode, seq) => {
    const rowNum = Number(rowNode["@_r"]) || seq + 1;
    const values: string[] = [];
    toArray<CellNode>(rowNode.c).forEach((cell, cellSeq) => {
      const col =
        cell["@_r"] ? (cellRef(cell["@_r"])?.col ?? cellSeq + 1) : cellSeq + 1;
      values[col - 1] = cellValue(cell, shared);
    });
    if (grid.length < rowNum) grid.length = rowNum;
    grid[rowNum - 1] = values;
  });
  return grid;
}

/** Parse an `.xlsx` file into a `Table`. `sheetName` selects a worksheet; the
 *  default is the first one. */
export function parseXlsx(input: Uint8Array, sheetName?: string): Table {
  if (
    input.length < 4 ||
    input[0] !== 0x50 ||
    input[1] !== 0x4b ||
    input[2] !== 0x03 ||
    input[3] !== 0x04
  ) {
    throw new UnsupportedFormatError(
      "Not a valid .xlsx — expected the ZIP container (`PK\\x03\\x04` magic)",
    );
  }

  let unzipped: Map<string, Uint8Array> | Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(input);
  } catch (error) {
    throw new UnsupportedFormatError(
      `Cannot unzip .xlsx container (${(error as Error).message})`,
    );
  }

  // Node's build returns a plain object; the browser build returns a Map.
  const partEntries: Iterable<[string, Uint8Array]> =
    unzipped instanceof Map ? unzipped.entries() : Object.entries(unzipped);
  const parts = new Parts(partEntries);
  const shared = readSharedStrings(parts);
  const target = resolveSheetTarget(parts, sheetName);
  const grid = parseSheet(parts, target, shared);

  const used = grid.filter((row) => row.some((v) => v !== ""));
  if (used.length === 0) {
    throw new EmptyTableError("XLSX file contains no data rows");
  }

  // First non-empty row = header; ragged rows are padded, missing cells "".
  const columns = used[0].map((cell, i) => sanitizeHeaderCell(cell, i));
  const width = columns.length;
  const rows = used.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < width; i++) record[columns[i]] = (cells[i] ?? "").toString();
    return record;
  });

  return { columns, rows, format: "xlsx" };
}
