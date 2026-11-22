# Remeha Home

## Présentation

Cette intégration amène dans Gladys le chauffage relié à l’application **Remeha Home** : chaudières, pompes à chaleur et hybrides Remeha pilotés par un thermostat connecté (eTwist, Smart Thermostat…). Elle se connecte avec l’e-mail et le mot de passe de votre compte Remeha Home, comme le fait l’application. Les comptes Baxi, De Dietrich et Brötje hébergés sur le même cloud BDR Thermea peuvent aussi fonctionner.

- Un **thermostat** par zone de chauffage : mode (programme horaire, manuel, arrêt), consigne, demande de chauffe, température de la pièce, mode cheminée quand la zone en a un.
- Un **chauffe-eau** par zone d’eau chaude : programme horaire, confort, éco ou boost, température confort, chauffe en cours, température de l’eau d’un ballon.
- Un appareil pour le **générateur** : pression d’eau, température extérieure et un index d’énergie pour le tableau de bord énergie de Gladys.
- Des déclencheurs de scène (défaut, retour à la normale, pression trop basse, déconnexion, vacances) et des actions de scène (température temporaire, programme horaire, vacances, boost d’eau chaude, relevé immédiat).
- Trois widgets de tableau de bord : les zones, l’énergie des 7 derniers jours et le générateur.

**Transport : cloud.** Gladys ne parle jamais directement à votre chaudière : elle lit et écrit le cloud Remeha, qui relaie les changements à la passerelle du thermostat. Un changement fait dans Gladys s’affiche aussitôt et est confirmé quelques secondes plus tard ; un changement fait dans l’application ou par le programme horaire atteint Gladys au relevé suivant. Vos données quittent votre domicile (c’est déjà le cas avec l’application).

