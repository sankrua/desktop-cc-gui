## ADDED Requirements

### Requirement: Files view uses low-signal filtering instead of unconditional governance hiding
The Project Map Files view SHALL treat low-signal files as a UI projection concern and MUST NOT hide governance or documentation roots solely because their path starts with `openspec/`, `.trellis/`, or `docs/`.

#### Scenario: Governance source appears in a relationship snapshot
- **WHEN** a scanned file belongs to `openspec/`, `.trellis/`, or `docs/` and has a meaningful role or parse status
- **THEN** the Files view can include it by default instead of classifying it as unconditional noise.

#### Scenario: Low-signal files are hidden by default
- **WHEN** a scanned file is skipped, unknown, style-only, or infrastructure-only
- **THEN** the Files view may hide it until the user enables low-signal files.
