# TrustVault Threat Model

## 1. System overview

TrustVault is a secure document-sharing application. Users upload PDF documents, grant permissions to authorized recipients, revoke permissions, and review audit history.

## 2. Assets to protect

- Confidential PDF documents
- User credentials and authentication tokens
- Document ownership and recipient permissions
- Audit records
- Document integrity hashes
- Database credentials and environment secrets

## 3. Threats and mitigations

| ID | Threat | Expected protection | Test evidence |
|---|---|---|---|
| T01 | Unauthenticated user accesses a protected API | Authentication middleware rejects the request | Record test and result |
| T02 | User changes a document ID to access another user's PDF | Backend verifies ownership or recipient permission | Record test and result |
| T03 | Unauthorized user downloads a document | Download endpoint performs its own authorization check | Record test and result |
| T04 | Former recipient accesses a document after revocation | Subsequent requests are denied after permission removal | Record test and result |
| T05 | Recipient grants access to other users without ownership | Only the document owner can grant or revoke permissions | Record test and result |
| T06 | Unauthorized user reads another user's audit history | Audit endpoints enforce document ownership or the appropriate authorized role | Record test and result |
| T07 | User alters or deletes audit records through the application | No ordinary user-facing endpoint permits unauthorized audit-log modification | Record test and result |
| T08 | PDF contents are changed after upload | Integrity verification detects a mismatch against the stored trusted hash | Record test and result |
| T09 | Malicious upload or oversized file | Server validates the upload and enforces file-size limits | Record test and result |
| T10 | SQL injection through IDs or form fields | Parameterized database queries and input validation are used | Record test and result |

## 4. Testing approach

Run tests against a local or otherwise authorized test deployment using separate owner, recipient, and unauthorized-user accounts.

For every test, record:
- Preconditions
- Request or action performed
- Expected result
- Actual result
- Pass or fail
- Relevant test file or commit

## 5. Limitations

List any threats that are not yet mitigated, tested, or independently verified. Do not describe an untested control as secure.
