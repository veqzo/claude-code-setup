import type { PluginServerContext } from "@getpaseo/plugin/server";

export interface Alert {
  title: string;
  body: string;
  /** Same key inside the cooldown sends once. */
  key: string;
  cooldownMs: number;
  /** ntfy priority: 3 default, 4 high. */
  priority: 3 | 4;
  tags: string[];
  agentId?: string;
}

export interface NtfyTarget {
  enabled: boolean;
  url: string;
  topic: string;
}

export interface Delivery {
  push: string;
  ntfy: string;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : "unknown error";
}

// Plugin notifications arrive after the published 0.17.5 SDK, so the type is local
// and the API is detected at runtime.
interface PushApi {
  send(input: {
    title: string;
    body: string;
    key?: string;
    open?: { type: "agent"; agentId: string };
  }): Promise<{ status: string }>;
}

function isPushApi(value: unknown): value is PushApi {
  return typeof value === "object" && value !== null && "send" in value && typeof value.send === "function";
}

async function sendPush(server: PluginServerContext, alert: Alert): Promise<string> {
  const api: unknown = "notifications" in server ? server.notifications : undefined;
  if (!isPushApi(api)) return "unsupported by this Paseo version";
  try {
    const result = await api.send({
      title: alert.title.slice(0, 160),
      body: alert.body.slice(0, 500),
      key: alert.key.slice(0, 128),
      ...(alert.agentId ? { open: { type: "agent" as const, agentId: alert.agentId } } : {}),
    });
    return result.status;
  } catch (error) {
    return `failed: ${errorText(error)}`;
  }
}

/**
 * The token stays in the daemon environment (OpenBao or the compose env file), never
 * in settings. It goes only to the origin in NTFY_URL, so a changed server URL in
 * the settings cannot collect it.
 */
function httpsOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.origin : null;
  } catch {
    return null;
  }
}

export function ntfyAllowed(url: string, configured = process.env.NTFY_URL ?? ""): boolean {
  const origin = httpsOrigin(url);
  return origin !== null && (origin === "https://ntfy.sh" || origin === httpsOrigin(configured));
}

export function tokenFor(url: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.NTFY_TOKEN?.trim();
  const allowed = env.NTFY_URL?.trim();
  if (!token || !allowed) return null;
  const origin = httpsOrigin(url);
  return origin && origin === httpsOrigin(allowed) ? token : null;
}

async function sendNtfy(target: NtfyTarget, alert: Alert): Promise<string> {
  if (!target.enabled || !target.topic) return "off";
  if (!ntfyAllowed(target.url)) return "failed: use https://ntfy.sh or the daemon's NTFY_URL origin";
  const token = tokenFor(target.url);
  const headers: Record<string, string> = {
    Title: alert.title.replace(/[^\x20-\x7e]/g, "?").slice(0, 160),
    Priority: String(alert.priority),
    Tags: alert.tags.join(","),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`${target.url.replace(/\/+$/, "")}/${encodeURIComponent(target.topic)}`, {
      method: "POST",
      redirect: "error",
      headers,
      body: alert.body,
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? "sent" : `failed: HTTP ${response.status}`;
  } catch (error) {
    return `failed: ${errorText(error)}`;
  }
}

export function createNotifier(server: PluginServerContext, now: () => number = Date.now) {
  const lastSent = new Map<string, number>();
  return async (alert: Alert, ntfy: NtfyTarget): Promise<Delivery> => {
    const previous = lastSent.get(alert.key);
    if (previous !== undefined && now() - previous < alert.cooldownMs)
      return { push: "cooldown", ntfy: "cooldown" };
    lastSent.set(alert.key, now());
    const [push, remote] = await Promise.all([sendPush(server, alert), sendNtfy(ntfy, alert)]);
    if (push.startsWith("failed") || remote.startsWith("failed"))
      console.warn(`[quota-guard] notification "${alert.key}": push ${push}, ntfy ${remote}`);
    return { push, ntfy: remote };
  };
}
