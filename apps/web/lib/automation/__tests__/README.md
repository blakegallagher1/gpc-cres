# Automation Framework Tests - Wave 0

## Overview

This directory contains comprehensive test suites for all 5 shared automation modules that form the foundation of the Automation Frontier project. These tests are written test-first (TDD) and will initially fail until the implementation modules are created.

## Test Files

### 1. `config.test.ts` - Configuration Tests
Tests the `AUTOMATION_CONFIG` object with all automation parameters.

**Coverage:**
- All 7 configuration sections (enrichment, triage, taskExecution, intake, advancement, buyerOutreach, documents)
- 18 specific configuration values
- Immutability (Object.freeze) verification
- Nested object and array immutability

**Key assertions:**
- Exact value matches for all config parameters
- Config object is frozen at all levels
- Arrays cannot be modified

### 2. `gates.test.ts` - Decision Gates Tests
**MOST CRITICAL TEST FILE** - Tests the human approval and auto-advancement logic.

**Coverage:**
- `requiresHumanApproval(from, to)`: 8 required approval transitions + edge cases
- `canAutoAdvance(from, to)`: Only INTAKE → TRIAGE_DONE returns true, all others false
- `getAdvancementCriteria(stage)`: Criteria objects for each stage with validation

**Key assertions:**
- All 8 human-gated transitions require approval
- Only 1 auto-advance transition (INTAKE → TRIAGE_DONE)
- KILLED transitions never require approval
- Advancement criteria include required fields and descriptive text
- Terminal states (EXITED, KILLED) return null criteria
- INTAKE returns null criteria (auto-advance)

### 3. `taskAllowlist.test.ts` - Task Filtering Tests
Tests which tasks can be executed by agents vs. require human action.

**Coverage:**
- `isAgentExecutable(title)`: Human-only keyword detection
- `getHumanOnlyReason(title)`: Descriptive reason generation
- Case insensitivity
- Partial matches (keyword within words)
- Edge cases (empty strings, multiple keywords, special characters)

**Key assertions:**
- 5 human-only keywords: call, meet, negotiate, sign, schedule
- Case-insensitive matching
- Partial word matches (e.g., "callback" contains "call")
- Agent-executable tasks return true
- Human-only tasks return descriptive reasons

### 4. `events.test.ts` - Event System Tests
Tests the event dispatch and handler registration system.

**Coverage:**
- `dispatchEvent(event)`: Fire-and-forget behavior, error handling
- `registerHandler(eventType, handler)`: Multiple handlers per type
- 8 event types: parcel.created, parcel.enriched, triage.completed, task.created, task.completed, deal.statusChanged, upload.created, intake.received
- Handler execution order
- Async handler support

**Key assertions:**
- Handler errors do not propagate to caller
- Unregistered event types are silent no-ops
- Multiple handlers for same event type all execute
- One handler error doesn't prevent others from running
- Handlers receive correct event data

### 5. `notifications.test.ts` - Notification Tests
Tests the automation task creation system.

**Coverage:**
- `createAutomationTask(params)`: Task creation with correct fields
- 7 notification types: veto_review, enrichment_review, kill_confirmation, advancement_suggestion, outreach_review, document_review, classification_review
- Title prefixing with "[AUTO]"
- Status, pipelineStep, dueAt handling
- Error propagation

**Key assertions:**
- Creates Task with correct orgId, dealId
- Titles prefixed with "[AUTO]"
- Status always set to "TODO"
- Description includes notification type
- Optional dueAt parameter handling
- Returns the created task

## Running Tests

### Run all automation tests:
```bash
cd apps/web
npm test -- lib/automation/__tests__
```

### Run a specific test file:
```bash
npm test -- lib/automation/__tests__/gates.test.ts
```

### Watch mode:
```bash
npm test -- --watch lib/automation/__tests__
```

## Test Philosophy

These tests follow the **TDD (Test-Driven Development)** approach:

1. **Tests written first** - Before any implementation
2. **Specifications as tests** - Tests encode the exact behavior requirements
3. **Red-Green-Refactor** - Tests fail initially, then pass once implemented

## Expected State

**Current:** All tests will FAIL because implementation modules don't exist yet.

**After Wave 0 implementation:** All tests should PASS, confirming:
- Configuration is correct and immutable
- Decision gates enforce proper human oversight
- Task filtering protects against inappropriate automation
- Event system supports loose coupling
- Notifications create proper human review tasks

## Implementation Checklist

To make these tests pass, create these 5 modules:

- [ ] `apps/web/lib/automation/config.ts` - Export AUTOMATION_CONFIG (frozen)
- [ ] `apps/web/lib/automation/gates.ts` - Export requiresHumanApproval, canAutoAdvance, getAdvancementCriteria
- [ ] `apps/web/lib/automation/taskAllowlist.ts` - Export isAgentExecutable, getHumanOnlyReason
- [ ] `apps/web/lib/automation/events.ts` - Export dispatchEvent, registerHandler, AutomationEvent type
- [ ] `apps/web/lib/automation/notifications.ts` - Export createAutomationTask, NotificationType type

## Test Statistics

- **Total test files:** 5
- **Total test suites:** 25+
- **Total test cases:** 150+
- **Code coverage target:** 100% (all functions, branches, lines)

## Notes

- Tests use Jest (not Vitest) because apps/web uses Jest configuration
- Prisma is mocked in notifications tests to avoid database dependencies
- Event tests verify fire-and-forget behavior (critical for automation safety)
- Gates tests are the most critical - they enforce the automation safety boundary
