"use client";

import { useRef, useState, type FormEvent } from "react";
import { createProposalAction } from "@/app/actions/proposals";
import { CatAvatar } from "@/components/CatAvatar";
import { MAX_PROPOSAL_PARAMETERS } from "@/lib/constants";

export interface CatOption {
  id: string;
  name: string;
  icon: string;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DEFAULT_DEADLINE = toLocalInputValue(
  new Date(Date.now() + 7 * 24 * 3600_000),
);

interface ParamRow {
  id: number;
  name: string;
  values: Record<string, number>;
}

function createParamRow(id: number, cats: CatOption[], randomize: boolean): ParamRow {
  return {
    id,
    name: "",
    values: Object.fromEntries(
      cats.map((cat) => [cat.id, randomize ? Math.floor(Math.random() * 10) + 1 : 5]),
    ),
  };
}

export function ProposalForm({ cats }: { cats: CatOption[] }) {
  const nextParamId = useRef(3);
  const [paramRows, setParamRows] = useState<ParamRow[]>(() => [
    createParamRow(1, cats, false),
    createParamRow(2, cats, false),
  ]);

  const setParam = (id: number, name: string) => {
    setParamRows((prev) => prev.map((row) => (row.id === id ? { ...row, name } : row)));
  };

  const addParam = (randomize: boolean) => {
    setParamRows((prev) => {
      if (prev.length >= MAX_PROPOSAL_PARAMETERS) return prev;
      const row = createParamRow(nextParamId.current++, cats, randomize);
      return [...prev, row];
    });
  };

  const removeParam = (id: number) => {
    setParamRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const setCatValue = (paramId: number, catId: string, value: number) => {
    setParamRows((prev) =>
      prev.map((row) =>
        row.id === paramId
          ? { ...row, values: { ...row.values, [catId]: value } }
          : row,
      ),
    );
  };

  const activeParams = paramRows.filter((row) => row.name.trim().length > 0);
  const parameterTableMinWidth = `${Math.max(480, 144 + activeParams.length * 176)}px`;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const timezoneField = event.currentTarget.elements.namedItem("deadlineTimezone");
    if (timezoneField instanceof HTMLInputElement) {
      timezoneField.value = String(new Date().getTimezoneOffset());
    }
  };

  return (
    <form action={createProposalAction} onSubmit={handleSubmit} className="space-y-5">
      <div className="card">
        <p className="section-title">🗳️ 議題の基本情報</p>
        <div className="space-y-3">
          <div>
            <label className="label">議題タイトル（必須・120字以内）</label>
            <input
              name="title"
              required
              maxLength={120}
              className="input"
              placeholder="大学の学食を24時間営業にするべきか"
            />
          </div>
          <div>
            <label className="label">説明</label>
            <textarea
              name="description"
              rows={4}
              maxLength={4000}
              className="input resize-y"
              placeholder="議題の背景や論点を説明してください"
            />
          </div>
          <div>
            <label className="label">締め切り（必須）</label>
            <input
              name="deadline"
              type="datetime-local"
              required
              className="input"
              defaultValue={DEFAULT_DEADLINE}
            />
            <input type="hidden" name="deadlineTimezone" defaultValue="0" />
          </div>
        </div>
      </div>

      <div className="card">
        <p className="section-title">📏 評価軸パラメータ（1〜20個）</p>
        <p className="mb-3 text-xs text-stone-500">
          この議題で猫たちが何を重視して評価するかの軸です。各猫の値はあなたが設定します。
        </p>
        <div className="space-y-2">
          {paramRows.map((row, i) => (
            <div key={row.id} className="flex items-center gap-2">
              <input
                name="paramName"
                value={row.name}
                maxLength={20}
                onChange={(e) => setParam(row.id, e.target.value)}
                className="input"
                placeholder={["利便性重視", "コスト重視", "安全性重視", "労働環境重視", "公平性"][i] ?? `軸${i + 1}`}
              />
              <button
                type="button"
                onClick={() => removeParam(row.id)}
                className="btn btn-danger !px-3 !py-1.5 text-xs"
                aria-label="削除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addParam(false)}
            disabled={paramRows.length >= MAX_PROPOSAL_PARAMETERS}
            className="btn btn-ghost !px-3 !py-1.5 text-xs"
          >
            ＋ 軸を追加
          </button>
          <button
            type="button"
            onClick={() => addParam(true)}
            disabled={paramRows.length >= MAX_PROPOSAL_PARAMETERS}
            className="btn btn-ghost !px-3 !py-1.5 text-xs"
          >
            🎲 ランダム初期化して追加
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-400">
          ランダム初期化を選ぶと、追加する軸の各猫の値を1〜10で設定します。
        </p>
      </div>

      <div className="card">
        <p className="section-title">🐱 各猫の議題パラメータ値（1〜10）</p>
        <p className="mb-3 text-xs text-stone-500">
          各猫がこの評価軸をどれだけ重視するかを設定してください。
        </p>
        <div className="overflow-x-auto pb-1">
          <table className="w-full text-sm" style={{ minWidth: parameterTableMinWidth }}>
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="min-w-36 px-3 py-2">猫</th>
                {activeParams.length === 0 ? (
                  <th className="px-2 py-2 text-stone-300">
                    ↑ 先に評価軸を入力してください
                  </th>
                ) : (
                  activeParams.map((row) => (
                    <th key={row.id} className="min-w-44 px-3 py-2 whitespace-nowrap">
                      {row.name}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id} className="border-t border-orange-50">
                  <td className="min-w-36 px-3 py-2 font-bold whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <CatAvatar icon={c.icon} size={24} />
                      {c.name}
                    </span>
                  </td>
                  {activeParams.map((row) => (
                    <td key={row.id} className="min-w-44 px-3 py-2">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={row.values[c.id] ?? 5}
                        onChange={(e) => setCatValue(row.id, c.id, Number(e.target.value))}
                        name={`cv:${c.id}:${row.name}`}
                        className="block w-40 min-w-40 max-w-none accent-orange-500"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary px-8 py-3 text-base">
          議題を作成する 🐾
        </button>
      </div>
    </form>
  );
}
