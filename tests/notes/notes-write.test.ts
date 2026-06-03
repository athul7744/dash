/// <reference types="vitest/globals" />

const executeMock = vi.fn(async () => undefined);
const getAllMock = vi.fn(async () => []);
const getOptionalMock = vi.fn(async () => null);
const getCurrentUserIdMock = vi.fn(async () => "user-1");

vi.mock("@/lib/powersync/db", () => ({
  db: {
    execute: executeMock,
    getAll: getAllMock,
    getOptional: getOptionalMock,
  },
}));

vi.mock("@/lib/shared/auth", () => ({
  getCurrentUserId: getCurrentUserIdMock,
}));

describe("notes writes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    executeMock.mockResolvedValue(undefined);
    getAllMock.mockResolvedValue([]);
    getOptionalMock.mockResolvedValue(null);
    getCurrentUserIdMock.mockResolvedValue("user-1");
  });

  it("creates the starter page block immediately without waiting for the debounced queue", async () => {
    const { createStarterPage } = await import("@/lib/notes/notes");

    await createStarterPage("Immediate starter");

    const executeCalls = executeMock.mock.calls as unknown[][];
    const pageInsertCall = executeCalls.find((call) => String(call[0] ?? "").includes("INSERT INTO pages"));
    const blockInsertCall = executeCalls.find((call) => String(call[0] ?? "").includes("INSERT INTO blocks"));

    expect(pageInsertCall).toBeTruthy();
    expect(blockInsertCall).toBeTruthy();
  });
});