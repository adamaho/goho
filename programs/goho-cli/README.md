# @goho/goho-cli

Calls the Goho server and prints receipt-processing results. Google and OpenAI
credentials belong only to the [server](../goho-server/README.md).

## Setup

From the repository root after the [development setup](../../CONTRIBUTING.md#development-setup):

```bash
cp programs/goho-cli/.env.example programs/goho-cli/.env
```

`GOHO_SERVER_URL` defaults to `http://127.0.0.1:3000`.
Start the server before invoking the CLI.

## Process receipts

```bash
pnpm --filter @goho/goho-cli start receipts process <root-folder-id> <spreadsheet-id> --concurrency 5
```

Concurrency defaults to 5 and accepts integers from 1 through 5.
The CLI waits for the batch, prints safe diagnostics for failed receipts, then:

```text
Processed: <count>
Already processed: <count>
Failed: <count>
Stranded: <count>
```

It exits 0 when Failed and Stranded are both zero, including an empty batch.
It exits 1 for failed/stranded receipts, configuration errors, or request failures.
The client does not automatically retry requests. A lost response may mean work
already completed; inspect server logs and follow the
[recovery procedure](../goho-server/README.md#failure-outcomes-and-recovery).
Detailed provider errors are available only in server logs.

Run `pnpm --filter @goho/goho-cli start --help` for command help.
