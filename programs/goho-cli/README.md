# @goho/goho-cli

Command-line interface for Goho.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for credential provisioning and local
development setup.

## Commands

### Process receipts

Process receipts from the `todo` folder in a Google Drive receipt workflow:

```bash
goho receipts process <root-folder-id>
```

The root folder must contain `todo`, `processing`, `processed`, and `failed`
subfolders.

Display all commands and global options:

```bash
goho --help
```

## Configuration

The CLI reads the following environment variables:

- `GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE`: path to a Google service-account JSON
  key file
- `GOOGLE_AUTH_SCOPES`: comma-separated Google OAuth scopes
- `OPENAI_API_KEY`: OpenAI API key
- `OPENAI_MODEL`: OpenAI model used for receipt processing
