# Contributing Guide

Thank you for your interest in the LifeMatters project! Your contribution matters to us.

## Ways to contribute
We welcome contributions of every kind:

### Researchers
- Contribute validation data and research cases
- Develop new domain modules
- Improve theoretical model implementations

### Developers
- Optimize core algorithms
- Develop visualization tools
- Improve the user experience

### Users
- Report usage issues
- Suggest features
- Share use cases

## How to contribute

1.  Report a bug: if you find a problem, please file a bug report on our [Issue Tracker](https://github.com/shenfan19/life-matters-reference-engine/issues).
2.  Submit a feature request: have a new idea or a feature you'd like to see? Submit a feature request!
3.  Write code:
     Fork this repository.
     Create your feature branch (`git checkout -b featureAmazingFeature`)
     Write your code and commit it (`git commit -m 'Add some AmazingFeature'`)
     Push to the branch (`git push origin featureAmazingFeature`)
     Open a Pull Request.

## Testing

Run these before a pull request. The first three are quick, and the end-to-end specs take about half a minute with the backend and the GUI already running.

| Check | Command | What it guards |
| --- | --- | --- |
| Engine and API tests | `python -m pytest test_verification -q` from the repository root, with the models repository linked or copied as `models/` | simulation, optimization, loader, validation, the command line, the plugin framework, the routes |
| Types | `cd gui && npx tsc --noEmit -p tsconfig.app.json` | the GUI type-checks with no errors |
| Unused props | included in the pytest run as `test_gui_prop_wiring.py`, or `cd gui && node scripts/find-unused-props.mjs` | a prop that a component declares and never uses, which usually means a control was lost |
| End to end | `cd gui && npx playwright test -c e2e/playwright.config.ts` | the model tree, the session area, the view rail, the plugins, the answers of the backend |

Every fixed defect gets a test that fails while the defect is present. If the fix cannot be tested automatically, say why in the pull request. A build error about an unused name is a question about why it is unused, and deleting the name is not an answer.
