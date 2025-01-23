# Comapeo Cloud CLI

[![CI](https://github.com/digidem/comapeo-cloud-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/digidem/comapeo-cloud-cli/actions/workflows/ci.yml)

A command-line interface for interacting with the Comapeo Cloud API.

## Installation

```bash
npm install -g comapeo-cloud-cli
```

## Configuration

The CLI requires the following environment variables:

- `SERVER_URL`: The URL of your Comapeo Cloud server
- `SERVER_BEARER_TOKEN`: Your API bearer token

You can set these in your environment or create a `.env` file. For temporary overrides, use these command-line options with any command:

- `-s, --server-url <url>` - Override server URL
- `-t, --server-token <token>` - Override bearer token

```env
SERVER_URL=https://yourserver.com
SERVER_BEARER_TOKEN=your-token
```

## Usage

### Server Information

Get server info:

```bash
comapeo-cloud -s https://yourserver.com -t your-token server info
```

### Projects

Add a new project (all hex keys are optional):

```bash
comapeo-cloud add-project \
  --name "Project Name" \
  --key "hex-encoded-project-key" \
  --auth-key "hex-encoded-auth-key" \
  --config-key "hex-encoded-config-key" \
  --data-key "hex-encoded-data-key" \
  --blob-index-key "hex-encoded-blob-index-key" \
  --blob-key "hex-encoded-blob-key"
```

List all projects:

```bash
comapeo-cloud list-projects
```

### Observations

Add a new observation:

```bash
comapeo-cloud add-observation \
  --project-id "proj_abc123" \
  --lat 12.345 \
  --lon -67.890
```

List observations for a project:

```bash
comapeo-cloud list-observations --project-id "proj_abc123"
```

### Attachments

Get an attachment:

```bash
comapeo-cloud get-attachment \
  --project-id "proj_abc123" \
  --drive-id "drive_123" \
  --type "photo" \
  --name "filename.jpg" \
  --variant "preview"

# For audio files:
comapeo-cloud get-attachment \
  --project-id "proj_abc123" \
  --drive-id "drive_123" \
  --type "audio" \
  --name "recording.mp3"
```

### Remote Alerts

Create a remote detection alert:

```bash
comapeo-cloud create-alert \
  --project-id "proj_abc123" \
  --start-date "2024-01-01T00:00:00Z" \
  --end-date "2024-01-02T00:00:00Z" \
  --source-id "src_123" \
  --alert-type "motion-detected" \
  --lon -67.890 \
  --lat 12.345
```

### Health Check

Check server health:

```bash
comapeo-cloud healthcheck
```

## Development

1. Clone the repository
2. Install dependencies:

```bash
bun install
```

3. Build the project:

```bash
bun run build
```

4. Run tests:

```bash
bun test
```

## Configuration Overrides

All commands support temporary server configuration via CLI flags:

```bash
comapeo-cloud -s https://alt.server.com -t alt-token [command]
```

## Publishing

The package is automatically published to npm when a new release is created on GitHub. To create a new release:

1. Update the version in package.json
2. Create and push a new tag
3. Create a new release on GitHub

The GitHub Actions workflow will automatically:

- Run tests
- Build the project
- Publish to npm

## License

MIT
