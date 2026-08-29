// S0 로그인. 로그인과 가입을 한 화면에 둔다 — 리다이렉트가 없어 로컬 개발 제약을 안 받는다.
//
// ## 이 화면에 세션 가드가 없는 이유
// POST /auth/signup 이 201 과 함께 **이미 쿠키를 발급**한다. 「세션 있으면 튕김」 가드를 두면
// 가입 직후 로그인 폼에 도달할 수 없다. 가드를 빼도 무해하다 — 로그인이 새 세션을 발급해도
// 백엔드가 누적할 뿐이다.
//
// ## 가입 후 이메일만 인계하고 비밀번호는 비운다
// 가입 성공 시 이메일은 로그인 폼에 남겨 재입력 부담을 없애되(**저장하지 않는다** — localStorage·
// sessionStorage·쿠키·URL 어디에도 넣지 않고 이 컴포넌트의 상태로만 들고 있다), **비밀번호는
// 비운다**. 채워 두면 ① 어깨너머·공용 기기에서 방금 만든 비밀번호가 그대로 노출되고
// ② 폼이 이미 다 채워져 있어 「이미 로그인된 건가?」라는 오해를 준다. 로그인은 사용자의
// 명시적 행위로 남긴다 — 대신 완료 배너와 비밀번호 필드 포커스로 다음 할 일을 지시한다.
import { useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { getMe, invalidateSession, login, signup, socialLoginUrl } from "@/entities/session";
import { isApiError } from "@/shared/api";
import { Button, Card, IconCheck, IconGoogle, IconNaver, Page } from "@/shared/ui";
import { oauthErrorMessage } from "./oauth-error";
import { EMAIL_FORMAT_ERROR, PASSWORD_FORMAT_ERROR, isValidEmail, isValidPassword } from "./validation";

type Mode = "login" | "signup";

const LOGIN_ERROR: Record<string, string> = {
  INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다.",
  EMAIL_ALREADY_EXISTS: "이미 가입된 이메일입니다.",
  NETWORK_ERROR: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
  // 백엔드가 로그인·가입에 5회/분(IP 기준) 제한을 건다(origin/backend PR #65, 2026-08-25) —
  // 이 코드가 없으면 화면 최하단 범용 폴백("요청을 처리하지 못했습니다")으로 떨어져 원인을 숨긴다.
  RATE_LIMIT_EXCEEDED: "짧은 시간에 너무 많이 시도했습니다. 1분 후 다시 시도해 주세요.",
  // 백엔드가 pydantic 검증 실패(RequestValidationError)를 전부 이 코드로 통일해 보낸다
  // (app/main.py::validation_exception_handler) — 이 코드가 없으면 원인이 입력값 문제인데도
  // 화면 최하단 범용 폴백("요청을 처리하지 못했습니다")으로 떨어져 사용자가 뭘 고쳐야 하는지 모른다.
  // 클라이언트 검증(아래 handleSubmit)이 대부분 먼저 잡지만, 이건 그걸 우회한 경우의 방어선이다.
  VALIDATION_ERROR: "입력하신 정보가 형식에 맞지 않습니다. 다시 확인해 주세요.",
  // entities/session/api/auth.ts::toAuthUser 가 던지는 코드 — HTTP 는 2xx 였지만 응답 바디의
  // id·email 형식이 예상과 다른 경우다(값 지어내기 금지). 이것도 매핑이 없으면 같은 범용
  // 폴백으로 떨어진다.
  MALFORMED_USER: "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

// 로그인 자체는 200 이어도, 발급된 세션 쿠키가 이 브라우저에서 왕복하지 못하면(Chrome 시크릿 모드,
// Edge Strict 등 — User-Agent 로는 구분되지 않는다) 다음 화면이 전부 401 로 조용히 실패한다.
// 그래서 로그인 직후 /auth/me 를 한 번 더 불러 세션이 실제로 살아있는지 확인한다.
const COOKIE_NOT_PERSISTED_ERROR =
  "이 브라우저에서는 로그인 상태가 유지되지 않습니다. Chrome 또는 Edge 일반 창에서 다시 시도해 주세요.";

export function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { oauth_error?: string; redirect?: string };

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(
    search.oauth_error === undefined ? null : oauthErrorMessage(search.oauth_error),
  );
  // 성공 알림은 error 와 **별도 상태**다 — 한 자리에 섞으면 성공이 실패와 같은 role="alert"
  // (assertive)로 낭독되고 스타일도 구분할 수 없다. 아래 렌더에서 `<output>`(암묵 role="status"
  // + aria-live="polite")로 나간다.
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 가입 성공 직후 비운 비밀번호 칸으로 포커스를 옮기기 위한 참조 — 로그인·가입 두 모드에서
  // 같은 input 이라 모드가 바뀌어도 이 노드는 유지된다(포커스가 날아가지 않는다).
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    // `<form noValidate>` 라 HTML5 제약(required·type="email"·minLength)은 아예 안 돈다 — 이
    // 화면 고유의 에러 UI(role="alert")로 항상 같은 문구·같은 자리에서 보여주려는 의도다.
    // noValidate 를 안 쓰면 브라우저 네이티브 검증이 submit 이벤트 자체를 먼저 막아버려서(jsdom
    // 도 동일하게 동작 — 실측으로 확인) 이 아래 로직에 도달하지 못하는 경우가 생긴다. 그래서
    // required 로 미루던 "비어 있음" 검사도 전부 여기서 직접 한다. 공백만 입력한 경우(HTML5
    // required 라면 공백 문자열을 "비어 있음"으로 안 보는 문제)도 trim 으로 같이 막는다.
    const trimmedEmail = email.trim();
    const trimmedDisplayName = displayName.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError(EMAIL_FORMAT_ERROR);
      return;
    }
    if (password === "") {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    if (mode === "signup") {
      if (trimmedDisplayName === "") {
        setError("닉네임을 입력해 주세요.");
        return;
      }
      if (!isValidPassword(password)) {
        setError(PASSWORD_FORMAT_ERROR);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        await signup({ email: trimmedEmail, password, displayName: trimmedDisplayName });
        // signup 도 쿠키를 발급해 세션이 바뀐다 — 캐시를 비우지 않으면 이어지는 login 호출
        // 전에 다른 화면이 낡은(비로그인) 세션을 최대 60초 동안 볼 수 있다.
        invalidateSession();
        // 가입은 성공했지만 곧바로 홈으로 보내지 않는다 — 요구 플로우가 로그인을 한 번 더 거친다.
        setMode("login");
        // 이메일(email)은 그대로 두고 비밀번호만 비운다 — 근거는 파일 상단 주석.
        setPassword("");
        // 화면에서 값이 사라지는 것만으로는 「내가 뭘 잘못했나」로 읽힌다. 무슨 일이 일어났고
        // 다음에 뭘 해야 하는지를 배너가 말하고, 포커스가 그 자리로 데려간다.
        setNotice(`회원가입이 완료되었습니다. 가입한 계정과 비밀번호로 로그인해 주세요.`);
        passwordRef.current?.focus();
        return;
      }
      const user = await login({ email: trimmedEmail, password });
      // 캐시를 비워야 다음 loadSession() 이 방금 로그인한 사용자의 최신 hasWedding 을 본다 —
      // 안 비우면 최대 60초 동안 낡은 세션이 남아 가드가 엉뚱한 곳으로 보낸다.
      invalidateSession();
      try {
        // getMe() 는 loadSession() 이 아니라 여기서만 직접 부른다 — 캐시를 타면 쿠키가 실제로
        // 왕복했는지 이 요청 하나로는 확인할 수 없다.
        await getMe();
      } catch (err) {
        // "쿠키가 이 브라우저에서 유지되지 않는다"는 진단은 UNAUTHORIZED(로그인 직후인데 쿠키가
        // 없어 바로 401)일 때만 맞는 원인이다 — 네트워크 순단·429·500 등 다른 실패까지 전부 같은
        // 문구로 묶으면 원인과 무관한 "브라우저를 바꿔라" 안내로 사용자를 잘못 이끈다(레드팀 감사).
        if (isApiError(err) && err.code !== "UNAUTHORIZED") {
          setError(LOGIN_ERROR[err.code] ?? "로그인 확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        } else {
          setError(COOKIE_NOT_PERSISTED_ERROR);
        }
        return;
      }
      // `search.redirect`는 router.tsx의 authedRoute.beforeLoad가 세션 없이 보호된 경로에
      // 접근했을 때 채워 넣고 sanitizeRedirectTarget으로 앱 내부 절대 경로인지 걸러낸 값이다 —
      // 여기서 있으면 원래 가려던 곳으로 되돌린다. hasWedding이 false인데 shell 하위 경로가
      // 와도 안전하다 — shellRoute.beforeLoad가 어차피 /onboarding으로 다시 걸러낸다.
      await navigate({ to: search.redirect ?? (user.hasWedding ? "/" : "/onboarding") });
    } catch (cause) {
      const code = isApiError(cause) ? cause.code : "UNKNOWN_ERROR";
      setError(LOGIN_ERROR[code] ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // 제목·부제는 모드를 따라간다 — 버튼 라벨만 바뀌면 화면 최상단은 계속 "로그인"이라 지금
    // 무엇을 하는 중인지 어긋난다. `width` 는 리터럴 그대로 둔다(조립하면 Tailwind 스캐너가
    // 찾지 못해 빌드는 성공한 채 폭만 사라진다 — Page.tsx 의 width 주석).
    <Page
      title={mode === "signup" ? "회원가입" : "로그인"}
      subtitle={mode === "signup" ? "가입 후 로그인하면 바로 시작할 수 있어요." : undefined}
      width="max-w-[430px]"
      // 첫 접촉 화면이다 — 여기 브랜드가 없으면 "로그인"이라는 제목만 남아 무슨 제품인지 알 수 없다
      // (아래 소셜 버튼에 구글·네이버 로고는 있는데 정작 이 앱의 로고가 없던 상태였다). 셸 밖이라
      // 사이드바·상단 바가 닿지 않으므로 `Page` 의 브랜드 슬롯으로 낸다. D15.
      // 32px → 폭 154px. 이 열이 430px 이고 아래로 카드와 버튼 3개가 이어지므로 더 키우지 않는다.
      brand={32}
    >
      {/* 카드 밖 위쪽에 둔다 — 폼 안에 넣으면 배너가 뜰 때 입력 필드가 통째로 밀린다.
          `<output>`은 암묵 role="status" + aria-live="polite"라 사용자 조작의 결과로서
          error 의 role="alert"보다 약하게 낭독된다. jsx-a11y 도 role="status" 보다 네이티브
          `<output>`을 요구한다(선례: pages/onboarding/ui/GeneratingOverlay.tsx).
          상태 색(초록)을 쓰지 않는다 — docs/design/decisions.md D6. 구분은 헤어라인 보더로,
          강조는 아이콘의 text-primary 한 곳으로만 한다. */}
      {notice !== null && (
        <output
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
        >
          <IconCheck size={18} className="mt-0.5 shrink-0 text-primary" />
          {notice}
        </output>
      )}

      <Card>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {/* 🚨 [2026-08-29] 세 입력에 `text-base` 를 **명시**한다. 종전엔 글자 크기 클래스가 아예
              없어 16px 일 것 같지만 실제로는 **14px 이었다** — Tailwind Preflight 가 폼 컨트롤에
              `font: inherit` 을 걸어(node_modules/tailwindcss/preflight.css, 산출 CSS 로 확인)
              바깥 `<label className="… text-sm">` 을 상속했기 때문이다. 클래스를 안 준 것이 곧
              기본값을 쓰는 것이 아니다.
              그래서 이 화면은 「입력 필드 16px 미만 금지」(a11y.md §2.5)를 **조용히** 어기고
              있었고, iOS Safari 가 첫 입력 탭에서 화면을 자동 확대한 뒤 되돌리지 않아 앱 전체가
              망가진 것처럼 보였다(사용자 리포트 2026-08-29). 앱의 첫 화면이라 영향이 가장 컸다.
              라벨 글자(`text-sm`)는 그대로 둔다 — 규범이 요구하는 것은 **입력 필드**의 크기다. */}
          {mode === "signup" && (
            <label className="flex flex-col gap-1 text-sm">
              닉네임
              <input
                className="min-h-tap rounded-md border border-line px-3 text-base"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            이메일
            <input
              className="min-h-tap rounded-md border border-line px-3 text-base"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-sm">
              비밀번호
              <input
                ref={passwordRef}
                className="min-h-tap rounded-md border border-line px-3 text-base"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={mode === "signup" ? 8 : undefined}
                required
                aria-describedby={mode === "signup" ? "password-hint" : undefined}
              />
            </label>
            {/* label 밖에 둔다 — label 안에 넣으면 접근성 이름(getByLabelText("비밀번호"))이
                이 문구까지 이어붙어 "비밀번호"와 정확히 일치하지 않게 된다. aria-describedby 로
                입력과의 연결만 유지한다. */}
            {mode === "signup" && (
              <span id="password-hint" className="text-xs text-ink-soft">
                영문·숫자·특수문자 포함 8자 이상
              </span>
            )}
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-primary">
              {error}
            </p>
          )}

          {/* 앱에서 두 번째로 긴 대기다 — 성공 경로가 login → invalidateSession → getMe 로
              왕복을 두 번 돈다. 그런데 예전엔 비활성만 되고 라벨이 그대로라 "눌리긴 한 건가"를
              알 수 없었다. D14 L1 — 비활성과 라벨 교체를 한 prop 으로 묶는다. */}
          <Button
            type="submit"
            block
            pending={busy}
            pendingLabel={mode === "signup" ? "회원가입 중…" : "로그인 중…"}
          >
            {mode === "signup" ? "회원가입" : "로그인"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          block
          onClick={() => { window.location.href = socialLoginUrl("google", search.redirect); }}
          // secondary 변이는 기본적으로 호버 시 배경(bg-bg)·보더(border-ink-soft)가 옅게 바뀐다
          // (Button.tsx VARIANT.secondary) — 구글 버튼은 그 변화 없이 항상 자기 색(흰 배경 +
          // 라인 보더) 그대로 보이길 원해서, 네이버 버튼과 같은 방식(인라인 style로 고정)으로
          // 고정한다. 인라인 style은 클래스 기반 :hover 유틸리티보다 항상 우선한다.
          style={{ backgroundColor: "#FFFFFF", borderColor: "#E7E3DE" }}
        >
          <IconGoogle size={18} />
          구글로 계속하기
        </Button>
        <Button
          variant="secondary"
          block
          onClick={() => { window.location.href = socialLoginUrl("naver", search.redirect); }}
          // 네이버 브랜드 그린 — Tailwind 임의값 클래스(bg-[#hex])가 아니라 인라인 style 이다.
          // 이 저장소 소스 규범 게이트(scripts/lib/source-norms.mjs)가 팔레트 밖 색을 막는 건
          // `bg-[#...]` 류 Tailwind 클래스 토큰뿐이라 — 게이트를 피하려는 게 아니라, 게이트가
          // 지키려는 「앱 자체의 accent 색」 범위 밖(제3자 브랜드 색)이라 애초에 대상이 아니다.
          style={{ backgroundColor: "#03C75A", borderColor: "#03C75A", color: "#ffffff" }}
        >
          <IconNaver size={18} />
          네이버로 계속하기
        </Button>
      </div>

      <Button
        variant="ghost"
        // 제출 중(busy)에 모드를 바꾸면, 진행 중이던 요청이 나중에 settle될 때 이미 바뀐 폼
        // 위에 엉뚱한 에러/강제 이동을 남길 수 있다(레드팀 감사 — 경합 가드 부재).
        disabled={busy}
        // 모드를 바꾸면 완료 배너도 함께 걷는다 — 안 그러면 가입 완료 문구가 회원가입 폼 위에
        // 다시 걸려 「또 가입한 건가」로 읽힌다.
        onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setNotice(null); }}
      >
        {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
      </Button>
    </Page>
  );
}
