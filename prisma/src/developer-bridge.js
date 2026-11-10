import { getPrismaSessionAccessToken, isPrismaAuthenticated } from "./prisma-account.js";
import { getPrismaCoreAttachments, getPrismaCoreExecutionContext } from "./core.js";
import { runTool } from "./engines.js";
import { runWorkflow, workflows } from "./workflows.js";
import { tools } from "./registry.js";

const BRIDGE_URL = "https://prisma-developer-mcp.andressimonyepezarrieta23.workers.dev";
const SESSION_KEY = "prisma-developer-bridge-session-v1";
const HEADERS = { "Content-Type": "application/json" };
let initialized = false;
let running = false;
let pollTimer = 0;
let sessionToken = "";
let activeJob = "";

function dispatchStatus(status, detail = {}) {
  document.dispatchEvent(new CustomEvent("prisma:developer-bridge-status", {
    detail: { status, ...detail }
  }));
}

function metadata(files) {
  return (Array.isArray(files) ? files : []).slice(0, 12).map((file) => ({
    name: String(file?.name || "archivo").slice(0, 180),
    type: String(file?.type || "application/octet-stream").slice(0, 120),
    size: Math.max(0, Number(file?.size) || 0)
  }));
}

function compatibleFiles(tool, files) {
  const accepted = String(tool?.accept || "*/*").split(",").map((value) => value.trim().toLowerCase());
  return files.filter((file) => accepted.includes("*/*") ||
    accepted.some((rule) => rule.startsWith(".")
      ? String(file.name || "").toLowerCase().endsWith(rule)
      : rule.endsWith("/*")
        ? String(file.type || "").toLowerCase().startsWith(rule.slice(0, -1))
        : String(file.type || "").toLowerCase() === rule));
}

function fileFromResult(result, fallbackName = "prisma-resultado.bin") {
  if (result?.blob instanceof Blob) {
    return new File([result.blob], result.filename || fallbackName, {
      type: result.blob.type || "application/octet-stream"
    });
  }
  const artifact = Array.isArray(result?.artifacts)
    ? result.artifacts.find((item) => item?.blob instanceof Blob)
    : null;
  if (artifact) {
    return new File([artifact.blob], artifact.filename || artifact.name || fallbackName, {
      type: artifact.blob.type || artifact.type || "application/octet-stream"
    });
  }
  return null;
}

async function bridgeRequest(path, options = {}) {
  return fetch(BRIDGE_URL + path, {
    ...options,
    cache: "no-store",
    redirect: "error",
    headers: {
      ...HEADERS,
      ...(options.headers || {}),
      ...(sessionToken ? { Authorization: "Bearer " + sessionToken } : {})
    }
  });
}

async function registerSession() {
  if (!isPrismaAuthenticated()) return false;
  const accessToken = await getPrismaSessionAccessToken();
  if (!accessToken) return false;
  const response = await fetch(BRIDGE_URL + "/bridge/register", {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: { ...HEADERS, Authorization: "Bearer " + accessToken },
    body: JSON.stringify({ device: "Prisma Space · " + (navigator.userAgent.includes("Mobile") ? "Móvil" : "Navegador") })
  });
  if (!response.ok) {
    dispatchStatus(response.status === 401 ? "owner-required" : "unavailable", { httpStatus: response.status });
    return false;
  }
  const data = await response.json();
  if (!data?.session_token) return false;
  sessionToken = data.session_token;
  try { sessionStorage.setItem(SESSION_KEY, sessionToken); } catch {}
  dispatchStatus("connected", { sessionId: data.session_id });
  return true;
}

async function ensureSession() {
  if (sessionToken) return true;
  try { sessionToken = sessionStorage.getItem(SESSION_KEY) || ""; } catch {}
  if (sessionToken) {
    const probe = await bridgeRequest("/bridge/poll", {
      method: "POST",
      body: JSON.stringify({ attachments: metadata(getPrismaCoreAttachments()) })
    }).catch(() => null);
    if (probe?.ok) {
      const data = await probe.json();
      if (data?.job) await executeJob(data.job);
      dispatchStatus("connected");
      return true;
    }
    if (probe?.status !== 401) {
      dispatchStatus("unavailable", { httpStatus: probe?.status || 0 });
      return false;
    }
    sessionToken = "";
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  }
  return registerSession();
}

