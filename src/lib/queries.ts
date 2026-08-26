import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  cats,
  events,
  factions,
  factionMemberships,
  opinions,
  proposalParameters,
  proposalCatValues,
  proposals,
  turns,
  users,
  votes,
} from "@/db/schema";
import type { VoteFactor } from "@/db/schema";
import { getDb } from "@/db";
import { getEffectiveSettings } from "@/lib/settings";
import {
  createInitialProposalSimulationState,
  parseProposalSimulationState,
  PROPOSAL_STATE_EVENT_TYPES,
  type ProposalSimulationState,
} from "@/lib/proposal-state";

export interface FactionInfo {
  id: string;
  name: string;
  leaderId: string;
  leaderName: string;
}

export async function getActiveCats() {
  return getDb()
    .select()
    .from(cats)
    .where(eq(cats.active, true))
    .orderBy(desc(cats.power), asc(cats.name));
}

export async function getSocietyState() {
  const catRows = await getActiveCats();
  const factionRows = await getDb().select().from(factions).where(eq(factions.status, "active"));
  const msRows = await getDb()
    .select()
    .from(factionMemberships)
    .where(isNull(factionMemberships.leftTurn));

  const nameById = new Map(catRows.map((c) => [c.id, c.name]));
  const memByCat = new Map<string, { factionId: string; role: "leader" | "follower" }>();
  for (const m of msRows) {
    if (!memByCat.has(m.catId)) {
      const f = factionRows.find((x) => x.id === m.factionId);
      if (!f) continue;
      memByCat.set(m.catId, {
        factionId: m.factionId,
        role: f.leaderId === m.catId ? "leader" : "follower",
      });
    }
  }

  const catsView = catRows.map((c) => {
    const mem = memByCat.get(c.id) ?? null;
    const f = mem ? factionRows.find((x) => x.id === mem.factionId) : undefined;
    const leader = f && c.id !== f.leaderId ? nameById.get(f.leaderId) ?? null : null;
    return {
      ...c,
      factionName: f ? `${nameById.get(f.leaderId) ?? f.name}派` : null,
      role: mem?.role ?? null,
      leaderName: leader,
    };
  });

  const factionsView = factionRows
    .map((f) => ({
      ...f,
      name: `${nameById.get(f.leaderId) ?? f.name}派`,
      leaderName: nameById.get(f.leaderId) ?? f.leaderId,
      members: catsView.filter((c) => c.factionId === f.id),
    }))
    .sort((a, b) => b.members.length - a.members.length);

  return { catsView, factionsView };
}

export async function getProposalSocietyState(pid: string) {
  const db = getDb();
  const [catRows, stateRows] = await Promise.all([
    db.select().from(cats).where(eq(cats.active, true)),
    db
      .select({ payload: events.payload })
      .from(events)
      .where(
        and(
          eq(events.proposalId, pid),
          inArray(events.type, [...PROPOSAL_STATE_EVENT_TYPES]),
        ),
      )
      .orderBy(desc(events.id))
      .limit(1),
  ]);

  let state = parseProposalSimulationState(stateRows[0]?.payload);
  if (!state) {
    const factionRows = await db.select().from(factions).where(eq(factions.status, "active"));
    state = createInitialProposalSimulationState(catRows, factionRows);
  }
  return buildProposalSocietyState(catRows, state);
}

function buildProposalSocietyState(
  catRows: Awaited<ReturnType<typeof getActiveCats>>,
  state: ProposalSimulationState,
) {
  const nameById = new Map(catRows.map((cat) => [cat.id, cat.name]));
  const factionByKey = new Map(state.factions.map((faction) => [faction.key, faction]));
  const catsView = catRows
    .filter((cat) => state.cats[cat.id])
    .map((cat) => {
      const stateCat = state.cats[cat.id];
      const faction = stateCat.factionKey ? factionByKey.get(stateCat.factionKey) : undefined;
      const leaderName = faction ? nameById.get(faction.leaderId) ?? null : null;
      return {
        ...cat,
        power: stateCat.power,
        factionId: faction?.key ?? null,
        leaderId: faction?.leaderId ?? null,
        factionName: faction ? `${leaderName ?? faction.name}派` : null,
        role: stateCat.role,
        leaderName: stateCat.role === "follower" ? leaderName : null,
      };
    });

  const factionsView = state.factions
    .map((faction) => ({
      ...faction,
      id: faction.key,
      name: `${nameById.get(faction.leaderId) ?? faction.name}派`,
      leaderName: nameById.get(faction.leaderId) ?? faction.leaderId,
      members: catsView.filter((cat) => cat.factionId === faction.key),
    }))
    .sort((a, b) => b.members.length - a.members.length);

  return { catsView, factionsView };
}

