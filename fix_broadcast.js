const fs = require('fs');
const p = 'src/app/admin/layout.tsx';
let c = fs.readFileSync(p, 'utf8');

// 1. Add authorizedRef after the authorized state declaration
const oldState = `  const [authorized, setAuthorized] = useState(false)\r\n  const [authChecked, setAuthChecked] = useState(false)\r\n  const [authRefreshTick, setAuthRefreshTick] = useState(0)`;
const newState = `  const [authorized, setAuthorized] = useState(false)\r\n  const [authChecked, setAuthChecked] = useState(false)\r\n  const [authRefreshTick, setAuthRefreshTick] = useState(0)\r\n  const authorizedRef = useRef(false)`;

if (!c.includes(oldState)) { console.log('state NOT FOUND'); process.exit(1); }
c = c.replace(oldState, newState);

// 2. Keep authorizedRef in sync when setting authorized to true
const oldSetAuth1 = `      setAuthorized(true)\r\n      setAuthChecked(true)\r\n      return\r\n    }\r\n\r\n    if (accessRes.status === 403)`;
const newSetAuth1 = `      authorizedRef.current = true\r\n      setAuthorized(true)\r\n      setAuthChecked(true)\r\n      return\r\n    }\r\n\r\n    if (accessRes.status === 403)`;
if (!c.includes(oldSetAuth1)) { console.log('setAuth1 NOT FOUND'); process.exit(1); }
c = c.replace(oldSetAuth1, newSetAuth1);

// Also sync ref in the fallback path (bottom of loadRole)
const oldSetAuth2 = `      setAuthorized(true)\r\n      setAuthChecked(true)\r\n    }\r\n\r\n    void loadRole()`;
const newSetAuth2 = `      authorizedRef.current = true\r\n      setAuthorized(true)\r\n      setAuthChecked(true)\r\n    }\r\n\r\n    void loadRole()`;
if (!c.includes(oldSetAuth2)) { console.log('setAuth2 NOT FOUND - OK skip'); }
else { c = c.replace(oldSetAuth2, newSetAuth2); }

// 3. Fix the onAuthStateChange handler
const oldHandler = `      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {\r\n        // Silently re-verify role. Only flash the loading screen for SIGNED_IN\r\n        // or when not yet authorized. TOKEN_REFRESHED while already authorized\r\n        // must not reset authChecked/authorized to avoid the loading flash on\r\n        // every tab switch (Supabase fires TOKEN_REFRESHED on tab focus).\r\n        if (event === 'SIGNED_IN') {\r\n          setAuthChecked(false)\r\n          setAuthorized(false)\r\n        }\r\n        setAuthRefreshTick((t) => t + 1)\r\n      }`;

const newHandler = `      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {\r\n        // TOKEN_REFRESHED fires every time a tab regains focus (Supabase behavior).\r\n        // Skip entirely when already authorized: role has not changed, no re-verify needed.\r\n        if (event === 'TOKEN_REFRESHED' && authorizedRef.current) return\r\n        setAuthChecked(false)\r\n        setAuthorized(false)\r\n        authorizedRef.current = false\r\n        setAuthRefreshTick((t) => t + 1)\r\n      }`;

if (!c.includes(oldHandler)) { console.log('handler NOT FOUND'); process.exit(1); }
c = c.replace(oldHandler, newHandler);

fs.writeFileSync(p, c, 'utf8');
console.log('All patches applied OK');
