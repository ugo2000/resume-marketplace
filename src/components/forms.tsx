import type { Child } from 'hono/jsx';

export const Field = ({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: Child;
}) => (
  <label for={name} class="field">
    <span>{label}</span>
    {children}
  </label>
);
