import {
  renderCount,
  renderCsv,
  renderList,
  renderTable,
  renderSummary,
  resolveFormat,
  type Column,
} from "../lib/format.js";

const columns: Column[] = [
  { key: "id", header: "id" },
  { key: "notes", header: "notes", maxWidth: 6 },
];
const rows = [
  { id: "abc", notes: "short" },
  { id: "def", notes: "far too long to fit" },
];

describe("resolveFormat", () => {
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      configurable: true,
    });
  });

  it("defaults to json when stdout is not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: undefined,
      configurable: true,
    });
    expect(resolveFormat()).toBe("json");
  });

  it("defaults to table on a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    expect(resolveFormat()).toBe("table");
  });

  it("honours an explicit format regardless of TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    expect(resolveFormat("csv")).toBe("csv");
  });

  it("rejects an unknown format", () => {
    expect(() => resolveFormat("yaml")).toThrow(/Unknown --format/);
  });
});

describe("renderTable", () => {
  it("prints a header, a rule and one line per row", () => {
    const output = renderTable(columns, rows);
    const lines = output.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("id");
    expect(lines[1]).toContain("─");
    expect(lines[3]).toContain("def");
  });

  it("truncates columns that declare a maxWidth", () => {
    expect(renderTable(columns, rows)).toContain("far t…");
  });

  it("says so when nothing matched", () => {
    expect(renderTable(columns, [])).toContain("no matches");
  });
});

describe("renderCsv", () => {
  it("quotes values containing commas and quotes", () => {
    const output = renderCsv(
      [{ key: "notes", header: "notes" }],
      [{ notes: 'a,b"c' }],
    );
    expect(output).toBe('notes\n"a,b""c"');
  });
});

describe("renderList", () => {
  it("emits untouched records for json", () => {
    const records = [{ docId: "x", extra: true }];
    expect(JSON.parse(renderList("json", columns, [], records))).toEqual(
      records,
    );
  });

  it("emits one record per line for ndjson", () => {
    const records = [{ docId: "x" }, { docId: "y" }];
    expect(renderList("ndjson", columns, [], records).split("\n")).toHaveLength(
      2,
    );
  });

  it("projects through columns for table and csv", () => {
    expect(renderList("csv", columns, rows, rows)).toContain("abc");
    expect(renderList("table", columns, rows, rows)).toContain("abc");
  });
});

describe("renderCount", () => {
  it("prints a bare number when not grouped", () => {
    expect(renderCount(56, undefined, "table")).toBe("56");
  });

  it("prints tab separated grouped counts", () => {
    expect(
      renderCount(
        5,
        [
          ["agua", 3],
          ["coleta", 2],
        ],
        "table",
      ),
    ).toBe("agua\t3\ncoleta\t2");
  });

  it("prints an object for json", () => {
    expect(JSON.parse(renderCount(5, [["agua", 3]], "json"))).toEqual({
      agua: 3,
    });
  });

  it("prints csv for csv", () => {
    expect(renderCount(5, [["agua", 3]], "csv")).toBe("value,count\nagua,3");
  });
});

describe("renderSummary", () => {
  it("aligns labels", () => {
    const output = renderSummary([
      { label: "a", value: "1" },
      { label: "long label", value: "2" },
    ]);
    const lines = output.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("long label");
  });
});
