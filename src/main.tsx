import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { practiceChart, type Difficulty } from './chart';
import { Library } from './Library';
import { Creator } from './Creator';
import { Player } from './Player';
import { getLanguage, setLanguage, subscribeLanguage, t } from './i18n';
import './style.css';
import './playTheme.css';

function App() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [practice, setPractice] = useState(() => practiceChart('easy'));
  useEffect(() => { document.documentElement.lang = language; document.title = t('당신이 가지고 있는 음악을 바로 리듬게임으로 만들어보세요. · DROP', 'Turn your own music into a rhythm game. · DROP'); }, [language]);
  function choose(level: Difficulty) { setDifficulty(level); setPractice(practiceChart(level)); }
  const path = location.pathname;
  return <>
    <header className="site-header"><a className="logo" href="/" aria-label="DROP home">drop<span>●</span></a>
      <span className="header-note">{t('그냥, 음악이랑 놀기.', 'Just playing with music.')}</span>
      <nav className="header-links"><a href="/library" className="header-link">{t('내 보관함', 'My library')}</a><a href="/create" className="header-link">{t('내 음악으로 플레이', 'Play my music')}</a><a href="/practice" className="header-link">{t('연습', 'Practice')}</a>
        <div className="language-switch" aria-label="Language"><button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button><button aria-pressed={language === 'ko'} onClick={() => setLanguage('ko')}>KO</button></div>
      </nav>
    </header>
    <main>
      {path === '/library' ? <Library /> : path === '/create' ? <Creator /> : path === '/practice' ? <>
        <div className="back-row"><a href="/">{t('← 홈으로', '← Home')}</a><div className="difficulty-switch"><button aria-pressed={difficulty === 'easy'} onClick={() => choose('easy')}>Easy</button><button aria-pressed={difficulty === 'normal'} onClick={() => choose('normal')}>Normal</button><button aria-pressed={difficulty === 'hard'} onClick={() => choose('hard')}>Hard</button></div></div>
        <Player key={practice.chartId} chart={practice} practice />
      </> : path === '/privacy' ? <Privacy /> : path === '/' ? <>
        <section className="hero"><div className="hero-copy"><span className="eyebrow">{t('내 컴퓨터에서, 내 음악으로', 'YOUR COMPUTER. YOUR MUSIC.')}</span><h1>{t('당신이 가지고 있는 음악을', 'Turn your own music')}<br /><em>{t('바로 리듬게임으로 만들어보세요.', 'into a rhythm game.')}</em></h1><p>{t('음악 파일을 고르고, 두 개의 키로 리듬을 타세요.', 'Choose an audio file and follow the rhythm with two keys.')}<br />{t('분석·채보 생성·기록 저장은 모두 이 브라우저에서.', 'Analysis, chart generation and records stay in your browser.')}</p>
          <div className="home-actions"><a className="primary" href="/create">{t('내 음악으로 플레이 →', 'Play my music →')}</a><a className="secondary" href="/practice">{t('먼저 연습해 보기', 'Try a practice round')}</a></div></div>
          <div className="hero-mark" aria-hidden="true"><div className="key-tile key-a">A<span>← / Z</span></div><div className="key-tile key-d">D<span>→ / X</span></div></div>
        </section>
        <section className="local-note"><h2>{t('음악 파일은 서버로 보내지 않습니다.', 'Your audio stays in your browser.')}</h2><p>{t('브라우저에서 채보를 만듭니다. AI 모델 다운로드와 영상 링크는 선택 사항이에요.', 'Charts are made in your browser. The AI model download and video link are optional.')}</p><a href="https://github.com/UTurtle/drop-music-game-player">{t('GitHub · 소스와 실행 방법 ↗', 'GitHub · Source & setup ↗')}</a><p>{t('음악과 채보는 이 브라우저의 보관함에 저장합니다. 서버로 전송하지 않습니다.', 'Audio and charts are saved in this browser’s library, never uploaded.')}</p></section>
      </> : <p className="error">{t('페이지를 찾을 수 없습니다.', 'Page not found.')} <a href="/">{t('홈으로', 'Home')}</a></p>}
    </main>
    <footer><a href="/" className="logo">drop<span>●</span></a><span>{t('음악이랑 노는 작은 장난감.', 'A little toy for playing with music.')}</span><a href="/privacy">{t('파일 · 이용 안내', 'Files & usage')}</a><a href="https://github.com/UTurtle/drop-music-game-player">GitHub ↗</a></footer>
  </>;
}
function Privacy() {
  return <article className="privacy"><h1>{t('파일 · 이용 안내', 'Files & usage')}</h1>
    <p>{t('곡별 난이도별 최고 점수와 PERFECT·FULL COMBO 달성 기록도 이 브라우저에만 저장합니다. 보관함에서 곡을 삭제하면 해당 기록도 삭제됩니다.', 'Per-song best scores by difficulty and PERFECT / FULL COMBO achievements are also stored only in this browser. Deleting a song from the library deletes its records.')}</p><p>{t('내보내기는 채보만 저장합니다. 음악 원본·파일명·개인 점수는 포함하지 않으며 자동 업로드하지 않습니다. 가져온 채보는 새 항목으로 추가되고, 이용 권한이 있는 동일한 음원을 직접 연결하면 재분석 없이 플레이할 수 있습니다.', 'Export saves charts only, without audio, source filenames or personal scores. Nothing is uploaded. Imported charts are new items: connect matching audio you have permission to use and play without reanalysis.')}</p>
    <h2>{t('음악 파일 처리 방식', 'How audio is processed')}</h2><p>{t('기본 분석과 AI 생성 모두 이 브라우저에서 실행합니다. 음악 파일을 서버에 전송하거나 저장하지 않으며 학습이나 공개 게시에 사용하지 않습니다. 완성된 채보와 선택한 음악 파일은 이 브라우저의 보관함에 자동 저장됩니다. 보관함에서 함께 삭제할 수 있습니다. 다른 기기로 동기화되지 않으며 사이트 데이터나 브라우저 저장 공간을 정리하면 사라질 수 있습니다. AI 모델은 다운로드 버튼을 누른 경우에만 브라우저에 저장하며, 만들기 화면의 저장된 모델 삭제 버튼으로 지울 수 있습니다.', 'Basic analysis and AI generation both run in this browser. Audio is never sent to or stored on the server, or used for training or publishing. Finished charts and selected audio are automatically saved in this browser’s library and can be deleted together there. They do not sync across devices and may be lost when site data or browser storage is cleared. AI model files are saved only after you click Download model. Remove them with Delete saved model on the create page.')}</p>
    <h2>{t('선택한 영상 재생', 'Optional video playback')}</h2><p>{t('영상 재생은 현재 YouTube 공식 플레이어를 지원하며 인터넷 연결이 필요합니다. 영상을 선택하면 YouTube가 쿠키나 재생 정보를 처리할 수 있습니다. 영상 다운로드나 오디오 추출은 제공하지 않습니다.', 'Optional video playback uses the official YouTube player and requires an internet connection. YouTube may process cookies and playback information when you select video playback. The app does not download videos or extract their audio.')}</p><p><a href="https://www.youtube.com/t/terms">YouTube Terms</a> · <a href="https://policies.google.com/privacy">Google Privacy Policy</a></p>
    <h2>{t('이용할 수 있는 파일을 사용해 주세요.', 'Use files you are allowed to use')}</h2><p>{t('직접 만든 음악 또는 필요한 이용 권한을 가진 파일을 사용하세요. 이 프로젝트의 소스 라이선스는 다른 사람의 음악·영상에 대한 권리를 제공하지 않습니다. 서버 공개 업로드는 제공하지 않습니다. 채보 공유 파일에는 음악 원본이 포함되지 않습니다. 각 사용자가 이용 권한이 있는 음원을 직접 준비해야 합니다. ', 'Use your own music or files you have the necessary rights to use. The source-code license does not grant rights to other people’s music or videos. Server publishing is not provided. Chart sharing files do not include music. Each player must provide audio they have permission to use. ')}</p>
    <h2>{t('설정과 데모 접속', 'Preferences and demo access')}</h2><p>{t('언어 설정, 보관함의 음악과 채보, 선택적으로 내려받은 AI 모델을 이 브라우저에 저장합니다. 계정과 분석 추적은 없습니다. 공개 데모의 연결 제공자는 접속 IP 등 일반적인 연결 정보를 처리할 수 있습니다.', 'Language preferences, saved music and charts, and optionally downloaded AI models are stored in this browser. There are no accounts or analytics trackers. The public demo’s hosting or tunnel provider may process ordinary connection information such as IP addresses.')}</p>
  </article>;
}
createRoot(document.getElementById('root')!).render(<App />);
