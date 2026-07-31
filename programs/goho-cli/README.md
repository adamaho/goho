# @goho/goho-cli

Command-line interface for Goho. Receipt operations are grouped under the
`receipts` subcommand.

## Local development

Copy the environment template and fill in the Google service-account and OpenAI
credentials:

```bash
cp programs/goho-cli/.env.example programs/goho-cli/.env
```

Share the required Google Drive files with the configured service-account email,
then run:

```bash
pnpm --filter @goho/goho-cli start receipts process <root-folder-id>
```

Display the CLI help without running a processing pass:

```bash
pnpm --filter @goho/goho-cli start --help
```

Use watch mode while developing:

```bash
pnpm --filter @goho/goho-cli dev
```
