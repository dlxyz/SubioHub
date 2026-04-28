import { api } from '@/lib/api';

export interface PublicNewsItem {
  id: number;
  title: string;
  content: string;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
}

export async function listPublicNews() {
  return (await api.get('/news')) as PublicNewsItem[];
}

export async function getPublicNewsDetail(id: number | string) {
  return (await api.get(`/news/${id}`)) as PublicNewsItem;
}
