import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md px-6 pt-20">
      <h1 className="text-2xl font-bold text-braise">Pas de réseau</h1>
      <p className="mt-4 text-stone-300">
        Cette page n&apos;a pas été enregistrée sur le téléphone. Les quêtes déjà préparées restent jouables hors ligne&nbsp;:
        revenez à l&apos;accueil.
      </p>
      <Link href="/" className="mt-8 inline-block rounded-xl bg-braise px-6 py-3 font-semibold text-black">
        Accueil
      </Link>
    </main>
  );
}
