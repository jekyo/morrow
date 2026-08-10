# Deploying Morrow with jekyo

1. Edit `jekyo.yaml`: set your domain in `http.domain` (image is `ghcr.io/jekyo/morrow`).
2. If the GHCR package is private: `jekyo registry login ghcr.io` (once per context).
3. Create `.env` next to jekyo.yaml with `MORROW_API_KEY=<strong random key>`.
4. Deploy: `jekyo render && jekyo up --env-file .env`
5. Check: `jekyo ps morrow`, `jekyo logs morrow -f`, then open `https://<your-domain>`.

Upgrades: bump the image tag in `jekyo.yaml` after a release, re-run `jekyo up`.
Profile data lives in the `data` volume; it survives `jekyo down` (only
`jekyo down --volumes` deletes it). Consider `backup:` on the volume once
real profiles exist.
