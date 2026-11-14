import {assessQwenCorePlanCoverage} from './qwen-core-plan-coverage.js';
import {toolContract} from './queen-contracts.js';
import { planCapabilityRequest, isInformationalIntent } from './core-capabilities.js';
import { planFileConversion } from './file-conversions.js';
import { tools, categories } from "./registry.js";
import {
  coreToolCatalog,
  searchCoreTools,
  planCoreOfflineAction,
  describeCoreTools,
  coreCapabilityContext
} from "./core-tool-intelligence.js";
import { buildSmartLocalFlow } from "./smart-flows.js";
import { workflowCatalog } from "./workflow-catalog.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function publicTool(tool) {
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    category: tool.category,
    icon: tool.icon,
    status: tool.status,
    mode: tool.mode,
    file: Boolean(tool.file),
    multiple: Boolean(tool.multiple),
    maxFiles: tool.maxFiles || null,
    accept: tool.accept || null,
    tag: tool.tag || null,
    contract: toolContract(tool)
  };
}

function safeFiles(value) {
  if (!Array.isArray(value)) return [];
  if(value.length>20)throw new Error('Máximo 20 archivos; no se truncará el lote.');
  return value.map((file) => ({
    name: String(file?.name || "archivo").slice(0, 180),
    type: String(file?.type || "application/octet-stream").slice(0, 120),
    size: Math.max(0, Math.min(50 * 1024 * 1024, Number(file?.size) || 0))
  }));
}

function counts(list) {
  const count = (key) => Object.fromEntries(
    [...new Set(list.map((item) => item[key]).filter(Boolean))]
      .map((value) => [value, list.filter((item) => item[key] === value).length])
  );
  return {
    total: list.length,
    executable: list.filter((item) => ["ready", "beta"].includes(item.status)).length,
    byStatus: count("status"),
    byMode: count("mode"),
    byCategory: count("category")
  };
}

export function getPrismaDeveloperCatalog({ query = "", category = "", status = "", mode = "", limit = 30, offset = 0 } = {}) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("es");
  const all = tools.map(publicTool);
  const filtered = all.filter((tool) => {
    if (category && tool.category !== category) return false;
    if (status && tool.status !== status) return false;
    if (mode && tool.mode !== mode) return false;
    if (!normalizedQuery) return true;
    const haystack = [tool.id, tool.name, tool.description, tool.category, tool.tag].join(" ").toLocaleLowerCase("es");
    return haystack.includes(normalizedQuery);
  });
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 30)));
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
  return {
    source: "AndresYepez23/PRISMA:prisma/src/registry.js",
    categories: categories.filter((item) => item.id !== "all").map(({ id, name, icon }) => ({ id, name, icon })),
    counts: counts(all),
    filteredCount: filtered.length,
    offset: safeOffset,
    limit: safeLimit,
    tools: filtered.slice(safeOffset, safeOffset + safeLimit)
  };
}

export function getPrismaDeveloperWorkflows() {
  return workflowCatalog.map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    icon: workflow.icon,
    tag: workflow.tag,
    file: Boolean(workflow.file),
    multiple: Boolean(workflow.multiple),
    maxFiles: workflow.maxFiles || null,
    accept: workflow.accept || null
  }));
}

