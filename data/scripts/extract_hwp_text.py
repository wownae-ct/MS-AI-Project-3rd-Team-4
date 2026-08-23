"""공정위 등 정부기관이 배포하는 한글(hwp/hwpx) 문서에서 본문 텍스트를 추출한다. DS3_FTC 원본
확보 과정에서 실제로 쓴 방법 — docs/AI-Sessions/wiki/concepts/hwp-hwpx-text-extraction.md 참고.

- .hwp(구버전, OLE2 바이너리): pyhwp의 hwp5txt CLI를 서브프로세스로 호출한다(`pip install pyhwp`).
- .hwpx(신버전): 사실 zip 압축 + XML(OWPML) 구조라 pyhwp 없이도 표준 라이브러리(zipfile+re)만으로
  Contents/section*.xml 안의 <hp:t>...</hp:t> 태그를 추출하면 본문 전체가 나온다.
  Preview/PrvText.txt(hwpx 표준 미리보기)는 표지 서식만 담고 있어 본문 추출용으로는 못 쓴다.

사용법: python data/scripts/extract_hwp_text.py <파일.hwp|파일.hwpx>
"""

import re
import subprocess
import sys
import zipfile
from pathlib import Path

_HWPX_TEXT_TAG = re.compile(r"<hp:t\b[^/>]*>(.*?)</hp:t>", re.DOTALL)
_HWPX_SECTION_NAME = re.compile(r"Contents/section\d+\.xml")


def extract_hwp(path: Path) -> str:
    result = subprocess.run(
        ["hwp5txt", str(path)], capture_output=True, text=True, check=True
    )
    return result.stdout


def extract_hwpx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        section_names = sorted(n for n in archive.namelist() if _HWPX_SECTION_NAME.fullmatch(n))
        if not section_names:
            raise ValueError(f"{path}: Contents/section*.xml을 찾지 못함(hwpx 구조가 아닐 수 있음)")
        texts = [
            text
            for name in section_names
            for text in _HWPX_TEXT_TAG.findall(archive.read(name).decode("utf-8"))
        ]
    return "\n".join(texts)


def extract(path: Path) -> str:
    if path.suffix == ".hwp":
        return extract_hwp(path)
    if path.suffix == ".hwpx":
        return extract_hwpx(path)
    raise ValueError(f"{path}: .hwp 또는 .hwpx 파일만 지원함")


def main() -> None:
    if len(sys.argv) != 2:
        print("사용법: python data/scripts/extract_hwp_text.py <파일.hwp|파일.hwpx>", file=sys.stderr)
        raise SystemExit(1)
    print(extract(Path(sys.argv[1])))


if __name__ == "__main__":
    main()
