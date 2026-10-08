import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferRelations,
  mergeRelations,
  parseOpenApi,
  resourceFixtureKey,
  resourceKey,
} from "../dist/index.js";

const PROJECT = "22222222-2222-4222-8222-222222222222";

const petstore = {
  openapi: "3.0.3",
  paths: {
    "/users/{userId}": {
      get: { operationId: "getUser", parameters: [{ name: "userId", in: "path", required: true }], responses: { "200": { description: "ok" } } },
    },
    "/users/{userId}/orders": {
      parameters: [{ name: "userId", in: "path", required: true }],
      get: { operationId: "listUserOrders", responses: { "200": { description: "ok" } } },
    },
    "/orders": {
      post: {
        operationId: "createOrder",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { customer_id: { type: "integer" }, petId: { type: "integer" } },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Order" } } },
            links: {
              GetOrder: {
                operationId: "getOrder",
                parameters: { orderId: "$response.body#/id" },
              },
            },
          },
        },
      },
    },
    "/orders/{orderId}": {
      parameters: [{ name: "orderId", in: "path", required: true }],
      get: { operationId: "getOrder", responses: { "200": { description: "ok" } } },
      delete: { operationId: "deleteOrder", responses: { "204": { description: "gone" } } },
    },
    "/customers/{customerId}": {
      get: { operationId: "getCustomer", parameters: [{ name: "customerId", in: "path", required: true }], responses: { "200": { description: "ok" } } },
    },
    "/pets/{petId}": {
      get: { operationId: "getPet", parameters: [{ name: "petId", in: "path", required: true }], responses: { "200": { description: "ok" } } },
    },
    "/orders/export/{format}": {
      get: { parameters: [{ name: "format", in: "path", required: true }], responses: { "200": { description: "ok" } } },
    },
  },
  components: {
    schemas: {
      Order: {
        type: "object",
        properties: { id: { type: "string" }, ownerId: { type: "string" } },
      },
    },
  },
};

function find(relations: Array<{ from: string; to: string; kind: string; via: string }>, from: string, kind: string, to: string) {
  return relations.find((r) => r.from === from && r.kind === kind && r.to === to);
}

test("petstore: links, path aninhado, FK, dono e create→read", () => {
  const endpoints = parseOpenApi(petstore, PROJECT);
  const created = endpoints.find((e) => e.operationId === "createOrder")!;
  const schema = created.responses[0]!.schema as Record<string, unknown>;
  assert.equal(schema["x-component"], "Order");
  assert.deepEqual(created.responses[0]!.links, [
    { name: "GetOrder", operationId: "getOrder", parameters: { orderId: "$response.body#/id" } },
  ]);

  const { resources, relations } = inferRelations(endpoints);
  assert.deepEqual(
    resources.map((r) => r.name),
    ["customers", "orders", "pets", "users"],
  );
  const orders = resources.find((r) => r.name === "orders")!;
  assert.equal(orders.idParam, "orderId");
  assert.deepEqual(Object.keys(orders.operations).sort(), ["create", "delete", "list", "read"]);

  const link = relations.find((r) => r.origin === "links")!;
  assert.equal(link.kind, "produces");
  assert.equal(link.via, "orderId");
  assert.equal(link.source, "response.id");
  assert.equal(link.confidence, 100);

  assert.equal(find(relations, "orders", "parent", "users")?.via, "userId");
  assert.equal(find(relations, "orders", "reference", "customers")?.via, "body.customer_id");
  assert.equal(find(relations, "orders", "reference", "pets")?.via, "body.petId");
  assert.equal(find(relations, "orders", "owner", "users")?.via, "response.ownerId");
  assert.equal(resources.some((r) => r.name === "export"), false);
});

test("estilo Laravel: kebab plural + param snake singular", () => {
  const endpoints = parseOpenApi(
    {
      openapi: "3.0.0",
      paths: {
        "/api/admin/company-units": { get: { responses: {} }, post: { responses: {} } },
        "/api/admin/company-units/{company_unit}": {
          get: { parameters: [{ name: "company_unit", in: "path" }], responses: {} },
        },
        "/api/admin/companies/{company}/company-units": {
          get: { parameters: [{ name: "company", in: "path" }], responses: {} },
        },
        "/api/admin/companies/{company}": {
          put: {
            parameters: [{ name: "company", in: "path" }],
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { company_unit_id: { type: "integer" } } },
                },
              },
            },
            responses: {},
          },
        },
      },
    },
    PROJECT,
  );
  const { resources, relations } = inferRelations(endpoints);
  assert.equal(resourceKey("company-units"), "company_unit");
  assert.equal(resourceKey("companies"), "company");
  const units = resources.find((r) => r.name === "company-units")!;
  assert.equal(resourceFixtureKey(units), "company_unit");
  assert.equal(find(relations, "company-units", "parent", "companies")?.via, "company");
  assert.equal(find(relations, "companies", "reference", "company-units")?.via, "body.company_unit_id");
  const produced = find(relations, "company-units", "produces", "company-units")!;
  assert.equal(produced.confidence, 60);
});

test("merge preserva revisão, manuais e confirmadas", () => {
  const base = { evidence: ["e1"], confidence: 90, origin: "path" as const };
  const existing = [
    { ...base, id: "a", from: "x", to: "y", kind: "parent" as const, via: "p", status: "rejected" as const },
    { ...base, id: "b", from: "x", to: "z", kind: "parent" as const, via: "q", status: "suggested" as const },
    { ...base, id: "c", from: "x", to: "w", kind: "reference" as const, via: "r", status: "confirmed" as const },
    { ...base, id: "d", from: "m", to: "n", kind: "owner" as const, via: "s", status: "suggested" as const, origin: "manual" as const },
  ];
  const inferred = [
    { ...base, id: "a", from: "x", to: "y", kind: "parent" as const, via: "p", status: "suggested" as const, evidence: ["e2"] },
  ];
  const merged = mergeRelations(existing, inferred);
  assert.deepEqual(merged.map((r) => [r.id, r.status]), [
    ["a", "rejected"],
    ["c", "confirmed"],
    ["d", "suggested"],
  ]);
  assert.deepEqual(merged[0]!.evidence, ["e2"]);
});
