# ANIMA — suivi des accès partenaires

Ce module est volontairement séparé du site statique : `manufacture-anima.fr` est aujourd'hui publié comme un site GitHub Pages (HTML/CSS/JS), sans base de données ni serveur. Une page statique ne peut pas produire une redirection HTTP 302 et enregistrer un clic de façon fiable.

Le module est un unique Cloudflare Worker avec une base D1 (SQLite), disponible dans l'offre gratuite. Il ne remplace pas le site : il intercepte seulement les routes suivantes, puis laisse toutes les pages et tous les fichiers existants continuer à être servis par GitHub Pages.

| Route | Rôle |
| --- | --- |
| `/partenaire/<identifiant>` | enregistre une consultation valide puis redirige immédiatement avec HTTP `302` vers Google Drive |
| `/admin/statistiques` | tableau de bord privé, protégé par authentification HTTP Basic |
| `/confidentialite-statistiques` | notice publique et concise sur les statistiques |

## Garanties fonctionnelles

- La destination est obligatoirement HTTPS et limitée à `drive.google.com` ou `docs.google.com`.
- Les robots connus, les préchargements, les aperçus de liens et les requêtes `HEAD` ne sont pas comptés.
- Aucun cookie, adresse IP, URL de provenance, donnée de géolocalisation ou empreinte navigateur n'est stocké.
- Les statistiques sont conservées 365 jours par défaut, supprimées automatiquement chaque nuit et peuvent être supprimées plus tôt depuis l'administration.
- Les pages de suivi et d'administration portent `noindex`; les statistiques ne sont jamais publiques.
- Les mutations d'administration exigent une authentification et vérifient l'origine de la requête.

## Déploiement (à réaliser seulement après validation de l'accès Cloudflare/DNS)

1. Installer Wrangler et s'authentifier dans le compte Cloudflare qui gérera `manufacture-anima.fr`.
2. Créer la base gratuite : `wrangler d1 create anima_partner_tracking`.
3. La base D1 `anima_partner_tracking` est déjà créée et son identifiant est renseigné dans `wrangler.toml`.
4. Créer les secrets — ils ne doivent jamais être écrits dans Git :
   - `wrangler secret put ADMIN_USERNAME`
   - `wrangler secret put ADMIN_PASSWORD` (secret Cloudflare, never committed)
5. Pour calculer le second secret, saisir dans PowerShell :
   `([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes('VOTRE_MOT_DE_PASSE')))).Replace('-','').ToLower()`
6. Appliquer la structure et le partenaire initial : `wrangler d1 migrations apply anima_partner_tracking --remote`.
7. Déployer : `wrangler deploy`.
8. Dans Cloudflare, ajouter les trois routes de Worker suivantes :
   - `manufacture-anima.fr/partenaire/*`
   - `manufacture-anima.fr/admin/*`
   - `manufacture-anima.fr/confidentialite-statistiques`

Le domaine doit être géré/proxifié par Cloudflare. Conserver l'origine GitHub Pages existante (`cfruchart96-cyber.github.io`) pour toutes les routes hors de cette liste. Cette bascule DNS/proxy est une modification de production : ne pas la faire sans vérifier les enregistrements actuels et l'accès au compte.

## Vérification après déploiement

1. Ouvrir `https://manufacture-anima.fr/partenaire/silverplaque` dans une fenêtre privée : vérifier `302` et l'arrivée dans le dossier Drive.
2. Ouvrir `https://manufacture-anima.fr/admin/statistiques`, saisir l'identifiant administrateur, puis vérifier `1` clic pour Silverplaque.
3. Créer un partenaire test depuis l'interface, vérifier la génération du lien et la copie en un clic.
4. Tester un lien désactivé : il doit retourner `404` et ne pas rediriger.
5. Tester `/admin/statistiques` sans authentification : il doit retourner `401`.
6. Vérifier le tableau de bord à largeur mobile et la notice `/confidentialite-statistiques`.
