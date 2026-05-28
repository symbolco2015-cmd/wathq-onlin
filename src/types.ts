export type PageType = 'auth' | 'dashboard' | 'public';

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

export interface AppState {
  ev: Record<string, Evidence[]>;
  strats: string[];
  csubs: Record<number, string[]>;
  notes: Record<string, string>;
  profile: UserProfile;
}
