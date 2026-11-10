# Domain Devtools

Before you use the CLI, read [setup and usage](README.md#setup). Before you change analysis or output, read [diagram interpretation and limits](README.md#read-the-output). Before you complete a change, run the [development checks](README.md#development).

## Contribution rules

- Derive domain facts from Alchemy.Domain contracts and generic TypeScript patterns. Keep application names, helper names, and business rules out of the analyzer.
- Keep declared contracts, static candidates, and execution evidence distinct. Preserve original handler source. Report extraction failures as errors and partial analysis as explicit gaps.
- Use synthetic fixtures for regression tests. Cover imports and override order for symbol-resolution changes. Verify labels as well as colors for diagram changes. Keep application source, credentials, and generated application diagrams out of commits.
