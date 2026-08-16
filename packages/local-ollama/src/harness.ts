export interface HarnessProfile {
  id: string;
  name: string;
  description: string;
  allowedExecutableIds: string[];
  argumentTemplate: string[];
  allowedEnvironmentKeys: string[];
  requiredPorts: number[];
  requiredFiles: string[];
  healthTimeoutMs: number;
}

export interface ResolvedExecutable {
  id: string;
  displayName: string;
  absolutePath: string;
}

export interface HarnessLaunchSelection {
  profileId: string;
  executableId: string;
  model: string;
  workingDirectory: string;
  environment: Record<string, string>;
}

export interface HarnessLaunchPreview {
  profile: HarnessProfile;
  executable: ResolvedExecutable;
  model: string;
  arguments: string[];
  workingDirectory: string;
  environmentKeys: string[];
  requiredPorts: number[];
  requiredFiles: string[];
  blockers: string[];
}

export interface HarnessSnapshot {
  id: string;
  profileId: string;
  createdAt: string;
  payload: unknown;
}

export interface HarnessSnapshotStore {
  create(profileId: string): Promise<HarnessSnapshot>;
  restore(snapshot: HarnessSnapshot): Promise<void>;
  /**
   * Lists the stored snapshots, newest first. `profileId` of `null` lists every
   * profile. Restoring is always driven by an identifier resolved against this
   * list, never by a payload handed in by a caller.
   */
  list(profileId: string | null, limit: number): Promise<HarnessSnapshot[]>;
}

export interface HarnessRuntime {
  listExecutables(): Promise<ResolvedExecutable[]>;
  validateWorkingDirectory(path: string): Promise<boolean>;
  requiredFilesExist(workingDirectory: string, relativePaths: string[]): Promise<boolean>;
  portsAvailable(ports: number[]): Promise<boolean>;
  launch(input: {
    executablePath: string;
    arguments: string[];
    workingDirectory: string;
    environment: Record<string, string>;
    useShell: false;
  }): Promise<{ processId: number }>;
  waitUntilReady(processId: number, timeoutMs: number): Promise<void>;
  stop(processId: number): Promise<void>;
}

export const PREBUILT_HARNESS_PROFILES: readonly HarnessProfile[] = [
  {
    id: "local-openai-compatible-client",
    name: "Local OpenAI-compatible client",
    description: "Starts an explicitly discovered local client pointed at the selected local Ollama model.",
    allowedExecutableIds: ["vscode", "vscode-insiders"],
    argumentTemplate: ["{workingDirectory}"],
    allowedEnvironmentKeys: ["OLLAMA_HOST", "OLLAMA_MODEL"],
    requiredPorts: [11434],
    requiredFiles: [],
    healthTimeoutMs: 30_000,
  },
  {
    id: "local-project-workspace",
    name: "Local project workspace",
    description: "Opens the reviewed working directory with the selected model exposed through environment keys.",
    allowedExecutableIds: ["vscode", "vscode-insiders"],
    argumentTemplate: ["{workingDirectory}"],
    allowedEnvironmentKeys: ["OLLAMA_HOST", "OLLAMA_MODEL"],
    requiredPorts: [11434],
    requiredFiles: [],
    healthTimeoutMs: 30_000,
  },
] as const;

export class AllowlistedHarnessManager {
  readonly #profiles: ReadonlyMap<string, HarnessProfile>;
  readonly #runtime: HarnessRuntime;
  readonly #snapshots: HarnessSnapshotStore;

  constructor(runtime: HarnessRuntime, snapshots: HarnessSnapshotStore, profiles = PREBUILT_HARNESS_PROFILES) {
    this.#runtime = runtime;
    this.#snapshots = snapshots;
    this.#profiles = new Map(profiles.map((profile) => [profile.id, profile]));
  }

  /**
   * The executables discovery actually found on this computer. The suite offers
   * a selection over this list; it never accepts a typed-in program path.
   */
  async listExecutables(): Promise<ResolvedExecutable[]> {
    return this.#runtime.listExecutables();
  }

  /** The stored snapshots a person may restore, newest first. */
  async listSnapshots(profileId: string | null, limit: number): Promise<HarnessSnapshot[]> {
    return this.#snapshots.list(profileId, Math.max(1, Math.min(limit, 200)));
  }

  async preview(selection: HarnessLaunchSelection): Promise<HarnessLaunchPreview> {
    const profile = this.#profiles.get(selection.profileId);
    if (!profile) throw new Error("Choose one of the prebuilt allowlisted harness profiles.");
    const executables = await this.#runtime.listExecutables();
    const executable = executables.find(
      (candidate) => candidate.id === selection.executableId && profile.allowedExecutableIds.includes(candidate.id),
    );
    if (!executable) throw new Error("Choose a detected executable allowed by this harness profile.");
    const blockers: string[] = [];
    if (!selection.model.trim()) blockers.push("Choose an installed local model.");
    if (!(await this.#runtime.validateWorkingDirectory(selection.workingDirectory))) {
      blockers.push("Choose an existing working directory with the semantic folder picker.");
    }
    if (!(await this.#runtime.requiredFilesExist(selection.workingDirectory, profile.requiredFiles))) {
      blockers.push("The selected working directory is missing files required by this profile.");
    }
    if (!(await this.#runtime.portsAvailable(profile.requiredPorts))) blockers.push("A required local port is unavailable.");
    const forbiddenKeys = Object.keys(selection.environment).filter((key) => !profile.allowedEnvironmentKeys.includes(key));
    if (forbiddenKeys.length > 0) blockers.push(`Remove environment keys not allowed by this profile: ${forbiddenKeys.join(", ")}.`);
    const argumentsList = profile.argumentTemplate.map((argument) =>
      argument.replaceAll("{workingDirectory}", selection.workingDirectory).replaceAll("{model}", selection.model),
    );
    return {
      profile,
      executable,
      model: selection.model,
      arguments: argumentsList,
      workingDirectory: selection.workingDirectory,
      environmentKeys: Object.keys(selection.environment).sort(),
      requiredPorts: [...profile.requiredPorts],
      requiredFiles: [...profile.requiredFiles],
      blockers,
    };
  }

  async launch(selection: HarnessLaunchSelection): Promise<{ processId: number; snapshotId: string }> {
    const preview = await this.preview(selection);
    if (preview.blockers.length > 0) throw new Error(preview.blockers.join(" "));
    const snapshot = await this.#snapshots.create(preview.profile.id);
    let processId: number | null = null;
    try {
      const launched = await this.#runtime.launch({
        executablePath: preview.executable.absolutePath,
        arguments: preview.arguments,
        workingDirectory: preview.workingDirectory,
        environment: Object.fromEntries(
          Object.entries(selection.environment).filter(([key]) => preview.profile.allowedEnvironmentKeys.includes(key)),
        ),
        useShell: false,
      });
      processId = launched.processId;
      await this.#runtime.waitUntilReady(processId, preview.profile.healthTimeoutMs);
      return { processId, snapshotId: snapshot.id };
    } catch (error) {
      if (processId !== null) await this.#runtime.stop(processId).catch(() => undefined);
      await this.#snapshots.restore(snapshot);
      throw new Error(`Harness launch failed and the pre-launch snapshot was restored: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async restore(snapshot: HarnessSnapshot): Promise<void> {
    await this.#snapshots.restore(snapshot);
  }
}