export function planWithPrismaCore({ text = "", files = [], history = [] } = {}) {
  const request = String(text || "").trim();
  if (request.length < 2 || request.length > 4000) {
    return { ok: false, error: "La solicitud debe tener entre 2 y 4000 caracteres." };
  }

  if(Array.isArray(files)&&files.length>20)return {ok:false,error:'Máximo 20 archivos; no se omitirá ninguno.'};
  const safeAttachments = safeFiles(files);
  const recent = Array.isArray(history)
    ? history.slice(-6).map((item) => String(item || "").slice(0, 1500))
    : [];

  const matches = searchCoreTools(request, safeAttachments, 12).map((tool) => ({
    ...publicTool(tool),
    rank: Number(tool.rank) || 0,
    related: Array.isArray(tool.related) ? tool.related : []
  }));

  let smartFlow = null;
  let offlinePlan = null;
  try {
    smartFlow = buildSmartLocalFlow(request, safeAttachments, recent);
  } catch (error) {
    smartFlow = { type: "error", message: String(error?.message || "No se pudo evaluar el flujo inteligente."), steps: [] };
  }
  try {
    offlinePlan = planCoreOfflineAction(request, safeAttachments, recent);
  } catch (error) {
    offlinePlan = { type: "error", message: String(error?.message || "No se pudo evaluar el plan de Core."), steps: [] };
  }

  const ready = (candidate) => candidate && candidate.type === "ready" && Array.isArray(candidate.steps) && candidate.steps.length;
  const needsInput = (candidate) => candidate && candidate.type === "needs-input";
  const readyCandidates = [
    ready(smartFlow) ? { source: "prisma-smart-flows", ...smartFlow } : null,
    ready(offlinePlan) ? { source: "prisma-core-offline-intelligence", ...offlinePlan } : null
  ].filter(Boolean);
  // Use the same capability and conversion resolvers as the user-facing Core.
  // A newer format follow-up must never revive an older PDF split.
  const capabilityPlan = planCapabilityRequest(request,safeAttachments);
  // An informational question cannot become a destructive conversion through
  // a lower-priority text matcher (e.g. "¿Puedes convertir este PDF?").
  const conversionPlan = isInformationalIntent(request)?null:planFileConversion(request,safeAttachments,recent);
  // A multi-step request outranks a single conversion; do not silently
  // discard "compress" when someone asks "compress and convert to PNG".
  const bestReady = ready(capabilityPlan)&&capabilityPlan.steps.length>1
    ? {source:"prisma-core-capabilities",...capabilityPlan}
    : ready(conversionPlan)?{source:"prisma-conversion-routing",...conversionPlan}
    : ready(capabilityPlan)?{source:"prisma-core-capabilities",...capabilityPlan}:null;
  const selected = bestReady || (capabilityPlan
    ? {source:"prisma-core-capabilities",...capabilityPlan}
    : conversionPlan
      ? {source:"prisma-conversion-routing",...conversionPlan}
      : readyCandidates.length
        ? readyCandidates.sort((a, b) => b.steps.length - a.steps.length ||
          (a.source === "prisma-smart-flows" ? -1 : 1))[0]
        : needsInput(smartFlow)
          ? { source: "prisma-smart-flows", ...smartFlow }
          : needsInput(offlinePlan)
            ? { source: "prisma-core-offline-intelligence", ...offlinePlan }
            : null);

  const toolIndex = new Map(tools.map((tool) => [tool.id, tool]));
  const steps = (selected?.steps || []).map((step, index) => {
    const tool = toolIndex.get(String(step.tool_id || ""));
    return {
      index: index + 1,
      tool_id: step.tool_id,
      tool_name: tool?.name || step.tool_id,
      status: tool?.status || "unknown",
      mode: tool?.mode || "unknown",
      reason: String(step.reason || "Paso propuesto por Prisma Core"),
      params: step.params && typeof step.params === "object" ? step.params : {}
    };
  });

  // A tool may be relevant without satisfying every explicit objective.
  // Incomplete deterministic proposals must go to semantic planning instead
  // of being presented as completed, executable workflows.
  const coverage=assessQwenCorePlanCoverage(request,steps);
  const incomplete=selected?.type==='ready'&&coverage.needsSemanticReview;

  return {
    ok: true,
    request,
    attachmentMetadata: safeAttachments,
    capabilityContext: coreCapabilityContext(),
    capabilitySummary: describeCoreTools(request, safeAttachments),
    counts: counts(tools),
    matches,
    planner: {
      source: incomplete ? "qwen-core-goal-review" : selected?.source || "prisma-core-catalog",
      type: incomplete ? "needs-planning" : selected?.type || "needs-planning",
      message: incomplete ? "El plan local no cubre todas las condiciones de la solicitud. Se requiere una planificación más completa." : selected?.message || "Prisma Core no encontró un flujo determinista de alta confianza para esta solicitud. Se requiere planificación semántica adicional.",
      steps: incomplete ? [] : steps,
      ...(incomplete ? {goalCoverage:coverage} : {})
    },
    execution: {
      executed: false,
      requiresBrowserRuntime: steps.some((step) => ["local", "browser"].includes(step.mode)),
      note: "Este endpoint consulta el catálogo y los planificadores reales de Prisma Core. Todavía no ejecuta herramientas ni modifica el proyecto."
    }
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const catalog = getPrismaDeveloperCatalog({
    query: url.searchParams.get("q") || "",
    category: url.searchParams.get("category") || "",
    status: url.searchParams.get("status") || "",
    mode: url.searchParams.get("mode") || "",
    limit: url.searchParams.get("limit") || 30,
    offset: url.searchParams.get("offset") || 0
  });
  return json(catalog);
}

export async function onRequestPost({ request }) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 24000) return json({ ok: false, error: "La solicitud supera el tamaño permitido." }, 413);
  let payload;
  try {
    const raw = await request.text();
    if (raw.length > 24000) return json({ ok: false, error: "La solicitud supera el tamaño permitido." }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "El cuerpo debe ser JSON válido." }, 400);
  }
  const result = planWithPrismaCore(payload || {});
  return json(result, result.ok ? 200 : 400);
}
