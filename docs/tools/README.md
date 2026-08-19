# Tools and application capabilities

These articles cover application capabilities that may also appear as discoverable in-game tools.
Discovery may grant a gameplay bonus, but it never substitutes for a usable application surface.
Current implementation and evidence live in the [per-surface inventory](../completeness.md).

- [Tools tech tree](tools-tech-tree.md)
- [Command palette](command-palette.md)
- [Regex builder](regex-builder.md)
- [Authenticator and toy locks](authenticator.md)
- [File converter](file-converter.md)
- [Local model manager](local-model-manager.md)
- [Appearance editor](appearance-editor.md)
- [Notification centre](notification-centre.md)
- [Local history](local-history.md)
- [Scheduled settings](scheduled-settings.md)
- [Narrator](narrator.md)
- [Exports](exports.md)
- [Bulk actions](bulk-actions.md)
- [School mode](school-mode.md)
- [Personal vocabulary](personal-vocabulary.md)
- [App-logo customization](app-logo-customization.md)
- [Unlock ladder](unlock-ladder.md)
- [Support Tickets](support-tickets.md)
- [External editor](external-editor.md)
- [Status Hub](status-hub.md)
- [Browser-extension download dialogs](download-dialogs.md)

## Failure and security boundary

An article is a behavior contract, not proof that the feature ships. Missing UI, persistence,
packaged proof, built interaction, or capture evidence remains explicit in the completeness matrix.
Secrets stay out of source, logs, captures, exports, and public records.

## Verification

Run `npm run test -- tests/completeness-inventory.test.ts` to validate article destinations and the
hand-written evidence fields. Feature-specific verification remains in each article.

## Suggested articles

- [Settings surface](../interface/settings-surface.md)
- [Exports and privacy](../data/exports-and-privacy.md)
