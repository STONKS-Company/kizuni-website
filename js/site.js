(() => {
const { calculateMortgage } = window.KizuniMortgage;

const menuButton = document.querySelector('[data-menu-button]');
const mobileMenu = document.querySelector('[data-mobile-menu]');

// ⛔ Ni le menu mobile ni les FAQ ne basculent plus la classe `hidden` :
// `display:none` coupe net toute transition, et c'est pour cette raison que les
// panneaux s'ouvraient d'un coup (signale par Victor le 02/09). L'etat passe par
// `data-ouvert`, et TOUTE l'animation vit dans src/input.css, avec les tokens
// Motion. Aucune duree n'est recopiee ici.
const basculer = (element, ouvert) => {
  if (element) element.dataset.ouvert = String(ouvert);
};

menuButton?.addEventListener('click', () => {
  const ouvert = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!ouvert));
  basculer(mobileMenu, !ouvert);
});

document.querySelectorAll('[data-mobile-menu] a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    basculer(mobileMenu, false);
  });
});

document.querySelectorAll('[data-accordion]').forEach((item) => {
  const button = item.querySelector('button');
  button?.addEventListener('click', () => {
    const ouvert = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!ouvert));
    basculer(item, !ouvert);
  });
});

// Mega menu « Nos services » (desktop) : meme bascule au clic que le menu
// mobile et les FAQ, avec en plus la fermeture au clic en dehors du panneau.
document.querySelectorAll('[data-mega-button]').forEach((bouton) => {
  const panneau = bouton.parentElement?.querySelector('[data-mega-panel]');
  bouton.addEventListener('click', (evenement) => {
    evenement.stopPropagation();
    const ouvert = bouton.getAttribute('aria-expanded') === 'true';
    bouton.setAttribute('aria-expanded', String(!ouvert));
    basculer(panneau, !ouvert);
  });
});
document.addEventListener('click', (evenement) => {
  document.querySelectorAll('[data-mega-button][aria-expanded="true"]').forEach((bouton) => {
    if (bouton.parentElement?.contains(evenement.target)) return;
    bouton.setAttribute('aria-expanded', 'false');
    basculer(bouton.parentElement?.querySelector('[data-mega-panel]'), false);
  });
});

const numberFrom = (form, name) => Number(new FormData(form).get(name));
// Separateur suisse a l'apostrophe, pose a la main. On ne passe PAS par Intl :
// selon le moteur, fr-CH rend une espace insecable etroite (U+202F) au lieu de
// l'apostrophe. Verifie le 31/08 : Node rend 1'805'000, le navigateur 1 805 000.
const chf = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u2019");
const montant = (n) => `${chf(n)} CHF`;
const pourcent = (r) => `${(Math.round((Number(r) || 0) * 1000) / 10).toString().replace('.', ',')} %`;
const percent = { format: pourcent };
const currency = { format: montant };
const integer = { format: chf };

// Les formats de curseur sont les MEMES que ceux du generateur : un montant, une
// duree, un rendement. Le nom du format voyage dans `data-range-format`, jamais
// devine d'apres le nom du champ.
const FORMATS_PLAGE = {
  chf: montant,
  annees: (v) => `${chf(v)} ans`,
  ans: (v) => `${chf(v)} ans`,
  nombre: (v) => chf(v),
  pourcent: (v) => `${String(Number(v)).replace('.', ',')} %`,
};

document.querySelectorAll('[data-range-input]').forEach((input) => {
  const output = document.querySelector(`[data-range-output="${input.name}"]`);
  const lire = FORMATS_PLAGE[input.dataset.rangeFormat] || FORMATS_PLAGE.chf;
  const refresh = () => {
    if (output) output.textContent = lire(input.value);
  };
  input.addEventListener('input', refresh);
  refresh();
});

