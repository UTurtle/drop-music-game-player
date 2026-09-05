# Contributing / 기여하기

Small improvements to playability, accessibility, translations and chart generation are welcome. This is a hobby project.

- Discuss larger changes in an issue before implementation.
- Keep English and Korean UI/docs in sync. UI text lives in `src/i18n.ts` and explicit bilingual `t()` calls.
- Use synthetic or original audio in tests. Do not attach music files, credentials or personal recordings to issues or commits.
- Preserve local processing. Do not add video downloading, stream capture, audio uploads or public publishing as incidental changes.
- Run `npm test`, `npm run build`, and the browser test appropriate to the change.
- Include the browser/OS and reproducible steps in bug reports. Generated chart quality is heuristic, so describe what sounded wrong without redistributing a song.

플레이 감각·접근성·번역·채보 생성 개선을 환영합니다. 큰 변경은 먼저 이슈로 논의해 주세요. 영어와 한국어를 함께 갱신하고, 테스트에는 합성 음원이나 직접 만든 음원을 사용하세요. 음원·개인 녹음·인증정보를 커밋하거나 이슈에 첨부하지 마세요. 로컬 처리 원칙을 유지하고 관련 테스트를 실행해 주세요.
