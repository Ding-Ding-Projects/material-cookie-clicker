# Security policy

Report vulnerabilities privately through GitHub's security advisory interface. Do not include credentials, private repository data, or exploit payloads in a public issue.

Material Cookie Clicker is a self-contained cookie-clicker game. The renderer has no Node access and cannot provide executable paths, commands, or arguments; the preload bridge exposes only the fixed, validated game and window-control surface documented in this repository. Save data is local-only, stored in the application's own local data directory, and never uploaded anywhere. The game has no network dependency: it does not call out to a server, a leaderboard, or a remote configuration source.

Windows builds are intentionally unsigned under the project's permanent no-signing policy. Transport integrity and package hashes do not constitute a code signature.
