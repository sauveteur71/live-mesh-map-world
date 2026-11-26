# Contributing to Live Mesh Map (world edition)

Thanks for your interest in this project! It is developed and maintained on volunteer time — any help is welcome.

## Before opening an issue

- Check the [existing issues](https://github.com/sauveteur71/live-mesh-map-world/issues) and [discussions](https://github.com/sauveteur71/live-mesh-map-world/discussions) first — your question or bug may already be covered.
- For a usage question, a field report, or a vague idea → **Discussions**, not an issue.
- For a reproducible bug or a precise feature request → an **Issue**, using the provided template.

## Reporting a bug

Please include:
- the program version (`v1.x.x`, shown in the interface or in `docker compose logs`);
- the country/area the map is deployed for;
- steps to reproduce, and what you expected instead;
- relevant logs (`docker compose logs -f`) — please strip out any identifier or personal data before pasting.

## Contributing code

1. Fork the repository and create a branch from `main` (`git checkout -b my-feature`).
2. Keep commits focused, with clear messages.
3. If the change touches radio decoding, the database, or the API, test it on a local instance before opening the pull request.
4. Open the pull request describing the problem it solves and how to test the change.
5. Please be patient: the project is maintained on volunteer time, review can take a few days.

## Translations

The interface ships with several languages. A translation fix or addition is always welcome as a pull request on the corresponding language files — this is one of the easiest ways to contribute without touching code.

## Code of conduct

Please be respectful in all exchanges: this project also serves civil-security and emergency-response use cases, where care and rigor matter as much as code.
