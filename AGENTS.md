# @joltioapp/client

TypeScript client for Joltio Data (`api.joltio.app/data`), published on npm as `@joltioapp/client`. Public repository: `github.com/datons/joltio-js`.

## Build and test

- `bun install --frozen-lockfile`
- `bun run check` (type-check), `bun test`, `bun run build` (writes `dist/`)
- CI (`.github/workflows/ci.yml`) runs the same three on every push.

## Release

npm publishes only from GitHub Actions; `npm publish` from a laptop is forbidden and blocked by the `publish-guard` hook.

1. Bump `version` in `package.json` and commit to `main`.
2. Tag and push: `git tag v<version> && git push origin v<version>`.
3. `.github/workflows/publish.yml` checks that the tag matches the version, runs check, test and build, and runs `npm publish --provenance` with npm trusted publishing (OIDC). There is no npm token. Prereleases (`1.2.0-rc.1`) go to the `next` dist-tag.
4. Verify: `npm view @joltioapp/client version`.

The trusted publisher on npmjs.com (package settings) names repository `datons/joltio-js`, workflow `publish.yml` and environment `npm`. Renaming the workflow file or the environment breaks publishing until it is updated there. The `npm` GitHub environment only accepts `v*` tags.

A published version cannot be overwritten: fix forward with a new version.