// ---- Pop-up d'estimation -------------------------------------------------
// Remplit le detail du bien, tranche l'eligibilite sur les deux regles suisses
// (20 % de fonds propres dont 10 % hors 2e pilier, charge <= 33 % du revenu)
// puis ouvre le dialogue. Appelee apres chaque calcul reussi.
// Vert = condition remplie, rouge = condition a ajuster (demande de Victor, 31/08).
// Les deux couleurs sont des tokens du design system, pas des valeurs en dur.
const OK = {
  cadre: 'border-kizuni-go/30 bg-kizuni-go-soft',
  pastille: 'bg-kizuni-go text-white',
  chiffre: 'text-kizuni-go',
};
const KO = {
  cadre: 'border-kizuni-deep/30 bg-kizuni-blush',
  pastille: 'bg-kizuni-deep text-white',
  chiffre: 'text-kizuni-deep',
};

function ouvrirEstimation(form, r) {
  const dlg = form.parentElement?.querySelector('[data-estimation]')
           || document.querySelector('[data-estimation]');
  if (!dlg) return;

  const mettre = (nom, valeur) => {
    const el = dlg.querySelector(`[data-champ="${nom}"]`);
    if (el) el.textContent = valeur;
  };

  mettre('prix', montant(r.propertyPrice));
  mettre('fondsPropres', montant(r.totalEquity));
  mettre('fondsCash', montant(r.cashOutsidePillar));
  mettre('hypotheque', montant(r.mortgage));
  mettre('interets', montant(r.annualInterest));
  mettre('entretien', montant(r.annualMaintenance));
  mettre('amortissement', montant(r.annualAmortization));
  mettre('chargeTotale', montant(r.annualTheoreticalCost));
  mettre('tauxFondsPropres', pourcent(r.equityRatio));
  mettre('tauxCharge', pourcent(r.affordabilityRatio));

  // les deux regles, chacune avec son etat
  [['equity', r.equityOk, 'tauxFondsPropres'], ['charge', r.affordabilityOk, 'tauxCharge']]
    .forEach(([cle, ok, champTaux]) => {
      const carte = dlg.querySelector(`[data-regle="${cle}"]`);
      const etat = dlg.querySelector(`[data-regle-etat="${cle}"]`);
      const taux = dlg.querySelector(`[data-champ="${champTaux}"]`);
      const style = ok ? OK : KO;
      if (carte) carte.className = `rounded-lg border p-4 lg:p-5 ${style.cadre}`;
      if (etat) {
        etat.textContent = ok ? 'Condition remplie' : 'À ajuster';
        etat.className = `rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.pastille}`;
      }
      if (taux) taux.className = style.chiffre;
    });

  // le verdict d ensemble
  const banniere = dlg.querySelector('[data-verdict]');
  const ico = dlg.querySelector('[data-verdict-icone]');
  const titre = dlg.querySelector('[data-verdict-titre]');
  const texte = dlg.querySelector('[data-verdict-texte]');

  const CHECK = '<svg class="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>';
  const ALERTE = '<svg class="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5v.5"/></svg>';

  if (r.eligible) {
    if (banniere) banniere.className = 'flex items-start gap-4 bg-kizuni-go p-5 text-white lg:p-6';
    if (ico) ico.innerHTML = CHECK;
    if (titre) titre.textContent = 'Votre projet paraît finançable.';
    if (texte) texte.textContent = `Les deux conditions suisses sont remplies. Hypothèque estimée à ${montant(r.mortgage)}, pour une charge annuelle théorique de ${montant(r.annualTheoreticalCost)}.`;
  } else {
    // chaque manque porte son propre accord : « les fonds propres » est pluriel,
    // « la charge sur revenu » est singulier. Deux manques => pluriel.
    const manques = [];
    if (!r.equityOk) manques.push({ texte: 'les fonds propres', pluriel: true });
    if (!r.affordabilityOk) manques.push({ texte: 'la charge sur revenu', pluriel: false });
    const auPluriel = manques.length > 1 || manques.some((m) => m.pluriel);
    if (banniere) banniere.className = 'flex items-start gap-4 bg-kizuni-deep p-5 text-white lg:p-6';
    if (ico) ico.innerHTML = ALERTE;
    if (titre) titre.textContent = 'Ce projet demande un ajustement.';
    if (texte) texte.textContent = `En l'état, ${manques.map((m) => m.texte).join(' et ')} ${auPluriel ? 'ne respectent' : 'ne respecte'} pas encore les critères. Un conseiller peut tester un autre prix ou une autre structure de financement.`;
  }

  if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
  else dlg.setAttribute('open', '');
}

