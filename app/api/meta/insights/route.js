import { getCampaignInsights } from "../../../../lib/meta";
import { metaRoute } from "../../../../lib/metaRoute";

// GET /api/meta/insights?adAccountId=act_123&datePreset=last_30d
// → métricas por campanha (level=campaign). datePreset é opcional (padrão last_30d).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request) {
  return metaRoute(request, (q) => getCampaignInsights(q.get("adAccountId"), q.get("datePreset") || undefined));
}
