# CAN OS production repository instructions

Read `docs/architecture.md`, `docs/domain-model.md`, `docs/golden-flows.md`, and `docs/prototype-migration.md` before making architecture or product changes.

## Non-negotiable rules

1. This is the production repository. Do not recreate prototype JSON/localStorage stores.
2. Neon PostgreSQL is the system of record.
3. Use a modular monolith unless a measured requirement justifies service extraction.
4. Treat Organization -> Site -> Program as the delivery hierarchy. Do not create a production `ChurchSite` root entity.
5. `Program` is first-class.
6. The prototype's PortalIds are personas only. Workspaces derive from identity, role/capability, scope, and relationships.
7. Authorization is `capability + resource + scope + relationship`; UI hiding is never security.
8. Ask CAN must use the same authorization layer as every other client.
9. `Action` is the universal work object. Do not create separate task/case engines.
10. `Journey` is the reusable onboarding/readiness engine. Do not hard-code separate workflow engines for enrollment, launch, teacher readiness, etc.
11. Every consequential mutation writes an immutable AuditEvent and, when relevant, a DomainEvent.
12. Use the transactional outbox pattern before introducing distributed event infrastructure.
13. State/jurisdiction-specific requirements belong in configuration/domain policy, not scattered conditionals.
14. Build by Golden Flow. GF1-GF4 are the initial production release; the ESA funding-exception flow is deferred.
15. Preserve the best prototype UX but do not preserve prototype architecture.
16. Add automated tests around Golden Flows before broadening surface area.
