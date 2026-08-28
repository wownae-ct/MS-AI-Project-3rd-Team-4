// 유저 설정(⚙️) 화면 — docs/wedding/refactor/bug-todo.md [결정됨] "유저 설정 화면 신규 추가"
// (2026-08-27). 확정된 스코프: **로그아웃만 실구현**, 비밀번호 변경·온보딩 다시하기는 "준비 중"
// 배지가 붙은 disabled placeholder로만 노출 — 실제 API 호출/에러 처리 코드 자체를 만들지
// 않는다(그 문서의 "확정된 구현 범위" §2·§3 그대로).
//
// 진입점은 톱니바퀴 아이콘 하나다(`app/ui/AppShell.tsx` — 데스크톱 사이드바 보조 메뉴 · 모바일
// 상단 바 둘 다). 예전엔 로그아웃 버튼 자체가 AppShell에 직접 있었지만(데스크톱 텍스트 버튼 +
// 모바일 상단 바), 이 화면이 생기며 그 자리를 "설정" 링크로 바꾸고 로그아웃 로직은 여기로
// 옮겼다(2026-08-27, 사용자 지시 — "로그아웃 자리에 톱니바퀴를 놓고 그 안에 로그아웃 기능을
// 옮기면"). bug-todo.md가 열어둔 사이드이펙트 #1("기존 로그아웃 버튼과 설정 화면의 로그아웃
// 버튼이 진입점 중복")은 이렇게 해결한다 — 중복시키지 않고 옮긴다.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { invalidateSession, logout } from "@/entities/session";
import { Badge, Button, Card, Page } from "@/shared/ui";

// 이 화면이 유일한 호출자다 — AppShell.tsx가 로그아웃 버튼을 직접 갖고 있던 예전엔 이 로직이
// 그쪽 useLogout()에 있었지만, 로그아웃 자체가 이 화면으로만 옮겨온 지금은 공유할 두 번째
// 호출자가 없다. 호출자가 하나뿐인 훅은 인라인한다(react/hooks.md).
// `pending` 을 함께 돌려준다 — 이 화면은 왕복(logout) + 라우트 이동을 연달아 하는데, 그동안
// 버튼이 **아무 표시도 없고 비활성도 아니었다.** 느린 회선에서 두 번 눌리면 로그아웃 요청이
// 두 번 나간다(D14 S3). `finally` 로 되돌리지 않는 이유는 성공 시 이 화면이 언마운트되기
// 때문이다 — 실패했을 때만 다시 누를 수 있게 되돌린다.
function useLogout() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await logout();
      invalidateSession();
      await navigate({ to: "/login", search: { redirect: undefined, oauth_error: undefined } });
    } catch {
      // 로그아웃 실패는 사용자가 다시 시도할 수 있어야 한다 — 버튼을 되살린다.
      // 별도 에러 문구는 두지 않는다(이 화면의 확정 스코프는 "로그아웃만 실구현"이다).
      setPending(false);
    }
  }

  return { pending, handleLogout };
}

export function SettingsPage() {
  const { pending, handleLogout } = useLogout();

  return (
    <Page title="설정">
      <Card title="계정">
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            block
            pending={pending}
            pendingLabel="로그아웃 중…"
            onClick={() => void handleLogout()}
          >
            로그아웃
          </Button>

          {/* 비밀번호 변경 · 온보딩 다시하기 — disabled라 onClick 자체가 없다. 클릭해도 API를
              부르지 않는다는 걸 코드 자체가 보장한다(핸들러가 없으니 부를 방법이 없다). */}
          <Button variant="secondary" block disabled>
            <span className="flex w-full items-center justify-between gap-2">
              <span>비밀번호 변경</span>
              <Badge>준비 중</Badge>
            </span>
          </Button>

          <Button variant="secondary" block disabled>
            <span className="flex w-full items-center justify-between gap-2">
              <span>온보딩 다시하기</span>
              <Badge>준비 중</Badge>
            </span>
          </Button>
        </div>
      </Card>
    </Page>
  );
}
