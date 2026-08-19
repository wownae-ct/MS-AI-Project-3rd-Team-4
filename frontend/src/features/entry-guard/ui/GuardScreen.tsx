// 진입 안내 화면 — 답변 녹음 세션 시작 전에 표시. 자동 재시도·자동 새로고침 없음.
// 판정별 분기: in-app → 외부 브라우저 유도(탈출 3단계, URL 복사 항상 병행) /
// iOS → 비지원 안내(탈출 유도 금지 — 탈출해도 WebKit) / unsupported-browser → 지원 브라우저 목록.
import { useState } from "react";
import { Banner, Button, IconCopy, IconExternalLink } from "../../../shared/ui";
import { buildEscapeUrls, type EntryVerdict } from "../lib/detect";

/** 지원 매트릭스 — 안내 문구용 (판정 자체는 기능 검사) */
const SUPPORTED_BROWSERS = "Chrome · Edge · 삼성인터넷 · 웨일 (최신 버전)";

export interface GuardScreenProps {
  verdict: Exclude<EntryVerdict, { kind: "ok" }>;
  currentUrl: string;
}

function UrlCopyRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // 웹뷰에서 clipboard가 거부될 수 있음 — URL이 항상 보이므로 수동 복사로 완충 (조용한 실패 금지)
      setCopied(false);
    }
  };
  return (
    <div className="url-copy">
      <span className="url-copy__text">{url}</span>
      <Button variant="secondary" onClick={copy} aria-label="주소 복사">
        <IconCopy />
        {copied ? "복사됨" : "복사"}
      </Button>
    </div>
  );
}

export function GuardScreen({ verdict, currentUrl }: GuardScreenProps) {
  if (verdict.kind === "in-app") {
    const escape = buildEscapeUrls(currentUrl);
    return (
      <main className="page">
        <h1 className="page__title">외부 브라우저로 열어 주세요</h1>
        <p className="page__subtitle">
          앱 내 브라우저에서는 마이크를 사용할 수 없어 답변을 녹음할 수 없습니다. 아래 방법으로 기본
          브라우저에서 다시 열어 주세요.
        </p>
        {verdict.isKakao && (
          <Button
            onClick={() => {
              window.location.href = escape.kakaoScheme;
            }}
          >
            <IconExternalLink />
            외부 브라우저로 열기
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            window.location.href = escape.intentUri;
          }}
        >
          <IconExternalLink />
          기본 브라우저로 이동
        </Button>
        <p className="page__subtitle">위 버튼이 동작하지 않으면 주소를 복사해 브라우저에 붙여넣어 주세요.</p>
        <UrlCopyRow url={escape.plainUrl} />
      </main>
    );
  }

  if (verdict.kind === "unsupported-ios") {
    return (
      <main className="page">
        <h1 className="page__title">지원하지 않는 기기입니다</h1>
        <Banner variant="warning">
          iOS(iPhone·iPad)는 현재 지원 대상이 아닙니다. Android 기기 또는 PC의 지원 브라우저에서 이용해
          주세요.
        </Banner>
        <p className="page__subtitle">지원 브라우저: {SUPPORTED_BROWSERS}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1 className="page__title">지원하지 않는 브라우저입니다</h1>
      <Banner variant="warning">이 브라우저에는 답변 녹음에 필요한 기능이 없습니다.</Banner>
      <p className="page__subtitle">지원 브라우저로 다시 열어 주세요: {SUPPORTED_BROWSERS}</p>
      <UrlCopyRow url={currentUrl} />
    </main>
  );
}
