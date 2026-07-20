# Google API capability matrix

Verified against official Google documentation on 20 July 2026. This is a design constraint, not a promise that a Workspace administrator permits every scope.

| Area | Capability | Status | Constraint |
|---|---|---|---|
| Gmail | Read labels/profile/messages and raw MIME | Supported | Restricted/read-only scope; admin policy may block consent. |
| Gmail | Import a raw message without sending it | Supported with limitations | `messages.import` performs normal import scanning/classification; system label preservation varies. |
| Gmail | Set internal date during import | Supported with limitations | A valid Date header can determine the internal date; otherwise receipt time may be used. |
| Gmail | Forwarding | Administrator-dependent | Address verification and Workspace admin settings can block completion. |
| Drive | Enumerate and download accessible files | Supported | Shared drives need explicit corpus handling; inaccessible items remain reportable only. |
| Drive | Export Google-native files | Supported with limitations | `files.export` has a 10 MB exported-content limit; mappings vary by editor type. |
| Drive | Back up to local/NAS with rclone | Supported with limitations | `rclone copy` is resumable and non-destructive; downloaded verification is strong for ordinary files, while converted native files require explicit limitation reporting. |
| Drive | Transfer Workspace ownership to consumer Gmail | Not supported | Export/re-upload loses revisions, comments, permissions and some native features. |
| People | Read normal contacts/groups | Supported | Source uses read-only scopes. |
| People | Read “Other contacts” | Supported with limitations | Fewer fields; first full-sync page has fixed quota; sync tokens expire after seven days. |
| People | Recreate contacts/groups | Supported with limitations | Writes should be sequential per user; some groups are system-managed. |
| Calendar | List calendars/events | Supported | Admin policy may restrict scopes. |
| Calendar | Import private event copies | Supported with limitations | Only `default` event type imports faithfully; `iCalUID` is required. |
| YouTube | Playlists, playlist items, subscriptions | Supported with limitations | Daily quota, privacy restrictions and Brand Account identity apply. |
| YouTube | Watch history/purchases/full channel transfer | Not supported | Inventory/manual continuity only. |
| Photos | Reproduce an existing library through API | Takeout-only | Takeout is the source of truth; no undocumented endpoint. |
| Keep | Consumer/ordinary Workspace direct migration | Takeout-only | Takeout JSON/HTML is the reliable baseline. |
| Google Play | Transfer purchases between accounts | Not supported | Preserve evidence and verify renamed Workspace identity continuity. |

Primary references: [Gmail messages import](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/import), [Drive export](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export), [People other contacts](https://developers.google.com/people/api/rest/v1/otherContacts/list), [Calendar events import](https://developers.google.com/workspace/calendar/api/v3/reference/events/import), [YouTube quota](https://developers.google.com/youtube/v3/determine_quota_cost), [Google Photos API changes](https://developers.google.com/photos/support/updates).

## Gmail Phase 3 decisions (verified 20 July 2026)

| Capability | Classification | Decision / limitation |
|---|---|---|
| `messages.list` and `messages.get(format=raw)` | Supported | Source uses `gmail.readonly`; Gmail query syntax determines scope. |
| `messages.insert` | Supported with limitations | Default. IMAP-append-like insertion bypasses most scanning, preserves MIME and never sends. Thread/system-label behavior is verified. |
| `messages.import` | Supported with limitations | Advanced alternative with `processForCalendar=false` and `neverMarkSpam=true`; delivery-style scanning can change classification. |
| `internalDateSource=dateHeader` | Manual verification required | A valid Date header drives the date; destination headers/internal date are compared. |
| User/system labels | Supported with limitations | User/state labels map below `Cornerstone Import/`; supported state labels map directly. Reserved system labels are not recreated. |
| Draft creation | Supported with limitations | `drafts.create` needs `gmail.compose`; drafts are verified to remain drafts. Sending methods are prohibited. |
| HTTP batch | Supported with limitations | Maximum 100 calls and Google recommends no more than 50. Lifeboat uses bounded concurrency because each message has ordered download/insert/verify stages. |
| Quotas/backoff | Supported with limitations | Current limits: 1,200,000 units/min/project and 6,000 units/min/user/project. Get costs 20; insert/import cost 25. Transient errors use capped exponential backoff with jitter. |
| `history.list` | Supported with limitations | History IDs can expire, requiring full inventory; it is not the primary Phase 3 manifest. |
| Vacation responder | Supported | Separate `gmail.settings.basic` consent and confirmed source write. |
| Forwarding | Administrator-dependent | Audit is supported. `forwardingAddresses.create` requires `gmail.settings.sharing` and domain-wide-delegated service-account authority, which Lifeboat deliberately does not request. |

References: [Gmail REST](https://developers.google.com/workspace/gmail/api/reference/rest), [quotas](https://developers.google.com/workspace/gmail/api/reference/quota), [batch requests](https://developers.google.com/workspace/gmail/api/guides/batch), [forwarding](https://developers.google.com/workspace/gmail/api/guides/forwarding_settings).
