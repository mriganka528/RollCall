// Dynamic Expo config.
//
// Everything lives in app.json (the static base). This file only injects the
// native Google Sign-In client IDs into `expo.extra` at config-resolution time,
// reading them from the environment (EAS reads eas.json's `env`; local
// `expo` commands read the root .env).
//
// Why this exists: Clerk's `useSignInWithGoogle` looks up the client ID from
// `Constants.expoConfig.extra.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` FIRST and
// only falls back to `process.env`. The `extra` value is baked into the app
// manifest, so it survives into the built binary reliably — whereas relying on
// `process.env.EXPO_PUBLIC_*` being inlined inside node_modules is fragile. If
// the ID isn't wired into `extra`, the button throws
// "Google Sign-In credentials not found." Putting it here fixes that.
//
// These are PUBLIC OAuth client IDs, not secrets — safe to bake into the app.

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID:
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID ??
      config.extra?.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID:
      process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID ??
      config.extra?.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
  },
});
