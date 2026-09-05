# Third-party components / 외부 구성요소

DROP source is MIT licensed. This does not relicense dependencies, music, videos, datasets or third-party beatmaps.
DROP의 MIT 라이선스는 외부 의존성·음악·영상·학습 데이터·타인의 채보에 대한 이용 권한을 부여하지 않습니다.

## Browser chart model

- Source: [OliBomby/Mapperatorinator](https://github.com/OliBomby/Mapperatorinator), Copyright (c) 2024 OliBomby, MIT.
- Source commit: `0e2b0e387aab4b35c64b0b11b12d47578dea7587`.
- Original notice: [Mapperatorinator MIT](docs/licenses/Mapperatorinator-MIT.txt).
- Weights: [OliBomby/Mapperatorinator-v32-mini](https://huggingface.co/OliBomby/Mapperatorinator-v32-mini/tree/7807f0dc70cab671be012e1f5ddf945b0b8b7278), publisher metadata: MIT.
- Revision: `7807f0dc70cab671be012e1f5ddf945b0b8b7278`, `gamemode=1` checkpoint.
- DROP adapts the inference architecture to ONNX, using FP16 weights with FP32 accumulation for sensitive operations. The hosted/local model assets are a redistribution of converted weights; preserve the upstream MIT notice, model card, source and revision with those assets. The source repository excludes model binaries.
- No training datasets, example songs or private audio are distributed. Model metadata does not establish rights in every training item or generated chart. Generated charts carry a generator identifier and are not represented as human-authored.

모델 제공자의 MIT 표시와 원본 고지를 유지합니다. 변환 모델을 앱 서버에서 제공하는 것은 가중치 재배포이므로 원본 라이선스·모델 카드·출처·버전을 함께 제공합니다. 모델 표시는 학습 자료 전체나 생성 결과의 권리를 보증하지 않습니다.

## Runtime

[ONNX Runtime](https://github.com/microsoft/onnxruntime) 1.23.2 is MIT licensed, Copyright Microsoft Corporation. The browser distribution includes third-party notices preserved with the served runtime. React, Vite and other dependencies retain their respective licenses. The optional Python exporter is a maintainer tool; its dependencies are not included in the browser runtime.

## User audio and video

Audio analysis, AI inference and playback all run in the browser. No audio upload API is exposed. Audio is not published, stored in the model cache, or used for training. Official video embeds are optional; no downloader or capture feature is provided. Use files you have the necessary rights to process. Source/model licenses do not grant rights to the music or video.

음원 분석과 AI 추론은 브라우저에서만 실행합니다. 음원을 업로드·공개·모델 캐시 저장·학습에 사용하지 않습니다. 영상은 선택적 공식 임베드로 재생하며 다운로드·캡처 기능은 제공하지 않습니다. 필요한 이용 권한을 가진 파일을 사용하세요.