// fermeture : croix, bouton « Modifier », clic sur le fond
document.querySelectorAll('[data-estimation]').forEach((dlg) => {
  dlg.querySelectorAll('[data-fermer]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
});

document.querySelectorAll('[data-mortgage-form]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // ⛔ Ne PAS chercher via form.closest('div.grid') : sur devenir-proprietaire le
    // formulaire n'est pas enveloppe dans une grille, closest rendait null et le
    // bouton ne faisait plus RIEN (bug signale par Victor le 01/09).
    // Le panneau est dans le formulaire ; on ne remonte qu'en dernier recours.
    const resultPanel = form.querySelector('[data-mortgage-result]')
      || form.parentElement?.querySelector('[data-mortgage-result]')
      || form.closest('section')?.querySelector('[data-mortgage-result]');
    if (!resultPanel) return;

    const title = resultPanel.querySelector('[data-result-title]');
    const copy = resultPanel.querySelector('[data-result-copy]');
    const equity = resultPanel.querySelector('[data-result-equity]');
    const affordability = resultPanel.querySelector('[data-result-affordability]');

    try {
      const result = calculateMortgage({
        propertyPrice: numberFrom(form, 'propertyPrice'),
        annualGrossIncome: numberFrom(form, 'annualGrossIncome'),
        cashEquity: numberFrom(form, 'cashEquity'),
        pensionEquity: numberFrom(form, 'pensionEquity'),
        monthlyDebts: numberFrom(form, 'monthlyDebts'),
      });

      if (equity) equity.textContent = percent.format(result.equityRatio);
      if (affordability) affordability.textContent = percent.format(result.affordabilityRatio);

      if (result.eligible) {
        if (title) title.textContent = 'Votre projet paraît équilibré.';
        if (copy) copy.textContent = `Besoin estimé : ${currency.format(result.mortgage)}. Une analyse complète permettra de confirmer les options.`;
      } else if (!result.equityOk) {
        if (title) title.textContent = 'Les fonds propres sont à renforcer.';
        if (copy) copy.textContent = 'Visez 20 % du prix, dont au moins 10 % hors avoirs de prévoyance professionnelle.';
      } else {
        if (title) title.textContent = 'La charge théorique est trop élevée.';
        if (copy) copy.textContent = 'Nous pouvons tester un autre prix, ajuster les charges ou revoir la structure du financement.';
      }

      ouvrirEstimation(form, result);
    } catch (error) {
      if (title) title.textContent = 'Vérifiez les montants saisis.';
      if (copy) copy.textContent = error.message;
      if (equity) equity.textContent = '—';
      if (affordability) affordability.textContent = '—';
    }
  });
});

// ---- Offres d'emploi ----------------------------------------------------
// « Voir l'offre » doit MONTRER l'offre. Chaque carte ouvre son panneau ;
// le bouton « Postuler » du panneau mene ensuite au contact.
document.querySelectorAll('[data-voir-offre]').forEach((bouton) => {
  bouton.addEventListener('click', () => {
    const dlg = document.querySelector(`[data-offre="${bouton.dataset.voirOffre}"]`);
    if (!dlg) return;
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  });
});

