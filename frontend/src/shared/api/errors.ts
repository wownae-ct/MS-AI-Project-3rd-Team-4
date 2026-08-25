// 백엔드 에러 바디의 단일 해석 지점.
//
// 분기는 status 가 아니라 code 로 한다 — 같은 code 가 두 status 로 오는 사례가 실재한다
// (TOTAL_BUDGET_UNAVAILABLE: 404 와 422). status 로 분기하면 한쪽을 조용히 놓친다.
//
// 포맷 밖 응답(프록시가 낸 HTML 502 등)도 삼키지 않는다. code 를 지어내는 대신
// UNKNOWN_ERROR 로 표시하고 status 를 남겨 진단이 가능하게 한다.

interface ApiErrorInit {
  code: string;
  message: string;
  status: number;
  extra: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly extra: Record<string, unknown>;

  constructor({ code, message, status, extra }: ApiErrorInit) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function parseApiError(status: number, body: unknown): ApiError {
  const error = asRecord(asRecord(body)?.error);
  if (error === null) {
    return new ApiError({
      code: "UNKNOWN_ERROR",
      message: `서버 응답을 해석할 수 없습니다 (HTTP ${status}).`,
      status,
      extra: {},
    });
  }

  const { code, message, ...extra } = error;
  return new ApiError({
    code: typeof code === "string" ? code : "UNKNOWN_ERROR",
    message: typeof message === "string" ? message : `요청이 실패했습니다 (HTTP ${status}).`,
    status,
    extra,
  });
}
