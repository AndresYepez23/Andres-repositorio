import { getOpenRouterLimits } from "../../_lib/openrouter.js";
import { getProviderUsage, OPENROUTER_VISITOR_LIMITS } from "../../_lib/limits.js";
import { getProviderHold } from "../../_lib/provider-health.js";
import { getCredentialSlots } from "../../_lib/credential-pool.js";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function onRequestGet({ env }) {
  const configured = getCredentialSlots(env,"openrouter").length>0;
  if (!configured) {
    return new Response(JSON.stringify({
      ok: true,
      configured: false,
      available: false,
      model: "openrouter/free",
      warning: "Falta OPENROUTER_API_KEYS_JSON o OPENROUTER_API_KEY en los secretos de Cloudflare.",
    }), { status: 200, headers });
  }

  const limits = await getOpenRouterLimits(env);
  const usage = await getProviderUsage(env, "openrouter", limits.dailyLimit, limits.perMinuteLimit);
  const hold = await getProviderHold(env, "openrouter");
  const account = limits.account;
  return new Response(JSON.stringify({
    ok: true,
    configured: true,
    credentialCount: getCredentialSlots(env,"openrouter").length,
    credentialLimit: 6,
    available: !hold && Boolean(env.PRISMA_RATE_DB?.prepare),
    model: "openrouter/free",
    dailyLimit: limits.dailyLimit,
    perMinuteLimit: limits.perMinuteLimit,
    usage,
    account: account ? {
      isFreeTier: account.isFreeTier,
      externalFreeDailyLimit: Number(account.freeModelDaily?.limit) > 0 ? Number(account.freeModelDaily.limit) : account.isFreeTier ? 50 : 1000,
    } : null,
    hold: hold ? {
      state: hold.state,
      reason: hold.reason,
      validUntil: hold.valid_until,
    } : null,
    controls: {
      dailyVariable: "OPENROUTER_DAILY_LIMIT",
      perMinuteVariable: "OPENROUTER_PER_MINUTE_LIMIT",
      perIpMinuteLimit: OPENROUTER_VISITOR_LIMITS.perMinute,
      perIpDailyLimit: OPENROUTER_VISITOR_LIMITS.perDay,
      note: "Los topes internos pueden reducir, nunca superar, el límite gratuito real de la cuenta.",
    },
  }), { status: 200, headers });
}
