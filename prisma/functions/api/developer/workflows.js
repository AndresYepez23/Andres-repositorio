import { getPrismaDeveloperWorkflows } from "../../../src/developer-api.js";

export async function onRequestGet() {
  return new Response(JSON.stringify({ source: "AndresYepez23/PRISMA:prisma/src/workflow-catalog.js", workflows: getPrismaDeveloperWorkflows() }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