document.querySelectorAll('[data-offre]').forEach((dlg) => {
  dlg.querySelectorAll('[data-fermer-offre]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
});

function calculerProjectionPrevoyance(form) {
  const naissance = new Date(form.elements.date_naissance.value + 'T00:00:00');
  const aujourdHui = new Date();
  let ageActuel = aujourdHui.getFullYear() - naissance.getFullYear();
  if (
    aujourdHui.getMonth() < naissance.getMonth()
    || (aujourdHui.getMonth() === naissance.getMonth() && aujourdHui.getDate() < naissance.getDate())
  ) ageActuel -= 1;

  const mensualite = Number(form.elements.capacite_epargne.value);
  const valeurs = {};
  for (const rendement of [2, 5, 10]) {
    valeurs[rendement] = Prevoyance.projection3ePilier({
      ageActuel,
      ageRetraite: 65,
      versementAnnuel: mensualite * 12,
      rendementAnnuel: rendement / 100,
    }).capitalFinal;
    const sortie = form.querySelector('[data-projection="' + rendement + '"]');
    if (sortie) sortie.textContent = montant(valeurs[rendement]);
  }

  const duree = Math.max(0, 65 - ageActuel);
  const resume = form.querySelector('[data-projection-resume]');
  if (resume) {
    resume.textContent = 'Avec ' + montant(mensualite) + ' par mois pendant ' + duree
      + (duree > 1 ? ' ans' : ' an') + ', les versements cumulés représenteraient '
      + montant(mensualite * 12 * duree) + ', avant rendement.';
  }
  return { ageActuel, mensualite, valeurs };
}

// ---- Envoi des demandes via Meetwave ------------------------------------
// L'origine du site identifie le client côté Meetwave; source distingue les
// formulaires contact et prévoyance dans le suivi.
const endpointLeads = 'https://db-meetwave.stonks.ch/functions/v1/form-submit';
let turnstileScriptPromise;
function chargerTurnstile(form) {
  const widget = form?.querySelector('[data-turnstile-widget]');
  if (!widget || widget.dataset.widgetId) return;
  const afficher = () => {
    if (!window.turnstile || widget.dataset.widgetId) return;
    const champJeton = form.elements.turnstile_token;
    widget.dataset.widgetId = window.turnstile.render(widget, {
      sitekey: widget.dataset.sitekey,
      callback: (jeton) => { if (champJeton) champJeton.value = jeton; },
      'expired-callback': () => { if (champJeton) champJeton.value = ''; },
      'error-callback': () => { if (champJeton) champJeton.value = ''; },
    });
  };
  if (window.turnstile) return afficher();
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }
  turnstileScriptPromise.then(afficher).catch(() => {});
}
function reinitialiserTurnstile(form) {
  const widget = form?.querySelector('[data-turnstile-widget]');
  const champJeton = form?.elements.turnstile_token;
  if (champJeton) champJeton.value = '';
  if (widget?.dataset.widgetId && window.turnstile) window.turnstile.reset(widget.dataset.widgetId);
}
async function envoyerDemande(form) {
  const status = Array.from(form.querySelectorAll('[data-form-status]')).find((item) => !item.closest('[hidden]')) || form.querySelector('[data-form-status]');
  const bouton = form.querySelector('[type="submit"]');
  if (form.elements.website?.value) return;
  if (status) status.textContent = 'Envoi en cours…';
  if (bouton) bouton.disabled = true;
  try {
    const data = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (key === 'website') continue;
      data.append(key, String(value));
    }
    if (form.matches('[data-prevoyance-lead-form]')) {
      calculerProjectionPrevoyance(form);
      const ligne = (titre, valeur) => titre + ' : ' + (valeur || '—');
      const projection = [2, 5, 10]
        .map((taux) => taux + ' % : ' + form.querySelector('[data-projection="' + taux + '"]').textContent)
        .join(' | ');
      data.set('message', [
        'Simulation prévoyance Kizuni (site kizuni.ch)',
        ligne('Projet', data.get('projet_prevoyance')),
        ligne('Date de naissance', data.get('date_naissance')),
        ligne('Statut professionnel', data.get('statut_professionnel')),
        ligne('Revenu brut annuel', data.get('revenu_brut_annuel')),
        ligne('Capacité d’épargne mensuelle', data.get('capacite_epargne') + ' CHF'),
        ligne('Projections indicatives', projection),
      ].join('\n'));
    }
    if (form.matches('[data-contact-form]')) {
      const sujet = data.get('sujet');
      const message = data.get('message');
      data.set('message', 'Demande : ' + sujet + '\n\n' + message);
    }
    data.set('source', form.dataset.source || 'kizuni-site');
    const jetonTurnstile = form.elements.turnstile_token?.value;
    if (!jetonTurnstile) throw new Error('TURNSTILE_REQUIRED');
    data.set('turnstile_token', jetonTurnstile);
    const response = await fetch(endpointLeads, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: data.toString(),
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    reinitialiserTurnstile(form);
    if (form.matches('[data-prevoyance-lead-form]')) {
      const questionnaire = form.querySelector('[data-prevoyance-step="questionnaire"]');
      const coordonnees = form.querySelector('[data-prevoyance-step="coordonnees"]');
      const resultats = form.querySelector('[data-prevoyance-step="resultats"]');
      if (questionnaire) questionnaire.hidden = true;
      if (coordonnees) coordonnees.hidden = true;
      if (resultats) resultats.hidden = false;
      const succes = form.querySelector('[data-prevoyance-success]');
      if (succes) succes.textContent = 'Merci, votre demande a bien été transmise. Voici votre projection indicative.';
      if (bouton) bouton.textContent = 'Projection affichée';
      if (bouton) bouton.disabled = true;
      resultats?.querySelector('[data-prevoyance-success]')?.focus();
    } else {
      if (status) status.textContent = 'Merci, votre demande a bien été envoyée. Kizuni Finance vous recontactera.';
      form.reset();
    }
  } catch (error) {
    if (status) {
      const apercuLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      status.textContent = error.message === 'TURNSTILE_REQUIRED'
        ? 'Veuillez terminer la vérification avant d’envoyer votre demande.'
        : apercuLocal
        ? 'Cet aperçu local ne transmet pas de demandes réelles. Pour envoyer votre demande à Kizuni, utilisez kizuni.ch.'
        : 'Votre demande n’a pas pu être envoyée. Réessayez plus tard ou écrivez à info@kizuni.ch.';
    }
    reinitialiserTurnstile(form);
  } finally {
    if (bouton && bouton.textContent !== 'Projection affichée') bouton.disabled = false;
  }
}

