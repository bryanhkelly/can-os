/** Delivery classification is independent of sender, Person roles and organization.
 * Accept nested domain labels here as well; a .demo destination must never
 * reach a provider even if an identity signup validator is more restrictive.
 */
export function suppressDemoEmailDelivery(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  return separator > 0 && normalized.slice(separator + 1).endsWith(".demo");
}
