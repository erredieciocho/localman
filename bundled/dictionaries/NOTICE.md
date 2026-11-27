# Bundled dictionary notices

The French, German, Portuguese, Polish, Russian and Korean Hunspell data files
were obtained from
[`wooorm/dictionaries`](https://github.com/wooorm/dictionaries) at commit
`8cfea406b505e4d7df52d5a19bce525df98c54ab`.

Each language directory contains that dictionary's upstream `license` file.
Those licences apply to the corresponding `index.aff` and `index.dic` files;
the repository's MIT licence does not replace them.

The Portuguese data is the Portugal variant. Italian and Dutch are deferred
because the current Hunspell loader times out while expanding their affix and
compound rules. English is the source language. Japanese and Chinese are also
deferred because no compatible Hunspell dictionaries were available in the
reviewed catalogs, and the current spellcheck tokenisation does not support
unspaced CJK text.
