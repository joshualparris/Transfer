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
