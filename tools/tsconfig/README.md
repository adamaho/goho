# @goho/tool-tsconfig

Shared TypeScript configurations for this Turborepo.

## Exports

- `@goho/tool-tsconfig/base`: strict baseline compiler defaults.
- `@goho/tool-tsconfig/service`: NodeNext service defaults for backend workspaces.
- `@goho/tool-tsconfig/app-vite`: bundler and React defaults for Vite workspaces.
- `@goho/tool-tsconfig/effect`: optional Effect compiler diagnostics.

## Usage in a workspace package

1. Add this package to the workspace's `devDependencies`:

```json
{
  "devDependencies": {
    "@goho/tool-tsconfig": "workspace:*"
  }
}
```

2. Extend the workspace `tsconfig.json`:

```json
{
  "extends": "@goho/tool-tsconfig/service",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

## Effect projects

Core and the CLI opt into the Effect overlay after the service defaults:

```json
{
  "extends": ["@goho/tool-tsconfig/service", "@goho/tool-tsconfig/effect"]
}
```

The overlay promotes eight official Effect diagnostics to errors, including
discarded Effects, nested Promises, and leaking service requirements. They fail
`tsc` and `pnpm check`. General tooling can use service or base without it.

Installation runs `effect-tsgo patch` through this tool package's preparation
script. Keep `@effect/tsgo@0.41.0` paired with `typescript@7.0.2`; an unpatched
compiler does not enforce the overlay. Configure editor support separately with
`pnpm --filter @goho/tool-tsconfig exec effect-tsgo setup`.

The Oxlint Effect preset is independent of the compiler overlay. Its existing
CLI runtime entry point remains `src/main.ts`.
