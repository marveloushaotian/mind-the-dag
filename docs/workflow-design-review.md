# Workflow design review

This review covers registration, group creation, group membership, map management,
sharing, export and keyboard navigation. The changes are a heuristic review and
implementation, not evidence from a user study. All product copy stays in English.

## Decisions and implementation

| Task | Observed problem | Resulting behavior | Design basis |
| --- | --- | --- | --- |
| Create a lab group | Creation ended inside a large members/settings form; the next step was easy to miss. | A visible New group control opens a short form. Creation opens Invite members directly. | Recognition rather than recall; task continuity. |
| Invite colleagues | The invitation form was hidden in Members & settings, beside owner administration. | Invite members is beside the group title. Invite, Members and owner-only Settings have separate views. The form explains account email, access and in-app acceptance before submission. | Notion's explicit membership tasks; progressive disclosure. |
| Accept an invitation | The entry existed only while invitations had already loaded. A newly invited person might not know where to look. | Group invitations is always present, with an empty state, count, refresh action and refresh on returning to the app. Acceptance opens the joined group. | Visibility of system status; recognition. |
| Invite new users | Site registration links and group membership were both described as invitations. Quotas offered only 1 or 20. Creation immediately left another create form visible. | The admin entry is Invite to mind-the-dag. Choose any quota from 1 to 20. Creation ends at a selectable link and receipt with quota, exact expiry/time zone, group outcome and next steps. Create another link is explicit. | Resource/access scope in Figma and Google Drive; GOV.UK completion patterns. |
| Withdraw a registration link | Removal was immediate, without describing its effect on registered users. | Confirm the named link. Explain that future registrations stop while existing accounts and group access remain. | Error prevention and clear consequences. |
| Share a map | A static view-only link and group collaboration were presented together without a clear task choice. | Choose Send a snapshot or Collaborate with a group. Snapshots state that later edits do not update them. Existing group maps expose a member-only link to the shared map. Creating a group copy ends at Open the group copy. | Explicit resource and access levels in Figma and Drive. |
| Recover from sharing errors | Group-loading failures could render nothing; snapshot preparation could remain at Preparing; blocked clipboard writes had no explanation. | Show the failure and a retry. Keep a selectable link and explain manual copying if clipboard access fails. | Nielsen error recovery and system status. |
| Copy a library map | Copy to My maps could report success after a failed request. | Show success only after the copy succeeds. Preserve loaded workspace data during refresh failure. | Accurate feedback; error recovery. |
| Export a figure | Users had to select a file extension before learning its purpose; changing format required closing the dialog. | Formats include purpose hints. The dialog allows switching PDF/SVG/PNG in place, with format-specific settings and an editable-map-file explanation. Export uses the shared modal behavior. | Figma and Miro's format-specific export guidance; progressive disclosure. |
| Find custom colours | A line’s colour editor was behind an unexplained ellipsis; collapsed colour/fill controls hid their current values. | The line list explains the edit action. Custom colour and Custom fill show the current swatch and hex value, with picker/hex guidance on expansion. | Recognition rather than recall. |
| Use dialogs by keyboard | Focus could escape to the background; Escape could affect more than one nested dialog. | Tab/Shift+Tab stay in the active dialog. Escape affects the top dialog only. Closing restores the prior connected focus target. A pending mutation prevents dismissal and repeated actions. | W3C APG modal dialog pattern. |

Group membership and registration permissions are unchanged. Ordinary group
members invite existing account holders; only the site admin creates registration
links. Group membership permits editing all maps in that group. Personal maps
remain private. A snapshot is a separate, immutable copy encoded in its URL.

The editor already provides contextual placement/connection hints, previews,
undo/redo, auto-save state and conflict resolution. Those interactions retain their
existing behavior; this review does not add another onboarding overlay or change
saved map geometry.

## Primary references

- [Nielsen Norman Group: 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): recognizable actions, accurate status, prevention and recovery.
- [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/): keep common tasks visible and disclose administration separately.
- [Notion: Manage members and guests](https://www.notion.com/help/add-members-admins-guests-and-groups): explicit member invitation, resource scope and acceptance steps. Our service uses in-app invitations rather than Notion's email delivery.
- [Figma: Guide to sharing and permissions](https://help.figma.com/hc/en-us/articles/1500007609322-Guide-to-sharing-and-permissions): distinguish sharing a resource from inviting a person and identify the level of access.
- [Google Drive: Share and manage access](https://support.google.com/drive/answer/7166529?hl=en): make restricted membership and anyone-with-link access explicit.
- [Figma: Export formats and settings](https://help.figma.com/hc/en-us/articles/13402894554519-Export-formats-and-settings-for-static-designs): explain output formats in context. Our SVG/PDF implementation retains its own font/text behavior.
- [Miro: How to export your board](https://help.miro.com/hc/en-us/articles/360017572754-How-to-export-your-board): relate image and PDF export to downstream use.
- [GOV.UK: Confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/): confirm completion and explain what happens next. The invitation receipt stays in the dialog rather than adding a separate page.
- [W3C WAI: Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): focus containment, initial focus, Escape and focus return.

## Validation

Interactive component checks cover success, pending requests, failed invitations,
quota validation, withdrawal cancellation, member/owner controls, sharing retries,
clipboard failure and nested-dialog keyboard behavior. Existing workspace e2e
selectors and leave-group confirmation steps are updated for the revised flow.

Browser inspection uses the local frontend and existing authenticated Chrome
session. No invitations were sent, registration links created/withdrawn, or maps edited
during browser checks. Real mutations and failure states are tested
with isolated component fixtures. A later usability session with new lab users is
still needed to measure discoverability and completion time.

The local validation run passes 340 tests in 27 files, TypeScript checking and
the production build. Chrome inspection confirmed the main group and sharing
flows, invitation receipts and keyboard containment. A 390 × 844 responsive
inspection identified wrapped sharing labels; their buttons now grow vertically.
The full workspace e2e suite was updated but was not executed locally.
