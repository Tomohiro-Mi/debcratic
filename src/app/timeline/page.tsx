import { getGlobalEvents } from "@/lib/queries";
import { TimelineList } from "@/components/TimelineList";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const rows = await getGlobalEvents(200);
  const events = rows.map((r) => ({
    id: r.id,
    type: r.type,
    turnNumber: r.turnNumber,
    payload: r.payload,
    createdAt: r.createdAt,
    proposalTitle: r.proposalTitle,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black">🐾 猫社会タイムライン</h1>
        <p className="mt-1 text-sm text-stone-500">
          権力の移動、派閥の興亡、思想の変化。でぶねこ社会で起きたすべての出来事。
        </p>
      </div>
      <TimelineList events={events} showProposal />
    </div>
  );
}
