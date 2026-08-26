export interface EventLike {
  type: string;
  turnNumber: number | null;
  createdAt: Date;
  proposalTitle?: string | null;
  payload?: Record<string, unknown>;
}

const HIDDEN_TYPES = new Set([
  "OpinionPowerRule",
  "StanceChangePenalty",
  "SimulationInitialized",
  "SimulationStateUpdated",
  "VoteCast",
]);

export function describeEvent(e: EventLike): { icon: string; text: string } | null {
  if (HIDDEN_TYPES.has(e.type)) return null;
  const p = e.payload ?? {};
  const name = (p.cat_name as string) ?? "";
  const faction = (p.faction as string) ?? "";
  switch (e.type) {
    case "OpinionCreated":
      return { icon: "💬", text: `${name} が新しい意見を投稿しました「${p.snippet ?? ""}」` };
    case "OpinionPointChanged": {
      const before = Number(p.before ?? 0);
      const after = Number(p.after ?? 0);
      const arrow = after > before ? "⬆️" : "⬇️";
      return {
        icon: arrow,
        text: `意見「${p.opinion_snippet ?? ""}」のPointが ${before} → ${after}`,
      };
    }
    case "PowerIncreased":
      return { icon: "📈", text: `${name} の権力が上昇 ${p.before} → ${p.after}` };
    case "PowerDecreased":
      return { icon: "📉", text: `${name} の権力が下降 ${p.before} → ${p.after}` };
    case "FactionCreated":
      return { icon: "🎉", text: `${faction} が結成されました（リーダー: ${p.leader_name ?? "?"}）` };
    case "FactionJoined":
      return { icon: "🤝", text: `${name} が ${faction} に加入しました` };
    case "FactionLeft":
      return { icon: "🚪", text: `${name} が ${faction} を離脱しました（${reasonJa(p.reason)}）` };
    case "FactionDissolved":
      return { icon: "💥", text: `${faction} が解散しました` };
    case "CatBecameIndependent":
      return { icon: "🕊️", text: `${name} が独立しました（権力 ${p.power ?? "?"}）` };
    case "CatExcommunicated":
      return { icon: "⚡", text: `${name} が ${faction || "派閥"} から破門されました` };
    case "ParameterShifted": {
      const dir = p.reason === "assimilation" ? "リーダーへ同化" : "元リーダーへの反発";
      return {
        icon: "🧠",
        text: `${name} の価値観「${p.param}」が ${p.from} → ${p.to}（${dir}）`,
      };
    }
    case "RunoffPending":
      return { icon: "⚖️", text: `同率1位のため決選投票の対象になりました（${p.tied_count ?? "?"}案）` };
    case "RunoffStarted":
      return { icon: "🏁", text: `決選投票が開始されました（${p.count ?? "?"}案）` };
    case "ProposalFinished":
      return { icon: "🏆", text: `議題が締め切られ、意見が採用されました（Point ${p.point ?? "-"}）` };
    default:
      return null;
  }
}

function reasonJa(reason: unknown): string {
  switch (reason) {
    case "independent":
      return "独立";
    case "excommunicated":
      return "破門";
    case "faction_dissolved":
      return "派閥解散";
    default:
      return "離脱";
  }
}
