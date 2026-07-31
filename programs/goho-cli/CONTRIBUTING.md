# Contributing to @goho/goho-cli

Follow the repository-wide guidance in the root
[CONTRIBUTING.md](../../CONTRIBUTING.md) in addition to this package-specific
setup.

## Prerequisites

### Development environment

Enter the repository's Nix development shell before installing dependencies or
running CLI commands:

```bash
nix develop
```

Keep this shell open for the remaining setup and local development steps.

### Google service account

1. Create or select a project in the
   [Google Cloud console](https://console.cloud.google.com/).
2. Enable the
   [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
   and
   [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
   for that project.
3. Create a service account from the
   [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
   page.
4. Open the service account, select **Keys**, choose **Add key**, then create a
   new JSON key. See Google's
   [service-account key documentation](https://cloud.google.com/iam/docs/keys-create-delete#creating)
   for the complete procedure.
5. Place the downloaded key at
   `programs/goho-cli/.secrets/google-service-account.json`. The `.secrets`
   directory is ignored by Git and must not be committed.
6. Share the Google Drive root folder used for receipt processing with the
   `client_email` address from the JSON key and grant it **Editor** access.
   Limit the service account's access by sharing only the workflow root rather
   than broader Drive resources.

Service-account keys are long-lived credentials. Revoke and replace the key if
it is ever exposed.

### OpenAI API key

1. Create an API key from the
   [OpenAI API keys](https://platform.openai.com/api-keys) page.
2. Ensure the OpenAI project has access to the model configured by
   `OPENAI_MODEL` and has billing configured as needed.
3. Store the key only in `programs/goho-cli/.env` as `OPENAI_API_KEY`. The local
   environment file is ignored by Git.

## Local Setup

Copy the environment template:

```bash
cp programs/goho-cli/.env.example programs/goho-cli/.env
```

The example already points `GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE` at the
package-local JSON key. Set `OPENAI_API_KEY` and adjust `OPENAI_MODEL` if needed.

Run a receipt-processing pass:

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

## Verification

Run the repository checks before submitting changes:

```bash
pnpm check
```
