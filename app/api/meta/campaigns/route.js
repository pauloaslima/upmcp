import { listCampaigns } from "../../../../lib/meta";
import { metaRoute } from "../../../../lib/metaRoute";

// GET /api/meta/campaigns?adAccountId=act_123
// → campanhas (id, name, status, effective_status, daily_budget, lifetime_budget)

export const dynamic = "force-dynamic";

export function GET(request) {
  return metaRoute(request, (q) => listCampaigns(q.get("adAccountId")));
}
