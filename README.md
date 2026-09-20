# Goho

Goho is organized as a pnpm and Turborepo workspace.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow,
verification commands, workspace conventions, and commit guidelines.

## Prerequisites

Before developing in this repository, install:

- [Node.js](https://nodejs.org/en/download) 24, matching `engines.node` in `package.json`
- [pnpm](https://pnpm.io/installation) at the version pinned in `packageManager`
- [Docker with Compose](https://docs.docker.com/get-docker/) when using local services

You can give the following prompt to a coding agent running on your machine:

```text
Configure this machine to work on the Goho project. Read README.md,
CONTRIBUTING.md, and package.json first. Use existing Node.js and pnpm
installations when they match the declared versions; install missing tools
directly without Corepack. Set up Docker only if local services are needed.
Install dependencies with pnpm and run the documented verification command.
Report any manual steps or failures clearly.
```

## Development

Follow the [development setup](./CONTRIBUTING.md#development-setup) to install
the required tools, then run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm check
```

Coding agents use these same commands with Node.js and pnpm on `PATH`.

## Receipt processing

Start the [Goho server](programs/goho-server/README.md), then use the
[CLI](programs/goho-cli/README.md) to process a batch. The shared API contract lives in
[packages/goho-api](packages/goho-api/README.md), and the derived typed client lives in
[clients/goho-server](clients/goho-server/README.md).
