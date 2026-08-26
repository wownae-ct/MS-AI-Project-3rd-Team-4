// 백엔드 에러 바디의 단일 해석 지점.
//
// 분기는 status 가 아니라 code 로 한다 — 같은 code 가 두 status 로 오는 사례가 실재한다
// (TOTAL_BUDGET_UNAVAILABLE: 404 와 422). status 로 분기하면 한쪽을 조용히 놓친다.
//
// 포맷 밖 응답(프록시가 낸 HTML 502 등)도 삼키지 않는다. code 를 지어내는 대신
// UNKNOWN_ERROR 로 표시하고 status 를 남겨 진단이 가능하게 한다.

// 원본 바디를 extra 에 실을 때 길이를 여기서 제한한다 — 프록시 502 HTML 은 전체 페이지라
// 수 KB 를 넘기기도 하는데, 콘솔/향후 원격 로깅으로 그대로 흘리면 그 자체가 payload 를
// 불필요하게 키운다(로깅 관측성 감사, 2026-08-26).
const RAW_BODY_PREVIEW_MAX_CHARS = 500;

function previewRawBody(body: unknown): string {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > RAW_BODY_PREVIEW_MAX_CHARS ? `${text.slice(0, RAW_BODY_PREVIEW_MAX_CHARS)}…` : text;
}

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
      // body 를 통째로 버리면 프록시 502 HTML 같은 진짜 원인이 UNKNOWN_ERROR 라벨 뒤로 사라진다
      // — 진단 가능하게 미리보기를 보존한다(로깅 관측성 감사, 2026-08-26). client.ts 의
      // console.error(error.extra) 가 이걸 같이 찍는다.
      extra: body === undefined ? {} : { rawBody: previewRawBody(body) },
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
