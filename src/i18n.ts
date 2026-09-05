export type Language = 'en' | 'ko';
function initialLanguage(): Language {
  if (typeof window === 'undefined') return 'ko';
  try {
    const saved = localStorage.getItem('drop-language');
    if (saved === 'en' || saved === 'ko') return saved;
  } catch { /* Storage may be unavailable in private browsing. */ }
  return navigator.language.startsWith('ko') ? 'ko' : 'en';
}
let language = initialLanguage();
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export function subscribeLanguage(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setLanguage(next: Language) {
  language = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  try { localStorage.setItem('drop-language', next); } catch { /* Session-only preference. */ }
  listeners.forEach(listener => listener());
}
export function t(korean: string, english?: string): string {
  return language === 'ko' ? korean : english ?? translations[korean] ?? korean;
}
const translations: Record<string, string> = {
  "곡 제목과 음악 파일을 선택해 주세요.": "Choose a song title and an audio file.",
  "이 영상 링크는 아직 지원하지 않습니다. 링크를 비우면 음악 파일만으로 플레이할 수 있어요. 현재 영상 재생은 YouTube 링크를 지원합니다.": "This video link is not supported yet. Leave it empty to play your audio file. Video playback currently supports YouTube links.",
  "분석하지 못했습니다.": "Could not analyze this file.",
  "분석을 취소했습니다. 파일은 업로드되지 않았습니다.": "Analysis canceled. Your file was not uploaded.",
  "← 곡 찾기로": "\u2190 Back home",
  "내 음악으로": "Your music.",
  "바로 플레이.": "Press play.",
  "좋아하는 노래도, 직접 만든 노래도.": "A song you love, or one you made.",
  "음악 파일을 고르면 게임이 됩니다.": "Pick an audio file and turn it into a game.",
  "01 파일 선택": "01 Pick a file",
  "02 난이도 선택": "02 Choose difficulty",
  "노래가 있는 영상 링크 (선택)": "Video with this song (optional)",
  "영상이 있다면 링크를 붙여넣으세요": "Paste a video link, if you have one",
  "곡 제목": "Song title",
  "아티스트 — 곡 제목": "Artist \u2014 song title",
  "음악 파일 선택": "Audio file",
  "음악 파일을 선택하세요": "Choose an audio file",
  "WAV / MP3 / FLAC · 최대 50 MB, 10분": "WAV / MP3 / FLAC \u00b7 Up to 50 MB, 10 minutes",
  "만들고 플레이 →": "Make & play \u2192",
  "로컬 음원 분석 진행률": "Audio analysis progress",
  "분석 취소": "Cancel analysis",
  "브라우저 안에서 리듬을 찾고 있습니다. 파일은 전송하지 않습니다.": "Finding the rhythm in your browser. Your file stays here.",
  "기본은 나만 플레이입니다. 파일은 업로드되지 않으며, 페이지를 닫으면 작업이 사라집니다.": "Play privately. Your file is not uploaded. Closing this page clears your work.",
  "준비됐어요. 플레이해 보세요.": "Ready. Give it a play.",
  "Easy 또는 Hard를 골라 시작하세요. 지금은 나만 볼 수 있습니다.": "Choose Easy or Hard. Only you can see this session.",
  "음악 파일과 비공개 작업은 이 페이지에서만 유지됩니다. 새로고침하거나 페이지를 닫으면 다시 파일을 선택해 주세요.": "Your audio and chart stay in this page. After a refresh or closing the page, select your file again.",
  "음악 파일 대신 연결한 영상으로 플레이": "Play the linked video instead of my audio file",
  "영상 없이도 플레이할 수 있어요. 공개 공유는 현재 제공하지 않습니다.": "No video needed. Public sharing is not available.",
  "다른 음원으로 새 채보 만들기": "Choose another song",
  "BUFFERING — 판정 대기": "BUFFERING \u2014 judgment paused",
  "영상을 불러오지 못했습니다.": "Could not load the video.",
  "재생을 시작하지 못했습니다. 다시 눌러 주세요.": "Could not start playback. Please try again.",
  "같은 편집본인지 확인하고 처음·중간·끝의 싱크를 점검해 주세요.": "Check that this is the same edit and verify sync at the beginning, middle and end.",
  "채보 JSON을 저장했습니다.": "Chart JSON saved.",
  "저장하지 못했습니다.": "Could not save.",
  "링크를 복사했습니다.": "Link copied.",
  "게시하지 못했습니다. 다시 시도해 주세요.": "Could not publish. Please try again.",
  "나만 플레이": "Private play",
  "링크 공유 ↗": "Copy link \u2197",
  "내 음악 파일로 재생 중": "Playing your audio file",
  "합성 리듬 연습 · 실제 MV가 아닙니다": "Synthetic practice audio \u00b7 not a music video",
  "왼쪽 A·왼쪽 화살표·Z, 오른쪽 D·오른쪽 화살표·X 두 레인 리듬게임. 노트가 판정선에 오면 해당 키를 누르세요.": "Two lanes: A / Left arrow / Z on the left, D / Right arrow / X on the right. Press when notes reach the line.",
  "다시 PLAY": "PLAY again",
  "↺ 처음부터": "\u21ba Restart",
  "A D / ← → / Z X · Space 일시정지 · F 전체화면": "A D / \u2190 \u2192 / Z X \u00b7 Space pause \u00b7 F fullscreen",
  "끝까지 잘 들었어요.": "Thanks for playing.",
  "최대 콤보": "Best combo",
  "· 탐색한 연습 세션": "\u00b7 Practice after seeking",
  "돌아가기": "Go back",
  "제작자 · MV 싱크 조정": "Adjust video sync",
  "양수는 노트를 더 늦게 표시합니다. 조정하면 일시정지되며 점수가 초기화됩니다.": "Positive values delay notes. Changing this pauses playback and resets your score.",
  "MV에 중간 삽입·삭제 등 원본 음원과 다른 편집이 있습니다.": "The video has inserts or cuts that differ from my audio file.",
  "지원하지 않는 편집 차이입니다. 동일한 편집본의 음원을 사용해 다시 생성해 주세요. 오프셋만으로는 맞출 수 없습니다.": "This edit difference is not supported. Choose audio with the same edit. A single offset cannot fix it.",
  "처음·중간·끝에서 동일 편집본과 싱크를 확인했습니다.": "I checked the same edit and sync at the beginning, middle and end.",
  "채보 JSON 저장 ↓": "Save chart JSON \u2193",
  "게시 중…": "Publishing\u2026",
  "이 버전은 게시되었습니다. 위의 공유 링크를 사용해 주세요.": "This version is published. Use the share link above.",
  "MV를 한 번 재생하고 싱크를 확인하면 게시할 수 있습니다.": "Play the video and check synchronization before publishing.",
  "YouTube 연결 시간이 초과되었습니다. 네트워크를 확인하고 다시 열어 주세요.": "YouTube connection timed out. Check your network and try again.",
  "YouTube 플레이어를 불러올 수 없습니다.": "Could not load the YouTube player.",
  "영상이 응답하지 않습니다. 네트워크 또는 임베드 허용 여부를 확인해 주세요.": "The video did not respond. Check your connection and whether embedding is allowed.",
  "재생이 차단되었습니다. 영상 안의 재생 버튼을 눌러 주세요.": "Playback was blocked. Press the play button inside the video.",
  "영상 ID가 올바르지 않습니다.": "Invalid video ID.",
  "이 브라우저에서 영상을 재생할 수 없습니다.": "This browser cannot play the video.",
  "삭제되었거나 비공개인 영상입니다.": "This video is private or has been removed.",
  "이 영상은 외부 사이트 재생을 허용하지 않습니다.": "This video does not allow playback on other sites.",
  "YouTube가 사이트 출처를 확인할 수 없습니다. HTTP 주소와 Referrer 설정을 확인해 주세요.": "YouTube could not verify the site origin. Check the HTTP address and Referrer settings.",
  "YouTube 영상을 재생할 수 없습니다.": "Could not play the YouTube video.",
  "음악 파일을 재생할 수 없습니다. 다른 파일을 선택해 주세요.": "Could not play this audio file. Choose another file.",
  "분석을 취소했습니다.": "Analysis canceled.",
  "취소됨": "Canceled",
  "음원 정보를 읽지 못했습니다. WAV/MP3 파일을 확인해 주세요.": "Could not read audio metadata. Check your WAV or MP3 file.",
  "이 브라우저에서 읽을 수 없는 파일입니다. WAV 또는 MP3를 선택해 주세요.": "This browser cannot read the file. Choose a WAV or MP3 file.",
  "50 MB 이하의 WAV/MP3/FLAC 파일을 선택해 주세요.": "Choose a WAV, MP3 or FLAC file under 50 MB.",
  "1초~10분 길이의 음원을 선택해 주세요.": "Choose audio between 1 second and 10 minutes long.",
  "음원을 디코딩하지 못했습니다. PCM WAV 또는 다른 MP3 파일을 선택해 주세요.": "Could not decode the audio. Try PCM WAV or another MP3 file.",
  "음원은 최대 10분까지 지원합니다.": "Audio can be up to 10 minutes long.",
  "분석 작업을 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요.": "Could not start analysis. Refresh and try again.",
  "음원에 잘못된 샘플이 있습니다.": "The audio contains invalid samples.",
  "무음 파일에서는 채보를 만들 수 없습니다.": "Cannot create a chart from silence.",
  "리듬 후보를 찾지 못했습니다. 다른 음원이나 수동 채보를 사용해 주세요.": "No rhythm events found. Try another file or a manual chart.",
  "충분한 리듬 후보를 찾지 못했습니다. 다른 음원을 선택해 주세요.": "Not enough rhythm events found. Try another file.",
  "채보 형식이 올바르지 않습니다. schemaVersion 1 JSON을 확인해 주세요.": "Invalid chart format. Check the schemaVersion 1 JSON.",
  "노트는 시간순이어야 하며, 중복 시각·잘못된 레인·영상 시작 전 노트는 허용하지 않습니다.": "Notes must be ordered, with unique times, valid lanes and no notes before playback starts.",
  "채보 목록 형식이 올바르지 않습니다.": "Invalid chart catalog format.",
  "채보 목록에 잘못된 항목이 있습니다.": "The chart catalog contains an invalid entry.",
  "공개된 채보를 찾을 수 없습니다.": "Published chart not found.",
  "채보를 불러오지 못했습니다. 다시 시도해 주세요.": "Could not load the chart. Please try again.",
  "채보 파일이 너무 큽니다.": "The chart file is too large.",
  "채보 JSON을 읽을 수 없습니다.": "Could not read chart JSON.",
};
