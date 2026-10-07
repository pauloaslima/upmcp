import { getCampaignInsights } from "../../../../lib/meta";
import { metaRoute } from "../../../../lib/metaRoute";

// GET /api/meta/insights?adAccountId=act_123&datePreset=last_30d  ou  ?adAccountId=act_123&since=2026-09-01&until=2026-09-30
// → métricas por campanha (level=campaign). datePreset é opcional (padrão last_30d).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request) {
  return metaRoute(request, (q) =>
    getCampaignInsights(q.get("adAccountId"), q.get("datePreset") || undefined, q.get("since") || q.get("until") ? { since: q.get("since"), until: q.get("until") } : null)
  );
}
