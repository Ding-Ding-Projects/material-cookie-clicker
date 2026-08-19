# External editor integration

## Behavior

The application detects installed editors, lets the user choose/add one, opens current files or
folders, and provides a direct Visual Studio Code action for every export.

## Configuration

The selected editor persists. VS Code detection covers PATH, user/machine installs, Insiders, and
portable builds; folders open as workspace roots.

## Failure modes

No desktop main/renderer integration exists at v0.2.55. The site cannot substitute a local desktop
process bridge.

## Security and privacy

Executable and argument choices are allowlisted and validated; no arbitrary shell text is accepted.

## Verification

Require detection, missing-editor recovery, file/folder launch, workspace-root behavior, and exact
path handling from a packaged build.

## Suggested articles

- [Exports](exports.md)
- [File converter](file-converter.md)
