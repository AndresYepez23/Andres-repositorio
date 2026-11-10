import test from "node:test";
import assert from "node:assert/strict";
import { getPrismaDeveloperCatalog, getPrismaDeveloperWorkflows, planWithPrismaCore, onRequestGet, onRequestPost } from "../src/developer-api.js";

test("catalog mirrors the live Prisma registry without exposing executable internals", () => {
  const catalog = getPrismaDeveloperCatalog({ limit: 100 });
  assert.equal(catalog.source, "AndresYepez23/PRISMA:prisma/src/registry.js");
  assert.ok(catalog.counts.total >= 100);
  assert.equal(catalog.counts.executable, catalog.counts.byStatus.ready + catalog.counts.byStatus.beta);
  assert.ok(catalog.tools.some((tool) => tool.id === "pdf-merge"));
  assert.ok(catalog.tools.some((tool) => tool.id === "ai-assistant"));
  assert.ok(catalog.tools.every((tool) => !("handler" in tool) && !("apiKey" in tool)));
});

test("catalog filters by category, mode and status", () => {
  const catalog = getPrismaDeveloperCatalog({ category: "image", mode: "local", status: "ready", limit: 100 });
  assert.ok(catalog.tools.length > 0);
  assert.ok(catalog.tools.every((tool) => tool.category === "image" && tool.mode === "local" && tool.status === "ready"));
});

test("catalog search finds tools by Spanish names and descriptions", () => {
  const catalog = getPrismaDeveloperCatalog({ query: "metadatos", limit: 100 });
  assert.ok(catalog.tools.some((tool) => tool.id === "image-strip-metadata"));
});

test("Core plan calls the actual smart-flow and offline-intelligence routers", () => {
  const plan = planWithPrismaCore({
    text: "Quita los metadatos y extrae la paleta de colores para web",
    files: [{ name: "foto.png", type: "image/png", size: 1024 }]
  });
  assert.equal(plan.ok, true);
  assert.ok(plan.capabilityContext.includes("CAPACIDADES REALES DE PRISMA SPACE"));
  assert.ok(plan.matches.length > 0);
  assert.ok(["ready", "needs-input", "needs-planning"].includes(plan.planner.type));
  assert.equal(plan.execution.executed, false);
});

test("Core plan refuses oversized or empty requests", () => {
  assert.equal(planWithPrismaCore({ text: "" }).ok, false);
  assert.equal(planWithPrismaCore({ text: "x".repeat(4001) }).ok, false);
});

test("catalog endpoint returns JSON", async () => {
  const response = await onRequestGet({
    request: new Request("https://prismaspace.pages.dev/api/developer/catalog?category=pdf&limit=5")
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.tools.length <= 5);
  assert.ok(data.tools.every((tool) => tool.category === "pdf"));
});

test("plan endpoint validates JSON and returns a Core plan", async () => {
  const response = await onRequestPost({
    request: new Request("https://prismaspace.pages.dev/api/developer/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Busca las herramientas para editar imágenes" })
    })
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.ok(data.counts.total > 0);
});

test("developer catalog exposes the ten original intelligent workflows", () => {
  const workflows = getPrismaDeveloperWorkflows();
  assert.equal(workflows.length, 10);
  assert.ok(workflows.some((workflow) => workflow.id === "image-pipeline"));
  assert.ok(workflows.some((workflow) => workflow.id === "study-studio"));
});
