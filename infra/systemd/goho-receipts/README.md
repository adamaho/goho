# Goho Receipt Timer

These units run the receipt processor once a day at 9:00 PM using the Goho
checkout at `/home/adam/github.com/adamaho/goho`. The service runs as `adam` and
uses the toolchain pinned by `nix develop`.

The timer uses the server's local timezone. Check it before installation:

```bash
timedatectl
```

`Persistent=true` causes one catch-up run after boot when the server was off at
the scheduled time.

## Prepare the checkout

Install the locked dependencies and validate the repository:

```bash
cd /home/adam/github.com/adamaho/goho
nix develop --command pnpm install --frozen-lockfile
nix develop --command pnpm check
```

The timer runs the current contents of this checkout, including any uncommitted
changes. It never fetches code or installs dependencies automatically.

## Install

Install the units and create `/etc/goho/receipts.env` from the tracked example:

```bash
cd /home/adam/github.com/adamaho/goho
sudo ./infra/systemd/goho-receipts/install.sh
```

The installer is safe to rerun. It updates the installed unit files, preserves
an existing environment file, reloads systemd, and verifies both units. It does
not enable the timer or install credentials.

Install the Google service-account key:

```bash
sudo install \
  -o root \
  -g adam \
  -m 0640 \
  /path/to/google-service-account.json \
  /etc/goho/google-service-account.json
```

Then edit the environment file and fill every required value:

```bash
sudoedit /etc/goho/receipts.env
```

The file uses systemd `EnvironmentFile` syntax. Keep each assignment on one
line and don't use shell expansion or command substitution.

## Test and enable

Run one batch manually before enabling the schedule:

```bash
sudo systemctl start goho-receipts.service
systemctl status goho-receipts.service
journalctl -u goho-receipts.service
```

The receipt CLI exits with status 1 when a receipt fails or becomes stranded.
In that case, inspect the batch summary before treating the result as an
installation failure. See
[`programs/goho-cli/README.md`](../../../programs/goho-cli/README.md) for receipt
recovery instructions.

After a successful installation test, enable the timer:

```bash
sudo systemctl enable --now goho-receipts.timer
systemctl list-timers goho-receipts.timer
```

## Operations

```bash
# Run a batch now
sudo systemctl start goho-receipts.service

# Inspect the latest service state and logs
systemctl status goho-receipts.service
journalctl -u goho-receipts.service

# Inspect the next scheduled activation
systemctl list-timers goho-receipts.timer

# Disable future runs; this does not stop a batch already in progress
sudo systemctl disable --now goho-receipts.timer
```

Scheduled and manual production runs should go through systemd. The runner uses
a non-blocking lock at `/run/goho/receipts.lock`. A conflicting invocation exits
with status 75 instead of waiting. Systemd also prevents concurrent activations
of this service unit.

The next scheduled batch processes files in `todo`; it does not automatically
recover files from `failed` or `processing`.

## Update the application

Don't update files while a receipt batch could be running. Stop future timer
activations and wait for the active service, if any:

```bash
sudo systemctl stop goho-receipts.timer
while systemctl is-active --quiet goho-receipts.service; do
  sleep 2
done
```

Check the working tree, update, reinstall locked dependencies, and validate:

```bash
cd /home/adam/github.com/adamaho/goho
git status --short
git pull --ff-only
nix develop --command pnpm install --frozen-lockfile
nix develop --command pnpm check
nix develop --command pnpm --filter @goho/goho-cli start --help
```

If tracked systemd files changed, reinstall them:

```bash
sudo ./infra/systemd/goho-receipts/install.sh
```

Test one batch and resume the timer:

```bash
sudo systemctl start goho-receipts.service
sudo systemctl start goho-receipts.timer
```

If an application update must be rolled back, check out the previous revision,
run the locked install again, rerun the installer when its files changed, and
test before restarting the timer.

## Change the schedule

Use a systemd drop-in rather than editing the installed timer:

```bash
sudo systemctl edit goho-receipts.timer
```

For example, this changes the schedule to every 15 minutes:

```ini
[Timer]
OnCalendar=
OnCalendar=*:0/15
```

After saving, check the calculated next activation:

```bash
sudo systemctl daemon-reload
sudo systemctl restart goho-receipts.timer
systemctl list-timers goho-receipts.timer
```
