// 회원가입 폼 클라이언트 검증 — 순수 함수. 네트워크 왕복 없이 즉시 한국어 피드백을 준다.
//
// 비밀번호 조합 규칙(영문+숫자+특수문자, 8자 이상)은 이번 요청으로 프론트에서만 추가하는 정책이다.
// 서버(backend/app/schemas/auth.py 의 SignupRequest.password)는 현재 8자 이상만 요구하고 조합은
// 강제하지 않는다 — API 를 직접 호출하면 "pw123456" 같은 조합 없는 비밀번호도 여전히 통과한다.
// 서버도 같은 규칙을 강제하려면 SignupRequest.password 를 별도로 바꿔야 한다(이 파일은 그
// 결정을 대신하지 않는다 — backend/ 는 이 브랜치 소유 경로가 아니다).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/u;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function isValidPassword(value: string): boolean {
  return PASSWORD_PATTERN.test(value);
}

export const EMAIL_FORMAT_ERROR = "올바른 이메일 형식이 아닙니다.";
export const PASSWORD_FORMAT_ERROR = "비밀번호는 영문·숫자·특수문자를 모두 포함해 8자 이상이어야 합니다.";
