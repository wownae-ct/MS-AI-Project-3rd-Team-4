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
import { Button, Card, Page } from "@/shared/ui";
import { oauthErrorMessage } from "./oauth-error";

type Mode = "login" | "signup";

const LOGIN_ERROR: Record<string, string> = {
  INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다.",
  EMAIL_ALREADY_EXISTS: "이미 가입된 이메일입니다.",
  NETWORK_ERROR: "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
  // 백엔드가 로그인·가입에 5회/분(IP 기준) 제한을 건다(origin/backend PR #65, 2026-08-25) —
  // 이 코드가 없으면 화면 최하단 범용 폴백("요청을 처리하지 못했습니다")으로 떨어져 원인을 숨긴다.
  RATE_LIMIT_EXCEEDED: "짧은 시간에 너무 많이 시도했습니다. 1분 후 다시 시도해 주세요.",
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
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup({ email, password, displayName });
        // signup 도 쿠키를 발급해 세션이 바뀐다 — 캐시를 비우지 않으면 이어지는 login 호출
        // 전에 다른 화면이 낡은(비로그인) 세션을 최대 60초 동안 볼 수 있다.
        invalidateSession();
        // 가입은 성공했지만 곧바로 홈으로 보내지 않는다 — 요구 플로우가 로그인을 한 번 더 거친다.
        // 값은 상태에 그대로 남아 있으므로 폼이 이미 채워진 상태가 된다(메모리 전용).
        setMode("login");
        return;
      }
      const user = await login({ email, password });
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
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="flex flex-col gap-1 text-sm">
              이름
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
            />
          </label>

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
          구글로 계속하기
        </Button>
        <Button variant="secondary" block onClick={() => { window.location.href = socialLoginUrl("naver"); }}>
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
