export type PageType = 'auth' | 'dashboard' | 'public' | 'admin';

export interface Evidence {
  type: 'pdf' | 'img' | 'doc' | 'vid';
  name: string;
  date: string;
  sub?: string;
  url?: string;
}

export interface SectionData {
  id: number;
  ttl: string;
  icon: string;
  subs: string[];
  isStrat?: boolean;
  strats?: string[];
}

export interface UserProfile {
  name: string;
  role: string;
  school: string;
  phone: string;
  email: string;
  twitter: string;
  linkedin: string;
  youtube: string;
  avatar: string;
  yearsOfExperience: number;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'tech' | 'admin' | 'urgent';
  attachment_url?: string;
  created_at: string;
  created_by?: string;
}

export interface AcademicDate {
  id: string;
  title: string;
  date: string;
  hijri_label?: string;
  created_at: string;
  created_by?: string;
}

export interface AppState {
  ev: Record<string, Evidence[]>;
  strats: string[];
  csubs: Record<number, string[]>;
  notes: Record<string, string>;
  profile: UserProfile;
  readAnnouncements?: string[];
  yearStartMonth?: number; // 1–12، الافتراضي 9 (سبتمبر)
}

/** الحقول التي تُعرض فعلياً في واجهة المشاركة العامة — وحدها ما تُرجعه get_shared_portfolio() */
export type PublicPortfolioState = Pick<AppState, 'ev' | 'strats' | 'csubs' | 'profile'>;

