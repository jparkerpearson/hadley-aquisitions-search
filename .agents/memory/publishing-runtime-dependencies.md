---
name: Publishing runtime dependencies
description: Publishing exclusions can remove Node dependencies even after a successful npm build.
---

Keep installed runtime dependencies available to the published Node server. Git exclusions and publishing exclusions have different purposes.

**Why:** A publishing build installed packages successfully, but the server crash-looped with a missing App Storage package because the publishing ignore file excluded the runtime dependency directory.

**How to apply:** When publishing installs successfully but startup reports missing packages, inspect publishing exclusions before reinstalling or changing package versions. Keep dependency directories excluded from Git without excluding them from the runtime image.
