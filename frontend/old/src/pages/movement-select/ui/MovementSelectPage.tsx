// 운동 선택 화면 (§6.1) — 목록 API는 백엔드 501 스텁이라 연동 전 상태를 명시한다 (조용한 실패 금지).
import { useState } from "react";
import { Banner, Button } from "../../../shared/ui";

/** 백엔드 movements API 확정 전 임시 항목 — 연동 시 교체 (shared/api/movements.ts) */
const PLACEHOLDER_MOVEMENTS = [{ id: "squat", name: "스쿼트", description: "하체 기본 — T1 실시간 코칭 대상" }];

export interface MovementSelectPageProps {
  onStart: (movementId: string) => void;
}

export function MovementSelectPage({ onStart }: MovementSelectPageProps) {
  const [selected, setSelected] = useState<string>(PLACEHOLDER_MOVEMENTS[0].id);
  return (
    <main className="page">
      <h1 className="page__title">AI 홈트레이닝 코치</h1>
      <p className="page__subtitle">오늘 수행할 운동을 선택하세요.</p>
      <Banner variant="info">운동 목록은 서버 연동 전 임시 항목입니다.</Banner>
      {PLACEHOLDER_MOVEMENTS.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`card card--selectable${selected === m.id ? " card--selected" : ""}`}
          aria-pressed={selected === m.id}
          onClick={() => setSelected(m.id)}
        >
          <strong>{m.name}</strong>
          <p className="page__subtitle">{m.description}</p>
        </button>
      ))}
      <Button onClick={() => onStart(selected)}>세션 준비하기</Button>
    </main>
  );
}
