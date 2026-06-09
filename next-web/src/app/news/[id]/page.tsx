import NewsDetailView from '@/components/news/news-detail-view';

export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NewsDetailView id={id} />;
}
