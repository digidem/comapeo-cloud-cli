# Comapeo Cloud CLI

[![CI](https://github.com/digidem/comapeo-cloud-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/digidem/comapeo-cloud-cli/actions/workflows/ci.yml)

A command-line interface for interacting with the CoMapeo Cloud API.

## Installation

```bash
npm install -g comapeo-cloud-cli
```

## Configuration

The CLI reads two environment variables:

- `SERVER_URL`: the URL of your CoMapeo Cloud server
- `SERVER_BEARER_TOKEN`: your API bearer token

Set them in your environment or in a `.env` file in the current directory.
`COMAPEO_SERVER_URL` / `COMAPEO_SERVER_TOKEN` are accepted as aliases when the
un-prefixed names would collide with other tooling.

Every command also accepts per-invocation overrides:

- `-s, --server-url <url>`
- `-t, --server-token <token>`

```env
SERVER_URL=https://yourserver.com/
SERVER_BEARER_TOKEN=your-token
```

Optional: set `COMAPEO_PROJECT` to a project id or name to stop passing `-p` to
every command.

## Output

List commands choose their format automatically:

| stdout         | default format |
| -------------- | -------------- |
| a terminal     | `table`        |
| a pipe or file | `json`         |

So `comapeo-cloud list-observations -p <id>` is readable by a human, and
`comapeo-cloud list-observations -p <id> \| jq '.[].docId'` keeps working in a
script with no extra flags. Override with `--format`:

- `table` — aligned columns, truncated long values
- `json` — the full, untouched API records (default when piped)
- `ndjson` — one JSON record per line, the friendliest target for `jq`
- `csv` — every column, RFC 4180 quoting

Other global flags: `--columns <a,b,c>` (per command), `--timeout <ms>`,
`--no-color`, `-v/--verbose`, `-V/--version`.

## Projects

Project ids are 52-character strings that are painful to copy around, so `-p`
also accepts a **project name**:

```bash
comapeo-cloud list-projects                     # id + name table
comapeo-cloud list-projects --count             # 10
comapeo-cloud list-projects --search vigilancia # name substring

comapeo-cloud list-observations -p "Expedição 2026"   # resolves to the id
```

Exact (case-insensitive) names win; otherwise a substring must identify exactly
one project. An ambiguous name lists the candidates and exits `2` rather than
guessing.

## Observations

```bash
comapeo-cloud list-observations -p <id|name>
```

### Counting

`--count` prints a bare number — no labels, no colour — so it composes:

```bash
comapeo-cloud list-observations -p <id> --count                       # 56
comapeo-cloud list-observations -p <id> --count --category agua       # 17
comapeo-cloud list-observations -p <id> --count --has audio           # 21
```

Break the number down with `--group-by` (tab-separated `key<TAB>count`):

```bash
comapeo-cloud list-observations -p <id> --count --group-by category
comapeo-cloud list-observations -p <id> --count --group-by day
comapeo-cloud list-observations -p <id> --count --group-by tag:tipo-de-corpo-dagua
```

Valid groups: `category`, `preset`, `day`, `device`, `media`, `tag:<field>`.

> Presets are grouped by docId prefix (`preset:abb1b841`), not by name: the
> deployed servers do not expose a `/presets` route, so there is no preset name
> to resolve against.

`--summary` prints a block instead of records:

```bash
$ comapeo-cloud list-observations -p <id> --summary
matching         56
date range       2026-10-26 → 2026-10-29
devices          3
media            112 photos, 21 audio
no attachments   2
categories       9
```

### Filtering

All filtering happens client-side: the API's `/projects/:id/observations`
endpoint takes no query parameters and always returns every document. That is
cheap enough for field projects (well under a megabyte of JSON) and means every
filter below can be combined freely.

| Flag                                | Meaning                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `--category <id[,id]>`              | match `tags.categoryId`                                                    |
| `--tag <key=value>`                 | match any tag; repeatable; `v1\|v2` for OR; arrays matched                 |
| `--preset <docId>`                  | match a preset docId prefix                                                |
| `--since <date>` / `--until <date>` | `createdAt` bounds; `YYYY-MM-DD` includes the whole day                    |
| `--bbox <w,s,e,n>`                  | observations inside a lon/lat box                                          |
| `--has <kind>`                      | has `photo`, `audio`, `video`, `attachment`, `location`, `notes`, `preset` |
| `--missing <kind>`                  | inverse of `--has`                                                         |
| `--search <text>`                   | substring over notes and tag values                                        |
| `--include-deleted`                 | include tombstones (excluded by default)                                   |
| `--only-deleted`                    | show only tombstones                                                       |
| `--sort <key>`                      | `createdAt` (default), `updatedAt`, `category`, `notes`, `media`, `id`     |
| `--reverse`                         | reverse the sort                                                           |
| `--limit <n>` / `--offset <n>`      | paginate the printed page                                                  |
| `--columns <a,b,c>`                 | pick table/csv columns                                                     |

**Deleted documents are excluded by default.** The API returns tombstones
mixed in with live records (`includeDeleted: true` server-side), and counting
them made "how many observations do we have?" wrong. `--count` now reports
live observations; use `--include-deleted` to see everything.

Examples:

```bash
# everything tagged as a river, with audio, this week
comapeo-cloud list-observations -p <id> \
  --tag tipo-de-corpo-dagua=rio --has audio --since 2026-10-26

# what still has no media attached?
comapeo-cloud list-observations -p <id> --missing attachment --format csv

# readable table, newest first
comapeo-cloud list-observations -p <id> --reverse --limit 20 --format table
```

## Attachments

```bash
comapeo-cloud get-attachment \
  -u "https://server/projects/<id>/attachments/<drive>/photo/<name>" \
  --variant thumbnail \
  -o photo.jpg
```

Photo variants: `original`, `preview`, `thumbnail`. Audio only has `original`.
Pass `-o -` to stream the bytes to stdout.

## Remote Alerts

```bash
comapeo-cloud list-alerts -p <id> --count
comapeo-cloud list-alerts -p <id> --since 2026-10-01 --alert-type motion-detected

comapeo-cloud create-alert -p <id> \
  --start-date 2024-01-01T00:00:00Z \
  --end-date 2024-01-02T00:00:00Z \
  --source-id src_123 \
  --alert-type motion-detected \
  --lon -67.890 --lat 12.345
```

## Data Export

```bash
# ZIP: GeoJSON + media
comapeo-cloud export-geojson -p <id> -o export.zip

# plain GeoJSON, no downloads
comapeo-cloud export-geojson -p <id> -o export.geojson --no-attachments

# export just a filtered slice
comapeo-cloud export-geojson -p <id> --category agua --since 2026-10-29 -o water.zip
```

The output extension decides the behaviour: `.zip` bundles `comapeo_data.geojson`
plus `images/` and `audio/` folders; `.geojson` writes the GeoJSON alone and
never downloads media. `--no-attachments` forces the metadata-only path.

`export-geojson` accepts the same filter flags as `list-observations`, so
whatever you can list you can also export.

Properties in the exported GeoJSON are the observation's tags (`categoryId`,
`notes`, and any preset-specific field) plus `$created`, `$modified`, `$version`,
`$photos` and, when present, `$audio`.

## Health Check

```bash
comapeo-cloud healthcheck   # prints "ok" and exits 0
comapeo-cloud info
```

## Exit Codes

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| `0`  | success                                                        |
| `1`  | API or runtime failure                                         |
| `2`  | usage error (bad flag, missing config, ambiguous project name) |
| `3`  | not found (unknown project, no matching records)               |

## Development

```bash
bun install
bun run build     # tsc -> dist/
bun test          # unit + CLI integration tests
bun run lint      # prettier
```

`bun test` is what CI runs; `npm test` is wired to the same command because some
dependencies (`chalk` 5) are ESM-only and do not load under jest's CJS runtime.

### Layout

```
src/index.ts        entry point
src/cli.ts          program wiring and global options
src/commands/       one module per command group
src/lib/api.ts      config, axios client, project resolution, error mapping
src/lib/filters.ts  pure filter predicates (no I/O)
src/lib/group.ts    grouping and summary maths
src/lib/format.ts   table / json / ndjson / csv renderers
src/lib/columns.ts  column definitions per data type
src/__tests__/      unit tests + a synthetic fixture (no real field data)
```

## Publishing

The package is published to npm when a release is created on GitHub:

1. Update `version` in `package.json`
2. Create and push a tag
3. Create a GitHub release

## License

MIT
