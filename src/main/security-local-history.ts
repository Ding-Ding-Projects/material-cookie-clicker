import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type { HistoryRecord, LocalGitHistoryAdapter } from "../shared/security-history.js";

const execFileAsync = promisify(execFile);
const TRANSIENT_RENAME_ERRORS = new Set(["EPERM", "EACCES", "EBUSY"]);
let temporaryCounter = 0;

async function atomicWrite(path: string, body: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${temporaryCounter++}.tmp`;
  await writeFile(temporary, body, { encoding: "utf8", mode: 0o600 });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(temporary, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!TRANSIENT_RENAME_ERRORS.has(code) || attempt === 5) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

function boundedCommitMessage(value: string): string {
  return value.replace(/[\r\n\0]/g, " ").trim().slice(0, 160) || "Record local history change";
}

/** Local-only Git adapter. It never configures a remote and never invokes a shell. */
export class LocalGitHistoryService implements LocalGitHistoryAdapter {
  constructor(private readonly root: string, private readonly gitBinary = "git") {}

  async #git(args: readonly string[]): Promise<string> {
    const { stdout } = await execFileAsync(this.gitBinary, ["-C", this.root, ...args], {
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    try {
      await readFile(join(this.root, ".git", "HEAD"));
    } catch {
      await this.#git(["init", "--initial-branch=history"]);
      await this.#git(["config", "user.name", "Material Cookie Clicker Local History"]);
      await this.#git(["config", "user.email", "local-history@invalid"]);
    }
  }

  async appendCommit(input: { message: string; record: HistoryRecord; encryptedSnapshot: string }): Promise<string> {
    await atomicWrite(join(this.root, "record.json"), `${JSON.stringify(input.record, null, 2)}\n`);
    await atomicWrite(join(this.root, "snapshot.enc"), input.encryptedSnapshot);
    await this.#git(["add", "--", "record.json", "snapshot.enc"]);
    await this.#git(["commit", "--no-gpg-sign", "--message", boundedCommitMessage(input.message)]);
    return this.#git(["rev-parse", "HEAD"]);
  }

  async containsCommit(sha: string): Promise<boolean> {
    if (!/^[0-9a-f]{40}$/i.test(sha)) return false;
    try {
      await this.#git(["cat-file", "-e", `${sha}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }
}
