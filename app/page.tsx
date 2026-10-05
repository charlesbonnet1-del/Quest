import Link from "next/link";
import { QuestPicker } from "@/components/QuestPicker";
import { questSummaries } from "@/lib/content/server";

export default function Home() {
  const quests = questSummaries();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-14 pb-8">
      <h1 className="text-4xl font-bold tracking-tight text-braise">Quête</h1>
      <p className="mt-3 text-lg leading-relaxed text-stone-300">
        Une aventure audio pour sortir marcher avec votre enfant. Le téléphone reste dans la poche&nbsp;: un héros raconte
        l&apos;histoire et s&apos;adapte à l&apos;endroit où vous êtes.
      </p>
      <QuestPicker quests={quests} />
      <footer className="mt-auto flex gap-5 pt-10 text-sm text-stone-500">
        <Link href="/confidentialite" className="underline underline-offset-4">
          Confidentialité
        </Link>
        <Link href="/reglages" className="underline underline-offset-4">
          Réglages
        </Link>
      </footer>
    </main>
  );
}
