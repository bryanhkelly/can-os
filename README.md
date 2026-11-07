# CAN OS

CAN OS is the operating platform for distributed Christian education across churches, Christian schools, microschools, consortia, and denominational partner networks.

The FullFlow delivery initiative has **shipped and been retired**. This repository's active development baseline is `main`; do not use retired FullFlow branch or database instructions as current operating guidance.

## Start here

- [Product vision](docs/vision/CAN-VISION.md)
- [Documentation home](docs/README.md)
- [Documentation reset and migration status](docs/DOCUMENTATION-RESET.md)
- [Agent development contract](AGENTS.md)

## Architecture at a glance

The system is a TypeScript/React application with a modular-monolith architecture and Neon PostgreSQL as its system of record. The canonical school topology is Organization → Site → Program → Section. Authorization is enforced by server-side capabilities, resources, scopes, and relationships. Domain mutations preserve audit and event semantics.

## Development

Use the supported Node version and scripts declared in `package.json`. Do not infer safe database targets from old documentation or a local environment file. Confirm the exact environment and database identity before running any migration or fixture-writing test. Never use production or shared student data for destructive tests.

The repository includes implemented capabilities and unverified acceptance areas. Verify claims against the current commit, migrations, and executed tests. See the [documentation reset register](docs/DOCUMENTATION-RESET.md) for the status of migrating older runbooks and specifications.

## Historical material

Legacy delivery records remain available in `docs/archive/` and in Git history. Historical release plans, branch names, test counts, and deployment instructions are not current product or operational authority.
