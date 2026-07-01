import { useMemo } from 'react';
import type { Evidence, SectionData } from '../types';

export type EvidenceKey = string; // `${sectionId}|${subName}`

export interface EvidenceEntry {
  key: EvidenceKey;
  sectionId: number;
  sub: string;
  evidence: Evidence[];
}

export interface EvidenceTypeStats {
  pdf: number;
  img: number;
  doc: number;
  vid: number;
}

export interface SectionEvidenceStat {
  sectionId: number;
  sectionTitle: string;
  total: number;
  filledSubs: number;
  totalSubs: number;
  completionPct: number;
}

export interface EvidenceStats {
  total: number;
  byType: EvidenceTypeStats;
  bySections: SectionEvidenceStat[];
  filledSectionCount: number;
}

interface UseEvidenceStoreOptions {
  ev: Record<EvidenceKey, Evidence[]>;
  sections: SectionData[];
  /** custom subsections per section index */
  csubs?: Record<number, string[]>;
  /** globally selected teaching-strategy ids, used only for the isStrat section's stat */
  strats?: string[];
}

export function buildEvKey(sectionId: number, sub: string): EvidenceKey {
  return `${sectionId}|${sub}`;
}

export function parseEvKey(key: EvidenceKey): { sectionId: number; sub: string } {
  const idx = key.indexOf('|');
  return {
    sectionId: Number(key.slice(0, idx)),
    sub: key.slice(idx + 1),
  };
}

export function useEvidenceStore({ ev, sections, csubs = {}, strats = [] }: UseEvidenceStoreOptions) {
  /** flat list — every non-empty key with its parsed metadata */
  const entries = useMemo<EvidenceEntry[]>(() =>
    Object.entries(ev)
      .filter(([, list]) => list.length > 0)
      .map(([key, evidence]) => {
        const { sectionId, sub } = parseEvKey(key);
        return { key, sectionId, sub, evidence };
      }),
    [ev]
  );

  /** aggregate stats */
  const stats = useMemo<EvidenceStats>(() => {
    const byType: EvidenceTypeStats = { pdf: 0, img: 0, doc: 0, vid: 0 };
    let total = 0;

    for (const { evidence } of entries) {
      for (const e of evidence) {
        total++;
        if (e.type in byType) byType[e.type as keyof EvidenceTypeStats]++;
      }
    }

    const bySections: SectionEvidenceStat[] = sections.map(s => {
      // قسم الاستراتيجيات (isStrat) لا يملك "أدلة" عادية بل قائمة استراتيجيات
      // مختارة في state.strats — احسب نسبته من هذه القائمة بدل subs العادية.
      if (s.isStrat) {
        const totalSubs = s.strats?.length ?? 0;
        const filled = s.strats
          ? strats.filter(id => s.strats!.includes(id)).length
          : 0;
        const completionPct = totalSubs > 0
          ? Math.round((filled / totalSubs) * 100)
          : 0;
        return {
          sectionId: s.id,
          sectionTitle: s.ttl,
          total: filled,
          filledSubs: filled,
          totalSubs,
          completionPct,
        };
      }

      const allSubs = [...s.subs, ...(csubs[s.id] ?? [])];
      let secTotal = 0;
      let filled = 0;
      for (const sub of allSubs) {
        const count = (ev[buildEvKey(s.id, sub)] ?? []).length;
        secTotal += count;
        if (count > 0) filled++;
      }
      const completionPct = allSubs.length > 0
        ? Math.round((filled / allSubs.length) * 100)
        : 0;
      return {
        sectionId: s.id,
        sectionTitle: s.ttl,
        total: secTotal,
        filledSubs: filled,
        totalSubs: allSubs.length,
        completionPct,
      };
    });

    const filledSectionCount = bySections.filter(s => s.total > 0).length;

    return { total, byType, bySections, filledSectionCount };
  }, [ev, entries, sections, csubs, strats]);

  /** get evidence list for a specific section + sub */
  function getEvidence(sectionId: number, sub: string): Evidence[] {
    return ev[buildEvKey(sectionId, sub)] ?? [];
  }

  /** get the stat object for a single section */
  function getSectionStat(sectionId: number): SectionEvidenceStat | undefined {
    return stats.bySections.find(s => s.sectionId === sectionId);
  }

  return {
    entries,
    stats,
    getEvidence,
    getSectionStat,
    buildEvKey,
    parseEvKey,
  };
}
