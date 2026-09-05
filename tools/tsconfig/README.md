# @goho/tool-tsconfig

Shared TypeScript configurations for this Turborepo.

## Exports

- `@goho/tool-tsconfig/base`: strict baseline compiler defaults.
- `@goho/tool-tsconfig/service`: NodeNext defaults and Effect diagnostics for services.
- `@goho/tool-tsconfig/app-vite`: bundler and React defaults for Vite workspaces.

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

## Effect diagnostics

All Goho services use Effect, so the service config includes eight official
Effect diagnostics as errors. Core and the CLI inherit them automatically;
there is no second config to extend. These errors fail `tsc` and `pnpm check`.
The base and app-vite configs remain independent of Effect diagnostics.

Installation runs `effect-tsgo patch` through this tool package's preparation
script. Keep `@effect/tsgo@0.41.0` paired with `typescript@7.0.2`; an unpatched
compiler does not enforce the diagnostics. Configure editor support separately
with `pnpm --filter @goho/tool-tsconfig exec effect-tsgo setup`.

The Oxlint Effect preset is independent of the compiler configuration. Its
existing CLI runtime entry point remains `src/main.ts`.
