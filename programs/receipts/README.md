# @goho/program-receipts

Runs one receipts-processing pass and exits. Its deployment environment decides
when and how to invoke the program.

## Local development

Copy the environment template and fill in the Google service-account and OpenAI
credentials:

```bash
cp programs/receipts/.env.example programs/receipts/.env
```

Share the required Google Drive files with the configured service-account email,
then run:

```bash
pnpm --filter @goho/program-receipts start
```

Use watch mode while developing:

```bash
pnpm --filter @goho/program-receipts dev
```
