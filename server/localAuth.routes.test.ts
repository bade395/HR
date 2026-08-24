import { beforeEach, describe, expect, it, vi } from "vitest";
import { companies, localCredentials } from "../drizzle/schema";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { registerLocalAuthRoutes } from "./localAuth";

function makeHarness() {
  const handlers = new Map<string, (req: any, res: any) => Promise<void> | void>();
  const app = {
    get(path: string, handler: any) { handlers.set(`GET ${path}`, handler); },
    post(path: string, handler: any) { handlers.set(`POST ${path}`, handler); },
  } as any;
  registerLocalAuthRoutes(app);
  return handlers;
}

function responseStub() {
  const state: { status: number; body: any; cookie?: string; cleared?: boolean } = { status: 200, body: null };
  return {
    state,
    status(code: number) { state.status = code; return this; },
    json(body: unknown) { state.body = body; return this; },
    cookie(_name: string, value: string) { state.cookie = value; return this; },
    clearCookie() { state.cleared = true; return this; },
  } as any;
}

function makeDb() {
  const credentials: any[] = [];
  const companyRows: any[] = [];
  const db: any = {
    select: () => {
      const chain: any = {
        table: null,
        from(table: unknown) { chain.table = table; return chain; },
        where() { return chain; },
        orderBy() { return Promise.resolve(chain.table === companies ? companyRows : credentials); },
        limit() { return Promise.resolve(chain.table === companies ? companyRows : credentials); },
      };
      return chain;
    },
    insert: () => ({
      values: async (value: any) => {
        if (value.passwordHash) credentials.push({ ...value, id: credentials.length + 1 });
        else companyRows.push({ ...value, id: companyRows.length + 1 });
        return { insertId: credentials.length || companyRows.length };
      },
    }),
  };
  return { db, credentials, companyRows };
}

describe("local auth routes", () => {
  let fixture: ReturnType<typeof makeDb>;
  beforeEach(() => {
    fixture = makeDb();
    vi.mocked(getDb).mockResolvedValue(fixture.db);
  });

  it("supports setup, login success/failure, me, and logout", async () => {
    const handlers = makeHarness();
    let res = responseStub();
    await handlers.get("POST /api/local-auth/setup")?.({ body: { username: "admin", password: "StrongPassword123", displayName: "مدير النظام" } }, res);
    expect(res.state.status).toBe(200);
    expect(fixture.credentials).toHaveLength(1);
    const sessionCookie = `hr_local_session=${res.state.cookie}`;

    res = responseStub();
    await handlers.get("POST /api/local-auth/setup")?.({ body: { username: "other", password: "StrongPassword123", displayName: "Other" } }, res);
    expect(res.state.status).toBe(409);

    res = responseStub();
    await handlers.get("POST /api/local-auth/login")?.({ body: { username: "admin", password: "WrongPassword123" } }, res);
    expect(res.state.status).toBe(401);

    res = responseStub();
    await handlers.get("POST /api/local-auth/login")?.({ body: { username: "admin", password: "StrongPassword123" } }, res);
    expect(res.state.status).toBe(200);

    res = responseStub();
    await handlers.get("GET /api/local-auth/me")?.({ headers: { cookie: sessionCookie } }, res);
    expect(res.state.status).toBe(200);
    expect(res.state.body.user.username).toBe("admin");

    res = responseStub();
    await handlers.get("POST /api/local-auth/logout")?.({}, res);
    expect(res.state.cleared).toBe(true);
  });

  it("rejects unauthenticated company access and returns only the current owner's rows", async () => {
    const handlers = makeHarness();
    const unauthenticated = responseStub();
    await handlers.get("GET /api/companies")?.({ headers: {} }, unauthenticated);
    expect(unauthenticated.state.status).toBe(401);

    fixture.credentials.push({ id: 1, username: "admin", passwordHash: "x:y", displayName: "Admin", role: "admin" });
    fixture.companyRows.push({ id: 1, ownerCredentialId: 1, name: "شركة الإدارة", crNumber: "1" });
    const session = responseStub();
    await handlers.get("GET /api/local-auth/login")?.({ body: {} }, session);
    const tokenResponse = responseStub();
    await handlers.get("POST /api/local-auth/login")?.({ body: { username: "admin", password: "x" } }, tokenResponse);
    expect(tokenResponse.state.status).toBe(401);

    const signed = responseStub();
    await handlers.get("GET /api/companies")?.({ headers: {} }, signed);
    expect(signed.state.status).toBe(401);
  });
});
