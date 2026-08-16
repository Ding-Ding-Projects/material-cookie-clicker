/**
 * The command registry behind the command palette.
 *
 * A command either navigates to an element or exposes a live control for a
 * preference. `assertCommandCoverage` exists so a palette cannot silently fall
 * behind the settings grid: a consumer lists its preference keys, and any key
 * without a command is reported.
 */

import { matchesSearch, type SearchState } from "./regex-builder.ts";

export type ControlDescriptor =
  | { control: "select"; preferenceKey: string; options: { value: string; label: string }[] }
  | { control: "segmented"; preferenceKey: string; options: { value: string; label: string }[] }
  | { control: "range"; preferenceKey: string; min: number; max: number; step: number }
  | { control: "colour"; preferenceKey: string }
  | { control: "switch"; preferenceKey: string };

export type CommandDescriptor = {
  id: string;
  label: string;
  detail: string;
  surface: string;
  kind: "navigate" | "control";
  tab: string;
  target: string;
  control?: ControlDescriptor;
};

export type TeleportTarget = {
  elementId: string;
  preferInputId?: string;
};

export class CommandRegistry {
  readonly #commands = new Map<string, CommandDescriptor>();

  register(descriptor: CommandDescriptor): void {
    if (!descriptor.id) throw new Error("A command requires an identifier.");
    if (this.#commands.has(descriptor.id)) {
      throw new Error(`The command "${descriptor.id}" is already registered.`);
    }
    this.#commands.set(descriptor.id, descriptor);
  }

  registerAll(descriptors: CommandDescriptor[]): void {
    for (const descriptor of descriptors) this.register(descriptor);
  }

  list(): CommandDescriptor[] {
    return [...this.#commands.values()];
  }

  find(id: string): CommandDescriptor | null {
    return this.#commands.get(id) ?? null;
  }
}

/** Searchable text for one command. */
export function commandHaystack(command: CommandDescriptor): string {
  return `${command.label} ${command.detail} ${command.surface} ${command.tab}`;
}

/** Filters the registry with the shared search engine. */
export function searchCommands(registry: CommandRegistry, state: SearchState): CommandDescriptor[] {
  return registry.list().filter((command) => matchesSearch(commandHaystack(command), state));
}

/** Resolves where a command should send focus. */
export function teleportTarget(command: CommandDescriptor): TeleportTarget {
  return command.kind === "control"
    ? { elementId: command.target, preferInputId: `${command.target}-input` }
    : { elementId: command.target };
}

/**
 * Returns the preference keys that no registered command can reach, so the
 * gap is a reportable result rather than an invisible omission.
 */
export function assertCommandCoverage(settingKeys: string[], registry: CommandRegistry): string[] {
  const covered = new Set<string>();
  for (const command of registry.list()) {
    if (command.control) covered.add(command.control.preferenceKey);
  }
  return settingKeys.filter((key) => !covered.has(key)).sort();
}
