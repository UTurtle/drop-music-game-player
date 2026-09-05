import { useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { practiceChart, type Difficulty } from './chart';
import { Creator } from './Creator';
import { Player } from './Player';
import { getLanguage, setLanguage, subscribeLanguage, t } from './i18n';
import './style.css';

function App() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [practice, setPractice] = useState(() => practiceChart('easy'));
  useEffect(() => { document.documentElement.lang = language; document.title = t('내가 좋아하는 노래들은 왜 리듬게임에 추가 안 해주지? · DROP', 'Why aren’t my favorite songs in rhythm games? · DROP'); }, [language]);
  function choose(level: Difficulty) { setDifficulty(level); setPractice(practiceChart(level)); }
  const path = location.pathname;
  return <>
    <header className="site-header"><a className="logo" href="/" aria-label="DROP home">drop<span>●</span></a>
      <span className="header-note">{t('그냥, 음악이랑 놀기.', 'Just playing with music.')}</span>
      <nav className="header-links"><a href="/create" className="header-link">{t('내 음악으로 플레이', 'Play my music')}</a><a href="/practice" className="header-link">{t('연습', 'Practice')}</a>
        <div className="language-switch" aria-label="Language"><button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button><button aria-pressed={language === 'ko'} onClick={() => setLanguage('ko')}>KO</button></div>
      </nav>
    </header>
    <main>
      {path === '/create' ? <Creator /> : path === '/practice' ? <>
        <div className="back-row"><a href="/">{t('← 홈으로', '← Home')}</a><div className="difficulty-switch"><button aria-pressed={difficulty === 'easy'} onClick={() => choose('easy')}>Easy</button><button aria-pressed={difficulty === 'hard'} onClick={() => choose('hard')}>Hard</button></div></div>
        <Player key={practice.chartId} chart={practice} practice />
      </> : path === '/privacy' ? <Privacy /> : path === '/' ? <>
        <section className="hero"><div className="hero-copy"><span className="eyebrow">{t('내 컴퓨터에서, 내 음악으로', 'YOUR COMPUTER. YOUR MUSIC.')}</span><h1>{t('내가 좋아하는 노래들은', 'Why aren’t my favorite songs')}<br /><em>{t('왜 리듬게임에 추가 안 해주지?', 'in rhythm games?')}</em></h1><p>{t('음악 파일을 고르고, 두 개의 키로 리듬을 타세요.', 'Choose an audio file and follow the rhythm with two keys.')}<br />{t('잘 치지 않아도 괜찮아요. 그냥 재미로.', 'No need to be good. Just have fun.')}</p>
          <div className="home-actions"><a className="primary" href="/create">{t('내 음악으로 플레이 →', 'Play my music →')}</a><a className="secondary" href="/practice">{t('먼저 연습해 보기', 'Try a practice round')}</a></div></div>
          <div className="hero-mark" aria-hidden="true"><div className="key-tile key-a">A<span>← / Z</span></div><div className="key-tile key-d">D<span>→ / X</span></div></div>
        </section>
        <section className="local-note"><h2>{t('다운로드해서 내 컴퓨터에서 실행하세요.', 'Run it on your own computer.')}</h2><p>{t('음악 분석과 재생은 브라우저 안에서 진행됩니다. 영상 링크는 선택 사항이에요.', 'Audio analysis and playback happen in your browser. A video link is optional.')}</p><a href="https://github.com/UTurtle/drop-music-game-player">{t('GitHub · 소스와 실행 방법 ↗', 'GitHub · Source & setup ↗')}</a><p>{t('파일은 서버로 전송하지 않습니다. 새로고침하면 현재 작업은 사라집니다.', 'Files are not sent to the server. Refreshing clears your current session.')}</p></section>
      </> : <p className="error">{t('페이지를 찾을 수 없습니다.', 'Page not found.')} <a href="/">{t('홈으로', 'Home')}</a></p>}
    </main>
    <footer><a href="/" className="logo">drop<span>●</span></a><span>{t('음악이랑 노는 작은 장난감.', 'A little toy for playing with music.')}</span><a href="/privacy">{t('파일 · 이용 안내', 'Files & usage')}</a><a href="https://github.com/UTurtle/drop-music-game-player">GitHub ↗</a></footer>
  </>;
}
function Privacy() {
  return <article className="privacy"><h1>{t('파일 · 이용 안내', 'Files & usage')}</h1>
    <h2>{t('음악 파일은 내 브라우저 안에', 'Audio stays in your browser')}</h2><p>{t('선택한 파일은 채보 생성과 개인 재생에만 사용합니다. 서버 업로드, 모델 학습, 공개 게시 기능은 없습니다. 파일과 채보는 페이지 메모리에만 유지되므로 새로고침하거나 닫으면 사라집니다.', 'Your selected file is used to generate notes and play music locally. There is no audio upload, model training or public publishing. Files and charts stay in page memory and are cleared when you refresh or close the page.')}</p>
    <h2>{t('선택한 영상 재생', 'Optional video playback')}</h2><p>{t('영상 재생은 현재 YouTube 공식 플레이어를 지원하며 인터넷 연결이 필요합니다. 영상을 선택하면 YouTube가 쿠키나 재생 정보를 처리할 수 있습니다. 영상 다운로드나 오디오 추출은 제공하지 않습니다.', 'Optional video playback uses the official YouTube player and requires an internet connection. YouTube may process cookies and playback information when you select video playback. The app does not download videos or extract their audio.')}</p><p><a href="https://www.youtube.com/t/terms">YouTube Terms</a> · <a href="https://policies.google.com/privacy">Google Privacy Policy</a></p>
    <h2>{t('이용할 수 있는 파일을 사용해 주세요.', 'Use files you are allowed to use')}</h2><p>{t('직접 만든 음악 또는 필요한 이용 권한을 가진 파일을 사용하세요. 이 프로젝트의 소스 라이선스는 다른 사람의 음악·영상에 대한 권리를 제공하지 않습니다. 공개 데모에서도 음원과 채보를 공유하거나 서버에 보관하지 않습니다.', 'Use your own music or files you have the necessary rights to use. The source-code license does not grant rights to other people’s music or videos. The public demo does not share or store audio files or charts on its server.')}</p>
    <h2>{t('설정과 데모 접속', 'Preferences and demo access')}</h2><p>{t('언어 설정만 이 브라우저에 저장합니다. 계정과 분석 추적은 없습니다. 공개 데모의 연결 제공자는 접속 IP 등 일반적인 연결 정보를 처리할 수 있습니다.', 'Only your language preference is saved in this browser. There are no accounts or analytics trackers. The public demo’s hosting or tunnel provider may process ordinary connection information such as IP addresses.')}</p>
  </article>;
}
createRoot(document.getElementById('root')!).render(<App />);
