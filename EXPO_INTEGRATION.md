# EXPO_INTEGRATION.md - Mobile Integration Guide

> Contract document for Expo mobile app integration with the Goberna backend.

## Location Tracking

The mobile app uses `expo-location` for GPS tracking of field agents.

### Configuration
```json
{
  "EXPO_PUBLIC_BACKEND_API_URL": "http://161.132.39.165/api",
  "EXPO_PUBLIC_AGENT_INGEST_TOKEN": "<token>"
}
```

### Endpoint
```
POST /api/agents/location
Header: x-agent-token: <AGENT_INGEST_TOKEN>
Body: { agent_id, ts, lat, lng, seq, accuracy?, speed?, heading?, battery?, campaign_id? }
```

### Offline Queue
- Store locations in SQLite when offline
- Sync batch when connectivity is restored
- Deduplicate by `(agent_id, seq)` server-side

See `apps/mobile/lib/tracking/` for implementation details.
See `docs/backend-integration-guide.md` for the complete backend API reference.
