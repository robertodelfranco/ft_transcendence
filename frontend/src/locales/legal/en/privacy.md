Last updated: November 4, 2026.

This policy explains what data Catacombs 42 keeps about you, what it is used for, how long it is kept and how to ask for it to be deleted.

## Who we are

Catacombs 42 is an academic project by five students at 42, built for ft_transcendence, the final project of the school's common core. The site is non-commercial, shows no ads and does not sell or share data with anyone. Everything described here stays on the server that runs the game.

## Account data

When you create your account, we keep:

- **email**, so you can sign in and so we can identify the account. Only you can see your email;
- **username**, which other players can see;
- **password**, stored only as an Argon2id hash, a digest from which the password cannot be recovered. The password itself is never stored. Accounts created through 42 sign-in have no password;
- **preferred language**: Portuguese, English or Spanish;
- **avatar**, if you upload one. The server redraws the image as a 256 × 256 pixel PNG and discards the original file's metadata, such as location and camera model. When you change or remove your avatar, the previous file is deleted;
- **account creation date** and **last connection date**.

For each open session, that is, each browser where you signed in, we also keep when it started and the browser identification (the User-Agent, which tells the browser and operating system), to investigate sign-in problems.

## Game and friends

While a match is being played, nothing is stored: the game state lives only in the server's memory. When it ends, we store the result: mode, map, room options, start and end time, who played and, for each player, win or loss, kills, deaths, damage dealt and taken, keys collected, potions used, XP and Elo. Interrupted matches do not appear in anyone's history.

From your matches we calculate your statistics, XP, level, Elo and achievements. Your username, avatar, statistics, match history, achievements and leaderboard position are visible to other people on the site.

When you add someone as a friend, we store that link. Friendship is one-way: the other person does not need to accept. Anyone who added you as a friend can see whether you are online at that moment. There is currently no option to hide this status.

## Signing in with 42

If you sign in with 42, the site receives from the intra your 42 identifier, your email and your login. The identifier links your 42 account to your game account; the email creates or finds that account (if an account with the same email already exists, the two become one); and the login becomes the suggested username. Your intra photo does not become your avatar. The token that 42 hands over is used only during sign-in and discarded right after: the site keeps no access to your 42 account.

## Cookies and local storage

The site uses two cookies, both required for signing in, and keeps one piece of information in your browser:

- `refresh_token` keeps you signed in. The page cannot read it (HttpOnly), it only travels over HTTPS and it is only sent to the site's own sign-in routes. It lasts 7 days and is replaced with a new one each time it is used; logging out deletes it. On the server, we keep only a hash of it;
- `oauth_state` exists only while you sign in with 42, for at most 10 minutes, to confirm that the response from 42 belongs to the sign-in you started;
- `localStorage["lang"]` stores the language you chose, so the site opens in it next time. This value stays only in your browser.

The short-lived access key (15 minutes) is kept only in the page's memory and disappears when you close it. We use no third-party cookies, ads or analytics tools, and the page loads no scripts from other sites.

## Logs and metrics

To keep the site running and protect it from abuse, the server records:

- **access log**: for each request, the IP address, the date and time, the address accessed and the browser identification;
- **rate limiting**: sign-in and sign-up attempts are counted per IP address, to stop anyone trying to guess passwords. The count lives only in the server's memory, and each attempt is forgotten after one minute;
- **metrics**: figures about how the server is running, such as the number of requests, matches in progress and connections, processing time, and CPU and memory usage. Metrics contain no personal data and are kept for 7 days.

Logs stay only on the server and are discarded whenever it is reinstalled or updated.

## How long we keep data and how to request removal

Account, match and friendship data are kept for as long as the account exists. The site has no button to delete your account: to do so, write to **catacombs42@student.42.fr** from your account's email address. Within 15 days, we delete your email, password, avatar, sessions, 42 link and friendships, and replace your username with an anonymous name. The matches you played remain in the other players' history, with nothing that identifies you.

If this policy changes, the date at the top of the page changes with it.
