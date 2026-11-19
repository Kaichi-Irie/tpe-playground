# Third-party notices

The project's MIT license does not replace the licenses of third-party
dependencies or vendored materials. Preserve their copyright and license notices
when redistributing source or built assets.

## Distributed dependencies and runtime helpers

[React and React DOM](https://github.com/facebook/react), including Scheduler,
and [KaTeX](https://github.com/KaTeX/KaTeX) (JavaScript, CSS, and fonts) are
distributed under the MIT license. The upstream
[KaTeX fonts](https://github.com/KaTeX/katex-fonts) license is also reproduced.
[Vite](https://github.com/vitejs/vite) supplies small browser runtime helpers
under MIT. KaTeX's CLI dependency
[Commander](https://github.com/tj/commander.js) is not bundled in the browser;
its notice is included for completeness.

Their upstream license texts are reproduced in
[public/THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt). Vite copies this
file into the production site so notices accompany the browser distribution.
Versions are recorded in [package-lock.json](package-lock.json); review and update
the notices when dependencies or their licenses change. Build and test tools
retain the license files distributed with their npm packages.

## Vendored development guidance

Optional agent skills and their lockfile are ignored and are not included in
the tracked source or application bundle. Local checkouts may install their own
development instructions; their upstream terms apply independently of this
project's license. They are not required to install, test, build, or use the
application.

## Project assets and references

The project mascot's artwork files are listed in
[design/fuwatane/README.md](design/fuwatane/README.md). The earlier, unused
[Tippy illustration](src/assets/tippy.png) has a recorded
[image-generation prompt](src/assets/tippy.prompt.txt) and is not imported by
the application. These are AI-generated illustrations; the project's MIT grant
extends only to rights the contributors can grant and does not assert exclusive
copyright in generated outputs.

The application synthesizes its sounds; the earlier third-party audio recording is excluded from version
control and is not distributed, as documented in
[src/assets/audio/README.md](src/assets/audio/README.md).

Links to research papers and external projects are references. This project's
license does not license the linked publications or external projects.
