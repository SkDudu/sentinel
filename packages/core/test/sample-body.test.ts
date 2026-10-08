import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleRequestBody } from "../dist/index.js";

test("body de exemplo: example/enum/format, aninhado e allOf; ignora id e readOnly", () => {
  const body = sampleRequestBody({
    type: "object",
    properties: {
      id: { type: "integer" },
      token: { type: "string", readOnly: true },
      name: { type: "string" },
      email: { type: "string", format: "email" },
      status: { type: "string", enum: ["pending", "done"] },
      qty: { type: "integer", minimum: 2 },
      phone: { type: "string", example: "+55 11 99999-0000" },
      tags: { type: "array", items: { type: "string" } },
      address: { type: "object", properties: { city: { type: "string" } } },
    },
    allOf: [{ properties: { active: { type: "boolean" } } }],
  });
  assert.deepEqual(body, {
    name: "{{prefix}}",
    email: "{{prefix}}@example.test",
    status: "pending",
    qty: 2,
    phone: "+55 11 99999-0000",
    tags: ["{{prefix}}"],
    address: { city: "{{prefix}}" },
    active: true,
  });
});

test("sem schema ou sem propriedades → undefined", () => {
  assert.equal(sampleRequestBody(undefined), undefined);
  assert.equal(sampleRequestBody({ type: "object" }), undefined);
});