export async function getHomeProposals() {
  const rows = await getDb()
    .select({ p: proposals, authorName: users.name })
    .from(proposals)
    .leftJoin(users, eq(proposals.authorId, users.id))
    .where(isNull(proposals.deletedAt))
    .orderBy(desc(proposals.createdAt))
    .limit(30);

  const ids = rows.map((r) => r.p.id);
  const opRows =
    ids.length > 0
      ? await getDb()
          .select()
          .from(opinions)
          .where(and(inArray(opinions.proposalId, ids), isNull(opinions.deletedAt)))
      : [];

  const byProposal = new Map<string, typeof opRows>();
  for (const o of opRows) {
    const arr = byProposal.get(o.proposalId) ?? [];
    arr.push(o);
    byProposal.set(o.proposalId, arr);
  }

  return rows.map((r) => {
    const ops = (byProposal.get(r.p.id) ?? []).filter((o) => o.eligible || r.p.status !== "RUNOFF");
    const top = [...ops].sort((a, b) => b.point - a.point)[0] ?? null;
    return {
      ...r.p,
      authorName: r.authorName,
      opinionCount: ops.length,
      topOpinion: top
        ? { id: top.id, snippet: top.content.slice(0, 60), point: top.point }
        : null,
    };
  });
}

export async function getProposalDetail(pid: string) {
  const db = getDb();
  const row = (
    await db
      .select({ p: proposals, authorName: users.name })
      .from(proposals)
      .leftJoin(users, eq(proposals.authorId, users.id))
      .where(and(eq(proposals.id, pid), isNull(proposals.deletedAt)))
      .limit(1)
  )[0];
  if (!row) return null;

  const paramRows = await db
    .select()
    .from(proposalParameters)
    .where(eq(proposalParameters.proposalId, pid))
    .orderBy(asc(proposalParameters.sortOrder));

  const cvRows = await db
    .select({ v: proposalCatValues })
    .from(proposalCatValues)
    .innerJoin(cats, and(eq(proposalCatValues.catId, cats.id), eq(cats.active, true)))
    .where(eq(proposalCatValues.proposalId, pid));
  const cvByCat = cvRows.map((r) => ({ catId: r.v.catId, values: r.v.values ?? {} }));

  const society = await getProposalSocietyState(pid);
  const settings = await getEffectiveSettings();

  const opRows = await db
    .select({ o: opinions, authorName: users.name })
    .from(opinions)
    .leftJoin(users, eq(opinions.authorId, users.id))
    .where(and(eq(opinions.proposalId, pid), isNull(opinions.deletedAt)))
    .orderBy(desc(opinions.point), asc(opinions.createdAt));

  const voteRows = await db
    .select({
      opinionId: votes.opinionId,
      catId: votes.catId,
      score: votes.score,
      stance: votes.stance,
      reason: votes.reason,
      confidence: votes.confidence,
      factors: votes.factors,
      model: votes.model,
      turnNumber: turns.number,
      createdAt: votes.createdAt,
    })
    .from(votes)
    .innerJoin(turns, eq(votes.turnId, turns.id))
    .where(eq(turns.proposalId, pid))
    .orderBy(desc(turns.number), desc(votes.createdAt));

  const latestVotes = new Map<string, (typeof voteRows)[number]>();
  for (const v of voteRows) {
    const k = `${v.opinionId}:${v.catId}`;
    if (!latestVotes.has(k)) latestVotes.set(k, v);
  }

  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.proposalId, pid))
    .orderBy(desc(events.id))
    .limit(80);

  const adoptedOpinion = row.p.adoptedOpinionId
    ? opRows.find((o) => o.o.id === row.p.adoptedOpinionId) ?? null
    : null;

  return {
    proposal: { ...row.p, authorName: row.authorName },
    params: paramRows,
    catValues: cvByCat,
    ...society,
    opinions: opRows.map((o) => ({
      ...o.o,
      authorName: o.authorName,
    })),
    latestVotes,
    events: eventRows,
    adoptedOpinion,
    runoffTurnLimitRow: settings.runoffTurnLimit,
    runoffVoteIntervalMinutes: settings.runoffVoteIntervalMinutes,
  };
}

