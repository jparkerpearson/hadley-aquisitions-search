---
name: Imported-project mockup readiness
description: Artifact creation is not proof that isolated mockup dependencies and checks are ready in this imported npm project.
---

Treat mockup artifact creation and dependency readiness as separate steps in this imported npm project. Verify that the artifact's dev-server and type-check commands have their tools before starting previews or relying on checks.

**Why:** Artifact creation reported that installation had started, but the isolated preview initially lacked its server executable; its declared type-check command also lacked a compiler.

**How to apply:** Keep dependency setup local to the mockup artifact, verify its declared scripts, and leave the imported website's runtime and dependency structure intact. Do not migrate the website merely to make design previews work.
