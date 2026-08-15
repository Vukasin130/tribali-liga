import { config } from "./config.ts";

// Real product-usage data (screen views, active users, device mix) as opposed to
// analytics.ts, which reports on the app's own DB (registrations, fantasy
// participation). This proxies HogQL queries to PostHog's Query API server-side so the
// Personal API Key never reaches the client - apps/mobile and apps/desktop only ever
// hold the write-only project token that sends events in.
//
// Inert by design: without POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID set (see
// .env.example), getProductAnalyticsOverview() returns { configured: false } instead of
// throwing, and the Statistika screen shows a setup hint rather than an error.

interface DailyCount {
  day: string;
  count: number;
}

interface PostHogQueryResponse {
  results: unknown[][];
  columns: string[];
}

function isConfigured(): boolean {
  return Boolean(config.posthog.personalApiKey && config.posthog.projectId);
}

async function runHogQL(hogql: string, name: string): Promise<PostHogQueryResponse> {
  const url = `${config.posthog.apiHost}/api/projects/${config.posthog.projectId}/query/`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.posthog.personalApiKey}`
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql }, name })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`PostHog upit nije uspeo (${response.status}): ${text.slice(0, 300)}`);
  }
  return (await response.json()) as PostHogQueryResponse;
}

function rowsToObjects(response: PostHogQueryResponse): Record<string, unknown>[] {
  return response.results.map((row) => {
    const obj: Record<string, unknown> = {};
    response.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

async function scalarCount(hogql: string, name: string): Promise<number> {
  const response = await runHogQL(hogql, name);
  const row = response.results[0];
  return row ? Number(row[0]) || 0 : 0;
}

// PostHog returns one row per day that actually had events, not one row per calendar
// day - fill the missing days with 0 so the trend bars render a full, evenly-spaced
// 30-day strip (same shape as analytics.ts's own dailySeries).
async function dailySeries(hogql: string, name: string): Promise<DailyCount[]> {
  const response = await runHogQL(hogql, name);
  const byDay = new Map<string, number>();
  for (const row of rowsToObjects(response)) {
    const day = String(row.day).slice(0, 10);
    byDay.set(day, Number(row.n) || 0);
  }
  const days: DailyCount[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, count: byDay.get(key) || 0 });
  }
  return days;
}

export async function getProductAnalyticsOverview() {
  if (!isConfigured()) {
    return { configured: false as const };
  }

  const [dauPerDay, screenViewsPerDay, topScreensRes, deviceRes, activeUsers7d, activeUsers30d, totalEvents30d] = await Promise.all([
    dailySeries(
      "select toDate(timestamp) as day, count(distinct distinct_id) as n from events where timestamp >= now() - interval 30 day group by day order by day",
      "dau_per_day"
    ),
    dailySeries(
      "select toDate(timestamp) as day, count() as n from events where event = '$screen' and timestamp >= now() - interval 30 day group by day order by day",
      "screen_views_per_day"
    ),
    runHogQL(
      "select properties.$screen_name as screen, count() as views from events where event = '$screen' and timestamp >= now() - interval 30 day group by screen order by views desc limit 8",
      "top_screens"
    ),
    runHogQL(
      "select properties.$device_type as device, count(distinct distinct_id) as users from events where timestamp >= now() - interval 30 day group by device order by users desc",
      "device_breakdown"
    ),
    scalarCount("select count(distinct distinct_id) as n from events where timestamp >= now() - interval 7 day", "active_users_7d"),
    scalarCount("select count(distinct distinct_id) as n from events where timestamp >= now() - interval 30 day", "active_users_30d"),
    scalarCount("select count() as n from events where timestamp >= now() - interval 30 day", "total_events_30d")
  ]);

  return {
    configured: true as const,
    activeUsers7d,
    activeUsers30d,
    totalEvents30d,
    dauPerDay,
    screenViewsPerDay,
    topScreens: rowsToObjects(topScreensRes).map((row) => ({
      screen: row.screen ? String(row.screen) : "(nepoznato)",
      views: Number(row.views) || 0
    })),
    deviceBreakdown: rowsToObjects(deviceRes).map((row) => ({
      device: row.device ? String(row.device) : "Nepoznato",
      users: Number(row.users) || 0
    }))
  };
}
