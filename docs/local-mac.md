# Run HandyApp on your Mac

Everything runs on your Mac mini with its own PostgreSQL database. One server process serves all three sites:

| What                       | Address                      |
| -------------------------- | ---------------------------- |
| Public site                | http://localhost:3000        |
| Customer portal            | http://localhost:3000/portal |
| Staff app (Owner, workers) | http://localhost:3000/staff  |

Nothing here is reachable from the internet. Emails are written to the server's terminal and never sent, texts go to
a built-in fake and are never sent, and photos and documents are kept in a folder in the project. The launch phase
stays at phase 1 (Owner Acceptance Testing), as on staging. Use synthetic test data only.

## 1. Install the tools (once)

Open Terminal and run these one at a time.

1. Apple's command line tools (they include `git`):

   ```sh
   xcode-select --install
   ```

2. Homebrew, if you do not have it (the command comes from https://brew.sh):

   ```sh
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

3. Node 24 and PostgreSQL 16:

   ```sh
   brew install node@24 postgresql@16
   echo 'export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zprofile
   source ~/.zprofile
   brew services start postgresql@16
   corepack enable
   ```

   `node -v` should print `v24...` and `psql --version` should print `16...`.

## 2. Get the code (once)

```sh
cd ~
git clone https://github.com/Bh3os/handyapp.git
cd handyapp
```

The repository is private: sign in to GitHub when asked (or run `gh auth login` first if you use the GitHub CLI).

## 3. Set it up (once)

Use your own email address:

```sh
scripts/local/setup.sh you@example.com
```

This takes a few minutes. It:

- writes a `.env` file with new keys (it is never committed; keep it, since the keys protect the staff
  authenticators and the access codes);
- creates the database `handyhub_local`;
- installs, builds, applies the migrations and loads the 26 services, the SOPs and the loadouts.

Running it again is safe: an existing `.env` and database are kept.

## 4. Create your Owner account (once)

```sh
scripts/local/owner-link.sh you@example.com "Your Name"
```

It prints a link. Start the server (step 5), open the link, choose a password, then set up the authenticator app
(Google Authenticator, 1Password or similar). Save the recovery codes it shows.

For other staff, invite them from the staff app (Staff). Their invite link appears in the server's terminal when their
email is in `TEST_EMAIL_DESTINATIONS` (step 6). Or print one directly with
`scripts/local/owner-link.sh their@email`.

## 5. Start and stop

```sh
scripts/local/start.sh
```

Open http://localhost:3000. The terminal stays busy while the server runs; press `Ctrl-C` to stop it. Each start
applies new migrations first.

Use Chrome or Firefox for the customer portal. The portal's sign-in cookie is marked secure, and Safari may refuse it
on `http://localhost`.

## 6. Reading emails, links and codes

Nothing is emailed. Each email is printed in the terminal as a line containing `STAGING_EMAIL_LOGGED`, with the
address, the subject and the text, including links and one-time codes. Only the addresses listed in `.env` get one:

```sh
TEST_EMAIL_DESTINATIONS=you@example.com,test-customer-1@example.test,oat-office@example.test
```

Edit `.env`, then stop and start the server.

## 7. Updating to the latest version

Stop the server, then:

```sh
scripts/local/update.sh
scripts/local/start.sh
```

## Using a different database

To use another PostgreSQL 16 database (for example one you already run), put its address in `.env` before
`setup.sh`, or edit it later:

```sh
DATABASE_URL=postgres://user:password@localhost:5432/your_database
```

`setup.sh` and `start.sh` apply the migrations to it.

## Bringing over the staging data from Render (optional)

This replaces everything in your local database with a copy of the Render staging database:

1. In the Render dashboard, open the database and copy its **External Database URL**.
2. Copy Render's `MFA_ENCRYPTION_KEY` and `ACCESS_CODE_ENCRYPTION_KEY` values into your `.env`, replacing the ones
   setup wrote. Without them the staff authenticators and the saved access codes from staging cannot be opened.
3. Run the import, and type `yes` when asked:

   ```sh
   scripts/local/import-render.sh "postgres://...render.com/..."
   ```

Photos and documents uploaded on staging are not copied. The free Render database expires on 2026-11-21, so import
before then if you want its data.

## Using it from a phone on your Wi-Fi (optional)

A worker's My Day and the staff app can be opened from a phone on the same network:

1. In `.env`, set `HOST=0.0.0.0` and `STAFF_APP_URL=http://<your-mac-name>.local:3000/staff`.
2. Restart the server, and allow incoming connections if macOS asks.
3. Open `http://<your-mac-name>.local:3000/staff` on the phone. The Mac's name is in System Settings → General →
   Sharing.

The customer portal does not work this way: its secure cookie needs `localhost` or HTTPS.

## Backups

- Database: `pg_dump handyhub_local > handyhub-backup.sql`
- Photos and documents: the `.local-data/` folder in the project
- Keys: `.env`

Keep the three together. A database restored without the matching `.env` keys loses the staff authenticators and the
access codes.

## If something goes wrong

- **`Missing: node` or the wrong Node version:** repeat step 1.3 and open a new Terminal window.
- **Database connection errors:** check the database with `brew services list`; `postgresql@16` should be `started`.
  Then run `psql postgres -c 'select 1'`.
- **Port 3000 is already in use:** set `PORT=3001` in `.env` and use http://localhost:3001.
- **Lost the authenticator for your Owner account:** stop the server, then run
  `node apps/server/dist/cli/staff-access.js reset-mfa you@example.com "lost phone"` with the `.env` values loaded
  (`set -a; . ./.env; set +a` first). Your next sign-in sets up a new authenticator.
