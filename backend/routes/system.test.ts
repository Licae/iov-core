import express, { type Express } from "express";
import { describe, expect, it } from "vitest";
import { registerSystemRoutes } from "./system";

type RouteMethod = "get" | "post";

type MockRequest = {
  params: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
};

type MockResponse = {
  status: (code: number) => MockResponse;
  setHeader: (name: string, value: string) => MockResponse;
  json: (value: unknown) => MockResponse;
  send: (value: unknown) => MockResponse;
};

const getRouteHandler = (app: Express, method: RouteMethod, path: string) => {
  const router = (app as Express & { _router?: { stack?: Array<{ route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: Function }> } }> } })._router;
  const layer = router?.stack?.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  const handler = layer?.route?.stack?.[0]?.handle;
  if (!handler) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return handler as (req: MockRequest, res: MockResponse) => unknown;
};

const invokeRoute = async (
  app: Express,
  method: RouteMethod,
  path: string,
  options: {
    params?: Record<string, string>;
    body?: unknown;
    query?: Record<string, string>;
  } = {},
) => {
  const handler = getRouteHandler(app, method, path);
  const headers = new Map<string, string>();
  let statusCode = 200;
  let payload: unknown;

  const req = {
    params: options.params || {},
    body: options.body,
    query: options.query || {},
  };

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
    send(value: unknown) {
      payload = value;
      return this;
    },
  };

  await handler(req, res);
  return { statusCode, headers, payload };
};

class MockSystemDb {
  constructor(
    private readonly settings: Array<{ key: string; value: string }>,
    private readonly defects: Array<Record<string, unknown>>,
  ) {}

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized.includes("SELECT * FROM settings")) {
      return {
        all: () => this.settings,
      };
    }

    if (normalized.includes("SELECT COUNT(*) AS count FROM defects")) {
      return {
        get: () => ({ count: this.defects.length }),
      };
    }

    if (normalized.includes("SELECT * FROM defects ORDER BY created_at DESC LIMIT ? OFFSET ?")) {
      return {
        all: (limit: number, offset: number) => this.defects.slice(offset, offset + limit),
      };
    }

    if (normalized.includes("SELECT severity, COUNT(*) AS count FROM defects GROUP BY severity")) {
      return {
        all: () => {
          const summary = this.defects.reduce<Record<string, number>>((acc, defect) => {
            const severity = String(defect.severity || "");
            acc[severity] = (acc[severity] || 0) + 1;
            return acc;
          }, {});
          return Object.entries(summary).map(([severity, count]) => ({ severity, count }));
        },
      };
    }

    if (normalized.includes("SELECT * FROM defects ORDER BY created_at DESC")) {
      return {
        all: () => this.defects,
      };
    }

    if (normalized.includes("SELECT * FROM defects WHERE id = ?")) {
      return {
        get: (id: string) => this.defects.find((defect) => defect.id === id),
      };
    }

    throw new Error(`Unhandled SQL in route test: ${normalized}`);
  }
}

describe("registerSystemRoutes", () => {
  it("returns boolean settings from /api/settings", async () => {
    const app = express();
    app.use(express.json());
    registerSystemRoutes(app, {
      db: new MockSystemDb(
        [
          { key: "abort_on_critical_dtc", value: "true" },
          { key: "pr_requires_sil", value: "false" },
        ],
        [],
      ) as never,
      listExecutionTasks: () => [],
      listTestSuites: () => [],
      listSuiteRuns: () => [],
      generateDefectAnalysis: async () => ({ analysis: "unused", source: "fallback" }),
      buildReportHtml: () => "<html><body>report</body></html>",
    });
    const response = await invokeRoute(app, "get", "/api/settings");

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      abort_on_critical_dtc: true,
      pr_requires_sil: false,
    });
  });

  it("analyzes defects through /api/defects/:id/analyze", async () => {
    const app = express();
    app.use(express.json());
    registerSystemRoutes(app, {
      db: new MockSystemDb([], [{ id: "DEF-1", description: "TLS 错误", module: "Gateway", severity: "Major", status: "Open" }]) as never,
      listExecutionTasks: () => [],
      listTestSuites: () => [],
      listSuiteRuns: () => [],
      generateDefectAnalysis: async (defect) => ({ analysis: `分析 ${String((defect as { id: string }).id)}`, source: "gemini" }),
      buildReportHtml: () => "<html><body>report</body></html>",
    });
    const response = await invokeRoute(app, "post", "/api/defects/:id/analyze", {
      params: { id: "DEF-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({ analysis: "分析 DEF-1", source: "gemini" });
  });

  it("returns paginated defects from /api/defects/page", async () => {
    const app = express();
    app.use(express.json());
    registerSystemRoutes(app, {
      db: new MockSystemDb(
        [],
        [
          { id: "DEF-3", description: "证书错误", module: "Gateway", severity: "Critical", status: "Open" },
          { id: "DEF-2", description: "超时异常", module: "TCU", severity: "Major", status: "Open" },
          { id: "DEF-1", description: "弱口令", module: "IVI", severity: "Major", status: "Resolved" },
        ],
      ) as never,
      listExecutionTasks: () => [],
      listTestSuites: () => [],
      listSuiteRuns: () => [],
      generateDefectAnalysis: async () => ({ analysis: "unused", source: "fallback" }),
      buildReportHtml: () => "<html><body>report</body></html>",
    });
    const response = await invokeRoute(app, "get", "/api/defects/page", {
      query: { page: "2", pageSize: "1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      items: [{ id: "DEF-2", description: "超时异常", module: "TCU", severity: "Major", status: "Open" }],
      summary: { Critical: 1, Major: 2 },
      page: 2,
      pageSize: 1,
      total: 3,
      totalPages: 3,
    });
  });

  it("exports HTML reports from /api/reports/export", async () => {
    const app = express();
    app.use(express.json());
    registerSystemRoutes(app, {
      db: new MockSystemDb([], []) as never,
      listExecutionTasks: () => [],
      listTestSuites: () => [],
      listSuiteRuns: () => [],
      generateDefectAnalysis: async () => ({ analysis: "unused", source: "fallback" }),
      buildReportHtml: () => "<html><body>report</body></html>",
    });
    const response = await invokeRoute(app, "get", "/api/reports/export");

    expect(response.statusCode).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-disposition")).toContain(".html");
    expect(String(response.payload)).toContain("report");
  });
});
