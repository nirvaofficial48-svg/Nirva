for (const p of ["identity.fxaccounts.enabled", "browser.preferences.moreFromMozilla"]) dump(`PREFCHK ${p}=${Services.prefs.getBoolPref(p)}\n`);
dump(`PREFCHK relay=${Services.prefs.getStringPref("signon.firefoxRelay.feature")}\n`);
