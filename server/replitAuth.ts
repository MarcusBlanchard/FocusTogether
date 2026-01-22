import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// ============================================================
// DEVELOPMENT-ONLY AUTH BYPASS
// Delete this section before production deployment
// ============================================================
const DEV_AUTH_ENABLED = process.env.NODE_ENV === "development" && !process.env.REPL_SLUG;

const DEV_USERS = [
  {
    id: "dev-user-local-001",
    email: "devuser1@localhost.test",
    firstName: "Alice",
    lastName: "Developer",
    profileImageUrl: null,
    username: "alice_dev",
  },
  {
    id: "dev-user-local-002",
    email: "devuser2@localhost.test",
    firstName: "Bob",
    lastName: "Tester",
    profileImageUrl: null,
    username: "bob_test",
  },
];

function createDevSessionUser(user: typeof DEV_USERS[0]) {
  return {
    claims: {
      sub: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    },
    access_token: `dev-access-token-${user.id}`,
    refresh_token: `dev-refresh-token-${user.id}`,
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
  };
}

async function setupDevAuth(app: Express) {
  if (!DEV_AUTH_ENABLED) return;
  
  console.log("[Auth] ⚠️  DEVELOPMENT AUTH BYPASS ENABLED - DO NOT USE IN PRODUCTION");
  console.log("[Auth] Available dev users:");
  console.log("[Auth]   /api/login        → Alice (default, for browser)");
  console.log("[Auth]   /api/login?user=2 → Bob (for Tauri app)");
  
  // Upsert all dev users to database on startup
  for (const user of DEV_USERS) {
    await storage.upsertUser(user);
  }
  
  // Intercept /api/login in development - auto-login and redirect
  // Use ?user=2 to login as second user (for Tauri testing)
  app.get("/api/login", (req, res) => {
    console.log("[Auth] Login request - query params:", req.query, "user param:", req.query.user);
    const userIndex = req.query.user === "2" ? 1 : 0;
    const devUser = DEV_USERS[userIndex];
    console.log("[Auth] Selected user index:", userIndex, "user:", devUser.username);
    const sessionUser = createDevSessionUser(devUser);
    
    req.login(sessionUser, (err) => {
      if (err) {
        console.error("[Auth] Dev login error:", err);
        return res.status(500).json({ message: "Dev login failed" });
      }
      console.log(`[Auth] Dev user logged in: ${devUser.username} (${devUser.email})`);
      res.redirect("/");
    });
  });
  
  // Simple logout for dev
  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
}
// ============================================================
// END DEVELOPMENT-ONLY AUTH BYPASS
// ============================================================

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  // OIDC standard uses "picture", Replit may use "profile_image_url" - try both
  const profileImageUrl = claims["profile_image_url"] || claims["picture"] || null;
  
  console.log("[Auth] Upserting user with claims:", {
    sub: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl,
    allClaimKeys: Object.keys(claims),
  });
  
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl,
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Passport serialization (needed for both dev and production)
  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  // In development mode, use simplified auth bypass
  if (DEV_AUTH_ENABLED) {
    await setupDevAuth(app);
    return; // Skip production OAuth setup
  }

  // Production OAuth setup (Replit OIDC)
  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