export async function getCatProfile(
  catId: string,
  options: { includeProposalData?: boolean } = {},
) {
  const db = getDb();
  const includeProposalData = options.includeProposalData ?? true;
  const cat = (
    await db.select().from(cats).where(and(eq(cats.id, catId), eq(cats.active, true))).limit(1)
  )[0];
  if (!cat) return null;

  const society = await getSocietyState();
  const me = society.catsView.find((c) => c.id === catId)!;
  const myFaction = me.factionName
    ? society.factionsView.find((f) => f.name === me.factionName) ?? null
    : null;

  const powerEvents = await db
    .select({
      id: events.id,
      turnNumber: events.turnNumber,
      payload: events.payload,
    })
    .from(events)
    .leftJoin(proposals, eq(events.proposalId, proposals.id))
    .where(
      and(
        inArray(events.type, ["PowerIncreased", "PowerDecreased"]),
        or(isNull(events.proposalId), isNull(proposals.deletedAt)),
      ),
    )
    .orderBy(asc(events.id))
    .limit(2000);
  const myPowerEvents = powerEvents.filter(
    (e) => e.payload["cat_id"] === catId,
  );

  const recentVotes = includeProposalData
    ? await db
        .select({
          score: votes.score,
          stance: votes.stance,
          reason: votes.reason,
          createdAt: votes.createdAt,
          turnNumber: turns.number,
          content: opinions.content,
          proposalId: opinions.proposalId,
          proposalTitle: proposals.title,
        })
        .from(votes)
        .innerJoin(turns, eq(votes.turnId, turns.id))
        .innerJoin(opinions, eq(votes.opinionId, opinions.id))
        .innerJoin(proposals, eq(opinions.proposalId, proposals.id))
        .where(
          and(
            eq(votes.catId, catId),
            isNull(opinions.deletedAt),
            isNull(proposals.deletedAt),
          ),
        )
        .orderBy(desc(votes.createdAt))
        .limit(20)
    : [];

  const allEventsForCat = (types: string[]) =>
    db
      .select({
        id: events.id,
        type: events.type,
        turnNumber: events.turnNumber,
        payload: events.payload,
        createdAt: events.createdAt,
        proposalTitle: proposals.title,
      })
      .from(events)
      .leftJoin(proposals, eq(events.proposalId, proposals.id))
      .where(
        and(
          inArray(events.type, types),
          or(isNull(events.proposalId), isNull(proposals.deletedAt)),
        ),
      )
      .orderBy(desc(events.id))
      .limit(600);

  const [stanceChangesRaw, factionEventsRaw] = await Promise.all([
    includeProposalData ? allEventsForCat(["VoteChanged"]) : Promise.resolve([]),
    allEventsForCat([
      "FactionCreated",
      "FactionJoined",
      "FactionLeft",
      "CatBecameIndependent",
      "CatExcommunicated",
    ]),
  ]);

  const filterByCat = <T extends { type: string; payload: Record<string, unknown> }>(rows: T[]) =>
    rows
      .filter(
        (r) =>
          r.payload["cat_id"] === catId ||
          (r.type === "FactionCreated" && r.payload["leader_id"] === catId),
      )
      .slice(0, 30);

  const factionEvents = filterByCat(factionEventsRaw).map((e) => ({
    id: e.id,
    turnNumber: e.turnNumber,
    createdAt: e.createdAt,
    payload: e.payload,
    text: describeCatFactionEvent(e.type, e.payload),
  }));

  return {
    cat: me,
    faction: myFaction,
    followers: myFaction
      ? myFaction.members.filter((m) => m.role === "follower")
      : [],
    powerEvents: myPowerEvents.map((e) => ({
      turnNumber: e.turnNumber ?? 0,
      before: Number(e.payload["before"] ?? 0),
      after: Number(e.payload["after"] ?? 1),
    })),
    recentVotes,
    stanceChanges: filterByCat(stanceChangesRaw),
    factionEvents,
  };
}

function describeCatFactionEvent(type: string, payload: Record<string, unknown>): string {
  const faction = String(payload["faction"] ?? "派閥");
  if (type === "FactionCreated") return `${faction}を結成しました`;
  if (type === "FactionJoined") return `${faction}に加入しました`;
  if (type === "CatBecameIndependent") return `${faction}から独立しました`;
  if (type === "CatExcommunicated") return `${faction}から破門されました`;
  return `${faction}を離脱しました`;
}

export type LatestVoteRow = {
  opinionId: string;
  catId: string;
  score: number;
  stance: string;
  reason: string;
  confidence: number;
  factors: VoteFactor[];
  model: string;
  turnNumber: number;
};
