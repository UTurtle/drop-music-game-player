import { t } from './i18n';
import type { SongRecords } from './songRecords';
import { difficulties, difficultyLabel, type SongCharts } from './difficulties';

export function SongRecordLines({ records, charts }: { records?: SongRecords; charts?: SongCharts }) {
  return <div className="song-records" aria-label={t('난이도별 최고 기록', 'Best scores by difficulty')}>
    {difficulties.filter(level => !charts || charts[level]).map(difficulty => {
      const record = records?.[difficulty];
      return <div className="song-record-line" data-difficulty={difficulty} key={difficulty}>
        <span className="record-level">{difficultyLabel(difficulty)}</span>
        <span className="record-score">{record ? `${record.score.toLocaleString('en-US')}${t('점', ' pts')}` : t('기록 없음', 'Not played')}</span>
        {record?.perfect && <b className="record-perfect">PERFECT</b>}
        {!record?.perfect && record?.fullCombo && <b className="record-full-combo">FULL COMBO</b>}
      </div>;
    })}
  </div>;
}
