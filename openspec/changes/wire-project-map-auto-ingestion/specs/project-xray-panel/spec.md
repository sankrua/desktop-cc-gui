## ADDED Requirements

### Requirement: Project memory auto ingestion run lifecycle

The Project Knowledge Map SHALL wire Auto Ingestion settings into the Project Map generation queue rather than using a hidden synchronous write path.

#### Scenario: Threshold creates queued auto run
- **GIVEN** Auto Ingestion is enabled
- **AND** no Project Map auto run is pending or running
- **AND** the configured interval has elapsed since `memoryCursor.lastCheckedAt`
- **WHEN** the count of unprocessed Project Memory messages reaches `newSessionThreshold`
- **THEN** the system SHALL create a queued Project Map run with `kind="auto"`
- **AND** the run SHALL use `scope.kind="auto"` and include the consumed message hashes
- **AND** the background task drawer SHALL be able to render the run using the existing run lifecycle

#### Scenario: Interval prevents repeated scans
- **GIVEN** Auto Ingestion is enabled
- **AND** `memoryCursor.lastCheckedAt` is newer than the configured interval window
- **WHEN** the Project Map panel rerenders or remounts
- **THEN** the system SHALL NOT scan Project Memory again
- **AND** the system SHALL NOT enqueue a duplicate auto run

#### Scenario: Existing auto run prevents duplicate queueing
- **GIVEN** an Auto Ingestion run is already pending or running
- **WHEN** Auto Ingestion evaluates scheduling
- **THEN** the system SHALL NOT enqueue another Auto Ingestion run

#### Scenario: Successful auto run marks memory processed
- **GIVEN** an Auto Ingestion run was created from unprocessed Project Memory messages
- **WHEN** the run completes successfully
- **THEN** the consumed message hashes SHALL be added to `memoryCursor.processedMessages`
- **AND** `memoryCursor.lastRunId` SHALL reference the completed auto run

#### Scenario: Failed auto run does not mark memory processed
- **GIVEN** an Auto Ingestion run was created from unprocessed Project Memory messages
- **WHEN** the run fails or is cancelled
- **THEN** the consumed message hashes SHALL NOT be added to `memoryCursor.processedMessages`
- **AND** the messages SHALL remain eligible for a later retry after the interval gate allows another scan

### Requirement: Auto Ingestion candidate safety

The Project Knowledge Map SHALL keep automatic Project Memory ingestion conservative by default.

#### Scenario: Default candidate mode requires review
- **GIVEN** Auto Ingestion apply mode is `createCandidate`
- **WHEN** an auto run returns generated Project Map nodes or updates
- **THEN** generated updates SHALL remain candidate review items or candidate nodes
- **AND** they SHALL require the existing manual confirm/reject flow before becoming trusted active-map facts

#### Scenario: Advanced apply mode still performs work
- **GIVEN** Auto Ingestion apply mode is `autoApplyEvidenceBacked`
- **WHEN** unprocessed Project Memory reaches the threshold
- **THEN** the system SHALL still enqueue a real auto run
- **AND** weak or memory-only claims SHALL remain candidates rather than being silently trusted
