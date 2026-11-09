import { getOpenRouterLimits } from "../../_lib/openrouter.js";
import { getProviderUsage } from "../../_lib/limits.js";
import { getProviderHold } from "../../_lib/provider-health.js";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function onRequestGet({ env }) {
  const configured = Boolean(env.OPENROUTER_API_KEY);
  if (!configured) {
    return new Response(JSON.stringify({
      ok: true,
      configured: false,
      available: false,
      model: "openrouter/free",
      warning: "Falta OPENROUTER_API_KEY en los secretos de Cloudflare.",
    }), { status: 200, headers });
  }

  const limits = await getOpenRouterLimits(env);
  const usage = await getProviderUsage(env, "openrouter", limits.dailyLimit, limits.perMinuteLimit);
  const hold = await getProviderHold(env, "openrouter");
  const account = limits.account;
  return new Response(JSON.stringify({
    ok: true,
    configured: true,
    available: !hold && Boolean(env.PRISMA_RATE_DB?.prepare),
    model: "openrouter/free",
    dailyLimit: limits.dailyLimit,
    perMinuteLimit: limits.perMinuteLimit,
    usage,
    account: account ? {
      isFreeTier: account.isFreeTier,
      externalFreeDailyLimit: account.isFreeTier ? 50 : 1000,
      dailySpendUsd: account.dailySpendUsd,
      spendLimitUsd: account.spendLimitUsd,
      spendRemainingUsd: account.spendRemainingUsd,
      spendLimitReset: account.spendLimitReset,
    } : null,
    hold: hold ? {
      state: hold.state,
      reason: hold.reason,
      validUntil: hold.valid_until,
    } : null,
    controls: {
      dailyVariable: "OPENROUTER_DAILY_LIMIT",
      perMinuteVariable: "OPENROUTER_PER_MINUTE_LIMIT",
      perIpMinuteLimit: 10,
      perIpDailyLimit: 30,
      note: "Los topes internos pueden reducir, nunca superar, el límite gratuito real de la cuenta.",
    },
  }), { status: 200, headers });
}
