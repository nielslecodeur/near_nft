> Référence courante : [marketplace de positions](marketplace-mvp.md). Le protocole de financement agent ci-dessous est conservé ; le catalogue ne contient plus de concepts indisponibles et la navigation est Explorer / Mes positions / Agent.

# Explorer, positions et agent

## État des lieux et périmètre livré

Le socle avait une série à échéance fixe, une souscription manuelle, des wallets sans clé d’accès, ML-DSA-65, une allocation déléguée et un règlement de revente en sandbox. Il n’autorisait pas un agent à consommer un dépôt initial pour créer une position. Le nouveau parcours ajoute ce mandat sans retirer de règle de retrait ou de contrôle existante.

L’interface contient uniquement Explorer (Stratégies/Revente), Mes positions et Agent. Mon compte expose connexion wallet, réseau/personnage et Sécurité. Les routes historiques #series et #market sont conservées comme accès à Explorer et Revente. #app/#portfolio ouvrent Mes positions. Une position sans série reste identifiée comme historique : aucune échéance nouvelle ne lui est attribuée.

Réserve demoUSD est une identité de la stratégie réelle de test déjà configurée. Son compte conserve le capital, et l’allocation vers la stratégie de démonstration est plafonnée par les règles existantes. Les deux autres cartes sont des concepts indisponibles, pas des produits financiers fonctionnels. Le prix de revente et les actifs comptabilisés restent distincts ; la valorisation affiche disponible+principal au gel, sans ajouter deux fois les gains.

## Autorisation de souscription

`packages/agent/investment.ts` est une fonction déterministe sans réseau ni clé. Montant, actif, horizon indicatif, besoin de liquidité, exclusions et plafond définissent une proposition. Les notes de discussion ne sont pas interprétées comme des commandes. En cas d’incompatibilité, aucune allocation n’est produite. Les données et leur bloc d’observation sont affichés ; le serveur relit solde, contraintes et empreinte avant toute signature de mandat.

1. Proposition en lecture : aucune dépense, aucun POST de commande.
2. Confirmation propriétaire : préparation d’un nouveau compte technique puis `AuthorizeSubscription` signé ML-DSA dans le wallet. Les champs signés lient agent, actif, stratégie, montant exact, expiration et bénéficiaire, en plus des domaines, nonce et générations déjà présents.
3. Dépôt du propriétaire : NEP-141 `ft_transfer_call` vers la collection vérifiée, message `AgentSubscribe{position,policy_version}`. Seul le montant exact et le propriétaire prévus sont acceptés. La capacité est réservée ; aucun NFT n’est encore émis.
4. Exécution : `agent_subscribe` exige le vrai predecessor agent, la version, l’expiration et l’état Authorized. Le financement devient Funding avant promesse. Le wallet valide l’unique crédit puis synchronise le NFT au propriétaire signataire.
5. Révocation : `CancelSubscription` ML-DSA fait clôturer l’autorisation par la collection. Une commande déjà Funding ne peut pas être remboursée par cette annulation. Avant engagement, une créance fixe au propriétaire libère la capacité exactement une fois.

Les tombstones de version interdisent une autorisation ou un dépôt tardif après annulation. Une réponse ambiguë reste bloquée comme dans le protocole existant. Les callbacks restent privés et vérifient leur génération. Les méthodes de marché ne sont jamais des permissions de cet agent. L’allocation ultérieure dans la position utilise toujours la politique existante, distincte du mandat de souscription consommé.

## Accès existants et migrations

Le reader NFT accepte une paire wallet/index cohérente pour affichage même quand la position est gelée. La vérification des écritures reste stricte : son mode par défaut refuse toujours les états non actifs. Une collection historique dépourvue des nouvelles méthodes de catalogue peut encore être lue via le wallet ; elle n’est pas présentée comme une nouvelle stratégie disponible.

La nouvelle API de démonstration utilise8790. L’ancienne source8788 est proposée séparément, si elle tourne encore, sans arrêter ni modifier ses contrats. Si elle est inactive, l’interface explique que relancer la nouvelle démo ne restaure pas ses clés éphémères. Aucun fonds testnet n’est migré ou supprimé. Le nouveau format Borsh nécessite de nouveaux déploiements ; aucun upgrade de contrat existant n’est ajouté.

## Preuves

- 45 tests Rust : socle et cinq cas de séquestre/agent/annulation supplémentaires.
- 23 tests TypeScript : proposition exacte, abstention, notes sans autorité et lecture historique sans affaiblir les écritures.
- `docs/results/agent-subscription.json` : signatures ML-DSA et vraies opérations WASM, mauvais montant, mauvais agent, version périmée, exécution unique, révocation et remboursement fixe.
- `docs/results/series-demo.json` : 27 contrôles de référence incluant vente, révocation des anciens accès et retrait à échéance, relancés avec les nouveaux WASM.
- `docs/results/explorer-ui.json` : Chrome réel, propositions sans dépense, mandat/séquestre/exécution séparés, rotation, annulation/remboursement et achat secondaire manuel.
- `docs/results/explorer-edge-ui.json` : fixtures de lecture explicitement identifiées pour le retrait historique, un mandat expiré, la lisibilité mobile et une ancienne source inactive. Ce ne sont pas des transactions financières.

Les opérations financières testnet restent désactivées. Aucun login externe, déploiement testnet, rendement réel ou sécurité postquantique de bout en bout n’est revendiqué. Les limites de règlement de `option2-validation.md` restent applicables.

La session de vérification sur8789 reste accessible séparément dans Mon compte ; la démo actuelle utilise8790. Les nouvelles sessions interactives ouvrent les souscriptions pendant deux heures, avec échéance à quatre heures ; les anciennes échéances restent inchangées.

Les nouveaux binaires nomment les métadonnées NFT « Everkeep Positions ». Aucune métadonnée ni échéance d’un contrat déjà déployé n’est réécrite. Les captures finales et leur portée sont consignées dans explorer-captures.json.
