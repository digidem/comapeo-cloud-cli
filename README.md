# Comapeo Cloud CLI

A command-line interface for interacting with the Comapeo Cloud API.

## Installation

```bash
npm install -g comapeo-cloud-cli
```

## Configuration

The CLI requires the following environment variables:

- `SERVER_URL`: The URL of your Comapeo Cloud server
- `SERVER_BEARER_TOKEN`: Your API bearer token

You can set these in your environment or create a `.env` file:

```env
SERVER_URL=https://yourserver.com
SERVER_BEARER_TOKEN=your-token
```

## Usage

### Projects

Add a new project:

```bash
comapeo add-project \
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
comapeo list-projects
```

### Observations

Add a new observation:

```bash
comapeo add-observation \
  --project-id "project-id" \
  --lat 12.345 \
  --lon -67.890 \
  --tags "tag1" "tag2" \
  --attachments "driveId,photo,filename.jpg" "driveId,audio,recording.mp3"
```

List observations for a project:

```bash
comapeo list-observations --project-id "project-id"
```

### Attachments

Get an attachment:

```bash
comapeo get-attachment \
  --project-id "project-id" \
  --drive-id "drive-discovery-id" \
  --type "photo" \
  --name "filename" \
  --variant "original"
```

### Remote Alerts

Create a remote detection alert:

```bash
comapeo create-alert \
  --project-id "project-id" \
  --start-date "2024-01-01T00:00:00Z" \
  --end-date "2024-01-02T00:00:00Z" \
  --source-id "source-id" \
  --alert-type "alert-type" \
  --lon -67.890 \
  --lat 12.345
```

### Health Check

Check server health:

```bash
comapeo healthcheck
```

## Development

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

4. Run tests:

```bash
npm test
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
