/**
 * Journey harness — the shared wiring every golden-flow journey test needs.
 *
 * One importing spec gets: the rollback-isolated Neon transaction bound to the
 * mocked `@/db/client`, the createServerFn pass-through, a switchable
 * authenticated actor behind `getCommandContext`, and a muted notification
 * email boundary. Mocked modules are only ever imported lazily inside test
 * bodies, after this module has registered the mocks.
 *
 * A journey test composes personas, scenario composers and step helpers on
 * top of `runRollbackJourney`; nothing here pre-creates the program, family,
 * enrollment, work or grade a journey purports to exercise.
 */
import { describe, vi } from "vitest";
import type { Database } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";

export type JourneyTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type JourneyTools = {
  tx: JourneyTx;
  /** Select the authenticated actor seen by subsequent server-function calls. */
  setActor: (actor: AccessContext) => void;
};

const state = {
  tx: undefined as JourneyTx | undefined,
  actor: undefined as AccessContext | undefined,
};

vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Journey tests must stay inside their rollback-isolated transaction");
    return state.tx;
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (value: unknown) => value,
    validator(parse: (value: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return async (input?: { data: unknown }) => callback({ data: this.parse(input?.data) });
    },
  }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"),
  setResponseHeader: vi.fn(),
}));

vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => {
    if (!state.actor) throw new Error("Journey actor not selected");
    return state.actor;
  },
}));

// Journey acceptance proves in-app/audit/event evidence. External email is a
// separate release gate and stays mocked at the transport boundary.
vi.mock("@/modules/communication/notification-email.server", () => ({
  emailNotificationRecipients: vi.fn(async () => new Map()),
  sendNotificationEmail: vi.fn(),
}));

/** Same isolation contract as the FullFlow acceptance runner. */
export const journeyDatabaseGuard = () => {
  if (process.env.DATABASE_URL && (
    process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
    process.env.APP_ENV !== "test" ||
    !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)) {
    throw new Error("Journey tests require the guarded isolated-test database runner");
  }
};

export const integration = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * The real database client, independent of the transaction mock. Post-rollback
 * residue checks must use this: the mocked `@/db/client` getter throws once the
 * journey transaction has ended.
 */
export async function getRealDb(): Promise<Database> {
  const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
  return realDb;
}

export function first<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Expected a persistent journey record");
  return row;
}

const rollbackSentinel = new Error("rollback-journey");

/**
 * Runs the composed journey inside one transaction that always rolls back,
 * then returns the journey's collected IDs/evidence for post-rollback
 * assertions (for example, proving nothing persisted).
 */
export async function runRollbackJourney<T>(
  run: (journey: JourneyTools) => Promise<T>,
): Promise<T> {
  const realDb = await getRealDb();
  let result!: T;
  let completed = false;
  try {
    await realDb.transaction(async tx => {
      state.tx = tx;
      result = await run({ tx, setActor: actor => { state.actor = actor; } });
      completed = true;
      throw rollbackSentinel;
    });
  } catch (error) {
    if (error !== rollbackSentinel) throw error;
  } finally {
    state.tx = undefined;
    state.actor = undefined;
  }
  if (!completed) throw new Error("Journey did not run to completion");
  return result;
}
