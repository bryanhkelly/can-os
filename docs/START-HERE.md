# CAN OS documentation: transition notice

**FullFlow is released and retired.** The former documentation index is preserved at [the November 2026 archive snapshot](archive/2026-11-fullflow/root-snapshot/docs/START-HERE.md).

Use the [new documentation home](README.md), [CAN vision](vision/CAN-VISION.md), and [documentation reset register](DOCUMENTATION-RESET.md).

## During the migration

Existing engineering and safety documents have not yet all been archived or replaced. For any production-affecting change, locate the relevant existing specification and verify its assertions against current source code, migrations, and executed tests. Do not treat retired FullFlow execution plans as active requirements.

Before relocating any document, identify code, CI, and agent references to its path and update them atomically. Do not move the route contract JSON, security procedures, or deployment/recovery runbooks without verified replacements.
