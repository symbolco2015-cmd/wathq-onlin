import type { AppState, SectionData } from './types';

export const getCompletionColor = (pct: number): string => {
  if (pct >= 70) return '#1D9E75';
  if (pct >= 35) return '#BA7517';
  return '#D85A30';
};

export const getCompletionLabel = (pct: number): string => {
  if (pct >= 70) return 'متقدم';
  if (pct >= 35) return 'في التقدم';
  return 'يحتاج عمل';
};

export function calculateEvaluation(state: AppState, sections: SectionData[]) {
  let totalEvs = 0;
  let filledSecs = 0;
  sections.forEach(s => {
    let hasEv = false;
    const subs = [...s.subs, ...(state.csubs[s.id] || [])];
    subs.forEach(sub => {
      const cnt = (state.ev[`${s.id}|${sub}`] || []).length;
      totalEvs += cnt;
      if (cnt > 0) hasEv = true;
    });

    if (s.isStrat) {
      state.strats.forEach(sn => {
        const cnt = (state.ev[`${s.id}|strat:${sn}`] || []).length;
        totalEvs += cnt;
        if (cnt > 0) hasEv = true;
      });
    }

    if (hasEv) filledSecs++;
  });

  const secScore = Math.min(50, Math.round((filledSecs / sections.length) * 50));
  const evScore = Math.min(30, Math.round((totalEvs / 15) * 30)); // 15 evidences for full score
  const stratScore = Math.min(20, Math.round((state.strats.length / 4) * 20)); // 4 strategies for full score
  const totalScore = secScore + evScore + stratScore;

  let levelStr = 'قيد الإنجاز';
  let levelIcon = 'ti-clock';
  let levelClass = 'text-[var(--text2)] border-white/10 hover:border-white/30 hover:bg-white/5';
  let isVerified = false;

  if (totalScore >= 85) {
    levelStr = 'معلم متميز';
    levelIcon = 'ti-star-filled';
    levelClass = 'text-[var(--gold)] border-[var(--gold)]/30 hover:bg-[var(--gold)]/10 hover:border-[var(--gold)]/50';
    isVerified = true;
  } else if (totalScore >= 50) {
    levelStr = 'موثّق رسمياً';
    levelIcon = 'ti-shield-check';
    levelClass = 'text-[var(--em8)] border-[var(--em7)]/30 hover:bg-[var(--em7)]/10 hover:border-[var(--em7)]/50';
    isVerified = true;
  }

  return { totalEvs, filledSecs, secScore, evScore, stratScore, totalScore, levelStr, levelIcon, levelClass, isVerified };
}
