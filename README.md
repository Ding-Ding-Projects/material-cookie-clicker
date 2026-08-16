# Oak Kay

A Material Design 3 cookie clicker for Windows, built with Electron.

> [!NOTE]
> This project is in early construction. Nothing has been released yet: there is
> no published release, no verified installer, and no packaged runtime. Do not
> treat any capability described here as working until a release exists with
> attached, downloadable assets.

## Contents

- [What it is](#what-it-is)
- [Install](#install)
- [Build it yourself](#build-it-yourself)
- [Documentation](#documentation)

## What it is

An incremental game: click a cookie, buy generators that bake cookies for you,
spend upgrades to multiply the rate, unlock achievements, and ascend to trade
progress for a permanent multiplier.

It is a full desktop application rather than a page — bilingual English and
Hong Kong Cantonese with independent humour levels per language, Material
Design 3 throughout, keyboard and screen-reader operable, and it works with the
network unplugged.

**Nobody ever pays a penny to use it.** No purchase, no licence, no
subscription, no feature held behind an unlock.

## Install

No release exists yet. A download button will appear here, and on the
documentation site, once a verified installer has actually been published.

Windows installers from this project are **unsigned** and will trigger the
operating system's unknown-publisher warning. That is expected, and is stated
plainly rather than worked around.

## Build it yourself

| Script | What it does |
| --- | --- |
| `download-dependencies.bat` | Obtains every dependency needed to build and run, into a user-scoped location |
| `build.bat` | Builds the runnable application, then offers to launch it |
| `build-installer.bat` | Produces the same unsigned installer the release pipeline publishes |

All three accept `/s`, `--silent`, and a `SILENT=1` environment variable for a
non-interactive run that exits non-zero on the first real failure.

## Documentation

Categorized feature documentation lives under `docs/`, and the documentation
site is published from `site/`.

## License

Apache-2.0.
