from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw


REVIEW_REASONS = {
    "achievement-badge--gallery": "Unapproved differences remain in independent medal artwork, card geometry, typography, and toast placement/anatomy.",
    "building-row--gallery": "Unapproved differences remain in independent generator artwork, row/control geometry, typography, and wrapping.",
    "bulk-toolbar--progress": "Unapproved differences remain in toolbar/control geometry, borders, spacing, and text rendering.",
    "cookie-surface--gallery": "Unapproved differences remain in independent cookie artwork, interaction-state sizing, halo geometry, and label placement.",
    "game-layout--main": "Unapproved differences remain in independent cookie/upgrade artwork, panel geometry, spacing, typography, and visible content framing.",
    "narrator-toast--gallery": "Unapproved differences remain in toast width and placement, close-control anatomy, spacing, and text wrapping.",
    "prestige-gate--ready": "Unapproved differences remain in panel/dialog geometry, spacing, typography, and visible content framing.",
    "search-regex-builder--open": "Unapproved differences remain in field/popover geometry, control anatomy, spacing, and typography.",
    "settings-funny-sliders--default": "Unapproved differences remain in card and slider geometry, borders, spacing, and typography.",
    "stat-tile--gallery": "Unapproved differences remain in tile geometry, spacing, typography, and progress-control anatomy.",
    "tokens-color--roles": "Unapproved differences remain in swatch geometry, outline/background colour treatment, spacing, and text rendering.",
    "tokens-shape-elevation--scale": "Unapproved differences remain in shape/elevation geometry, border/shadow rendering, spacing, and text rasterization.",
    "tokens-type--scale": "Unapproved differences remain in typography sizing/placement, row geometry, spacing, and visible content framing.",
    "tool-card--gallery": "Unapproved differences remain in independent tool artwork, card/control geometry, spacing, typography, and progress anatomy.",
    "tools-tree--mixed": "Unapproved differences remain in independent tool/tier artwork, progress/header geometry, card layout, spacing, and typography.",
    "upgrade-card--gallery": "Unapproved differences remain in independent upgrade artwork, card geometry, spacing, typography, and truncation/content framing.",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def relative(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def require_under(root: Path, path: Path, label: str, exists: bool = True) -> Path:
    root = root.resolve()
    candidate = path.resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes {root}") from error
    if exists and not candidate.exists():
        raise FileNotFoundError(f"{label} does not exist: {candidate}")
    if candidate.exists() and candidate.is_symlink():
        raise ValueError(f"{label} is a symbolic link")
    return candidate


def write_json_exclusive(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


def atomic_json(path: Path, value: Any) -> None:
    temporary = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4()}.tmp"
    write_json_exclusive(temporary, value)
    os.replace(temporary, path)


def atomic_png(path: Path, image: Image.Image) -> None:
    temporary = path.parent / f".{path.name}.{os.getpid()}.{uuid.uuid4()}.tmp"
    image.save(temporary, format="PNG")
    os.replace(temporary, path)


def documentation_alt(row_id: str, side: str) -> str:
    label = "reference" if side == "reference" else "built product"
    return f"{row_id} {label} parity at 1280 by 800"


def run_node(script: Path, arguments: list[str]) -> dict[str, Any]:
    completed = subprocess.run(
        ["node", str(script), *arguments],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or f"{script.name} exited {completed.returncode}")
    output = completed.stdout.strip()
    return json.loads(output) if output else {}


def backup_for_rollback(run: Path, repo: Path, path: Path, backups: list[dict[str, Any]]) -> None:
    path = require_under(repo, path, "rollback target", exists=False)
    record: dict[str, Any] = {"path": str(path), "existed": path.exists(), "backup": None, "sha256": None}
    if path.exists():
        backup_root = run / "rollback-files"
        backup_root.mkdir(parents=True, exist_ok=True)
        backup = backup_root / f"{len(backups):03d}-{path.name}.bin"
        shutil.copy2(path, backup)
        record["backup"] = str(backup)
        record["sha256"] = digest(path)
    backups.append(record)


def restore_files(backups: list[dict[str, Any]]) -> None:
    for record in reversed(backups):
        path = Path(record["path"])
        if record["existed"]:
            backup = Path(record["backup"])
            if not backup.exists() or digest(backup) != record["sha256"]:
                raise RuntimeError(f"rollback backup changed: {backup}")
            os.replace(backup, path)
        elif path.exists():
            path.unlink()


def derive_pair(repo: Path, run: Path, row: dict[str, Any], backups: list[dict[str, Any]]) -> dict[str, Any]:
    row_id = row["id"]
    target = repo / "design" / "parity" / "evidence" / row_id
    reference = require_under(repo, repo / row["evidence"]["referenceRaw"]["path"], f"{row_id} reference")
    product = require_under(repo, repo / row["evidence"]["productRaw"]["path"], f"{row_id} product")
    with Image.open(reference) as opened:
        ref_image = opened.convert("RGB")
    with Image.open(product) as opened:
        prod_image = opened.convert("RGB")
    expected = (row["tuple"]["viewport"]["width"], row["tuple"]["viewport"]["height"])
    if ref_image.size != expected or prod_image.size != expected:
        raise ValueError(f"{row_id} raw dimensions are not {expected[0]}x{expected[1]}")

    comparison = Image.new("RGB", (expected[0] * 2, expected[1] + 40), "white")
    comparison.paste(ref_image, (0, 40))
    comparison.paste(prod_image, (expected[0], 40))
    draw = ImageDraw.Draw(comparison)
    draw.text((16, 12), f"REFERENCE — {row_id} — light / en-HK / 1280x800 / 1x", fill="black")
    draw.text((expected[0] + 16, 12), f"BUILT PRODUCT — {row_id} — light / en-HK / 1280x800 / 1x", fill="black")
    comparison_path = target / "comparison.png"
    comparison_manifest_path = target / "comparison.json"
    diff_path = target / "diff.json"
    for path in (comparison_path, comparison_manifest_path, diff_path):
        backup_for_rollback(run, repo, path, backups)
    atomic_png(comparison_path, comparison)
    comparison_manifest = {
        "schemaVersion": 1,
        "rowId": row_id,
        "tuple": row["tuple"],
        "labels": ["REFERENCE", "BUILT PRODUCT"],
        "inputs": {"referenceSha256": digest(reference), "productSha256": digest(product)},
    }
    atomic_json(comparison_manifest_path, comparison_manifest)

    diff_image = ImageChops.difference(ref_image, prod_image)
    changed = sum(1 for pixel in diff_image.getdata() if pixel != (0, 0, 0))
    histogram = diff_image.histogram()
    squared = sum((index % 256) ** 2 * count for index, count in enumerate(histogram))
    total_pixels = expected[0] * expected[1]
    diff_record = {
        "schemaVersion": 1,
        "rowId": row_id,
        "tuple": row["tuple"],
        "inputs": {
            "reference": {"path": row["evidence"]["referenceRaw"]["path"], "sha256": digest(reference)},
            "product": {"path": row["evidence"]["productRaw"]["path"], "sha256": digest(product)},
        },
        "dimensions": {"width": expected[0], "height": expected[1]},
        "metrics": {
            "changedPixels": changed,
            "totalPixels": total_pixels,
            "changedRatio": changed / total_pixels,
            "rgbRmse": (squared / (total_pixels * 3)) ** 0.5,
        },
        "tool": {"name": "Pillow ImageChops.difference", "version": Image.__version__},
        "review": {
            "verdict": "defect" if changed else "conforming",
            "reason": REVIEW_REASONS[row_id] if changed else "Raw captures are pixel-identical.",
        },
    }
    atomic_json(diff_path, diff_record)
    return {
        "comparison": {
            "path": relative(repo, comparison_path),
            "status": "verified",
            "sha256": digest(comparison_path),
            "manifestPath": relative(repo, comparison_manifest_path),
            "manifestSha256": digest(comparison_manifest_path),
        },
        "diff": {"path": relative(repo, diff_path), "status": "verified", "sha256": digest(diff_path)},
    }


def build_receipt(
    ledger: dict[str, Any],
    ledger_sha256: str,
    row: dict[str, Any],
    side: str,
    privacy: dict[str, Any],
) -> dict[str, Any]:
    row_id = row["id"]
    receipt_id = f"{row_id}--{side}"
    capture = ledger["captures"][receipt_id]
    runtime = ledger["runtime"][side]
    build = ledger["builds"][side]
    return {
        "version": 1,
        "id": receipt_id,
        "route": "cheap-lowlevel-headless",
        "provenance": {"runLedgerPath": "run-ledger.json", "runLedgerSha256": ledger_sha256},
        "source": {
            "startCommit": ledger["source"]["startCommit"],
            "endCommit": ledger["source"]["endCommit"],
            "artifactPath": build["artifactPath"],
            "artifactSha256": build["artifactSha256"],
            "buildReceiptPath": build["receiptPath"],
            "buildReceiptSha256": build["receiptSha256"],
            "artifactBuiltAt": build["artifactBuiltAt"],
        },
        "capture": {
            "rawPath": capture["rawPath"],
            "promotedPath": capture["promotedPath"],
            "sha256": capture["sha256"],
            "rawSha256": capture["sha256"],
            "mimeType": "image/png",
            "startedAt": capture["startedAt"],
            "capturedAt": capture["capturedAt"],
            "width": capture["width"],
            "height": capture["height"],
        },
        "state": {
            "surface": "design-reference-app" if side == "reference" else "desktop-app",
            "screen": row["tuple"]["screen"],
            "state": row["tuple"]["state"],
            "theme": row["tuple"]["theme"],
            "viewport": {
                "width": row["tuple"]["viewport"]["width"],
                "height": row["tuple"]["viewport"]["height"],
                "scale": row["tuple"]["scale"],
            },
            "locale": row["tuple"]["locale"],
            "captureKind": "page",
            "deterministic": row["deterministic"],
        },
        "privacy": {
            "visibleDesktopUntouched": privacy["visibleDesktopUntouched"],
            "expectedSurfaceOnly": privacy["expectedSurfaceOnly"],
            "sensitiveDataReviewed": privacy["sensitiveDataReviewed"],
            "unrelatedTargetsObserved": privacy["unrelatedTargetsObserved"],
            "mocked": privacy["mocked"],
            "handEdited": privacy["handEdited"],
        },
        "inspection": capture["inspection"],
        "runtime": {
            "launchPid": runtime["launchPid"],
            "hwnd": runtime["hwnd"],
            "hwndResolvedLive": runtime["hwndResolvedLive"],
            "consoleErrorCount": runtime["consoleErrorCount"],
            "pageErrorCount": runtime["pageErrorCount"],
            "interactionProofId": capture["interactionProofId"],
            "interactionReceiptPath": capture["interactionReceiptPath"],
            "interactionReceiptSha256": capture["interactionReceiptSha256"],
            "privacyScanPath": capture["privacyScanPath"],
            "privacyScanSha256": capture["privacyScanSha256"],
            "cleanupCompleted": ledger["cleanup"]["completed"],
            "cleanupOwnedOnly": ledger["cleanup"]["ownedOnly"],
        },
        "inventory": {
            "path": "design/parity/evidence/promotion-inventory.json",
            "recordId": receipt_id,
        },
        "documentation": [
            {"path": "DESIGN-PARITY.md", "alt": documentation_alt(row_id, side)}
        ],
    }


def promotion_record(receipt: dict[str, Any], row: dict[str, Any], side: str, receipt_sha256: str) -> dict[str, Any]:
    return {
        "id": receipt["id"],
        "active": True,
        "status": "verified",
        "rowId": row["id"],
        "evidenceKey": "referenceRaw" if side == "reference" else "productRaw",
        "receiptSha256": receipt_sha256,
        "path": receipt["capture"]["promotedPath"],
        "sourceCommit": receipt["source"]["startCommit"],
        "artifactSha256": receipt["source"]["artifactSha256"],
        "captureSha256": receipt["capture"]["sha256"],
        "screen": receipt["state"]["screen"],
        "state": receipt["state"]["state"],
        "theme": receipt["state"]["theme"],
        "viewportWidth": receipt["state"]["viewport"]["width"],
        "viewportHeight": receipt["state"]["viewport"]["height"],
        "scale": receipt["state"]["viewport"]["scale"],
        "interactionProofId": receipt["runtime"]["interactionProofId"],
        "interactionReceiptSha256": receipt["runtime"]["interactionReceiptSha256"],
        "inspectionStatus": "inspected",
        "reason": None,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Promote fresh design-parity evidence from one finalized task-owned run.")
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--run-root", required=True)
    parser.add_argument("--ledger", required=True)
    parser.add_argument("--max-age-hours", default="168")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repo = Path(args.repo_root).resolve()
    run = Path(args.run_root).resolve()
    ledger_path = require_under(run, Path(args.ledger), "run ledger")
    if ledger_path != run / "run-ledger.json":
        raise ValueError("the run ledger must be run-ledger.json at the task-owned run root")
    ledger = load_json(ledger_path)
    if ledger.get("owner", {}).get("repoRoot") != str(repo) or ledger.get("owner", {}).get("runRoot") != str(run):
        raise ValueError("run ledger ownership does not match the requested roots")
    source_commit = ledger.get("source", {}).get("startCommit")
    if not source_commit or ledger.get("source", {}).get("endCommit") != source_commit:
        raise ValueError("run ledger source commit is missing or changed")
    if ledger.get("cleanup", {}).get("completed") is not True or ledger.get("cleanup", {}).get("ownedOnly") is not True:
        raise ValueError("run cleanup is incomplete or unscoped")

    inventory_path = repo / "design" / "parity" / "inventory.json"
    promotion_path = repo / "design" / "parity" / "evidence" / "promotion-inventory.json"
    documentation_path = repo / "DESIGN-PARITY.md"
    inventory = load_json(inventory_path)
    row_ids = [row["id"] for row in inventory["rows"]]
    if sorted(row_ids) != sorted(ledger.get("rows", [])):
        raise ValueError("run ledger row set does not match the hand-written inventory")
    if not documentation_path.exists():
        raise FileNotFoundError("DESIGN-PARITY.md is missing")

    stage_script = repo / "scripts" / "stage-evidence.mjs"
    verify_script = repo / "scripts" / "verify-evidence-receipt.mjs"
    receipts_root = run / "receipts"
    transactions_root = run / "transactions"
    receipts_root.mkdir(parents=True, exist_ok=True)
    transactions_root.mkdir(parents=True, exist_ok=True)
    ledger_sha256 = digest(ledger_path)
    receipts: list[tuple[dict[str, Any], Path, dict[str, Any], str]] = []
    for row in inventory["rows"]:
        for side in ("reference", "product"):
            capture = ledger.get("captures", {}).get(f"{row['id']}--{side}")
            if not capture:
                raise ValueError(f"missing finalized capture record for {row['id']}--{side}")
            privacy_path = require_under(run, run / capture["privacyScanPath"], f"{row['id']} {side} privacy proof")
            privacy = load_json(privacy_path)
            required_true = ("visibleDesktopUntouched", "expectedSurfaceOnly", "sensitiveDataReviewed")
            if any(privacy.get(field) is not True for field in required_true):
                raise ValueError(f"{row['id']} {side} privacy review is incomplete")
            if privacy.get("unrelatedTargetsObserved") is not False or privacy.get("mocked") is not False or privacy.get("handEdited") is not False:
                raise ValueError(f"{row['id']} {side} privacy assertions are invalid")
            receipt = build_receipt(ledger, ledger_sha256, row, side, privacy)
            receipt_path = receipts_root / f"{receipt['id']}.json"
            write_json_exclusive(receipt_path, receipt)
            receipts.append((receipt, receipt_path, row, side))

    staged_transactions: list[str] = []
    file_backups: list[dict[str, Any]] = []
    try:
        for receipt, _, _, _ in receipts:
            target = repo / receipt["capture"]["promotedPath"]
            arguments = [
                "--mode", "stage",
                "--repo-root", str(repo),
                "--run-root", str(run),
                "--ledger", str(ledger_path),
                "--receipt-id", receipt["id"],
                "--raw", receipt["capture"]["rawPath"],
                "--target", receipt["capture"]["promotedPath"],
                "--expected-raw-sha256", receipt["capture"]["rawSha256"],
                "--transaction", f"transactions/{receipt['id']}.json",
            ]
            if target.exists():
                arguments.extend(["--expected-existing-sha256", digest(target)])
            run_node(stage_script, arguments)
            staged_transactions.append(f"transactions/{receipt['id']}.json")

        promotion_records = []
        for receipt, receipt_path, row, side in receipts:
            promotion_records.append(promotion_record(receipt, row, side, digest(receipt_path)))
            key = "referenceRaw" if side == "reference" else "productRaw"
            row["evidence"][key] = {
                "path": receipt["capture"]["promotedPath"],
                "status": "verified",
                "sha256": receipt["capture"]["sha256"],
                "promotionRecordId": receipt["id"],
                "receiptSha256": digest(receipt_path),
            }
        for row in inventory["rows"]:
            derived = derive_pair(repo, run, row, file_backups)
            row["evidence"]["comparison"] = derived["comparison"]
            row["evidence"]["diff"] = derived["diff"]
            row["sourceCommit"] = source_commit
            row["captureProvenance"] = {
                "status": "verified",
                "route": "cheap-lowlevel-headless",
                "sourceCommit": source_commit,
                "runLedgerSha256": ledger_sha256,
                "productArtifactSha256": ledger["builds"]["product"]["artifactSha256"],
                "referenceArtifactSha256": ledger["builds"]["reference"]["artifactSha256"],
            }

        backup_for_rollback(run, repo, inventory_path, file_backups)
        backup_for_rollback(run, repo, promotion_path, file_backups)
        atomic_json(inventory_path, inventory)
        atomic_json(promotion_path, {"schemaVersion": 2, "records": promotion_records})
        atomic_json(run / "promotion-file-transaction.json", {
            "version": 1,
            "sourceCommit": source_commit,
            "runLedgerSha256": ledger_sha256,
            "stageTransactions": staged_transactions,
            "fileBackups": file_backups,
            "rollbackPending": True,
        })

        for receipt, receipt_path, _, _ in receipts:
            run_node(verify_script, [
                "--receipt", str(receipt_path),
                "--repo-root", str(repo),
                "--run-root", str(run),
                "--ledger", str(ledger_path),
                "--expected-commit", source_commit,
                "--max-age-hours", str(args.max_age_hours),
            ])
    except Exception:
        restore_files(file_backups)
        for transaction in reversed(staged_transactions):
            try:
                run_node(stage_script, [
                    "--mode", "rollback",
                    "--repo-root", str(repo),
                    "--run-root", str(run),
                    "--ledger", str(ledger_path),
                    "--transaction", transaction,
                ])
            except Exception as rollback_error:
                print(f"rollback failed for {transaction}: {rollback_error}", file=sys.stderr)
        raise

    print(
        json.dumps(
            {
                "promotedRows": len(inventory["rows"]),
                "promotedReceipts": len(receipts),
                "sourceCommit": source_commit,
                "runLedgerSha256": ledger_sha256,
                "transactionsRetained": len(staged_transactions),
                "visualReinspectionRequired": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
