import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  AlertCircle,
  Check,
  Info,
  LoaderCircle,
  X,
  type LucideIcon,
} from "lucide-react";
import spec from "../../design-system/terminal/tokens.json";
import "./primitives.css";

const cx = (...names: (string | undefined | false)[]) =>
  names.filter(Boolean).join(" ");
const collisionPadding = Number.parseFloat(spec.tokens.space["4"]);
const tooltipDelay = Number.parseFloat(spec.tokens.duration.normal);
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
  icon?: LucideIcon;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      busy = false,
      disabled,
      icon: Icon,
      children,
      className,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={cx("ek-button", `ek-button--${variant}`, className)}
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" />
        ) : Icon ? (
          <Icon aria-hidden="true" />
        ) : null}
        <span>{children}</span>
      </button>
    );
  },
);

export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "children" | "icon"> & {
    label: string;
    icon: LucideIcon;
  }
>(function IconButton({ label, icon: Icon, className, ...props }, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      aria-label={label}
      className={cx("ek-icon-button", className)}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
});

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={tooltipDelay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            className="ek-ui ek-tooltip"
            side="top"
            collisionPadding={collisionPadding}
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

type FieldMeta = { label: string; hint?: string; error?: string };
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> &
    FieldMeta & {
      icon?: LucideIcon;
    }
>(function Input(
  {
    label,
    hint,
    error,
    icon: Icon,
    id: suppliedId,
    className,
    "aria-describedby": describedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId(),
    id = suppliedId || generatedId;
  const description =
    [describedBy, hint && `${id}-hint`, error && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={cx("ek-field", className)}>
      <label htmlFor={id}>{label}</label>
      <div className={cx("ek-input-wrap", Icon && "ek-input-wrap--icon")}>
        {Icon && <Icon aria-hidden="true" />}
        <input
          {...props}
          ref={ref}
          id={id}
          className="ek-input"
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={description}
        />
      </div>
      {hint && (
        <p className="ek-field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ek-field-error" id={`${id}-error`}>
          <AlertCircle aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldMeta
>(function Select(
  {
    label,
    hint,
    error,
    id: suppliedId,
    className,
    children,
    "aria-describedby": describedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId(),
    id = suppliedId || generatedId;
  const description =
    [describedBy, hint && `${id}-hint`, error && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={cx("ek-field", className)}>
      <label htmlFor={id}>{label}</label>
      <select
        {...props}
        ref={ref}
        id={id}
        className="ek-input"
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={description}
      >
        {children}
      </select>
      {hint && (
        <p className="ek-field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ek-field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
});

export function Checkbox({
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  return (
    <label className={cx("ek-check", className)}>
      <input {...props} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}
export function Switch({
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> & {
  label: string;
}) {
  return (
    <label className={cx("ek-switch", className)}>
      <input {...props} type="checkbox" role="switch" />
      <span className="ek-switch-track" aria-hidden="true">
        <span />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function NumberText({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cx("ek-number", className)} />;
}
export function Badge({
  tone = "neutral",
  icon: Icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "brand" | "up" | "down";
  icon?: LucideIcon;
}) {
  return (
    <span {...props} className={cx("ek-badge", `ek-badge--${tone}`, className)}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </span>
  );
}
export function Surface({
  level = "s1",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { level?: "bg" | "s1" | "s2" | "s3" }) {
  return (
    <div
      {...props}
      className={cx("ek-surface", `ek-surface--${level}`, className)}
    />
  );
}
export function Divider() {
  return <hr className="ek-divider" />;
}
export function Skeleton({
  label = "Chargement en cours",
}: {
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="ek-skeleton">
      <span className="ek-skeleton-line" />
      <span className="ek-skeleton-line ek-skeleton-line--short" />
      <span className="ek-sr-only">{label}</span>
    </div>
  );
}
export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "error";
  title: string;
  children: ReactNode;
}) {
  const Icon =
    tone === "error" ? AlertCircle : tone === "success" ? Check : Info;
  return (
    <div
      className={cx("ek-notice", `ek-notice--${tone}`)}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Tabs({
  label,
  items,
  value,
  defaultValue,
  onValueChange,
}: {
  label: string;
  items: {
    id: string;
    label: string;
    content: ReactNode;
    disabled?: boolean;
  }[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <TabsPrimitive.Root
      value={value}
      defaultValue={defaultValue || items[0]?.id}
      onValueChange={onValueChange}
    >
      <TabsPrimitive.List className="ek-tabs" aria-label={label}>
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.id}
            value={item.id}
            disabled={item.disabled}
            className="ek-tab"
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Content
          key={item.id}
          value={item.id}
          className="ek-tab-panel"
        >
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

export function Menu({
  trigger,
  label,
  items,
}: {
  trigger: ReactElement;
  label: string;
  items: {
    id: string;
    label: string;
    icon?: LucideIcon;
    disabled?: boolean;
    danger?: boolean;
    onSelect: () => void;
  }[];
}) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger asChild>{trigger}</MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          className="ek-ui ek-menu"
          aria-labelledby={undefined}
          aria-label={label}
          align="end"
          collisionPadding={collisionPadding}
        >
          {items.map(
            ({ id, label: text, icon: Icon, disabled, danger, onSelect }) => (
              <MenuPrimitive.Item
                key={id}
                disabled={disabled}
                onSelect={onSelect}
                className={cx("ek-menu-item", danger && "ek-menu-item--danger")}
              >
                {Icon && <Icon aria-hidden="true" />}
                <span>{text}</span>
              </MenuPrimitive.Item>
            ),
          )}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && (
        <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      )}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ek-dialog-overlay" />
        <DialogPrimitive.Content
          className="ek-ui ek-dialog"
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <div className="ek-dialog-heading">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton variant="ghost" label="Fermer la fenêtre" icon={X} />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="ek-dialog-description">
            {description}
          </DialogPrimitive.Description>
          <div className="ek-dialog-body">{children}</div>
          {footer && <div className="ek-dialog-footer">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
