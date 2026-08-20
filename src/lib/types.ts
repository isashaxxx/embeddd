export type Collection = {
  id: string;
  slug: string;
  name: string;
  color: string;
  position: number;
  access_mode: 'private' | 'link';
  share_token: string | null;
  created_at: string;
  project_id: string | null;
};

export type Project = { id: string; slug: string; name: string; color: string; position: number; created_at: string };

export type Item = {
  id: string;
  slug: string;
  collection_id: string | null;
  kind: 'image' | 'video' | 'embed' | 'link' | 'text' | 'heading' | 'callout' | 'html' | 'divider';
  provider: string | null;
  position: number;
  fav: boolean;
  url: string | null;
  host: string | null;
  embed_url: string | null;
  embed_h: number | null;
  ratio: number | null;
  src: string | null;
  thumb: string | null;
  width: number | null;
  height: number | null;
  r2_key: string | null;
  r2_thumb_key: string | null;
  title: string;
  note: string;
  display_size: 'XS' | 'S' | 'M' | 'L' | 'XL';
  text_style: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5';
  tags: string[];
  created_at?: string;
};

export type Achievement = {
  key: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  unlocked: boolean;
  unlocked_at: string | null;
  progress: number;
  target: number;
};

export type Progress = {
  xp: number;
  level: number;
  nextLevelXp: number;
  achievements: Achievement[];
  newlyUnlocked: string[];
};
