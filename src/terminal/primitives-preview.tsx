import { useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  LayoutGrid,
  List,
  Search,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Divider,
  IconButton,
  Input,
  Menu,
  Notice,
  NumberText,
  Select,
  Skeleton,
  Surface,
  Switch,
  Tabs,
  Tooltip,
} from "./primitives";

function Specimen({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      className="primitive-specimen"
      id={id}
      aria-labelledby={`${id}-title`}
    >
      <div className="primitive-caption">
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="primitive-examples">{children}</div>
    </section>
  );
}
function Preview() {
  const [action, setAction] = useState(
    "Essayez les contrôles : aucune transaction n’est envoyée.",
  );
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("0");
  const [sort, setSort] = useState("recent");
  const [available, setAvailable] = useState(true);
  const [details, setDetails] = useState(false);
  const [density, setDensity] = useState("Confortable");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showIds, setShowIds] = useState(false);
  const [draftShowIds, setDraftShowIds] = useState(false);
  const validAmount =
    /^\d+([.,]\d+)?$/.test(amount) && Number(amount.replace(",", ".")) > 0;
  return (
    <div className="ek-ui primitives-page">
      <a className="primitive-skip" href="#main">
        Aller aux primitives
      </a>
      <header className="primitives-header">
        <a
          className="primitive-brand"
          href="/#explorer"
          aria-label="Everkeep — Explorer"
        >
          <span className="primitive-brand-mark" aria-hidden="true" />
        </a>
        <nav aria-label="Navigation de la référence UI">
          <a href="/design/tokens.html">
            Tokens validés
            <Check aria-hidden="true" />
          </a>
          <a href="/#explorer">
            <ArrowLeft aria-hidden="true" />
            Explorer
          </a>
        </nav>
      </header>
      <main id="main" className="primitives-main">
        <div className="primitives-intro">
          <h1>
            Le contrôle,
            <br />
            dans chaque détail.
          </h1>
          <p>
            Étape 2 sur 4 : les primitives du terminal Everkeep. Une base
            commune pour explorer, comparer et agir avec précision.
          </p>
          <div className="primitive-intro-meta">
            <Badge tone="brand">Primitives UI</Badge>
            <span>Démo d’interface · aucun wallet sollicité</span>
          </div>
        </div>
        <Specimen
          id="actions"
          title="Actions"
          description="Une action principale lisible. Les états occupés et indisponibles restent explicites."
        >
          <div className="primitive-action-row">
            <Button
              variant="primary"
              icon={ArrowRight}
              onClick={() =>
                setAction(
                  "Action de démonstration déclenchée. Aucun ordre ni paiement envoyé.",
                )
              }
            >
              Continuer
            </Button>
            <Button
              onClick={() =>
                setAction(
                  "Le détail sera affiché dans le parcours métier à l’étape 4.",
                )
              }
            >
              Examiner le détail
            </Button>
            <Button
              variant="ghost"
              onClick={() => setAction("Action de démonstration annulée.")}
            >
              Annuler
            </Button>
            <Tooltip label="Les raccourcis seront disponibles dans les écrans du terminal.">
              <IconButton
                variant="ghost"
                label="Aide des raccourcis"
                icon={CircleHelp}
              />
            </Tooltip>
          </div>
          <div className="primitive-action-row">
            <Button disabled>Indisponible</Button>
            <Button busy>Vérification en cours</Button>
            <Button
              variant="danger"
              onClick={() =>
                setAction("Retrait simulé dans cet aperçu uniquement.")
              }
            >
              Retirer
            </Button>
          </div>
          <output className="primitive-feedback" aria-live="polite">
            {action}
          </output>
        </Specimen>
        <Specimen
          id="fields"
          title="Saisie & filtres"
          description="Labels persistants, aide associée et erreur exploitable. Cibles tactiles de 44 px minimum."
        >
          <div className="primitive-field-grid">
            <Input
              label="Rechercher une position"
              type="search"
              icon={Search}
              placeholder="Nom, collection, identifiant…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              hint="Spécimen de recherche ; aucun catalogue interrogé."
            />
            <Select
              label="Trier les positions"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Les plus récentes</option>
              <option value="price">Prix croissant</option>
              <option value="maturity">Échéance la plus proche</option>
            </Select>
            <Input
              label="Montant de l’offre (exemple)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={
                !validAmount
                  ? "Saisissez un montant supérieur à zéro."
                  : undefined
              }
              hint="Valeur de démonstration, sans offre réelle."
            />
            <Input
              label="Compte du signataire"
              disabled
              value="Connexion désactivée dans cet aperçu"
              hint="La connexion existante reste disponible dans l’application."
            />
          </div>
          <div className="primitive-preferences">
            <Checkbox
              label="Masquer les positions indisponibles"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            <Switch
              label="Afficher les détails"
              checked={details}
              onChange={(e) => setDetails(e.target.checked)}
              aria-controls="preview-details"
            />
          </div>
          <output className="primitive-feedback" aria-live="polite">
            {query
              ? `Recherche saisie : « ${query} ». `
              : "Aucun texte recherché. "}
            Tri :{" "}
            {sort === "recent"
              ? "récent"
              : sort === "price"
                ? "prix"
                : "échéance"}
            .{" "}
            {available
              ? "Indisponibles masquées."
              : "Toutes les positions affichées."}
          </output>
          <p
            id="preview-details"
            hidden={!details}
            className="primitive-detail"
          >
            Les filtres s’appliquent ici à l’aperçu des contrôles. Leur
            connexion au catalogue arrive avec les pages.
          </p>
        </Specimen>
        <Specimen
          id="navigation"
          title="Navigation & options"
          description="Onglets au clavier, menus accessibles et préférences dans une fenêtre à focus protégé."
        >
          <Tabs
            label="Contenus d’une collection (aperçu)"
            items={[
              {
                id: "items",
                label: "Items",
                content: (
                  <p>
                    La sélection d’items occupera cet espace dans la page
                    Collection.
                  </p>
                ),
              },
              {
                id: "activity",
                label: "Activité",
                content: (
                  <p>
                    Les événements vérifiés sur NEAR seront présentés ici à
                    l’étape des pages.
                  </p>
                ),
              },
              {
                id: "analytics",
                label: "Analytics",
                disabled: true,
                content: <p>Disponible ultérieurement.</p>,
              },
            ]}
          />
          <div className="primitive-action-row">
            <Menu
              label="Densité d’affichage"
              trigger={
                <Button icon={SlidersHorizontal}>
                  Affichage
                  <ChevronDown aria-hidden="true" />
                </Button>
              }
              items={[
                {
                  id: "comfortable",
                  label: "Affichage confortable",
                  icon: LayoutGrid,
                  onSelect: () => setDensity("Confortable"),
                },
                {
                  id: "compact",
                  label: "Affichage compact",
                  icon: List,
                  onSelect: () => setDensity("Compact"),
                },
                {
                  id: "saved",
                  label: "Enregistrer une vue",
                  icon: Check,
                  disabled: true,
                  onSelect: () => {},
                },
              ]}
            />
            <Dialog
              open={dialogOpen}
              onOpenChange={(value) => {
                setDialogOpen(value);
                if (value) setDraftShowIds(showIds);
              }}
              trigger={<Button icon={Settings2}>Préférences</Button>}
              title="Votre affichage"
              description="Ajustez cet aperçu. Ces préférences ne modifient ni votre wallet ni vos positions."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setShowIds(draftShowIds);
                      setDialogOpen(false);
                    }}
                  >
                    Appliquer
                  </Button>
                </>
              }
            >
              <Switch
                label="Afficher les identifiants"
                checked={draftShowIds}
                onChange={(e) => setDraftShowIds(e.target.checked)}
              />
            </Dialog>
          </div>
          <output className="primitive-feedback" aria-live="polite">
            Densité : {density}. Identifiants :{" "}
            {showIds ? "visibles" : "masqués"}.
          </output>
        </Specimen>
        <Specimen
          id="data"
          title="Chiffres & statuts"
          description="Des chiffres alignés, un signe et un libellé. La couleur renforce le sens sans le remplacer."
        >
          <div className="primitive-number-rack">
            <NumberText>1 234,56</NumberText>
            <span>Spécimen numérique, pas un prix de marché.</span>
          </div>
          <div className="primitive-action-row">
            <Badge tone="up" icon={ArrowUpRight}>
              Hausse <NumberText>+4,28 %</NumberText>
            </Badge>
            <Badge tone="down" icon={ArrowDownRight}>
              Baisse <NumberText>−2,16 %</NumberText>
            </Badge>
            <Badge icon={Clock3}>En attente</Badge>
            <Badge tone="brand" icon={Check}>
              Sélectionné
            </Badge>
          </div>
          <Divider />
          <p className="primitive-fineprint">
            Les valeurs ci-dessus servent uniquement à vérifier la typographie
            et les états sémantiques.
          </p>
        </Specimen>
        <Specimen
          id="feedback"
          title="Retours & attente"
          description="Un chargement stable, une confirmation sobre, une erreur qui dit comment reprendre."
        >
          <div className="primitive-state-grid">
            <div className="primitive-loading">
              <strong>Lecture des données</strong>
              <Skeleton label="Lecture des données en cours" />
              <span>Emplacement réservé pendant le chargement.</span>
            </div>
            <Notice tone="success" title="Préférences appliquées">
              Exemple de confirmation. Aucune opération financière.
            </Notice>
            <Notice tone="error" title="Connexion interrompue">
              Vérifiez votre connexion puis réessayez. Aucun ordre n’a été
              envoyé.
              <Button
                variant="ghost"
                onClick={() =>
                  setAction("Nouvelle tentative de démonstration demandée.")
                }
              >
                Réessayer dans l’aperçu
              </Button>
            </Notice>
            <Notice title="Aucun résultat">
              Modifiez les filtres pour élargir votre recherche.
              <Button
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  setAvailable(false);
                  setAction("Filtres de démonstration réinitialisés.");
                }}
              >
                Réinitialiser les filtres
              </Button>
            </Notice>
          </div>
        </Specimen>
        <Specimen
          id="surfaces"
          title="Profondeur"
          description="Quatre niveaux de surface, une seule couleur de marque. Le relief reste réservé à la hiérarchie."
        >
          <div className="primitive-surface-grid">
            {(["bg", "s1", "s2", "s3"] as const).map((level, index) => (
              <Surface key={level} level={level}>
                <NumberText>{level.toUpperCase()}</NumberText>
                <span>
                  {["Fond", "Support", "Panneau", "Premier plan"][index]}
                </span>
              </Surface>
            ))}
          </div>
        </Specimen>
        <footer className="primitives-footer">
          <p>Everkeep · Référence UI interactive</p>
          <p>
            Prochaine étape après validation : composants de marketplace et
            architecture des cartes spéciales.
          </p>
          <a href="/design/tokens.html">
            Revoir les tokens
            <ArrowRight aria-hidden="true" />
          </a>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
