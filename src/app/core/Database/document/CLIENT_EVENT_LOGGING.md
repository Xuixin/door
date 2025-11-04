# Client Event Logging (Device Monitoring History)

Status: ✅ Implemented (network-only, deduped)

## Purpose

Record client connectivity events to analyze offline incidents and repeated disconnections per device. Works on Web and Mobile (Capacitor).

## Scope (v1)

- Event source: `NetworkStatusService.isOnline$` (reactive Observable)
- Stored fields: ONLINE/OFFLINE status with metadata
- Dedupe: write only if latest stored status for the client differs
- Platform support: Web (navigator.onLine) and Mobile (Capacitor Network plugin)

## Data Model

Collection: `device_monitoring_history`

Fields:

- `id`: string (uuid)
- `device_id`: string (device unique id, from ClientIdentityService)
- `type`: string ('KIOSK' | 'DOOR')
- `status`: string ('ONLINE' | 'OFFLINE')
- `meta_data`: string (event description, e.g., 'NETWORK_EVENT: {clientId} => {status}')
- `created_by`: string (device unique id, from ClientIdentityService.getClientId())
- `server_created_at`: string | '' (server timestamp)
- `client_created_at`: string (Date.now().toString())
- `client_updated_at`: string (Date.now().toString())
- `cloud_created_at`: string | ''
- `cloud_updated_at`: string | ''
- `server_updated_at`: string | ''
- `diff_time_create`: string
- `diff_time_update`: string

Indexes: `client_created_at`, `created_by`, `status`, `type`

Note: `deleted` field is handled by RxDB's `_deleted` flag

## Architecture

- Collection: `src/app/core/Database/collections/device-monitoring-history/`
  - Schema: `schema.ts`
  - Types: `types.ts`
  - Facade: `facade.service.ts`
    - `append(...)`
    - `getLastByCreatedBy(createdBy)`
    - `getHistory$()`
    - `countOfflineEvents$(createdBy?)`
    - `getHistoryByCreatedBy(createdBy)`
    - `getHistoryByType(type)`
  - Replication: `replication.service.ts` (GraphQL replication)
- Runtime: `src/app/core/monitoring/client-event-logging.service.ts`
  - Subscribes to `NetworkStatusService.isOnline$`
  - On network status change:
    1. Resolve `createdBy` from `ClientIdentityService.getClientId()`
    2. Check if status changed (skip duplicates)
    3. Insert new history entry with `device_id` and `created_by`
- Bootstrap: `src/app/app.module.ts`
  - `APP_INITIALIZER` awaits DB init, then starts logging service

## Device Identity

- Current: `ClientIdentityService.getClientId()` returns device unique ID
- Type: `ClientIdentityService.getClientType()` returns 'KIOSK' or 'DOOR'

## Usage Examples

- Count offline events:

```ts
historyFacade.countOfflineEvents$(createdBy).subscribe((count) => {
  console.log(`Offline events: ${count}`);
});
```

- Stream all history:

```ts
historyFacade.getHistory$().subscribe((entries) => {
  console.log("History entries:", entries);
});
```

- Get history by creator:

```ts
const history = await historyFacade.getHistoryByCreatedBy(createdBy);
```

- Get history by type:

```ts
const doorHistory = await historyFacade.getHistoryByType("DOOR");
```

## Testing

- Toggle offline/online:
  - First change after load inserts
  - Same status again is skipped
- Reload with unchanged network: no duplicate
- Network status changes are automatically tracked

## Platform Support

- **Web**: Uses browser `navigator.onLine` and `online/offline` events
- **Mobile (iOS/Android)**: Uses Capacitor Network plugin
- Both handled automatically by `NetworkStatusService`

## Future Enhancements

- Server sync (already implemented via GraphQL replication)
- Optional lifecycle events (app opened/closed)
- Analytics (durations, MTBF) per device
- Filter by date range
- Export history for debugging
