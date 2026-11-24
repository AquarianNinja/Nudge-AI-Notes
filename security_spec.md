# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Identity & Ownership**: Every user-scoped root document `/users/{userId}` and subcollection document (`/users/{userId}/private/{docId}`, `/diaryEntries/{entryId}`, `/schedulerTasks/{taskId}`, `/coreDataDocuments/{docId}`, `/preferences/{prefId}`) is strictly owned by `request.auth.uid == userId` with `request.auth.token.email_verified == true`.
2. **Master Gate**: Single-document operations on every subcollection verify parent workspace existence and ownership (`get(/databases/$(database)/documents/users/$(userId)).data.uid == request.auth.uid`). List queries enforce `resource.data.ownerId == request.auth.uid` without `get()`/`exists()`.
3. **Strict Shape & Anti-Shadow Fields**: Every `create` requires exact keys (`hasAll` + `hasOnly`); every `update` validates the full incoming entity (`isValid[Entity](incoming())`) and partitions updates via `affectedKeys().hasOnly(...)` with immutable `id`, `ownerId`, and `createdAt`.
4. **Temporal & Volumetric Integrity**: `createdAt == request.time` on create; `updatedAt == request.time` on create and update. All strings have explicit `.size()` bounds and all arrays have `.size() <= MAX` plus first-element type validation.
5. **Terminal State Locking**: Once a `schedulerTasks` document transitions to `status == 'archived'`, no subsequent client updates are allowed.
6. **PII Isolation**: Email is stored exclusively in `/users/{userId}/private/profile`, never in `/users/{userId}`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Read/Write**: `auth = null` reading `/users/alice/diaryEntries/e1` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: `auth = { uid: 'alice', token: { email_verified: false } }` creating diary entry -> `PERMISSION_DENIED`.
3. **Cross-Tenant Spoofed Owner**: `auth.uid = 'bob'` creating `/users/bob/diaryEntries/e1` with `ownerId: 'alice'` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Creating `/users/alice/diaryEntries/e1` with extra field `isAdmin: true` -> `PERMISSION_DENIED` (`hasOnly` rejects).
5. **Client Timestamp Forgery**: Creating diary entry with `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time` -> `PERMISSION_DENIED`.
6. **Immutable Owner Tampering**: Updating diary entry to mutate `ownerId` or `createdAt` -> `PERMISSION_DENIED`.
7. **ID Poisoning Attack**: Creating document at `/users/alice/diaryEntries/` with 200-char or invalid-character ID `bad$id!` -> `PERMISSION_DENIED` (`isValidId` rejects).
8. **Payload Size / DoW Attack**: Creating diary entry with `content` length > 12000 chars or `tags.size() == 50` -> `PERMISSION_DENIED`.
9. **Array Element Type Poisoning**: Creating diary entry with `tags: [12345]` -> `PERMISSION_DENIED`.
10. **Orphaned Subcollection Write**: Creating `/users/alice/diaryEntries/e1` when parent `/users/alice` does not exist -> `PERMISSION_DENIED` (Master Gate rejects).
11. **Terminal State Mutation**: Updating a `schedulerTasks` doc whose `existing().status == 'archived'` -> `PERMISSION_DENIED`.
12. **PII Cross-User Read**: `auth.uid = 'bob'` calling `get` or `list` on `/users/alice/private/profile` -> `PERMISSION_DENIED`.
