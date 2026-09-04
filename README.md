# Kizuni Finance — site vitrine

Dépôt de déploiement (Coolify, build pack `static`). Ce dépôt contient le site
**déjà généré** — ce n'est pas la source à éditer.

Source réelle, à modifier puis reconstruire avant de pousser ici :

```
/Users/alleyesonv/Dev/meetwave/customers/Kizuni Finance/website/
```

```bash
cd "/Users/alleyesonv/Dev/meetwave/customers/Kizuni Finance/website"
npm run build && npm test
node scripts/preparer-paquet.mjs
```

Puis copier le contenu de `paquet/` ici et pousser sur `main` — Coolify
redéploie automatiquement au push (webhook GitHub).
