<!-- 02969840-330c-4de9-aef5-2c85bc65c622 baefe744-1dcb-430a-8ecc-2d690711e4ae -->
# Refactor Replication Start/Stop to Single Entry Points

## Problem

Multiple entry points for starting/stopping replications cause duplicate calls:

- Server down -> stop, then client offline -> stop again
- Initialize -> start, then handleOnline -> start again
- Multiple methods: startPrimary, startSecondary, switchToPrimary, switchToSecondary, stopAllReplicationsGracefully
- ServerHealthService dependency in replication is redundant since WebSocket disconnect is handled in replication-helper.ts

## Solution

Create single entry points with centralized state checking:

- `startReplication(serverType?: 'primary' | 'secondary')` - checks if already started
- `stopReplication()` - checks if already stopped
- Remove ServerHealthService dependency from replication helper/manager

## Implementation Steps

### 1. ReplicationManagerService - Add State Tracking

- Add private state: `_isStarted: boolean = false`, `_currentServerType: 'primary' | 'secondary' | null = null`
- Add getter methods: `isStarted()`, `getCurrentServerType()`

### 2. ReplicationManagerService - Create Single Entry Points

- Create `async startReplication(serverType?: 'primary' | 'secondary'): Promise<void>`
- Check `_isStarted` - if true and same serverType, return early
- If different serverType, stop current first, then start new
- Set `_isStarted = true`, `_currentServerType = serverType`
- Call internal `_startReplicationsByIdentifiers()`

- Refactor existing `stopReplication()` to check state
- Check `_isStarted` - if false, return early
- Set `_isStarted = false`, `_currentServerType = null`
- Keep existing stop logic

### 3. ReplicationManagerService - Refactor Internal Methods

- Keep `_startReplicationsByIdentifiers()` as private helper
- Keep `cancelSingleReplication()` as private helper
- Remove public methods: `startPrimary()`, `startSecondary()`, `switchToPrimary()`, `switchToSecondary()`, `stopAllReplicationsGracefully()`
- Keep `initializeReplications()` but remove auto-start logic (will call startReplication separately)

### 4. ReplicationManagerService - Remove ServerHealthService Dependency

- Remove `ServerHealthService` import
- Remove `injector` property (if only used for ServerHealthService)
- Remove lazy injection of ServerHealthService in `initializeReplications()`
- Remove passing `serverHealthService` to `setupCollectionReplication()`

### 5. ReplicationHelper - Replace ServerHealthService with Coordinator

- Remove `ServerHealthService` import
- Add `ReplicationCoordinatorService` import (or use injector for lazy injection)
- Replace `serverHealthService?: ServerHealthService` parameter with `replicationCoordinator?: ReplicationCoordinatorService` parameter
- Update WebSocket closed event handler (lines 100-107):
- Check if `event.code === 1006` (abnormal closure)
- Determine server type from `config.replicationIdentifier` using `isPrimaryIdentifier()` or `isSecondaryIdentifier()`
- If primary: call `replicationCoordinator?.handlePrimaryServerDown()`
- If secondary: call `replicationCoordinator?.handleSecondaryServerDown()`
- Use queueMicrotask to prevent blocking
- Keep other WebSocket event handlers (error, ping)

### 6. DatabaseService - Update Delegation Methods

- Update `switchToPrimary()`: call `replicationManager.startReplication('primary')`
- Update `switchToSecondary()`: call `replicationManager.startReplication('secondary')`
- Keep `stopReplication()`: call `replicationManager.stopReplication()`

### 7. ReplicationCoordinatorService - Refactor All Calls

- `handleNetworkOffline()`: call `databaseService.stopReplication()`
- `handleNetworkOnline()`: check servers, call `databaseService.startReplication('primary'|'secondary')`
- `handlePrimaryServerDown()`: call `databaseService.startReplication('secondary')` or `stopReplication()`
- `handleSecondaryServerDown()`: call `databaseService.startReplication('primary')` or `stopReplication()`
- `handleBothServersDown()`: call `databaseService.stopReplication()`
- `handlePrimaryRecovery()`: call `databaseService.startReplication('primary')`
- `handleManualStart()`: check servers, call `databaseService.startReplication('primary'|'secondary')`
- Remove `stopAllReplicationsGracefully()` method

### 8. ReplicationManagerService - Update initializeReplications

- Remove auto-start logic from `initializeReplications()`
- After initialization, caller should explicitly call `startReplication()` if needed
- Update `_doInitialize()` in DatabaseService to call `startReplication()` after initialization

## Files to Modify

- `src/app/core/Database/replication/services/replication-manager.service.ts` - main refactor + remove ServerHealthService
- `src/app/core/Database/replication/services/replication-helper.ts` - remove ServerHealthService parameter and WebSocket disconnect handler
- `src/app/core/Database/services/database.service.ts` - update delegation methods
- `src/app/core/Database/services/replication-coordinator.service.ts` - refactor all event handlers

## Notes

- ServerHealthService remains in app.component.ts, home.page.ts, status.component.ts for monitoring purposes - these are not changed
- WebSocket disconnect handling is now only in replication-helper.ts WebSocket closed event handler (without calling ServerHealthService)