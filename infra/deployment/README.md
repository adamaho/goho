# Legacy host deployment

This directory retains the [systemd installer and migration notes](./systemd.md)
and its Postgres Compose definition for existing installations. Keep these until
the systemd-to-container migration is complete.

The current server image, Compose stack, deployment scripts and instructions
live in [`programs/goho-server`](../../programs/goho-server/DEPLOYMENT.md).
There is no deployment workspace package: programs own their deployment files.

See [infrastructure ownership](../README.md) for the repository boundary.
