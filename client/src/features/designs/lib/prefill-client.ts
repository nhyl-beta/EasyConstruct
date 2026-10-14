/**
 * The client to fill in when a project is picked on the New design form: the project's own
 * client, but only while the Client field is still empty (a client the person already chose is
 * never overwritten) and only when the project really has one ("Unknown" is the display
 * placeholder for none). Returns null when nothing should change.
 */
export function clientToPrefill(currentClient: string, project: { client?: string | null } | undefined): string | null {
  if (currentClient.trim() !== "") return null;
  const client = project?.client?.trim();
  if (!client || client.toLowerCase() === "unknown") return null;
  return client;
}
