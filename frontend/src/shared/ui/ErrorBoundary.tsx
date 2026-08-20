// 렌더 중 예외를 잡아 화면이 통째로 비는 것을 막는다.
//
// 클래스 컴포넌트인 이유 — React가 에러 바운더리를 훅으로 제공하지 않는다.
// componentDidCatch/getDerivedStateFromError는 클래스에서만 쓸 수 있어 라이브러리 없이는 이 형태가 유일하다.
//
// 잡히지 '않는' 것에 주의: 이벤트 핸들러·비동기 콜백·SSR에서 던진 예외는 바운더리를 통과한다.
// 그런 경로는 각자 try/catch 로 다뤄야 한다 — 바운더리가 있다고 안전하다고 오해하지 말 것.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 대체 화면을 직접 그리고 싶을 때. 미지정 시 기본 안내를 보여준다. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** 로깅·계측 훅. 여기서 던지지 말 것 — 바운더리 자신이 깨진다. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 조용히 삼키지 않는다 — 콘솔에 남겨야 원인을 추적할 수 있다.
    console.error("[ErrorBoundary] 렌더 중 예외:", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <main className="page">
        <h1 className="page__title">문제가 발생했습니다</h1>
        <Banner variant="danger">
          화면을 그리는 중 오류가 생겼습니다. 다시 시도해도 같은 문제가 반복되면 새로고침해 주세요.
        </Banner>
        <Button onClick={this.reset}>다시 시도</Button>
      </main>
    );
  }
}
