# Client Event Logging (Local RxDB)

Status: implemented (network-only, deduped)

## Purpose

Record client connectivity events to analyze offline incidents and repeated disconnections per device. Works on Web and App (Capacitor).

## Scope (v1)

- Event source: Capacitor Network.addListener('networkStatusChange')
- Stored fields: ONLINE/OFFLINE only (status + meta = same value)
- Dedupe: write only if latest stored status for the client differs

## Data Model

Collection: log_client

Fields:

- id: string (uuid)
- client_id: string (device unique id)
- type: 'KIOSK' | 'DOOR' (default KIOSK)
- status: string ('ONLINE' | 'OFFLINE')
- meta_data: string ('ONLINE' | 'OFFLINE')
- server_created_at: string | '' (placeholder)
- client_created_at: string (Date.now().toString())
- diff_time_create: number | '' (placeholder)

Indexes: client_created_at, client_id, status

Schema file: src/app/core/schema/log-client.schema.ts

## Architecture

- RxDB registration: src/app/core/Database/rxdb.service.ts (key log_client)
- Types: src/app/core/Database/RxDB.D.ts (RxLogClientCollection)
- Facade: src/app/core/Database/facade/log-client.service.ts
  - append(...)
  - getLastByClient(clientId)
  - getLogs$()
  - countOfflineEvents$(clientId?)
- Runtime: src/app/core/monitoring/client-event-logging.service.ts
  - On networkStatusChange:
    1. Resolve clientId (localStorage UUID placeholder)
    2. status = ONLINE/OFFLINE
    3. Fetch latest; if same status → skip; else insert (meta_data = status)
- Bootstrap: src/app/app.module.ts
  - APP_INITIALIZER awaits DB init, then starts logging service

## Device Identity

- Current: localStorage("kiosk_device_id") with UUID fallback
- Future: Capacitor Device ID or configured door/kiosk id

## Usage Examples

- Count offline events:

```ts
logClientFacade.countOfflineEvents$(clientId).subscribe((count) => {});
```

- Stream logs:

```ts
logClientFacade.getLogs$().subscribe((entries) => {});
```

## Testing

- Toggle offline/online:
  - First change after load inserts
  - Same status again is skipped
- Reload with unchanged network: no duplicate

## Future

- Server sync; compute server_created_at, diff_time_create
- Optional lifecycle events (opened/closed)
- Analytics (durations, MTBF) per client
