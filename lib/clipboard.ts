// Copy text to the system clipboard.
//
// `expo-clipboard` is a native module. We load it lazily via require() rather
// than a top-level `import` for two reasons:
//   1. It only touches the native module when the user actually copies
//      something — nothing is loaded at startup.
//   2. It keeps this file type-checking even in an environment where the
//      package hasn't been installed yet. A static `import` would fail to
//      resolve (TS2307) before `npm install`/`npx expo install`; a require()
//      call is typed `any` and is resolved by the bundler at runtime instead.
//
// Returns true on success, false if the copy couldn't be performed, so callers
// can surface a toast either way. After adding this, run:
//     npx expo install expo-clipboard
// then make a new development/EAS build so the native module is included.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Clipboard = require('expo-clipboard') as {
      setStringAsync: (value: string) => Promise<boolean>;
    };
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    // Native module missing (e.g. running before a rebuild) or the OS refused —
    // fail soft; the caller shows an error toast.
    return false;
  }
}
