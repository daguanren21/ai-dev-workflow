# Dependency selection policy

Use Node.js and browser platform APIs first. Add an npm dependency only when it
removes meaningful protocol, parsing, compatibility, or security maintenance.
Do not add a package merely to replace a small, obvious helper.

Before adopting or upgrading a package, record these checks in the change:

1. npm weekly downloads and dependent count are sufficient for the package's
   risk and scope. Security-sensitive runtime packages should normally have at
   least one million weekly downloads unless no established alternative exists.
2. The latest release or repository activity shows active maintenance. Packages
   with no release and no meaningful repository activity for 18 months are not
   eligible without an explicit exception.
3. The package supports the project's minimum Node.js version, has usable
   TypeScript declarations, and uses a compatible license.
4. Review direct and transitive dependency count, install size, known security
   advisories, ownership changes, and the lockfile diff.
5. Keep domain-specific validation, redaction, bounded reads, and confirmation
   gates in project code even when a general-purpose parser is adopted.

High download volume alone does not override an inactive maintenance history.
Conversely, a tiny helper should remain local when a dependency would add more
supply-chain and upgrade risk than maintained code.
