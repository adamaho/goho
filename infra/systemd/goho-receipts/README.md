# Scheduled receipt batches

The existing timer runs the CLI against a separately running Goho server.
It no longer loads Google or OpenAI credentials.

1. Configure and start [goho-server](../../../programs/goho-server/README.md).
   Use `infra/systemd/goho-server/goho-server.service` for this host's persistent server.
2. Run `sudo infra/systemd/goho-receipts/install.sh` from the repository root.
3. Set the folder ID, spreadsheet ID, URL, and matching token in `/etc/goho/receipts.env`.
4. Test with `sudo systemctl start goho-receipts.service` and inspect `journalctl -u goho-receipts.service`.
5. Enable scheduling with `sudo systemctl enable --now goho-receipts.timer`.

For an existing installation, move Google/OpenAI settings to `/etc/goho/server.env`
and remove them from `receipts.env`. Copy the shared token to both files.
The installer preserves existing environment files and does not enable the timer.
The local flock avoids overlapping scheduled CLI processes; the server also rejects
overlapping batches from any client. Run only one server against a workflow.
