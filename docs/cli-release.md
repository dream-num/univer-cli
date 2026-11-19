# CLI releases

Use **Release CLI to insider-npm** (`release-cli.yml`) to build and release
`univer-cli` to Insider. Public npm promotion is a separate manual workflow.

Use **Promote insider package to public npm (manual)**
(`promote-cli-public.yml`) from the default branch. Choose **package**
`univer-cli`, supply the exact Insider **version**, and leave **dry_run**
enabled to validate without publishing. **latest** defaults to true; turn it
off to use the `promoted` tag for a new public version.

The shared release Actions read the expected digest from Insider metadata,
run Insider's server-side promotion dry-run, and verify the downloaded
original tarball. Submission mode publishes those same bytes using npm
Trusted Publishing and provenance. It requires the `univer-cli` npm package
to authorize this repository and workflow; the workflow does not configure
that authorization. It does not rebuild, repack, or retire the Insider
artifact. Public visibility and provenance are verified separately after
submission.
