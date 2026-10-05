import Link from "next/link";

export const metadata = { title: "Confidentialité — Quête" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-md px-6 pt-10 pb-16 leading-relaxed text-stone-300">
      <Link href="/" className="text-sm text-stone-500">
        ← Accueil
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-braise">Confidentialité</h1>
      <p className="mt-4">Version courte&nbsp;: nous ne savons pas qui vous êtes, ni où vous marchez.</p>

      <h2 className="mt-8 font-semibold text-stone-100">Ce que nous ne collectons pas</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Pas de compte, pas d&apos;adresse e-mail, pas de prénom d&apos;enfant.</li>
        <li>Pas de cookie de suivi, pas d&apos;outil de mesure d&apos;audience, pas de pisteur publicitaire.</li>
        <li>Votre position précise ne quitte jamais votre téléphone. Le trajet n&apos;est enregistré nulle part.</li>
      </ul>

      <h2 className="mt-8 font-semibold text-stone-100">Ce qui sort du téléphone</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>Au moment de préparer le départ</strong>, une seule fois&nbsp;: une position <em>arrondie à environ 100 m</em>{" "}
          pour savoir s&apos;il y a autour de vous un parc, une forêt, de l&apos;eau… Nos serveurs la transmettent à
          OpenStreetMap (service Overpass) et ne l&apos;enregistrent pas.
        </li>
        <li>
          <strong>À la fin de la quête, si vous le voulez</strong>&nbsp;: votre avis (note, «&nbsp;a-t-il couru&nbsp;?&nbsp;», commentaire
          libre), avec la quête jouée, le type d&apos;endroit, la durée et la distance. Aucune position, aucun identifiant, et
          l&apos;adresse IP n&apos;est pas conservée. Merci de ne pas écrire de nom dans le commentaire.
        </li>
      </ul>

      <h2 className="mt-8 font-semibold text-stone-100">Ce qui reste sur le téléphone</h2>
      <p className="mt-2">
        La quête, les fichiers audio et les données de lieux sont enregistrés dans le navigateur pour fonctionner sans réseau. Vous
        pouvez tout effacer depuis les{" "}
        <Link href="/reglages" className="underline">
          réglages
        </Link>{" "}
        ou en supprimant les données du site dans votre navigateur.
      </p>

      <h2 className="mt-8 font-semibold text-stone-100">Hébergement</h2>
      <p className="mt-2">
        Application hébergée par Vercel. Les données de lieux viennent d&apos;OpenStreetMap (© contributeurs OpenStreetMap, licence
        ODbL). Les voix sont générées à l&apos;avance&nbsp;: aucun service de voix n&apos;est contacté pendant votre sortie.
      </p>
    </main>
  );
}
