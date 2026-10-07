import { listAdAccounts } from "../../../../lib/meta";
import { metaRoute } from "../../../../lib/metaRoute";

// GET /api/meta/ad-accounts → contas de anúncios (id, name, account_status, currency)

export const dynamic = "force-dynamic";

export function GET(request) {
  return metaRoute(request, () => listAdAccounts());
}
