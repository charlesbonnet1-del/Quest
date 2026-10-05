import { notFound } from "next/navigation";
import { QuestRunner } from "@/components/QuestRunner";
import { questSummaries } from "@/lib/content/server";

export const dynamicParams = false;

export function generateStaticParams() {
  return questSummaries().map((q) => ({ id: q.id }));
}

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = questSummaries().find((q) => q.id === id);
  if (!summary) notFound();
  return <QuestRunner summary={summary} />;
}
