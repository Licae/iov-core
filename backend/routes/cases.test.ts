import express, { type Express } from "express";
import { describe, expect, it } from "vitest";
import { registerCaseRoutes } from "./cases";

type RouteMethod = "get";

type MockRequest = {
  query: Record<string, string>;
  params: Record<string, string>;
  body?: unknown;
};

type MockResponse = {
  status: (code: number) => MockResponse;
  json: (value: unknown) => MockResponse;
};

type TestCaseRow = {
  id: number;
  title: string;
  category: string;
  security_domain?: string | null;
  automation_level?: string | null;
  test_tool?: string | null;
  type: string;
  protocol: string;
  expected_result?: string | null;
  created_at: string;
  requirement_count?: number;
  tara_count?: number;
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
  path: string,
  query: Record<string, string> = {},
) => {
  const handler = getRouteHandler(app, "get", path);
  let statusCode = 200;
  let payload: unknown;

  const req = { query, params: {}, body: undefined };
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  };

  await handler(req, res);
  return { statusCode, payload };
};

class MockCasesDb {
  constructor(private readonly testCases: TestCaseRow[]) {}

  private parseFilterParams(params: string[]) {
    let search = "";
    let index = 0;

    if (params.length >= 4 && params[0] === params[1] && params[1] === params[2] && params[2] === params[3]) {
      search = params[0];
      index = 4;
    }

    const remaining = params.slice(index);
    return {
      search,
      category: remaining[0] || "All",
      securityDomain: remaining[1] || "All",
      automationLevel: remaining[2] || "All",
    };
  }

  private filterCases(filters: {
    search?: string;
    category?: string;
    securityDomain?: string;
    automationLevel?: string;
  }) {
    const search = String(filters.search || "").trim().toLowerCase().replaceAll("%", "");
    const category = String(filters.category || "All").trim();
    const securityDomain = String(filters.securityDomain || "All").trim();
    const automationLevel = String(filters.automationLevel || "All").trim();

    return this.testCases.filter((testCase) => {
      const normalizedSecurityDomain = String(testCase.security_domain || "未分类").trim();
      const normalizedAutomationLevel = String(testCase.automation_level || "B").trim();
      const matchesSearch =
        !search ||
        testCase.title.toLowerCase().includes(search) ||
        testCase.category.toLowerCase().includes(search) ||
        normalizedSecurityDomain.toLowerCase().includes(search) ||
        String(testCase.test_tool || "").toLowerCase().includes(search);
      const matchesCategory = category === "All" || testCase.category === category;
      const matchesSecurityDomain = securityDomain === "All" || normalizedSecurityDomain === securityDomain;
      const matchesAutomation = automationLevel === "All" || normalizedAutomationLevel === automationLevel;
      return matchesSearch && matchesCategory && matchesSecurityDomain && matchesAutomation;
    });
  }

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (normalized.startsWith("SELECT COUNT(*) AS count FROM test_cases tc")) {
      return {
        get: (...params: string[]) => ({
          count: this.filterCases(this.parseFilterParams(params)).length,
        }),
      };
    }

    if (normalized.startsWith("SELECT tc.*,")) {
      return {
        all: (...params: Array<string | number>) => {
          const pageSize = Number(params[params.length - 2]);
          const offset = Number(params[params.length - 1]);
          const filterParams = params.slice(0, -2) as string[];
          const items = this.filterCases(this.parseFilterParams(filterParams));
          return items.slice(offset, offset + pageSize);
        },
      };
    }

    throw new Error(`Unhandled SQL in case route test: ${normalized}`);
  }

  transaction<T>(callback: T) {
    return callback;
  }
}

describe("registerCaseRoutes", () => {
  it("returns paginated test cases with server-side filters", async () => {
    const app = express();
    app.use(express.json());
    registerCaseRoutes(app, {
      db: new MockCasesDb([
        {
          id: 3,
          title: "证书轮换校验",
          category: "PKI",
          security_domain: "通信安全",
          automation_level: "A",
          test_tool: "openssl",
          type: "Automated",
          protocol: "TLS",
          expected_result: "通过",
          created_at: "2026-03-03T00:00:00Z",
          requirement_count: 2,
          tara_count: 1,
        },
        {
          id: 2,
          title: "签名验证异常处理",
          category: "PKI",
          security_domain: "通信安全",
          automation_level: "A",
          test_tool: "python",
          type: "Automated",
          protocol: "TLS",
          expected_result: "阻断",
          created_at: "2026-03-02T00:00:00Z",
          requirement_count: 1,
          tara_count: 0,
        },
        {
          id: 1,
          title: "蓝牙配对回归",
          category: "IVI",
          security_domain: "车机安全",
          automation_level: "B",
          test_tool: "manual",
          type: "Manual",
          protocol: "BLE",
          expected_result: "告警",
          created_at: "2026-03-01T00:00:00Z",
          requirement_count: 0,
          tara_count: 0,
        },
      ]) as never,
    });

    const response = await invokeRoute(app, "/api/test-cases/page", {
      page: "1",
      pageSize: "1",
      search: "安全",
      category: "PKI",
      securityDomain: "通信安全",
      automationLevel: "A",
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toEqual({
      items: [
        {
          id: 3,
          title: "证书轮换校验",
          category: "PKI",
          security_domain: "通信安全",
          automation_level: "A",
          test_tool: "openssl",
          type: "Automated",
          protocol: "TLS",
          expected_result: "通过",
          created_at: "2026-03-03T00:00:00Z",
          requirement_count: 2,
          tara_count: 1,
        },
      ],
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
  });
});
