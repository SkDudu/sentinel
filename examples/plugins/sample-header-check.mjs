/**
 * Example custom SecurityTest plugin for Sentinel.
 * Load with: sentinel scan ... --plugins examples/plugins
 */

/** @type {import('@sw/test-registry').SecurityTest} */
const sampleHeaderCheck = {
  id: "custom.sample-x-sentinel",
  name: "Sample custom header probe",
  category: "http",
  severity: "INFO",
  description: "Sends X-Sentinel-Probe and records the status (example plugin).",

  generateCases() {
    return [
      {
        id: "probe",
        name: "X-Sentinel-Probe",
        source: "deterministic",
        category: "http",
        mutations: { header: "X-Sentinel-Probe" },
        tags: ["custom", "example"],
      },
    ];
  },

  execute(ctx) {
    return {
      method: ctx.endpoint.method,
      url: `${ctx.baseUrl.replace(/\/$/, "")}${ctx.endpoint.path}`,
      headers: {
        ...ctx.authHeaders,
        "Content-Type": "application/json",
        "X-Sentinel-Probe": "1",
      },
      body: {},
    };
  },

  analyse() {
    // Example plugin never raises findings — proves registration only.
    return null;
  },
};

export default [sampleHeaderCheck];