document.querySelectorAll('[data-contact-form], [data-prevoyance-lead-form]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    envoyerDemande(form);
  });
  if (form.matches('[data-contact-form]')) chargerTurnstile(form);
});

document.querySelectorAll('[data-prevoyance-lead-form]').forEach((form) => {
  const questionnaire = form.querySelector('[data-prevoyance-step="questionnaire"]');
  const coordonnees = form.querySelector('[data-prevoyance-step="coordonnees"]');
  const resultats = form.querySelector('[data-prevoyance-step="resultats"]');
  const boutonSuivant = form.querySelector('[data-question-next]');
  const boutonPrecedent = form.querySelector('[data-question-back]');
  const capacite = form.elements.capacite_epargne;
  const sortieCapacite = form.querySelector('[data-capacite-epargne]');
  if (!questionnaire || !coordonnees || !resultats || !boutonSuivant || !boutonPrecedent) return;

  const projets = [...document.querySelectorAll('[name="projet_prevoyance"][form="prevoyance-lead-form"]')];
  const imageProjet = document.querySelector('[data-prevoyance-project-image]');
  const legendeProjet = document.querySelector('[data-prevoyance-project-caption]');
  const actualiserVisuelProjet = (projet) => {
    if (!projet || !imageProjet || !legendeProjet) return;
    legendeProjet.textContent = projet.dataset.visualCaption || '';
    legendeProjet.hidden = !legendeProjet.textContent;
    imageProjet.alt = projet.dataset.visualAlt || '';
    const nouvelleSource = projet.dataset.visualSrc;
    if (!nouvelleSource || imageProjet.getAttribute('src') === nouvelleSource) return;
    imageProjet.classList.add('opacity-40');
    const imagePrechargee = new Image();
    imagePrechargee.onload = () => {
      imageProjet.src = nouvelleSource;
      imageProjet.classList.remove('opacity-40');
    };
    imagePrechargee.onerror = () => imageProjet.classList.remove('opacity-40');
    imagePrechargee.src = nouvelleSource;
  };
  projets.forEach((projet) => projet.addEventListener('change', () => actualiserVisuelProjet(projet)));

  const naissance = form.elements.date_naissance;
  const anneeNaissance = form.querySelector('[data-naissance-annee]');
  const moisNaissance = form.querySelector('[data-naissance-mois]');
  const jourNaissance = form.querySelector('[data-naissance-jour]');
  if (naissance && anneeNaissance && moisNaissance && jourNaissance) {
    const anneeActuelle = new Date().getFullYear();
    const mois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    for (let annee = anneeActuelle - 18; annee >= anneeActuelle - 100; annee -= 1) {
      anneeNaissance.add(new Option(String(annee), String(annee)));
    }
    mois.forEach((nom, index) => moisNaissance.add(new Option(nom, String(index + 1).padStart(2, '0'))));

    const rafraichirJours = () => {
      const jourPrecedent = jourNaissance.value;
      jourNaissance.replaceChildren(new Option('Jour', ''));
      const annee = Number(anneeNaissance.value);
      const moisNumero = Number(moisNaissance.value);
      if (!annee || !moisNumero) return;
      const nombreJours = new Date(annee, moisNumero, 0).getDate();
      for (let jour = 1; jour <= nombreJours; jour += 1) {
        const valeur = String(jour).padStart(2, '0');
        jourNaissance.add(new Option(valeur, valeur));
      }
      if (jourPrecedent && Number(jourPrecedent) <= nombreJours) jourNaissance.value = jourPrecedent;
    };
    const synchroniserDate = () => {
      naissance.value = anneeNaissance.value && moisNaissance.value && jourNaissance.value
        ? anneeNaissance.value + '-' + moisNaissance.value + '-' + jourNaissance.value
        : '';
    };
    anneeNaissance.addEventListener('change', () => { rafraichirJours(); synchroniserDate(); });
    moisNaissance.addEventListener('change', () => { rafraichirJours(); synchroniserDate(); });
    jourNaissance.addEventListener('change', synchroniserDate);
  }
  const afficherCapacite = () => {
    if (sortieCapacite && capacite) sortieCapacite.textContent = montant(Number(capacite.value));
  };
  capacite?.addEventListener('input', afficherCapacite);
  afficherCapacite();

  boutonSuivant.addEventListener('click', () => {
    if (!form.reportValidity()) return;
    questionnaire.hidden = true;
    coordonnees.hidden = false;
    coordonnees.querySelectorAll('input').forEach((input) => { input.disabled = false; });
    chargerTurnstile(form);
    coordonnees.querySelector('input:not([name="website"])')?.focus();
  });

  boutonPrecedent.addEventListener('click', () => {
    coordonnees.hidden = true;
    coordonnees.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    questionnaire.hidden = false;
    boutonSuivant.focus();
  });
});
// ---- Préremplissage du sujet sur la page contact ------------------------
const formContact = document.querySelector('[data-contact-form]');
if (formContact) {
  const params = new URLSearchParams(location.search);
  const sujetDemande = params.get('sujet');
  const aliasSujets = {
    'Devenir propriétaire': 'Immobilier',
    'Mon estimation hypothécaire': 'Immobilier',
    'Prévoyance et protection': 'Prévoyance',
    Candidature: 'Autres assurances',
  };
  const sujetVoulu = aliasSujets[sujetDemande] || sujetDemande;
  const poste = params.get('poste');
  const select = formContact.querySelector('[name="sujet"]');

  if (sujetVoulu && select) {
    const trouve = [...select.options].find((o) => o.value === sujetVoulu);
    if (trouve) select.value = trouve.value;
  }
  if (poste) {
    const zone = formContact.querySelector('[name="message"]');
    if (zone && !zone.value) zone.value = `Bonjour,\n\nJe souhaite postuler au poste : ${poste}.\n\n`;
  }

}

