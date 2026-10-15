# Prototype -> Production Mapping

The prototype is a UX/workflow reference. Production code must not preserve prototype shortcuts accidentally.

| Prototype concept | Production concept |
|---|---|
| `Portal` / `PortalId` | Workspace derived from Person + Membership + RoleAssignment + Capability + Scope + Relationship |
| `ChurchSite` | Organization + Site + Program |
| JSON student | Person + StudentProfile + Household/relationships |
| local React state | Neon-backed transactional persistence |
| localStorage stores | server-backed domain services |
| prototype workflow store | Action + DomainEvent + AuditEvent |
| scripted Ask CAN response | authorized AI query/action over domain services |
| role switcher | authenticated membership/workspace switcher |
| synthetic course | CourseTemplateVersion + Section |
| synthetic assignment row | Assessment + availability/publication state |
| synthetic submission | Submission |
| page-specific task | Action |
| one-off onboarding UI | Journey configuration |
| hard-coded state logic | Jurisdiction / requirement configuration where applicable |

## Copy from prototype

Copy or adapt selectively:

- visual design system
- reusable UI primitives
- page scaffolding
- excellent interaction patterns
- grading UX
- notification UX
- command/search UX
- accessibility improvements
- copy patterns that survived validation

## Do not copy as production architecture

- synthetic data files
- `prototype-*-store` modules
- localStorage persistence
- hard-coded people/personas
- portal permission levels
- page-level fake audit logs
- duplicated state across screens
- church-specific domain names where a generalized Organization/Site/Program model is required
- scripted AI evidence as a production data path

## Migration method

For each production Golden Flow:

1. open the corresponding prototype screens;
2. identify reusable visual components;
3. implement canonical production domain/service operations first;
4. connect the UI to those operations;
5. prove cross-workspace propagation with automated tests;
6. only then expand peripheral screen depth.
