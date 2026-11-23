# AGENTS.md

## Project Structure

Excalidraw is a **monorepo** with a clear separation between the core library and the application:

- **`packages/excalidraw/`** - Main React component library published to npm as `@excalidraw/excalidraw`
- **`excalidraw-app/`** - Full-featured web application (excalidraw.com) that uses the library
- **`packages/`** - Core packages: `@excalidraw/common`, `@excalidraw/element`, `@excalidraw/math`, `@excalidraw/utils`
- **`examples/`** - Integration examples (NextJS, browser script)

## Development Workflow

1. **Package Development**: Work in `packages/*` for editor features
2. **App Development**: Work in `excalidraw-app/` for app-specific features
3. **Testing**: Always run `yarn test:update` before committing
4. **Type Safety**: Use `yarn test:typecheck` to verify TypeScript
5. **Documentation**: **Always document changes in README.md** with file paths and line numbers

## Development Commands

```bash
yarn test:typecheck  # TypeScript type checking
yarn test:update     # Run all tests (with snapshot updates)
yarn fix             # Auto-fix formatting and linting issues
```

## Architecture Notes

### Package System

- Uses Yarn workspaces for monorepo management
- Internal packages use path aliases (see `vitest.config.mts`)
- Build system uses esbuild for packages, Vite for the app
- TypeScript throughout with strict configuration

## Guidelines

- For new DOM/browser API usage, use `app.ownerDocument` and `app.ownerWindow` instead of globals; without `app`, derive them from the mounted node's `ownerDocument` and its `defaultView`.
- When overriding properties of an existing type, prefer `Merge<Base, Overrides>` from `@excalidraw/common/utility-types` over `Omit<Base, keyof Overrides> & Overrides`.

# Crowdin (translations)

Crowdin is the source of truth for `packages/excalidraw/locales/*.json` (except `en.json`). The GitHub integration reads `en.json` from `master` (Crowdin branch `master`, hence `-b master` on every CLI command) and pushes translations to `l10n_master`; edits committed straight to locale files are overwritten on its next sync.

Workflow for changing translations:

1. Check out `l10n_master` and pull. Older locale files would be imported as extra translations and can override translators' newer fixes.
2. Edit the locale JSON files; keep `{{placeholders}}` and tags intact.
3. Upload each edited language: `crowdin upload translations -b master -l <lang> --import-eq-suggestions --preserve-hierarchy`.
   - `--preserve-hierarchy` is required: without it the CLI looks for `en.json` at the root of the Crowdin branch and fails ("Source file … does not exist"), even though `--dryrun` passes.
   - `-l` takes one language (repeated flags keep only the last); without it, every language is uploaded.
   - `--import-eq-suggestions` keeps translations identical to the English source (key names like `Ctrl`, `Tab`, product names); otherwise Crowdin skips them as untranslated.
   - Uploads land as unapproved suggestions. A string with an approved translation keeps exporting the approved one, so changing an approved translation also needs an approval (Crowdin editor, or the API: add the translation, then `POST /approvals`).
4. Sync back: `crowdin download -b master` in the same checkout. The output matches the integration's files byte for byte, so its next sync finds nothing to push.
5. Check `git diff`: the edited files should match your edits exactly (a mismatch means Crowdin still exports another translation). Commit and push to `l10n_master`; CI recomputes `percentages.json`.
