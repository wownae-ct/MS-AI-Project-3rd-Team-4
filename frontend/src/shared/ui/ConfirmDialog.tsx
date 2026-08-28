// 되돌릴 수 없는 행동 앞의 확인 다이얼로그.
//
// **왜 Base UI 가 아니라 네이티브 `<dialog>` 인가** (ADR 0004 는 접근성 프리미티브로 Base UI 를
// 채택했다 — 여기만 예외다). Base UI 의 alert-dialog 는 floating-ui 를 함께 끌고 온다. 실측:
//
//     JS 합계(gzip)   161,802 B  →  183,183 B   (예산 165,000 B, `npm run build` 2026-08-29)
//
// 예산을 넘는다. 그것도 이미 98% 를 쓰고 있던 상태에서 +21 kB 다. Base UI 가 필요한 이유는
// "브라우저가 주지 않는 것"(탭의 로빙 tabindex, 슬라이더) 때문인데 **모달 다이얼로그는 브라우저가
// 이미 준다** — `showModal()` 이 top layer 승격 · 포커스 트랩 · 배경 inert · Esc 닫기 · 닫힌 뒤
// 트리거로 포커스 복귀를 전부 UA 구현으로 처리한다. 21 kB 를 주고 살 이유가 없다.
//
// 대신 두 가지를 직접 얹는다.
//   · `role="alertdialog"` — `<dialog>` 의 암묵 role 은 `dialog` 다. 이 자리는 사용자가 방금 누른
//     행동의 결과를 알리고 되묻는 자리라 alertdialog 가 맞다.
//   · Esc 처리 — UA 가 이미 닫아 주지만, 진행 중에는 막아야 하고(요청은 이미 서버로 떠났다)
//     jsdom 은 UA 동작을 구현하지 않아 테스트가 볼 수 없다. `cancel` 이벤트와 keydown 을 함께 잡는다.
//
// 규범 준수 사항 (docs/design/README.md 「현행 규범 요약」)
//   · 그림자 없음 — 팝업의 표면 구분은 1px 헤어라인 보더로만 (The Flat-By-Default Rule)
//   · 표면(패딩·라운드)은 Card 와 같은 값 — 한 제품 안에서 표면이 두 종류로 보이지 않게
//   · 배경 가림막은 **요소 불투명도**로 만든다. 색 뒤에 슬래시로 알파를 붙이는 opacity modifier 는
//     산출 CSS 가 8자리 hex 로 접혀 팔레트 게이트에 걸린다 — D7 이 그 사정을 적어 두고 「제안」인
//     채로 남겨 둔 이유다. 요소 불투명도는 색 원자가 없어 게이트와 무관하다.
//   ⚠️ 이 주석에 유틸리티명을 나열하지 않는다 — 스캐너가 주석도 평문으로 읽어 유틸리티를 만든다
//      (scripts/lib/__tests__/ghost-candidates.test.mjs 가 그 부재를 고정한다).
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./Button";

// 닫혔을 때 숨기는 책임을 저자 스타일이 진다 — UA 기본 시트의 `dialog:not([open]){display:none}`
// 은 저자 스타일보다 **항상** 약해서, display 를 지정하는 유틸리티 하나면 닫힌 다이얼로그가
// 그대로 보인다(특이도 문제가 아니라 캐스케이드 오리진 문제라 더 구체적인 선택자로도 못 이긴다).
const POPUP =
  "hidden open:flex fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] " +
  "-translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-line bg-surface p-4 " +
  "backdrop:bg-ink backdrop:opacity-40";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 되묻는 질문. 예: `AI 타임라인을 다시 생성할까요?` */
  title: string;
  /** 본문 — 무엇이 남고 무엇이 사라지는지. `<p>` 여러 개를 그대로 넘길 수 있다. */
  children: ReactNode;
  /** 실행 버튼 라벨. 「확인」처럼 무엇을 하는지 모르는 말 대신 동사를 쓴다. */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** 실행이 진행 중 — 다이얼로그는 열린 채로 두고 실행 버튼만 진행 상태로 바꾼다(D14 L1). */
  pending?: boolean;
  pendingLabel?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  cancelLabel = "취소",
  onConfirm,
  pending = false,
  pendingLabel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 한 화면에 확인창이 둘 이상 있을 수 있다(타임라인·체크리스트가 각자 재생성 버튼을 가진다) —
  // 고정 id 를 쓰면 aria-labelledby 가 남의 제목을 가리킨다.
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // 파괴적 행동이므로 **취소에 초기 포커스**를 둔다. Enter 를 연타하던 손이 그대로 실행으로
      // 이어지지 않게 하는 것이 이 컴포넌트의 존재 이유의 절반이다. showModal() 의 기본 초기
      // 포커스 규칙에 기대지 않고 명시한다 — 버튼 순서를 바꾸면 조용히 달라지는 종류의 규칙이다.
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // 진행 중에는 Esc·`cancel` 로 닫지 않는다 — 요청은 이미 서버로 떠났고, 창만 사라지면 사용자는
  // "취소됐다"고 오해한다. 실행 버튼의 pending 이 이미 상태를 말하고 있다.
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault(); // UA 의 닫기와 이중으로 닫히지 않게 — 상태는 아래에서 한 번만 바꾼다.
    if (!pending) onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      className={POPUP}
      onKeyDown={handleKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onOpenChange(false);
      }}
      // 바깥 클릭으로는 닫지 않는다(네이티브 `<dialog>` 의 기본 동작 그대로) — 파괴적 행동의
      // 확인창이라 "실수로 닫혔는데 실행됐나?"를 만들지 않는 편이 낫다. 취소와 Esc 가 있다.
    >
      <h2 id={`${id}-title`} className="text-lg font-bold text-ink">
        {title}
      </h2>
      <div id={`${id}-body`} className="flex flex-col gap-2 text-sm text-ink-soft">
        {children}
      </div>
      <div className="flex justify-end gap-2">
        <Button ref={cancelRef} variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button variant="primary" onClick={onConfirm} pending={pending} pendingLabel={pendingLabel}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
