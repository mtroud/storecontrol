# Security Specification — Sayed Mart IT Asset & Inventory System

## 1. Data Invariants
1. **Default-Deny Baseline**: Any unauthenticated or unverified request (`email_verified != true`) has zero read or write access to any operational collection.
2. **No Public Self-Registration of Privileges**: Only the bootstrapped `SYSTEM_ADMIN` (`control.mogma@gmail.com`) or an active `SYSTEM_ADMIN` in `/users/{uid}` may create or modify user roles and `isActive` flags. Regular users cannot elevate their own role.
3. **PII Isolation**: User records in `/users/{uid}` contain emails and identity attributes. `get` is restricted to the record owner (`uid == request.auth.uid`) or `SYSTEM_ADMIN`. `list` is restricted to `SYSTEM_ADMIN` (or `resource.data.uid == request.auth.uid`).
4. **Immutable Historical Logs**: `/stockMovements/{movementId}` and `/auditLogs/{logId}` are strictly append-only. No client (not even staff) may `update` or `delete` historical movements or audit entries.
5. **Protected Stock Balances**: Direct arbitrary overwrites to `/stockBalances/{itemId}` from non-managers are denied; updates require `WAREHOUSE_STAFF` or higher and strict non-negative integer/number checks.
6. **ID & Payload Bounds**: Every single-document operation validates `isValidId()` (`^[a-zA-Z0-9_\-]+$`, `size() <= 128`), strict `hasAll` / `hasOnly` key checks, string length bounds, and server timestamp integrity (`request.time`).

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Device Read**: Anonymous user attempts `get(/devices/dev1)` -> DENIED.
2. **Unverified Email Spoof**: User with `email: "control.mogma@gmail.com"` and `email_verified: false` attempts `get(/users/admin)` -> DENIED.
3. **Self-Privilege Escalation on Create**: Authenticated viewer attempts to create `/users/{ownUid}` with `role: "SYSTEM_ADMIN"` -> DENIED.
4. **Role Escalation on Update**: Active `WAREHOUSE_STAFF` attempts to update own `/users/{uid}` changing `role` to `"SYSTEM_ADMIN"` -> DENIED.
5. **Shadow Ghost Field Injection**: Staff attempts to create `/devices/dev1` with extra ghost field `bypassAudit: true` -> DENIED (`hasOnly` rejects).
6. **Oversized ID Poisoning**: Attacker attempts to create `/devices/<200-char-invalid-id!@#>` -> DENIED (`isValidId` rejects).
7. **Historical Movement Tampering**: `WAREHOUSE_MANAGER` attempts `update` or `delete` on `/stockMovements/mov1` -> DENIED.
8. **Audit Log Deletion**: Any user attempts `delete(/auditLogs/log1)` -> DENIED.
9. **Viewer Write Attempt**: User with role `VIEWER` attempts `create(/devices/dev2)` or `update(/devices/dev2)` -> DENIED.
10. **Non-Owner PII Read**: `WAREHOUSE_STAFF` attempts `get(/users/otherUid)` -> DENIED.
11. **Negative Stock Balance Write**: Staff attempts to write `/stockBalances/item1` with `currentQuantity: -5` -> DENIED.
12. **Client Timestamp Forgery**: Staff attempts to create `/auditLogs/log2` with forged `createdAt` not matching `request.time` -> DENIED.