Sans lien avec Remeha ni BDR Thermea. Le service utilisé est celui de l’application Remeha Home ; BDR Thermea **ne le documente pas** et peut le changer sans préavis. Les requêtes sont celles décrites par l’intégration communautaire Remeha Home pour Home Assistant ([msvisser/remeha_home](https://github.com/msvisser/remeha_home) et son fork maintenu). Pas encore testée sur un vrai compte : dites-nous ce qui marche et ce qui ne marche pas.

![Illustration générée des trois widgets : les zones Remeha (température, consigne, mode, étape suivante, boutons Retour au programme et Boost eau chaude), l’énergie des 7 derniers jours par usage, et le générateur (pression, extérieur, connexion) — pas une capture d’écran](https://raw.githubusercontent.com/William-De71/gladys-remeha-home/main/docs/assets/widgets.fr.png)

## Prérequis

- Gladys Assistant **5.3.0** ou plus récent.
- Un générateur Remeha (ou Baxi, De Dietrich, Brötje) déjà installé et visible dans l’application **Remeha Home**, avec son thermostat connecté.
- Le **compte Remeha Home** : vérifiez que vous pouvez vous connecter à l’application avec votre e-mail et votre mot de passe. BDR Thermea ne propose pas d’accès séparé pour les tiers : l’intégration utilise le mot de passe de votre compte.

## Configuration

Dans Gladys, ouvrez **Intégrations → Remeha Home** :

| Champ                           | Description                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| E-mail                          | L’e-mail de votre compte Remeha Home.                                                            |
| Mot de passe                    | Son mot de passe : envoyé à Remeha uniquement, gardé en mémoire, jamais réaffiché ni journalisé. |
| Intervalle de relevé            | Toutes les 1, 2, 5 ou 10 minutes (2 par défaut). Une requête relève toutes les zones.            |
| Langue des textes des appareils | Noms des fonctionnalités et messages du bouton ; automatique par défaut.                         |

Cliquez sur **Tester la connexion** : l’intégration se connecte et liste les zones, l’eau chaude et les générateurs trouvés. Ouvrez ensuite l’onglet **Découverte** et ajoutez les appareils voulus : rien n’est créé sans vous.

## Utilisation

### Appareils

| Appareil   | Fonctionnalités                                                                  | Remarques                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zone       | Mode, consigne, demande de chauffe, température de la pièce, mode cheminée       | Mode : auto = programme horaire, chauffage = manuel (consigne fixe), arrêt = hors-gel. Changer la consigne d’une zone en programme crée une température temporaire jusqu’à la prochaine étape, comme l’application ; en manuel ou à l’arrêt, une consigne fixe. |
| Eau chaude | Mode de chauffe-eau, température confort, chauffe en cours, température de l’eau | Modes : programme (programme horaire), manuel (Confort en continu), éco, boost. Le boost repasse d’abord en programme horaire si besoin (Remeha l’exige). Température de l’eau : ballon seulement.                                                              |
| Générateur | Pression d’eau (bar), température extérieure, énergie consommée (kWh)            | Température extérieure : la sonde du générateur, sinon celle du service météo de Remeha. Énergie : un index cumulé, d’après l’estimation quotidienne de Remeha.                                                                                                 |

Remeha fournit l’énergie **jour par jour, avec environ 2 heures de retard** : l’index avance par paliers et rattrape la fin de la veille après minuit. Il démarre avec l’énergie du jour où le générateur est relevé pour la première fois : Gladys n’utilise que ses augmentations. Sur un hybride, l’index additionne le gaz et l’électricité, comme Remeha.

### Widgets du tableau de bord

- **Zones Remeha** : chaque zone et l’eau chaude avec la température, la consigne, le mode et un badge (chauffe, rafraîchit, commande en cours d’envoi). Touchez une ligne pour son détail : étape suivante du programme, programme n°, fin d’une température temporaire. **Retour au programme** remet en programme horaire les zones en manuel ou temporaires, **Boost eau chaude** lance un boost, tous deux après confirmation ; **Actualiser** relève maintenant. Choisissez les zones dans les réglages du widget (8 au plus).
- **Énergie Remeha** : l’énergie d’aujourd’hui et d’hier, et un graphique en barres des 7 derniers jours par usage (chauffage, eau chaude, rafraîchissement s’il y en a).
- **Générateur Remeha** : la pression d’eau (en rouge si Remeha la juge trop basse), la température extérieure, la connexion, l’état du générateur, ce qu’il fait en ce moment, les vacances, un bouton **Actualiser**.

### Scènes

Déclencheurs (chacun peut être limité à un générateur) :

- **Le générateur signale un défaut** / **revient à la normale** : l’état signalé par Remeha quitte « Running » ou y revient.
- **La pression d’eau devient trop basse** : Remeha ne la considère plus comme correcte ; la pression est une variable.
- **Le générateur se déconnecte ou se reconnecte** du cloud Remeha (filtrable sur l’un ou l’autre).
- **Les vacances commencent ou se terminent** : le mode vacances réglé dans l’application (jamais par l’action de l’intégration) ; le jour du retour est une variable.

Actions :

- **Imposer une température temporaire** : une zone, une température, une durée en minutes (vide : jusqu’à la prochaine étape du programme). Sortie : l’heure de fin. Certains thermostats ne savent tenir que jusqu’à l’étape suivante.
- **Choisir un programme horaire** : 1, 2 ou 3, pour une zone ou toutes ; une zone en manuel repasse en programme horaire.
- **Régler le mode vacances** : à partir d’aujourd’hui pour un nombre de jours, ou 0 pour annuler. Remeha garde des jours entiers.
- **Lancer un boost d’eau chaude** : environ 30 minutes à la température confort.
- **Relever Remeha Home maintenant** : renvoie le nombre de zones, la pression, la température extérieure et l’énergie du jour.

Exemples :

- Quand quelqu’un rentre plus tôt → imposer 21 °C au salon pendant 120 minutes.
- Quand la pression d’eau devient trop basse → envoyer une notification « Pression {{triggerEvent.data.pressure}} bar ».
- Au départ en vacances → mode vacances 7 jours ; la veille du retour → l’annuler.

### Transport

Le catalogue affiche le badge **cloud** : la connexion passe par `remehalogin.bdrthermea.net` et chaque requête par `api.bdrthermea.net`, avec votre compte Remeha Home. L’application n’offre aucun accès local.

## Dépannage

- **« Remeha a refusé l’e-mail ou le mot de passe »** : vérifiez-les dans l’application Remeha Home. L’intégration réessaie toutes les 30 minutes, ou dès que vous les changez.
- **Connecté, mais aucun générateur** : associez d’abord le thermostat dans l’application Remeha Home.
- **Pas de température d’eau** : une chaudière mixte (sans ballon) ne la mesure pas.
- **La température temporaire s’arrête à l’étape suivante au lieu de la durée demandée** : ce thermostat ne gère pas d’heure de fin.
- **L’énergie reste vide ou en retard** : Remeha la fournit avec environ 2 heures de retard, et rien pendant les 45 premières minutes après minuit.
- **Une commande s’annule après quelques minutes** : Remeha ne l’a pas appliquée ; le tableau de bord revient à ce que dit le cloud.
- **Plus rien ne marche après une mise à jour de l’application** : le service non documenté a peut-être changé ; signalez-le.
- Signalez un problème sur [GitHub](https://github.com/William-De71/gladys-remeha-home/issues) avec votre version de Gladys, la version de l’intégration, le modèle du générateur et le résultat de « Tester la connexion ».
