# goal · harness.adoption-web-rest

- **State:** building
- **Task:** adopt
- **Branch:** adopt

## Tasks

1. [ ] adopt

## Task brief · adopt

**Problem**

web-tooling, web-icons, and web-app-sdk don't pin marathon, their checks run neither marathon
lint, and lint-context fails in all three. Their comments follow the old "non-obvious why" rule,
and they point at a retired roadmap file.

**Behaviors**
1. Each repository's mise.toml pins marathon's tools at 0.22.0 under a `See` header, and its
   currency command reports a newer marathon tag.
2. Each check runs lint-context and lint-references, runs both, and fails if either fails; a lint
   missing from PATH fails, naming `mise run install`; the check's description names both lints.
3. lint-context passes in all three: web-tooling's and web-icons' READMEs are within 1,500 words,
   their moved detail unchanged in docs/ pages linked by absolute `main` URL; every pointer to a
   moved section names its new page; every capability-map entry is `(built)` and links its home.
4. Every comment in TS, JS, shell, CSS, HTML, TOML (marathon.toml included), YAML, `.gitignore`,
   and `.prettierignore` is one of the five kinds: JSDoc on exports and module headers stays;
   JSDoc on non-exported symbols, in-body comments, and test comments go, their reasoning moving
   into names, exported docs, module headers, or docs/; configuration headers are a short
   description plus `See` lines; provenance is one line per source with a short "what changed"
   clause.
5. ESLint enables eslint-comments' `require-description` and sets `ban-ts-comment` to
   `allow-with-description` explicitly; web-tooling's one directive carries its reason as its
   description.
6. Each STANDARDS comment rule names the five kinds and covers all configuration, CSS, and HTML,
   and names the one-line provenance form.
7. CLAUDE.md and context/README.md point at `standards-lab/roadmap/index.toml`.
8. The `run_auto_install` comment goes, and currency's description says it reads the network.
9. web-tooling's workflows run mise-action v5.2.10.
10. lint-references, the check, and CI pass. Nothing is released, and the CHANGELOGs are unchanged
    (a devDependency changes no consumer requirement).

**Test seams**
- `mise run check` and `mise run currency` in each repository; lint-context and lint-references.

**Slices**
1. web-tooling upgrade: mise-action v5.2.10.
2. web-tooling: comments, suppressions, STANDARDS rule.
3. web-tooling: README to docs/, map, pointers, pin, and check.
4. web-icons: comments, suppressions, STANDARDS rule.
5. web-icons: README to docs/, map, pointers, pin, and check.
6. web-app-sdk: comments, suppressions, STANDARDS rule.
7. web-app-sdk: map, pointers, pin, and check (no docs/ move).

**Out of scope**

web-foundation, web-components, webappgen; releases and tags; bumping consumers' web-tooling tag;
README preview captures; the coordinator note edit (pending).

**Door**

Two-way: no release.

## Progress

slices 7/7 committed · standards ✓ · spec ✓ (1 gap: web-icons pointer to web-tooling's screenshots doc) · editor ✓

## Decisions

None.

## Pending edits

- coordinator · context/web-client.md:82: change (its README, "Screenshots") to (its
  `docs/screenshots.md`), the page web-tooling moved the section to.
