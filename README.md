# Goho

Goho is organized as a pnpm and Turborepo workspace with a shared, reproducible
development environment.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow,
verification commands, workspace conventions, and commit guidelines.

## Prerequisites

Before developing in this repository, install:

- [Nix](https://nixos.org/download/)
- [Docker](https://docs.docker.com/get-docker/)

You can give the following prompt to a coding agent running on your machine:

```text
Configure this machine to work on the Goho project. Read README.md,
CONTRIBUTING.md, and flake.nix first. Check whether Nix and Docker are installed
and working; install or enable them when possible, but ask before running
commands that need administrator access. Preserve and use the repository's
existing Nix and Docker setup rather than installing a separate Node.js or pnpm
toolchain. Enter the Nix development shell, install dependencies with pnpm, and
run the documented verification command. Report any manual steps or failures
clearly, and don't change project files unless machine-specific setup requires
it.
```

## Development

Enter the Nix development shell to use the project's pinned toolchain, then
install dependencies:

```bash
nix develop
pnpm install
```

Start coding agents from inside the Nix development shell so their commands use
the same toolchain as local development.

```bash
nix develop
opencode
```

Agents should run verification commands from inside the Nix shell. If an agent
was not started from `nix develop`, run commands through `nix develop --command`
instead.

## Amp orbs

Set an Amp project secret named `NODE_AUTH_TOKEN` with `read:packages` access to
the `@adamaho` GitHub Packages dependencies before starting a fresh orb. The orb's
built-in GitHub token may not have package access. Setup uses a temporary npm
configuration and never writes the token into the snapshot.

`.agents/setup` installs Nix, realizes the development shell from `flake.lock`,
and runs `pnpm install --frozen-lockfile`. Amp snapshots the installed toolchain,
dependencies, and package caches after successful setup. Warm setup reuses them;
`.agents/resume` does not reinstall anything. A repository-scoped login-shell
hook activates the complete Nix environment for agents and supervised services.

Setup copies the CLI and server environment examples only when their `.env`
files are missing. Configure Google and OpenAI credentials before running the
server. Neither the receipt server nor Docker/Postgres starts automatically;
the current unit tests and static checks do not need those services.

## Receipt processing

Start the [Goho server](programs/goho-server/README.md), then use the
[CLI](programs/goho-cli/README.md) to process a batch. The shared contract and client
live in [clients/goho-server](clients/goho-server/README.md).
