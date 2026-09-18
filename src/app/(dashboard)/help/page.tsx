import { HelpCenter } from '@/components/support/help-center';
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ article?: string }>;
}) {
  const { article } = await searchParams;
  return <HelpCenter initialArticle={article} />;
}
