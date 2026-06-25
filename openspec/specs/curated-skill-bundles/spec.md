# curated-skill-bundles Specification

## Purpose

`curated-skill-bundles` defines the client-bundled curated skill system:
version-pinned skill assets ship with the desktop app, users enable them from
Settings, and enabled skill bodies are injected into supported engine launches.
Composer UI is read-only feedback only; Settings remains the only toggle
surface.

## Requirements

### Requirement: Client MUST Bundle Curated Skills As Versioned Assets

The desktop client MUST bundle curated skills as application resources under
`src-tauri/resources/curated-skills/<skill-id>/`. Each skill directory MUST
contain `SKILL.md` and `metadata.json`. The app MUST package those resources via
`tauri.conf.json` `bundle.resources` so curated skills are available offline and
are tied to the client release version. The client MUST NOT fetch curated skill
bodies from a remote marketplace or URL at runtime.

#### Scenario: lazy-senior-dev bundled

- **WHEN** the client is built
- **THEN** the app resources MUST include `curated-skills/lazy-senior-dev/`
- **AND** that directory MUST contain `SKILL.md` and `metadata.json`
- **AND** `metadata.json` MUST declare `name`, `displayName`, `version`,
  `description`, `icon`, `category`, `tokenEstimate`, `source`, `sourceUrl`,
  and `license`.

#### Scenario: no network fetch at startup

- **WHEN** the client enumerates curated skills
- **THEN** it MUST read bundled local resources
- **AND** MUST NOT issue outbound HTTP/HTTPS requests for curated skill
  discovery or content.

### Requirement: Curated Skill Lock Entries MUST Be Validated At Compile Time

`skills-lock.json` MUST use schema version `2`. Existing marketplace-style
entries are `kind: "bundled"`; curated entries are `kind: "curated"`. The
`src-tauri/build.rs` validator MUST validate only `kind == "curated"` entries
and MUST skip bundled entries. For curated entries it MUST verify SHA-256,
metadata completeness, approved license, token estimate bounds, category,
icon format, kebab-case ASCII skill ids, and safe repo-relative paths.

#### Scenario: curated hash mismatch fails build

- **WHEN** a curated skill `SKILL.md` changes
- **AND** its `computedHash` is stale
- **THEN** `cargo check --manifest-path src-tauri/Cargo.toml` MUST fail with a
  curated skill lock hash mismatch naming the skill.

#### Scenario: bundled hash mismatch is skipped

- **WHEN** a `kind: "bundled"` entry has no matching on-disk asset
- **THEN** the curated validator MUST skip that entry
- **AND** MUST NOT fail the build for that bundled entry.

#### Scenario: unsafe metadata is rejected

- **WHEN** a curated metadata file declares an unsupported license, unsafe path,
  invalid category, non-ASCII / non-kebab icon, invalid skill id, or token
  estimate outside the accepted range
- **THEN** the build MUST fail with an error naming the offending skill and
  field.

### Requirement: AppSettings MUST Persist Enabled Curated Skill IDs

`AppSettings` MUST include `enabled_curated_skill_ids: Vec<String>`, serialized
to the frontend as `enabledCuratedSkillIds`, and default it to an empty array.
The setting MUST persist through the normal settings core and MUST be shared
across workspaces for the same client install.
Settings normalization MUST trim, de-duplicate, and drop empty or non
kebab-case ASCII ids before persisting/restoring the field.

Curated skill id changes MUST participate in Codex restart detection because
Codex app-server `developer_instructions` are captured at launch time. Restart
is required so toggling a curated skill off does not leave stale curated skill
instructions in a long-lived app-server process.

#### Scenario: missing field defaults empty

- **WHEN** an existing config file does not contain `enabledCuratedSkillIds`
- **THEN** restore MUST succeed
- **AND** the field MUST default to an empty array.

#### Scenario: toggle persists

- **WHEN** the user enables `lazy-senior-dev`
- **THEN** `enabledCuratedSkillIds` MUST include `lazy-senior-dev`
- **AND** the value MUST be restored after app restart.

#### Scenario: curated toggle requires Codex restart

- **WHEN** `enabledCuratedSkillIds` changes
- **THEN** `app_settings_change_requires_codex_restart` MUST return true
- **AND** the next Codex app-server launch MUST use the updated curated skill
  set.

### Requirement: Curated Skills MUST Appear In Settings

Settings > Skills MUST render a `CuratedSection` above the regular skills
surface. The section MUST list bundled curated skills and expose Settings as the
only on/off surface. Each row SHOULD show icon, display name, description,
token estimate, source/license affordances where available, and a toggle.

#### Scenario: default off

- **WHEN** the client starts with no enabled curated skill ids
- **THEN** curated skills MUST be listed in Settings
- **AND** their toggles MUST be off.

#### Scenario: toggle updates app settings

- **WHEN** the user turns on `Lazy senior dev`
- **THEN** the frontend MUST call `set_curated_skill_enabled`
- **AND** update local `useAppSettings` state from the returned `AppSettings`.

#### Scenario: unknown skill rejected