window.KizuniSite = { ready: true, calculateMortgage };

// ---- Simulateurs de prevoyance -------------------------------------------
// Deux formulaires : la projection du 3e pilier, et l'economie d'impot.
// Ils se repondent : le versement choisi dans le premier alimente le second, et
// la duree jusqu'a la retraite sert a cumuler l'economie.
//
// ⛔ Le fichier de baremes n'est PAS charge au chargement de la page : il pese
// plusieurs centaines de kilo-octets et ne sert qu'a ceux qui utilisent le
// simulateur. Il est demande a la premiere interaction, une seule fois.

const Prevoyance = globalThis.KizuniPrevoyance;
const ANNEE_FISCALE = 2026;

const valeurNombre = (form, nom) => {
  const champ = form?.elements?.[nom];
  return champ ? Number(champ.value) : 0;
};
const valeurTexte = (form, nom) => {
  const champ = form?.elements?.[nom];
  return champ ? String(champ.value) : '';
};
const ecrire = (racine, cle, texte) => {
  const el = racine?.querySelector(`[data-champ="${cle}"]`);
  if (el) el.textContent = texte;
};

// --- Projection du 3e pilier ---------------------------------------------

function tracerCourbe(svg, points) {
  const aire = svg?.querySelector('[data-courbe-aire]');
  const trait = svg?.querySelector('[data-courbe-trait]');
  if (!aire || !trait) return;
  if (!points || points.length < 2) {
    aire.setAttribute('d', '');
    trait.setAttribute('d', '');
    return;
  }
  const L = 240;
  const H = 84;
  const marge = 4;
  const max = Math.max(...points.map((p) => p.capital), 1);
  const coords = points.map((p, i) => {
    const x = marge + (i / (points.length - 1)) * (L - marge * 2);
    const y = H - marge - (p.capital / max) * (H - marge * 2);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  trait.setAttribute('d', `M${coords.join(' L')}`);
  aire.setAttribute('d', `M${marge} ${H - marge} L${coords.join(' L')} L${L - marge} ${H - marge} Z`);
}

function calculerPilier3(form) {
  if (!Prevoyance) return null;
  const panneau = form.querySelector('[data-pilier3-result]');
  const projection = Prevoyance.projection3ePilier({
    ageActuel: valeurNombre(form, 'ageActuel'),
    ageRetraite: valeurNombre(form, 'ageRetraite'),
    versementAnnuel: valeurNombre(form, 'versementAnnuel'),
    capitalInitial: valeurNombre(form, 'capitalInitial'),
    // Le select expose un pourcentage (2, 5 ou 10), la projection attend une
    // fraction (0.02, 0.05 ou 0.10).
    rendementAnnuel: valeurNombre(form, 'rendement') / 100,
  });

  ecrire(panneau, 'capitalFinal', montant(projection.capitalFinal));
  ecrire(panneau, 'totalVerse', montant(projection.totalVerse));
  ecrire(panneau, 'interets', montant(projection.interets));
  ecrire(panneau, 'duree', projection.annees === 0
    ? 'La retraite est déjà atteinte : plus de versement possible.'
    : `Sur ${projection.annees} ${projection.annees > 1 ? 'ans' : 'an'} de versements.`);
  tracerCourbe(panneau?.querySelector('[data-pilier3-courbe]'), projection.parAnnee);
  return projection;
}

// --- Economie d'impot -----------------------------------------------------

let baremes = null;
let baremesEnCours = null;

function chargerBaremes() {
  if (baremes) return Promise.resolve(baremes);
  if (baremesEnCours) return baremesEnCours;
  baremesEnCours = fetch(`data/baremes-afc-${ANNEE_FISCALE}.json`)
    .then((reponse) => {
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.json();
    })
    .then((brut) => {
      baremes = Prevoyance.prepareBaremes(brut);
      return baremes;
    })
    .catch((erreur) => {
      baremesEnCours = null;
      throw erreur;
    });
  return baremesEnCours;
}

function dureeJusquALaRetraite() {
  const pilier3 = document.querySelector('[data-pilier3-form]');
  if (!pilier3) return 0;
  return Math.max(0, valeurNombre(pilier3, 'ageRetraite') - valeurNombre(pilier3, 'ageActuel'));
}

function calculerImpots(form) {
  const panneau = form.querySelector('[data-impots-result]');
  const bfs = Number(form.querySelector('[data-commune-bfs]')?.value || 0);
  if (!baremes || !bfs) return;

  const resultat = Prevoyance.economieImpot3a({
    donnees: baremes,
    revenuImposable: valeurNombre(form, 'revenuImposable'),
    bfs,
    situation: { marie: valeurTexte(form, 'situation') === 'marie', enfants: valeurNombre(form, 'enfants') },
    versement: valeurNombre(form, 'versement3a'),
    annee: ANNEE_FISCALE,
  });

  // ⛔ Pas de repli sur un chiffre approximatif : sans bareme utilisable, on le dit.
  if (!resultat) {
    ecrire(panneau, 'economie', '—');
    ecrire(panneau, 'taux', `Barème indisponible pour l’année ${ANNEE_FISCALE}.`);
    return;
  }

  const annees = dureeJusquALaRetraite();
  ecrire(panneau, 'economie', montant(resultat.economie));
  ecrire(panneau, 'taux', `${pourcent(resultat.tauxEffectif)} de votre versement de ${montant(resultat.versement)}`
    + (resultat.versementPlafonne ? `, plafonné à ${montant(resultat.plafond)}.` : '.'));
  ecrire(panneau, 'impotSans', montant(resultat.sans.total));
  ecrire(panneau, 'impotAvec', montant(resultat.avec.total));
  ecrire(panneau, 'detailFederal', montant(resultat.sans.federal - resultat.avec.federal));
  ecrire(panneau, 'detailCantonal', montant(resultat.sans.cantonal - resultat.avec.cantonal));
  ecrire(panneau, 'detailCommunal', montant(resultat.sans.communal - resultat.avec.communal));
  ecrire(panneau, 'cumule', annees > 0
    ? `${montant(resultat.economie * annees)} sur ${annees} ans`
    : '—');

  const source = panneau?.querySelector('[data-impots-source]');
  if (source && baremes.source) {
    const jour = String(baremes.source.extraitLe || '').split('-').reverse().join('.');
    source.textContent = `Barèmes ${baremes.source.anneeFiscale} de l’Administration fédérale des contributions, ${resultat.sans.commune.nom} (${resultat.sans.commune.canton})`
      + `${jour ? `, relevés le ${jour}` : ''}. Sans impôt ecclésiastique ni impôt sur la fortune.`;
  }
}

function brancherRechercheCommune(form) {
  const champ = form.querySelector('[data-commune-champ]');
  const cacheBfs = form.querySelector('[data-commune-bfs]');
  const liste = form.querySelector('[data-commune-liste]');
  const etat = form.querySelector('[data-commune-etat]');
  if (!champ || !liste || !cacheBfs) return;

  const fermer = () => liste.classList.add('hidden');

  const proposer = () => {
    if (!baremes) return;
    const trouves = Prevoyance.chercherLocalite(baremes, champ.value);
    liste.innerHTML = trouves.map((l) =>
      `<li><button type="button" data-bfs="${l.bfs}" data-libelle="${l.npa} ${l.ville}" class="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[15px] hover:bg-kizuni-blush"><span>${l.npa} ${l.ville}</span><span class="text-[13px] text-kizuni-stone">${l.commune} · ${l.canton}</span></button></li>`
    ).join('');
    liste.classList.toggle('hidden', trouves.length === 0);
  };

  champ.addEventListener('input', () => {
    cacheBfs.value = '';
    chargerBaremes().then(proposer).catch(() => {
      if (etat) etat.textContent = 'Les barèmes officiels n’ont pas pu être chargés. Réessayez dans un instant.';
    });
  });

  champ.addEventListener('focus', () => { chargerBaremes().then(proposer).catch(() => {}); });

  liste.addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('button[data-bfs]');
    if (!bouton) return;
    cacheBfs.value = bouton.dataset.bfs;
    champ.value = bouton.dataset.libelle;
    fermer();
    if (etat) {
      const commune = baremes?.communes.get(Number(bouton.dataset.bfs));
      etat.textContent = commune
        ? `Barème du canton de ${commune.canton} et de la commune de ${commune.nom}.`
        : '';
    }
    calculerImpots(form);
  });

  document.addEventListener('click', (evenement) => {
    if (!form.contains(evenement.target)) fermer();
  });
}

document.querySelectorAll('[data-pilier3-form]').forEach((form) => {
  const relier = () => {
    calculerPilier3(form);
    const impots = document.querySelector('[data-impots-form]');
    const versement = impots?.elements?.versement3a;
    if (versement && versement.value !== String(valeurNombre(form, 'versementAnnuel'))) {
      versement.value = String(valeurNombre(form, 'versementAnnuel'));
      versement.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  form.addEventListener('input', relier);
  form.addEventListener('change', relier);
  form.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    relier();
    document.querySelector('#economie-impots')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelector('[data-impots-form] [data-commune-champ]')?.focus();
  });
  relier();
});

document.querySelectorAll('[data-impots-form]').forEach((form) => {
  brancherRechercheCommune(form);
  form.addEventListener('input', () => calculerImpots(form));
  form.addEventListener('change', () => calculerImpots(form));
  form.addEventListener('submit', (evenement) => evenement.preventDefault());
});

})();
