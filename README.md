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

## Receipt processing

Start the [Goho server](programs/goho-server/README.md), then use the
[CLI](programs/goho-cli/README.md) to process a batch. The shared contract and client
live in [clients/goho-server](clients/goho-server/README.md).
