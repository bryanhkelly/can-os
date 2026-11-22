/**
 * Prevent accidental replacement of business-event consumers during startup.
 * Multiple side effects for one event must be explicitly composed instead of
 * relying on Map.set() registration order.
 */
export function registerUniqueDomainEventHandler<H>(
  registry: Map<string, H>, eventType: string, handler: H,
): void {
  if (!eventType.trim()) {
    throw new Error("Domain event handler requires a nonempty event type");
  }
  if (registry.has(eventType)) {
    throw new Error("Duplicate domain event handler registration: " + eventType);
  }
  registry.set(eventType, handler);
}
