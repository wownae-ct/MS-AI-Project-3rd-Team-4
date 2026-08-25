// S0 로그인. 로그인과 가입을 한 화면에 둔다 — 리다이렉트가 없어 로컬 개발 제약을 안 받는다.
//
// ## 이 화면에 세션 가드가 없는 이유
// POST /auth/signup 이 201 과 함께 **이미 쿠키를 발급**한다. 「세션 있으면 튕김」 가드를 두면
// 가입 직후 로그인 폼에 도달할 수 없다. 가드를 빼도 무해하다 — 로그인이 새 세션을 발급해도
// 백엔드가 누적할 뿐이다.
//
// ## 비밀번호 자동 채움은 메모리 전용이다
// 가입 성공 시 방금 쓴 값을 로그인 폼에 채운다. **저장하지 않는다** — localStorage·
// sessionStorage·쿠키·URL 어디에도 넣지 않고 이 컴포넌트의 상태로만 들고 있다가 1회 소비한다.
import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { getMe, invalidateSession, login, signup, socialLoginUrl } from "@/entities/session";
import { isApiError } from "@/shared/api";
import { Button, Card, IconGoogle, IconNaver, Page } from "@/shared/ui";
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
  const search = useSearch({ strict: false }) as { oauth_error?: string };

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(
    search.oauth_error === undefined ? null : oauthErrorMessage(search.oauth_error),
  );
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

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
        // 값은 상태에 그대로 남아 있으므로 폼이 이미 채워진 상태가 된다(메모리 전용).
        setMode("login");
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
      } catch {
        setError(COOKIE_NOT_PERSISTED_ERROR);
        return;
      }
      await navigate({ to: user.hasWedding ? "/" : "/onboarding" });
    } catch (cause) {
      const code = isApiError(cause) ? cause.code : "UNKNOWN_ERROR";
      setError(LOGIN_ERROR[code] ?? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="로그인" width="max-w-[430px]">
      <Card>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {mode === "signup" && (
            <label className="flex flex-col gap-1 text-sm">
              닉네임
              <input
                className="min-h-tap rounded-md border border-line px-3"
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
              className="min-h-tap rounded-md border border-line px-3"
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
                className="min-h-tap rounded-md border border-line px-3"
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

          <Button type="submit" block disabled={busy}>
            {mode === "signup" ? "회원가입" : "로그인"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" block onClick={() => { window.location.href = socialLoginUrl("google"); }}>
          <IconGoogle size={18} />
          구글로 계속하기
        </Button>
        <Button
          variant="secondary"
          block
          onClick={() => { window.location.href = socialLoginUrl("naver"); }}
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
        onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
      >
        {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
      </Button>
    </Page>
  );
}
