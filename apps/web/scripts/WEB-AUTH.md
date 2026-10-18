# Web administrator

The web server requires a local administrator and an eight-hour session for all
management pages and API routes. The control-plane API keeps its existing bearer
-token authentication and should remain bound to loopback.

Create or reset the administrator (password from stdin):

    INVISIBLE_DOTS_HOME=/path/to/.invisible-dots node apps/web/scripts/set-admin.mjs USERNAME

Enter the password, then EOF (Ctrl-D). For unattended setup, pipe the password
from a protected source. Never put it in command arguments. Resetting the password
invalidates existing sessions. Missing or invalid account files fail closed.

The data directory contains config/web-account.json (salt + scrypt hash) and
config/web-sessions/ (hashed tokens, expiry, account version). Files have mode
0600 and the session directory 0700. Keep this directory out of source control.

HTTP deployments use HttpOnly, SameSite=Lax cookies without Secure. Both login
and state-changing browser requests require a matching Origin. No registration
or default password is bundled with the application. Login attempts are limited
per username and globally within each web process; this deployment runs one
process. Anonymous clients cannot reach the upstream API through the web proxy.

OAuth callbacks use top-level GET navigation with the existing SameSite=Lax
session plus the connector's OAuth state validation. Re-authenticate and restart
authorization if the session has expired.
