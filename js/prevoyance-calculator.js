(() => {
// Moteur de calcul des deux simulateurs de prevoyance : la projection du
// 3e pilier A, et l'economie d'impot que procure le versement.
//
// ⛔ AUCUN taux d'imposition n'est ecrit ici. Les baremes viennent du fichier
// data/baremes-afc-<annee>.json, extrait du calculateur officiel de
// l'Administration federale des contributions par scripts/fetch-baremes-afc.mjs.
//
// ⛔ Les plafonds de deduction 3a NE SONT PAS deduits ni extrapoles : ils sont
// recopies de la table publiee par l'AFC, annee par annee, avec la source. Une
// annee absente de la table rend `null` — le simulateur le dit au lieu de
// deviner. C'est volontaire : ces montants changent par decision federale, pas
// selon une regle qu'on pourrait calculer.

// Source : Administration federale des contributions,
// « Taux d'interet / Deductions maximales pilier 3a de l'impot federal direct »
// https://www.estv.admin.ch/fr/taux-interet-deductions-maximales-pilier-3a-impot-federal-direct
// Confirme par le communique du Conseil federal du 17.11.2025 : les deductions
// 2026 demeurent inchangees par rapport a 2025.
const PLAFONDS_3A = {
  2026: { avecCaissePension: 7258, sansCaissePension: 36288, partDuRevenuSansCaisse: 0.2 },
  2025: { avecCaissePension: 7258, sansCaissePension: 36288, partDuRevenuSansCaisse: 0.2 },
  2024: { avecCaissePension: 7056, sansCaissePension: 35280, partDuRevenuSansCaisse: 0.2 },
  2023: { avecCaissePension: 7056, sansCaissePension: 35280, partDuRevenuSansCaisse: 0.2 },
  2022: { avecCaissePension: 6883, sansCaissePension: 34416, partDuRevenuSansCaisse: 0.2 },
  2021: { avecCaissePension: 6883, sansCaissePension: 34416, partDuRevenuSansCaisse: 0.2 },
};

const nombre = (valeur) => {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Le plafond deductible pour une annee donnee.
 * Rend `null` si l'annee n'est pas dans la table officielle — le simulateur
 * doit alors se taire, pas inventer un montant.
 */
function plafondDeduction3a({ annee, affilieCaissePension, revenuActivite = 0 }) {
  const table = PLAFONDS_3A[annee];
  if (!table) return null;
  if (affilieCaissePension) return table.avecCaissePension;
  const partRevenu = Math.max(0, nombre(revenuActivite)) * table.partDuRevenuSansCaisse;
  return Math.min(table.sansCaissePension, Math.round(partRevenu));
}

/**
 * Un bareme est une suite de sommets [revenu, impot]. Entre deux sommets le
 * taux marginal est constant : les baremes suisses sont lineaires par tranches,
 * verifie sur les 26 cantons a l'extraction. Au-dela du dernier sommet on
 * prolonge la derniere pente, ce qui reste le taux marginal du sommet.
 */
function interpoler(sommets, x) {
  if (!Array.isArray(sommets) || sommets.length === 0) return 0;
  if (sommets.length === 1) return sommets[0][1];
  if (x <= sommets[0][0]) return sommets[0][1];
  for (let i = 0; i < sommets.length - 1; i++) {
    const [xa, ya] = sommets[i];
    const [xb, yb] = sommets[i + 1];
    if (x <= xb) return ya + (yb - ya) * ((x - xa) / (xb - xa));
  }
  const [xa, ya] = sommets[sommets.length - 2];
  const [xb, yb] = sommets[sommets.length - 1];
  return yb + ((yb - ya) / (xb - xa)) * (x - xb);
}

/**
 * Prepare le jeu de donnees brut pour un acces direct par commune et par NPA.
 * On le fait UNE fois : la liste brute compte plus de deux mille communes et
 * quatre mille localites.
 */
function prepareBaremes(brut) {
  const communes = new Map();
  for (const [bfs, canton, nom, coefficients, courbes, taxesParSituation] of brut.communes) {
    communes.set(bfs, { bfs, canton, nom, coefficients, courbes, taxesParSituation });
  }
  const localites = brut.localites.map(([npa, ville, bfs]) => ({ npa, ville, bfs }));
  return { ...brut, communes, localites };
}

/**
 * Aplatit un nom de lieu pour la recherche : sans accent, sans casse.
 * ⛔ Indispensable en Suisse romande : personne ne tape « Genève » avec
 * l'accent dans un champ de recherche, et « Zurich » s'ecrit « Zürich ».
 */
const aplatir = (texte) => String(texte ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

/**
 * Cherche une localite par NPA ou par nom. Rend au plus `limite` resultats.
 * Les localites qui COMMENCENT par le terme passent devant celles qui le
 * contiennent : en tapant « lausanne » on veut Lausanne avant
 * « Le Mont-sur-Lausanne », mais on veut quand meme voir le second.
 */
function chercherLocalite(donnees, requete, limite = 8) {
  const terme = aplatir(requete);
  if (terme.length < 2) return [];
  const parNpa = /^\d+$/.test(terme);
  const debuts = [];
  const milieux = [];
  const vus = new Set();

  for (const localite of donnees.localites) {
    const champ = parNpa ? localite.npa : aplatir(localite.ville);
    const position = champ.indexOf(terme);
    if (position < 0) continue;
    const cle = `${localite.npa}-${localite.ville}`;
    if (vus.has(cle)) continue;
    const commune = donnees.communes.get(localite.bfs);
    if (!commune) continue;
    vus.add(cle);
    const trouve = { ...localite, canton: commune.canton, commune: commune.nom };
    (position === 0 ? debuts : milieux).push(trouve);
    if (debuts.length >= limite) break;
  }

  // ⛔ Le chef-lieu passe devant ses hameaux : taper « 1180 » doit proposer Rolle
  // avant Bugnaux. Sans ce tri, l'ordre etait celui du fichier — et le premier
  // resultat, celui qu'on clique sans regarder, etait le mauvais.
  const chefLieuDAbord = (a, b) => {
    const rang = (l) => (aplatir(l.ville) === aplatir(l.commune) ? 0 : 1);
    return rang(a) - rang(b) || a.ville.localeCompare(b.ville, 'fr');
  };
  debuts.sort(chefLieuDAbord);
  milieux.sort(chefLieuDAbord);
  return debuts.concat(milieux).slice(0, limite);
}

/**
 * La situation qui porte la courbe communale, la ou un rabais existe : seul le
 * droit au rabais compte, pas le nombre d'enfants. Mesure du 02/09 en Valais —
 * l'impot communal est identique de 0 a 3 enfants.
 */
const cleCourbeCommunale = (situation) =>
  (situation?.marie || nombre(situation?.enfants) > 0 ? 'avec-rabais' : 'sans-rabais');

const cleSituation = (situation) => {
  const etat = situation?.marie ? 'marie' : 'celibataire';
  const enfants = Math.min(3, Math.max(0, Math.round(nombre(situation?.enfants))));
  return `${etat}-${enfants}`;
};

/**
 * L'impot sur le revenu d'une personne physique, pour un revenu imposable et
 * une commune donnes : federal + cantonal + communal.
 *
 * ⛔ Ce que ce calcul NE contient PAS, et que l'interface doit dire :
 *    l'impot ecclesiastique (calcul fait « sans confession ») et l'impot sur la
 *    fortune. Le revenu imposable est pris identique au niveau cantonal et
 *    federal, alors que les deux assiettes different un peu dans la realite.
 */
/**
 * Les coefficients de la commune POUR CETTE SITUATION.
 * ⛔ Un coefficient releve sur un seul cas de famille est faux : la taxe
 * personnelle est par personne, et en Valais le rapport impot/base change avec
 * la situation. Mesure du 02/09 : jusqu'a 10 000 CHF d'ecart.
 */
function coefficientsPour(commune, situation) {
  const table = commune?.coefficients ?? {};
  return table[cleSituation(situation)] ?? table['*'] ?? [0, 0, 0];
}

function impotSurRevenu({ donnees, revenuImposable, bfs, situation }) {
  const commune = donnees.communes.get(bfs);
  if (!commune) return null;
  const baremesCanton = donnees.baremes.cantons[commune.canton]?.[cleSituation(situation)];
  const baremeFederal = donnees.baremes.federal[cleSituation(situation)];
  if (!baremesCanton || !baremeFederal) return null;

  // ⛔ L'administration arrondit le revenu imposable aux 100 FRANCS INFERIEURS
  // avant d'appliquer le bareme — verifie le 02/09 : 90 500, 90 542 et 90 599
  // donnent tous exactement le meme impot. Sans cet arrondi, l'economie affichee
  // etait systematiquement inferieure d'environ 11 CHF a celle de l'AFC, parce
  // qu'un versement de 7 258 CHF ne tombe jamais sur une centaine ronde.
  const revenu = Math.floor(Math.max(0, nombre(revenuImposable)) / 100) * 100;
  const federal = Math.max(0, interpoler(baremeFederal, revenu));
  const baseCantonale = Math.max(0, interpoler(baremesCanton.base, revenu));
  const baseCommunale = Math.max(0, interpoler(baremesCanton.baseCommunale ?? baremesCanton.base, revenu));

  // ⛔ Le Valais et Neuchatel accordent aux couples et aux familles un rabais
  // d'impot plafonne : l'impot n'y est PAS proportionnel a l'impot de base. Pour
  // ces cantons et ces communes, le fichier porte la courbe de l'impot en
  // fonction du revenu, relevee directement chez l'AFC.
  const courbeCommunale = commune.courbes?.[cleCourbeCommunale(situation)];
  const courbeCantonale = baremesCanton.impotCantonal;
  const [coefCanton, coefCommune, taxePersonnelleDefaut] = coefficientsPour(commune, situation);
  // ⛔ L'AFC arrondit chaque impot au franc AVANT de les additionner : sans ces
  // arrondis on derive de quelques francs sur le total.
  const cantonal = Math.round(courbeCantonale ? interpoler(courbeCantonale, revenu) : baseCantonale * coefCanton);
  const communal = Math.round(courbeCommunale ? interpoler(courbeCommunale, revenu) : baseCommunale * coefCommune);
  const taxePersonnelleDue = commune.taxesParSituation?.[cleSituation(situation)] ?? taxePersonnelleDefaut;
  const taxePersonnelle = revenu > 0 ? nombre(taxePersonnelleDue) : 0;

  return {
    commune,
    revenuImposable: revenu,
    federal,
    cantonal,
    communal,
    taxePersonnelle,
    total: federal + cantonal + communal + taxePersonnelle,
  };
}

/**
 * L'economie d'impot d'un versement au 3e pilier A.
 *
 * ⛔ Ce n'est PAS « le versement multiplie par un taux ». C'est la DIFFERENCE
 * entre l'impot du revenu imposable et l'impot de ce meme revenu diminue du
 * versement — donc deux passages dans un bareme progressif. Le « taux » affiche
 * est le resultat de cette difference, jamais son point de depart.
 */
function economieImpot3a({ donnees, revenuImposable, bfs, situation, versement, annee, affilieCaissePension = true, revenuActivite }) {
  const plafond = plafondDeduction3a({
    annee: annee ?? donnees.source.anneeFiscale,
    affilieCaissePension,
    revenuActivite: revenuActivite ?? revenuImposable,
  });
  if (plafond === null) return null;

  const verse = Math.max(0, Math.min(nombre(versement), plafond));
  const sans = impotSurRevenu({ donnees, revenuImposable, bfs, situation });
  if (!sans) return null;
  const avec = impotSurRevenu({ donnees, revenuImposable: sans.revenuImposable - verse, bfs, situation });
  if (!avec) return null;

  const economie = sans.total - avec.total;
  return {
    plafond,
    versement: verse,
    versementPlafonne: nombre(versement) > plafond,
    sans,
    avec,
    economie,
    tauxEffectif: verse > 0 ? economie / verse : 0,
  };
}

/**
 * La projection du capital 3a jusqu'a la retraite.
 *
 * Convention posee : le versement est fait EN DEBUT d'annee, il porte donc
 * interet des la premiere annee. Le rendement est une hypothese choisie par
 * l'utilisateur — rien ici ne le garantit, et l'interface doit le dire.
 */
function projection3ePilier({ ageActuel, ageRetraite, versementAnnuel, capitalInitial = 0, rendementAnnuel = 0 }) {
  const debut = Math.round(nombre(ageActuel));
  const fin = Math.round(nombre(ageRetraite));
  const annees = Math.max(0, fin - debut);
  const versement = Math.max(0, nombre(versementAnnuel));
  const taux = nombre(rendementAnnuel);

  let capital = Math.max(0, nombre(capitalInitial));
  const parAnnee = [{ age: debut, capital, verse: capital }];
  let verse = capital;
  for (let n = 1; n <= annees; n++) {
    capital = (capital + versement) * (1 + taux);
    verse += versement;
    parAnnee.push({ age: debut + n, capital, verse });
  }

  return {
    annees,
    versementAnnuel: versement,
    capitalFinal: capital,
    totalVerse: verse,
    interets: capital - verse,
    parAnnee,
  };
}

globalThis.KizuniPrevoyance = Object.freeze({
  PLAFONDS_3A,
  aplatir,
  plafondDeduction3a,
  interpoler,
  prepareBaremes,
  chercherLocalite,
  cleSituation,
  cleCourbeCommunale,
  coefficientsPour,
  impotSurRevenu,
  economieImpot3a,
  projection3ePilier,
});
})();
