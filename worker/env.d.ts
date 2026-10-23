/**
 * Secrets are not written in wrangler.toml, so they are declared here.
 *
 * Set the signing key once per environment:
 *   npx wrangler secret put CAPTCHA_SECRET
 * and put the same name in `.dev.vars` for local work (see README).
 */
interface Env {
  CAPTCHA_SECRET?: string
}
