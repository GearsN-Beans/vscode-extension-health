// Minimal stand-in for the 'vscode' module. Only used by tests (via scripts/register-vscode-mock.cjs),
// never imported by real extension code.
export const state = {
  extensionsAll: [] as Array<{ id: string }>,
  config: {} as Record<string, unknown>,
};

export const extensions = {
  get all() {
    return state.extensionsAll;
  },
};

export const workspace = {
  getConfiguration(_section?: string) {
    return {
      get<T>(key: string, defaultValue: T): T {
        const value = state.config[key];
        return value === undefined ? defaultValue : (value as T);
      },
    };
  },
};

export function resetVscodeMock(): void {
  state.extensionsAll = [];
  state.config = {};
}
