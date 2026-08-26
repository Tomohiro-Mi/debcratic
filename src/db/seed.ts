import "./env";
import { eq } from "drizzle-orm";
import { cats, users, proposals, proposalParameters, proposalCatValues } from "./schema";
import { getDb } from "./index";
import { hashPassword } from "@/lib/auth";

const SEED_CATS = [
  {
    id: "mike",
    name: "ミケ",
    icon: "🐱",
    gender: "メス",
    power: 8,
  },
  {
    id: "chatora",
    name: "茶トラ",
    icon: "🐯",
    gender: "オス",
    power: 6,
  },
  {
    id: "hachiware",
    name: "ハチワレ",
    icon: "😺",
    gender: "オス",
    power: 4,
  },
  {
    id: "sabatora",
    name: "サバトラ",
    icon: "🐆",
    gender: "メス",
    power: 5,
  },
  {
    id: "kuroneko",
    name: "黒猫",
    icon: "🐈‍⬛",
    gender: "オス",
    power: 3,
  },
  {
    id: "shironeko",
    name: "白猫",
    icon: "🐈",
    gender: "メス",
    power: 4,
  },
] as const;

async function main() {
  const db = getDb();
  for (const c of SEED_CATS) {
    await db.insert(cats).values(c).onConflictDoNothing({ target: cats.id });
  }
  console.log(`seeded ${SEED_CATS.length} cats`);

  if (process.env.DEMO_SEED === "1") {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, "demo@example.com"))
      .limit(1);
    let userId = existingUser[0]?.id;
    if (!userId) {
      const [u] = await db
        .insert(users)
        .values({
          name: "デモ管理者",
          email: "demo@example.com",
          passwordHash: await hashPassword("democat99"),
          role: "admin",
        })
        .returning();
      userId = u.id;
      console.log("created demo admin (demo@example.com / democat99)");
    }

    const paramsList = ["利便性重視", "コスト重視", "安全性重視", "労働環境重視"];
    const [proposal] = await db
      .insert(proposals)
      .values({
        title: "大学の学食を24時間営業にするべきか",
        description:
          "深夜まで研究する学生のために学食を24時間営業にすべきかどうか。人件費・防犯・労働環境との両立が課題。",
        authorId: userId,
        deadline: new Date(Date.now() + 14 * 24 * 3600_000),
      })
      .returning();

    await db.insert(proposalParameters).values(
      paramsList.map((name, i) => ({
        proposalId: proposal.id,
        name,
        sortOrder: i,
      })),
    );

    const catRows = await db.select().from(cats).where(eq(cats.active, true));
    const valueMatrix: Record<string, number[]> = {
      mike: [8, 3, 6, 4],
      chatora: [6, 7, 5, 7],
      hachiware: [9, 4, 3, 5],
      sabatora: [5, 6, 7, 6],
      kuroneko: [7, 2, 2, 9],
      shironeko: [4, 8, 9, 6],
    };
    await db.insert(proposalCatValues).values(
      catRows.map((c) => {
        const values: Record<string, number> = {};
        paramsList.forEach((p, i) => {
          values[p] = valueMatrix[c.id]?.[i] ?? 5;
        });
        return { proposalId: proposal.id, catId: c.id, values };
      }),
    );
    console.log(`created demo proposal ${proposal.id} (DEMO_SEED=1)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
