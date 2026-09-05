import { t } from './i18n';
import type { Status } from './engine';
export interface Media {
  timeMs(): number;
  play(): Promise<void> | void;
  pause(): void;
  restart(): void;
  destroy(): void;
  advance?(ms: number): void;
}
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}
let youtubeReady: Promise<void> | undefined;
function loadYouTube(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeReady) return youtubeReady;
  youtubeReady = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => { script.remove(); reject(new Error(t("YouTube 연결 시간이 초과되었습니다. 네트워크를 확인하고 다시 열어 주세요."))); }, 15_000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); resolve(); };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error(t("YouTube 플레이어를 불러올 수 없습니다."))); };
    document.head.append(script);
  }).catch(error => { youtubeReady = undefined; throw error; });
  return youtubeReady;
}
export async function createYouTube(
  host: HTMLElement, videoId: string,
  onStatus: (status: Status) => void, onError: (message: string) => void,
  signal: AbortSignal,
): Promise<Media | null> {
  await loadYouTube();
  if (signal.aborted) return null;
  return new Promise((resolve) => {
    const mount = document.createElement('div');
    host.replaceChildren(mount);
    let ready = false;
    const timer = window.setTimeout(() => {
      if (!ready && !signal.aborted) onError(t("영상이 응답하지 않습니다. 네트워크 또는 임베드 허용 여부를 확인해 주세요."));
    }, 15_000);
    const player = new YT.Player(mount, {
      width: '100%', height: '100%', videoId,
      playerVars: { playsinline: 1, controls: 1, disablekb: 1, origin: location.origin, rel: 0 },
      events: {
        onReady: () => {
          clearTimeout(timer);
          if (signal.aborted) return;
          ready = true;
          const iframe = player.getIframe();
          iframe.title = 'YouTube music video';
          onStatus('ready');
          resolve({
            timeMs: () => player.getCurrentTime() * 1000,
            play: () => { player.playVideo(); }, pause: () => { player.pauseVideo(); },
            restart: () => { player.seekTo(0, true); player.playVideo(); },
            destroy: () => { clearTimeout(timer); player.destroy(); },
          });
        },
        onStateChange: event => {
          if (signal.aborted) return;
          const statuses: Record<number, Status> = { '-1': 'ready', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'ready' };
          onStatus(statuses[event.data] ?? 'ready');
        },
        onAutoplayBlocked: () => onError(t("재생이 차단되었습니다. 영상 안의 재생 버튼을 눌러 주세요.")),
        onError: event => {
          const errors: Record<number, string> = {
            2: t("영상 ID가 올바르지 않습니다."), 5: t("이 브라우저에서 영상을 재생할 수 없습니다."),
            100: t("삭제되었거나 비공개인 영상입니다."), 101: t("이 영상은 외부 사이트 재생을 허용하지 않습니다."),
            150: t("이 영상은 외부 사이트 재생을 허용하지 않습니다."),
            153: t("YouTube가 사이트 출처를 확인할 수 없습니다. HTTP 주소와 Referrer 설정을 확인해 주세요."),
          };
          clearTimeout(timer);
          if (!signal.aborted) onError(errors[event.data] ?? t("YouTube 영상을 재생할 수 없습니다."));
        },
      },
    });
    signal.addEventListener('abort', () => { clearTimeout(timer); player.destroy(); resolve(null); }, { once: true });
  });
}

/** Original synthesized practice audio, never presented as a music-video chart. */
export class PracticeMedia implements Media {
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private buffer?: AudioBuffer;
  private start = 0;
  private position = 0;
  private playing = false;
  constructor(private onStatus: (status: Status) => void, private deterministic = false) {}
  timeMs() {
    const time = this.playing && !this.deterministic ? this.position + ((this.context?.currentTime ?? 0) - this.start) * 1000 : this.position;
    if (time >= 24_000 && this.playing) { this.pause(); this.position = 24_000; this.onStatus('ended'); }
    return Math.min(24_000, time);
  }
  private createBuffer(context: AudioContext) {
    const buffer = context.createBuffer(1, context.sampleRate * 24, context.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic decaying tones: a quarter-note pulse and a slower two-note phrase.
    for (let beat = 0; beat < 48; beat++) {
      const start = Math.floor((beat * 0.5) * context.sampleRate);
      for (let i = 0; i < context.sampleRate * 0.22; i++) {
        const t = i / context.sampleRate;
        data[start + i] += 0.3 * Math.sin(2 * Math.PI * (75 * t + 3 * (1 - Math.exp(-t * 35)))) * Math.exp(-t * 24);
        if (beat % 2 === 0) data[start + i] += 0.1 * Math.sin(2 * Math.PI * (beat % 4 === 0 ? 220 : 277.18) * t) * Math.exp(-t * 16);
      }
    }
    return buffer;
  }
  async play() {
    if (this.playing) return;
    if (this.position >= 24_000) this.position = 0;
    if (!this.deterministic) {
      this.context ??= new AudioContext();
      await this.context.resume();
      this.buffer ??= this.createBuffer(this.context);
      this.source = this.context.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.connect(this.context.destination);
      this.source.start(0, this.position / 1000);
      this.start = this.context.currentTime;
    }
    this.playing = true;
    this.onStatus('playing');
  }
  pause() {
    if (this.playing && !this.deterministic) this.position += ((this.context?.currentTime ?? 0) - this.start) * 1000;
    this.source?.stop(); this.source = undefined;
    this.playing = false; this.onStatus('paused');
  }
  restart() { this.pause(); this.position = 0; void this.play(); }
  advance(ms: number) { if (this.deterministic && this.playing) this.position += ms; }
  destroy() { this.pause(); void this.context?.close(); }
}

/** Selected file playback; the object URL never leaves this browser. */
export class LocalFileMedia implements Media {
  private audio: HTMLAudioElement;
  private url: string;
  constructor(file: File, onStatus: (status: Status) => void, onError: (message: string) => void) {
    this.url = URL.createObjectURL(file);
    this.audio = new Audio(this.url);
    this.audio.preload = 'auto';
    this.audio.onplaying = () => onStatus('playing');
    this.audio.onpause = () => { if (!this.audio.ended) onStatus('paused'); };
    this.audio.onwaiting = () => onStatus('buffering');
    this.audio.onended = () => onStatus('ended');
    this.audio.onerror = () => onError(t("음악 파일을 재생할 수 없습니다. 다른 파일을 선택해 주세요."));
  }
  timeMs() { return this.audio.currentTime * 1000; }
  play() { return this.audio.play(); }
  pause() { this.audio.pause(); }
  restart() { this.audio.currentTime = 0; void this.play().catch(() => this.audio.onerror?.(new Event('error'))); }
  destroy() {
    this.audio.onplaying = this.audio.onpause = this.audio.onwaiting = this.audio.onended = this.audio.onerror = null;
    this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); URL.revokeObjectURL(this.url);
  }
}
