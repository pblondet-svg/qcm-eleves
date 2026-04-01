14:56:14.297 > Build error occurred
14:56:14.300 Error: Turbopack build failed with 1 errors:
14:56:14.301 [0m [90m 775 |[39m [32mTEXTE PRINCIPAL (celui que l'élève révise) :[39m
14:56:14.301  [90m 776 |[39m [32m${selectedEntry.content}[39m
14:56:14.301 [31m[1m>[22m[39m[90m 777 |[39m [32m${autresTextes ? \`\nAUTRES TEXTES ET COURS DISPONIBLES (mobilise-les si pertinent) :\n\${autresTextes}\` : ""}`[39m[33m;[39m
14:56:14.302  [90m     |[39m                  [31m[1m^[22m[39m
14:56:14.302  [90m 778 |[39m       [36mconst[39m historyForAPI [33m=[39m newMessages[33m.[39mmap(m [33m=>[39m ({ role[33m:[39m m[33m.[39mrole[33m,[39m content[33m:[39m m[33m.[39mcontent }))[33m;[39m
14:56:14.302  [90m 779 |[39m       [36mconst[39m data [33m=[39m [36mawait[39m callAI([
14:56:14.302  [90m 780 |[39m         { role[33m:[39m [32m"user"[39m[33m,[39m content[33m:[39m systemPrompt }[33m,[39m[0m
14:56:14.347 Error: Command "npm run build" exited with 1