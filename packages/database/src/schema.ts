import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const environments = sqliteTable("environments", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  docsUrl: text("docs_url"),
  authType: text("auth_type").notNull().default("NONE"),
  secretRef: text("secret_ref"),
  headersJson: text("headers_json").notNull().default("{}"),
  productionSafetyMode: integer("production_safety_mode", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  loginRecipeJson: text("login_recipe_json"),
});

export const endpoints = sqliteTable("endpoints", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  environmentId: text("environment_id").references(() => environments.id, {
    onDelete: "cascade",
  }),
  method: text("method").notNull(),
  path: text("path").notNull(),
  operationId: text("operation_id"),
  summary: text("summary"),
  description: text("description"),
  parametersJson: text("parameters_json").notNull().default("[]"),
  requestBodySchemaJson: text("request_body_schema_json"),
  responsesJson: text("responses_json").notNull().default("[]"),
  tagsJson: text("tags_json").notNull().default("[]"),
  source: text("source").notNull().default("manual"),
});

export const variables = sqliteTable("variables", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  source: text("source").notNull().default("manual"),
});

export const testSuites = sqliteTable("test_suites", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  optionsJson: text("options_json").notNull().default("{}"),
});

export const testRuns = sqliteTable("test_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  environmentId: text("environment_id")
    .notNull()
    .references(() => environments.id),
  status: text("status").notNull().default("PENDING"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  totalCases: integer("total_cases").notNull().default(0),
  completedCases: integer("completed_cases").notNull().default(0),
  findingsCount: integer("findings_count").notNull().default(0),
  categoriesJson: text("categories_json"),
});

export const testResults = sqliteTable("test_results", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => testRuns.id, { onDelete: "cascade" }),
  endpointId: text("endpoint_id").references(() => endpoints.id),
  testId: text("test_id").notNull(),
  testCaseId: text("test_case_id").notNull(),
  passed: integer("passed", { mode: "boolean" }),
  requestJson: text("request_json"),
  responseJson: text("response_json"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const findings = sqliteTable("findings", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  endpointId: text("endpoint_id").references(() => endpoints.id),
  runId: text("run_id").references(() => testRuns.id),
  testId: text("test_id").notNull(),
  testCaseId: text("test_case_id"),
  title: text("title").notNull(),
  severity: text("severity").notNull(),
  confidence: real("confidence").notNull().default(0),
  status: text("status").notNull().default("OPEN"),
  evidence: text("evidence").notNull(),
  requestJson: text("request_json"),
  responseJson: text("response_json"),
  recommendation: text("recommendation"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
