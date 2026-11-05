# Google sign-in

The frontend supports GitHub and Google through PocketBase's existing OAuth2
flow. It reads `users.listAuthMethods()` and displays only configured providers,
in GitHub / Google order. The same buttons and official locally bundled marks
are used for sign-in and invitation-based sign-up.

The project owner continues to sign in only with the existing GitHub account.
Google and email/password are alternatives for other invited members. Configuring
Google for the application does not require the owner to use or connect a personal
Google login, and does not create a second administrator account.

## Production configuration

Use the dedicated Google Cloud project `mind-the-dag`. Keep other products in
their own projects, and use separate projects for development/staging and
production as required by Google's OAuth policies.

1. In Google Auth Platform, configure the app name `mind-the-dag`, the owner's
   support/contact email and an External audience. The project owner must
   personally review Google's user-data-policy agreement.
2. Create a **Web application** OAuth client for the production PocketBase
   server. Register this exact authorised redirect URI:

   ```text
   https://library-mind-the-dag.2.rahtiapp.fi/api/oauth2-redirect
   ```

3. In the PocketBase dashboard, open **Collections → users → Edit collection →
   Options → OAuth2 → Google**. Enter the client ID and client secret there,
   keeping GitHub enabled. Client secrets belong only in server configuration;
   no Google secret is needed in Vite environment variables or browser code.
4. Use the default identity scopes only (`openid`, email and profile). Configure
   the app's audience/publishing state for the intended users before release.
   Google's [audience rules](https://support.google.com/cloud/answer/15549945)
   exempt sign-in requests limited to these basic identity scopes from the
   Testing state's test-user list and seven-day authorisation expiry. Revisit
   this if additional scopes are introduced.
5. Reload sign-in. Google appears automatically when the server's auth-methods
   endpoint advertises it. Adding the provider does not require a new frontend
   auth implementation or changes to invitations or map ownership.

## Account identity rules

- An existing Google/GitHub provider identity always returns to its original user
  record, even if its provider email changes to another account's email.
- For a new provider identity, use its verified email to find an existing account.
  The OAuth request hook matches email case-insensitively. Google must report
  `email_verified`; GitHub must return a verified primary email.
- Different emails create separate accounts and still require a valid invitation.
  Names and profile pictures are not identity keys. Existing records are never
  merged into each other.
- Sign-in uses a fresh in-memory PocketBase client. It does not send the current
  browser account's token to OAuth, so signing in cannot implicitly connect a new
  provider to an already signed-in member. No personal account-linking UI is added.

## Frontend behavior

Both the home page and invitation page offer configured providers, explicit
retry after provider discovery failure, cancellation while an OAuth popup is
pending, and an actionable message when the browser blocks popups. User-denied
Google consent is cancellation; other token-exchange failures are not reported
as proof that an invitation is invalid. Invitation acceptance failures remain
visible rather than being ignored.

The sign-in and invitation forms link to the locally bundled `public/privacy.html`.
After that page is published and returns HTTP 200, set its public URL in Google
Auth Platform Branding:

```text
https://marveloushaotian.github.io/mind-the-dag/privacy.html
```

Do not configure an unpublished/404 policy URL. Terms of Service and an uploaded
app logo are optional here. Google may require brand verification before showing
an app name/logo in place of the backend domain. This is separate from the
basic-identity scope exception described above; Testing does not block these
basic Google sign-in scopes for non-test users.

## Verification

Run frontend checks with `npm test` and `npm run build`. For actual server OAuth
matching and invitation rules, obtain the PocketBase version pinned in
`server/Dockerfile`, then run:

```sh
python3 server/oauth_smoke.py --pocketbase /path/to/pocketbase
```

This starts an isolated temporary database with the repository's real migrations
and hooks. Local Google/GitHub fixtures replace only the provider HTTP responses;
PocketBase performs token exchange, verified-email extraction, user matching,
creation, provider linking and access-rule enforcement. The checks cover both
provider orders, case differences, different emails, changing a provider email
to another existing account's email, preservation of maps/groups, and missing,
invalid, used or expired invitations. Unverified provider emails must not match
an existing account. Temporary data is removed at exit. The server CI workflow
runs these checks before publishing its image.

Live configuration checked on 5 November 2026: the production server advertises
both providers and only basic Google profile/email scopes; the Pages origin is
allowed. Google Cloud uses an External audience in Testing, has the dedicated
client and callback, and its application home page is saved. The owner remains
GitHub-only. No personal Google authorization or binding was completed.

Release verification: after deploying frontend and server changes, check both
provider marks and the public privacy page, and confirm its Google Branding
link. A real invited member must complete one Google authorization and
confirm their maps/group. Opening Google's account chooser is not a completed
Google sign-in test, and the local provider integration tests do not prove the
real Google client's consent/callback round trip.

References: [PocketBase OAuth2](https://pocketbase.io/docs/authentication/#authenticate-with-oauth2),
[Google sign-in best practices](https://developers.google.com/identity/siwg/best-practices),
[Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies),
[button branding](https://developers.google.com/identity/branding-guidelines).
