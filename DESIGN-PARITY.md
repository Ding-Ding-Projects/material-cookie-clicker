# Design parity evidence

> [!WARNING]
> These images are historical and pending. They are not accepted evidence until a fresh task-owned run produces complete build, runtime, interaction, privacy, inspection, cleanup, staging, and validation receipts.

Two files govern this evidence, and they answer different questions:

- **[`design/parity/inventory.json`](design/parity/inventory.json)** is the hand-written row and tuple contract - every screen/state/theme/viewport/scale combination this project promises to keep in parity, each row's reference file and route, its Material Design 3 audit, and its `captureProvenance` status. Every consumer of the row set (the guard, the capture scripts, the diff tooling) reads this file first.
- **[`design/parity/evidence/promotion-inventory.json`](design/parity/evidence/promotion-inventory.json)** is the machine-readable active/pending state for each row's two raw captures (`reference` and `product`). A record here only ever flips to `active: true` once a fresh task-owned run produces the complete run ledger (owner marker, build binding for both sides, live runtime proof, reviewed privacy proof, interaction proof, and an owned cleanup proof) that [`scripts/promotion-receipt-contract.mjs`](scripts/promotion-receipt-contract.mjs) requires. Right now every one of its 32 records is `active: false` / `status: "pending"` with every provenance field left `null` - deliberately, because no fresh run has produced that ledger yet.

The images below are the historical raw captures and their diffs that exist on disk today, from an earlier `cheap-lowlevel-headless` capture at commit `6f878d9fc1dc6246a7a078ce33aa9b12531fe775`. They are shown for visual reference only. Because that earlier run never produced the full run-ledger provenance the contract above requires, `promotion-inventory.json` correctly keeps every record pending - the pictures existing is not the same as the pictures being accepted evidence.

<details><summary>achievement-badge--gallery</summary>

![achievement-badge--gallery reference parity at 1280 by 800](design/parity/evidence/achievement-badge--gallery/reference.png)

![achievement-badge--gallery built product parity at 1280 by 800](design/parity/evidence/achievement-badge--gallery/product.png)

![achievement-badge--gallery labelled side-by-side comparison](design/parity/evidence/achievement-badge--gallery/comparison.png)

![achievement-badge--gallery visual diff highlighting the delta](design/parity/evidence/achievement-badge--gallery/diff.png)

</details>

<details><summary>building-row--gallery</summary>

![building-row--gallery reference parity at 1280 by 800](design/parity/evidence/building-row--gallery/reference.png)

![building-row--gallery built product parity at 1280 by 800](design/parity/evidence/building-row--gallery/product.png)

![building-row--gallery labelled side-by-side comparison](design/parity/evidence/building-row--gallery/comparison.png)

![building-row--gallery visual diff highlighting the delta](design/parity/evidence/building-row--gallery/diff.png)

</details>

<details><summary>bulk-toolbar--progress</summary>

![bulk-toolbar--progress reference parity at 1280 by 800](design/parity/evidence/bulk-toolbar--progress/reference.png)

![bulk-toolbar--progress built product parity at 1280 by 800](design/parity/evidence/bulk-toolbar--progress/product.png)

![bulk-toolbar--progress labelled side-by-side comparison](design/parity/evidence/bulk-toolbar--progress/comparison.png)

![bulk-toolbar--progress visual diff highlighting the delta](design/parity/evidence/bulk-toolbar--progress/diff.png)

</details>

<details><summary>cookie-surface--gallery</summary>

![cookie-surface--gallery reference parity at 1280 by 800](design/parity/evidence/cookie-surface--gallery/reference.png)

![cookie-surface--gallery built product parity at 1280 by 800](design/parity/evidence/cookie-surface--gallery/product.png)

![cookie-surface--gallery labelled side-by-side comparison](design/parity/evidence/cookie-surface--gallery/comparison.png)

![cookie-surface--gallery visual diff highlighting the delta](design/parity/evidence/cookie-surface--gallery/diff.png)

</details>

<details><summary>game-layout--main</summary>

![game-layout--main reference parity at 1280 by 800](design/parity/evidence/game-layout--main/reference.png)

![game-layout--main built product parity at 1280 by 800](design/parity/evidence/game-layout--main/product.png)

![game-layout--main labelled side-by-side comparison](design/parity/evidence/game-layout--main/comparison.png)

![game-layout--main visual diff highlighting the delta](design/parity/evidence/game-layout--main/diff.png)

</details>

<details><summary>narrator-toast--gallery</summary>

![narrator-toast--gallery reference parity at 1280 by 800](design/parity/evidence/narrator-toast--gallery/reference.png)

![narrator-toast--gallery built product parity at 1280 by 800](design/parity/evidence/narrator-toast--gallery/product.png)

![narrator-toast--gallery labelled side-by-side comparison](design/parity/evidence/narrator-toast--gallery/comparison.png)

![narrator-toast--gallery visual diff highlighting the delta](design/parity/evidence/narrator-toast--gallery/diff.png)

</details>

<details><summary>prestige-gate--ready</summary>

![prestige-gate--ready reference parity at 1280 by 800](design/parity/evidence/prestige-gate--ready/reference.png)

![prestige-gate--ready built product parity at 1280 by 800](design/parity/evidence/prestige-gate--ready/product.png)

