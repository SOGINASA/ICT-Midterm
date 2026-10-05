import type { publicApiRequest } from "./apiClient";

const originalApiUrl = process.env.REACT_APP_API_URL;
const originalFetch = global.fetch;

afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.REACT_APP_API_URL;
  else process.env.REACT_APP_API_URL = originalApiUrl;
  global.fetch = originalFetch;
});

test.each([
  [undefined, "/api/health"],
  [" /api/ ", "/api/health"],
  ["https://example.com/tenge/api/", "https://example.com/tenge/api/health"],
])("sends requests to the configured CRA API base %s", async (apiBase, expectedUrl) => {
  if (apiBase === undefined) delete process.env.REACT_APP_API_URL;
  else process.env.REACT_APP_API_URL = apiBase;
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ status: "ok" }),
  });
  global.fetch = fetchMock;
  let request!: typeof publicApiRequest;
  jest.isolateModules(() => {
    request = require("./apiClient").publicApiRequest;
  });

  await expect(request("/health")).resolves.toEqual({ status: "ok" });
  expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({
    method: "GET", credentials: "include",
  }));
});