- **WHEN** `set_curated_skill_enabled` receives an empty or unknown skill id
- **THEN** it MUST return an error
- **AND** MUST NOT persist the id.

### Requirement: Composer MUST Show A Read-Only Curated Skill Indicator

The composer MUST NOT provide per-message curated skill toggles, chip rows, or
pickers. When at least one curated skill is enabled, composer UI MUST render a
read-only `CuratedSkillIndicator` as a right-side accessory in
`ComposerReadinessBar` via the prop chain
`ChatInputBox -> ChatInputBoxHeader.rightAccessory ->
ComposerReadinessBar.rightAccessory`.

The indicator MUST render inside `.composer-readiness-right-accessory`, MUST use
ChatInputBox-bundled CSS for cold-start correctness, and MUST not toggle skills
directly. If clickable, it MAY navigate to Settings > Skills.

#### Scenario: hidden when none enabled

- **WHEN** no curated skills are enabled
- **THEN** the indicator MUST render nothing
- **AND** MUST leave no visible empty accessory.

#### Scenario: visible in readiness bar accessory

- **WHEN** `lazy-senior-dev` is enabled
- **THEN** `[data-testid="curated-indicator"]` MUST render inside
  `.composer-readiness-right-accessory`
- **AND** MUST NOT render as a separate input/footer chip row.

#### Scenario: Settings change reflected

- **WHEN** Settings toggles a curated skill on or off
- **THEN** the indicator MUST reflect the enabled set within its polling cadence
  without requiring a renderer reload.

### Requirement: Codex Engine MUST Append Curated Skill Bodies As Developer Instructions

Codex app-server launch args MUST include enabled curated skill bodies as a
merged `developer_instructions` config arg when curated skills are enabled and
the user has not supplied an instruction override. The merge MUST preserve
existing internal developer instructions and append a `## Curated Skills`
section containing `<skill id="...">...</skill>` blocks.

#### Scenario: empty enabled set produces no curated arg

- **WHEN** no curated skills are enabled
- **THEN** Codex args MUST not add a curated `developer_instructions` block.

#### Scenario: enabled skill is injected

- **WHEN** `enabledCuratedSkillIds` contains `lazy-senior-dev`
- **THEN** Codex launch args MUST include a `-c developer_instructions=...`
  config value containing `<skill id="lazy-senior-dev">`.

#### Scenario: user override wins

- **WHEN** user-supplied Codex args already include `developer_instructions=` or
  `instructions=`
- **THEN** curated injection MUST NOT overwrite the user override.

### Requirement: Claude Engine MUST Append Curated Skill Bodies As System Prompt

Claude launch construction MUST append enabled curated skill bodies through the
Claude CLI `--append-system-prompt <body>` flag. User prompt bytes MUST continue
to use the existing stdin / stream-json path.

#### Scenario: empty enabled set produces no flag

- **WHEN** no curated skills are enabled
- **THEN** Claude launch args MUST NOT include `--append-system-prompt` for
  curated skills.

#### Scenario: enabled skill is injected

- **WHEN** `enabledCuratedSkillIds` contains `lazy-senior-dev`
- **THEN** Claude launch args MUST include `--append-system-prompt`
- **AND** the following argument MUST contain the `## Curated Skills` section and
  `<skill id="lazy-senior-dev">` block.

#### Scenario: oversized body is bounded

- **WHEN** the combined curated skill prompt body exceeds the implementation
  budget
- **THEN** it MUST be truncated safely
- **AND** the body MUST include a `claude-injection-truncated: true` marker.

### Requirement: Skills List Paths MUST Expose Curated Skill Enabled State

The Tauri command path and daemon path MUST expose curated skill entries with
`source: "curated_bundled"` and an `enabled` boolean computed from
`AppSettings.enabled_curated_skill_ids`. Non-curated skill entries MUST keep
their existing behavior and default enabled state.

#### Scenario: enabled curated entry is true

- **WHEN** `enabledCuratedSkillIds` contains `lazy-senior-dev`
- **THEN** the `lazy-senior-dev` curated skill list entry MUST have
  `enabled: true`.

#### Scenario: disabled curated entry is false

- **WHEN** `enabledCuratedSkillIds` is empty
- **THEN** the `lazy-senior-dev` curated skill list entry MUST have
  `enabled: false`.

### Requirement: Adding A New Curated Skill MUST Follow The Onboarding Checklist

New curated skill entries MUST follow `docs/curated-skill-onboarding.md` and the
archived onboarding checklist. Required checks include attribution, metadata
schema, SHA-256 lock consistency, approved license, icon format, category,
token estimate, naming collision avoidance, and a "When NOT to enable" section.

#### Scenario: invalid addition is rejected

- **WHEN** a curated skill addition violates the build-time validator rules
- **THEN** `cargo check` MUST fail before release packaging.

### Requirement: Rollback Paths MUST Be Documented

The curated skill onboarding documentation MUST document compile-time, asset,
and runtime rollback paths for emergency response.

#### Scenario: runtime soft-disable path exists

- **WHEN** curated skill activation needs to be disabled quickly
- **THEN** maintainers MUST have a documented path to keep UI/config schema
  compatible while preventing new enabled curated skill ids from taking effect.
