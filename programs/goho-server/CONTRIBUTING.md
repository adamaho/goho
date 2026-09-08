# Contributing to @goho/goho-server

Follow the repository-wide guidance in the root
[CONTRIBUTING.md](../../CONTRIBUTING.md) in addition to this package-specific
setup.

## Prerequisites

### Development environment

Enter the repository's Nix development shell before installing dependencies or
running server commands:

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
   `programs/goho-server/.secrets/google-service-account.json`. The `.secrets`
   directory is ignored by Git and must not be committed.
6. Share the Google Drive root folder used for receipt processing with the
   `client_email` address from the JSON key and grant it **Editor** access.
   Limit the service account's access by sharing only the workflow root rather
   than broader Drive resources.
7. Share the destination spreadsheet with the same `client_email` address and
   grant it **Editor** access.

Service-account keys are long-lived credentials. Revoke and replace the key if
it is ever exposed.

### OpenAI API key

1. Create an API key from the
   [OpenAI API keys](https://platform.openai.com/api-keys) page.
2. Ensure the OpenAI project has access to the model configured by
   `OPENAI_MODEL` and has billing configured as needed.
3. Store the key only in `programs/goho-server/.env` as `OPENAI_API_KEY`. The local
   environment file is ignored by Git.

## Local Setup

Copy the environment template:

```bash
cp programs/goho-server/.env.example programs/goho-server/.env
```

The example already points `GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE` at the
package-local JSON key. Set `OPENAI_API_KEY` and adjust `OPENAI_MODEL` if needed.

Start the server:

```bash
pnpm --filter @goho/goho-server start
```

In a second Nix shell, configure and run the [CLI](../goho-cli/README.md).
Use `pnpm --filter @goho/goho-server dev` for watch mode; avoid restarting during a real batch.

## Verification

Run the repository checks before submitting changes:

```bash
pnpm check
```

Follow the authoritative
[failure outcomes and recovery procedure](./README.md#failure-outcomes-and-recovery)
when a validation run fails or is interrupted. In particular, locate uncertain
files by Drive ID and inspect their current parent before moving them.

Complete this manual validation checklist after changes to receipt processing:

- [ ] Process one supported receipt successfully and confirm its item rows,
      source file ID, move to `processed`, zero failure counts, and status `0`.
- [ ] Process one unsupported MIME type and confirm its move to `failed`, safe
      `MovedToFailed` diagnostic, nonzero failed count, and status `1`.
- [ ] Run with missing or invalid required configuration and confirm a safe
      startup message and status `1` without provider details or a stack trace.
- [ ] Return a file whose real Drive ID already exists in `RAW!F:F` to `todo`,
      then confirm no rows are appended, the file moves to `processed`, and the
      `Already processed` count increases.
