import "./env";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./index";
import { opinions, proposals, votes, events, cats, turns } from "./schema";
import { executeTurn } from "@/lib/rules/turn";

async function main() {
  const db = getDb();
  const proposal = (
    await db.select().from(proposals).where(eq(proposals.status, "OPEN")).limit(1)
  )[0];
  if (!proposal) throw new Error("no open proposal");

  const [opinion] = await db
    .insert(opinions)
    .values({
      proposalId: proposal.id,
      content:
        "学食は24時間営業にするべきだと思います。深夜に研究している学生にとって救いです。運営は深夜帯セルフレジ中心で人件費を抑えられます。",
      nextVoteDue: new Date(),
    })
    .returning();

  const r = await executeTurn({
    proposalId: proposal.id,
    kind: "initial",
    dueOpinionIds: [opinion.id],
  });
  console.log("executeTurn:", r);

  const voteRows = await db.select().from(votes);
  console.log(
    "votes:",
    voteRows.map((v) => `${v.catId}:${v.score > 0 ? "+" : ""}${v.score}(${v.stance})`).join(" "),
  );
  console.log("point:", voteRows.reduce((a, v) => a + v.score, 0));

  const powerRows = await db
    .select()
    .from(cats)
    .where(eq(cats.active, true))
    .orderBy(sql`power desc`);
  console.log(
    "powers:",
    powerRows.map((c) => `${c.name}=${c.power}`).join(" "),
  );

  const eventRows = await db.select().from(events).orderBy(events.id);
  console.log(
    "events:",
    eventRows.map((e) => e.type).join(","),
  );

  const turnRows = await db.select().from(turns);
  console.log("turns:", turnRows.length);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
