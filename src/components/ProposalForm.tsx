"use client";

import { useState } from "react";
import { createProposalAction } from "@/app/actions/proposals";

export interface CatOption {
  id: string;
  name: string;
  icon: string;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProposalForm({ cats }: { cats: CatOption[] }) {
  const [paramNames, setParamNames] = useState<string[]>(["", ""]);

  const setParam = (i: number, v: string) => {
    setParamNames((prev) => prev.map((p, idx) => (idx === i ? v : p)));
  };
  const addParam = () => {
    setParamNames((prev) => (prev.length >= 5 ? prev : [...prev, ""]));
  };
  const removeParam = (i: number) => {
    setParamNames((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  };

  const activeParams = paramNames.filter((p) => p.trim().length > 0);

  return (
    <form action={createProposalAction} className="space-y-5">
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
              defaultValue={toLocalInputValue(
                new Date(Date.now() + 7 * 24 * 3600_000),
              )}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <p className="section-title">📏 評価軸パラメータ（1〜5個）</p>
        <p className="mb-3 text-xs text-stone-500">
          この議題で猫たちが何を重視して評価するかの軸です。各猫の値はあなたが設定します。
        </p>
        <div className="space-y-2">
          {paramNames.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                name="paramName"
                value={v}
                maxLength={20}
                onChange={(e) => setParam(i, e.target.value)}
                className="input"
                placeholder={["利便性重視", "コスト重視", "安全性重視", "労働環境重視", "公平性"][i] ?? `軸${i + 1}`}
              />
              <button
                type="button"
                onClick={() => removeParam(i)}
                className="btn btn-danger !px-3 !py-1.5 text-xs"
                aria-label="削除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addParam}
          disabled={paramNames.length >= 5}
          className="btn btn-ghost mt-2 !px-3 !py-1.5 text-xs"
        >
          ＋ 軸を追加
        </button>
      </div>

      <div className="card">
        <p className="section-title">🐱 各猫の議題パラメータ値（1〜10）</p>
        <p className="mb-3 text-xs text-stone-500">
          各猫がこの評価軸をどれだけ重視するかを設定してください。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="px-2 py-2">猫</th>
                {activeParams.length === 0 ? (
                  <th className="px-2 py-2 text-stone-300">
                    ↑ 先に評価軸を入力してください
                  </th>
                ) : (
                  activeParams.map((p) => (
                    <th key={p} className="px-2 py-2 whitespace-nowrap">
                      {p}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id} className="border-t border-orange-50">
                  <td className="px-2 py-2 font-bold whitespace-nowrap">
                    {c.icon} {c.name}
                  </td>
                  {activeParams.map((p) => (
                    <td key={p} className="px-2 py-2">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        defaultValue={5}
                        name={`cv:${c.id}:${p}`}
                        className="w-full accent-orange-500"
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