![prestige-gate--ready labelled side-by-side comparison](design/parity/evidence/prestige-gate--ready/comparison.png)

![prestige-gate--ready visual diff highlighting the delta](design/parity/evidence/prestige-gate--ready/diff.png)

</details>

<details><summary>search-regex-builder--open</summary>

![search-regex-builder--open reference parity at 1280 by 800](design/parity/evidence/search-regex-builder--open/reference.png)

![search-regex-builder--open built product parity at 1280 by 800](design/parity/evidence/search-regex-builder--open/product.png)

![search-regex-builder--open labelled side-by-side comparison](design/parity/evidence/search-regex-builder--open/comparison.png)

![search-regex-builder--open visual diff highlighting the delta](design/parity/evidence/search-regex-builder--open/diff.png)

</details>

<details><summary>settings-funny-sliders--default</summary>

![settings-funny-sliders--default reference parity at 1280 by 800](design/parity/evidence/settings-funny-sliders--default/reference.png)

![settings-funny-sliders--default built product parity at 1280 by 800](design/parity/evidence/settings-funny-sliders--default/product.png)

![settings-funny-sliders--default labelled side-by-side comparison](design/parity/evidence/settings-funny-sliders--default/comparison.png)

![settings-funny-sliders--default visual diff highlighting the delta](design/parity/evidence/settings-funny-sliders--default/diff.png)

</details>

<details><summary>stat-tile--gallery</summary>

![stat-tile--gallery reference parity at 1280 by 800](design/parity/evidence/stat-tile--gallery/reference.png)

![stat-tile--gallery built product parity at 1280 by 800](design/parity/evidence/stat-tile--gallery/product.png)

![stat-tile--gallery labelled side-by-side comparison](design/parity/evidence/stat-tile--gallery/comparison.png)

![stat-tile--gallery visual diff highlighting the delta](design/parity/evidence/stat-tile--gallery/diff.png)

</details>

<details><summary>tokens-color--roles</summary>

![tokens-color--roles reference parity at 1280 by 800](design/parity/evidence/tokens-color--roles/reference.png)

![tokens-color--roles built product parity at 1280 by 800](design/parity/evidence/tokens-color--roles/product.png)

![tokens-color--roles labelled side-by-side comparison](design/parity/evidence/tokens-color--roles/comparison.png)

![tokens-color--roles visual diff highlighting the delta](design/parity/evidence/tokens-color--roles/diff.png)

</details>

<details><summary>tokens-shape-elevation--scale</summary>

![tokens-shape-elevation--scale reference parity at 1280 by 800](design/parity/evidence/tokens-shape-elevation--scale/reference.png)

![tokens-shape-elevation--scale built product parity at 1280 by 800](design/parity/evidence/tokens-shape-elevation--scale/product.png)

![tokens-shape-elevation--scale labelled side-by-side comparison](design/parity/evidence/tokens-shape-elevation--scale/comparison.png)

![tokens-shape-elevation--scale visual diff highlighting the delta](design/parity/evidence/tokens-shape-elevation--scale/diff.png)

</details>

<details><summary>tokens-type--scale</summary>

![tokens-type--scale reference parity at 1280 by 800](design/parity/evidence/tokens-type--scale/reference.png)

![tokens-type--scale built product parity at 1280 by 800](design/parity/evidence/tokens-type--scale/product.png)

![tokens-type--scale labelled side-by-side comparison](design/parity/evidence/tokens-type--scale/comparison.png)

![tokens-type--scale visual diff highlighting the delta](design/parity/evidence/tokens-type--scale/diff.png)

</details>

<details><summary>tool-card--gallery</summary>

![tool-card--gallery reference parity at 1280 by 800](design/parity/evidence/tool-card--gallery/reference.png)

![tool-card--gallery built product parity at 1280 by 800](design/parity/evidence/tool-card--gallery/product.png)

![tool-card--gallery labelled side-by-side comparison](design/parity/evidence/tool-card--gallery/comparison.png)

![tool-card--gallery visual diff highlighting the delta](design/parity/evidence/tool-card--gallery/diff.png)

</details>

<details><summary>tools-tree--mixed</summary>

![tools-tree--mixed reference parity at 1280 by 800](design/parity/evidence/tools-tree--mixed/reference.png)

![tools-tree--mixed built product parity at 1280 by 800](design/parity/evidence/tools-tree--mixed/product.png)

![tools-tree--mixed labelled side-by-side comparison](design/parity/evidence/tools-tree--mixed/comparison.png)

![tools-tree--mixed visual diff highlighting the delta](design/parity/evidence/tools-tree--mixed/diff.png)

</details>

<details><summary>upgrade-card--gallery</summary>

![upgrade-card--gallery reference parity at 1280 by 800](design/parity/evidence/upgrade-card--gallery/reference.png)

![upgrade-card--gallery built product parity at 1280 by 800](design/parity/evidence/upgrade-card--gallery/product.png)

![upgrade-card--gallery labelled side-by-side comparison](design/parity/evidence/upgrade-card--gallery/comparison.png)

![upgrade-card--gallery visual diff highlighting the delta](design/parity/evidence/upgrade-card--gallery/diff.png)

</details>
