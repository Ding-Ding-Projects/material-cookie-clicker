import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

/**
 * THE SAVE NEVER ACTUALLY DIES.
 *
 * The owner's rule: deleting save progress must not delete anything. It commits the save to a
 * local Git repository so it can always be restored, and restoring costs half of what that save
 * produced per second.
 *
 * WHY THIS WRITES GIT OBJECTS BY HAND RATHER THAN TAKING A DEPENDENCY.
 *
 * The application has four runtime dependencies, and shipping a fifth to write three object types
 * is a poor trade. Shelling out to the system `git` is worse: a player's machine may not have it,
 * and a history feature that silently does nothing on a machine without Git is exactly the
 * wired-at-one-end defect this repository has been bitten by before. Git's loose-object format is
 * small and completely specified -- a zlib-deflated `<type> <length>\0<payload>` addressed by the
 * SHA-1 of the UNCOMPRESSED bytes -- so this writes it directly with `node:zlib` and `node:crypto`.
 *
 * The result is a REAL repository, not an imitation: `git --git-dir=<dir> log` reads it, and the
 * test asserts exactly that by running the real Git CLI against what this produces. That check is
 * the whole reason to bother with the true format rather than inventing a private one.
 *
 * It is a BARE repository. There is no working tree to check out, nothing here is ever dewed, and
 * it lives beside the application's own data rather than inside any folder the player owns.
 */

/** A regular non-executable file, which is the only mode this store ever writes. */
const FILE_MODE = '100644';
const SAVE_FILENAME = 'save.json';
const BRANCH = 'refs/heads/main';

export interface SaveHistoryEntry {
  /** The commit id. Restoring names this. */
  readonly id: string;
  /** Milliseconds since the epoch, derived from the committer line. */
  readonly archivedAtEpochMs: number;
  /** The first line of the commit message. */
  readonly summary: string;
}

function sha1(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex');
}

/** `<type> <byteLength>\0<payload>` -- the bytes Git hashes and stores. */
function objectBytes(type: string, payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from(`${type} ${payload.length}\0`, 'utf8'), payload]);
}

export class SaveHistoryStore {
  private readonly objectsDir: string;

  constructor(private readonly gitDir: string) {
    this.objectsDir = join(gitDir, 'objects');
  }

  /** Safe to call repeatedly; an existing store is left exactly as it is. */
  init(): void {
    mkdirSync(this.objectsDir, { recursive: true });
    mkdirSync(join(this.gitDir, 'refs', 'heads'), { recursive: true });
    const head = join(this.gitDir, 'HEAD');
    if (!existsSync(head)) writeFileSync(head, `ref: ${BRANCH}\n`, 'utf8');
    const config = join(this.gitDir, 'config');
    // `bare = true` is what stops Git complaining that a work tree is missing.
    if (!existsSync(config)) {
      writeFileSync(config, '[core]\n\trepositoryformatversion = 0\n\tbare = true\n', 'utf8');
    }
  }

  private writeObject(type: string, payload: Buffer): string {
    const full = objectBytes(type, payload);
    const id = sha1(full);
    const target = join(this.objectsDir, id.slice(0, 2), id.slice(2));
    // An object is addressed by its own content, so an existing file is already correct. Rewriting
    // it would be pointless work and, on Windows, a chance to fail on a file something else has open.
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, deflateSync(full));
    }
    return id;
  }

  private readObject(id: string): { type: string; payload: Buffer } {
    const target = join(this.objectsDir, id.slice(0, 2), id.slice(2));
    const raw = inflateSync(readFileSync(target));
    const split = raw.indexOf(0);
    if (split < 0) throw new Error(`Object ${id} has no header terminator.`);
    const header = raw.subarray(0, split).toString('utf8');
    const space = header.indexOf(' ');
    return { type: header.slice(0, space), payload: raw.subarray(split + 1) };
  }

  private headCommit(): string | null {
    const ref = join(this.gitDir, BRANCH);
    if (!existsSync(ref)) return null;
    const id = readFileSync(ref, 'utf8').trim();
    return id.length > 0 ? id : null;
  }

  /**
   * Commit one save payload and return the commit id.
   *
   * `whenEpochMs` is passed in rather than read from the clock so a test can assert an exact
   * timestamp instead of racing one.
   */
  archive(saveJson: string, summary: string, whenEpochMs: number): string {
    this.init();
    const blob = this.writeObject('blob', Buffer.from(saveJson, 'utf8'));
    // One entry, so no sorting question arises. Git wants the raw 20 bytes, not the hex.
    const entry = Buffer.concat([
      Buffer.from(`${FILE_MODE} ${SAVE_FILENAME}\0`, 'utf8'),
      Buffer.from(blob, 'hex'),
    ]);
    const tree = this.writeObject('tree', entry);
    const parent = this.headCommit();
    const seconds = Math.floor(whenEpochMs / 1000);
    // A fixed +0000 offset keeps the commit reproducible and says nothing about where the player is.
    const who = `Material Cookie Clicker <save-history@localhost> ${seconds} +0000`;
    const lines = [
      `tree ${tree}`,
      ...(parent ? [`parent ${parent}`] : []),
      `author ${who}`,
      `committer ${who}`,
      '',
      summary,
      '',
    ];
    const commit = this.writeObject('commit', Buffer.from(lines.join('\n'), 'utf8'));
    mkdirSync(dirname(join(this.gitDir, BRANCH)), { recursive: true });
    writeFileSync(join(this.gitDir, BRANCH), `${commit}\n`, 'utf8');
    return commit;
  }

  /** Newest first. An empty store returns an empty list rather than throwing. */
  list(): SaveHistoryEntry[] {
    const entries: SaveHistoryEntry[] = [];
    let id = this.headCommit();
    while (id) {
      const { payload } = this.readObject(id);
      const text = payload.toString('utf8');
      const headerEnd = text.indexOf('\n\n');
      const header = headerEnd < 0 ? text : text.slice(0, headerEnd);
      const message = headerEnd < 0 ? '' : text.slice(headerEnd + 2);
      const committer = /^committer .*? (\d+) [+-]\d{4}$/m.exec(header);
      entries.push({
        id,
        archivedAtEpochMs: committer ? Number(committer[1]) * 1000 : 0,
        summary: message.split('\n')[0] ?? '',
      });
      const parent = /^parent ([0-9a-f]{40})$/m.exec(header);
      id = parent ? parent[1] : null;
    }
    return entries;
  }

  /** The exact save payload archived at that commit. */
  read(commitId: string): string {
    const { payload } = this.readObject(commitId);
    const tree = /^tree ([0-9a-f]{40})$/m.exec(payload.toString('utf8'));
    if (!tree) throw new Error(`Commit ${commitId} has no tree.`);
    const treeObject = this.readObject(tree[1]).payload;
    // Walk the entries rather than assuming the file sits at a fixed offset.
    let at = 0;
    while (at < treeObject.length) {
      const nul = treeObject.indexOf(0, at);
      const name = treeObject.subarray(at, nul).toString('utf8').split(' ')[1];
      const id = treeObject.subarray(nul + 1, nul + 21).toString('hex');
      if (name === SAVE_FILENAME) return this.readObject(id).payload.toString('utf8');
      at = nul + 21;
    }
    throw new Error(`Commit ${commitId} carries no ${SAVE_FILENAME}.`);
  }

  /** True when the store exists and holds at least one commit. */
  hasHistory(): boolean {
    return existsSync(this.objectsDir) && readdirSync(this.objectsDir).length > 0 && this.headCommit() !== null;
  }
}
