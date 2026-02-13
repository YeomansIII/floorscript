# Releasing FloorScript

## Versioning

All packages in the monorepo share the same version number and are released together. We follow [Semantic Versioning](https://semver.org/):

- **Patch** (0.1.x): Bug fixes, documentation updates
- **Minor** (0.x.0): New features, non-breaking additions
- **Major** (x.0.0): Breaking API changes

## Release Process

### 1. Prepare the release

Update the version in all package.json files:

```bash
# Update version in all packages (replace X.Y.Z with the new version)
VERSION=X.Y.Z
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" \
  package.json \
  packages/core/package.json \
  packages/render-svg/package.json \
  packages/cli/package.json
```

### 2. Update the changelog

Edit `CHANGELOG.md`:

- Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`
- Add a new `## [Unreleased]` section at the top
- Ensure all notable changes are documented

### 3. Verify everything passes

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

### 4. Commit and tag

```bash
git add -A
git commit -m "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

### 5. Create a GitHub Release

1. Go to **Releases** > **Draft a new release**
2. Select the `vX.Y.Z` tag
3. Set the release title to `vX.Y.Z`
4. Paste the changelog entry into the description
5. Click **Publish release**

This triggers the release workflow which automatically publishes all packages to npm.

## npm Setup

The release workflow requires an `NPM_TOKEN` secret configured in the GitHub repository settings:

1. Create an npm automation token at https://www.npmjs.com/settings/tokens
2. The token needs publish access to the `@floorscript` scope
3. Add it as a repository secret named `NPM_TOKEN` in **Settings** > **Secrets and variables** > **Actions**