async function postProgress(jobId, progress, message) {
  try {
    const response = await bridgeRequest("/bridge/progress", {
      method: "POST",
      body: JSON.stringify({ job_id: jobId, progress: Math.round(progress * 100), message })
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data.cancelRequested);
  } catch {
    return false;
  }
}

async function uploadArtifact(jobId, artifact) {
  const blob = artifact?.blob;
  if (!(blob instanceof Blob) || !blob.size) return null;
  if (blob.size > 24 * 1024 * 1024) {
    return { warning: (artifact.filename || artifact.name || "Archivo") + " supera el límite de 24 MB para descargas de Prisma Developer." };
  }
  const filename = String(artifact.filename || artifact.name || "prisma-resultado").slice(0, 180);
  const response = await bridgeRequest("/bridge/artifact", {
    method: "POST",
    headers: {
      "Content-Type": blob.type || artifact.type || "application/octet-stream",
      "X-Prisma-Job-Id": jobId,
      "X-Prisma-Filename": encodeURIComponent(filename),
      "X-Prisma-Size": String(blob.size)
    },
    body: blob
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { warning: "No se pudo guardar " + filename + ": " + String(error.error || response.status).slice(0, 120) };
  }
  const data = await response.json();
  return {
    name: String(artifact.name || filename).slice(0, 120),
    filename: data.filename || filename,
    type: blob.type || artifact.type || "application/octet-stream",
    size: blob.size,
    url: data.url,
    expiresAt: data.expiresAt
  };
}

async function collectResult(jobId, result, executionSteps = []) {
  const sourceArtifacts = [];
  if (result?.blob instanceof Blob) sourceArtifacts.push({
    name: result.name || "Resultado",
    filename: result.filename || "prisma-resultado.bin",
    blob: result.blob,
    type: result.blob.type,
    text: result.text
  });
  if (Array.isArray(result?.artifacts)) sourceArtifacts.push(...result.artifacts);
  const artifacts = [];
  const warnings = [...(Array.isArray(result?.warnings) ? result.warnings : [])];
  for (const item of sourceArtifacts.slice(0, 12)) {
    if (!(item?.blob instanceof Blob)) continue;
    const uploaded = await uploadArtifact(jobId, item);
    if (uploaded?.url) artifacts.push(uploaded);
    if (uploaded?.warning) warnings.push(uploaded.warning);
  }
  const text = String(result?.text || sourceArtifacts.find(item => item?.text)?.text || "").slice(0, 18000);
  return {
    summary: String(result?.summary || "La herramienta terminó sin proporcionar un resumen.").slice(0, 3000),
    text,
    steps: [...(Array.isArray(result?.steps) ? result.steps : []), ...executionSteps].slice(0, 20),
    warnings: warnings.slice(0, 20),
    artifacts,
    provider: String(result?.provider || "").slice(0, 100),
    model: String(result?.model || "").slice(0, 160)
  };
}

async function executeSingleTool(job, context) {
  const tool = tools.find((item) => item.id === job.tool_id && ["ready", "beta"].includes(item.status));
  if (!tool) throw new Error("La herramienta no existe o no está habilitada en el registro actual de Prisma.");
  const available = getPrismaCoreAttachments();
  const files = tool.file ? compatibleFiles(tool, available) : [];
  if (tool.file && !files.length) {
    throw new Error("Adjunta un archivo compatible en el panel de archivos de Prisma Core y vuelve a ejecutar la tarea.");
  }
  const params = job.payload?.params && typeof job.payload.params === "object" ? job.payload.params : {};
  return runTool(tool.id, tool.file ? (tool.multiple ? files.slice(0, tool.maxFiles || 8) : files.slice(0, 1)) : [], {
    ...context,
    ...params
  }, (progress, message) => {
    postProgress(job.id, Math.min(0.99, Math.max(0, progress)), message || tool.name).catch(() => {});
  });
}

async function executeWorkflow(job, context) {
  const workflow = workflows.find((item) => item.id === job.workflow_id);
  if (!workflow) throw new Error("El flujo inteligente solicitado no existe en Prisma.");
  const available = getPrismaCoreAttachments();
  const files = workflow.file ? compatibleFiles(workflow, available) : [];
  if (workflow.file && !files.length) {
    throw new Error("Adjunta un archivo compatible en Prisma Core y vuelve a ejecutar el flujo.");
  }
  const params = job.payload?.params && typeof job.payload.params === "object" ? job.payload.params : {};
  return runWorkflow(workflow.id, workflow.file ? (workflow.multiple ? files.slice(0, workflow.maxFiles || 8) : files.slice(0, 1)) : [], {
    ...context,
    ...params
  }, (progress, message) => {
    postProgress(job.id, Math.min(0.99, Math.max(0, progress)), message || workflow.name).catch(() => {});
  });
}

async function executePlan(job, context) {
  const steps = Array.isArray(job.payload?.steps) ? job.payload.steps : [];
  if (!steps.length) throw new Error("Prisma Core no generó pasos ejecutables para esta solicitud.");
  if (steps.length > 10) throw new Error("El plan supera el límite de diez operaciones.");
  let currentFiles = getPrismaCoreAttachments();
  let previousText = "";
  const results = [];
  const stepsDone = [];

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    const tool = tools.find((item) => item.id === step.tool_id && ["ready", "beta"].includes(item.status));
    if (!tool) throw new Error("El paso " + (index + 1) + " utiliza una herramienta no disponible: " + String(step.tool_id || ""));
    const files = tool.file ? compatibleFiles(tool, currentFiles) : [];
    if (tool.file && !files.length) {
      throw new Error("El paso " + (index + 1) + " (" + tool.name + ") necesita un archivo compatible. Adjunta el archivo correspondiente en Prisma Core.");
    }
    const params = step.params && typeof step.params === "object" ? step.params : {};
    const progress = (value, message) => {
      const overall = (index + Math.max(0, Math.min(1, Number(value) || 0))) / steps.length;
      postProgress(job.id, Math.min(0.99, overall), "Paso " + (index + 1) + "/" + steps.length + ": " + (message || tool.name)).catch(() => {});
    };
    const result = await runTool(tool.id, tool.file ? (tool.multiple ? files.slice(0, tool.maxFiles || 8) : files.slice(0, 1)) : [], {
      ...context,
      ...params,
      ...(previousText && !params.text && !params.prompt ? { text: previousText } : {})
    }, progress);
    results.push(result);
    stepsDone.push(tool.name);
    if (result?.text) previousText = String(result.text).slice(0, 18000);
    const outputFile = fileFromResult(result, "prisma-paso-" + (index + 1));
    if (outputFile) currentFiles = [outputFile];
  }

  const last = results[results.length - 1] || {};
  const combinedArtifacts = results.flatMap((result) => [
    ...(result?.blob instanceof Blob ? [{ name: result.filename || "Resultado", filename: result.filename, blob: result.blob, type: result.blob.type, text: result.text }] : []),
    ...(Array.isArray(result?.artifacts) ? result.artifacts : [])
  ]);
  return {
    ...last,
    blob: undefined,
    artifacts: combinedArtifacts,
    text: previousText || last.text || "",
    summary: "Prisma Core completó " + steps.length + " paso(s): " + stepsDone.join(" → ") + ". " + String(last.summary || ""),
    steps: stepsDone,
    warnings: results.flatMap((result) => result?.warnings || [])
  };
}

async function executeJob(job) {
  if (!job?.id || activeJob === job.id) return;
  activeJob = job.id;
  dispatchStatus("executing", { jobId: job.id, kind: job.kind });
  try {
    const context = await getPrismaCoreExecutionContext();
    let result;
    if (job.kind === "tool") result = await executeSingleTool(job, context);
    else if (job.kind === "workflow") result = await executeWorkflow(job, context);
    else if (job.kind === "plan") result = await executePlan(job, context);
    else throw new Error("Tipo de tarea no reconocido por el puente de Prisma.");

    const collected = await collectResult(job.id, result);
    const response = await bridgeRequest("/bridge/complete", {
      method: "POST",
      body: JSON.stringify({ job_id: job.id, kind: job.kind, status: "succeeded", result: collected })
    });
    if (!response.ok) throw new Error("Prisma terminó el proceso, pero no pudo registrar el resultado en el servidor.");
    dispatchStatus("completed", { jobId: job.id, artifacts: collected.artifacts.length });
  } catch (error) {
    const message = String(error?.message || "Error inesperado durante la ejecución.").slice(0, 1200);
    await bridgeRequest("/bridge/complete", {
      method: "POST",
      body: JSON.stringify({
        job_id: job.id,
        kind: job.kind,
        status: "failed",
        error: message,
        result: { summary: "La ejecución no pudo completarse.", warnings: [message], steps: [], artifacts: [] }
      })
    }).catch(() => {});
    dispatchStatus("failed", { jobId: job.id, message });
  } finally {
    activeJob = "";
  }
}

async function pollOnce() {
  if (!running || !sessionToken || activeJob) return;
  const response = await bridgeRequest("/bridge/poll", {
    method: "POST",
    body: JSON.stringify({ attachments: metadata(getPrismaCoreAttachments()) })
  }).catch(() => null);
  if (!response) {
    schedulePoll(8000);
    return;
  }
  if (response.status === 401) {
    sessionToken = "";
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    if (isPrismaAuthenticated()) await registerSession();
    schedulePoll(1500);
    return;
  }
  if (!response.ok) {
    schedulePoll(8000);
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (data?.job) {
    await executeJob(data.job);
    schedulePoll(500);
    return;
  }
  schedulePoll(document.hidden ? 12000 : (data.pollAfterMs || 3000));
}

function schedulePoll(delay = 3000) {
  clearTimeout(pollTimer);
  if (!running) return;
  pollTimer = setTimeout(() => pollOnce().catch(() => schedulePoll(8000)), delay);
}

async function startBridge() {
  if (!isPrismaAuthenticated()) return;
  running = true;
  const ok = await ensureSession();
  if (ok) schedulePoll(300);
}

async function stopBridge() {
  running = false;
  clearTimeout(pollTimer);
  if (sessionToken) {
    bridgeRequest("/bridge/unregister", { method: "POST", body: "{}" }).catch(() => {});
  }
  sessionToken = "";
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  dispatchStatus("disconnected");
}

export function initPrismaDeveloperBridge() {
  if (initialized) return;
  initialized = true;
  document.addEventListener("prisma:auth-session-changed", (event) => {
    if (event.detail?.authenticated) startBridge().catch((error) => {
      dispatchStatus("unavailable", { message: String(error?.message || error).slice(0, 180) });
    });
    else stopBridge().catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (running && !activeJob) schedulePoll(document.hidden ? 12000 : 300);
  });
  if (isPrismaAuthenticated()) startBridge().catch((error) => {
    dispatchStatus("unavailable", { message: String(error?.message || error).slice(0, 180) });
  });
}
