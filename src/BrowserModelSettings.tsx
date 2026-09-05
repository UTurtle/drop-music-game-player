import { useEffect, useRef, useState } from 'react';
import { t } from './i18n';
import { cacheStatus, deleteModelCache, downloadModel, getManifest, megabytes, supportsWebGPU, type ModelManifest } from './modelCache';

export function BrowserModelSettings({ busy, onReady }: { busy: boolean; onReady: (ready: boolean) => void }) {
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [bytes, setBytes] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([getManifest(), supportsWebGPU()]).then(async ([m, gpu]) => {
      const state = await cacheStatus(m);
      if (active) { setManifest(m); setSupported(gpu); setReady(state.ready); setBytes(state.bytes); onReady(gpu && state.ready); }
    }).catch(() => { if (active) { setSupported(false); onReady(false); } });
    return () => { active = false; abort.current?.abort(); };
  }, [onReady]);
  const total = manifest?.files.reduce((n, f) => n + f.bytes, 0) ?? 0;
  async function download() {
    if (!manifest) return;
    const controller = new AbortController(); abort.current = controller;
    setDownloading(true); setNotice('');
    try {
      await downloadModel(manifest, controller.signal, setBytes);
      setReady(true); onReady(true);
      setNotice(t('준비됐습니다. 다음부터는 저장된 모델을 사용합니다.', 'Ready. Future runs use the saved model.'));
    } catch (error) {
      setBytes(0); setReady(false); onReady(false);
      setNotice(controller.signal.aborted ? t('다운로드를 취소하고 받은 모델 파일을 지웠습니다.', 'Download canceled. Downloaded model files were removed.') : t('모델을 저장하지 못했습니다. 저장 공간과 연결을 확인해 주세요. 기본 분석은 계속 사용할 수 있습니다.', 'Could not save the model. Check storage and your connection. Basic analysis is still available.'));
    } finally { setDownloading(false); abort.current = null; }
  }
  async function remove() {
    try { await deleteModelCache(); setReady(false); setBytes(0); onReady(false); setNotice(t('저장된 모델을 지웠습니다. 다시 받기 전까지 기본 분석을 사용합니다.', 'Saved model removed. Basic analysis will be used until you download it again.')); }
    catch { setNotice(t('모델을 지우지 못했습니다. 브라우저의 사이트 저장 공간 설정에서 삭제해 주세요.', 'Could not remove the model. Use your browser’s site storage settings.')); }
  }
  return <div className="browser-model-settings">
    <strong>{t('이 기기에서 AI 채보 만들기', 'Create AI charts on this device')}</strong>
    <p>{t('음악 파일은 이 브라우저에서만 처리합니다.', 'Your audio stays in this browser.')}</p>
    {manifest && <p>{t(`모델과 실행 파일 ${megabytes(total)}를 다운로드하고 브라우저에 저장합니다. 저장 공간을 사용하며, 실행 중에는 추가 메모리가 필요합니다.`, `Downloads and stores ${megabytes(total)} of model and runtime files in your browser. This uses storage; running the model also needs memory.`)}</p>}
    {supported === false && <p>{t('현재 브라우저에서 AI 실행을 준비할 수 없어 기본 분석을 사용합니다.', 'AI is unavailable in this browser. Basic analysis will be used.')}</p>}
    <div className="model-cache-actions">
      {!ready && <button type="button" disabled={!supported || !manifest || downloading || busy} onClick={() => void download()}>{downloading ? `${megabytes(bytes)} / ${megabytes(total)}` : t('모델 다운로드', 'Download model')}</button>}
      {ready && <span>{t('저장됨', 'Saved')} · {megabytes(bytes)}</span>}
      {downloading ? <button type="button" onClick={() => abort.current?.abort()}>{t('다운로드 취소', 'Cancel download')}</button> : <button type="button" disabled={busy} onClick={() => void remove()}>{t('저장된 모델 삭제', 'Delete saved model')}</button>}
    </div>
    {notice && <p role="status">{notice}</p>}
    <small>{t('모델만 삭제하며 음악 파일이나 언어 설정은 건드리지 않습니다. 브라우저가 저장 공간을 정리하면 다시 다운로드해야 할 수 있습니다.', 'Only model files are deleted. Your music and language preference are unaffected. Browser storage cleanup may require downloading the model again.')}</small>
    <details><summary>{t('모델 정보와 라이선스', 'Model information and licenses')}</summary><small>Mapperatorinator v32-mini · FP16<br />
      <a href="/models/mapper-mini-v1/MODEL-CARD.md" target="_blank" rel="noreferrer">{t('원본 모델 카드', 'Original model card')}</a> · <a href="/models/mapper-mini-v1/Mapperatorinator-MIT.txt" target="_blank" rel="noreferrer">MIT</a><br />
      <a href="/models/mapper-mini-v1/ONNX-Runtime-MIT.txt" target="_blank" rel="noreferrer">ONNX Runtime MIT</a> · <a href="/models/mapper-mini-v1/ONNX-Runtime-ThirdPartyNotices.txt" target="_blank" rel="noreferrer">{t('외부 구성요소 고지', 'Third-party notices')}</a>
    </small></details>
  </div>;
}
